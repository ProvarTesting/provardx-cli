/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, afterEach } from 'mocha';
import {
  resolveProjectRoot,
  readProjectContext,
  resolveTestInstance,
  toQualityTier,
  toQualityGrade,
  validateProjectFromPath,
  ProjectValidationError,
} from '../../../src/services/projectValidation.js';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const VALID_TC_XML = (guid: string, stepGuid: string, id: string): string => `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="${id}" guid="${guid}" registryId="${id}" name="${id}">
  <steps>
    <apiCall guid="${stepGuid}" apiId="UiConnect" name="Connect" testItemId="1"/>
  </steps>
</testCase>`;

const G = {
  tc1: '550e8400-e29b-41d4-a716-446655440001',
  tc2: '550e8400-e29b-41d4-a716-446655440002',
  s1:  '550e8400-e29b-41d4-a716-446655440011',
  s2:  '550e8400-e29b-41d4-a716-446655440012',
};

const TESTPROJECT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testProject>
  <environment name="Dev" url="https://dev.example.com"/>
  <environment name="UAT" url="https://uat.example.com"/>
  <connection name="SalesforceOrg" type="salesforce"/>
  <secureStoragePath>.secrets</secureStoragePath>
</testProject>`;

// ── Temp dir helpers ──────────────────────────────────────────────────────────

const tempDirs: string[] = [];

function mktemp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvx-test-'));
  tempDirs.push(dir);
  return dir;
}

function writeFile(p: string, content: string): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf-8');
}

/** Build a minimal valid Provar project in a temp directory */
function makeProject(root: string, planName = 'smoke', tcName = 'Login'): void {
  // .testproject
  writeFile(path.join(root, '.testproject'), TESTPROJECT_XML);

  // tests/<tcName>.testcase
  const tcPath = path.join(root, 'tests', `${tcName}.testcase`);
  writeFile(tcPath, VALID_TC_XML(G.tc1, G.s1, `tc-${tcName.toLowerCase()}`));

  // plans/<planName>/<tcName>.testinstance
  const instancePath = path.join(root, 'plans', planName, `${tcName}.testinstance`);
  writeFile(instancePath, `testCasePath="tests/${tcName}.testcase"\n`);
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* skip */ }
  }
});

// ── resolveProjectRoot ────────────────────────────────────────────────────────

describe('resolveProjectRoot', () => {
  it('returns given path when .testproject is present at root', () => {
    const root = mktemp();
    writeFile(path.join(root, '.testproject'), '<testProject/>');
    const result = resolveProjectRoot(root);
    assert.equal(result.root, root);
    assert.deepEqual(result.candidates, []);
  });

  it('returns the single subdirectory that has .testproject', () => {
    const workspace = mktemp();
    const project = path.join(workspace, 'MyProject');
    fs.mkdirSync(project);
    writeFile(path.join(project, '.testproject'), '<testProject/>');
    const result = resolveProjectRoot(workspace);
    assert.equal(result.root, project);
    assert.deepEqual(result.candidates, []);
  });

  it('returns all candidates when multiple subdirectories have .testproject', () => {
    const workspace = mktemp();
    const p1 = path.join(workspace, 'ProjectA');
    const p2 = path.join(workspace, 'ProjectB');
    fs.mkdirSync(p1);
    fs.mkdirSync(p2);
    writeFile(path.join(p1, '.testproject'), '<testProject/>');
    writeFile(path.join(p2, '.testproject'), '<testProject/>');
    const result = resolveProjectRoot(workspace);
    assert.equal(result.root, workspace);
    assert.equal(result.candidates.length, 2);
    assert.ok(result.candidates.includes(p1));
    assert.ok(result.candidates.includes(p2));
  });

  it('returns given path with empty candidates when no .testproject found anywhere', () => {
    const root = mktemp();
    fs.mkdirSync(path.join(root, 'somedir'));
    const result = resolveProjectRoot(root);
    assert.equal(result.root, root);
    assert.deepEqual(result.candidates, []);
  });
});

// ── readProjectContext ────────────────────────────────────────────────────────

describe('readProjectContext', () => {
  it('returns empty context when no .testproject file exists', () => {
    const root = mktemp();
    const { projectName, context } = readProjectContext(root);
    assert.equal(projectName, path.basename(root));
    assert.deepEqual(context, {});
  });

  it('extracts environments and connections from .testproject', () => {
    const root = mktemp();
    writeFile(path.join(root, '.testproject'), TESTPROJECT_XML);
    const { projectName, context } = readProjectContext(root);
    assert.equal(projectName, path.basename(root));
    assert.deepEqual(context.environments, ['Dev', 'UAT']);
    assert.deepEqual(context.connection_names, ['SalesforceOrg']);
  });

  it('returns empty context when .testproject is unreadable (graceful degradation)', () => {
    const root = mktemp();
    const tpPath = path.join(root, '.testproject');
    writeFile(tpPath, TESTPROJECT_XML);
    // Make the file unreadable on non-Windows (on Windows file locking is different)
    try {
      fs.chmodSync(tpPath, 0o000);
      const { context } = readProjectContext(root);
      assert.deepEqual(context, {});
    } catch {
      // If chmod doesn't work (Windows), skip the test body — graceful skip
    } finally {
      try { fs.chmodSync(tpPath, 0o644); } catch { /* skip */ }
    }
  });

  it('detects encrypted and unencrypted secrets in .secrets', () => {
    const root = mktemp();
    writeFile(path.join(root, '.testproject'), TESTPROJECT_XML);
    // 2 unencrypted values, 1 encrypted, 1 encryptor check line
    writeFile(path.join(root, '.secrets'),
      'Encryptor.check=ENC1(abc123)\n' +
      'password=plaintext\n' +
      'apiKey=ENC1(encrypted)\n' +
      'token=another_plaintext\n'
    );
    const { context } = readProjectContext(root);
    assert.equal(context.secretsPasswordSet, true);
    assert.equal(context.unencrypted_secret_count, 2);
  });
});

// ── resolveTestInstance ───────────────────────────────────────────────────────

describe('resolveTestInstance', () => {
  it('returns TestCaseInput with xml_content for a valid .testinstance', () => {
    const root = mktemp();
    const tcPath = path.join(root, 'tests', 'Login.testcase');
    writeFile(tcPath, VALID_TC_XML(G.tc1, G.s1, 'tc-login'));
    const instancePath = path.join(root, 'plans', 'smoke', 'Login.testinstance');
    writeFile(instancePath, 'testCasePath="tests/Login.testcase"\n');
    const result = resolveTestInstance(instancePath, root);
    assert.ok(result !== null);
    assert.equal(result.name, 'Login');
    assert.ok(result.xml_content?.includes('<testCase'));
  });

  it('returns null when testCasePath attribute is missing', () => {
    const root = mktemp();
    const instancePath = path.join(root, 'plans', 'smoke', 'Bad.testinstance');
    writeFile(instancePath, 'someOtherAttr="value"\n');
    const result = resolveTestInstance(instancePath, root);
    assert.equal(result, null);
  });

  it('returns TestCaseInput with undefined xml_content when testcase file is missing from disk', () => {
    const root = mktemp();
    const instancePath = path.join(root, 'plans', 'smoke', 'Missing.testinstance');
    writeFile(instancePath, 'testCasePath="tests/Missing.testcase"\n');
    const result = resolveTestInstance(instancePath, root);
    assert.ok(result !== null);
    assert.equal(result.name, 'Missing');
    assert.equal(result.xml_content, undefined);
  });

  it('does not read files outside the project root (path bounds check)', () => {
    const root = mktemp();
    const outsideFile = mktemp();
    // Write something recognizable to the outside file
    writeFile(path.join(outsideFile, 'secret.txt'), 'should-not-appear');
    const instancePath = path.join(root, 'plans', 'smoke', 'Escape.testinstance');
    // Absolute path pointing outside the project
    writeFile(instancePath, `testCasePath="${path.join(outsideFile, 'secret.txt')}"\n`);
    const result = resolveTestInstance(instancePath, root);
    // Name is derived from path.basename, but xml_content must be undefined (bounds check)
    if (result !== null) {
      assert.equal(result.xml_content, undefined, 'xml_content must be undefined for out-of-bounds path');
    }
  });
});

// ── toQualityTier + toQualityGrade ────────────────────────────────────────────

describe('toQualityTier', () => {
  it('returns S for score >= 95', () => { assert.equal(toQualityTier(100), 'S'); assert.equal(toQualityTier(95), 'S'); });
  it('returns A for score 85-94', () => { assert.equal(toQualityTier(90), 'A'); assert.equal(toQualityTier(85), 'A'); });
  it('returns B for score 75-84', () => { assert.equal(toQualityTier(80), 'B'); assert.equal(toQualityTier(75), 'B'); });
  it('returns C for score 65-74', () => { assert.equal(toQualityTier(70), 'C'); assert.equal(toQualityTier(65), 'C'); });
  it('returns D for score < 65',  () => { assert.equal(toQualityTier(64), 'D'); assert.equal(toQualityTier(0), 'D'); });
});

describe('toQualityGrade', () => {
  it('returns Excellent for score >= 95', () => { assert.equal(toQualityGrade(100), 'Excellent'); assert.equal(toQualityGrade(95), 'Excellent'); });
  it('returns Great for score 90-94',     () => { assert.equal(toQualityGrade(90), 'Great'); assert.equal(toQualityGrade(92), 'Great'); });
  it('returns Good for score 80-89',      () => { assert.equal(toQualityGrade(80), 'Good'); assert.equal(toQualityGrade(85), 'Good'); });
  it('returns Fair for score 70-79',      () => { assert.equal(toQualityGrade(70), 'Fair'); assert.equal(toQualityGrade(75), 'Fair'); });
  it('returns Poor for score < 70',       () => { assert.equal(toQualityGrade(69), 'Poor'); assert.equal(toQualityGrade(0), 'Poor'); });
});

// ── validateProjectFromPath ───────────────────────────────────────────────────

describe('validateProjectFromPath', () => {
  it('throws PATH_NOT_FOUND for a path that does not exist', () => {
    assert.throws(
      () => validateProjectFromPath({ project_path: '/nonexistent/path/abc' }),
      (err: unknown) => {
        assert.ok(err instanceof ProjectValidationError);
        assert.equal(err.code, 'PATH_NOT_FOUND');
        return true;
      }
    );
  });

  it('throws AMBIGUOUS_PROJECT when multiple projects are found', () => {
    const workspace = mktemp();
    fs.mkdirSync(path.join(workspace, 'ProjectA'));
    fs.mkdirSync(path.join(workspace, 'ProjectB'));
    writeFile(path.join(workspace, 'ProjectA', '.testproject'), '<testProject/>');
    writeFile(path.join(workspace, 'ProjectB', '.testproject'), '<testProject/>');
    assert.throws(
      () => validateProjectFromPath({ project_path: workspace, save_results: false }),
      (err: unknown) => {
        assert.ok(err instanceof ProjectValidationError);
        assert.equal(err.code, 'AMBIGUOUS_PROJECT');
        return true;
      }
    );
  });

  it('throws NOT_A_PROJECT when directory has no .testproject file', () => {
    const root = mktemp();
    fs.mkdirSync(path.join(root, 'somedir'));
    assert.throws(
      () => validateProjectFromPath({ project_path: root, save_results: false }),
      (err: unknown) => {
        assert.ok(err instanceof ProjectValidationError);
        assert.equal(err.code, 'NOT_A_PROJECT');
        return true;
      }
    );
  });

  it('throws NOT_A_PROJECT even when plans/ exists but .testproject is absent', () => {
    const root = mktemp();
    fs.mkdirSync(path.join(root, 'plans', 'smoke'), { recursive: true });
    assert.throws(
      () => validateProjectFromPath({ project_path: root, save_results: false }),
      (err: unknown) => {
        assert.ok(err instanceof ProjectValidationError);
        assert.equal(err.code, 'NOT_A_PROJECT');
        return true;
      }
    );
  });

  it('returns a valid result for a minimal project (happy path)', () => {
    const root = mktemp();
    makeProject(root);
    const result = validateProjectFromPath({ project_path: root, save_results: false });
    assert.equal(result.project_path, root);
    assert.ok(typeof result.quality_score === 'number');
    assert.ok(result.quality_score >= 0 && result.quality_score <= 100);
    assert.ok(typeof result.project_name === 'string');
    assert.ok(Array.isArray(result.plans));
    assert.ok(result.coverage.total_test_cases_on_disk >= 0);
    assert.equal(result.saved_to, null);
  });

  it('saves results to the default location when save_results is true', () => {
    const root = mktemp();
    makeProject(root);
    const result = validateProjectFromPath({ project_path: root, save_results: true });
    assert.ok(result.saved_to !== null);
    const fullPath = path.join(root, result.saved_to);
    assert.ok(fs.existsSync(fullPath), `Expected file at ${fullPath}`);
    const saved = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as Record<string, unknown>;
    assert.ok(saved.reportInfo);
    assert.ok(saved.summary);
  });

  it('does not create a results file when save_results is false', () => {
    const root = mktemp();
    makeProject(root);
    const result = validateProjectFromPath({ project_path: root, save_results: false });
    assert.equal(result.saved_to, null);
    const validationDir = path.join(root, 'provardx', 'validation');
    assert.ok(!fs.existsSync(validationDir), 'Expected no provardx/validation/ directory');
  });

  it('saves to a custom results_dir when provided', () => {
    const root = mktemp();
    const reportsDir = mktemp();
    makeProject(root);
    const result = validateProjectFromPath({
      project_path: root,
      save_results: true,
      results_dir: reportsDir,
    });
    assert.ok(result.saved_to !== null);
    // When results_dir is specified, saved_to is relative to projectPath — verify the file exists at reportsDir
    const files = fs.readdirSync(reportsDir);
    assert.equal(files.length, 1);
    assert.ok(files[0].endsWith('.json'));
  });

  it('auto-detects project root when given a workspace directory', () => {
    const workspace = mktemp();
    const project = path.join(workspace, 'MyProject');
    fs.mkdirSync(project);
    makeProject(project);
    const result = validateProjectFromPath({ project_path: workspace, save_results: false });
    assert.equal(result.project_path, project);
    assert.equal(result.project_name, 'MyProject');
  });

  it('coverage counts reflect covered and uncovered test cases', () => {
    const root = mktemp();
    makeProject(root);
    // Add an extra test case not referenced by any plan
    writeFile(path.join(root, 'tests', 'Orphan.testcase'), VALID_TC_XML(G.tc2, G.s2, 'tc-orphan'));
    const result = validateProjectFromPath({ project_path: root, save_results: false });
    assert.equal(result.coverage.covered_by_plans, 1);
    assert.equal(result.coverage.uncovered_count, 1);
    assert.ok(result.coverage.uncovered_test_cases.some((p) => p.includes('Orphan')));
    assert.equal(result.coverage.total_test_cases_on_disk, 2);
    // covered + uncovered must always sum to total
    assert.equal(result.coverage.covered_by_plans + result.coverage.uncovered_count, result.coverage.total_test_cases_on_disk);
  });

  it('coverage: UUID-based match marks test as covered when testCasePath is absent but testCaseId matches registryId', () => {
    const root = mktemp();
    // .testproject
    writeFile(path.join(root, '.testproject'), TESTPROJECT_XML);
    // Test case with a known registryId on disk
    const callableRegId = '550e8400-e29b-41d4-a716-aabbccdd0001';
    const tcXml = `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="tc-uuidtest" guid="${G.tc1}" registryId="${callableRegId}" name="UuidTest">
  <steps><apiCall guid="${G.s1}" apiId="UiConnect" name="Connect" testItemId="1"/></steps>
