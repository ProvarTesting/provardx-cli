/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import type { SpawnSyncOptions } from 'node:child_process';
import { createRequire } from 'node:module';
import { log } from '../logging/logger.js';

const requireJson = createRequire(import.meta.url);
const CURRENT_SERVER_VERSION: string = (requireJson('../../../package.json') as { version: string }).version;

export interface CheckForUpdateResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  updateCommand: string | null;
  fromCache: boolean;
}

interface UpdateCacheEntry {
  checkedAt: number;
  currentVersion: string;
  latestVersion: string | null;
  channel: string;
}

const UPDATE_TTL_MS = 4 * 60 * 60 * 1_000;
const UPDATE_GRACE_MS = 48 * 60 * 60 * 1_000;

const SPAWN_OPTS = {
  stdio: ['ignore', 'pipe', 'pipe'] as const,
  timeout: 30_000,
  shell: process.platform === 'win32',
  maxBuffer: 10 * 1_024 * 1_024,
} satisfies SpawnSyncOptions;

const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

function cacheDir(): string {
  const provarHome = process.env['PROVAR_HOME'] ?? path.join(os.homedir(), 'Provar');
  return path.join(provarHome, '.cache');
}

function cacheFile(): string {
  return path.join(cacheDir(), '.mcp-update-cache.json');
}

// Derives the dist-tag channel from the current version's prerelease identifier.
// '1.5.0-beta.10' → 'beta', '1.5.0' → 'latest'
// Same-channel assumption: we fetch dist-tags.{channel} and compare within that channel.
// Cross-label comparison (e.g. beta vs rc) is explicitly out of scope.
export function deriveChannel(version: string): string {
  const hyphen = version.indexOf('-');
  if (hyphen === -1) return 'latest';
  return version.slice(hyphen + 1).split('.')[0] ?? 'latest';
}

export function isNewer(current: string, latest: string): boolean {
  if (current === latest) return false;
  if (!SEMVER_RE.test(latest)) return false;
  const split = (v: string): readonly [number, number, number, number] => {
    const [main, pre = ''] = v.split('-');
    const [major, minor, patch] = (main ?? '').split('.').map(Number);
    // Infinity for stable versions so stable is always newer than any prerelease
    const preN = pre ? parseInt(pre.split('.').pop() ?? '0', 10) : Infinity;
    return [major, minor, patch, preN] as const;
  };
  const [cm, cn, cp, cpN] = split(current);
  const [lm, ln, lp, lpN] = split(latest);
  for (const [c, l] of [
    [cm, lm],
    [cn, ln],
    [cp, lp],
    [cpN, lpN],
  ] as const) {
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

export function detectInstallMethod(): 'sf-plugin' | 'npm-global' | 'linked' {
  const modulePath = fileURLToPath(import.meta.url);
  const sfDataDirs = [
    path.join('.local', 'share', 'sf'),
    path.join('AppData', 'Local', 'sf'),
    path.join('AppData', 'Roaming', 'sf'),
    path.join('.local', 'share', 'sfdx'),
  ];
  if (sfDataDirs.some((d) => modulePath.includes(d))) return 'sf-plugin';
  if (modulePath.includes('node_modules')) return 'npm-global';
  return 'linked';
}

function readUpdateCache(): UpdateCacheEntry | null {
  try {
    const raw = fs.readFileSync(cacheFile(), 'utf-8');
    return JSON.parse(raw) as UpdateCacheEntry;
  } catch {
    return null;
  }
}

function writeUpdateCache(entry: UpdateCacheEntry): void {
  try {
    fs.mkdirSync(cacheDir(), { recursive: true });
    const file = cacheFile();
    fs.writeFileSync(file, JSON.stringify(entry, null, 2), { encoding: 'utf-8', mode: 0o600 });
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      // best effort
    }
  } catch (err) {
    log('warn', 'updateChecker: failed to write cache', { error: String(err) });
  }
}

function buildUpdateCommand(latestVersion: string): string {
  const method = detectInstallMethod();
  if (method === 'npm-global') {
    return 'npm install -g @provartesting/provardx-cli@' + latestVersion;
  }
  return 'sf plugins install @provartesting/provardx-cli@' + latestVersion;
}

function resultFromCache(cached: UpdateCacheEntry, currentVersion: string): CheckForUpdateResult {
  const updateAvailable = cached.latestVersion ? isNewer(currentVersion, cached.latestVersion) : false;
  const updateCommand = updateAvailable && cached.latestVersion ? buildUpdateCommand(cached.latestVersion) : null;
  return { currentVersion, latestVersion: cached.latestVersion, updateAvailable, updateCommand, fromCache: true };
}

async function fetchLatestVersion(channel: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const resp = await fetch('https://registry.npmjs.org/@provartesting/provardx-cli', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) {
      log('warn', 'updateChecker: registry returned non-200', { status: resp.status });
      return null;
    }
    const data = (await resp.json()) as Record<string, unknown>;
    const distTags = data['dist-tags'] as Record<string, string> | undefined;
    const candidate = distTags?.[channel];
    if (!candidate) {
      log('warn', 'updateChecker: dist-tag not found in registry', { channel });
      return null;
    }
    if (!SEMVER_RE.test(candidate)) {
      log('warn', 'updateChecker: registry returned invalid semver', { candidate });
      return null;
    }
    return candidate;
  } finally {
    clearTimeout(timer);
  }
}

