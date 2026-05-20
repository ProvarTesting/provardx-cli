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
import { describe, it, beforeEach, afterEach } from 'mocha';
import { resolveTestCasePlanMode } from '../../../src/mcp/utils/testCasePlanMode.js';

/**
 * Build a minimal Provar project on disk for plan-mode resolution tests.
 *
 * Layout: `<projectRoot>/tests/Module/MyTest.testcase`,
 * `<projectRoot>/plans/Plan1/Suite1/MyTest.testinstance` (only when
 * `wirePlan=true`), and `<projectRoot>/provardx-properties.json`.
 *
 * Returns the test-case path and the properties-file path so callers can
 * point the resolver at the right inputs.
 */
function buildProject(opts: {
  root: string;
  references: 'direct-testCase' | 'direct-testCases' | 'none';
  wirePlan: boolean;
}): { testCasePath: string; propertiesPath: string; projectPath: string } {
  const projectPath = path.join(opts.root, 'project');
  fs.mkdirSync(path.join(projectPath, 'tests', 'Module'), { recursive: true });
  const testCasePath = path.join(projectPath, 'tests', 'Module', 'MyTest.testcase');
  fs.writeFileSync(testCasePath, '<?xml version="1.0"?><testCase guid="x" id="1"><steps/></testCase>');

  if (opts.wirePlan) {
    fs.mkdirSync(path.join(projectPath, 'plans', 'Plan1', 'Suite1'), { recursive: true });
    const inst = path.join(projectPath, 'plans', 'Plan1', 'Suite1', 'MyTest.testinstance');
    fs.writeFileSync(inst, '<testInstance testCasePath="Module/MyTest.testcase"/>');
  }

  const props: Record<string, unknown> = {
    projectPath,
    provarHome: '/tmp/provarHome',
    resultsPath: 'ANT/Results',
  };
  if (opts.references === 'direct-testCase') {
    props.testCase = ['Module/MyTest.testcase'];
  } else if (opts.references === 'direct-testCases') {
    props.testCases = ['Module/MyTest.testcase'];
  }

  const propertiesPath = path.join(projectPath, 'provardx-properties.json');
  fs.writeFileSync(propertiesPath, JSON.stringify(props, null, 2));
  return { testCasePath, propertiesPath, projectPath };
}

