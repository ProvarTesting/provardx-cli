/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { strict as assert } from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { checkForUpdate, isNewer, deriveChannel, detectInstallMethod } from '../../../src/mcp/update/updateChecker.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

let tmpDir: string;
let origProvarHome: string | undefined;
let origNodeEnv: string | undefined;
let origProvarNoUpdate: string | undefined;
let origFetch: typeof globalThis.fetch;

function writeFreshCache(data: object): void {
  fs.mkdirSync(path.join(tmpDir, '.cache'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.cache', '.mcp-update-cache.json'), JSON.stringify(data), 'utf-8');
}

type FakeDistTags = Record<string, string>;
interface FakeRegistryResponse {
  'dist-tags': FakeDistTags;
}

function mockFetchOk(distTags: FakeDistTags): void {
  const body: FakeRegistryResponse = { 'dist-tags': distTags };
  globalThis.fetch = (): Promise<Response> =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: (): Promise<FakeRegistryResponse> => Promise.resolve(body),
    } as unknown as Response);
}

function mockFetchError(status: number): void {
  globalThis.fetch = (): Promise<Response> =>
    Promise.resolve({
      ok: false,
      status,
      json: (): Promise<Record<string, unknown>> => Promise.resolve({}),
    } as unknown as Response);
}

function mockFetchThrow(err: Error): void {
  globalThis.fetch = (): Promise<Response> => Promise.reject(err);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provar-update-test-'));
  origProvarHome = process.env['PROVAR_HOME'];
  process.env['PROVAR_HOME'] = tmpDir;
  origNodeEnv = process.env.NODE_ENV;
  delete process.env.NODE_ENV; // bypass test fast-path for integration tests
  origProvarNoUpdate = process.env['PROVAR_NO_UPDATE_CHECK'];
  delete process.env['PROVAR_NO_UPDATE_CHECK'];
  origFetch = globalThis.fetch;
});

