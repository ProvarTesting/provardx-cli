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
import { applyDetailLevel, type DetailLevel } from '../utils/detailLevel.js';
import { maskFields, parseFieldsParam } from '../utils/fieldMask.js';
import { runSfCommand } from './sfSpawn.js';
import { handleSpawnError } from './spawnErrors.js';
import { desc } from './descHelper.js';

const QH_SUMMARY_FIELDS = ['requestId', 'exitCode'];

// ── Tool: provar_qualityhub_connect ───────────────────────────────────────────

export function registerQualityHubConnect(server: McpServer): void {
  server.registerTool(
    'provar_qualityhub_connect',
    {
      title: 'Connect to Quality Hub',
      description: desc(
        'Connect to a Provar Quality Hub org. Invokes `sf provar quality-hub connect` with the supplied flags.',
        'Connect to a Provar Quality Hub org via sf CLI.'
      ),
      inputSchema: {
        target_org: z
          .string()
          .describe(desc('SF org alias or username to connect as', 'string, SF org alias or username')),
        flags: z
          .array(z.string())
          .optional()
          .default([])
          .describe(
            desc('Additional raw CLI flags to forward (e.g. ["--json"])', 'array of strings, optional; extra CLI flags')
          ),
        sf_path: z
          .string()
          .optional()
          .describe(
            desc(
              'Path to the sf CLI executable when not in PATH ' +
                '(e.g. "C:\\\\Program Files\\\\sf\\\\bin\\\\sf.cmd" for the Windows standalone installer). ' +
                'Leave unset to use auto-discovery.',
              'string, optional; path to sf CLI executable'
            )
          ),
      },
    },
    ({ target_org, flags, sf_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar_qualityhub_connect', { requestId, target_org });

      try {
        const result = runSfCommand(
          ['provar', 'quality-hub', 'connect', '--target-org', target_org, ...flags],
          sf_path
        );
        const response = { requestId, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };

        if (result.exitCode !== 0) {
          return {
            isError: true as const,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(makeError('QH_CONNECT_FAILED', result.stderr || result.stdout, requestId)),
              },
            ],
          };
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(response) }], structuredContent: response };
      } catch (err) {
        return handleSpawnError(err, requestId, 'provar_qualityhub_connect');
      }
    }
  );
}

// ── Tool: provar_qualityhub_display ──────────────────────────────────────────

export function registerQualityHubDisplay(server: McpServer): void {
  server.registerTool(
    'provar_qualityhub_display',
    {
      title: 'Display Quality Hub Info',
      description: desc(
        'Display connected Quality Hub org info. Invokes `sf provar quality-hub display`.',
        'Display connected Quality Hub org info via sf CLI.'
      ),
      inputSchema: {
        target_org: z
          .string()
          .optional()
          .describe(
            desc('SF org alias or username (uses default if omitted)', 'string, optional; SF org alias or username')
          ),
        flags: z
          .array(z.string())
          .optional()
          .default([])
          .describe(desc('Additional raw CLI flags to forward', 'array of strings, optional; extra CLI flags')),
        sf_path: z
          .string()
          .optional()
          .describe(
            desc(
              'Path to the sf CLI executable when not in PATH ' +
                '(e.g. "C:\\\\Program Files\\\\sf\\\\bin\\\\sf.cmd" for the Windows standalone installer). ' +
                'Leave unset to use auto-discovery.',
              'string, optional; path to sf CLI executable'
            )
          ),
        detail: z
          .enum(['summary', 'standard', 'full'])
          .optional()
          .default('standard')
          .describe(
            'Response verbosity: "summary" returns only requestId and exitCode; ' +
              '"standard" (default) returns requestId, exitCode, stdout, and stderr.'
          ),
        fields: z
          .string()
          .optional()
          .describe(
            'Comma-separated list of response keys to retain (e.g. "exitCode,stdout"). ' +
              'Unknown field names are silently ignored. Applied after the detail filter.'
          ),
      },
    },
    ({ target_org, flags, sf_path, detail, fields }) => {
      const requestId = makeRequestId();
      log('info', 'provar_qualityhub_display', { requestId, target_org });

      try {
        const args = ['provar', 'quality-hub', 'display', ...flags];
        if (target_org) args.splice(3, 0, '--target-org', target_org);

        const result = runSfCommand(args, sf_path);
        let response: Record<string, unknown> = {
          requestId,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        };

        if (result.exitCode !== 0) {
          return {
            isError: true as const,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(makeError('QH_DISPLAY_FAILED', result.stderr || result.stdout, requestId)),
              },
            ],
          };
        }

        const detailLevel = (detail ?? 'standard') as DetailLevel;
        if (detailLevel !== 'standard') {
          response = applyDetailLevel(response, detailLevel, QH_SUMMARY_FIELDS);
        }
        const fieldList = parseFieldsParam(fields);
        if (fieldList) {
          response = maskFields(response, fieldList) as Record<string, unknown>;
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(response) }], structuredContent: response };
      } catch (err) {
        return handleSpawnError(err, requestId, 'provar_qualityhub_display');
      }
    }
  );
}

