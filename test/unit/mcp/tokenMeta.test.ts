/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { strict as assert } from 'node:assert';
import {
  createDepthGuardState,
  wrapWithDepthGuard,
  attachMeta,
  estimateTokens,
  estimateResultTokens,
  type ToolResult,
  type AnyToolCallback,
} from '../../../src/mcp/utils/tokenMeta.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHandler(response: ToolResult): AnyToolCallback {
  return () => response;
}

const okResponse: ToolResult = {
  content: [{ type: 'text', text: '{"ok":true}' }],
  structuredContent: { ok: true },
};

const errResponse: ToolResult = {
  isError: true,
  content: [{ type: 'text', text: '{"error":"oops"}' }],
  structuredContent: { error: 'oops' },
};

function withMeta(enabled: boolean, fn: () => void): void {
  const prev = process.env['PROVAR_MCP_EMIT_TOKEN_META'];
  process.env['PROVAR_MCP_EMIT_TOKEN_META'] = enabled ? 'true' : 'false';
  try {
    fn();
  } finally {
    if (prev === undefined) {
      delete process.env['PROVAR_MCP_EMIT_TOKEN_META'];
    } else {
      process.env['PROVAR_MCP_EMIT_TOKEN_META'] = prev;
    }
  }
}

// ---------------------------------------------------------------------------
// wrapWithDepthGuard
// ---------------------------------------------------------------------------

describe('wrapWithDepthGuard', () => {
  it('allows calls up to the limit', async () => {
    const state = createDepthGuardState();
    const wrapped = wrapWithDepthGuard('tool', makeHandler(okResponse), state, 3);
    const extra = { sessionId: 'sess-1' };
    const results = await Promise.all([wrapped({}, extra), wrapped({}, extra), wrapped({}, extra)]);
    for (const result of results) {
      assert.strictEqual(result.isError, undefined);
    }
  });

  it('fires TOOL_BUDGET_EXCEEDED on the call that exceeds the limit', async () => {
    const state = createDepthGuardState();
    const wrapped = wrapWithDepthGuard('tool', makeHandler(okResponse), state, 2);
    const extra = { sessionId: 'sess-budget' };
    await Promise.all([wrapped({}, extra), wrapped({}, extra)]);
    const result = await wrapped({}, extra);
    assert.strictEqual(result.isError, true);
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;
    assert.strictEqual(body['error'], 'TOOL_BUDGET_EXCEEDED');
    assert.strictEqual(body['callsMade'], 2);
    assert.strictEqual(body['limit'], 2);
    assert.ok(typeof body['suggestion'] === 'string' && body['suggestion'].length > 0);
  });

  it('blocks all subsequent calls once limit is exceeded', async () => {
    const state = createDepthGuardState();
    const wrapped = wrapWithDepthGuard('tool', makeHandler(okResponse), state, 1);
    const extra = { sessionId: 'sess-block' };
    await wrapped({}, extra);
    const [r1, r2] = await Promise.all([wrapped({}, extra), wrapped({}, extra)]);
    assert.strictEqual(r1.isError, true);
    assert.strictEqual(r2.isError, true);
  });

  it('tracks sessions independently', async () => {
    const state = createDepthGuardState();
    const wrapped = wrapWithDepthGuard('tool', makeHandler(okResponse), state, 1);
    await wrapped({}, { sessionId: 'sess-A' });
    const [resultA, resultB] = await Promise.all([
      wrapped({}, { sessionId: 'sess-A' }),
      wrapped({}, { sessionId: 'sess-B' }),
    ]);
    assert.strictEqual(resultA.isError, true);
    assert.strictEqual(resultB.isError, undefined);
  });

  it('shares a single anon bucket across calls when sessionId is absent', async () => {
    const state = createDepthGuardState();
    const wrapped = wrapWithDepthGuard('tool', makeHandler(okResponse), state, 1);
    // Stdio transports (Claude Desktop, Cursor) don't pass a sessionId — all such
    // calls must share one bucket so the budget actually limits runaway tool use.
    await wrapped({}, {});
    const blocked = await wrapped({}, {});
    assert.strictEqual(blocked.isError, true);
    const body = JSON.parse(blocked.content[0].text) as Record<string, unknown>;
    assert.strictEqual(body['error'], 'TOOL_BUDGET_EXCEEDED');
  });

  it('keeps named sessions independent from the anon bucket', async () => {
    const state = createDepthGuardState();
    const wrapped = wrapWithDepthGuard('tool', makeHandler(okResponse), state, 1);
    await wrapped({}, {}); // anon bucket uses its 1 call
    const namedResult = await wrapped({}, { sessionId: 'sess-named' });
    assert.strictEqual(namedResult.isError, undefined);
  });

  it('includes a non-empty suggestion in TOOL_BUDGET_EXCEEDED', async () => {
    const state = createDepthGuardState();
    const wrapped = wrapWithDepthGuard('tool', makeHandler(okResponse), state, 0);
    const result = await wrapped({}, { sessionId: 'sess-hint' });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;
    assert.ok(typeof body['suggestion'] === 'string' && body['suggestion'].length > 10);
  });

  it('evicts the oldest session when MAX_SESSIONS (1000) is reached', async () => {
    const state = createDepthGuardState();
    const limit = 1;
    const wrapped = wrapWithDepthGuard('tool', makeHandler(okResponse), state, limit);

    // Fill up to 1000 sessions
    await Promise.all(Array.from({ length: 1000 }, (_, i) => wrapped({}, { sessionId: `fill-${i}` })));
    assert.strictEqual(state.size, 1000);

    // Adding a 1001st session should evict the oldest (fill-0).
    await wrapped({}, { sessionId: 'newcomer' });
    assert.strictEqual(state.size, 1000);
    assert.strictEqual(state.has('fill-0'), false);
    assert.strictEqual(state.has('newcomer'), true);
  });
});

