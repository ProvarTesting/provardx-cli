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
import { runBestPractices } from './bestPracticesEngine.js';

export function registerTestCaseValidate(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.testcase.validate',
    'Validate a Provar XML test case for structural correctness and quality. Checks XML declaration, root element, required attributes (guid UUID v4, testItemId integer), <steps> presence, and applies best-practice rules (same ruleset and scoring as the Quality Hub batch validation API). Returns validity_score (schema compliance) and quality_score (best practices, 0–100).',
    {
      content: z.string().optional().describe('XML content to validate directly (alias: xml)'),
      xml: z.string().optional().describe('XML content to validate — API-compatible alias for content'),
      file_path: z.string().optional().describe('Path to .xml test case file'),
    },
    ({ content, xml, file_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar.testcase.validate', { requestId, has_content: !!content, file_path });

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

        const validation = validateTestCase(source);
        const result = { requestId, ...validation };
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
        log('error', 'provar.testcase.validate failed', { requestId, error: error.message });
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
}

/** Pure function — exported for unit testing */
export function validateTestCase(xmlContent: string, testName?: string): TestCaseValidationResult {
  const issues: ValidationIssue[] = [];

  // TC_001: XML declaration
  if (!xmlContent.trimStart().startsWith('<?xml')) {
    issues.push({
      rule_id: 'TC_001', severity: 'ERROR',
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
      rule_id: 'TC_002', severity: 'ERROR',
      message: `XML parse error: ${parseError.message}`,
      applies_to: 'document',
      suggestion: 'Fix XML syntax errors.',
    });
    return finalize(issues, null, null, 0, xmlContent, testName);
  }

  // TC_003: Root element
  if (!('testCase' in parsed)) {
    issues.push({
      rule_id: 'TC_003', severity: 'ERROR',
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

  if (!tcId) {
    issues.push({
      rule_id: 'TC_010', severity: 'ERROR',
      message: 'testCase missing required id attribute.',
      applies_to: 'testCase',
      suggestion: 'Add id attribute to testCase element.',
    });
  }
  if (!tcGuid) {
    issues.push({
      rule_id: 'TC_011', severity: 'ERROR',
      message: 'testCase missing required guid attribute.',
      applies_to: 'testCase',
      suggestion: 'Add guid attribute (UUID v4) to testCase element.',
    });
  } else if (!UUID_V4_RE.test(tcGuid)) {
    issues.push({
      rule_id: 'TC_012', severity: 'ERROR',
      message: `testCase guid "${tcGuid}" is not a valid UUID v4.`,
      applies_to: 'testCase',
      suggestion: 'Generate a proper UUID v4 for the guid attribute.',
    });
  }
  // TC_013 (registryId) is intentionally not checked here — registryId is a
  // Salesforce Quality Hub record ID assigned when a test case is registered in
  // the QH org. Local project files will never have this attribute, so checking
  // for it produces a universal false positive for every test case.

  // TC_020: <steps> element
  if (!('steps' in tc)) {
    issues.push({
      rule_id: 'TC_020', severity: 'ERROR',
      message: 'testCase missing <steps> element.',
      applies_to: 'testCase',
      suggestion: 'Wrap all step elements in a <steps> element.',
    });
    return finalize(issues, tcId, tcName, 0, xmlContent, testName);
  }

  // Same self-closing guard for <steps/> → fast-xml-parser yields ''
  const rawSteps = tc['steps'];
  const steps: Record<string, unknown> =
    rawSteps !== null && typeof rawSteps === 'object' ? (rawSteps as Record<string, unknown>) : {};
  const rawApiCalls = steps['apiCall'];
  const apiCalls: Array<Record<string, unknown>> = rawApiCalls
    ? (Array.isArray(rawApiCalls) ? rawApiCalls : [rawApiCalls]) as Array<Record<string, unknown>>
    : [];

  for (const call of apiCalls) {
    validateApiCall(call, issues);
  }

  return finalize(issues, tcId, tcName, apiCalls.length, xmlContent, testName);
}

function validateApiCall(call: Record<string, unknown>, issues: ValidationIssue[]): void {
  const callGuid = call['@_guid'] as string | undefined;
  const apiId = call['@_apiId'] as string | undefined;
  const name = call['@_name'] as string | undefined;
  const testItemId = call['@_testItemId'] as string | undefined;
  const label = apiId ? ` "${apiId}"` : '';

  if (!callGuid) {
    issues.push({
      rule_id: 'TC_030', severity: 'ERROR',
      message: `apiCall${label} missing guid attribute.`,
      applies_to: 'apiCall',
      suggestion: 'Add a UUID v4 guid to each apiCall.',
    });
  } else if (!UUID_V4_RE.test(callGuid)) {
    issues.push({
      rule_id: 'TC_031', severity: 'ERROR',
      message: `apiCall${label} guid "${callGuid}" is not a valid UUID v4.`,
      applies_to: 'apiCall',
      suggestion: 'Use proper UUID v4 format.',
    });
  }
  if (!apiId) {
    issues.push({
      rule_id: 'TC_032', severity: 'ERROR',
      message: 'apiCall missing apiId attribute.',
      applies_to: 'apiCall',
      suggestion: 'Add apiId attribute (e.g., UiConnect, ApexSoqlQuery).',
    });
  }
  if (!name) {
    issues.push({
      rule_id: 'TC_033', severity: 'WARNING',
      message: `apiCall${label} missing name attribute.`,
      applies_to: 'apiCall',
      suggestion: 'Add a descriptive name attribute.',
    });
  }
  if (!testItemId) {
    issues.push({
      rule_id: 'TC_034', severity: 'ERROR',
      message: `apiCall${label} missing testItemId attribute.`,
      applies_to: 'apiCall',
      suggestion: 'Add sequential testItemId (1, 2, 3...).',
    });
  } else if (!/^\d+$/.test(testItemId)) {
    issues.push({
      rule_id: 'TC_035', severity: 'ERROR',
      message: `apiCall${label} testItemId "${testItemId}" must be a whole number.`,
      applies_to: 'apiCall',
      suggestion: 'Use sequential integers for testItemId.',
    });
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
  };
}
