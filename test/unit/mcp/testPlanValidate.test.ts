/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { strict as assert } from 'node:assert';
import { describe, it, beforeEach } from 'mocha';
import { registerTestPlanValidate } from '../../../src/mcp/tools/testPlanValidate.js';

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

function hasViolation(result: unknown, ruleId: string): boolean {
  const violations = (parseText(result)['violations'] as Array<{ rule_id: string }>);
  return violations.some((v) => v.rule_id === ruleId);
}

// ── XML / suite fixtures ───────────────────────────────────────────────────────

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

// A suite with one test case (avoids SUITE-EMPTY-001 inside plan tests)
const SUITE_A = { name: 'AccountSuite', test_cases: [TC_LOGIN] };
const SUITE_B = { name: 'ContactSuite', test_cases: [TC_LOGOUT] };

/** Full metadata that passes all PLAN-META-* checks */
function fullMeta(): Record<string, unknown> {
  return {
    objectives: 'Verify all account flows',
    in_scope: 'Account, Contact, Opportunity',
    testing_methodology: 'risk-based regression',
    acceptance_criteria: '95% pass rate',
    acceptable_pass_rate: 95,
    environments: ['QA', 'Staging'],
    test_data_strategy: 'Seed via Apex before each run',
    risks: 'Data setup failures',
  };
}

// ── Test setup ─────────────────────────────────────────────────────────────────

let server: MockMcpServer;

beforeEach(() => {
  server = new MockMcpServer();
  registerTestPlanValidate(server as never);
});

// ── provar.testplan.validate ──────────────────────────────────────────────────

