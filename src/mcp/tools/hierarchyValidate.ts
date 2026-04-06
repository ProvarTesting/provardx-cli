/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import type { ValidationIssue } from '../schemas/common.js';
import { validateTestCase } from './testCaseValidate.js';
import type { BPViolation } from './bestPracticesEngine.js';

// ── Input types ──────────────────────────────────────────────────────────────

export interface TestCaseInput {
  name: string;
  /** XML content of the test case. The field `xml` (API standard) is accepted as an alias. */
  xml_content?: string;
  /** API-compatible alias for xml_content (Quality Hub batch validation API uses this field name). */
  xml?: string;
}

export interface TestSuiteInput {
  name: string;
  test_cases?: TestCaseInput[];
  test_suites?: TestSuiteInput[];
  test_case_count?: number;
}

export interface PlanMetadata {
  objectives?: string;
  in_scope?: string;
  testing_methodology?: string;
  acceptance_criteria?: string;
  acceptable_pass_rate?: number;
  environments?: string[];
  test_data_strategy?: string;
  risks?: string;
}

export interface TestPlanInput {
  name: string;
  test_suites?: TestSuiteInput[];
  test_cases?: TestCaseInput[];
  test_suite_count?: number;
  metadata?: PlanMetadata;
}

export interface ProjectContext {
  connection_names?: string[];
  environments?: string[];
  secretsPasswordSet?: boolean;
  /**
   * Number of keys in the .secrets file whose values are NOT wrapped in ENC1().
   * Populated by provar.project.inspect → secrets_validation.unencrypted_key_count.
   * Any value > 0 triggers PROJ-ENC-001.
   */
  unencrypted_secret_count?: number;
}

export interface ProjectInput {
  name: string;
  test_plans?: TestPlanInput[];
  test_suites?: TestSuiteInput[];
  test_cases?: TestCaseInput[];
  project_context?: ProjectContext;
  /**
   * Basenames (without extension) of every .testcase file found on disk, including
   * callable tests (visibility="Internal") that have no plan instances.  Populated
   * by validateProjectFromPath so that checkCaseCalls can resolve caseCall references
   * against the full on-disk corpus rather than only plan-registered test cases.
   */
  all_disk_test_case_names?: string[];
}

// ── Result types ─────────────────────────────────────────────────────────────

export interface HierarchyViolation {
  rule_id: string;
  name: string;
  description: string;
  category: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  weight: number;
  message: string;
  recommendation: string;
  applies_to: string[];
  affected_files?: string[];
}

export interface TestCaseResult {
  name: string;
  level: 'test_case';
  status: 'valid' | 'invalid' | 'error';
  quality_score: number;
  validity_score: number;
  is_valid: boolean;
  error_count: number;
  warning_count: number;
  step_count: number;
  issues: ValidationIssue[];
  /** Best-practice violations from the BP engine (DESIGN-*, REUSE-*, STRUCT-*, etc.) */
  best_practices_violations: BPViolation[];
}

export interface SuiteResult {
  name: string;
  level: 'suite';
  quality_score: number;
  violations: HierarchyViolation[];
  test_cases: TestCaseResult[];
  test_suites: SuiteResult[];
}

export interface PlanResult {
  name: string;
  level: 'plan';
  quality_score: number;
  violations: HierarchyViolation[];
  test_suites: SuiteResult[];
  test_cases: TestCaseResult[];
}

export interface ProjectResult {
  name: string;
  level: 'project';
  quality_score: number;
  violations: HierarchyViolation[];
  test_plans: PlanResult[];
  test_suites: SuiteResult[];
  test_cases: TestCaseResult[];
  project_context: ProjectContext;
}

export interface HierarchySummary {
  total_test_cases: number;
  test_cases_valid: number;
  test_cases_invalid: number;
  test_cases_error: number;
  total_violations: number;
  violations_by_severity: { critical: number; major: number; minor: number; info: number };
  violations_by_level: { project: number; plan: number; suite: number; test_case: number };
  quality_score_avg: number;
  quality_score_min: number | null;
  quality_score_max: number | null;
}

// ── Rule registry (ported from batch_validator/handler.py) ───────────────────

