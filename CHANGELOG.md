# Changelog

## v1.6.0

A major step-up for the local validator: it now mirrors what actually loads and runs in Provar, surfaces severity through validity, and ships a higher default quality bar — plus two new MCP resources that expose the validator's contract to AI clients.

### Highlights

- **The local validator now mirrors Provar's own load/runtime behaviour.** Dozens of structural and best-practice checks that previously lived only in the Quality Hub backend now run locally, so `provar_testcase_validate` catches load-blocking and runtime defects with no API key required.
- **Validity now reflects severity.** A `critical` best-practice violation (e.g. a hallucinated `apiId`, a non-integer `testItemId`) now gates `is_valid` instead of quietly passing — an AI agent can trust `is_valid: true` again.
- **A single, tri-state verdict.** Every validate tool returns `status: valid | needs_improvement | invalid`, alongside the effective `quality_threshold` and `meets_quality_threshold`, so agents have one unambiguous signal to gate on.
- **A higher default quality bar.** The default quality threshold is raised **80 → 90**, tunable per call (`quality_threshold`) or globally (`PROVAR_MCP_QUALITY_THRESHOLD`).
- **Two new MCP resources** expose the validator's contract: the structured Provar test-step schema and a canonical Validation Rule Registry.

### New

- **MCP resource `provar://schema/test-step`** — the structured JSON contract for the Provar test-case XML (root, generic `apiCall`, every step type with required/optional args and value classes).
- **MCP resource `provar://docs/validation-rules`** — the canonical registry of every validation rule across both layers (id, severity, weight, what it checks, and whether it gates `is_valid`).
- **`status`, `quality_threshold`, `meets_quality_threshold`** output fields on `provar_testcase_validate` and the suite/plan/project validate tools.
- **`quality_threshold` input** plus the **`PROVAR_MCP_QUALITY_THRESHOLD`** env var (precedence: per-call arg → env → 90).
- **Context-aware `comparisonType` validation** — the valid comparison set is scoped by step type (AssertValues, UI Assert, …) instead of one flat list.
- **Project-aware `test_case_id` allocation** — generated test cases take the next id in the surrounding Provar project rather than a hard-coded `id="1"`; the chosen id is surfaced on the response.
- **`PROVAR_PLUGIN_NOT_FOUND`** error code when the Provar Automation plugin is missing.

### Changed

- **Validity bridge:** critical best-practice violations are surfaced as `is_valid`-gating issues, deduplicated against the Layer-1 rule that already owns the same concept.
- Severity alignment with Quality Hub: `UI-BINDING-ORDER-001` and `VAR-NAMING-001` reclassified critical → major (they hard-fail at runtime but do not block loading).
- Test-case generator fidelity: `UiDoAction` is serialised as `uiInteraction`, and `UiAssert` field assertions are nested for correct Provar IDE rendering.

### Fixed

- Best-practices engine no longer crashes on numeric tag values.
- `RENDER-CASE-001` scoped to the six real `valueClass` values, removing false positives.
- `TC_010` accepts any integer test-case id and treats id as optional (the `guid` is the real identifier).
- Windows: the `sf` executable and its arguments are quoted so project paths containing spaces work.

### Upgrade notes

- **Mostly non-breaking.** New inputs, env vars, and output fields are additive.
- **Behaviour change to note:** with the validity bridge and the higher default threshold (90), a test case that previously returned `is_valid: true` may now report `status: "needs_improvement"` (score below 90) or `"invalid"` (a critical violation now gates validity). Set `quality_threshold` per call or `PROVAR_MCP_QUALITY_THRESHOLD` globally to restore the previous 80 bar if needed.

## v1.5.1

### Highlights

- **Smaller, faster MCP handshake** — opt into compact tool schemas and load only the tool groups you need. **~36% fewer handshake tokens with compact mode alone, up to ~57% when combined with group filtering.**
- **Smarter validation loops** — agents get tunable response detail, run-over-run diffs, and a single completeness signal that's safe to gate on.
- **Single-call test authoring** — test-case generation is now a true one-shot construction, with a runtime guard so agents stop iterating in the wrong direction.
- **Reliable connection + environment resolution** in `.testproject` files.

### Tool-catalog footprint

Tokens sent to the LLM on `tools/list` (≈4 chars/token):

| Configuration                              | Tools | ~Tokens | Savings vs default |
| ------------------------------------------ | ----: | ------: | -----------------: |
| Standard (all groups, full descriptions)   |    41 |  18,355 |                  — |
| Compact (all groups, compact descriptions) |    41 |  11,758 |           **−36%** |
| Authoring profile (compact + 4 groups)     |    21 |   7,906 |           **−57%** |

Per-tool savings are largest where they matter most — `testcase_generate` alone drops from ~2,070 tokens of description to a fraction of that in compact mode.

### New

- Compact schema mode and tool-group filtering for trimmed startup payloads.
- `detail`, `baseline_run_id`, `run_id`, and `completeness_score` on validation tools.
- `fields` parameter on inspect / list tools to scope responses to only what's needed.
- Depth guard and token-attribution middleware across all tools.
- Construct-vs-amend contract carried into test-case tool titles, descriptions, and a runtime check on empty steps.

### Guidance & prompt improvements

- Test-case authoring rewritten as a **single-call construction** contract — agents now produce a complete test case in one call instead of looping through construct → amend → re-amend cycles. End-to-end authoring of a multi-step Salesforce flow drops from typically **3–5 tool calls to 1**.
- Construct-vs-amend semantics surfaced at three layers (tool title, description, runtime guard) so agents that skim only the title still get the contract.
- Validation tools now return a single `completeness_score` (0–100) so agents have one number to gate on, instead of inferring stop/continue from violation arrays.
- Compact tool descriptions are tuned to keep the _contract_ (when to call, prerequisites, common failure modes) while dropping prose — the signal agents actually use stays intact.

### Fixed

- Validation stop decisions now account for all violation levels (plan metadata, suite, best-practices) instead of stopping while issues remain.
- Read-only validation diffs work without writing new results.
- Validation baselines are now scoped to their original project context, so a baseline from one project can't silently diff against another.
- Unknown tool-group names now warn instead of silently disabling everything.
- Release builds now reliably fetch the latest NitroX schemas instead of falling back to a bundled copy.
- Connection + environment resolution in `.testproject` files.
- Various agent-loop and review-pass hardening for the test-case authoring path.

### Upgrade notes

- **Non-breaking.** All new parameters and env vars are opt-in.
- Existing callers see no behavior change.
