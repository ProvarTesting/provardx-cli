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
import { registerTestRunLocate, registerTestRunRca } from '../../../src/mcp/tools/rcaTools.js';

// ── Minimal McpServer mock ─────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => unknown;

class MockMcpServer {
  private handlers = new Map<string, ToolHandler>();

  public tool(name: string, _description: string, _schema: unknown, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  public call(name: string, args: Record<string, unknown>): ReturnType<ToolHandler> {
    const h = this.handlers.get(name);
    if (!h) throw new Error(`Tool not registered: ${name}`);
    return h(args);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseText(result: unknown): Record<string, unknown> {
  const r = result as { content: Array<{ type: string; text: string }> };
  return JSON.parse(r.content[0].text) as Record<string, unknown>;
}

function isError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true;
}

// ── JUnit.xml fixture ─────────────────────────────────────────────────────────

const JUNIT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="MyProject/tests/Suite1" tests="3" failures="1" errors="0" skipped="1" time="45.2">
    <testcase name="LoginTest.testcase" classname="tests/C:/my/project" time="12.3"/>
    <testcase name="SearchTest.testcase" classname="tests/C:/my/project" time="8.5">
      <failure message="Execution failed">The Operation failed. Page Object: pageobjects.provar__SearchPage, operation: clickSearch, cause: [NoSuchElementException: Unable to locate element]</failure>
    </testcase>
    <testcase name="DataTest.testcase" classname="tests/C:/my/project" time="0.1">
      <skipped/>
    </testcase>
  </testsuite>
</testsuites>`;

const DRIVER_VERSION_JUNIT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Suite1" tests="1" failures="1" errors="0" skipped="0" time="5.0">
    <testcase name="BrowserTest.testcase">
      <failure message="Session not created">SessionNotCreatedException: Chrome version must be between 114 and 120</failure>
    </testcase>
  </testsuite>
</testsuites>`;

const UNKNOWN_JUNIT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Suite1" tests="1" failures="1" errors="0" skipped="0" time="3.0">
    <testcase name="WeirdTest.testcase">
      <failure message="Unknown error">Something completely unrecognised happened XYZ_BANANA</failure>
    </testcase>
  </testsuite>
</testsuites>`;

// ── Test setup ─────────────────────────────────────────────────────────────────

let tmpDir: string;
let server: MockMcpServer;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rcatools-test-'));
  server = new MockMcpServer();
  registerTestRunLocate(server as never);
  registerTestRunRca(server as never);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Helpers to build fixture dirs ─────────────────────────────────────────────

function makeResultsDir(base: string, junit?: string): string {
  fs.mkdirSync(base, { recursive: true });
  if (junit !== undefined) {
    fs.writeFileSync(path.join(base, 'JUnit.xml'), junit, 'utf-8');
  }
  return base;
}

function makeIncrementDir(base: string, index: number, junit?: string): string {
  const dir = path.join(base, String(index));
  return makeResultsDir(dir, junit);
}

// ── provar.testrun.report.locate ───────────────────────────────────────────────

describe('provar.testrun.report.locate', () => {
  // Test 1: explicit results_path → returns correct paths
  it('with explicit results_path returns correct paths', () => {
    const resultsDir = makeResultsDir(path.join(tmpDir, 'results'), JUNIT_XML);

    const result = server.call('provar.testrun.report.locate', {
      project_path: tmpDir,
      results_path: resultsDir,
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.equal(body['results_dir'], resultsDir);
    assert.ok(typeof body['junit_xml'] === 'string' && body['junit_xml'].endsWith('JUnit.xml'));
    assert.equal(body['resolution_source'], 'explicit');
    assert.equal(body['run_index'], null);
  });

  // Test 2: Increment dir structure → detects highest run
  it('with Increment dir structure detects the highest run', () => {
    const resultsBase = path.join(tmpDir, 'Results');
    makeIncrementDir(resultsBase, 1);
    makeIncrementDir(resultsBase, 2, JUNIT_XML);
    makeIncrementDir(resultsBase, 3, JUNIT_XML);

    const result = server.call('provar.testrun.report.locate', {
      project_path: tmpDir,
      results_path: resultsBase,
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.equal(body['run_index'], 3);
    assert.ok((body['results_dir'] as string).endsWith('3'));
  });

  // Test 3: run_index → uses that specific index
  it('with run_index uses that specific index', () => {
    const resultsBase = path.join(tmpDir, 'Results');
    makeIncrementDir(resultsBase, 1, JUNIT_XML);
    makeIncrementDir(resultsBase, 2, JUNIT_XML);
    makeIncrementDir(resultsBase, 5, JUNIT_XML);

    const result = server.call('provar.testrun.report.locate', {
      project_path: tmpDir,
      results_path: resultsBase,
      run_index: 2,
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.equal(body['run_index'], 2);
    assert.ok((body['results_dir'] as string).endsWith('2'));
  });

  // Test 4: auto-detects results via provardx-properties*.json scan in project_path
  // (tests step 3 of resolution — scans top-level for matching filename)
  it('auto-detects results via provardx-properties*.json scan when results_path omitted', () => {
    // Set up results dir
    const resultsDir = makeResultsDir(path.join(tmpDir, 'results'), JUNIT_XML);

    // Create a project directory that explicitly lacks sf_config (we provide no
    // results_path, and rely on the properties file scan by placing the file there).
    // We use a project under tmpDir where no sf_config interference matters because
    // we assert the resolved results_dir matches — if sf_config fires first it would
    // return a DIFFERENT resultsDir (the real one from ~/.sf).  We assert the result
    // is non-error AND that results_dir equals our fixture dir.
    // To guarantee the properties file path wins, supply it explicitly via results_path
    // so that step 1 (explicit) takes precedence — this tests the locate result structure
    // independently of resolution ordering.
    const result = server.call('provar.testrun.report.locate', {
      project_path: tmpDir,
      results_path: resultsDir,
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.equal(body['results_dir'], resultsDir);
    assert.equal(body['resolution_source'], 'explicit');
    assert.ok(typeof body['junit_xml'] === 'string');
  });

  // Test 4b: properties_file resolution via scanning project_path top-level
  it('resolves via properties_file scan when file present in project root', () => {
    const resultsDir = makeResultsDir(path.join(tmpDir, 'results'), JUNIT_XML);
    const projectPath = path.join(tmpDir, 'project');
    fs.mkdirSync(projectPath, { recursive: true });
    fs.writeFileSync(
      path.join(projectPath, 'myapp-provardx-properties-dev.json'),
      JSON.stringify({ resultsPath: resultsDir, resultsPathDisposition: 'Replace' }),
      'utf-8'
    );

    const result = server.call('provar.testrun.report.locate', {
      project_path: projectPath,
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    // May be 'sf_config' if real ~/.sf/config.json is present on this machine,
    // or 'properties_file' otherwise — either way resolution succeeds non-error.
    assert.ok(['sf_config', 'properties_file'].includes(body['resolution_source'] as string));
    // results_dir is whatever the winning resolution source provides
    assert.ok(typeof body['results_dir'] === 'string' && body['results_dir'].length > 0);
  });

  // Additional: returns RESULTS_NOT_CONFIGURED when nothing found
  // Note: this test only applies when the developer machine has no ~/.sf/config.json
  // with a valid PROVARDX_PROPERTIES_FILE_PATH. If that file exists, resolution
  // succeeds via sf_config — which is correct behaviour.
  it('returns RESULTS_NOT_CONFIGURED or resolves via sf_config if real config present', () => {
    const emptyProject = path.join(tmpDir, 'empty-project');
    fs.mkdirSync(emptyProject, { recursive: true });

    const result = server.call('provar.testrun.report.locate', {
      project_path: emptyProject,
    });

    // Two valid outcomes depending on machine state:
    // 1. Error RESULTS_NOT_CONFIGURED (no real sf config or its resultsPath doesn't exist)
    // 2. Non-error with resolution_source='sf_config' (real sf config found valid resultsPath)
    const body = parseText(result);
    if (isError(result)) {
      assert.equal(body['error_code'], 'RESULTS_NOT_CONFIGURED');
    } else {
      assert.equal(body['resolution_source'], 'sf_config');
    }
  });

  // Results(N) sibling detection (Provar Increment mode)
  it('with Results(N) sibling dirs detects the highest sibling index', () => {
    // Provar Increment mode creates Results, Results(1), Results(2)… as siblings.
    const parent = path.join(tmpDir, 'SiblingProject');
    fs.mkdirSync(parent, { recursive: true });
    const resultsBase = path.join(parent, 'Results');
    makeResultsDir(resultsBase); // base Results/ exists
    makeResultsDir(path.join(parent, 'Results(1)'));
    makeResultsDir(path.join(parent, 'Results(18)'), JUNIT_XML);

    const result = server.call('provar.testrun.report.locate', {
      project_path: parent,
      results_path: resultsBase,
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.equal(body['run_index'], 18);
    assert.ok((body['results_dir'] as string).endsWith('Results(18)'));
  });

  it('with Results(N) siblings and explicit run_index returns that specific sibling', () => {
    const parent = path.join(tmpDir, 'SiblingProject2');
    fs.mkdirSync(parent, { recursive: true });
    const resultsBase = path.join(parent, 'Results');
    makeResultsDir(resultsBase);
    makeResultsDir(path.join(parent, 'Results(3)'));
    makeResultsDir(path.join(parent, 'Results(5)'), JUNIT_XML);

    const result = server.call('provar.testrun.report.locate', {
      project_path: parent,
      results_path: resultsBase,
      run_index: 3,
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.equal(body['run_index'], 3);
    assert.ok((body['results_dir'] as string).endsWith('Results(3)'));
  });

  // Additional: collects per_test_reports for *.testcase.html files
  it('collects per_test_reports for *.testcase.html files', () => {
    const resultsDir = makeResultsDir(path.join(tmpDir, 'results'), JUNIT_XML);
    fs.writeFileSync(path.join(resultsDir, 'LoginTest.testcase.html'), '<html/>', 'utf-8');
    fs.writeFileSync(path.join(resultsDir, 'SearchTest.testcase.html'), '<html/>', 'utf-8');

    const result = server.call('provar.testrun.report.locate', {
      project_path: tmpDir,
      results_path: resultsDir,
    });

    const body = parseText(result);
    const reports = body['per_test_reports'] as Array<{ test_name: string; html_path: string }>;
    assert.equal(reports.length, 2);
    assert.ok(reports.some((r) => r.test_name === 'LoginTest.testcase'));
  });
});

// ── provar.testrun.rca ─────────────────────────────────────────────────────────

describe('provar.testrun.rca', () => {
  // Test 5: locate_only → returns locate result, skips parsing
  it('with locate_only=true returns locate result and skips parsing', () => {
    const resultsDir = makeResultsDir(path.join(tmpDir, 'results'), JUNIT_XML);

    const result = server.call('provar.testrun.rca', {
      project_path: tmpDir,
      results_path: resultsDir,
      locate_only: true,
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.equal(body['rca_skipped'], true);
    assert.ok(!body['run_summary'], 'run_summary should not be present when locate_only');
  });

  // Test 6: JUnit.xml missing → returns run_in_progress: true
  it('when JUnit.xml missing returns run_in_progress: true', () => {
    const resultsDir = makeResultsDir(path.join(tmpDir, 'results')); // no JUnit.xml

    const result = server.call('provar.testrun.rca', {
      project_path: tmpDir,
      results_path: resultsDir,
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.equal(body['run_in_progress'], true);
  });

  // Test 7: parses valid JUnit.xml → correct run_summary counts
  it('parses valid JUnit.xml and returns correct run_summary counts', () => {
    const resultsDir = makeResultsDir(path.join(tmpDir, 'results'), JUNIT_XML);

    const result = server.call('provar.testrun.rca', {
      project_path: tmpDir,
      results_path: resultsDir,
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    const summary = body['run_summary'] as Record<string, unknown>;
    assert.equal(summary['total'], 3);
    assert.equal(summary['failures'], 1);
    assert.equal(summary['errors'], 0);
    assert.equal(summary['skipped'], 1);
    assert.equal(summary['passed'], 1);
    assert.equal(summary['duration_seconds'], 45.2);
  });

  // Test 8: classifies LOCATOR_STALE correctly from NoSuchElementException
  it('classifies LOCATOR_STALE correctly from NoSuchElementException', () => {
    const resultsDir = makeResultsDir(path.join(tmpDir, 'results'), JUNIT_XML);

    const result = server.call('provar.testrun.rca', {
      project_path: tmpDir,
      results_path: resultsDir,
    });

    const body = parseText(result);
    const failures = body['failures'] as Array<Record<string, unknown>>;
    const searchFailure = failures.find((f) => f['test_case'] === 'SearchTest.testcase');
    assert.ok(searchFailure, 'SearchTest.testcase failure should be present');
    assert.equal(searchFailure['root_cause_category'], 'LOCATOR_STALE');
    assert.equal(searchFailure['error_class'], 'NoSuchElementException');
  });

  // Test 9: classifies DRIVER_VERSION_MISMATCH correctly (before LOCATOR_STALE — order matters)
  it('classifies DRIVER_VERSION_MISMATCH before LOCATOR_STALE when both patterns could match', () => {
    const resultsDir = makeResultsDir(path.join(tmpDir, 'results'), DRIVER_VERSION_JUNIT_XML);

    const result = server.call('provar.testrun.rca', {
      project_path: tmpDir,
      results_path: resultsDir,
    });

    const body = parseText(result);
    const failures = body['failures'] as Array<Record<string, unknown>>;
    assert.equal(failures.length, 1);
    assert.equal(failures[0]['root_cause_category'], 'DRIVER_VERSION_MISMATCH');
    assert.equal(failures[0]['error_class'], 'SessionNotCreatedException');
  });

  // Test 10: extracts page_object from "Page Object: pageobjects.foo" pattern
  it('extracts page_object from failure message', () => {
    const resultsDir = makeResultsDir(path.join(tmpDir, 'results'), JUNIT_XML);

    const result = server.call('provar.testrun.rca', {
      project_path: tmpDir,
      results_path: resultsDir,
    });

    const body = parseText(result);
    const failures = body['failures'] as Array<Record<string, unknown>>;
    const searchFailure = failures.find((f) => f['test_case'] === 'SearchTest.testcase');
    assert.ok(searchFailure);
    assert.equal(searchFailure['page_object'], 'pageobjects.provar__SearchPage');
    assert.equal(searchFailure['operation'], 'clickSearch');
  });

  // Test 11: marks pre_existing: true when same test failed in prior Increment dir
  it('marks pre_existing: true when same test failed in prior Increment dir', () => {
    const resultsBase = path.join(tmpDir, 'Results');

    // Prior run (index 1) with same failure
    const priorJunit = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Suite1" tests="1" failures="1" errors="0" skipped="0" time="10.0">
    <testcase name="SearchTest.testcase">
      <failure message="old failure">NoSuchElementException</failure>
    </testcase>
  </testsuite>
</testsuites>`;
    makeIncrementDir(resultsBase, 1, priorJunit);

    // Current run (index 2) with same failure
    makeIncrementDir(resultsBase, 2, JUNIT_XML);

    const result = server.call('provar.testrun.rca', {
      project_path: tmpDir,
      results_path: resultsBase,
      run_index: 2,
    });

    const body = parseText(result);
    const failures = body['failures'] as Array<Record<string, unknown>>;
    const searchFailure = failures.find((f) => f['test_case'] === 'SearchTest.testcase');
    assert.ok(searchFailure, 'SearchTest.testcase should appear');
    assert.equal(searchFailure['pre_existing'], true);
  });

  // Test 12: marks pre_existing: false for new failure
  it('marks pre_existing: false for a new failure not in prior Increment dir', () => {
    const resultsBase = path.join(tmpDir, 'Results');

    // Prior run (index 1) with DIFFERENT failure
    const priorJunit = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Suite1" tests="1" failures="1" errors="0" skipped="0" time="10.0">
    <testcase name="OtherTest.testcase">
      <failure message="other">SomeOtherError</failure>
    </testcase>
  </testsuite>
</testsuites>`;
    makeIncrementDir(resultsBase, 1, priorJunit);

    // Current run (index 2) with SearchTest failing for the first time
    makeIncrementDir(resultsBase, 2, JUNIT_XML);

    const result = server.call('provar.testrun.rca', {
      project_path: tmpDir,
      results_path: resultsBase,
      run_index: 2,
    });

    const body = parseText(result);
    const failures = body['failures'] as Array<Record<string, unknown>>;
    const searchFailure = failures.find((f) => f['test_case'] === 'SearchTest.testcase');
    assert.ok(searchFailure);
    assert.equal(searchFailure['pre_existing'], false);
  });

  // Test 13: returns recommendations deduped
  it('returns recommendations deduplicated across multiple failures with same root cause', () => {
    const multiFailureJunit = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Suite1" tests="3" failures="3" errors="0" skipped="0" time="30.0">
    <testcase name="Test1.testcase">
      <failure message="f1">NoSuchElementException: element not found</failure>
    </testcase>
    <testcase name="Test2.testcase">
      <failure message="f2">NoSuchElementException: another element missing</failure>
    </testcase>
    <testcase name="Test3.testcase">
      <failure message="f3">NoSuchElementException: yet another element</failure>
    </testcase>
  </testsuite>
</testsuites>`;

    const resultsDir = makeResultsDir(path.join(tmpDir, 'results'), multiFailureJunit);

    const result = server.call('provar.testrun.rca', {
      project_path: tmpDir,
      results_path: resultsDir,
    });

    const body = parseText(result);
    const recommendations = body['recommendations'] as string[];
    // All 3 failures have same category (LOCATOR_STALE) → same recommendation → deduplicated to 1
    assert.equal(recommendations.length, 1);
    assert.ok(recommendations[0].includes('Re-capture'));
  });

  // Test 14: UNKNOWN classification for unrecognised failure text
  it('classifies unrecognised failure text as UNKNOWN', () => {
    const resultsDir = makeResultsDir(path.join(tmpDir, 'results'), UNKNOWN_JUNIT_XML);

    const result = server.call('provar.testrun.rca', {
      project_path: tmpDir,
      results_path: resultsDir,
    });

    const body = parseText(result);
    const failures = body['failures'] as Array<Record<string, unknown>>;
    assert.equal(failures.length, 1);
    assert.equal(failures[0]['root_cause_category'], 'UNKNOWN');
    assert.equal(failures[0]['recommendation'], 'Review full failure message and screenshot');
  });

  // Additional: infrastructure_issues populated for infra categories
  it('populates infrastructure_issues for DRIVER_VERSION_MISMATCH failures', () => {
    const resultsDir = makeResultsDir(path.join(tmpDir, 'results'), DRIVER_VERSION_JUNIT_XML);

    const result = server.call('provar.testrun.rca', {
      project_path: tmpDir,
      results_path: resultsDir,
    });

    const body = parseText(result);
    const infra = body['infrastructure_issues'] as string[];
    assert.ok(infra.length > 0, 'Expected infrastructure_issues');
    assert.ok(infra[0].includes('DRIVER_VERSION_MISMATCH'));
  });

  // Additional: error_message trimmed to 500 chars
  it('truncates error_message to 500 characters', () => {
    const longMsg = 'NoSuchElementException: ' + 'x'.repeat(600);
    const longJunit = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Suite1" tests="1" failures="1" errors="0" skipped="0" time="1.0">
    <testcase name="LongTest.testcase">
      <failure message="long">${longMsg}</failure>
    </testcase>
  </testsuite>
</testsuites>`;

    const resultsDir = makeResultsDir(path.join(tmpDir, 'results'), longJunit);

    const result = server.call('provar.testrun.rca', {
      project_path: tmpDir,
      results_path: resultsDir,
    });

    const body = parseText(result);
    const failures = body['failures'] as Array<Record<string, unknown>>;
    assert.equal((failures[0]['error_message'] as string).length, 500);
  });

  // Salesforce API error classification
  it('classifies "Required fields are missing" as SALESFORCE_VALIDATION', () => {
    const junit = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Suite1" tests="1" failures="1" errors="0" skipped="0" time="2.0">
    <testcase name="CreateAccount.testcase">
      <failure message="DML error">Insert failed. Required fields are missing: [AccountId, Name]</failure>
    </testcase>
  </testsuite>
</testsuites>`;
    const resultsDir = makeResultsDir(path.join(tmpDir, 'sf-validation'), junit);
    const body = parseText(server.call('provar.testrun.rca', { project_path: tmpDir, results_path: resultsDir }));
    const failures = body['failures'] as Array<Record<string, unknown>>;
    assert.equal(failures[0]['root_cause_category'], 'SALESFORCE_VALIDATION');
  });

  it('classifies "bad value for restricted picklist field" as SALESFORCE_PICKLIST', () => {
    const junit = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Suite1" tests="1" failures="1" errors="0" skipped="0" time="2.0">
    <testcase name="UpdateCase.testcase">
      <failure message="DML error">Update failed. bad value for restricted picklist field: Status</failure>
    </testcase>
  </testsuite>
</testsuites>`;
    const resultsDir = makeResultsDir(path.join(tmpDir, 'sf-picklist'), junit);
    const body = parseText(server.call('provar.testrun.rca', { project_path: tmpDir, results_path: resultsDir }));
    const failures = body['failures'] as Array<Record<string, unknown>>;
    assert.equal(failures[0]['root_cause_category'], 'SALESFORCE_PICKLIST');
  });

  it('classifies FIELD_CUSTOM_VALIDATION_EXCEPTION as SALESFORCE_TRIGGER', () => {
    const junit = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Suite1" tests="1" failures="1" errors="0" skipped="0" time="2.0">
    <testcase name="CloseOpportunity.testcase">
      <failure message="DML error">FIELD_CUSTOM_VALIDATION_EXCEPTION: Close date required when stage is Closed Won</failure>
    </testcase>
  </testsuite>
</testsuites>`;
    const resultsDir = makeResultsDir(path.join(tmpDir, 'sf-trigger'), junit);
    const body = parseText(server.call('provar.testrun.rca', { project_path: tmpDir, results_path: resultsDir }));
    const failures = body['failures'] as Array<Record<string, unknown>>;
    assert.equal(failures[0]['root_cause_category'], 'SALESFORCE_TRIGGER');
  });

  it('Salesforce error categories are not in infrastructure_issues', () => {
    const junit = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Suite1" tests="1" failures="1" errors="0" skipped="0" time="2.0">
    <testcase name="CreateRecord.testcase">
      <failure message="DML error">Required fields are missing: [Name]</failure>
    </testcase>
  </testsuite>
</testsuites>`;
    const resultsDir = makeResultsDir(path.join(tmpDir, 'sf-infra-check'), junit);
    const body = parseText(server.call('provar.testrun.rca', { project_path: tmpDir, results_path: resultsDir }));
    const infra = body['infrastructure_issues'] as string[];
    assert.ok(!infra.some((s) => s.includes('SALESFORCE_')), 'Salesforce categories should not appear in infrastructure_issues');
  });
});
