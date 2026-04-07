/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@provartesting/provardx-plugins-utils';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createProvarMcpServer } from '../../../mcp/server.js';
import { validateLicense, LicenseError } from '../../../mcp/licensing/index.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@provartesting/provardx-cli', 'sf.provar.mcp.start');

export default class SfProvarMcpStart extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  /**
   * Disable --json flag entirely: stdout is reserved for MCP JSON-RPC messages
   * and must not be contaminated by oclif JSON output.
   */
  public static enableJsonFlag = false;

  public static readonly flags = {
    'allowed-paths': Flags.string({
      summary: messages.getMessage('flags.allowed-paths.summary'),
      char: 'a',
      multiple: true,
      default: [process.cwd()],
    }),
    'auto-defects': Flags.boolean({
      summary: messages.getMessage('flags.auto-defects.summary'),
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(SfProvarMcpStart);
    const allowedPaths = flags['allowed-paths'];

    if (flags['auto-defects']) {
      process.env['PROVAR_AUTO_DEFECTS'] = '1';
    }

    // Validate that a Provar Automation IDE license is activated on this machine
    // before handing stdin/stdout to the MCP transport.
    try {
      const result = await validateLicense();
      if (result.offlineGrace) {
        process.stderr.write(
          '[provar-mcp] Warning: license validated from offline cache (last checked > 2h ago).\n'
        );
      }
    } catch (err: unknown) {
      if (err instanceof LicenseError) {
        this.error(err.message, { exit: 1 });
      }
      throw err;
    }

    const server = createProvarMcpServer({ allowedPaths });
    const transport = new StdioServerTransport();

    // Connect hands stdin/stdout ownership to the SDK.
    // The process stays alive until stdin closes (client disconnect).
    await server.connect(transport);
  }
}
