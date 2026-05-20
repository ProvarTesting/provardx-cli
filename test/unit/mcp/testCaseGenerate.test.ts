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
import { registerTestCaseGenerate, inferSalesforceValueClass } from '../../../src/mcp/tools/testCaseGenerate.js';
import type { ServerConfig } from '../../../src/mcp/server.js';

// ── Minimal McpServer mock ─────────────────────────────────────────────────────
// Note: bypasses Zod parsing — always pass explicit values for fields with defaults
// (steps, dry_run, overwrite).

type ToolHandler = (args: Record<string, unknown>) => unknown;

class MockMcpServer {
  // PDX-484: capture `title` alongside `description` so tests can assert on the
  // title-level contract. Many MCP clients render only the title field.
  public registrations: Array<{ name: string; description: string; title: string }> = [];
  private handlers = new Map<string, ToolHandler>();

  public tool(name: string, _description: string, _schema: unknown, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  public registerTool(name: string, config: unknown, handler: ToolHandler): void {
    this.handlers.set(name, handler);
    const cfg = config as Record<string, unknown>;
    const desc = cfg['description'];
    const title = cfg['title'];
    if (typeof desc === 'string') {
      this.registrations.push({
        name,
        description: desc,
        title: typeof title === 'string' ? title : '',
      });
    }
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

// ── tool description ──────────────────────────────────────────────────────────

describe('provar_testcase_generate description', () => {
  it('references corpus tool and step-reference fallback', () => {
    const reg = server.registrations.find((r) => r.name === 'provar_testcase_generate');
    assert.ok(reg, 'tool should be registered');
    assert.ok(
      reg.description.includes('provar_qualityhub_examples_retrieve'),
      'description should reference corpus tool'
    );
    assert.ok(
      reg.description.includes('provar://docs/step-reference'),
      'description should include step-reference fallback'
    );
  });

  // ── PDX-482 regression guard: construction contract at the call site ──────
  // The PDX-479 regression came from upstream guidance steering agents toward
  // multi-call construction. These assertions protect the in-tool contract so
  // even if upstream prompts/resources regress again, the LLM reads the
  // single-call requirement at every call site.

  it('TOOL_DESCRIPTION carries the single-call construction contract', () => {
    const reg = server.registrations.find((r) => r.name === 'provar_testcase_generate');
    assert.ok(reg, 'tool should be registered');
    assert.ok(
      reg.description.includes('Construction pattern'),
      'description must lead with the construction-pattern contract for PDX-479 protection'
    );
    assert.ok(
      reg.description.includes('single call'),
      'description must say "single call" so the contract is greppable from the call site'
    );
    assert.ok(reg.description.includes('FULL step tree'), 'description must instruct passing the FULL step tree');
  });

  it('TOOL_DESCRIPTION marks step_edit as AMENDING, not constructing', () => {
    const reg = server.registrations.find((r) => r.name === 'provar_testcase_generate');
    assert.ok(reg, 'tool should be registered');
    assert.ok(
      reg.description.includes('AMENDING'),
      'description must explicitly say provar_testcase_step_edit is for AMENDING (caps for emphasis at the call site)'
    );
    // Use a literal substring match (not a regex) — the previous regex
    // /step_edit[^.]*not for CONSTRUCTING|CONSTRUCTING[^.]*not/i had a
    // false-positive: the second alternative would pass on hostile text like
    // "constructing is the only way... not via generate". Locking on the
    // exact canonical phrasing prevents that drift.
    assert.ok(
      reg.description.includes('not for CONSTRUCTING one from scratch'),
      'description must explicitly say step_edit is "not for CONSTRUCTING one from scratch" (literal canonical phrase)'
    );
  });

  it('TOOL_DESCRIPTION gives stop-and-assemble guidance for the common mistake', () => {
    const reg = server.registrations.find((r) => r.name === 'provar_testcase_generate');
    assert.ok(reg, 'tool should be registered');
    assert.ok(
      reg.description.includes('stop and assemble') || reg.description.includes('stop, and assemble'),
      'description must tell agents to stop and assemble the full step list before calling — the most common mistake'
    );
  });

  // ── PDX-482 hardening: leading-position assertion (adversarial review fix) ──
  // The contract must appear EARLY in the description because LLMs weight
  // earlier tokens more heavily and many MCP clients truncate descriptions.
  // Without this guard, a future refactor could move the contract to the end
  // of the joined array and every other assertion would still pass.
  it('Construction contract appears in the first 200 characters of the description', () => {
    const reg = server.registrations.find((r) => r.name === 'provar_testcase_generate');
    assert.ok(reg, 'tool should be registered');
    const pos = reg.description.indexOf('Construction pattern');
    assert.ok(pos >= 0, 'description must contain "Construction pattern"');
    assert.ok(
      pos < 200,
      `"Construction pattern" must appear in the first 200 chars (found at ${pos}) — LLMs weight leading tokens more`
    );
  });

  // ── PDX-484: title-level construct-vs-amend contract ──────────────────────
  // Many MCP clients (Claude Desktop tool-picker chips, Cursor audit pane,
  // inline tool-call references in chat threads) render only the `title`
  // field. Without the contract in the title an agent that reads only that
  // surface gets zero PDX-479 protection. These assertions lock the title to
  // the canonical phrasing chosen during the PDX-484 cross-client pilot.

  it('title carries the single-call construction contract (PDX-484)', () => {
    const reg = server.registrations.find((r) => r.name === 'provar_testcase_generate');
    assert.ok(reg, 'tool should be registered');
    assert.ok(
      reg.title.includes('one call') || reg.title.includes('single call'),
      'title must contain "one call" or "single call" so the contract is visible in tool-picker chips'
    );
    assert.ok(
      /step/i.test(reg.title),
      'title must mention steps so the LLM sees the payload shape at the chip-level surface'
    );
  });

  it('title fits the cross-client chip-render comfort threshold (≤50 chars, PDX-484)', () => {
    const reg = server.registrations.find((r) => r.name === 'provar_testcase_generate');
    assert.ok(reg, 'tool should be registered');
    assert.ok(
      reg.title.length <= 50,
      `title length ${reg.title.length} exceeds 50 chars — Cursor and other clients may truncate`
    );
  });

  // ── PDX-482 hardening: compact-mode coverage (adversarial review fix) ──────
  // PROVAR_MCP_SCHEMA_MODE=compact swaps the entire description for a short
  // one-liner. Without this guard, compact mode is a regression highway:
  // the LLM would see a contract-free description and could fall back to the
  // multi-call pattern that caused PDX-479.
  describe('compact-mode (PROVAR_MCP_SCHEMA_MODE=compact)', () => {
    const ORIGINAL_MODE = process.env['PROVAR_MCP_SCHEMA_MODE'];
    let compactServer: MockMcpServer;

    beforeEach(() => {
      process.env['PROVAR_MCP_SCHEMA_MODE'] = 'compact';
      compactServer = new MockMcpServer();
      registerTestCaseGenerate(compactServer as never, { allowedPaths: [tmpDir] });
    });

    afterEach(() => {
      if (ORIGINAL_MODE === undefined) {
        delete process.env['PROVAR_MCP_SCHEMA_MODE'];
      } else {
        process.env['PROVAR_MCP_SCHEMA_MODE'] = ORIGINAL_MODE;
      }
    });

    it('compact description still carries the single-call construction contract', () => {
      const reg = compactServer.registrations.find((r) => r.name === 'provar_testcase_generate');
      assert.ok(reg, 'tool should be registered in compact mode');
      assert.ok(
        reg.description.includes('ONE call'),
        'compact description must say "ONE call" — otherwise compact mode silently strips the contract (PDX-479 regression highway)'
      );
      assert.ok(reg.description.includes('FULL steps'), 'compact description must mention the FULL steps[] tree');
      assert.ok(
        reg.description.includes('AMENDING') || reg.description.includes('amend'),
        'compact description must mark step_edit as amendment-only'
      );
      assert.ok(
        !reg.description.includes('UUID guids and steps structure'),
        'old compact form (contract-free) must not be in use anymore'
      );
    });
  });
});

// ── provar_testcase_generate ───────────────────────────────────────────────────

describe('provar_testcase_generate', () => {
  describe('dry_run', () => {
    it('returns xml_content without writing to disk', () => {
      const result = server.call('provar_testcase_generate', {
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
      server.call('provar_testcase_generate', {
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
    it('generates correct <testCase> element structure per Provar requirements', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Create Account',
        steps: [],
        dry_run: true,
        overwrite: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('standalone="no"'), 'Expected standalone="no" in XML declaration');
      assert.ok(xml.includes('<testCase'), 'Expected <testCase element');
      assert.ok(xml.includes('id="1"'), 'Expected id="1" (Provar integer literal)');
      assert.ok(!xml.includes('name="Create Account"'), 'testCase must NOT have a name attribute');
      assert.ok(xml.includes('<summary/>'), 'Expected <summary/> as first child of testCase');
    });

    it('contains <steps> element', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'My Test',
        steps: [],
        dry_run: true,
        overwrite: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('<steps>') && xml.includes('</steps>'), 'Expected <steps> block');
    });

    it('generates UUID v4 guids for testCase guid attribute', () => {
      const result = server.call('provar_testcase_generate', {
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

    it('always emits id="1" regardless of test_case_name (Provar integer literal requirement)', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Explicit ID Test',
        steps: [],
        dry_run: true,
        overwrite: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('id="1"'), 'Expected id="1" literal in testCase element');
      // Ensure the testCase id attr specifically is "1", not a UUID.
      // Use word-boundary regex to avoid matching registryId="<uuid>" or guid="<uuid>".
      assert.ok(!xml.match(/\btestCase\b[^>]*?\bid="[0-9a-f]{8}-/), 'testCase id must not be a UUID');
    });

    it('includes steps with correct apiId and sequential testItemId', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Multi Step',
        steps: [
          { api_id: 'UiConnect', name: 'Connect', attributes: {} },
          { api_id: 'UiNavigate', name: 'Navigate', attributes: {} },
          { api_id: 'UiDoAction', name: 'Click', attributes: {} },
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
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Count Test',
        steps: [
          { api_id: 'UiConnect', name: 'Step 1', attributes: {} },
          { api_id: 'UiNavigate', name: 'Step 2', attributes: {} },
        ],
        dry_run: true,
        overwrite: false,
      });

      assert.equal(parseText(result)['step_count'], 2);
    });

    it('includes validation field with is_valid and scores', () => {
      const result = server.call('provar_testcase_generate', {
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
      assert.ok(
        !('best_practices_violations' in validation),
        'best_practices_violations should be omitted from slim response'
      );
    });

    it('emits a TODO comment when no steps are provided', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'No Steps',
        steps: [],
        dry_run: true,
        overwrite: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('TODO'), 'Expected TODO placeholder for empty steps');
    });

    it('does not embed test_case_name in XML (name attr removed per Provar spec)', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Test & "Escape" <this>',
        steps: [],
        dry_run: true,
        overwrite: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      // Provar derives test name from the file name — the name attr is not written to testCase
      assert.ok(!xml.includes('name="Test'), 'testCase must NOT have a name attribute');
      assert.ok(!xml.includes('Test &amp;'), 'escaped name must not appear in XML');
    });

    it('escapes XML special characters in step api_id and name', () => {
      const result = server.call('provar_testcase_generate', {
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
    // Each disk-write test uses a non-empty steps[] so the PDX-483 STEPS_REQUIRED
    // guard (which rejects steps:[]+dry_run:false+output_path) does not fire.
    // These tests assert *other* behaviour: file write, overwrite, mkdirp, path policy.
    const SMOKE_STEPS = [{ api_id: 'UiConnect', name: 'Connect', attributes: {} }];

    it('writes file when dry_run=false and output_path provided', () => {
      const outPath = path.join(tmpDir, 'Login.testcase');
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Login',
        steps: SMOKE_STEPS,
        output_path: outPath,
        dry_run: false,
        overwrite: false,
      });

      assert.equal(isError(result), false);
      assert.equal(fs.existsSync(outPath), true, 'file should be written');
      assert.equal(parseText(result)['written'], true);
    });

    it('does NOT write when dry_run=false but no output_path', () => {
      const result = server.call('provar_testcase_generate', {
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

      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Existing',
        steps: SMOKE_STEPS,
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

      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Existing',
        steps: SMOKE_STEPS,
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
      server.call('provar_testcase_generate', {
        test_case_name: 'Login',
        steps: SMOKE_STEPS,
        output_path: outPath,
        dry_run: false,
        overwrite: false,
      });

      assert.equal(fs.existsSync(outPath), true, 'nested directories should be created');
    });
  });

  // ── PDX-483 runtime guard: reject empty steps[] on non-dry-run with output_path ──
  // The PDX-479 regression class arose from agents calling generate with steps:[]
  // intending to append later via step_edit. The passive contract (PDX-482) lives in
  // the description; the active runtime guard rejects the exact shape that produces
  // a contract-violating file on disk. The 6 edge cases below pin down which empty-
  // steps shapes are allowed (dry-run preview, inspection-only) vs rejected (file write).
  describe('STEPS_REQUIRED runtime guard (PDX-483)', () => {
    const SINGLE_STEP = [{ api_id: 'UiConnect', name: 'Connect', attributes: {} }];

    it('allows steps:[] + dry_run:true + no output_path (skeleton inspection)', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Skeleton Inspect',
        steps: [],
        dry_run: true,
        overwrite: false,
      });
      assert.equal(isError(result), false, 'dry-run skeleton inspection must remain allowed');
      assert.equal(parseText(result)['written'], false);
    });

    it('allows steps:[] + dry_run:true + output_path provided (dry-run preview wins)', () => {
      const outPath = path.join(tmpDir, 'DryRunWithPath.testcase');
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'DryRun With Path',
        steps: [],
        output_path: outPath,
        dry_run: true,
        overwrite: false,
      });
      assert.equal(isError(result), false, 'dry-run wins over output_path — no file is written');
      assert.equal(fs.existsSync(outPath), false, 'file must not be written in dry_run mode');
    });

    it('allows steps:[] + dry_run:false + no output_path (no persistence target)', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'No Output Path',
        steps: [],
        dry_run: false,
        overwrite: false,
      });
      assert.equal(isError(result), false, 'no output_path means no file write — TODO-only XML is harmless');
      assert.equal(parseText(result)['written'], false);
    });

    it('REJECTS steps:[] + dry_run:false + output_path with STEPS_REQUIRED', () => {
      const outPath = path.join(tmpDir, 'Empty.testcase');
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Empty Build',
        steps: [],
        output_path: outPath,
        dry_run: false,
        overwrite: false,
      });
      assert.equal(isError(result), true, 'multi-call construction pattern must be rejected');
      const body = parseText(result);
      assert.equal(body['error_code'], 'STEPS_REQUIRED');
      assert.equal(body['retryable'], false);
      const details = body['details'] as Record<string, unknown>;
      assert.ok(details, 'error must include details');
      const suggestion = details['suggestion'];
      assert.ok(typeof suggestion === 'string', 'details.suggestion must be a string');
      assert.ok(suggestion.length > 0, 'details.suggestion must be non-empty');
      assert.ok(
        suggestion.includes('FULL step tree'),
        'suggestion must instruct passing the FULL step tree in a single call'
      );
      assert.ok(
        suggestion.includes('dry_run=true'),
        'suggestion must mention the dry_run=true escape hatch for skeleton inspection'
      );
    });

    it('STEPS_REQUIRED rejection writes NO file (assertion: fs.existsSync === false)', () => {
      const outPath = path.join(tmpDir, 'NeverWritten.testcase');
      server.call('provar_testcase_generate', {
        test_case_name: 'Never Written',
        steps: [],
        output_path: outPath,
        dry_run: false,
        overwrite: false,
      });
      assert.equal(
        fs.existsSync(outPath),
        false,
        'STEPS_REQUIRED rejection must run BEFORE fs.writeFileSync — no skeleton on disk'
      );
    });

    it('allows non-empty steps + dry_run:false + output_path (happy path — normal write)', () => {
      const outPath = path.join(tmpDir, 'HappyPath.testcase');
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Happy Path',
        steps: SINGLE_STEP,
        output_path: outPath,
        dry_run: false,
        overwrite: false,
      });
      assert.equal(isError(result), false, 'normal write path must remain unchanged');
      assert.equal(parseText(result)['written'], true);
      assert.equal(fs.existsSync(outPath), true, 'happy-path file must be written');
    });

    // Path-policy ordering check: the guard must fire BEFORE assertPathAllowed
    // so that a caller in the rejected shape gets STEPS_REQUIRED (the actionable
    // root-cause error), not PATH_NOT_ALLOWED (which would mislead about the fix).
    it('STEPS_REQUIRED fires BEFORE path policy when both would reject', () => {
      const strictServer = new MockMcpServer();
      registerTestCaseGenerate(strictServer as never, { allowedPaths: [tmpDir] });
      const result = strictServer.call('provar_testcase_generate', {
        test_case_name: 'Outside And Empty',
        steps: [],
        // Path outside allowedPaths AND empty steps — STEPS_REQUIRED must win
        // because its suggestion is the actionable one (path is moot if no steps).
        output_path: path.join(os.tmpdir(), 'outside-and-empty.testcase'),
        dry_run: false,
        overwrite: false,
      });
      assert.equal(isError(result), true);
      assert.equal(
        parseText(result)['error_code'],
        'STEPS_REQUIRED',
        'STEPS_REQUIRED must fire before assertPathAllowed — the empty-payload root cause is what the LLM needs to see'
      );
    });
  });

  describe('path policy', () => {
    // Uses a non-empty steps[] to bypass the PDX-483 STEPS_REQUIRED guard so
    // the assertion targets the PATH_NOT_ALLOWED branch specifically.
    const SMOKE_STEPS = [{ api_id: 'UiConnect', name: 'Connect', attributes: {} }];

    it('returns PATH_NOT_ALLOWED when output_path is outside allowedPaths', () => {
      const strictServer = new MockMcpServer();
      registerTestCaseGenerate(strictServer as never, { allowedPaths: [tmpDir] });

      const result = strictServer.call('provar_testcase_generate', {
        test_case_name: 'Evil',
        steps: SMOKE_STEPS,
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

      const result = strictServer.call('provar_testcase_generate', {
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
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Idempotent',
        steps: [],
        idempotency_key: 'dedup-key-abc',
        dry_run: true,
        overwrite: false,
      });

      assert.equal(parseText(result)['idempotency_key'], 'dedup-key-abc');
    });
  });

  describe('XML argument valueClass casing', () => {
    it('emits lowercase valueClass="string" not uppercase "String"', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'ValueClass Test',
        steps: [
          {
            api_id: 'UiConnect',
            name: 'Connect',
            attributes: { connectionName: 'MyOrg' },
          },
        ],
        dry_run: true,
        overwrite: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('valueClass="string"'), 'Expected lowercase valueClass="string"');
      assert.ok(!xml.includes('valueClass="String"'), 'Must not emit uppercase valueClass="String"');
    });
  });

  // PDX-493 (H3): date/datetime/boolean/decimal valueClass dispatch via inferSalesforceValueClass.
  // Numbers emit `valueClass="decimal"` per canonical reference (PROVAR_TEST_STEP_REFERENCE.md
  // lines 1338, 1428) — there is no `integer` valueClass in the Provar grammar.
  describe('PDX-493 — inferSalesforceValueClass helper', () => {
    it('returns "datetime" for ISO-8601 datetime string', () => {
      assert.equal(inferSalesforceValueClass('CloseDate', '2026-05-19T10:30:00'), 'datetime');
    });

    it('returns "datetime" for ISO-8601 datetime with fractional seconds + zone', () => {
      assert.equal(inferSalesforceValueClass('CloseDate', '2026-05-19T10:30:00.123Z'), 'datetime');
    });

    it('returns "datetime" for ISO-8601 datetime with numeric timezone offset', () => {
      assert.equal(inferSalesforceValueClass('CloseDate', '2026-05-19T10:30:00+05:30'), 'datetime');
      assert.equal(inferSalesforceValueClass('CloseDate', '2026-05-19T10:30:00-0800'), 'datetime');
    });

    it('returns "string" for datetime-looking values with trailing garbage (end-anchored)', () => {
      // Guards against the un-anchored regex bug: trailing junk after seconds must not
      // be silently accepted as datetime.
      assert.equal(inferSalesforceValueClass('CloseDate', '2026-05-19T10:30:00not-a-zone'), 'string');
    });

    it('returns "date" for ISO-8601 date string', () => {
      assert.equal(inferSalesforceValueClass('CloseDate', '2026-05-19'), 'date');
    });

    it('returns "boolean" for "true"', () => {
      assert.equal(inferSalesforceValueClass('IsActive', 'true'), 'boolean');
    });

    it('returns "boolean" for "false"', () => {
      assert.equal(inferSalesforceValueClass('IsActive', 'false'), 'boolean');
    });

    it('returns "decimal" for positive integer string', () => {
      assert.equal(inferSalesforceValueClass('Quantity', '42'), 'decimal');
    });

    it('returns "decimal" for negative integer string', () => {
      assert.equal(inferSalesforceValueClass('Delta', '-5'), 'decimal');
    });

    it('returns "decimal" for positive decimal string', () => {
      assert.equal(inferSalesforceValueClass('Amount', '3.14'), 'decimal');
    });

    it('returns "decimal" for negative decimal string', () => {
      assert.equal(inferSalesforceValueClass('Adjustment', '-12.5'), 'decimal');
    });

    it('returns "string" for plain text', () => {
      assert.equal(inferSalesforceValueClass('Name', 'Acme Corp'), 'string');
    });

    it('returns "decimal" not "date" for a short numeric string like "12"', () => {
      // Edge case: the date regex requires the full ISO yyyy-mm-dd form, so a bare "12"
      // is decimal, not date. Guards against false-positive date detection on numeric IDs.
      assert.equal(inferSalesforceValueClass('Code', '12'), 'decimal');
    });

    it('returns "string" for date-looking strings that miss the ISO format', () => {
      // Confirms the regex is strict: month/day shape matters.
      assert.equal(inferSalesforceValueClass('CloseDate', '2026/05/19'), 'string');
      assert.equal(inferSalesforceValueClass('CloseDate', '05-19-2026'), 'string');
    });

    it('explicit fieldTypeHint wins over format detection', () => {
      // Value looks like a string but the hint says it's a date — hint wins.
      assert.equal(inferSalesforceValueClass('CloseDate', 'today', 'date'), 'date');
      // Value looks like a date but the hint says string — hint wins (e.g. an external
      // ID that happens to look like a date).
      assert.equal(inferSalesforceValueClass('ExternalId', '2026-05-19', 'string'), 'string');
      // Value is decimal, hint says boolean — hint wins.
      assert.equal(inferSalesforceValueClass('IsActive', '1', 'boolean'), 'boolean');
    });
  });

  describe('PDX-493 — valueClass emission in generated XML', () => {
    it('emits valueClass="date" for an ISO-8601 date string', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'DateField',
        steps: [
          {
            api_id: 'ApexCreateObject',
            name: 'Create Opp',
            attributes: { CloseDate: '2026-05-19' },
          },
        ],
        dry_run: true,
        overwrite: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(
        xml.includes('valueClass="date">2026-05-19</value>'),
        `Expected valueClass="date" for ISO date; got: ${xml}`
      );
    });

    it('emits valueClass="datetime" for an ISO-8601 datetime string', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'DatetimeField',
        steps: [
          {
            api_id: 'ApexCreateObject',
            name: 'Create Event',
            attributes: { StartTime: '2026-05-19T10:30:00' },
          },
        ],
        dry_run: true,
        overwrite: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(
        xml.includes('valueClass="datetime">2026-05-19T10:30:00</value>'),
        `Expected valueClass="datetime" for ISO datetime; got: ${xml}`
      );
    });

    it('emits valueClass="boolean" for "true" / "false" literals', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'BoolField',
        steps: [
          {
            api_id: 'ApexCreateObject',
            name: 'Create Account',
            attributes: { IsActive: 'true', IsDeleted: 'false' },
          },
        ],
        dry_run: true,
        overwrite: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(
        xml.includes('valueClass="boolean">true</value>'),
        `Expected valueClass="boolean" for "true"; got: ${xml}`
      );
      assert.ok(
        xml.includes('valueClass="boolean">false</value>'),
        `Expected valueClass="boolean" for "false"; got: ${xml}`
      );
    });

    it('emits valueClass="decimal" for an integer-only string', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'IntField',
        steps: [
          {
            api_id: 'ApexCreateObject',
            name: 'Create Opp',
            attributes: { Quantity: '42' },
          },
        ],
        dry_run: true,
        overwrite: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('valueClass="decimal">42</value>'), `Expected valueClass="decimal" for "42"; got: ${xml}`);
    });

    it('emits valueClass="decimal" for a negative integer string', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'NegIntField',
        steps: [
          {
            api_id: 'ApexCreateObject',
            name: 'Create Adjustment',
            attributes: { Delta: '-5' },
          },
        ],
        dry_run: true,
        overwrite: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('valueClass="decimal">-5</value>'), `Expected valueClass="decimal" for "-5"; got: ${xml}`);
    });

    it('emits valueClass="decimal" for a positive decimal string', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'DecimalField',
        steps: [
          {
            api_id: 'ApexCreateObject',
            name: 'Create Opp',
            attributes: { Amount: '3.14' },
          },
        ],
        dry_run: true,
        overwrite: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(
        xml.includes('valueClass="decimal">3.14</value>'),
        `Expected valueClass="decimal" for "3.14"; got: ${xml}`
      );
    });

    it('emits valueClass="string" for plain text', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'StringField',
        steps: [
          {
            api_id: 'ApexCreateObject',
            name: 'Create Account',
            attributes: { Name: 'Acme Corp' },
          },
        ],
        dry_run: true,
        overwrite: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(
        xml.includes('valueClass="string">Acme Corp</value>'),
        `Expected valueClass="string" for "Acme Corp"; got: ${xml}`
      );
    });
  });

  describe('target_uri — non-SF page object (ui:) nesting', () => {
    it('wraps steps in UiWithScreen when target_uri uses ?pageId= format', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Non-SF Login',
        steps: [{ api_id: 'UiDoAction', name: 'Enter username', attributes: { field: 'username' } }],
        target_uri: 'ui:pageobject:target?pageId=pageobjects.LoginPage',
        dry_run: true,
        overwrite: false,
        validate_after_edit: true,
      });

      assert.equal(isError(result), false);
      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('UiWithScreen'), 'Expected UiWithScreen wrapper');
      assert.ok(xml.includes('testItemId="1"'), 'UiWithScreen should be testItemId=1');
      assert.ok(xml.includes('ui:pageobject:target?pageId=pageobjects.LoginPage'), 'Expected target URI in XML');
      assert.ok(xml.includes('<clause name="substeps"'), 'Expected substeps clause wrapper');
    });

    it('substeps clause uses testItemId=2, inner steps start at testItemId=3', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Non-SF Multi',
        steps: [
          { api_id: 'UiDoAction', name: 'Step A', attributes: {} },
          { api_id: 'UiDoAction', name: 'Step B', attributes: {} },
        ],
        target_uri: 'ui:pageobject:target?pageId=pageobjects.LoginPage',
        dry_run: true,
        overwrite: false,
        validate_after_edit: true,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('testItemId="2"'), 'substeps clause should be testItemId=2');
      assert.ok(xml.includes('testItemId="3"'), 'First inner step should be testItemId=3');
      assert.ok(xml.includes('testItemId="4"'), 'Second inner step should be testItemId=4');
    });

    it('uses flat structure when target_uri starts with sf:', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'SF Target',
        steps: [{ api_id: 'UiConnect', name: 'Connect', attributes: {} }],
        target_uri: 'sf:ui:target:Salesforce__Standard__Account',
        dry_run: true,
        overwrite: false,
        validate_after_edit: true,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(!xml.includes('UiWithScreen'), 'Should not wrap in UiWithScreen for sf: target');
      assert.ok(xml.includes('testItemId="1"'), 'Step should be testItemId=1 directly');
    });

    it('uses flat structure when target_uri is omitted', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'No URI',
        steps: [{ api_id: 'UiConnect', name: 'Connect', attributes: {} }],
        dry_run: true,
        overwrite: false,
        validate_after_edit: true,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(!xml.includes('UiWithScreen'), 'No UiWithScreen without target_uri');
    });
  });

  describe('D2 — uiTarget / uiLocator argument types', () => {
    it('emits class="uiTarget" uri="..." for the target argument', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'UI Target Test',
        steps: [
          {
            api_id: 'UiWithScreen',
            name: 'With page',
            attributes: { target: 'sf:ui:target?pageObject=pageobjects.Account&flexiPage=Account_flexiPage' },
          },
        ],
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('class="uiTarget"'), 'Expected class="uiTarget"');
      assert.ok(xml.includes('uri="sf:ui:target?'), 'Expected uri attribute with sf:ui:target value');
      assert.ok(
        !xml.includes('valueClass="string">sf:ui:target'),
        'Must NOT emit uiTarget URI as a plain string value'
      );
    });

    it('emits class="uiLocator" uri="..." for the locator argument', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'UI Locator Test',
        steps: [
          {
            api_id: 'UiDoAction',
            name: 'Click button',
            attributes: { locator: 'sf:ui:locator:button?label=Save' },
          },
        ],
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('class="uiLocator"'), 'Expected class="uiLocator"');
      assert.ok(xml.includes('uri="sf:ui:locator:'), 'Expected uri attribute with locator value');
      assert.ok(
        !xml.includes('valueClass="string">sf:ui:locator'),
        'Must NOT emit locator URI as a plain string value'
      );
    });

    it('uiTarget also applies inside UiWithScreen wrapper when target_uri is non-SF', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Non-SF With Target',
        steps: [],
        target_uri: 'ui:pageobject:target?pageId=pageobjects.LoginPage',
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('class="uiTarget"'), 'Wrapper UiWithScreen target should use uiTarget class');
      assert.ok(
        xml.includes('uri="ui:pageobject:target?pageId=pageobjects.LoginPage"'),
        'URI should appear as attribute'
      );
    });
  });

  describe('D3 — SetValues / AssertValues use valueList/namedValues structure', () => {
    it('SetValues emits <value class="valueList"> with <namedValues>', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'SetValues Test',
        steps: [
          {
            api_id: 'SetValues',
            name: 'Set test vars',
            attributes: { testCaseName: 'TC_New', testType: 'Acceptance testing' },
          },
        ],
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('class="valueList"'), 'Expected class="valueList"');
      assert.ok(xml.includes('mutable="Mutable"'), 'Expected mutable="Mutable"');
      assert.ok(xml.includes('<namedValues>'), 'Expected <namedValues> element');
      assert.ok(xml.includes('<namedValue name="testCaseName">'), 'Expected namedValue for testCaseName');
      assert.ok(xml.includes('<namedValue name="testType">'), 'Expected namedValue for testType');
      assert.ok(xml.includes('<argument id="values">'), 'Expected argument id="values"');
      assert.ok(!xml.includes('testCaseName|TC_New'), 'Must NOT emit pipe-delimited string for SetValues');
    });

    it('AssertValues uses flat argument structure (not valueList)', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'AssertValues Test',
        steps: [
          {
            api_id: 'AssertValues',
            name: 'Assert vars',
            attributes: { opportunityName: 'My Opp' },
          },
        ],
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('<argument id="opportunityName">'), 'Expected flat argument id for AssertValues');
      assert.ok(!xml.includes('class="valueList"'), 'AssertValues must NOT emit valueList structure');
      assert.ok(!xml.includes('<namedValue'), 'AssertValues must NOT emit namedValue elements');
    });

    it('non-SetValues steps still use flat argument structure', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Flat Args Test',
        steps: [{ api_id: 'ApexCreateObject', name: 'Create record', attributes: { objectApiName: 'Opportunity' } }],
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('<argument id="objectApiName">'), 'Expected flat argument id');
      assert.ok(!xml.includes('valueList'), 'Must NOT emit valueList for non-SetValues steps');
    });
  });

  describe('D4 — Variable references use class="variable" with <path> elements', () => {
    it('{VarName} emits class="variable" <path element="VarName"/>', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Variable Ref Test',
        steps: [
          {
            api_id: 'ApexCreateObject',
            name: 'Create record',
            attributes: { provar__Test_Project__c: '{TestProjectId}' },
          },
        ],
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('class="variable"'), 'Expected class="variable"');
      assert.ok(xml.includes('<path element="TestProjectId"/>'), 'Expected <path element="TestProjectId"/>');
      assert.ok(!xml.includes('valueClass="string">{TestProjectId}'), 'Must NOT emit {VarName} as a string literal');
    });

    it('{Obj.Field} dotted path emits two <path> elements', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Dotted Variable Test',
        steps: [
          {
            api_id: 'ApexCreateObject',
            name: 'Create with nested var',
            attributes: { Name: '{Opportunity.Name}' },
          },
        ],
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('<path element="Opportunity"/>'), 'Expected first path element');
      assert.ok(xml.includes('<path element="Name"/>'), 'Expected second path element');
    });

    it('variable reference also works inside SetValues namedValues', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'SetValues With Var',
        steps: [
          {
            api_id: 'SetValues',
            name: 'Set with variable',
            attributes: { projectId: '{TestProjectId}', label: 'Static Label' },
          },
        ],
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('class="variable"'), 'Expected variable reference inside namedValues');
      assert.ok(xml.includes('<path element="TestProjectId"/>'));
      assert.ok(xml.includes('valueClass="string">Static Label'), 'Static value should still be a plain string');
    });

    it('plain string values without braces are not treated as variable references', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'No Var Test',
        steps: [{ api_id: 'ApexCreateObject', name: 'Create', attributes: { Name: 'Literal Name' } }],
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('valueClass="string">Literal Name'), 'Plain string should use valueClass="string"');
      assert.ok(!xml.includes('class="variable"'), 'No variable element expected');
    });
  });

  describe('F1 — Compound values for {VarName} embedded in surrounding text', () => {
    it('"Hello {Name}" emits class="compound" with literal and variable parts', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Compound Value Test',
        steps: [
          {
            api_id: 'UiDoAction',
            name: 'Enter greeting',
            attributes: { value: 'Hello {Name}' },
          },
        ],
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      assert.equal(isError(result), false);
      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('class="compound"'), 'Expected class="compound" for mixed value');
      assert.ok(xml.includes('<parts>'), 'Expected <parts> element');
      assert.ok(xml.includes('valueClass="string">Hello '), 'Expected literal prefix as string part');
      assert.ok(xml.includes('<variable>'), 'Expected <variable> element for the token');
      assert.ok(xml.includes('<path element="Name"/>'), 'Expected <path element="Name"/>');
      assert.ok(!xml.includes('valueClass="string">Hello {Name}'), 'Must NOT emit raw {Name} as string literal');
    });

    it('"{A} and {B}" emits compound with two variable parts', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Multi-Var Compound Test',
        steps: [
          {
            api_id: 'UiDoAction',
            name: 'Combine two vars',
            attributes: { value: '{First} and {Last}' },
          },
        ],
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      assert.equal(isError(result), false);
      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('class="compound"'), 'Expected compound for two variables');
      assert.ok(xml.includes('<path element="First"/>'), 'Expected path for First');
      assert.ok(xml.includes('<path element="Last"/>'), 'Expected path for Last');
    });

    it('pure {VarName} alone still uses class="variable" (not compound)', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Pure Var Test',
        steps: [
          {
            api_id: 'UiDoAction',
            name: 'Pure var',
            attributes: { value: '{AccountId}' },
          },
        ],
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      assert.equal(isError(result), false);
      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('class="variable"'), 'Pure token should still use class="variable"');
      assert.ok(!xml.includes('class="compound"'), 'Should not emit compound for a pure variable token');
    });
  });

  describe('D7 — Cleanup warning for ApexDeleteObject', () => {
    it('includes cleanup warning when ApexDeleteObject is in the step list', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Create and Delete',
        steps: [
          { api_id: 'ApexCreateObject', name: 'Create record', attributes: { objectApiName: 'Account' } },
          { api_id: 'ApexDeleteObject', name: 'Delete record', attributes: { objectApiName: 'Account' } },
        ],
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      const warnings = body['warnings'] as string[] | undefined;
      assert.ok(Array.isArray(warnings) && warnings.length > 0, 'Expected at least one warning');
      assert.ok(
        warnings.some((w) => w.includes('ApexDeleteObject') && w.includes('cleanup')),
        'Expected cleanup warning mentioning ApexDeleteObject'
      );
    });

    it('does NOT warn when no ApexDeleteObject steps are present', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'No Cleanup',
        steps: [{ api_id: 'ApexCreateObject', name: 'Create', attributes: {} }],
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      const warnings = body['warnings'] as string[] | undefined;
      const hasCleanupWarning = warnings?.some((w) => w.includes('ApexDeleteObject'));
      assert.ok(!hasCleanupWarning, 'No cleanup warning expected without ApexDeleteObject');
    });
  });

  describe('validate_after_edit', () => {
    it('includes validation field when validate_after_edit=true (default)', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Validated',
        steps: [{ api_id: 'UiConnect', name: 'Connect', attributes: {} }],
        dry_run: true,
        overwrite: false,
        validate_after_edit: true,
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.ok(body['validation'], 'Expected validation field');
    });

    it('omits validation field when validate_after_edit=false', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Skip Validation',
        steps: [],
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.ok(!('validation' in body), 'validation field should be absent when validate_after_edit=false');
    });
  });

  describe('F1/F3 — compound value emission for embedded {VarName} tokens', () => {
    it('emits class="compound" with <parts> when a SOQL query embeds a variable (F1)', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'SOQL Compound Test',
        steps: [
          {
            api_id: 'ApexSoqlQuery',
            name: 'Query account',
            attributes: { soqlQuery: "SELECT Id, Name FROM Account WHERE Id = '{AccountId}'" },
          },
        ],
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      assert.equal(isError(result), false);
      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('class="compound"'), 'Expected class="compound" for embedded variable in SOQL');
      assert.ok(xml.includes('<parts>'), 'Expected <parts> element inside compound value');
      assert.ok(xml.includes('<variable>'), 'Expected <variable> element for the AccountId reference');
      assert.ok(xml.includes('<path element="AccountId"/>'), 'Expected <path element="AccountId"/>');
      assert.ok(
        !xml.includes('valueClass="string">{AccountId}'),
        'Must NOT emit {AccountId} as a plain string literal'
      );
    });

    it('emits class="compound" for Provar system variables embedded in a string (F3: {NOW})', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'NOW Compound Test',
        steps: [
          {
            api_id: 'SetValues',
            name: 'Set account name',
            attributes: { AccountName: 'Acme Corp CRUD Test {NOW}' },
          },
        ],
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      assert.equal(isError(result), false);
      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('class="compound"'), 'Expected class="compound" inside namedValues');
      assert.ok(xml.includes('<path element="NOW"/>'), 'Expected <path element="NOW"/> for system variable');
      assert.ok(
        !xml.includes('valueClass="string">Acme Corp CRUD Test {NOW}'),
        'Must NOT emit {NOW} as a literal string'
      );
    });

    it('emits <parts> with correct literal fragments around the variable', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Fragment Test',
        steps: [
          {
            api_id: 'ApexSoqlQuery',
            name: 'Query with prefix and suffix',
            attributes: { soqlQuery: "SELECT Id FROM Contact WHERE Email = '{Email}' LIMIT 1" },
          },
        ],
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes("SELECT Id FROM Contact WHERE Email = '"), 'Expected literal prefix fragment');
      assert.ok(xml.includes("' LIMIT 1"), 'Expected literal suffix fragment');
      assert.ok(xml.includes('<path element="Email"/>'), 'Expected variable path element');
    });

    it('handles multiple embedded variables in one string', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Multi Var Test',
        steps: [
          {
            api_id: 'ApexSoqlQuery',
            name: 'Query by two fields',
            attributes: { soqlQuery: "SELECT Id FROM Case WHERE AccountId='{AccId}' AND OwnerId='{OwnerId}'" },
          },
        ],
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('<path element="AccId"/>'), 'Expected first variable path');
      assert.ok(xml.includes('<path element="OwnerId"/>'), 'Expected second variable path');
      const compoundCount = (xml.match(/class="compound"/g) ?? []).length;
      assert.equal(compoundCount, 1, 'Should be exactly one compound element for the soqlQuery argument');
    });

    it('pure {VarName} value (entire argument) still uses class="variable", not compound', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'Pure Var Test',
        steps: [
          {
            api_id: 'ApexDeleteObject',
            name: 'Delete account',
            attributes: { recordId: '{AccountId}' },
          },
        ],
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('class="variable"'), 'Pure {VarName} should use class="variable"');
      assert.ok(!xml.includes('class="compound"'), 'Pure {VarName} must NOT use class="compound"');
    });
  });

  // ── PDX-481 regression guard ─────────────────────────────────────────────────
  // The 1.5.0 regression (PDX-479) happened when agents authored test cases
  // step-by-step via repeated tool calls instead of constructing the full step
  // tree in a single provar_testcase_generate call. This block proves that
  // when the full tree IS passed in one call, the output is structurally clean:
  // scenarios numbered consecutively, asserts emitted with consistent types,
  // and testItemIds sequential.

  describe('multi-scenario single-call construction (PDX-481 regression guard)', () => {
    it('emits consecutive testItemIds across a 3-scenario, multi-step payload', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'AccountFlow',
        steps: [
          // Scenario 1 — Create Account
          { api_id: 'UiConnect', name: 'Salesforce Connect', attributes: {} },
          {
            api_id: 'SetValues',
            name: 'Set Account Test Data',
            attributes: { AccountName: 'Acme', AccountPhone: '555-0100' },
          },
          { api_id: 'UiNavigate', name: 'Scenario 1: navigate to Account home', attributes: {} },
          { api_id: 'UiDoAction', name: 'Scenario 1: click New', attributes: {} },
          {
            api_id: 'SetValues',
            name: 'Scenario 1: fill form',
            attributes: { Name: '{AccountName}', Phone: '{AccountPhone}' },
          },
          { api_id: 'UiDoAction', name: 'Scenario 1: click Save', attributes: {} },
          // Scenario 2 — Verify on list view (the scenario that went missing on 1.5.0)
          { api_id: 'UiNavigate', name: 'Scenario 2: go to Account list', attributes: {} },
          {
            api_id: 'AssertValues',
            name: 'Scenario 2: assert Name on list',
            attributes: { expectedValue: '{AccountName}', actualValue: 'Name', comparisonType: 'EqualTo' },
          },
          {
            api_id: 'AssertValues',
            name: 'Scenario 2: assert Phone on list',
            attributes: { expectedValue: '{AccountPhone}', actualValue: 'Phone', comparisonType: 'EqualTo' },
          },
          // Scenario 3 — Open detail and assert all
          { api_id: 'UiDoAction', name: 'Scenario 3: open Account detail', attributes: {} },
          {
            api_id: 'AssertValues',
            name: 'Scenario 3: assert Name on detail',
            attributes: { expectedValue: '{AccountName}', actualValue: 'Name', comparisonType: 'EqualTo' },
          },
          {
            api_id: 'AssertValues',
            name: 'Scenario 3: assert Phone on detail',
            attributes: { expectedValue: '{AccountPhone}', actualValue: 'Phone', comparisonType: 'EqualTo' },
          },
        ],
        dry_run: true,
        overwrite: false,
      });

      assert.equal(isError(result), false, 'single-call multi-scenario generate must succeed');
      const body = parseText(result);
      assert.equal(body['step_count'], 12, 'all 12 steps must be present (no scenarios dropped)');

      const xml = body['xml_content'] as string;
      // testItemIds must be exactly 1..12 — gaps indicate dropped steps.
      for (let i = 1; i <= 12; i++) {
        assert.ok(
          xml.includes(`testItemId="${i}"`),
          `expected sequential testItemId="${i}" — gap means a scenario step was dropped`
        );
      }
      // No higher testItemIds emitted (would indicate spurious appends from an internal step_edit loop).
      assert.ok(!xml.includes('testItemId="13"'), 'no spurious testItemIds beyond the payload count');
    });

    it('preserves every step name from the payload — no scenario marker is silently dropped', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'ScenarioMarkers',
        steps: [
          { api_id: 'UiDoAction', name: 'Scenario 1: When create', attributes: {} },
          { api_id: 'UiDoAction', name: 'Scenario 1: Then verify', attributes: {} },
          { api_id: 'UiDoAction', name: 'Scenario 2: When edit', attributes: {} },
          { api_id: 'UiDoAction', name: 'Scenario 2: Then verify', attributes: {} },
          { api_id: 'UiDoAction', name: 'Scenario 3: When delete', attributes: {} },
          { api_id: 'UiDoAction', name: 'Scenario 3: Then absent', attributes: {} },
        ],
        dry_run: true,
        overwrite: false,
      });

      assert.equal(isError(result), false);
      const xml = parseText(result)['xml_content'] as string;
      for (const marker of [
        'Scenario 1: When create',
        'Scenario 1: Then verify',
        'Scenario 2: When edit',
        'Scenario 2: Then verify',
        'Scenario 3: When delete',
        'Scenario 3: Then absent',
      ]) {
        assert.ok(xml.includes(marker), `scenario marker "${marker}" must be preserved verbatim`);
      }
    });

    it('emits consistent assert API IDs for repeated AssertValues — no drift between calls', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'AssertConsistency',
        steps: [
          {
            api_id: 'AssertValues',
            name: 'Assert 1',
            attributes: { expectedValue: '{a}', actualValue: 'x', comparisonType: 'EqualTo' },
          },
          {
            api_id: 'AssertValues',
            name: 'Assert 2',
            attributes: { expectedValue: '{b}', actualValue: 'y', comparisonType: 'EqualTo' },
          },
          {
            api_id: 'AssertValues',
            name: 'Assert 3',
            attributes: { expectedValue: '{c}', actualValue: 'z', comparisonType: 'EqualTo' },
          },
        ],
        dry_run: true,
        overwrite: false,
      });

      assert.equal(isError(result), false);
      const xml = parseText(result)['xml_content'] as string;
      const assertValuesMatches = xml.match(/apiId="com\.provar\.plugins\.bundled\.apis\.AssertValues"/g) ?? [];
      assert.equal(assertValuesMatches.length, 3, 'all 3 asserts must use AssertValues — no API ID drift');
      // None of them should silently become UiAssert.
      assert.ok(
        !xml.includes('apiId="com.provar.plugins.forcedotcom.core.ui.UiAssert"'),
        'no AssertValues should be substituted with UiAssert'
      );
    });

    it('wraps a non-SF target_uri in UiWithScreen with nested steps — full tree in one call', () => {
      const result = server.call('provar_testcase_generate', {
        test_case_name: 'PageObjectNested',
        target_uri: 'ui:pageobject:target?pageId=pageobjects.AccountPage',
        steps: [
          { api_id: 'UiDoAction', name: 'Click new', attributes: {} },
          {
            api_id: 'AssertValues',
            name: 'Assert created',
            attributes: { expectedValue: '{x}', actualValue: 'y', comparisonType: 'EqualTo' },
          },
        ],
        dry_run: true,
        overwrite: false,
      });

      assert.equal(isError(result), false);
      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('UiWithScreen'), 'non-SF target_uri must wrap in UiWithScreen');
      assert.ok(xml.includes('<clauses>'), 'wrapper must contain <clauses>');
      assert.ok(xml.includes('<clause name="substeps" testItemId="2">'), 'substeps clause must have testItemId="2"');
      // Inner steps start at testItemId=3 per builder convention.
      assert.ok(xml.includes('testItemId="3"'), 'first nested step must have testItemId="3"');
      assert.ok(xml.includes('testItemId="4"'), 'second nested step must have testItemId="4"');
    });
  });
});
