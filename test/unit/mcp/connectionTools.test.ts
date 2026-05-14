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
import { registerConnectionList } from '../../../src/mcp/tools/connectionTools.js';
import type { ServerConfig } from '../../../src/mcp/server.js';

// ── Minimal McpServer mock ────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => unknown;

class MockMcpServer {
  private handlers = new Map<string, ToolHandler>();

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseText(result: unknown): Record<string, unknown> {
  const r = result as { content: Array<{ type: string; text: string }> };
  return JSON.parse(r.content[0].text) as Record<string, unknown>;
}

function isError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true;
}

function writeTestProject(dir: string, content: string): void {
  fs.writeFileSync(path.join(dir, '.testproject'), content, 'utf-8');
}

// ── .testproject fixture content ──────────────────────────────────────────────

// Mirrors the real .testproject XML shape:
//   connectionClass → connections → connection → connectionUrls → connectionUrl
//   environment → associations → association[@connectionId]
// The pre-PDX-478 fixture used a flattened shape that did not exist in real
// projects, which is how the parser bugs slipped through CI.
const BASIC_TEST_PROJECT = `<?xml version="1.0" encoding="UTF-8"?>
<testProject>
  <connectionClasses>
    <connectionClass name="sf">
      <connections>
        <connection id="conn-myorg" name="MyOrg">
          <connectionUrls>
            <connectionUrl url="sfdc://user@example.com;environment=SANDBOX" />
            <connectionUrl envId="env-qa" envName="QA" url="sfdc://user@example.com.qa;environment=SANDBOX" />
          </connectionUrls>
        </connection>
        <connection id="conn-adminorg" name="AdminOrg">
          <connectionUrls>
            <connectionUrl url="sfdc://admin@example.com;environment=PROD_DEV" />
          </connectionUrls>
        </connection>
      </connections>
    </connectionClass>
    <connectionClass name="ui">
      <connections>
        <connection id="conn-chrome" name="Chrome">
          <connectionUrls>
            <connectionUrl url="selenium://chrome" />
          </connectionUrls>
        </connection>
      </connections>
    </connectionClass>
    <connectionClass name="sso">
      <connections>
        <connection id="conn-okta" name="OktaSso">
          <connectionUrls>
            <connectionUrl url="sso://okta.example.com" />
          </connectionUrls>
        </connection>
      </connections>
    </connectionClass>
  </connectionClasses>
  <environments>
    <environment guid="env-qa" name="QA">
      <associations>
        <association assocationType="TM.ENVIRONMENT" connectionId="conn-myorg" />
      </associations>
    </environment>
    <environment guid="env-uat" name="UAT">
      <associations>
        <association assocationType="TM.ENVIRONMENT" connectionId="conn-adminorg" />
      </associations>
    </environment>
    <environment guid="env-noassoc" name="NoAssoc">
      <associations></associations>
    </environment>
  </environments>
</testProject>
`;

const EMPTY_TEST_PROJECT = `<?xml version="1.0" encoding="UTF-8"?>
<testProject>
</testProject>
`;

// ── Test setup ────────────────────────────────────────────────────────────────

let tmpDir: string;
let server: MockMcpServer;
let config: ServerConfig;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conntools-test-'));
  server = new MockMcpServer();
  config = { allowedPaths: [tmpDir] };
  registerConnectionList(server as never, config);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── provar_connection_list ────────────────────────────────────────────────────

