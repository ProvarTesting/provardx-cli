/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from '../server.js';
import { assertPathAllowed, PathPolicyError } from '../security/pathPolicy.js';
import { makeError, makeRequestId } from '../schemas/common.js';
import { log } from '../logging/logger.js';
import { validateTestCase } from './testCaseValidate.js';

// ── XML parse / build config ──────────────────────────────────────────────────

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  isArray: (tagName: string): boolean => tagName === 'apiCall',
};

const BUILDER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true,
  indentBy: '    ',
  suppressEmptyNode: false,
};

type ApiCallNode = Record<string, unknown>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTestCaseXml(xmlContent: string): Record<string, unknown> {
  const parser = new XMLParser(PARSER_OPTIONS);
  return parser.parse(xmlContent) as Record<string, unknown>;
}

function buildTestCaseXml(parsed: Record<string, unknown>): string {
  const builder = new XMLBuilder(BUILDER_OPTIONS);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + (builder.build(parsed) as string);
}

function getApiCalls(parsed: Record<string, unknown>): ApiCallNode[] | null {
  const tc = parsed['testCase'];
  if (!tc || typeof tc !== 'object') return null;
  const steps = (tc as Record<string, unknown>)['steps'];
  if (!steps || typeof steps !== 'object') return null;
  const calls = (steps as Record<string, unknown>)['apiCall'];
  if (!Array.isArray(calls)) return null;
  return calls as ApiCallNode[];
}

function collectAllTestItemIds(parsed: Record<string, unknown>): string[] {
  const calls = getApiCalls(parsed);
  if (!calls) return [];
  return calls.map((c) => c['@_testItemId']).filter((id): id is string => typeof id === 'string');
}

function parseNewStep(stepXml: string): { step: ApiCallNode } | { error: string } {
  try {
    const fragParser = new XMLParser(PARSER_OPTIONS);
    const fragDoc = fragParser.parse(`<root>${stepXml}</root>`) as Record<string, unknown>;
    const rootEl = fragDoc['root'] as Record<string, unknown> | undefined;
    const callEl = rootEl?.['apiCall'];
    if (!callEl) return { error: 'step_xml must contain exactly one <apiCall> element' };
    const calls = Array.isArray(callEl) ? (callEl as ApiCallNode[]) : [callEl as ApiCallNode];
    if (calls.length !== 1) return { error: 'step_xml must contain exactly one <apiCall> element' };
    return { step: calls[0] };
  } catch (e: unknown) {
    return { error: (e as Error).message };
  }
}

// ── Tool registration ─────────────────────────────────────────────────────────