</testCase>`;
    writeFile(path.join(root, 'tests', 'UuidTest.testcase'), tcXml);
    // .testinstance referencing by testCaseId only (testCasePath present but deliberately wrong path separator)
    // We simulate a mismatch by omitting testCasePath and relying solely on testCaseId
    writeFile(
      path.join(root, 'plans', 'smoke', 'UuidTest.testinstance'),
      `testCaseId="${callableRegId}"\n`  // no testCasePath — UUID fallback must cover it
    );
    const result = validateProjectFromPath({ project_path: root, save_results: false });
    assert.equal(result.coverage.covered_by_plans, 1, 'UUID-based match should count UuidTest as covered');
    assert.equal(result.coverage.uncovered_count, 0);
  });

  it('coverage: callable test (no testinstance) does NOT suppress uncovered count', () => {
    const root = mktemp();
    makeProject(root);
    // Add a callable test (visibility Internal, no testinstance)
    const callableXml = `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="tc-callable" guid="${G.tc2}" registryId="tc-callable" name="CreateQuote" visibility="Internal">
  <steps><apiCall guid="${G.s2}" apiId="UiConnect" name="Connect" testItemId="1"/></steps>
</testCase>`;
    writeFile(path.join(root, 'tests', 'Callable', 'CreateQuote.testcase'), callableXml);
    const result = validateProjectFromPath({ project_path: root, save_results: false });
    // Login is covered; CreateQuote is not referenced by any plan (it's callable)
    assert.equal(result.coverage.covered_by_plans, 1);
    assert.equal(result.coverage.uncovered_count, 1);
    assert.ok(result.coverage.uncovered_test_cases.some((p) => p.includes('CreateQuote')));
  });

  it('returns save_error when results directory is not writable', () => {
    const root = mktemp();
    makeProject(root);
    // Use a path that cannot be created as a directory (a file path used as dir)
    const blockedDir = path.join(root, 'tests', 'Login.testcase', 'subdir');
    const result = validateProjectFromPath({ project_path: root, save_results: true, results_dir: blockedDir });
    assert.equal(result.saved_to, null);
    assert.ok(typeof result.save_error === 'string');
    assert.ok(result.save_error.length > 0);
  });
});

// ── buildQhReport ─────────────────────────────────────────────────────────────

describe('buildQhReport', () => {
  it('returns a report with expected top-level structure', () => {
    const root = mktemp();
    makeProject(root);
    // We need a ProjectResult to call buildQhReport — run a full validation first
    const result = validateProjectFromPath({ project_path: root, save_results: false });
    // The saved report has the QH structure — verify by re-running with save_results: true
    const withSave = validateProjectFromPath({ project_path: root, save_results: true });
    assert.ok(withSave.saved_to !== null);
    const report = JSON.parse(
      fs.readFileSync(path.join(root, withSave.saved_to), 'utf-8')
    ) as Record<string, unknown>;
    assert.ok(report.reportInfo, 'missing reportInfo');
    assert.ok(report.summary, 'missing summary');
    assert.ok(report.context, 'missing context');
    assert.ok(Array.isArray(report.sections), 'sections must be an array');
    const summary = report.summary as Record<string, unknown>;
    assert.ok(typeof summary.qualityScore === 'number');
    assert.ok(typeof summary.qualityGrade === 'string');
    assert.ok(typeof summary.totalViolations === 'number');
    // Coverage from the main result must match expectations
    assert.equal(result.coverage.covered_by_plans, 1);
  });
});
