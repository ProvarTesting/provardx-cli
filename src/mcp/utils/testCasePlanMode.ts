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
import { assertPathAllowed } from '../security/pathPolicy.js';

/**
 * How the project's provardx-properties.json runs this test case.
 *
 * `direct` means the test case path appears in `testCase` or `testCases` and
 * no `.testinstance` references it — data-driven `<dataTable>` rows will not
 * iterate. `plan` means the test case is referenced by at least one
 * `.testinstance` under `plans/`, so data-driven execution works. `unknown`
 * means the properties file could not be resolved or parsed (no
 * `~/.sf/config.json`, file outside allowed paths, missing project root, etc.)
 * — callers should default to the safe behaviour (emit the structural
 * warning) when the mode is unknown.
 */
export type TestCasePlanMode = 'direct' | 'plan' | 'unknown';

export interface ResolvedTestCaseMode {
  mode: TestCasePlanMode;
  /** The properties-file path consulted (when resolved). */
  propertiesFilePath?: string;
  /** The project root resolved from the properties file (when present). */
  projectPath?: string;
}

interface ResolveOptions {
  /** Path to the test case file under validation. */
  testCaseFilePath: string;
  /** Allowed-paths policy from the MCP server config. */
  allowedPaths: string[];
  /** Override of ~/.sf/config.json location for testing. */
  sfConfigPathOverride?: string;
  /** Override of provardx-properties.json location for testing. */
  propertiesFilePathOverride?: string;
}

/**
 * Resolve whether a given test case file is referenced directly via
 * `testCase`/`testCases` or via a `.testinstance` inside a plan.
 *
 * The resolution flow is intentionally best-effort and silent: any file
 * read failure, JSON parse error, or path-policy violation collapses to
 * `mode: 'unknown'` so the caller falls back to default behaviour rather
 * than surfacing a confusing error from the validator.
 */
