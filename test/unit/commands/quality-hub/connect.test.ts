/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import SfProvarQualityHubConnect from '../../../../src/commands/provar/quality-hub/connect.js';

describe('SfProvarQualityHubConnect', () => {
  it('has provar:manager:connect alias for backwards compatibility', () => {
    assert.ok(
      Array.isArray(SfProvarQualityHubConnect.aliases),
      'aliases must be an array'
    );
    assert.ok(
      SfProvarQualityHubConnect.aliases.includes('provar:manager:connect'),
      'Must alias provar:manager:connect'
    );
  });

  it('has deprecateAliases=true so oclif emits a deprecation warning on old name', () => {
    assert.equal(SfProvarQualityHubConnect.deprecateAliases, true);
  });
});