// ---------------------------------------------------------------------------
// attachMeta
// ---------------------------------------------------------------------------

describe('attachMeta', () => {
  it('attaches _meta when PROVAR_MCP_EMIT_TOKEN_META=true', () => {
    withMeta(true, () => {
      const result = attachMeta(okResponse, 'my_tool', 'standard');
      const meta = (result.structuredContent as Record<string, unknown>)['_meta'] as Record<string, unknown>;
      assert.ok(meta, '_meta should be present');
      assert.strictEqual(meta['tool'], 'my_tool');
      assert.strictEqual(meta['detailLevel'], 'standard');
      assert.ok(typeof meta['estimatedTokens'] === 'number' && meta['estimatedTokens'] > 0);
    });
  });

  it('returns response unchanged when PROVAR_MCP_EMIT_TOKEN_META is not "true"', () => {
    withMeta(false, () => {
      const result = attachMeta(okResponse, 'my_tool', 'standard');
      assert.strictEqual(result, okResponse);
    });
  });

  it('returns response unchanged when env var is absent', () => {
    const prev = process.env['PROVAR_MCP_EMIT_TOKEN_META'];
    delete process.env['PROVAR_MCP_EMIT_TOKEN_META'];
    try {
      const result = attachMeta(okResponse, 'my_tool', 'standard');
      assert.strictEqual(result, okResponse);
    } finally {
      if (prev !== undefined) process.env['PROVAR_MCP_EMIT_TOKEN_META'] = prev;
    }
  });

  it('attaches _meta on error responses', () => {
    withMeta(true, () => {
      const result = attachMeta(errResponse, 'my_tool', 'full');
      const meta = (result.structuredContent as Record<string, unknown>)['_meta'] as Record<string, unknown>;
      assert.ok(meta);
      assert.strictEqual(meta['detailLevel'], 'full');
    });
  });

  it('includes sessionTotalEstimatedTokens when provided', () => {
    withMeta(true, () => {
      const result = attachMeta(okResponse, 'my_tool', 'standard', 999);
      const meta = (result.structuredContent as Record<string, unknown>)['_meta'] as Record<string, unknown>;
      assert.strictEqual(meta['sessionTotalEstimatedTokens'], 999);
    });
  });

  it('does not include sessionTotalEstimatedTokens when not provided', () => {
    withMeta(true, () => {
      const result = attachMeta(okResponse, 'my_tool', 'standard');
      const meta = (result.structuredContent as Record<string, unknown>)['_meta'] as Record<string, unknown>;
      assert.strictEqual('sessionTotalEstimatedTokens' in meta, false);
    });
  });

  it('does not modify content[0].text', () => {
    withMeta(true, () => {
      const result = attachMeta(okResponse, 'my_tool', 'standard');
      assert.strictEqual(result.content[0].text, okResponse.content[0].text);
    });
  });

  it('estimatedTokens reflects content[].text length, not the whole result', () => {
    withMeta(true, () => {
      const result = attachMeta(okResponse, 'my_tool', 'standard');
      const meta = (result.structuredContent as Record<string, unknown>)['_meta'] as Record<string, unknown>;
      const estimate = meta['estimatedTokens'] as number;
      const actual = Math.ceil(okResponse.content.map((c) => c.text).join('').length / 4);
      assert.strictEqual(estimate, actual);
    });
  });

  it('does not count structuredContent — tiny content + huge structuredContent stays tiny', () => {
    withMeta(true, () => {
      const fat: ToolResult = {
        content: [{ type: 'text', text: 'ok' }],
        structuredContent: { blob: 'x'.repeat(100_000) },
      };
      const result = attachMeta(fat, 'my_tool', 'standard');
      const meta = (result.structuredContent as Record<string, unknown>)['_meta'] as Record<string, unknown>;
      const estimate = meta['estimatedTokens'] as number;
      // content text is "ok" (2 chars) → ceil(2/4) = 1, regardless of the 100k-char structuredContent.
      assert.strictEqual(estimate, 1);
    });
  });
});

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------

