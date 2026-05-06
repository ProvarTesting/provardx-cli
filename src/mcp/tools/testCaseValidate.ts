/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { XMLParser } from 'fast-xml-parser';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from '../server.js';
import { assertPathAllowed, PathPolicyError } from '../security/pathPolicy.js';
import { makeError, makeRequestId, type ValidationIssue } from '../schemas/common.js';
import { log } from '../logging/logger.js';
import { resolveApiKey } from '../../services/auth/credentials.js';
import {
  qualityHubClient,
  getQualityHubBaseUrl,
  QualityHubAuthError,
  QualityHubRateLimitError,
  REQUEST_ACCESS_URL,
} from '../../services/qualityHub/client.js';
import { runBestPractices } from './bestPracticesEngine.js';

const ONBOARDING_MESSAGE =
  'Quality Hub validation unavailable — running local validation only (structural rules, no quality scoring).\n' +
  'To enable Quality Hub (170 rules): run sf provar auth login\n' +
  'For CI/CD: set the PROVAR_API_KEY environment variable.\n' +
  `No account? Request access at: ${REQUEST_ACCESS_URL}`;

const AUTH_WARNING =
  'Quality Hub API key is invalid or expired. Running local validation only.\n' +
  `Run sf provar auth login to get a new key, or request access at: ${REQUEST_ACCESS_URL}`;

const RATE_LIMIT_WARNING = 'Quality Hub API rate limit reached. Running local validation only. Try again shortly.';

const UNREACHABLE_WARNING =
  'Quality Hub API unreachable. Running local validation only (structural rules, no quality scoring).\n' +
  'For CI/CD: set PROVAR_QUALITY_HUB_URL and PROVAR_API_KEY environment variables.';

