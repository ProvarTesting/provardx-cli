/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import path from 'node:path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from '../server.js';
import { assertPathAllowed, PathPolicyError } from '../security/pathPolicy.js';
import { makeError, makeRequestId } from '../schemas/common.js';
import { log } from '../logging/logger.js';
import { validateProjectFromPath, ProjectValidationError } from '../../services/projectValidation.js';
import type { ProjectValidationResult, ValidatedPlan } from '../../services/projectValidation.js';
import { desc } from './descHelper.js';
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
  const test_case_count = plan.suites.reduce((n, s) => n + s.test_cases.length, 0) + plan.unplanned_test_cases.length;
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
    ...(uncovered_truncated ? { uncovered_truncated: true, uncovered_total: uncovered_test_cases.length } : {}),
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
    ...(result.plan_integrity_warnings && result.plan_integrity_warnings.length > 0
      ? { plan_integrity_warnings: result.plan_integrity_warnings }
      : {}),
    hint: 'Set include_plan_details:true to get per-suite/test-case violations. project_violations and plan violations are grouped by rule_id in this view.',
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function classifyError(err: Error & { code?: string }): { code: string; isUserError: boolean } {
  if (err instanceof PathPolicyError || err instanceof ProjectValidationError) {
    return { code: err.code, isUserError: true };
  }
  return { code: err.code ?? 'VALIDATE_ERROR', isUserError: false };
}

// ── Tool registration ─────────────────────────────────────────────────────────

const PROJECT_VALIDATE_SUMMARY_FIELDS = [
  'requestId',
  'project_path',
  'project_name',
  'quality_score',
  'quality_tier',
  'saved_to',
  'run_id',
  'completeness_score',
  'recommended_next_action',
];

