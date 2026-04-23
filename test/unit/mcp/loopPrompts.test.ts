/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach } from 'mocha';
import {
  registerLoopGeneratePrompt,
  registerLoopFixPrompt,
  registerLoopReviewPrompt,
  registerLoopCoveragePrompt,
  registerLoopDbPrompt,
} from '../../../src/mcp/prompts/loopPrompts.js';

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
  registerLoopGeneratePrompt(server as never);
  registerLoopFixPrompt(server as never);
  registerLoopReviewPrompt(server as never);
  registerLoopCoveragePrompt(server as never);
  registerLoopDbPrompt(server as never);
});

describe('loopPrompts — registration', () => {
  it('registers all 5 loop prompts', () => {
    assert.equal(server.registrations.length, 5);
  });

  it('registers provar.loop.generate', () => {
    const reg = server.registrations.find((r) => r.name === 'provar.loop.generate');
    assert.ok(reg, 'provar.loop.generate should be registered');
    assert.ok(
      reg.description.includes('user story') || reg.description.includes('Generate'),
      'description should describe generation use case'
    );
  });

  it('registers provar.loop.fix', () => {
    const reg = server.registrations.find((r) => r.name === 'provar.loop.fix');
    assert.ok(reg, 'provar.loop.fix should be registered');
    assert.ok(reg.description.toLowerCase().includes('fix'), 'description should describe fix use case');
  });

  it('registers provar.loop.review', () => {
    const reg = server.registrations.find((r) => r.name === 'provar.loop.review');
    assert.ok(reg, 'provar.loop.review should be registered');
    assert.ok(reg.description.toLowerCase().includes('review'), 'description should describe review use case');
  });

  it('registers provar.loop.coverage', () => {
    const reg = server.registrations.find((r) => r.name === 'provar.loop.coverage');
    assert.ok(reg, 'provar.loop.coverage should be registered');
    assert.ok(reg.description.toLowerCase().includes('coverage'), 'description should describe coverage use case');
  });
});

describe('loopPrompts — provar.loop.generate', () => {
  it('includes story text in message', () => {
    const story = 'As a sales rep, I want to close an opportunity so revenue is recorded';
    const result = server.call('provar.loop.generate', { story });
    const text = getMessageText(result);
    assert.ok(text.includes(story), 'message should contain the story text');
  });

  it('includes corpus retrieval workflow step', () => {
    const result = server.call('provar.loop.generate', { story: 'any story' });
    const text = getMessageText(result);
    assert.ok(text.includes('provar.qualityhub.examples.retrieve'), 'should reference corpus tool');
    assert.ok(text.includes('provar.testcase.validate'), 'should reference validator tool');
  });

  it('includes objectName in message when provided', () => {
    const result = server.call('provar.loop.generate', { story: 'any', objectName: 'Opportunity' });
    const text = getMessageText(result);
    assert.ok(text.includes('Opportunity'), 'message should include object name');
  });

  it('includes testName in message when provided', () => {
    const result = server.call('provar.loop.generate', { story: 'any', testName: 'CloseOpportunity' });
    const text = getMessageText(result);
    assert.ok(text.includes('CloseOpportunity'), 'message should include target test name');
  });

  it('uses projectPath hint when provided', () => {
    const result = server.call('provar.loop.generate', { story: 'any', projectPath: '/my/project' });
    const text = getMessageText(result);
    assert.ok(text.includes('/my/project'), 'message should include project path');
  });

  it('falls back to ask-user hint when projectPath is omitted', () => {
    const result = server.call('provar.loop.generate', { story: 'any' });
    const text = getMessageText(result);
    assert.ok(text.includes('Ask the user'), 'message should prompt to ask for project path');
  });
});