describe('estimateTokens', () => {
  it('returns a positive integer', () => {
    const tokens = estimateTokens({ hello: 'world' });
    assert.ok(Number.isInteger(tokens) && tokens > 0);
  });

  it('returns ceil(len/4) of JSON string', () => {
    const obj = { a: 1 };
    const expected = Math.ceil(JSON.stringify(obj).length / 4);
    assert.strictEqual(estimateTokens(obj), expected);
  });
});

// ---------------------------------------------------------------------------
// estimateResultTokens
// ---------------------------------------------------------------------------

describe('estimateResultTokens', () => {
  it('sums content[].text lengths and ignores structuredContent', () => {
    const result: ToolResult = {
      content: [
        { type: 'text', text: 'aaaa' },
        { type: 'text', text: 'bbbb' },
      ],
      structuredContent: { ignored: 'z'.repeat(10_000) },
    };
    // 8 chars of content text → ceil(8/4) = 2.
    assert.strictEqual(estimateResultTokens(result), 2);
  });

  it('returns 0 for empty content', () => {
    const result: ToolResult = { content: [], structuredContent: { a: 1 } };
    assert.strictEqual(estimateResultTokens(result), 0);
  });

  it('does not double-count the payload the way estimateTokens(result) would', () => {
    // The payload lives in both content[0].text (escaped JSON) and structuredContent,
    // so estimateTokens over the whole result counts it twice; estimateResultTokens
    // counts the content text only.
    assert.ok(estimateResultTokens(okResponse) < estimateTokens(okResponse));
  });
});

// ---------------------------------------------------------------------------
// Integration: wrapWithDepthGuard + attachMeta
// ---------------------------------------------------------------------------

describe('integration: wrapWithDepthGuard + attachMeta', () => {
  beforeEach(() => {
    process.env['PROVAR_MCP_EMIT_TOKEN_META'] = 'true';
  });
  afterEach(() => {
    delete process.env['PROVAR_MCP_EMIT_TOKEN_META'];
  });

  it('attaches _meta on successful tool call', async () => {
    const state = createDepthGuardState();
    const wrapped = wrapWithDepthGuard('my_tool', makeHandler(okResponse), state, 50);
    const result = await wrapped({}, { sessionId: 'int-1' });
    const meta = (result.structuredContent as Record<string, unknown>)['_meta'] as Record<string, unknown>;
    assert.ok(meta);
    assert.strictEqual(meta['tool'], 'my_tool');
  });

  it('attaches _meta on TOOL_BUDGET_EXCEEDED error', async () => {
    const state = createDepthGuardState();
    const wrapped = wrapWithDepthGuard('my_tool', makeHandler(okResponse), state, 0);
    const result = await wrapped({}, { sessionId: 'int-err' });
    assert.strictEqual(result.isError, true);
    const meta = (result.structuredContent as Record<string, unknown>)['_meta'] as Record<string, unknown>;
    assert.ok(meta);
    assert.ok('sessionTotalEstimatedTokens' in meta);
  });

  it('uses detail arg from args when present', async () => {
    const state = createDepthGuardState();
    const wrapped = wrapWithDepthGuard('my_tool', makeHandler(okResponse), state, 50);
    const result = await wrapped({ detail: 'summary' }, { sessionId: 'int-detail' });
    const meta = (result.structuredContent as Record<string, unknown>)['_meta'] as Record<string, unknown>;
    assert.strictEqual(meta['detailLevel'], 'summary');
  });

  it('defaults detail_level to "standard" when detail arg is absent', async () => {
    const state = createDepthGuardState();
    const wrapped = wrapWithDepthGuard('my_tool', makeHandler(okResponse), state, 50);
    const result = await wrapped({}, { sessionId: 'int-nodetail' });
    const meta = (result.structuredContent as Record<string, unknown>)['_meta'] as Record<string, unknown>;
    assert.strictEqual(meta['detailLevel'], 'standard');
  });

  it('preserves existing structuredContent keys alongside _meta', async () => {
    const state = createDepthGuardState();
    const wrapped = wrapWithDepthGuard('my_tool', makeHandler(okResponse), state, 50);
    const result = await wrapped({}, { sessionId: 'int-preserve' });
    const sc = result.structuredContent as Record<string, unknown>;
    assert.strictEqual(sc['ok'], true);
    assert.ok(sc['_meta']);
  });

  it('does not attach _meta when env var is disabled', async () => {
    delete process.env['PROVAR_MCP_EMIT_TOKEN_META'];
    const state = createDepthGuardState();
    const wrapped = wrapWithDepthGuard('my_tool', makeHandler(okResponse), state, 50);
    const result = await wrapped({}, { sessionId: 'int-disabled' });
    const sc = result.structuredContent as Record<string, unknown>;
    assert.strictEqual('_meta' in sc, false);
  });

  it('propagates handler errors', async () => {
    const state = createDepthGuardState();
    const throwingHandler: AnyToolCallback = () => {
      throw new Error('handler blew up');
    };
    const wrapped = wrapWithDepthGuard('my_tool', throwingHandler, state, 50);
    await assert.rejects(async () => wrapped({}, { sessionId: 'int-throw' }), /handler blew up/);
  });
});