const RULE_REGISTRY: Record<string, { name: string; description: string }> = {
  'SUITE-EMPTY-001': { name: 'Empty Test Suite', description: 'A test suite must contain at least one test case or child suite.' },
  'SUITE-DUP-001':   { name: 'Duplicate Test Case Name in Suite', description: 'Test case names within a suite must be unique.' },
  'SUITE-DUP-002':   { name: 'Duplicate Child Suite Name', description: 'Child suite names within a parent suite must be unique.' },
  'SUITE-SIZE-001':  { name: 'Oversized Test Suite', description: 'A test suite should contain no more than 75 test cases.' },
  'SUITE-NAMING-001': { name: 'Inconsistent Child Suite Naming', description: 'All child suite names should follow a consistent naming convention.' },
  'SUITE-NAMING-002': { name: 'Inconsistent Test Case Naming', description: 'All test case names within a suite should follow a consistent naming convention.' },
  'PLAN-EMPTY-001':  { name: 'Empty Test Plan', description: 'A test plan must contain at least one test suite.' },
  'PLAN-DUP-001':    { name: 'Duplicate Suite Name in Plan', description: 'Suite names within a test plan must be unique.' },
  'PLAN-META-001':   { name: 'Missing Plan Objectives', description: 'Test plans should define clear testing objectives. This field is configured in the Provar Quality Hub app (not stored in local project files).' },
  'PLAN-META-002':   { name: 'Missing In-Scope Definition', description: 'Test plans should specify which features are in scope. This field is configured in the Provar Quality Hub app (not stored in local project files).' },
  'PLAN-META-003':   { name: 'Missing Testing Methodology', description: 'Test plans should document the testing methodology. This field is configured in the Provar Quality Hub app (not stored in local project files).' },
  'PLAN-META-004':   { name: 'Missing Acceptance Criteria', description: 'Test plans should define acceptance criteria or an acceptable pass rate. This field is configured in the Provar Quality Hub app (not stored in local project files).' },
  'PLAN-META-005':   { name: 'Missing Test Environments', description: 'Test plans should specify the target test environments. This field is configured in the Provar Quality Hub app (not stored in local project files).' },
  'PLAN-META-006':   { name: 'Missing Test Data Strategy', description: 'Test plans should document how test data will be prepared and cleaned up. This field is configured in the Provar Quality Hub app (not stored in local project files).' },
  'PLAN-META-007':   { name: 'Missing Risk Assessment', description: 'Test plans should identify potential risks and mitigations. This field is configured in the Provar Quality Hub app (not stored in local project files).' },
  'PLAN-SIZE-001':   { name: 'Oversized Test Plan', description: 'A test plan should contain no more than 20 test suites.' },
  'PLAN-NAMING-001': { name: 'Inconsistent Suite Naming in Plan', description: 'All suite names within a test plan should follow a consistent naming convention.' },
  'PROJ-EMPTY-001':  { name: 'Empty Project', description: 'A project must contain at least one test plan.' },
  'PROJ-DUP-001':    { name: 'Duplicate Test Case Name Across Project', description: 'Test case names must be unique across the entire project.' },
  'PROJ-DUP-002':    { name: 'Duplicate Plan Name in Project', description: 'Test plan names within a project must be unique.' },
  'PROJ-CALLABLE-001': { name: 'Unresolved caseCall Reference', description: 'All caseCall references must point to existing test cases in the project.' },
  'PROJ-CALLABLE-002': { name: 'Missing Callable Test Case', description: 'All callable tests referenced by caseCall must exist in the project.' },
  'PROJ-CONN-001':   { name: 'Undefined Connection Name', description: 'All connection names used in test cases must be defined in the project context.' },
  'PROJ-ENV-001':    { name: 'Duplicate Environment Name', description: 'Environment names within a project must be unique.' },
  'PROJ-ENV-002':    { name: 'Invalid Environment Name', description: 'Environment names must contain only letters, digits, and underscores.' },
  'PROJ-SECRET-001': { name: 'Missing Secrets Password', description: 'A Provar Secrets Password must be configured to protect sensitive test data.' },
  'PROJ-ENC-001':    { name: 'Unencrypted Credentials in .secrets', description: 'All values in the .secrets file must be wrapped in ENC1() encryption. Plaintext credentials are a critical security risk.' },
};

