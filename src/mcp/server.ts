/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { log } from './logging/logger.js';
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
import { registerAllAutomationTools } from './tools/automationTools.js';
import { registerAllDefectTools } from './tools/defectTools.js';
import { registerAllAntTools } from './tools/antTools.js';
import { registerAllRcaTools } from './tools/rcaTools.js';
import { registerAllTestPlanTools } from './tools/testPlanTools.js';

export interface ServerConfig {
  allowedPaths: string[];
}

export function createProvarMcpServer(config: ServerConfig): McpServer {
  log('info', 'Creating Provar MCP server', { allowedPaths: config.allowedPaths });

  const server = new McpServer({
    name: 'provar-mcp',
    version: '1.0.0',
  });

  // ── Sanity-check tool ────────────────────────────────────────────────────────
  server.tool(
    'provardx.ping',
    'Sanity-check tool. Echoes back a message with a timestamp. Use this to verify the MCP server is reachable before calling other tools.',
    {
      message: z.string().optional().default('ping').describe('Optional message to echo back'),
    },
    ({ message }) => {
      const result = { pong: message, ts: new Date().toISOString(), server: 'provar-mcp@1.0.0' };
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
  registerAllAutomationTools(server, config);
  registerAllDefectTools(server);
  registerAllAntTools(server, config);
  registerAllRcaTools(server);
  registerAllTestPlanTools(server, config);

  return server;
}
