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
import { LAYER1_OWNED_BP_RULES } from '../../../src/mcp/tools/testCaseValidate.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const registryPath = join(repoRoot, 'docs', 'VALIDATION_RULE_REGISTRY.md');
const bpRulesPath = join(repoRoot, 'src', 'mcp', 'rules', 'provar_best_practices_rules.json');
const layer1RulesPath = join(repoRoot, 'src', 'mcp', 'rules', 'provar_layer1_rules.json');
const validatorSrcPath = join(repoRoot, 'src', 'mcp', 'tools', 'testCaseValidate.ts');

interface BPRule {
  id: string;
  severity: string;
}

interface Layer1Rule {
  id: string;
  severity: 'ERROR' | 'WARNING';
  applies_to: string;
  description: string;
  owns_bp_rules?: string[];
}

describe('Validation Rule Registry (PDX-508 Tier 6 / PDX-511)', () => {
  const registry = readFileSync(registryPath, 'utf-8');
  const bp = JSON.parse(readFileSync(bpRulesPath, 'utf-8')) as { rules: BPRule[] };
  // Layer-1 catalog — the single source of truth (PDX-511). Both the registry
  // generator and testCaseValidate.ts read this JSON; nothing is hand-copied.
  const layer1 = (JSON.parse(readFileSync(layer1RulesPath, 'utf-8')) as { rules: Layer1Rule[] }).rules;
  // Layer-2 criticals a Layer-1 check owns — derived from the catalog, NOT hand-listed.
  const ownedFromCatalog = new Set(layer1.flatMap((r) => r.owns_bp_rules ?? []));

  /** Pull the "Gates is_valid?" cell for a given rule id from its table row. */
  function gatingCell(ruleId: string): string | undefined {
    const line = registry.split('\n').find((l) => l.includes(`\`${ruleId}\``));
    if (!line) return undefined;
    const cells = line.split('|').map((c) => c.trim());
    return cells.find((c) => c === 'Yes' || c === 'No');
  }

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

  it('the Layer-1-owned criticals never gate in the registry', () => {
    for (const id of ownedFromCatalog) {
      if (registry.includes(`\`${id}\``)) {
        assert.equal(gatingCell(id), 'No', `${id} is Layer-1-owned and must not be bridged`);
      }
    }
  });

  // ── PDX-511: provar_layer1_rules.json is the single source of truth ──────────
  // Each guard below fails CI if the Layer-1 catalog drifts from either consumer
  // (the registry generator, or the validator's detection + bridge-suppression).

  it('renders every Layer-1 catalog rule with the gating its severity implies', () => {
    for (const r of layer1) {
      assert.ok(
        registry.includes(`\`${r.id}\``),
        `Layer-1 rule ${r.id} missing from the registry — re-run scripts/build-validation-rule-registry.cjs`
      );
      // Layer-1 ERROR gates is_valid; WARNING is advisory (quality only).
      assert.equal(gatingCell(r.id), r.severity === 'ERROR' ? 'Yes' : 'No', `${r.id} gating column mismatch`);
    }
  });

  it('renders the Layer-1 counts line from the catalog', () => {
    const gating = layer1.filter((r) => r.severity === 'ERROR').length;
    assert.ok(
      registry.includes(`Layer 1 — ${layer1.length} rules (${gating} gating)`),
      `Layer-1 counts line is stale — expected "Layer 1 — ${layer1.length} rules (${gating} gating)"`
    );
  });

  it('derives the validator bridge-suppression set from the catalog (no hand-duplication)', () => {
    assert.deepEqual(
      [...LAYER1_OWNED_BP_RULES].sort(),
      [...ownedFromCatalog].sort(),
      'testCaseValidate.ts LAYER1_OWNED_BP_RULES drifted from provar_layer1_rules.json owns_bp_rules'
    );
  });

  it('catalog owns_bp_rules reference critical best-practice rules', () => {
    const bpById = new Map(bp.rules.map((r) => [r.id, r]));
    for (const owned of ownedFromCatalog) {
      const rule = bpById.get(owned);
      // COMPARISON-TYPE-ENUM-001 is a deferred BP rule id (owned pre-emptively); tolerate absence.
      if (rule) {
        assert.equal(rule.severity, 'critical', `${owned} is owned by a Layer-1 check but is not a critical BP rule`);
      }
    }
  });

  it('catalogs every Layer-1 rule the validator emits, with matching severity (drift guard)', () => {
    const src = readFileSync(validatorSrcPath, 'utf-8');
    // Detection sites read `rule_id: 'ID',` immediately followed by `severity: 'SEV',`.
    // The validity bridge uses `rule_id: v.rule_id` (no string literal) and is skipped.
    const re = /rule_id:\s*'([A-Za-z0-9_-]+)',\s*\n\s*severity:\s*'(ERROR|WARNING)'/g;
    const emitted = new Map<string, string>();
    for (let m = re.exec(src); m !== null; m = re.exec(src)) {
      const [, id, severity] = m;
      const prior = emitted.get(id);
      assert.ok(
        prior === undefined || prior === severity,
        `${id} is emitted with conflicting severities in testCaseValidate.ts`
      );
      emitted.set(id, severity);
    }
    const catalogSeverity = new Map(layer1.map((r) => [r.id, r.severity as string]));
    assert.deepEqual(
      [...emitted.keys()].sort(),
      [...catalogSeverity.keys()].sort(),
      'Layer-1 rule ids emitted by testCaseValidate.ts differ from provar_layer1_rules.json — update the catalog'
    );
    for (const [id, severity] of emitted) {
      assert.equal(severity, catalogSeverity.get(id), `${id} severity in the validator differs from the catalog`);
    }
  });
});
