/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

export type DetailLevel = 'summary' | 'standard' | 'full';

/**
 * Shape a structured response object according to the requested detail level.
 *
 * - `summary`  — retain only the keys listed in summaryFields
 * - `standard` — return data unchanged (the existing default response shape)
 * - `full`     — return data unchanged (callers expand gated fields before calling)
 */
export function applyDetailLevel(
  data: Record<string, unknown>,
  level: DetailLevel,
  summaryFields: string[]
): Record<string, unknown> {
  if (level === 'summary') {
    return Object.fromEntries(Object.entries(data).filter(([k]) => summaryFields.includes(k)));
  }
  return data;
}
