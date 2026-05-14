/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * Returns `compact` when PROVAR_MCP_SCHEMA_MODE=compact, otherwise `standard`.
 * Reads the env var on each call so tests can set it without resetting module cache.
 */
export function desc(standard: string, compact: string): string {
  return process.env['PROVAR_MCP_SCHEMA_MODE'] === 'compact' ? compact : standard;
}
