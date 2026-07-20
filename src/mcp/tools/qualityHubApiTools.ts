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
import { selectBundledExamples } from '../examples/bundledExamples.js';
import { desc } from './descHelper.js';

const CORPUS_FALLBACK_HINT =
  'Fallback: call the provar_step_schema tool (api_id or category) for step types and their required/optional arguments, then continue.';

const BUNDLED_NOTE =
  'These are offline, bundled reference examples (quality_tier="bundled", source="bundled"), NOT corpus-retrieved ' +
  'matches — use them as a structural pattern, adapting object/field/connection names to your project.';

const CORPUS_ONBOARDING_WARNING =
  'Corpus retrieval skipped — no Provar API key configured. Returning bundled offline examples instead.\n' +
  'To enable full corpus retrieval: run sf provar auth login\n' +
  `No account? Request access at: ${REQUEST_ACCESS_URL}\n` +
  BUNDLED_NOTE;

const CORPUS_NO_BUNDLED_MATCH_WARNING =
  'Corpus retrieval skipped — no Provar API key configured, and no bundled offline example matches this query.\n' +
  'The bundled set covers Salesforce UI scenarios only; it is deliberately not returned for unrelated step types.\n' +
  `${CORPUS_FALLBACK_HINT}\n` +
  `To enable full corpus retrieval: run sf provar auth login. No account? Request access at: ${REQUEST_ACCESS_URL}`;

const CORPUS_AUTH_WARNING =
  'Corpus retrieval skipped — API key is invalid or expired. Returning bundled offline examples instead.\n' +
  `Run sf provar auth login to get a new key, or request access at: ${REQUEST_ACCESS_URL}\n` +
  BUNDLED_NOTE;

const CORPUS_RATE_LIMIT_WARNING =
  'Corpus retrieval skipped — rate limit reached. Continuing without example grounding. Try again shortly.\n' +
  CORPUS_FALLBACK_HINT;

const CORPUS_UNREACHABLE_WARNING =
  'Corpus retrieval skipped — API unreachable. Continuing without example grounding.\n' +
  'Check your network connection or try again later.\n' +
  CORPUS_FALLBACK_HINT;

// ── Tool: provar_qualityhub_examples_retrieve ─────────────────────────────────

