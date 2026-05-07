/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync as _spawnSync } from 'node:child_process';

/**
 * Thin wrapper around spawnSync so tests can stub sfSpawnHelper.spawnSync.
 * ESM named exports are immutable bindings; sinon requires a mutable object property.
 */
export const sfSpawnHelper = {
  spawnSync: _spawnSync,
};

// ── Shared error type ─────────────────────────────────────────────────────────

export class SfNotFoundError extends Error {
  public readonly code = 'SF_NOT_FOUND';
  public constructor(sfPath?: string) {
    const where = sfPath ? `at explicit path "${sfPath}"` : 'in PATH or common npm/nvm/volta install locations';
    super(
      `sf CLI not found ${where}. ` +
        'Install Salesforce CLI (npm install -g @salesforce/cli) and ensure the install directory is in your PATH, ' +
        'or pass sf_path pointing to the sf executable directly ' +
        '(e.g. "~/.nvm/versions/node/v22.0.0/bin/sf").'
    );
    this.name = 'SfNotFoundError';
  }
}

// ── Shared result type ────────────────────────────────────────────────────────

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const MAX_BUFFER = 50 * 1024 * 1024; // 50 MB — prevents ENOBUFS on verbose Provar runs

// ── SF CLI discovery ──────────────────────────────────────────────────────────

/**
 * Returns candidate sf CLI paths in common install locations.
 * Used as a fallback when `sf` is not in PATH.
 */
export function getSfCommonPaths(): string[] {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'] ?? path.join(home, 'AppData', 'Roaming');
    return [
      path.join(appData, 'npm', 'sf.cmd'),
      path.join('C:', 'Program Files', 'nodejs', 'sf.cmd'),
      path.join('C:', 'Program Files (x86)', 'nodejs', 'sf.cmd'),
      // Windows standalone installer (https://developer.salesforce.com/tools/salesforcecli)
      path.join('C:', 'Program Files', 'sf', 'bin', 'sf.cmd'),
      path.join('C:', 'Program Files', 'sf', 'client', 'bin', 'sf.cmd'),
    ];
  }
  const candidates = [
    '/usr/local/bin/sf',
    path.join(home, '.npm-global', 'bin', 'sf'),
    path.join(home, '.local', 'bin', 'sf'),
    path.join(home, '.volta', 'bin', 'sf'),
  ];
  // nvm — scan the three most-recently installed Node versions
  const nvmBinDir = path.join(process.env['NVM_DIR'] ?? path.join(home, '.nvm'), 'versions', 'node');
  if (fs.existsSync(nvmBinDir)) {
    try {
      for (const v of fs.readdirSync(nvmBinDir).sort().reverse().slice(0, 3)) {
        candidates.push(path.join(nvmBinDir, v, 'bin', 'sf'));
      }
    } catch {
      /* skip */
    }
  }
  return candidates;
}

// Proactively resolve the sf executable path once on first use and cache it.
// This ensures sf is always found even when ENOENT is masked by other errors (e.g. ENOBUFS).
let cachedSfPath: string | null | undefined; // undefined = not yet probed

/**
 * Exposed for testing only — pre-seeds the cached sf executable path, bypassing the probe spawn.
 * Pass `undefined` to reset the cache so the next call triggers a fresh probe.
 */
export function setSfPathCacheForTesting(value: string | null | undefined): void {
  cachedSfPath = value;
}

// Platform override used in tests so Windows-specific shell logic can be exercised on any OS.
let sfPlatformOverride: NodeJS.Platform | undefined;

/** Exposed for testing only — overrides process.platform for needsWindowsShell decisions. */
export function setSfPlatformForTesting(platform: NodeJS.Platform | undefined): void {
  sfPlatformOverride = platform;
}

/**
 * Returns true when spawning `executable` requires the Windows shell.
 * On Windows, `.cmd` and `.bat` batch scripts cannot be executed directly by
 * Node's spawnSync — they must be invoked through cmd.exe (i.e. shell: true).
 * The bare name "sf" also needs this treatment on Windows because the file on
 * disk is actually "sf.cmd" and Node won't auto-append the extension.
 */
