/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sinon from 'sinon';
import {
  sfSpawnHelper,
  SfNotFoundError,
  ProvarPluginNotFoundError,
  PROVAR_PLUGIN_INSTALL_HINT,
  isProvarPluginMissing,
  probeProvarTopic,
  getSfCommonPaths,
  needsWindowsShell,
  runSfCommand,
  setSfPathCacheForTesting,
  setSfPlatformForTesting,
  soqlEscape,
} from '../../../src/mcp/tools/sfSpawn.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

// runSfCommand streams the child's stdout/stderr to temp files instead of
// buffering them in memory, so the stub for sfSpawnHelper.spawnSync must mimic a
// real child: write the captured output to the file descriptors passed via
// `stdio: ['ignore', outFd, errFd]`, then return the spawn result. The in-memory
// probe path (encoding/maxBuffer, no fd stdio) simply receives the object.
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

function makeSpawnOk(stdout = '', stderr = ''): SpawnFake {
  return spawnFake({ stdout, stderr, status: 0, error: undefined, pid: 1, output: [], signal: null });
}

function makeSpawnFail(exitCode = 1, stdout = '', stderr = ''): SpawnFake {
  return spawnFake({ stdout, stderr, status: exitCode, error: undefined, pid: 1, output: [], signal: null });
}

function makeEnoent(): SpawnFake {
  return spawnFake({
    stdout: '',
    stderr: '',
    status: null,
    error: Object.assign(new Error('spawn sf ENOENT'), { code: 'ENOENT' }),
    pid: undefined,
    output: [],
    signal: null,
  });
}

// ── SfNotFoundError ───────────────────────────────────────────────────────────

describe('SfNotFoundError', () => {
  it('has code SF_NOT_FOUND', () => {
    const err = new SfNotFoundError();
    assert.equal(err.code, 'SF_NOT_FOUND');
    assert.equal(err.name, 'SfNotFoundError');
  });

  it('generic message mentions PATH and npm install hint', () => {
    const err = new SfNotFoundError();
    assert.ok(err.message.includes('npm install -g @salesforce/cli'));
    assert.ok(err.message.includes('PATH'));
  });

  it('path-specific message names the explicit path', () => {
    const err = new SfNotFoundError('/custom/sf');
    assert.ok(err.message.includes('/custom/sf'));
    assert.ok(err.message.includes('at explicit path'));
  });
});

// ── soqlEscape ────────────────────────────────────────────────────────────────

describe('soqlEscape', () => {
  it('leaves strings without quotes unchanged', () => {
    assert.equal(soqlEscape('hello world'), 'hello world');
  });

  it('escapes single quotes', () => {
    assert.equal(soqlEscape("O'Brien"), "O\\'Brien");
  });

  it('escapes multiple quotes', () => {
    assert.equal(soqlEscape("it's a 'test'"), "it\\'s a \\'test\\'");
  });

  it('handles empty string', () => {
    assert.equal(soqlEscape(''), '');
  });
});

// ── getSfCommonPaths ──────────────────────────────────────────────────────────

describe('getSfCommonPaths', () => {
  it('returns an array of strings', () => {
    const paths = getSfCommonPaths();
    assert.ok(Array.isArray(paths));
    assert.ok(paths.length > 0);
    for (const p of paths) assert.equal(typeof p, 'string');
  });

  it('includes Windows standalone installer paths on win32', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
    try {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      const paths = getSfCommonPaths();
      assert.ok(
        paths.some((p) => p.includes(path.join('Program Files', 'sf', 'bin'))),
        'should include C:\\Program Files\\sf\\bin\\sf.cmd'
      );
      assert.ok(
        paths.some((p) => p.includes(path.join('Program Files', 'sf', 'client', 'bin'))),
        'should include C:\\Program Files\\sf\\client\\bin\\sf.cmd'
      );
    } finally {
      if (originalDescriptor) Object.defineProperty(process, 'platform', originalDescriptor);
    }
  });

  it('all Windows paths end with .cmd', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
    try {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      const paths = getSfCommonPaths();
      for (const p of paths) assert.ok(p.endsWith('.cmd'), `expected .cmd: ${p}`);
    } finally {
      if (originalDescriptor) Object.defineProperty(process, 'platform', originalDescriptor);
    }
  });

  it('includes home-relative paths on non-Windows', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
    try {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      const paths = getSfCommonPaths();
      assert.ok(paths.includes('/usr/local/bin/sf'));
      assert.ok(paths.some((p) => p.includes(os.homedir())));
    } finally {
      if (originalDescriptor) Object.defineProperty(process, 'platform', originalDescriptor);
    }
  });
});

// ── needsWindowsShell ─────────────────────────────────────────────────────────

