/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import SfProvarQualityHubDisplay from '../../../../src/commands/provar/quality-hub/display.js';

describe('SfProvarQualityHubDisplay', () => {
  it('has provar:manager:display alias for backwards compatibility', () => {
    assert.ok(Array.isArray(SfProvarQualityHubDisplay.aliases));
    assert.ok(SfProvarQualityHubDisplay.aliases.includes('provar:manager:display'));
  });

  it('has deprecateAliases=true', () => {
    assert.equal(SfProvarQualityHubDisplay.deprecateAliases, true);
  });
});
