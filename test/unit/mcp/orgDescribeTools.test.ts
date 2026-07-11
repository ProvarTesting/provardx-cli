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

/**
 * Write a legacy .object / .xml cache file (CustomObject metadata) with the given fields.
 * `required` is emitted as the string "true" / "false" — but fast-xml-parser with the
 * default parseTagValue=true will coerce it to a boolean before reaching the reader.
 * The implementation must accept BOTH forms, which is what the legacy-format tests assert.
 */
function writeXmlCache(
  connectionDir: string,
  objectName: string,
  fields: Array<{ name: string; type: string; required: boolean }>,
  ext: '.xml' | '.object' = '.xml'
): void {
  fs.mkdirSync(connectionDir, { recursive: true });
  const fieldsXml = fields
    .map(
      (f) =>
        `  <fields>\n    <fullName>${f.name}</fullName>\n    <type>${f.type}</type>\n    <required>${String(
          f.required
        )}</required>\n  </fields>`
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<CustomObject>\n${fieldsXml}\n</CustomObject>\n`;
  fs.writeFileSync(path.join(connectionDir, `${objectName}${ext}`), xml, 'utf-8');
}

/**
 * Resolve the Provar IDE SfObject cache directory for a connection + environment:
 * <workspace>/.metadata/.plugins/com.provar.eclipse.ui/<connection>/<env>/SfObject
 */
function sfObjectDir(workspace: string, connection: string, env: string): string {
  return path.join(workspace, '.metadata', '.plugins', 'com.provar.eclipse.ui', connection, env, 'SfObject');
}

/** A single <sfField> spec for the IDE SfObject fixture format. */
interface SfFieldSpec {
  name: string;
  type?: string; // omit → no `type` attribute (reader should default to 'unknown')
  required?: boolean; // required="true" → nillable=false
  /** Emit a child <referenceTos> so the field is a container — children must NOT be counted. */
  referenceTo?: string;
}

/**
 * Write a Provar IDE SfObject XML file (sanitized shape based on the real IDE output) into
 * <workspace>/.metadata/.plugins/com.provar.eclipse.ui/<connection>/<env>/SfObject/<Object>.xml.
 * When `detailsLoaded` is false the file is a self-closing stub with no <fields> element.
 */
function writeSfObjectCache(
  workspace: string,
  connection: string,
  env: string,
  objectName: string,
  displayName: string,
  fields: SfFieldSpec[],
  detailsLoaded = true
): void {
  const dir = sfObjectDir(workspace, connection, env);
  fs.mkdirSync(dir, { recursive: true });

  let xml: string;
  if (!detailsLoaded) {
    xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
      `<sfObject detailsLoaded="false" keyPrefix="001" label="${displayName}" n="${objectName}" t="${displayName}"/>\n`;
  } else {
    const sfFieldsXml = fields
      .map((f) => {
        const attrs = [`n="${f.name}"`];
        if (f.type !== undefined) attrs.push(`type="${f.type}"`);
        if (f.required) attrs.push('required="true"');
        if (f.referenceTo) attrs.push('relationshipName="Owner"');
        const open = `      <sfField ${attrs.join(' ')}`;
        if (f.referenceTo) {
          return `${open}>\n        <referenceTos>\n          <string>${f.referenceTo}</string>\n        </referenceTos>\n      </sfField>`;
        }
        return `${open}/>`;
      })
      .join('\n');
    xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
      `<sfObject keyPrefix="a0D" label="${displayName}" n="${objectName}" t="${displayName}">\n` +
      `  <fields>\n${sfFieldsXml}\n  </fields>\n` +
      '</sfObject>\n';
  }
  fs.writeFileSync(path.join(dir, `${objectName}.xml`), xml, 'utf-8');
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
  // The project lives INSIDE its workspace directory; discovery resolves the workspace
  // as the project's parent (<parent>/). Naming the parent workspace-MyProject lets the
  // per-test fixtures keep writing caches under <tmpRoot>/workspace-MyProject.
  projectPath = path.join(tmpRoot, 'workspace-MyProject', 'MyProject');
  fs.mkdirSync(projectPath, { recursive: true });

  server = new MockMcpServer();
  // tmpRoot must be allowed so both the project path and any workspace
  // candidate (also under tmpRoot) pass the path policy check.
  config = { allowedPaths: [tmpRoot] };
  registerOrgDescribe(server as never, config);
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// ── workspaceCandidates ───────────────────────────────────────────────────────

describe('workspaceCandidates', () => {
  it('returns four candidates in order: parent, sibling, Provar_Workspaces, home', () => {
    const cands = workspaceCandidates('/Users/alice/projects/My Project');
    assert.equal(cands.length, 4);
    assert.equal(cands[0], path.resolve('/Users/alice/projects'), `Expected project parent first, got: ${cands[0]}`);
    assert.ok(
      cands[1].endsWith(`${path.sep}workspace-My Project`) && !cands[1].includes('Provar_Workspaces'),
      `Expected sibling <parent>/workspace-<basename> second, got: ${cands[1]}`
    );
    assert.ok(
      cands[2].includes('Provar_Workspaces') && cands[2].endsWith('workspace-My Project'),
      `Expected Provar_Workspaces third, got: ${cands[2]}`
    );
    assert.ok(cands[3].endsWith(`${path.sep}Provar${path.sep}workspace-My Project`));
  });
});

// ── (a) Workspace discovery — project parent ──────────────────────────────────

describe('provar_org_describe — workspace discovery', () => {
  it('(a) finds the workspace at the project parent (<parent>/)', () => {
    // The project's parent dir (<tmpRoot>/workspace-MyProject) is the workspace.
    const workspace = path.join(tmpRoot, 'workspace-MyProject');
    const connectionDir = path.join(workspace, '.metadata', 'MyOrg');
    writeJsonCache(connectionDir, 'Account', [{ name: 'Name', type: 'string', defaultValue: null, nillable: false }]);

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: 'MyOrg',
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.equal(body['workspace_path'], workspace, 'should discover the project-parent workspace');
    const objects = body['objects'] as Array<{ name: string; exists: boolean | null; field_count: number }>;
    assert.equal(objects.length, 1);
    assert.equal(objects[0].name, 'Account');
    assert.equal(objects[0].exists, true);
    assert.equal(objects[0].field_count, 1);
  });

  it('(a2) falls back to the sibling <parent>/workspace-<basename> workspace (back-compat)', () => {
    // Back-compat layout: the project's parent is NOT itself a workspace, but a sibling
    // dir named workspace-<basename> is. beforeEach leaves the parent (<tmpRoot>/workspace-MyProject)
    // without a .metadata dir, so candidate 1 (parent) falls through to candidate 2 (sibling).
    const parent = path.dirname(projectPath); // <tmpRoot>/workspace-MyProject
    const sibling = path.join(parent, 'workspace-MyProject'); // <parent>/workspace-<basename>
    const connectionDir = path.join(sibling, '.metadata', 'MyOrg');
    writeJsonCache(connectionDir, 'Account', [{ name: 'Name', type: 'string', defaultValue: null, nillable: false }]);

    // Sanity: the parent must NOT be a workspace here, otherwise candidate 1 would win.
    assert.equal(fs.existsSync(path.join(parent, '.metadata')), false, 'parent must not have .metadata for this test');

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: 'MyOrg',
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.equal(body['workspace_path'], sibling, 'should discover the sibling workspace-<basename> workspace');
    const objects = body['objects'] as Array<{ name: string; exists: boolean | null; field_count: number }>;
    assert.equal(objects.length, 1);
    assert.equal(objects[0].name, 'Account');
    assert.equal(objects[0].exists, true);
    assert.equal(objects[0].field_count, 1);
  });

  it('(b) falls back to user-home workspace when project parent is not a workspace (via override)', () => {
    // Stand in for ~/Provar by using a HOME override. The tool uses os.homedir(),
    // and we override $HOME for this test only. Set the home to a tmp dir so the
    // path is inside allowed paths.
    const fakeHome = path.join(tmpRoot, 'fakehome');
    fs.mkdirSync(fakeHome, { recursive: true });

    const homeWorkspace = path.join(fakeHome, 'Provar', 'workspace-MyProject');
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
    assert.equal(discoverWorkspace(projectPath, [tmpRoot]), null);
  });

  it('discoverWorkspace skips candidates outside allowedPaths without touching the filesystem', () => {
    // Create a real workspace (with .metadata) that DOES exist on disk but lies outside
    // the allowed root. The project parent (candidate 1) resolves to outsideRoot, so it
    // would otherwise qualify — but it must be skipped because it is outside policy.
    const outsideRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'org-describe-outside-')));
    try {
      const outsideProject = path.join(outsideRoot, 'OtherProject');
      fs.mkdirSync(outsideProject, { recursive: true });
      // outsideRoot is the project parent (candidate 1); make it a genuine workspace.
      fs.mkdirSync(path.join(outsideRoot, '.metadata'), { recursive: true });

      // With only tmpRoot allowed, discoverWorkspace MUST NOT return the outside workspace
      // even though it exists on disk.
      assert.equal(discoverWorkspace(outsideProject, [tmpRoot]), null);
    } finally {
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });
});

// ── (c) Cache miss ────────────────────────────────────────────────────────────

describe('provar_org_describe — cache miss', () => {
  it('(c) returns suggestion when workspace exists but .metadata/<connection> absent', () => {
    // The project parent is the workspace; create its .metadata but NOT the connection subdir
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

// ── (h) Legacy cache formats — .xml / .object ────────────────────────────────

describe('provar_org_describe — legacy cache formats', () => {
  it('(h.1) parses .xml CustomObject metadata and classifies required vs nillable correctly', () => {
    // Regression guard for the required-flag bug: fast-xml-parser's default
    // parseTagValue=true coerces "<required>true</required>" to the boolean true.
    // The reader must treat boolean and string forms identically.
    const siblingWorkspace = path.join(tmpRoot, 'workspace-MyProject');
    const connectionDir = path.join(siblingWorkspace, '.metadata', 'MyOrg');
    writeXmlCache(
      connectionDir,
      'Account',
      [
        { name: 'Name', type: 'string', required: true },
        { name: 'Phone', type: 'phone', required: false },
      ],
      '.xml'
    );

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: 'MyOrg',
      objects: ['Account'],
      field_filter: 'all',
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    const objects = body['objects'] as Array<{
      name: string;
      exists: boolean | null;
      required_fields: Array<{ name: string; nillable: boolean }>;
      field_count: number;
    }>;
    assert.equal(objects.length, 1);
    assert.equal(objects[0].exists, true);
    assert.equal(objects[0].field_count, 2);
    const byName = new Map(objects[0].required_fields.map((f) => [f.name, f.nillable]));
    assert.equal(
      byName.get('Name'),
      false,
      'required field should have nillable=false (NOT misclassified as nillable)'
    );
    assert.equal(byName.get('Phone'), true, 'non-required field should have nillable=true');
  });

  it('(h.2) parses .object CustomObject metadata (legacy Eclipse layout)', () => {
    const siblingWorkspace = path.join(tmpRoot, 'workspace-MyProject');
    const connectionDir = path.join(siblingWorkspace, '.metadata', 'MyOrg');
    writeXmlCache(
      connectionDir,
      'Contact',
      [
        { name: 'LastName', type: 'string', required: true },
        { name: 'Email', type: 'email', required: false },
      ],
      '.object'
    );

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: 'MyOrg',
      objects: ['Contact'],
      field_filter: 'required',
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    const objects = body['objects'] as Array<{
      name: string;
      exists: boolean | null;
      required_fields: Array<{ name: string }>;
      field_count: number;
    }>;
    assert.equal(objects[0].exists, true);
    assert.equal(objects[0].field_count, 2, 'field_count counts all parsed fields, regardless of filter');
    // field_filter='required' → only nillable=false survives
    const names = objects[0].required_fields.map((f) => f.name);
    assert.deepEqual(names, ['LastName'], 'only the required field should pass the filter');
  });
});

// ── (i) Parse-error reporting ─────────────────────────────────────────────────

describe('provar_org_describe — parse errors', () => {
  it('(i) returns exists=true with error_message when a cache file is corrupt', () => {
    // A cache file that EXISTS but does not parse must NOT be reported as exists=false
    // (that would conflate "not cached" with "corrupt") — the contract is exists=true,
    // field_count=0, error_message set.
    const siblingWorkspace = path.join(tmpRoot, 'workspace-MyProject');
    const connectionDir = path.join(siblingWorkspace, '.metadata', 'MyOrg');
    fs.mkdirSync(connectionDir, { recursive: true });
    fs.writeFileSync(path.join(connectionDir, 'Account.json'), '{ not valid json', 'utf-8');

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: 'MyOrg',
      objects: ['Account'],
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    const objects = body['objects'] as Array<{
      name: string;
      exists: boolean | null;
      field_count: number;
      error_message?: string;
    }>;
    assert.equal(objects.length, 1);
    assert.equal(objects[0].exists, true, 'corrupt cache file is "present" — not missing');
    assert.equal(objects[0].field_count, 0);
    const errMsg = objects[0].error_message;
    assert.ok(errMsg, 'error_message should describe the parse failure');
    assert.ok(errMsg.includes('Account.json'), `error_message should reference the file name; got: ${errMsg}`);
  });
});

// ── (j) Connection-name traversal — bare `..` ─────────────────────────────────

describe('provar_org_describe — connection_name validation', () => {
  it('(j) rejects bare ".." connection_name with PATH_TRAVERSAL and a clear message', () => {
    // Regression guard for the broadened error message: the validator rejects `..`
    // even when no separator is present. The message must mention BOTH conditions.
    const siblingWorkspace = path.join(tmpRoot, 'workspace-MyProject');
    fs.mkdirSync(path.join(siblingWorkspace, '.metadata'), { recursive: true });

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: '..',
    });

    assert.equal(isError(result), true);
    const body = parseText(result);
    assert.equal(body['error_code'], 'PATH_TRAVERSAL');
    const msg = body['message'] as string;
    assert.ok(
      /path separators/i.test(msg) && msg.includes('..'),
      `error message should mention both path separators and '..'; got: ${msg}`
    );
  });
});

// ── (k) Provar IDE SfObject layout ────────────────────────────────────────────

describe('provar_org_describe — Provar IDE SfObject layout', () => {
  it('(k.1) parses <sfObject>/<fields>/<sfField> and reports field_count + required_fields', () => {
    // Fixture modelled on the real provar__Person__c.xml: a mix of typed fields, a
    // required field, a type-less field, and a container field with <referenceTos>.
    const siblingWorkspace = path.join(tmpRoot, 'workspace-MyProject');
    writeSfObjectCache(siblingWorkspace, 'Admin', 'UAT', 'provar__Person__c', 'Person', [
      { name: 'Id', type: 'id' },
      { name: 'OwnerId', type: 'reference', referenceTo: 'User' }, // container: child must not count
      { name: 'Name' }, // no type → 'unknown'
      { name: 'provar__Email__c', type: 'email', required: true }, // the only required field
      { name: 'provar__Start_Date__c', type: 'date' },
    ]);

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: 'Admin',
      environment: 'UAT',
      objects: ['provar__Person__c'],
      field_filter: 'all',
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    const objects = body['objects'] as Array<{
      name: string;
      exists: boolean | null;
      required_fields: Array<{ name: string; type: string; nillable: boolean; default_value: string | null }>;
      field_count: number;
    }>;
    assert.equal(objects.length, 1);
    assert.equal(objects[0].exists, true);
    // 5 sfFields; the <string> children of <referenceTos> must NOT be counted.
    assert.equal(objects[0].field_count, 5, 'container children must not be double-counted');
    assert.equal(
      objects[0].name,
      'provar__Person__c',
      'object name is the API name from sfObject @n, not the @t label'
    );

    const byName = new Map(objects[0].required_fields.map((f) => [f.name, f]));
    assert.equal(byName.get('Name')?.type, 'unknown', 'field with no type attribute → "unknown"');
    assert.equal(byName.get('provar__Email__c')?.nillable, false, 'required="true" → nillable=false');
    assert.equal(byName.get('Id')?.nillable, true, 'absent required → nillable=true');
    assert.equal(byName.get('provar__Email__c')?.default_value, null, 'SfObject format has no defaultValue');
  });

  it('(k.2) field_filter=required returns only the required field', () => {
    const siblingWorkspace = path.join(tmpRoot, 'workspace-MyProject');
    writeSfObjectCache(siblingWorkspace, 'Admin', 'UAT', 'provar__Person__c', 'Person', [
      { name: 'Id', type: 'id' },
      { name: 'provar__Email__c', type: 'email', required: true },
      { name: 'Name' },
    ]);

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: 'Admin',
      environment: 'UAT',
      objects: ['provar__Person__c'],
      field_filter: 'required',
    });

    const body = parseText(result);
    const objects = body['objects'] as Array<{ required_fields: Array<{ name: string }>; field_count: number }>;
    assert.equal(objects[0].field_count, 3, 'field_count reports all fields, not the filtered subset');
    const names = objects[0].required_fields.map((f) => f.name);
    assert.deepEqual(names, ['provar__Email__c'], 'only the required field passes field_filter=required');
  });

  it('(k.3) falls back to an existing env (default) when requested env missing', () => {
    const siblingWorkspace = path.join(tmpRoot, 'workspace-MyProject');
    // Only `default` has cached metadata; the request asks for `UAT`.
    writeSfObjectCache(siblingWorkspace, 'Admin', 'default', 'Account', 'Account', [
      { name: 'Name', type: 'string', required: true },
    ]);

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: 'Admin',
      environment: 'UAT',
      objects: ['Account'],
      field_filter: 'all',
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    const objects = body['objects'] as Array<{ name: string; exists: boolean | null; field_count: number }>;
    assert.equal(objects[0].exists, true, 'should fall back to the default environment cache');
    assert.equal(objects[0].field_count, 1);
  });

  it('(k.4) defaults environment to "default" when omitted', () => {
    const siblingWorkspace = path.join(tmpRoot, 'workspace-MyProject');
    writeSfObjectCache(siblingWorkspace, 'Admin', 'default', 'Account', 'Account', [
      { name: 'Name', type: 'string', required: true },
    ]);

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: 'Admin',
      objects: ['Account'],
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    const objects = body['objects'] as Array<{ name: string; exists: boolean | null }>;
    assert.equal(objects[0].exists, true);
  });

  it('(k.5) treats a stub (detailsLoaded=false, no <fields>) as exists=true, field_count=0', () => {
    const siblingWorkspace = path.join(tmpRoot, 'workspace-MyProject');
    writeSfObjectCache(siblingWorkspace, 'Admin', 'default', 'Account', 'Account', [], false);

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: 'Admin',
      objects: ['Account'],
      field_filter: 'all',
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    const objects = body['objects'] as Array<{
      name: string;
      exists: boolean | null;
      field_count: number;
      error_message?: string;
    }>;
    assert.equal(objects[0].exists, true, 'stub file exists');
    assert.equal(objects[0].field_count, 0, 'stub has no loaded fields');
    assert.equal(objects[0].error_message, undefined, 'a stub is not a parse error');
  });

  it('(k.6) lists all cached objects in the SfObject dir when objects omitted', () => {
    const siblingWorkspace = path.join(tmpRoot, 'workspace-MyProject');
    writeSfObjectCache(siblingWorkspace, 'Admin', 'default', 'Account', 'Account', [{ name: 'Name', type: 'string' }]);
    writeSfObjectCache(siblingWorkspace, 'Admin', 'default', 'Contact', 'Contact', [
      { name: 'LastName', type: 'string' },
    ]);

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: 'Admin',
    });

    const body = parseText(result);
    assert.ok(typeof body['cache_age_ms'] === 'number', 'cache_age_ms reflects the SfObject dir mtime');
    const objects = body['objects'] as Array<{ name: string }>;
    // Display names come from sfObject @t; both objects use their own name here.
    const names = objects.map((o) => o.name).sort();
    assert.deepEqual(names, ['Account', 'Contact']);
  });

  it('(k.7) prefers the IDE SfObject layout over the legacy .metadata/<connection> layout', () => {
    const siblingWorkspace = path.join(tmpRoot, 'workspace-MyProject');
    // Legacy layout has 1 field; IDE layout has 2. IDE must win.
    writeJsonCache(path.join(siblingWorkspace, '.metadata', 'Admin'), 'Account', [
      { name: 'LegacyOnly', type: 'string', defaultValue: null, nillable: false },
    ]);
    writeSfObjectCache(siblingWorkspace, 'Admin', 'default', 'Account', 'Account', [
      { name: 'Name', type: 'string', required: true },
      { name: 'Phone', type: 'phone' },
    ]);

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: 'Admin',
      objects: ['Account'],
      field_filter: 'all',
    });

    const body = parseText(result);
    const objects = body['objects'] as Array<{ field_count: number; required_fields: Array<{ name: string }> }>;
    assert.equal(objects[0].field_count, 2, 'IDE SfObject layout should be preferred over legacy');
    const names = objects[0].required_fields.map((f) => f.name).sort();
    assert.deepEqual(names, ['Name', 'Phone']);
  });

  it('(k.8) rejects an environment containing a path separator with PATH_TRAVERSAL', () => {
    const siblingWorkspace = path.join(tmpRoot, 'workspace-MyProject');
    writeSfObjectCache(siblingWorkspace, 'Admin', 'default', 'Account', 'Account', [{ name: 'Name', type: 'string' }]);

    const result = server.call('provar_org_describe', {
      project_path: projectPath,
      connection_name: 'Admin',
      environment: '../../escape',
      objects: ['Account'],
    });

    assert.equal(isError(result), true);
    const code = parseText(result)['error_code'] as string;
    assert.ok(code === 'PATH_TRAVERSAL' || code === 'PATH_NOT_ALLOWED', `Unexpected error_code: ${code}`);
  });

  it('(k.9) rejects a workspace SfObject path outside allowedPaths', () => {
    // Build a workspace OUTSIDE the allowed root and point project discovery at it via a
    // sibling whose parent is outside tmpRoot. The IDE-layout SfObject dir then sits
    // outside allowedPaths and must be rejected by the path policy.
    const outsideRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'org-describe-out-')));
    try {
      const outsideProject = path.join(outsideRoot, 'OutProject');
      fs.mkdirSync(outsideProject, { recursive: true });
      const outsideWorkspace = path.join(outsideRoot, 'workspace-OutProject');
      writeSfObjectCache(outsideWorkspace, 'Admin', 'default', 'Account', 'Account', [
        { name: 'Name', type: 'string' },
      ]);

      // Server allows ONLY tmpRoot, but project_path/workspace live under outsideRoot.
      const result = server.call('provar_org_describe', {
        project_path: outsideProject,
        connection_name: 'Admin',
        objects: ['Account'],
      });

      assert.equal(isError(result), true, 'a workspace outside allowedPaths must be rejected');
      const code = parseText(result)['error_code'] as string;
      assert.ok(code === 'PATH_NOT_ALLOWED' || code === 'PATH_TRAVERSAL', `Unexpected error_code: ${code}`);
    } finally {
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });
});
