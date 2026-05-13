/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const MAX_RUNS = 20;
const INDEX_FILE = '.runs.json';

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
  const message = String(v['message'] ?? '').slice(0, 120);
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

/** Generate a run ID from a context string (e.g. project path or suite name). */
export function generateRunId(context: string): string {
  return `${Date.now()}-${shortHash(context)}`;
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
 */
export function saveRun(storageDir: string, runId: string, violations: DiffableViolation[]): string {
  fs.mkdirSync(storageDir, { recursive: true });

  const filename = `${runId}.json`;
  fs.writeFileSync(path.join(storageDir, filename), JSON.stringify(violations), 'utf-8');

  const index = loadIndex(storageDir);
  index.runs.push({ run_id: runId, timestamp: Date.now(), filename });

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
 */
export function loadBaselineViolations(storageDir: string, baselineRunId: string): DiffableViolation[] | null {
  const index = loadIndex(storageDir);
  const record = index.runs.find((r) => r.run_id === baselineRunId);
  if (!record) return null;

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
 * Uses (rule_id + applies_to + message[0..120]) as the unique key.
 */
export function computeDiff(baseline: DiffableViolation[], current: DiffableViolation[]): Omit<DiffResult, 'run_id'> {
  const baselineKeys = new Map<string, DiffableViolation>();
  for (const v of baseline) baselineKeys.set(violationKey(v), v);

  const currentKeys = new Map<string, DiffableViolation>();
  for (const v of current) currentKeys.set(violationKey(v), v);

  const added: DiffableViolation[] = [];
  const resolved: DiffableViolation[] = [];
  let unchanged_count = 0;

  for (const [key, v] of currentKeys) {
    if (baselineKeys.has(key)) {
      unchanged_count++;
    } else {
      added.push(v);
    }
  }

  for (const [key, v] of baselineKeys) {
    if (!currentKeys.has(key)) {
      resolved.push(v);
    }
  }

  return { added, resolved, unchanged_count };
}
