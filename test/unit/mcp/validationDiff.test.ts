/* eslint-disable camelcase */
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, beforeEach, afterEach } from 'mocha';
import {
  generateRunId,
  saveRun,
  hasAnyRun,
  loadBaselineViolations,
  computeDiff,
} from '../../../src/mcp/utils/validationDiff.js';

const V1 = { rule_id: 'RULE-001', applies_to: 'TestSuite', message: 'Suite is empty' };
const V2 = { rule_id: 'RULE-002', applies_to: 'TestPlan', message: 'Plan has no suites' };
const V3 = { rule_id: 'RULE-003', applies_to: 'Project', message: 'No test plans' };

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valdiff-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('generateRunId', () => {
  it('produces a timestamp-hash string', () => {
    const id = generateRunId('/some/project/path');
    assert.match(id, /^\d+-[0-9a-f]{8}-[0-9a-z]{4}$/);
  });

  it('produces different IDs for different contexts', () => {
    const id1 = generateRunId('/path/a');
    const id2 = generateRunId('/path/b');
    // hash portion differs
    assert.notEqual(id1.split('-')[1], id2.split('-')[1]);
  });
});

describe('hasAnyRun', () => {
  it('returns false when no index file exists', () => {
    assert.equal(hasAnyRun(tmpDir), false);
  });

  it('returns true after a run is saved', () => {
    saveRun(tmpDir, generateRunId('ctx'), [V1]);
    assert.equal(hasAnyRun(tmpDir), true);
  });
});

describe('saveRun / loadBaselineViolations', () => {
  it('saves and retrieves violations by run_id', () => {
    const runId = generateRunId('ctx');
    saveRun(tmpDir, runId, [V1, V2]);
    const loaded = loadBaselineViolations(tmpDir, runId);
    assert.deepEqual(loaded, [V1, V2]);
  });

  it('returns null for an unknown run_id', () => {
    const result = loadBaselineViolations(tmpDir, 'nonexistent-run-id');
    assert.equal(result, null);
  });

  it('caps index at 20 entries and evicts the oldest', () => {
    const ids: string[] = [];
    for (let i = 0; i < 22; i++) {
      const id = `${Date.now() + i}-abc${i.toString().padStart(4, '0')}`;
      ids.push(id);
      saveRun(tmpDir, id, [V1]);
    }
    // First two should be evicted
    assert.equal(loadBaselineViolations(tmpDir, ids[0]), null);
    assert.equal(loadBaselineViolations(tmpDir, ids[1]), null);
    // Last 20 should still be present
    for (let i = 2; i < 22; i++) {
      assert.notEqual(loadBaselineViolations(tmpDir, ids[i]), null, `Expected run ${i} to be present`);
    }
  });
});

describe('computeDiff', () => {
  it('returns empty diff when violations are identical', () => {
    const diff = computeDiff([V1, V2], [V1, V2]);
    assert.deepEqual(diff.added, []);
    assert.deepEqual(diff.resolved, []);
    assert.equal(diff.unchanged_count, 2);
  });

  it('detects added violations', () => {
    const diff = computeDiff([V1], [V1, V2]);
    assert.equal(diff.added.length, 1);
    assert.equal(diff.added[0]['rule_id'], 'RULE-002');
    assert.deepEqual(diff.resolved, []);
    assert.equal(diff.unchanged_count, 1);
  });

  it('detects resolved violations', () => {
    const diff = computeDiff([V1, V2], [V2]);
    assert.deepEqual(diff.added, []);
    assert.equal(diff.resolved.length, 1);
    assert.equal(diff.resolved[0]['rule_id'], 'RULE-001');
    assert.equal(diff.unchanged_count, 1);
  });

  it('detects added and resolved in the same diff', () => {
    const diff = computeDiff([V1, V2], [V2, V3]);
    assert.equal(diff.added.length, 1);
    assert.equal(diff.added[0]['rule_id'], 'RULE-003');
    assert.equal(diff.resolved.length, 1);
    assert.equal(diff.resolved[0]['rule_id'], 'RULE-001');
    assert.equal(diff.unchanged_count, 1);
  });

  it('handles empty baseline (all current violations are added)', () => {
    const diff = computeDiff([], [V1, V2]);
    assert.equal(diff.added.length, 2);
    assert.deepEqual(diff.resolved, []);
    assert.equal(diff.unchanged_count, 0);
  });

  it('handles empty current (all baseline violations are resolved)', () => {
    const diff = computeDiff([V1, V2], []);
    assert.deepEqual(diff.added, []);
    assert.equal(diff.resolved.length, 2);
    assert.equal(diff.unchanged_count, 0);
  });

  it('multiset: duplicate violations are treated as distinct entries', () => {
    // V1 appears twice in baseline, three times in current → 1 added, 2 unchanged
    const diff = computeDiff([V1, V1], [V1, V1, V1]);
    assert.equal(diff.added.length, 1, 'one extra occurrence added');
    assert.equal(diff.resolved.length, 0);
    assert.equal(diff.unchanged_count, 2);
  });

  it('multiset: reducing duplicate count registers as resolved', () => {
    // V1 appears three times in baseline, once in current → 2 resolved, 1 unchanged
    const diff = computeDiff([V1, V1, V1], [V1]);
    assert.equal(diff.added.length, 0);
    assert.equal(diff.resolved.length, 2, 'two occurrences resolved');
    assert.equal(diff.unchanged_count, 1);
  });
});
