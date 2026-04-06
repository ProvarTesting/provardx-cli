/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import SfProvarQualityHubOpen from '../../../../src/commands/provar/quality-hub/open.js';

describe('SfProvarQualityHubOpen', () => {
  it('has provar:manager:open alias for backwards compatibility', () => {
    assert.ok(Array.isArray(SfProvarQualityHubOpen.aliases));
    assert.ok(SfProvarQualityHubOpen.aliases.includes('provar:manager:open'));
  });

  it('has deprecateAliases=true', () => {
    assert.equal(SfProvarQualityHubOpen.deprecateAliases, true);
  });
});
