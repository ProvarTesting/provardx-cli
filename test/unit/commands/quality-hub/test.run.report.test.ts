/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import SfProvarQualityHubTestRunReport from '../../../../src/commands/provar/quality-hub/test/run/report.js';

describe('SfProvarQualityHubTestRunReport', () => {
  it('has provar:manager:test:run:report alias for backwards compatibility', () => {
    assert.ok(Array.isArray(SfProvarQualityHubTestRunReport.aliases));
    assert.ok(SfProvarQualityHubTestRunReport.aliases.includes('provar:manager:test:run:report'));
  });

  it('has deprecateAliases=true', () => {
    assert.equal(SfProvarQualityHubTestRunReport.deprecateAliases, true);
  });
});
