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
import { UI_ACTION_API_IDS, UI_SCREEN_CONTAINER_API_IDS, UI_LOCATOR_BEARING_API_IDS } from './uiActionApiIds.js';

// ── Shorthand → fully-qualified API ID map ────────────────────────────────────
// Provar runtime requires fully-qualified IDs. Shorthand forms are accepted here
// and expanded automatically before writing XML.

const SHORTHAND_TO_FQID: Record<string, string> = {
  UiConnect: 'com.provar.plugins.forcedotcom.core.ui.UiConnect',
  UiDoAction: 'com.provar.plugins.forcedotcom.core.ui.UiDoAction',
  UiWithScreen: 'com.provar.plugins.forcedotcom.core.ui.UiWithScreen',
  UiAssert: 'com.provar.plugins.forcedotcom.core.ui.UiAssert',
  UiRead: 'com.provar.plugins.forcedotcom.core.ui.UiRead',
  UiFill: 'com.provar.plugins.forcedotcom.core.ui.UiFill',
  UiNavigate: 'com.provar.plugins.forcedotcom.core.ui.UiNavigate',
  UiWithRow: 'com.provar.plugins.forcedotcom.core.ui.UiWithRow',
  UiHandleAlert: 'com.provar.plugins.forcedotcom.core.ui.UiHandleAlert',
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
  // NitroX MS variants (Microsoft Dynamics 365 + Power Platform — Provar 3.0.7+)
  MSDynamics365Connect: 'com.provar.plugins.forcedotcom.core.ui.NitroXConnect:ms-dynamics365',
  MSDataverseConnect: 'com.provar.plugins.forcedotcom.core.ui.NitroXConnect:ms-dataverse',
  MSPowerAppConnect: 'com.provar.plugins.forcedotcom.core.ui.NitroXConnect:ms-powerapp',
  MSPowerPageConnect: 'com.provar.plugins.forcedotcom.core.ui.NitroXConnect:ms-powerpage',
};

const NITROX_MS_SHORTHANDS: ReadonlySet<string> = new Set([
  'MSDynamics365Connect',
  'MSDataverseConnect',
  'MSPowerAppConnect',
  'MSPowerPageConnect',
]);

function resolveApiId(apiId: string): string {
  return SHORTHAND_TO_FQID[apiId] ?? apiId;
}

// ── PDX-495 + PDX-497: UI-action grouping under UiWithScreen substeps clause ─
// The set of fully-qualified API IDs that authors expect to be nested inside a
// preceding UiWithScreen's <clauses><clause name="substeps"><steps>…</steps></clause>
// block. When the generator receives a flat list with these IDs trailing a
// UiWithScreen, the auto-grouping pass moves them inside the substeps clause so
// the Provar IDE renders the test case correctly. SetValues, ApexConnect, and
// other non-UI apiCalls stay at the root.
//
// PDX-497: API set imported from the shared `uiActionApiIds.ts` module so the
// generator and validator can never drift. The single-namespace alignment
// (`com.provar.plugins.forcedotcom.core.ui.*`) matches what `resolveApiId`
// produces from every shorthand AND what the validator enforces — the older
// `com.provar.plugins.ui.*` defensive entries in this file's local set were
// dead code (no test coverage, no production path emits them).
const FORCEDOTCOM_UI_WITH_SCREEN = 'com.provar.plugins.forcedotcom.core.ui.UiWithScreen';

function isUiAction(apiId: string): boolean {
  return UI_ACTION_API_IDS.has(resolveApiId(apiId));
}

function isUiWithScreen(apiId: string): boolean {
  return resolveApiId(apiId) === FORCEDOTCOM_UI_WITH_SCREEN;
}

/**
 * PDX-497: a UI action step whose own container clause satisfies the
 * UI-NEST-STRUCT-001 rule for its descendants (UiWithScreen, UiWithRow).
 * Mirrors the validator's `UI_SCREEN_CONTAINERS` set.
 */
function isScreenContainer(apiId: string): boolean {
  return UI_SCREEN_CONTAINER_API_IDS.has(resolveApiId(apiId));
}

