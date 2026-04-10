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
  writeCredentials,
  getCredentialsPath,
} from '../../../../../src/services/auth/credentials.js';

// The auth commands are thin wrappers over credentials.ts functions.
// We test the credentials logic directly to avoid OCLIF process.argv side-effects
// in the unit test runner. Integration / NUT tests cover the full command invocation.

let _origHome: string;
let _tempDir: string;

function useTemp(): void {
  _tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provar-setkey-test-'));
  _origHome = os.homedir();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (os as any).homedir = (): string => _tempDir;
}

function restoreHome(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (os as any).homedir = (): string => _origHome;
  fs.rmSync(_tempDir, { recursive: true, force: true });
}

describe('auth set-key logic', () => {
  beforeEach(useTemp);
  afterEach(restoreHome);

  it('writes credentials file for a valid pv_k_ key', () => {
    writeCredentials('pv_k_abc123456789xyz', 'pv_k_abc123', 'manual');
    const stored = JSON.parse(fs.readFileSync(getCredentialsPath(), 'utf-8')) as Record<string, string>;
    assert.equal(stored.api_key, 'pv_k_abc123456789xyz');
    assert.equal(stored.source, 'manual');
    assert.ok(stored.set_at, 'set_at should be present');
  });

  it('stores a 12-character prefix', () => {
    const key = 'pv_k_abc123456789xyz';
    const prefix = key.substring(0, 12);
    writeCredentials(key, prefix, 'manual');
    const stored = JSON.parse(fs.readFileSync(getCredentialsPath(), 'utf-8')) as Record<string, string>;
    assert.equal(stored.prefix, 'pv_k_abc1234');
  });

  it('rejects a key that does not start with pv_k_', () => {
    assert.throws(
      () => writeCredentials('invalid-key-format', 'invalid-key', 'manual'),
      /pv_k_/
    );
  });

  it('rejects a key starting with wrong prefix', () => {
    assert.throws(
      () => writeCredentials('pk_abc123', 'pk_abc123', 'manual'),
      /pv_k_/
    );
  });
});
