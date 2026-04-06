/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';

export type LicenseType = 'Trial' | 'Floating' | 'FixedSeat' | 'None' | 'Whitelisted';

export interface CacheEntry {
  keyHash: string;
  valid: boolean;
  licenseType: LicenseType;
  checkedAt: number;   // Unix ms timestamp of last successful validation check
  expiresAt?: number;  // Optional license expiry from ALGAS response (Unix ms)
}

type CacheFile = Record<string, CacheEntry>;

/**
 * Store the MCP license cache alongside the Provar IDE's own license folder
 * (~/Provar/.licenses/) so there is a single authoritative location for all
 * Provar license state on the machine.  This also enables auto-detection when
 * a user switches from Provar Automation IDE to Claude + MCP.
 *
 * Computed lazily so tests can redirect HOME/USERPROFILE before calling any
 * cache function without the path being baked in at module-load time.
 */
function cacheDir(): string {
  const provarHome = process.env['PROVAR_HOME'] ?? path.join(os.homedir(), 'Provar');
  return path.join(provarHome, '.licenses');
}
function cacheFile(): string {
  return path.join(cacheDir(), '.mcp-license-cache.json');
}

/** Re-validate against ALGAS after 2 hours — mirrors License4J's online check interval. */
export const ONLINE_TTL_MS = 2 * 60 * 60 * 1000;

/** Allow cached result for up to 48 hours when ALGAS is unreachable. */
export const OFFLINE_GRACE_MS = 48 * 60 * 60 * 1000;

/** Hash the raw license key so we never store it on disk. */
export function hashKey(licenseKey: string): string {
  return createHash('sha256').update(licenseKey).digest('hex');
}

export function readCacheEntry(keyHash: string): CacheEntry | null {
  try {
    const file = cacheFile();
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf-8');
    const cache = JSON.parse(raw) as CacheFile;
    return cache[keyHash] ?? null;
  } catch {
    return null;
  }
}

export function writeCacheEntry(entry: CacheEntry): void {
  try {
    const dir = cacheDir();
    const file = cacheFile();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    let cache: CacheFile = {};
    if (fs.existsSync(file)) {
      try {
        cache = JSON.parse(fs.readFileSync(file, 'utf-8')) as CacheFile;
      } catch {
        cache = {};
      }
    }
    cache[entry.keyHash] = entry;
    fs.writeFileSync(file, JSON.stringify(cache, null, 2), 'utf-8');
  } catch {
    // Cache write failure is non-fatal; validation result still returned to caller.
  }
}

/** True when the cached entry is fresh enough to skip the next ALGAS call. */
export function isCacheEntryFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.checkedAt < ONLINE_TTL_MS;
}

/** True when the cached entry is within the 48-hour offline grace window. */
export function isCacheEntryWithinGrace(entry: CacheEntry): boolean {
  return Date.now() - entry.checkedAt < OFFLINE_GRACE_MS;
}
