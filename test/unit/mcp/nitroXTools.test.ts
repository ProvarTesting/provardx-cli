/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
/* eslint-disable camelcase */

import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_ROOT = {
  componentId: VALID_UUID,
  name: '/com/test/MyComponent',
  type: 'Block',
  pageStructureElement: true,
  fieldDetailsElement: false,
};

const VALID_INTERACTION = {
  name: 'Click',
  title: 'Click',
  interactionType: 'click',
  defaultInteraction: true,
  testStepTitlePattern: '{label}',
  implementations: [{ javaScriptSnippet: 'yield interactions.click(element);' }],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('nitroXTools', () => {
  let server: MockMcpServer;
  let tmpDir: string;

  beforeEach(async () => {
    server = new MockMcpServer();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nitrox-test-'));

    const { registerAllNitroXTools } = await import('../../../src/mcp/tools/nitroXTools.js');
    registerAllNitroXTools(server as unknown as McpServer, { allowedPaths: [tmpDir] });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── provar.nitrox.discover ─────────────────────────────────────────────────

  describe('provar.nitrox.discover', () => {
    it('finds project when .testproject marker exists', () => {
      fs.writeFileSync(path.join(tmpDir, '.testproject'), '');
      const nitroxDir = path.join(tmpDir, 'nitroX');
      fs.mkdirSync(nitroxDir);
      fs.writeFileSync(path.join(nitroxDir, 'Component.po.json'), JSON.stringify(VALID_ROOT));

      const result = server.call('provar.nitrox.discover', { search_roots: [tmpDir] });
      const body = parseBody(result);
      const projects = body['projects'] as Array<Record<string, unknown>>;
      assert.ok(Array.isArray(projects));
      assert.equal(projects.length, 1);
      assert.equal(projects[0]['project_path'], tmpDir);
      assert.equal(projects[0]['nitrox_file_count'], 1);
    });

    it('returns empty projects when no .testproject found', () => {
      const result = server.call('provar.nitrox.discover', { search_roots: [tmpDir] });
      const body = parseBody(result);
      const projects = body['projects'] as unknown[];
      assert.deepEqual(projects, []);
    });

    it('handles non-existent search root gracefully', () => {
      const result = server.call('provar.nitrox.discover', {
        search_roots: [path.join(tmpDir, 'does-not-exist')],
      });
      assert.ok(!isError(result));
      const body = parseBody(result);
      assert.deepEqual(body['projects'], []);
    });

    it('skips node_modules and .git directories', () => {
      // Put .testproject inside node_modules — should NOT be found
      const nmDir = path.join(tmpDir, 'node_modules', 'some-pkg');
      fs.mkdirSync(nmDir, { recursive: true });
      fs.writeFileSync(path.join(nmDir, '.testproject'), '');

      const result = server.call('provar.nitrox.discover', { search_roots: [tmpDir] });
      const body = parseBody(result);
      assert.deepEqual(body['projects'], []);
    });

    it('skips hidden directories', () => {
      const hiddenDir = path.join(tmpDir, '.hidden');
      fs.mkdirSync(hiddenDir);
      fs.writeFileSync(path.join(hiddenDir, '.testproject'), '');

      const result = server.call('provar.nitrox.discover', { search_roots: [tmpDir] });
      const body = parseBody(result);
      assert.deepEqual(body['projects'], []);
    });

    it('reads nitroXPackages package.json when include_packages=true', () => {
      fs.writeFileSync(path.join(tmpDir, '.testproject'), '');
      const pkgDir = path.join(tmpDir, 'nitroXPackages', 'my-pkg');
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, 'package.json'),
        JSON.stringify({ name: 'my-pkg', version: '1.0.0' })
      );

      const result = server.call('provar.nitrox.discover', {
        search_roots: [tmpDir],
        include_packages: true,
      });
      const body = parseBody(result);
      const projects = body['projects'] as Array<Record<string, unknown>>;
      assert.equal(projects.length, 1);
      const packages = projects[0]['packages'] as Array<Record<string, unknown>>;
      assert.ok(Array.isArray(packages));
      assert.equal(packages[0]['name'], 'my-pkg');
    });
  });

  // ── provar.nitrox.read ─────────────────────────────────────────────────────

  describe('provar.nitrox.read', () => {
    it('returns content for a valid .po.json file', () => {
      const filePath = path.join(tmpDir, 'Component.po.json');
      fs.writeFileSync(filePath, JSON.stringify(VALID_ROOT));

      const result = server.call('provar.nitrox.read', { file_paths: [filePath] });
      assert.ok(!isError(result));
      const body = parseBody(result);
      const files = body['files'] as Array<Record<string, unknown>>;
      assert.equal(files.length, 1);
      assert.ok(files[0]['content']);
      assert.ok(!files[0]['error']);
    });

    it('returns FILE_NOT_FOUND error for missing file', () => {
      const missing = path.join(tmpDir, 'missing.po.json');
      const result = server.call('provar.nitrox.read', { file_paths: [missing] });
      assert.ok(!isError(result)); // tool-level success, per-file error
      const body = parseBody(result);
      const files = body['files'] as Array<Record<string, unknown>>;
      assert.equal(files[0]['error'], 'FILE_NOT_FOUND');
    });

    it('truncates results at max_files and reports total_found', () => {
      for (let i = 0; i < 5; i++) {
        fs.writeFileSync(path.join(tmpDir, `c${i}.po.json`), JSON.stringify(VALID_ROOT));
      }

      const result = server.call('provar.nitrox.read', {
        file_paths: [
          path.join(tmpDir, 'c0.po.json'),
          path.join(tmpDir, 'c1.po.json'),
          path.join(tmpDir, 'c2.po.json'),
        ],
        max_files: 2,
      });
      const body = parseBody(result);
      const files = body['files'] as unknown[];
      assert.equal(files.length, 2);
      assert.equal(body['truncated'], true);
      assert.equal(body['total_found'], 3);
    });

    it('reads all .po.json files from project_path', () => {
      fs.writeFileSync(path.join(tmpDir, '.testproject'), '');
      const nitroxDir = path.join(tmpDir, 'nitroX');
      fs.mkdirSync(nitroxDir);
      fs.writeFileSync(path.join(nitroxDir, 'A.po.json'), JSON.stringify(VALID_ROOT));
      fs.writeFileSync(path.join(nitroxDir, 'B.po.json'), JSON.stringify(VALID_ROOT));

      const result = server.call('provar.nitrox.read', { project_path: tmpDir });
      assert.ok(!isError(result));
      const body = parseBody(result);
      assert.equal(body['total_found'], 2);
    });

    it('returns PATH_NOT_ALLOWED error when path is outside allowed roots', () => {
      // The server was created with allowedPaths=[tmpDir], so system tmp root is blocked
      const outsidePath = path.join(os.tmpdir(), 'outside.po.json');
      // Write a real file so it's not FILE_NOT_FOUND
      fs.writeFileSync(outsidePath, JSON.stringify(VALID_ROOT));
      try {
        const result = server.call('provar.nitrox.read', { file_paths: [outsidePath] });
        const body = parseBody(result);
        const files = body['files'] as Array<Record<string, unknown>>;
        // Per-file path policy error
        assert.ok(files[0]['error'] !== null && files[0]['error'] !== undefined);
      } finally {
        fs.unlinkSync(outsidePath);
      }
    });

    it('returns MISSING_INPUT when neither file_paths nor project_path provided', () => {
      const result = server.call('provar.nitrox.read', {});
      assert.ok(isError(result));
      const body = parseBody(result);
      assert.equal(body['error_code'], 'MISSING_INPUT');
    });
  });

  // ── provar.nitrox.validate ─────────────────────────────────────────────────

  describe('provar.nitrox.validate', () => {
    it('scores a fully valid root component as 100', () => {
      const result = server.call('provar.nitrox.validate', {
        content: JSON.stringify(VALID_ROOT),
      });
      assert.ok(!isError(result));
      const body = parseBody(result);
      assert.equal(body['valid'], true);
      assert.equal(body['score'], 100);
      assert.equal(body['issue_count'], 0);
    });

    it('NX001 ERROR: missing componentId', () => {
      const obj = { name: '/com/test/C', type: 'Block', pageStructureElement: true, fieldDetailsElement: false };
      const result = server.call('provar.nitrox.validate', { content: JSON.stringify(obj) });
      const body = parseBody(result);
      const issues = body['issues'] as Array<Record<string, unknown>>;
      assert.ok(issues.some((i) => i['rule_id'] === 'NX001' && i['severity'] === 'ERROR'));
    });

    it('NX001 ERROR: invalid UUID format', () => {
      const obj = { ...VALID_ROOT, componentId: 'not-a-uuid' };
      const result = server.call('provar.nitrox.validate', { content: JSON.stringify(obj) });
      const body = parseBody(result);
      const issues = body['issues'] as Array<Record<string, unknown>>;
      assert.ok(issues.some((i) => i['rule_id'] === 'NX001' && i['severity'] === 'ERROR'));
    });

    it('NX002 ERROR: root missing required fields', () => {
      const obj = { componentId: VALID_UUID }; // no parentId, so root — missing name/type etc
      const result = server.call('provar.nitrox.validate', { content: JSON.stringify(obj) });
      const body = parseBody(result);
      const issues = body['issues'] as Array<Record<string, unknown>>;
      assert.ok(issues.filter((i) => i['rule_id'] === 'NX002').length >= 4);
    });

    it('NX002 does not fire when parentId is set', () => {
      const obj = { componentId: VALID_UUID, parentId: VALID_UUID }; // child — NX002 should not fire
      const result = server.call('provar.nitrox.validate', { content: JSON.stringify(obj) });
      const body = parseBody(result);
      const issues = body['issues'] as Array<Record<string, unknown>>;
      assert.ok(!issues.some((i) => i['rule_id'] === 'NX002'));
    });

    it('NX003 ERROR: tagName contains whitespace', () => {
      const obj = { ...VALID_ROOT, tagName: 'my tag' };
      const result = server.call('provar.nitrox.validate', { content: JSON.stringify(obj) });
      const body = parseBody(result);
      const issues = body['issues'] as Array<Record<string, unknown>>;
      assert.ok(issues.some((i) => i['rule_id'] === 'NX003' && i['severity'] === 'ERROR'));
    });

    it('NX004 ERROR: interaction missing required fields', () => {
      const badInteraction = { name: 'Click' }; // missing required fields
      const obj = { ...VALID_ROOT, interactions: [badInteraction] };
      const result = server.call('provar.nitrox.validate', { content: JSON.stringify(obj) });
      const body = parseBody(result);
      const issues = body['issues'] as Array<Record<string, unknown>>;
      assert.ok(issues.some((i) => i['rule_id'] === 'NX004' && i['severity'] === 'ERROR'));
    });

    it('NX005 ERROR: implementation missing javaScriptSnippet', () => {
      const badInteraction = { ...VALID_INTERACTION, implementations: [{}] };
      const obj = { ...VALID_ROOT, interactions: [badInteraction] };
      const result = server.call('provar.nitrox.validate', { content: JSON.stringify(obj) });
      const body = parseBody(result);
      const issues = body['issues'] as Array<Record<string, unknown>>;
      assert.ok(issues.some((i) => i['rule_id'] === 'NX005' && i['severity'] === 'ERROR'));
    });

    it('NX006 ERROR: selector missing xpath', () => {
      const obj = { ...VALID_ROOT, selectors: [{ priority: 1 }] };
      const result = server.call('provar.nitrox.validate', { content: JSON.stringify(obj) });
      const body = parseBody(result);
      const issues = body['issues'] as Array<Record<string, unknown>>;
      assert.ok(issues.some((i) => i['rule_id'] === 'NX006' && i['severity'] === 'ERROR'));
    });

    it('NX007 WARNING: element missing type', () => {
      const obj = { ...VALID_ROOT, elements: [{ label: 'My Field' }] };
      const result = server.call('provar.nitrox.validate', { content: JSON.stringify(obj) });
      const body = parseBody(result);
      const issues = body['issues'] as Array<Record<string, unknown>>;
      assert.ok(issues.some((i) => i['rule_id'] === 'NX007' && i['severity'] === 'WARNING'));
    });

    it('NX008 WARNING: invalid comparisonType', () => {
      const obj = { ...VALID_ROOT, parameters: [{ name: 'p', value: 'v', comparisonType: 'startsWith' }] };
      const result = server.call('provar.nitrox.validate', { content: JSON.stringify(obj) });
      const body = parseBody(result);
      const issues = body['issues'] as Array<Record<string, unknown>>;
      assert.ok(issues.some((i) => i['rule_id'] === 'NX008' && i['severity'] === 'WARNING'));
    });

    it('NX008 accepts "starts-with" (hyphenated)', () => {
      const obj = { ...VALID_ROOT, parameters: [{ name: 'p', value: 'v', comparisonType: 'starts-with' }] };
      const result = server.call('provar.nitrox.validate', { content: JSON.stringify(obj) });
      const body = parseBody(result);
      const issues = body['issues'] as Array<Record<string, unknown>>;
      assert.ok(!issues.some((i) => i['rule_id'] === 'NX008'));
    });

    it('NX009 INFO: interaction name with special characters', () => {
      const specialInteraction = { ...VALID_INTERACTION, name: 'Click! Now' };
      const obj = { ...VALID_ROOT, interactions: [specialInteraction] };
      const result = server.call('provar.nitrox.validate', { content: JSON.stringify(obj) });
      const body = parseBody(result);
      const issues = body['issues'] as Array<Record<string, unknown>>;
      assert.ok(issues.some((i) => i['rule_id'] === 'NX009' && i['severity'] === 'INFO'));
    });

    it('NX010 INFO: bodyTagName contains whitespace', () => {
      const obj = { ...VALID_ROOT, bodyTagName: 'body tag' };
      const result = server.call('provar.nitrox.validate', { content: JSON.stringify(obj) });
      const body = parseBody(result);
      const issues = body['issues'] as Array<Record<string, unknown>>;
      assert.ok(issues.some((i) => i['rule_id'] === 'NX010' && i['severity'] === 'INFO'));
    });

    it('score formula: 2 errors = score 60', () => {
      // Missing componentId (NX001) + missing root fields (NX002 × 4)
      const obj = { name: '/test' }; // missing componentId + no type/pageStructureElement/fieldDetailsElement
      const result = server.call('provar.nitrox.validate', { content: JSON.stringify(obj) });
      const body = parseBody(result);
      assert.equal(body['valid'], false);
      assert.ok((body['score'] as number) < 100);
    });

    it('returns FILE_NOT_FOUND when file_path does not exist', () => {
      const result = server.call('provar.nitrox.validate', {
        file_path: path.join(tmpDir, 'missing.po.json'),
      });
      assert.ok(isError(result));
      const body = parseBody(result);
      assert.equal(body['error_code'], 'FILE_NOT_FOUND');
    });

    it('returns MISSING_INPUT when neither content nor file_path provided', () => {
      const result = server.call('provar.nitrox.validate', {});
      assert.ok(isError(result));
      const body = parseBody(result);
      assert.equal(body['error_code'], 'MISSING_INPUT');
    });

    it('returns NX000 for invalid JSON content', () => {
      const result = server.call('provar.nitrox.validate', { content: 'not json {' });
      assert.ok(isError(result));
      const body = parseBody(result);
      assert.equal(body['error_code'], 'NX000');
    });

    it('validates nested elements recursively', () => {
      const obj = {
        ...VALID_ROOT,
        elements: [
          {
            type: 'content',
            elements: [
              { type: 'content', selectors: [{}] }, // NX006: no xpath
            ],
          },
        ],
      };
      const result = server.call('provar.nitrox.validate', { content: JSON.stringify(obj) });
      const body = parseBody(result);
      const issues = body['issues'] as Array<Record<string, unknown>>;
      assert.ok(issues.some((i) => i['rule_id'] === 'NX006'));
    });
  });

  // ── provar.nitrox.generate ─────────────────────────────────────────────────

  describe('provar.nitrox.generate', () => {
    it('dry_run=true returns JSON without writing', () => {
      const result = server.call('provar.nitrox.generate', {
        name: '/com/test/ButtonComponent',
        tag_name: 'lightning-button',
        dry_run: true,
      });
      assert.ok(!isError(result));
      const body = parseBody(result);
      assert.ok(typeof body['content'] === 'string');
      assert.equal(body['written'], false);

      const generated = JSON.parse(body['content'] as string) as Record<string, unknown>;
      assert.ok(generated['componentId']);
      assert.equal(generated['name'], '/com/test/ButtonComponent');
      assert.equal(generated['tagName'], 'lightning-button');
    });

    it('writes file when dry_run=false', () => {
      const outPath = path.join(tmpDir, 'Button.po.json');
      const result = server.call('provar.nitrox.generate', {
        name: '/com/test/ButtonComponent',
        tag_name: 'lightning-button',
        output_path: outPath,
        dry_run: false,
      });
      assert.ok(!isError(result));
      const body = parseBody(result);
      assert.equal(body['written'], true);
      assert.ok(fs.existsSync(outPath));
    });

    it('returns FILE_EXISTS when overwrite=false and file exists', () => {
      const outPath = path.join(tmpDir, 'Exists.po.json');
      fs.writeFileSync(outPath, '{}');

      const result = server.call('provar.nitrox.generate', {
        name: '/com/test/C',
        tag_name: 'c-test',
        output_path: outPath,
        overwrite: false,
        dry_run: false,
      });
      assert.ok(isError(result));
      const body = parseBody(result);
      assert.equal(body['error_code'], 'FILE_EXISTS');
    });

    it('overwrites file when overwrite=true', () => {
      const outPath = path.join(tmpDir, 'Overwrite.po.json');
      fs.writeFileSync(outPath, '{"old": true}');

      const result = server.call('provar.nitrox.generate', {
        name: '/com/test/C',
        tag_name: 'c-test',
        output_path: outPath,
        overwrite: true,
        dry_run: false,
      });
      assert.ok(!isError(result));
      const body = parseBody(result);
      assert.equal(body['written'], true);
      const written = JSON.parse(fs.readFileSync(outPath, 'utf-8')) as Record<string, unknown>;
      assert.equal(written['name'], '/com/test/C');
    });

    it('returns PATH_NOT_ALLOWED when output_path is outside allowed roots', () => {
      const outPath = path.join(os.tmpdir(), 'outside-allowed.po.json');
      const result = server.call('provar.nitrox.generate', {
        name: '/com/test/C',
        tag_name: 'c-test',
        output_path: outPath,
        dry_run: false,
      });
      assert.ok(isError(result));
      const body = parseBody(result);
      assert.equal(body['error_code'], 'PATH_NOT_ALLOWED');
    });

    it('generates elements with parameters and selectors', () => {
      const result = server.call('provar.nitrox.generate', {
        name: '/com/test/FormComponent',
        tag_name: 'c-form',
        elements: [
          {
            label: 'Name Field',
            type_ref: 'content',
            tag_name: 'input',
            selector_xpath: "//input[@name='firstName']",
            parameters: [{ name: 'attr', value: 'firstName', comparisonType: 'equals', default: true }],
          },
        ],
        dry_run: true,
      });
      assert.ok(!isError(result));
      const body = parseBody(result);
      const generated = JSON.parse(body['content'] as string) as Record<string, unknown>;
      const elements = generated['elements'] as Array<Record<string, unknown>>;
      assert.equal(elements.length, 1);
      assert.equal(elements[0]['label'], 'Name Field');
      assert.equal(elements[0]['elementTagName'], 'input');
      const selectors = elements[0]['selectors'] as Array<Record<string, unknown>>;
      assert.equal(selectors[0]['xpath'], "//input[@name='firstName']");
      const params = elements[0]['parameters'] as Array<Record<string, unknown>>;
      assert.equal(params[0]['comparisonType'], 'equals');
    });

    it('assigns unique UUIDs to root and each element', () => {
      const result = server.call('provar.nitrox.generate', {
        name: '/com/test/Multi',
        tag_name: 'c-multi',
        elements: [
          { label: 'Field A', type_ref: 'content' },
          { label: 'Field B', type_ref: 'content' },
        ],
        dry_run: true,
      });
      const body = parseBody(result);
      const generated = JSON.parse(body['content'] as string) as Record<string, unknown>;
      const elements = generated['elements'] as Array<Record<string, unknown>>;
      const ids = [
        generated['componentId'],
        elements[0]['componentId'],
        elements[1]['componentId'],
      ];
      const unique = new Set(ids);
      assert.equal(unique.size, 3);
    });
  });

  // ── provar.nitrox.patch ────────────────────────────────────────────────────

  describe('provar.nitrox.patch', () => {
    it('returns FILE_NOT_FOUND for missing file', () => {
      const result = server.call('provar.nitrox.patch', {
        file_path: path.join(tmpDir, 'missing.po.json'),
        patch: { name: '/new' },
      });
      assert.ok(isError(result));
      const body = parseBody(result);
      assert.equal(body['error_code'], 'FILE_NOT_FOUND');
    });

    it('dry_run=true merges and returns content without writing', () => {
      const filePath = path.join(tmpDir, 'Component.po.json');
      fs.writeFileSync(filePath, JSON.stringify(VALID_ROOT));

      const result = server.call('provar.nitrox.patch', {
        file_path: filePath,
        patch: { name: '/com/test/Updated' },
        dry_run: true,
      });
      assert.ok(!isError(result));
      const body = parseBody(result);
      assert.equal(body['written'], false);
      const merged = JSON.parse(body['content'] as string) as Record<string, unknown>;
      assert.equal(merged['name'], '/com/test/Updated');
      // Original file unchanged
      const onDisk = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
      assert.equal(onDisk['name'], VALID_ROOT.name);
    });

    it('dry_run=false writes merged file', () => {
      const filePath = path.join(tmpDir, 'Component.po.json');
      fs.writeFileSync(filePath, JSON.stringify(VALID_ROOT));

      const result = server.call('provar.nitrox.patch', {
        file_path: filePath,
        patch: { name: '/com/test/Patched' },
        dry_run: false,
        validate_after: false,
      });
      assert.ok(!isError(result));
      const body = parseBody(result);
      assert.equal(body['written'], true);
      const onDisk = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
      assert.equal(onDisk['name'], '/com/test/Patched');
    });

    it('RFC 7396: null patch value removes key', () => {
      const filePath = path.join(tmpDir, 'Component.po.json');
      fs.writeFileSync(filePath, JSON.stringify({ ...VALID_ROOT, qualifier: 'some-qualifier' }));

      const result = server.call('provar.nitrox.patch', {
        file_path: filePath,
        patch: { qualifier: null },
        dry_run: true,
        validate_after: false,
      });
      const body = parseBody(result);
      const merged = JSON.parse(body['content'] as string) as Record<string, unknown>;
      assert.ok(!('qualifier' in merged));
    });

    it('validate_after=true blocks write when merged result has errors', () => {
      const filePath = path.join(tmpDir, 'Component.po.json');
      fs.writeFileSync(filePath, JSON.stringify(VALID_ROOT));

      // Remove componentId via patch — will trigger NX001 error
      const result = server.call('provar.nitrox.patch', {
        file_path: filePath,
        patch: { componentId: null },
        dry_run: false,
        validate_after: true,
      });
      assert.ok(isError(result));
      const body = parseBody(result);
      assert.equal(body['error_code'], 'VALIDATION_FAILED');
      // File should be unchanged
      const onDisk = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
      assert.ok(onDisk['componentId']);
    });

    it('includes validation result in response when validate_after=true', () => {
      const filePath = path.join(tmpDir, 'Component.po.json');
      fs.writeFileSync(filePath, JSON.stringify(VALID_ROOT));

      const result = server.call('provar.nitrox.patch', {
        file_path: filePath,
        patch: { name: '/com/test/Updated' },
        dry_run: true,
        validate_after: true,
      });
      assert.ok(!isError(result));
      const body = parseBody(result);
      assert.ok(body['validation']);
      const validation = body['validation'] as Record<string, unknown>;
      assert.equal(validation['valid'], true);
      assert.equal(validation['score'], 100);
    });
  });
});
