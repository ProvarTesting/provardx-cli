/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from '../server.js';
import { assertPathAllowed, PathPolicyError } from '../security/pathPolicy.js';
import { makeError, makeRequestId } from '../schemas/common.js';
import { log } from '../logging/logger.js';
import { validateTestCase } from './testCaseValidate.js';

// ── Shorthand → fully-qualified API ID map ────────────────────────────────────
// Provar runtime requires fully-qualified IDs. Shorthand forms are accepted here
// and expanded automatically before writing XML.

const SHORTHAND_TO_FQID: Record<string, string> = {
  UiConnect:          'com.provar.plugins.forcedotcom.core.ui.UiConnect',
  UiDoAction:         'com.provar.plugins.forcedotcom.core.ui.UiDoAction',
  UiWithScreen:       'com.provar.plugins.forcedotcom.core.ui.UiWithScreen',
  UiAssert:           'com.provar.plugins.forcedotcom.core.ui.UiAssert',
  UiNavigate:         'com.provar.plugins.forcedotcom.core.ui.UiNavigate',
  UiWithRow:          'com.provar.plugins.forcedotcom.core.ui.UiWithRow',
  UiScrollToElement:  'com.provar.plugins.forcedotcom.core.ui.UiScrollToElement',
  ApexConnect:        'com.provar.plugins.forcedotcom.core.testapis.ApexConnect',
  ApexSoqlQuery:      'com.provar.plugins.forcedotcom.core.testapis.ApexSoqlQuery',
  ApexCreateObject:   'com.provar.plugins.forcedotcom.core.testapis.ApexCreateObject',
  ApexReadObject:     'com.provar.plugins.forcedotcom.core.testapis.ApexReadObject',
  ApexUpdateObject:   'com.provar.plugins.forcedotcom.core.testapis.ApexUpdateObject',
  ApexDeleteObject:   'com.provar.plugins.forcedotcom.core.testapis.ApexDeleteObject',
  SetValues:          'com.provar.plugins.bundled.apis.control.SetValues',
  AssertValues:       'com.provar.plugins.bundled.apis.AssertValues',
  StepGroup:          'com.provar.plugins.bundled.apis.control.StepGroup',
  Sleep:              'com.provar.plugins.bundled.apis.control.Sleep',
  ForEach:            'com.provar.plugins.bundled.apis.control.ForEach',
  CaseCall:           'com.provar.plugins.bundled.apis.control.CaseCall',
};

function resolveApiId(apiId: string): string {
  return SHORTHAND_TO_FQID[apiId] ?? apiId;
}

// ── Per-step runtime warnings ─────────────────────────────────────────────────

function buildStepWarnings(steps: Array<{ api_id: string }>): string[] {
  const warnings: string[] = [];
  const resolvedIds = steps.map((s) => resolveApiId(s.api_id));

  if (resolvedIds.includes(SHORTHAND_TO_FQID['ApexReadObject'] ?? '')) {
    warnings.push(
      'ApexReadObject: You must specify field names in the attributes (e.g. fieldList); ' +
      'if none are provided Provar generates "SELECT  FROM ..." which throws MALFORMED_QUERY. ' +
      'Prefer ApexSoqlQuery for full control over the SELECT clause and result binding.'
    );
  }

  if (resolvedIds.includes(SHORTHAND_TO_FQID['AssertValues'] ?? '')) {
    warnings.push(
      'AssertValues: Direct index paths like "ResultList[0].FieldName" are NOT supported for ApexSoqlQuery results. ' +
      'To assert SOQL results use either: (a) a ForEach loop over the result list with AssertValues inside, ' +
      'or (b) a SetValues step to extract a specific field into a named variable, then assert that variable.'
    );
  }

  return warnings;
}

// ── Schema ────────────────────────────────────────────────────────────────────

const StepSchema = z.object({
  api_id: z
    .string()
    .describe(
      'Provar step API ID. Shorthand forms are accepted and auto-expanded to fully-qualified IDs: ' +
      'UiConnect, UiDoAction, UiWithScreen, UiAssert, UiNavigate, UiWithRow, ' +
      'ApexConnect, ApexSoqlQuery, ApexCreateObject, ApexReadObject, ApexUpdateObject, ApexDeleteObject, ' +
      'SetValues, AssertValues, StepGroup, Sleep, ForEach, CaseCall. ' +
      'Or pass the fully-qualified ID directly (com.provar.plugins.*).'
    ),
  name: z.string().describe('Human-readable step name'),
  attributes: z
    .record(z.string())
    .default({})
    .describe(
      'Step argument values as key/value pairs. Written as <arguments><argument id="key"><value .../></argument></arguments> ' +
      'inside the <apiCall> element — the format Provar runtime requires. ' +
      'Do NOT rely on XML attributes on <apiCall>; the runtime silently ignores them. ' +
      'Example: { "connectionName": "MyOrg", "objectApiName": "Opportunity" }'
    ),
});