function applyAutoUpdate(latestVersion: string): void {
  const method = detectInstallMethod();
  if (method === 'linked') {
    process.stderr.write(
      '[provar-mcp] Auto-update skipped: running from development link. Install manually:\n' +
        '  sf plugins install @provartesting/provardx-cli@' +
        latestVersion +
        '\n'
    );
    return;
  }
  const args =
    method === 'sf-plugin'
      ? ['plugins', 'install', '@provartesting/provardx-cli@' + latestVersion]
      : ['install', '-g', '@provartesting/provardx-cli@' + latestVersion];
  const cmd = method === 'sf-plugin' ? 'sf' : 'npm';
  log('info', 'updateChecker: running auto-update', { cmd, args });
  const result = spawnSync(cmd, args, SPAWN_OPTS);
  if (result.error != null || result.status !== 0 || result.signal != null) {
    const detail = result.stderr?.toString().trim() ?? '';
    log('error', 'updateChecker: auto-update failed', { status: result.status, signal: result.signal, detail });
  } else {
    process.stderr.write(
      '[provar-mcp] Updated to ' + latestVersion + '. Restart your MCP connection to use the new version.\n'
    );
    process.exit(0);
  }
}

export async function checkForUpdate(opts: {
  noUpdateCheck: boolean;
  autoUpdate: boolean;
}): Promise<CheckForUpdateResult> {
  const currentVersion = CURRENT_SERVER_VERSION;
  const earlyExit: CheckForUpdateResult = {
    currentVersion,
    latestVersion: null,
    updateAvailable: false,
    updateCommand: null,
    fromCache: false,
  };

  if (process.env.NODE_ENV === 'test') return earlyExit;
  if (process.env['PROVAR_NO_UPDATE_CHECK']) return earlyExit;
  if (opts.noUpdateCheck) return earlyExit;

  const channel = deriveChannel(currentVersion);
  const cached = readUpdateCache();

  if (
    cached != null &&
    cached.channel === channel &&
    cached.currentVersion === currentVersion &&
    Date.now() - cached.checkedAt < UPDATE_TTL_MS
  ) {
    log('info', 'updateChecker: cache hit', { channel, latestVersion: cached.latestVersion, fromCache: true });
    return resultFromCache(cached, currentVersion);
  }

  let latestVersion: string | null = null;
  try {
    latestVersion = await fetchLatestVersion(channel);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log('warn', 'updateChecker: registry fetch failed', { error: errMsg });
    if (cached != null && Date.now() - cached.checkedAt < UPDATE_GRACE_MS) {
      return resultFromCache(cached, currentVersion);
    }
    return earlyExit;
  }

  writeUpdateCache({ checkedAt: Date.now(), currentVersion, latestVersion, channel });

  const updateAvailable = latestVersion ? isNewer(currentVersion, latestVersion) : false;
  const updateCommand = updateAvailable && latestVersion ? buildUpdateCommand(latestVersion) : null;

  if (updateAvailable && latestVersion) {
    process.stderr.write(
      '[provar-mcp] Update available: ' +
        latestVersion +
        ' (current: ' +
        currentVersion +
        ')\n' +
        '  Run: ' +
        (updateCommand ?? '') +
        '\n'
    );
    log('info', 'updateChecker: update available', { currentVersion, latestVersion, updateCommand });
    if (opts.autoUpdate) {
      applyAutoUpdate(latestVersion);
    }
  }

  return { currentVersion, latestVersion, updateAvailable, updateCommand, fromCache: false };
}