// PDX-497: UiWithRow plays a dual role. As a UI action (in UI_ACTION_API_IDS)
// it must be nested under a UiWithScreen ancestor via a substeps clause — same
// rule QH's UI-NEST-STRUCT-001 enforces. As a screen container (in
// UI_SCREEN_CONTAINER_API_IDS) it owns its OWN substeps clause that satisfies
// the rule for its descendants. The auto-grouping algorithm in `collectGroup`
// (below) handles both roles, and `buildTestCaseXml` synthesizes a root
// UiWithScreen when the payload contains screen containers but no UiWithScreen
// — without that wrapper, a root-level UiWithRow would itself fail the rule.

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

  const nitroxMsFqids = new Set(
    Array.from(NITROX_MS_SHORTHANDS, (s) => SHORTHAND_TO_FQID[s]).filter((id): id is string => Boolean(id))
  );
  if (resolvedIds.some((id) => nitroxMsFqids.has(id))) {
    warnings.push(
      'NitroX MS connect (Dynamics 365 / Dataverse / Power Apps / Power Pages): ' +
        'variant-specific args (appName, powerAppName, environment, powerPageName) must either be supplied as ' +
        'literals/variables in attributes OR declared as <generatedParameters> for data-driven tests. ' +
        'Empty args with no parameter declaration cause runtime null binding.'
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
        'UiConnect, UiDoAction, UiWithScreen, UiAssert, UiRead, UiFill, UiNavigate, UiWithRow, UiHandleAlert, ' +
        'ApexConnect, ApexSoqlQuery, ApexCreateObject, ApexReadObject, ApexUpdateObject, ApexDeleteObject, ' +
        'SetValues, AssertValues, StepGroup, Sleep, ForEach, CaseCall, ' +
        'MSDynamics365Connect, MSDataverseConnect, MSPowerAppConnect, MSPowerPageConnect ' +
        '(NitroXConnect:ms-* family for Microsoft Dynamics 365 + Power Platform — Provar 3.0.7+). ' +
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
        '(5) locator argument (UiDoAction / UiAssert / UiRead / UiFill): pass the locator URI; emitted as class="uiLocator" uri="...". ' +
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
  'Microsoft Dynamics / Power Platform: MSDynamics365Connect, MSDataverseConnect, MSPowerAppConnect, MSPowerPageConnect ' +
    'expand to NitroXConnect:ms-* variants. Variant-specific args (appName, powerAppName, environment, powerPageName) ' +
    'may be passed as literals OR declared via <generatedParameters> for data-driven tests.',
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
  'locator argument (UiDoAction/UiAssert/UiRead/UiFill): pass the URI value; emitted as class="uiLocator" uri="...".',
  'valueClass auto-detection: argument values are typed automatically before XML emission. ' +
    'ISO-8601 date "YYYY-MM-DD" → valueClass="date"; ISO-8601 datetime "YYYY-MM-DDTHH:MM:SS" (optional fractional seconds + timezone) → "datetime"; ' +
    '"true"/"false" → "boolean"; numeric string (e.g. "42", "-5", "3.14") → "decimal"; otherwise "string". ' +
    'Pass dates / booleans / numbers in those formats — Provar runtime silently discards date fields emitted as valueClass="string". ' +
    'Note: numbers always emit valueClass="decimal" per the canonical Provar reference (there is no separate "integer" valueClass).',
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
      // PDX-484: carry the construct-vs-amend contract into the `title:` field
      // because many MCP clients (Claude Desktop tool-picker chips, Cursor audit
      // pane, inline tool-call references in chat threads) render only the title.
      // Without the "(full steps in one call)" suffix an agent that reads only
      // the title surface gets zero PDX-479 protection. Length: 43 chars —
      // well under the ~50 char comfort threshold for the clients we test.
      title: 'Generate Test Case (full steps in one call)',
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
        grouping_mode: z
          .enum(['auto', 'flat', 'single-screen'])
          .default('auto')
          .describe(
            desc(
              'Controls how UI action steps (UiDoAction, UiAssert, UiRead, UiFill, UiNavigate, UiWithRow, UiHandleAlert) ' +
                'are nested under UiWithScreen wrappers. ' +
                '"auto" (default): when the flat steps[] payload contains a UiWithScreen followed by UI action siblings, ' +
                'those siblings are auto-grouped inside the UiWithScreen\'s <clause name="substeps"><steps> block ' +
                '(the structure Provar IDE expects). Non-UI steps (SetValues, ApexConnect, …) stay at the root. ' +
                'UiWithRow plays a dual role: when it follows a UiWithScreen it is pulled in as a child container; ' +
                'when screen containers such as UiWithRow appear without an explicit preceding UiWithScreen, generation may ' +
                'synthesize a root UiWithScreen wrapper so they are nested under that screen container rather than remaining at root. ' +
                '"flat": legacy behaviour — emit every step as a root sibling, no nesting. ' +
                '"single-screen": wrap all steps in a single synthetic UiWithScreen (matches target_uri=ui:pageobject:target semantics). ' +
                'If target_uri is "ui:pageobject:target?…" the single-screen wrap takes precedence regardless of this flag.',
              'enum, optional; default "auto" (group UI actions under UiWithScreen substeps)'
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

      // Runtime guard for the multi-call construction pattern: rejects the exact
      // shape that produces a contract-violating skeleton on disk — empty steps[]
      // + non-dry-run + persistence target. Other empty-steps shapes (dry-run
      // preview, no output_path) remain allowed.
      if (input.steps.length === 0 && !input.dry_run && input.output_path) {
        const err = makeError(
          'STEPS_REQUIRED',
          'provar_testcase_generate was called with an empty steps[] array and a target output_path. ' +
            'Constructing a test case requires the full step tree in a single call; ' +
            'an empty payload on the write path would produce a skeleton-only file.',
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

// PDX-493 (H3): infer the Salesforce `valueClass` attribute that should be emitted on a
// `<value class="value" valueClass="..."/>` element from an argument's key + string value.
//
// Detection order:
//   1. Explicit `fieldTypeHint` (from `field_type_hints` param or `provar_org_describe` cache — wired
//      in PDX-492 H2b) wins if provided.
//   2. ISO-8601 datetime → 'datetime'   (e.g. "2026-05-19T10:30:00", with optional fractional seconds
//      and optional timezone). The regex is end-anchored so trailing garbage (e.g.
//      "2026-05-19T10:30:00not-a-zone") is rejected as plain 'string'.
//   3. ISO-8601 date     → 'date'       (e.g. "2026-05-19").
//   4. Literal 'true' / 'false' → 'boolean'.
//   5. Numeric string (integer or decimal, optional leading '-') → 'decimal'.
//      Per `docs/PROVAR_TEST_STEP_REFERENCE.md` (lines 1338, 1428) the canonical Provar
//      valueClass for numbers is `decimal` — there is no `integer` valueClass in the
//      reference grammar, so both `42` and `3.14` emit as `valueClass="decimal"`.
//   6. Else → 'string'.
//
// The `key` argument is reserved for future heuristics (e.g. SF naming conventions like *__c)
// but is intentionally not consulted today — explicit hints + value-shape regexes are the
// safer signal until org-describe is wired.
export function inferSalesforceValueClass(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  key: string,
  val: string,
  fieldTypeHint?: 'date' | 'datetime' | 'boolean' | 'decimal' | 'string'
): 'date' | 'datetime' | 'boolean' | 'decimal' | 'string' {
  if (fieldTypeHint) return fieldTypeHint;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.test(val)) return 'datetime';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return 'date';
  if (val === 'true' || val === 'false') return 'boolean';
  if (/^-?\d+(\.\d+)?$/.test(val)) return 'decimal';
  return 'string';
}

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
    // PDX-497: dispatched via the shared canonical set rather than substring matching.
    if (key === 'target' && UI_SCREEN_CONTAINER_API_IDS.has(apiId)) {
      return `${indent}<value class="uiTarget" uri="${escapeXmlAttr(val)}"/>`;
    }
    // D2: 'locator' argument → class="uiLocator" (only for UI APIs that bear a locator).
    // PDX-497: covers UiDoAction, UiAssert, UiRead, UiFill via the shared canonical set.
    if (key === 'locator' && UI_LOCATOR_BEARING_API_IDS.has(apiId)) {
      return `${indent}<value class="uiLocator" uri="${escapeXmlAttr(val)}"/>`;
    }
    // D2: 'interaction' argument → class="uiInteraction" (UiDoAction Action widget).
    // PDX-506: the IDE step editor binds its Action only from a typed uiInteraction;
    // a plain string runs green from the CLI but renders the Action field blank.
    // Gated on the shared UI-action API set so generator + validator stay aligned.
    if (key === 'interaction' && UI_ACTION_API_IDS.has(apiId)) {
      return `${indent}<value class="uiInteraction" uri="${escapeXmlAttr(val)}"/>`;
    }
  }
  // PDX-493 (H3): infer valueClass for date / datetime / boolean / decimal / string. The
  // `fieldTypeHint` parameter on `inferSalesforceValueClass` is intentionally not threaded
  // through here yet — it lands in PDX-492 (H2b) along with the `field_type_hints` tool input.
  const inferred = inferSalesforceValueClass(key, val);
  return `${indent}<value class="value" valueClass="${inferred}">${escapeXmlContent(val)}</value>`;
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
  return buildStepXmlWithChildren(step, testItemId, indent, '', undefined);
}

// PDX-495: build a single <apiCall> element, optionally with a <clauses>
// <clause name="substeps"><steps>…</steps></clause></clauses> block containing
// already-rendered child XML. This is what lets a UiWithScreen wrap its UI
// action siblings without breaking the existing flat emission path.
//
// `childrenXml` is the already-rendered, already-indented inner XML for the
// substeps clause (joined newline-separated, no leading/trailing whitespace).
// `substepsTestItemId` is the testItemId for the <clause name="substeps"> slot;
// omit (undefined) to skip the clauses block entirely (legacy flat behaviour).
function buildStepXmlWithChildren(
  step: { api_id: string; name: string; attributes: Record<string, string> },
  testItemId: number,
  indent: string,
  childrenXml: string,
  substepsTestItemId: number | undefined
): string {
  const guid = randomUUID();
  const resolvedApiId = resolveApiId(step.api_id);
  const baseIndent = indent + '  ';
  // Use SetValues structure for any SetValues API (string-match mirrors the validator).
  const argumentsXml = resolvedApiId.includes('SetValues')
    ? buildSetValuesXml(step.attributes, baseIndent)
    : buildArgumentsXml(step.attributes, baseIndent, resolvedApiId);

  const hasClauses = substepsTestItemId !== undefined;
  const open = `${indent}<apiCall guid="${guid}" apiId="${escapeXmlAttr(resolvedApiId)}" name="${escapeXmlAttr(
    step.name
  )}" testItemId="${testItemId}">`;
  const close = `${indent}</apiCall>`;

  if (!hasClauses && !argumentsXml) {
    return (
      `${indent}<apiCall guid="${guid}" apiId="${escapeXmlAttr(resolvedApiId)}"` +
      ` name="${escapeXmlAttr(step.name)}" testItemId="${testItemId}"/>`
    );
  }

  if (!hasClauses) {
    // Legacy flat shape: keep the inline form so existing string assertions in
    // call sites and tests (e.g. literal `</apiCall>` placement) still match.
    return `${open}${argumentsXml}</apiCall>`;
  }

  // PDX-495 grouped shape: arguments + clauses block with substeps.
  const clauseIndent = baseIndent;
  const innerStepsIndent = baseIndent + '  ';
  const stepsBlock = childrenXml
    ? `${innerStepsIndent}<steps>\n${childrenXml}\n${innerStepsIndent}</steps>`
    : `${innerStepsIndent}<steps/>`;
  const clausesBlock =
    `${baseIndent}<clauses>\n` +
    `${clauseIndent}<clause name="substeps" testItemId="${substepsTestItemId}">\n` +
    `${stepsBlock}\n` +
    `${clauseIndent}</clause>\n` +
    `${baseIndent}</clauses>`;

  // argumentsXml when present already includes a leading "\n" and a trailing
  // newline + parent-indent so the </apiCall> appears on its own line — match
  // that shape for the grouped emission too.
  if (argumentsXml) {
    return `${open}${argumentsXml.replace(/\n[ \t]*$/, '')}\n${clausesBlock}\n${close}`;
  }
  return `${open}\n${clausesBlock}\n${close}`;
}

// PDX-495 + PDX-497: post-process the flat steps[] payload into a tree where
// each screen-container (UiWithScreen at root, or a UiWithRow nested under a
// UiWithScreen) owns the trailing run of UI-action siblings. `buildTestCaseXml`
// guarantees a UiWithScreen exists at the root before this runs (synthesizing
// one when needed), so no screen container ever appears unparented. Returns
// the tree as a list of root-level nodes, each carrying its own children list.
//
// Grouping rules:
//   - When a UiWithScreen is seen, collect subsequent siblings while they are
//     UI actions (UiDoAction / UiAssert / UiRead / UiFill / UiNavigate /
//     UiWithRow / UiHandleAlert). Stop at: another UiWithScreen, any non-UI
//     step, or end of list.
//   - PDX-497 UiWithRow dual role: when a UiWithRow appears inside that run
//     (i.e. as a child of a UiWithScreen), it absorbs trailing UI-action
//     siblings into its OWN substeps clause (it is a screen container). When a
//     UiWithRow would otherwise appear at root with no preceding UiWithScreen,
//     `buildTestCaseXml` synthesizes a root UiWithScreen wrapper first so the
//     auto-grouping pass still nests UiWithRow correctly under a screen
//     ancestor — required by QH's UI-NEST-STRUCT-001 rule.
//   - SetValues / ApexConnect / other non-UI apiCalls stay at root.
//
// The walker uses a shared cursor so a UiWithRow that absorbs trailing UI
// actions advances the outer loop past those siblings — preventing the same
// step from being claimed by two containers.
type Step = { api_id: string; name: string; attributes: Record<string, string> };
interface StepNode extends Step {
  children: StepNode[];
}

function groupStepsAuto(steps: Step[]): StepNode[] {
  const cursor = { i: 0 };
  return collectGroup(steps, cursor, /* stopOnUiWithScreen */ false);
}

/**
 * Walk a contiguous run of steps starting at `cursor.i`. Stops at end of list,
 * or — when `stopOnUiWithScreen` is true — at the next UiWithScreen (which
 * belongs to the caller).
 *
 * For each step:
 * - UiWithScreen → consume one node, then recursively absorb a child run of
 * UI-action siblings (with `stopOnUiWithScreen=true`).
 * - UiWithRow → consume one node, then recursively absorb a child run of
 * UI-action siblings (UiWithRow is itself a UI action that can also host
 * substeps — same recursive behaviour as UiWithScreen for its children).
 * - Any other UI action → consume one node, no children.
 * - Non-UI step → consume one node, no children. When called from a child
 * run this breaks the run (handled by the parent loop's `isUiAction` gate).
 */
function collectGroup(steps: Step[], cursor: { i: number }, stopOnUiWithScreen: boolean): StepNode[] {
  const result: StepNode[] = [];
  while (cursor.i < steps.length) {
    const step = steps[cursor.i];
    if (stopOnUiWithScreen && isUiWithScreen(step.api_id)) break;
    // Inside a parent's child run, a non-UI step ends the run; the parent's
    // caller will see it next.
    if (stopOnUiWithScreen && !isUiAction(step.api_id)) break;
    cursor.i++;
    const node: StepNode = { ...step, children: [] };
    result.push(node);
    if (isScreenContainer(step.api_id)) {
      // UiWithScreen always absorbs; UiWithRow absorbs when it is a child of
      // a UiWithScreen (root-level UiWithRow is rewritten into a synthetic
      // UiWithScreen by `buildTestCaseXml` before this walker runs). The child
      // run itself stops at the next UiWithScreen so a later UiWithScreen is
      // not pulled in as a grandchild.
      node.children = collectGroup(steps, cursor, /* stopOnUiWithScreen */ true);
    }
  }
  return result;
}

// PDX-495 + PDX-497: emit a list of grouped step nodes as XML. Assigns
// testItemIds depth-first: each node consumes one ID; if it has children it
// ALSO consumes one more ID for the <clause name="substeps"> slot, then its
// children consume their own IDs in order (recursing into grandchildren when
// a child node is itself a container, e.g. UiWithRow inside UiWithScreen).
// Mirrors the numbering convention used by Provar IDE (verified against the
// Contact_Lead1.testcase reference shape — see PDX-495).
function emitGroupedSteps(nodes: StepNode[], indent: string, startId: number): { xml: string; nextId: number } {
  const lines: string[] = [];
  let id = startId;
  for (const node of nodes) {
    const myId = id++;
    if (node.children.length === 0) {
      lines.push(buildFlatStepXml(node, myId, indent));
      continue;
    }
    const substepsId = id++;
    const childIndent = indent + '      '; // matches buildUiWithScreenXml inner step indent
    // PDX-497: recurse — children may themselves be containers (e.g. UiWithRow
    // inside UiWithScreen). The recursive call assigns child + grandchild IDs
    // and returns the XML for the full subtree.
    const { xml: childrenXml, nextId } = emitGroupedSteps(node.children, childIndent, id);
    id = nextId;
    lines.push(buildStepXmlWithChildren(node, myId, indent, childrenXml, substepsId));
  }
  return { xml: lines.join('\n'), nextId: id };
}

function buildTestCaseXml(input: {
  test_case_name: string;
  steps: Step[];
  target_uri?: string;
  grouping_mode?: 'auto' | 'flat' | 'single-screen';
}): string {
  const testCaseGuid = randomUUID();
  const registryId = randomUUID();
  const groupingMode = input.grouping_mode ?? 'auto';

  let stepLines: string;
  const isNonSf = !!input.target_uri && input.target_uri.startsWith('ui:');

  if (isNonSf && input.target_uri) {
    // target_uri=ui:pageobject:target?… always wraps all steps in a single
    // synthetic UiWithScreen — this predates PDX-495 and takes precedence
    // regardless of grouping_mode (matches "single-screen" semantics).
    stepLines = buildUiWithScreenXml(input.steps, input.target_uri);
  } else if (groupingMode === 'single-screen' && input.steps.length > 0) {
    // Explicit single-screen request without a non-SF target_uri: wrap with the
    // caller-supplied target_uri when provided (e.g. `sf:ui:target?object=Lead&action=New`),
    // falling back to the bare `sf:ui:target` default so the synthetic wrapper
    // is well-formed even when target_uri is omitted.
    stepLines = buildUiWithScreenXml(input.steps, input.target_uri ?? 'sf:ui:target');
  } else if (groupingMode === 'auto' && input.steps.some((s) => isScreenContainer(s.api_id))) {
    // PDX-495 + PDX-497 auto-grouping: nest UI actions inside their preceding
    // screen container (UiWithScreen). When the payload contains a screen
    // container but no UiWithScreen at root (e.g. starts with UiWithRow), QH's
    // UI-NEST-STRUCT-001 still requires UiWithRow itself to descend from a
    // UiWithScreen via a substeps clause. Synthesize a root UiWithScreen so the
    // round-trip generate -> validate stays clean. Mirrors the single-screen
    // path's synthetic wrapper (target_uri ?? 'sf:ui:target').
    const stepsForGrouping = input.steps.some((s) => isUiWithScreen(s.api_id))
      ? input.steps
      : [
          {
            api_id: 'UiWithScreen',
            name: 'With page',
            attributes: { target: input.target_uri ?? 'sf:ui:target' },
          },
          ...input.steps,
        ];
    const tree = groupStepsAuto(stepsForGrouping);
    stepLines = emitGroupedSteps(tree, '    ', 1).xml;
  } else {
    // Legacy flat behaviour: every step is a root sibling. Preserved by
    // grouping_mode="flat" and by payloads with no UiWithScreen present.
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
