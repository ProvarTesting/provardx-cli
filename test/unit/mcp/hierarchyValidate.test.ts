/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import {
  validateSuite,
  validatePlan,
  validateProject,
  buildHierarchySummary,
  detectNamingStyle,
  computeViolationDeduction,
  type TestCaseInput,
  type TestSuiteInput,
  type HierarchyViolation,
} from '../../../src/mcp/tools/hierarchyValidate.js';

// ── Shared valid XML fixtures ─────────────────────────────────────────────────

// All guids below are valid UUID v4 (version nibble = 4, variant nibble ∈ {8,9,a,b})
const G = {
  tc1:  '550e8400-e29b-41d4-a716-446655440001',
  tc2:  '550e8400-e29b-41d4-a716-446655440002',
  tc3:  '550e8400-e29b-41d4-a716-446655440003',
  tc4:  '550e8400-e29b-41d4-a716-446655440004',
  s1:   '550e8400-e29b-41d4-a716-446655440011',
  s2:   '550e8400-e29b-41d4-a716-446655440012',
  s3:   '550e8400-e29b-41d4-a716-446655440013',
};

function makeXml(tcGuid: string, stepGuid: string, id: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<testCase id="${id}" guid="${tcGuid}" registryId="${id}" name="${id}">\n` +
    '  <steps>\n' +
    `    <apiCall guid="${stepGuid}" apiId="UiConnect" name="Connect" testItemId="1"/>\n` +
    '  </steps>\n' +
    '</testCase>'
  );
}

const TC_LOGIN:  TestCaseInput = { name: 'LoginTest.testcase',  xml: makeXml(G.tc1, G.s1, 'tc-001') };
const TC_LOGOUT: TestCaseInput = { name: 'LogoutTest.testcase', xml: makeXml(G.tc2, G.s2, 'tc-002') };
const TC_SIGNUP: TestCaseInput = { name: 'SignupTest.testcase', xml: makeXml(G.tc3, G.s3, 'tc-003') };

// ── detectNamingStyle ─────────────────────────────────────────────────────────

describe('detectNamingStyle', () => {
  it('detects PascalCase', () => assert.equal(detectNamingStyle('LoginTest'), 'PascalCase'));
  it('detects camelCase', () => assert.equal(detectNamingStyle('loginTest'), 'camelCase'));
  it('detects snake_case', () => assert.equal(detectNamingStyle('login_test'), 'snake_case'));
  it('detects kebab-case', () => assert.equal(detectNamingStyle('login-test'), 'kebab-case'));
  it('detects space separated', () => assert.equal(detectNamingStyle('Login Test'), 'space separated'));
  it('strips extension before detecting', () => assert.equal(detectNamingStyle('LoginTest.testcase'), 'PascalCase'));
  it('returns unknown for single word lowercase', () => assert.equal(detectNamingStyle('login'), 'unknown'));
});

// ── computeViolationDeduction ─────────────────────────────────────────────────

describe('computeViolationDeduction', () => {
  it('returns 0 for empty array', () => {
    assert.equal(computeViolationDeduction([]), 0);
  });

  it('deducts critical * 1.0 * weight', () => {
    const v: HierarchyViolation = {
      rule_id: 'TEST-001', name: 'T', description: '', category: 'c',
      severity: 'critical', weight: 10, message: '', recommendation: '', applies_to: [],
    };
    assert.equal(computeViolationDeduction([v]), 10);
  });

  it('deducts major * 0.75 * weight', () => {
    const v: HierarchyViolation = {
      rule_id: 'TEST-002', name: 'T', description: '', category: 'c',
      severity: 'major', weight: 4, message: '', recommendation: '', applies_to: [],
    };
    assert.equal(computeViolationDeduction([v]), 3);
  });

  it('accumulates multiple violations', () => {
    const vCrit: HierarchyViolation = {
      rule_id: 'A', name: '', description: '', category: '',
      severity: 'critical', weight: 5, message: '', recommendation: '', applies_to: [],
    };
    const vInfo: HierarchyViolation = {
      rule_id: 'B', name: '', description: '', category: '',
      severity: 'info', weight: 4, message: '', recommendation: '', applies_to: [],
    };
    // 5*1.0 + 4*0.25 = 5 + 1 = 6
    assert.equal(computeViolationDeduction([vCrit, vInfo]), 6);
  });
});

// ── validateSuite ─────────────────────────────────────────────────────────────

describe('validateSuite', () => {
  describe('valid suite', () => {
    it('returns no violations for a well-formed suite', () => {
      const r = validateSuite(
        { name: 'AuthSuite', test_cases: [TC_LOGIN, TC_LOGOUT] },
        80
      );
      assert.equal(r.level, 'suite');
      assert.equal(r.name, 'AuthSuite');
      assert.equal(r.violations.length, 0);
      assert.equal(r.test_cases.length, 2);
    });
  });

  describe('SUITE-EMPTY-001: empty suite', () => {
    it('flags a suite with no test cases and no child suites', () => {
      const r = validateSuite({ name: 'EmptySuite' }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'SUITE-EMPTY-001'), 'Expected SUITE-EMPTY-001');
      assert.equal(r.quality_score, 0);
    });
  });

  describe('SUITE-DUP-001: duplicate test case names', () => {
    it('flags two test cases with the same base name', () => {
      const dup: TestCaseInput = { name: 'LoginTest.testcase', xml: makeXml(G.tc4, G.s3, 'tc-004') };
      const r = validateSuite({ name: 'MySuite', test_cases: [TC_LOGIN, dup] }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'SUITE-DUP-001'), 'Expected SUITE-DUP-001');
    });
  });

  describe('SUITE-DUP-002: duplicate child suite names', () => {
    it('flags two child suites with the same name', () => {
      const child: TestSuiteInput = { name: 'ChildSuite', test_cases: [TC_LOGIN] };
      const dupe: TestSuiteInput = { name: 'childsuite', test_cases: [TC_LOGOUT] };
      const r = validateSuite({ name: 'Parent', test_suites: [child, dupe] }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'SUITE-DUP-002'), 'Expected SUITE-DUP-002');
    });
  });

  describe('SUITE-SIZE-001: oversized suite', () => {
    it('flags test_case_count > 75', () => {
      const r = validateSuite(
        { name: 'BigSuite', test_cases: [TC_LOGIN], test_case_count: 76 },
        80
      );
      assert.ok(r.violations.some((v) => v.rule_id === 'SUITE-SIZE-001'), 'Expected SUITE-SIZE-001');
    });

    it('does not flag exactly 75 test cases', () => {
      const r = validateSuite(
        { name: 'MediumSuite', test_cases: [TC_LOGIN], test_case_count: 75 },
        80
      );
      assert.ok(!r.violations.some((v) => v.rule_id === 'SUITE-SIZE-001'), 'Did not expect SUITE-SIZE-001');
    });
  });

  describe('SUITE-NAMING-002: inconsistent test case naming', () => {
    it('flags mixed naming conventions among test cases', () => {
      // PascalCase vs snake_case
      const tc_snake: TestCaseInput = { name: 'login_test.testcase', xml: makeXml(G.tc4, G.s3, 'tc-004') };
      const r = validateSuite({ name: 'MySuite', test_cases: [TC_LOGIN, tc_snake] }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'SUITE-NAMING-002'), 'Expected SUITE-NAMING-002');
    });
  });

  describe('SUITE-NAMING-001: inconsistent child suite naming', () => {
    it('flags mixed naming conventions among child suites', () => {
      const pascal: TestSuiteInput = { name: 'LoginSuite',  test_cases: [TC_LOGIN] };
      const snake:  TestSuiteInput = { name: 'logout_suite', test_cases: [TC_LOGOUT] };
      const r = validateSuite({ name: 'Parent', test_suites: [pascal, snake] }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'SUITE-NAMING-001'), 'Expected SUITE-NAMING-001');
    });
  });

  describe('recursive validation', () => {
    it('validates child suites recursively', () => {
      const emptyChild: TestSuiteInput = { name: 'EmptyChild' };
      const r = validateSuite({ name: 'Parent', test_suites: [emptyChild] }, 80);
      assert.equal(r.test_suites.length, 1);
      assert.ok(r.test_suites[0].violations.some((v) => v.rule_id === 'SUITE-EMPTY-001'));
    });

    it('accepts xml alias for test case content', () => {
      const tcXmlAlias: TestCaseInput = { name: 'AliasTest.testcase', xml: makeXml(G.tc1, G.s1, 'tc-alias') };
      const r = validateSuite({ name: 'AliasSuite', test_cases: [tcXmlAlias] }, 80);
      assert.equal(r.test_cases.length, 1);
      assert.equal(r.test_cases[0].name, 'AliasTest.testcase');
    });
  });
});

// ── validatePlan ──────────────────────────────────────────────────────────────

describe('validatePlan', () => {
  const FULL_META = {
    objectives:           'Validate all account lifecycle operations',
    in_scope:             'Account creation, update, and deletion flows',
    testing_methodology:  'Risk-based regression testing',
    acceptance_criteria:  'All P1 and P2 cases pass',
    acceptable_pass_rate: 95,
    environments:         ['QA', 'UAT'],
    test_data_strategy:   'Seed data refreshed before each run',
    risks:                'Data migration may cause intermittent failures',
  };

  describe('valid plan', () => {
    it('returns no structural violations when fully populated', () => {
      const r = validatePlan(
        {
          name: 'Account Plan',
          test_suites: [{ name: 'AuthSuite', test_cases: [TC_LOGIN] }],
          metadata: FULL_META,
        },
        80
      );
      assert.equal(r.level, 'plan');
      const structViolations = r.violations.filter((v) => !v.rule_id.startsWith('PLAN-META'));
      assert.equal(structViolations.length, 0);
    });
  });

  describe('PLAN-EMPTY-001: empty plan', () => {
    it('flags a plan with no suites and no test cases', () => {
      const r = validatePlan({ name: 'EmptyPlan' }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'PLAN-EMPTY-001'), 'Expected PLAN-EMPTY-001');
    });
  });

  describe('PLAN-DUP-001: duplicate suite names in plan', () => {
    it('flags two suites sharing the same name (case-insensitive)', () => {
      const r = validatePlan({
        name: 'MyPlan',
        test_suites: [
          { name: 'AuthSuite', test_cases: [TC_LOGIN] },
          { name: 'authsuite', test_cases: [TC_LOGOUT] },
        ],
        metadata: FULL_META,
      }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'PLAN-DUP-001'), 'Expected PLAN-DUP-001');
    });
  });

  describe('PLAN-SIZE-001: oversized plan', () => {
    it('flags test_suite_count > 20', () => {
      const r = validatePlan({
        name: 'HugePlan',
        test_suites: [{ name: 'S1', test_cases: [TC_LOGIN] }],
        test_suite_count: 21,
        metadata: FULL_META,
      }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'PLAN-SIZE-001'), 'Expected PLAN-SIZE-001');
    });

    it('does not flag exactly 20 suites', () => {
      const r = validatePlan({
        name: 'FullPlan',
        test_suites: [{ name: 'S1', test_cases: [TC_LOGIN] }],
        test_suite_count: 20,
        metadata: FULL_META,
      }, 80);
      assert.ok(!r.violations.some((v) => v.rule_id === 'PLAN-SIZE-001'));
    });
  });

  describe('PLAN-META-* metadata completeness', () => {
    it('PLAN-META-001: flags missing objectives', () => {
      const r = validatePlan({ name: 'P', test_suites: [{ name: 'S', test_cases: [TC_LOGIN] }], metadata: {} }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'PLAN-META-001'));
    });

    it('PLAN-META-002: flags missing in_scope', () => {
      const r = validatePlan({ name: 'P', test_suites: [{ name: 'S', test_cases: [TC_LOGIN] }], metadata: { objectives: 'x' } }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'PLAN-META-002'));
    });

    it('PLAN-META-003: flags missing testing_methodology', () => {
      const r = validatePlan({ name: 'P', test_suites: [{ name: 'S', test_cases: [TC_LOGIN] }], metadata: { objectives: 'x', in_scope: 'y' } }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'PLAN-META-003'));
    });

    it('PLAN-META-004: flags missing acceptance_criteria when no acceptable_pass_rate', () => {
      const r = validatePlan({
        name: 'P',
        test_suites: [{ name: 'S', test_cases: [TC_LOGIN] }],
        metadata: { objectives: 'x', in_scope: 'y', testing_methodology: 'z' },
      }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'PLAN-META-004'));
    });

    it('PLAN-META-004: acceptable_pass_rate alone satisfies the criterion', () => {
      const r = validatePlan({
        name: 'P',
        test_suites: [{ name: 'S', test_cases: [TC_LOGIN] }],
        metadata: { objectives: 'x', in_scope: 'y', testing_methodology: 'z', acceptable_pass_rate: 90 },
      }, 80);
      assert.ok(!r.violations.some((v) => v.rule_id === 'PLAN-META-004'));
    });

    it('PLAN-META-005: flags missing environments', () => {
      const r = validatePlan({
        name: 'P',
        test_suites: [{ name: 'S', test_cases: [TC_LOGIN] }],
        metadata: { objectives: 'x', in_scope: 'y', testing_methodology: 'z', acceptance_criteria: 'c' },
      }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'PLAN-META-005'));
    });

    it('PLAN-META-006: flags missing test_data_strategy', () => {
      const r = validatePlan({
        name: 'P',
        test_suites: [{ name: 'S', test_cases: [TC_LOGIN] }],
        metadata: { objectives: 'x', in_scope: 'y', testing_methodology: 'z', acceptance_criteria: 'c', environments: ['QA'] },
      }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'PLAN-META-006'));
    });

    it('PLAN-META-007: flags missing risks', () => {
      const r = validatePlan({
        name: 'P',
        test_suites: [{ name: 'S', test_cases: [TC_LOGIN] }],
        metadata: { objectives: 'x', in_scope: 'y', testing_methodology: 'z', acceptance_criteria: 'c', environments: ['QA'], test_data_strategy: 'ts' },
      }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'PLAN-META-007'));
    });
  });

  describe('PLAN-NAMING-001: inconsistent suite naming in plan', () => {
    it('flags mixed naming conventions among suites', () => {
      const r = validatePlan({
        name: 'MyPlan',
        test_suites: [
          { name: 'LoginSuite',   test_cases: [TC_LOGIN] },
          { name: 'logout_suite', test_cases: [TC_LOGOUT] },
        ],
        metadata: FULL_META,
      }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'PLAN-NAMING-001'), 'Expected PLAN-NAMING-001');
    });
  });
});

// ── validateProject ───────────────────────────────────────────────────────────

describe('validateProject', () => {
  const FULL_META = {
    objectives: 'Full regression coverage', in_scope: 'All modules',
    testing_methodology: 'Regression', acceptance_criteria: 'All pass',
    environments: ['QA'], test_data_strategy: 'Seed', risks: 'None',
  };

  describe('PROJ-EMPTY-001: empty project', () => {
    it('flags a project with no plans, suites, or test cases', () => {
      const r = validateProject({ name: 'EmptyProject' }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'PROJ-EMPTY-001'), 'Expected PROJ-EMPTY-001');
    });
  });

  describe('PROJ-DUP-002: duplicate plan names in project', () => {
    it('flags two plans with the same name (case-insensitive)', () => {
      const plan = {
        name: 'Sprint Plan',
        test_suites: [{ name: 'S1', test_cases: [TC_LOGIN] }],
        metadata: FULL_META,
      };
      const r = validateProject({
        name: 'MyProject',
        test_plans: [plan, { ...plan, name: 'sprint plan' }],
        project_context: { secretsPasswordSet: true },
      }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'PROJ-DUP-002'), 'Expected PROJ-DUP-002');
    });
  });

  describe('PROJ-DUP-001: duplicate test case names across project', () => {
    it('flags duplicate test case names across different plans', () => {
      // The registry uses the FULL name as key, so the duplicate must differ in
      // path prefix or casing while resolving to the same base name.
      // e.g. 'LoginTest.testcase' vs 'LOGINTEST.testcase' → both base='logintest'
      const tcDup: TestCaseInput = { name: 'LOGINTEST.testcase', xml: makeXml(G.tc4, G.s3, 'tc-dup') };
      const plan1 = {
        name: 'Plan A',
        test_suites: [{ name: 'S1', test_cases: [TC_LOGIN] }],  // LoginTest.testcase
        metadata: FULL_META,
      };
      const plan2 = {
        name: 'Plan B',
        test_suites: [{ name: 'S2', test_cases: [tcDup] }],     // LOGINTEST.testcase → same base
        metadata: FULL_META,
      };
      const r = validateProject({
        name: 'MyProject',
        test_plans: [plan1, plan2],
        project_context: { secretsPasswordSet: true },
      }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'PROJ-DUP-001'), 'Expected PROJ-DUP-001');
    });
  });

  describe('PROJ-CALLABLE-001/002: caseCall resolution', () => {
    // XML for a test that calls another test via caseCall
    function makeCaseCallXml(calledPath: string, calledId: string): string {
      return (
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        `<testCase id="caller-001" guid="${G.tc1}" registryId="caller-001" name="CallerTest">\n` +
        '  <steps>\n' +
        `    <caseCall testCaseId="${calledId}" testCasePath="${calledPath}" testItemId="10"/>\n` +
        '  </steps>\n' +
        '</testCase>'
      );
    }

    it('does NOT flag caseCall when callee is in the plan registry', () => {
      // CallableTest is plan-registered (has testinstance), so it's in the registry
      const caller: TestCaseInput = {
        name: 'CallerTest.testcase',
        xml: makeCaseCallXml('tests/CallableTest.testcase', 'callable-uuid'),
      };
      const callee: TestCaseInput = { name: 'CallableTest.testcase', xml: makeXml(G.tc2, G.s2, 'callable-001') };
      const r = validateProject({
        name: 'P',
        test_cases: [caller, callee],
        project_context: { secretsPasswordSet: true },
      }, 80);
      assert.ok(!r.violations.some((v) => v.rule_id === 'PROJ-CALLABLE-001'), 'Should not flag PROJ-CALLABLE-001 for known callee');
      assert.ok(!r.violations.some((v) => v.rule_id === 'PROJ-CALLABLE-002'), 'Should not flag PROJ-CALLABLE-002 for known callee');
    });

    it('flags PROJ-CALLABLE-001 when callee is genuinely missing', () => {
      const caller: TestCaseInput = {
        name: 'CallerTest.testcase',
        xml: makeCaseCallXml('tests/Callable/DoesNotExist.testcase', 'missing-uuid'),
      };
      const r = validateProject({
        name: 'P',
        test_cases: [caller],
        project_context: { secretsPasswordSet: true },
      }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'PROJ-CALLABLE-001'), 'Expected PROJ-CALLABLE-001 for genuinely missing callee');
    });

    it('does NOT flag caseCall when callee is known via all_disk_test_case_names (callable test)', () => {
      // Callable tests have no .testinstance so they never enter the plan registry.
      // all_disk_test_case_names bridges this gap.
      const caller: TestCaseInput = {
        name: 'CallerTest.testcase',
        xml: makeCaseCallXml('tests/Callable/CreateQuote.testcase', 'callable-uuid'),
      };
      const r = validateProject({
        name: 'P',
        test_cases: [caller],       // only the caller is in the plan
        project_context: { secretsPasswordSet: true },
        // CreateQuote exists on disk as a callable test (no testinstance)
        all_disk_test_case_names: ['CreateQuote'],
      }, 80);
      assert.ok(!r.violations.some((v) => v.rule_id === 'PROJ-CALLABLE-001'), 'Should not flag callable test present on disk');
      assert.ok(!r.violations.some((v) => v.rule_id === 'PROJ-CALLABLE-002'), 'Should not flag callable test present on disk');
    });

    it('flags PROJ-CALLABLE-001 even with all_disk_test_case_names when callee is absent from disk too', () => {
      const caller: TestCaseInput = {
        name: 'CallerTest.testcase',
        xml: makeCaseCallXml('tests/Callable/Missing.testcase', 'missing-uuid'),
      };
      const r = validateProject({
        name: 'P',
        test_cases: [caller],
        project_context: { secretsPasswordSet: true },
        all_disk_test_case_names: ['CreateQuote', 'OtherTest'],  // Missing not in this list
      }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'PROJ-CALLABLE-001'), 'Should still flag genuinely missing callee');
    });
  });

  describe('PROJ-SECRET-001: missing secrets password', () => {
    it('flags when secretsPasswordSet is false', () => {
      const r = validateProject({
        name: 'MyProject',
        test_cases: [TC_LOGIN],
        project_context: { secretsPasswordSet: false },
      }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'PROJ-SECRET-001'), 'Expected PROJ-SECRET-001');
    });

    it('does not flag when secretsPasswordSet is true', () => {
      const r = validateProject({
        name: 'MyProject',
        test_cases: [TC_LOGIN],
        project_context: { secretsPasswordSet: true },
      }, 80);
      assert.ok(!r.violations.some((v) => v.rule_id === 'PROJ-SECRET-001'));
    });
  });

  describe('PROJ-ENV-001: duplicate environment names', () => {
    it('flags two environments with the same name (case-insensitive)', () => {
      const r = validateProject({
        name: 'MyProject',
        test_cases: [TC_LOGIN],
        project_context: { secretsPasswordSet: true, environments: ['QA', 'qa'] },
      }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'PROJ-ENV-001'), 'Expected PROJ-ENV-001');
    });
  });

  describe('PROJ-ENV-002: invalid environment name characters', () => {
    it('flags environment names containing special characters', () => {
      const r = validateProject({
        name: 'MyProject',
        test_cases: [TC_LOGIN],
        project_context: { secretsPasswordSet: true, environments: ['QA-Staging!'] },
      }, 80);
      assert.ok(r.violations.some((v) => v.rule_id === 'PROJ-ENV-002'), 'Expected PROJ-ENV-002');
    });

    it('allows alphanumeric and underscore environment names', () => {
      const r = validateProject({
        name: 'MyProject',
        test_cases: [TC_LOGIN],
        project_context: { secretsPasswordSet: true, environments: ['QA', 'UAT_2', 'Staging3'] },
      }, 80);
      assert.ok(!r.violations.some((v) => v.rule_id === 'PROJ-ENV-002'));
    });
  });

  describe('result shape', () => {
    it('returns level="project" with correct nested structure', () => {
      const r = validateProject({
        name: 'ShapeTest',
        test_plans: [{
          name: 'Plan1',
          test_suites: [{ name: 'Suite1', test_cases: [TC_LOGIN] }],
          metadata: FULL_META,
        }],
        project_context: { secretsPasswordSet: true },
      }, 80);
      assert.equal(r.level, 'project');
      assert.equal(r.name, 'ShapeTest');
      assert.equal(r.test_plans.length, 1);
      assert.equal(r.test_plans[0].test_suites.length, 1);
      assert.equal(r.test_plans[0].test_suites[0].test_cases.length, 1);
    });
  });
});

// ── buildHierarchySummary ─────────────────────────────────────────────────────

describe('buildHierarchySummary', () => {
  it('counts test cases and violations correctly for a suite result', () => {
    const r = validateSuite({ name: 'S', test_cases: [TC_LOGIN, TC_LOGOUT] }, 80);
    const summary = buildHierarchySummary(r);
    assert.equal(summary.total_test_cases, 2);
    assert.ok(summary.total_violations >= 0);
    assert.ok(summary.quality_score_min !== null);
    assert.ok(summary.quality_score_max !== null);
  });

  it('counts violations at all levels for a project result', () => {
    const r = validateProject({ name: 'P' }, 80);           // triggers PROJ-EMPTY-001 + PROJ-SECRET-001
    const summary = buildHierarchySummary(r);
    assert.equal(summary.total_test_cases, 0);
    assert.ok(summary.total_violations >= 2, `Expected >= 2 violations, got ${summary.total_violations}`);
    assert.ok(summary.violations_by_level.project >= 2);
  });

  it('classifies test case statuses (valid/invalid/error)', () => {
    // An empty XML string will fail validation → invalid status
    const r = validateSuite({
      name: 'S',
      test_cases: [
        TC_LOGIN,                                              // valid XML → valid
        { name: 'BadTest.testcase', xml: '' },                // empty XML → invalid
      ],
    }, 80);
    const summary = buildHierarchySummary(r);
    assert.equal(summary.total_test_cases, 2);
    assert.ok(summary.test_cases_valid >= 0);
    assert.ok(summary.test_cases_invalid >= 0);
    assert.equal(summary.test_cases_valid + summary.test_cases_invalid + summary.test_cases_error, 2);
  });

  it('reports quality_score_avg, min, max for test cases', () => {
    const r = validateSuite({ name: 'S', test_cases: [TC_LOGIN, TC_LOGOUT, TC_SIGNUP] }, 80);
    const summary = buildHierarchySummary(r);
    assert.equal(summary.total_test_cases, 3);
    assert.ok(summary.quality_score_min !== null && summary.quality_score_min >= 0);
    assert.ok(summary.quality_score_max !== null && summary.quality_score_max <= 100);
    assert.ok(summary.quality_score_avg >= 0 && summary.quality_score_avg <= 100);
  });
});