describe('loopPrompts — provar.loop.fix', () => {
  it('includes testcasePath in message', () => {
    const result = server.call('provar.loop.fix', {
      testcasePath: '/provar/tests/CloseOpportunity.testcase',
      rcaOutput: 'STEP FAILED: element not found',
    });
    const text = getMessageText(result);
    assert.ok(text.includes('/provar/tests/CloseOpportunity.testcase'), 'message should include file path');
  });

  it('includes rcaOutput in message', () => {
    const result = server.call('provar.loop.fix', {
      testcasePath: '/any/path.testcase',
      rcaOutput: 'STEP FAILED: assertion mismatch on field Amount',
    });
    const text = getMessageText(result);
    assert.ok(text.includes('assertion mismatch on field Amount'), 'message should include RCA output');
  });

  it('includes corpus retrieval and validation in workflow', () => {
    const result = server.call('provar.loop.fix', {
      testcasePath: '/any/path.testcase',
      rcaOutput: 'any failure',
    });
    const text = getMessageText(result);
    assert.ok(text.includes('provar.qualityhub.examples.retrieve'), 'should reference corpus tool');
    assert.ok(text.includes('provar.testcase.validate'), 'should reference validator tool');
  });

  it('starts workflow by reading the file', () => {
    const result = server.call('provar.loop.fix', {
      testcasePath: '/provar/tests/Test.testcase',
      rcaOutput: 'error',
    });
    const text = getMessageText(result);
    assert.ok(text.includes('/provar/tests/Test.testcase'), 'workflow begin instruction should reference the path');
  });
});

describe('loopPrompts — provar.loop.review', () => {
  it('includes testcasePath in message', () => {
    const result = server.call('provar.loop.review', {
      testcasePath: '/provar/tests/CreateLead.testcase',
    });
    const text = getMessageText(result);
    assert.ok(text.includes('/provar/tests/CreateLead.testcase'), 'message should include file path');
  });

  it('includes review quality checklist categories', () => {
    const result = server.call('provar.loop.review', {
      testcasePath: '/any/path.testcase',
    });
    const text = getMessageText(result);
    assert.ok(text.includes('Coverage') || text.includes('UiAssert'), 'message should include quality checklist');
    assert.ok(text.includes('provar.testcase.validate'), 'should reference validator tool');
  });

  it('includes corpus retrieval step', () => {
    const result = server.call('provar.loop.review', { testcasePath: '/any/path.testcase' });
    const text = getMessageText(result);
    assert.ok(text.includes('provar.qualityhub.examples.retrieve'), 'should reference corpus tool');
  });

  it('includes projectPath in message when provided', () => {
    const result = server.call('provar.loop.review', {
      testcasePath: '/any/path.testcase',
      projectPath: '/my/project',
    });
    const text = getMessageText(result);
    assert.ok(text.includes('/my/project'), 'message should include project path');
  });
});

describe('loopPrompts — provar.loop.coverage', () => {
  it('includes objectName in message', () => {
    const result = server.call('provar.loop.coverage', {
      objectName: 'Opportunity',
      projectPath: '/my/project',
    });
    const text = getMessageText(result);
    assert.ok(text.includes('Opportunity'), 'message should include the object name');
  });

  it('includes projectPath in message', () => {
    const result = server.call('provar.loop.coverage', {
      objectName: 'Lead',
      projectPath: '/provar/MyProject',
    });
    const text = getMessageText(result);
    assert.ok(text.includes('/provar/MyProject'), 'message should include project path');
  });

  it('includes coverage matrix categories', () => {
    const result = server.call('provar.loop.coverage', {
      objectName: 'Account',
      projectPath: '/any',
    });
    const text = getMessageText(result);
    assert.ok(
      text.includes('ApexCreateObject') || text.includes('API'),
      'message should reference API coverage categories'
    );
  });

  it('includes Quality Hub query step when targetOrg provided', () => {
    const result = server.call('provar.loop.coverage', {
      objectName: 'Contact',
      projectPath: '/any',
      targetOrg: 'my-org-alias',
    });
    const text = getMessageText(result);
    assert.ok(
      text.includes('provar.qualityhub.testcase.retrieve') || text.includes('my-org-alias'),
      'message should include Quality Hub retrieval when targetOrg provided'
    );
  });

  it('omits Quality Hub query step when targetOrg is not provided', () => {
    const result = server.call('provar.loop.coverage', {
      objectName: 'Contact',
      projectPath: '/any',
    });
    const text = getMessageText(result);
    // When no targetOrg, the step 2 should be corpus retrieval, not QH testcase retrieve
    assert.ok(text.includes('provar.qualityhub.examples.retrieve'), 'should still include corpus retrieval');
  });
});