// ── Tool: provar_qualityhub_testrun ──────────────────────────────────────────

function detectWildcardFlags(flags: string[]): string | undefined {
  for (let i = 0; i < flags.length - 1; i++) {
    if (flags[i] === '--plan-name') {
      const value = flags[i + 1];
      if (value.includes('*') || value.includes('?')) {
        return (
          `Wildcard testPlan scope detected ("${value}"). ` +
          'QH plan-level reporting will be skipped. ' +
          'Use exact plan names for QH plan reporting.'
        );
      }
    }
  }
  return undefined;
}

export function registerQualityHubTestRun(server: McpServer): void {
  server.registerTool(
    'provar_qualityhub_testrun',
    {
      title: 'Trigger Quality Hub Test Run',
      description: desc(
        'Trigger a Quality Hub test run. Invokes `sf provar quality-hub test run`. ' +
          'Warning: wildcard characters (* or ?) in flag values will cause QH plan-level reporting to be skipped — use exact plan names.',
        'Trigger a Quality Hub test run via sf CLI; use exact plan names.'
      ),
      inputSchema: {
        target_org: z.string().describe(desc('SF org alias or username', 'string, SF org alias or username')),
        flags: z
          .array(z.string())
          .optional()
          .default([])
          .describe(
            desc(
              'Additional raw CLI flags (e.g. ["--plan-name", "SmokeTests"]). Avoid wildcards in --plan-name values — they skip QH plan-level reporting.',
              'array of strings, optional; extra CLI flags; avoid wildcards in --plan-name'
            )
          ),
        sf_path: z
          .string()
          .optional()
          .describe(
            desc(
              'Path to the sf CLI executable when not in PATH ' +
                '(e.g. "C:\\\\Program Files\\\\sf\\\\bin\\\\sf.cmd" for the Windows standalone installer). ' +
                'Leave unset to use auto-discovery.',
              'string, optional; path to sf CLI executable'
            )
          ),
      },
    },
    ({ target_org, flags, sf_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar_qualityhub_testrun', { requestId, target_org });

      try {
        const wildcardWarning = detectWildcardFlags(flags);
        const result = runSfCommand(
          ['provar', 'quality-hub', 'test', 'run', '--target-org', target_org, ...flags],
          sf_path
        );
        const response: Record<string, unknown> = {
          requestId,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        };

        if (wildcardWarning) {
          response['details'] = { warning: wildcardWarning };
        }

        if (result.exitCode !== 0) {
          return {
            isError: true as const,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(makeError('QH_TESTRUN_FAILED', result.stderr || result.stdout, requestId)),
              },
            ],
          };
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(response) }], structuredContent: response };
      } catch (err) {
        return handleSpawnError(err, requestId, 'provar_qualityhub_testrun');
      }
    }
  );
}

// ── Tool: provar_qualityhub_testrun_report ────────────────────────────────────

