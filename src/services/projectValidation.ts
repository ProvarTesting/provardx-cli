/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import fs from 'node:fs';
import path from 'node:path';
import {
  validateProject,
  buildHierarchySummary,
  type TestCaseInput,
  type TestSuiteInput,
  type TestPlanInput,
  type ProjectInput,
  type ProjectContext,
  type ProjectResult,
  type PlanResult,
  type SuiteResult,
  type TestCaseResult,
  type HierarchyViolation,
  type HierarchySummary,
} from '../mcp/tools/hierarchyValidate.js';

// ── Public error type ─────────────────────────────────────────────────────────

export class ProjectValidationError extends Error {
  public readonly code: string;
  public constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ProjectValidationError';
  }
}

// ── Public options / result types ─────────────────────────────────────────────

export interface ProjectValidationOptions {
  project_path: string;
  quality_threshold?: number; // default 80
  save_results?: boolean;      // default true (any value !== false means save)
  results_dir?: string;        // default '{project_path}/provardx/validation'
}

export interface ValidatedTestCase {
  name: string;
  quality_score: number;
  quality_tier: string;
  status: string;
  is_valid: boolean;
  step_count: number;
  error_count: number;
  warning_count: number;
  issues: TestCaseResult['issues'];
}

export interface ValidatedChildSuite {
  name: string;
  quality_score: number;
  violations: HierarchyViolation[];
  test_case_count: number;
}

export interface ValidatedSuite {
  name: string;
  quality_score: number;
  violations: HierarchyViolation[];
  test_cases: ValidatedTestCase[];
  child_suites: ValidatedChildSuite[];
}

export interface ValidatedPlan {
  name: string;
  quality_score: number;
  violations: HierarchyViolation[];
  suites: ValidatedSuite[];
  unplanned_test_cases: Array<{
    name: string;
    quality_score: number;
    status: string;
    error_count: number;
    issues: TestCaseResult['issues'];
  }>;
}

export interface ProjectValidationResult {
  project_path: string;
  project_name: string;
  quality_score: number;
  quality_tier: string;
  quality_grade: string;
  summary: HierarchySummary;
  project_violations: HierarchyViolation[];
  plans: ValidatedPlan[];
  coverage: {
    total_test_cases_on_disk: number;
    covered_by_plans: number;
    uncovered_count: number;
    uncovered_test_cases: string[];
  };
  saved_to: string | null;
  /** Set when save_results was requested but the write failed (disk full, permissions, etc.). */
  save_error?: string;
}

// ── Quality tier / grade helpers ──────────────────────────────────────────────

export function toQualityTier(score: number): string {
  if (score >= 95) return 'S';
  if (score >= 85) return 'A';
  if (score >= 75) return 'B';
  if (score >= 65) return 'C';
  return 'D';
}

export function toQualityGrade(score: number): string {
  if (score >= 95) return 'Excellent';
  if (score >= 90) return 'Great';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Fair';
  return 'Poor';
}

export function toTitleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Project root auto-detection ───────────────────────────────────────────────

/**
 * Given a path that may be a Provar workspace root (containing one or more project
 * sub-directories) or the project root itself (contains .testproject), return the
 * resolved project root.
 *
 * Detection order:
 * 1. `.testproject` file present at given path → it is the project root
 * 2. Exactly one sub-directory contains a `.testproject` → use that
 * 3. Multiple sub-directories contain `.testproject` → return all candidates so the
 * caller can surface a clear error rather than guessing
 */
