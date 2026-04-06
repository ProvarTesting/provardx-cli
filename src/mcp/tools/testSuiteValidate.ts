/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { makeError, makeRequestId } from '../schemas/common.js';
import { log } from '../logging/logger.js';
import { validateSuite, buildHierarchySummary, type TestSuiteInput } from './hierarchyValidate.js';

// ── Zod schemas ───────────────────────────────────────────────────────────────

const testCaseSchema = z.object({
  name: z.string().describe('Test case filename (e.g. CreateAccount.testcase)'),
  xml_content: z.string().optional().describe('Full XML content of the test case file'),
  xml: z.string().optional().describe('Full XML content (API-compatible alias for xml_content)'),
}).refine(
  (d) => d.xml_content !== undefined || d.xml !== undefined,
  { message: 'Either xml_content or xml must be provided' }
);

const innerSuiteSchema = z.object({
  name: z.string().describe('Child suite name'),
  test_cases: z.array(testCaseSchema).optional().describe('Test cases in this child suite'),
  test_case_count: z.number().int().min(0).optional().describe('Explicit test case count (overrides counting test_cases)'),
});

const childSuiteSchema = z.object({
  name: z.string().describe('Child suite name'),
  test_cases: z.array(testCaseSchema).optional().describe('Test cases in this suite'),
  test_suites: z.array(innerSuiteSchema).optional().describe('Nested child suites (one level deep)'),
  test_case_count: z.number().int().min(0).optional().describe('Explicit test case count for size check'),
});

export function registerTestSuiteValidate(server: McpServer): void {
  server.tool(
    'provar.testsuite.validate',
    'Validate a Provar test suite: checks for empty suites, duplicate names, oversized suites (>75 tests), and naming convention consistency. Recursively validates child suites and individual test case XML. Returns quality score, suite-level violations, and per-test-case results.',
    {
      suite_name: z.string().describe('Name of the test suite'),
      test_cases: z.array(testCaseSchema).optional().describe('Test cases directly in this suite'),
      child_suites: z.array(childSuiteSchema).optional().describe('Child test suites (supports up to 2 levels of nesting)'),
      test_case_count: z.number().int().min(0).optional().describe('Explicit total test case count for size check (overrides counting test_cases)'),
      quality_threshold: z.number().min(0).max(100).optional().describe('Minimum quality score for a test case to be considered valid (default: 80)'),
    },
    ({ suite_name, test_cases, child_suites, test_case_count, quality_threshold }) => {
      const requestId = makeRequestId();
      log('info', 'provar.testsuite.validate', { requestId, suite_name });

      try {
        const threshold = quality_threshold ?? 80;
        const input: TestSuiteInput = {
          name: suite_name,
          test_cases: test_cases ?? [],
          test_suites: (child_suites ?? []) as TestSuiteInput[],
          test_case_count,
        };

        const result = validateSuite(input, threshold);
        const summary = buildHierarchySummary(result);
        const response = { requestId, ...result, summary };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
      } catch (err: unknown) {
        const error = err as Error;
        const errResult = makeError('VALIDATE_ERROR', error.message, requestId, false);
        log('error', 'provar.testsuite.validate failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}
