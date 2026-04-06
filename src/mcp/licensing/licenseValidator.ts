/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { log } from '../logging/logger.js';
import {
  hashKey,
  readCacheEntry,
  writeCacheEntry,
  isCacheEntryFresh,
  isCacheEntryWithinGrace,
  type CacheEntry,
  type LicenseType,
} from './licenseCache.js';
import { findActivatedIdeLicense } from './ideDetection.js';
import { LicenseError } from './licenseError.js';

/**
 * Stable cache key used for IDE-detection results.
 * There is no user-supplied key in this flow, so we use a fixed sentinel.
 */
const IDE_CACHE_KEY = '__ide_detection__';

export interface LicenseValidationResult {
  valid: boolean;
  licenseType: LicenseType;
  /** True when the result came from disk cache rather than a live ALGAS call. */
  fromCache: boolean;
  /** True when ALGAS was unreachable and we fell back to the offline grace window. */
  offlineGrace: boolean;
}

/**
 * Validate the Provar license before starting the MCP server.
 *
 * Requires Provar Automation IDE to be installed with an activated licence.
 * We trust the IDE's own licenseStatus field — if it says "Activated" we
 * accept it. The IDE is responsible for setting licenseStatus to "Expired"
 * or "Invalid" when a licence lapses; we do not re-check timing ourselves.
 *
 * The result is cached so repeated starts within 2 hours skip the IDE file
 * read entirely. The 48-hour grace window lets the MCP server keep running
 * when the IDE files become temporarily inaccessible (e.g. network share,
 * permission change) after a successful read.
 *
 * Validation flow:
 * 1. MCP cache fresh (< 2h) → serve from cache, skip IDE read
 * 2. Scan ~/Provar/.licenses/*.properties for an Activated licence
 * 3. Found → write cache, accept (offlineGrace=false)
 * 4. Not found but MCP cache within 48h grace → serve, offlineGrace=true
 * 5. Not found, no usable cache → throw LICENSE_NOT_FOUND
 *
 * When NODE_ENV=test this function returns immediately so unit tests never
 * touch the filesystem.
 */
export function validateLicense(): Promise<LicenseValidationResult> {
  // Skip validation in test environment
  if (process.env.NODE_ENV === 'test') {
    return Promise.resolve({ valid: true, licenseType: 'Whitelisted', fromCache: false, offlineGrace: false });
  }

  // Dev whitelist — PROVAR_DEV_WHITELIST_KEYS is a comma-separated list of bypass sentinels.
  // Any non-empty entry (after trimming) bypasses all license checks, enabling headless CI/dev
  // environments to run without an IDE or an API call.
  const whitelistKeys = (process.env['PROVAR_DEV_WHITELIST_KEYS'] ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  if (whitelistKeys.length > 0) {
    log('info', 'licenseValidator: PROVAR_DEV_WHITELIST_KEYS active — bypassing license check');
    return Promise.resolve({ valid: true, licenseType: 'Whitelisted', fromCache: false, offlineGrace: false });
  }

  try {
    return Promise.resolve(validateViaIdeDetection());
  } catch (err) {
    return Promise.reject(err as Error);
  }
}

// ── IDE auto-detection ───────────────────────────────────────────────────────

function validateViaIdeDetection(): LicenseValidationResult {
  const keyHash = hashKey(IDE_CACHE_KEY);
  const cached = readCacheEntry(keyHash);

  // 1. Serve from MCP cache when fresh (< 2h) — skip IDE file read entirely
  if (cached && isCacheEntryFresh(cached)) {
    log('info', 'licenseValidator: IDE detection — fresh cache hit', { licenseType: cached.licenseType });
    return { valid: true, licenseType: cached.licenseType, fromCache: true, offlineGrace: false };
  }

  // 2. Read the IDE .properties files
  const ideState = findActivatedIdeLicense();

  if (!ideState) {
    // IDE not readable — fall back to grace cache if available
    if (cached && isCacheEntryWithinGrace(cached)) {
      const ageHours = Math.round((Date.now() - cached.checkedAt) / (60 * 60 * 1000));
      log('warn', 'licenseValidator: IDE license not found, serving from offline grace cache', { ageHours });
      return { valid: true, licenseType: cached.licenseType, fromCache: true, offlineGrace: true };
    }
    throw new LicenseError(
      'LICENSE_NOT_FOUND',
      'No activated Provar license found on this machine.\n' +
        'Activate a license in Provar Automation IDE to use the MCP server.\n' +
        'Licenses are read from: ~/Provar/.licenses/'
    );
  }

  // 3. Valid — write to MCP cache so next start within 2h skips this read
  const entry: CacheEntry = {
    keyHash,
    valid: true,
    licenseType: ideState.licenseType,
    checkedAt: Date.now(),
  };
  writeCacheEntry(entry);

  log('info', 'licenseValidator: IDE licence validated and cached', {
    name: ideState.name,
    licenseType: ideState.licenseType,
  });

  return {
    valid: true,
    licenseType: ideState.licenseType,
    fromCache: false,
    offlineGrace: false,
  };
}
