/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { makeError, makeRequestId } from '../schemas/common.js';
import { log } from '../logging/logger.js';
import { desc } from './descHelper.js';

// ── Schema shape (only the fields this tool surfaces) ─────────────────────────

interface SchemaArgument {
  id: string;
  type?: string;
  default?: string;
  description?: string;
}

interface StepEntry {
  apiId: string;
  description?: string;
  category?: string;
  required_arguments?: SchemaArgument[];
  optional_arguments?: SchemaArgument[];
  validation_rules?: string[];
  best_practices?: string[];
}

interface StepIndexEntry {
  name: string;
  apiId: string;
  category: string;
  required_arguments: string[];
}

const dirPath = dirname(fileURLToPath(import.meta.url));

// ── Schema loading (lazy, module-level singleton) ─────────────────────────────

interface LoadedSchema {
  /** short name (lower) → entry */ byName: Map<string, StepEntry>;
  /** apiId (lower) → entry */ byApiId: Map<string, StepEntry>;
  index: StepIndexEntry[];
}

let loaded: LoadedSchema | null = null;

function loadSchema(): LoadedSchema | null {
  if (loaded) return loaded;
  let parsed: { apiCalls?: Record<string, unknown> };
  try {
    const raw = readFileSync(join(dirPath, '..', 'rules', 'provar_test_step_schema.json'), 'utf-8');
    parsed = JSON.parse(raw) as { apiCalls?: Record<string, unknown> };
  } catch {
    return null;
  }
  const byName = new Map<string, StepEntry>();
  const byApiId = new Map<string, StepEntry>();
  const index: StepIndexEntry[] = [];
  for (const [categoryName, category] of Object.entries(parsed.apiCalls ?? {})) {
    if (!category || typeof category !== 'object') continue;
    for (const [stepName, entry] of Object.entries(category as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as StepEntry;
      if (typeof e.apiId !== 'string') continue;
      const reqIds = (e.required_arguments ?? []).map((a) => a.id).filter((id): id is string => typeof id === 'string');
      byName.set(stepName.toLowerCase(), e);
      byApiId.set(e.apiId.toLowerCase(), e);
      index.push({ name: stepName, apiId: e.apiId, category: e.category ?? categoryName, required_arguments: reqIds });
    }
  }
  loaded = { byName, byApiId, index };
  return loaded;
}

/** Resolve an api_id argument (full apiId or short step name, e.g. "UiConnect") to an entry. */
function resolveStep(schema: LoadedSchema, apiId: string): StepEntry | null {
  const key = apiId.trim().toLowerCase();
  return schema.byApiId.get(key) ?? schema.byName.get(key) ?? schema.byName.get(key.split('.').pop() ?? key) ?? null;
}

// ── Tool: provar_step_schema ──────────────────────────────────────────────────

function registerStepSchema(server: McpServer): void {
  server.registerTool(
    'provar_step_schema',
    {
      title: 'Provar Step Schema',
      description: desc(
        [
          'Return the argument schema for Provar test-case step types from the bundled step reference.',
          'Grounds test-case generation and hand-editing in exact argument names — pass api_id (full apiId like',
          '"com.provar.plugins.forcedotcom.core.ui.UiConnect" or the short name "UiConnect") to get that step type\'s',
          'required_arguments, optional_arguments (each with id/type/default), validation_rules, and best_practices.',
          'Pass category (e.g. "UI", "Salesforce", "Control") to list every step type in that category.',
          'Omit both to get an index of all step types (name, apiId, category, required-argument ids).',
          'Read-only and offline — this is the tool form of the provar://schema/test-step resource, so agents that',
          'cannot read MCP resources can still reach the schema. Use it before provar_testcase_generate / _step_edit.',
        ].join(' '),
        'Return required/optional arguments for a Provar step type (by api_id), a category, or the full index.'
      ),
      inputSchema: {
        api_id: z
          .string()
          .optional()
          .describe(
            desc(
              'Full apiId or short step name (e.g. "UiConnect"). Returns that step type\'s full argument schema.',
              'string, optional; full apiId or short step name'
            )
          ),
        category: z
          .string()
          .optional()
          .describe(
            desc(
              'Category name (UI, Salesforce, Control, Data, Utility, ProvarAI, ProvarLabs). Lists steps in it.',
              'string, optional; category to list'
            )
          ),
      },
    },
    ({ api_id, category }) => {
      const requestId = makeRequestId();
      log('info', 'provar_step_schema', { requestId, api_id, category });

      const schema = loadSchema();
      if (!schema) {
        const err = makeError(
          'STEP_SCHEMA_NOT_FOUND',
          'provar_test_step_schema.json could not be read. Reinstall or upgrade the plugin and try again.',
          requestId,
          false
        );
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
      }

      if (api_id) {
        const entry = resolveStep(schema, api_id);
        if (!entry) {
          const near = schema.index
            .filter((s) => s.name.toLowerCase().includes(api_id.trim().toLowerCase()))
            .slice(0, 8)
            .map((s) => s.name);
          const err = makeError(
            'STEP_TYPE_NOT_FOUND',
            `No step type matches api_id "${api_id}".`,
            requestId,
            false,
            near.length
              ? { suggestion: `Did you mean one of: ${near.join(', ')}? Or omit api_id to list all step types.` }
              : { suggestion: 'Omit api_id to get the full index of step types.' }
          );
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
        }
        const result = { requestId, step: entry };
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
      }

      if (category) {
        const cat = category.trim().toLowerCase();
        const steps = schema.index.filter((s) => s.category.toLowerCase() === cat);
        const result = { requestId, category, count: steps.length, steps };
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
      }

      const result = { requestId, count: schema.index.length, steps: schema.index };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
    }
  );
}

export function registerAllStepSchemaTools(server: McpServer): void {
  registerStepSchema(server);
}
