/* eslint-disable camelcase */
import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { calcCompletenessScore, calcNextAction } from '../../../src/mcp/utils/validationScore.js';

describe('calcCompletenessScore', () => {
  it('returns 100 when all tests pass', () => {
    assert.equal(calcCompletenessScore(10, 10), 100);
  });

  it('returns 0 when no tests pass', () => {
    assert.equal(calcCompletenessScore(0, 10), 0);
  });

  it('returns 0 when total is 0 (no tests)', () => {
    assert.equal(calcCompletenessScore(0, 0), 0);
  });

  it('rounds to nearest integer', () => {
    // 1/3 ≈ 33.33 → 33
    assert.equal(calcCompletenessScore(1, 3), 33);
    // 2/3 ≈ 66.67 → 67
    assert.equal(calcCompletenessScore(2, 3), 67);
  });

  it('returns 50 for half passing', () => {
    assert.equal(calcCompletenessScore(5, 10), 50);
  });
});

describe('calcNextAction', () => {
  it('returns "stop" when score is 100', () => {
    assert.equal(calcNextAction(100, true), 'stop');
    assert.equal(calcNextAction(100, false), 'stop');
  });

  it('returns "inspect_failures" when score < 100 and no baseline (first run)', () => {
    assert.equal(calcNextAction(0, false), 'inspect_failures');
    assert.equal(calcNextAction(50, false), 'inspect_failures');
    assert.equal(calcNextAction(99, false), 'inspect_failures');
  });

  it('returns "fix_and_revalidate" when score < 100 and baseline exists', () => {
    assert.equal(calcNextAction(0, true), 'fix_and_revalidate');
    assert.equal(calcNextAction(50, true), 'fix_and_revalidate');
    assert.equal(calcNextAction(99, true), 'fix_and_revalidate');
  });
});
