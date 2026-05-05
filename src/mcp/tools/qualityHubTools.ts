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
import { runSfCommand } from './sfSpawn.js';

function handleSpawnError(
  err: unknown,
  requestId: string,
  toolName: string
): { isError: true; content: Array<{ type: 'text'; text: string }> } {
  const error = err as Error & { code?: string };
  log('error', `${toolName} failed`, { requestId, error: error.message });
  return {
    isError: true as const,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(makeError(error.code ?? 'SF_ERROR', error.message, requestId, false)),
      },
    ],
  };
}

// ── Tool: provar_qualityhub_connect ───────────────────────────────────────────

export function registerQualityHubConnect(server: McpServer): void {
  server.tool(
    'provar_qualityhub_connect',
    'Connect to a Provar Quality Hub org. Invokes `sf provar quality-hub connect` with the supplied flags.',
    {
      target_org: z.string().describe('SF org alias or username to connect as'),
      flags: z
        .array(z.string())
        .optional()
        .default([])
        .describe('Additional raw CLI flags to forward (e.g. ["--json"])'),
    },
    ({ target_org, flags }) => {
      const requestId = makeRequestId();
      log('info', 'provar_qualityhub_connect', { requestId, target_org });

      try {
        const result = runSfCommand(['provar', 'quality-hub', 'connect', '--target-org', target_org, ...flags]);
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
  server.tool(
    'provar_qualityhub_display',
    'Display connected Quality Hub org info. Invokes `sf provar quality-hub display`.',
    {
      target_org: z.string().optional().describe('SF org alias or username (uses default if omitted)'),
      flags: z.array(z.string()).optional().default([]).describe('Additional raw CLI flags to forward'),
    },
    ({ target_org, flags }) => {
      const requestId = makeRequestId();
      log('info', 'provar_qualityhub_display', { requestId, target_org });

      try {
        const args = ['provar', 'quality-hub', 'display', ...flags];
        if (target_org) args.splice(3, 0, '--target-org', target_org);

        const result = runSfCommand(args);
        const response = { requestId, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };

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
  server.tool(
    'provar_qualityhub_testrun',
    'Trigger a Quality Hub test run. Invokes `sf provar quality-hub test run`. ' +
      'Warning: wildcard characters (* or ?) in flag values will cause QH plan-level reporting to be skipped — use exact plan names.',
    {
      target_org: z.string().describe('SF org alias or username'),
      flags: z
        .array(z.string())
        .optional()
        .default([])
        .describe(
          'Additional raw CLI flags (e.g. ["--plan-name", "SmokeTests"]). Avoid wildcards in --plan-name values — they skip QH plan-level reporting.'
        ),
    },
    ({ target_org, flags }) => {
      const requestId = makeRequestId();
      log('info', 'provar_qualityhub_testrun', { requestId, target_org });

      try {
        const wildcardWarning = detectWildcardFlags(flags);
        const result = runSfCommand(['provar', 'quality-hub', 'test', 'run', '--target-org', target_org, ...flags]);
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
  server.tool(
    'provar_qualityhub_testrun_report',
    'Poll the status of a Quality Hub test run. Invokes `sf provar quality-hub test run report`.',
    {
      target_org: z.string().describe('SF org alias or username'),
      run_id: z.string().describe('Test run ID returned by provar_qualityhub_testrun'),
      flags: z.array(z.string()).optional().default([]).describe('Additional raw CLI flags'),
    },
    ({ target_org, run_id, flags }) => {
      const requestId = makeRequestId();
      log('info', 'provar_qualityhub_testrun_report', { requestId, target_org, run_id });

      try {
        const result = runSfCommand([
          'provar',
          'quality-hub',
          'test',
          'run',
          'report',
          '--target-org',
          target_org,
          '--run-id',
          run_id,
          ...flags,
        ]);
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
  server.tool(
    'provar_qualityhub_testrun_abort',
    'Abort an in-progress Quality Hub test run. Invokes `sf provar quality-hub test run abort`.',
    {
      target_org: z.string().describe('SF org alias or username'),
      run_id: z.string().describe('Test run ID to abort'),
      flags: z.array(z.string()).optional().default([]).describe('Additional raw CLI flags'),
    },
    ({ target_org, run_id, flags }) => {
      const requestId = makeRequestId();
      log('info', 'provar_qualityhub_testrun_abort', { requestId, target_org, run_id });

      try {
        const result = runSfCommand([
          'provar',
          'quality-hub',
          'test',
          'run',
          'abort',
          '--target-org',
          target_org,
          '--run-id',
          run_id,
          ...flags,
        ]);
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
  server.tool(
    'provar_qualityhub_testcase_retrieve',
    'Retrieve Quality Hub test cases by user story or component. Invokes `sf provar quality-hub testcase retrieve`.',
    {
      target_org: z.string().describe('SF org alias or username'),
      flags: z
        .array(z.string())
        .optional()
        .default([])
        .describe('Additional raw CLI flags (e.g. ["--user-story", "US-123"])'),
    },
    ({ target_org, flags }) => {
      const requestId = makeRequestId();
      log('info', 'provar_qualityhub_testcase_retrieve', { requestId, target_org });

      try {
        const result = runSfCommand([
          'provar',
          'quality-hub',
          'testcase',
          'retrieve',
          '--target-org',
          target_org,
          ...flags,
        ]);
        const response = { requestId, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };

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
