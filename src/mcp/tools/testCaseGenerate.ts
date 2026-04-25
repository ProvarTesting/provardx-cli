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
  UiConnect: 'com.provar.plugins.forcedotcom.core.ui.UiConnect',
  UiDoAction: 'com.provar.plugins.forcedotcom.core.ui.UiDoAction',
  UiWithScreen: 'com.provar.plugins.forcedotcom.core.ui.UiWithScreen',
  UiAssert: 'com.provar.plugins.forcedotcom.core.ui.UiAssert',
  UiNavigate: 'com.provar.plugins.forcedotcom.core.ui.UiNavigate',
  UiWithRow: 'com.provar.plugins.forcedotcom.core.ui.UiWithRow',
  UiScrollToElement: 'com.provar.plugins.forcedotcom.core.ui.UiScrollToElement',
  ApexConnect: 'com.provar.plugins.forcedotcom.core.testapis.ApexConnect',
  ApexSoqlQuery: 'com.provar.plugins.forcedotcom.core.testapis.ApexSoqlQuery',
  ApexCreateObject: 'com.provar.plugins.forcedotcom.core.testapis.ApexCreateObject',
  ApexReadObject: 'com.provar.plugins.forcedotcom.core.testapis.ApexReadObject',
  ApexUpdateObject: 'com.provar.plugins.forcedotcom.core.testapis.ApexUpdateObject',
  ApexDeleteObject: 'com.provar.plugins.forcedotcom.core.testapis.ApexDeleteObject',
  SetValues: 'com.provar.plugins.bundled.apis.control.SetValues',
  AssertValues: 'com.provar.plugins.bundled.apis.AssertValues',
  StepGroup: 'com.provar.plugins.bundled.apis.control.StepGroup',
  Sleep: 'com.provar.plugins.bundled.apis.control.Sleep',
  ForEach: 'com.provar.plugins.bundled.apis.control.ForEach',
  CaseCall: 'com.provar.plugins.bundled.apis.control.CaseCall',
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
  'URI-aware generation: use target_uri to control the XML nesting structure.',
  '  - sf:ui:target (or omit target_uri) → flat Salesforce XML structure (existing behaviour).',
  '  - ui:pageobject:target?pageId=pageobjects.PageClass → wraps all steps in a UiWithScreen element targeting that non-SF page object.',
  'API IDs: shorthand forms (e.g. UiConnect, ApexSoqlQuery) are automatically expanded to fully-qualified IDs required by the Provar runtime.',
  'Step arguments: attributes are emitted as <arguments><argument id="..."><value .../></argument></arguments> — the only format the Provar runtime processes.',
  'Shorthand XML attributes on <apiCall> are silently ignored at runtime; always supply arguments via the attributes map.',
  'Data-driven note: <dataTable> only iterates rows when the test case runs via a test plan instance (.testinstance).',
  'Running directly via the provardx testCase property resolves all data table variables as null.',
  'Use provar.testplan.add-instance to wire into a plan for data-driven execution.',
  'ApexReadObject requires field names in attributes; omitting them produces MALFORMED_QUERY. Prefer ApexSoqlQuery.',
  'AssertValues on SOQL results: index paths like "ResultList[0].Field" are not supported.',
  'Use ForEach to iterate the result list, or SetValues to extract a field into a variable first.',
  'Validation: when validate_after_edit=true (default) the response includes a validation field and returns TESTCASE_INVALID if the generated XML fails structural checks.',
  'Grounding: call provar.qualityhub.examples.retrieve before generating to get corpus examples for the scenario — correct XML structure for the step types you need.',
].join(' ');

