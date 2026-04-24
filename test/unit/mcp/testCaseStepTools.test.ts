/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { registerAllTestCaseStepTools } from '../../../src/mcp/tools/testCaseStepTools.js';

// ── Mock MCP server ────────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseText(result: unknown): Record<string, unknown> {
  const r = result as { content: Array<{ type: string; text: string }> };
  return JSON.parse(r.content[0].text) as Record<string, unknown>;
}

function isError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true;
}

// ── Fixture XML ────────────────────────────────────────────────────────────────

const VALID_TESTCASE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="1" guid="550e8400-e29b-41d4-a716-446655440000" name="SmokeTest">
  <steps>
    <apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiConnect" testItemId="1" guid="550e8400-e29b-41d4-a716-446655440001" name="Connect"/>
    <apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction" testItemId="2" guid="550e8400-e29b-41d4-a716-446655440002" name="Click Save"/>
    <apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction" testItemId="3" guid="550e8400-e29b-41d4-a716-446655440003" name="Click Cancel"/>
  </steps>
</testCase>`;

const NEW_STEP_XML =
  '<apiCall apiId="com.provar.plugins.bundled.apis.control.Sleep" testItemId="99" guid="550e8400-e29b-41d4-a716-446655440099" name="Wait"/>';

// ── Test setup ─────────────────────────────────────────────────────────────────

let tmpDir: string;
let server: MockMcpServer;
let tcPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steptools-test-'));
  server = new MockMcpServer();
  registerAllTestCaseStepTools(server as never, { allowedPaths: [] });
  tcPath = path.join(tmpDir, 'SmokeTest.testcase');
  fs.writeFileSync(tcPath, VALID_TESTCASE_XML, 'utf-8');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── provar.testcase.step.edit ──────────────────────────────────────────────────

describe('provar.testcase.step.edit', () => {
  // remove happy path
  it('mode=remove removes the target step and leaves file valid', () => {
    const result = server.call('provar.testcase.step.edit', {
      test_case_path: tcPath,
      mode: 'remove',
      test_item_id: '2',
      validate_after_edit: false,
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.equal(body['success'], true);
    assert.equal(body['mode'], 'remove');
    assert.equal(body['test_item_id'], '2');

    const written = fs.readFileSync(tcPath, 'utf-8');
    assert.ok(!written.includes('testItemId="2"'), 'step 2 should be removed');
    assert.ok(written.includes('testItemId="1"'), 'step 1 should remain');
    assert.ok(written.includes('testItemId="3"'), 'step 3 should remain');
    assert.ok(!fs.existsSync(tcPath + '.bak'), 'backup file should be deleted on success');
  });

  // add happy path — after anchor
  it('mode=add inserts new step after anchor by default', () => {
    const result = server.call('provar.testcase.step.edit', {
      test_case_path: tcPath,
      mode: 'add',
      test_item_id: '1',
      step_xml: NEW_STEP_XML,
      validate_after_edit: false,
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.equal(body['success'], true);
    assert.equal(body['mode'], 'add');

    const written = fs.readFileSync(tcPath, 'utf-8');
    assert.ok(written.includes('testItemId="99"'), 'new step should be present');
    // Verify order: step 1 before step 99
    const pos1 = written.indexOf('testItemId="1"');
    const pos99 = written.indexOf('testItemId="99"');
    const pos2 = written.indexOf('testItemId="2"');
    assert.ok(pos1 < pos99, 'anchor step 1 should appear before new step 99');
    assert.ok(pos99 < pos2, 'new step 99 should appear before step 2');
    assert.ok(!fs.existsSync(tcPath + '.bak'), 'backup file should be deleted on success');
  });

  // add before anchor
  it('mode=add with position=before inserts before anchor', () => {
    const result = server.call('provar.testcase.step.edit', {
      test_case_path: tcPath,
      mode: 'add',
      test_item_id: '2',
      position: 'before',
      step_xml: NEW_STEP_XML,
      validate_after_edit: false,
    });

    assert.equal(isError(result), false);
    const written = fs.readFileSync(tcPath, 'utf-8');
    const pos99 = written.indexOf('testItemId="99"');
    const pos2 = written.indexOf('testItemId="2"');
    assert.ok(pos99 < pos2, 'new step should appear before anchor step 2');
  });

  // STEP_NOT_FOUND — remove
  it('mode=remove returns STEP_NOT_FOUND with all IDs when testItemId missing', () => {
    const result = server.call('provar.testcase.step.edit', {
      test_case_path: tcPath,
      mode: 'remove',
      test_item_id: '999',
    });

    assert.equal(isError(result), true);
    const body = parseText(result);
    assert.equal(body['error_code'], 'STEP_NOT_FOUND');
    const details = body['details'] as Record<string, unknown>;
    const allIds = details['all_test_item_ids'] as string[];
    assert.ok(Array.isArray(allIds), 'details.all_test_item_ids should be an array');
    assert.ok(allIds.includes('1'), 'should list testItemId 1');
    assert.ok(allIds.includes('2'), 'should list testItemId 2');
    assert.ok(allIds.includes('3'), 'should list testItemId 3');
    // File should be unchanged
    const written = fs.readFileSync(tcPath, 'utf-8');
    assert.equal(written, VALID_TESTCASE_XML);
  });

  // STEP_NOT_FOUND — add
  it('mode=add returns STEP_NOT_FOUND with all IDs when anchor missing', () => {
    const result = server.call('provar.testcase.step.edit', {
      test_case_path: tcPath,
      mode: 'add',
      test_item_id: '999',
      step_xml: NEW_STEP_XML,
    });

    assert.equal(isError(result), true);
    const body = parseText(result);
    assert.equal(body['error_code'], 'STEP_NOT_FOUND');
  });

  // INVALID_STEP_XML — step_xml contains no <apiCall> element
  it('mode=add returns INVALID_STEP_XML when step_xml contains no <apiCall> element', () => {
    const result = server.call('provar.testcase.step.edit', {
      test_case_path: tcPath,
      mode: 'add',
      test_item_id: '1',
      step_xml: '<notAnApiCall apiId="test" testItemId="99" guid="x" name="x"/>',
    });

    assert.equal(isError(result), true);
    const body = parseText(result);
    assert.equal(body['error_code'], 'INVALID_STEP_XML');
    // File must be untouched (no backup written)
    assert.ok(!fs.existsSync(tcPath + '.bak'), 'no backup should be written for pre-mutation errors');
    const written = fs.readFileSync(tcPath, 'utf-8');
    assert.equal(written, VALID_TESTCASE_XML);
  });

  // INVALID_STEP_XML — step_xml contains multiple <apiCall> elements
  it('mode=add returns INVALID_STEP_XML when step_xml contains multiple <apiCall> elements', () => {
    const multiStep =
      '<apiCall apiId="a" testItemId="10" guid="550e8400-e29b-41d4-a716-446655440010" name="A"/>' +
      '<apiCall apiId="b" testItemId="11" guid="550e8400-e29b-41d4-a716-446655440011" name="B"/>';

    const result = server.call('provar.testcase.step.edit', {
      test_case_path: tcPath,
      mode: 'add',
      test_item_id: '1',
      step_xml: multiStep,
    });

    assert.equal(isError(result), true);
    const body = parseText(result);
    assert.equal(body['error_code'], 'INVALID_STEP_XML');
    assert.ok(!fs.existsSync(tcPath + '.bak'), 'no backup should be written for pre-mutation errors');
  });

  // mode=add with missing step_xml
  it('mode=add returns MISSING_INPUT when step_xml is absent', () => {
    const result = server.call('provar.testcase.step.edit', {
      test_case_path: tcPath,
      mode: 'add',
      test_item_id: '1',
    });

    assert.equal(isError(result), true);
    const body = parseText(result);
    assert.equal(body['error_code'], 'MISSING_INPUT');
  });

  // Backup restored when validation fails after mutation
  it('restores backup and returns INVALID_XML_AFTER_EDIT when mutated file fails validation', () => {
    // Write a test case where removing the only step will leave <steps/> empty,
    // but the XML itself is still structurally valid. We need a case where
    // validate_after_edit=true fires and the result is invalid.
    // The simplest trigger: create a test case where removing all 3 steps produces
    // an empty <steps> element — validateTestCase passes this since it only checks presence.
    // Instead, we test with an intentionally broken step_xml that results in an invalid
    // testCase XML (step with non-UUID guid).
    const brokenStepXml =
      '<apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction" testItemId="99" guid="not-a-valid-uuid" name="Broken"/>';

    const result = server.call('provar.testcase.step.edit', {
      test_case_path: tcPath,
      mode: 'add',
      test_item_id: '1',
      step_xml: brokenStepXml,
      validate_after_edit: true,
    });

    assert.equal(isError(result), true);
    const body = parseText(result);
    assert.equal(body['error_code'], 'INVALID_XML_AFTER_EDIT');

    // Original file should be restored
    const written = fs.readFileSync(tcPath, 'utf-8');
    assert.ok(!written.includes('testItemId="99"'), 'broken step should not be in restored file');
    assert.ok(!fs.existsSync(tcPath + '.bak'), 'backup should be deleted after restore');
  });

  // Path policy: path outside allowed paths is rejected
  it('rejects test_case_path outside allowed paths', () => {
    const restrictedServer = new MockMcpServer();
    registerAllTestCaseStepTools(restrictedServer as never, { allowedPaths: [path.join(tmpDir, 'allowed')] });
    fs.mkdirSync(path.join(tmpDir, 'allowed'), { recursive: true });

    const result = restrictedServer.call('provar.testcase.step.edit', {
      test_case_path: tcPath, // tcPath is in tmpDir root, not in allowed subdir
      mode: 'remove',
      test_item_id: '1',
    });

    assert.equal(isError(result), true);
    const body = parseText(result);
    assert.ok(
      body['error_code'] === 'PATH_NOT_ALLOWED' || body['error_code'] === 'PATH_TRAVERSAL',
      `expected path policy error, got: ${String(body['error_code'])}`
    );
  });

  // validate_after_edit=true with valid result includes validation in response
  it('returns validation result in response when validate_after_edit=true and edit is valid', () => {
    const result = server.call('provar.testcase.step.edit', {
      test_case_path: tcPath,
      mode: 'remove',
      test_item_id: '2',
      validate_after_edit: true,
    });

    assert.equal(isError(result), false);
    const body = parseText(result);
    assert.equal(body['success'], true);
    // The fixture XML has a valid structure so validation should pass
    const validation = body['validation'] as Record<string, unknown> | undefined;
    assert.ok(validation !== undefined, 'validation field should be present');
  });

  // FILE_NOT_FOUND
  it('returns FILE_NOT_FOUND when test case does not exist', () => {
    const missing = path.join(tmpDir, 'nonexistent.testcase');
    const result = server.call('provar.testcase.step.edit', {
      test_case_path: missing,
      mode: 'remove',
      test_item_id: '1',
    });

    assert.equal(isError(result), true);
    const body = parseText(result);
    assert.equal(body['error_code'], 'FILE_NOT_FOUND');
  });
});
