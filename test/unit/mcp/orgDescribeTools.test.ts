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
  registerOrgDescribe,
  discoverWorkspace,
  projectNameDashes,
  workspaceCandidates,
} from '../../../src/mcp/tools/orgDescribeTools.js';
import type { ServerConfig } from '../../../src/mcp/server.js';

// ── Minimal McpServer mock ─────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseText(result: unknown): Record<string, unknown> {
  const r = result as { content: Array<{ type: string; text: string }> };
  return JSON.parse(r.content[0].text) as Record<string, unknown>;
}

function isError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true;
}

interface CachedField {
  name: string;
  type: string;
  defaultValue: string | null;
  nillable: boolean;
}

/** Write a JSON cache file for one object. */
function writeJsonCache(connectionDir: string, objectName: string, fields: CachedField[]): void {
  fs.mkdirSync(connectionDir, { recursive: true });
  fs.writeFileSync(
    path.join(connectionDir, `${objectName}.json`),
    JSON.stringify({ name: objectName, fields }),
    'utf-8'
  );
}

// ── Test setup ─────────────────────────────────────────────────────────────────

let tmpRoot: string;
let projectPath: string;
let server: MockMcpServer;
let config: ServerConfig;

beforeEach(() => {
  // Use realpathSync to canonicalise the path on macOS (/var → /private/var) so
  // assertPathAllowed comparisons match the realpath the policy resolves to.
  tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'org-describe-test-')));
  projectPath = path.join(tmpRoot, 'MyProject');
  fs.mkdirSync(projectPath, { recursive: true });

  server = new MockMcpServer();
  // tmpRoot must be allowed so both the project path and any sibling workspace
  // candidate (also under tmpRoot) pass the path policy check.
  config = { allowedPaths: [tmpRoot] };
  registerOrgDescribe(server as never, config);
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// ── projectNameDashes / workspaceCandidates ───────────────────────────────────

describe('projectNameDashes', () => {
  it('lowercases and replaces whitespace with single dashes', () => {
    assert.equal(projectNameDashes('/x/My Project Path'), 'my-project-path');
    assert.equal(projectNameDashes('/x/  Spaced  Name  '), 'spaced-name');
  });
});

describe('workspaceCandidates', () => {
  it('returns three candidates in expected order', () => {
    const cands = workspaceCandidates('/Users/alice/projects/My Project');
    assert.equal(cands.length, 3);
    assert.ok(
      cands[0].endsWith(`${path.sep}workspace-My Project`),
      `Expected sibling workspace first, got: ${cands[0]}`
    );
    assert.ok(
      cands[1].includes('Provar_Workspaces') && cands[1].endsWith('workspace-my-project'),
      `Expected Provar_Workspaces second, got: ${cands[1]}`
    );
    assert.ok(cands[2].endsWith(`${path.sep}Provar${path.sep}workspace-my-project`));
  });
});

// ── (a) Workspace discovery — sibling pattern ─────────────────────────────────

describe('provar_org_describe — workspace discovery', () => {
  it('(a) finds the sibling workspace at <parent>/workspace-<basename>', () => {
    // <tmpRoot>/workspace-MyProject is the sibling pattern
    const siblingWorkspace = path.join(tmpRoot, 'workspace-MyProject');
    const connectionDir = path.join(siblingWorkspace, '.metadata', 'MyOrg');
    writeJsonCache(connectionDir, 'Account', [{ name: 'Name', type: 'string', defaultValue: null, nillable: false }]);

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: 'MyOrg',
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.equal(body['workspace_path'], siblingWorkspace, 'should discover sibling workspace');
    const objects = body['objects'] as Array<{ name: string; exists: boolean | null; field_count: number }>;
    assert.equal(objects.length, 1);
    assert.equal(objects[0].name, 'Account');
    assert.equal(objects[0].exists, true);
    assert.equal(objects[0].field_count, 1);
  });

  it('(b) falls back to user-home workspace when sibling missing (via override)', () => {
    // Stand in for ~/Provar by using a HOME override. The tool uses os.homedir(),
    // and we override $HOME for this test only. Set the home to a tmp dir so the
    // path is inside allowed paths.
    const fakeHome = path.join(tmpRoot, 'fakehome');
    fs.mkdirSync(fakeHome, { recursive: true });

    const homeWorkspace = path.join(fakeHome, 'Provar', 'workspace-myproject');
    const connectionDir = path.join(homeWorkspace, '.metadata', 'MyOrg');
    writeJsonCache(connectionDir, 'Contact', [
      { name: 'LastName', type: 'string', defaultValue: null, nillable: false },
    ]);

    // Override HOME and USERPROFILE so os.homedir() returns fakeHome
    const oldHome = process.env['HOME'];
    const oldUserProfile = process.env['USERPROFILE'];
    process.env['HOME'] = fakeHome;
    process.env['USERPROFILE'] = fakeHome;
    try {
      const result = server.call('provar_org_describe', {
        project_path: projectPath,
        connection_name: 'MyOrg',
      });
      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.equal(body['workspace_path'], homeWorkspace, 'should discover user-home workspace');
      const objects = body['objects'] as Array<{ name: string; exists: boolean | null }>;
      assert.ok(
        objects.some((o) => o.name === 'Contact' && o.exists === true),
        'should list Contact from home workspace cache'
      );
    } finally {
      if (oldHome === undefined) delete process.env['HOME'];
      else process.env['HOME'] = oldHome;
      if (oldUserProfile === undefined) delete process.env['USERPROFILE'];
      else process.env['USERPROFILE'] = oldUserProfile;
    }
  });

  it('discoverWorkspace returns null when no candidate exists', () => {
    assert.equal(discoverWorkspace(projectPath), null);
  });
});