describe('needsWindowsShell', () => {
  it('returns false on non-Windows regardless of executable', () => {
    assert.equal(needsWindowsShell('sf', 'linux'), false);
    assert.equal(needsWindowsShell('sf.cmd', 'darwin'), false);
    assert.equal(needsWindowsShell('/usr/bin/sf', 'linux'), false);
  });

  it('returns true for .cmd on win32', () => {
    assert.equal(needsWindowsShell('sf.cmd', 'win32'), true);
    assert.equal(needsWindowsShell('C:\\npm\\sf.cmd', 'win32'), true);
  });

  it('returns true for .bat on win32', () => {
    assert.equal(needsWindowsShell('sf.bat', 'win32'), true);
  });

  it('returns true for bare name (no extension) on win32', () => {
    assert.equal(needsWindowsShell('sf', 'win32'), true);
  });

  it('returns false for .exe on win32', () => {
    assert.equal(needsWindowsShell('sf.exe', 'win32'), false);
  });

  it('is case-insensitive for extension check', () => {
    assert.equal(needsWindowsShell('SF.CMD', 'win32'), true);
    assert.equal(needsWindowsShell('SF.BAT', 'win32'), true);
  });
});

// ── runSfCommand ──────────────────────────────────────────────────────────────

describe('runSfCommand', () => {
  let spawnStub: sinon.SinonStub;

  beforeEach(() => {
    spawnStub = sinon.stub(sfSpawnHelper, 'spawnSync');
    setSfPathCacheForTesting('sf');
    setSfPlatformForTesting('linux');
  });

  afterEach(() => {
    sinon.restore();
    setSfPathCacheForTesting(undefined);
    setSfPlatformForTesting(undefined);
  });

  it('returns stdout, stderr, and exitCode on success', () => {
    spawnStub.callsFake(makeSpawnOk('output', 'warn'));
    const result = runSfCommand(['data', 'query']);
    assert.equal(result.stdout, 'output');
    assert.equal(result.stderr, 'warn');
    assert.equal(result.exitCode, 0);
  });

  it('passes args array to spawnSync', () => {
    spawnStub.callsFake(makeSpawnOk());
    runSfCommand(['provar', 'quality-hub', 'connect', '--target-org', 'myorg']);
    const [cmd, args] = spawnStub.firstCall.args as [string, string[]];
    assert.equal(cmd, 'sf');
    assert.deepEqual(args, ['provar', 'quality-hub', 'connect', '--target-org', 'myorg']);
  });

  it('uses explicit sfPath instead of cached path', () => {
    spawnStub.callsFake(makeSpawnOk());
    runSfCommand(['--version'], '/custom/path/sf');
    const [cmd] = spawnStub.firstCall.args as [string, string[]];
    assert.equal(cmd, '/custom/path/sf');
  });

  it('falls through to auto-discovery when sfPath is empty string', () => {
    // Empty string is not a valid path — should behave as if sfPath was absent
    spawnStub.callsFake(makeSpawnOk('ok'));
    runSfCommand(['--version'], '');
    const [cmd] = spawnStub.firstCall.args as [string, string[]];
    assert.equal(cmd, 'sf'); // uses the cached path, not the empty string
  });

  it('falls through to auto-discovery when sfPath is whitespace only', () => {
    spawnStub.callsFake(makeSpawnOk('ok'));
    runSfCommand(['--version'], '   ');
    const [cmd] = spawnStub.firstCall.args as [string, string[]];
    assert.equal(cmd, 'sf');
  });

  it('throws SfNotFoundError when cache is null and no sfPath given', () => {
    setSfPathCacheForTesting(null);
    assert.throws(
      () => runSfCommand(['--version']),
      (err) => {
        assert.ok(err instanceof SfNotFoundError);
        assert.equal(err.code, 'SF_NOT_FOUND');
        return true;
      }
    );
  });

  it('throws SfNotFoundError with path hint when explicit sfPath gives ENOENT', () => {
    spawnStub.callsFake(makeEnoent());
    assert.throws(
      () => runSfCommand(['--version'], '/bad/path/sf'),
      (err) => {
        assert.ok(err instanceof SfNotFoundError);
        assert.ok(err.message.includes('/bad/path/sf'));
        return true;
      }
    );
  });

  it('rethrows non-ENOENT errors', () => {
    const genericErr = new Error('unexpected failure');
    spawnStub.returns({
      stdout: '',
      stderr: '',
      status: null,
      error: genericErr,
      pid: undefined,
      output: [],
      signal: null,
    });
    assert.throws(() => runSfCommand(['--version']), genericErr);
  });

  it('returns exitCode 1 when status is null and no error', () => {
    spawnStub.returns({ stdout: '', stderr: '', status: null, error: undefined, pid: 1, output: [], signal: null });
    const result = runSfCommand(['--version']);
    assert.equal(result.exitCode, 1);
  });

  it('returns non-zero exitCode from failed command', () => {
    spawnStub.callsFake(makeSpawnFail(2, '', 'error text'));
    const result = runSfCommand(['bad', 'command']);
    assert.equal(result.exitCode, 2);
    assert.equal(result.stderr, 'error text');
  });

  // Regression (PDX-513): pre-streaming, spawnSync({ maxBuffer: 50 MB }) aborted
  // the whole call with ENOBUFS the moment combined child output crossed the cap.
  // Streaming stdout/stderr to temp files removes the in-memory ceiling entirely,
  // so an over-cap payload must round-trip with no throw. makeSpawnOk writes the
  // payload to the inherited fd, exercising the exact file-backed capture path.
  it('captures output larger than the retired 50 MB cap without ENOBUFS (file-backed)', function () {
    this.timeout(15_000);
    const huge = 'x'.repeat(51 * 1024 * 1024); // 51 MB — comfortably over the old 50 MB cap
    spawnStub.callsFake(makeSpawnOk(huge));

    let result: ReturnType<typeof runSfCommand> | undefined;
    assert.doesNotThrow(() => {
      result = runSfCommand(['provar', 'automation', 'test', 'run']);
    });
    assert.equal(result?.exitCode, 0);
    assert.equal(result?.stdout.length, huge.length, 'full over-cap output should round-trip through the temp file');
  });

  describe('Windows shell path injection guard', () => {
    beforeEach(() => {
      setSfPlatformForTesting('win32');
    });

    it('rejects sfPath containing & on win32', () => {
      // Path ends with .cmd (triggers shell) but has & in directory name
      assert.throws(() => runSfCommand(['--version'], 'C:\\sf & malicious\\sf.cmd'), /unsafe for shell execution/);
    });

    it('rejects sfPath containing | on win32', () => {
      assert.throws(() => runSfCommand(['--version'], 'C:\\sf|evil\\sf.cmd'), /unsafe for shell execution/);
    });

    it('accepts clean .cmd path on win32', () => {
      spawnStub.callsFake(makeSpawnOk('ok'));
      // Should not throw — clean path
      const result = runSfCommand(['--version'], 'C:\\Program Files\\sf\\bin\\sf.cmd');
      assert.equal(result.exitCode, 0);
    });
  });

  describe('probe-based resolution', () => {
    beforeEach(() => {
      setSfPathCacheForTesting(undefined); // force a fresh probe
      setSfPlatformForTesting('linux');
    });

    it('caches "sf" when shell:false probe succeeds', () => {
      spawnStub.callsFake(makeSpawnOk('sf/2.0.0'));
      runSfCommand(['--version']);
      const [, args, opts] = spawnStub.firstCall.args as [string, string[], { shell: boolean }];
      assert.deepEqual(args, ['--version']); // probe call
      assert.equal(opts.shell, false);
    });

    it('returns SF_NOT_FOUND when probe fails and no common path exists', () => {
      // Both probe attempts fail with ENOENT, no common paths match
      spawnStub.callsFake(makeEnoent());
      assert.throws(
        () => runSfCommand(['--version']),
        (err) => {
          assert.ok(err instanceof SfNotFoundError);
          return true;
        }
      );
    });

    it('Windows two-phase probe: retries with shell:true on ENOENT', () => {
      setSfPlatformForTesting('win32');
      // First call (shell:false) → ENOENT
      spawnStub.onFirstCall().callsFake(makeEnoent());
      // Second call (shell:true) → success
      spawnStub.onSecondCall().callsFake(makeSpawnOk('sf/2.0.0'));
      // Third call → the actual command
      spawnStub.onThirdCall().callsFake(makeSpawnOk('result'));

      const result = runSfCommand(['--version']);
      assert.equal(result.stdout, 'result');

      // Verify second probe used shell:true
      const [, , opts] = spawnStub.secondCall.args as [string, string[], { shell: boolean }];
      assert.equal(opts.shell, true);
    });
  });

  describe('Windows shell quoting (spaced executable & args not split)', () => {
    beforeEach(() => {
      setSfPlatformForTesting('win32');
      spawnStub.callsFake(makeSpawnOk('ok'));
    });

    it('(a) does not split an auto-resolved Program Files path', () => {
      const sfCmd = 'C:\\Program Files\\sf\\client\\bin\\sf.cmd';
      setSfPathCacheForTesting(sfCmd);
      runSfCommand(['provar', 'automation', 'config-load']);
      const [exe, , opts] = spawnStub.firstCall.args as [string, string[], { shell: boolean }];
      // The auto-resolved path is quoted as a single token even though no sf_path was passed.
      assert.equal(exe, `"${sfCmd}"`, `executable must be quoted as a single token, got: ${exe}`);
      assert.equal(opts.shell, true);
    });

    it('(b) does not split an explicit spaced sf_path', () => {
      const sfCmd = 'C:\\Program Files\\sf\\bin\\sf.cmd';
      runSfCommand(['--version'], sfCmd);
      const [exe] = spawnStub.firstCall.args as [string, string[]];
      assert.equal(exe, `"${sfCmd}"`, `explicit sf_path must be quoted, got: ${exe}`);
    });

    it('(c) does not split an argument value containing a space', () => {
      setSfPathCacheForTesting('sf');
      const propsPath = 'C:\\Users\\username\\git\\Provar Manager\\test-manager\\provardx-properties.json';
      runSfCommand(['provar', 'automation', 'config-load', '--properties-file', propsPath]);
      const [exe, args] = spawnStub.firstCall.args as [string, string[]];
      assert.equal(exe, 'sf'); // space-free executable stays unquoted
      assert.deepEqual(args, ['provar', 'automation', 'config-load', '--properties-file', `"${propsPath}"`]);
    });

    it('leaves simple (space-free) tokens unquoted on win32', () => {
      setSfPathCacheForTesting('sf');
      runSfCommand(['provar', 'automation', 'config-load']);
      const [exe, args] = spawnStub.firstCall.args as [string, string[]];
      assert.equal(exe, 'sf');
      assert.deepEqual(args, ['provar', 'automation', 'config-load']);
    });

    it('still rejects a user sf_path with shell metacharacters (spaces are now allowed)', () => {
      assert.throws(() => runSfCommand(['--version'], 'C:\\sf & evil\\sf.cmd'), /unsafe for shell execution/);
      // A spaced-but-clean user path is accepted and quoted.
      spawnStub.callsFake(makeSpawnOk('ok'));
      const result = runSfCommand(['--version'], 'C:\\Program Files\\sf\\bin\\sf.cmd');
      assert.equal(result.exitCode, 0);
    });
  });
});

