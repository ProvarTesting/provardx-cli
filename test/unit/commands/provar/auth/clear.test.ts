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
  clearCredentials,
  getCredentialsPath,
} from '../../../../../src/services/auth/credentials.js';

let _origHome: string;
let _tempDir: string;

function useTemp(): void {
  _tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provar-clear-test-'));
  _origHome = os.homedir();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (os as any).homedir = (): string => _tempDir;
}

function restoreHome(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (os as any).homedir = (): string => _origHome;
  fs.rmSync(_tempDir, { recursive: true, force: true });
}

describe('auth clear logic', () => {
  beforeEach(useTemp);
  afterEach(restoreHome);

  it('deletes the credentials file when it exists', () => {
    writeCredentials('pv_k_abc123456789xyz', 'pv_k_abc123', 'manual');
    assert.ok(fs.existsSync(getCredentialsPath()), 'File should exist before clear');
    clearCredentials();
    assert.ok(!fs.existsSync(getCredentialsPath()), 'File should be deleted after clear');
  });

  it('does not throw when no credentials file exists', () => {
    assert.doesNotThrow(() => clearCredentials());
  });
});
