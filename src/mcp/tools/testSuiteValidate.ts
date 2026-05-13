/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { makeError, makeRequestId } from '../schemas/common.js';
import { log } from '../logging/logger.js';
import { applyDetailLevel, type DetailLevel } from '../utils/detailLevel.js';
import { calcCompletenessScore, calcNextAction } from '../utils/validationScore.js';
import {
  generateRunId,
  saveRun,
  hasAnyRun,
  loadBaselineViolations,
  computeDiff,
  type DiffableViolation,
} from '../utils/validationDiff.js';
import { validateSuite, buildHierarchySummary, type TestSuiteInput } from './hierarchyValidate.js';
import { desc } from './descHelper.js';

// ── Zod schemas ───────────────────────────────────────────────────────────────

const testCaseSchema = z
  .object({
    name: z.string().describe('Test case filename (e.g. CreateAccount.testcase)'),
    xml_content: z.string().optional().describe('Full XML content of the test case file'),
    xml: z.string().optional().describe('Full XML content (API-compatible alias for xml_content)'),
  })
  .refine((d) => d.xml_content !== undefined || d.xml !== undefined, {
    message: 'Either xml_content or xml must be provided',
  });

const innerSuiteSchema = z.object({
  name: z.string().describe('Child suite name'),
  test_cases: z.array(testCaseSchema).optional().describe('Test cases in this child suite'),
  test_case_count: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Explicit test case count (overrides counting test_cases)'),
});

const childSuiteSchema = z.object({
  name: z.string().describe('Child suite name'),
  test_cases: z.array(testCaseSchema).optional().describe('Test cases in this suite'),
  test_suites: z.array(innerSuiteSchema).optional().describe('Nested child suites (one level deep)'),
  test_case_count: z.number().int().min(0).optional().describe('Explicit test case count for size check'),
});

const SUITE_VALIDATE_SUMMARY_FIELDS = [
  'requestId',
  'name',
  'quality_score',
  'summary',
  'run_id',
  'completeness_score',
  'recommended_next_action',
];

function suiteStorageDir(): string {
  return path.join(os.homedir(), '.provardx', 'validation');
}

export function registerTestSuiteValidate(server: McpServer): void {
  server.registerTool(
    'provar_testsuite_validate',
    {
      title: 'Validate Test Suite',
      description: desc(
        'Validate a Provar test suite: checks for empty suites, duplicate names, oversized suites (>75 tests), and naming convention consistency. Recursively validates child suites and individual test case XML. Returns quality score, suite-level violations, and per-test-case results. Every response includes run_id — pass it as baseline_run_id in the next call to receive only new/resolved violations.',
        'Validate a Provar test suite: naming, size, duplicates, per-test-case quality; run_id for diff.'
      ),
      inputSchema: {
        suite_name: z.string().describe(desc('Name of the test suite', 'string')),
        test_cases: z
          .array(testCaseSchema)
          .optional()
          .describe(desc('Test cases directly in this suite', 'object[], optional')),
        child_suites: z
          .array(childSuiteSchema)
          .optional()
          .describe(desc('Child test suites (supports up to 2 levels of nesting)', 'object[], optional')),
        test_case_count: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            desc('Explicit total test case count for size check (overrides counting test_cases)', 'int ≥0, optional')
          ),
        quality_threshold: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe(
            desc('Minimum quality score for a test case to be considered valid (default: 80)', 'number 0–100, optional')
          ),
        detail: z
          .enum(['summary', 'standard', 'full'])
          .optional()
          .default('standard')
          .describe(
            desc(
              'Response verbosity. "summary": name, scores, and stop signal only. "standard"/"full": full violations and per-test-case results (default).',
              'enum summary|standard|full, optional; default standard'
            )
          ),
        baseline_run_id: z
          .string()
          .optional()
          .describe(
            desc(
              'run_id from a previous call. When provided, returns only violations that are new or resolved since that run: { added, resolved, unchanged_count, run_id }. If not found, returns error BASELINE_NOT_FOUND.',
              'string, optional; prev run_id for diff response'
            )
          ),
      },
    },
    ({ suite_name, test_cases, child_suites, test_case_count, quality_threshold, detail, baseline_run_id }) => {
      const requestId = makeRequestId();
      log('info', 'provar_testsuite_validate', { requestId, suite_name });

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

        const storageDir = suiteStorageDir();
        const runId = generateRunId(suite_name);
        const currentViolations = result.violations as unknown as DiffableViolation[];

        try {
          saveRun(storageDir, runId, currentViolations);
        } catch (saveErr) {
          log('warn', 'provar_testsuite_validate: could not save run for diff', {
            requestId,
            error: (saveErr as Error).message,
          });
        }

        // Diff mode
        if (baseline_run_id !== undefined && baseline_run_id !== '') {
          const baseline = loadBaselineViolations(storageDir, baseline_run_id);
          if (!baseline) {
            const errResult = makeError(
              'BASELINE_NOT_FOUND',
              'Baseline run not found. Run validation without baseline_run_id first to establish a baseline.',
              requestId,
              false,
              { suggestion: 'Run provar_testsuite_validate without baseline_run_id first to establish a baseline.' }
            );
            return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
          }
          const diff = computeDiff(baseline, currentViolations);
          const completeness_score = calcCompletenessScore(summary.test_cases_valid, summary.total_test_cases);
          const recommended_next_action = calcNextAction(completeness_score, true);
          const diffResponse = {
            requestId,
            run_id: runId,
            ...diff,
            completeness_score,
            recommended_next_action,
          };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(diffResponse) }],
            structuredContent: diffResponse,
          };
        }

        const completeness_score = calcCompletenessScore(summary.test_cases_valid, summary.total_test_cases);
        const hasBaseline = hasAnyRun(storageDir);
        const recommended_next_action = calcNextAction(completeness_score, hasBaseline);

        const response = {
          requestId,
          run_id: runId,
          completeness_score,
          recommended_next_action,
          ...result,
          summary,
        };

        const detailLevel = (detail ?? 'standard') as DetailLevel;
        const finalResponse = applyDetailLevel(response, detailLevel, SUITE_VALIDATE_SUMMARY_FIELDS);

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(finalResponse) }],
          structuredContent: finalResponse,
        };
      } catch (err: unknown) {
        const error = err as Error;
        const errResult = makeError('VALIDATE_ERROR', error.message, requestId, false);
        log('error', 'provar_testsuite_validate failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}
