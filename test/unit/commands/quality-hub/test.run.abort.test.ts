/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import SfProvarQualityHubTestRunAbort from '../../../../src/commands/provar/quality-hub/test/run/abort.js';

describe('SfProvarQualityHubTestRunAbort', () => {
  it('has provar:manager:test:run:abort alias for backwards compatibility', () => {
    assert.ok(Array.isArray(SfProvarQualityHubTestRunAbort.aliases));
    assert.ok(SfProvarQualityHubTestRunAbort.aliases.includes('provar:manager:test:run:abort'));
  });

  it('has deprecateAliases=true', () => {
    assert.equal(SfProvarQualityHubTestRunAbort.deprecateAliases, true);
  });
});
