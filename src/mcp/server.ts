/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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
import { registerAllConnectionTools } from './tools/connectionTools.js';
import { registerAllPrompts } from './prompts/index.js';

export interface ServerConfig {
  allowedPaths: string[];
}

export function createProvarMcpServer(config: ServerConfig): McpServer {
  log('info', 'Creating Provar MCP server', { allowedPaths: config.allowedPaths });

  const server = new McpServer({
    name: 'provar-mcp',
    version: SERVER_VERSION,
  });

  // ── Sanity-check tool ────────────────────────────────────────────────────────
  server.tool(
    'provardx.ping',
    'Sanity-check tool. Echoes back a message with a timestamp. Use this to verify the MCP server is reachable before calling other tools.',
    {
      message: z.string().optional().default('ping').describe('Optional message to echo back'),
    },
    ({ message }) => {
      const result = { pong: message, ts: new Date().toISOString(), server: `provar-mcp@${SERVER_VERSION}` };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    }
  );

  // ── Provar tools ─────────────────────────────────────────────────────────────
  registerProjectInspect(server, config);
  registerPageObjectGenerate(server, config);
  registerPageObjectValidate(server, config);
  registerTestCaseGenerate(server, config);
  registerTestCaseValidate(server, config);
  registerTestSuiteValidate(server);
  registerTestPlanValidate(server);
  registerProjectValidateFromPath(server, config);
  registerAllPropertiesTools(server, config);
  registerAllQualityHubTools(server);
  registerAllQualityHubApiTools(server);
  registerAllAutomationTools(server, config);
  registerAllDefectTools(server);
  registerAllAntTools(server, config);
  registerAllRcaTools(server);
  registerAllTestPlanTools(server, config);
  registerAllNitroXTools(server, config);
  registerAllConnectionTools(server, config);

  // ── Provar prompts ───────────────────────────────────────────────────────────
  registerAllPrompts(server);

  // ── Documentation resources ──────────────────────────────────────────────────
  const docsDir = join(dirname(fileURLToPath(import.meta.url)), 'docs');
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

  return server;
}
