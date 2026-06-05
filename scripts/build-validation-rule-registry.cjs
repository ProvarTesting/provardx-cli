#!/usr/bin/env node
/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/*
 * Generates the canonical Validation Rule Registry (docs/VALIDATION_RULE_REGISTRY.md)
 * from the two rule sources:
 *   - Layer 1 (structural validity): metadata catalog in
 *     src/mcp/rules/provar_layer1_rules.json — the single source of truth shared
 *     with testCaseValidate.ts (detection stays in code; only metadata is data).
 *   - Layer 2 (best practices): src/mcp/rules/provar_best_practices_rules.json.
 *
 * "Gates is_valid?" reflects the PDX-509 model:
 *   - Layer-1 ERROR  → YES (error_count gates is_valid)
 *   - Layer-1 WARNING/INFO → no (advisory / quality only)
 *   - Layer-2 critical → YES via the validity bridge, UNLESS the concept is already
 *     owned by a Layer-1 check (then suppressed to avoid double-reporting)
 *   - Layer-2 major/minor/info → no (quality_score only)
 *
 * Re-run after changing any rule:  node scripts/build-validation-rule-registry.cjs
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'VALIDATION_RULE_REGISTRY.md');
const BP_JSON = path.join(ROOT, 'src', 'mcp', 'rules', 'provar_best_practices_rules.json');
const LAYER1_JSON = path.join(ROOT, 'src', 'mcp', 'rules', 'provar_layer1_rules.json');

// Layer-1 structural-validity catalog (id, severity, applies_to, description,
// owns_bp_rules), read from the shared single source of truth. The same JSON is
// consumed by testCaseValidate.ts (owned-set) and validationRuleRegistry.test.ts
// (drift guard). Detection stays in code; only this metadata is centralized.
const LAYER1 = JSON.parse(fs.readFileSync(LAYER1_JSON, 'utf8')).rules;

// Layer-2 critical rules whose concept a Layer-1 check already owns — derived
// from the catalog's `owns_bp_rules` (mirrors LAYER1_OWNED_BP_RULES in
// testCaseValidate.ts, same source). These criticals are NOT bridged.
const LAYER1_OWNED = new Set(LAYER1.flatMap((r) => r.owns_bp_rules || []));

function gatesLayer1(sev) {
  return sev === 'ERROR' ? 'Yes' : 'No';
}
function gatesLayer2(rule) {
  return rule.severity === 'critical' && !LAYER1_OWNED.has(rule.id) ? 'Yes' : 'No';
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();
}

const bp = JSON.parse(fs.readFileSync(BP_JSON, 'utf8'));
const rules = bp.rules.slice().sort((a, b) => (a.category + a.id).localeCompare(b.category + b.id));

const sev = { critical: 0, major: 0, minor: 0, info: 0 };
for (const r of rules) sev[r.severity] = (sev[r.severity] || 0) + 1;
const bpGating = rules.filter((r) => gatesLayer2(r) === 'Yes').length;

const lines = [];
lines.push('# Provar Validation Rule Registry');
lines.push('');
lines.push(
  '> **Generated** by `scripts/build-validation-rule-registry.cjs`. Do not edit by hand — re-run the script after changing a rule.'
);
lines.push('');
lines.push(
  'Provar test-case validation runs in two layers. This registry is the single canonical list of every rule across both.'
);
lines.push('');
lines.push(
  '- **Layer 1 — structural validity** (hand-coded in `testCaseValidate.ts`): emits `issues[]` with `ERROR`/`WARNING`. `is_valid = error_count === 0`.'
);
lines.push(
  '- **Layer 2 — best practices** (`provar_best_practices_rules.json`, same engine/weights as the Quality Hub API): emits `best_practices_violations[]` with `critical`/`major`/`minor`/`info` and a weighted `quality_score`.'
);
lines.push('');
lines.push(
  '**Severity taxonomy:** `critical` = the test will not load/render in Provar; `major` = a runtime ERROR (loads, fails at execution); `minor` = warning; `info` = advisory.'
);
lines.push('');
lines.push(
  '**The validity bridge (PDX-509):** a `critical` best-practice violation is surfaced into `issues[]` as an `ERROR` and therefore gates `is_valid` — EXCEPT where a Layer-1 check already owns the concept (then it is suppressed to avoid double-reporting). `major`/`minor`/`info` affect `quality_score` (and the `needs_improvement` status) only. The `status` field is tri-state: `invalid` (a critical) / `needs_improvement` (loads but `quality_score < quality_threshold`) / `valid`.'
);
lines.push('');
lines.push(
  `**Counts:** Layer 1 — ${LAYER1.length} rules (${
    LAYER1.filter((r) => r.severity === 'ERROR').length
  } gating). Layer 2 — ${rules.length} rules (critical ${sev.critical} / major ${sev.major} / minor ${
    sev.minor
  } / info ${sev.info}; ${bpGating} bridged to \`is_valid\`).`
);
lines.push('');
lines.push('## Layer 1 — Structural validity rules');
lines.push('');
lines.push('| Rule ID | Severity | Gates is_valid? | Applies to | Checks |');
lines.push('| ------- | -------- | --------------- | ---------- | ------ |');
for (const r of LAYER1) {
  lines.push(`| \`${r.id}\` | ${r.severity} | ${gatesLayer1(r.severity)} | ${r.applies_to} | ${esc(r.description)} |`);
}
lines.push('');
lines.push('## Layer 2 — Best-practice rules');
lines.push('');
lines.push('| Rule ID | Category | Severity | Weight | Gates is_valid? | Checks |');
lines.push('| ------- | -------- | -------- | ------ | --------------- | ------ |');
for (const r of rules) {
  const note = r.severity === 'critical' && LAYER1_OWNED.has(r.id) ? ' _(Layer-1 owns this concept; not bridged)_' : '';
  lines.push(
    `| \`${r.id}\` | ${esc(r.category)} | ${r.severity} | ${r.weight} | ${gatesLayer2(r)} | ${esc(r.name)}.${note} |`
  );
}
lines.push('');

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
process.stdout.write(`Wrote ${OUT} (${LAYER1.length} Layer-1 + ${rules.length} Layer-2 rules)\n`);
