/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/*
 * Quality-threshold resolution for the validation tools.
 *
 * A test case "meets quality" when its best-practices `quality_score` is at or
 * above this threshold. The bar is resolved with the precedence:
 * per-call `quality_threshold` arg → PROVAR_MCP_QUALITY_THRESHOLD env → default (90).
 *
 * The default was raised from 80 to 90 so that "valid" means genuinely
 * production-ready, not merely "loads". The env var lets a team pin a house
 * standard (e.g. relax to 80 during a migration) without threading an argument
 * through every call. Out-of-range or unparseable values fall through to the
 * next source — mirroring the depth-guard convention in server.ts.
 */

export const DEFAULT_QUALITY_THRESHOLD = 90;

/** True when `n` is a finite number inside the inclusive 0–100 score range. */
function inRange(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 100;
}

/**
 * Resolve the effective quality threshold.
 *
 * @param perCallArg  The tool's `quality_threshold` argument, if the caller set one.
 * @returns           A number in 0–100; never NaN.
 */
export function resolveQualityThreshold(perCallArg?: number): number {
  if (typeof perCallArg === 'number' && inRange(perCallArg)) return perCallArg;

  const raw = process.env['PROVAR_MCP_QUALITY_THRESHOLD'];
  if (raw !== undefined && raw.trim() !== '') {
    const parsed = Number(raw);
    if (inRange(parsed)) return parsed;
  }

  return DEFAULT_QUALITY_THRESHOLD;
}
