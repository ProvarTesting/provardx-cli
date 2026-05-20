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
import {
  registerPropertiesGenerate,
  registerPropertiesRead,
  registerPropertiesSet,
  registerPropertiesValidate,
  setSfConfigDirForTesting,
} from '../../../src/mcp/tools/propertiesTools.js';
import type { ServerConfig } from '../../../src/mcp/server.js';

// ── Minimal McpServer mock ─────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => unknown;

class MockMcpServer {
  private handlers = new Map<string, ToolHandler>();

  // Matches the McpServer.tool() overload used in propertiesTools.ts
  public tool(name: string, _description: string, _schema: unknown, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  public registerTool(name: string, _config: unknown, handler: ToolHandler): void {
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

/** Minimal valid properties object (passes validateProperties with no errors). */
function validProps(): Record<string, unknown> {
  return {
    provarHome: '/opt/provar',
    projectPath: '/projects/my-project',
    resultsPath: '/results',
    resultsPathDisposition: 'Replace',
    testOutputLevel: 'BASIC',
    pluginOutputlevel: 'WARNING',
    metadata: {
      metadataLevel: 'Reuse',
      cachePath: '/results/metadata',
    },
    environment: {
      testEnvironment: 'default',
      webBrowser: 'Chrome_Headless',
      webBrowserConfig: 'default',
      webBrowserProviderName: 'Desktop',
      webBrowserDeviceName: 'Full HD',
    },
  };
}

// ── Test setup ─────────────────────────────────────────────────────────────────

let tmpDir: string;
let server: MockMcpServer;
let config: ServerConfig;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'props-test-'));
  server = new MockMcpServer();
  config = { allowedPaths: [tmpDir] };

