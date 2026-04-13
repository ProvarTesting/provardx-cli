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
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import {
  qualityHubClient,
  type AuthExchangeResponse,
  QualityHubAuthError,
} from '../../../../../src/services/qualityHub/client.js';
import {
  writeCredentials,
  readStoredCredentials,
  getCredentialsPath,
} from '../../../../../src/services/auth/credentials.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STORED_KEY = 'pv_k_currentkey123456';
const STORED_PREFIX = 'pv_k_currentk';

const ROTATED_KEY: AuthExchangeResponse = {
  api_key: 'pv_k_newrotatedkey12345',
  prefix: 'pv_k_newrotat',
  tier: 'standard',
  username: 'test@provar.com',
  expires_at: '2026-07-13T10:00:00+00:00',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('sf provar auth rotate — rotateKey client function', () => {
  let credentialsBackup: string | null = null;
  const credsPath = getCredentialsPath();

  beforeEach(() => {
    if (fs.existsSync(credsPath)) {
      credentialsBackup = fs.readFileSync(credsPath, 'utf-8');
    }
    writeCredentials(STORED_KEY, STORED_PREFIX, 'cognito');
  });

  afterEach(() => {
    sinon.restore();
    if (credentialsBackup !== null) {
      fs.mkdirSync(path.dirname(credsPath), { recursive: true });
      fs.writeFileSync(credsPath, credentialsBackup, 'utf-8');
      credentialsBackup = null;
    } else if (fs.existsSync(credsPath)) {
      fs.rmSync(credsPath);
    }
  });

  it('rotateKey resolves with new AuthExchangeResponse on success', async () => {
    sinon.stub(qualityHubClient, 'rotateKey').resolves(ROTATED_KEY);
    const result = await qualityHubClient.rotateKey(STORED_KEY, 'https://example.com');
    assert.equal(result.api_key, ROTATED_KEY.api_key);
    assert.equal(result.prefix, ROTATED_KEY.prefix);
    assert.equal(result.expires_at, ROTATED_KEY.expires_at);
  });

  it('writing the rotated key replaces the stored credentials', async () => {
    sinon.stub(qualityHubClient, 'rotateKey').resolves(ROTATED_KEY);
    const result = await qualityHubClient.rotateKey(STORED_KEY, 'https://example.com');
    writeCredentials(result.api_key, result.prefix, 'cognito');
    const stored = readStoredCredentials();
    assert.equal(stored?.api_key, ROTATED_KEY.api_key);
    assert.notEqual(stored?.api_key, STORED_KEY);
  });

  it('rotateKey rejects with QualityHubAuthError on 401', async () => {
    sinon.stub(qualityHubClient, 'rotateKey').rejects(new QualityHubAuthError('API key is invalid or expired.'));
    await assert.rejects(() => qualityHubClient.rotateKey(STORED_KEY, 'https://example.com'), QualityHubAuthError);
  });

  it('rotateKey rejects with generic Error on 500', async () => {
    sinon.stub(qualityHubClient, 'rotateKey').rejects(new Error('Key rotation failed (500): Internal server error'));
    await assert.rejects(() => qualityHubClient.rotateKey(STORED_KEY, 'https://example.com'), Error);
  });

  it('readStoredCredentials returns null when no credentials file exists', () => {
    fs.rmSync(credsPath, { force: true });
    assert.equal(readStoredCredentials(), null);
  });
});