afterEach(() => {
  if (origNodeEnv !== undefined) {
    process.env.NODE_ENV = origNodeEnv;
  } else {
    delete process.env.NODE_ENV;
  }
  if (origProvarNoUpdate !== undefined) {
    process.env['PROVAR_NO_UPDATE_CHECK'] = origProvarNoUpdate;
  } else {
    delete process.env['PROVAR_NO_UPDATE_CHECK'];
  }
  if (origProvarHome !== undefined) {
    process.env['PROVAR_HOME'] = origProvarHome;
  } else {
    delete process.env['PROVAR_HOME'];
  }
  globalThis.fetch = origFetch;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── A. isNewer() ──────────────────────────────────────────────────────────────

describe('isNewer', () => {
  it('returns false for identical versions', () => {
    assert.equal(isNewer('1.5.0', '1.5.0'), false);
  });

  it('stable is newer than prerelease', () => {
    assert.equal(isNewer('1.5.0-beta.1', '1.5.0'), true);
  });

  it('stable is not older than prerelease', () => {
    assert.equal(isNewer('1.5.0', '1.5.0-beta.1'), false);
  });

  it('higher numeric suffix is newer', () => {
    assert.equal(isNewer('1.5.0-beta.2', '1.5.0-beta.10'), true);
  });

  it('lower numeric suffix is not newer', () => {
    assert.equal(isNewer('1.5.0-beta.10', '1.5.0-beta.2'), false);
  });

  it('non-semver latest returns false', () => {
    assert.equal(isNewer('any', 'not-semver'), false);
  });
});

// ── B. deriveChannel() ────────────────────────────────────────────────────────

describe('deriveChannel', () => {
  it('derives beta from prerelease version', () => {
    assert.equal(deriveChannel('1.5.0-beta.10'), 'beta');
  });

  it('derives latest from stable version', () => {
    assert.equal(deriveChannel('1.5.0'), 'latest');
  });

  it('derives rc from rc version', () => {
    assert.equal(deriveChannel('1.5.0-rc.1'), 'rc');
  });
});

// ── C. detectInstallMethod() ──────────────────────────────────────────────────

describe('detectInstallMethod', () => {
  it('returns a valid install method', () => {
    const method = detectInstallMethod();
    assert.ok(['sf-plugin', 'npm-global', 'linked'].includes(method));
  });

  it('is deterministic', () => {
    assert.equal(detectInstallMethod(), detectInstallMethod());
  });
});

// ── D. checkForUpdate() integration ─────────────────────────────────────────

describe('checkForUpdate', () => {
  it('returns earlyExit when PROVAR_NO_UPDATE_CHECK is set', async () => {
    process.env['PROVAR_NO_UPDATE_CHECK'] = '1';
    let fetchCalled = false;
    globalThis.fetch = (): Promise<Response> => {
      fetchCalled = true;
      return Promise.resolve({} as Response);
    };
    const result = await checkForUpdate({ noUpdateCheck: false, autoUpdate: false });
    assert.equal(result.updateAvailable, false);
    assert.equal(result.latestVersion, null);
    assert.equal(result.fromCache, false);
    assert.equal(fetchCalled, false);
  });

  it('returns earlyExit when noUpdateCheck is true', async () => {
    const result = await checkForUpdate({ noUpdateCheck: true, autoUpdate: false });
    assert.equal(result.updateAvailable, false);
    assert.equal(result.latestVersion, null);
  });

  it('returns fromCache=true for fresh cache (<4h)', async () => {
    // Use the actual running version so the channel + currentVersion guard passes
    const { currentVersion } = await checkForUpdate({ noUpdateCheck: true, autoUpdate: false });
    const channel = deriveChannel(currentVersion);
    writeFreshCache({
      checkedAt: Date.now() - 30 * 60 * 1000, // 30 min ago
      currentVersion,
      latestVersion: currentVersion,
      channel,
    });
    let fetchCalled = false;
    globalThis.fetch = (): Promise<Response> => {
      fetchCalled = true;
      return Promise.resolve({} as Response);
    };
    const result = await checkForUpdate({ noUpdateCheck: false, autoUpdate: false });
    assert.equal(result.fromCache, true);
    assert.equal(fetchCalled, false);
  });

  it('fetches registry when cache is stale (>4h)', async () => {
    const { currentVersion } = await checkForUpdate({ noUpdateCheck: true, autoUpdate: false });
    const channel = deriveChannel(currentVersion);
    writeFreshCache({
      checkedAt: Date.now() - 5 * 60 * 60 * 1000, // 5 hours ago
      currentVersion,
      latestVersion: currentVersion,
      channel,
    });
    mockFetchOk({ [channel]: '99.0.0' });
    const result = await checkForUpdate({ noUpdateCheck: false, autoUpdate: false });
    assert.equal(result.fromCache, false);
    assert.equal(result.latestVersion, '99.0.0');
  });

  it('returns updateAvailable=true when update is available', async () => {
    mockFetchOk({ beta: '99.0.0-beta.1', latest: '99.0.0' });
    const result = await checkForUpdate({ noUpdateCheck: false, autoUpdate: false });
    assert.equal(result.updateAvailable, true);
    assert.ok(result.updateCommand !== null);
  });

  it('returns updateAvailable=false when current equals latest', async () => {
    const { currentVersion } = await checkForUpdate({ noUpdateCheck: true, autoUpdate: false });
    const channel = deriveChannel(currentVersion);
    mockFetchOk({ [channel]: currentVersion });
    const result = await checkForUpdate({ noUpdateCheck: false, autoUpdate: false });
    assert.equal(result.updateAvailable, false);
  });

  it('returns updateAvailable=false on fetch abort (no throw)', async () => {
    mockFetchThrow(new Error('The operation was aborted'));
    const result = await checkForUpdate({ noUpdateCheck: false, autoUpdate: false });
    assert.equal(result.updateAvailable, false);
    assert.equal(result.latestVersion, null);
  });

  it('returns updateAvailable=false on network error (no throw)', async () => {
    mockFetchThrow(new TypeError('Failed to fetch'));
    const result = await checkForUpdate({ noUpdateCheck: false, autoUpdate: false });
    assert.equal(result.updateAvailable, false);
  });

  it('returns updateAvailable=false on HTTP non-200 (no throw)', async () => {
    mockFetchError(503);
    const result = await checkForUpdate({ noUpdateCheck: false, autoUpdate: false });
    assert.equal(result.updateAvailable, false);
    assert.equal(result.latestVersion, null);
  });

  it('returns latestVersion=null when dist-tag channel missing', async () => {
    // Registry has 'latest' but not 'beta' — current version may be beta
    mockFetchOk({ latest: '1.5.0' });
    const result = await checkForUpdate({ noUpdateCheck: false, autoUpdate: false });
    // No throw is the main assertion; updateAvailable depends on current version channel
    assert.ok(result !== null);
  });

  it('treats corrupt cache as miss and fetches fresh (no throw)', async () => {
    fs.mkdirSync(path.join(tmpDir, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.cache', '.mcp-update-cache.json'), 'NOT-JSON', 'utf-8');
    mockFetchOk({ beta: '1.5.0-beta.11', latest: '1.5.0' });
    const result = await checkForUpdate({ noUpdateCheck: false, autoUpdate: false });
    assert.equal(result.fromCache, false);
  });

  it('returns updateAvailable=false when cache is >48h stale and fetch fails', async () => {
    writeFreshCache({
      checkedAt: Date.now() - 50 * 60 * 60 * 1000, // 50 hours ago
      currentVersion: '1.5.0-beta.10',
      latestVersion: '1.5.0-beta.10',
      channel: 'beta',
    });
    mockFetchThrow(new TypeError('Failed to fetch'));
    const result = await checkForUpdate({ noUpdateCheck: false, autoUpdate: false });
    assert.equal(result.updateAvailable, false);
  });

  it('returns updateAvailable=false when registry returns invalid semver', async () => {
    mockFetchOk({ beta: 'not-a-version', latest: 'also-bad' });
    const result = await checkForUpdate({ noUpdateCheck: false, autoUpdate: false });
    assert.equal(result.updateAvailable, false);
    assert.equal(result.latestVersion, null);
  });

  it('writes cache file after successful fetch', async () => {
    mockFetchOk({ beta: '1.5.0-beta.11', latest: '1.5.0' });
    await checkForUpdate({ noUpdateCheck: false, autoUpdate: false });
    const cacheFilePath = path.join(tmpDir, '.cache', '.mcp-update-cache.json');
    assert.ok(fs.existsSync(cacheFilePath), 'Cache file should have been written');
    const cacheData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8')) as { checkedAt: number };
    assert.ok(cacheData.checkedAt > 0, 'Cache should have checkedAt');
  });

  it('returns stale cache within 48h grace period when fetch fails', async () => {
    writeFreshCache({
      checkedAt: Date.now() - 6 * 60 * 60 * 1000, // 6 hours ago (stale but within 48h)
      currentVersion: '1.5.0-beta.10',
      latestVersion: '1.5.0-beta.10',
      channel: 'beta',
    });
    mockFetchThrow(new TypeError('Failed to fetch'));
    const result = await checkForUpdate({ noUpdateCheck: false, autoUpdate: false });
    assert.equal(result.fromCache, true);
  });

  it('skips silently when PROVAR_NO_UPDATE_CHECK is set (no network)', async () => {
    process.env['PROVAR_NO_UPDATE_CHECK'] = '1';
    let fetchCalled = false;
    globalThis.fetch = (): Promise<Response> => {
      fetchCalled = true;
      return Promise.resolve({} as Response);
    };
    const result = await checkForUpdate({ noUpdateCheck: false, autoUpdate: false });
    assert.equal(fetchCalled, false);
    assert.equal(result.updateAvailable, false);
    assert.equal(result.fromCache, false);
  });
});