// ── (c) Cache miss ────────────────────────────────────────────────────────────

describe('provar_org_describe — cache miss', () => {
  it('(c) returns suggestion when workspace exists but .metadata/<connection> absent', () => {
    // Create the sibling workspace dir but NOT the connection subdir
    const siblingWorkspace = path.join(tmpRoot, 'workspace-MyProject');
    fs.mkdirSync(path.join(siblingWorkspace, '.metadata'), { recursive: true });

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: 'MissingOrg',
      objects: ['Account'],
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.equal(body['workspace_path'], siblingWorkspace);
    assert.equal(body['cache_age_ms'], null);

    const details = body['details'] as { suggestion: string };
    assert.ok(details, 'details should be present on cache miss');
    assert.ok(
      details.suggestion.includes('Provar IDE') && details.suggestion.includes('MissingOrg'),
      `suggestion should mention IDE and connection name; got: ${details.suggestion}`
    );

    const objects = body['objects'] as Array<{ name: string; exists: boolean | null; required_fields: unknown[] }>;
    assert.equal(objects.length, 1);
    assert.equal(objects[0].name, 'Account');
    assert.equal(objects[0].exists, null, 'exists must be null when cache missing entirely');
  });

  it('returns suggestion when no workspace at all is discoverable', () => {
    // No HOME override + no sibling workspace ⇒ workspace_path null. But os.homedir()
    // will still produce a path; set HOME to a non-existent dir so the candidate doesn't exist.
    const fakeHome = path.join(tmpRoot, 'nope');
    const oldHome = process.env['HOME'];
    const oldUserProfile = process.env['USERPROFILE'];
    process.env['HOME'] = fakeHome;
    process.env['USERPROFILE'] = fakeHome;
    try {
      const result = server.call('provar_org_describe', {
        project_path: projectPath,
        connection_name: 'AnyOrg',
        objects: ['Account', 'Contact'],
      });
      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.equal(body['workspace_path'], null);
      assert.ok(body['details'], 'suggestion should be present');
    } finally {
      if (oldHome === undefined) delete process.env['HOME'];
      else process.env['HOME'] = oldHome;
      if (oldUserProfile === undefined) delete process.env['USERPROFILE'];
      else process.env['USERPROFILE'] = oldUserProfile;
    }
  });
});

// ── (d) Path policy ───────────────────────────────────────────────────────────

describe('provar_org_describe — path policy', () => {
  it('(d) rejects project_path outside allowed paths with PATH_NOT_ALLOWED', () => {
    const strictServer = new MockMcpServer();
    registerOrgDescribe(strictServer as never, { allowedPaths: [tmpRoot] });

    const result = strictServer.call('provar_org_describe', {
      project_path: path.join(os.tmpdir(), 'definitely-outside'),
      connection_name: 'MyOrg',
    });

    assert.equal(isError(result), true);
    const code = parseText(result)['error_code'] as string;
    assert.ok(code === 'PATH_NOT_ALLOWED' || code === 'PATH_TRAVERSAL', `Unexpected error_code: ${code}`);
  });

  it('rejects connection_name that would escape workspace dir via traversal', () => {
    const siblingWorkspace = path.join(tmpRoot, 'workspace-MyProject');
    fs.mkdirSync(path.join(siblingWorkspace, '.metadata'), { recursive: true });

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: '../../escape',
    });

    assert.equal(isError(result), true);
    const code = parseText(result)['error_code'] as string;
    assert.ok(code === 'PATH_TRAVERSAL' || code === 'PATH_NOT_ALLOWED', `Unexpected error_code: ${code}`);
  });
});

// ── (e) Happy path ────────────────────────────────────────────────────────────

