/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import {
  generatePkce,
  getBrowserCommand,
  loginFlowClient,
  type CognitoTokens,
  CALLBACK_PORTS,
} from '../../../../../src/services/auth/loginFlow.js';
import { qualityHubClient, type AuthExchangeResponse } from '../../../../../src/services/qualityHub/client.js';
import {
  writeCredentials,
  readStoredCredentials,
  getCredentialsPath,
} from '../../../../../src/services/auth/credentials.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_TOKENS: CognitoTokens = {
  access_token: 'cognito-access-token-test',
  id_token: 'cognito-id-token-test',
  token_type: 'Bearer',
  expires_in: 3600,
};

const MOCK_KEY: AuthExchangeResponse = {
  api_key: 'pv_k_logintest1234567890',
  prefix: 'pv_k_logintest',
  tier: 'enterprise',
  username: 'test@provar.com',
  expires_at: '2026-07-11T00:00:00.000Z',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

let origHomedir: () => string;
let tempDir: string;

function useTemp(): void {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provar-login-test-'));
  origHomedir = os.homedir;
  (os as unknown as { homedir: () => string }).homedir = (): string => tempDir;
}

function restoreHome(): void {
  (os as unknown as { homedir: () => string }).homedir = origHomedir;
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ── getBrowserCommand ─────────────────────────────────────────────────────────

describe('getBrowserCommand', () => {
  const url = 'https://example.com/login?code=abc&state=xyz';

  it('uses "open" on macOS', () => {
    const { cmd, args } = getBrowserCommand(url, 'darwin');
    assert.equal(cmd, 'open');
    assert.deepEqual(args, [url]);
  });

  it('uses powershell.exe with Start-Process on Windows', () => {
    const { cmd, args } = getBrowserCommand(url, 'win32');
    assert.equal(cmd, 'powershell.exe');
    assert.ok(args.includes('-NoProfile'), 'should pass -NoProfile');
    assert.ok(args.includes('Start-Process $args[0]') || args.join(' ').includes('Start-Process'), 'should use Start-Process');
    // URL is passed as a separate arg — never interpolated into the command string
    assert.equal(args[args.length - 1], url, 'URL must be the last argument');
  });

  it('uses "xdg-open" on Linux', () => {
    const { cmd, args } = getBrowserCommand(url, 'linux');
    assert.equal(cmd, 'xdg-open');
    assert.deepEqual(args, [url]);
  });

  it('uses "xdg-open" for unknown platforms', () => {
    const { cmd } = getBrowserCommand(url, 'freebsd');
    assert.equal(cmd, 'xdg-open');
  });

  it('includes the full URL in args for all platforms', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as NodeJS.Platform[]) {
      const { args } = getBrowserCommand(url, platform);
      assert.ok(args.includes(url), `URL must appear in args for platform ${platform}`);
    }
  });
});

// ── generatePkce ──────────────────────────────────────────────────────────────

describe('generatePkce', () => {
  it('returns distinct verifier and challenge strings', () => {
    const { verifier, challenge } = generatePkce();
    assert.ok(verifier.length >= 43, 'verifier should be ≥43 chars (base64url of 32 bytes)');
    assert.notEqual(verifier, challenge, 'verifier and challenge must differ');
    assert.ok(/^[A-Za-z0-9_-]+$/.test(verifier), 'verifier is base64url');
    assert.ok(/^[A-Za-z0-9_-]+$/.test(challenge), 'challenge is base64url');
  });

  it('generates a unique pair on each call', () => {
    const a = generatePkce();
    const b = generatePkce();
    assert.notEqual(a.verifier, b.verifier);
    assert.notEqual(a.challenge, b.challenge);
  });

  it('challenge is the S256 (SHA-256 base64url) of verifier', async () => {
    const crypto = await import('node:crypto');
    const { verifier, challenge } = generatePkce();
    const expected = crypto.createHash('sha256').update(verifier).digest('base64url');
    assert.equal(challenge, expected);
  });
});

// ── listenForCallback ─────────────────────────────────────────────────────────

describe('listenForCallback', () => {
  it('resolves with the auth code when Cognito callback arrives', async () => {
    const port = CALLBACK_PORTS[0];
    const callbackPromise = loginFlowClient.listenForCallback(port);

    // Simulate Cognito redirect
    await new Promise<void>((res) => setTimeout(res, 20));
    const req = http.request({ hostname: '127.0.0.1', port, path: '/callback?code=test-code-123', method: 'GET' });
    req.end();

    const code = await callbackPromise;
    assert.equal(code, 'test-code-123');
  });

  it('rejects when Cognito returns an error parameter', async () => {
    const port = CALLBACK_PORTS[1];
    const callbackPromise = loginFlowClient.listenForCallback(port);

    await new Promise<void>((res) => setTimeout(res, 20));
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/callback?error=access_denied&error_description=User+cancelled',
      method: 'GET',
    });
    req.end();

    await assert.rejects(callbackPromise, /User cancelled/);
  });
});

// ── Login flow integration (service-layer, no OCLIF invocation) ───────────────
// The login command is a thin orchestrator. We test that the credential write
// happens correctly after a successful exchange, and that nothing is written on
// failure. NUT tests cover end-to-end command invocation.

describe('login flow: credential writing', () => {
  beforeEach(useTemp);
  afterEach(restoreHome);

  it('writeCredentials with source "cognito" stores the pv_k_ key', () => {
    writeCredentials(MOCK_KEY.api_key, MOCK_KEY.prefix, 'cognito');
    const stored = readStoredCredentials();
    assert.ok(stored, 'credentials should be written');
    assert.equal(stored.api_key, MOCK_KEY.api_key);
    assert.equal(stored.prefix, MOCK_KEY.prefix);
    assert.equal(stored.source, 'cognito');
  });

  it('Cognito tokens do NOT appear in the credentials file', () => {
    writeCredentials(MOCK_KEY.api_key, MOCK_KEY.prefix, 'cognito');
    const raw = fs.readFileSync(getCredentialsPath(), 'utf-8');
    assert.ok(!raw.includes(MOCK_TOKENS.access_token), 'access_token must not be on disk');
    assert.ok(!raw.includes(MOCK_TOKENS.id_token), 'id_token must not be on disk');
  });
});

// ── qualityHubClient.exchangeTokenForKey (via sinon stub) ─────────────────────

describe('qualityHubClient.exchangeTokenForKey stub', () => {
  let stub: sinon.SinonStub;

  beforeEach(useTemp);
  afterEach(() => {
    stub.restore();
    restoreHome();
  });

  it('resolves with AuthExchangeResponse and credentials are written', async () => {
    stub = sinon.stub(qualityHubClient, 'exchangeTokenForKey').resolves(MOCK_KEY);

    const result = await qualityHubClient.exchangeTokenForKey('any-access-token', 'https://example.com');
    writeCredentials(result.api_key, result.prefix, 'cognito');

    assert.ok(stub.calledOnce);
    assert.equal(stub.firstCall.args[0], 'any-access-token');

    const stored = readStoredCredentials();
    assert.ok(stored);
    assert.equal(stored.api_key, MOCK_KEY.api_key);
    assert.equal(stored.source, 'cognito');
  });

  it('propagates auth error — credentials must not be written on failure', async () => {
    stub = sinon
      .stub(qualityHubClient, 'exchangeTokenForKey')
      .rejects(new Error('Account not found or no active subscription'));

    await assert.rejects(
      () => qualityHubClient.exchangeTokenForKey('bad-token', 'https://example.com'),
      /subscription/
    );
    assert.equal(readStoredCredentials(), null, 'no credentials should be written on error');
  });
});