export function resolveTestCasePlanMode(opts: ResolveOptions): ResolvedTestCaseMode {
  const propsPath = readPropertiesFilePath(opts);
  if (!propsPath) return { mode: 'unknown' };

  let propsObj: Record<string, unknown>;
  try {
    propsObj = JSON.parse(fs.readFileSync(propsPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return { mode: 'unknown', propertiesFilePath: propsPath };
  }

  const projectPath = typeof propsObj['projectPath'] === 'string' ? propsObj['projectPath'] : null;
  if (!projectPath) {
    // Without a project root we cannot resolve relative `testCase` entries or
    // walk `plans/`. The mode is unknown.
    return { mode: 'unknown', propertiesFilePath: propsPath };
  }

  let resolvedProjectPath: string;
  try {
    resolvedProjectPath = path.resolve(projectPath);
    assertPathAllowed(resolvedProjectPath, opts.allowedPaths);
  } catch {
    return { mode: 'unknown', propertiesFilePath: propsPath };
  }

  const resolvedTestCasePath = path.resolve(opts.testCaseFilePath);

  // A `.testinstance` reference inside any plan wins — plan mode supports
  // data-driven iteration.
  if (isReferencedFromPlanInstance(resolvedProjectPath, resolvedTestCasePath)) {
    return { mode: 'plan', propertiesFilePath: propsPath, projectPath: resolvedProjectPath };
  }

  if (isReferencedDirectly(propsObj, resolvedProjectPath, resolvedTestCasePath)) {
    return { mode: 'direct', propertiesFilePath: propsPath, projectPath: resolvedProjectPath };
  }

  return { mode: 'unknown', propertiesFilePath: propsPath, projectPath: resolvedProjectPath };
}

/**
 * Resolve the active properties file path. Prefers an explicit override
 * (used by tests), then `~/.sf/config.json`'s `PROVARDX_PROPERTIES_FILE_PATH`.
 *
 * Both the override and the value read from `~/.sf/config.json` are funnelled
 * through `assertPathAllowed` so a caller cannot trick the resolver into
 * reading a properties file outside the configured `allowedPaths`. Any policy
 * violation collapses to `null` to preserve the helper's best-effort contract.
 */
function readPropertiesFilePath(opts: ResolveOptions): string | null {
  if (opts.propertiesFilePathOverride) {
    return enforceAllowed(opts.propertiesFilePathOverride, opts.allowedPaths);
  }
  try {
    const sfConfigPath = opts.sfConfigPathOverride ?? path.join(os.homedir(), '.sf', 'config.json');
    if (!fs.existsSync(sfConfigPath)) return null;
    const sfConfig = JSON.parse(fs.readFileSync(sfConfigPath, 'utf-8')) as Record<string, unknown>;
    const propsPath = sfConfig['PROVARDX_PROPERTIES_FILE_PATH'] as string | undefined;
    if (!propsPath) return null;
    return enforceAllowed(propsPath, opts.allowedPaths);
  } catch {
    return null;
  }
}

/**
 * Resolve a candidate properties-file path through `assertPathAllowed`, then
 * canonicalize via `fs.realpathSync` when the file exists so a symlink
 * inside an allowed directory cannot redirect the read outside it. Returns
 * `null` on any policy violation, missing file, or unexpected error — the
 * caller treats `null` as "mode unknown" and falls back to default behaviour.
 */
function enforceAllowed(candidate: string, allowedPaths: string[]): string | null {
  try {
    const resolved = path.resolve(candidate);
    assertPathAllowed(resolved, allowedPaths);
    if (!fs.existsSync(resolved)) return null;
    try {
      return fs.realpathSync(resolved);
    } catch {
      return resolved;
    }
  } catch {
    return null;
  }
}

/**
 * Does the properties file's top-level `testCase` or `testCases` array
 * reference this test case file? Entries are interpreted relative to
 * `<projectPath>/tests/` (per the Provar runtime convention).
 */
function isReferencedDirectly(props: Record<string, unknown>, projectPath: string, testCaseFilePath: string): boolean {
  const entries: string[] = [];
  const tc = props['testCase'];
  const tcs = props['testCases'];
  for (const candidate of [tc, tcs]) {
    if (typeof candidate === 'string') {
      entries.push(candidate);
    } else if (Array.isArray(candidate)) {
      for (const e of candidate as unknown[]) {
        if (typeof e === 'string') entries.push(e);
      }
    }
  }
  if (entries.length === 0) return false;

  const testsDir = path.join(projectPath, 'tests');
  const targetNorm = path.resolve(testCaseFilePath).toLowerCase();

  for (const entry of entries) {
    // Provar accepts both bare names ("MyTest") and relative paths
    // ("Module/MyTest.testcase"). Allow either; match with and without the
    // `.testcase` extension.
    const variants: string[] = [];
    const trimmed = entry.replace(/^[/\\]+/, '');
    variants.push(path.resolve(testsDir, trimmed));
    if (!/\.testcase$/i.test(trimmed)) {
      variants.push(path.resolve(testsDir, `${trimmed}.testcase`));
    }
    for (const v of variants) {
      if (v.toLowerCase() === targetNorm) return true;
    }
  }
  return false;
}

/**
 * Walk `<projectPath>/plans/` for `.testinstance` files referencing this
 * test case via `testCasePath="..."`. Best-effort — any read error skips
 * the offending file.
 */
function isReferencedFromPlanInstance(projectPath: string, testCaseFilePath: string): boolean {
  const plansDir = path.join(projectPath, 'plans');
  if (!fs.existsSync(plansDir)) return false;

  const testsDir = path.join(projectPath, 'tests');
  const targetNorm = path.resolve(testCaseFilePath).toLowerCase();
  let found = false;

  const walk = (dir: string): void => {
    if (found) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found) return;
      if (entry.name.startsWith('.') && !entry.name.endsWith('.testinstance')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.testinstance')) continue;
      let content: string;
      try {
        content = fs.readFileSync(full, 'utf-8');
      } catch {
        continue;
      }
      const matches = content.matchAll(/testCasePath=["']([^"']+)["']/g);
      for (const m of matches) {
        const rel = m[1].replace(/\\/g, '/');
        // testCasePath in Provar testinstances is conventionally relative to
        // `<projectPath>/tests/`. Also tolerate paths relative to project root.
        const candidates = [path.resolve(testsDir, rel), path.resolve(projectPath, rel)];
        for (const c of candidates) {
          if (c.toLowerCase() === targetNorm) {
            found = true;
            return;
          }
        }
      }
    }
  };

  walk(plansDir);
  return found;
}
