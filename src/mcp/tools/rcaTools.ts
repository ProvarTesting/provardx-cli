/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { XMLParser } from 'fast-xml-parser';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { makeError, makeRequestId } from '../schemas/common.js';
import { log } from '../logging/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LocateResult {
  requestId: string;
  results_dir: string;
  junit_xml: string | null;
  index_html: string | null;
  per_test_reports: Array<{ test_name: string; html_path: string }>;
  validation_reports: string[];
  run_index: number | null;
  disposition: string;
  resolution_source: string;
}

interface FailureReport {
  test_case: string;
  error_class: string | null;
  error_message: string;
  root_cause_category: string;
  root_cause_summary: string;
  recommendation: string;
  page_object: string | null;
  operation: string | null;
  report_html: string | null;
  screenshot_dir: string | null;
  pre_existing: boolean;
}

// ── Root cause classification ─────────────────────────────────────────────────

interface RcaRule {
  category: string;
  pattern: RegExp;
  summary: string;
  recommendation: string;
}

const RCA_RULES: RcaRule[] = [
  {
    category: 'DRIVER_VERSION_MISMATCH',
    pattern: /SessionNotCreatedException.*Chrome version|Chrome version must be between/i,
    summary: 'WebDriver version incompatible with Chrome',
    recommendation: 'Update ChromeDriver to match installed Chrome, or pin Chrome version in CI',
  },
  {
    category: 'LOCATOR_STALE',
    pattern: /NoSuchElementException|ElementNotVisibleException|StaleElementReferenceException/i,
    summary: 'Page object selector no longer matches current UI',
    recommendation: 'Re-capture the failing element in Provar IDE',
  },
  {
    category: 'TIMEOUT',
    pattern: /TimeoutException|ElementClickInterceptedException|timed out/i,
    summary: 'Element or operation did not complete in time',
    recommendation: 'Increase step timeout or add explicit wait; check org performance',
  },
  {
    category: 'ASSERTION_FAILED',
    pattern: /AssertionException|UiAssert|AssertionError/i,
    summary: 'Test assertion failed',
    recommendation: 'Verify expected value is correct for current org state',
  },
  {
    category: 'SALESFORCE_VALIDATION',
    pattern: /Required fields are missing:\s*\[/i,
    summary: 'Salesforce required-field validation failed',
    recommendation: 'Ensure all required fields have values; check field-level security for the running user',
  },
  {
    category: 'SALESFORCE_PICKLIST',
    pattern: /bad value for restricted picklist field/i,
    summary: 'Invalid picklist value used',
    recommendation:
      'Query valid picklist values (run metadata download or Apex describe); check for trailing spaces or case differences',
  },
  {
    category: 'SALESFORCE_REFERENCE',
    pattern: /INVALID_CROSS_REFERENCE_KEY/i,
    summary: 'Referenced record ID does not exist or is inaccessible',
    recommendation: 'Verify the referenced record exists and the running user has access to it',
  },
  {
    category: 'SALESFORCE_ACCESS',
    pattern: /INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY/i,
    summary: 'Running user lacks permission on a referenced record',
    recommendation: 'Grant the running user appropriate object and record-level permissions',
  },
  {
    category: 'SALESFORCE_TRIGGER',
    pattern: /FIELD_CUSTOM_VALIDATION_EXCEPTION/i,
    summary: 'A Salesforce validation rule or trigger blocked the DML operation',
    recommendation:
      'Review validation rules and triggers on the target object; ensure test data satisfies all business rules',
  },
  {
    category: 'CREDENTIAL_FAILURE',
    pattern: /InvalidPasswordException|AuthenticationException|INVALID_LOGIN/i,
    summary: 'Salesforce login failed',
    recommendation: 'Refresh credentials in .secrets or .testproject',
  },
  {
    category: 'MISSING_CALLABLE',
    pattern: /caseCall.*cannot.*resolv|callable.*not.*found/i,
    summary: 'caseCall references unresolvable callable',
    recommendation: 'Use provar.project.validate to diagnose PROJ-CALLABLE violations',
  },
  {
    category: 'METADATA_CACHE',
    pattern: /Loading index of metadata|CachingException|metadata.*fail/i,
    summary: 'Metadata loading or caching failed',
    recommendation: 'Set metadataLevel to Refresh and re-run',
  },
  {
    category: 'PAGE_OBJECT_COMPILE',
    pattern: /ClassNotFoundException|CompilationException/i,
    summary: 'Page object class not compiled',
    recommendation: 'Run provar.automation.compile before testrun',
  },
  {
    category: 'CONNECTION_REFUSED',
    pattern: /WebDriverException|SessionNotCreatedException|browser.*launch.*fail/i,
    summary: 'Browser or WebDriver session failed',
    recommendation: 'Check WebDriver version compatibility',
  },
  {
    category: 'DATA_SETUP',
    pattern: /SetValues.*fail|ApexCreateObject.*fail/i,
    summary: 'Data setup precondition failed',
    recommendation: 'Run data setup callable first',
  },
  {
    category: 'LICENSE_INVALID',
    pattern: /LicenseException|license.*expired|license.*invalid/i,
    summary: 'Provar license invalid or expired',
    recommendation: 'Check license status, contact Provar support',
  },
];

const UNKNOWN_RULE: RcaRule = {
  category: 'UNKNOWN',
  pattern: /.*/,
  summary: 'Cause undetermined',
  recommendation: 'Review full failure message and screenshot',
};

function classifyFailure(text: string): RcaRule {
  for (const rule of RCA_RULES) {
    if (rule.pattern.test(text)) return rule;
  }
  return UNKNOWN_RULE;
}

const INFRA_CATEGORIES = new Set([
  'CREDENTIAL_FAILURE',
  'METADATA_CACHE',
  'PAGE_OBJECT_COMPILE',
  'CONNECTION_REFUSED',
  'DRIVER_VERSION_MISMATCH',
  'LICENSE_INVALID',
]);

// ── Filesystem helpers ────────────────────────────────────────────────────────

/**
 * Walk a directory recursively and collect files matching a predicate.
 */
function walkFiles(dir: string, predicate: (filePath: string) => boolean): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walkFiles(full, predicate));
      } else if (entry.isFile() && predicate(full)) {
        results.push(full);
      }
    }
  } catch {
    // ignore permission errors
  }
  return results;
}

