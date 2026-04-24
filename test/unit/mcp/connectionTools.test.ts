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

const BASIC_TEST_PROJECT = `<?xml version="1.0" encoding="UTF-8"?>
<testProject>
  <connectionClasses>
    <connectionClass name="sf">
      <connection name="MyOrg" url="sfdc://user@example.com;environment=SANDBOX">
      </connection>
      <connection name="AdminOrg" url="sfdc://admin@example.com;environment=PROD_DEV">
      </connection>
    </connectionClass>
    <connectionClass name="ui">
      <connection name="Chrome" url="selenium://chrome">
      </connection>
    </connectionClass>
    <connectionClass name="sso">
      <connection name="OktaSso" url="sso://okta.example.com">
      </connection>
    </connectionClass>
  </connectionClasses>
  <environments>
    <environment name="QA" connectionName="MyOrg" url="https://qa.example.com" />
    <environment name="UAT" connectionName="AdminOrg" />
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

// ── provar.connection.list ────────────────────────────────────────────────────

describe('provar.connection.list', () => {
  describe('happy path', () => {
    it('returns connections array with name, type, and url', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar.connection.list', { project_path: tmpDir });

      assert.equal(isError(result), false);
      const body = parseText(result);
      const connections = body['connections'] as Array<Record<string, unknown>>;
      assert.ok(Array.isArray(connections), 'Expected connections array');
      assert.equal(connections.length, 4, 'Expected 4 connections');
    });

    it('maps sf class to Salesforce type', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar.connection.list', { project_path: tmpDir });
      const connections = parseText(result)['connections'] as Array<Record<string, unknown>>;
      const sfConns = connections.filter((c) => c['type'] === 'Salesforce');
      assert.equal(sfConns.length, 2, 'Expected 2 Salesforce connections');
      assert.equal(sfConns[0]['name'], 'MyOrg');
    });

    it('maps ui class to Web type', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar.connection.list', { project_path: tmpDir });
      const connections = parseText(result)['connections'] as Array<Record<string, unknown>>;
      const webConns = connections.filter((c) => c['type'] === 'Web');
      assert.equal(webConns.length, 1);
      assert.equal(webConns[0]['name'], 'Chrome');
    });

    it('marks sso class connections as sso_configured=true', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar.connection.list', { project_path: tmpDir });
      const connections = parseText(result)['connections'] as Array<Record<string, unknown>>;
      const ssoConn = connections.find((c) => c['name'] === 'OktaSso');
      assert.ok(ssoConn, 'Expected OktaSso connection');
      assert.equal(ssoConn['sso_configured'], true);
    });

    it('marks non-sso connections as sso_configured=false', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar.connection.list', { project_path: tmpDir });
      const connections = parseText(result)['connections'] as Array<Record<string, unknown>>;
      const sfConn = connections.find((c) => c['name'] === 'MyOrg');
      assert.ok(sfConn);
      assert.equal(sfConn['sso_configured'], false);
    });

    it('returns environments with name, connection, and url', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar.connection.list', { project_path: tmpDir });
      const environments = parseText(result)['environments'] as Array<Record<string, unknown>>;
      assert.ok(Array.isArray(environments));
      assert.equal(environments.length, 2);
      const qa = environments.find((e) => e['name'] === 'QA');
      assert.ok(qa);
      assert.equal(qa['connection'], 'MyOrg');
      assert.equal(qa['url'], 'https://qa.example.com');
    });

    it('returns environment without url when not present', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar.connection.list', { project_path: tmpDir });
      const environments = parseText(result)['environments'] as Array<Record<string, unknown>>;
      const uat = environments.find((e) => e['name'] === 'UAT');
      assert.ok(uat);
      assert.equal(uat['url'], undefined, 'UAT has no url attribute');
    });

    it('returns summary with correct counts', () => {
      writeTestProject(tmpDir, BASIC_TEST_PROJECT);
      const result = server.call('provar.connection.list', { project_path: tmpDir });
      const summary = parseText(result)['summary'] as Record<string, number>;
      assert.equal(summary['connection_count'], 4);
      assert.equal(summary['environment_count'], 2);
    });

    it('returns empty arrays for project with no connections or environments', () => {
      writeTestProject(tmpDir, EMPTY_TEST_PROJECT);
      const result = server.call('provar.connection.list', { project_path: tmpDir });
      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.deepEqual(body['connections'], []);
      assert.deepEqual(body['environments'], []);
    });
  });

  describe('error cases', () => {
    it('returns CONNECTION_FILE_NOT_FOUND when .testproject is missing', () => {
      const result = server.call('provar.connection.list', { project_path: tmpDir });
      assert.equal(isError(result), true);
      const body = parseText(result);
      assert.equal(body['error_code'], 'CONNECTION_FILE_NOT_FOUND');
    });

    it('CONNECTION_FILE_NOT_FOUND includes a suggestion', () => {
      const result = server.call('provar.connection.list', { project_path: tmpDir });
      const body = parseText(result);
      const details = body['details'] as Record<string, unknown>;
      assert.ok(details?.['suggestion'], 'Expected suggestion in details');
    });

    it('returns PATH_NOT_ALLOWED when project_path is outside allowed paths', () => {
      const strictServer = new MockMcpServer();
      registerConnectionList(strictServer as never, { allowedPaths: [tmpDir] });
      const result = strictServer.call('provar.connection.list', {
        project_path: path.join(os.tmpdir(), 'some-other-project'),
      });
      assert.equal(isError(result), true);
      const code = parseText(result)['error_code'] as string;
      assert.ok(code === 'PATH_NOT_ALLOWED' || code === 'PATH_TRAVERSAL', `Unexpected: ${code}`);
    });

    it('returns CONNECTION_XML_PARSE_ERROR for malformed .testproject XML', () => {
      writeTestProject(tmpDir, '<unclosed');
      const result = server.call('provar.connection.list', { project_path: tmpDir });
      assert.equal(isError(result), true);
      assert.equal(parseText(result)['error_code'], 'CONNECTION_XML_PARSE_ERROR');
    });
  });
});