// ── ProvarPluginNotFoundError ───────────────────────────────────────────────

describe('ProvarPluginNotFoundError', () => {
  it('has code PROVAR_PLUGIN_NOT_FOUND and remediation in the message', () => {
    const err = new ProvarPluginNotFoundError();
    assert.equal(err.code, 'PROVAR_PLUGIN_NOT_FOUND');
    assert.equal(err.name, 'ProvarPluginNotFoundError');
    assert.ok(err.message.includes(PROVAR_PLUGIN_INSTALL_HINT));
    assert.ok(err.message.toLowerCase().includes('provar'));
  });
});

// ── isProvarPluginMissing ────────────────────────────────────────────────────

describe('isProvarPluginMissing', () => {
  it('matches "command provar not found"', () => {
    assert.equal(isProvarPluginMissing('', 'command provar not found'), true);
  });

  it('matches a nested provar command not found (stdout)', () => {
    assert.equal(isProvarPluginMissing('command provar:automation:test:run not found', ''), true);
  });

  it('matches oclif "provar is not a sf command"', () => {
    assert.equal(isProvarPluginMissing('', 'Warning: provar is not a sf command.'), true);
  });

  it('does not match an unrelated failure', () => {
    assert.equal(isProvarPluginMissing('', 'Error: properties file not found at /proj/x.json'), false);
  });

  it('does not match a benign sf update warning', () => {
    assert.equal(
      isProvarPluginMissing('', 'Warning: @salesforce/cli update available from 2.132.14 to 2.136.8.'),
      false
    );
  });
});

// ── probeProvarTopic ─────────────────────────────────────────────────────────

describe('probeProvarTopic', () => {
  let spawnStub: sinon.SinonStub;

  beforeEach(() => {
    spawnStub = sinon.stub(sfSpawnHelper, 'spawnSync');
    setSfPathCacheForTesting('sf');
    setSfPlatformForTesting('linux');
  });

  afterEach(() => {
    sinon.restore();
    setSfPathCacheForTesting(undefined);
    setSfPlatformForTesting(undefined);
  });

  it('returns true when `sf provar --help` succeeds', () => {
    spawnStub.callsFake(makeSpawnOk('USAGE\n  $ sf provar COMMAND'));
    assert.equal(probeProvarTopic(), true);
  });

  it('returns false when the provar topic is missing', () => {
    spawnStub.callsFake(makeSpawnFail(1, '', 'command provar not found'));
    assert.equal(probeProvarTopic(), false);
  });

  it('returns false (does not throw) when sf itself is not found', () => {
    setSfPathCacheForTesting(null);
    assert.equal(probeProvarTopic(), false);
  });
});