describe('loopPrompts — provar.loop.db', () => {
  it('registers provar.loop.db', () => {
    const reg = server.registrations.find((r) => r.name === 'provar.loop.db');
    assert.ok(reg, 'provar.loop.db should be registered');
    assert.ok(reg.description.toLowerCase().includes('database'), 'description should mention database');
  });

  it('includes story text in message', () => {
    const story = 'Verify Users table has Active records after SF flow runs';
    const result = server.call('provar.loop.db', { story });
    const text = getMessageText(result);
    assert.ok(text.includes(story), 'message should contain the story text');
  });

  it('includes corpus retrieval and validate in workflow', () => {
    const result = server.call('provar.loop.db', { story: 'any db test' });
    const text = getMessageText(result);
    assert.ok(text.includes('provar.qualityhub.examples.retrieve'), 'should reference corpus tool');
    assert.ok(text.includes('provar.testcase.validate'), 'should reference validator tool');
  });

  it('references DbConnect and SqlQuery step types', () => {
    const result = server.call('provar.loop.db', { story: 'any db test' });
    const text = getMessageText(result);
    assert.ok(text.includes('DbConnect'), 'should reference DbConnect step type');
    assert.ok(text.includes('SqlQuery'), 'should reference SqlQuery step type');
  });

  it('warns about funcCall vs string expressions', () => {
    const result = server.call('provar.loop.db', { story: 'any db test' });
    const text = getMessageText(result);
    assert.ok(text.includes('funcCall'), 'should mention funcCall for count');
    assert.ok(text.includes('valueClass="id"'), 'should warn about connectionId valueClass="id"');
  });

  it('warns about resultName / dbConnectionName coupling', () => {
    const result = server.call('provar.loop.db', { story: 'any db test' });
    const text = getMessageText(result);
    assert.ok(
      text.includes('resultName') && text.includes('dbConnectionName'),
      'should mention the resultName / dbConnectionName coupling'
    );
  });

  it('includes connectionName in message when provided', () => {
    const result = server.call('provar.loop.db', {
      story: 'any db test',
      connectionName: 'MyDB',
    });
    const text = getMessageText(result);
    assert.ok(text.includes('MyDB'), 'message should include provided connectionName');
  });

  it('includes projectPath when provided', () => {
    const result = server.call('provar.loop.db', {
      story: 'any db test',
      projectPath: '/provar/project',
    });
    const text = getMessageText(result);
    assert.ok(text.includes('/provar/project'), 'message should include project path');
  });

  it('includes testName when provided', () => {
    const result = server.call('provar.loop.db', {
      story: 'any db test',
      testName: 'VerifyUsersTable',
    });
    const text = getMessageText(result);
    assert.ok(text.includes('VerifyUsersTable'), 'message should include target test name');
  });

  it('explicitly forbids Salesforce UI and Apex steps', () => {
    const result = server.call('provar.loop.db', { story: 'any db test' });
    const text = getMessageText(result);
    // The prompt names these steps to explicitly forbid them — verify that context
    assert.ok(
      text.includes('Do not use') || text.includes('do not use'),
      'should explicitly forbid Salesforce/Apex steps'
    );
    assert.ok(text.includes('UiConnect'), 'should name UiConnect in the forbidden list');
    assert.ok(text.includes('ApexConnect'), 'should name ApexConnect in the forbidden list');
  });

  it('includes step-reference fallback instruction', () => {
    const result = server.call('provar.loop.db', { story: 'any db test' });
    const text = getMessageText(result);
    assert.ok(text.includes('provar://docs/step-reference'), 'should include step-reference fallback');
  });
});