describe('provar_org_describe — happy path', () => {
  it('(e) returns the expected shape for two cached objects', () => {
    const siblingWorkspace = path.join(tmpRoot, 'workspace-MyProject');
    const connectionDir = path.join(siblingWorkspace, '.metadata', 'MyOrg');
    writeJsonCache(connectionDir, 'Account', [
      { name: 'Name', type: 'string', defaultValue: null, nillable: false },
      { name: 'AccountNumber', type: 'string', defaultValue: null, nillable: true },
    ]);
    writeJsonCache(connectionDir, 'Contact', [
      { name: 'LastName', type: 'string', defaultValue: null, nillable: false },
      { name: 'Email', type: 'email', defaultValue: null, nillable: true },
    ]);

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: 'MyOrg',
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.equal(body['workspace_path'], siblingWorkspace);
    assert.ok(typeof body['cache_age_ms'] === 'number' && body['cache_age_ms'] >= 0);

    const objects = body['objects'] as Array<{
      name: string;
      exists: boolean | null;
      required_fields: Array<{ name: string; nillable: boolean }>;
      field_count: number;
    }>;
    assert.equal(objects.length, 2);

    const account = objects.find((o) => o.name === 'Account');
    assert.ok(account);
    assert.equal(account.exists, true);
    assert.equal(account.field_count, 2, 'field_count reports total cached fields, not filtered');
    // default field_filter is "required" → only nillable=false fields included
    assert.equal(account.required_fields.length, 1);
    assert.equal(account.required_fields[0].name, 'Name');
  });
});

// ── (f) field_filter ──────────────────────────────────────────────────────────

describe('provar_org_describe — field_filter', () => {
  it('(f) field_filter=required excludes nillable fields', () => {
    const siblingWorkspace = path.join(tmpRoot, 'workspace-MyProject');
    const connectionDir = path.join(siblingWorkspace, '.metadata', 'MyOrg');
    writeJsonCache(connectionDir, 'Account', [
      { name: 'Name', type: 'string', defaultValue: null, nillable: false },
      { name: 'Phone', type: 'phone', defaultValue: null, nillable: true },
    ]);

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: 'MyOrg',
      field_filter: 'required',
    });

    const body = parseText(result);
    const objects = body['objects'] as Array<{ required_fields: Array<{ name: string }> }>;
    const fields = objects[0].required_fields.map((f) => f.name);
    assert.deepEqual(fields, ['Name'], 'only nillable=false fields should appear');
  });

  it('(f) field_filter=all includes nillable fields', () => {
    const siblingWorkspace = path.join(tmpRoot, 'workspace-MyProject');
    const connectionDir = path.join(siblingWorkspace, '.metadata', 'MyOrg');
    writeJsonCache(connectionDir, 'Account', [
      { name: 'Name', type: 'string', defaultValue: null, nillable: false },
      { name: 'Phone', type: 'phone', defaultValue: null, nillable: true },
    ]);

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: 'MyOrg',
      field_filter: 'all',
    });

    const body = parseText(result);
    const objects = body['objects'] as Array<{ required_fields: Array<{ name: string }> }>;
    const names = objects[0].required_fields.map((f) => f.name).sort();
    assert.deepEqual(names, ['Name', 'Phone']);
  });
});

// ── (g) objects filter ────────────────────────────────────────────────────────

describe('provar_org_describe — objects filter', () => {
  it('(g) restricts response to requested object names only', () => {
    const siblingWorkspace = path.join(tmpRoot, 'workspace-MyProject');
    const connectionDir = path.join(siblingWorkspace, '.metadata', 'MyOrg');
    writeJsonCache(connectionDir, 'Account', [{ name: 'Name', type: 'string', defaultValue: null, nillable: false }]);
    writeJsonCache(connectionDir, 'Contact', [
      { name: 'LastName', type: 'string', defaultValue: null, nillable: false },
    ]);
    writeJsonCache(connectionDir, 'Lead', [{ name: 'Company', type: 'string', defaultValue: null, nillable: false }]);

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: 'MyOrg',
      objects: ['Account', 'Lead'],
    });

    const body = parseText(result);
    const objects = body['objects'] as Array<{ name: string }>;
    const names = objects.map((o) => o.name).sort();
    assert.deepEqual(names, ['Account', 'Lead'], 'Contact should be excluded');
  });

  it('reports exists=false for a requested object not present in cache', () => {
    const siblingWorkspace = path.join(tmpRoot, 'workspace-MyProject');
    const connectionDir = path.join(siblingWorkspace, '.metadata', 'MyOrg');
    writeJsonCache(connectionDir, 'Account', [{ name: 'Name', type: 'string', defaultValue: null, nillable: false }]);

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: 'MyOrg',
      objects: ['Account', 'Ghost'],
    });

    const body = parseText(result);
    const objects = body['objects'] as Array<{ name: string; exists: boolean | null }>;
    const ghost = objects.find((o) => o.name === 'Ghost');
    assert.ok(ghost);
    assert.equal(ghost.exists, false, 'object not in cache → exists=false');
  });
});
