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
  computeContextHash,
  resolveValidationDir,
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

  it('a message-only change with no diff_identity is a resolved + added pair (per-step identity)', () => {
    const before = { rule_id: 'STEP-R', applies_to: 'TestCase', message: 'old text' };
    const after = { rule_id: 'STEP-R', applies_to: 'TestCase', message: 'new text' };
    const diff = computeDiff([before], [after]);
    assert.equal(diff.added.length, 1, 'no stable identity → the new message is a new finding');
    assert.equal(diff.resolved.length, 1, 'no stable identity → the old message resolved');
    assert.deepEqual(diff.updated, [], 'updated requires a shared identity');
  });
});

// ── diff_identity / updated[] — aggregate-rule stability across partial fixes ──

describe('computeDiff — diff_identity and updated[]', () => {
  // An aggregate rule emits ONE violation per test case carrying a count. Its
  // diff_identity is constant for the rule over that file, so a partial fix reads as
  // "still unresolved, fewer steps" (updated) rather than "resolved + added".
  const AGG_13 = {
    rule_id: 'STEP-REQUIRED-ARGS-001',
    applies_to: 'TestCase',
    diff_identity: 'aggregate:guid-123',
    message: '13 step(s) affected. Missing argument(s): connectionName.',
    count: 13,
    details: { affected_steps: 13 },
  };
  const AGG_12 = {
    rule_id: 'STEP-REQUIRED-ARGS-001',
    applies_to: 'TestCase',
    diff_identity: 'aggregate:guid-123',
    message: '12 step(s) affected. Missing argument(s): connectionName.',
    count: 12,
    details: { affected_steps: 12 },
  };

  it('keys on diff_identity so a partially-fixed aggregate stays one finding, not resolved+added', () => {
    const diff = computeDiff([AGG_13], [AGG_12]);
    assert.deepEqual(diff.added, [], 'partial fix is not a new finding');
    assert.deepEqual(diff.resolved, [], 'partial fix is not a resolution');
    assert.equal(diff.unchanged_count, 1, 'the finding survives under its stable identity');
  });

  it('emits the surviving-but-moved finding in updated[] carrying the current sample', () => {
    const diff = computeDiff([AGG_13], [AGG_12]);
    assert.equal(diff.updated.length, 1);
    assert.equal(diff.updated[0]['count'], 12, 'updated reflects the CURRENT state, not the baseline');
    assert.equal(diff.updated[0]['message'], AGG_12.message);
  });

  it('does not emit updated[] when a diff_identity finding is byte-for-byte unchanged', () => {
    const diff = computeDiff([AGG_13], [AGG_13]);
    assert.deepEqual(diff.updated, []);
    assert.equal(diff.unchanged_count, 1);
  });

  it('detects a content change via count alone (message identical)', () => {
    const base = { ...AGG_13, message: 'same', count: 5 };
    const curr = { ...AGG_13, message: 'same', count: 4 };
    const diff = computeDiff([base], [curr]);
    assert.equal(diff.updated.length, 1, 'count moved → updated');
    assert.equal(diff.added.length, 0);
    assert.equal(diff.resolved.length, 0);
  });

  it('detects a content change via details alone (message and count identical)', () => {
    const base = { ...AGG_13, message: 'same', count: 7, details: { steps: 'a; b' } };
    const curr = { ...AGG_13, message: 'same', count: 7, details: { steps: 'a' } };
    const diff = computeDiff([base], [curr]);
    assert.equal(diff.updated.length, 1, 'details moved → updated');
  });

  it('keeps distinct diff_identity values under the same rule independent', () => {
    const fileA = { ...AGG_13, diff_identity: 'aggregate:A' };
    const fileB = { ...AGG_13, diff_identity: 'aggregate:B' };
    // Fully fix file A, leave file B untouched → A resolved, B unchanged.
    const diff = computeDiff([fileA, fileB], [fileB]);
    assert.equal(diff.resolved.length, 1);
    assert.equal(diff.resolved[0]['diff_identity'], 'aggregate:A');
    assert.equal(diff.unchanged_count, 1);
    assert.deepEqual(diff.updated, []);
  });
});

// ── H3: cross-context scoping ─────────────────────────────────────────────────

describe('computeContextHash', () => {
  it('is deterministic for the same tool+context', () => {
    assert.equal(computeContextHash('tc', '/a/b/c.testcase'), computeContextHash('tc', '/a/b/c.testcase'));
  });

  it('differs for different tools with the same context', () => {
    assert.notEqual(computeContextHash('tc', '/path'), computeContextHash('suite', '/path'));
  });

  it('differs for different contexts under the same tool', () => {
    assert.notEqual(computeContextHash('tc', '/a'), computeContextHash('tc', '/b'));
  });
});

describe('loadBaselineViolations — context scoping (H3)', () => {
  it('returns null when expectedContextHash does not match the saved record', () => {
    const ctxA = computeContextHash('tc', '/project/a/x.testcase');
    const ctxB = computeContextHash('tc', '/project/b/y.testcase');
    const runId = generateRunId('/project/a/x.testcase');
    saveRun(tmpDir, runId, [V1], ctxA);

    // Same store, same run_id, different context → should be rejected
    assert.equal(loadBaselineViolations(tmpDir, runId, ctxB), null);
  });

  it('returns the violations when expectedContextHash matches', () => {
    const ctx = computeContextHash('tc', '/project/a/x.testcase');
    const runId = generateRunId('/project/a/x.testcase');
    saveRun(tmpDir, runId, [V1, V2], ctx);

    const loaded = loadBaselineViolations(tmpDir, runId, ctx);
    assert.deepEqual(loaded, [V1, V2]);
  });

  it('treats records written without context_hash as a mismatch when one is expected', () => {
    // Simulate a record persisted by an older version (no context_hash)
    const runId = generateRunId('/legacy/path');
    saveRun(tmpDir, runId, [V1]); // omit contextHash
    const ctx = computeContextHash('tc', '/legacy/path');
    assert.equal(loadBaselineViolations(tmpDir, runId, ctx), null);
  });

  it('still loads when no expectedContextHash is provided (back-compat)', () => {
    const runId = generateRunId('/path');
    saveRun(tmpDir, runId, [V1]); // no context hash
    assert.deepEqual(loadBaselineViolations(tmpDir, runId), [V1]);
  });
});

describe('resolveValidationDir', () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env['PROVAR_MCP_VALIDATION_DIR'];
    delete process.env['PROVAR_MCP_VALIDATION_DIR'];
  });

  afterEach(() => {
    if (saved !== undefined) process.env['PROVAR_MCP_VALIDATION_DIR'] = saved;
    else delete process.env['PROVAR_MCP_VALIDATION_DIR'];
  });

  it('defaults to ~/.provardx/validation/<subdir> when env override is unset', () => {
    const dir = resolveValidationDir('testcase');
    const expected = path.join(os.homedir(), '.provardx', 'validation', 'testcase');
    assert.equal(dir, expected);
  });

  it('honors PROVAR_MCP_VALIDATION_DIR when set', () => {
    process.env['PROVAR_MCP_VALIDATION_DIR'] = path.join(tmpDir, 'custom-root');
    const dir = resolveValidationDir('testsuite');
    assert.equal(dir, path.join(tmpDir, 'custom-root', 'testsuite'));
  });

  it('trims whitespace and falls back to default when env is whitespace-only', () => {
    process.env['PROVAR_MCP_VALIDATION_DIR'] = '   ';
    const dir = resolveValidationDir('testcase');
    assert.equal(dir, path.join(os.homedir(), '.provardx', 'validation', 'testcase'));
  });
});
