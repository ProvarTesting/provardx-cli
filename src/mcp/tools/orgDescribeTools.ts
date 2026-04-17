/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { makeError, makeRequestId } from '../schemas/common.js';
import { log } from '../logging/logger.js';

// ── Tool: provar.org.describe ─────────────────────────────────────────────────

export function registerOrgDescribe(server: McpServer): void {
  server.tool(
    'provar.org.describe',
    [
      'NOT YET ACTIVE — superseded by the Salesforce Hosted MCP Server (now GA).',
      '',
      'RECOMMENDED: Connect the Salesforce sobject-reads MCP server alongside Provar MCP,',
      'then call getObjectSchema to retrieve sObject field metadata for your org.',
      '  Production: https://api.salesforce.com/platform/mcp/v1/platform/sobject-reads',
      '  Sandbox:    https://api.salesforce.com/platform/mcp/v1/sandbox/platform/sobject-reads',
      'Pass the schema as additional context when calling provar.qualityhub.examples.retrieve.',
      'The SF Hosted MCP uses per-user OAuth 2.0 and respects field-level security automatically.',
      '',
      'FALLBACK (no SF MCP): append key field API names directly to your query.',
      '  Example: "... [Opportunity: CloseDate (Date), Amount (Currency), StageName (Picklist)]"',
    ].join('\n'),
    {
      target_org: z
        .string()
        .optional()
        .describe('SF org alias or username (uses default org if omitted). Not used until tool is active.'),
      objects: z
        .array(z.string())
        .optional()
        .describe(
          'List of Salesforce object API names to describe (e.g. ["Account", "Opportunity"]). Max 20. Not used until tool is active.'
        ),
    },
    ({ target_org }) => {
      const requestId = makeRequestId();
      log('info', 'provar.org.describe: not yet active', { requestId, target_org });

      return {
        isError: true as const,
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              makeError(
                'NOT_CONFIGURED',
                'provar.org.describe is not yet active. Use the Salesforce Hosted MCP Server instead: ' +
                  'https://api.salesforce.com/platform/mcp/v1/platform/sobject-reads — call getObjectSchema ' +
                  'to retrieve sObject metadata, then include it in your provar.qualityhub.examples.retrieve query.',
                requestId,
                false
              )
            ),
          },
        ],
      };
    }
  );
}

// ── Bulk registration ─────────────────────────────────────────────────────────

export function registerAllOrgDescribeTools(server: McpServer): void {
  registerOrgDescribe(server);
}
