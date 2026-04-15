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
import {
  needsWindowsShell,
  setSfPlatformForTesting,
  filterTestRunOutput,
} from '../../../src/mcp/tools/automationTools.js';

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

type FakeSpawnResult = {
  stdout: string;
  stderr: string;
  status: number | null;
  error: Error | undefined;
  pid: number | undefined;
  output: string[];
  signal: null;
};

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

    const { registerAllAutomationTools, setSfPathCacheForTesting } = await import(
      '../../../src/mcp/tools/automationTools.js'
    );
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

    it('strips schema-validator noise from stdout and sets output_lines_suppressed', () => {
      const noisy = [
        'com.networknt.schema.validator.SchemaLoader - loading schema',
        'INFO Starting test run',
        'Tests: 5 passed, 0 failed',
      ].join('\n');
      spawnStub.returns(makeSpawnResult(noisy, '', 0));
      const result = server.call('provar.automation.testrun', { flags: [] });
      const body = parseBody(result);
      assert.ok(!(body.stdout as string).includes('networknt'), 'Filtered stdout should not contain schema noise');
      assert.ok((body.stdout as string).includes('Tests: 5 passed'), 'Real output should remain');
      assert.ok((body.output_lines_suppressed as number) > 0, 'output_lines_suppressed should be positive');
    });

    it('does not set output_lines_suppressed when stdout has no noise', () => {
      spawnStub.returns(makeSpawnResult('Tests: 3 passed, 0 failed', '', 0));
      const result = server.call('provar.automation.testrun', { flags: [] });
      const body = parseBody(result);
      assert.equal(body.output_lines_suppressed, undefined, 'output_lines_suppressed should be absent');
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
      readFileStub.withArgs(path.join(path.resolve(localProvarHome), 'version.txt'), 'utf-8').returns('2.12.0\n');

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
      assert.ok(installs.some((i) => i.source === 'env'));
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

      assert.ok(
        installs.some((i) => i.source === 'system'),
        'should find system install'
      );
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
      assert.ok(
        body.details && typeof (body.details as Record<string, unknown>).suggestion === 'string',
        'Expected suggestion in details for DOWNLOAD_ERROR'
      );
    });

    it('does NOT include suggestion for other failure messages', () => {
      spawnStub.returns(makeSpawnResult('', 'Error (2): Nonexistent flag: --properties-file\n', 1));
      const result = server.call('provar.automation.metadata.download', { flags: [] });
      assert.ok(isError(result));
      const body = parseBody(result);
      assert.ok(
        !body.details || !(body.details as Record<string, unknown>).suggestion,
        'Expected no suggestion for non-DOWNLOAD_ERROR'
      );
    });
  });

  // ── provar.automation.config.load ─────────────────────────────────────────

  describe('provar.automation.config.load', () => {
    it('calls sf with config load args and the given properties_path', () => {
      spawnStub.returns(makeSpawnResult('', '', 0));
      server.call('provar.automation.config.load', { properties_path: '/my/project/provardx-properties.json' });
      const [cmd, args] = spawnStub.firstCall.args as [string, string[]];
      assert.equal(cmd, 'sf');
      assert.deepEqual(args, [
        'provar',
        'automation',
        'config',
        'load',
        '--properties-file',
        '/my/project/provardx-properties.json',
      ]);
    });

    it('returns properties_path in the response', () => {
      spawnStub.returns(makeSpawnResult('Config loaded', '', 0));
      const result = server.call('provar.automation.config.load', {
        properties_path: '/my/project/provardx-properties.json',
      });
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
      const result = server.call('provar.automation.config.load', {
        properties_path: '/my/project/provardx-properties.json',
      });
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
        const { registerAutomationConfigLoad, setSfPathCacheForTesting } = await import(
          '../../../src/mcp/tools/automationTools.js'
        );
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

  // ── needsWindowsShell ─────────────────────────────────────────────────────

  describe('needsWindowsShell', () => {
    it('returns true on win32 for a .cmd executable', () => {
      assert.ok(needsWindowsShell('C:\\npm\\sf.cmd', 'win32'));
    });

    it('returns true on win32 for a .bat executable', () => {
      assert.ok(needsWindowsShell('C:\\tools\\run.bat', 'win32'));
    });

    it('returns true on win32 for an extensionless name (bare "sf")', () => {
      assert.ok(needsWindowsShell('sf', 'win32'));
    });

    it('returns true on win32 for an extensionless absolute path', () => {
      assert.ok(needsWindowsShell('C:\\npm\\sf', 'win32'));
    });

    it('returns false on win32 for a .js executable (node script, no shell needed)', () => {
      assert.ok(!needsWindowsShell('C:\\npm\\sf.js', 'win32'));
    });

    it('returns false on linux for a .cmd path', () => {
      assert.ok(!needsWindowsShell('/usr/bin/sf.cmd', 'linux'));
    });

    it('returns false on darwin for an extensionless path', () => {
      assert.ok(!needsWindowsShell('/usr/local/bin/sf', 'darwin'));
    });
  });

  // ── Windows shell option propagation ──────────────────────────────────────

  describe('Windows shell option in spawnSync', () => {
    // Override platform to win32 so these tests pass on any OS.
    beforeEach(() => {
      setSfPlatformForTesting('win32');
    });
    afterEach(() => {
      setSfPlatformForTesting(undefined);
    });

    it('passes shell: true when sf_path is a .cmd file', () => {
      spawnStub.returns(makeSpawnResult('ok', '', 0));
      server.call('provar.automation.compile', { flags: [], sf_path: 'C:\\npm\\sf.cmd' });
      const opts = spawnStub.firstCall.args[2] as { shell: boolean };
      assert.ok(opts.shell === true, 'shell should be true for a .cmd executable');
    });

    it('passes shell: false when sf_path is a .exe binary', () => {
      // .exe has an explicit extension that is neither .cmd nor .bat, so no
      // shell is required even on Windows.
      spawnStub.returns(makeSpawnResult('ok', '', 0));
      server.call('provar.automation.compile', { flags: [], sf_path: 'C:\\Program Files\\sf.exe' });
      const opts = spawnStub.firstCall.args[2] as { shell: boolean };
      assert.ok(opts.shell === false, 'shell should be false for a .exe executable');
    });

    it('passes shell: false for a .js node script path', () => {
      spawnStub.returns(makeSpawnResult('ok', '', 0));
      server.call('provar.automation.testrun', { flags: [], sf_path: 'C:\\npm\\sf.js' });
      const opts = spawnStub.firstCall.args[2] as { shell: boolean };
      assert.ok(opts.shell === false, 'shell should be false for a .js script');
    });

    it('passes shell: true when sf_path is a .bat file', () => {
      spawnStub.returns(makeSpawnResult('ok', '', 0));
      server.call('provar.automation.testrun', { flags: [], sf_path: 'C:\\tools\\sf.bat' });
      const opts = spawnStub.firstCall.args[2] as { shell: boolean };
      assert.ok(opts.shell === true, 'shell should be true for a .bat executable');
    });
  });

  // ── sf probe — two-phase discovery ───────────────────────────────────────

  describe('sf probe — two-phase discovery', () => {
    // Reset the cached path before each probe test so resolveSfExecutable() actually runs.
    // The outer beforeEach seeds 'sf'; we override it here.
    beforeEach(async () => {
      const { setSfPathCacheForTesting: resetCache } = await import('../../../src/mcp/tools/automationTools.js');
      resetCache(undefined);
    });

    afterEach(() => {
      setSfPlatformForTesting(undefined);
    });

    it('phase 1 uses shell:false for the --version probe', () => {
      spawnStub.onFirstCall().returns(makeSpawnResult('sf/2.0.0 linux-x64 node-v18', '', 0)); // probe
      spawnStub.onSecondCall().returns(makeSpawnResult('testrun ok', '', 0)); // actual command
      server.call('provar.automation.testrun', { flags: [] });
      const probeArgs = spawnStub.firstCall.args as [string, string[], { shell: boolean }];
      assert.deepEqual(probeArgs[1], ['--version']);
      assert.equal(probeArgs[2].shell, false);
    });

    it('phase 1 success — does not attempt phase 2', () => {
      spawnStub.onFirstCall().returns(makeSpawnResult('sf/2.0.0', '', 0)); // probe succeeds
      spawnStub.onSecondCall().returns(makeSpawnResult('ok', '', 0)); // actual command
      server.call('provar.automation.testrun', { flags: [] });
      // Exactly 2 spawns: phase 1 probe + actual command; no phase 2 retry
      const versionProbes = Array.from({ length: spawnStub.callCount }, (_, i) => spawnStub.getCall(i)).filter((c) =>
        (c.args[1] as string[]).includes('--version')
      );
      assert.equal(versionProbes.length, 1, 'only one version probe when phase 1 succeeds');
    });

    it('win32 ENOENT on phase 1 triggers a shell:true phase 2 probe', () => {
      setSfPlatformForTesting('win32');
      spawnStub.onFirstCall().returns(makeEnoentResult()); // phase 1 ENOENT
      spawnStub.onSecondCall().returns(makeSpawnResult('sf/2.0.0 win32', '', 0)); // phase 2 success
      spawnStub.onThirdCall().returns(makeSpawnResult('testrun ok', '', 0)); // actual command
      server.call('provar.automation.testrun', { flags: [] });
      assert.ok(spawnStub.callCount >= 2, 'phase 2 probe should have been called');
      const phase2Args = spawnStub.secondCall.args as [string, string[], { shell: boolean }];
      assert.deepEqual(phase2Args[1], ['--version']);
      assert.equal(phase2Args[2].shell, true);
    });

    it('non-win32 ENOENT on phase 1 does not trigger a phase 2 probe', () => {
      setSfPlatformForTesting('linux');
      spawnStub.onFirstCall().returns(makeEnoentResult()); // probe ENOENT
      // Safe default for any subsequent calls (e.g. if sf is found via common-path fallback)
      spawnStub.returns(makeSpawnResult('ok', '', 0));
      server.call('provar.automation.testrun', { flags: [] });
      // Only one --version probe; no shell:true retry on non-win32
      const versionProbes = Array.from({ length: spawnStub.callCount }, (_, i) => spawnStub.getCall(i)).filter((c) =>
        (c.args[1] as string[]).includes('--version')
      );
      assert.equal(versionProbes.length, 1, 'no phase 2 on non-win32');
    });
  });

  // ── sf_path injection hardening ───────────────────────────────────────────

  describe('sf_path injection hardening', () => {
    // Set platform to win32 so needsWindowsShell returns true for .cmd / extensionless paths,
    // which is the only condition under which assertShellSafePath is invoked.
    beforeEach(() => {
      setSfPlatformForTesting('win32');
    });
    afterEach(() => {
      setSfPlatformForTesting(undefined);
    });

    it('rejects sf_path with & when the path requires shell (extensionless on win32)', () => {
      // 'sf&evil' has no extension → needsWindowsShell returns true → assertShellSafePath rejects it
      const result = server.call('provar.automation.testrun', { flags: [], sf_path: 'sf&evil' });
      assert.ok(isError(result));
      assert.equal(parseBody(result).error_code, 'INVALID_SF_PATH');
      assert.ok(spawnStub.notCalled, 'spawnSync should not be called when path is rejected');
    });

    it('rejects sf_path with | when the path requires shell', () => {
      const result = server.call('provar.automation.testrun', { flags: [], sf_path: 'sf|evil' });
      assert.ok(isError(result));
      assert.equal(parseBody(result).error_code, 'INVALID_SF_PATH');
    });

    it('accepts a clean Windows .cmd path', () => {
      spawnStub.returns(makeSpawnResult('ok', '', 0));
      const result = server.call('provar.automation.testrun', { flags: [], sf_path: 'C:\\npm\\sf.cmd' });
      assert.ok(!isError(result));
    });

    it('does not check path safety on non-Windows (shell:false, no injection risk)', () => {
      setSfPlatformForTesting('linux');
      spawnStub.returns(makeSpawnResult('ok', '', 0));
      // On linux needsWindowsShell returns false → assertShellSafePath is never called
      const result = server.call('provar.automation.testrun', { flags: [], sf_path: '/usr/bin/sf' });
      assert.ok(!isError(result));
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

// ── filterTestRunOutput ───────────────────────────────────────────────────────

describe('filterTestRunOutput', () => {
  it('suppresses com.networknt.schema lines', () => {
    const raw = 'INFO Starting\ncom.networknt.schema.JsonSchemaFactory - loaded schema\nINFO Done';
    const { filtered, suppressed } = filterTestRunOutput(raw);
    assert.equal(suppressed, 1);
    assert.ok(!filtered.includes('networknt'), 'Schema lines should be removed');
    assert.ok(filtered.includes('INFO Starting'), 'Real output should remain');
  });

  it('suppresses SEVERE logger lock lines', () => {
    const raw = 'INFO Starting\nSEVERE Failed to configure logger: java.lck\nINFO Done';
    const { filtered, suppressed } = filterTestRunOutput(raw);
    assert.equal(suppressed, 1);
    assert.ok(!filtered.includes('Failed to configure logger'), 'Logger lock lines should be removed');
    assert.ok(filtered.includes('INFO Done'), 'Real output should remain');
  });

  it('keeps SEVERE lines that are real test failures', () => {
    const raw = 'SEVERE Test execution failed: AssertionError expected true but got false';
    const { filtered, suppressed } = filterTestRunOutput(raw);
    assert.equal(suppressed, 0);
    assert.ok(filtered.includes('SEVERE Test execution failed'), 'Real SEVERE lines should be kept');
  });

  it('counts suppressed lines correctly across both patterns', () => {
    const lines = [
      'INFO Tests running',
      'com.networknt.schema.validator.SchemaLoader - loading',
      'com.networknt.schema.format.FormatValidator - checking',
      'SEVERE Failed to configure logger: file.lck',
      'INFO Tests complete',
    ];
    const { suppressed } = filterTestRunOutput(lines.join('\n'));
    assert.equal(suppressed, 3);
  });

  it('appends suppressed-count note referencing provar.testrun.rca', () => {
    const raw = 'com.networknt.schema.SchemaLoader\nINFO Done';
    const { filtered } = filterTestRunOutput(raw);
    assert.ok(filtered.includes('lines suppressed'), 'Should append suppressed note');
    assert.ok(filtered.includes('provar.testrun.rca'), 'Should mention rca tool');
  });

  it('does not append note when nothing was suppressed', () => {
    const { filtered, suppressed } = filterTestRunOutput('INFO Starting\nINFO Done');
    assert.equal(suppressed, 0);
    assert.ok(!filtered.includes('lines suppressed'), 'Should not append note when nothing suppressed');
  });

  it('collapses consecutive blank lines to one', () => {
    const { filtered } = filterTestRunOutput('line1\n\n\n\nline2');
    assert.ok(!filtered.includes('\n\n\n'), 'Multiple blank lines should be collapsed');
    assert.ok(filtered.includes('line1'), 'Content should be preserved');
    assert.ok(filtered.includes('line2'), 'Content should be preserved');
  });

  it('handles Windows CRLF line endings without leaving trailing \\r', () => {
    const raw = 'INFO Starting\r\ncom.networknt.schema.JsonSchemaFactory - loaded\r\nINFO Done\r\n';
    const { filtered, suppressed } = filterTestRunOutput(raw);
    assert.equal(suppressed, 1, 'CRLF noise line should be suppressed');
    assert.ok(!filtered.includes('\r'), 'No trailing \\r should remain in output');
    assert.ok(filtered.includes('INFO Starting'), 'Real output should remain');
    assert.ok(filtered.includes('INFO Done'), 'Real output should remain');
  });
});
