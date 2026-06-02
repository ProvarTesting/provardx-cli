/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * Canonical, step-scoped `comparisonType` subsets — the single source of truth
 * shared by the docs (PROVAR_TEST_STEP_REFERENCE.md / mcp.md) and the local
 * `comparisonType` enum validator (testCaseValidate.ts).
 *
 * `comparisonType` is a single Provar enum
 * (`com.provar.core.model.base.java.ComparisonType`), but each step type accepts
 * only a SUBSET. A value used outside the subset its step type allows is
 * load-blocking: the whole test case fails to load at runtime with
 * `IllegalArgumentException: No enum constant ...ComparisonType.<value>`.
 *
 * Both subsets are confirmed from Provar-Automation-authored testcases (created
 * directly in the product). Do NOT hand-duplicate these lists elsewhere — import
 * from here.
 */

/** AssertValues (`assertValuesComparison`) — the 16-value subset. */
export const ASSERT_VALUES_COMPARISON_TYPES = [
  'EqualTo',
  'NotEqualTo',
  'GreaterThan',
  'GreaterThanOrEqualTo',
  'LessThan',
  'LessThanOrEqualTo',
  'IsPresent',
  'IsEmpty',
  'Matches',
  'NotMatches',
  'Contains',
  'NotContains',
  'StartsWith',
  'NotStartsWith',
  'EndsWith',
  'NotEndsWith',
] as const;

/** UI Assert (`uiAttributeAssertion`) — the narrower 6-value subset. */
export const UI_ASSERT_COMPARISON_TYPES = ['EqualTo', 'Contains', 'StartsWith', 'EndsWith', 'Matches', 'None'] as const;

export const ASSERT_VALUES_COMPARISON_TYPE_SET: ReadonlySet<string> = new Set(ASSERT_VALUES_COMPARISON_TYPES);

export const UI_ASSERT_COMPARISON_TYPE_SET: ReadonlySet<string> = new Set(UI_ASSERT_COMPARISON_TYPES);
