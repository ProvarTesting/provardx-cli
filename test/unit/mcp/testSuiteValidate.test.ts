/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { strict as assert } from 'node:assert';
import { describe, it, beforeEach } from 'mocha';
import { registerTestSuiteValidate } from '../../../src/mcp/tools/testSuiteValidate.js';

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

// ── XML fixtures ──────────────────────────────────────────────────────────────

const G = {
  tc1: '550e8400-e29b-41d4-a716-446655440001',
  tc2: '550e8400-e29b-41d4-a716-446655440002',
  s1:  '550e8400-e29b-41d4-a716-446655440011',
  s2:  '550e8400-e29b-41d4-a716-446655440012',
};

function makeXml(tcGuid: string, stepGuid: string, id: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testCase id="${id}" guid="${tcGuid}" registryId="${id}" name="${id}">`,
    '  <steps>',
    `    <apiCall guid="${stepGuid}" apiId="UiConnect" name="Connect" testItemId="1"/>`,
    '  </steps>',
    '</testCase>',
  ].join('\n');
}

const TC_LOGIN  = { name: 'LoginTest.testcase',  xml_content: makeXml(G.tc1, G.s1, 'tc-001') };
const TC_LOGOUT = { name: 'LogoutTest.testcase', xml_content: makeXml(G.tc2, G.s2, 'tc-002') };

// Same test cases using the `xml` alias
const TC_LOGIN_ALIAS  = { name: 'LoginTest.testcase',  xml: makeXml(G.tc1, G.s1, 'tc-001') };
const TC_LOGOUT_ALIAS = { name: 'LogoutTest.testcase', xml: makeXml(G.tc2, G.s2, 'tc-002') };

// ── Test setup ─────────────────────────────────────────────────────────────────

let server: MockMcpServer;

beforeEach(() => {
  server = new MockMcpServer();
  registerTestSuiteValidate(server as never);
});

// ── provar.testsuite.validate ─────────────────────────────────────────────────

describe('provar.testsuite.validate', () => {
  describe('happy path', () => {
    it('returns a result (not an error) for a valid non-empty suite', () => {
      const result = server.call('provar.testsuite.validate', {
        suite_name: 'AccountSuite',
        test_cases: [TC_LOGIN, TC_LOGOUT],
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.ok('quality_score' in body, 'quality_score should be present');
      assert.ok('violations' in body, 'violations should be present');
    });

    it('quality_score is between 0 and 100', () => {
      const result = server.call('provar.testsuite.validate', {
        suite_name: 'AccountSuite',
        test_cases: [TC_LOGIN, TC_LOGOUT],
      });

      const body = parseText(result);
      const score = body['quality_score'] as number;
      assert.ok(score >= 0 && score <= 100, `Expected 0-100, got ${score}`);
    });

    it('returns requestId in the response', () => {
      const result = server.call('provar.testsuite.validate', {
        suite_name: 'MySuite',
        test_cases: [TC_LOGIN],
      });

      const body = parseText(result);
      assert.ok(typeof body['requestId'] === 'string' && body['requestId'].length > 0);
    });

    it('includes a summary object with totals', () => {
      const result = server.call('provar.testsuite.validate', {
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
      const result = server.call('provar.testsuite.validate', {
        suite_name: 'EmptySuite',
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      const violations = body['violations'] as Array<{ rule_id: string }>;
      assert.ok(violations.some((v) => v.rule_id === 'SUITE-EMPTY-001'), 'Expected SUITE-EMPTY-001');
    });

    it('triggers SUITE-EMPTY-001 when test_cases is an empty array', () => {
      const result = server.call('provar.testsuite.validate', {
        suite_name: 'EmptySuite',
        test_cases: [],
      });

      const violations = (parseText(result)['violations'] as Array<{ rule_id: string }>);
      assert.ok(violations.some((v) => v.rule_id === 'SUITE-EMPTY-001'), 'Expected SUITE-EMPTY-001');
    });

    it('does NOT trigger SUITE-EMPTY-001 when suite has test_cases', () => {
      const result = server.call('provar.testsuite.validate', {
        suite_name: 'NonEmptySuite',
        test_cases: [TC_LOGIN],
      });

      const violations = (parseText(result)['violations'] as Array<{ rule_id: string }>);
      assert.ok(!violations.some((v) => v.rule_id === 'SUITE-EMPTY-001'), 'Did not expect SUITE-EMPTY-001');
    });

    it('does NOT trigger SUITE-EMPTY-001 when suite has child_suites', () => {
      const result = server.call('provar.testsuite.validate', {
        suite_name: 'ParentSuite',
        child_suites: [{ name: 'ChildSuite', test_cases: [TC_LOGIN] }],
      });

      const violations = (parseText(result)['violations'] as Array<{ rule_id: string }>);
      assert.ok(!violations.some((v) => v.rule_id === 'SUITE-EMPTY-001'), 'Did not expect SUITE-EMPTY-001');
    });
  });

  describe('SUITE-DUP-001 — duplicate test case names', () => {
    it('triggers SUITE-DUP-001 when two test cases share the same name', () => {
      const result = server.call('provar.testsuite.validate', {
        suite_name: 'DupSuite',
        test_cases: [TC_LOGIN, { name: 'LoginTest.testcase', xml_content: makeXml(G.tc2, G.s2, 'tc-dup') }],
      });

      const violations = (parseText(result)['violations'] as Array<{ rule_id: string }>);
      assert.ok(violations.some((v) => v.rule_id === 'SUITE-DUP-001'), 'Expected SUITE-DUP-001');
    });

    it('does NOT trigger SUITE-DUP-001 for distinct test case names', () => {
      const result = server.call('provar.testsuite.validate', {
        suite_name: 'UniqSuite',
        test_cases: [TC_LOGIN, TC_LOGOUT],
      });

      const violations = (parseText(result)['violations'] as Array<{ rule_id: string }>);
      assert.ok(!violations.some((v) => v.rule_id === 'SUITE-DUP-001'), 'Did not expect SUITE-DUP-001');
    });
  });

  describe('SUITE-DUP-002 — duplicate child suite names', () => {
    it('triggers SUITE-DUP-002 when two child suites share the same name', () => {
      const result = server.call('provar.testsuite.validate', {
        suite_name: 'ParentSuite',
        child_suites: [
          { name: 'ChildA', test_cases: [TC_LOGIN] },
          { name: 'ChildA', test_cases: [TC_LOGOUT] },
        ],
      });

      const violations = (parseText(result)['violations'] as Array<{ rule_id: string }>);
      assert.ok(violations.some((v) => v.rule_id === 'SUITE-DUP-002'), 'Expected SUITE-DUP-002');
    });
  });

  describe('SUITE-SIZE-001 — oversized suite (>75 test cases)', () => {
    it('triggers SUITE-SIZE-001 when test_case_count exceeds 75', () => {
      const result = server.call('provar.testsuite.validate', {
        suite_name: 'HugeSuite',
        test_cases: [TC_LOGIN],
        test_case_count: 76,
      });

      const violations = (parseText(result)['violations'] as Array<{ rule_id: string }>);
      assert.ok(violations.some((v) => v.rule_id === 'SUITE-SIZE-001'), 'Expected SUITE-SIZE-001');
    });

    it('does NOT trigger SUITE-SIZE-001 when test_case_count is exactly 75', () => {
      const result = server.call('provar.testsuite.validate', {
        suite_name: 'BoundarySuite',
        test_cases: [TC_LOGIN],
        test_case_count: 75,
      });

      const violations = (parseText(result)['violations'] as Array<{ rule_id: string }>);
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

      const result = server.call('provar.testsuite.validate', {
        suite_name: 'HugeSuite',
        test_cases: cases,
      });

      const violations = (parseText(result)['violations'] as Array<{ rule_id: string }>);
      assert.ok(violations.some((v) => v.rule_id === 'SUITE-SIZE-001'), 'Expected SUITE-SIZE-001 from counted cases');
    });
  });

  describe('xml_content alias — xml field accepted', () => {
    it('accepts xml field as alias for xml_content and validates correctly', () => {
      const result = server.call('provar.testsuite.validate', {
        suite_name: 'AliasSuite',
        test_cases: [TC_LOGIN_ALIAS, TC_LOGOUT_ALIAS],
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.ok((body['quality_score'] as number) >= 0);
      // Should have no empty-suite violation since TCs are present
      const violations = body['violations'] as Array<{ rule_id: string }>;
      assert.ok(!violations.some((v) => v.rule_id === 'SUITE-EMPTY-001'), 'xml alias should be accepted as valid content');
    });
  });

  describe('child suites', () => {
    it('validates nested child suites and includes them in test_suites', () => {
      const result = server.call('provar.testsuite.validate', {
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
      const resultWithEmpty = server.call('provar.testsuite.validate', {
        suite_name: 'ParentSuite',
        child_suites: [{ name: 'EmptyChild', test_cases: [] }],
      });
      const resultHealthy = server.call('provar.testsuite.validate', {
        suite_name: 'ParentSuite',
        child_suites: [{ name: 'HealthyChild', test_cases: [TC_LOGIN] }],
      });

      const emptyScore   = (parseText(resultWithEmpty)  ['quality_score'] as number);
      const healthyScore = (parseText(resultHealthy)['quality_score'] as number);
      assert.ok(emptyScore <= healthyScore, `Empty-child score (${emptyScore}) should be <= healthy score (${healthyScore})`);
    });
  });

  describe('quality_threshold', () => {
    it('uses default threshold of 80 when not specified', () => {
      // Just verify no error and score is present
      const result = server.call('provar.testsuite.validate', {
        suite_name: 'ThresholdDefault',
        test_cases: [TC_LOGIN],
      });
      assert.equal(isError(result), false);
      assert.ok('quality_score' in parseText(result));
    });

    it('accepts a custom quality_threshold', () => {
      const result = server.call('provar.testsuite.validate', {
        suite_name: 'ThresholdCustom',
        test_cases: [TC_LOGIN],
        quality_threshold: 90,
      });
      assert.equal(isError(result), false);
    });
  });
});
