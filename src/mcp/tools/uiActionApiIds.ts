/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * Canonical set of UI action apiIds covered by UI-NEST-STRUCT-001.
 * Single source of truth — generator, validator, and rule helpers all
 * import this. Adding a new UI action type means editing this file only.
 *
 * PDX-497: the generator (testCaseGenerate.ts) and the validator
 * (bestPracticesEngine.ts / testCaseValidate.ts) previously kept their own
 * narrower copies of this set. When the two drifted, a caller asking the
 * generator to emit a UiFill / UiNavigate / UiWithRow / UiHandleAlert at
 * root got a flat output that the validator then false-failed against
 * UI-NEST-STRUCT-001. Centralising the set here keeps generator + validator
 * in lockstep.
 */
export const UI_ACTION_API_IDS: ReadonlySet<string> = new Set([
  'com.provar.plugins.forcedotcom.core.ui.UiDoAction',
  'com.provar.plugins.forcedotcom.core.ui.UiAssert',
  'com.provar.plugins.forcedotcom.core.ui.UiRead',
  'com.provar.plugins.forcedotcom.core.ui.UiFill',
  'com.provar.plugins.forcedotcom.core.ui.UiNavigate',
  'com.provar.plugins.forcedotcom.core.ui.UiWithRow',
  'com.provar.plugins.forcedotcom.core.ui.UiHandleAlert',
]);

/**
 * apiIds whose own `<clause name="substeps">` block satisfies UI-NEST-STRUCT-001
 * for descendant UI action steps. UiWithRow plays a dual role — itself a UI
 * action that must be nested under a UiWithScreen, AND a container whose
 * substeps clause satisfies the rule for its own descendants.
 */
export const UI_SCREEN_CONTAINER_API_IDS: ReadonlySet<string> = new Set([
  'com.provar.plugins.forcedotcom.core.ui.UiWithScreen',
  'com.provar.plugins.forcedotcom.core.ui.UiWithRow',
]);

/** APIs whose `locator` argument should be emitted as `class="uiLocator"`. */
export const UI_LOCATOR_BEARING_API_IDS: ReadonlySet<string> = new Set([
  'com.provar.plugins.forcedotcom.core.ui.UiDoAction',
  'com.provar.plugins.forcedotcom.core.ui.UiAssert',
  'com.provar.plugins.forcedotcom.core.ui.UiRead',
  'com.provar.plugins.forcedotcom.core.ui.UiFill',
]);