export function resolveProjectRoot(givenPath: string): { root: string; candidates: string[] } {
  if (fs.existsSync(path.join(givenPath, '.testproject'))) {
    return { root: givenPath, candidates: [] };
  }

  // Scan one level deep
  const candidates: string[] = [];
  try {
    for (const entry of fs.readdirSync(givenPath, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const sub = path.join(givenPath, entry.name);
      if (fs.existsSync(path.join(sub, '.testproject'))) candidates.push(sub);
    }
  } catch { /* skip */ }

  if (candidates.length === 1) return { root: candidates[0], candidates: [] };
  return { root: givenPath, candidates }; // caller handles 0 or multiple
}

// ── Project context reader (from .testproject) ────────────────────────────────

export function readProjectContext(projectPath: string): {
  projectName: string;
  context: ProjectContext;
} {
  const testProjectPath = path.join(projectPath, '.testproject');
  const projectName = path.basename(projectPath);

  if (!fs.existsSync(testProjectPath)) {
    return { projectName, context: {} };
  }

  let content: string;
  try {
    content = fs.readFileSync(testProjectPath, 'utf-8');
  } catch {
    return { projectName, context: {} };
  }

  // Extract environment names
  const envPattern = /<environment\s[^>]*\bname="([^"]+)"/g;
  const environments: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = envPattern.exec(content)) !== null) environments.push(m[1]);

  // Extract connection names
  const connPattern = /<connection\s[^>]*\bname="([^"]+)"/g;
  const connectionNames: string[] = [];
  while ((m = connPattern.exec(content)) !== null) connectionNames.push(m[1]);

  // Check secrets encryption status
  let secretsPasswordSet = false;
  let unencryptedSecretCount = 0;
  const secretsPathMatch = content.match(/<secureStoragePath>([^<]+)<\/secureStoragePath>/);
  const secretsRelPath = secretsPathMatch?.[1]?.trim() ?? '.secrets';
  const secretsFullPath = path.resolve(path.join(projectPath, secretsRelPath));
  const projectPathResolved = path.resolve(projectPath);
  // Bounds check: only read secrets file if it's within the project directory
  const secretsInBounds = secretsFullPath === projectPathResolved || secretsFullPath.startsWith(projectPathResolved + path.sep);
  if (secretsInBounds && fs.existsSync(secretsFullPath)) {
    try {
      const secretsContent = fs.readFileSync(secretsFullPath, 'utf-8');
      secretsPasswordSet = secretsContent.includes('Encryptor.check=');
      for (const line of secretsContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
        if (trimmed.startsWith('Encryptor.check=')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const value = trimmed.slice(eqIdx + 1).trim();
        if (value && !value.startsWith('ENC1(')) unencryptedSecretCount++;
      }
    } catch { /* skip */ }
  }

  return {
    projectName,
    context: {
      environments: environments.length ? environments : undefined,
      connection_names: connectionNames.length ? connectionNames : undefined,
      secretsPasswordSet,
      unencrypted_secret_count: unencryptedSecretCount,
    },
  };
}

// ── Plan / suite / testinstance readers ───────────────────────────────────────

interface TestInstanceFull {
  testCase: TestCaseInput | null;
  /** Normalised project-relative path from testCasePath field, or null if absent. */
  testCasePath: string | null;
  /** Raw testCaseId field value (UUID), or null if absent. */
  testCaseId: string | null;
}

/**
 * Internal: reads a .testinstance file exactly once and returns everything
 * needed both for building TestCaseInput and for accumulating covered paths.
 * Callers that only need TestCaseInput should use resolveTestInstance().
 */
function resolveTestInstanceFull(instancePath: string, projectPath: string): TestInstanceFull {
  try {
    const content = fs.readFileSync(instancePath, 'utf-8');
    const pathMatch = content.match(/testCasePath=["']([^"']+)["']/);
    const testCaseId = content.match(/testCaseId=["']([^"']+)["']/)?.[1] ?? null;
    if (!pathMatch?.[1]) return { testCase: null, testCasePath: null, testCaseId };

    const testCasePath = pathMatch[1].replace(/\\/g, '/');
    const tcFullPath = path.resolve(path.join(projectPath, testCasePath));
    const projResolved = path.resolve(projectPath);

    let xml_content: string | undefined;
    // Bounds check: only read test case files within the project directory
    const tcInBounds = tcFullPath === projResolved || tcFullPath.startsWith(projResolved + path.sep);
    // Derive name from the bounds-checked resolved path to prevent injection via crafted testCasePath
    const tcName = tcInBounds
      ? path.basename(tcFullPath, '.testcase')
      : path.basename(testCasePath, '.testcase');
    if (tcInBounds && fs.existsSync(tcFullPath)) {
      try {
        xml_content = fs.readFileSync(tcFullPath, 'utf-8');
      } catch { /* xml_content stays undefined */ }
    }

    return { testCase: { name: tcName, xml_content }, testCasePath, testCaseId };
  } catch {
    return { testCase: null, testCasePath: null, testCaseId: null };
  }
}

export function resolveTestInstance(instancePath: string, projectPath: string): TestCaseInput | null {
  return resolveTestInstanceFull(instancePath, projectPath).testCase;
}

/** Max suite nesting depth — mirrors the guard in projectInspect.ts. */
const MAX_SUITE_DEPTH = 10;

