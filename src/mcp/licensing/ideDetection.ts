/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * ideDetection.ts — Read activated Provar IDE license from disk.
 *
 * The Provar IDE stores license state in ~/Provar/.licenses/{name}.properties
 *
 * Fields we care about:
 * - licenseStatus — Activated | NotActivated | Expired | Invalid | QuotaReached
 * - licenseType — Fixed Seat | Floating | Trial | None
 * - lastOnlineAvailabilityCheckUtc — epoch ms of last ALGAS check by the IDE
 * - licenseKey — AES-128-ECB encrypted with key "provarautomation", Base64-encoded
 *
 * The licenseKey field is AES-128-ECB encrypted (LicenseSupport.KEY = "provarautomation").
 * We decrypt it to allow cross-referencing an explicitly supplied --license-key against
 * the IDE's already-validated license state without re-calling the licensing API.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDecipheriv } from 'node:crypto';
import type { LicenseType } from './licenseCache.js';

/** AES-128-ECB key used by Provar IDE to encrypt the licenseKey field. */
const AES_KEY = Buffer.from('provarautomation'); // 16 bytes ASCII

/**
 * Decrypt an AES-128-ECB + PKCS5 encrypted, Base64-encoded licenseKey field.
 * Returns the plaintext string, or null if decryption fails (wrong key / corrupt).
 */
function decryptLicenseKeyField(encryptedBase64: string): string | null {
  try {
    const decipher = createDecipheriv('aes-128-ecb', AES_KEY, null);
    const buf = Buffer.from(encryptedBase64, 'base64');
    return Buffer.concat([decipher.update(buf), decipher.final()]).toString('utf-8');
  } catch {
    return null;
  }
}

/** Mirrors License4J's DEFAULT_LICENSE_FOLDER_PATH + PROVAR_USER_HOME. */
function provarLicensesDir(): string {
  const provarHome = process.env['PROVAR_HOME'] ?? path.join(os.homedir(), 'Provar');
  return path.join(provarHome, '.licenses');
}

export interface IdeLicenseState {
  /** Name of the .properties file (without extension). */
  name: string;
  licenseType: LicenseType;
  activated: boolean;
  /** When the IDE last checked this license online against ALGAS (Unix ms). */
  lastOnlineCheckMs: number;
}

/**
 * Parse a Java .properties file into a key→value map.
 * Only handles simple `key=value` lines; ignores comments and blank lines.
 */
function parseProperties(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const k = trimmed.slice(0, eqIdx).trim();
    const v = trimmed.slice(eqIdx + 1).trim();
    map.set(k, v);
  }
  return map;
}

function parseLicenseType(raw: string): LicenseType {
  // Java stores LicenseType.name() = "FixedSeat"; "Fixed Seat" kept for defensive compat.
  if (raw === 'FixedSeat' || raw === 'Fixed Seat') return 'FixedSeat';
  if (raw === 'Floating') return 'Floating';
  if (raw === 'Trial') return 'Trial';
  return 'None';
}

/**
 * Read all .properties files from the Provar IDE license folder and return
 * the activation state of each. Returns an empty array when the folder does
 * not exist or cannot be read.
 */
export function readIdeLicenses(): IdeLicenseState[] {
  const dir = provarLicensesDir();
  if (!fs.existsSync(dir)) return [];

  const results: IdeLicenseState[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.properties')) continue;
    try {
      const content = fs.readFileSync(path.join(dir, entry.name), 'utf-8');
      const props = parseProperties(content);

      const licenseStatus = props.get('licenseStatus') ?? '';
      const licenseType = parseLicenseType(props.get('licenseType') ?? '');
      const lastCheck = parseInt(props.get('lastOnlineAvailabilityCheckUtc') ?? '0', 10);

      results.push({
        name: entry.name.slice(0, -'.properties'.length),
        licenseType,
        activated: licenseStatus === 'Activated',
        lastOnlineCheckMs: isNaN(lastCheck) ? 0 : lastCheck,
      });
    } catch {
      // Unreadable file — skip
    }
  }

  return results;
}

/**
 * Find the best activated IDE license, if any.
 *
 * Priority: most recently validated activated license.
 * Returns null when no activated license is present.
 */
export function findActivatedIdeLicense(): IdeLicenseState | null {
  const all = readIdeLicenses();
  const activated = all.filter((l) => l.activated);
  if (activated.length === 0) return null;

  // Return the one with the most recent online check
  return activated.sort((a, b) => b.lastOnlineCheckMs - a.lastOnlineCheckMs)[0];
}

/**
 * Search all IDE .properties files for one whose decrypted licenseKey matches
 * the supplied raw key string.
 *
 * Used to cross-reference an explicit --license-key against the IDE's already-
 * validated activation state without making a fresh API call.
 *
 * Returns the matching IdeLicenseState (which may have activated=false if the
 * IDE recorded the key but it isn't currently activated), or null when no file
 * decrypts to the given key.
 */
export function findLicenseByDecryptedKey(rawKey: string): IdeLicenseState | null {
  const dir = provarLicensesDir();
  if (!fs.existsSync(dir)) return null;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.properties')) continue;
    try {
      const content = fs.readFileSync(path.join(dir, entry.name), 'utf-8');
      const props = parseProperties(content);

      const encryptedKey = props.get('licenseKey');
      if (!encryptedKey) continue;

      const decrypted = decryptLicenseKeyField(encryptedKey);
      if (decrypted !== rawKey) continue;

      const licenseStatus = props.get('licenseStatus') ?? '';
      const licenseType = parseLicenseType(props.get('licenseType') ?? '');
      const lastCheck = parseInt(props.get('lastOnlineAvailabilityCheckUtc') ?? '0', 10);

      return {
        name: entry.name.slice(0, -'.properties'.length),
        licenseType,
        activated: licenseStatus === 'Activated',
        lastOnlineCheckMs: isNaN(lastCheck) ? 0 : lastCheck,
      };
    } catch {
      // Unreadable or corrupt file — skip
    }
  }
  return null;
}
