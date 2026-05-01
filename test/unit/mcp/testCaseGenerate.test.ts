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
      const result = server.call('provar.testcase.generate', {
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
      assert.ok(
        !('best_practices_violations' in validation),
        'best_practices_violations should be omitted from slim response'
      );
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

  describe('XML argument valueClass casing', () => {
    it('emits lowercase valueClass="string" not uppercase "String"', () => {
      const result = server.call('provar.testcase.generate', {
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

  describe('target_uri — non-SF page object (ui:) nesting', () => {
    it('wraps steps in UiWithScreen when target_uri uses ?pageId= format', () => {
      const result = server.call('provar.testcase.generate', {
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
      const result = server.call('provar.testcase.generate', {
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
      const result = server.call('provar.testcase.generate', {
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
      const result = server.call('provar.testcase.generate', {
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
      const result = server.call('provar.testcase.generate', {
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
      assert.ok(!xml.includes('valueClass="string">sf:ui:target'), 'Must NOT emit uiTarget URI as a plain string value');
    });

    it('emits class="uiLocator" uri="..." for the locator argument', () => {
      const result = server.call('provar.testcase.generate', {
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
      assert.ok(!xml.includes('valueClass="string">sf:ui:locator'), 'Must NOT emit locator URI as a plain string value');
    });

    it('uiTarget also applies inside UiWithScreen wrapper when target_uri is non-SF', () => {
      const result = server.call('provar.testcase.generate', {
        test_case_name: 'Non-SF With Target',
        steps: [],
        target_uri: 'ui:pageobject:target?pageId=pageobjects.LoginPage',
        dry_run: true,
        overwrite: false,
        validate_after_edit: false,
      });

      const xml = parseText(result)['xml_content'] as string;
      assert.ok(xml.includes('class="uiTarget"'), 'Wrapper UiWithScreen target should use uiTarget class');
      assert.ok(xml.includes('uri="ui:pageobject:target?pageId=pageobjects.LoginPage"'), 'URI should appear as attribute');
    });
  });

  describe('D3 — SetValues / AssertValues use valueList/namedValues structure', () => {
    it('SetValues emits <value class="valueList"> with <namedValues>', () => {
      const result = server.call('provar.testcase.generate', {
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
      assert.ok(
        !xml.includes('testCaseName|TC_New'),
        'Must NOT emit pipe-delimited string for SetValues'
      );
    });

    it('AssertValues uses flat argument structure (not valueList)', () => {
      const result = server.call('provar.testcase.generate', {
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
      const result = server.call('provar.testcase.generate', {
        test_case_name: 'Flat Args Test',
        steps: [
          { api_id: 'ApexCreateObject', name: 'Create record', attributes: { objectApiName: 'Opportunity' } },
        ],
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
      const result = server.call('provar.testcase.generate', {
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
      const result = server.call('provar.testcase.generate', {
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
      const result = server.call('provar.testcase.generate', {
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
      const result = server.call('provar.testcase.generate', {
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

  describe('D7 — Cleanup warning for ApexDeleteObject', () => {
    it('includes cleanup warning when ApexDeleteObject is in the step list', () => {
      const result = server.call('provar.testcase.generate', {
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
      const result = server.call('provar.testcase.generate', {
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
      const result = server.call('provar.testcase.generate', {
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
      const result = server.call('provar.testcase.generate', {
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
});