/** Accumulates a covered path (and its UUID fallback) into the provided Set. */
function accumulateCoveredPath(
  testCasePath: string | null,
  testCaseId: string | null,
  coveredPaths: Set<string>,
  idMap: Map<string, string>,
): void {
  if (testCasePath) coveredPaths.add(testCasePath);
  if (testCaseId) {
    const resolved = idMap.get(testCaseId);
    if (resolved) coveredPaths.add(resolved);
  }
}

export function readSuiteDirectory(
  dirPath: string,
  name: string,
  projectPath: string,
  depth = 0,
  coveredPaths?: Set<string>,
  idMap?: Map<string, string>,
): TestSuiteInput {
  const testCases: TestCaseInput[] = [];
  const testSuites: TestSuiteInput[] = [];

  if (depth > MAX_SUITE_DEPTH) return { name, test_cases: testCases, test_suites: testSuites };

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        testSuites.push(readSuiteDirectory(fullPath, entry.name, projectPath, depth + 1, coveredPaths, idMap));
      } else if (entry.name.endsWith('.testinstance')) {
        const { testCase, testCasePath, testCaseId } = resolveTestInstanceFull(fullPath, projectPath);
        if (testCase) testCases.push(testCase);
        if (coveredPaths && idMap) accumulateCoveredPath(testCasePath, testCaseId, coveredPaths, idMap);
      }
    }
  } catch { /* skip */ }

  return { name, test_cases: testCases, test_suites: testSuites };
}

export function readPlanDirectory(
  planPath: string,
  name: string,
  projectPath: string,
  coveredPaths?: Set<string>,
  idMap?: Map<string, string>,
): TestPlanInput {
  const testCases: TestCaseInput[] = [];
  const testSuites: TestSuiteInput[] = [];

  try {
    const entries = fs.readdirSync(planPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      const fullPath = path.join(planPath, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        testSuites.push(readSuiteDirectory(fullPath, entry.name, projectPath, 0, coveredPaths, idMap));
      } else if (entry.name.endsWith('.testinstance')) {
        const { testCase, testCasePath, testCaseId } = resolveTestInstanceFull(fullPath, projectPath);
        if (testCase) testCases.push(testCase);
        if (coveredPaths && idMap) accumulateCoveredPath(testCasePath, testCaseId, coveredPaths, idMap);
      }
    }
  } catch { /* skip */ }

  return { name, test_cases: testCases, test_suites: testSuites };
}

export function readPlansDir(projectPath: string): { plans: TestPlanInput[]; coveredPaths: Set<string> } {
  const plansDir = path.join(projectPath, 'plans');
  const coveredPaths = new Set<string>();
  if (!fs.existsSync(plansDir)) return { plans: [], coveredPaths };

  // Build UUID→path map once so the plan walk can resolve testCaseId fallbacks
  // without a separate pass over the tests/ directory later.
  const idMap = buildTestCaseIdMap(projectPath);

  const plans: TestPlanInput[] = [];
  try {
    const entries = fs.readdirSync(plansDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const planPath = path.join(plansDir, entry.name);
      plans.push(readPlanDirectory(planPath, entry.name, projectPath, coveredPaths, idMap));
    }
  } catch { /* skip */ }

  return { plans, coveredPaths };
}

/**
 * Builds a map of testcase UUID (registryId / id / guid) → project-relative path.
 * Used as a fallback when testCasePath in a .testinstance file doesn't match
 * the on-disk relative path exactly (e.g. different path separators, moved files).
 */
function buildTestCaseIdMap(projectPath: string): Map<string, string> {
  const testsDir = path.join(projectPath, 'tests');
  const idMap = new Map<string, string>();
  if (!fs.existsSync(testsDir)) return idMap;

  function walk(dir: string): void {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(fullPath); }
        else if (entry.name.endsWith('.testcase')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const rel = path.relative(projectPath, fullPath).replace(/\\/g, '/');
            for (const attr of ['registryId', 'id', 'guid'] as const) {
              const m = content.match(new RegExp(`${attr}=["']([^"']+)["']`));
              if (m?.[1] && !idMap.has(m[1])) idMap.set(m[1], rel);
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  }
  walk(testsDir);
  return idMap;
}

/**
 * Collects all .testcase file basenames (without extension) found under tests/.
 * Includes callable tests (visibility="Internal") that have no plan instances,
 * so that checkCaseCalls can distinguish genuine missing-callee errors from
 * valid callable references.
 */
export function collectAllTestCaseNames(projectPath: string): string[] {
  const testsDir = path.join(projectPath, 'tests');
  if (!fs.existsSync(testsDir)) return [];
  const names: string[] = [];
  function walk(dir: string): void {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        if (entry.isDirectory()) { walk(path.join(dir, entry.name)); }
        else if (entry.name.endsWith('.testcase')) names.push(path.basename(entry.name, '.testcase'));
      }
    } catch { /* skip */ }
  }
  walk(testsDir);
  return names;
}

