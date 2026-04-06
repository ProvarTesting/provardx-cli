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
import { registerTestCaseGenerate } from '../../../src/mcp/tools/testCaseGenerate.js';
import type { ServerConfig } from '../../../src/mcp/server.js';

// ── Minimal McpServer mock ─────────────────────────────────────────────────────
// Note: bypasses Zod parsing — always pass explicit values for fields with defaults
// (steps, dry_run, overwrite).

type ToolHandler = (args: Record<string, unknown>) => unknown;

class MockMcpServer {
  private handlers = new Map<string, ToolHandler>();

  public tool(name: string, _description: string, _schema: unknown, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  public call(name: string, args: Record<string, unknown>): ReturnType<ToolHandler> {
    const h = this.handlers.get(name);
    if (!h) throw new Error(`Tool not registered: ${name}`);
    return h(args);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseText(result: unknown): Record<string, unknown> {
  const r = result as { content: Array<{ type: string; text: string }> };
  return JSON.parse(r.content[0].text) as Record<string, unknown>;
}

function isError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true;
}

// UUID v4 pattern
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ── Test setup ─────────────────────────────────────────────────────────────────

let tmpDir: string;
let server: MockMcpServer;
let config: ServerConfig;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcgen-test-'));
  server = new MockMcpServer();
  config = { allowedPaths: [tmpDir] };
  registerTestCaseGenerate(server as never, config);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── provar.testcase.generate ───────────────────────────────────────────────────

describe('provar.testcase.generate', () => {
  describe('dry_run', () => {
    it('returns xml_content without writing to disk', () => {
      const result = server.call('provar.testcase.generate', {
        test_case_name: 'Login Test',
        steps: [],
        dry_run: true,
        overwrite: false,
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.ok(typeof body['xml_content'] === 'string' && body['xml_content'].length > 0);
      assert.equal(body['written'], false);
      assert.equal(body['dry_run'], true);
    });

    it('does NOT write a file even when output_path is provided', () => {
      const outPath = path.join(tmpDir, 'LoginTest.testcase');
      server.call('provar.testcase.generate', {
        test_case_name: 'Login Test',
        steps: [],
        output_path: outPath,
        dry_run: true,
        overwrite: false,
      });

      assert.equal(fs.existsSync(outPath), false, 'file must not be written in dry_run mode');
    });
  });

  describe('generated XML content', () => {
    it('contains <testCase> root element with name attribute', () => {
      const result = server.call('provar.testcase.generate', {
        test_case_name: 'Create Account',
        steps: [],
        dry_run: true,
        overwrite: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('<testCase'), 'Expected <testCase element');
      assert.ok(xml.includes('name="Create Account"'), 'Expected name attribute');
    });

    it('contains <steps> element', () => {
      const result = server.call('provar.testcase.generate', {
        test_case_name: 'My Test',
        steps: [],
        dry_run: true,
        overwrite: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('<steps>') && xml.includes('</steps>'), 'Expected <steps> block');
    });

    it('generates UUID v4 guids for testCase guid attribute', () => {
      const result = server.call('provar.testcase.generate', {
        test_case_name: 'UUID Test',
        steps: [],
        dry_run: true,
        overwrite: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      const guidMatch = /guid="([^"]+)"/.exec(xml);
      assert.ok(guidMatch, 'Expected guid attribute');
      assert.ok(UUID_RE.test(guidMatch[1]), `Expected UUID v4, got: ${guidMatch[1]}`);
    });

    it('uses explicit test_case_id when provided', () => {
      const myId = 'my-explicit-id-123';
      const result = server.call('provar.testcase.generate', {
        test_case_name: 'Explicit ID Test',
        test_case_id: myId,
        steps: [],
        dry_run: true,
        overwrite: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes(`id="${myId}"`), 'Expected explicit id in XML');
    });

    it('includes steps with correct apiId and sequential testItemId', () => {
      const result = server.call('provar.testcase.generate', {
        test_case_name: 'Multi Step',
        steps: [
          { api_id: 'UiConnect',  name: 'Connect',  attributes: {} },
          { api_id: 'UiNavigate', name: 'Navigate', attributes: {} },
          { api_id: 'UiDoAction', name: 'Click',    attributes: {} },
        ],
        dry_run: true,
        overwrite: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('apiId="com.provar.plugins.forcedotcom.core.ui.UiConnect"'));
      assert.ok(xml.includes('apiId="com.provar.plugins.forcedotcom.core.ui.UiNavigate"'));
      assert.ok(xml.includes('apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction"'));
      assert.ok(xml.includes('testItemId="1"'), 'Expected first step testItemId=1');
      assert.ok(xml.includes('testItemId="2"'), 'Expected second step testItemId=2');
      assert.ok(xml.includes('testItemId="3"'), 'Expected third step testItemId=3');
    });

    it('reports step_count matching the number of steps', () => {
      const result = server.call('provar.testcase.generate', {
        test_case_name: 'Count Test',
        steps: [
          { api_id: 'UiConnect',  name: 'Step 1', attributes: {} },
          { api_id: 'UiNavigate', name: 'Step 2', attributes: {} },
        ],
        dry_run: true,
        overwrite: false,
      });

      assert.equal(parseText(result)['step_count'], 2);
    });

    it('includes validation field with is_valid and scores', () => {
      const result = server.call('provar.testcase.generate', {
        test_case_name: 'Validated Test',
        steps: [{ api_id: 'UiConnect', name: 'Connect', attributes: {} }],
        dry_run: true,
        overwrite: false,
      });

      const body = parseText(result);
      const validation = body['validation'] as Record<string, unknown>;
      assert.ok(validation, 'Expected validation field in response');
      assert.equal(typeof validation['is_valid'], 'boolean');
      assert.equal(typeof validation['validity_score'], 'number');
      assert.equal(typeof validation['quality_score'], 'number');
      assert.equal(validation['is_valid'], true, 'Well-formed generated XML should be valid');
      assert.ok(!('best_practices_violations' in validation), 'best_practices_violations should be omitted from slim response');
    });

    it('emits a TODO comment when no steps are provided', () => {
      const result = server.call('provar.testcase.generate', {
        test_case_name: 'No Steps',
        steps: [],
        dry_run: true,
        overwrite: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('TODO'), 'Expected TODO placeholder for empty steps');
    });

    it('escapes XML special characters in test_case_name', () => {
      const result = server.call('provar.testcase.generate', {
        test_case_name: 'Test & "Escape" <this>',
        steps: [],
        dry_run: true,
        overwrite: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('&amp;'), 'Expected & escaped to &amp;');
      assert.ok(xml.includes('&quot;'), 'Expected " escaped to &quot;');
      assert.ok(xml.includes('&lt;'), 'Expected < escaped to &lt;');
      assert.ok(xml.includes('&gt;'), 'Expected > escaped to &gt;');
    });

    it('escapes XML special characters in step api_id and name', () => {
      const result = server.call('provar.testcase.generate', {
        test_case_name: 'Escape Step Test',
        steps: [{ api_id: 'Api<Id>', name: 'Step & "Name"', attributes: {} }],
        dry_run: true,
        overwrite: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('&lt;') && xml.includes('&gt;'), 'Expected < > escaped in apiId');
      assert.ok(xml.includes('&amp;'), 'Expected & escaped in step name');
    });
  });

  describe('writing to disk', () => {
    it('writes file when dry_run=false and output_path provided', () => {
      const outPath = path.join(tmpDir, 'Login.testcase');
      const result = server.call('provar.testcase.generate', {
        test_case_name: 'Login',
        steps: [],
        output_path: outPath,
        dry_run: false,
        overwrite: false,
      });

      assert.equal(isError(result), false);
      assert.equal(fs.existsSync(outPath), true, 'file should be written');
      assert.equal(parseText(result)['written'], true);
    });

    it('does NOT write when dry_run=false but no output_path', () => {
      const result = server.call('provar.testcase.generate', {
        test_case_name: 'No Path Test',
        steps: [],
        dry_run: false,
        overwrite: false,
      });

      assert.equal(isError(result), false);
      assert.equal(parseText(result)['written'], false);
    });

    it('returns FILE_EXISTS when file exists and overwrite=false', () => {
      const outPath = path.join(tmpDir, 'Existing.testcase');
      fs.writeFileSync(outPath, '<old/>', 'utf-8');

      const result = server.call('provar.testcase.generate', {
        test_case_name: 'Existing',
        steps: [],
        output_path: outPath,
        dry_run: false,
        overwrite: false,
      });

      assert.equal(isError(result), true);
      assert.equal(parseText(result)['error_code'], 'FILE_EXISTS');
    });

    it('overwrites when overwrite=true and file exists', () => {
      const outPath = path.join(tmpDir, 'Existing.testcase');
      fs.writeFileSync(outPath, '<old/>', 'utf-8');

      const result = server.call('provar.testcase.generate', {
        test_case_name: 'Existing',
        steps: [],
        output_path: outPath,
        dry_run: false,
        overwrite: true,
      });

      assert.equal(isError(result), false);
      const written = fs.readFileSync(outPath, 'utf-8');
      assert.ok(written.includes('<testCase'), 'old content should be replaced');
    });

    it('creates parent directories as needed', () => {
      const outPath = path.join(tmpDir, 'tests', 'suite', 'Login.testcase');
      server.call('provar.testcase.generate', {
        test_case_name: 'Login',
        steps: [],
        output_path: outPath,
        dry_run: false,
        overwrite: false,
      });

      assert.equal(fs.existsSync(outPath), true, 'nested directories should be created');
    });
  });

  describe('path policy', () => {
    it('returns PATH_NOT_ALLOWED when output_path is outside allowedPaths', () => {
      const strictServer = new MockMcpServer();
      registerTestCaseGenerate(strictServer as never, { allowedPaths: [tmpDir] });

      const result = strictServer.call('provar.testcase.generate', {
        test_case_name: 'Evil',
        steps: [],
        output_path: path.join(os.tmpdir(), 'evil.testcase'),
        dry_run: false,
        overwrite: false,
      });

      assert.equal(isError(result), true);
      const code = parseText(result)['error_code'] as string;
      assert.ok(code === 'PATH_NOT_ALLOWED' || code === 'PATH_TRAVERSAL', `Unexpected: ${code}`);
    });

    it('does NOT check path policy in dry_run=true mode', () => {
      const strictServer = new MockMcpServer();
      registerTestCaseGenerate(strictServer as never, { allowedPaths: [tmpDir] });

      const result = strictServer.call('provar.testcase.generate', {
        test_case_name: 'Safe',
        steps: [],
        output_path: '/etc/evil.testcase',
        dry_run: true,
        overwrite: false,
      });

      assert.equal(isError(result), false, 'dry_run should not trigger path check');
    });
  });

  describe('idempotency_key', () => {
    it('echoes back the provided idempotency_key', () => {
      const result = server.call('provar.testcase.generate', {
        test_case_name: 'Idempotent',
        steps: [],
        idempotency_key: 'dedup-key-abc',
        dry_run: true,
        overwrite: false,
      });

      assert.equal(parseText(result)['idempotency_key'], 'dedup-key-abc');
    });
  });
});