export function registerTestCaseGenerate(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.testcase.generate',
    TOOL_DESCRIPTION,
    {
      test_case_name: z.string().describe('Test case name (human-readable label)'),
      test_case_id: z.string().optional().describe('Explicit test case id; auto-generated UUID v4 if omitted'),
      steps: z.array(StepSchema).default([]).describe('Ordered list of test steps'),
      target_uri: z
        .string()
        .optional()
        .describe(
          'Page object URI that determines the XML nesting structure. ' +
            'Omit or use "sf:ui:target" for Salesforce targets (flat structure). ' +
            'Use "ui:pageobject:target?pageId=pageobjects.PageClass" for non-SF page objects — ' +
            'steps are wrapped in a UiWithScreen element targeting that class.'
        ),
      output_path: z.string().optional().describe('Suggested file path for the .xml file (returned in response)'),
      overwrite: z.boolean().default(false).describe('Overwrite if output_path file already exists'),
      dry_run: z.boolean().default(true).describe('true = return XML only (default); false = write to output_path'),
      validate_after_edit: z
        .boolean()
        .default(true)
        .describe(
          'Run structural validation after generation (default: true). ' +
            'Returns TESTCASE_INVALID error if the generated XML fails validation. ' +
            'Set false to skip validation and omit the validation field from the response.'
        ),
      idempotency_key: z.string().optional().describe('Caller-provided key echoed back for deduplication tracking'),
    },
    (input) => {
      const requestId = makeRequestId();
      log('info', 'provar.testcase.generate', {
        requestId,
        test_case_name: input.test_case_name,
        dry_run: input.dry_run,
        target_uri: input.target_uri,
      });

      try {
        const xmlContent = buildTestCaseXml(input);
        const filePath: string | undefined = input.output_path ? path.resolve(input.output_path) : undefined;
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
        const runValidation = input.validate_after_edit !== false;
        const baseResult = {
          requestId,
          xml_content: xmlContent,
          file_path: filePath,
          written,
          dry_run: input.dry_run,
          step_count: input.steps.length,
          idempotency_key: input.idempotency_key,
          ...(warnings.length > 0 ? { warnings } : {}),
        };

        if (runValidation) {
          const validationFull = validateTestCase(xmlContent, input.test_case_name);
          const validationSlim = {
            is_valid: validationFull.is_valid,
            validity_score: validationFull.validity_score,
            quality_score: validationFull.quality_score,
            error_count: validationFull.error_count,
            warning_count: validationFull.warning_count,
            issues: validationFull.issues,
          };
          if (!validationFull.is_valid) {
            const errResult = makeError(
              'TESTCASE_INVALID',
              `Generated test case failed structural validation (${validationFull.error_count} error(s)). See details.validation.`,
              requestId,
              false,
              { validation: validationSlim }
            );
            log('warn', 'provar.testcase.generate: TESTCASE_INVALID', { requestId });
            return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
          }
          const result = { ...baseResult, validation: validationSlim };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
            structuredContent: result,
          };
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(baseResult) }],
          structuredContent: baseResult,
        };
      } catch (err: unknown) {
        const error = err as Error & { code?: string };
        const errResult = makeError(
          error instanceof PathPolicyError ? error.code : error.code ?? 'GENERATE_ERROR',
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

function buildArgumentsXml(attributes: Record<string, string>, baseIndent = '      '): string {
  const entries = Object.entries(attributes);
  if (entries.length === 0) return '';
  const argLines = entries
    .map(
      ([k, v]) =>
        `${baseIndent}<argument id="${escapeXmlAttr(k)}">\n` +
        `${baseIndent}  <value class="value" valueClass="string">${escapeXmlContent(v)}</value>\n` +
        `${baseIndent}</argument>`
    )
    .join('\n');
  return `\n${baseIndent}<arguments>\n${argLines}\n${baseIndent}</arguments>\n${baseIndent.slice(0, -2)}`;
}

function buildFlatStepXml(
  step: { api_id: string; name: string; attributes: Record<string, string> },
  testItemId: number,
  indent: string
): string {
  const guid = randomUUID();
  const resolvedApiId = resolveApiId(step.api_id);
  const argumentsXml = buildArgumentsXml(step.attributes, indent + '  ');
  if (argumentsXml) {
    return (
      `${indent}<apiCall guid="${guid}" apiId="${escapeXmlAttr(resolvedApiId)}"` +
      ` name="${escapeXmlAttr(step.name)}" testItemId="${testItemId}">${argumentsXml}</apiCall>`
    );
  }
  return (
    `${indent}<apiCall guid="${guid}" apiId="${escapeXmlAttr(resolvedApiId)}"` +
    ` name="${escapeXmlAttr(step.name)}" testItemId="${testItemId}"/>`
  );
}

function buildTestCaseXml(input: {
  test_case_name: string;
  test_case_id?: string;
  steps: Array<{ api_id: string; name: string; attributes: Record<string, string> }>;
  target_uri?: string;
}): string {
  const testCaseId = input.test_case_id ?? randomUUID();
  const testCaseGuid = randomUUID();
  const registryId = randomUUID();

  let stepLines: string;
  const isNonSf = !!input.target_uri && input.target_uri.startsWith('ui:');

  if (isNonSf && input.target_uri) {
    stepLines = buildUiWithScreenXml(input.steps, input.target_uri);
  } else {
    const lines = input.steps.map((step, i) => buildFlatStepXml(step, i + 1, '    ')).join('\n');
    stepLines = lines || '    <!-- TODO: Add test steps here -->';
  }

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<testCase id="${testCaseId}" guid="${testCaseGuid}" registryId="${registryId}"` +
    ` name="${escapeXmlAttr(input.test_case_name)}">\n` +
    '  <steps>\n' +
    stepLines +
    '\n  </steps>\n' +
    '</testCase>\n'
  );
}

function buildUiWithScreenXml(
  steps: Array<{ api_id: string; name: string; attributes: Record<string, string> }>,
  targetUri: string
): string {
  const wrapperGuid = randomUUID();
  const wrapperApiId = resolveApiId('UiWithScreen');
  // Inner steps use testItemIds starting at 3; the substeps clause itself occupies testItemId=2
  const innerLines = steps.map((step, i) => buildFlatStepXml(step, i + 3, '            ')).join('\n');
  const stepsContent = innerLines ? `\n${innerLines}\n          ` : '';
  const clausesXml =
    '\n      <clauses>\n' +
    '        <clause name="substeps" testItemId="2">\n' +
    `          <steps>${stepsContent}</steps>\n` +
    '        </clause>\n' +
    '      </clauses>\n    ';
  return (
    `    <apiCall guid="${wrapperGuid}" apiId="${wrapperApiId}"` +
    ` name="With page" testItemId="1">${buildArgumentsXml({ target: targetUri }).trimEnd()}${clausesXml}</apiCall>`
  );
}

function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeXmlContent(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