  registerPropertiesGenerate(server as never, config);
  registerPropertiesRead(server as never, config);
  registerPropertiesSet(server as never, config);
  registerPropertiesValidate(server as never, config);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── provar_properties_generate ────────────────────────────────────────────────

describe('provar_properties_generate', () => {
  it('dry_run returns content without writing to disk', () => {
    const outPath = path.join(tmpDir, 'dry.json');
    const result = server.call('provar_properties_generate', { output_path: outPath, dry_run: true });

    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.equal(body['written'], false);
    assert.equal(body['dry_run'], true);
    assert.ok(body['content'], 'content should be present');
    assert.equal(fs.existsSync(outPath), false, 'file must not be written in dry_run mode');
  });

  it('writes file to disk when dry_run is false', () => {
    const outPath = path.join(tmpDir, 'props.json');
    const result = server.call('provar_properties_generate', { output_path: outPath, dry_run: false });

    assert.equal(isError(result), false);
    assert.equal(fs.existsSync(outPath), true, 'file should be written');
    const body = parseText(result);
    assert.equal(body['written'], true);
  });

  it('pre-fills projectPath and provarHome when provided', () => {
    const outPath = path.join(tmpDir, 'pre-filled.json');
    server.call('provar_properties_generate', {
      output_path: outPath,
      project_path: '/my/project',
      provar_home: '/opt/provar',
      dry_run: false,
    });

    const written = JSON.parse(fs.readFileSync(outPath, 'utf-8')) as Record<string, unknown>;
    assert.equal(written['projectPath'], '/my/project');
    assert.equal(written['provarHome'], '/opt/provar');
  });

  it('returns FILE_EXISTS when file already exists and overwrite=false', () => {
    const outPath = path.join(tmpDir, 'existing.json');
    fs.writeFileSync(outPath, '{}', 'utf-8');

    const result = server.call('provar_properties_generate', { output_path: outPath, overwrite: false });

    assert.equal(isError(result), true);
    const body = parseText(result);
    assert.equal(body['error_code'], 'FILE_EXISTS');
  });

  it('overwrites when overwrite=true and file exists', () => {
    const outPath = path.join(tmpDir, 'overwrite.json');
    fs.writeFileSync(outPath, '{"old":true}', 'utf-8');

    const result = server.call('provar_properties_generate', { output_path: outPath, overwrite: true });

    assert.equal(isError(result), false);
    const written = JSON.parse(fs.readFileSync(outPath, 'utf-8')) as Record<string, unknown>;
    assert.ok(!('old' in written), 'old content should be replaced');
  });

  it('includes next_steps hint after writing the file', () => {
    const outPath = path.join(tmpDir, 'props-nextsteps.json');
    const result = server.call('provar_properties_generate', { output_path: outPath, dry_run: false });

    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.ok(typeof body['next_steps'] === 'string', 'next_steps should be present');
    assert.ok(body['next_steps'].includes('provar_automation_config_load'), 'next_steps should mention config.load');
  });

  it('includes next_steps hint even on dry_run', () => {
    const outPath = path.join(tmpDir, 'props-dry.json');
    const result = server.call('provar_properties_generate', { output_path: outPath, dry_run: true });

    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.ok(typeof body['next_steps'] === 'string');
    assert.ok(body['next_steps'].includes('provar_automation_config_load'));
  });

  it('returns INVALID_PATH when output_path does not end with .json', () => {
    const outPath = path.join(tmpDir, 'props.txt');
    const result = server.call('provar_properties_generate', { output_path: outPath, dry_run: true });

    assert.equal(isError(result), true);
    const body = parseText(result);
    assert.equal(body['error_code'], 'INVALID_PATH');
  });

  it('returns PATH_NOT_ALLOWED when path is outside allowedPaths', () => {
    const outPath = path.join(os.tmpdir(), 'escape.json');
    // Recreate server with a strict allowed path that does not include os.tmpdir() itself
    const strictConfig: ServerConfig = { allowedPaths: [tmpDir] };
    const strictServer = new MockMcpServer();
    registerPropertiesGenerate(strictServer as never, strictConfig);

    // outPath resolves to os.tmpdir()/escape.json — outside tmpDir
    const result = strictServer.call('provar_properties_generate', { output_path: outPath, dry_run: true });

    assert.equal(isError(result), true);
    const body = parseText(result);
    assert.ok(
      body['error_code'] === 'PATH_NOT_ALLOWED' || body['error_code'] === 'PATH_TRAVERSAL',
      `Unexpected error_code: ${body['error_code'] as string}`
    );
  });
});

// ── provar_properties_read ────────────────────────────────────────────────────

describe('provar_properties_read', () => {
  it('returns parsed content for a valid JSON file', () => {
    const filePath = path.join(tmpDir, 'props.json');
    const props = { provarHome: '/opt/provar', projectPath: '/proj' };
    fs.writeFileSync(filePath, JSON.stringify(props), 'utf-8');

    const result = server.call('provar_properties_read', { file_path: filePath });

    assert.equal(isError(result), false);
    const body = parseText(result);
    const content = body['content'] as Record<string, unknown>;
    assert.equal(content['provarHome'], '/opt/provar');
    assert.equal(content['projectPath'], '/proj');
  });

  it('returns PROPERTIES_FILE_NOT_FOUND when file does not exist', () => {
    const result = server.call('provar_properties_read', {
      file_path: path.join(tmpDir, 'missing.json'),
    });

    assert.equal(isError(result), true);
    const body = parseText(result);
    assert.equal(body['error_code'], 'PROPERTIES_FILE_NOT_FOUND');
    assert.ok((body['message'] as string).includes('provar_properties_generate'), 'suggestion should mention generate');
  });

  it('surfaces divergence warning when active sf config points to a different file with different values', () => {
    // "disk" file — the one we're about to read
    const diskFile = path.join(tmpDir, 'props-disk.json');
    fs.writeFileSync(diskFile, JSON.stringify({ provarHome: '/disk/provar', projectPath: '/disk/proj' }), 'utf-8');

    // "active" file — what config.load registered
    const activeFile = path.join(tmpDir, 'props-active.json');
    fs.writeFileSync(
      activeFile,
      JSON.stringify({ provarHome: '/active/provar', projectPath: '/active/proj' }),
      'utf-8'
    );

    // Write a temp sf config pointing to the active file
    const sfDir = path.join(tmpDir, '.sf');
    fs.mkdirSync(sfDir, { recursive: true });
    fs.writeFileSync(
      path.join(sfDir, 'config.json'),
      JSON.stringify({ PROVARDX_PROPERTIES_FILE_PATH: activeFile }),
      'utf-8'
    );

    setSfConfigDirForTesting(sfDir);
    try {
      const result = server.call('provar_properties_read', { file_path: diskFile });

      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.ok(body['details'], 'details should be present');
      const details = body['details'] as Record<string, unknown>;
      assert.ok(typeof details['warning'] === 'string', 'details.warning should be a string');
      assert.ok(
        typeof details['warning'] === 'string' && details['warning'].includes('provarHome'),
        'warning should mention the divergent key'
      );
    } finally {
      setSfConfigDirForTesting(null);
    }
  });

  it('does not surface divergence warning when reading the same file that is active', () => {
    const filePath = path.join(tmpDir, 'props.json');
    const props = { provarHome: '/opt/provar', projectPath: '/proj' };
    fs.writeFileSync(filePath, JSON.stringify(props), 'utf-8');

    // Active file points to the same file
    const sfDir = path.join(tmpDir, '.sf');
    fs.mkdirSync(sfDir, { recursive: true });
    fs.writeFileSync(
      path.join(sfDir, 'config.json'),
      JSON.stringify({ PROVARDX_PROPERTIES_FILE_PATH: filePath }),
      'utf-8'
    );

    setSfConfigDirForTesting(sfDir);
    try {
      const result = server.call('provar_properties_read', { file_path: filePath });

      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.ok(!body['details'], 'details should be absent when no divergence');
    } finally {
      setSfConfigDirForTesting(null);
    }
  });

  it('returns MALFORMED_JSON when file contains invalid JSON', () => {
    const filePath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(filePath, '{ not valid json }', 'utf-8');

    const result = server.call('provar_properties_read', { file_path: filePath });

    assert.equal(isError(result), true);
    assert.equal(parseText(result)['error_code'], 'MALFORMED_JSON');
  });

  it('returns PATH_NOT_ALLOWED for path outside allowedPaths', () => {
    const strictServer = new MockMcpServer();
    registerPropertiesRead(strictServer as never, { allowedPaths: [tmpDir] });

    const result = strictServer.call('provar_properties_read', {
      file_path: '/etc/passwd',
    });

    assert.equal(isError(result), true);
    const code = parseText(result)['error_code'] as string;
    assert.ok(code === 'PATH_NOT_ALLOWED' || code === 'PATH_TRAVERSAL', `Unexpected: ${code}`);
  });
});

// ── provar_properties_set ─────────────────────────────────────────────────────

describe('provar_properties_set', () => {
  it('partial update preserves unmodified fields (deep merge)', () => {
    const filePath = path.join(tmpDir, 'props.json');
    const initial = {
      provarHome: '/opt/provar',
      projectPath: '/proj',
      environment: {
        webBrowser: 'Chrome',
        webBrowserConfig: 'default',
        webBrowserProviderName: 'Desktop',
        webBrowserDeviceName: 'HD',
      },
    };
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), 'utf-8');

    const result = server.call('provar_properties_set', {
      file_path: filePath,
      updates: { provarHome: '/opt/provar-2' },
    });

    assert.equal(isError(result), false);
    const written = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    assert.equal(written['provarHome'], '/opt/provar-2');
    assert.equal(written['projectPath'], '/proj', 'projectPath must be preserved');
  });