describe('provar_connection_list', () => {
  describe('happy path', () => {
    it('returns connections array with name, type, and url', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar_connection_list', { project_path: tmpDir });

      assert.equal(isError(result), false);
      const body = parseText(result);
      const connections = body['connections'] as Array<Record<string, unknown>>;
      assert.ok(Array.isArray(connections), 'Expected connections array');
      assert.equal(connections.length, 4, 'Expected 4 connections');
    });

    it('maps sf class to Salesforce type', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar_connection_list', { project_path: tmpDir });
      const connections = parseText(result)['connections'] as Array<Record<string, unknown>>;
      const sfConns = connections.filter((c) => c['type'] === 'Salesforce');
      assert.equal(sfConns.length, 2, 'Expected 2 Salesforce connections');
      assert.equal(sfConns[0]['name'], 'MyOrg');
    });

    it('maps ui class to Web type', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar_connection_list', { project_path: tmpDir });
      const connections = parseText(result)['connections'] as Array<Record<string, unknown>>;
      const webConns = connections.filter((c) => c['type'] === 'Web');
      assert.equal(webConns.length, 1);
      assert.equal(webConns[0]['name'], 'Chrome');
    });

    it('marks sso class connections as sso_configured=true', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar_connection_list', { project_path: tmpDir });
      const connections = parseText(result)['connections'] as Array<Record<string, unknown>>;
      const ssoConn = connections.find((c) => c['name'] === 'OktaSso');
      assert.ok(ssoConn, 'Expected OktaSso connection');
      assert.equal(ssoConn['sso_configured'], true);
    });

    it('marks non-sso connections as sso_configured=false', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar_connection_list', { project_path: tmpDir });
      const connections = parseText(result)['connections'] as Array<Record<string, unknown>>;
      const sfConn = connections.find((c) => c['name'] === 'MyOrg');
      assert.ok(sfConn);
      assert.equal(sfConn['sso_configured'], false);
    });

    it('resolves environment.connection via associations[@connectionId]', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar_connection_list', { project_path: tmpDir });
      const environments = parseText(result)['environments'] as Array<Record<string, unknown>>;
      assert.ok(Array.isArray(environments));
      assert.equal(environments.length, 3);
      const qa = environments.find((e) => e['name'] === 'QA');
      assert.ok(qa);
      assert.equal(qa['connection'], 'MyOrg');
    });

    it('returns environment-specific url when a connectionUrl has @envId matching env @guid', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar_connection_list', { project_path: tmpDir });
      const environments = parseText(result)['environments'] as Array<Record<string, unknown>>;
      const qa = environments.find((e) => e['name'] === 'QA');
      assert.ok(qa);
      assert.equal(qa['url'], 'sfdc://user@example.com.qa;environment=SANDBOX');
    });

    it('omits url on environment when no per-env connectionUrl exists', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar_connection_list', { project_path: tmpDir });
      const environments = parseText(result)['environments'] as Array<Record<string, unknown>>;
      const uat = environments.find((e) => e['name'] === 'UAT');
      assert.ok(uat);
      assert.equal(uat['url'], undefined, 'UAT has no @envId-matched connectionUrl');
    });

    it("handles environments with empty <associations> gracefully (no crash, connection='')", () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar_connection_list', { project_path: tmpDir });
      assert.equal(isError(result), false);
      const environments = parseText(result)['environments'] as Array<Record<string, unknown>>;
      const noAssoc = environments.find((e) => e['name'] === 'NoAssoc');
      assert.ok(noAssoc);
      assert.equal(noAssoc['connection'], '');
      assert.equal(noAssoc['url'], undefined);
    });

    it('connection.url uses the default connectionUrl (entry without @envId)', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar_connection_list', { project_path: tmpDir });
      const connections = parseText(result)['connections'] as Array<Record<string, unknown>>;
      const myOrg = connections.find((c) => c['name'] === 'MyOrg');
      assert.ok(myOrg);
      assert.equal(myOrg['url'], 'sfdc://user@example.com;environment=SANDBOX');
    });

    it('returns summary with correct counts', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar_connection_list', { project_path: tmpDir });
      const summary = parseText(result)['summary'] as Record<string, number>;
      assert.equal(summary['connection_count'], 4);
      assert.equal(summary['environment_count'], 3);
    });

    it('returns empty arrays for project with no connections or environments', () => {
      writeTestProject(tmpDir, EMPTY_TEST_PROJECT);
      const result = server.call('provar_connection_list', { project_path: tmpDir });
      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.deepEqual(body['connections'], []);
      assert.deepEqual(body['environments'], []);
    });
  });

  describe('fields param (sparse field masking)', () => {
    it('retains only specified top-level keys when fields is provided', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar_connection_list', {
        project_path: tmpDir,
        fields: 'connections,summary',
      });
      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.ok('connections' in body, 'connections should be retained');
      assert.ok('summary' in body, 'summary should be retained');
      assert.ok(!('environments' in body), 'environments should be masked out');
      assert.ok(!('requestId' in body), 'requestId should be masked out');
    });

    it('omitting fields returns the full response', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar_connection_list', { project_path: tmpDir });
      const body = parseText(result);
      assert.ok('connections' in body);
      assert.ok('environments' in body);
      assert.ok('requestId' in body);
    });

    it('silently ignores unknown field names', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar_connection_list', {
        project_path: tmpDir,
        fields: 'connections,ghost_field',
      });
      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.ok('connections' in body);
      assert.ok(!('ghost_field' in body));
    });

    it('supports dot notation to narrow connection entries', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar_connection_list', {
        project_path: tmpDir,
        fields: 'connections.name,connections.type',
      });
      assert.equal(isError(result), false);
      const body = parseText(result);
      const connections = body['connections'] as Array<Record<string, unknown>>;
      assert.ok(Array.isArray(connections));
      assert.ok('name' in connections[0], 'name should be retained');
      assert.ok('type' in connections[0], 'type should be retained');
      assert.ok(!('url' in connections[0]), 'url should be masked out');
      assert.ok(!('sso_configured' in connections[0]), 'sso_configured should be masked out');
    });
  });

  describe('error cases', () => {
    it('returns CONNECTION_FILE_NOT_FOUND when .testproject is missing', () => {
      const result = server.call('provar_connection_list', { project_path: tmpDir });
      assert.equal(isError(result), true);
      const body = parseText(result);
      assert.equal(body['error_code'], 'CONNECTION_FILE_NOT_FOUND');
    });

    it('CONNECTION_FILE_NOT_FOUND includes a suggestion', () => {
      const result = server.call('provar_connection_list', { project_path: tmpDir });
      const body = parseText(result);
      const details = body['details'] as Record<string, unknown>;
      assert.ok(details?.['suggestion'], 'Expected suggestion in details');
    });

    it('returns PATH_NOT_ALLOWED when project_path is outside allowed paths', () => {
      const strictServer = new MockMcpServer();
      registerConnectionList(strictServer as never, { allowedPaths: [tmpDir] });
      const result = strictServer.call('provar_connection_list', {
        project_path: path.join(os.tmpdir(), 'some-other-project'),
      });
      assert.equal(isError(result), true);
      const code = parseText(result)['error_code'] as string;
      assert.ok(code === 'PATH_NOT_ALLOWED' || code === 'PATH_TRAVERSAL', `Unexpected: ${code}`);
    });

    it('returns CONNECTION_XML_PARSE_ERROR for malformed .testproject XML', () => {
      writeTestProject(tmpDir, '<unclosed');
      const result = server.call('provar_connection_list', { project_path: tmpDir });
      assert.equal(isError(result), true);
      assert.equal(parseText(result)['error_code'], 'CONNECTION_XML_PARSE_ERROR');
    });
  });
});
