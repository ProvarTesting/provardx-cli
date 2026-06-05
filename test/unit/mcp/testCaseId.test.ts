/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { allocateTestCaseId, DEFAULT_TESTCASE_ID } from '../../../src/mcp/utils/testCaseId.js';

// ── Fixture helpers ────────────────────────────────────────────────────────────

let tmpDir: string;

/** Write a minimal .testcase file carrying the given root id (string so we can test UUIDs). */
function writeCase(relPath: string, id: string): string {
  const full = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const guid = '11111111-1111-4111-8111-111111111111';
  fs.writeFileSync(
    full,
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<testCase guid="${guid}" id="${id}" registryId="${guid}">\n  <summary/>\n  <steps/>\n</testCase>\n`,
    'utf-8'
  );
  return full;
}

function markProject(relDir = '.'): void {
  const dir = path.join(tmpDir, relDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.testproject'), '<project/>', 'utf-8');
}

beforeEach(() => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tcid-test-')));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Some Windows hosts / CI restrict symlink creation to privileged users. */
const symlinkSupported = ((): boolean => {
  try {
    const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'tcid-symcap-'));
    fs.writeFileSync(path.join(probe, 'target'), 'x', 'utf-8');
    fs.symlinkSync(path.join(probe, 'target'), path.join(probe, 'link'));
    fs.rmSync(probe, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
})();

// ── Tests ────────────────────────────────────────────────────────────────────

describe('allocateTestCaseId', () => {
  it('defaults to DEFAULT_TESTCASE_ID when there is no surrounding project', () => {
    const out = path.join(tmpDir, 'Loose.testcase');
    const alloc = allocateTestCaseId(out, [tmpDir]);
    assert.equal(alloc.id, DEFAULT_TESTCASE_ID);
    assert.equal(alloc.basis, 'default');
  });

  it('allocates highest project id + 1 when writing into an existing project', () => {
    markProject();
    writeCase('tests/A.testcase', '3');
    writeCase('tests/sub/B.testcase', '7');
    writeCase('tests/sub/C.testcase', '5');

    const out = path.join(tmpDir, 'tests', 'New.testcase');
    const alloc = allocateTestCaseId(out, [tmpDir]);

    assert.equal(alloc.id, 8, 'max id is 7 → next is 8');
    assert.equal(alloc.basis, 'project-max-plus-1');
    assert.equal(alloc.highestExistingId, 7);
    assert.equal(alloc.projectRoot, tmpDir);
  });

  it('finds the project root by walking up from a nested output directory', () => {
    markProject();
    writeCase('tests/area/Existing.testcase', '12');

    const out = path.join(tmpDir, 'tests', 'area', 'deep', 'New.testcase');
    const alloc = allocateTestCaseId(out, [tmpDir]);

    assert.equal(alloc.id, 13);
    assert.equal(alloc.basis, 'project-max-plus-1');
  });

  it('preserves an existing numeric id on overwrite (stable regeneration)', () => {
    markProject();
    writeCase('tests/Other.testcase', '50');
    const out = writeCase('tests/Target.testcase', '42');

    const alloc = allocateTestCaseId(out, [tmpDir]);

    assert.equal(alloc.id, 42, 'should keep the file’s own id, not jump to 51');
    assert.equal(alloc.basis, 'preserved-existing');
  });

  it('ignores non-numeric (UUID) ids when computing the max', () => {
    markProject();
    writeCase('tests/Uuid.testcase', 'ced6c489-5a6d-4a40-a92f-71986c895b73');
    writeCase('tests/Num.testcase', '2');

    const out = path.join(tmpDir, 'tests', 'New.testcase');
    const alloc = allocateTestCaseId(out, [tmpDir]);

    assert.equal(alloc.id, 3, 'only the numeric id 2 counts → next is 3');
  });

  it('defaults when the project has a marker but no numeric ids yet', () => {
    markProject();
    const out = path.join(tmpDir, 'tests', 'First.testcase');
    const alloc = allocateTestCaseId(out, [tmpDir]);

    assert.equal(alloc.id, DEFAULT_TESTCASE_ID);
    assert.equal(alloc.basis, 'default');
  });

  it('scans the project root itself when there is no tests/ folder', () => {
    markProject();
    writeCase('Flat.testcase', '9');

    const out = path.join(tmpDir, 'Another.testcase');
    const alloc = allocateTestCaseId(out, [tmpDir]);

    assert.equal(alloc.id, 10);
    assert.equal(alloc.basis, 'project-max-plus-1');
  });

  it('does not cross above the allowed roots to find a project marker', () => {
    // .testproject sits at tmpDir, but the allowed root is tmpDir/tests — the walk
    // must stop at the boundary and fall back to the default rather than scanning above it.
    markProject();
    writeCase('tests/A.testcase', '4');
    const testsDir = path.join(tmpDir, 'tests');

    const out = path.join(testsDir, 'New.testcase');
    const alloc = allocateTestCaseId(out, [testsDir]);

    assert.equal(alloc.id, DEFAULT_TESTCASE_ID);
    assert.equal(alloc.basis, 'default');
  });

  it('ignores a numeric id too large to be a safe integer', () => {
    markProject();
    writeCase('tests/Normal.testcase', '4');
    writeCase('tests/Huge.testcase', '99999999999999999999999');

    const out = path.join(tmpDir, 'tests', 'New.testcase');
    const alloc = allocateTestCaseId(out, [tmpDir]);

    // The 23-digit id overflows JS integer precision; it must be ignored so the
    // generator never emits id="1e+22". Only the safe id 4 counts → next is 5.
    assert.equal(alloc.id, 5);
    assert.equal(alloc.basis, 'project-max-plus-1');
    assert.equal(alloc.highestExistingId, 4);
  });

  (symlinkSupported ? it : it.skip)('does not read a symlinked .testcase that points outside the allowed roots', () => {
    markProject();
    writeCase('tests/Real.testcase', '4');

    // A "secret" project OUTSIDE the allowed root, carrying a deliberately huge id.
    const secretDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tcid-secret-')));
    try {
      const secretCase = path.join(secretDir, 'Secret.testcase');
      fs.writeFileSync(
        secretCase,
        '<?xml version="1.0"?>\n<testCase guid="11111111-1111-4111-8111-111111111111" id="88888"><steps/></testCase>\n',
        'utf-8'
      );
      fs.symlinkSync(secretCase, path.join(tmpDir, 'tests', 'Link.testcase'));

      const out = path.join(tmpDir, 'tests', 'New.testcase');
      const alloc = allocateTestCaseId(out, [tmpDir]);

      // The symlink must be skipped: only the in-root id 4 counts → next is 5,
      // NOT 88889 (which would mean the out-of-root file was read).
      assert.equal(alloc.id, 5);
      assert.equal(alloc.highestExistingId, 4);
    } finally {
      fs.rmSync(secretDir, { recursive: true, force: true });
    }
  });
});