/**
 * @deprecated Covered paths are now computed as a byproduct of readPlansDir().
 * Use the coveredPaths returned by readPlansDir() instead.
 */
export function collectCoveredPathsFromDisk(projectPath: string): Set<string> {
  const plansDir = path.join(projectPath, 'plans');
  const covered = new Set<string>();
  if (!fs.existsSync(plansDir)) return covered;

  // UUID fallback: testCaseId in .testinstance → registryId/id/guid in .testcase
  const idMap = buildTestCaseIdMap(projectPath);

  function walk(dir: string): void {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(fullPath); }
        else if (entry.name.endsWith('.testinstance')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            // Primary: path-based match
            const pathM = content.match(/testCasePath=["']([^"']+)["']/);
            if (pathM?.[1]) covered.add(pathM[1].replace(/\\/g, '/'));
            // Fallback: UUID match via testCaseId → testcase registryId/id/guid
            const idM = content.match(/testCaseId=["']([^"']+)["']/);
            if (idM?.[1]) {
              const resolvedPath = idMap.get(idM[1]);
              if (resolvedPath) covered.add(resolvedPath);
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  }
  walk(plansDir);
  return covered;
}

export function findUncoveredTestCases(projectPath: string, coveredPaths: Set<string>): string[] {
  const testsDir = path.join(projectPath, 'tests');
  if (!fs.existsSync(testsDir)) return [];

  const uncovered: string[] = [];
  function walk(dir: string): void {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(fullPath); }
        else if (entry.name.endsWith('.testcase')) {
          const rel = path.relative(projectPath, fullPath).replace(/\\/g, '/');
          if (!coveredPaths.has(rel)) uncovered.push(rel);
        }
      }
    } catch { /* skip */ }
  }
  walk(testsDir);
  return uncovered.sort();
}

// ── QH-compatible output format ───────────────────────────────────────────────

interface QhViolation {
  number: number;
  ruleId: string;
  ruleName: string;
  ruleDescription: string;
  category: string;
  severity: string;
  weight: number;
  message: string;
  recommendation: string;
  appliesTo: string;
  testItemId?: number;
}

interface QhSection {
  level: string;
  contextName: string;
  qualityScore: number;
  qualityTier: string;
  totalViolations: number;
  violations: QhViolation[];
}

function hierarchyViolationToQh(v: HierarchyViolation, num: number): QhViolation {
  return {
    number: num,
    ruleId: v.rule_id,
    ruleName: v.name,
    ruleDescription: v.description,
    category: v.category,
    severity: toTitleCase(v.severity),
    weight: v.weight,
    message: v.message,
    recommendation: v.recommendation,
    appliesTo: v.applies_to.join(';'),
  };
}

function tcIssuesToQhViolations(tc: TestCaseResult): QhViolation[] {
  const violations: QhViolation[] = [];
  let num = 1;

  for (const issue of tc.issues) {
    violations.push({
      number: num++,
      ruleId: issue.rule_id,
      ruleName: issue.rule_id,
      ruleDescription: '',
      category: 'Validation',
      severity: issue.severity === 'ERROR' ? 'Major' : issue.severity === 'WARNING' ? 'Minor' : 'Info',
      weight: issue.severity === 'ERROR' ? 5 : issue.severity === 'WARNING' ? 2 : 1,
      message: issue.message,
      recommendation: issue.suggestion ?? '',
      appliesTo: issue.applies_to,
    });
  }

  for (const bp of (tc.best_practices_violations ?? [])) {
    violations.push({
      number: num++,
      ruleId: bp.rule_id,
      ruleName: bp.name,
      ruleDescription: bp.description,
      category: bp.category,
      severity: toTitleCase(bp.severity),
      weight: bp.weight,
      message: bp.message,
      recommendation: bp.recommendation,
      appliesTo: bp.applies_to.join(';'),
    });
  }

  return violations;
}

