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
import {
  readStoredCredentials,
  writeCredentials,
  resolveApiKey,
} from '../../../../../src/services/auth/credentials.js';

// The status command reads credentials and reports source. We test the
// source-detection logic directly — the same logic the command uses.

let _origHome: string;
let _tempDir: string;
let _savedEnv: string | undefined;

function useTemp(): void {
  _tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provar-status-test-'));
  _origHome = os.homedir();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (os as any).homedir = (): string => _tempDir;
}

function restoreHome(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (os as any).homedir = (): string => _origHome;
  fs.rmSync(_tempDir, { recursive: true, force: true });
}

describe('auth status logic', () => {
  beforeEach(() => {
    _savedEnv = process.env.PROVAR_API_KEY;
    delete process.env.PROVAR_API_KEY;
    useTemp();
  });

  afterEach(() => {
    if (_savedEnv === undefined) {
      delete process.env.PROVAR_API_KEY;
    } else {
      process.env.PROVAR_API_KEY = _savedEnv;
    }
    restoreHome();
  });

  it('resolveApiKey returns null when nothing is configured', () => {
    assert.equal(resolveApiKey(), null);
    assert.equal(readStoredCredentials(), null);
  });

  it('resolveApiKey returns env var and readStoredCredentials returns null', () => {
    process.env.PROVAR_API_KEY = 'pv_k_fromenv123456';
    assert.equal(resolveApiKey(), 'pv_k_fromenv123456');
    assert.equal(readStoredCredentials(), null);
  });

  it('resolveApiKey returns stored key and readStoredCredentials returns the object', () => {
    writeCredentials('pv_k_fromfile12345', 'pv_k_fromfil', 'manual');
    assert.equal(resolveApiKey(), 'pv_k_fromfile12345');
    assert.ok(readStoredCredentials(), 'stored credentials should be readable');
  });

  it('status source detection: env var present → source is env (not file)', () => {
    writeCredentials('pv_k_fromfile12345', 'pv_k_fromfil', 'manual');
    process.env.PROVAR_API_KEY = 'pv_k_fromenv123456';
    const envKey = process.env.PROVAR_API_KEY?.trim();
    // status command checks env first; if present, source = env var
    assert.ok(envKey, 'env key should be truthy');
    assert.equal(resolveApiKey(), 'pv_k_fromenv123456');
  });
});