  it('deep merges environment object — does not replace sibling keys', () => {
    const filePath = path.join(tmpDir, 'env.json');
    const initial = {
      provarHome: '/provar',
      environment: {
        webBrowser: 'Chrome',
        webBrowserConfig: 'old-config',
        webBrowserProviderName: 'Desktop',
        webBrowserDeviceName: 'HD',
      },
    };
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), 'utf-8');

    server.call('provar_properties_set', {
      file_path: filePath,
      updates: { environment: { webBrowser: 'Firefox' } },
    });

    const written = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    const env = written['environment'] as Record<string, unknown>;
    assert.equal(env['webBrowser'], 'Firefox');
    assert.equal(env['webBrowserConfig'], 'old-config', 'sibling key must be preserved via deep merge');
  });

  it('array fields replace the existing value entirely', () => {
    const filePath = path.join(tmpDir, 'arrays.json');
    fs.writeFileSync(
      filePath,
      JSON.stringify({ provarHome: '/provar', testCase: ['old/test1.testcase'] }, null, 2),
      'utf-8'
    );

    server.call('provar_properties_set', {
      file_path: filePath,
      updates: { testCase: ['new/test2.testcase'] },
    });

    const written = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    assert.deepEqual(written['testCase'], ['new/test2.testcase']);
  });

  it('returns PROPERTIES_FILE_NOT_FOUND when file does not exist', () => {
    const result = server.call('provar_properties_set', {
      file_path: path.join(tmpDir, 'ghost.json'),
      updates: { provarHome: '/x' },
    });

    assert.equal(isError(result), true);
    assert.equal(parseText(result)['error_code'], 'PROPERTIES_FILE_NOT_FOUND');
  });

  it('returns PATH_NOT_ALLOWED for path outside allowedPaths', () => {
    const strictServer = new MockMcpServer();
    registerPropertiesSet(strictServer as never, { allowedPaths: [tmpDir] });

    const result = strictServer.call('provar_properties_set', {
      file_path: '/etc/hosts',
      updates: { provarHome: '/evil' },
    });

    assert.equal(isError(result), true);
    const code = parseText(result)['error_code'] as string;
    assert.ok(code === 'PATH_NOT_ALLOWED' || code === 'PATH_TRAVERSAL', `Unexpected: ${code}`);
  });
});

