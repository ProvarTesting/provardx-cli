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
import { runSfCommand, soqlEscape } from './sfSpawn.js';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SfRecord {
  [key: string]: unknown;
  Id: string;
}

interface SfQueryResponse {
  status: number;
  result: { totalSize: number; records: SfRecord[] };
}

interface SfCreateResponse {
  status: number;
  result: { id: string; success: boolean; errors: unknown[] };
}

interface FailureContext {
  executionId: string;
  testCaseId: string;
  tester: string;
  stepExecutionId: string;
  stepId: string;
  stepAction: string;
  stepResult: string;
  stepSeq: number;
  browser: string;
  browserVersion: string;
  environment: string;
}

// ── SF CLI helpers ─────────────────────────────────────────────────────────────

function runSfArgs(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const { stdout, stderr, exitCode } = runSfCommand(args);
  return { stdout, stderr, exitCode };
}

function formatSfCommandError(action: string, exitCode: number, stderr: string, stdout: string): string {
  const details = [stderr?.trim(), stdout?.trim()].filter(Boolean).join('\n');
  return details
    ? `${action} failed with exit code ${exitCode}: ${details}`
    : `${action} failed with exit code ${exitCode}`;
}

function runQuery(soql: string, targetOrg: string): SfQueryResponse {
  const { stdout, stderr, exitCode } = runSfArgs([
    'data', 'query',
    '--query', soql,
    '--target-org', targetOrg,
    '--json',
  ]);
  if (exitCode !== 0) {
    throw new Error(formatSfCommandError('Salesforce query', exitCode, stderr, stdout));
  }
  return JSON.parse(stdout) as SfQueryResponse;
}

function createRecord(sobject: string, values: string, targetOrg: string): string {
  const { stdout, stderr, exitCode } = runSfArgs([
    'data', 'create', 'record',
    '--sobject', sobject,
    '--values', values,
    '--target-org', targetOrg,
    '--json',
  ]);
  if (exitCode !== 0) {
    throw new Error(formatSfCommandError(`Failed to create ${sobject}`, exitCode, stderr, stdout));
  }
  const parsed = JSON.parse(stdout) as SfCreateResponse;
  if (!parsed.result?.success) {
    throw new Error(formatSfCommandError(`Failed to create ${sobject}`, exitCode, stderr, stdout));
  }
  return parsed.result.id;
}

/** Strip characters unsafe for sf --values double-quoted strings and truncate. */
function safeText(value: unknown, maxLen = 200): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/"/g, "'")
    .replace(/\n|\r/g, ' ')
    .substring(0, maxLen);
}

// ── Core defect creation logic (exported for auto-defects use) ─────────────────

export interface DefectCreateResult {
  defectId: string;
  tcDefectId: string;
  execDefectId: string;
  executionId: string;
  testCaseId: string;
}

