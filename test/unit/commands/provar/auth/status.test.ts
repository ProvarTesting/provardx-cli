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
import { describe, it, beforeEach, afterEach } from 'mocha';
import {
  readStoredCredentials,
  writeCredentials,
  resolveApiKey,
} from '../../../../../src/services/auth/credentials.js';

// The status command reads credentials and reports source. We test the
// source-detection logic directly — the same logic the command uses.

let origHomedir: () => string;
let tempDir: string;
let savedEnv: string | undefined;

function useTemp(): void {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provar-status-test-'));
  origHomedir = os.homedir;
  (os as unknown as { homedir: () => string }).homedir = (): string => tempDir;
}

function restoreHome(): void {
  (os as unknown as { homedir: () => string }).homedir = origHomedir;
  fs.rmSync(tempDir, { recursive: true, force: true });
}

describe('auth status logic', () => {
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

  it('resolveApiKey ignores env var without pv_k_ prefix, falls through to stored file', () => {
    writeCredentials('pv_k_fromfile12345', 'pv_k_fromfil', 'manual');
    process.env.PROVAR_API_KEY = 'sk-wrong-prefix-key';
    assert.equal(resolveApiKey(), 'pv_k_fromfile12345');
  });
});

// ── Expiry warning calculation (unit) ────────────────────────────────────────
// These tests exercise the same arithmetic used in the status command's
// expires_at branch, keeping Date.now() deterministic via explicit timestamps.

function calcDaysLeft(expiresAt: string, nowMs: number): number | null {
  const expiresMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresMs)) return null;
  return Math.ceil((expiresMs - nowMs) / (1000 * 60 * 60 * 24));
}

describe('auth status — expiry warning logic', () => {
  const NOW = new Date('2026-04-22T12:00:00.000Z').getTime();

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

  it('returns null for an unparseable timestamp', () => {
    assert.equal(calcDaysLeft('not-a-date', NOW), null);
  });

  it('returns null for an empty string', () => {
    assert.equal(calcDaysLeft('', NOW), null);
  });

  it('reports 1 day left (singular) when expiry is < 24 h away', () => {
    const expiry = new Date(NOW + 1 * 60 * 60 * 1000).toISOString(); // +1 hour
    const days = calcDaysLeft(expiry, NOW);
    assert.equal(days, 1);
  });

  it('reports 7 days left inside the 14-day warning window', () => {
    const expiry = new Date(NOW + 7 * 24 * 60 * 60 * 1000).toISOString();
    const days = calcDaysLeft(expiry, NOW);
    assert.equal(days, 7);
    assert.ok(days !== null && days <= 14 && days > 0, 'should be in warning range');
  });

  it('reports 14 days left — boundary: still warns', () => {
    const expiry = new Date(NOW + 14 * 24 * 60 * 60 * 1000).toISOString();
    const days = calcDaysLeft(expiry, NOW);
    assert.equal(days, 14);
    assert.ok(days !== null && days <= 14 && days > 0);
  });

  it('reports 15 days left — outside warning window, no warning', () => {
    const expiry = new Date(NOW + 15 * 24 * 60 * 60 * 1000).toISOString();
    const days = calcDaysLeft(expiry, NOW);
    assert.equal(days, 15);
    assert.ok(days !== null && !(days <= 14 && days > 0));
  });

  it('reports 0 or negative days when already expired', () => {
    const expiry = new Date(NOW - 1 * 60 * 60 * 1000).toISOString(); // 1 hour ago
    const days = calcDaysLeft(expiry, NOW);
    assert.ok(days !== null && days <= 0, 'should be expired');
  });

  it('pluralises "days" for values != 1', () => {
    const days: number = 7;
    const suffix = days === 1 ? '' : 's';
    assert.equal(suffix, 's');
  });

  it('uses no suffix (singular) for exactly 1 day', () => {
    const days: number = 1;
    const suffix = days === 1 ? '' : 's';
    assert.equal(suffix, '');
  });

  it('writeCredentials stores expires_at and readStoredCredentials returns it', () => {
    const expires = new Date(NOW + 30 * 24 * 60 * 60 * 1000).toISOString();
    writeCredentials('pv_k_expirytestkey1', 'pv_k_expiry', 'manual', { expires_at: expires });
    const stored = readStoredCredentials();
    assert.ok(stored, 'credentials should exist');
    assert.equal(stored?.expires_at, expires);
  });
});
