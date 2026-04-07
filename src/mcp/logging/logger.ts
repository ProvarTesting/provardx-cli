/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Write a structured log entry to stderr.
 * stdout is reserved exclusively for MCP JSON-RPC messages.
 * IMPORTANT: data MUST NOT contain locator values, file content, or user PII.
 */
export function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  let entry: string;
  try {
    entry = JSON.stringify({ ts: new Date().toISOString(), level, message, ...data });
  } catch {
    entry = JSON.stringify({ ts: new Date().toISOString(), level, message, logError: 'data not serializable' });
  }
  process.stderr.write(entry + '\n');
}
