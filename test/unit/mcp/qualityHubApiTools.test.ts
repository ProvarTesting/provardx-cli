/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
/* eslint-disable camelcase */

import { strict as assert } from 'node:assert';
import sinon from 'sinon';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  qualityHubClient,
  QualityHubAuthError,
  QualityHubRateLimitError,
} from '../../../src/services/qualityHub/client.js';
import { credentialsService } from '../../../src/services/auth/credentials.js';

// ── Minimal mock server ───────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => unknown;

class MockMcpServer {
  private handlers = new Map<string, ToolHandler>();

  public tool(name: string, _desc: string, _schema: unknown, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  public call(name: string, args: Record<string, unknown>): ReturnType<ToolHandler> {
    const h = this.handlers.get(name);
    if (!h) throw new Error(`Tool not registered: ${name}`);
    return h(args);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseBody(result: unknown): Record<string, unknown> {
  const r = result as { content: Array<{ text: string }> };
  return JSON.parse(r.content[0].text) as Record<string, unknown>;
}

function isError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true;
}

const EXAMPLE = {
  id: 'tier4/SalesCloud/create_opportunity.xml',
  name: 'create_opportunity',
  xml: '<testCase guid="abc"><steps/></testCase>',
  similarity_score: 0.94,
  salesforce_object: 'Opportunity',
  quality_tier: 'tier4',
};

const CORPUS_RESPONSE = {
  retrieval_id: 'ret-abc123',
  examples: [EXAMPLE],
  count: 1,
  query_truncated: false,
};

// ── Tests: provar.qualityhub.examples.retrieve ────────────────────────────────

describe('qualityHubApiTools', () => {
  let server: MockMcpServer;
  let retrieveStub: sinon.SinonStub;
  let resolveKeyStub: sinon.SinonStub;

  beforeEach(async () => {
    server = new MockMcpServer();
    retrieveStub = sinon.stub(qualityHubClient, 'retrieveCorpusExamples');
    resolveKeyStub = sinon.stub(credentialsService, 'resolveApiKey').returns('pv_k_testkey');

    const { registerAllQualityHubApiTools } = await import('../../../src/mcp/tools/qualityHubApiTools.js');
    registerAllQualityHubApiTools(server as unknown as McpServer);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('provar.qualityhub.examples.retrieve', () => {
    it('returns examples on happy path', async () => {
      retrieveStub.resolves(CORPUS_RESPONSE);

      const result = await server.call('provar.qualityhub.examples.retrieve', { query: 'Create an Opportunity', n: 1 });

      assert.equal(isError(result), false);
      const body = parseBody(result);
      assert.equal(body.count, 1);
      assert.equal(body.retrieval_id, 'ret-abc123');
      const examples = body.examples as Array<typeof EXAMPLE>;
      assert.equal(examples.length, 1);
      assert.equal(examples[0].name, 'create_opportunity');
    });

    it('passes n, app_filter, prefer_high_quality to the service', async () => {
      retrieveStub.resolves({ ...CORPUS_RESPONSE, count: 0, examples: [] });

      await server.call('provar.qualityhub.examples.retrieve', {
        query: 'test query',
        n: 3,
        app_filter: 'SalesCloud',
        prefer_high_quality: false,
      });

      const [, , , opts] = retrieveStub.firstCall.args as [
        string,
        string,
        string,
        { n: number; app_filter: string; prefer_high_quality: boolean }
      ];
      assert.equal(opts.n, 3);
      assert.equal(opts.app_filter, 'SalesCloud');
      assert.equal(opts.prefer_high_quality, false);
    });

    it('returns empty examples with no isError when API key is not configured', async () => {
      resolveKeyStub.returns(null);

      const result = await server.call('provar.qualityhub.examples.retrieve', { query: 'Create an Opportunity' });

      // CRITICAL: must NOT be isError:true — the LLM workflow must continue
      assert.equal(isError(result), false, 'Must not set isError:true when key missing');
      const body = parseBody(result);
      assert.deepEqual(body.examples, []);
      assert.equal(body.count, 0);
      const warning = String(body.warning);
      assert.ok(warning.length > 0, 'Should include warning message');
      assert.ok(warning.includes('sf provar auth login'), 'Warning should mention auth login');
    });

    it('returns empty examples with no isError on 401 auth error', async () => {
      retrieveStub.rejects(new QualityHubAuthError('Key invalid'));

      const result = await server.call('provar.qualityhub.examples.retrieve', { query: 'Create an Opportunity' });

      // CRITICAL: must NOT be isError:true — graceful degrade
      assert.equal(isError(result), false, 'Must not set isError:true on auth failure');
      const body = parseBody(result);
      assert.deepEqual(body.examples, []);
      assert.ok(typeof body.warning === 'string', 'Should include warning');
    });

    it('returns empty examples with no isError on rate limit', async () => {
      retrieveStub.rejects(new QualityHubRateLimitError('Rate limited'));

      const result = await server.call('provar.qualityhub.examples.retrieve', { query: 'Create an Opportunity' });

      assert.equal(isError(result), false, 'Must not set isError:true on rate limit');
      const body = parseBody(result);
      assert.deepEqual(body.examples, []);
      assert.ok(typeof body.warning === 'string');
    });

    it('returns empty examples with no isError on network/server error', async () => {
      retrieveStub.rejects(new Error('ECONNRESET'));

      const result = await server.call('provar.qualityhub.examples.retrieve', { query: 'Create an Opportunity' });

      assert.equal(isError(result), false, 'Must not set isError:true on network error');
      const body = parseBody(result);
      assert.deepEqual(body.examples, []);
    });

    it('returns isError:true for empty query', async () => {
      const result = await server.call('provar.qualityhub.examples.retrieve', { query: '' });

      assert.equal(isError(result), true);
      const body = parseBody(result);
      assert.equal(body.error_code, 'INVALID_QUERY');
    });

    it('surfaces query_truncated:true in response', async () => {
      retrieveStub.resolves({ ...CORPUS_RESPONSE, query_truncated: true });

      const result = await server.call('provar.qualityhub.examples.retrieve', { query: 'A'.repeat(2100) });

      const body = parseBody(result);
      assert.equal(body.query_truncated, true);
    });

    it('returns empty examples array (not an error) when Bedrock returns 0 results', async () => {
      retrieveStub.resolves({ retrieval_id: 'ret-empty', examples: [], count: 0, query_truncated: false });

      const result = await server.call('provar.qualityhub.examples.retrieve', { query: 'very unusual query' });

      assert.equal(isError(result), false);
      const body = parseBody(result);
      assert.deepEqual(body.examples, []);
      assert.equal(body.count, 0);
      assert.equal(body.retrieval_id, 'ret-empty');
    });

    it('includes retrieval_id in all successful responses', async () => {
      retrieveStub.resolves(CORPUS_RESPONSE);

      const result = await server.call('provar.qualityhub.examples.retrieve', { query: 'some query' });
      const body = parseBody(result);
      assert.ok(body.retrieval_id, 'retrieval_id must be present');
    });
  });
});