describe('provar.testplan.validate', () => {
  describe('happy path', () => {
    it('returns a result (not an error) for a valid non-empty plan', () => {
      const result = server.call('provar.testplan.validate', {
        plan_name: 'MyPlan',
        test_suites: [SUITE_A, SUITE_B],
        metadata: fullMeta(),
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.ok('quality_score' in body);
      assert.ok('violations' in body);
    });

    it('quality_score is between 0 and 100', () => {
      const result = server.call('provar.testplan.validate', {
        plan_name: 'MyPlan',
        test_suites: [SUITE_A],
        metadata: fullMeta(),
      });

      const score = parseText(result)['quality_score'] as number;
      assert.ok(score >= 0 && score <= 100, `Expected 0-100, got ${score}`);
    });

    it('returns requestId in the response', () => {
      const result = server.call('provar.testplan.validate', {
        plan_name: 'MyPlan',
        test_suites: [SUITE_A],
      });

      const body = parseText(result);
      assert.ok(typeof body['requestId'] === 'string' && body['requestId'].length > 0);
    });

    it('includes a summary with total_test_cases and total_violations', () => {
      const result = server.call('provar.testplan.validate', {
        plan_name: 'MyPlan',
        test_suites: [SUITE_A, SUITE_B],
        metadata: fullMeta(),
      });

      const summary = parseText(result)['summary'] as Record<string, unknown>;
      assert.ok(typeof summary['total_test_cases'] === 'number');
      assert.ok(typeof summary['total_violations'] === 'number');
    });
  });

  describe('PLAN-EMPTY-001 — empty plan', () => {
    it('triggers PLAN-EMPTY-001 when plan has no suites and no test_cases', () => {
      const result = server.call('provar.testplan.validate', { plan_name: 'EmptyPlan' });

      assert.equal(isError(result), false);
      assert.ok(hasViolation(result, 'PLAN-EMPTY-001'), 'Expected PLAN-EMPTY-001');
    });

    it('triggers PLAN-EMPTY-001 when test_suites is an empty array', () => {
      const result = server.call('provar.testplan.validate', {
        plan_name: 'EmptyPlan',
        test_suites: [],
      });

      assert.ok(hasViolation(result, 'PLAN-EMPTY-001'), 'Expected PLAN-EMPTY-001');
    });

    it('does NOT trigger PLAN-EMPTY-001 when plan has suites', () => {
      const result = server.call('provar.testplan.validate', {
        plan_name: 'NonEmptyPlan',
        test_suites: [SUITE_A],
      });

      assert.ok(!hasViolation(result, 'PLAN-EMPTY-001'), 'Did not expect PLAN-EMPTY-001');
    });
  });

  describe('PLAN-DUP-001 — duplicate suite names', () => {
    it('triggers PLAN-DUP-001 when two suites share the same name', () => {
      const result = server.call('provar.testplan.validate', {
        plan_name: 'DupPlan',
        test_suites: [
          { name: 'AccountSuite', test_cases: [TC_LOGIN] },
          { name: 'AccountSuite', test_cases: [TC_LOGOUT] },
        ],
      });

      assert.ok(hasViolation(result, 'PLAN-DUP-001'), 'Expected PLAN-DUP-001');
    });

    it('does NOT trigger PLAN-DUP-001 for distinct suite names', () => {
      const result = server.call('provar.testplan.validate', {
        plan_name: 'GoodPlan',
        test_suites: [SUITE_A, SUITE_B],
      });

      assert.ok(!hasViolation(result, 'PLAN-DUP-001'), 'Did not expect PLAN-DUP-001');
    });
  });

  describe('PLAN-SIZE-001 — oversized plan (>20 suites)', () => {
    it('triggers PLAN-SIZE-001 when test_suite_count exceeds 20', () => {
      const result = server.call('provar.testplan.validate', {
        plan_name: 'HugePlan',
        test_suites: [SUITE_A],
        test_suite_count: 21,
      });

      assert.ok(hasViolation(result, 'PLAN-SIZE-001'), 'Expected PLAN-SIZE-001');
    });

    it('does NOT trigger PLAN-SIZE-001 when test_suite_count is exactly 20', () => {
      const result = server.call('provar.testplan.validate', {
        plan_name: 'BoundaryPlan',
        test_suites: [SUITE_A],
        test_suite_count: 20,
      });

      assert.ok(!hasViolation(result, 'PLAN-SIZE-001'), 'Did not expect PLAN-SIZE-001 at exactly 20');
    });

    it('triggers PLAN-SIZE-001 by counting test_suites when no explicit count provided', () => {
      const suites = Array.from({ length: 21 }, (_, i) => ({
        name: `Suite${i}`,
        test_cases: [TC_LOGIN],
      }));

      const result = server.call('provar.testplan.validate', {
        plan_name: 'HugePlan',
        test_suites: suites,
      });

      assert.ok(hasViolation(result, 'PLAN-SIZE-001'), 'Expected PLAN-SIZE-001 from counted suites');
    });
  });

  describe('PLAN-META-* — plan completeness violations', () => {
    it('triggers PLAN-META-001 when objectives is missing', () => {
      const meta = fullMeta();
      delete meta['objectives'];

      const result = server.call('provar.testplan.validate', {
        plan_name: 'MetaPlan',
        test_suites: [SUITE_A],
        metadata: meta,
      });

      assert.ok(hasViolation(result, 'PLAN-META-001'), 'Expected PLAN-META-001 (missing objectives)');
    });

    it('triggers PLAN-META-002 when in_scope is missing', () => {
      const meta = fullMeta();
      delete meta['in_scope'];

      const result = server.call('provar.testplan.validate', {
        plan_name: 'MetaPlan',
        test_suites: [SUITE_A],
        metadata: meta,
      });

      assert.ok(hasViolation(result, 'PLAN-META-002'), 'Expected PLAN-META-002 (missing in_scope)');
    });

    it('triggers PLAN-META-005 when environments is missing', () => {
      const meta = fullMeta();
      delete meta['environments'];

      const result = server.call('provar.testplan.validate', {
        plan_name: 'MetaPlan',
        test_suites: [SUITE_A],
        metadata: meta,
      });

      assert.ok(hasViolation(result, 'PLAN-META-005'), 'Expected PLAN-META-005 (missing environments)');
    });

    it('does NOT trigger any PLAN-META-* when all metadata fields are provided', () => {
      const result = server.call('provar.testplan.validate', {
        plan_name: 'FullPlan',
        test_suites: [SUITE_A],
        metadata: fullMeta(),
      });

      const violations = parseText(result)['violations'] as Array<{ rule_id: string }>;
      const metaViolations = violations.filter((v) => v.rule_id.startsWith('PLAN-META-'));
      assert.equal(metaViolations.length, 0, `Unexpected PLAN-META violations: ${metaViolations.map((v) => v.rule_id).join(', ')}`);
    });

    it('triggers all PLAN-META-* violations when no metadata is provided', () => {
      const result = server.call('provar.testplan.validate', {
        plan_name: 'NoMetaPlan',
        test_suites: [SUITE_A],
      });

      const violations = parseText(result)['violations'] as Array<{ rule_id: string }>;
      const metaRuleIds = violations.filter((v) => v.rule_id.startsWith('PLAN-META-')).map((v) => v.rule_id);
      // At least objectives, in_scope, testing_methodology, acceptance_criteria, environments,
      // test_data_strategy, risks — 7 rules
      assert.ok(metaRuleIds.length >= 7, `Expected >=7 PLAN-META violations, got ${metaRuleIds.length}: ${metaRuleIds.join(', ')}`);
    });
  });

  describe('xml_content alias — xml field accepted', () => {
    it('accepts xml field as alias for xml_content in test cases', () => {
      const result = server.call('provar.testplan.validate', {
        plan_name: 'AliasPlan',
        test_suites: [{
          name: 'AccountSuite',
          test_cases: [
            { name: 'LoginTest.testcase', xml: makeXml(G.tc1, G.s1, 'tc-001') },
          ],
        }],
      });

      assert.equal(isError(result), false);
      assert.ok(!hasViolation(result, 'SUITE-EMPTY-001'), 'xml alias should count as content');
    });
  });

  describe('quality_threshold', () => {
    it('uses default threshold of 80 when not provided', () => {
      const result = server.call('provar.testplan.validate', {
        plan_name: 'ThresholdPlan',
        test_suites: [SUITE_A],
      });
      assert.equal(isError(result), false);
      assert.ok('quality_score' in parseText(result));
    });

    it('accepts a custom quality_threshold', () => {
      const result = server.call('provar.testplan.validate', {
        plan_name: 'ThresholdPlan',
        test_suites: [SUITE_A],
        quality_threshold: 95,
      });
      assert.equal(isError(result), false);
    });
  });
});