export function registerTestCaseValidate(server: McpServer, config: ServerConfig): void {
  server.registerTool(
    'provar_testcase_validate',
    {
      title: 'Validate Test Case',
      description:
        'Validate a Provar XML test case for structural correctness and quality. Checks XML declaration, root element, required attributes (guid UUID v4, testItemId integer), <steps> presence, and applies best-practice rules. When a Provar API key is configured (via sf provar auth login or PROVAR_API_KEY env var), calls the Quality Hub API for full 170-rule scoring. Falls back to local validation if no key is set or the API is unavailable. Returns validity_score (schema compliance), quality_score (best practices, 0–100), and validation_source indicating which ruleset was applied. When structural errors are returned, consult the provar://docs/step-reference MCP resource for correct step attribute schemas.',
      inputSchema: {
        content: z.string().optional().describe('XML content to validate directly (alias: xml)'),
        xml: z.string().optional().describe('XML content to validate — API-compatible alias for content'),
        file_path: z.string().optional().describe('Path to .xml test case file'),
      },
    },
    async ({ content, xml, file_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar_testcase_validate', { requestId, has_content: !!(content ?? xml), file_path });

      try {
        // Resolve xml alias: the batch validation API uses "xml", MCP originally used "content"
        let source = content ?? xml;

        if (!source && file_path) {
          assertPathAllowed(file_path, config.allowedPaths);
          const resolved = path.resolve(file_path);
          if (!fs.existsSync(resolved)) {
            const err = makeError('FILE_NOT_FOUND', `File not found: ${resolved}`, requestId);
            return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
          }
          source = fs.readFileSync(resolved, 'utf-8');
        }

        if (!source) {
          const err = makeError('MISSING_INPUT', 'Provide either content or file_path.', requestId);
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
        }

        const apiKey = resolveApiKey();

        if (apiKey) {
          const baseUrl = getQualityHubBaseUrl();
          try {
            const apiResult = await qualityHubClient.validateTestCaseViaApi(source, apiKey, baseUrl);
            const localMeta = validateTestCase(source);
            const result = {
              requestId,
              ...apiResult,
              step_count: localMeta.step_count,
              error_count: apiResult.issues.filter((i) => i.severity === 'ERROR').length,
              warning_count: apiResult.issues.filter((i) => i.severity === 'WARNING').length,
              test_case_id: localMeta.test_case_id,
              test_case_name: localMeta.test_case_name,
              validation_source: 'quality_hub' as const,
            };
            log('info', 'provar_testcase_validate: quality_hub', { requestId });
            return {
              content: [{ type: 'text' as const, text: JSON.stringify(result) }],
              structuredContent: result,
            };
          } catch (apiErr: unknown) {
            // API failed — determine the warning and fall through to local validation
            let warning: string;
            if (apiErr instanceof QualityHubAuthError) {
              warning = AUTH_WARNING;
              log('warn', 'provar_testcase_validate: auth error, falling back', { requestId });
            } else if (apiErr instanceof QualityHubRateLimitError) {
              warning = RATE_LIMIT_WARNING;
              log('warn', 'provar_testcase_validate: rate limited, falling back', { requestId });
            } else {
              warning = UNREACHABLE_WARNING;
              log('warn', 'provar_testcase_validate: api unreachable, falling back', { requestId });
            }
            const localResult = {
              requestId,
              ...validateTestCase(source),
              validation_source: 'local_fallback' as const,
              validation_warning: warning,
            };
            return {
              content: [{ type: 'text' as const, text: JSON.stringify(localResult) }],
              structuredContent: localResult,
            };
          }
        }

        // No API key configured — run local validation with onboarding message
        const result = {
          requestId,
          ...validateTestCase(source),
          validation_source: 'local' as const,
          validation_warning: ONBOARDING_MESSAGE,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (err: unknown) {
        const error = err as Error & { code?: string };
        const errResult = makeError(
          error instanceof PathPolicyError ? error.code : 'VALIDATE_ERROR',
          error.message,
          requestId,
          false
        );
        log('error', 'provar_testcase_validate failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}

// ── Validator (ported from quality-hub-agents/lambda/src/validator/handler.py) ──

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface TestCaseValidationResult {
  is_valid: boolean;
  validity_score: number;
  quality_score: number;
  test_case_id: string | null;
  test_case_name: string | null;
  step_count: number;
  error_count: number;
  warning_count: number;
  issues: ValidationIssue[];
  /** Violations from the Best Practices Engine (same rules as the Quality Hub API). */
  best_practices_violations?: Array<import('./bestPracticesEngine.js').BPViolation>;
  best_practices_rules_evaluated?: number;
  /** Which ruleset produced this result. Always present. */
  validation_source: 'quality_hub' | 'local' | 'local_fallback';
  /** Set when falling back to local — explains why and what to do. */
  validation_warning?: string;
}

/**
 * Reads a test case file from disk, validates it, and returns the result.
 * Used by Wave 2 (testCaseGenerate) and Wave 3 (testCaseStepEdit) to validate
 * after mutations without spawning a separate MCP tool call.
 * Throws on path-policy violation or missing file.
 */
export function validateTestCaseXml(filePath: string, config: ServerConfig): TestCaseValidationResult {
  assertPathAllowed(filePath, config.allowedPaths);
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw Object.assign(new Error(`File not found: ${resolved}`), { code: 'TESTCASE_FILE_NOT_FOUND' });
  }
  return validateTestCase(fs.readFileSync(resolved, 'utf-8'));
}

/** TC_010/TC_011: validate testCase id and guid attributes. */
function checkTestCaseIdAndGuid(tcId: string | null, tcGuid: string | undefined, issues: ValidationIssue[]): void {
  if (!tcId) {
    issues.push({
      rule_id: 'TC_010',
      severity: 'ERROR',
      message: 'testCase missing required id attribute.',
      applies_to: 'testCase',
      suggestion: 'Add id="1" to testCase element (Provar requires the integer literal "1").',
    });
  } else if (tcId !== '1') {
    issues.push({
      rule_id: 'TC_010',
      severity: 'ERROR',
      message: `testCase id="${tcId}" is invalid — Provar requires id="1" (integer literal).`,
      applies_to: 'testCase',
      suggestion: 'Set id="1" on the testCase element. The unique identifier is the guid attribute, not id.',
    });
  }
  if (!tcGuid) {
    issues.push({
      rule_id: 'TC_011',
      severity: 'ERROR',
      message: 'testCase missing required guid attribute.',
      applies_to: 'testCase',
      suggestion: 'Add guid attribute (UUID v4) to testCase element.',
    });
  } else if (!UUID_V4_RE.test(tcGuid)) {
    issues.push({
      rule_id: 'TC_012',
      severity: 'ERROR',
      message: `testCase guid "${tcGuid}" is not a valid UUID v4.`,
      applies_to: 'testCase',
      suggestion:
        'Replace with a valid UUID v4 — e.g. crypto.randomUUID(). The 4th segment must begin with 8, 9, a, or b.',
    });
  }
}

/** Pure function — exported for unit testing */
export function validateTestCase(xmlContent: string, testName?: string): TestCaseValidationResult {
  const issues: ValidationIssue[] = [];

  // TC_001: XML declaration
  if (!xmlContent.trimStart().startsWith('<?xml')) {
    issues.push({
      rule_id: 'TC_001',
      severity: 'ERROR',
      message: 'Missing XML declaration. File must start with <?xml version="1.0" encoding="UTF-8"?>.',
      applies_to: 'document',
      suggestion: 'Add XML declaration as the first line.',
    });
  }

  // Parse
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
  });
  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xmlContent) as Record<string, unknown>;
  } catch (e: unknown) {
    const parseError = e as Error;
    issues.push({
      rule_id: 'TC_002',
      severity: 'ERROR',
      message: `XML parse error: ${parseError.message}`,
      applies_to: 'document',
      suggestion: 'Fix XML syntax errors.',
    });
    return finalize(issues, null, null, 0, xmlContent, testName);
  }

  // TC_003: Root element
  if (!('testCase' in parsed)) {
    issues.push({
      rule_id: 'TC_003',
      severity: 'ERROR',
      message: 'Root element must be <testCase>.',
      applies_to: 'document',
      suggestion: 'Ensure root element is <testCase>.',
    });
    return finalize(issues, null, null, 0, xmlContent, testName);
  }

  // fast-xml-parser yields '' for a self-closing element with no attributes (e.g. <testCase/>).
  // Normalise to a plain object so subsequent `'key' in tc` checks don't throw.
  const rawTc = parsed['testCase'];
  const tc: Record<string, unknown> =
    rawTc !== null && typeof rawTc === 'object' ? (rawTc as Record<string, unknown>) : {};
  const tcId = (tc['@_id'] as string | undefined) ?? null;
  const tcName = (tc['@_name'] as string | undefined) ?? null;
  const tcGuid = tc['@_guid'] as string | undefined;

  checkTestCaseIdAndGuid(tcId, tcGuid, issues);
  // TC_013 (registryId) is intentionally not checked here — registryId is a
  // Salesforce Quality Hub record ID assigned when a test case is registered in
  // the QH org. Local project files will never have this attribute, so checking
  // for it produces a universal false positive for every test case.

  // TC_020: <steps> element
  if (!('steps' in tc)) {
    issues.push({
      rule_id: 'TC_020',
      severity: 'ERROR',
      message: 'testCase missing <steps> element.',
      applies_to: 'testCase',
      suggestion: 'Wrap all step elements in a <steps> element.',
    });
    return finalize(issues, tcId, tcName, 0, xmlContent, testName);
  }

  // DATA-001: <dataTable> binding is silently ignored in standalone CLI execution
  if ('dataTable' in tc && tc['dataTable'] != null) {
    issues.push({
      rule_id: 'DATA-001',
      severity: 'WARNING',
      message:
        'testCase declares a <dataTable> but CLI standalone execution does not bind CSV column variables — steps using <value class="variable"> references will resolve to null.',
      applies_to: 'testCase',
      suggestion:
        'Use SetValues (Test scope) steps to bind data for standalone CLI execution, or add this test case to a test plan.',
    });
  }

  // Same self-closing guard for <steps/> → fast-xml-parser yields ''
  const rawSteps = tc['steps'];
  const steps: Record<string, unknown> =
    rawSteps !== null && typeof rawSteps === 'object' ? (rawSteps as Record<string, unknown>) : {};
  const rawApiCalls = steps['apiCall'];
  const apiCalls: Array<Record<string, unknown>> = rawApiCalls
    ? ((Array.isArray(rawApiCalls) ? rawApiCalls : [rawApiCalls]) as Array<Record<string, unknown>>)
    : [];

  for (const call of apiCalls) {
    validateApiCall(call, issues);
  }

  // VAR-REF-001 / VAR-REF-002: detect {VarName} tokens inside valueClass="string" elements.
  // Provar does not interpolate {…} tokens in plain string values at runtime — they must use
  // class="variable" (pure reference) or class="compound" (embedded in surrounding text).
  const stringValueRe = /<value[^>]+valueClass="string"[^>]*>([^<]+)<\/value>/g;
  let stringMatch: RegExpExecArray | null;
  while ((stringMatch = stringValueRe.exec(xmlContent)) !== null) {
    const rawContent = stringMatch[1];
    if (!/\{[\w.]+\}/.test(rawContent)) continue;
    const isPure = /^\{[\w.]+\}$/.test(rawContent.trim());
    const varNames = [...rawContent.matchAll(/\{([\w.]+)\}/g)].map((m) => m[1]);
    if (isPure) {
      const varName = varNames[0];
      issues.push({
        rule_id: 'VAR-REF-001',
        severity: 'WARNING',
        message: `Argument value "{${varName}}" looks like a variable reference but is stored as a plain string — Provar will not resolve it at runtime.`,
        applies_to: 'argument',
        suggestion: `Replace with <value class="variable"><path element="${varName
          .split('.')
          .join(
            '"/><path element="'
          )}"/></value>. In provar_testcase_generate, use the {VarName} syntax in the attributes object — the generator converts it automatically.`,
      });
    } else {
      const preview = rawContent.length > 60 ? rawContent.slice(0, 57) + '…' : rawContent;
      issues.push({
        rule_id: 'VAR-REF-002',
        severity: 'WARNING',
        message: `Argument value "${preview}" contains {${varNames.join(
          '}, {'
        )}} embedded in a plain string — Provar does not interpolate {…} tokens in string values at runtime.`,
        applies_to: 'argument',
        suggestion:
          'Use class="compound" with <parts> to split literal text and variable references at each {VarName} boundary. ' +
          'In provar_testcase_generate, pass the value with {VarName} placeholders in the attributes object — the generator emits compound XML automatically.',
      });
    }
  }

  return finalize(issues, tcId, tcName, apiCalls.length, xmlContent, testName);
}

/** Normalise fast-xml-parser's single-or-array representation of <argument> children. */
function getArgList(call: Record<string, unknown>): Array<Record<string, unknown>> {
  const rawArgs = call['arguments'] as Record<string, unknown> | undefined;
  if (!rawArgs) return [];
  const argRaw = rawArgs['argument'];
  if (!argRaw) return [];
  return (Array.isArray(argRaw) ? argRaw : [argRaw]) as Array<Record<string, unknown>>;
}

function validateApiCall(call: Record<string, unknown>, issues: ValidationIssue[]): void {
  const callGuid = call['@_guid'] as string | undefined;
  const apiId = call['@_apiId'] as string | undefined;
  const name = call['@_name'] as string | undefined;
  const testItemId = call['@_testItemId'] as string | undefined;
  const label = apiId ? ` "${apiId}"` : '';

  if (!callGuid) {
    issues.push({
      rule_id: 'TC_030',
      severity: 'ERROR',
      message: `apiCall${label} missing guid attribute.`,
      applies_to: 'apiCall',
      suggestion: 'Add a UUID v4 guid to each apiCall.',
    });
  } else if (!UUID_V4_RE.test(callGuid)) {
    issues.push({
      rule_id: 'TC_031',
      severity: 'ERROR',
      message: `apiCall${label} guid "${callGuid}" is not a valid UUID v4.`,
      applies_to: 'apiCall',
      suggestion:
        'Replace with a valid UUID v4 — e.g. crypto.randomUUID(). The 4th segment must begin with 8, 9, a, or b.',
    });
  }
  if (!apiId) {
    issues.push({
      rule_id: 'TC_032',
      severity: 'ERROR',
      message: 'apiCall missing apiId attribute.',
      applies_to: 'apiCall',
      suggestion: 'Add apiId attribute (e.g., UiConnect, ApexSoqlQuery).',
    });
  }
  if (!name) {
    issues.push({
      rule_id: 'TC_033',
      severity: 'WARNING',
      message: `apiCall${label} missing name attribute.`,
      applies_to: 'apiCall',
      suggestion: 'Add a descriptive name attribute.',
    });
  }
  if (!testItemId) {
    issues.push({
      rule_id: 'TC_034',
      severity: 'ERROR',
      message: `apiCall${label} missing testItemId attribute.`,
      applies_to: 'apiCall',
      suggestion: 'Add sequential testItemId (1, 2, 3...).',
    });
  } else if (!/^\d+$/.test(testItemId)) {
    issues.push({
      rule_id: 'TC_035',
      severity: 'ERROR',
      message: `apiCall${label} testItemId "${testItemId}" must be a whole number.`,
      applies_to: 'apiCall',
      suggestion: 'Use sequential integers for testItemId.',
    });
  }

  if (apiId) validateApiCallArgs(call, apiId, name, issues);
}

function checkUiTarget(
  call: Record<string, unknown>,
  apiId: string,
  stepName: string,
  issues: ValidationIssue[]
): void {
  const targetArg = getArgList(call).find((a) => (a['@_id'] as string | undefined) === 'target');
  if (!targetArg) return;
  const valueNode = targetArg['value'] as Record<string, unknown> | undefined;
  if (valueNode == null) return;
  const valClass = valueNode['@_class'] as string | undefined;
  if (valClass !== 'uiTarget') {
    const apiLabel = apiId.includes('UiWithRow') ? 'UiWithRow' : 'UiWithScreen';
    issues.push({
      rule_id: 'UI-TARGET-001',
      severity: 'ERROR',
      message: `${apiLabel} step "${stepName}" target argument uses class="${
        valClass ?? '(missing)'
      }" — must be class="uiTarget".`,
      applies_to: 'apiCall',
      suggestion:
        'Emit the target as: <value class="uiTarget" uri="sf:ui:target?..."/> or uri="ui:pageobject:target?pageId=...". ' +
        'In provar_testcase_generate the "target" attribute is converted automatically.',
    });
  }
}

function validateApiCallArgs(
  call: Record<string, unknown>,
  apiId: string,
  name: string | undefined,
  issues: ValidationIssue[]
): void {
  const stepName = name ?? '(unnamed)';

  // UI-TARGET-001 (mirrors quality-hub-agents UI-SCREEN-TARGET-001):
  // UiWithScreen / UiWithRow target argument must use class="uiTarget", not a plain string.
  // A plain string causes: "Can not set IUiTargetValue field ... to java.lang.String"
  if (apiId.includes('UiWithScreen') || apiId.includes('UiWithRow')) {
    checkUiTarget(call, apiId, stepName, issues);
  }

  // UI-LOCATOR-001 (local rule, no direct backend equivalent):
  // UiDoAction / UiAssert locator argument must use class="uiLocator".
  if (apiId.includes('UiDoAction') || apiId.includes('UiAssert')) {
    const locatorArg = getArgList(call).find((a) => (a['@_id'] as string | undefined) === 'locator');
    if (locatorArg) {
      const locatorNode = locatorArg['value'] as Record<string, unknown> | undefined;
      if (locatorNode != null) {
        const valClass = locatorNode['@_class'] as string | undefined;
        if (valClass !== 'uiLocator') {
          issues.push({
            rule_id: 'UI-LOCATOR-001',
            severity: 'ERROR',
            message: `"${stepName}" locator argument uses class="${
              valClass ?? '(missing)'
            }" — must be class="uiLocator".`,
            applies_to: 'apiCall',
            suggestion:
              'Emit the locator as: <value class="uiLocator" uri="sf:ui:locator:..."/>. ' +
              'In provar_testcase_generate the "locator" attribute is converted automatically.',
          });
        }
      }
    }
  }

  // SETVALUES-STRUCTURE-001 (mirrors quality-hub-agents SETVALUES-STRUCTURE-001):
  // SetValues values argument must use class="valueList" with <namedValues> children.
  // A plain string value causes an immediate ClassCastException at runtime.
  if (apiId.includes('SetValues') && !apiId.includes('AssertValues')) {
    const valuesArg = getArgList(call).find((a) => (a['@_id'] as string | undefined) === 'values');
    if (valuesArg) {
      const valuesNode = valuesArg['value'] as Record<string, unknown> | undefined;
      if (valuesNode != null) {
        const valClass = valuesNode['@_class'] as string | undefined;
        if (valClass !== 'valueList') {
          issues.push({
            rule_id: 'SETVALUES-STRUCTURE-001',
            severity: 'ERROR',
            message: `SetValues step "${stepName}" values argument uses class="${
              valClass ?? '(missing)'
            }" — must use class="valueList" with <namedValues> children.`,
            applies_to: 'apiCall',
            suggestion:
              'Wrap variable assignments in: <value class="valueList" mutable="Mutable"><namedValues>' +
              '<namedValue name="varName"><value class="value" valueClass="string">value</value></namedValue>' +
              '</namedValues></value>. In provar_testcase_generate pass each variable as a flat key/value pair ' +
              'in attributes — the generator builds the valueList structure automatically.',
          });
        }
      }
    }
  }

  // ASSERT-001: AssertValues using UI namedValues format instead of variable format
  if (apiId.includes('AssertValues')) {
    const hasValuesArg = getArgList(call).some((a) => (a['@_id'] as string | undefined) === 'values');
    if (hasValuesArg) {
      issues.push({
        rule_id: 'ASSERT-001',
        severity: 'WARNING',
        message: `AssertValues step "${stepName}" uses namedValues format (argument id="values") — designed for UI element attribute assertions. For Apex/SOQL result or variable comparisons this silently passes as null=null.`,
        applies_to: 'apiCall',
        suggestion:
          'Use separate expectedValue, actualValue, and comparisonType arguments for variable or Apex result comparisons.',
      });
    }
  }
}

function finalize(
  issues: ValidationIssue[],
  testCaseId: string | null,
  testCaseName: string | null,
  stepCount: number,
  xmlContent: string,
  testName?: string
): TestCaseValidationResult {
  const errorCount = issues.filter((i) => i.severity === 'ERROR').length;
  const warningCount = issues.filter((i) => i.severity === 'WARNING').length;

  // Layer 1: validity score (schema compliance — existing rules)
  const validity_score = Math.max(0, 100 - errorCount * 20);

  // Layer 2: quality score (best practices engine — same rules & formula as Quality Hub API)
  const bp = runBestPractices(xmlContent, { testName });

  return {
    is_valid: errorCount === 0,
    validity_score,
    quality_score: bp.quality_score,
    test_case_id: testCaseId,
    test_case_name: testCaseName,
    step_count: stepCount,
    error_count: errorCount,
    warning_count: warningCount,
    issues,
    best_practices_violations: bp.violations,
    best_practices_rules_evaluated: bp.rules_evaluated,
    // validation_source is set by the caller (MCP tool handler or direct callers).
    // Default to 'local' here so the pure validateTestCase() function is self-contained.
    validation_source: 'local' as const,
  };
}