// ── provar_properties_validate ────────────────────────────────────────────────

describe('provar_properties_validate', () => {
  it('is_valid=true for a fully-populated valid properties object (inline content)', () => {
    const result = server.call('provar_properties_validate', {
      content: JSON.stringify(validProps()),
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.equal(body['is_valid'], true);
    assert.equal(body['error_count'], 0);
  });

  it('reports error for missing required field provarHome', () => {
    const props = validProps();
    delete props['provarHome'];

    const result = server.call('provar_properties_validate', { content: JSON.stringify(props) });

    const body = parseText(result);
    assert.equal(body['is_valid'], false);
    const errors = body['errors'] as Array<{ field: string }>;
    assert.ok(
      errors.some((e) => e.field === 'provarHome'),
      'Expected error for provarHome'
    );
  });

  it('reports warning for placeholder value ${PROVAR_HOME}', () => {
    const props = validProps();
    props['provarHome'] = '${PROVAR_HOME}';

    const result = server.call('provar_properties_validate', { content: JSON.stringify(props) });

    const body = parseText(result);
    assert.ok((body['warning_count'] as number) > 0, 'Expected at least one warning');
    const warnings = body['warnings'] as Array<{ field: string; severity: string }>;
    assert.ok(
      warnings.some((w) => w.field === 'provarHome' && w.severity === 'warning'),
      'Expected a warning for provarHome placeholder'
    );
  });

  it('accepts inline content without file_path', () => {
    const result = server.call('provar_properties_validate', {
      content: JSON.stringify(validProps()),
    });
    assert.equal(isError(result), false);
    assert.equal((parseText(result) as { is_valid: boolean })['is_valid'], true);
  });

  it('validates via file_path when provided', () => {
    const filePath = path.join(tmpDir, 'valid.json');
    fs.writeFileSync(filePath, JSON.stringify(validProps()), 'utf-8');

    const result = server.call('provar_properties_validate', { file_path: filePath });

    assert.equal(isError(result), false);
    assert.equal((parseText(result) as { is_valid: boolean })['is_valid'], true);
  });

  it('returns MISSING_INPUT when neither file_path nor content is provided', () => {
    const result = server.call('provar_properties_validate', {});

    assert.equal(isError(result), true);
    assert.equal(parseText(result)['error_code'], 'MISSING_INPUT');
  });

  it('returns PROPERTIES_FILE_NOT_FOUND when file_path points to a missing file', () => {
    const result = server.call('provar_properties_validate', {
      file_path: path.join(tmpDir, 'nope.json'),
    });

    assert.equal(isError(result), true);
    assert.equal(parseText(result)['error_code'], 'PROPERTIES_FILE_NOT_FOUND');
  });

  it('returns is_valid=false with root-level error for malformed JSON content', () => {
    const result = server.call('provar_properties_validate', { content: '{ broken json' });

    assert.equal(isError(result), false, 'validate returns a result, not an error response');
    const body = parseText(result);
    assert.equal(body['is_valid'], false);
    assert.equal(body['error_count'], 1);
  });

  it('flags invalid webBrowser enum value', () => {
    const props = validProps();
    (props['environment'] as Record<string, unknown>)['webBrowser'] = 'Netscape';

    const result = server.call('provar_properties_validate', { content: JSON.stringify(props) });

    const body = parseText(result);
    assert.equal(body['is_valid'], false);
    const errors = body['errors'] as Array<{ field: string }>;
    assert.ok(
      errors.some((e) => e.field === 'environment.webBrowser'),
      'Expected error on environment.webBrowser'
    );
  });

  it('flags invalid metadataLevel enum value', () => {
    const props = validProps();
    (props['metadata'] as Record<string, unknown>)['metadataLevel'] = 'Nuke';

    const result = server.call('provar_properties_validate', { content: JSON.stringify(props) });

    const body = parseText(result);
    assert.equal(body['is_valid'], false);
    const errors = body['errors'] as Array<{ field: string }>;
    assert.ok(
      errors.some((e) => e.field === 'metadata.metadataLevel'),
      'Expected error on metadata.metadataLevel'
    );
  });

  // ── SCHEMA-001: unknown-key detection (PDX-486 VALIDATE-TYPO-A) ──────────────

  describe('SCHEMA-001 unknown-key detection', () => {
    it('fires for unknown top-level key with did-you-mean suggestion within distance 2', () => {
      const props = validProps();
      // Classic typo: testCases (plural) vs canonical testCase
      props['testCases'] = ['tests/foo.testcase'];

      const result = server.call('provar_properties_validate', { content: JSON.stringify(props) });

      const body = parseText(result);
      const warnings = body['warnings'] as Array<{ field: string; message: string; severity: string }>;
      const w = warnings.find((x) => x.field === 'testCases');
      assert.ok(w, 'Expected SCHEMA-001 warning for testCases');
      assert.ok(w.message.includes('SCHEMA-001'), 'Warning should reference SCHEMA-001');
      assert.ok(w.message.includes("Unknown field 'testCases'"), 'Warning should name the offending key');
      assert.ok(w.message.includes('top-level'), 'Warning should label the scope as top-level');
      assert.ok(w.message.includes("'testCase'"), `Expected "did you mean 'testCase'" suggestion, got: ${w.message}`);
    });

    it("fires for unknown metadata.* key (e.g. 'metadataLvel') with suggestion", () => {
      const props = validProps();
      (props['metadata'] as Record<string, unknown>)['metadataLvel'] = 'Reuse';

      const result = server.call('provar_properties_validate', { content: JSON.stringify(props) });

      const body = parseText(result);
      const warnings = body['warnings'] as Array<{ field: string; message: string }>;
      const w = warnings.find((x) => x.field === 'metadata.metadataLvel');
      assert.ok(w, 'Expected SCHEMA-001 warning for metadata.metadataLvel');
      assert.ok(w.message.includes('SCHEMA-001'));
      assert.ok(w.message.includes('metadata'), 'Warning should label the scope as metadata');
      assert.ok(w.message.includes("'metadataLevel'"), `Expected suggestion, got: ${w.message}`);
    });

    it("fires for unknown environment.* key (e.g. 'testEnvironments' → testEnvironment)", () => {
      const props = validProps();
      (props['environment'] as Record<string, unknown>)['testEnvironments'] = 'QA';

      const result = server.call('provar_properties_validate', { content: JSON.stringify(props) });

      const body = parseText(result);
      const warnings = body['warnings'] as Array<{ field: string; message: string }>;
      const w = warnings.find((x) => x.field === 'environment.testEnvironments');
      assert.ok(w, 'Expected SCHEMA-001 warning for environment.testEnvironments');
      assert.ok(w.message.includes('SCHEMA-001'));
      assert.ok(w.message.includes('environment'));
      assert.ok(w.message.includes("'testEnvironment'"), `Expected testEnvironment suggestion, got: ${w.message}`);
    });

    it('does NOT fire SCHEMA-001 for known top-level / metadata / environment keys', () => {
      const result = server.call('provar_properties_validate', { content: JSON.stringify(validProps()) });

      const body = parseText(result);
      const warnings = body['warnings'] as Array<{ message: string }>;
      assert.ok(
        warnings.every((w) => !w.message.includes('SCHEMA-001')),
        `Expected zero SCHEMA-001 warnings on a valid file, got: ${JSON.stringify(warnings)}`
      );
    });

    it('emits SCHEMA-001 with no "Did you mean" when no canonical key is within distance 2', () => {
      const props = validProps();
      props['totallyUnrelatedKey'] = 'x';

      const result = server.call('provar_properties_validate', { content: JSON.stringify(props) });

      const body = parseText(result);
      const warnings = body['warnings'] as Array<{ field: string; message: string }>;
      const w = warnings.find((x) => x.field === 'totallyUnrelatedKey');
      assert.ok(w, 'Expected SCHEMA-001 warning for totallyUnrelatedKey');
      assert.ok(w.message.includes('SCHEMA-001'));
      assert.ok(!w.message.includes('Did you mean'), `Should not include suggestion, got: ${w.message}`);
    });

    it('is_valid stays true when the only issues are SCHEMA-001 warnings (no errors)', () => {
      const props = validProps();
      props['testCases'] = ['x'];

      const result = server.call('provar_properties_validate', { content: JSON.stringify(props) });

      const body = parseText(result);
      assert.equal(body['is_valid'], true, 'Unknown keys are warnings only — is_valid must remain true');
      assert.equal(body['error_count'], 0);
      assert.ok((body['warning_count'] as number) >= 1);
    });

    it("loads test/fixtures/properties/testcases-typo.json and reports SCHEMA-001 with 'testCase' suggestion", () => {
      // Tests run from the repo root via wireit/yarn; resolve relative to cwd to avoid ESM __dirname.
      const fixturePath = path.resolve(process.cwd(), 'test', 'fixtures', 'properties', 'testcases-typo.json');
      const content = fs.readFileSync(fixturePath, 'utf-8');

      const result = server.call('provar_properties_validate', { content });

      const body = parseText(result);
      assert.equal(body['is_valid'], true, 'Fixture should pass structural validation (warnings only)');
      const warnings = body['warnings'] as Array<{ field: string; message: string }>;
      const w = warnings.find((x) => x.field === 'testCases');
      assert.ok(w, 'Expected SCHEMA-001 warning for the testCases typo in the fixture');
      assert.ok(w.message.includes("Did you mean 'testCase'?"), `Expected suggestion, got: ${w.message}`);
    });
  });
});
