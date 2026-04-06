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
import { registerPageObjectGenerate } from '../../../src/mcp/tools/pageObjectGenerate.js';
import type { ServerConfig } from '../../../src/mcp/server.js';

// ── Minimal McpServer mock ─────────────────────────────────────────────────────
// Note: bypasses Zod parsing — always pass explicit values for fields with defaults
// (fields, dry_run, overwrite, page_type, package_name).

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

// ── Test setup ─────────────────────────────────────────────────────────────────

let tmpDir: string;
let server: MockMcpServer;
let config: ServerConfig;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pogen-test-'));
  server = new MockMcpServer();
  config = { allowedPaths: [tmpDir] };
  registerPageObjectGenerate(server as never, config);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── provar.pageobject.generate ─────────────────────────────────────────────────

describe('provar.pageobject.generate', () => {
  describe('dry_run', () => {
    it('returns java_source without writing to disk', () => {
      const result = server.call('provar.pageobject.generate', {
        class_name: 'AccountDetailPage',
        package_name: 'pageobjects',
        page_type: 'standard',
        fields: [],
        dry_run: true,
        overwrite: false,
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.ok(typeof body['java_source'] === 'string' && body['java_source'].length > 0);
      assert.equal(body['written'], false);
      assert.equal(body['dry_run'], true);
    });

    it('does NOT write a file even when output_path is provided', () => {
      const outPath = path.join(tmpDir, 'AccountDetailPage.java');
      server.call('provar.pageobject.generate', {
        class_name: 'AccountDetailPage',
        package_name: 'pageobjects',
        page_type: 'standard',
        fields: [],
        output_path: outPath,
        dry_run: true,
        overwrite: false,
      });

      assert.equal(fs.existsSync(outPath), false, 'file must not be written in dry_run mode');
    });
  });

  describe('generated Java source content', () => {
    it('contains correct class name and package', () => {
      const result = server.call('provar.pageobject.generate', {
        class_name: 'AccountDetailPage',
        package_name: 'pageobjects.accounts',
        page_type: 'standard',
        fields: [],
        dry_run: true,
        overwrite: false,
      });

      const src = parseText(result)['java_source'] as string;
      assert.ok(src.includes('package pageobjects.accounts;'), 'Expected correct package declaration');
      assert.ok(src.includes('public class AccountDetailPage'), 'Expected correct class name');
    });

    it('uses @Page annotation for standard page_type', () => {
      const result = server.call('provar.pageobject.generate', {
        class_name: 'LoginPage',
        package_name: 'pageobjects',
        page_type: 'standard',
        title: 'Login',
        fields: [],
        dry_run: true,
        overwrite: false,
      });

      const src = parseText(result)['java_source'] as string;
      assert.ok(src.includes('@Page(title = "Login")'), 'Expected @Page annotation');
    });

    it('uses @SalesforcePage annotation for salesforce page_type', () => {
      const result = server.call('provar.pageobject.generate', {
        class_name: 'AccountPage',
        package_name: 'pageobjects',
        page_type: 'salesforce',
        connection_name: 'SalesforceOrg',
        fields: [],
        dry_run: true,
        overwrite: false,
      });

      const src = parseText(result)['java_source'] as string;
      assert.ok(src.includes('@SalesforcePage('), 'Expected @SalesforcePage annotation');
      assert.ok(src.includes('connection = "SalesforceOrg"'), 'Expected connection name');
    });

    it('includes standard imports', () => {
      const result = server.call('provar.pageobject.generate', {
        class_name: 'MyPage',
        package_name: 'pageobjects',
        page_type: 'standard',
        fields: [],
        dry_run: true,
        overwrite: false,
      });

      const src = parseText(result)['java_source'] as string;
      assert.ok(src.includes('import com.provar.core.testapi.annotations.*;'));
      assert.ok(src.includes('import org.openqa.selenium.WebElement;'));
      assert.ok(src.includes('import org.openqa.selenium.support.FindBy;'));
    });

    it('generates @FindBy field blocks for provided fields', () => {
      const result = server.call('provar.pageobject.generate', {
        class_name: 'AccountPage',
        package_name: 'pageobjects',
        page_type: 'standard',
        fields: [
          { name: 'accountName', locator_strategy: 'xpath', locator_value: "//input[@name='accountName']", element_type: 'TextType' },
          { name: 'saveButton',  locator_strategy: 'css',   locator_value: "[data-testid='save']",          element_type: 'ButtonType' },
        ],
        dry_run: true,
        overwrite: false,
      });

      const src = parseText(result)['java_source'] as string;
      assert.ok(src.includes('@TextType()'), 'Expected @TextType annotation');
      assert.ok(src.includes('public WebElement accountName;'), 'Expected accountName field');
      assert.ok(src.includes('@ButtonType()'), 'Expected @ButtonType annotation');
      assert.ok(src.includes('public WebElement saveButton;'), 'Expected saveButton field');
    });

    it('emits a TODO comment when no fields are provided', () => {
      const result = server.call('provar.pageobject.generate', {
        class_name: 'EmptyPage',
        package_name: 'pageobjects',
        page_type: 'standard',
        fields: [],
        dry_run: true,
        overwrite: false,
      });

      const src = parseText(result)['java_source'] as string;
      assert.ok(src.includes('TODO'), 'Expected TODO placeholder for empty fields');
    });

    it('defaults title to class_name when title is omitted', () => {
      const result = server.call('provar.pageobject.generate', {
        class_name: 'AccountDetailPage',
        package_name: 'pageobjects',
        page_type: 'standard',
        fields: [],
        dry_run: true,
        overwrite: false,
      });

      const src = parseText(result)['java_source'] as string;
      assert.ok(src.includes('"AccountDetailPage"'), 'Expected class_name used as title');
    });
  });

  describe('writing to disk', () => {
    it('writes file when dry_run=false and output_path provided', () => {
      const outPath = path.join(tmpDir, 'AccountDetailPage.java');
      const result = server.call('provar.pageobject.generate', {
        class_name: 'AccountDetailPage',
        package_name: 'pageobjects',
        page_type: 'standard',
        fields: [],
        output_path: outPath,
        dry_run: false,
        overwrite: false,
      });

      assert.equal(isError(result), false);
      assert.equal(fs.existsSync(outPath), true, 'file should be written');
      assert.equal(parseText(result)['written'], true);
    });

    it('does NOT write when dry_run=false but no output_path', () => {
      const result = server.call('provar.pageobject.generate', {
        class_name: 'NoPathPage',
        package_name: 'pageobjects',
        page_type: 'standard',
        fields: [],
        dry_run: false,
        overwrite: false,
      });

      assert.equal(isError(result), false);
      assert.equal(parseText(result)['written'], false);
    });

    it('returns FILE_EXISTS when file exists and overwrite=false', () => {
      const outPath = path.join(tmpDir, 'Existing.java');
      fs.writeFileSync(outPath, '// old', 'utf-8');

      const result = server.call('provar.pageobject.generate', {
        class_name: 'Existing',
        package_name: 'pageobjects',
        page_type: 'standard',
        fields: [],
        output_path: outPath,
        dry_run: false,
        overwrite: false,
      });

      assert.equal(isError(result), true);
      assert.equal(parseText(result)['error_code'], 'FILE_EXISTS');
    });

    it('overwrites when overwrite=true and file exists', () => {
      const outPath = path.join(tmpDir, 'Existing.java');
      fs.writeFileSync(outPath, '// old', 'utf-8');

      const result = server.call('provar.pageobject.generate', {
        class_name: 'Existing',
        package_name: 'pageobjects',
        page_type: 'standard',
        fields: [],
        output_path: outPath,
        dry_run: false,
        overwrite: true,
      });

      assert.equal(isError(result), false);
      const content = fs.readFileSync(outPath, 'utf-8');
      assert.ok(!content.includes('// old'), 'old content should be replaced');
    });

    it('creates parent directories as needed', () => {
      const outPath = path.join(tmpDir, 'src', 'main', 'java', 'MyPage.java');
      server.call('provar.pageobject.generate', {
        class_name: 'MyPage',
        package_name: 'pageobjects',
        page_type: 'standard',
        fields: [],
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
      registerPageObjectGenerate(strictServer as never, { allowedPaths: [tmpDir] });

      const result = strictServer.call('provar.pageobject.generate', {
        class_name: 'EvilPage',
        package_name: 'pageobjects',
        page_type: 'standard',
        fields: [],
        output_path: path.join(os.tmpdir(), 'evil.java'),
        dry_run: false,
        overwrite: false,
      });

      assert.equal(isError(result), true);
      const code = parseText(result)['error_code'] as string;
      assert.ok(code === 'PATH_NOT_ALLOWED' || code === 'PATH_TRAVERSAL', `Unexpected: ${code}`);
    });

    it('does NOT check path policy in dry_run=true mode', () => {
      const strictServer = new MockMcpServer();
      registerPageObjectGenerate(strictServer as never, { allowedPaths: [tmpDir] });

      const result = strictServer.call('provar.pageobject.generate', {
        class_name: 'SafePage',
        package_name: 'pageobjects',
        page_type: 'standard',
        fields: [],
        output_path: '/etc/evil.java',
        dry_run: true,
        overwrite: false,
      });

      assert.equal(isError(result), false, 'dry_run should not trigger path check');
    });
  });

  describe('idempotency_key', () => {
    it('echoes back the provided idempotency_key', () => {
      const result = server.call('provar.pageobject.generate', {
        class_name: 'IdempotentPage',
        package_name: 'pageobjects',
        page_type: 'standard',
        fields: [],
        idempotency_key: 'my-unique-key-123',
        dry_run: true,
        overwrite: false,
      });

      assert.equal(parseText(result)['idempotency_key'], 'my-unique-key-123');
    });

    it('returns undefined idempotency_key when not provided', () => {
      const result = server.call('provar.pageobject.generate', {
        class_name: 'NoKeyPage',
        package_name: 'pageobjects',
        page_type: 'standard',
        fields: [],
        dry_run: true,
        overwrite: false,
      });

      assert.equal(parseText(result)['idempotency_key'], undefined);
    });
  });
});
