/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import fs from 'node:fs';
import path from 'node:path';
import { assertPathAllowed } from '../security/pathPolicy.js';

/*
 * Root-`<testCase>` id allocation for the generator.
 *
 * Important: the `id` attribute is NOT a uniqueness key. A corpus sweep of 651
 * real `.testcase` files shows id values duplicate freely within a single
 * project (id="0" appears 9× in one project), there is no project-level "next
 * id" counter file, and the Quality Hub backend requires only ONE of
 * id/guid/registryId — never checking id uniqueness or integer-ness. The
 * generator already emits a unique `guid`, which is the real identifier.
 *
 * So duplicate ids cause no runtime or validation failure. This allocator is a
 * convention-alignment nicety: when we can see the surrounding project, pick the
 * next integer after the highest in use so a freshly generated case does not
 * carry a confusing duplicate id="1". Where there is no project context (preview
 * runs, or output outside the allowed roots) we keep the historical default.
 */

export const DEFAULT_TESTCASE_ID = 1;

/** How an id was chosen — surfaced for logging and the tool response. */
export type TestCaseIdBasis = 'preserved-existing' | 'project-max-plus-1' | 'default';

export interface TestCaseIdAllocation {
  id: number;
  basis: TestCaseIdBasis;
  /** Project root that was scanned, when basis is project-max-plus-1. */
  projectRoot?: string;
  /** Highest numeric id found in the project, when basis is project-max-plus-1. */
  highestExistingId?: number;
}

/** Non-throwing wrapper around assertPathAllowed. */
function isAllowed(p: string, allowedPaths: string[]): boolean {
  try {
    assertPathAllowed(p, allowedPaths);
    return true;
  } catch {
    return false;
  }
}

/** Read the first `bytes` of a file as UTF-8 (the root element lives at the top). */
function readPrefix(file: string, bytes = 8192): string {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const read = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.toString('utf-8', 0, read);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * The numeric `id` of the root `<testCase>` element, or undefined when the file
 * is unreadable, has no id, or the id is non-numeric (e.g. a UUID). `[^>]*?`
 * keeps the match inside the opening tag, so only the root id is considered.
 */
function readRootTestCaseId(file: string): number | undefined {
  try {
    const match = readPrefix(file).match(/<testCase\b[^>]*?\bid=["'](\d+)["']/);
    if (!match) return undefined;
    return Number.parseInt(match[1], 10);
  } catch {
    return undefined;
  }
}

/**
 * Walk up from `startDir` to the nearest ancestor containing a `.testproject`
 * marker, staying within the allowed roots. Returns undefined when no project
 * marker is reachable.
 */
function findProjectRoot(startDir: string, allowedPaths: string[]): string | undefined {
  let dir = path.resolve(startDir);
  // Bound the walk: a `.testproject` we cannot read (outside allowed roots) is
  // not ours to scan, and the loop terminates at the filesystem root.
  for (;;) {
    if (!isAllowed(dir, allowedPaths)) return undefined;
    if (fs.existsSync(path.join(dir, '.testproject'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Highest numeric root-`<testCase>` id under `projectRoot` (scanning `tests/`
 * when present, else the root), ignoring `excludeFile`. Undefined when no
 * numeric id is found.
 */
function maxProjectTestCaseId(projectRoot: string, excludeFile: string): number | undefined {
  const scanRoot = fs.existsSync(path.join(projectRoot, 'tests')) ? path.join(projectRoot, 'tests') : projectRoot;
  let max: number | undefined;

  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.testcase') && path.resolve(full) !== excludeFile) {
        const id = readRootTestCaseId(full);
        if (id !== undefined && (max === undefined || id > max)) max = id;
      }
    }
  };

  walk(scanRoot);
  return max;
}

/**
 * Choose the `id` for a test case the generator is about to write to disk.
 *
 * Precedence:
 * 1. Overwriting an existing file with a numeric id → preserve it (stable regeneration).
 * 2. Output sits inside a reachable Provar project → highest project id + 1.
 * 3. Otherwise → DEFAULT_TESTCASE_ID.
 *
 * @param outputPath   The `.testcase` file that will be written (need not exist yet).
 * @param allowedPaths The MCP path-policy roots; the project scan never leaves them.
 */
export function allocateTestCaseId(outputPath: string, allowedPaths: string[]): TestCaseIdAllocation {
  const resolved = path.resolve(outputPath);

  if (fs.existsSync(resolved)) {
    const selfId = readRootTestCaseId(resolved);
    if (selfId !== undefined) return { id: selfId, basis: 'preserved-existing' };
  }

  const projectRoot = findProjectRoot(path.dirname(resolved), allowedPaths);
  if (projectRoot) {
    const max = maxProjectTestCaseId(projectRoot, resolved);
    if (max !== undefined) {
      return { id: max + 1, basis: 'project-max-plus-1', projectRoot, highestExistingId: max };
    }
  }

  return { id: DEFAULT_TESTCASE_ID, basis: 'default' };
}