/**
 * List immediate numeric child directories of a directory.
 */
function numericChildDirs(dir: string): number[] {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^\d+$/.test(e.name))
      .map((e) => parseInt(e.name, 10))
      .filter((n) => n > 0);
  } catch {
    return [];
  }
}

/**
 * Find Provar Increment-mode sibling directories next to resultsBase.
 * Provar creates Results, Results(1), Results(2), … as siblings in the same
 * parent directory — NOT as numeric children of Results. Returns the numeric
 * suffixes of all matching siblings (e.g. [1, 2, 18]).
 */
function incrementSiblingDirs(resultsBase: string): number[] {
  const parent = path.dirname(resultsBase);
  const base = path.basename(resultsBase);
  if (!fs.existsSync(parent)) return [];
  try {
    const safeName = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${safeName}\\((\\d+)\\)$`);
    return fs
      .readdirSync(parent, { withFileTypes: true })
      .filter((e) => e.isDirectory() && pattern.test(e.name))
      .map((e) => parseInt((pattern.exec(e.name) as RegExpExecArray)[1], 10))
      .filter((n) => n > 0);
  } catch {
    return [];
  }
}

/**
 * Expand ${env.VAR} placeholders in a string using process.env.
 */
function expandEnvVars(value: string): string {
  return value.replace(/\$\{env\.([^}]+)\}/g, (_, varName: string) => process.env[varName] ?? '');
}

// ── Resolution algorithm ──────────────────────────────────────────────────────

interface ResolvedLocation {
  results_dir: string;
  run_index: number | null;
  disposition: string;
  resolution_source: string;
}

interface ResultsFromProps {
  resultsBase: string;
  disposition: string;
}

function readResultsFromSfConfig(): ResultsFromProps | null {
  try {
    const sfConfigPath = path.join(os.homedir(), '.sf', 'config.json');
    if (!fs.existsSync(sfConfigPath)) return null;
    const sfConfig = JSON.parse(fs.readFileSync(sfConfigPath, 'utf-8')) as Record<string, unknown>;
    const propFilePath = sfConfig['PROVARDX_PROPERTIES_FILE_PATH'] as string | undefined;
    if (!propFilePath || !fs.existsSync(propFilePath)) return null;
    const props = JSON.parse(fs.readFileSync(propFilePath, 'utf-8')) as Record<string, unknown>;
    const rp = props['resultsPath'] as string | undefined;
    if (!rp) return null;
    return { resultsBase: rp, disposition: (props['resultsPathDisposition'] as string | undefined) ?? 'Replace' };
  } catch {
    return null;
  }
}

function readResultsFromPropertiesFile(projectPath: string): ResultsFromProps | null {
  try {
    const entries = fs.readdirSync(projectPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/provardx-properties.*\.json/i.test(entry.name)) continue;
      try {
        const props = JSON.parse(fs.readFileSync(path.join(projectPath, entry.name), 'utf-8')) as Record<
          string,
          unknown
        >;
        const rp = props['resultsPath'] as string | undefined;
        if (rp)
          return { resultsBase: rp, disposition: (props['resultsPathDisposition'] as string | undefined) ?? 'Replace' };
      } catch {
        // ignore individual file parse errors
      }
    }
  } catch {
    // ignore readdir errors
  }
  return null;
}

function readResultsFromAntBuildXml(projectPath: string): string | null {
  try {
    const buildXmlPath = path.join(projectPath, 'ANT', 'build.xml');
    if (!fs.existsSync(buildXmlPath)) return null;
    const xmlContent = fs.readFileSync(buildXmlPath, 'utf-8');
    const match = /<property\s+name="testproject\.results"\s+value="([^"]+)"/i.exec(xmlContent);
    return match ? expandEnvVars(match[1]) : null;
  } catch {
    return null;
  }
}

function resolveResultsLocation(
  project_path: string,
  results_path: string | undefined,
  run_index: number | undefined
): ResolvedLocation | { error: string; message: string } {
  let resultsBase: string | null = null;
  let disposition = 'Replace';
  let resolution_source = 'explicit';

  if (results_path) {
    resultsBase = results_path;
  } else {
    const fromSf = readResultsFromSfConfig();
    if (fromSf) {
      resultsBase = fromSf.resultsBase;
      disposition = fromSf.disposition;
      resolution_source = 'sf_config';
    } else {
      const fromFile = readResultsFromPropertiesFile(project_path);
      if (fromFile) {
        resultsBase = fromFile.resultsBase;
        disposition = fromFile.disposition;
        resolution_source = 'properties_file';
      } else {
        const fromAnt = readResultsFromAntBuildXml(project_path);
        if (fromAnt) {
          resultsBase = fromAnt;
          resolution_source = 'ant_build_xml';
        }
      }
    }
  }

  if (!resultsBase) {
    return {
      error: 'RESULTS_NOT_CONFIGURED',
      message: 'Could not determine results directory from sf config, properties file, or ANT build.xml',
    };
  }

  // Increment resolution
  // Provar's primary Increment pattern: Results, Results(1), Results(2)… as siblings.
  // Legacy fallback: purely-numeric children (Results/1/, Results/2/…).
  const siblings = incrementSiblingDirs(resultsBase);
  const numericDirs = numericChildDirs(resultsBase);
  if (disposition === 'Increment' || siblings.length > 0 || numericDirs.length > 0) {
    if (siblings.length > 0) {
      const targetIndex = run_index ?? Math.max(...siblings);
      return {
        results_dir: path.join(path.dirname(resultsBase), `${path.basename(resultsBase)}(${targetIndex})`),
        run_index: targetIndex,
        disposition,
        resolution_source,
      };
    }
    if (numericDirs.length > 0) {
      const targetIndex = run_index ?? Math.max(...numericDirs);
      return {
        results_dir: path.join(resultsBase, String(targetIndex)),
        run_index: targetIndex,
        disposition,
        resolution_source,
      };
    }
    // Disposition is Increment but no numbered dirs yet — fall through to base
  }

  return {
    results_dir: resultsBase,
    run_index: null,
    disposition,
    resolution_source,
  };
}

// ── provar.testrun.report.locate tool ─────────────────────────────────────────

export function registerTestRunLocate(server: McpServer): void {
  server.tool(
    'provar.testrun.report.locate',
    [
      'Resolve exactly where Provar test run artifacts were written, without parsing them.',
      'Returns the results directory, paths to JUnit.xml and Index.html if they exist,',
      'paths to per-test HTML reports, and any validation JSON files.',
      'Supports explicit results_path override or auto-detection from sf config, provardx properties file, or ANT build.xml.',
    ].join(' '),
    {
      project_path: z.string().describe('Absolute path to the Provar project root'),
      results_path: z
        .string()
        .optional()
        .describe('Explicit override for the results base directory; if provided, skip auto-detection'),
      run_index: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Which Increment run to target (default: latest); must be a positive integer'),
    },
    (input) => {
      const requestId = makeRequestId();
      log('info', 'provar.testrun.report.locate', { requestId });

      try {
        const resolved = resolveResultsLocation(input.project_path, input.results_path, input.run_index);
        if ('error' in resolved) {
          const err = makeError(resolved.error, resolved.message, requestId);
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
        }

        const { results_dir, run_index: resolvedRunIndex, disposition, resolution_source } = resolved;

        // Check for JUnit.xml and Index.html
        const junitPath = path.join(results_dir, 'JUnit.xml');
        const indexPath = path.join(results_dir, 'Index.html');
        const junit_xml = fs.existsSync(junitPath) ? junitPath : null;
        const index_html = fs.existsSync(indexPath) ? indexPath : null;

        // Collect per-test HTML reports (*.testcase.html)
        const htmlFiles = walkFiles(results_dir, (f) => f.endsWith('.testcase.html'));
        const per_test_reports = htmlFiles.map((htmlPath) => ({
          test_name: path.basename(htmlPath, '.html'),
          html_path: htmlPath,
        }));

        // Collect validation reports
        const validationDir = path.join(input.project_path, 'provardx', 'validation');
        const validation_reports: string[] = [];
        if (fs.existsSync(validationDir)) {
          try {
            const entries = fs.readdirSync(validationDir);
            for (const entry of entries) {
              if (entry.endsWith('.json')) {
                validation_reports.push(path.join(validationDir, entry));
              }
            }
          } catch {
            // ignore
          }
        }

        const result: LocateResult = {
          requestId,
          results_dir,
          junit_xml,
          index_html,
          per_test_reports,
          validation_reports,
          run_index: resolvedRunIndex,
          disposition,
          resolution_source,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
      } catch (err: unknown) {
        const error = err as Error;
        const errResult = makeError('LOCATE_ERROR', error.message, requestId);
        log('error', 'provar.testrun.report.locate failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}

// ── JUnit XML parsing ─────────────────────────────────────────────────────────

interface ParsedJUnit {
  total: number;
  passed: number;
  failures: number;
  errors: number;
  skipped: number;
  duration_seconds: number;
  testcases: Array<{ name: string; failureText: string | null; isSkipped: boolean }>;
}

function parseJUnit(xmlContent: string): ParsedJUnit {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    allowBooleanAttributes: true,
    parseAttributeValue: true,
    textNodeName: '#text',
    isArray: (tagName) => ['testsuite', 'testcase', 'failure', 'error'].includes(tagName),
  });

  const doc = parser.parse(xmlContent) as Record<string, unknown>;

  // Normalise to array of testsuites
  let suites: Array<Record<string, unknown>> = [];
  if (doc['testsuites']) {
    const ts = (doc['testsuites'] as Record<string, unknown>)['testsuite'];
    suites = Array.isArray(ts) ? (ts as Array<Record<string, unknown>>) : ts ? [ts as Record<string, unknown>] : [];
  } else if (doc['testsuite']) {
    const ts = doc['testsuite'];
    suites = Array.isArray(ts) ? (ts as Array<Record<string, unknown>>) : [ts as Record<string, unknown>];
  }

  let total = 0;
  let failures = 0;
  let errors = 0;
  let skipped = 0;
  let duration_seconds = 0;
  const testcases: ParsedJUnit['testcases'] = [];

  for (const suite of suites) {
    // Prefer attribute-level counts for the suite, fall back to counting testcases
    const suiteTests = Number(suite['tests'] ?? 0);
    const suiteFailures = Number(suite['failures'] ?? 0);
    const suiteErrors = Number(suite['errors'] ?? 0);
    const suiteSkipped = Number(suite['skipped'] ?? 0);
    const suiteTime = Number(suite['time'] ?? 0);

    total += suiteTests;
    failures += suiteFailures;
    errors += suiteErrors;
    skipped += suiteSkipped;
    duration_seconds += suiteTime;

    const rawTestcases = suite['testcase'];
    const tcArray: Array<Record<string, unknown>> = Array.isArray(rawTestcases)
      ? (rawTestcases as Array<Record<string, unknown>>)
      : rawTestcases
      ? [rawTestcases as Record<string, unknown>]
      : [];

    for (const tc of tcArray) {
      const name = String(tc['name'] ?? '');
      const isSkipped = tc['skipped'] !== undefined;

      // Extract failure/error text
      let failureText: string | null = null;
      const failureArr = tc['failure'];
      const errorArr = tc['error'];

      const extractText = (arr: unknown): string | null => {
        if (!arr) return null;
        const items = Array.isArray(arr) ? (arr as unknown[]) : [arr];
        for (const item of items) {
          if (typeof item === 'string' && item.trim()) return item.trim();
          if (typeof item === 'object' && item !== null) {
            const obj = item as Record<string, unknown>;
            const text = obj['#text'] ?? obj['message'] ?? obj[''];
            if (typeof text === 'string' && text.trim()) return text.trim();
          }
        }
        return null;
      };

      failureText = extractText(failureArr) ?? extractText(errorArr);

      testcases.push({ name, failureText, isSkipped });
    }
  }

  // If total wasn't set from suite attributes, compute from testcases
  if (total === 0 && testcases.length > 0) {
    total = testcases.length;
  }

  const passed = total - failures - errors - skipped;

  return { total, passed: Math.max(0, passed), failures, errors, skipped, duration_seconds, testcases };
}

// ── RCA handler helpers ───────────────────────────────────────────────────────

function collectValidationReports(projectPath: string): string[] {
  const validationDir = path.join(projectPath, 'provardx', 'validation');
  if (!fs.existsSync(validationDir)) return [];
  try {
    return fs
      .readdirSync(validationDir)
      .filter((e) => e.endsWith('.json'))
      .map((e) => path.join(validationDir, e));
  } catch {
    return [];
  }
}

function buildPriorFailureSet(resultsDir: string, resolvedRunIndex: number | null): Set<string> {
  const names = new Set<string>();
  if (resolvedRunIndex === null) return names;
  const resultsBase = path.dirname(resultsDir);
  const priorDirs = numericChildDirs(resultsBase).filter((n) => n < resolvedRunIndex);
  for (const priorIdx of priorDirs) {
    const priorJunit = path.join(resultsBase, String(priorIdx), 'JUnit.xml');
    if (!fs.existsSync(priorJunit)) continue;
    try {
      const priorParsed = parseJUnit(fs.readFileSync(priorJunit, 'utf-8'));
      for (const tc of priorParsed.testcases) {
        if (tc.failureText !== null) names.add(tc.name);
      }
    } catch {
      // ignore
    }
  }
  return names;
}

type ParsedTestCase = { name: string; failureText: string | null; isSkipped: boolean };

function buildFailureReports(
  testcases: ParsedTestCase[],
  htmlFiles: string[],
  screenshotDir: string | null,
  priorFailed: Set<string>
): FailureReport[] {
  const errorClassPatterns = [
    'NoSuchElementException',
    'TimeoutException',
    'AssertionException',
    'SessionNotCreatedException',
    'WebDriverException',
    'ClassNotFoundException',
    'LicenseException',
    'InvalidPasswordException',
  ];
  const reports: FailureReport[] = [];
  for (const tc of testcases) {
    if (tc.failureText === null || tc.isSkipped) continue;
    const failureText = tc.failureText;
    const rule = classifyFailure(failureText);
    let error_class: string | null = null;
    for (const cls of errorClassPatterns) {
      if (failureText.includes(cls)) {
        error_class = cls;
        break;
      }
    }
    const poMatch = /Page Object:\s*([\w.]+)/i.exec(failureText);
    const opMatch = /operation:\s*(\w+)/i.exec(failureText);
    const matchingHtml = htmlFiles.find((f) => path.basename(f) === `${tc.name}.html`);
    reports.push({
      test_case: tc.name,
      error_class,
      error_message: failureText.slice(0, 500),
      root_cause_category: rule.category,
      root_cause_summary: rule.summary,
      recommendation: rule.recommendation,
      page_object: poMatch ? poMatch[1] : null,
      operation: opMatch ? opMatch[1] : null,
      report_html: matchingHtml ?? null,
      screenshot_dir: screenshotDir,
      pre_existing: priorFailed.has(tc.name),
    });
  }
  return reports;
}

// ── provar.testrun.rca tool ───────────────────────────────────────────────────

export function registerTestRunRca(server: McpServer): void {
  server.tool(
    'provar.testrun.rca',
    [
      'Parse a completed Provar test run and produce a structured Root Cause Analysis (RCA) report.',
      'Resolves the results directory, parses JUnit.xml, classifies each failure by category,',
      'and produces recommendations. Use locate_only=true to skip parsing and just resolve artifact locations.',
    ].join(' '),
    {
      project_path: z.string().describe('Absolute path to the Provar project root'),
      results_path: z.string().optional().describe('Explicit override for the results base directory'),
      run_index: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Which Increment run to target (default: latest); must be a positive integer'),
      locate_only: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, skip parsing and return just artifact locations'),
    },
    (input) => {
      const requestId = makeRequestId();
      log('info', 'provar.testrun.rca', { requestId, locate_only: input.locate_only });

      try {
        // ── Resolve location ─────────────────────────────────────────────────
        const resolved = resolveResultsLocation(input.project_path, input.results_path, input.run_index);
        if ('error' in resolved) {
          const err = makeError(resolved.error, resolved.message, requestId);
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
        }

        const { results_dir, run_index: resolvedRunIndex, disposition, resolution_source } = resolved;

        const junitPath = path.join(results_dir, 'JUnit.xml');
        const indexPath = path.join(results_dir, 'Index.html');
        const junit_xml = fs.existsSync(junitPath) ? junitPath : null;
        const index_html = fs.existsSync(indexPath) ? indexPath : null;

        const htmlFiles = walkFiles(results_dir, (f) => f.endsWith('.testcase.html'));
        const per_test_reports = htmlFiles.map((htmlPath) => ({
          test_name: path.basename(htmlPath, '.html'),
          html_path: htmlPath,
        }));

        const validation_reports = collectValidationReports(input.project_path);

        const locateResult: LocateResult = {
          requestId,
          results_dir,
          junit_xml,
          index_html,
          per_test_reports,
          validation_reports,
          run_index: resolvedRunIndex,
          disposition,
          resolution_source,
        };

        // ── locate_only shortcut ─────────────────────────────────────────────
        if (input.locate_only) {
          const result = {
            ...locateResult,
            rca_skipped: true,
            failures: [],
            infrastructure_issues: [],
            recommendations: [],
          };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          };
        }

        // ── Check JUnit.xml exists ───────────────────────────────────────────
        if (!junit_xml) {
          const result = {
            requestId,
            results_dir,
            run_in_progress: true as const,
            message: 'JUnit.xml not found — test run may still be in progress or has not started',
            failures: [],
            infrastructure_issues: [],
            recommendations: [],
          };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          };
        }

        // ── Parse JUnit.xml ──────────────────────────────────────────────────
        const xmlContent = fs.readFileSync(junit_xml, 'utf-8');
        const parsed = parseJUnit(xmlContent);

        const run_summary = {
          results_dir,
          total: parsed.total,
          passed: parsed.passed,
          failures: parsed.failures,
          errors: parsed.errors,
          skipped: parsed.skipped,
          duration_seconds: parsed.duration_seconds,
        };

        // ── Build failure reports ────────────────────────────────────────────
        const artifactsDir = path.join(results_dir, 'Artifacts');
        const screenshot_dir = fs.existsSync(artifactsDir) ? artifactsDir : null;
        const priorFailedTestNames = buildPriorFailureSet(results_dir, resolvedRunIndex);
        const failureReports = buildFailureReports(parsed.testcases, htmlFiles, screenshot_dir, priorFailedTestNames);

        // ── Infrastructure issues ────────────────────────────────────────────
        const infrastructure_issues = failureReports
          .filter((fr) => INFRA_CATEGORIES.has(fr.root_cause_category))
          .map((fr) => `${fr.test_case}: [${fr.root_cause_category}] ${fr.root_cause_summary}`);

        // ── Recommendations (deduplicated) ───────────────────────────────────
        const recommendations = [...new Set(failureReports.map((fr) => fr.recommendation))];

        const result = {
          requestId,
          results_dir,
          run_summary,
          failures: failureReports,
          infrastructure_issues,
          recommendations,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
      } catch (err: unknown) {
        const error = err as Error;
        const errResult = makeError('RCA_ERROR', error.message, requestId);
        log('error', 'provar.testrun.rca failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}

// ── Registration entry point ──────────────────────────────────────────────────

export function registerAllRcaTools(server: McpServer): void {
  registerTestRunLocate(server);
  registerTestRunRca(server);
}
