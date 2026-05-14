/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { maskFields, parseFieldsParam } from '../../../src/mcp/utils/fieldMask.js';

// ── maskFields ────────────────────────────────────────────────────────────────

describe('maskFields', () => {
  describe('top-level field selection', () => {
    it('retains only the specified top-level keys', () => {
      const obj = { id: '1', name: 'Test', status: 'PASS', steps: [{ action: 'click' }] };
      const result = maskFields(obj, ['id', 'name']) as Record<string, unknown>;
      assert.deepEqual(result, { id: '1', name: 'Test' });
    });

    it('silently ignores unknown field names', () => {
      const obj = { id: '1', name: 'Test' };
      const result = maskFields(obj, ['id', 'nonexistent']) as Record<string, unknown>;
      assert.deepEqual(result, { id: '1' });
    });

    it('returns empty object when all fields are unknown', () => {
      const obj = { id: '1', name: 'Test' };
      const result = maskFields(obj, ['foo', 'bar']) as Record<string, unknown>;
      assert.deepEqual(result, {});
    });
  });

  describe('dot notation for nested fields', () => {
    it('retains the parent key with only specified sub-fields', () => {
      const obj = { steps: [{ action: 'click', element: 'button', wait: 500 }] };
      const result = maskFields(obj, ['steps.action']) as Record<string, unknown>;
      const steps = result['steps'] as Array<Record<string, unknown>>;
      assert.ok(Array.isArray(steps));
      assert.deepEqual(steps[0], { action: 'click' });
    });

    it('supports multiple dot-notation paths under the same parent', () => {
      const obj = { steps: [{ action: 'click', element: 'button', wait: 500 }] };
      const result = maskFields(obj, ['steps.action', 'steps.element']) as Record<string, unknown>;
      const steps = result['steps'] as Array<Record<string, unknown>>;
      assert.deepEqual(steps[0], { action: 'click', element: 'button' });
    });

    it('mixes top-level and dot-notation fields', () => {
      const obj = { id: '1', name: 'Test', steps: [{ action: 'click', wait: 500 }] };
      const result = maskFields(obj, ['id', 'steps.action']) as Record<string, unknown>;
      assert.equal(result['id'], '1');
      const steps = result['steps'] as Array<Record<string, unknown>>;
      assert.deepEqual(steps[0], { action: 'click' });
    });

    it('silently ignores unknown dot-notation sub-fields', () => {
      const obj = { steps: [{ action: 'click' }] };
      const result = maskFields(obj, ['steps.action', 'steps.ghost']) as Record<string, unknown>;
      const steps = result['steps'] as Array<Record<string, unknown>>;
      assert.deepEqual(steps[0], { action: 'click' });
    });
  });

  describe('array handling', () => {
    it('applies masking to every element of a top-level array', () => {
      const arr = [
        { name: 'A', type: 'sf', extra: true },
        { name: 'B', type: 'ui', extra: false },
      ];
      const result = maskFields(arr, ['name', 'type']) as Array<Record<string, unknown>>;
      assert.equal(result.length, 2);
      assert.deepEqual(result[0], { name: 'A', type: 'sf' });
      assert.deepEqual(result[1], { name: 'B', type: 'ui' });
    });

    it('handles empty arrays without error', () => {
      const result = maskFields([], ['name']);
      assert.deepEqual(result, []);
    });
  });

  describe('edge cases', () => {
    it('passes through primitive values unchanged', () => {
      assert.equal(maskFields('hello', ['x']), 'hello');
      assert.equal(maskFields(42, ['x']), 42);
      assert.equal(maskFields(null, ['x']), null);
    });

    it('handles objects with numeric or boolean values', () => {
      const obj = { count: 5, active: true, name: 'Test' };
      const result = maskFields(obj, ['count', 'active']) as Record<string, unknown>;
      assert.deepEqual(result, { count: 5, active: true });
    });

    it('handles a field that exists but has a null value', () => {
      const obj = { id: '1', extra: null };
      const result = maskFields(obj, ['extra']) as Record<string, unknown>;
      assert.deepEqual(result, { extra: null });
    });
  });
});

// ── parseFieldsParam ──────────────────────────────────────────────────────────

describe('parseFieldsParam', () => {
  it('returns null when undefined', () => {
    assert.equal(parseFieldsParam(undefined), null);
  });

  it('returns null for blank string', () => {
    assert.equal(parseFieldsParam(''), null);
    assert.equal(parseFieldsParam('   '), null);
  });

  it('trims whitespace around entries', () => {
    const result = parseFieldsParam('id , name , status');
    assert.deepEqual(result, ['id', 'name', 'status']);
  });

  it('filters out empty tokens from trailing commas', () => {
    const result = parseFieldsParam('id,name,');
    assert.deepEqual(result, ['id', 'name']);
  });

  it('returns a single-item array for one field', () => {
    assert.deepEqual(parseFieldsParam('name'), ['name']);
  });

  it('preserves dot notation intact', () => {
    const result = parseFieldsParam('connections.name,connections.type');
    assert.deepEqual(result, ['connections.name', 'connections.type']);
  });
});