const TOOL_DESCRIPTION = [
  'Generate a Provar XML test case skeleton with proper UUID v4 guids, sequential testItemId values, and <steps> structure.',
  'Returns XML content. Writes to disk only when dry_run=false.',
  'API IDs: shorthand forms (e.g. UiConnect, ApexSoqlQuery) are automatically expanded to fully-qualified IDs required by the Provar runtime.',
  'Step arguments: attributes are emitted as <arguments><argument id="..."><value .../></argument></arguments> — the only format the Provar runtime processes.',
  'Shorthand XML attributes on <apiCall> are silently ignored at runtime; always supply arguments via the attributes map.',
  'Data-driven note: <dataTable> only iterates rows when the test case runs via a test plan instance (.testinstance).',
  'Running directly via the provardx testCase property resolves all data table variables as null.',
  'Use provar.testplan.add-instance to wire into a plan for data-driven execution.',
  'ApexReadObject requires field names in attributes; omitting them produces MALFORMED_QUERY. Prefer ApexSoqlQuery.',
  'AssertValues on SOQL results: index paths like "ResultList[0].Field" are not supported.',
  'Use ForEach to iterate the result list, or SetValues to extract a field into a variable first.',
  'Validation: the response always includes a validation field with is_valid, validity_score, quality_score, and any structural issues — check this before attempting to run the test case.',
].join(' ');

export function registerTestCaseGenerate(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.testcase.generate',
    TOOL_DESCRIPTION,
    {
      test_case_name: z.string().describe('Test case name (human-readable label)'),
      test_case_id: z
        .string()
        .optional()
        .describe('Explicit test case id; auto-generated UUID v4 if omitted'),
      steps: z.array(StepSchema).default([]).describe('Ordered list of test steps'),
      output_path: z
        .string()
        .optional()
        .describe('Suggested file path for the .xml file (returned in response)'),
      overwrite: z.boolean().default(false).describe('Overwrite if output_path file already exists'),
      dry_run: z
        .boolean()
        .default(true)
        .describe('true = return XML only (default); false = write to output_path'),
      idempotency_key: z
        .string()
        .optional()
        .describe('Caller-provided key echoed back for deduplication tracking'),
    },
    (input) => {
      const requestId = makeRequestId();
      log('info', 'provar.testcase.generate', {
        requestId,
        test_case_name: input.test_case_name,
        dry_run: input.dry_run,
      });

      try {
        const xmlContent = buildTestCaseXml(input);
        const filePath: string | undefined = input.output_path
          ? path.resolve(input.output_path)
          : undefined;
        let written = false;

        if (filePath && !input.dry_run) {
          assertPathAllowed(filePath, config.allowedPaths);

          if (fs.existsSync(filePath) && !input.overwrite) {
            const err = makeError(
              'FILE_EXISTS',
              `File already exists: ${filePath}. Set overwrite=true to replace.`,
              requestId
            );
            return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
          }

          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, xmlContent, 'utf-8');
          written = true;
          log('info', 'provar.testcase.generate: wrote file', { requestId, filePath });
        }

        const warnings = buildStepWarnings(input.steps);
        const validationFull = validateTestCase(xmlContent, input.test_case_name);
        const validationSlim = {
          is_valid: validationFull.is_valid,
          validity_score: validationFull.validity_score,
          quality_score: validationFull.quality_score,
          error_count: validationFull.error_count,
          warning_count: validationFull.warning_count,
          issues: validationFull.issues,
        };
        const result = {
          requestId,
          xml_content: xmlContent,
          file_path: filePath,
          written,
          dry_run: input.dry_run,
          step_count: input.steps.length,
          idempotency_key: input.idempotency_key,
          validation: validationSlim,
          ...(warnings.length > 0 ? { warnings } : {}),
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (err: unknown) {
        const error = err as Error & { code?: string };
        const errResult = makeError(
          error instanceof PathPolicyError ? error.code : (error.code ?? 'GENERATE_ERROR'),
          error.message,
          requestId,
          false
        );
        log('error', 'provar.testcase.generate failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}

// ── XML builder ───────────────────────────────────────────────────────────────

function buildArgumentsXml(attributes: Record<string, string>): string {
  const entries = Object.entries(attributes);
  if (entries.length === 0) return '';
  const argLines = entries
    .map(([k, v]) =>
      `      <argument id="${escapeXmlAttr(k)}">\n` +
      `        <value class="value" valueClass="String">${escapeXmlContent(v)}</value>\n` +
      '      </argument>'
    )
    .join('\n');
  return `\n      <arguments>\n${argLines}\n      </arguments>\n    `;
}

function buildTestCaseXml(input: {
  test_case_name: string;
  test_case_id?: string;
  steps: Array<{ api_id: string; name: string; attributes: Record<string, string> }>;
}): string {
  const testCaseId = input.test_case_id ?? randomUUID();
  const testCaseGuid = randomUUID();
  const registryId = randomUUID();

  const stepLines = input.steps
    .map((step, i) => {
      const guid = randomUUID();
      const testItemId = i + 1;
      const resolvedApiId = resolveApiId(step.api_id);
      const argumentsXml = buildArgumentsXml(step.attributes);
      if (argumentsXml) {
        return (
          `    <apiCall guid="${guid}" apiId="${escapeXmlAttr(resolvedApiId)}"` +
          ` name="${escapeXmlAttr(step.name)}" testItemId="${testItemId}">${argumentsXml}</apiCall>`
        );
      }
      return (
        `    <apiCall guid="${guid}" apiId="${escapeXmlAttr(resolvedApiId)}"` +
        ` name="${escapeXmlAttr(step.name)}" testItemId="${testItemId}"/>`
      );
    })
    .join('\n');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<testCase id="${testCaseId}" guid="${testCaseGuid}" registryId="${registryId}"` +
    ` name="${escapeXmlAttr(input.test_case_name)}">\n` +
    '  <steps>\n' +
    (stepLines || '    <!-- TODO: Add test steps here -->') +
    '\n  </steps>\n' +
    '</testCase>\n'
  );
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXmlContent(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