// ── Violation builder ─────────────────────────────────────────────────────────

function makeViolation(
  rule_id: string,
  category: string,
  severity: HierarchyViolation['severity'],
  weight: number,
  message: string,
  recommendation: string,
  applies_to: string[],
  affected_files?: string[]
): HierarchyViolation {
  const entry = RULE_REGISTRY[rule_id] ?? { name: rule_id, description: '' };
  const v: HierarchyViolation = {
    rule_id,
    name: entry.name,
    description: entry.description,
    category,
    severity,
    weight,
    message,
    recommendation,
    applies_to,
  };
  if (affected_files?.length) v.affected_files = affected_files;
  return v;
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

const SEVERITY_MULTIPLIER: Record<string, number> = {
  critical: 1.0, major: 0.75, minor: 0.5, info: 0.25,
};

export function computeViolationDeduction(violations: HierarchyViolation[]): number {
  let total = 0;
  for (const v of violations) {
    const mult = SEVERITY_MULTIPLIER[v.severity] ?? 0.5;
    total += v.weight * mult;
  }
  return total;
}

function childAvg(scores: number[]): number {
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
}

// ── Naming consistency helpers ────────────────────────────────────────────────

export function detectNamingStyle(nameStr: string): string {
  const stem = nameStr.includes('.') ? path.basename(nameStr, path.extname(nameStr)) : nameStr;
  if (!stem) return 'unknown';
  if (stem.includes(' ')) return 'space separated';
  if (stem.includes('-')) return 'kebab-case';
  if (stem.includes('_')) return stem === stem.toUpperCase() ? 'UPPER_SNAKE' : 'snake_case';
  if (/^[A-Z]/.test(stem) && /[a-z]/.test(stem)) return 'PascalCase';
  if (/^[a-z]/.test(stem) && /[A-Z]/.test(stem)) return 'camelCase';
  return 'unknown';
}

export function checkNamingConsistency(
  names: string[],
  contextLabel: string,
  level: string,
  ruleId: string
): HierarchyViolation[] {
  if (names.length < 2) return [];
  const styles: Record<string, string[]> = {};
  for (const n of names) {
    const style = detectNamingStyle(n);
    if (style !== 'unknown') {
      (styles[style] ??= []).push(n);
    }
  }
  if (Object.keys(styles).length <= 1) return [];

  const styleSummary = Object.entries(styles)
    .sort()
    .map(([s, items]) => `${s} (${items.length})`)
    .join(', ');
  const examples = Object.entries(styles)
    .sort()
    .map(([s, items]) => `${s}: "${items[0]}"`)
    .join(', ');

  return [makeViolation(
    ruleId, 'NamingConventions', 'info', 2,
    `Inconsistent naming conventions in ${contextLabel}: ${styleSummary}`,
    `Adopt a single naming convention across all items. Examples found: ${examples}`,
    [level],
  )];
}

// ── Test case validation (adapts existing validator to hierarchy result) ───────

export function validateHierarchyTestCase(
  tc: TestCaseInput,
  qualityThreshold: number
): TestCaseResult {
  // Accept both `xml` (API standard) and `xml_content` (MCP original); prefer `xml`
  const xmlSource = tc.xml ?? tc.xml_content ?? '';
  try {
    const r = validateTestCase(xmlSource, tc.name);
    const status = !r.is_valid ? 'invalid' : r.quality_score < qualityThreshold ? 'invalid' : 'valid';
    return {
      name: tc.name,
      level: 'test_case',
      status,
      quality_score: r.quality_score,
      validity_score: r.validity_score,
      is_valid: r.is_valid,
      error_count: r.error_count,
      warning_count: r.warning_count,
      step_count: r.step_count,
      issues: r.issues,
      best_practices_violations: r.best_practices_violations ?? [],
    };
  } catch (e) {
    return {
      name: tc.name,
      level: 'test_case',
      status: 'error',
      quality_score: 0,
      validity_score: 0,
      is_valid: false,
      error_count: 1,
      warning_count: 0,
      step_count: 0,
      issues: [{
        rule_id: 'TC_000',
        severity: 'ERROR',
        message: `Unexpected error: ${(e as Error).message}`,
        applies_to: 'document',
      }],
      best_practices_violations: [],
    };
  }
}

// ── Suite validation ──────────────────────────────────────────────────────────

function checkSuiteStructure(
  suiteName: string,
  childSuites: TestSuiteInput[],
  childCases: TestCaseInput[]
): HierarchyViolation[] {
  const violations: HierarchyViolation[] = [];
  if (!childSuites.length && !childCases.length) {
    violations.push(makeViolation(
      'SUITE-EMPTY-001', 'SuiteStructure', 'major', 5,
      `Test suite "${suiteName}" contains no test cases or child suites`,
      `Add at least one test case or child suite to "${suiteName}"`,
      ['TestSuite'],
    ));
  }
  return violations;
}

function checkSuiteDuplicates(
  suiteName: string,
  childSuites: TestSuiteInput[],
  childCases: TestCaseInput[]
): HierarchyViolation[] {
  const violations: HierarchyViolation[] = [];

  const seenCases: Record<string, string> = {};
  for (const tc of childCases) {
    const base = path.basename(tc.name, path.extname(tc.name)).toLowerCase();
    if (seenCases[base]) {
      violations.push(makeViolation(
        'SUITE-DUP-001', 'Maintainability', 'major', 5,
        `Duplicate test case name "${base}" in suite "${suiteName}"`,
        'Ensure all test case names within a suite are unique',
        ['TestSuite'],
        [seenCases[base], tc.name],
      ));
    } else {
      seenCases[base] = tc.name;
    }
  }

  const seenSuites = new Set<string>();
  for (const cs of childSuites) {
    const lower = cs.name.toLowerCase();
    if (seenSuites.has(lower)) {
      violations.push(makeViolation(
        'SUITE-DUP-002', 'Maintainability', 'major', 5,
        `Duplicate child suite name "${cs.name}" in suite "${suiteName}"`,
        'Ensure all child suite names are unique within a parent suite',
        ['TestSuite'],
      ));
    }
    seenSuites.add(lower);
  }
  return violations;
}

function checkSuiteSize(suiteName: string, data: TestSuiteInput): HierarchyViolation[] {
  const explicit = data.test_case_count;
  const count = explicit ?? (data.test_cases?.length ?? 0);
  if (count > 75) {
    return [makeViolation(
      'SUITE-SIZE-001', 'SuiteStructure', 'minor', 2,
      `Test suite "${suiteName}" contains ${count} test cases (recommended maximum: 75)`,
      'Break large suites into smaller, focused child suites',
      ['TestSuite'],
    )];
  }
  return [];
}

export function validateSuite(
  data: TestSuiteInput,
  qualityThreshold: number
): SuiteResult {
  const suiteName = data.name || 'Unnamed Suite';
  const childSuites = data.test_suites ?? [];
  const childCases = data.test_cases ?? [];

  const violations: HierarchyViolation[] = [
    ...checkSuiteStructure(suiteName, childSuites, childCases),
    ...checkSuiteDuplicates(suiteName, childSuites, childCases),
    ...checkSuiteSize(suiteName, data),
    ...checkNamingConsistency(childSuites.map((cs) => cs.name), `suite "${suiteName}" child suites`, 'TestSuite', 'SUITE-NAMING-001'),
    ...checkNamingConsistency(childCases.map((tc) => tc.name), `suite "${suiteName}" test cases`, 'TestSuite', 'SUITE-NAMING-002'),
  ];

  const suiteResults = childSuites.map((cs) => validateSuite(cs, qualityThreshold));
  const caseResults = childCases.map((tc) => validateHierarchyTestCase(tc, qualityThreshold));

  const scores = [
    ...caseResults.map((r) => r.quality_score),
    ...suiteResults.map((r) => r.quality_score),
  ];
  const quality_score = scores.length
    ? Math.max(0, Math.round((childAvg(scores) - computeViolationDeduction(violations)) * 100) / 100)
    : 0;

  return {
    name: suiteName,
    level: 'suite',
    quality_score,
    violations,
    test_cases: caseResults,
    test_suites: suiteResults,
  };
}

// ── Plan validation ───────────────────────────────────────────────────────────

function checkPlanMetadata(planName: string, meta: PlanMetadata): HierarchyViolation[] {
  const v: HierarchyViolation[] = [];
  if (!meta.objectives) v.push(makeViolation('PLAN-META-001', 'PlanCompleteness', 'info', 1, `Test plan "${planName}" has no objectives defined`, 'Add testing objectives via the Provar Quality Hub app', ['TestPlan']));
  if (!meta.in_scope) v.push(makeViolation('PLAN-META-002', 'PlanCompleteness', 'info', 1, `Test plan "${planName}" has no in-scope definition`, 'Specify in-scope features via the Provar Quality Hub app', ['TestPlan']));
  if (!meta.testing_methodology) v.push(makeViolation('PLAN-META-003', 'PlanCompleteness', 'info', 1, `Test plan "${planName}" has no testing methodology defined`, 'Document the testing methodology via the Provar Quality Hub app', ['TestPlan']));
  if (!meta.acceptance_criteria && meta.acceptable_pass_rate === undefined) v.push(makeViolation('PLAN-META-004', 'PlanCompleteness', 'info', 1, `Test plan "${planName}" has no acceptance criteria or acceptable pass rate`, 'Set acceptance criteria or an acceptable pass rate via the Provar Quality Hub app', ['TestPlan']));
  if (!meta.environments?.length) v.push(makeViolation('PLAN-META-005', 'PlanCompleteness', 'info', 1, `Test plan "${planName}" has no test environments defined`, 'Specify target environments (e.g., QA, Staging, UAT) via the Provar Quality Hub app', ['TestPlan']));
  if (!meta.test_data_strategy) v.push(makeViolation('PLAN-META-006', 'PlanCompleteness', 'minor', 2, `Test plan "${planName}" has no test data strategy`, 'Document the test data strategy via the Provar Quality Hub app', ['TestPlan']));
  if (!meta.risks) v.push(makeViolation('PLAN-META-007', 'PlanCompleteness', 'info', 1, `Test plan "${planName}" has no risks identified`, 'Identify risks and mitigations via the Provar Quality Hub app', ['TestPlan']));
  return v;
}

export function validatePlan(
  data: TestPlanInput,
  qualityThreshold: number
): PlanResult {
  const planName = data.name || 'Unnamed Plan';
  const childSuites = data.test_suites ?? [];
  const childCases = data.test_cases ?? [];

  const violations: HierarchyViolation[] = [];

  if (!childSuites.length && !childCases.length) {
    violations.push(makeViolation(
      'PLAN-EMPTY-001', 'PlanStructure', 'major', 5,
      `Test plan "${planName}" contains no test suites or test cases`,
      `Add at least one test suite or test case to "${planName}"`,
      ['TestPlan'],
    ));
  }

  const seenSuites = new Set<string>();
  for (const s of childSuites) {
    const lower = s.name.toLowerCase();
    if (seenSuites.has(lower)) {
      violations.push(makeViolation('PLAN-DUP-001', 'Maintainability', 'major', 5, `Duplicate suite name "${s.name}" in plan "${planName}"`, 'Ensure all suite names within a plan are unique', ['TestPlan']));
    }
    seenSuites.add(lower);
  }

  const meta = data.metadata ?? {};
  violations.push(...checkPlanMetadata(planName, meta));

  const suiteCount = data.test_suite_count ?? childSuites.length;
  if (suiteCount > 20) {
    violations.push(makeViolation('PLAN-SIZE-001', 'PlanStructure', 'minor', 2, `Test plan "${planName}" contains ${suiteCount} test suites (recommended maximum: 20)`, 'Split the plan into multiple focused test plans', ['TestPlan']));
  }

  violations.push(...checkNamingConsistency(childSuites.map((s) => s.name), `plan "${planName}"`, 'TestPlan', 'PLAN-NAMING-001'));

  const suiteResults = childSuites.map((s) => validateSuite(s, qualityThreshold));
  const caseResults = childCases.map((tc) => validateHierarchyTestCase(tc, qualityThreshold));

  const scores = [
    ...suiteResults.map((r) => r.quality_score),
    ...caseResults.map((r) => r.quality_score),
  ];
  const quality_score = scores.length
    ? Math.max(0, Math.round((childAvg(scores) - computeViolationDeduction(violations)) * 100) / 100)
    : 0;

  return {
    name: planName,
    level: 'plan',
    quality_score,
    violations,
    test_suites: suiteResults,
    test_cases: caseResults,
  };
}

// ── Project cross-cutting rules ───────────────────────────────────────────────

function buildCrossRefRegistry(
  testPlans: TestPlanInput[],
  testSuites: TestSuiteInput[],
  testCases: TestCaseInput[]
): Record<string, string> {
  const registry: Record<string, string> = {};

  function addSuiteTree(s: TestSuiteInput): void {
    for (const tc of s.test_cases ?? []) registry[tc.name] = tc.xml ?? tc.xml_content ?? '';
    for (const cs of s.test_suites ?? []) addSuiteTree(cs);
  }

  for (const tc of testCases) registry[tc.name] = tc.xml ?? tc.xml_content ?? '';
  for (const s of testSuites) addSuiteTree(s);
  for (const p of testPlans) {
    for (const tc of p.test_cases ?? []) registry[tc.name] = tc.xml ?? tc.xml_content ?? '';
    for (const s of p.test_suites ?? []) addSuiteTree(s);
  }
  return registry;
}

function checkDuplicateNames(registry: Record<string, string>): HierarchyViolation[] {
  const violations: HierarchyViolation[] = [];
  const seen: Record<string, string> = {};
  for (const name of Object.keys(registry)) {
    const base = path.basename(name, path.extname(name)).toLowerCase();
    if (seen[base]) {
      violations.push(makeViolation('PROJ-DUP-001', 'Maintainability', 'major', 5, `Duplicate test case name detected: "${base}"`, 'Ensure all test case names are unique across the project', ['Project'], [seen[base], name]));
    } else {
      seen[base] = name;
    }
  }
  return violations;
}

function checkCaseCalls(registry: Record<string, string>, diskTestCaseNames: Set<string> = new Set()): HierarchyViolation[] {
  const violations: HierarchyViolation[] = [];
  // Include all on-disk test cases (callables have no .testinstance so they're absent from
  // the plan-built registry — merging diskTestCaseNames prevents false PROJ-CALLABLE-001/002)
  const available = new Set([...Object.keys(registry), ...diskTestCaseNames]);
  const availableBase = new Set([...Object.keys(registry).map((n) => path.basename(n, path.extname(n))), ...diskTestCaseNames]);
  const calledPaths = new Set<string>();

  // Group callers by missing callee — avoids N violations for the same missing test
  const missingCalleeCallers = new Map<string, Set<string>>();

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false });

  for (const [testName, xml] of Object.entries(registry)) {
    if (!xml) continue;
    try {
      const parsed = parser.parse(xml) as Record<string, unknown>;
      const tc = parsed['testCase'] as Record<string, unknown> | undefined;
      if (!tc) continue;
      const steps = tc['steps'] as Record<string, unknown> | undefined;
      if (!steps) continue;
      const rawCalls = steps['caseCall'];
      const calls = rawCalls ? (Array.isArray(rawCalls) ? rawCalls : [rawCalls]) as Array<Record<string, unknown>> : [];
      for (const call of calls) {
        const called = (call['@_testCasePath'] as string | undefined)?.trim() ?? '';
        if (!called) continue;
        calledPaths.add(path.basename(called, path.extname(called)));
        if (!available.has(called) && !availableBase.has(path.basename(called, path.extname(called)))) {
          if (!missingCalleeCallers.has(called)) missingCalleeCallers.set(called, new Set());
          missingCalleeCallers.get(called)!.add(testName);
        }
      }
    } catch {
      // skip unparseable XML
    }
  }

  // One violation per unique missing callee (affected_files lists all callers)
  for (const [called, callers] of missingCalleeCallers) {
    const n = callers.size;
    violations.push(makeViolation(
      'PROJ-CALLABLE-001', 'ReusabilityAndCallables', 'major', 5,
      `caseCall references non-existent test: "${called}" (referenced in ${n} test case${n > 1 ? 's' : ''})`,
      `Ensure "${called}" exists in the project or update the reference`,
      ['Project'],
      [...callers].sort()
    ));
  }

  for (const called of calledPaths) {
    if (!availableBase.has(called)) {
      violations.push(makeViolation('PROJ-CALLABLE-002', 'ReusabilityAndCallables', 'critical', 10, `Callable test "${called}" is referenced but does not exist in project`, `Add "${called}.testcase" to the project or remove the caseCall references`, ['Project']));
    }
  }

  return violations;
}

