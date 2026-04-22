/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach } from 'mocha';
import {
  registerCrtMigrationPrompt,
  registerSeleniumMigrationPrompt,
  registerPlaywrightMigrationPrompt,
} from '../../../src/mcp/prompts/migrationPrompts.js';

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

// ── Helpers ────────────────────────────────────────────────────────────────────

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
  registerCrtMigrationPrompt(server as never);
  registerSeleniumMigrationPrompt(server as never);
  registerPlaywrightMigrationPrompt(server as never);
});

describe('migrationPrompts — registration', () => {
  it('registers provar.migrate.crt', () => {
    const reg = server.registrations.find((r) => r.name === 'provar.migrate.crt');
    assert.ok(reg, 'provar.migrate.crt should be registered');
    assert.ok(reg.description.includes('CRT'), 'description should mention CRT');
  });

  it('registers provar.migrate.selenium', () => {
    const reg = server.registrations.find((r) => r.name === 'provar.migrate.selenium');
    assert.ok(reg, 'provar.migrate.selenium should be registered');
    assert.ok(reg.description.includes('Selenium'), 'description should mention Selenium');
  });

  it('registers provar.migrate.playwright', () => {
    const reg = server.registrations.find((r) => r.name === 'provar.migrate.playwright');
    assert.ok(reg, 'provar.migrate.playwright should be registered');
    assert.ok(reg.description.includes('Playwright'), 'description should mention Playwright');
  });

  it('registers all 3 migration prompts', () => {
    assert.equal(server.registrations.length, 3);
  });
});

describe('migrationPrompts — provar.migrate.crt', () => {
  it('includes source content in message', () => {
    const result = server.call('provar.migrate.crt', { source: 'Step 1: ClickText Accounts' });
    const text = getMessageText(result);
    assert.ok(text.includes('Step 1: ClickText Accounts'), 'message should contain source content');
  });

  it('includes CRT context in message', () => {
    const result = server.call('provar.migrate.crt', { source: 'Step 1: ClickText Accounts' });
    const text = getMessageText(result);
    assert.ok(text.includes('ClickText'), 'message should include CRT keyword context');
  });

  it('includes workflow steps in message', () => {
    const result = server.call('provar.migrate.crt', { source: 'any source' });
    const text = getMessageText(result);
    assert.ok(text.includes('provar.qualityhub.examples.retrieve'), 'message should reference corpus retrieval tool');
    assert.ok(text.includes('provar.testcase.validate'), 'message should reference validator tool');
  });

  it('uses provided testName when present', () => {
    const result = server.call('provar.migrate.crt', { source: 'any source', testName: 'MyCustomTest' });
    const text = getMessageText(result);
    assert.ok(text.includes('MyCustomTest'), 'message should include provided testName');
  });

  it('falls back to inferred name when testName is omitted', () => {
    const result = server.call('provar.migrate.crt', { source: 'any source' });
    const text = getMessageText(result);
    assert.ok(text.includes('Infer the test case name'), 'message should instruct to infer name when testName omitted');
  });

  it('includes project path hint when projectPath provided', () => {
    const result = server.call('provar.migrate.crt', { source: 'any', projectPath: '/my/provar/project' });
    const text = getMessageText(result);
    assert.ok(text.includes('/my/provar/project'), 'message should include project path');
  });

  it('falls back to ask-user hint when projectPath is omitted', () => {
    const result = server.call('provar.migrate.crt', { source: 'any' });
    const text = getMessageText(result);
    assert.ok(text.includes('Ask the user'), 'message should prompt to ask user for project path');
  });
});

describe('migrationPrompts — provar.migrate.selenium', () => {
  it('includes source content in message', () => {
    const result = server.call('provar.migrate.selenium', { source: 'driver.get("https://example.com")' });
    const text = getMessageText(result);
    assert.ok(text.includes('driver.get'), 'message should contain source content');
  });

  it('includes Selenium context in message', () => {
    const result = server.call('provar.migrate.selenium', { source: 'any' });
    const text = getMessageText(result);
    assert.ok(text.includes('WebDriver'), 'message should include Selenium context');
  });

  it('includes workflow steps', () => {
    const result = server.call('provar.migrate.selenium', { source: 'any' });
    const text = getMessageText(result);
    assert.ok(text.includes('provar.qualityhub.examples.retrieve'), 'should reference corpus tool');
  });
});

describe('migrationPrompts — provar.migrate.playwright', () => {
  it('includes source content in message', () => {
    const result = server.call('provar.migrate.playwright', { source: 'await page.goto("https://example.com")' });
    const text = getMessageText(result);
    assert.ok(text.includes('page.goto'), 'message should contain source content');
  });

  it('includes Playwright context in message', () => {
    const result = server.call('provar.migrate.playwright', { source: 'any' });
    const text = getMessageText(result);
    assert.ok(text.includes('getByLabel'), 'message should include Playwright context');
  });
});
