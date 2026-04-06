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
import { validatePlan, buildHierarchySummary, type TestPlanInput } from './hierarchyValidate.js';

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
  name: z.string().describe('Suite name'),
  test_cases: z.array(testCaseSchema).optional().describe('Test cases in this suite'),
  test_case_count: z.number().int().min(0).optional().describe('Explicit test case count for size check'),
});

const suiteSchema = z.object({
  name: z.string().describe('Test suite name'),
  test_cases: z.array(testCaseSchema).optional().describe('Test cases directly in this suite'),
  test_suites: z.array(innerSuiteSchema).optional().describe('Child suites (one level deep)'),
  test_case_count: z.number().int().min(0).optional().describe('Explicit test case count for size check'),
});

const metadataSchema = z.object({
  objectives: z.string().optional().describe('Testing objectives for this plan (configured in Provar Quality Hub)'),
  in_scope: z.string().optional().describe('Features and areas in scope (configured in Provar Quality Hub)'),
  testing_methodology: z.string().optional().describe('Testing approach, e.g. risk-based, regression, exploratory (configured in Provar Quality Hub)'),
  acceptance_criteria: z.string().optional().describe('Criteria to determine when testing is complete (configured in Provar Quality Hub)'),
  acceptable_pass_rate: z.number().min(0).max(100).optional().describe('Minimum pass rate 0-100 for the plan to be considered successful (configured in Provar Quality Hub)'),
  environments: z.array(z.string()).optional().describe('Target environments, e.g. ["QA", "Staging", "UAT"] (configured in Provar Quality Hub)'),
  test_data_strategy: z.string().optional().describe('How test data will be prepared and cleaned up (configured in Provar Quality Hub)'),
  risks: z.string().optional().describe('Identified risks and mitigations (configured in Provar Quality Hub)'),
}).optional().describe('Plan completeness metadata — these fields are configured in the Provar Quality Hub app, not in local project files');

export function registerTestPlanValidate(server: McpServer): void {
  server.tool(
    'provar.testplan.validate',
    'Validate a Provar test plan: checks for empty plans, duplicate suite names, oversized plans (>20 suites), plan completeness (objectives, scope, methodology, environments, acceptance criteria, test data strategy, risk assessment), and naming consistency. Recursively validates child suites and test cases. Returns quality score, plan-level violations, and full hierarchy results.',
    {
      plan_name: z.string().describe('Name of the test plan'),
      test_suites: z.array(suiteSchema).optional().describe('Test suites belonging to this plan'),
      test_cases: z.array(testCaseSchema).optional().describe('Test cases directly in this plan (not in a suite)'),
      test_suite_count: z.number().int().min(0).optional().describe('Explicit suite count for size check (overrides counting test_suites)'),
      metadata: metadataSchema,
      quality_threshold: z.number().min(0).max(100).optional().describe('Minimum quality score for a test case to be considered valid (default: 80)'),
    },
    ({ plan_name, test_suites, test_cases, test_suite_count, metadata, quality_threshold }) => {
      const requestId = makeRequestId();
      log('info', 'provar.testplan.validate', { requestId, plan_name });

      try {
        const threshold = quality_threshold ?? 80;
        const input: TestPlanInput = {
          name: plan_name,
          test_suites: test_suites ?? [],
          test_cases: test_cases ?? [],
          test_suite_count,
          metadata: metadata ?? {},
        };

        const result = validatePlan(input, threshold);
        const summary = buildHierarchySummary(result);
        const response = { requestId, ...result, summary };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
      } catch (err: unknown) {
        const error = err as Error;
        const errResult = makeError('VALIDATE_ERROR', error.message, requestId, false);
        log('error', 'provar.testplan.validate failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}