function tcTotalViolations(tc: TestCaseResult): number {
  return tc.issues.length + (tc.best_practices_violations?.length ?? 0);
}

function addSuiteSection(sections: QhSection[], suite: SuiteResult): void {
  sections.push({
    level: 'Test Suite',
    contextName: suite.name,
    qualityScore: suite.quality_score,
    qualityTier: toQualityTier(suite.quality_score),
    totalViolations: suite.violations.length,
    violations: suite.violations.map((v, i) => hierarchyViolationToQh(v, i + 1)),
  });

  for (const child of suite.test_suites) addSuiteSection(sections, child);

  for (const tc of suite.test_cases) {
    const total = tcTotalViolations(tc);
    if (total > 0) {
      sections.push({
        level: 'Test Case',
        contextName: tc.name,
        qualityScore: tc.quality_score,
        qualityTier: toQualityTier(tc.quality_score),
        totalViolations: total,
        violations: tcIssuesToQhViolations(tc),
      });
    }
  }
}

function addPlanSections(sections: QhSection[], plan: PlanResult): void {
  sections.push({
    level: 'Test Plan',
    contextName: plan.name,
    qualityScore: plan.quality_score,
    qualityTier: toQualityTier(plan.quality_score),
    totalViolations: plan.violations.length,
    violations: plan.violations.map((v, i) => hierarchyViolationToQh(v, i + 1)),
  });

  for (const suite of plan.test_suites) addSuiteSection(sections, suite);

  for (const tc of plan.test_cases) {
    const total = tcTotalViolations(tc);
    if (total > 0) {
      sections.push({
        level: 'Test Case',
        contextName: tc.name,
        qualityScore: tc.quality_score,
        qualityTier: toQualityTier(tc.quality_score),
        totalViolations: total,
        violations: tcIssuesToQhViolations(tc),
      });
    }
  }
}

function flattenToSections(result: ProjectResult): QhSection[] {
  const sections: QhSection[] = [];

  sections.push({
    level: 'Project',
    contextName: result.name,
    qualityScore: result.quality_score,
    qualityTier: toQualityTier(result.quality_score),
    totalViolations: result.violations.length,
    violations: result.violations.map((v, i) => hierarchyViolationToQh(v, i + 1)),
  });

  for (const suite of result.test_suites) addSuiteSection(sections, suite);

  for (const tc of result.test_cases) {
    const total = tcTotalViolations(tc);
    if (total > 0) {
      sections.push({
        level: 'Test Case',
        contextName: tc.name,
        qualityScore: tc.quality_score,
        qualityTier: toQualityTier(tc.quality_score),
        totalViolations: total,
        violations: tcIssuesToQhViolations(tc),
      });
    }
  }

  for (const plan of result.test_plans) addPlanSections(sections, plan);

  return sections;
}

export function buildQhReport(result: ProjectResult, projectName: string): Record<string, unknown> {
  const now = new Date();
  const summary = buildHierarchySummary(result);

  return {
    reportInfo: {
      name: `VR-LOCAL-${now.toISOString().replace(/[:.]/g, '-').slice(0, 19)}`,
      generatedAt: now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      exportedAt: now.toISOString(),
      source: 'provar-mcp-local',
    },
    summary: {
      qualityScore: result.quality_score,
      qualityGrade: toQualityGrade(result.quality_score),
      totalViolations: summary.total_violations,
      criticalViolations: summary.violations_by_severity.critical,
      majorViolations: summary.violations_by_severity.major,
      minorViolations: summary.violations_by_severity.minor,
      infoViolations: summary.violations_by_severity.info,
    },
    context: {
      validationLevel: 'Project',
      testProjectName: projectName,
    },
    sections: flattenToSections(result),
  };
}