export function registerProjectValidateFromPath(server: McpServer, config: ServerConfig): void {
  server.registerTool(
    'provar_project_validate',
    {
      title: 'Validate Project',
      description: desc(
        [
          'Validate a Provar project directly from its directory on disk.',
          'Reads the plan/suite/testinstance hierarchy from the plans/ directory,',
          'resolves test case XML from the tests/ directory, extracts project context',
          '(connections, environments, secrets) from the .testproject file, then runs',
          'the full validation rule set.',
          'Returns a compact quality score, violation summary, and per-plan/suite scores.',
          'By default returns a slim summary response to avoid token explosion.',
          'Pass include_plan_details:true or detail:full to get full per-suite and per-test-case data.',
          'By default saves a QH-compatible JSON report to',
          '{project_path}/provardx/validation/ (created if absent).',
          'Plan integrity: if any plan or suite directory is missing a .planitem file, the response includes a plan_integrity_warnings array.',
          'Test instances in those directories are silently ignored by the Provar runner — fix these before running tests.',
          'Every response includes run_id — pass it as baseline_run_id in the next call to receive only new/resolved violations.',
          'IMPORTANT: Use this tool for whole-project validation —',
          'DO NOT read individual test case files and pass XML content inline.',
          'Pass a project_path and let this tool handle all file reading.',
        ].join(' '),
        'Validate a Provar project from disk; quality score, violation summary, run_id for diff.'
      ),
      inputSchema: {
        project_path: z
          .string()
          .describe(
            desc(
              'Absolute path to the Provar project root (the directory containing the .testproject file)',
              'string, absolute path to project root'
            )
          ),
        quality_threshold: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .default(80)
          .describe(
            desc(
              'Minimum quality score for a test case to be considered valid (default: 80)',
              'number 0–100, optional; minimum quality score threshold'
            )
          ),
        save_results: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            desc(
              'Write a QH-compatible JSON report to provardx/validation/ (default: true)',
              'bool, optional; default true, write report to disk'
            )
          ),
        results_dir: z
          .string()
          .optional()
          .describe(
            desc(
              'Override the output directory for the saved report (default: {project_path}/provardx/validation)',
              'string, optional; override report output dir'
            )
          ),
        include_plan_details: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            desc(
              'When true, include full per-suite and per-test-case violation data in the response. ' +
                'Default false to keep response small. Use only when you need to inspect specific test case failures.',
              'bool, optional; default false, include full per-suite violation data'
            )
          ),
        max_uncovered: z
          .number()
          .int()
          .min(0)
          .optional()
          .default(20)
          .describe(
            desc(
              'Maximum number of uncovered test case paths to include in the response (default: 20). Set to 0 for none, or a large number for all.',
              'int ≥0, optional; max uncovered test case paths returned'
            )
          ),
        max_violations: z
          .number()
          .int()
          .min(0)
          .optional()
          .default(50)
          .describe(
            desc(
              'When include_plan_details:true, caps project_violations returned (default: 50). Ignored in slim mode where violations are grouped by rule_id instead.',
              'int ≥0, optional; max violations returned in detail mode'
            )
          ),
        detail: z
          .enum(['summary', 'standard', 'full'])
          .optional()
          .default('standard')
          .describe(
            'Response verbosity. "summary": key scores and stop signal only. "standard": slim violation summary (default). "full": full per-suite and per-test-case data (implies include_plan_details:true).'
          ),
        baseline_run_id: z
          .string()
          .optional()
          .describe(
            'run_id from a previous call. When provided, returns only project-level violations that are new or resolved since that run: { added, resolved, unchanged_count, run_id }. If not found, returns error BASELINE_NOT_FOUND.'
          ),
      },
    },
    ({
      project_path,
      quality_threshold,
      save_results,
      results_dir,
      include_plan_details,
      max_uncovered,
      max_violations,
      detail,
      baseline_run_id,
    }) => {
      const requestId = makeRequestId();
      log('info', 'provar_project_validate', { requestId, project_path, include_plan_details });

      try {
        assertPathAllowed(project_path, config.allowedPaths);
        if (results_dir) assertPathAllowed(results_dir, config.allowedPaths);

        const storageDir = results_dir ?? path.join(project_path, 'provardx', 'validation');
        const runId = generateRunId(project_path);

        const result = validateProjectFromPath({
          project_path,
          quality_threshold,
          save_results,
          results_dir,
        });

        if (result.save_error) {
          log('warn', 'provar_project_validate: could not save results', { requestId, error: result.save_error });
        }

        const currentViolations = result.project_violations as unknown as DiffableViolation[];

        // Load baseline BEFORE saving to prevent eviction of the requested baseline
        const baseline =
          save_results !== false && baseline_run_id !== undefined && baseline_run_id !== ''
            ? loadBaselineViolations(storageDir, baseline_run_id)
            : null;

        const hasBaseline = save_results !== false ? hasAnyRun(storageDir) : false;

        if (save_results !== false) {
          try {
            saveRun(storageDir, runId, currentViolations);
          } catch (saveErr) {
            log('warn', 'provar_project_validate: could not save run for diff', {
              requestId,
              error: (saveErr as Error).message,
            });
          }
        }

        // Diff mode
        if (baseline_run_id !== undefined && baseline_run_id !== '') {
          if (!baseline) {
            const errResult = makeError(
              'BASELINE_NOT_FOUND',
              'Baseline run not found. Run validation without baseline_run_id first to establish a baseline.',
              requestId,
              false,
              { suggestion: 'Run provar_project_validate without baseline_run_id first to establish a baseline.' }
            );
            return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
          }
          const diff = computeDiff(baseline, currentViolations);
          const completeness_score = calcCompletenessScore(
            result.summary.test_cases_valid,
            result.summary.total_test_cases
          );
          const recommended_next_action = calcNextAction(completeness_score, true);
          const diffResponse = {
            requestId,
            ...(save_results !== false ? { run_id: runId } : {}),
            ...diff,
            completeness_score,
            recommended_next_action,
          };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(diffResponse) }],
            structuredContent: diffResponse,
          };
        }

        const completeness_score = calcCompletenessScore(
          result.summary.test_cases_valid,
          result.summary.total_test_cases
        );
        const recommended_next_action = calcNextAction(completeness_score, hasBaseline);

        const usePlanDetails = include_plan_details || detail === 'full';
        const shaped = shapeResponse(result, usePlanDetails, max_uncovered, max_violations);
        const response = {
          requestId,
          ...(save_results !== false ? { run_id: runId } : {}),
          completeness_score,
          recommended_next_action,
          ...shaped,
        };

        const detailLevel = (detail ?? 'standard') as DetailLevel;
        const finalResponse = applyDetailLevel(response, detailLevel, PROJECT_VALIDATE_SUMMARY_FIELDS);

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(finalResponse) }],
          structuredContent: finalResponse,
        };
      } catch (err: unknown) {
        const error = err as Error & { code?: string };
        const { code, isUserError } = classifyError(error);
        const errResult = makeError(code, error.message, requestId, !isUserError);
        log('error', 'provar_project_validate failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}
