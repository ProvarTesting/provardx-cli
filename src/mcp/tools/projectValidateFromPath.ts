/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from '../server.js';
import { assertPathAllowed, PathPolicyError } from '../security/pathPolicy.js';
import { makeError, makeRequestId } from '../schemas/common.js';
import { log } from '../logging/logger.js';
import { validateProjectFromPath, ProjectValidationError } from '../../services/projectValidation.js';
import type { ProjectValidationResult, ValidatedPlan } from '../../services/projectValidation.js';

// ── Response shaping ──────────────────────────────────────────────────────────

interface PlanSummary {
  name: string;
  quality_score: number;
  suite_count: number;
  test_case_count: number;
  violation_count: number;
}

interface ViolationSummary {
  rule_id: string;
  count: number;
  sample_message: string;
}

function buildPlanSummary(plan: ValidatedPlan): PlanSummary {
  const test_case_count = plan.suites.reduce((n, s) => n + s.test_cases.length, 0)
    + plan.unplanned_test_cases.length;
  return {
    name: plan.name,
    quality_score: plan.quality_score,
    suite_count: plan.suites.length,
    test_case_count,
    violation_count: plan.violations.length,
  };
}

function groupViolations(violations: ValidatedPlan['violations']): ViolationSummary[] {
  const byRule = new Map<string, ViolationSummary>();
  for (const v of violations) {
    const existing = byRule.get(v.rule_id);
    if (existing) {
      existing.count += 1;
    } else {
      byRule.set(v.rule_id, { rule_id: v.rule_id, count: 1, sample_message: v.message });
    }
  }
  return [...byRule.values()].sort((a, b) => b.count - a.count);
}

function shapeResponse(
  result: ProjectValidationResult,
  includePlanDetails: boolean,
  maxUncovered: number,
  maxViolations: number
): Record<string, unknown> {
  const { uncovered_test_cases, ...coverageRest } = result.coverage;
  const uncovered_shown = uncovered_test_cases.slice(0, maxUncovered);
  const uncovered_truncated = uncovered_test_cases.length > maxUncovered;

  const coverage = {
    ...coverageRest,
    uncovered_test_cases: uncovered_shown,
    ...(uncovered_truncated
      ? { uncovered_truncated: true, uncovered_total: uncovered_test_cases.length }
      : {}),
  };

  if (includePlanDetails) {
    const projViolationsShown = result.project_violations.slice(0, maxViolations);
    const projViolationsTruncated = result.project_violations.length > maxViolations;
    return {
      ...result,
      coverage,
      project_violations: projViolationsShown,
      ...(projViolationsTruncated ? { project_violations_total: result.project_violations.length } : {}),
    };
  }

  // Slim default: grouped rule counts only, no per-violation detail
  return {
    project_path: result.project_path,
    project_name: result.project_name,
    quality_score: result.quality_score,
    quality_tier: result.quality_tier,
    quality_grade: result.quality_grade,
    summary: result.summary,
    project_violations_by_rule: groupViolations(result.project_violations),
    project_violations_total: result.project_violations.length,
    plans_summary: result.plans.map(buildPlanSummary),
    coverage,
    saved_to: result.saved_to,
    ...(result.save_error ? { save_error: result.save_error } : {}),
    hint: 'Set include_plan_details:true to get per-suite/test-case violations. project_violations and plan violations are grouped by rule_id in this view.',
  };
}

// ── Tool registration ─────────────────────────────────────────────────────────

export function registerProjectValidateFromPath(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.project.validate',
    [
      'Validate a Provar project directly from its directory on disk.',
      'Reads the plan/suite/testinstance hierarchy from the plans/ directory,',
      'resolves test case XML from the tests/ directory, extracts project context',
      '(connections, environments, secrets) from the .testproject file, then runs',
      'the full validation rule set.',
      'Returns a compact quality score, violation summary, and per-plan/suite scores.',
      'By default returns a slim summary response to avoid token explosion.',
      'Pass include_plan_details:true to get full per-suite and per-test-case data.',
      'By default saves a QH-compatible JSON report to',
      '{project_path}/provardx/validation/ (created if absent).',
      'IMPORTANT: Use this tool for whole-project validation —',
      'DO NOT read individual test case files and pass XML content inline.',
      'Pass a project_path and let this tool handle all file reading.',
    ].join(' '),
    {
      project_path: z.string().describe('Absolute path to the Provar project root (the directory containing the .testproject file)'),
      quality_threshold: z.number().min(0).max(100).optional().default(80).describe('Minimum quality score for a test case to be considered valid (default: 80)'),
      save_results: z.boolean().optional().default(true).describe('Write a QH-compatible JSON report to provardx/validation/ (default: true)'),
      results_dir: z.string().optional().describe('Override the output directory for the saved report (default: {project_path}/provardx/validation)'),
      include_plan_details: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'When true, include full per-suite and per-test-case violation data in the response. ' +
          'Default false to keep response small. Use only when you need to inspect specific test case failures.'
        ),
      max_uncovered: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(20)
        .describe('Maximum number of uncovered test case paths to include in the response (default: 20). Set to 0 for none, or a large number for all.'),
      max_violations: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(50)
        .describe('When include_plan_details:true, caps project_violations returned (default: 50). Ignored in slim mode where violations are grouped by rule_id instead.'),
    },
    ({ project_path, quality_threshold, save_results, results_dir, include_plan_details, max_uncovered, max_violations }) => {
      const requestId = makeRequestId();
      log('info', 'provar.project.validate', { requestId, project_path, include_plan_details });

      try {
        assertPathAllowed(project_path, config.allowedPaths);
        if (results_dir) assertPathAllowed(results_dir, config.allowedPaths);

        const result = validateProjectFromPath({
          project_path,
          quality_threshold,
          save_results,
          results_dir,
        });

        if (result.save_error) {
          log('warn', 'provar.project.validate: could not save results', { requestId, error: result.save_error });
        }

        const shaped = shapeResponse(result, include_plan_details, max_uncovered, max_violations);
        const response = { requestId, ...shaped };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
      } catch (err: unknown) {
        const error = err as Error & { code?: string };
        const code = error instanceof PathPolicyError
          ? error.code
          : error instanceof ProjectValidationError
            ? error.code
            : (error.code ?? 'VALIDATE_ERROR');
        const isUserError = error instanceof PathPolicyError || error instanceof ProjectValidationError;
        const errResult = makeError(code, error.message, requestId, !isUserError);
        log('error', 'provar.project.validate failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}
