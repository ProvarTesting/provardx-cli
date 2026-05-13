/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { strict as assert } from 'node:assert';
import { describe, it, afterEach } from 'mocha';
import { parseActiveGroups } from '../../../src/mcp/server.js';
import { desc } from '../../../src/mcp/tools/descHelper.js';
import { registerTestSuiteValidate } from '../../../src/mcp/tools/testSuiteValidate.js';
import { registerAllNitroXTools } from '../../../src/mcp/tools/nitroXTools.js';
import { registerProjectInspect } from '../../../src/mcp/tools/projectInspect.js';

// ── Minimal McpServer mock ─────────────────────────────────────────────────────

type ToolConfig = { title?: string; description: string; inputSchema: unknown };

class MockMcpServer {
  public readonly registered = new Map<string, ToolConfig>();

  public registerTool(name: string, config: ToolConfig): void {
    this.registered.set(name, config);
  }
}

const MOCK_CONFIG = { allowedPaths: ['/tmp'] };

// ── PDX-468: desc() helper ────────────────────────────────────────────────────

describe('desc() helper (PDX-468)', () => {
  afterEach(() => {
    delete process.env['PROVAR_MCP_SCHEMA_MODE'];
  });

  it('returns standard string when PROVAR_MCP_SCHEMA_MODE is unset', () => {
    assert.equal(desc('standard text', 'compact text'), 'standard text');
  });

  it('returns compact string when PROVAR_MCP_SCHEMA_MODE=compact', () => {
    process.env['PROVAR_MCP_SCHEMA_MODE'] = 'compact';
    assert.equal(desc('standard text', 'compact text'), 'compact text');
  });

  it('returns standard string for any value other than "compact"', () => {
    process.env['PROVAR_MCP_SCHEMA_MODE'] = 'verbose';
    assert.equal(desc('standard text', 'compact text'), 'standard text');
  });
});

// ── PDX-468: compact descriptions in registered tools ─────────────────────────

describe('compact tool descriptions (PDX-468)', () => {
  afterEach(() => {
    delete process.env['PROVAR_MCP_SCHEMA_MODE'];
  });

  it('registers standard description when PROVAR_MCP_SCHEMA_MODE is unset', () => {
    const mock = new MockMcpServer();
    registerTestSuiteValidate(mock as never);
    const cfg = mock.registered.get('provar_testsuite_validate');
    assert.ok(cfg, 'provar_testsuite_validate should be registered');
    assert.ok(cfg.description.length > 50, 'standard description should be multi-sentence (>50 chars)');
    assert.ok(cfg.description.includes('checks for empty suites'), 'standard description should include detail text');
  });

  it('registers compact description when PROVAR_MCP_SCHEMA_MODE=compact', () => {
    process.env['PROVAR_MCP_SCHEMA_MODE'] = 'compact';
    const mock = new MockMcpServer();
    registerTestSuiteValidate(mock as never);
    const cfg = mock.registered.get('provar_testsuite_validate');
    assert.ok(cfg, 'provar_testsuite_validate should be registered');
    assert.ok(
      cfg.description.length <= 100,
      `compact description should be short (≤100 chars), got ${cfg.description.length}`
    );
    assert.ok(
      !cfg.description.includes('checks for empty suites'),
      'compact description should not contain prose detail'
    );
  });

  it('reverts to standard description when PROVAR_MCP_SCHEMA_MODE is unrecognised', () => {
    process.env['PROVAR_MCP_SCHEMA_MODE'] = 'verbose';
    const mock = new MockMcpServer();
    registerTestSuiteValidate(mock as never);
    const cfg = mock.registered.get('provar_testsuite_validate');
    assert.ok(cfg, 'provar_testsuite_validate should be registered');
    assert.ok(cfg.description.includes('checks for empty suites'), 'should fall back to standard for unknown mode');
  });
});

// ── PDX-469: parseActiveGroups() ──────────────────────────────────────────────

describe('parseActiveGroups() (PDX-469)', () => {
  afterEach(() => {
    delete process.env['PROVAR_MCP_TOOLS'];
  });

  it('returns null when env var is unset (all groups active)', () => {
    assert.equal(parseActiveGroups(), null);
  });

  it('returns null when env var is empty string', () => {
    process.env['PROVAR_MCP_TOOLS'] = '';
    assert.equal(parseActiveGroups(), null);
  });

  it('returns null when env var is whitespace only', () => {
    process.env['PROVAR_MCP_TOOLS'] = '   ';
    assert.equal(parseActiveGroups(), null);
  });

  it('returns a Set with a single group name (lowercased)', () => {
    process.env['PROVAR_MCP_TOOLS'] = 'nitroX';
    const groups = parseActiveGroups();
    assert.ok(groups instanceof Set);
    assert.equal(groups.size, 1);
    assert.ok(groups.has('nitrox'));
  });

  it('returns a Set with multiple group names (lowercased)', () => {
    process.env['PROVAR_MCP_TOOLS'] = 'nitroX,validation';
    const groups = parseActiveGroups();
    assert.ok(groups instanceof Set);
    assert.equal(groups.size, 2);
    assert.ok(groups.has('nitrox'));
    assert.ok(groups.has('validation'));
  });

  it('trims whitespace around group names', () => {
    process.env['PROVAR_MCP_TOOLS'] = ' nitroX , validation ';
    const groups = parseActiveGroups();
    assert.ok(groups instanceof Set);
    assert.ok(groups.has('nitrox'));
    assert.ok(groups.has('validation'));
  });

  it('ignores empty segments from trailing commas', () => {
    process.env['PROVAR_MCP_TOOLS'] = 'nitroX,';
    const groups = parseActiveGroups();
    assert.ok(groups instanceof Set);
    assert.equal(groups.size, 1);
    assert.ok(groups.has('nitrox'));
  });

  it('returns null when env var is only a comma (no valid group names)', () => {
    process.env['PROVAR_MCP_TOOLS'] = ',';
    assert.equal(parseActiveGroups(), null);
  });

  it('returns null when env var is only commas (no valid group names)', () => {
    process.env['PROVAR_MCP_TOOLS'] = ',,';
    assert.equal(parseActiveGroups(), null);
  });
});

// ── PDX-469: tool profile registration ────────────────────────────────────────

describe('tool profile registration (PDX-469)', () => {
  afterEach(() => {
    delete process.env['PROVAR_MCP_TOOLS'];
  });

  it('registers nitroX tools when profile includes nitrox', () => {
    process.env['PROVAR_MCP_TOOLS'] = 'nitroX';
    const mock = new MockMcpServer();
    registerAllNitroXTools(mock as never, MOCK_CONFIG);
    assert.ok(mock.registered.has('provar_nitrox_discover'), 'nitrox tools should be registered');
    assert.ok(mock.registered.has('provar_nitrox_generate'), 'nitrox generate should be registered');
  });

  it('registers inspect tools independently of profile (direct call)', () => {
    process.env['PROVAR_MCP_TOOLS'] = 'nitrox';
    const mock = new MockMcpServer();
    registerProjectInspect(mock as never, MOCK_CONFIG);
    assert.ok(mock.registered.has('provar_project_inspect'));
  });

  it('provardx_ping group is not in parseActiveGroups — it is always registered separately', () => {
    process.env['PROVAR_MCP_TOOLS'] = 'nitrox';
    const groups = parseActiveGroups();
    assert.ok(groups !== null, 'groups should be a Set when PROVAR_MCP_TOOLS is set');
    assert.ok(!groups.has('ping'), 'ping is not a filterable group');
  });
});
