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
import { desc } from './descHelper.js';

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

  // D7: Cleanup steps placed after a potential failure point are skipped when stopOnError=false.
  if (resolvedIds.includes(SHORTHAND_TO_FQID['ApexDeleteObject'] ?? '')) {
    warnings.push(
      'ApexDeleteObject detected (likely cleanup): with stopOnError=false Provar skips all steps after ' +
        'the first failure, so cleanup steps placed at the end of the test will NOT run when an earlier ' +
        'step fails — leaving orphaned records in the org. ' +
        'Wrap cleanup in a Provar TearDown callable, or place create/delete inside the same UiWithScreen ' +
        'clause so both run as a unit regardless of failure.'
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
      'Step argument values as key/value pairs. Written as <arguments><argument id="key"><value .../></argument></arguments>. ' +
        'Do NOT rely on XML attributes on <apiCall>; the runtime silently ignores them. ' +
        'Special value conventions (applied automatically by the generator): ' +
        '(1) Variable references: wrap the name in braces, e.g. "{MyVar}" → emitted as class="variable" <path element="MyVar"/>. ' +
        '    Dotted paths are also supported: "{Obj.Field}" → two <path> elements. ' +
        '(2) SetValues: pass each variable name and its value as a flat key/value pair; ' +
        '    the generator wraps them in <value class="valueList"><namedValues>...</namedValues></value> automatically. ' +
        '    Example: { "testCaseName": "TC_New", "testType": "Acceptance testing" } ' +
        '(3) AssertValues: pass assertion arguments as flat key/value pairs; emitted as flat <argument> elements, NOT wrapped in valueList/namedValues. ' +
        '(4) target argument (UiWithScreen / UiWithRow): pass the sf:ui:target or ui:pageobject:target URI; ' +
        '    emitted as class="uiTarget" uri="...". ' +
        '(5) locator argument (UiDoAction / UiAssert): pass the locator URI; emitted as class="uiLocator" uri="...". ' +
        'All other string values use class="value" valueClass="string".'
    ),
});

