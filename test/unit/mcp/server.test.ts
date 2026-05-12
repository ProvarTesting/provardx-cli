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
import { resolveDocsDir, readCatalogSource } from '../../../src/mcp/server.js';

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

describe('readCatalogSource', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    tmpDirs.length = 0;
  });

  function makeTmpDir(): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'provar-server-test-'));
    tmpDirs.push(d);
    return d;
  }

  it('returns parsed JSON when NITROX_CATALOG_SOURCE.json is present', () => {
    const docsDir = makeTmpDir();
    const source = { branch: 'main', commitSha: 'abc1234567890', fetchedAt: '2026-05-08T10:00:00.000Z' };
    fs.writeFileSync(path.join(docsDir, 'NITROX_CATALOG_SOURCE.json'), JSON.stringify(source));
    const result = JSON.parse(readCatalogSource(docsDir)) as typeof source & { schemasUpdated: unknown };
    assert.equal(result.commitSha, 'abc1234567890');
    assert.equal(result.branch, 'main');
    assert.equal(result.fetchedAt, '2026-05-08T10:00:00.000Z');
  });

  it('normalises missing schemasUpdated to null for files from older builds', () => {
    const docsDir = makeTmpDir();
    const source = { branch: 'main', commitSha: 'abc1234567890', fetchedAt: '2026-05-08T10:00:00.000Z' };
    fs.writeFileSync(path.join(docsDir, 'NITROX_CATALOG_SOURCE.json'), JSON.stringify(source));
    const result = JSON.parse(readCatalogSource(docsDir)) as Record<string, unknown>;
    assert.equal(result['schemasUpdated'], null);
  });

  it('passes through schemasUpdated: true when present in the file', () => {
    const docsDir = makeTmpDir();
    const source = {
      branch: 'main',
      commitSha: 'abc1234567890',
      fetchedAt: '2026-05-08T10:00:00.000Z',
      schemasUpdated: true,
    };
    fs.writeFileSync(path.join(docsDir, 'NITROX_CATALOG_SOURCE.json'), JSON.stringify(source));
    const result = JSON.parse(readCatalogSource(docsDir)) as typeof source;
    assert.equal(result.schemasUpdated, true);
  });

  it('passes through schemasUpdated: false when schema fetch fell back', () => {
    const docsDir = makeTmpDir();
    const source = {
      branch: 'main',
      commitSha: 'abc1234567890',
      fetchedAt: '2026-05-08T10:00:00.000Z',
      schemasUpdated: false,
    };
    fs.writeFileSync(path.join(docsDir, 'NITROX_CATALOG_SOURCE.json'), JSON.stringify(source));
    const result = JSON.parse(readCatalogSource(docsDir)) as typeof source;
    assert.equal(result.schemasUpdated, false);
  });

  it('returns fallback object when the file is absent', () => {
    const docsDir = makeTmpDir();
    const result = JSON.parse(readCatalogSource(docsDir)) as Record<string, unknown>;
    assert.equal(result['commitSha'], null);
    assert.equal(result['fetchedAt'], null);
    assert.equal(result['schemasUpdated'], null);
    assert.ok(!('repo' in result), 'fallback should not expose an internal repo URL');
  });

  it('returns fallback object when the file contains invalid JSON', () => {
    const docsDir = makeTmpDir();
    fs.writeFileSync(path.join(docsDir, 'NITROX_CATALOG_SOURCE.json'), '{bad json');
    const result = JSON.parse(readCatalogSource(docsDir)) as Record<string, unknown>;
    assert.equal(result['commitSha'], null);
    assert.equal(result['schemasUpdated'], null);
  });
});