export function saveResults(
  projectPath: string,
  resultsDir: string | undefined,
  report: Record<string, unknown>,
  projectName: string
): string {
  const targetDir = resultsDir
    ? path.resolve(resultsDir)
    : path.join(projectPath, 'provardx', 'validation');

  fs.mkdirSync(targetDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  const fileName = `${timestamp}-${safeName}.json`;
  const filePath = path.join(targetDir, fileName);

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
  // Return absolute path when results_dir is provided (avoids ugly ../../../../ relative traversal),
  // relative path otherwise (matches project-relative convention).
  if (resultsDir) return filePath.replace(/\\/g, '/');
  return path.relative(projectPath, filePath).replace(/\\/g, '/');
}

// ── Main exported function ────────────────────────────────────────────────────

/**
 * Validate a Provar project from a path on disk.
 *
 * Throws ProjectValidationError for user-facing problems (path not found,
 * ambiguous project, not a Provar project directory). Lets unexpected I/O
 * errors propagate as-is.
 */
export function validateProjectFromPath(
  options: ProjectValidationOptions
): ProjectValidationResult {
  const { project_path, quality_threshold, save_results, results_dir } = options;
  const resolved = path.resolve(project_path);

  if (!fs.existsSync(resolved)) {
    throw new ProjectValidationError('PATH_NOT_FOUND', `Project path does not exist: ${resolved}`);
  }

  const { root: projectRoot, candidates } = resolveProjectRoot(resolved);

  if (candidates.length > 1) {
    throw new ProjectValidationError(
      'AMBIGUOUS_PROJECT',
      `Multiple Provar projects found under "${resolved}". Specify the exact project directory: ${candidates.map((c) => path.basename(c)).join(', ')}`
    );
  }

  if (!fs.existsSync(path.join(projectRoot, '.testproject'))) {
    throw new ProjectValidationError(
      'NOT_A_PROJECT',
      `No Provar project found at "${projectRoot}". Ensure the path points to a directory containing a .testproject file.`
    );
  }

  const threshold = quality_threshold ?? 80;

  // 1. Read project context from .testproject
  const { projectName, context } = readProjectContext(projectRoot);

  // 2. Read plan hierarchy from plans/ directory; covered paths are computed
  //    as a byproduct of the walk — no second traversal needed.
  const { plans: testPlans, coveredPaths } = readPlansDir(projectRoot);

  // 3. Validate
  const input: ProjectInput = {
    name: projectName,
    test_plans: testPlans,
    test_suites: [],
    test_cases: [],
    project_context: context,
    all_disk_test_case_names: collectAllTestCaseNames(projectRoot),
  };

  const result = validateProject(input, threshold);
  const summary = buildHierarchySummary(result);

  // 4. Find uncovered test cases and compute accurate disk counts
  // coveredPaths was already built during step 2 — no second directory walk.
  const uncoveredTestCases = findUncoveredTestCases(projectRoot, coveredPaths);
  // Count only covered references where the .testcase file actually exists on disk
  const coveredOnDisk = [...coveredPaths].filter((rel) => fs.existsSync(path.join(projectRoot, rel))).length;

  // 5. Build detailed plan results
  const plans: ValidatedPlan[] = result.test_plans.map((p) => ({
    name: p.name,
    quality_score: p.quality_score,
    violations: p.violations,
    suites: p.test_suites.map((s) => ({
      name: s.name,
      quality_score: s.quality_score,
      violations: s.violations,
      test_cases: s.test_cases.map((tc) => ({
        name: tc.name,
        quality_score: tc.quality_score,
        quality_tier: toQualityTier(tc.quality_score),
        status: tc.status,
        is_valid: tc.is_valid,
        step_count: tc.step_count,
        error_count: tc.error_count,
        warning_count: tc.warning_count,
        issues: tc.issues,
      })),
      child_suites: s.test_suites.map((cs) => ({
        name: cs.name,
        quality_score: cs.quality_score,
        violations: cs.violations,
        test_case_count: cs.test_cases.length,
      })),
    })),
    unplanned_test_cases: p.test_cases.map((tc) => ({
      name: tc.name,
      quality_score: tc.quality_score,
      status: tc.status,
      error_count: tc.error_count,
      issues: tc.issues,
    })),
  }));

  // 6. Optionally save QH report
  let savedTo: string | null = null;
  let saveError: string | undefined;
  if (save_results !== false) {
    const report = buildQhReport(result, projectName);
    try {
      savedTo = saveResults(projectRoot, results_dir, report, projectName);
    } catch (err) {
      saveError = (err as Error).message;
    }
  }

  return {
    project_path: projectRoot,
    project_name: projectName,
    quality_score: result.quality_score,
    quality_tier: toQualityTier(result.quality_score),
    quality_grade: toQualityGrade(result.quality_score),
    summary,
    project_violations: result.violations,
    plans,
    coverage: {
      total_test_cases_on_disk: coveredOnDisk + uncoveredTestCases.length,
      covered_by_plans: coveredOnDisk,
      uncovered_count: uncoveredTestCases.length,
      uncovered_test_cases: uncoveredTestCases,
    },
    saved_to: savedTo,
    save_error: saveError,
  };
}
