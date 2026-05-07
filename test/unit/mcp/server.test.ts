/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { strict as assert } from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { describe, it, afterEach } from 'mocha';
import { resolveDocsDir } from '../../../src/mcp/server.js';

describe('resolveDocsDir', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
    tmpDirs.length = 0;
  });

  function makeTmpDir(): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'provar-server-test-'));
    tmpDirs.push(d);
    return d;
  }

  it('returns sibling docs/ when it exists (compiled lib/mcp/ mode)', () => {
    const base = makeTmpDir();
    const sibling = path.join(base, 'docs');
    fs.mkdirSync(sibling);
    assert.equal(resolveDocsDir(base), sibling);
  });

  it('falls back two levels to repo-root docs/ when sibling is absent (dev/ts-node mode)', () => {
    const base = makeTmpDir();
    const expected = path.join(base, '..', '..', 'docs');
    assert.equal(resolveDocsDir(base), expected);
  });
});
