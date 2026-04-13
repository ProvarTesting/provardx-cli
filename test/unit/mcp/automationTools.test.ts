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
import sinon from 'sinon';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sfSpawnHelper } from '../../../src/mcp/tools/sfSpawn.js';

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

type FakeSpawnResult = { stdout: string; stderr: string; status: number | null; error: Error | undefined; pid: number | undefined; output: string[]; signal: null };

function makeSpawnResult(stdout: string, stderr: string, status: number): FakeSpawnResult {
  return { stdout, stderr, status, error: undefined, pid: 1, output: [], signal: null };
}

function makeEnoentResult(): FakeSpawnResult {
  const err = Object.assign(new Error('spawn sf ENOENT'), { code: 'ENOENT' });
  return { stdout: '', stderr: '', status: null, error: err, pid: undefined, output: [], signal: null };
}

function parseBody(result: unknown): Record<string, unknown> {
  const r = result as { content: Array<{ text: string }> };
  return JSON.parse(r.content[0].text) as Record<string, unknown>;
}

function isError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('automationTools', () => {
  let server: MockMcpServer;
  let spawnStub: sinon.SinonStub;

  beforeEach(async () => {
    server = new MockMcpServer();
    spawnStub = sinon.stub(sfSpawnHelper, 'spawnSync');

    const { registerAllAutomationTools, setSfPathCacheForTesting } = await import('../../../src/mcp/tools/automationTools.js');
    setSfPathCacheForTesting('sf'); // bypass probe spawn; tests control spawnStub directly
    // allowedPaths: [] means unrestricted — existing tests use arbitrary paths
    registerAllAutomationTools(server as unknown as McpServer, { allowedPaths: [] });
  });

  afterEach(() => {
    sinon.restore();
  });

  // ── provar.automation.testrun ─────────────────────────────────────────────

  describe('provar.automation.testrun', () => {
    it('calls sf with correct args and returns stdout', () => {
      spawnStub.returns(makeSpawnResult('tests passed', '', 0));
      const result = server.call('provar.automation.testrun', { flags: [] });
      const body = parseBody(result);
      assert.equal(body.exitCode, 0);
      assert.equal(body.stdout, 'tests passed');
      const [cmd, args] = spawnStub.firstCall.args as [string, string[]];
      assert.equal(cmd, 'sf');
      assert.deepEqual(args, ['provar', 'automation', 'test', 'run']);
    });

    it('forwards extra flags to sf', () => {
      spawnStub.returns(makeSpawnResult('ok', '', 0));
      server.call('provar.automation.testrun', { flags: ['--project-path', '/my/project'] });
      const args = spawnStub.firstCall.args[1] as string[];
      assert.ok(args.includes('--project-path'));
      assert.ok(args.includes('/my/project'));
    });

    it('returns isError and AUTOMATION_TESTRUN_FAILED on non-zero exit', () => {
      spawnStub.returns(makeSpawnResult('', 'compilation error', 1));
      const result = server.call('provar.automation.testrun', { flags: [] });
      assert.ok(isError(result));
      const body = parseBody(result);
      assert.equal(body.error_code, 'AUTOMATION_TESTRUN_FAILED');
      assert.equal(body.message, 'compilation error');
    });

    it('uses stdout as message when stderr is empty', () => {
      spawnStub.returns(makeSpawnResult('test failed: assertion error', '', 1));
      const result = server.call('provar.automation.testrun', { flags: [] });
      const body = parseBody(result);
      assert.equal(body.message, 'test failed: assertion error');
    });

    it('returns SF_NOT_FOUND on ENOENT with actionable message', () => {
      spawnStub.returns(makeEnoentResult());
      const result = server.call('provar.automation.testrun', { flags: [] });
      assert.ok(isError(result));
      const body = parseBody(result);
      assert.equal(body.error_code, 'SF_NOT_FOUND');
      assert.ok((body.message as string).includes('npm install -g @salesforce/cli'));
    });
  });

  // ── provar.automation.compile ─────────────────────────────────────────────

  describe('provar.automation.compile', () => {
    it('calls sf with project compile args', () => {
      spawnStub.returns(makeSpawnResult('compiled ok', '', 0));
      const result = server.call('provar.automation.compile', { flags: [] });
      const body = parseBody(result);
      assert.equal(body.exitCode, 0);
      const args = spawnStub.firstCall.args[1] as string[];
      assert.deepEqual(args, ['provar', 'automation', 'project', 'compile']);
    });

    it('forwards project-path flag', () => {
      spawnStub.returns(makeSpawnResult('ok', '', 0));
      server.call('provar.automation.compile', { flags: ['--project-path', '/my/project'] });
      const args = spawnStub.firstCall.args[1] as string[];
      assert.ok(args.includes('/my/project'));
    });

    it('returns AUTOMATION_COMPILE_FAILED on non-zero exit', () => {
      spawnStub.returns(makeSpawnResult('', 'syntax error in TestCase.testcase', 1));
      const result = server.call('provar.automation.compile', { flags: [] });
      assert.ok(isError(result));
      assert.equal(parseBody(result).error_code, 'AUTOMATION_COMPILE_FAILED');
    });

    it('returns SF_NOT_FOUND on ENOENT', () => {
      spawnStub.returns(makeEnoentResult());
      const result = server.call('provar.automation.compile', { flags: [] });
      assert.equal(parseBody(result).error_code, 'SF_NOT_FOUND');
    });
  });

  // ── provar.automation.setup ───────────────────────────────────────────────

  describe('provar.automation.setup', () => {
    let existsStub: sinon.SinonStub;
    let readdirStub: sinon.SinonStub;
    let readFileStub: sinon.SinonStub;
    let savedProvarHome: string | undefined;

    // A fake CWD that is cross-platform (os.tmpdir() returns a real platform path)
    const fakeCwd = path.join(os.tmpdir(), 'provar-test-workspace');
    const localProvarHome = path.resolve(fakeCwd, 'ProvarHome');
    const provarJar = (base: string): string => path.join(base, 'provardx', 'provardx.jar');

    beforeEach(() => {
      savedProvarHome = process.env['PROVAR_HOME'];
      delete process.env['PROVAR_HOME'];

      existsStub = sinon.stub(fs, 'existsSync').returns(false);
      readdirStub = sinon.stub(fs, 'readdirSync').throws(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      readFileStub = sinon.stub(fs, 'readFileSync').throws(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      sinon.stub(process, 'cwd').returns(fakeCwd);
    });

    afterEach(() => {
      if (savedProvarHome !== undefined) {
        process.env['PROVAR_HOME'] = savedProvarHome;
      } else {
        delete process.env['PROVAR_HOME'];
      }
    });

    /** Make existsSync return true for installPath and its provardx.jar. */
    function makeValidInstall(installPath: string): void {
      existsStub.withArgs(path.resolve(installPath)).returns(true);
      existsStub.withArgs(provarJar(path.resolve(installPath))).returns(true);
    }

    it('returns already_installed with install path when local ProvarHome exists', () => {
      makeValidInstall(localProvarHome);

      const result = server.call('provar.automation.setup', { force: false });
      const body = parseBody(result);

      assert.ok(!isError(result));
      assert.equal(body.already_installed, true);
      assert.equal(body.install_path, path.resolve(localProvarHome));
      assert.ok((body.message as string).includes('force: true'));
      assert.ok(spawnStub.notCalled, 'sf should not be called when already installed');
    });

    it('reads version from version.txt when present', () => {
      makeValidInstall(localProvarHome);
      readFileStub
        .withArgs(path.join(path.resolve(localProvarHome), 'version.txt'), 'utf-8')
        .returns('2.12.0\n');

      const body = parseBody(server.call('provar.automation.setup', { force: false }));

      assert.equal(body.version, '2.12.0');
    });

    it('reports version as null when no version file exists', () => {
      makeValidInstall(localProvarHome);
      // readFileStub already throws for all paths by default

      const body = parseBody(server.call('provar.automation.setup', { force: false }));

      assert.equal(body.version, null);
    });

    it('detects installation from PROVAR_HOME env var', () => {
      const envPath = path.join(os.tmpdir(), 'custom-provar');
      process.env['PROVAR_HOME'] = envPath;
      makeValidInstall(envPath);

      const body = parseBody(server.call('provar.automation.setup', { force: false }));
      const installs = body.installations as Array<{ source: string; path: string }>;

      assert.equal(body.already_installed, true);
      assert.ok(installs.some(i => i.source === 'env'));
    });

    it('deduplicates when PROVAR_HOME and ./ProvarHome resolve to the same directory', () => {
      process.env['PROVAR_HOME'] = localProvarHome; // same as CWD-relative ProvarHome
      makeValidInstall(localProvarHome);

      const body = parseBody(server.call('provar.automation.setup', { force: false }));
      const installs = body.installations as unknown[];

      assert.equal(installs.length, 1);
    });

    it('reports all installations when multiple distinct ones exist', () => {
      const envPath = path.join(os.tmpdir(), 'custom-provar');
      process.env['PROVAR_HOME'] = envPath;
      makeValidInstall(envPath);
      makeValidInstall(localProvarHome);

      const body = parseBody(server.call('provar.automation.setup', { force: false }));
      const installs = body.installations as unknown[];

      assert.equal(installs.length, 2);
    });

    it('force: true downloads even when a local install is already present', () => {
      makeValidInstall(localProvarHome);
      spawnStub.returns(makeSpawnResult('setup complete', '', 0));

      const body = parseBody(server.call('provar.automation.setup', { force: true }));

      assert.equal(body.already_installed, false);
      assert.equal(body.forced, true);
      assert.ok(spawnStub.calledOnce);
    });

    it('downloads when no install exists and returns install_path', () => {
      // Nothing exists before the download; ProvarHome appears once sf runs.
      // Use callsFake on spawnStub to flip the existsStub state mid-test,
      // accurately modelling the before/after filesystem change.
      let installExists = false;
      const localResolved = path.resolve(localProvarHome);
      existsStub.callsFake((p: string) => {
        if (p === localResolved || p === path.join(localResolved, 'provardx', 'provardx.jar')) {
          return installExists;
        }
        return false;
      });
      spawnStub.callsFake(() => {
        installExists = true; // "download" creates the directory
        return makeSpawnResult('Provar downloaded successfully', '', 0);
      });

      const result = server.call('provar.automation.setup', {});
      const body = parseBody(result);

      assert.ok(!isError(result));
      assert.equal(body.already_installed, false);
      assert.ok((body.install_path as string).includes('ProvarHome'));
      const sfArgs = spawnStub.firstCall.args[1] as string[];
      assert.deepEqual(sfArgs, ['provar', 'automation', 'setup']);
    });

    it('forwards --version flag to sf when version is specified', () => {
      spawnStub.returns(makeSpawnResult('ok', '', 0));

      server.call('provar.automation.setup', { version: '2.10.0' });

      const args = spawnStub.firstCall.args[1] as string[];
      assert.ok(args.includes('--version'));
      assert.ok(args.includes('2.10.0'));
    });

    it('does not forward --version flag when version is omitted', () => {
      spawnStub.returns(makeSpawnResult('ok', '', 0));

      server.call('provar.automation.setup', {});

      const args = spawnStub.firstCall.args[1] as string[];
      assert.ok(!args.includes('--version'));
    });

    it('returns AUTOMATION_SETUP_FAILED when sf exits non-zero', () => {
      spawnStub.returns(makeSpawnResult('', 'Provided version is not a valid version.', 1));

      const result = server.call('provar.automation.setup', { version: '0.0.0' });

      assert.ok(isError(result));
      assert.equal(parseBody(result).error_code, 'AUTOMATION_SETUP_FAILED');
      assert.ok((parseBody(result).message as string).includes('valid version'));
    });

    it('uses stdout as error message when stderr is empty', () => {
      spawnStub.returns(makeSpawnResult('Network timeout', '', 1));

      const body = parseBody(server.call('provar.automation.setup', {}));

      assert.equal(body.message, 'Network timeout');
    });

    it('returns SF_NOT_FOUND when sf CLI is not installed', () => {
      spawnStub.returns(makeEnoentResult());

      const result = server.call('provar.automation.setup', {});

      assert.ok(isError(result));
      const body = parseBody(result);
      assert.equal(body.error_code, 'SF_NOT_FOUND');
      assert.ok((body.message as string).includes('npm install -g @salesforce/cli'));
    });

    it('scans system install dirs for Provar* subdirectories', () => {
      // Simulate a system-level Provar directory in the platform base dir
      const platformBases: Record<string, string[]> = {
        win32: ['C:/Program Files', 'C:/Program Files (x86)'],
        darwin: ['/Applications'],
        linux: ['/opt', '/usr/local'],
      };
      const bases = platformBases[process.platform] ?? [];
      if (bases.length === 0) return; // skip on unrecognised platforms

      const base = bases[0];
      const provarDir = path.join(base, 'Provar 2.12.0');

      existsStub.withArgs(base).returns(true);
      readdirStub.withArgs(base).returns(['Provar 2.12.0', 'SomeOtherApp']);
      makeValidInstall(provarDir);

      const body = parseBody(server.call('provar.automation.setup', { force: false }));
      const installs = body.installations as Array<{ source: string; path: string }>;

      assert.ok(installs.some(i => i.source === 'system'), 'should find system install');
    });

    it('ignores non-Provar subdirectories in system install dirs', () => {
      const platformBases: Record<string, string[]> = {
        win32: ['C:/Program Files', 'C:/Program Files (x86)'],
        darwin: ['/Applications'],
        linux: ['/opt', '/usr/local'],
      };
      const bases = platformBases[process.platform] ?? [];
      if (bases.length === 0) return;

      const base = bases[0];
      existsStub.withArgs(base).returns(true);
      readdirStub.withArgs(base).returns(['Chrome', 'Firefox', 'NodeJS']);
      // None of these have provardx.jar

      const result = server.call('provar.automation.setup', { force: false });

      // No existing installs found → sf should be called
      assert.ok(spawnStub.calledOnce || isError(result)); // either calls sf or errors (ENOENT if sf not found)
    });

  });

  // ── provar.automation.metadata.download ──────────────────────────────────

  describe('provar.automation.metadata.download', () => {
    it('calls sf with metadata download args', () => {
      spawnStub.returns(makeSpawnResult('downloaded', '', 0));
      const result = server.call('provar.automation.metadata.download', { flags: [] });
      const body = parseBody(result);
      assert.equal(body.exitCode, 0);
      const args = spawnStub.firstCall.args[1] as string[];
      assert.deepEqual(args, ['provar', 'automation', 'metadata', 'download']);
    });

    it('forwards --target-org flag', () => {
      spawnStub.returns(makeSpawnResult('ok', '', 0));
      server.call('provar.automation.metadata.download', { flags: ['--target-org', 'myorg'] });
      const args = spawnStub.firstCall.args[1] as string[];
      assert.ok(args.includes('--target-org'));
      assert.ok(args.includes('myorg'));
    });

    it('returns AUTOMATION_METADATA_FAILED on non-zero exit', () => {
      spawnStub.returns(makeSpawnResult('', 'auth failed', 1));
      const result = server.call('provar.automation.metadata.download', { flags: [] });
      assert.ok(isError(result));
      assert.equal(parseBody(result).error_code, 'AUTOMATION_METADATA_FAILED');
    });

    it('returns SF_NOT_FOUND on ENOENT', () => {
      spawnStub.returns(makeEnoentResult());
      const result = server.call('provar.automation.metadata.download', { flags: [] });
      assert.equal(parseBody(result).error_code, 'SF_NOT_FOUND');
    });

    it('includes suggestion in details when [DOWNLOAD_ERROR] is in the message', () => {
      spawnStub.returns(makeSpawnResult('', 'Error (1): [DOWNLOAD_ERROR] ERROR\n', 1));
      const result = server.call('provar.automation.metadata.download', { flags: ['-c', 'MyOrg'] });
      assert.ok(isError(result));
      const body = parseBody(result);
      assert.equal(body.error_code, 'AUTOMATION_METADATA_FAILED');
      assert.ok(body.details && typeof (body.details as Record<string, unknown>).suggestion === 'string', 'Expected suggestion in details for DOWNLOAD_ERROR');
    });

    it('does NOT include suggestion for other failure messages', () => {
      spawnStub.returns(makeSpawnResult('', 'Error (2): Nonexistent flag: --properties-file\n', 1));
      const result = server.call('provar.automation.metadata.download', { flags: [] });
      assert.ok(isError(result));
      const body = parseBody(result);
      assert.ok(!body.details || !(body.details as Record<string, unknown>).suggestion, 'Expected no suggestion for non-DOWNLOAD_ERROR');
    });
  });

  // ── provar.automation.config.load ─────────────────────────────────────────

  describe('provar.automation.config.load', () => {
    it('calls sf with config load args and the given properties_path', () => {
      spawnStub.returns(makeSpawnResult('', '', 0));
      server.call('provar.automation.config.load', { properties_path: '/my/project/provardx-properties.json' });
      const [cmd, args] = spawnStub.firstCall.args as [string, string[]];
      assert.equal(cmd, 'sf');
      assert.deepEqual(args, ['provar', 'automation', 'config', 'load', '--properties-file', '/my/project/provardx-properties.json']);
    });

    it('returns properties_path in the response', () => {
      spawnStub.returns(makeSpawnResult('Config loaded', '', 0));
      const result = server.call('provar.automation.config.load', { properties_path: '/my/project/provardx-properties.json' });
      assert.ok(!isError(result));
      const body = parseBody(result);
      assert.equal(body.properties_path, '/my/project/provardx-properties.json');
    });

    it('returns AUTOMATION_CONFIG_LOAD_FAILED on non-zero exit', () => {
      spawnStub.returns(makeSpawnResult('', 'INVALID_PATH', 1));
      const result = server.call('provar.automation.config.load', { properties_path: '/missing.json' });
      assert.ok(isError(result));
      assert.equal(parseBody(result).error_code, 'AUTOMATION_CONFIG_LOAD_FAILED');
    });

    it('returns SF_NOT_FOUND on ENOENT', () => {
      spawnStub.returns(makeEnoentResult());
      const result = server.call('provar.automation.config.load', { properties_path: '/my/project/provardx-properties.json' });
      assert.equal(parseBody(result).error_code, 'SF_NOT_FOUND');
    });

    it('uses the explicit sf_path when provided', () => {
      spawnStub.returns(makeSpawnResult('', '', 0));
      server.call('provar.automation.config.load', { properties_path: '/proj/props.json', sf_path: '/custom/bin/sf' });
      const [cmd] = spawnStub.firstCall.args as [string, string[]];
      assert.equal(cmd, '/custom/bin/sf');
    });

    describe('path policy enforcement', () => {
      let restrictedServer: MockMcpServer;
      const allowedDir = os.tmpdir();

      beforeEach(async () => {
        restrictedServer = new MockMcpServer();
        const { registerAutomationConfigLoad, setSfPathCacheForTesting } = await import('../../../src/mcp/tools/automationTools.js');
        setSfPathCacheForTesting('sf');
        registerAutomationConfigLoad(restrictedServer as unknown as McpServer, { allowedPaths: [allowedDir] });
      });

      it('rejects properties_path outside allowed paths', () => {
        const result = restrictedServer.call('provar.automation.config.load', {
          properties_path: '/etc/passwd',
        });
        assert.ok(isError(result));
        assert.equal(parseBody(result).error_code, 'PATH_NOT_ALLOWED');
        assert.ok(!spawnStub.called, 'sf should not be spawned for a rejected path');
      });

      it('rejects properties_path with .. traversal', () => {
        // Use string concatenation (not path.join) so the ".." segment is preserved
        // in the raw string that assertPathAllowed inspects.
        const result = restrictedServer.call('provar.automation.config.load', {
          properties_path: allowedDir + '/../etc/passwd',
        });
        assert.ok(isError(result));
        assert.equal(parseBody(result).error_code, 'PATH_TRAVERSAL');
        assert.ok(!spawnStub.called, 'sf should not be spawned for a path traversal');
      });

      it('allows properties_path within allowed paths', () => {
        spawnStub.returns(makeSpawnResult('', '', 0));
        const allowed = path.join(allowedDir, 'provardx-properties.json');
        const result = restrictedServer.call('provar.automation.config.load', {
          properties_path: allowed,
        });
        assert.ok(!isError(result));
      });
    });
  });

  // ── sf_path threading ─────────────────────────────────────────────────────

  describe('sf_path explicit executable', () => {
    it('testrun uses sf_path as the executable', () => {
      spawnStub.returns(makeSpawnResult('ok', '', 0));
      server.call('provar.automation.testrun', { flags: [], sf_path: '/opt/sf/bin/sf' });
      assert.equal(spawnStub.firstCall.args[0], '/opt/sf/bin/sf');
    });

    it('compile uses sf_path as the executable', () => {
      spawnStub.returns(makeSpawnResult('ok', '', 0));
      server.call('provar.automation.compile', { flags: [], sf_path: '/opt/sf/bin/sf' });
      assert.equal(spawnStub.firstCall.args[0], '/opt/sf/bin/sf');
    });

    it('SF_NOT_FOUND message names the explicit path when sf_path is provided and missing', () => {
      spawnStub.returns(makeEnoentResult());
      const result = server.call('provar.automation.compile', { flags: [], sf_path: '/missing/sf' });
      const body = parseBody(result);
      assert.equal(body.error_code, 'SF_NOT_FOUND');
      assert.ok((body.message as string).includes('/missing/sf'), 'message should name the explicit path');
    });

    it('SF_NOT_FOUND message mentions sf_path option when no explicit path was given', () => {
      spawnStub.returns(makeEnoentResult());
      const result = server.call('provar.automation.testrun', { flags: [] });
      const body = parseBody(result);
      assert.equal(body.error_code, 'SF_NOT_FOUND');
      assert.ok((body.message as string).includes('sf_path'), 'message should hint at sf_path parameter');
      assert.ok((body.message as string).includes('npm install -g @salesforce/cli'));
    });
  });
});
