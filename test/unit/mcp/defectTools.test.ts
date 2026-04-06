/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { strict as assert } from 'node:assert';
import sinon from 'sinon';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sfSpawnHelper } from '../../../src/mcp/tools/sfSpawn.js';
import { createDefectsForRun } from '../../../src/mcp/tools/defectTools.js';

// ── Minimal mock server ───────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => unknown;

class MockMcpServer {
  private handlers = new Map<string, ToolHandler>();

  public tool(name: string, _desc: string, _schema: unknown, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  public call(name: string, args: Record<string, unknown>): ReturnType<ToolHandler> {
    const h = this.handlers.get(name);
    if (!h) throw new Error(`Tool not registered: ${name}`);
    return h(args);
  }
}

// ── Spawn result builders ─────────────────────────────────────────────────────

type SpawnResult = { stdout: string; stderr: string; status: number | null; error: Error | undefined; pid: number | undefined; output: Array<Buffer | string | null>; signal: NodeJS.Signals | null };

function makeSpawnResult(stdout: string, status = 0): SpawnResult {
  return { stdout, stderr: '', status, error: undefined, pid: 1, output: [null, stdout, ''], signal: null };
}

function makeEnoentResult(): SpawnResult {
  const err = Object.assign(new Error('spawn sf ENOENT'), { code: 'ENOENT' });
  return { stdout: '', stderr: '', status: null, error: err, pid: undefined, output: [null, '', ''], signal: null };
}

function queryResult(records: object[], totalSize?: number): string {
  return JSON.stringify({
    status: 0,
    result: { totalSize: totalSize ?? records.length, records },
  });
}

function createResult(id: string): string {
  return JSON.stringify({
    status: 0,
    result: { id, success: true, errors: [] },
  });
}

function parseBody(result: unknown): Record<string, unknown> {
  const r = result as { content: Array<{ text: string }> };
  return JSON.parse(r.content[0].text) as Record<string, unknown>;
}

function isError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const JOB_ID = 'a0q000000000JOB';
const CYCLE_ID = 'a0r000000000CYC';
const EXEC_ID = 'a0s000000000EXC';
const TC_ID = 'a0t000000000TCS';
const STEP_EXEC_ID = 'a0u000000000STE';
const STEP_ID = 'a0v000000000STP';
const DEFECT_ID = 'a0w000000000DEF';
const TC_DEFECT_ID = 'a0x000000000TCD';
const EXEC_DEFECT_ID = 'a0y000000000EXD';
const RUN_ID = 'run-tracking-uuid-123';
const ORG = 'my-qh-org';

function makeHappyPathStub(stub: sinon.SinonStub): void {
  // Call 0: job query
  stub.onCall(0).returns(makeSpawnResult(queryResult([{ Id: JOB_ID }])));
  // Call 1: cycle query
  stub.onCall(1).returns(makeSpawnResult(queryResult([{
    Id: CYCLE_ID,
    provar__Web_Browser__c: 'Chrome',
    provar__Browser_Version__c: '120',
    provar__Environment_Text__c: 'Production',
  }])));
  // Call 2: failed executions query
  stub.onCall(2).returns(makeSpawnResult(queryResult([{
    Id: EXEC_ID,
    provar__Test_Case__c: TC_ID,
    provar__Tester__c: 'tester@example.com',
  }])));
  // Call 3: failed step query
  stub.onCall(3).returns(makeSpawnResult(queryResult([{
    Id: STEP_EXEC_ID,
    provar__Test_Step__c: STEP_ID,
    provar__ActionObs__c: 'Click Login button',
    provar__Actual_Result__c: 'Element not found',
    provar__Sequence_No__c: 3,
  }])));
  // Call 4: create Defect__c
  stub.onCall(4).returns(makeSpawnResult(createResult(DEFECT_ID)));
  // Call 5: create Test_Case_Defect__c
  stub.onCall(5).returns(makeSpawnResult(createResult(TC_DEFECT_ID)));
  // Call 6: create Test_Execution_Defect__c
  stub.onCall(6).returns(makeSpawnResult(createResult(EXEC_DEFECT_ID)));
}

// ── Tests: createDefectsForRun (unit) ─────────────────────────────────────────

describe('createDefectsForRun', () => {
  let stub: sinon.SinonStub;

  beforeEach(() => {
    stub = sinon.stub(sfSpawnHelper, 'spawnSync');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('creates one defect set per failed execution on happy path', () => {
    makeHappyPathStub(stub);
    const result = createDefectsForRun(RUN_ID, ORG);

    assert.equal(result.created.length, 1);
    assert.equal(result.skipped, 0);
    assert.ok(result.message.includes('Created 1 defect(s)'));

    const [item] = result.created;
    assert.equal(item.defectId, DEFECT_ID);
    assert.equal(item.tcDefectId, TC_DEFECT_ID);
    assert.equal(item.execDefectId, EXEC_DEFECT_ID);
    assert.equal(item.executionId, EXEC_ID);
    assert.equal(item.testCaseId, TC_ID);
  });

  it('includes Jira/ADO sync note in success message', () => {
    makeHappyPathStub(stub);
    const result = createDefectsForRun(RUN_ID, ORG);
    assert.ok(result.message.includes('Jira') || result.message.includes('ADO'));
  });

  it('returns empty result when no failed executions exist', () => {
    stub.onCall(0).returns(makeSpawnResult(queryResult([{ Id: JOB_ID }])));
    stub.onCall(1).returns(makeSpawnResult(queryResult([{
      Id: CYCLE_ID,
      provar__Web_Browser__c: 'Firefox',
      provar__Browser_Version__c: '121',
      provar__Environment_Text__c: 'Staging',
    }])));
    stub.onCall(2).returns(makeSpawnResult(queryResult([], 0)));

    const result = createDefectsForRun(RUN_ID, ORG);
    assert.equal(result.created.length, 0);
    assert.equal(result.skipped, 0);
    assert.ok(result.message.includes('No failed'));
  });

  it('throws when job not found by tracking ID', () => {
    stub.onCall(0).returns(makeSpawnResult(queryResult([], 0)));

    assert.throws(
      () => createDefectsForRun(RUN_ID, ORG),
      (err: Error) => err.message.includes(RUN_ID)
    );
  });

  it('throws when no Test_Cycle__c found for job', () => {
    stub.onCall(0).returns(makeSpawnResult(queryResult([{ Id: JOB_ID }])));
    stub.onCall(1).returns(makeSpawnResult(queryResult([], 0)));

    assert.throws(
      () => createDefectsForRun(RUN_ID, ORG),
      (err: Error) => err.message.includes(JOB_ID)
    );
  });

  it('filters executions by failedTestFilter substring', () => {
    // Two failed executions; filter keeps only the one matching TC_ID
    const OTHER_TC = 'a0t000000000OTH';
    stub.onCall(0).returns(makeSpawnResult(queryResult([{ Id: JOB_ID }])));
    stub.onCall(1).returns(makeSpawnResult(queryResult([{
      Id: CYCLE_ID,
      provar__Web_Browser__c: 'Chrome',
      provar__Browser_Version__c: '120',
      provar__Environment_Text__c: 'Production',
    }])));
    stub.onCall(2).returns(makeSpawnResult(queryResult([
      { Id: EXEC_ID, provar__Test_Case__c: TC_ID, provar__Tester__c: 'tester@example.com' },
      { Id: 'a0s000000000EX2', provar__Test_Case__c: OTHER_TC, provar__Tester__c: 'tester@example.com' },
    ])));
    // step query for the one kept execution
    stub.onCall(3).returns(makeSpawnResult(queryResult([{
      Id: STEP_EXEC_ID,
      provar__Test_Step__c: STEP_ID,
      provar__ActionObs__c: 'Click',
      provar__Actual_Result__c: 'Failed',
      provar__Sequence_No__c: 1,
    }])));
    stub.onCall(4).returns(makeSpawnResult(createResult(DEFECT_ID)));
    stub.onCall(5).returns(makeSpawnResult(createResult(TC_DEFECT_ID)));
    stub.onCall(6).returns(makeSpawnResult(createResult(EXEC_DEFECT_ID)));

    const result = createDefectsForRun(RUN_ID, ORG, [TC_ID]);
    assert.equal(result.created.length, 1);
    assert.equal(result.skipped, 1);
    assert.equal(result.created[0].testCaseId, TC_ID);
  });

  it('handles missing step gracefully (no step found for execution)', () => {
    stub.onCall(0).returns(makeSpawnResult(queryResult([{ Id: JOB_ID }])));
    stub.onCall(1).returns(makeSpawnResult(queryResult([{
      Id: CYCLE_ID,
      provar__Web_Browser__c: 'Safari',
      provar__Browser_Version__c: '17',
      provar__Environment_Text__c: 'UAT',
    }])));
    stub.onCall(2).returns(makeSpawnResult(queryResult([{
      Id: EXEC_ID,
      provar__Test_Case__c: TC_ID,
      provar__Tester__c: '',
    }])));
    stub.onCall(3).returns(makeSpawnResult(queryResult([], 0))); // no steps
    stub.onCall(4).returns(makeSpawnResult(createResult(DEFECT_ID)));
    stub.onCall(5).returns(makeSpawnResult(createResult(TC_DEFECT_ID)));
    stub.onCall(6).returns(makeSpawnResult(createResult(EXEC_DEFECT_ID)));

    const result = createDefectsForRun(RUN_ID, ORG);
    assert.equal(result.created.length, 1);
    assert.equal(result.created[0].defectId, DEFECT_ID);
  });

  it('throws SfNotFoundError (SF_NOT_FOUND) when sf is not in PATH', () => {
    stub.returns(makeEnoentResult());

    assert.throws(
      () => createDefectsForRun(RUN_ID, ORG),
      (err: Error & { code?: string }) => err.code === 'SF_NOT_FOUND'
    );
  });

  it('passes --target-org to every sf invocation', () => {
    makeHappyPathStub(stub);
    createDefectsForRun(RUN_ID, ORG);

    for (let i = 0; i <= 6; i++) {
      const args = stub.getCall(i).args[1] as string[];
      assert.ok(args.includes(ORG), `Call ${i} should include org alias`);
    }
  });
});

// ── Tests: MCP tool registration ──────────────────────────────────────────────

describe('provar.qualityhub.defect.create (MCP tool)', () => {
  let server: MockMcpServer;
  let stub: sinon.SinonStub;

  beforeEach(async () => {
    server = new MockMcpServer();
    stub = sinon.stub(sfSpawnHelper, 'spawnSync');
    const { registerAllDefectTools } = await import('../../../src/mcp/tools/defectTools.js');
    registerAllDefectTools(server as unknown as McpServer);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('returns structured content with created defects on success', () => {
    makeHappyPathStub(stub);
    const result = server.call('provar.qualityhub.defect.create', {
      run_id: RUN_ID,
      target_org: ORG,
    });
    const body = parseBody(result);
    assert.equal(body.skipped, 0);
    const created = body.created as Array<Record<string, string>>;
    assert.equal(created.length, 1);
    assert.equal(created[0].defectId, DEFECT_ID);
  });

  it('returns isError with DEFECT_CREATE_FAILED on job-not-found error', () => {
    stub.onCall(0).returns(makeSpawnResult(queryResult([], 0)));
    const result = server.call('provar.qualityhub.defect.create', {
      run_id: RUN_ID,
      target_org: ORG,
    });
    assert.ok(isError(result));
    const body = parseBody(result);
    assert.equal(body.error_code, 'DEFECT_CREATE_FAILED');
  });

  it('returns isError with SF_NOT_FOUND when sf CLI is missing', () => {
    stub.returns(makeEnoentResult());
    const result = server.call('provar.qualityhub.defect.create', {
      run_id: RUN_ID,
      target_org: ORG,
    });
    assert.ok(isError(result));
    const body = parseBody(result);
    assert.equal(body.error_code, 'SF_NOT_FOUND');
  });

  it('passes failed_tests filter through to createDefectsForRun', () => {
    // Return empty executions - filtered out
    stub.onCall(0).returns(makeSpawnResult(queryResult([{ Id: JOB_ID }])));
    stub.onCall(1).returns(makeSpawnResult(queryResult([{
      Id: CYCLE_ID,
      provar__Web_Browser__c: 'Edge',
      provar__Browser_Version__c: '120',
      provar__Environment_Text__c: 'Dev',
    }])));
    stub.onCall(2).returns(makeSpawnResult(queryResult([{
      Id: EXEC_ID,
      provar__Test_Case__c: TC_ID,
      provar__Tester__c: 'qa@example.com',
    }])));

    const result = server.call('provar.qualityhub.defect.create', {
      run_id: RUN_ID,
      target_org: ORG,
      failed_tests: ['no-match'],
    });
    const body = parseBody(result);
    const created = body.created as unknown[];
    assert.equal(created.length, 0);
    assert.equal(body.skipped, 1);
  });
});