export function registerCorpusExamplesRetrieve(server: McpServer): void {
  server.registerTool(
    'provar_qualityhub_examples_retrieve',
    {
      title: 'Retrieve Corpus Examples',
      description: desc(
        [
          'Retrieve N similar Provar test case examples from the Quality Hub corpus (1000+ tests in Bedrock KB).',
          'Use this BEFORE writing any Provar .testcase XML — whether via provar_testcase_generate, Write, or Edit.',
          'Pass a user story, requirement, source test file content, or step type keywords as the query.',
          'Returns up to N example Provar XML test cases ordered by similarity score.',
          'If no API key is configured (or the key is invalid), returns a small set of offline, known-correct',
          'BUNDLED examples (quality_tier="bundled", source="bundled") so first-test-case generation still has',
          'a structural pattern to follow. On transient failures (rate limit, network) returns empty with a',
          'warning. Never hard-errors on API failure — the generation workflow can always continue.',
          '',
          'For org-specific field metadata: first call getObjectSchema from the Salesforce Hosted MCP',
          '(platform/sobject-reads — https://api.salesforce.com/platform/mcp/v1/platform/sobject-reads),',
          'then include key field names in your query (e.g. "Opportunity: CloseDate, Amount, StageName").',
          '',
          'A Provar API key (sf provar auth login) unlocks full corpus retrieval; without one you still get bundled offline examples plus onboarding instructions.',
        ].join('\n'),
        'Retrieve similar Provar test case examples from the Quality Hub corpus.'
      ),
      inputSchema: {
        query: z
          .string()
          .describe(
            desc(
              'Text to search against the corpus — a user story, requirement description, or source test file content. ' +
                'Longer is better: include Salesforce object names, field names, and action descriptions. ' +
                'Truncated server-side at 2000 characters.',
              'string, user story or requirement text; include SF object/field names'
            )
          ),
        n: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .default(5)
          .describe(desc('Number of examples to return. Default 5, max 10.', 'int 1–10, optional; examples to return')),
        app_filter: z
          .string()
          .optional()
          .describe(
            desc(
              'Optional Salesforce cloud filter to bias results (e.g. "SalesCloud", "ServiceCloud", "HealthCloud").',
              'string, optional; SF cloud filter e.g. SalesCloud'
            )
          ),
        prefer_high_quality: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            desc(
              'When true (default), favours tier4/tier3 corpus examples. Set false to include all tiers.',
              'bool, optional; default true, prefer high-quality corpus examples'
            )
          ),
      },
    },
    async ({ query, n, app_filter, prefer_high_quality }) => {
      const requestId = makeRequestId();
      log('info', 'provar_qualityhub_examples_retrieve', { requestId, query_length: query.length, n, app_filter });

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
        log('warn', 'provar_qualityhub_examples_retrieve: no api key — returning bundled examples', { requestId });
        const examples = selectBundledExamples(query, n);
        const result = {
          requestId,
          examples,
          count: examples.length,
          query_truncated: false,
          // Relevance-gated: the bundle only covers Salesforce UI scenarios, so an
          // off-topic query correctly yields nothing rather than a misleading match.
          source: examples.length > 0 ? ('bundled' as const) : ('none' as const),
          warning: examples.length > 0 ? CORPUS_ONBOARDING_WARNING : CORPUS_NO_BUNDLED_MATCH_WARNING,
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
          log('warn', 'provar_qualityhub_examples_retrieve: query truncated', { requestId });
        }

        log('info', 'provar_qualityhub_examples_retrieve: success', {
          requestId,
          retrieval_id: response.retrieval_id,
          count: response.count,
          query_truncated: response.query_truncated,
        });

        // `source` is set on every path, not just the bundled ones, so a caller can
        // branch on it unconditionally instead of inferring "corpus" from its absence.
        const result = { requestId, ...response, source: 'corpus' as const };
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
      } catch (err: unknown) {
        // On a bad/expired key, bundled examples are still useful grounding. On transient
        // failures (rate limit, network) return empty — retrying is the right move, and
        // bundled examples would mask a temporary outage as "no matches".
        if (err instanceof QualityHubAuthError) {
          log('warn', 'provar_qualityhub_examples_retrieve: auth error — returning bundled examples', { requestId });
          const examples = selectBundledExamples(query, n);
          const result = {
            requestId,
            examples,
            count: examples.length,
            query_truncated: false,
            source: examples.length > 0 ? ('bundled' as const) : ('none' as const),
            warning: examples.length > 0 ? CORPUS_AUTH_WARNING : CORPUS_NO_BUNDLED_MATCH_WARNING,
          };
          return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
        }

        let warning: string;
        if (err instanceof QualityHubRateLimitError) {
          warning = CORPUS_RATE_LIMIT_WARNING;
          log('warn', 'provar_qualityhub_examples_retrieve: rate limited', { requestId });
        } else {
          warning = CORPUS_UNREACHABLE_WARNING;
          const errMsg = (err as Error).message.slice(0, 200);
          log('warn', 'provar_qualityhub_examples_retrieve: api error', { requestId, error: errMsg });
        }

        // Degrade gracefully — never isError:true. The LLM continues without grounding.
        // `source: 'none'` keeps the response shape uniform across all four paths.
        const result = { requestId, examples: [], count: 0, query_truncated: false, source: 'none' as const, warning };
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
      }
    }
  );
}

// ── Bulk registration ─────────────────────────────────────────────────────────

export function registerAllQualityHubApiTools(server: McpServer): void {
  registerCorpusExamplesRetrieve(server);
}