function extractConnFromCall(call: Record<string, unknown>): string | undefined {
  if (call['@_apiId'] !== 'com.provar.plugins.forcedotcom.core.testapis.ApexConnect') return undefined;
  const args = call['argument'];
  const argArr = args ? (Array.isArray(args) ? args : [args]) as Array<Record<string, unknown>> : [];
  for (const arg of argArr) {
    if (arg['@_id'] !== 'connectionName') continue;
    const val = arg['value'] as Record<string, unknown> | undefined;
    return (val?.['#text'] ?? val) as string | undefined;
  }
  return undefined;
}

function checkConnectionConsistency(registry: Record<string, string>, ctx: ProjectContext): HierarchyViolation[] {
  const violations: HierarchyViolation[] = [];
  const defined = new Set(ctx.connection_names ?? []);
  if (!defined.size) return violations;

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false });
  const undefinedConns: Record<string, string[]> = {};

  for (const [testName, xml] of Object.entries(registry)) {
    if (!xml) continue;
    try {
      const parsed = parser.parse(xml) as Record<string, unknown>;
      const tc = parsed['testCase'] as Record<string, unknown> | undefined;
      if (!tc) continue;
      const steps = tc['steps'] as Record<string, unknown> | undefined;
      if (!steps) continue;
      const rawCalls = steps['apiCall'];
      const calls = rawCalls ? (Array.isArray(rawCalls) ? rawCalls : [rawCalls]) as Array<Record<string, unknown>> : [];
      for (const call of calls) {
        const conn = extractConnFromCall(call);
        if (conn && !defined.has(conn)) {
          (undefinedConns[conn] ??= []).push(testName);
        }
      }
    } catch {
      // skip
    }
  }

  for (const [conn, files] of Object.entries(undefinedConns)) {
    violations.push(makeViolation('PROJ-CONN-001', 'ConnectionsAndEnvironments', 'major', 5, `Connection "${conn}" used but not defined in project`, `Ensure connection "${conn}" is defined in your Provar project`, ['Project'], files));
  }
  return violations;
}

