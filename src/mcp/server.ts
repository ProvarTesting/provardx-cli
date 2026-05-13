/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { log } from './logging/logger.js';

const requireJson = createRequire(import.meta.url);
const SERVER_VERSION: string = (requireJson('../../package.json') as { version: string }).version;
import { registerProjectInspect } from './tools/projectInspect.js';
import { registerPageObjectGenerate } from './tools/pageObjectGenerate.js';
import { registerPageObjectValidate } from './tools/pageObjectValidate.js';
import { registerTestCaseGenerate } from './tools/testCaseGenerate.js';
import { registerTestCaseValidate } from './tools/testCaseValidate.js';
import { registerTestSuiteValidate } from './tools/testSuiteValidate.js';
import { registerTestPlanValidate } from './tools/testPlanValidate.js';
import { registerProjectValidateFromPath } from './tools/projectValidateFromPath.js';
import { registerAllPropertiesTools } from './tools/propertiesTools.js';
import { registerAllQualityHubTools } from './tools/qualityHubTools.js';
import { registerAllQualityHubApiTools } from './tools/qualityHubApiTools.js';
import { registerAllAutomationTools } from './tools/automationTools.js';
import { registerAllDefectTools } from './tools/defectTools.js';
import { registerAllAntTools } from './tools/antTools.js';
import { registerAllRcaTools } from './tools/rcaTools.js';
import { registerAllTestPlanTools } from './tools/testPlanTools.js';
import { registerAllNitroXTools } from './tools/nitroXTools.js';
import { registerAllTestCaseStepTools } from './tools/testCaseStepTools.js';
import { registerAllConnectionTools } from './tools/connectionTools.js';
import { registerAllPrompts } from './prompts/index.js';
import {
  createDepthGuardState,
  wrapWithDepthGuard,
  type AnyToolCallback,
  type DepthGuardState,
} from './utils/tokenMeta.js';
import { desc } from './tools/descHelper.js';

// ── Tool group registry ───────────────────────────────────────────────────────
// Groups are keyed in lowercase so they match the lowercased env var values.
const TOOL_GROUPS: Record<string, Array<(server: McpServer, config: ServerConfig) => void>> = {
  nitrox: [registerAllNitroXTools],
  automation: [registerAllAutomationTools],
  qualityhub: [registerAllQualityHubTools, registerAllQualityHubApiTools, registerAllDefectTools],
  validation: [
    registerProjectValidateFromPath,
    registerAllAntTools,
    registerAllPropertiesTools,
    registerTestCaseValidate,
    registerTestSuiteValidate,
    registerTestPlanValidate,
    registerPageObjectValidate,
  ],
  authoring: [
    registerTestCaseGenerate,
    registerPageObjectGenerate,
    registerAllTestCaseStepTools,
    registerAllTestPlanTools,
  ],
  inspect: [registerProjectInspect],
  connection: [registerAllConnectionTools],
  rca: [registerAllRcaTools],
};

export interface ServerConfig {
  allowedPaths: string[];
  updateResult?: {
    updateAvailable: boolean;
    latestVersion: string | null;
    updateCommand: string | null;
  };
}

export function parseActiveGroups(): Set<string> | null {
  const env = process.env['PROVAR_MCP_TOOLS'];
  if (!env?.trim()) return null;
  const groups = new Set(
    env
      .split(',')
      .map((g) => g.trim().toLowerCase())
      .filter(Boolean)
  );
  if (groups.size === 0) {
    log('warn', 'PROVAR_MCP_TOOLS was set but contained no valid group names — activating all groups', { raw: env });
    return null;
  }
  return groups;
}

