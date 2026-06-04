/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it } from 'mocha';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const registryPath = join(repoRoot, 'docs', 'VALIDATION_RULE_REGISTRY.md');
const bpRulesPath = join(repoRoot, 'src', 'mcp', 'rules', 'provar_best_practices_rules.json');

interface BPRule {
  id: string;
  severity: string;
}

describe('Validation Rule Registry (PDX-508 Tier 6)', () => {
  const registry = readFileSync(registryPath, 'utf-8');
  const bp = JSON.parse(readFileSync(bpRulesPath, 'utf-8')) as { rules: BPRule[] };

  // Layer-2 criticals whose concept a Layer-1 check owns — NOT bridged to is_valid.
  const LAYER1_OWNED = new Set([
    'SCHEMA-ROOT-001',
    'SCHEMA-STEPS-001',
    'VALID-STEPS-001',
    'SCHEMA-ID-001',
    'VALID-GUID-001',
    'STEP-ITEMID-001',
    'COMPARISON-TYPE-ENUM-001',
  ]);

  it('lists every best-practice rule (guards against doc drift)', () => {
    const missing = bp.rules.filter((r) => !registry.includes(`\`${r.id}\``)).map((r) => r.id);
    assert.deepEqual(
      missing,
      [],
      `Registry is stale — re-run scripts/build-validation-rule-registry.cjs. Missing: ${missing.join(', ')}`
    );
  });

  it('includes the core Layer-1 structural rules', () => {
    for (const id of ['TC_001', 'TC_010', 'TC_020', 'TC_035', 'COMPARISON-TYPE-001', 'VAR-REF-001']) {
      assert.ok(registry.includes(`\`${id}\``), `Expected Layer-1 rule ${id} in the registry`);
    }
  });

  /** Pull the "Gates is_valid?" cell for a given rule id from its table row. */
  function gatingCell(ruleId: string): string | undefined {
    const line = registry.split('\n').find((l) => l.includes(`\`${ruleId}\``));
    if (!line) return undefined;
    const cells = line.split('|').map((c) => c.trim());
    return cells.find((c) => c === 'Yes' || c === 'No');
  }

  it('marks a bridged critical as gating is_valid', () => {
    // API-UNKNOWN-001 is critical and not Layer-1-owned → bridged → gates is_valid.
    assert.equal(gatingCell('API-UNKNOWN-001'), 'Yes');
  });

  it('marks a Layer-1-owned critical as NOT gating (suppressed from the bridge)', () => {
    assert.equal(gatingCell('VALID-STEPS-001'), 'No');
  });

  it('marks a major best-practice rule as NOT gating is_valid', () => {
    // VAR-STRING-LITERAL-001 is a runtime (major) defect — quality_score only.
    assert.equal(gatingCell('VAR-STRING-LITERAL-001'), 'No');
  });

  it('the LAYER1_OWNED criticals never gate in the registry', () => {
    for (const id of LAYER1_OWNED) {
      if (registry.includes(`\`${id}\``)) {
        assert.equal(gatingCell(id), 'No', `${id} is Layer-1-owned and must not be bridged`);
      }
    }
  });
});
