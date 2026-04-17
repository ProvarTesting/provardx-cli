/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
/* eslint-disable camelcase */

import { strict as assert } from 'node:assert';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

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

// ── Tests: provar.org.describe (stub) ─────────────────────────────────────────

describe('orgDescribeTools', () => {
  let server: MockMcpServer;

  beforeEach(async () => {
    server = new MockMcpServer();
    const { registerAllOrgDescribeTools } = await import('../../../src/mcp/tools/orgDescribeTools.js');
    registerAllOrgDescribeTools(server as unknown as McpServer);
  });

  describe('provar.org.describe', () => {
    it('returns isError:true with NOT_CONFIGURED code', () => {
      const result = server.call('provar.org.describe', {});

      assert.equal(isError(result), true);
      const body = parseBody(result);
      assert.equal(body.error_code, 'NOT_CONFIGURED');
    });

    it('includes actionable workaround message in error', () => {
      const result = server.call('provar.org.describe', {});

      const body = parseBody(result);
      const message = String(body.message);
      assert.ok(message.length > 0, 'message must be present');
      assert.ok(message.toLowerCase().includes('workaround'), 'message should mention workaround');
    });

    it('handles target_org and objects params without crashing', () => {
      assert.doesNotThrow(() => {
        server.call('provar.org.describe', { target_org: 'myorg', objects: ['Account', 'Opportunity'] });
      });
    });

    it('always returns NOT_CONFIGURED regardless of input', () => {
      const result1 = server.call('provar.org.describe', {});
      const result2 = server.call('provar.org.describe', { target_org: 'someorg' });

      assert.equal(parseBody(result1).error_code, 'NOT_CONFIGURED');
      assert.equal(parseBody(result2).error_code, 'NOT_CONFIGURED');
    });
  });
});
