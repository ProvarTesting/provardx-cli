/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerCrtMigrationPrompt,
  registerSeleniumMigrationPrompt,
  registerPlaywrightMigrationPrompt,
} from './migrationPrompts.js';
import {
  registerLoopGeneratePrompt,
  registerLoopFixPrompt,
  registerLoopReviewPrompt,
  registerLoopCoveragePrompt,
} from './loopPrompts.js';

export function registerAllPrompts(server: McpServer): void {
  registerCrtMigrationPrompt(server);
  registerSeleniumMigrationPrompt(server);
  registerPlaywrightMigrationPrompt(server);
  registerLoopGeneratePrompt(server);
  registerLoopFixPrompt(server);
  registerLoopReviewPrompt(server);
  registerLoopCoveragePrompt(server);
}
