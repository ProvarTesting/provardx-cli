/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

export type NextAction = 'stop' | 'fix_and_revalidate' | 'inspect_failures';

/** Fraction of passing tests expressed as 0–100 integer. Returns 0 when total is 0. */
export function calcCompletenessScore(passing: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((passing / total) * 100);
}

/**
 * Recommend what the agent should do next based on the completeness score and
 * whether any prior runs exist on disk for this validation context.
 *
 * - `stop`              → score is 100 — nothing left to fix
 * - `inspect_failures`  → first run (no baseline on disk) — review what's failing before trying to fix
 * - `fix_and_revalidate`→ subsequent run — agent knows the failure set, should fix and re-run
 */
export function calcNextAction(score: number, hasBaseline: boolean): NextAction {
  if (score === 100) return 'stop';
  if (!hasBaseline) return 'inspect_failures';
  return 'fix_and_revalidate';
}
