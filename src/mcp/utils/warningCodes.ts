/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

export const WARNING_CODES = {
  PROVARHOME_001: 'PROVARHOME-001',
  DATA_001: 'DATA-001',
  PARALLEL_001: 'PARALLEL-001',
  SCHEMA_001: 'SCHEMA-001',
  RUN_001: 'RUN-001',
  JUNIT_001: 'JUNIT-001',
} as const;

export type WarningCode = (typeof WARNING_CODES)[keyof typeof WARNING_CODES];

export function formatWarning(code: WarningCode, message: string, suggestion?: string): string {
  const base = `WARNING [${code}]: ${message}`;
  return suggestion ? `${base} Did you mean '${suggestion}'?` : base;
}
