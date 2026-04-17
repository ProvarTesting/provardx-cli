/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface StoredCredentials {
  api_key: string;
  prefix: string;
  set_at: string;
  source: 'manual' | 'cognito' | 'salesforce';
  // Phase 2 fields — optional so Phase 1 files remain valid after upgrade
  username?: string;
  tier?: string;
  expires_at?: string;
}

const KEY_PREFIX = 'pv_k_';

export function getCredentialsPath(): string {
  return path.join(os.homedir(), '.provar', 'credentials.json');
}

export function readStoredCredentials(): StoredCredentials | null {
  try {
    const p = getCredentialsPath();
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf-8');
    return JSON.parse(raw) as StoredCredentials;
  } catch {
    return null;
  }
}

export function writeCredentials(
  key: string,
  prefix: string,
  source: StoredCredentials['source'],
  extra?: { username?: string; tier?: string; expires_at?: string }
): void {
  if (!key.startsWith(KEY_PREFIX)) {
    throw new Error(`Invalid API key format. Keys must start with "${KEY_PREFIX}".`);
  }
  const p = getCredentialsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const data: StoredCredentials = {
    api_key: key,
    prefix,
    set_at: new Date().toISOString(),
    source,
    ...(extra?.username ? { username: extra.username } : {}),
    ...(extra?.tier ? { tier: extra.tier } : {}),
    ...(extra?.expires_at ? { expires_at: extra.expires_at } : {}),
  };
  // mode: 0o600 sets permissions atomically on file creation (POSIX).
  // chmodSync handles re-runs on existing files. Both are no-ops on Windows.
  fs.writeFileSync(p, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
  try {
    fs.chmodSync(p, 0o600);
  } catch {
    /* Windows: no file permission model */
  }
}

export function clearCredentials(): void {
  const p = getCredentialsPath();
  try {
    fs.rmSync(p);
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== 'ENOENT') throw err;
    // file did not exist — nothing to clear, not an error
  }
}

export function resolveApiKey(): string | null {
  const envKey = process.env.PROVAR_API_KEY?.trim();
  if (envKey?.startsWith(KEY_PREFIX)) return envKey;
  const creds = readStoredCredentials();
  const storedKey = typeof creds?.api_key === 'string' ? creds.api_key.trim() : null;
  if (storedKey?.startsWith(KEY_PREFIX)) return storedKey;
  return null;
}

export const credentialsService = { resolveApiKey };