export function registerQualityHubTestRunReport(server: McpServer): void {
  server.registerTool(
    'provar_qualityhub_testrun_report',
    {
      title: 'Poll Quality Hub Test Run',
      description: desc(
        'Poll the status of a Quality Hub test run. Invokes `sf provar quality-hub test run report`.',
        'Poll a Quality Hub test run status via sf CLI.'
      ),
      inputSchema: {
        target_org: z.string().describe(desc('SF org alias or username', 'string, SF org alias or username')),
        run_id: z
          .string()
          .describe(
            desc('Test run ID returned by provar_qualityhub_testrun', 'string, run ID from qualityhub_testrun')
          ),
        flags: z
          .array(z.string())
          .optional()
          .default([])
          .describe(desc('Additional raw CLI flags', 'array of strings, optional; extra CLI flags')),
        sf_path: z
          .string()
          .optional()
          .describe(
            desc(
              'Path to the sf CLI executable when not in PATH ' +
                '(e.g. "C:\\\\Program Files\\\\sf\\\\bin\\\\sf.cmd" for the Windows standalone installer). ' +
                'Leave unset to use auto-discovery.',
              'string, optional; path to sf CLI executable'
            )
          ),
      },
    },
    ({ target_org, run_id, flags, sf_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar_qualityhub_testrun_report', { requestId, target_org, run_id });

      try {
        const result = runSfCommand(
          ['provar', 'quality-hub', 'test', 'run', 'report', '--target-org', target_org, '--run-id', run_id, ...flags],
          sf_path
        );
        const response = { requestId, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };

        if (result.exitCode !== 0) {
          return {
            isError: true as const,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(makeError('QH_REPORT_FAILED', result.stderr || result.stdout, requestId)),
              },
            ],
          };
        }

        const failureStatuses = new Set(['FAIL', 'FAILED']);
        let hasFailures = false;
        try {
          const parsed = JSON.parse(result.stdout) as { result?: { status?: string } };
          const normalizedStatus = parsed.result?.status?.trim().toUpperCase();
          hasFailures = normalizedStatus !== undefined && failureStatuses.has(normalizedStatus);
        } catch {
          const statusMatch = result.stdout.match(/"status"\s*:\s*"([^"]+)"/i);
          const normalizedStatus = statusMatch?.[1]?.trim().toUpperCase();
          hasFailures = normalizedStatus !== undefined && failureStatuses.has(normalizedStatus);
        }
        const suggestion = hasFailures
          ? 'Failures detected. Use provar_qualityhub_defect_create with run_id and target_org to automatically create Defect__c records for each failure (syncs to Jira/ADO if configured).'
          : '';
        const responseWithSuggestion = { ...response, suggestion: suggestion || undefined };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(responseWithSuggestion) }],
          structuredContent: responseWithSuggestion,
        };
      } catch (err) {
        return handleSpawnError(err, requestId, 'provar_qualityhub_testrun_report');
      }
    }
  );
}

// ── Tool: provar_qualityhub_testrun_abort ─────────────────────────────────────

export function registerQualityHubTestRunAbort(server: McpServer): void {
  server.registerTool(
    'provar_qualityhub_testrun_abort',
    {
      title: 'Abort Quality Hub Test Run',
      description: desc(
        'Abort an in-progress Quality Hub test run. Invokes `sf provar quality-hub test run abort`.',
        'Abort an in-progress Quality Hub test run via sf CLI.'
      ),
      inputSchema: {
        target_org: z.string().describe(desc('SF org alias or username', 'string, SF org alias or username')),
        run_id: z.string().describe(desc('Test run ID to abort', 'string, run ID to abort')),
        flags: z
          .array(z.string())
          .optional()
          .default([])
          .describe(desc('Additional raw CLI flags', 'array of strings, optional; extra CLI flags')),
        sf_path: z
          .string()
          .optional()
          .describe(
            desc(
              'Path to the sf CLI executable when not in PATH ' +
                '(e.g. "C:\\\\Program Files\\\\sf\\\\bin\\\\sf.cmd" for the Windows standalone installer). ' +
                'Leave unset to use auto-discovery.',
              'string, optional; path to sf CLI executable'
            )
          ),
      },
    },
    ({ target_org, run_id, flags, sf_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar_qualityhub_testrun_abort', { requestId, target_org, run_id });

      try {
        const result = runSfCommand(
          ['provar', 'quality-hub', 'test', 'run', 'abort', '--target-org', target_org, '--run-id', run_id, ...flags],
          sf_path
        );
        const response = { requestId, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };

        if (result.exitCode !== 0) {
          return {
            isError: true as const,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(makeError('QH_ABORT_FAILED', result.stderr || result.stdout, requestId)),
              },
            ],
          };
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(response) }], structuredContent: response };
      } catch (err) {
        return handleSpawnError(err, requestId, 'provar_qualityhub_testrun_abort');
      }
    }
  );
}

