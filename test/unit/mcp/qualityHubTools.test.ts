/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
/* eslint-disable camelcase */

import { strict as assert } from 'node:assert';
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

function makeSpawnResult(
  stdout: string,
  stderr: string,
  status: number
): { stdout: string; stderr: string; status: number; error: undefined; pid: number; output: never[]; signal: null } {
  return { stdout, stderr, status, error: undefined, pid: 1, output: [], signal: null };
}

function makeEnoentResult(): {
  stdout: string;
  stderr: string;
  status: null;
  error: Error & { code: string };
  pid: undefined;
  output: never[];
  signal: null;
} {
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

describe('qualityHubTools', () => {
  let server: MockMcpServer;
  let spawnStub: sinon.SinonStub;

  beforeEach(async () => {
    server = new MockMcpServer();
    spawnStub = sinon.stub(sfSpawnHelper, 'spawnSync');

    const { registerAllQualityHubTools } = await import('../../../src/mcp/tools/qualityHubTools.js');
    registerAllQualityHubTools(server as unknown as McpServer);
  });

  afterEach(() => {
    sinon.restore();
  });

  // ── provar.qualityhub.connect ───────────────────────────────────────────────

  describe('provar.qualityhub.connect', () => {
    it('passes correct args to sf and returns stdout on success', () => {
      spawnStub.returns(makeSpawnResult('{"status":0}', '', 0));

      const result = server.call('provar.qualityhub.connect', { target_org: 'myorg', flags: [] });
      const body = parseBody(result);

      assert.equal(body.exitCode, 0);
      assert.equal(body.stdout, '{"status":0}');

      const [cmd, args] = spawnStub.firstCall.args as [string, string[]];
      assert.equal(cmd, 'sf');
      assert.deepEqual(args, ['provar', 'quality-hub', 'connect', '--target-org', 'myorg']);
    });

    it('forwards extra flags', () => {
      spawnStub.returns(makeSpawnResult('ok', '', 0));
      server.call('provar.qualityhub.connect', { target_org: 'myorg', flags: ['--json'] });
      const args = spawnStub.firstCall.args[1] as string[];
      assert.ok(args.includes('--json'));
    });

    it('returns isError when exit code is non-zero', () => {
      spawnStub.returns(makeSpawnResult('', 'bad credentials', 1));
      const result = server.call('provar.qualityhub.connect', { target_org: 'myorg', flags: [] });
      assert.ok(isError(result));
      const body = parseBody(result);
      assert.equal(body.error_code, 'QH_CONNECT_FAILED');
    });

    it('returns SF_NOT_FOUND when sf is not in PATH', () => {
      spawnStub.returns(makeEnoentResult());
      const result = server.call('provar.qualityhub.connect', { target_org: 'myorg', flags: [] });
      assert.ok(isError(result));
      const body = parseBody(result);
      assert.equal(body.error_code, 'SF_NOT_FOUND');
      assert.ok((body.message as string).includes('npm install -g @salesforce/cli'));
    });
  });

  // ── provar.qualityhub.display ───────────────────────────────────────────────

  describe('provar.qualityhub.display', () => {
    it('calls sf with display args on success', () => {
      spawnStub.returns(makeSpawnResult('display output', '', 0));
      const result = server.call('provar.qualityhub.display', { target_org: 'myorg', flags: [] });
      const body = parseBody(result);
      assert.equal(body.exitCode, 0);
      const args = spawnStub.firstCall.args[1] as string[];
      assert.ok(args.includes('quality-hub'));
      assert.ok(args.includes('display'));
    });

    it('omits --target-org when target_org not provided', () => {
      spawnStub.returns(makeSpawnResult('ok', '', 0));
      server.call('provar.qualityhub.display', { target_org: undefined, flags: [] });
      const args = spawnStub.firstCall.args[1] as string[];
      assert.ok(!args.includes('--target-org'));
    });

    it('returns isError on non-zero exit', () => {
      spawnStub.returns(makeSpawnResult('', 'error', 1));
      const result = server.call('provar.qualityhub.display', { flags: [] });
      assert.ok(isError(result));
    });

    it('returns SF_NOT_FOUND on ENOENT', () => {
      spawnStub.returns(makeEnoentResult());
      const result = server.call('provar.qualityhub.display', { flags: [] });
      const body = parseBody(result);
      assert.equal(body.error_code, 'SF_NOT_FOUND');
    });
  });

  // ── provar.qualityhub.testrun ───────────────────────────────────────────────

  describe('provar.qualityhub.testrun', () => {
    it('passes correct args and returns success', () => {
      spawnStub.returns(makeSpawnResult('run started', '', 0));
      const result = server.call('provar.qualityhub.testrun', { target_org: 'myorg', flags: [] });
      const body = parseBody(result);
      assert.equal(body.exitCode, 0);
      const args = spawnStub.firstCall.args[1] as string[];
      assert.deepEqual(args, ['provar', 'quality-hub', 'test', 'run', '--target-org', 'myorg']);
    });

    it('returns QH_TESTRUN_FAILED on non-zero exit', () => {
      spawnStub.returns(makeSpawnResult('', 'run failed', 1));
      const result = server.call('provar.qualityhub.testrun', { target_org: 'myorg', flags: [] });
      assert.ok(isError(result));
      assert.equal(parseBody(result).error_code, 'QH_TESTRUN_FAILED');
    });

    it('returns SF_NOT_FOUND on ENOENT', () => {
      spawnStub.returns(makeEnoentResult());
      const result = server.call('provar.qualityhub.testrun', { target_org: 'myorg', flags: [] });
      assert.equal(parseBody(result).error_code, 'SF_NOT_FOUND');
    });

    it('adds wildcard warning when flags contain * glob pattern', () => {
      spawnStub.returns(makeSpawnResult('run started', '', 0));
      const result = server.call('provar.qualityhub.testrun', {
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
      spawnStub.returns(makeSpawnResult('run started', '', 0));
      const result = server.call('provar.qualityhub.testrun', {
        target_org: 'myorg',
        flags: ['--plan-name', 'Suite?Test'],
      });
      const body = parseBody(result);
      const details = body.details as Record<string, unknown> | undefined;
      assert.ok(details?.warning, 'Expected warning for ? wildcard');
    });

    it('does not add warning for exact plan name flags', () => {
      spawnStub.returns(makeSpawnResult('run started', '', 0));
      const result = server.call('provar.qualityhub.testrun', {
        target_org: 'myorg',
        flags: ['--plan-name', 'SmokeTests'],
      });
      const body = parseBody(result);
      assert.ok(!body.details, 'No details warning for exact plan name');
    });
  });

  // ── provar.qualityhub.testrun.report ─────────────────────────────────────────

  describe('provar.qualityhub.testrun.report', () => {
    it('passes run_id in args', () => {
      spawnStub.returns(makeSpawnResult('{"status":"running"}', '', 0));
      server.call('provar.qualityhub.testrun.report', { target_org: 'myorg', run_id: 'abc-123', flags: [] });
      const args = spawnStub.firstCall.args[1] as string[];
      assert.ok(args.includes('--run-id'));
      assert.ok(args.includes('abc-123'));
    });

    it('returns QH_REPORT_FAILED on non-zero exit', () => {
      spawnStub.returns(makeSpawnResult('', 'not found', 1));
      const result = server.call('provar.qualityhub.testrun.report', {
        target_org: 'myorg',
        run_id: 'abc-123',
        flags: [],
      });
      assert.ok(isError(result));
      assert.equal(parseBody(result).error_code, 'QH_REPORT_FAILED');
    });

    it('returns SF_NOT_FOUND on ENOENT', () => {
      spawnStub.returns(makeEnoentResult());
      const result = server.call('provar.qualityhub.testrun.report', {
        target_org: 'myorg',
        run_id: 'abc-123',
        flags: [],
      });
      assert.equal(parseBody(result).error_code, 'SF_NOT_FOUND');
    });

    describe('failure detection', () => {
      it('sets suggestion when JSON result.status is "FAILED"', () => {
        spawnStub.returns(makeSpawnResult(JSON.stringify({ result: { status: 'FAILED' } }), '', 0));
        const result = server.call('provar.qualityhub.testrun.report', {
          target_org: 'myorg',
          run_id: 'abc-123',
          flags: [],
        });
        const body = parseBody(result);
        assert.ok(typeof body.suggestion === 'string' && body.suggestion.length > 0, 'Expected suggestion when FAILED');
      });

      it('sets suggestion when JSON result.status is "FAIL"', () => {
        spawnStub.returns(makeSpawnResult(JSON.stringify({ result: { status: 'FAIL' } }), '', 0));
        const result = server.call('provar.qualityhub.testrun.report', {
          target_org: 'myorg',
          run_id: 'abc-123',
          flags: [],
        });
        const body = parseBody(result);
        assert.ok(typeof body.suggestion === 'string' && body.suggestion.length > 0, 'Expected suggestion when FAIL');
      });

      it('does NOT set suggestion when status is "RUNNING"', () => {
        spawnStub.returns(makeSpawnResult(JSON.stringify({ result: { status: 'RUNNING' } }), '', 0));
        const result = server.call('provar.qualityhub.testrun.report', {
          target_org: 'myorg',
          run_id: 'abc-123',
          flags: [],
        });
        const body = parseBody(result);
        assert.ok(!body.suggestion, 'Expected no suggestion for non-failure status');
      });

      it('does NOT set suggestion when status is "PASSED"', () => {
        spawnStub.returns(makeSpawnResult(JSON.stringify({ result: { status: 'PASSED' } }), '', 0));
        const result = server.call('provar.qualityhub.testrun.report', {
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
        spawnStub.returns(
          makeSpawnResult('{"message": "No failure detected in this output", "result": {"status": "PASSED"}}', '', 0)
        );
        const result = server.call('provar.qualityhub.testrun.report', {
          target_org: 'myorg',
          run_id: 'abc-123',
          flags: [],
        });
        const body = parseBody(result);
        assert.ok(!body.suggestion, 'Expected no suggestion — "failure" in message should not trigger detection');
      });

      it('falls back to regex extraction when stdout is not valid JSON', () => {
        // Non-JSON output with "status": "FAILED" substring
        spawnStub.returns(makeSpawnResult('"status": "FAILED"', '', 0));
        const result = server.call('provar.qualityhub.testrun.report', {
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

  // ── provar.qualityhub.testrun.abort ──────────────────────────────────────────

  describe('provar.qualityhub.testrun.abort', () => {
    it('passes run_id and abort subcommand', () => {
      spawnStub.returns(makeSpawnResult('aborted', '', 0));
      server.call('provar.qualityhub.testrun.abort', { target_org: 'myorg', run_id: 'abc-123', flags: [] });
      const args = spawnStub.firstCall.args[1] as string[];
      assert.ok(args.includes('abort'));
      assert.ok(args.includes('abc-123'));
    });

    it('returns QH_ABORT_FAILED on non-zero exit', () => {
      spawnStub.returns(makeSpawnResult('', 'abort failed', 1));
      const result = server.call('provar.qualityhub.testrun.abort', {
        target_org: 'myorg',
        run_id: 'abc-123',
        flags: [],
      });
      assert.ok(isError(result));
      assert.equal(parseBody(result).error_code, 'QH_ABORT_FAILED');
    });

    it('returns SF_NOT_FOUND on ENOENT', () => {
      spawnStub.returns(makeEnoentResult());
      const result = server.call('provar.qualityhub.testrun.abort', {
        target_org: 'myorg',
        run_id: 'abc-123',
        flags: [],
      });
      assert.equal(parseBody(result).error_code, 'SF_NOT_FOUND');
    });
  });

  // ── provar.qualityhub.testcase.retrieve ──────────────────────────────────────

  describe('provar.qualityhub.testcase.retrieve', () => {
    it('calls sf with testcase retrieve args', () => {
      spawnStub.returns(makeSpawnResult('[]', '', 0));
      const result = server.call('provar.qualityhub.testcase.retrieve', {
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
      spawnStub.returns(makeSpawnResult('', 'no records', 1));
      const result = server.call('provar.qualityhub.testcase.retrieve', { target_org: 'myorg', flags: [] });
      assert.ok(isError(result));
      assert.equal(parseBody(result).error_code, 'QH_RETRIEVE_FAILED');
    });

    it('returns SF_NOT_FOUND on ENOENT', () => {
      spawnStub.returns(makeEnoentResult());
      const result = server.call('provar.qualityhub.testcase.retrieve', { target_org: 'myorg', flags: [] });
      assert.equal(parseBody(result).error_code, 'SF_NOT_FOUND');
    });
  });
});