function checkEnvironments(ctx: ProjectContext): HierarchyViolation[] {
  const violations: HierarchyViolation[] = [];
  const envs = ctx.environments ?? [];
  if (!envs.length) return violations;

  const seen = new Set<string>();
  const envPattern = /^[A-Za-z0-9_]+$/;
  for (const env of envs) {
    const lower = env.toLowerCase();
    if (seen.has(lower)) {
      violations.push(makeViolation('PROJ-ENV-001', 'ConnectionsAndEnvironments', 'major', 5, `Duplicate environment name: "${env}"`, 'Remove or rename duplicate environments', ['Project']));
    }
    seen.add(lower);
    if (!envPattern.test(env)) {
      violations.push(makeViolation('PROJ-ENV-002', 'ConnectionsAndEnvironments', 'major', 5, `Environment name "${env}" contains invalid characters`, 'Use only letters, digits, and underscores for environment names', ['Project']));
    }
  }
  return violations;
}

export function validateProject(data: ProjectInput, qualityThreshold: number): ProjectResult {
  const projectName = data.name || 'Unnamed Project';
  const testPlans = data.test_plans ?? [];
  const testSuites = data.test_suites ?? [];
  const testCases = data.test_cases ?? [];
  const ctx: ProjectContext = { ...data.project_context };

  const planResults = testPlans.map((p) => validatePlan(p, qualityThreshold));
  const suiteResults = testSuites.map((s) => validateSuite(s, qualityThreshold));
  const caseResults = testCases.map((tc) => validateHierarchyTestCase(tc, qualityThreshold));

  const violations: HierarchyViolation[] = [];

  if (!testPlans.length && !testSuites.length && !testCases.length) {
    violations.push(makeViolation('PROJ-EMPTY-001', 'ProjectStructure', 'major', 5, `Project "${projectName}" contains no test plans, test suites, or test cases`, `Add at least one test plan, test suite, or test case to "${projectName}"`, ['Project']));
  }

  const seenPlans = new Set<string>();
  for (const p of testPlans) {
    const lower = p.name.toLowerCase();
    if (seenPlans.has(lower)) {
      violations.push(makeViolation('PROJ-DUP-002', 'Maintainability', 'major', 5, `Duplicate plan name "${p.name}" in project "${projectName}"`, 'Ensure all test plan names within a project are unique', ['Project']));
    }
    seenPlans.add(lower);
  }

  // Cross-cutting rules require the full test case registry
  const registry = buildCrossRefRegistry(testPlans, testSuites, testCases);
  violations.push(...checkDuplicateNames(registry));
  violations.push(...checkCaseCalls(registry, new Set(data.all_disk_test_case_names ?? [])));
  violations.push(...checkConnectionConsistency(registry, ctx));
  violations.push(...checkEnvironments(ctx));

  if (!ctx.secretsPasswordSet) {
    violations.push(makeViolation('PROJ-SECRET-001', 'ConnectionsAndEnvironments', 'major', 5, 'Provar Secrets Password is not configured for this project', 'Set a Secrets Password in the Provar project settings to encrypt sensitive test data', ['Project']));
  }

  if (ctx.unencrypted_secret_count !== undefined && ctx.unencrypted_secret_count > 0) {
    violations.push(makeViolation(
      'PROJ-ENC-001',
      'ConnectionsAndEnvironments',
      'critical',
      20,
      `${ctx.unencrypted_secret_count} credential(s) in .secrets are stored as plaintext (missing ENC1() wrapper)`,
      'Re-configure the Provar Secrets Password and re-save all connections so credentials are re-encrypted',
      ['Project']
    ));
  }

  const scores = [
    ...planResults.map((r) => r.quality_score),
    ...suiteResults.map((r) => r.quality_score),
    ...caseResults.map((r) => r.quality_score),
  ];
  const quality_score = scores.length
    ? Math.max(0, Math.round((childAvg(scores) - computeViolationDeduction(violations)) * 100) / 100)
    : 0;

  return {
    name: projectName,
    level: 'project',
    quality_score,
    violations,
    test_plans: planResults,
    test_suites: suiteResults,
    test_cases: caseResults,
    project_context: ctx,
  };
}

