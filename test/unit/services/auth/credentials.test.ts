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
import { describe, it, beforeEach, afterEach } from 'mocha';

// We override the credentials path by pointing PROVAR_CREDENTIALS_PATH at a temp dir.
// The module reads getCredentialsPath() at call time, so we patch os.homedir via an env-var
// approach: override the home dir with a temp directory for tests.
import {
  getCredentialsPath,
  readStoredCredentials,
  writeCredentials,
  clearCredentials,
  resolveApiKey,
  type StoredCredentials,
} from '../../../../src/services/auth/credentials.js';

// ── helpers ────────────────────────────────────────────────────────────────────

let _origHome: string;
let _tempDir: string;

function useTemp(): void {
  _tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provar-cred-test-'));
  _origHome = os.homedir();
  // Monkey-patch homedir for the duration of the test block
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (os as any).homedir = (): string => _tempDir;
}

function restoreHome(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (os as any).homedir = (): string => _origHome;
  fs.rmSync(_tempDir, { recursive: true, force: true });
}

// ── getCredentialsPath ─────────────────────────────────────────────────────────

describe('getCredentialsPath', () => {
  it('returns a path ending in .provar/credentials.json', () => {
    const p = getCredentialsPath();
    assert.ok(p.endsWith(path.join('.provar', 'credentials.json')), `Got: ${p}`);
  });
});

// ── readStoredCredentials ──────────────────────────────────────────────────────

describe('readStoredCredentials', () => {
  beforeEach(useTemp);
  afterEach(restoreHome);

  it('returns null when file does not exist', () => {
    assert.equal(readStoredCredentials(), null);
  });

  it('returns null on JSON parse failure', () => {
    const p = getCredentialsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'not-valid-json');
    assert.equal(readStoredCredentials(), null);
  });

  it('returns parsed object on valid file', () => {
    const data: StoredCredentials = {
      api_key: 'pv_k_abc123',
      prefix: 'pv_k_abc123',
      set_at: '2026-01-01T00:00:00.000Z',
      source: 'manual',
    };
    const p = getCredentialsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data));
    const result = readStoredCredentials();
    assert.deepEqual(result, data);
  });
});

// ── writeCredentials ───────────────────────────────────────────────────────────

describe('writeCredentials', () => {
  beforeEach(useTemp);
  afterEach(restoreHome);

  it('writes a file with the correct shape', () => {
    writeCredentials('pv_k_testkey123', 'pv_k_testke', 'manual');
    const stored = readStoredCredentials();
    assert.ok(stored, 'Expected stored credentials to be present');
    assert.equal(stored.api_key, 'pv_k_testkey123');
    assert.equal(stored.prefix, 'pv_k_testke');
    assert.equal(stored.source, 'manual');
    assert.ok(stored.set_at, 'Expected set_at to be present');
  });

  it('rejects a key that does not start with pv_k_', () => {
    assert.throws(
      () => writeCredentials('invalid-key', 'invalid', 'manual'),
      /Invalid API key format/
    );
  });

  it('creates the parent directory if it does not exist', () => {
    writeCredentials('pv_k_testkey123', 'pv_k_testke', 'manual');
    assert.ok(fs.existsSync(getCredentialsPath()));
  });
});

// ── clearCredentials ───────────────────────────────────────────────────────────

describe('clearCredentials', () => {
  beforeEach(useTemp);
  afterEach(restoreHome);

  it('deletes the credentials file when it exists', () => {
    writeCredentials('pv_k_testkey123', 'pv_k_testke', 'manual');
    assert.ok(fs.existsSync(getCredentialsPath()));
    clearCredentials();
    assert.ok(!fs.existsSync(getCredentialsPath()));
  });

  it('does not throw when the file does not exist (ENOENT)', () => {
    assert.doesNotThrow(() => clearCredentials());
  });
});

// ── resolveApiKey ──────────────────────────────────────────────────────────────

describe('resolveApiKey', () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env.PROVAR_API_KEY;
    delete process.env.PROVAR_API_KEY;
    useTemp();
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.PROVAR_API_KEY;
    } else {
      process.env.PROVAR_API_KEY = savedEnv;
    }
    restoreHome();
  });

  it('returns the env var when set', () => {
    process.env.PROVAR_API_KEY = 'pv_k_fromenv';
    assert.equal(resolveApiKey(), 'pv_k_fromenv');
  });

  it('env var takes priority over a stored file', () => {
    writeCredentials('pv_k_fromfile', 'pv_k_fromfil', 'manual');
    process.env.PROVAR_API_KEY = 'pv_k_fromenv';
    assert.equal(resolveApiKey(), 'pv_k_fromenv');
  });

  it('treats PROVAR_API_KEY="" as unset and falls through to stored file', () => {
    process.env.PROVAR_API_KEY = '';
    writeCredentials('pv_k_fromfile', 'pv_k_fromfil', 'manual');
    assert.equal(resolveApiKey(), 'pv_k_fromfile');
  });

  it('treats PROVAR_API_KEY with only whitespace as unset', () => {
    process.env.PROVAR_API_KEY = '   ';
    writeCredentials('pv_k_fromfile', 'pv_k_fromfil', 'manual');
    assert.equal(resolveApiKey(), 'pv_k_fromfile');
  });

  it('returns stored key when no env var is set', () => {
    writeCredentials('pv_k_fromfile', 'pv_k_fromfil', 'manual');
    assert.equal(resolveApiKey(), 'pv_k_fromfile');
  });

  it('returns null when neither env var nor file is set', () => {
    assert.equal(resolveApiKey(), null);
  });

  it('returns null when file is corrupt JSON', () => {
    const p = getCredentialsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'not-json');
    assert.equal(resolveApiKey(), null);
  });
});
