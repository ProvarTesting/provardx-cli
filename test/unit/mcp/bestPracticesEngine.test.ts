/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import {
  calculateBPScore,
  runBestPractices,
  type BPViolation,
} from '../../../src/mcp/tools/bestPracticesEngine.js';

// ── Helper: build a minimal violation ────────────────────────────────────────

function makeViolation(
  severity: BPViolation['severity'],
  weight: number,
  count?: number
): BPViolation {
  return {
    rule_id: 'TEST-001',
    name: 'Test Violation',
    description: '',
    category: 'Test',
    severity,
    weight,
    message: 'Test message',
    recommendation: 'Fix it',
    applies_to: ['testCase'],
    count,
  };
}

// ── Valid XML fixture (passes all schema-level rules) ─────────────────────────

const GUID_TC   = '550e8400-e29b-41d4-a716-446655440000';
const GUID_S1   = '550e8400-e29b-41d4-a716-446655440011';
const GUID_S2   = '550e8400-e29b-41d4-a716-446655440012';

const VALID_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="tc-001" guid="${GUID_TC}" registryId="tc-001" name="Login Test">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="UiConnect" name="Connect to browser" testItemId="1"/>
    <apiCall guid="${GUID_S2}" apiId="UiNavigate" name="Navigate to login page" testItemId="2"/>
  </steps>
</testCase>`;

// ── calculateBPScore ──────────────────────────────────────────────────────────

describe('calculateBPScore', () => {
  it('returns 100 when there are no violations', () => {
    assert.equal(calculateBPScore([]), 100);
  });

  it('deducts correctly for a single critical violation (weight=10, count=1)', () => {
    // score = 100 - (10 * 1.0 * 1) = 90
    const score = calculateBPScore([makeViolation('critical', 10)]);
    assert.equal(score, 90);
  });

  it('deducts correctly for a single major violation (weight=4, count=1)', () => {
    // score = 100 - (4 * 0.75 * 1) = 97
    const score = calculateBPScore([makeViolation('major', 4)]);
    assert.equal(score, 97);
  });

  it('deducts correctly for a single minor violation (weight=2, count=1)', () => {
    // score = 100 - (2 * 0.5 * 1) = 99
    const score = calculateBPScore([makeViolation('minor', 2)]);
    assert.equal(score, 99);
  });

  it('deducts correctly for a single info violation (weight=4, count=1)', () => {
    // score = 100 - (4 * 0.25 * 1) = 99
    const score = calculateBPScore([makeViolation('info', 4)]);
    assert.equal(score, 99);
  });

  it('applies log2 diminishing returns when count > 1', () => {
    // count=4: effective_count = 1 + log2(4) = 1 + 2 = 3
    // score = 100 - (10 * 1.0 * 3) = 70
    const score = calculateBPScore([makeViolation('critical', 10, 4)]);
    assert.equal(score, 70);
  });

  it('does not apply diminishing returns when count=1 (explicit)', () => {
    // effective_count = 1 (not > 1)
    const score = calculateBPScore([makeViolation('critical', 10, 1)]);
    assert.equal(score, 90);
  });

  it('accumulates deductions across multiple violations', () => {
    // critical weight=5: 100 - 5 = 95
    // major   weight=4: 95 - 3 = 92
    // net: 92
    const score = calculateBPScore([
      makeViolation('critical', 5),
      makeViolation('major', 4),
    ]);
    assert.equal(score, 92);
  });

  it('never returns a negative score regardless of severity', () => {
    const violations = Array.from({ length: 20 }, () => makeViolation('critical', 20));
    const score = calculateBPScore(violations);
    assert.ok(score >= 0, `Expected score >= 0, got ${score}`);
    assert.equal(score, 0);
  });

  it('never returns a score above 100', () => {
    assert.ok(calculateBPScore([]) <= 100);
  });
});

// ── runBestPractices ──────────────────────────────────────────────────────────

describe('runBestPractices', () => {
  describe('valid XML test case', () => {
    it('returns a quality_score between 0 and 100', () => {
      const result = runBestPractices(VALID_XML);
      assert.ok(result.quality_score >= 0,   `score ${result.quality_score} should be >= 0`);
      assert.ok(result.quality_score <= 100, `score ${result.quality_score} should be <= 100`);
    });

    it('returns rules_evaluated > 0 when rules are loaded', () => {
      const result = runBestPractices(VALID_XML);
      assert.ok(result.rules_evaluated > 0, 'rules_evaluated should be greater than 0 when rules are loaded');
    });

    it('returns violations as an array', () => {
      const result = runBestPractices(VALID_XML);
      assert.ok(Array.isArray(result.violations), 'violations should be an array');
    });

    it('passes optional testName metadata without error', () => {
      const result = runBestPractices(VALID_XML, { testName: 'Login Test' });
      assert.ok(result.quality_score >= 0 && result.quality_score <= 100);
    });
  });

  describe('empty or invalid XML', () => {
    it('returns quality_score=0 for an empty string (no parseable testCase)', () => {
      const result = runBestPractices('');
      assert.equal(result.quality_score, 0);
      assert.equal(result.violations.length, 0);
    });

    it('does not throw for completely malformed XML', () => {
      assert.doesNotThrow(() => runBestPractices('<<<not xml>>>'));
    });

    it('returns quality_score=0 for XML with wrong root element', () => {
      const result = runBestPractices('<?xml version="1.0"?><notTestCase><steps/></notTestCase>');
      assert.equal(result.quality_score, 0);
    });
  });

  describe('score parity with calculateBPScore', () => {
    it('quality_score matches what calculateBPScore would produce for the same violations', () => {
      const result = runBestPractices(VALID_XML);
      const recalculated = calculateBPScore(result.violations);
      assert.equal(result.quality_score, recalculated);
    });
  });
});