export function registerTestCaseStepEdit(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.testcase.step.edit',
    [
      'Add or remove a single step (apiCall) in a Provar XML test case file.',
      'Uses write-to-temp-then-rename to minimise partial-write risk.',
      'Prerequisites: the test case must exist and be valid XML.',
      'For mode=remove: supply test_item_id of the step to remove.',
      'For mode=add: supply test_item_id of the anchor step, position (before|after, default after),',
      'and step_xml (the <apiCall ...>...</apiCall> XML fragment for the new step; must contain exactly one <apiCall>).',
      'A backup is written to <test_case_path>.bak before any mutation and restored automatically if',
      'the post-edit validation fails.',
      'Returns STEP_NOT_FOUND (with all_test_item_ids list) when the target step is absent.',
      'Returns INVALID_STEP_XML when step_xml cannot be parsed or contains ≠1 <apiCall> elements.',
      'Returns INVALID_XML_AFTER_EDIT (backup restored) when the mutated file fails validation.',
    ].join(' '),
    {
      test_case_path: z.string().describe('Absolute path to the .testcase XML file; must be within --allowed-paths'),
      mode: z.enum(['remove', 'add']).describe('"remove" to delete a step; "add" to insert a new step'),
      test_item_id: z
        .string()
        .describe('For mode=remove: testItemId of the step to delete. For mode=add: testItemId of the anchor step.'),
      position: z
        .enum(['before', 'after'])
        .optional()
        .default('after')
        .describe('Where to insert relative to the anchor step (mode=add only; default: after)'),
      step_xml: z
        .string()
        .optional()
        .describe(
          'The <apiCall ...>...</apiCall> XML fragment for the new step (mode=add only). Must be well-formed XML.'
        ),
      validate_after_edit: z
        .boolean()
        .optional()
        .default(true)
        .describe('Run provar.testcase.validate after the mutation; restores backup on failure (default: true)'),
    },
    (input) => {
      const requestId = makeRequestId();
      log('info', 'provar.testcase.step.edit', { requestId, mode: input.mode, test_item_id: input.test_item_id });

      try {
        const resolvedPath = path.resolve(input.test_case_path);
        const bakPath = resolvedPath + '.bak';

        // Path policy — validate both the target file and its backup path
        assertPathAllowed(resolvedPath, config.allowedPaths);
        assertPathAllowed(bakPath, config.allowedPaths);

        // Validate step_xml up-front before touching the file
        let newStep: ApiCallNode | null = null;
        if (input.mode === 'add') {
          if (!input.step_xml) {
            const err = makeError('MISSING_INPUT', 'step_xml is required for mode=add', requestId);
            return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
          }
          const parsed_step = parseNewStep(input.step_xml);
          if ('error' in parsed_step) {
            const err = makeError('INVALID_STEP_XML', `step_xml parse error: ${parsed_step.error}`, requestId);
            return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
          }
          newStep = parsed_step.step;
        }

        // Read the test case file
        if (!fs.existsSync(resolvedPath)) {
          const err = makeError('FILE_NOT_FOUND', `Test case not found: ${resolvedPath}`, requestId);
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
        }
        const original = fs.readFileSync(resolvedPath, 'utf-8');

        // Parse
        let parsed: Record<string, unknown>;
        try {
          parsed = parseTestCaseXml(original);
        } catch (e: unknown) {
          const err = makeError('INVALID_XML', `Cannot parse test case: ${(e as Error).message}`, requestId);
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
        }

        const apiCalls = getApiCalls(parsed);
        if (!apiCalls) {
          const err = makeError(
            'INVALID_XML',
            'Test case XML does not contain a <testCase><steps><apiCall> structure',
            requestId
          );
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
        }

        // Find target step
        const targetIndex = apiCalls.findIndex((c) => String(c['@_testItemId']) === input.test_item_id);
        if (targetIndex === -1) {
          const allIds = collectAllTestItemIds(parsed);
          const err = makeError(
            'STEP_NOT_FOUND',
            `Step with testItemId "${input.test_item_id}" not found in ${resolvedPath}`,
            requestId,
            false,
            { all_test_item_ids: allIds }
          );
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
        }

        // Mutate the parsed tree
        if (input.mode === 'remove') {
          apiCalls.splice(targetIndex, 1);
        } else {
          // mode=add
          const insertAt = input.position === 'before' ? targetIndex : targetIndex + 1;
          apiCalls.splice(insertAt, 0, newStep as ApiCallNode);
        }

        // Rebuild XML
        const mutatedXml = buildTestCaseXml(parsed);

        // Write backup, then write mutated file via temp→rename to minimise partial-write risk
        const tmpPath = resolvedPath + '.tmp';
        fs.writeFileSync(bakPath, original, 'utf-8');
        fs.writeFileSync(tmpPath, mutatedXml, 'utf-8');
        fs.renameSync(tmpPath, resolvedPath);

        // Validate if requested
        let validation: ReturnType<typeof validateTestCase> | null | undefined;
        if (input.validate_after_edit) {
          try {
            validation = validateTestCase(mutatedXml, path.basename(resolvedPath, '.testcase'));
          } catch {
            // treat thrown validation errors as failures
            validation = null;
          }

          if (!validation || !validation.is_valid) {
            // Restore from backup
            fs.writeFileSync(resolvedPath, original, 'utf-8');
            fs.unlinkSync(bakPath);
            const err = makeError(
              'INVALID_XML_AFTER_EDIT',
              `Validation failed after ${input.mode}; original file restored from backup`,
              requestId,
              false,
              { validation_issues: validation?.issues ?? ['Validation threw an unexpected error'] }
            );
            return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
          }
        }

        // Success — delete backup
        try {
          fs.unlinkSync(bakPath);
        } catch {
          // non-fatal
        }

        const result = {
          requestId,
          success: true,
          test_item_id: input.test_item_id,
          mode: input.mode,
          ...(input.validate_after_edit && validation ? { validation } : {}),
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
      } catch (err: unknown) {
        const error = err as Error & { code?: string };
        const errResult = makeError(
          error instanceof PathPolicyError ? error.code : 'STEP_EDIT_ERROR',
          error.message,
          requestId
        );
        log('error', 'provar.testcase.step.edit failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}

export function registerAllTestCaseStepTools(server: McpServer, config: ServerConfig): void {
  registerTestCaseStepEdit(server, config);
}
