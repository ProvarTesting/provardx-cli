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
import { credentialsService } from '../../services/auth/credentials.js';
import {
  qualityHubClient,
  getQualityHubBaseUrl,
  QualityHubAuthError,
  QualityHubRateLimitError,
  REQUEST_ACCESS_URL,
} from '../../services/qualityHub/client.js';

const CORPUS_FALLBACK_HINT =
  'Fallback: read the provar://docs/step-reference MCP resource for step types and attribute formats, then continue.';

const CORPUS_ONBOARDING_WARNING =
  'Corpus retrieval skipped — no Provar API key configured. Continuing without example grounding.\n' +
  'To enable corpus retrieval: run sf provar auth login\n' +
  `No account? Request access at: ${REQUEST_ACCESS_URL}\n` +
  CORPUS_FALLBACK_HINT;

const CORPUS_AUTH_WARNING =
  'Corpus retrieval skipped — API key is invalid or expired. Continuing without example grounding.\n' +
  `Run sf provar auth login to get a new key, or request access at: ${REQUEST_ACCESS_URL}\n` +
  CORPUS_FALLBACK_HINT;

const CORPUS_RATE_LIMIT_WARNING =
  'Corpus retrieval skipped — rate limit reached. Continuing without example grounding. Try again shortly.\n' +
  CORPUS_FALLBACK_HINT;

const CORPUS_UNREACHABLE_WARNING =
  'Corpus retrieval skipped — API unreachable. Continuing without example grounding.\n' +
  'Check your network connection or try again later.\n' +
  CORPUS_FALLBACK_HINT;

// ── Tool: provar.qualityhub.examples.retrieve ─────────────────────────────────

export function registerCorpusExamplesRetrieve(server: McpServer): void {
  server.tool(
    'provar.qualityhub.examples.retrieve',
    [
      'Retrieve N similar Provar test case examples from the Quality Hub corpus (1000+ tests in Bedrock KB).',
      'Use this BEFORE calling provar.testcase.generate to get few-shot grounding examples.',
      'Pass a user story, requirement, or source test file content as the query.',
      'Returns up to N example Provar XML test cases ordered by similarity score.',
      'If retrieval fails (no auth, network error, rate limit), returns empty examples with a warning — the',
      'generation workflow can still continue without grounding. Never hard-errors on API failure.',
      '',
      'For org-specific field metadata: first call getObjectSchema from the Salesforce Hosted MCP',
      '(platform/sobject-reads — https://api.salesforce.com/platform/mcp/v1/platform/sobject-reads),',
      'then include key field names in your query (e.g. "Opportunity: CloseDate, Amount, StageName").',
      '',
      'Requires a Provar API key (sf provar auth login). Without a key, returns empty examples with onboarding instructions.',
    ].join('\n'),
    {
      query: z
        .string()
        .describe(
          'Text to search against the corpus — a user story, requirement description, or source test file content. ' +
            'Longer is better: include Salesforce object names, field names, and action descriptions. ' +
            'Truncated server-side at 2000 characters.'
        ),
      n: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .default(5)
        .describe('Number of examples to return. Default 5, max 10.'),
      app_filter: z
        .string()
        .optional()
        .describe(
          'Optional Salesforce cloud filter to bias results (e.g. "SalesCloud", "ServiceCloud", "HealthCloud").'
        ),
      prefer_high_quality: z
        .boolean()
        .optional()
        .default(true)
        .describe('When true (default), favours tier4/tier3 corpus examples. Set false to include all tiers.'),
    },
    async ({ query, n, app_filter, prefer_high_quality }) => {
      const requestId = makeRequestId();
      log('info', 'provar.qualityhub.examples.retrieve', { requestId, query_length: query.length, n, app_filter });

      if (!query || query.trim().length === 0) {
        return {
          isError: true as const,
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(makeError('INVALID_QUERY', 'query must be a non-empty string.', requestId)),
            },
          ],
        };
      }

      const apiKey = credentialsService.resolveApiKey();

      if (!apiKey) {
        log('warn', 'provar.qualityhub.examples.retrieve: no api key', { requestId });
        const result = {
          requestId,
          examples: [],
          count: 0,
          query_truncated: false,
          warning: CORPUS_ONBOARDING_WARNING,
        };
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
      }

      const baseUrl = getQualityHubBaseUrl();

      try {
        const response = await qualityHubClient.retrieveCorpusExamples(query, apiKey, baseUrl, {
          n,
          app_filter,
          prefer_high_quality,
        });

        if (response.query_truncated) {
          log('warn', 'provar.qualityhub.examples.retrieve: query truncated', { requestId });
        }

        log('info', 'provar.qualityhub.examples.retrieve: success', {
          requestId,
          retrieval_id: response.retrieval_id,
          count: response.count,
          query_truncated: response.query_truncated,
        });

        const result = { requestId, ...response };
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
      } catch (err: unknown) {
        let warning: string;
        if (err instanceof QualityHubAuthError) {
          warning = CORPUS_AUTH_WARNING;
          log('warn', 'provar.qualityhub.examples.retrieve: auth error', { requestId });
        } else if (err instanceof QualityHubRateLimitError) {
          warning = CORPUS_RATE_LIMIT_WARNING;
          log('warn', 'provar.qualityhub.examples.retrieve: rate limited', { requestId });
        } else {
          warning = CORPUS_UNREACHABLE_WARNING;
          const errMsg = (err as Error).message.slice(0, 200);
          log('warn', 'provar.qualityhub.examples.retrieve: api error', { requestId, error: errMsg });
        }

        // Degrade gracefully — never isError:true. The LLM continues without grounding.
        const result = { requestId, examples: [], count: 0, query_truncated: false, warning };
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
      }
    }
  );
}

// ── Bulk registration ─────────────────────────────────────────────────────────

export function registerAllQualityHubApiTools(server: McpServer): void {
  registerCorpusExamplesRetrieve(server);
}
