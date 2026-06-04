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
import { registerTestSuiteValidate } from '../../../src/mcp/tools/testSuiteValidate.js';

// ── Minimal McpServer mock ─────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => unknown;

class MockMcpServer {
  private handlers = new Map<string, ToolHandler>();

  public tool(name: string, _description: string, _schema: unknown, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  public registerTool(name: string, _config: unknown, handler: ToolHandler): void {
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

// ── XML fixtures ──────────────────────────────────────────────────────────────

const G = {
  tc1: '550e8400-e29b-41d4-a716-446655440001',
  tc2: '550e8400-e29b-41d4-a716-446655440002',
  s1: '550e8400-e29b-41d4-a716-446655440011',
  s2: '550e8400-e29b-41d4-a716-446655440012',
};

function makeXml(tcGuid: string, stepGuid: string, id: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testCase id="${id}" guid="${tcGuid}" registryId="${id}" name="${id}">`,
    '  <steps>',
    `    <apiCall guid="${stepGuid}" apiId="com.provar.plugins.forcedotcom.core.ui.UiConnect" name="Connect" testItemId="1"/>`,
    '  </steps>',
    '</testCase>',
  ].join('\n');
}

const TC_LOGIN = { name: 'LoginTest.testcase', xml_content: makeXml(G.tc1, G.s1, 'tc-001') };
const TC_LOGOUT = { name: 'LogoutTest.testcase', xml_content: makeXml(G.tc2, G.s2, 'tc-002') };

// Same test cases using the `xml` alias
const TC_LOGIN_ALIAS = { name: 'LoginTest.testcase', xml: makeXml(G.tc1, G.s1, 'tc-001') };
const TC_LOGOUT_ALIAS = { name: 'LogoutTest.testcase', xml: makeXml(G.tc2, G.s2, 'tc-002') };

// ── provar_testsuite_validate ─────────────────────────────────────────────────

describe('provar_testsuite_validate', () => {
  let server: MockMcpServer;
  let origHomedir: () => string;
  let tempHome: string;

  beforeEach(() => {
    // Redirect os.homedir() into a temp dir so suiteStorageDir() writes to
    // an isolated location instead of polluting the real developer/CI home.
    // NOTE: scoped INSIDE this describe so the stub does not leak into other
    // test files. Mocha root-level beforeEach attaches to the root suite and
    // runs before every test in every file — see auth/rotate.test.ts which
    // relies on the real os.homedir() and would otherwise see this stub.
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pvts-home-'));
    origHomedir = os.homedir;
    (os as unknown as { homedir: () => string }).homedir = (): string => tempHome;

    server = new MockMcpServer();
    registerTestSuiteValidate(server as never);
  });

  afterEach(() => {
    (os as unknown as { homedir: () => string }).homedir = origHomedir;
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  describe('happy path', () => {
    it('returns a result (not an error) for a valid non-empty suite', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'AccountSuite',
        test_cases: [TC_LOGIN, TC_LOGOUT],
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.ok('quality_score' in body, 'quality_score should be present');
      assert.ok('violations' in body, 'violations should be present');
    });

    it('quality_score is between 0 and 100', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'AccountSuite',
        test_cases: [TC_LOGIN, TC_LOGOUT],
      });

      const body = parseText(result);
      const score = body['quality_score'] as number;
      assert.ok(score >= 0 && score <= 100, `Expected 0-100, got ${score}`);
    });

    it('returns requestId in the response', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'MySuite',
        test_cases: [TC_LOGIN],
      });

      const body = parseText(result);
      assert.ok(typeof body['requestId'] === 'string' && body['requestId'].length > 0);
    });

    it('includes a summary object with totals', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'AccountSuite',
        test_cases: [TC_LOGIN, TC_LOGOUT],
      });

      const body = parseText(result);
      const summary = body['summary'] as Record<string, unknown>;
      assert.ok(typeof summary['total_test_cases'] === 'number');
      assert.ok(typeof summary['total_violations'] === 'number');
    });
  });

  describe('SUITE-EMPTY-001 — empty suite', () => {
    it('triggers SUITE-EMPTY-001 when suite has no test_cases and no child_suites', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'EmptySuite',
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      const violations = body['violations'] as Array<{ rule_id: string }>;
      assert.ok(
        violations.some((v) => v.rule_id === 'SUITE-EMPTY-001'),
        'Expected SUITE-EMPTY-001'
      );
    });

    it('triggers SUITE-EMPTY-001 when test_cases is an empty array', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'EmptySuite',
        test_cases: [],
      });

      const violations = parseText(result)['violations'] as Array<{ rule_id: string }>;
      assert.ok(
        violations.some((v) => v.rule_id === 'SUITE-EMPTY-001'),
        'Expected SUITE-EMPTY-001'
      );
    });

    it('does NOT trigger SUITE-EMPTY-001 when suite has test_cases', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'NonEmptySuite',
        test_cases: [TC_LOGIN],
      });

      const violations = parseText(result)['violations'] as Array<{ rule_id: string }>;
      assert.ok(!violations.some((v) => v.rule_id === 'SUITE-EMPTY-001'), 'Did not expect SUITE-EMPTY-001');
    });

    it('does NOT trigger SUITE-EMPTY-001 when suite has child_suites', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'ParentSuite',
        child_suites: [{ name: 'ChildSuite', test_cases: [TC_LOGIN] }],
      });

      const violations = parseText(result)['violations'] as Array<{ rule_id: string }>;
      assert.ok(!violations.some((v) => v.rule_id === 'SUITE-EMPTY-001'), 'Did not expect SUITE-EMPTY-001');
    });
  });

  describe('SUITE-DUP-001 — duplicate test case names', () => {
    it('triggers SUITE-DUP-001 when two test cases share the same name', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'DupSuite',
        test_cases: [TC_LOGIN, { name: 'LoginTest.testcase', xml_content: makeXml(G.tc2, G.s2, 'tc-dup') }],
      });

      const violations = parseText(result)['violations'] as Array<{ rule_id: string }>;
      assert.ok(
        violations.some((v) => v.rule_id === 'SUITE-DUP-001'),
        'Expected SUITE-DUP-001'
      );
    });

    it('does NOT trigger SUITE-DUP-001 for distinct test case names', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'UniqSuite',
        test_cases: [TC_LOGIN, TC_LOGOUT],
      });

      const violations = parseText(result)['violations'] as Array<{ rule_id: string }>;
      assert.ok(!violations.some((v) => v.rule_id === 'SUITE-DUP-001'), 'Did not expect SUITE-DUP-001');
    });
  });

  describe('SUITE-DUP-002 — duplicate child suite names', () => {
    it('triggers SUITE-DUP-002 when two child suites share the same name', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'ParentSuite',
        child_suites: [
          { name: 'ChildA', test_cases: [TC_LOGIN] },
          { name: 'ChildA', test_cases: [TC_LOGOUT] },
        ],
      });

      const violations = parseText(result)['violations'] as Array<{ rule_id: string }>;
      assert.ok(
        violations.some((v) => v.rule_id === 'SUITE-DUP-002'),
        'Expected SUITE-DUP-002'
      );
    });
  });

  describe('SUITE-SIZE-001 — oversized suite (>75 test cases)', () => {
    it('triggers SUITE-SIZE-001 when test_case_count exceeds 75', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'HugeSuite',
        test_cases: [TC_LOGIN],
        test_case_count: 76,
      });

      const violations = parseText(result)['violations'] as Array<{ rule_id: string }>;
      assert.ok(
        violations.some((v) => v.rule_id === 'SUITE-SIZE-001'),
        'Expected SUITE-SIZE-001'
      );
    });

    it('does NOT trigger SUITE-SIZE-001 when test_case_count is exactly 75', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'BoundarySuite',
        test_cases: [TC_LOGIN],
        test_case_count: 75,
      });

      const violations = parseText(result)['violations'] as Array<{ rule_id: string }>;
      assert.ok(!violations.some((v) => v.rule_id === 'SUITE-SIZE-001'), 'Did not expect SUITE-SIZE-001 at exactly 75');
    });

    it('triggers SUITE-SIZE-001 by counting test_cases when no explicit count provided', () => {
      // Build 76 distinct test cases
      const cases = Array.from({ length: 76 }, (_, i) => ({
        name: `Test${i}.testcase`,
        xml_content: makeXml(
          `550e8400-e29b-41d4-a716-${String(i).padStart(12, '0')}`,
          `550e8400-e29b-41d4-b716-${String(i).padStart(12, '0')}`,
          `tc-${i}`
        ),
      }));

      const result = server.call('provar_testsuite_validate', {
        suite_name: 'HugeSuite',
        test_cases: cases,
      });

      const violations = parseText(result)['violations'] as Array<{ rule_id: string }>;
      assert.ok(
        violations.some((v) => v.rule_id === 'SUITE-SIZE-001'),
        'Expected SUITE-SIZE-001 from counted cases'
      );
    });
  });

  describe('xml_content alias — xml field accepted', () => {
    it('accepts xml field as alias for xml_content and validates correctly', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'AliasSuite',
        test_cases: [TC_LOGIN_ALIAS, TC_LOGOUT_ALIAS],
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.ok((body['quality_score'] as number) >= 0);
      // Should have no empty-suite violation since TCs are present
      const violations = body['violations'] as Array<{ rule_id: string }>;
      assert.ok(
        !violations.some((v) => v.rule_id === 'SUITE-EMPTY-001'),
        'xml alias should be accepted as valid content'
      );
    });
  });

  describe('child suites', () => {
    it('validates nested child suites and includes them in test_suites', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'ParentSuite',
        child_suites: [
          { name: 'ChildA', test_cases: [TC_LOGIN] },
          { name: 'ChildB', test_cases: [TC_LOGOUT] },
        ],
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      const suites = body['test_suites'] as unknown[];
      assert.equal(suites.length, 2);
    });

    it('quality_score reflects violations in child suites', () => {
      // Parent with a child that is empty → SUITE-EMPTY-001 in child
      const resultWithEmpty = server.call('provar_testsuite_validate', {
        suite_name: 'ParentSuite',
        child_suites: [{ name: 'EmptyChild', test_cases: [] }],
      });
      const resultHealthy = server.call('provar_testsuite_validate', {
        suite_name: 'ParentSuite',
        child_suites: [{ name: 'HealthyChild', test_cases: [TC_LOGIN] }],
      });

      const emptyScore = parseText(resultWithEmpty)['quality_score'] as number;
      const healthyScore = parseText(resultHealthy)['quality_score'] as number;
      assert.ok(
        emptyScore <= healthyScore,
        `Empty-child score (${emptyScore}) should be <= healthy score (${healthyScore})`
      );
    });
  });

  describe('quality_threshold', () => {
    it('uses default threshold of 90 (PDX-509) when not specified', () => {
      // Just verify no error and score is present
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'ThresholdDefault',
        test_cases: [TC_LOGIN],
      });
      assert.equal(isError(result), false);
      assert.ok('quality_score' in parseText(result));
    });

    it('accepts a custom quality_threshold', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'ThresholdCustom',
        test_cases: [TC_LOGIN],
        quality_threshold: 90,
      });
      assert.equal(isError(result), false);
    });

    it('PDX-509: a loadable but sub-threshold case is "needs_improvement", not "invalid"', () => {
      // A {Var} stored as a plain string is a major (VAR-STRING-LITERAL-001): the case
      // still loads (is_valid true) but scores below 100.
      const TC_MAJOR = {
        name: 'Major.testcase',
        xml_content: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          `<testCase id="1" guid="${G.tc1}" registryId="m1" name="m1">`,
          '  <steps>',
          `    <apiCall guid="${G.s1}" apiId="com.provar.plugins.forcedotcom.core.testapis.ApexCreateObject" name="Create" testItemId="1">`,
          '      <arguments>',
          '        <argument id="Name"><value class="value" valueClass="string">{AccountId}</value></argument>',
          '      </arguments>',
          '    </apiCall>',
          '  </steps>',
          '</testCase>',
        ].join('\n'),
      };
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'NeedsImprovement',
        test_cases: [TC_MAJOR],
        quality_threshold: 100,
      });
      const body = parseText(result);
      const cases = body['test_cases'] as Array<Record<string, unknown>>;
      assert.equal(cases[0]['is_valid'], true, 'a major violation still loads');
      assert.equal(cases[0]['status'], 'needs_improvement');
      const summary = body['summary'] as Record<string, unknown>;
      assert.equal(summary['test_cases_needs_improvement'], 1);
      assert.equal(summary['test_cases_invalid'], 0, 'sub-threshold is no longer collapsed to invalid');
    });
  });

  describe('PDX-470 — detail level', () => {
    it('standard response includes violations, test_cases, and run_id', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'DetailSuite',
        test_cases: [TC_LOGIN],
        detail: 'standard',
      });
      const body = parseText(result);
      assert.ok('violations' in body, 'standard should include violations');
      assert.ok('test_cases' in body, 'standard should include test_cases');
      assert.ok('run_id' in body, 'standard should include run_id');
    });

    it('summary response includes only key metrics', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'SummarySuite',
        test_cases: [TC_LOGIN],
        detail: 'summary',
      });
      const body = parseText(result);
      assert.ok('quality_score' in body, 'summary should include quality_score');
      assert.ok('completeness_score' in body, 'summary should include completeness_score');
      assert.ok('recommended_next_action' in body, 'summary should include recommended_next_action');
      assert.ok(!('violations' in body), 'summary should NOT include violations');
      assert.ok(!('test_cases' in body), 'summary should NOT include test_cases');
    });

    it('full response includes all fields', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'FullSuite',
        test_cases: [TC_LOGIN],
        detail: 'full',
      });
      const body = parseText(result);
      assert.ok('violations' in body, 'full should include violations');
      assert.ok('test_cases' in body, 'full should include test_cases');
    });
  });

  describe('PDX-473 — completeness_score and recommended_next_action', () => {
    // Valid XML: id="1" passes TC_010, proper UUID passes TC_011/012
    const TC_VALID = { name: 'Valid.testcase', xml_content: makeXml(G.tc1, G.s1, '1') };

    it('completeness_score is present in response', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'CompleteSuite',
        test_cases: [TC_LOGIN],
      });
      const body = parseText(result);
      assert.ok(typeof body['completeness_score'] === 'number', 'completeness_score should be a number');
    });

    it('completeness_score is 0 when suite has no test cases', () => {
      const result = server.call('provar_testsuite_validate', { suite_name: 'EmptySuite' });
      const body = parseText(result);
      assert.equal(body['completeness_score'], 0);
    });

    it('completeness_score is 100 when all test cases are valid', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'AllValidSuite',
        test_cases: [TC_VALID],
      });
      const body = parseText(result);
      assert.equal(body['completeness_score'], 100);
    });

    it('recommended_next_action is a string in the response', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'ActionSuite',
        test_cases: [TC_LOGIN],
      });
      const body = parseText(result);
      const action = body['recommended_next_action'];
      assert.ok(typeof action === 'string', 'recommended_next_action should be a string');
      assert.ok(['stop', 'inspect_failures', 'fix_and_revalidate'].includes(action), `Unexpected action: ${action}`);
    });

    it('recommended_next_action is NOT "stop" when test cases have BP violations (B2)', () => {
      // TC_VALID is structurally valid (issues.length=0) but has BP violations
      // (e.g. STRUCT-SUMMARY-001 — no <summary> tag). collectAllViolations must
      // include tc.best_practices_violations so the stop-decision safety hedge
      // sees the remaining work; otherwise stop fires while BP issues remain.
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'StopSuite',
        test_cases: [TC_VALID],
      });
      const body = parseText(result);
      assert.equal(body['completeness_score'], 100);
      assert.notEqual(
        body['recommended_next_action'],
        'stop',
        `Expected NOT stop while BP violations remain, got: ${String(body['recommended_next_action'])}`
      );
    });
  });

  describe('PDX-471 — baseline_run_id diff mode', () => {
    it('run_id is present in every standard response', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'RunIdSuite',
        test_cases: [TC_LOGIN],
      });
      const body = parseText(result);
      assert.ok(typeof body['run_id'] === 'string' && body['run_id'].length > 0);
    });

    it('returns BASELINE_NOT_FOUND for an unknown baseline_run_id', () => {
      const result = server.call('provar_testsuite_validate', {
        suite_name: 'DiffSuite',
        test_cases: [TC_LOGIN],
        baseline_run_id: 'nonexistent-run-id-xyz',
      });
      assert.equal(isError(result), true);
      const body = parseText(result);
      assert.equal(body['error_code'], 'BASELINE_NOT_FOUND');
    });

    it('diff mode returns added/resolved/unchanged_count when baseline exists', () => {
      // First call to establish baseline
      const first = server.call('provar_testsuite_validate', {
        suite_name: 'BaselineSuite',
        test_cases: [TC_LOGIN],
      });
      const firstBody = parseText(first);
      const runId = firstBody['run_id'] as string;

      // Second call with baseline_run_id should return diff
      const second = server.call('provar_testsuite_validate', {
        suite_name: 'BaselineSuite',
        test_cases: [TC_LOGIN],
        baseline_run_id: runId,
      });
      assert.equal(isError(second), false);
      const diffBody = parseText(second);
      assert.ok('added' in diffBody, 'diff should have added');
      assert.ok('resolved' in diffBody, 'diff should have resolved');
      assert.ok('unchanged_count' in diffBody, 'diff should have unchanged_count');
      assert.ok('run_id' in diffBody, 'diff should have run_id');
    });
  });
});
