/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

const MAX_RUNS = 20;
const INDEX_FILE = '.runs.json';
const DEFAULT_ROOT_NAME = '.provardx';
const VALIDATION_SUBDIR = 'validation';

// ── Public types ──────────────────────────────────────────────────────────────

export type DiffableViolation = Record<string, unknown>;

export interface DiffResult {
  added: DiffableViolation[];
  resolved: DiffableViolation[];
  unchanged_count: number;
  run_id: string;
}

interface RunRecord {
  run_id: string;
  timestamp: number;
  filename: string;
  /**
   * Hash of `${toolTag}|${context}`. Used by loadBaselineViolations to reject
   * a run_id whose context (file path, suite name, etc.) does not match the
   * calling context — prevents cross-context diffs. Optional for backward
   * compatibility with index records written before this field existed; those
   * older records are treated as not matching any caller and are effectively
   * invalidated within one or two new runs as the FIFO cap evicts them.
   */
  context_hash?: string;
}

interface RunsIndex {
  runs: RunRecord[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Stable 8-char hash of a string for use in run IDs. */
function shortHash(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 8);
}

/** Build a unique key for a violation so additions/resolutions can be detected. */
function violationKey(v: DiffableViolation): string {
  const rule_id = String(v['rule_id'] ?? '');
  const applies_to = Array.isArray(v['applies_to'])
    ? (v['applies_to'] as string[]).join(',')
    : String(v['applies_to'] ?? '');
  const message = String(v['message'] ?? '');
  return `${rule_id}||${applies_to}||${message}`;
}

function loadIndex(storageDir: string): RunsIndex {
  const indexPath = path.join(storageDir, INDEX_FILE);
  try {
    return JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as RunsIndex;
  } catch {
    return { runs: [] };
  }
}

function saveIndex(storageDir: string, index: RunsIndex): void {
  const indexPath = path.join(storageDir, INDEX_FILE);
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute a stable 8-char context hash for a tool + context pair. Used to
 * scope baseline run lookups so that a run_id from context A cannot be diffed
 * against context B (different project, different suite, different file).
 */
export function computeContextHash(toolTag: string, context: string): string {
  return shortHash(`${toolTag}|${context}`);
}

/**
 * Resolve the validation storage root for a given tool subdir. Honors the
 * PROVAR_MCP_VALIDATION_DIR env var when set; otherwise falls back to
 * `~/.provardx/validation/<subdir>`. The env override is useful for restricted
 * CI/dev environments where the home directory is read-only or shared.
 */
export function resolveValidationDir(subdir: string): string {
  const override = process.env['PROVAR_MCP_VALIDATION_DIR']?.trim();
  if (override) return path.join(override, subdir);
  return path.join(os.homedir(), DEFAULT_ROOT_NAME, VALIDATION_SUBDIR, subdir);
}

/** Generate a run ID from a context string (e.g. project path or suite name). */
export function generateRunId(context: string): string {
  const rand = Math.random().toString(36).slice(2, 6);
  return `${Date.now()}-${shortHash(context)}-${rand}`;
}

/**
 * Check whether any prior runs exist in the given storage directory.
 * Used by calcNextAction to determine the first-run heuristic.
 */
export function hasAnyRun(storageDir: string): boolean {
  const index = loadIndex(storageDir);
  return index.runs.length > 0;
}

/**
 * Save the current violations as a new run in the storage directory.
 * Caps the index at MAX_RUNS by evicting the oldest entry when full.
 * Returns the generated run_id.
 *
 * When `contextHash` is provided, it is recorded alongside the run so that
 * `loadBaselineViolations` can reject a baseline_run_id whose context does
 * not match the calling context (prevents cross-context diffs).
 */
export function saveRun(
  storageDir: string,
  runId: string,
  violations: DiffableViolation[],
  contextHash?: string
): string {
  fs.mkdirSync(storageDir, { recursive: true });

  const filename = `${runId}.json`;
  fs.writeFileSync(path.join(storageDir, filename), JSON.stringify(violations), 'utf-8');

  const index = loadIndex(storageDir);
  index.runs.push({
    run_id: runId,
    timestamp: Date.now(),
    filename,
    ...(contextHash ? { context_hash: contextHash } : {}),
  });

  // Evict oldest entries when over the cap
  while (index.runs.length > MAX_RUNS) {
    const evicted = index.runs.shift();
    if (evicted) {
      try {
        fs.unlinkSync(path.join(storageDir, evicted.filename));
      } catch {
        /* best-effort eviction */
      }
    }
  }

  saveIndex(storageDir, index);
  return runId;
}

/**
 * Load the violations array for a given baseline run ID.
 * Returns null if the run is not found in the index (BASELINE_NOT_FOUND).
 * The filename is looked up from the index only — the run_id itself is never
 * used to construct a file path, preventing path traversal.
 *
 * When `expectedContextHash` is provided, the record's `context_hash` must
 * match. Records without a `context_hash` (written by older versions before
 * H3) are treated as a mismatch and are effectively retired within one or
 * two new runs as the FIFO cap evicts them. This guard prevents diffing a
 * baseline from a different file/suite/project against the current context.
 */
export function loadBaselineViolations(
  storageDir: string,
  baselineRunId: string,
  expectedContextHash?: string
): DiffableViolation[] | null {
  const index = loadIndex(storageDir);
  const record = index.runs.find((r) => r.run_id === baselineRunId);
  if (!record) return null;

  if (expectedContextHash !== undefined && record.context_hash !== expectedContextHash) {
    return null;
  }

  // Use the filename from the index, not the run_id
  try {
    const content = fs.readFileSync(path.join(storageDir, record.filename), 'utf-8');
    return JSON.parse(content) as DiffableViolation[];
  } catch {
    return null;
  }
}

/**
 * Compute the diff between a baseline and current violations array.
 * Uses (rule_id + applies_to + full message) as the unique key.
 * Duplicate violations (same key, multiple occurrences) are treated as
 * distinct entries — each occurrence is counted separately (multiset semantics).
 */
export function computeDiff(baseline: DiffableViolation[], current: DiffableViolation[]): Omit<DiffResult, 'run_id'> {
  // Build multiset counts keyed by violation identity
  const baselineCounts = new Map<string, { count: number; sample: DiffableViolation }>();
  for (const v of baseline) {
    const key = violationKey(v);
    const entry = baselineCounts.get(key);
    if (entry) {
      entry.count++;
    } else {
      baselineCounts.set(key, { count: 1, sample: v });
    }
  }

  const currentCounts = new Map<string, { count: number; sample: DiffableViolation }>();
  for (const v of current) {
    const key = violationKey(v);
    const entry = currentCounts.get(key);
    if (entry) {
      entry.count++;
    } else {
      currentCounts.set(key, { count: 1, sample: v });
    }
  }

  const added: DiffableViolation[] = [];
  const resolved: DiffableViolation[] = [];
  let unchanged_count = 0;

  // Tally additions: occurrences in current that exceed baseline count
  for (const [key, { count: curr, sample }] of currentCounts) {
    const base = baselineCounts.get(key)?.count ?? 0;
    unchanged_count += Math.min(base, curr);
    const addedCount = curr - base;
    for (let i = 0; i < addedCount; i++) added.push(sample);
  }

  // Tally resolutions: occurrences in baseline that exceed current count
  for (const [key, { count: base, sample }] of baselineCounts) {
    const curr = currentCounts.get(key)?.count ?? 0;
    const resolvedCount = base - Math.min(base, curr);
    for (let i = 0; i < resolvedCount; i++) resolved.push(sample);
  }

  return { added, resolved, unchanged_count };
}
