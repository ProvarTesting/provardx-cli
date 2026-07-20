/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'mocha';
import { registerAllStepSchemaTools } from '../../../src/mcp/tools/stepSchemaTools.js';

// ── Minimal McpServer mock ────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => unknown;

class MockMcpServer {
  private handlers = new Map<string, ToolHandler>();
  public registerTool(name: string, _config: unknown, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }
  public call(name: string, args: Record<string, unknown>): ReturnType<ToolHandler> {
    const h = this.handlers.get(name);
    if (!h) throw new Error(`Tool not registered: ${name}`);
    return h(args);
  }
}

function parseText(result: unknown): Record<string, unknown> {
  const r = result as { content: Array<{ type: string; text: string }> };
  return JSON.parse(r.content[0].text) as Record<string, unknown>;
}
function isError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true;
}

interface StepArg {
  id: string;
}
interface StepEntry {
  apiId: string;
  required_arguments?: StepArg[];
  optional_arguments?: StepArg[];
}

function makeServer(): MockMcpServer {
  const server = new MockMcpServer();
  registerAllStepSchemaTools(server as unknown as Parameters<typeof registerAllStepSchemaTools>[0]);
  return server;
}

describe('provar_step_schema', () => {
  it('returns the schema for a step type by short name (UiConnect)', () => {
    const res = makeServer().call('provar_step_schema', { api_id: 'UiConnect' });
    assert.ok(!isError(res));
    const step = parseText(res).step as StepEntry;
    assert.equal(step.apiId, 'com.provar.plugins.forcedotcom.core.ui.UiConnect');
    const req = (step.required_arguments ?? []).map((a) => a.id);
    assert.deepEqual(req, ['connectionName'], 'UiConnect requires connectionName');
  });

  it('resolves by full apiId as well as short name', () => {
    const res = makeServer().call('provar_step_schema', {
      api_id: 'com.provar.plugins.forcedotcom.core.ui.UiDoAction',
    });
    const step = parseText(res).step as StepEntry;
    const req = (step.required_arguments ?? []).map((a) => a.id);
    assert.deepEqual(req, ['locator', 'interaction']);
  });

  it('reflects the corrected schema — no phantom screenName/formLocator', () => {
    const server = makeServer();
    const uws = (
      parseText(server.call('provar_step_schema', { api_id: 'UiWithScreen' })).step as StepEntry
    ).required_arguments!.map((a) => a.id);
    assert.ok(!uws.includes('screenName'), `UiWithScreen must not require phantom screenName: ${uws.join(',')}`);
    assert.deepEqual(uws, ['uiConnectionName', 'target']);

    // UiFill requires nothing. Only 2 real UiFill steps exist across the 1,457-file
    // corpus and both carry `values`/`ignoreFields`, never `locator` — requiring
    // `locator` dropped a genuine IDE-exported fixture (Contact_Lead_flat) to 42.75.
    const fill = (
      parseText(server.call('provar_step_schema', { api_id: 'UiFill' })).step as StepEntry
    ).required_arguments!.map((a) => a.id);
    assert.ok(!fill.includes('formLocator'), `UiFill must not require phantom formLocator: ${fill.join(',')}`);
    assert.deepEqual(fill, []);
  });

  it('lists all step types in a category', () => {
    const res = makeServer().call('provar_step_schema', { category: 'UI' });
    const body = parseText(res);
    assert.ok((body.count as number) > 0);
    const steps = body.steps as Array<{ apiId: string }>;
    assert.ok(steps.every((s) => s.apiId.length > 0));
    assert.ok(steps.some((s) => s.apiId.endsWith('.UiConnect')));
  });

  it('returns the full index when no arguments are given', () => {
    const body = parseText(makeServer().call('provar_step_schema', {}));
    assert.ok((body.count as number) >= 60, 'index should cover the full step catalog');
    const steps = body.steps as Array<{ name: string; apiId: string; category: string }>;
    assert.ok(steps.every((s) => s.name && s.apiId && s.category));
  });

  it('returns STEP_TYPE_NOT_FOUND with a suggestion for an unknown api_id', () => {
    const res = makeServer().call('provar_step_schema', { api_id: 'UiTotallyMadeUp' });
    assert.ok(isError(res));
    const err = parseText(res);
    assert.equal(err.error_code, 'STEP_TYPE_NOT_FOUND');
    assert.ok(err.details, 'should include a suggestion');
  });
});

// Drift guard: the schema is the single source of truth for generation guidance.
// These assertions lock the corrections that steer generation away from the four
// gaps, so the guidance can never silently regress (e.g. back to recommending
// UiConnect or interaction=click).
describe('step schema generation guidance (drift guard)', () => {
  const schema = JSON.parse(
    readFileSync(join(process.cwd(), 'src', 'mcp', 'rules', 'provar_test_step_schema.json'), 'utf-8')
  ) as {
    apiCalls: { UI: Record<string, { validation_rules?: string[] }> };
    common_patterns: { ui_interaction_pattern: { steps: Array<{ step: string }> } };
  };
  const rulesText = (step: string): string => (schema.apiCalls.UI[step].validation_rules ?? []).join(' | ');

  it('ui_interaction_pattern opens with ApexConnect, not UiConnect (gap 1)', () => {
    const first = schema.common_patterns.ui_interaction_pattern.steps[0].step;
    assert.ok(first.includes('ApexConnect'), `pattern should open with ApexConnect, got: ${first}`);
    assert.ok(!first.startsWith('UiConnect'), 'pattern must not open with UiConnect');
  });

  it('UiConnect guidance steers Salesforce UI tests to ApexConnect (gap 1)', () => {
    const t = rulesText('UiConnect');
    assert.ok(t.includes('ApexConnect') && /browser-only/i.test(t), `UiConnect guidance missing steer: ${t}`);
  });

  it('UiDoAction guidance lists valid interactions and forbids click (gap 3)', () => {
    const t = rulesText('UiDoAction');
    assert.ok(t.includes('name=click') && t.includes('action') && t.includes('set'), `interaction vocab missing: ${t}`);
  });

  it('UiAssert guidance requires nested uiFieldAssertion and warns off namedValues (gap 4)', () => {
    const t = rulesText('UiAssert');
    assert.ok(t.includes('uiFieldAssertion') && t.includes('namedValues'), `assert nesting guidance missing: ${t}`);
  });
});