describe('resolveTestCasePlanMode', () => {
  let tmp: string;

  beforeEach(() => {
    // Realpath the tmp root immediately so every derived path uses the canonical form.
    // Required on macOS where os.tmpdir() returns /var/folders/... but realpathSync
    // canonicalises through the /var → /private/var symlink. The resolver under test
    // now calls fs.realpathSync internally, so comparisons against constructed paths
    // would otherwise diverge from the resolved result on Mac.
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pdx489-mode-')));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('returns "direct" when properties references via top-level testCase', () => {
    const { testCasePath, propertiesPath, projectPath } = buildProject({
      root: tmp,
      references: 'direct-testCase',
      wirePlan: false,
    });
    const result = resolveTestCasePlanMode({
      testCaseFilePath: testCasePath,
      allowedPaths: [tmp],
      propertiesFilePathOverride: propertiesPath,
    });
    assert.equal(result.mode, 'direct');
    assert.equal(result.propertiesFilePath, propertiesPath);
    assert.equal(result.projectPath, projectPath);
  });

  it('returns "direct" when properties references via testCases (plural)', () => {
    const { testCasePath, propertiesPath } = buildProject({
      root: tmp,
      references: 'direct-testCases',
      wirePlan: false,
    });
    const result = resolveTestCasePlanMode({
      testCaseFilePath: testCasePath,
      allowedPaths: [tmp],
      propertiesFilePathOverride: propertiesPath,
    });
    assert.equal(result.mode, 'direct');
  });

  it('returns "plan" when a .testinstance references the test case (even if testCase array also lists it)', () => {
    const { testCasePath, propertiesPath } = buildProject({
      root: tmp,
      references: 'direct-testCase',
      wirePlan: true,
    });
    const result = resolveTestCasePlanMode({
      testCaseFilePath: testCasePath,
      allowedPaths: [tmp],
      propertiesFilePathOverride: propertiesPath,
    });
    assert.equal(result.mode, 'plan', 'Plan-instance reference must win over direct testCase array');
  });

  it('returns "plan" when only a .testinstance references it', () => {
    const { testCasePath, propertiesPath } = buildProject({
      root: tmp,
      references: 'none',
      wirePlan: true,
    });
    const result = resolveTestCasePlanMode({
      testCaseFilePath: testCasePath,
      allowedPaths: [tmp],
      propertiesFilePathOverride: propertiesPath,
    });
    assert.equal(result.mode, 'plan');
  });

  it('returns "unknown" when neither testCase nor a .testinstance references it', () => {
    const { testCasePath, propertiesPath } = buildProject({
      root: tmp,
      references: 'none',
      wirePlan: false,
    });
    const result = resolveTestCasePlanMode({
      testCaseFilePath: testCasePath,
      allowedPaths: [tmp],
      propertiesFilePathOverride: propertiesPath,
    });
    assert.equal(result.mode, 'unknown');
  });

  it('returns "unknown" when the properties file does not exist', () => {
    const result = resolveTestCasePlanMode({
      testCaseFilePath: path.join(tmp, 'nope.testcase'),
      allowedPaths: [tmp],
      propertiesFilePathOverride: path.join(tmp, 'missing.json'),
    });
    // Override is honoured but fs read fails → 'unknown'
    assert.equal(result.mode, 'unknown');
  });

  it('returns "unknown" when sf config has no PROVARDX_PROPERTIES_FILE_PATH entry', () => {
    const sfDir = path.join(tmp, 'sf');
    fs.mkdirSync(sfDir);
    fs.writeFileSync(path.join(sfDir, 'config.json'), JSON.stringify({}));
    const result = resolveTestCasePlanMode({
      testCaseFilePath: path.join(tmp, 'nope.testcase'),
      allowedPaths: [tmp],
      sfConfigPathOverride: path.join(sfDir, 'config.json'),
    });
    assert.equal(result.mode, 'unknown');
  });

  it('returns "unknown" when properties file is outside allowed paths', () => {
    const { testCasePath, propertiesPath } = buildProject({
      root: tmp,
      references: 'direct-testCase',
      wirePlan: false,
    });
    // Allowed paths intentionally does NOT include the properties path.
    const result = resolveTestCasePlanMode({
      testCaseFilePath: testCasePath,
      allowedPaths: [path.join(tmp, 'unrelated-dir')],
      propertiesFilePathOverride: propertiesPath,
    });
    assert.equal(result.mode, 'unknown');
  });

  it('honours assertPathAllowed on propertiesFilePathOverride: override inside allowed paths is consulted', () => {
    // Security regression guard: a properties-file override path must pass the
    // path-policy check before the resolver opens it. When the override sits
    // inside the allowed-paths tree the helper should consult it normally and
    // return the resolved mode (here: "direct").
    const { testCasePath, propertiesPath, projectPath } = buildProject({
      root: tmp,
      references: 'direct-testCase',
      wirePlan: false,
    });
    const result = resolveTestCasePlanMode({
      testCaseFilePath: testCasePath,
      allowedPaths: [tmp],
      propertiesFilePathOverride: propertiesPath,
    });
    assert.equal(result.mode, 'direct');
    assert.equal(result.projectPath, projectPath);
  });

  it('honours assertPathAllowed on propertiesFilePathOverride: override outside allowed paths is ignored without throwing', () => {
    // Security regression guard for the Copilot-flagged path-policy bypass:
    // the override must be funnelled through assertPathAllowed and a
    // violation must collapse to 'unknown' rather than reading the file or
    // throwing — the helper's contract is best-effort silent fallback.
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pdx489-outside-'));
    try {
      const { testCasePath } = buildProject({
        root: tmp,
        references: 'direct-testCase',
        wirePlan: false,
      });
      // Write a properties file OUTSIDE the allowed-paths tree.
      const outsideProps = path.join(outsideRoot, 'provardx-properties.json');
      fs.writeFileSync(
        outsideProps,
        JSON.stringify({ projectPath: outsideRoot, provarHome: '/tmp', resultsPath: 'r' })
      );
      const result = resolveTestCasePlanMode({
        testCaseFilePath: testCasePath,
        allowedPaths: [tmp],
        propertiesFilePathOverride: outsideProps,
      });
      assert.equal(result.mode, 'unknown');
      assert.equal(result.propertiesFilePath, undefined, 'must not expose a path it rejected');
    } finally {
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });
});