export function createDefectsForRun(
  runId: string,
  targetOrg: string,
  failedTestFilter?: string[]
): { created: DefectCreateResult[]; skipped: number; message: string } {
  // Step 1: resolve job record ID from tracking ID
  const jobQuery = runQuery(
    `SELECT Id FROM provar__Test_Plan_Schedule_Job__c WHERE provar__Tracking_Id__c = '${soqlEscape(runId)}'`,
    targetOrg
  );
  if (jobQuery.result.totalSize === 0) {
    throw new Error(`No Test_Plan_Schedule_Job__c found with Tracking_Id__c = '${runId}'`);
  }
  const jobId = jobQuery.result.records[0].Id;

  // Step 2: find Test_Cycle__c — carries browser + environment context
  const cycleQuery = runQuery(
    `SELECT Id, provar__Web_Browser__c, provar__Browser_Version__c, provar__Environment_Text__c
     FROM provar__Test_Cycle__c
     WHERE provar__Test_Plan_Schedule_Job__c = '${soqlEscape(jobId)}'
     LIMIT 1`,
    targetOrg
  );
  const cycle = cycleQuery.result.records[0] ?? {};
  const browser = safeText(cycle['provar__Web_Browser__c'], 100);
  const browserVersion = safeText(cycle['provar__Browser_Version__c'], 100);
  const environmentText = safeText(cycle['provar__Environment_Text__c'], 255);
  const cycleId = String(cycle['Id'] ?? '');

  if (!cycleId) {
    throw new Error(`No Test_Cycle__c found for job ${jobId}`);
  }

  // Step 3: find failed Test_Execution__c records
  const execQuery = runQuery(
    `SELECT Id, provar__Test_Case__c, provar__Tester__c
     FROM provar__Test_Execution__c
     WHERE provar__Test_Cycle__c = '${soqlEscape(cycleId)}'
     AND provar__Status__c = 'Failed'`,
    targetOrg
  );

  if (execQuery.result.totalSize === 0) {
    return { created: [], skipped: 0, message: 'No failed test executions found for this run.' };
  }

  let executions = execQuery.result.records;

  // Apply optional TC name filter (filter by ID prefix match — caller must resolve names to IDs first
  // if needed; here we filter by TC record ID substring for flexibility)
  if (failedTestFilter && failedTestFilter.length > 0) {
    executions = executions.filter((e) =>
      failedTestFilter.some((f) => String(e['provar__Test_Case__c']).includes(f) || f.includes(String(e['provar__Test_Case__c'])))
    );
  }

  const created: DefectCreateResult[] = [];

  for (const exec of executions) {
    const executionId = exec.Id;
    const testCaseId = String(exec['provar__Test_Case__c'] ?? '');
    const tester = safeText(exec['provar__Tester__c'], 100);

    // Step 4: first failed step in this execution
    const stepQuery = runQuery(
      `SELECT Id, provar__ActionObs__c, provar__Actual_Result__c, provar__Sequence_No__c, provar__Test_Step__c
       FROM provar__Test_Step_Execution__c
       WHERE provar__Test_Execution__c = '${soqlEscape(executionId)}'
       AND provar__Result__c = 'Fail'
       ORDER BY provar__Sequence_No__c ASC
       LIMIT 1`,
      targetOrg
    );

    const step = stepQuery.result.records[0] ?? {};
    const stepExecutionId = step['Id'] ?? '';
    const stepId = String(step['provar__Test_Step__c'] ?? '');
    const stepAction = safeText(step['provar__ActionObs__c'], 200);
    const stepResult = safeText(step['provar__Actual_Result__c'], 200);
    const stepSeq = Number(step['provar__Sequence_No__c'] ?? 0);

    const ctx: FailureContext = {
      executionId,
      testCaseId,
      tester,
      stepExecutionId: String(stepExecutionId),
      stepId,
      stepAction,
      stepResult,
      stepSeq,
      browser,
      browserVersion,
      environment: environmentText,
    };

    // Step 5a: create Defect__c
    const descLines = [
      `Failure: ${ctx.stepResult || 'See test execution for details'}`,
      `Step ${ctx.stepSeq}: ${ctx.stepAction}`,
      `Browser: ${ctx.browser} ${ctx.browserVersion}`.trim(),
      `Environment: ${ctx.environment}`,
      `Tester: ${ctx.tester}`,
      `Test Execution ID: ${ctx.executionId}`,
      `Run ID: ${runId}`,
    ]
      .filter((l) => l.split(': ')[1]?.trim())
      .join(' | ');

    const defectValues =
      `Name="TC Failure: ${safeText(testCaseId, 100)}" ` +
      `provar__Description__c="${safeText(descLines, 2000)}" ` +
      'provar__Status__c="Open"';

    const defectId = createRecord('provar__Defect__c', defectValues, targetOrg);

    // Step 5b: link TC → Defect
    const tcDefectValues =
      `provar__Defect__c="${defectId}" ` +
      `provar__Test_Case__c="${testCaseId}"` +
      (stepId ? ` provar__Test_Step__c="${stepId}"` : '');

    const tcDefectId = createRecord('provar__Test_Case_Defect__c', tcDefectValues, targetOrg);

    // Step 5c: link Execution → Defect (with step execution if available)
    const execDefectValues =
      `provar__Defect__c="${defectId}" ` +
      `provar__Test_Execution__c="${executionId}"` +
      (stepExecutionId ? ` provar__Test_Step_Execution__c="${stepExecutionId}"` : '');

    const execDefectId = createRecord(
      'provar__Test_Execution_Defect__c',
      execDefectValues,
      targetOrg
    );

    log('info', 'defect created', { defectId, tcDefectId, execDefectId, executionId });

    created.push({ defectId, tcDefectId, execDefectId, executionId, testCaseId });
  }

  const syncNote =
    'If Jira or ADO sync is enabled in your Quality Hub org, these defects will sync automatically.';
  return {
    created,
    skipped: execQuery.result.totalSize - created.length,
    message: `Created ${created.length} defect(s) for run ${runId}. ${syncNote}`,
  };
}

// ── Tool registration ──────────────────────────────────────────────────────────

export function registerQualityHubDefectCreate(server: McpServer): void {
  server.tool(
    'provar.qualityhub.defect.create',
    [
      'Create Defect__c records in Quality Hub for failed test executions in a given run.',
      'Queries the run by Tracking_Id__c, finds failed Test_Execution__c records, creates a',
      'Defect__c per failure (with description, step, browser, environment, tester), and links',
      'it via Test_Case_Defect__c and Test_Execution_Defect__c junction records.',
      'If Jira or ADO sync is configured in Quality Hub, defects sync to those systems automatically.',
    ].join(' '),
    {
      run_id: z
        .string()
        .describe('Test run Tracking_Id__c value returned by provar.qualityhub.testrun'),
      target_org: z.string().describe('SF org alias or username for the Quality Hub org'),
      failed_tests: z
        .array(z.string())
        .optional()
        .describe(
          'Optional filter — list of Test_Case__c record ID substrings to restrict defect creation to specific failures'
        ),
    },
    ({ run_id, target_org, failed_tests }) => {
      const requestId = makeRequestId();
      log('info', 'provar.qualityhub.defect.create', { requestId, run_id, target_org });

      try {
        const result = createDefectsForRun(run_id, target_org, failed_tests);
        const response = { requestId, ...result };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
      } catch (err) {
        const error = err as Error & { code?: string };
        log('error', 'provar.qualityhub.defect.create failed', {
          requestId,
          error: error.message,
        });
        return {
          isError: true as const,
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                makeError(error.code ?? 'DEFECT_CREATE_FAILED', error.message, requestId, false)
              ),
            },
          ],
        };
      }
    }
  );
}

export function registerAllDefectTools(server: McpServer): void {
  registerQualityHubDefectCreate(server);
}
