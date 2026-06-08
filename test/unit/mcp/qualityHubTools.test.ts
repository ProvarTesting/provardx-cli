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
import sinon from 'sinon';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sfSpawnHelper, getSfCommonPaths, setSfPathCacheForTesting } from '../../../src/mcp/tools/sfSpawn.js';

// ── Minimal mock server ───────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => unknown;

class MockMcpServer {
  private handlers = new Map<string, ToolHandler>();

  public tool(name: string, _desc: string, _schema: unknown, handler: ToolHandler): void {
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

// runSfCommand streams the child's stdout/stderr to temp files rather than
// buffering them in memory, so the stub for sfSpawnHelper.spawnSync mimics a real
// child: it writes the captured output to the file descriptors passed via
// `stdio: ['ignore', outFd, errFd]`, then returns the spawn result. The in-memory
// probe path (encoding/maxBuffer, no fd stdio) just receives the object.
type FakeSpawnResult = {
  stdout: string;
  stderr: string;
  status: number | null;
  error: (Error & { code?: string }) | undefined;
  pid: number | undefined;
  output: never[];
  signal: null;
};
type SpawnFake = (...callArgs: unknown[]) => FakeSpawnResult;

function spawnFake(result: FakeSpawnResult): SpawnFake {
  return (...callArgs) => {
    const stdio = (callArgs[2] as { stdio?: unknown[] } | undefined)?.stdio;
    const outFd = stdio?.[1];
    const errFd = stdio?.[2];
    if (typeof outFd === 'number' && typeof errFd === 'number') {
      fs.writeSync(outFd, result.stdout);
      fs.writeSync(errFd, result.stderr);
    }
    return result;
  };
}

function makeSpawnResult(stdout: string, stderr: string, status: number): SpawnFake {
  return spawnFake({ stdout, stderr, status, error: undefined, pid: 1, output: [], signal: null });
}

function makeEnoentResult(): SpawnFake {
  const err = Object.assign(new Error('spawn sf ENOENT'), { code: 'ENOENT' });
  return spawnFake({ stdout: '', stderr: '', status: null, error: err, pid: undefined, output: [], signal: null });
}

function parseBody(result: unknown): Record<string, unknown> {
  const r = result as { content: Array<{ text: string }> };
  return JSON.parse(r.content[0].text) as Record<string, unknown>;
}

function isError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('qualityHubTools', () => {
  let server: MockMcpServer;
  let spawnStub: sinon.SinonStub;

  beforeEach(async () => {
    server = new MockMcpServer();
    spawnStub = sinon.stub(sfSpawnHelper, 'spawnSync');
    // Pre-seed the sf path cache to bypass the probe spawn — tests control spawnStub directly
    setSfPathCacheForTesting('sf');

    const { registerAllQualityHubTools } = await import('../../../src/mcp/tools/qualityHubTools.js');
    registerAllQualityHubTools(server as unknown as McpServer);
  });

  afterEach(() => {
    sinon.restore();
    setSfPathCacheForTesting(undefined); // reset cache so next test probes cleanly
  });

  // ── provar_qualityhub_connect ───────────────────────────────────────────────

  describe('provar_qualityhub_connect', () => {
    it('passes correct args to sf and returns stdout on success', () => {
      spawnStub.callsFake(makeSpawnResult('{"status":0}', '', 0));

      const result = server.call('provar_qualityhub_connect', { target_org: 'myorg', flags: [] });
      const body = parseBody(result);

      assert.equal(body.exitCode, 0);
      assert.equal(body.stdout, '{"status":0}');

      const [cmd, args] = spawnStub.firstCall.args as [string, string[]];
      assert.equal(cmd, 'sf');
      assert.deepEqual(args, ['provar', 'quality-hub', 'connect', '--target-org', 'myorg']);
    });

    it('forwards extra flags', () => {
      spawnStub.callsFake(makeSpawnResult('ok', '', 0));
      server.call('provar_qualityhub_connect', { target_org: 'myorg', flags: ['--json'] });
      const args = spawnStub.firstCall.args[1] as string[];
      assert.ok(args.includes('--json'));
    });

    it('returns isError when exit code is non-zero', () => {
      spawnStub.callsFake(makeSpawnResult('', 'bad credentials', 1));
      const result = server.call('provar_qualityhub_connect', { target_org: 'myorg', flags: [] });
      assert.ok(isError(result));
      const body = parseBody(result);
      assert.equal(body.error_code, 'QH_CONNECT_FAILED');
    });

    it('returns SF_NOT_FOUND when sf is not in PATH', () => {
      spawnStub.callsFake(makeEnoentResult());
      const result = server.call('provar_qualityhub_connect', { target_org: 'myorg', flags: [] });
      assert.ok(isError(result));
      const body = parseBody(result);
      assert.equal(body.error_code, 'SF_NOT_FOUND');
      assert.ok((body.message as string).includes('npm install -g @salesforce/cli'));
    });
  });

  // ── provar_qualityhub_display ───────────────────────────────────────────────

  describe('provar_qualityhub_display', () => {
    it('calls sf with display args on success', () => {
      spawnStub.callsFake(makeSpawnResult('display output', '', 0));
      const result = server.call('provar_qualityhub_display', { target_org: 'myorg', flags: [] });
      const body = parseBody(result);
      assert.equal(body.exitCode, 0);
      const args = spawnStub.firstCall.args[1] as string[];
      assert.ok(args.includes('quality-hub'));
      assert.ok(args.includes('display'));
    });

    it('omits --target-org when target_org not provided', () => {
      spawnStub.callsFake(makeSpawnResult('ok', '', 0));
      server.call('provar_qualityhub_display', { target_org: undefined, flags: [] });
      const args = spawnStub.firstCall.args[1] as string[];
      assert.ok(!args.includes('--target-org'));
    });

    it('returns isError on non-zero exit', () => {
      spawnStub.callsFake(makeSpawnResult('', 'error', 1));
      const result = server.call('provar_qualityhub_display', { flags: [] });
      assert.ok(isError(result));
    });

    it('returns SF_NOT_FOUND on ENOENT', () => {
      spawnStub.callsFake(makeEnoentResult());
      const result = server.call('provar_qualityhub_display', { flags: [] });
      const body = parseBody(result);
      assert.equal(body.error_code, 'SF_NOT_FOUND');
    });
  });

  // ── provar_qualityhub_display — detail + fields ────────────────────────────

  describe('provar_qualityhub_display — detail param', () => {
    it('standard (default) returns requestId, exitCode, stdout, stderr', () => {
      spawnStub.callsFake(makeSpawnResult('display output', '', 0));
      const result = server.call('provar_qualityhub_display', { flags: [] });
      const body = parseBody(result);
      assert.ok('requestId' in body);
      assert.ok('exitCode' in body);
      assert.ok('stdout' in body);
      assert.ok('stderr' in body);
    });

    it('summary returns only requestId and exitCode', () => {
      spawnStub.callsFake(makeSpawnResult('display output', '', 0));
      const result = server.call('provar_qualityhub_display', { flags: [], detail: 'summary' });
      const body = parseBody(result);
      assert.ok('requestId' in body, 'summary must include requestId');
      assert.ok('exitCode' in body, 'summary must include exitCode');
      assert.ok(!('stdout' in body), 'summary must not include stdout');
      assert.ok(!('stderr' in body), 'summary must not include stderr');
    });

    it('full returns same fields as standard', () => {
      spawnStub.callsFake(makeSpawnResult('display output', '', 0));
      const full = parseBody(server.call('provar_qualityhub_display', { flags: [], detail: 'full' }));
      const std = parseBody(server.call('provar_qualityhub_display', { flags: [], detail: 'standard' }));
      assert.deepEqual(Object.keys(full).sort(), Object.keys(std).sort());
    });
  });

  describe('provar_qualityhub_display — fields param', () => {
    it('retains only specified keys', () => {
      spawnStub.callsFake(makeSpawnResult('display output', '', 0));
      const result = server.call('provar_qualityhub_display', { flags: [], fields: 'exitCode,stdout' });
      const body = parseBody(result);
      assert.ok('exitCode' in body);
      assert.ok('stdout' in body);
      assert.ok(!('requestId' in body));
      assert.ok(!('stderr' in body));
    });

    it('silently ignores unknown fields', () => {
      spawnStub.callsFake(makeSpawnResult('ok', '', 0));
      const result = server.call('provar_qualityhub_display', { flags: [], fields: 'exitCode,ghost' });
      assert.equal(isError(result), false);
      const body = parseBody(result);
      assert.ok('exitCode' in body);
      assert.ok(!('ghost' in body));
    });
  });

  // ── provar_qualityhub_testrun ───────────────────────────────────────────────

  describe('provar_qualityhub_testrun', () => {
    it('passes correct args and returns success', () => {
      spawnStub.callsFake(makeSpawnResult('run started', '', 0));
      const result = server.call('provar_qualityhub_testrun', { target_org: 'myorg', flags: [] });
      const body = parseBody(result);
      assert.equal(body.exitCode, 0);
      const args = spawnStub.firstCall.args[1] as string[];
      assert.deepEqual(args, ['provar', 'quality-hub', 'test', 'run', '--target-org', 'myorg']);
    });

    it('returns QH_TESTRUN_FAILED on non-zero exit', () => {
      spawnStub.callsFake(makeSpawnResult('', 'run failed', 1));
      const result = server.call('provar_qualityhub_testrun', { target_org: 'myorg', flags: [] });
      assert.ok(isError(result));
      assert.equal(parseBody(result).error_code, 'QH_TESTRUN_FAILED');
    });

    it('returns SF_NOT_FOUND on ENOENT', () => {
      spawnStub.callsFake(makeEnoentResult());
      const result = server.call('provar_qualityhub_testrun', { target_org: 'myorg', flags: [] });
      assert.equal(parseBody(result).error_code, 'SF_NOT_FOUND');
    });

    it('adds wildcard warning when flags contain * glob pattern', () => {
      spawnStub.callsFake(makeSpawnResult('run started', '', 0));
      const result = server.call('provar_qualityhub_testrun', {
        target_org: 'myorg',
        flags: ['--plan-name', 'Suite/E2E*'],
      });
      assert.equal(isError(result), false, 'wildcard should not block execution');
      const body = parseBody(result);
      const details = body.details as Record<string, unknown> | undefined;
      assert.ok(details?.warning, 'Expected warning in details');
      assert.ok((details.warning as string).includes('Wildcard'), 'Warning should mention wildcard');
    });

    it('adds wildcard warning when flags contain ? pattern', () => {
      spawnStub.callsFake(makeSpawnResult('run started', '', 0));
      const result = server.call('provar_qualityhub_testrun', {
        target_org: 'myorg',
        flags: ['--plan-name', 'Suite?Test'],
      });
      const body = parseBody(result);
      const details = body.details as Record<string, unknown> | undefined;
      assert.ok(details?.warning, 'Expected warning for ? wildcard');
    });

    it('does not add warning for exact plan name flags', () => {
      spawnStub.callsFake(makeSpawnResult('run started', '', 0));
      const result = server.call('provar_qualityhub_testrun', {
        target_org: 'myorg',
        flags: ['--plan-name', 'SmokeTests'],
      });
      const body = parseBody(result);
      assert.ok(!body.details, 'No details warning for exact plan name');
    });
  });

  // ── provar_qualityhub_testrun_report ─────────────────────────────────────────

  describe('provar_qualityhub_testrun_report', () => {
    it('passes run_id in args', () => {
      spawnStub.callsFake(makeSpawnResult('{"status":"running"}', '', 0));
      server.call('provar_qualityhub_testrun_report', { target_org: 'myorg', run_id: 'abc-123', flags: [] });
      const args = spawnStub.firstCall.args[1] as string[];
      assert.ok(args.includes('--run-id'));
      assert.ok(args.includes('abc-123'));
    });

    it('returns QH_REPORT_FAILED on non-zero exit', () => {
      spawnStub.callsFake(makeSpawnResult('', 'not found', 1));
      const result = server.call('provar_qualityhub_testrun_report', {
        target_org: 'myorg',
        run_id: 'abc-123',
        flags: [],
      });
      assert.ok(isError(result));
      assert.equal(parseBody(result).error_code, 'QH_REPORT_FAILED');
    });

    it('returns SF_NOT_FOUND on ENOENT', () => {
      spawnStub.callsFake(makeEnoentResult());
      const result = server.call('provar_qualityhub_testrun_report', {
        target_org: 'myorg',
        run_id: 'abc-123',
        flags: [],
      });
      assert.equal(parseBody(result).error_code, 'SF_NOT_FOUND');
    });

    describe('failure detection', () => {
      it('sets suggestion when JSON result.status is "FAILED"', () => {
        spawnStub.callsFake(makeSpawnResult(JSON.stringify({ result: { status: 'FAILED' } }), '', 0));
        const result = server.call('provar_qualityhub_testrun_report', {
          target_org: 'myorg',
          run_id: 'abc-123',
          flags: [],
        });
        const body = parseBody(result);
        assert.ok(typeof body.suggestion === 'string' && body.suggestion.length > 0, 'Expected suggestion when FAILED');
      });

      it('sets suggestion when JSON result.status is "FAIL"', () => {
        spawnStub.callsFake(makeSpawnResult(JSON.stringify({ result: { status: 'FAIL' } }), '', 0));
        const result = server.call('provar_qualityhub_testrun_report', {
          target_org: 'myorg',
          run_id: 'abc-123',
          flags: [],
        });
        const body = parseBody(result);
        assert.ok(typeof body.suggestion === 'string' && body.suggestion.length > 0, 'Expected suggestion when FAIL');
      });

      it('does NOT set suggestion when status is "RUNNING"', () => {
        spawnStub.callsFake(makeSpawnResult(JSON.stringify({ result: { status: 'RUNNING' } }), '', 0));
        const result = server.call('provar_qualityhub_testrun_report', {
          target_org: 'myorg',
          run_id: 'abc-123',
          flags: [],
        });
        const body = parseBody(result);
        assert.ok(!body.suggestion, 'Expected no suggestion for non-failure status');
      });

      it('does NOT set suggestion when status is "PASSED"', () => {
        spawnStub.callsFake(makeSpawnResult(JSON.stringify({ result: { status: 'PASSED' } }), '', 0));
        const result = server.call('provar_qualityhub_testrun_report', {
          target_org: 'myorg',
          run_id: 'abc-123',
          flags: [],
        });
        const body = parseBody(result);
        assert.ok(!body.suggestion, 'Expected no suggestion when PASSED');
      });

      it('does NOT false-positive on "failure" in plain text output (word in non-status context)', () => {
        // Before PR #110 the check was /fail/i which would match "failure" anywhere in output;
        // now it only matches the "status" field value.
        spawnStub.callsFake(
          makeSpawnResult('{"message": "No failure detected in this output", "result": {"status": "PASSED"}}', '', 0)
        );
        const result = server.call('provar_qualityhub_testrun_report', {
          target_org: 'myorg',
          run_id: 'abc-123',
          flags: [],
        });
        const body = parseBody(result);
        assert.ok(!body.suggestion, 'Expected no suggestion — "failure" in message should not trigger detection');
      });

      it('falls back to regex extraction when stdout is not valid JSON', () => {
        // Non-JSON output with "status": "FAILED" substring
        spawnStub.callsFake(makeSpawnResult('"status": "FAILED"', '', 0));
        const result = server.call('provar_qualityhub_testrun_report', {
          target_org: 'myorg',
          run_id: 'abc-123',
          flags: [],
        });
        const body = parseBody(result);
        assert.ok(
          typeof body.suggestion === 'string' && body.suggestion.length > 0,
          'Expected suggestion from regex fallback'
        );
      });
    });
  });

  // ── provar_qualityhub_testrun_abort ──────────────────────────────────────────

  describe('provar_qualityhub_testrun_abort', () => {
    it('passes run_id and abort subcommand', () => {
      spawnStub.callsFake(makeSpawnResult('aborted', '', 0));
      server.call('provar_qualityhub_testrun_abort', { target_org: 'myorg', run_id: 'abc-123', flags: [] });
      const args = spawnStub.firstCall.args[1] as string[];
      assert.ok(args.includes('abort'));
      assert.ok(args.includes('abc-123'));
    });

    it('returns QH_ABORT_FAILED on non-zero exit', () => {
      spawnStub.callsFake(makeSpawnResult('', 'abort failed', 1));
      const result = server.call('provar_qualityhub_testrun_abort', {
        target_org: 'myorg',
        run_id: 'abc-123',
        flags: [],
      });
      assert.ok(isError(result));
      assert.equal(parseBody(result).error_code, 'QH_ABORT_FAILED');
    });

    it('returns SF_NOT_FOUND on ENOENT', () => {
      spawnStub.callsFake(makeEnoentResult());
      const result = server.call('provar_qualityhub_testrun_abort', {
        target_org: 'myorg',
        run_id: 'abc-123',
        flags: [],
      });
      assert.equal(parseBody(result).error_code, 'SF_NOT_FOUND');
    });
  });

  // ── provar_qualityhub_testcase_retrieve ──────────────────────────────────────

  describe('provar_qualityhub_testcase_retrieve', () => {
    it('calls sf with testcase retrieve args', () => {
      spawnStub.callsFake(makeSpawnResult('[]', '', 0));
      const result = server.call('provar_qualityhub_testcase_retrieve', {
        target_org: 'myorg',
        flags: ['--user-story', 'US-1'],
      });
      const body = parseBody(result);
      assert.equal(body.exitCode, 0);
      const args = spawnStub.firstCall.args[1] as string[];
      assert.ok(args.includes('testcase'));
      assert.ok(args.includes('retrieve'));
      assert.ok(args.includes('US-1'));
    });

    it('returns QH_RETRIEVE_FAILED on non-zero exit', () => {
      spawnStub.callsFake(makeSpawnResult('', 'no records', 1));
      const result = server.call('provar_qualityhub_testcase_retrieve', { target_org: 'myorg', flags: [] });
      assert.ok(isError(result));
      assert.equal(parseBody(result).error_code, 'QH_RETRIEVE_FAILED');
    });

    it('returns SF_NOT_FOUND on ENOENT', () => {
      spawnStub.callsFake(makeEnoentResult());
      const result = server.call('provar_qualityhub_testcase_retrieve', { target_org: 'myorg', flags: [] });
      assert.equal(parseBody(result).error_code, 'SF_NOT_FOUND');
    });
  });

  // ── provar_qualityhub_testcase_retrieve — detail + fields ─────────────────────

  describe('provar_qualityhub_testcase_retrieve — detail param', () => {
    it('standard (default) returns requestId, exitCode, stdout, stderr', () => {
      spawnStub.callsFake(makeSpawnResult('[]', '', 0));
      const result = server.call('provar_qualityhub_testcase_retrieve', { target_org: 'myorg', flags: [] });
      const body = parseBody(result);
      assert.ok('requestId' in body);
      assert.ok('exitCode' in body);
      assert.ok('stdout' in body);
      assert.ok('stderr' in body);
    });

    it('summary returns only requestId and exitCode', () => {
      spawnStub.callsFake(makeSpawnResult('[]', '', 0));
      const result = server.call('provar_qualityhub_testcase_retrieve', {
        target_org: 'myorg',
        flags: [],
        detail: 'summary',
      });
      const body = parseBody(result);
      assert.ok('requestId' in body, 'summary must include requestId');
      assert.ok('exitCode' in body, 'summary must include exitCode');
      assert.ok(!('stdout' in body), 'summary must not include stdout');
      assert.ok(!('stderr' in body), 'summary must not include stderr');
    });
  });

  describe('provar_qualityhub_testcase_retrieve — fields param', () => {
    it('retains only specified keys', () => {
      spawnStub.callsFake(makeSpawnResult('[]', '', 0));
      const result = server.call('provar_qualityhub_testcase_retrieve', {
        target_org: 'myorg',
        flags: [],
        fields: 'exitCode,stdout',
      });
      const body = parseBody(result);
      assert.ok('exitCode' in body);
      assert.ok('stdout' in body);
      assert.ok(!('requestId' in body));
    });

    it('silently ignores unknown field names', () => {
      spawnStub.callsFake(makeSpawnResult('[]', '', 0));
      const result = server.call('provar_qualityhub_testcase_retrieve', {
        target_org: 'myorg',
        flags: [],
        fields: 'exitCode,nope',
      });
      assert.equal(isError(result), false);
      const body = parseBody(result);
      assert.ok('exitCode' in body);
      assert.ok(!('nope' in body));
    });
  });

  // ── sf_path threading ─────────────────────────────────────────────────────────

  describe('sf_path threading', () => {
    it('provar_qualityhub_connect uses explicit sf_path as the executable', () => {
      spawnStub.callsFake(makeSpawnResult('ok', '', 0));
      server.call('provar_qualityhub_connect', {
        target_org: 'myorg',
        flags: [],
        sf_path: '/custom/bin/sf',
      });
      const [cmd] = spawnStub.firstCall.args as [string, string[]];
      assert.equal(cmd, '/custom/bin/sf');
    });

    it('provar_qualityhub_display uses explicit sf_path as the executable', () => {
      spawnStub.callsFake(makeSpawnResult('ok', '', 0));
      server.call('provar_qualityhub_display', { flags: [], sf_path: '/custom/bin/sf' });
      const [cmd] = spawnStub.firstCall.args as [string, string[]];
      assert.equal(cmd, '/custom/bin/sf');
    });

    it('returns SF_NOT_FOUND with path hint when explicit sf_path gives ENOENT', () => {
      spawnStub.callsFake(makeEnoentResult());
      const result = server.call('provar_qualityhub_connect', {
        target_org: 'myorg',
        flags: [],
        sf_path: '/nonexistent/sf',
      });
      assert.ok(isError(result));
      const body = parseBody(result);
      assert.equal(body.error_code, 'SF_NOT_FOUND');
      assert.ok((body.message as string).includes('/nonexistent/sf'), 'message should include the bad path');
    });

    it('returns SF_NOT_FOUND when no sf found and cache is null', () => {
      setSfPathCacheForTesting(null); // simulate: probe already ran, nothing found
      const result = server.call('provar_qualityhub_connect', { target_org: 'myorg', flags: [] });
      assert.ok(isError(result));
      assert.equal(parseBody(result).error_code, 'SF_NOT_FOUND');
    });
  });

  // ── getSfCommonPaths — B2a Windows standalone installer paths ─────────────────

  describe('getSfCommonPaths', () => {
    it('includes Windows standalone installer paths on win32', () => {
      const origPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      try {
        const paths = getSfCommonPaths();
        const expectedBin = path.join('C:', 'Program Files', 'sf', 'bin', 'sf.cmd');
        const expectedClientBin = path.join('C:', 'Program Files', 'sf', 'client', 'bin', 'sf.cmd');
        assert.ok(paths.includes(expectedBin), `Expected ${expectedBin} in common paths`);
        assert.ok(paths.includes(expectedClientBin), `Expected ${expectedClientBin} in common paths`);
      } finally {
        if (origPlatform) Object.defineProperty(process, 'platform', origPlatform);
      }
    });

    it('returns non-empty list on non-Windows platforms', () => {
      // On the current test platform (Linux/macOS), paths should include /usr/local/bin/sf
      if (process.platform !== 'win32') {
        const paths = getSfCommonPaths();
        assert.ok(paths.length > 0);
        assert.ok(paths.includes('/usr/local/bin/sf'));
      }
    });
  });
});