// ── Tool: provar_qualityhub_testcase_retrieve ─────────────────────────────────

export function registerQualityHubTestcaseRetrieve(server: McpServer): void {
  server.registerTool(
    'provar_qualityhub_testcase_retrieve',
    {
      title: 'Retrieve Quality Hub Test Cases',
      description: desc(
        'Retrieve Quality Hub test cases by user story or component. Invokes `sf provar quality-hub testcase retrieve`.',
        'Retrieve Quality Hub test cases by user story or component via sf CLI.'
      ),
      inputSchema: {
        target_org: z.string().describe(desc('SF org alias or username', 'string, SF org alias or username')),
        flags: z
          .array(z.string())
          .optional()
          .default([])
          .describe(
            desc(
              'Additional raw CLI flags (e.g. ["--user-story", "US-123"])',
              'array of strings, optional; extra CLI flags e.g. --user-story'
            )
          ),
        sf_path: z
          .string()
          .optional()
          .describe(
            desc(
              'Path to the sf CLI executable when not in PATH ' +
                '(e.g. "C:\\\\Program Files\\\\sf\\\\bin\\\\sf.cmd" for the Windows standalone installer). ' +
                'Leave unset to use auto-discovery.',
              'string, optional; path to sf CLI executable'
            )
          ),
        detail: z
          .enum(['summary', 'standard', 'full'])
          .optional()
          .default('standard')
          .describe(
            'Response verbosity: "summary" returns only requestId and exitCode; ' +
              '"standard" (default) returns requestId, exitCode, stdout, and stderr.'
          ),
        fields: z
          .string()
          .optional()
          .describe(
            'Comma-separated list of response keys to retain (e.g. "exitCode,stdout"). ' +
              'Unknown field names are silently ignored. Applied after the detail filter.'
          ),
      },
    },
    ({ target_org, flags, sf_path, detail, fields }) => {
      const requestId = makeRequestId();
      log('info', 'provar_qualityhub_testcase_retrieve', { requestId, target_org });

      try {
        const result = runSfCommand(
          ['provar', 'quality-hub', 'testcase', 'retrieve', '--target-org', target_org, ...flags],
          sf_path
        );
        let response: Record<string, unknown> = {
          requestId,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        };

        if (result.exitCode !== 0) {
          return {
            isError: true as const,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(makeError('QH_RETRIEVE_FAILED', result.stderr || result.stdout, requestId)),
              },
            ],
          };
        }

        const detailLevel = (detail ?? 'standard') as DetailLevel;
        if (detailLevel !== 'standard') {
          response = applyDetailLevel(response, detailLevel, QH_SUMMARY_FIELDS);
        }
        const fieldList = parseFieldsParam(fields);
        if (fieldList) {
          response = maskFields(response, fieldList) as Record<string, unknown>;
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(response) }], structuredContent: response };
      } catch (err) {
        return handleSpawnError(err, requestId, 'provar_qualityhub_testcase_retrieve');
      }
    }
  );
}

// ── Bulk registration ─────────────────────────────────────────────────────────

export function registerAllQualityHubTools(server: McpServer): void {
  registerQualityHubConnect(server);
  registerQualityHubDisplay(server);
  registerQualityHubTestRun(server);
  registerQualityHubTestRunReport(server);
  registerQualityHubTestRunAbort(server);
  registerQualityHubTestcaseRetrieve(server);
}