export function createProvarMcpServer(config: ServerConfig): McpServer {
  log('info', 'Creating Provar MCP server', { allowedPaths: config.allowedPaths });

  const server = new McpServer({
    name: 'provar-mcp',
    version: SERVER_VERSION,
  });

  // ── Sanity-check tool ────────────────────────────────────────────────────────
  server.registerTool(
    'provardx_ping',
    {
      title: 'Ping MCP Server',
      description: desc(
        'Sanity-check tool. Echoes back a message with a timestamp. Use this to verify the MCP server is reachable before calling other tools.',
        'Echo message back with timestamp; verify MCP server is reachable.'
      ),
      inputSchema: {
        message: z
          .string()
          .optional()
          .default('ping')
          .describe(desc('Optional message to echo back', 'message to echo')),
      },
    },
    ({ message }) => {
      const result = {
        pong: message,
        ts: new Date().toISOString(),
        server: `provar-mcp@${SERVER_VERSION}`,
        updateAvailable: config.updateResult?.updateAvailable ?? false,
        latestVersion: config.updateResult?.latestVersion ?? null,
        updateCommand: config.updateResult?.updateCommand ?? null,
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    }
  );

  // ── Depth-guard middleware (PDX-474) ─────────────────────────────────────────
  const rawLimit = parseInt(process.env['PROVAR_MCP_MAX_TOOL_DEPTH'] ?? '50', 10);
  const depthLimit = Number.isNaN(rawLimit) || rawLimit <= 0 ? 50 : rawLimit;
  const depthState = createDepthGuardState();
  patchWithMiddleware(server, depthState, depthLimit);

  // ── Provar tools ─────────────────────────────────────────────────────────────
  const activeGroups = parseActiveGroups();
  for (const [group, registrars] of Object.entries(TOOL_GROUPS)) {
    if (activeGroups === null || activeGroups.has(group)) {
      for (const register of registrars) {
        register(server, config);
      }
    }
  }

  // ── Provar prompts ───────────────────────────────────────────────────────────
  registerAllPrompts(server);

  // ── Documentation resources ──────────────────────────────────────────────────
  const docsDir = resolveDocsDir(dirname(fileURLToPath(import.meta.url)));

  server.resource(
    'provar-nitrox-component-catalog',
    'provar://nitrox/component-catalog',
    {
      description:
        'Catalog of all shipped NitroX (Hybrid Model) base component packages. Lists every package with its components, types, tagNames, interactions, and attributes. Read this before calling provar_nitrox_generate to understand available component patterns and naming conventions.',
      mimeType: 'text/markdown',
    },
    () => {
      try {
        const text = readFileSync(join(docsDir, 'NITROX_COMPONENT_CATALOG.md'), 'utf-8');
        return {
          contents: [{ uri: 'provar://nitrox/component-catalog', mimeType: 'text/markdown', text }],
        };
      } catch {
        return {
          contents: [
            {
              uri: 'provar://nitrox/component-catalog',
              mimeType: 'text/markdown',
              text: '# NitroX Component Catalog\n\nCatalog not found. If you are developing from source, rebuild the package. Otherwise, reinstall or upgrade the plugin/package and try again.',
            },
          ],
        };
      }
    }
  );

  server.resource(
    'provar-nitrox-catalog-source',
    'provar://nitrox/catalog-source',
    {
      description:
        'Version metadata for the bundled NitroX component catalog. Returns the factPackages commit SHA and fetch timestamp from the last successful release build. Use this to verify which version of the ProvarTesting/factPackages repo is bundled in the running MCP server.',
      mimeType: 'application/json',
    },
    () => {
      const text = readCatalogSource(docsDir);
      return {
        contents: [{ uri: 'provar://nitrox/catalog-source', mimeType: 'application/json', text }],
      };
    }
  );

  server.resource(
    'provar-step-reference',
    'provar://docs/step-reference',
    {
      description:
        'Canonical reference for all Provar XML test step API IDs, argument formats, validation rules, and corpus-verified examples. Use this to understand correct step structure when generating or reviewing test cases.',
      mimeType: 'text/markdown',
    },
    () => {
      try {
        const content = readFileSync(join(docsDir, 'PROVAR_TEST_STEP_REFERENCE.md'), 'utf-8');
        return {
          contents: [
            {
              uri: 'provar://docs/step-reference',
              mimeType: 'text/markdown',
              text: content,
            },
          ],
        };
      } catch {
        return {
          contents: [
            {
              uri: 'provar://docs/step-reference',
              mimeType: 'text/markdown',
              text: '# Provar Test Step Reference\n\nReference doc not found. If you are developing from source, rebuild the package. Otherwise, reinstall or upgrade the plugin/package and try again.',
            },
          ],
        };
      }
    }
  );

  server.resource(
    'provar-tool-guide',
    'provar://docs/tool-guide',
    {
      description:
        'Tool selection guide for ProvarDX MCP. Organised by what you want to accomplish (run tests, author tests, debug failures, manage config, etc.) rather than by tool name. Read this to choose the right tool and understand correct sequencing before calling tools.',
      mimeType: 'text/markdown',
    },
    () => {
      try {
        const text = readFileSync(join(docsDir, 'PROVAR_TOOL_GUIDE.md'), 'utf-8');
        return {
          contents: [{ uri: 'provar://docs/tool-guide', mimeType: 'text/markdown', text }],
        };
      } catch {
        return {
          contents: [
            {
              uri: 'provar://docs/tool-guide',
              mimeType: 'text/markdown',
              text: '# ProvarDX Tool Guide\n\nGuide not found. Reinstall or upgrade the plugin and try again.',
            },
          ],
        };
      }
    }
  );

  return server;
}

function patchWithMiddleware(server: McpServer, state: DepthGuardState, limit: number): void {
  const orig = server.registerTool.bind(server);
  type RegisterToolFn = (n: string, c: unknown, h: AnyToolCallback) => unknown;
  // Cast through unknown to patch the overloaded method without triggering no-unsafe-any.
  const patchable = server as unknown as { registerTool: RegisterToolFn };
  patchable.registerTool = (name: string, config: unknown, handler: AnyToolCallback): unknown =>
    (orig as unknown as RegisterToolFn)(name, config, wrapWithDepthGuard(name, handler, state, limit));
}

/**
 * Resolve the docs directory for bundled MCP Markdown resources.
 * In compiled output (lib/mcp/) the sibling docs/ dir exists; in dev/ts-node
 * mode (src/mcp/) it doesn't, so fall back two levels to the repo-root docs/.
 */
export function resolveDocsDir(currentDir: string): string {
  const sibling = join(currentDir, 'docs');
  return existsSync(sibling) ? sibling : join(currentDir, '..', '..', 'docs');
}

/**
 * Read NITROX_CATALOG_SOURCE.json from the docs directory and return it as
 * a formatted JSON string.  Returns a fallback object string if the file is
 * absent or unreadable.
 */
export function readCatalogSource(docsDir: string): string {
  try {
    const raw = readFileSync(join(docsDir, 'NITROX_CATALOG_SOURCE.json'), 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Normalise schemasUpdated so older build artifacts (which lack this field)
    // return a stable shape rather than omitting the key entirely.
    if (!('schemasUpdated' in parsed)) {
      parsed['schemasUpdated'] = null;
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return JSON.stringify(
      {
        branch: 'main',
        commitSha: null,
        fetchedAt: null,
        schemasUpdated: null,
      },
      null,
      2
    );
  }
}
