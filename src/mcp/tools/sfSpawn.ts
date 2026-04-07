/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

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
    const where = sfPath
      ? `at explicit path "${sfPath}"`
      : 'in PATH or common npm/nvm/volta install locations';
    super(
      `sf CLI not found ${where}. ` +
      'Install Salesforce CLI (npm install -g @salesforce/cli) and ensure the install directory is in your PATH, ' +
      'or pass sf_path pointing to the sf executable directly ' +
      '(e.g. "~/.nvm/versions/node/v22.0.0/bin/sf").'
    );
    this.name = 'SfNotFoundError';
  }
}

// ── Shared spawn helper ───────────────────────────────────────────────────────

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run `sf <args>` synchronously and return stdout, stderr, and exit code.
 * Throws SfNotFoundError if the `sf` binary is not in PATH.
 */
export function runSfCommand(args: string[]): SpawnResult {
  const result = sfSpawnHelper.spawnSync('sf', args, { encoding: 'utf-8', shell: false });

  if (result.error) {
    const err = result.error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new SfNotFoundError();
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
