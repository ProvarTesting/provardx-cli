/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { randomUUID } from 'node:crypto';

// --------------------------------------------------------------------------- //
// Minimal structural types — avoids importing SDK internal paths.
// --------------------------------------------------------------------------- //

type ContentItem = { type: 'text'; text: string };

export interface ToolResult {
  content: ContentItem[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface ToolExtra {
  sessionId?: string;
}

export type AnyToolCallback = (args: Record<string, unknown>, extra: ToolExtra) => ToolResult | Promise<ToolResult>;

// --------------------------------------------------------------------------- //
// PDX-474 — Depth Guard (PROVAR_MCP_MAX_TOOL_DEPTH)
// --------------------------------------------------------------------------- //

interface SessionEntry {
  calls: number;
  totalEstimatedTokens: number;
}

export type DepthGuardState = Map<string, SessionEntry>;

const MAX_SESSIONS = 1000;

export function createDepthGuardState(): DepthGuardState {
  return new Map();
}

function getOrCreateEntry(state: DepthGuardState, sessionId: string): SessionEntry {
  if (!state.has(sessionId)) {
    if (state.size >= MAX_SESSIONS) {
      const oldest: string | undefined = state.keys().next().value as string | undefined;
      if (oldest !== undefined) state.delete(oldest);
    }
    state.set(sessionId, { calls: 0, totalEstimatedTokens: 0 });
  }
  // Non-null guaranteed by the set above or pre-existing entry.
  return state.get(sessionId) as SessionEntry;
}

/**
 * Wraps a tool handler to enforce a per-session call budget.
 * Once `limit` calls have been made for a session, every further call returns
 * TOOL_BUDGET_EXCEEDED without invoking the underlying handler.
 * `provardx_ping` is excluded from wrapping at the call site in server.ts.
 */
export function wrapWithDepthGuard(
  toolName: string,
  handler: AnyToolCallback,
  state: DepthGuardState,
  limit: number
): AnyToolCallback {
  return async (args, extra) => {
    const sessionId = extra.sessionId ?? `anon-${randomUUID()}`;
    const entry = getOrCreateEntry(state, sessionId);

    if (entry.calls >= limit) {
      const payload = {
        error: 'TOOL_BUDGET_EXCEEDED',
        callsMade: entry.calls,
        limit,
        suggestion: 'Summarize progress and return control to the user.',
      };
      const response: ToolResult = {
        isError: true,
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
      return attachMeta(response, toolName, 'standard', entry.totalEstimatedTokens);
    }

    entry.calls++;
    const result = await handler(args, extra);

    if (process.env['PROVAR_MCP_EMIT_TOKEN_META'] === 'true') {
      entry.totalEstimatedTokens += estimateTokens(result);
    }

    const detailLevel = typeof args['detail'] === 'string' ? args['detail'] : 'standard';
    return attachMeta(result, toolName, detailLevel);
  };
}

// --------------------------------------------------------------------------- //
// PDX-475 — Token meta attachment (PROVAR_MCP_EMIT_TOKEN_META)
// --------------------------------------------------------------------------- //

export function estimateTokens(payload: unknown): number {
  return Math.ceil(JSON.stringify(payload).length / 4);
}

/**
 * Appends a `_meta` key to `structuredContent` when PROVAR_MCP_EMIT_TOKEN_META=true.
 * The `content[0].text` string is intentionally left unchanged — LLMs read that
 * field, so including meta there would waste tokens on observability data.
 *
 * @param sessionTotalTokens - Cumulative estimated tokens for the session,
 * included only on TOOL_BUDGET_EXCEEDED errors.
 */
export function attachMeta(
  response: ToolResult,
  toolName: string,
  detailLevel: string,
  sessionTotalTokens?: number
): ToolResult {
  if (process.env['PROVAR_MCP_EMIT_TOKEN_META'] !== 'true') return response;

  const meta: Record<string, unknown> = {
    tool: toolName,
    detailLevel,
    estimatedTokens: estimateTokens(response),
  };

  if (sessionTotalTokens !== undefined) {
    meta['sessionTotalEstimatedTokens'] = sessionTotalTokens;
  }

  const existing = response.structuredContent ?? {};
  return {
    ...response,
    structuredContent: { ...existing, _meta: meta },
  };
}
