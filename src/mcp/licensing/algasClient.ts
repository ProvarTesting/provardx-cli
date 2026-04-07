/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * algasClient.ts — Provar licensing API client.
 *
 * Validates a license key via the Provar tag API:
 * 1. Obtain a short-lived Cognito Bearer token (client credentials flow, cached 50 min).
 * 2. GET /studio/licensing/{licenseKey} — returns tag metadata including `deleted` flag.
 *
 * Validation semantics:
 * - `deleted === false` → key exists in the Provar system and has not been revoked → valid.
 * - `deleted === true`  → key has been revoked → invalid.
 * - HTTP 404            → key does not exist in the Provar system → invalid.
 *
 * Note: `validityPeriod` in the tag response is measured from the key's generation /
 * modification date, NOT from now. It cannot be used to determine remaining validity.
 * We rely on the tag's `deleted` flag only.
 *
 * The licenseType returned is 'None' when only the tag API is consulted (the tag endpoint
 * does not expose the type). The IDE cross-reference step in licenseValidator.ts can
 * supply a richer type when the key matches a locally-activated IDE license.
 */

import { LicenseError } from './licenseError.js';
import type { LicenseType } from './licenseCache.js';

const TOKEN_URL = 'https://prod.provar.cloud/studio/licensingauth/oauth2/token';
const TAG_BASE_URL = 'https://prod.provar.cloud/studio/licensing';

/** Cognito tokens expire at 1h; cache for 50 min to allow a margin for clock skew. */
const TOKEN_TTL_MS = 50 * 60 * 1000;
const TIMEOUT_MS = 15_000;

function getOAuthCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env['PROVAR_OAUTH_CLIENT_ID'];
  const clientSecret = process.env['PROVAR_OAUTH_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    throw new LicenseError(
      'ALGAS_UNREACHABLE',
      'Provar OAuth credentials are not configured.\n' +
        'Set PROVAR_OAUTH_CLIENT_ID and PROVAR_OAUTH_CLIENT_SECRET (see .env.example).'
    );
  }
  return { clientId, clientSecret };
}

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export interface AlgasResult {
  valid: boolean;
  licenseType: LicenseType;
  expiresAt?: number; // Unix ms — not available from tag API; reserved for future use
}

async function getCognitoToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const { clientId, clientSecret } = getOAuthCredentials();
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials&scope=studio-licensing-api%2Fread',
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new LicenseError(
        'ALGAS_HTTP_ERROR',
        `Provar licensing auth returned HTTP ${res.status}: ${res.statusText}`
      );
    }

    const json = (await res.json()) as Record<string, unknown>;
    const token = String(json['access_token'] ?? '');
    if (!token) {
      throw new LicenseError('ALGAS_HTTP_ERROR', 'Empty access_token in Cognito response');
    }

    cachedToken = token;
    tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
    return token;
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError') {
      throw new LicenseError('ALGAS_TIMEOUT', 'Provar licensing auth did not respond within 15s');
    }
    if (err instanceof LicenseError) throw err;
    throw new LicenseError(
      'ALGAS_UNREACHABLE',
      `Could not reach Provar licensing auth: ${(err as Error).message}`
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Validate a license key against the Provar tag API.
 *
 * Returns { valid: true, licenseType: 'None' } when the key exists and is not deleted.
 * The licenseType is 'None' because the tag endpoint does not expose the license type;
 * licenseValidator.ts enriches the type via the IDE cross-reference step when possible.
 */
export async function validateKeyWithAlgas(licenseKey: string): Promise<AlgasResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const token = await getCognitoToken();
    let res = await fetch(`${TAG_BASE_URL}/${encodeURIComponent(licenseKey)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });

    // 401 means the Cognito token was rotated mid-session — clear the module-level cache
    // and retry exactly once with a fresh token before surfacing an error.
    // A new AbortController is created for the retry: the original controller's timer
    // may have partially elapsed during the first request, leaving insufficient time.
    if (res.status === 401) {
      cachedToken = null;
      tokenExpiresAt = 0;
      const retryController = new AbortController();
      const retryTimeout = setTimeout(() => retryController.abort(), TIMEOUT_MS);
      try {
        const refreshedToken = await getCognitoToken();
        res = await fetch(`${TAG_BASE_URL}/${encodeURIComponent(licenseKey)}`, {
          headers: { Authorization: `Bearer ${refreshedToken}` },
          signal: retryController.signal,
        });
      } finally {
        clearTimeout(retryTimeout);
      }
    }

    if (res.status === 404) {
      // Key not found in the Provar system — definitively invalid
      return { valid: false, licenseType: 'None' };
    }

    if (!res.ok) {
      throw new LicenseError(
        'ALGAS_HTTP_ERROR',
        `Provar licensing tag API returned HTTP ${res.status}: ${res.statusText}`
      );
    }

    const body = (await res.json()) as Record<string, unknown>;
    const deleted = body['deleted'] === true;

    // !deleted = key is present in the system and not revoked
    return { valid: !deleted, licenseType: 'None' };
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError') {
      throw new LicenseError('ALGAS_TIMEOUT', 'Provar licensing tag API did not respond within 15s');
    }
    if (err instanceof LicenseError) throw err;
    throw new LicenseError(
      'ALGAS_UNREACHABLE',
      `Could not reach Provar licensing API: ${(err as Error).message}`
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Exposed for testing only — resets the in-memory token cache.
 * Do not call in production code.
 */
export function resetTokenCacheForTest(): void {
  cachedToken = null;
  tokenExpiresAt = 0;
}