const TOOL_DESCRIPTION = [
  // ── Construction contract (READ FIRST — PDX-482) ──────────────────────────────
  // The PDX-479 regression happened when authoring guidance steered agents toward
  // a per-step construction pattern via repeated step_edit calls. These three
  // lines make the single-call contract authoritative at the call site so it
  // outweighs any conflicting prompt/resource guidance and survives doc drift.
  'Construction pattern: pass the FULL step tree in a single call via the steps[] array.',
  'Do NOT call this tool with an empty steps[] and then append via provar_testcase_step_edit — that pattern drops scenarios, flattens nesting, and produces inconsistent step types.',
  'provar_testcase_step_edit is for AMENDING an existing validated test case (single-step add, attribute fix, debug edit), not for CONSTRUCTING one from scratch. If you find yourself about to call this tool with steps=[] intending to add steps in subsequent tool calls, stop and assemble the full step list first.',
  // ── Existing description (unchanged below) ───────────────────────────────────
  'Generate a Provar XML test case skeleton with proper UUID v4 guids, sequential testItemId values, and <steps> structure.',
  'Returns XML content. Writes to disk only when dry_run=false.',
  'Generated structure: <?xml version="1.0" encoding="UTF-8" standalone="no"?> with <testCase guid="..." id="1" registryId="..."> (id is always the integer literal "1" as required by the Provar runtime), a <summary/> child, then <steps>.',
  'URI-aware generation: use target_uri to control the XML nesting structure.',
  '  - sf:ui:target (or omit target_uri) → flat Salesforce XML structure (existing behaviour).',
  '  - ui:pageobject:target?pageId=pageobjects.PageClass → wraps all steps in a UiWithScreen element targeting that non-SF page object.',
  'API IDs: shorthand forms (e.g. UiConnect, ApexSoqlQuery) are automatically expanded to fully-qualified IDs required by the Provar runtime.',
  'Step arguments: attributes are emitted as <arguments><argument id="..."><value .../></argument></arguments> — the only format the Provar runtime processes.',
  'Shorthand XML attributes on <apiCall> are silently ignored at runtime; always supply arguments via the attributes map.',
  'ApexSoqlQuery argument IDs: soqlQuery (the SOQL SELECT statement), resultListName (binds result list to a variable), apexConnectionName (named connection), resultScope (optional).',
  'Data-driven note: <dataTable> only iterates rows when the test case runs via a test plan instance (.testinstance).',
  'Running directly via the provardx testCase property resolves all data table variables as null.',
  'Use provar_testplan_add-instance to wire into a plan for data-driven execution.',
  'ApexReadObject requires field names in attributes; omitting them produces MALFORMED_QUERY. Prefer ApexSoqlQuery.',
  'AssertValues on SOQL results: index paths like "ResultList[0].Field" are not supported.',
  'Use ForEach to iterate the result list, or SetValues to extract a field into a variable first.',
  'SetValues: pass named variable values as flat key/value pairs in attributes; ' +
    'the generator wraps them in <value class="valueList"><namedValues>...</namedValues></value> automatically.',
  'AssertValues: pass assertion values as flat key/value argument pairs; emitted as flat arguments, NOT wrapped in namedValues. ' +
    'If AssertValues uses namedValues-shaped content, validation reports warning ASSERT-001.',
  'Variable references: pass values as "{VarName}" (braces); emitted as class="variable" <path element="VarName"/>.',
  'target argument (UiWithScreen/UiWithRow): pass the URI value; emitted as class="uiTarget" uri="...".',
  'locator argument (UiDoAction/UiAssert): pass the URI value; emitted as class="uiLocator" uri="...".',
  'Edit page objects: action=Edit targets require a compiled page object for the SF object. ' +
    'If none exists in the project page-objects directory, the locator binding will fail at runtime. ' +
    'For objects without a compiled Edit page object, use inline edit instead: sfIleActivate to activate the field, ' +
    'set the value, then SaveEdit binding on the Record view screen.',
  'Provar IDE warning: opening a generated test case in Provar IDE injects empty <argument id="..."/> elements for known parameter IDs. ' +
    'If the empty element appears after a populated one, the empty version wins at runtime. ' +
    'Always check for and remove duplicate empty arguments after any IDE open/save cycle before re-running.',
  'Cleanup warning: ApexDeleteObject steps near end of test will be skipped if an earlier step fails (stopOnError=false). Use a TearDown callable.',
  'Validation: when validate_after_edit=true (default) the response includes a validation field and returns TESTCASE_INVALID if the generated XML fails structural checks.',
  'Grounding: call provar_qualityhub_examples_retrieve before generating to get corpus examples for the scenario — correct XML structure for the step types you need.',
  'If the response has count: 0 with a warning field (API unavailable or not configured), fall back: read the provar://docs/step-reference MCP resource for step types and attribute formats, then continue.',
].join(' ');

