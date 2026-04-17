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
      'NOT YET ACTIVE — Retrieves Salesforce object and field metadata (sObject describe) from a connected org.',
      'Implementation is pending SF auth scope confirmation (Phase 2 OQ5).',
      'When active: returns up to 20 objects with up to 50 fields each, including field API names, types, and relationships.',
      'This context is used to ground test generation with org-specific field names instead of generic examples.',
      '',
      'WORKAROUND until this tool is active: append Salesforce object names and key field API names directly',
      'to your user story before calling provar.qualityhub.examples.retrieve. For example:',
      '  "... [Opportunity fields: CloseDate (Date), Amount (Currency), StageName (Picklist), CustomField__c (Text)]"',
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
                'provar.org.describe is not yet active. SF auth scope confirmation (OQ5) is pending. ' +
                  'Use the workaround described in the tool description: append object/field names to your user story query.',
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
