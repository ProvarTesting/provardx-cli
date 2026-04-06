/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import SfProvarQualityHubTestRun from '../../../../src/commands/provar/quality-hub/test/run.js';

describe('SfProvarQualityHubTestRun', () => {
  it('has provar:manager:test:run alias for backwards compatibility', () => {
    assert.ok(Array.isArray(SfProvarQualityHubTestRun.aliases));
    assert.ok(SfProvarQualityHubTestRun.aliases.includes('provar:manager:test:run'));
  });

  it('has deprecateAliases=true', () => {
    assert.equal(SfProvarQualityHubTestRun.deprecateAliases, true);
  });
});
