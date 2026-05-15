/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach } from 'mocha';
import {
  registerOnboardingPrompt,
  registerTroubleshootPrompt,
  registerOrchestrationPrompt,
} from '../../../src/mcp/prompts/guidePrompts.js';

// ── Minimal McpServer mock ─────────────────────────────────────────────────────

type PromptHandler = (args: Record<string, unknown>) => {
  messages: Array<{ role: string; content: { type: string; text: string } }>;
};

interface PromptRegistration {
  name: string;
  description: string;
  handler: PromptHandler;
}

class MockMcpServer {
  public registrations: PromptRegistration[] = [];

  public prompt(name: string, description: string, _schema: unknown, handler: PromptHandler): void {
    this.registrations.push({ name, description, handler });
  }

  public call(name: string, args: Record<string, unknown>): ReturnType<PromptHandler> {
    const reg = this.registrations.find((r) => r.name === name);
    if (!reg) throw new Error(`Prompt not registered: ${name}`);
    return reg.handler(args);
  }
}

function getMessageText(result: ReturnType<PromptHandler>): string {
  assert.ok(result.messages.length > 0, 'Expected at least one message');
  assert.equal(result.messages[0].role, 'user');
  assert.equal(result.messages[0].content.type, 'text');
  return result.messages[0].content.text;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

let server: MockMcpServer;

beforeEach(() => {
  server = new MockMcpServer();
  registerOnboardingPrompt(server as never);
  registerTroubleshootPrompt(server as never);
  registerOrchestrationPrompt(server as never);
});

describe('guidePrompts — registration', () => {
  it('registers all 3 guide prompts', () => {
    assert.equal(server.registrations.length, 3);
  });

  it('registers provar.guide.onboarding', () => {
    const reg = server.registrations.find((r) => r.name === 'provar.guide.onboarding');
    assert.ok(reg, 'provar.guide.onboarding should be registered');
  });

  it('registers provar.guide.troubleshoot', () => {
    const reg = server.registrations.find((r) => r.name === 'provar.guide.troubleshoot');
    assert.ok(reg, 'provar.guide.troubleshoot should be registered');
  });

  it('registers provar.guide.orchestration', () => {
    const reg = server.registrations.find((r) => r.name === 'provar.guide.orchestration');
    assert.ok(reg, 'provar.guide.orchestration should be registered');
  });
});

// ── Regression guard: the PDX-481 single-call construction copy ────────────────
// These assertions protect the canonical phrasing that fixes PDX-479. If you
// rewrite the author-test flow in guidePrompts.ts, you MUST keep equivalent
// guidance — otherwise the 1.5.0 regression returns.

describe('guidePrompts — author-test flow (PDX-481 regression guard)', () => {
  it('author-test flow recommends single-call construction', () => {
    const text = getMessageText(server.call('provar.guide.orchestration', { task: 'author-test' }));
    assert.ok(
      text.includes('single call') || text.includes('one call') || text.includes('in one payload'),
      'author-test flow must recommend single-call construction (search: "single call" / "one call" / "in one payload")'
    );
    assert.ok(
      text.includes('ALL steps') || text.includes('full step tree') || text.includes('full tree'),
      'author-test flow must call out passing the full step tree at once'
    );
  });

  it('author-test flow does NOT recommend per-step construction', () => {
    const text = getMessageText(server.call('provar.guide.orchestration', { task: 'author-test' }));
    assert.ok(
      !text.includes('repeat per step'),
      'author-test flow must not say "repeat per step" — that pattern caused PDX-479'
    );
    // Unconditional check — the old OR-clause "|| text.includes('amend')" short-circuited to pass
    // (because "amend" appears repeatedly elsewhere in the flow), so it provided no real protection
    // against the "repeat as needed" phrasing being reintroduced.
    assert.ok(
      !text.includes('repeat as needed'),
      'author-test flow must not say "repeat as needed" — that pattern caused PDX-479'
    );
  });

  it('author-test flow marks step_edit as amendment-only', () => {
    const text = getMessageText(server.call('provar.guide.orchestration', { task: 'author-test' }));
    assert.ok(
      text.includes('amend') || text.includes('Amend') || text.includes('AMENDING'),
      'author-test flow must mark provar_testcase_step_edit as for amending existing test cases'
    );
  });
});

describe('guidePrompts — orchestration general flow (PDX-481 regression guard)', () => {
  it('prerequisite graph splits generate and step_edit into distinct entry points', () => {
    const text = getMessageText(server.call('provar.guide.orchestration', {}));
    // The pre-fix string was: "provar_testcase_generate OR provar_testcase_step_edit"
    // The post-fix split lists them on separate lines with distinct annotations.
    assert.ok(
      !text.includes('provar_testcase_generate OR provar_testcase_step_edit'),
      'prerequisite graph must not equate generate and step_edit — they have different purposes'
    );
    // Bounded regex tied to the exact annotation punctuation used in the prompt body —
    // "provar_testcase_generate (construct …" / "provar_testcase_step_edit (amend …".
    // Bounding the gap to ≤8 chars (i.e. the single " (" that should appear before the
    // annotation) avoids the loose-`[^\n]*` false-positive where unrelated tokens between
    // the two words on the same line would still match.
    assert.ok(
      /provar_testcase_generate\s*\(construct/i.test(text),
      'prerequisite graph must annotate provar_testcase_generate as the construct entry point'
    );
    assert.ok(
      /provar_testcase_step_edit\s*\(amend/i.test(text),
      'prerequisite graph must annotate provar_testcase_step_edit as the amend entry point'
    );
  });
});