export function registerTestCaseGenerate(server: McpServer, config: ServerConfig): void {
  server.registerTool(
    'provar_testcase_generate',
    {
      title: 'Generate Test Case',
      description: desc(
        TOOL_DESCRIPTION,
        // PDX-482: the compact form must also carry the construction contract,
        // otherwise PROVAR_MCP_SCHEMA_MODE=compact is a regression highway —
        // the LLM would see a contract-free one-liner and could fall back to
        // the multi-call pattern that caused PDX-479.
        'Generate a Provar test case in ONE call with the FULL steps[] tree. ' +
          'Do NOT call with steps=[] then append via provar_testcase_step_edit ' +
          '(step_edit is for AMENDING existing test cases, not for CONSTRUCTING new ones).'
      ),
      inputSchema: {
        test_case_name: z.string().describe(desc('Test case name (human-readable label)', 'string, test case name')),
        steps: z
          .array(StepSchema)
          .default([])
          .describe(
            desc(
              'Ordered list of test steps. Pass the COMPLETE step tree for the test case in a single call — ' +
                'do not call this tool with an empty array intending to append via provar_testcase_step_edit ' +
                '(that pattern is for amendments only and produces structurally invalid test cases when used to construct).',
              'array, optional; FULL ordered step tree in one call'
            )
          ),
        target_uri: z
          .string()
          .optional()
          .describe(
            desc(
              'Page object URI that determines the XML nesting structure. ' +
                'Omit or use "sf:ui:target" for Salesforce targets (flat structure). ' +
                'Use "ui:pageobject:target?pageId=pageobjects.PageClass" for non-SF page objects — ' +
                'steps are wrapped in a UiWithScreen element targeting that class.',
              'string, optional; sf:ui:target (SF) or ui:pageobject:target?pageId=... (non-SF)'
            )
          ),
        output_path: z
          .string()
          .optional()
          .describe(
            desc(
              'Suggested file path for the .xml file (returned in response)',
              'string, optional; output .xml file path'
            )
          ),
        overwrite: z
          .boolean()
          .default(false)
          .describe(desc('Overwrite if output_path file already exists', 'bool, optional; overwrite if exists')),
        dry_run: z
          .boolean()
          .default(true)
          .describe(
            desc(
              'true = return XML only (default); false = write to output_path',
              'bool, optional; default true, skip write'
            )
          ),
        validate_after_edit: z
          .boolean()
          .default(true)
          .describe(
            desc(
              'Run structural validation after generation (default: true). ' +
                'Returns TESTCASE_INVALID error if the generated XML fails validation. ' +
                'Set false to skip validation and omit the validation field from the response.',
              'bool, optional; default true, validate after generation'
            )
          ),
        idempotency_key: z
          .string()
          .optional()
          .describe(
            desc(
              'Caller-provided key echoed back for deduplication tracking',
              'string, optional; deduplication key echoed in response'
            )
          ),
      },
    },
    (input) => {
      const requestId = makeRequestId();
      log('info', 'provar_testcase_generate', {
        requestId,
        test_case_name: input.test_case_name,
        dry_run: input.dry_run,
        target_uri: input.target_uri,
      });

      // PDX-483: active runtime guard for the PDX-479 regression pattern.
      // Rejects the exact shape that produces a contract-violating skeleton on
      // disk: empty steps[] + non-dry-run + persistence target. Other empty-
      // steps shapes (dry_run preview, no output_path) remain allowed.
      if (input.steps.length === 0 && !input.dry_run && input.output_path) {
        const err = makeError(
          'STEPS_REQUIRED',
          'provar_testcase_generate was called with an empty steps[] array and a target output_path. ' +
            'This produces a contract-violating skeleton (the PDX-479 regression pattern) and is rejected.',
          requestId,
          false,
          {
            suggestion:
              'Pass the FULL step tree to provar_testcase_generate in a single call. ' +
              'provar_testcase_step_edit is for amending an already-validated test case ' +
              '(single-step add, attribute fix, debug edit), not for constructing one from scratch. ' +
              'If you genuinely want a skeleton for inspection, set dry_run=true.',
          }
        );
        log('warn', 'provar_testcase_generate: STEPS_REQUIRED', {
          requestId,
          output_path: input.output_path,
        });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
      }

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
          log('info', 'provar_testcase_generate: wrote file', { requestId, filePath });
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
            log('warn', 'provar_testcase_generate: TESTCASE_INVALID', { requestId });
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
        log('error', 'provar_testcase_generate failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}

// ── XML builder ───────────────────────────────────────────────────────────────

// F1/F3: build class="compound" for strings that mix literal text with {VarName} tokens.
function buildCompoundValue(val: string, indent: string): string {
  const i = `${indent}  `;
  const parts: string[] = [];
  const tokenRe = /\{([\w.]+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(val)) !== null) {
    const before = val.slice(last, m.index);
    if (before) parts.push(`${i}<value valueClass="string">${escapeXmlContent(before)}</value>`);
    const pathElements = m[1]
      .split('.')
      .map((p) => `${i}  <path element="${escapeXmlAttr(p)}"/>`)
      .join('\n');
    parts.push(`${i}<variable>\n${pathElements}\n${i}</variable>`);
    last = m.index + m[0].length;
  }
  const tail = val.slice(last);
  if (tail) parts.push(`${i}<value valueClass="string">${escapeXmlContent(tail)}</value>`);
  return `${indent}<value class="compound">\n${i}<parts>\n${parts.join('\n')}\n${i}</parts>\n${indent}</value>`;
}

// Build the <value> element for a single argument (D2/D4/F1 aware).
// inNamedValues: when true (inside SetValues namedValues), skip uiTarget/uiLocator dispatch.
// apiId: resolved API ID used to restrict key-name dispatch to the correct UI APIs.
function buildArgumentValue(key: string, val: string, indent: string, inNamedValues = false, apiId = ''): string {
  // D4: {VarName} or {Obj.Field} → class="variable" with <path> elements.
  const varMatch = /^\{([\w.]+)\}$/.exec(val);
  if (varMatch) {
    const pathElements = varMatch[1]
      .split('.')
      .map((p) => `${indent}  <path element="${escapeXmlAttr(p)}"/>`)
      .join('\n');
    return `${indent}<value class="variable">\n${pathElements}\n${indent}</value>`;
  }
  // F1/F3: {VarName} embedded in surrounding text → class="compound" with <parts>.
  if (/\{[\w.]+\}/.test(val)) {
    return buildCompoundValue(val, indent);
  }
  if (!inNamedValues) {
    // D2: 'target' argument → class="uiTarget" (only for UiWithScreen / UiWithRow).
    if (key === 'target' && (apiId.includes('UiWithScreen') || apiId.includes('UiWithRow'))) {
      return `${indent}<value class="uiTarget" uri="${escapeXmlAttr(val)}"/>`;
    }
    // D2: 'locator' argument → class="uiLocator" (only for UiDoAction / UiAssert).
    if (key === 'locator' && (apiId.includes('UiDoAction') || apiId.includes('UiAssert'))) {
      return `${indent}<value class="uiLocator" uri="${escapeXmlAttr(val)}"/>`;
    }
  }
  return `${indent}<value class="value" valueClass="string">${escapeXmlContent(val)}</value>`;
}

function buildArgumentsXml(attributes: Record<string, string>, baseIndent = '      ', apiId = ''): string {
  const entries = Object.entries(attributes);
  if (entries.length === 0) return '';
  const argLines = entries
    .map(([k, v]) => {
      const valueXml = buildArgumentValue(k, v, `${baseIndent}  `, false, apiId);
      return `${baseIndent}<argument id="${escapeXmlAttr(k)}">\n` + valueXml + '\n' + `${baseIndent}</argument>`;
    })
    .join('\n');
  return `\n${baseIndent}<arguments>\n${argLines}\n${baseIndent}</arguments>\n${baseIndent.slice(0, -2)}`;
}

// D3: SetValues — all attributes become <namedValues> under a single 'values' argument.
function buildSetValuesXml(attributes: Record<string, string>, baseIndent: string): string {
  const entries = Object.entries(attributes);
  if (entries.length === 0) return '';
  const i = (n: number): string => baseIndent + '  '.repeat(n);
  const namedValueLines = entries
    .map(([name, val]) => {
      const valueXml = buildArgumentValue(name, val, `${i(3)}  `, true);
      return `${i(3)}<namedValue name="${escapeXmlAttr(name)}">\n${valueXml}\n${i(3)}</namedValue>`;
    })
    .join('\n');
  return (
    `\n${i(0)}<arguments>\n` +
    `${i(0)}<argument id="values">\n` +
    `${i(1)}<value class="valueList" mutable="Mutable">\n` +
    `${i(2)}<namedValues>\n` +
    namedValueLines +
    '\n' +
    `${i(2)}</namedValues>\n` +
    `${i(1)}</value>\n` +
    `${i(0)}</argument>\n` +
    `${i(0)}</arguments>\n` +
    `${baseIndent.slice(0, -2)}`
  );
}

function buildFlatStepXml(
  step: { api_id: string; name: string; attributes: Record<string, string> },
  testItemId: number,
  indent: string
): string {
  const guid = randomUUID();
  const resolvedApiId = resolveApiId(step.api_id);
  const baseIndent = indent + '  ';
  // Use SetValues structure for any SetValues API (string-match mirrors the validator).
  const argumentsXml = resolvedApiId.includes('SetValues')
    ? buildSetValuesXml(step.attributes, baseIndent)
    : buildArgumentsXml(step.attributes, baseIndent, resolvedApiId);
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
  steps: Array<{ api_id: string; name: string; attributes: Record<string, string> }>;
  target_uri?: string;
}): string {
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

  // Provar requires: standalone="no", id="1" (integer literal), no name attr, <summary/> before <steps>.
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
    `<testCase guid="${testCaseGuid}" id="1" registryId="${registryId}">\n` +
    '  <summary/>\n' +
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
    ` name="With page" testItemId="1">${buildArgumentsXml(
      { target: targetUri },
      '      ',
      wrapperApiId
    ).trimEnd()}${clausesXml}</apiCall>`
  );
}

function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeXmlContent(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
