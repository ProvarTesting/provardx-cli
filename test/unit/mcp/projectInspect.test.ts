/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerProjectInspect } from '../../../src/mcp/tools/projectInspect.js';
import type { ServerConfig } from '../../../src/mcp/server.js';

// ── Minimal McpServer mock ────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => unknown;

class MockMcpServer {
  private handlers = new Map<string, ToolHandler>();

  public registerTool(name: string, _config: unknown, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  public call(name: string, args: Record<string, unknown>): ReturnType<ToolHandler> {
    const h = this.handlers.get(name);
    if (!h) throw new Error(`Tool not registered: ${name}`);
    return h(args);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseText(result: unknown): Record<string, unknown> {
  const r = result as { content: Array<{ type: string; text: string }> };
  return JSON.parse(r.content[0].text) as Record<string, unknown>;
}

function isError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true;
}

// ── Test setup ────────────────────────────────────────────────────────────────

let tmpDir: string;
let server: MockMcpServer;
let config: ServerConfig;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inspect-test-'));
  server = new MockMcpServer();
  config = { allowedPaths: [tmpDir] };
  registerProjectInspect(server as unknown as McpServer, config);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── provar_project_inspect — detail param ─────────────────────────────────────

describe('provar_project_inspect — detail param', () => {
  it('standard (default) returns all top-level fields including test_case_files', () => {
    const result = server.call('provar_project_inspect', { project_path: tmpDir });
    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.ok('test_case_files' in body, 'standard should include test_case_files');
    assert.ok('summary' in body, 'standard should include summary');
    assert.ok('requestId' in body, 'standard should include requestId');
  });

  it('summary retains only requestId, project_path, provar_home, and summary', () => {
    const result = server.call('provar_project_inspect', { project_path: tmpDir, detail: 'summary' });
    assert.equal(isError(result), false);
    const body = parseText(result);
    const keys = Object.keys(body);
    assert.ok(keys.includes('requestId'), 'summary must include requestId');
    assert.ok(keys.includes('project_path'), 'summary must include project_path');
    assert.ok(keys.includes('summary'), 'summary must include summary');
    assert.ok(!keys.includes('test_case_files'), 'summary must not include test_case_files');
    assert.ok(!keys.includes('ant_build_files'), 'summary must not include ant_build_files');
    assert.ok(!keys.includes('test_project'), 'summary must not include test_project');
  });

  it('full returns all fields (same as standard for this tool)', () => {
    const resultFull = server.call('provar_project_inspect', { project_path: tmpDir, detail: 'full' });
    const resultStd = server.call('provar_project_inspect', { project_path: tmpDir, detail: 'standard' });
    const full = parseText(resultFull);
    const std = parseText(resultStd);
    // Both should have the same keys (requestId will differ — compare key sets only)
    assert.deepEqual(Object.keys(full).sort(), Object.keys(std).sort());
  });

  it('omitting detail defaults to standard behaviour', () => {
    const withDefault = server.call('provar_project_inspect', { project_path: tmpDir });
    const withStandard = server.call('provar_project_inspect', { project_path: tmpDir, detail: 'standard' });
    const a = Object.keys(parseText(withDefault)).sort();
    const b = Object.keys(parseText(withStandard)).sort();
    assert.deepEqual(a, b, 'omitting detail should match explicit standard');
  });
});

// ── provar_project_inspect — fields param ─────────────────────────────────────

describe('provar_project_inspect — fields param', () => {
  it('retains only specified top-level keys', () => {
    const result = server.call('provar_project_inspect', {
      project_path: tmpDir,
      fields: 'test_case_files,summary',
    });
    const body = parseText(result);
    assert.ok('test_case_files' in body);
    assert.ok('summary' in body);
    assert.ok(!('requestId' in body), 'requestId should be masked out');
    assert.ok(!('test_project' in body), 'test_project should be masked out');
  });

  it('omitting fields returns full response', () => {
    const result = server.call('provar_project_inspect', { project_path: tmpDir });
    const body = parseText(result);
    assert.ok('requestId' in body);
    assert.ok('summary' in body);
  });

  it('silently ignores unknown field names', () => {
    const result = server.call('provar_project_inspect', {
      project_path: tmpDir,
      fields: 'summary,ghost_field',
    });
    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.ok('summary' in body);
    assert.ok(!('ghost_field' in body));
  });

  it('supports dot notation for nested field selection', () => {
    const result = server.call('provar_project_inspect', {
      project_path: tmpDir,
      fields: 'summary.test_case_count,summary.coverage_percent',
    });
    assert.equal(isError(result), false);
    const body = parseText(result);
    const summary = body['summary'] as Record<string, unknown>;
    assert.ok('test_case_count' in summary, 'test_case_count should be retained');
    assert.ok('coverage_percent' in summary, 'coverage_percent should be retained');
    assert.ok(!('provardx_properties_count' in summary), 'unspecified summary keys should be dropped');
  });

  it('composes detail=summary with fields for fine-grained trimming', () => {
    const result = server.call('provar_project_inspect', {
      project_path: tmpDir,
      detail: 'summary',
      fields: 'summary',
    });
    const body = parseText(result);
    assert.ok('summary' in body);
    assert.ok(!('requestId' in body), 'fields filter should further narrow after detail');
  });
});

// ── provar_project_inspect — path-policy errors (unchanged) ───────────────────

describe('provar_project_inspect — path policy', () => {
  it('returns PATH_NOT_ALLOWED when project_path is outside allowed paths', () => {
    const strictServer = new MockMcpServer();
    registerProjectInspect(strictServer as unknown as McpServer, { allowedPaths: [tmpDir] });
    const result = strictServer.call('provar_project_inspect', {
      project_path: path.join(os.tmpdir(), 'some-other-project'),
    });
    assert.equal(isError(result), true);
    const code = parseText(result)['error_code'] as string;
    assert.ok(code === 'PATH_NOT_ALLOWED' || code === 'PATH_TRAVERSAL', `Unexpected code: ${code}`);
  });

  it('returns PATH_NOT_FOUND when project path does not exist', () => {
    const result = server.call('provar_project_inspect', {
      project_path: path.join(tmpDir, 'nonexistent-dir'),
    });
    assert.equal(isError(result), true);
    assert.equal(parseText(result)['error_code'], 'PATH_NOT_FOUND');
  });
});
