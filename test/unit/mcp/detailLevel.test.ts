/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { applyDetailLevel } from '../../../src/mcp/utils/detailLevel.js';

const SAMPLE = {
  requestId: 'req-1',
  name: 'MySuite',
  quality_score: 90,
  issues: [{ rule_id: 'RULE-001', message: 'Missing doc' }],
  run_id: 'run-123',
  completeness_score: 100,
  recommended_next_action: 'stop',
};

const SUMMARY_FIELDS = [
  'requestId',
  'name',
  'quality_score',
  'run_id',
  'completeness_score',
  'recommended_next_action',
];

describe('applyDetailLevel', () => {
  it('summary — retains only summaryFields keys', () => {
    const result = applyDetailLevel(SAMPLE, 'summary', SUMMARY_FIELDS);
    assert.deepEqual(Object.keys(result).sort(), SUMMARY_FIELDS.slice().sort());
    assert.ok(!('issues' in result), 'issues should be excluded from summary');
  });

  it('summary — preserves values for included keys', () => {
    const result = applyDetailLevel(SAMPLE, 'summary', SUMMARY_FIELDS);
    assert.equal(result['requestId'], 'req-1');
    assert.equal(result['quality_score'], 90);
    assert.equal(result['recommended_next_action'], 'stop');
  });

  it('standard — returns data unchanged', () => {
    const result = applyDetailLevel(SAMPLE, 'standard', SUMMARY_FIELDS);
    assert.deepEqual(result, SAMPLE);
  });

  it('full — returns data unchanged', () => {
    const result = applyDetailLevel(SAMPLE, 'full', SUMMARY_FIELDS);
    assert.deepEqual(result, SAMPLE);
  });

  it('summary with empty summaryFields returns empty object', () => {
    const result = applyDetailLevel(SAMPLE, 'summary', []);
    assert.deepEqual(result, {});
  });

  it('summary with a field absent from data is silently skipped', () => {
    const result = applyDetailLevel({ a: 1 }, 'summary', ['a', 'missing_key']);
    assert.deepEqual(result, { a: 1 });
  });

  it('standard returns the same object reference as input', () => {
    const data: Record<string, unknown> = { x: 1 };
    const result = applyDetailLevel(data, 'standard', []);
    assert.strictEqual(result, data);
  });
});