// ── Summary builder ───────────────────────────────────────────────────────────

export function buildHierarchySummary(
  result: SuiteResult | PlanResult | ProjectResult
): HierarchySummary {
  const stats: HierarchySummary = {
    total_test_cases: 0,
    test_cases_valid: 0,
    test_cases_invalid: 0,
    test_cases_error: 0,
    total_violations: 0,
    violations_by_severity: { critical: 0, major: 0, minor: 0, info: 0 },
    violations_by_level: { project: 0, plan: 0, suite: 0, test_case: 0 },
    quality_score_avg: 0,
    quality_score_min: null,
    quality_score_max: null,
  };
  const scores: number[] = [];

  function walkNode(node: SuiteResult | PlanResult | ProjectResult | TestCaseResult): void {
    const nodeLevel = node.level;
    const nodeViolations = node.level === 'test_case' ? [] : node.violations;
    stats.total_violations += nodeViolations.length;
    if (nodeLevel in stats.violations_by_level) stats.violations_by_level[nodeLevel as keyof typeof stats.violations_by_level] += nodeViolations.length;
    for (const v of nodeViolations) {
      if (v.severity in stats.violations_by_severity) stats.violations_by_severity[v.severity]++;
    }

    if (node.level === 'test_case') {
      stats.total_test_cases++;
      if (node.status === 'valid') stats.test_cases_valid++;
      else if (node.status === 'invalid') stats.test_cases_invalid++;
      else stats.test_cases_error++;
      scores.push(node.quality_score);
      return;
    }

    for (const child of node.test_cases) walkNode(child);
    for (const child of node.test_suites) walkNode(child);
    if ('test_plans' in node) for (const child of node.test_plans) walkNode(child);
  }

  walkNode(result as SuiteResult | PlanResult | ProjectResult | TestCaseResult);

  if (scores.length) {
    stats.quality_score_avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;
    stats.quality_score_min = Math.round(Math.min(...scores) * 100) / 100;
    stats.quality_score_max = Math.round(Math.max(...scores) * 100) / 100;
  }
  return stats;
}