export function needsWindowsShell(executable: string, platform = process.platform): boolean {
  if (platform !== 'win32') return false;
  const lower = executable.toLowerCase();
  return lower.endsWith('.cmd') || lower.endsWith('.bat') || !path.extname(lower);
}

function resolveSfExecutable(): string | null {
  if (cachedSfPath !== undefined) return cachedSfPath;
  const platform = sfPlatformOverride ?? process.platform;

  // Two-phase probe avoids false-positives on Windows with shell:true.
  // When shell:true is used, cmd.exe spawns successfully even when `sf` is
  // missing — it exits non-zero with "not recognised" in stderr but sets no
  // probe.error. Trying shell:false first catches both cases correctly.
  //
  // First attempt: shell:false (works on Linux/macOS; gives ENOENT on Windows if
  // sf.cmd is on PATH but requires the shell).
  const probe = sfSpawnHelper.spawnSync('sf', ['--version'], {
    encoding: 'utf-8',
    shell: false,
    maxBuffer: 1024 * 1024,
  });
  if (!probe.error && probe.status === 0) {
    cachedSfPath = 'sf';
    return cachedSfPath;
  }

  // Windows fallback: retry with shell:true when the plain probe failed
  // with ENOENT — meaning sf.cmd exists on PATH but can't run without the shell.
  if (platform === 'win32' && (probe.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
    const probeShell = sfSpawnHelper.spawnSync('sf', ['--version'], {
      encoding: 'utf-8',
      shell: true,
      maxBuffer: 1024 * 1024,
    });
    if (!probeShell.error && probeShell.status === 0) {
      cachedSfPath = 'sf';
      return cachedSfPath;
    }
  }

  // Fall back to common install locations
  for (const candidate of getSfCommonPaths()) {
    if (fs.existsSync(candidate)) {
      cachedSfPath = candidate;
      return cachedSfPath;
    }
  }
  cachedSfPath = null;
  return null;
}

/**
 * Reject shell metacharacters in an sf_path that will be executed via shell:true.
 * On Windows, cmd.exe interprets & | ; < > ` ' " and newlines as shell syntax.
 * A valid filesystem path should never contain these characters.
 */
function assertShellSafePath(sfPath: string): void {
  if (/[&|;<>`'"\n\r]/.test(sfPath)) {
    throw Object.assign(
      new Error(
        'sf_path contains characters that are unsafe for shell execution on Windows ' +
          '(& | ; < > ` \' " or line-breaks). Provide an absolute filesystem path to the sf executable.'
      ),
      { code: 'INVALID_SF_PATH' }
    );
  }
}

/**
 * Run `sf <args>` synchronously and return stdout, stderr, and exit code.
 * Throws SfNotFoundError if the `sf` binary cannot be found.
 * Pass `sfPath` to override auto-discovery with an explicit executable path.
 */
export function runSfCommand(args: string[], sfPath?: string): SpawnResult {
  // Use explicit path if provided; otherwise use cached probe result
  const executable = sfPath ?? resolveSfExecutable();
  if (!executable) throw new SfNotFoundError();

  const platform = sfPlatformOverride ?? process.platform;
  const useShell = needsWindowsShell(executable, platform);

  // Guard against injection when shell:true is used with a user-supplied path.
  // Common install locations returned by resolveSfExecutable() are safe by construction.
  if (useShell && sfPath) {
    assertShellSafePath(sfPath);
  }

  const result = sfSpawnHelper.spawnSync(executable, args, {
    encoding: 'utf-8',
    shell: useShell,
    maxBuffer: MAX_BUFFER,
  });

  if (result.error) {
    const err = result.error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new SfNotFoundError(sfPath);
    }
    throw result.error;
  }

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  };
}

// ── SOQL safety ───────────────────────────────────────────────────────────────

/**
 * Escape a value for safe interpolation inside a SOQL single-quoted string literal.
 * Replaces `'` with `\'` to prevent SOQL injection.
 */
export function soqlEscape(value: string): string {
  return value.replace(/'/g, "\\'");
}
