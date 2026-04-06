/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import SfProvarQualityHubTestcaseRetrieve from '../../../../src/commands/provar/quality-hub/testcase/retrieve.js';

describe('SfProvarQualityHubTestcaseRetrieve', () => {
  it('has provar:manager:testcase:retrieve alias for backwards compatibility', () => {
    assert.ok(Array.isArray(SfProvarQualityHubTestcaseRetrieve.aliases));
    assert.ok(SfProvarQualityHubTestcaseRetrieve.aliases.includes('provar:manager:testcase:retrieve'));
  });

  it('has deprecateAliases=true', () => {
    assert.equal(SfProvarQualityHubTestcaseRetrieve.deprecateAliases, true);
  });
});
