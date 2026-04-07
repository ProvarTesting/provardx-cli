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
import { registerAllTestPlanTools } from '../../../src/mcp/tools/testPlanTools.js';
import type { ServerConfig } from '../../../src/mcp/server.js';

// ── Minimal McpServer mock ─────────────────────────────────────────────────────
// Note: bypasses Zod parsing — always pass explicit values for fields with defaults.

type ToolHandler = (args: Record<string, unknown>) => unknown;

class MockMcpServer {
  private handlers = new Map<string, ToolHandler>();

  public tool(name: string, _description: string, _schema: unknown, handler: ToolHandler): void {
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

function errorCode(result: unknown): string {
  return parseText(result)['error_code'] as string;
}

// ── Fixture helpers ────────────────────────────────────────────────────────────

/** Create a minimal Provar project structure in the given directory. */
function makeProject(root: string): void {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'MyProject.testproject'), '', 'utf-8');
}

/** Write a minimal .testcase file with a registryId attribute. */
function makeTestCase(filePath: string, registryId = 'test-case-uuid-1234'): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<testCase registryId="${registryId}"/>\n`,
    'utf-8'
  );
}

/** Write a minimal .planitem file and create the plan directory structure. */
function makePlan(root: string, planName: string): void {
  const planDir = path.join(root, 'plans', planName);
  fs.mkdirSync(planDir, { recursive: true });
  fs.writeFileSync(
    path.join(planDir, '.planitem'),
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<testPlan guid="plan-guid-1234">\n  <planSettings/>\n  <planFeatures/>\n</testPlan>\n',
    'utf-8'
  );
}

// ── Test setup ─────────────────────────────────────────────────────────────────

let tmpDir: string;
let projectDir: string;
let server: MockMcpServer;
let config: ServerConfig;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testplantools-test-'));
  projectDir = path.join(tmpDir, 'MyProject');
  server = new MockMcpServer();
  config = { allowedPaths: [tmpDir] };
  registerAllTestPlanTools(server as never, config);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── provar.testplan.add-instance ───────────────────────────────────────────────

describe('provar.testplan.add-instance', () => {
  describe('happy path', () => {
    it('writes a .testinstance file and returns expected fields', () => {
      makeProject(projectDir);
      makeTestCase(path.join(projectDir, 'tests', 'MyTest.testcase'));
      makePlan(projectDir, 'MyPlan');
      // Add the suite dir
      const suiteDir = path.join(projectDir, 'plans', 'MyPlan', 'MySuite');
      fs.mkdirSync(suiteDir, { recursive: true });
      // Create .planitem in suite dir too (not strictly required by the tool, but realistic)
      fs.writeFileSync(path.join(suiteDir, '.planitem'), '<testPlan guid="suite-guid"/>', 'utf-8');

      const result = server.call('provar.testplan.add-instance', {
        project_path: projectDir,
        test_case_path: 'tests/MyTest.testcase',
        plan_name: 'MyPlan',
        suite_path: 'MySuite',
        overwrite: false,
        dry_run: false,
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.equal(body['written'], true);
      assert.equal(body['dry_run'], false);
      assert.equal(body['test_case_path'], 'tests/MyTest.testcase');
      assert.ok(typeof body['guid'] === 'string' && body['guid'].length > 0);
      assert.equal(body['test_case_id'], 'test-case-uuid-1234');

      const instanceFile = path.join(suiteDir, 'MyTest.testinstance');
      assert.ok(fs.existsSync(instanceFile), '.testinstance file should be written');
    });

    it('writes .testinstance at plan root when no suite_path given', () => {
      makeProject(projectDir);
      makeTestCase(path.join(projectDir, 'tests', 'Root.testcase'));
      makePlan(projectDir, 'MyPlan');

      const result = server.call('provar.testplan.add-instance', {
        project_path: projectDir,
        test_case_path: 'tests/Root.testcase',
        plan_name: 'MyPlan',
        overwrite: false,
        dry_run: false,
      });

      assert.equal(isError(result), false);
      const instanceFile = path.join(projectDir, 'plans', 'MyPlan', 'Root.testinstance');
      assert.ok(fs.existsSync(instanceFile), '.testinstance file should be at plan root');
    });
  });

  describe('dry_run', () => {
    it('returns written=false and does not create a file', () => {
      makeProject(projectDir);
      makeTestCase(path.join(projectDir, 'tests', 'MyTest.testcase'));
      makePlan(projectDir, 'MyPlan');

      const result = server.call('provar.testplan.add-instance', {
        project_path: projectDir,
        test_case_path: 'tests/MyTest.testcase',
        plan_name: 'MyPlan',
        overwrite: false,
        dry_run: true,
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.equal(body['written'], false);
      assert.equal(body['dry_run'], true);

      const instanceFile = path.join(projectDir, 'plans', 'MyPlan', 'MyTest.testinstance');
      assert.equal(fs.existsSync(instanceFile), false, 'File must not be written in dry_run mode');
    });
  });

  describe('error cases', () => {
    it('returns NOT_A_PROJECT when .testproject is missing', () => {
      fs.mkdirSync(projectDir, { recursive: true });
      // No .testproject written

      const result = server.call('provar.testplan.add-instance', {
        project_path: projectDir,
        test_case_path: 'tests/MyTest.testcase',
        plan_name: 'MyPlan',
        overwrite: false,
        dry_run: false,
      });

      assert.equal(isError(result), true);
      assert.equal(errorCode(result), 'NOT_A_PROJECT');
    });

    it('returns FILE_NOT_FOUND when testcase does not exist', () => {
      makeProject(projectDir);
      makePlan(projectDir, 'MyPlan');
      // No testcase file created

      const result = server.call('provar.testplan.add-instance', {
        project_path: projectDir,
        test_case_path: 'tests/Missing.testcase',
        plan_name: 'MyPlan',
        overwrite: false,
        dry_run: false,
      });

      assert.equal(isError(result), true);
      assert.equal(errorCode(result), 'FILE_NOT_FOUND');
    });

    it('returns INVALID_PATH when test_case_path does not end with .testcase', () => {
      makeProject(projectDir);
      // Create the file but with wrong extension
      fs.mkdirSync(path.join(projectDir, 'tests'), { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'tests', 'MyTest.txt'), 'content', 'utf-8');

      const result = server.call('provar.testplan.add-instance', {
        project_path: projectDir,
        test_case_path: 'tests/MyTest.txt',
        plan_name: 'MyPlan',
        overwrite: false,
        dry_run: false,
      });

      assert.equal(isError(result), true);
      assert.equal(errorCode(result), 'INVALID_PATH');
    });

    it('returns DIR_NOT_FOUND when suite directory does not exist', () => {
      makeProject(projectDir);
      makeTestCase(path.join(projectDir, 'tests', 'MyTest.testcase'));
      makePlan(projectDir, 'MyPlan');
      // Do NOT create the suite dir

      const result = server.call('provar.testplan.add-instance', {
        project_path: projectDir,
        test_case_path: 'tests/MyTest.testcase',
        plan_name: 'MyPlan',
        suite_path: 'NonExistentSuite',
        overwrite: false,
        dry_run: false,
      });

      assert.equal(isError(result), true);
      assert.equal(errorCode(result), 'DIR_NOT_FOUND');
    });

    it('returns FILE_EXISTS when instance already exists and overwrite=false', () => {
      makeProject(projectDir);
      makeTestCase(path.join(projectDir, 'tests', 'MyTest.testcase'));
      makePlan(projectDir, 'MyPlan');
      // Pre-create the instance file
      fs.writeFileSync(path.join(projectDir, 'plans', 'MyPlan', 'MyTest.testinstance'), 'old', 'utf-8');

      const result = server.call('provar.testplan.add-instance', {
        project_path: projectDir,
        test_case_path: 'tests/MyTest.testcase',
        plan_name: 'MyPlan',
        overwrite: false,
        dry_run: false,
      });

      assert.equal(isError(result), true);
      assert.equal(errorCode(result), 'FILE_EXISTS');
    });

    it('overwrites when overwrite=true and file already exists', () => {
      makeProject(projectDir);
      makeTestCase(path.join(projectDir, 'tests', 'MyTest.testcase'));
      makePlan(projectDir, 'MyPlan');
      fs.writeFileSync(path.join(projectDir, 'plans', 'MyPlan', 'MyTest.testinstance'), 'old', 'utf-8');

      const result = server.call('provar.testplan.add-instance', {
        project_path: projectDir,
        test_case_path: 'tests/MyTest.testcase',
        plan_name: 'MyPlan',
        overwrite: true,
        dry_run: false,
      });

      assert.equal(isError(result), false);
      assert.equal(parseText(result)['written'], true);
    });
  });

  describe('testCaseId extraction', () => {
    it('extracts registryId attribute', () => {
      makeProject(projectDir);
      makeTestCase(path.join(projectDir, 'tests', 'TC.testcase'), 'my-registry-id');
      makePlan(projectDir, 'P');

      const result = server.call('provar.testplan.add-instance', {
        project_path: projectDir,
        test_case_path: 'tests/TC.testcase',
        plan_name: 'P',
        overwrite: false,
        dry_run: true,
      });

      assert.equal(isError(result), false);
      assert.equal(parseText(result)['test_case_id'], 'my-registry-id');
    });

    it('falls back to id attribute when registryId is absent', () => {
      makeProject(projectDir);
      fs.mkdirSync(path.join(projectDir, 'tests'), { recursive: true });
      fs.writeFileSync(
        path.join(projectDir, 'tests', 'TC.testcase'),
        '<?xml version="1.0"?>\n<testCase id="fallback-id"/>\n',
        'utf-8'
      );
      makePlan(projectDir, 'P');

      const result = server.call('provar.testplan.add-instance', {
        project_path: projectDir,
        test_case_path: 'tests/TC.testcase',
        plan_name: 'P',
        overwrite: false,
        dry_run: true,
      });

      assert.equal(isError(result), false);
      assert.equal(parseText(result)['test_case_id'], 'fallback-id');
    });

    it('falls back to guid attribute when registryId and id are absent', () => {
      makeProject(projectDir);
      fs.mkdirSync(path.join(projectDir, 'tests'), { recursive: true });
      fs.writeFileSync(
        path.join(projectDir, 'tests', 'TC.testcase'),
        '<?xml version="1.0"?>\n<testCase guid="guid-only-id"/>\n',
        'utf-8'
      );
      makePlan(projectDir, 'P');

      const result = server.call('provar.testplan.add-instance', {
        project_path: projectDir,
        test_case_path: 'tests/TC.testcase',
        plan_name: 'P',
        overwrite: false,
        dry_run: true,
      });

      assert.equal(isError(result), false);
      assert.equal(parseText(result)['test_case_id'], 'guid-only-id');
    });
  });

  describe('testCasePath forward-slash normalization', () => {
    it('normalizes backslashes to forward slashes in written XML', () => {
      makeProject(projectDir);
      // Create nested testcase
      fs.mkdirSync(path.join(projectDir, 'tests', 'SubFolder'), { recursive: true });
      fs.writeFileSync(
        path.join(projectDir, 'tests', 'SubFolder', 'TC.testcase'),
        '<?xml version="1.0"?>\n<testCase registryId="norm-id"/>\n',
        'utf-8'
      );
      makePlan(projectDir, 'P');

      // Pass path with backslashes (Windows-style)
      const result = server.call('provar.testplan.add-instance', {
        project_path: projectDir,
        test_case_path: 'tests\\SubFolder\\TC.testcase',
        plan_name: 'P',
        overwrite: false,
        dry_run: true,
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.equal(body['test_case_path'], 'tests/SubFolder/TC.testcase');
    });
  });
});

// ── provar.testplan.create-suite ───────────────────────────────────────────────

describe('provar.testplan.create-suite', () => {
  describe('happy path', () => {
    it('creates suite directory and .planitem, returns expected fields', () => {
      makeProject(projectDir);
      makePlan(projectDir, 'MyPlan');

      const result = server.call('provar.testplan.create-suite', {
        project_path: projectDir,
        plan_name: 'MyPlan',
        suite_name: 'MySuite',
        dry_run: false,
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.equal(body['created'], true);
      assert.equal(body['dry_run'], false);
      assert.ok(typeof body['guid'] === 'string' && body['guid'].length > 0);

      const suiteDir = path.join(projectDir, 'plans', 'MyPlan', 'MySuite');
      assert.ok(fs.existsSync(suiteDir), 'Suite directory should be created');
      assert.ok(fs.existsSync(path.join(suiteDir, '.planitem')), '.planitem should be written');
    });

    it('creates nested suite under parent_suite_path', () => {
      makeProject(projectDir);
      makePlan(projectDir, 'MyPlan');
      // Create the parent suite first
      const parentDir = path.join(projectDir, 'plans', 'MyPlan', 'Parent');
      fs.mkdirSync(parentDir, { recursive: true });

      const result = server.call('provar.testplan.create-suite', {
        project_path: projectDir,
        plan_name: 'MyPlan',
        suite_name: 'Child',
        parent_suite_path: 'Parent',
        dry_run: false,
      });

      assert.equal(isError(result), false);
      const childDir = path.join(projectDir, 'plans', 'MyPlan', 'Parent', 'Child');
      assert.ok(fs.existsSync(childDir), 'Child suite directory should be created');
    });
  });

  describe('dry_run', () => {
    it('returns created=false and does not create directories', () => {
      makeProject(projectDir);
      makePlan(projectDir, 'MyPlan');

      const result = server.call('provar.testplan.create-suite', {
        project_path: projectDir,
        plan_name: 'MyPlan',
        suite_name: 'DryRunSuite',
        dry_run: true,
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.equal(body['created'], false);
      assert.equal(body['dry_run'], true);

      const suiteDir = path.join(projectDir, 'plans', 'MyPlan', 'DryRunSuite');
      assert.equal(fs.existsSync(suiteDir), false, 'Directory must not be created in dry_run mode');
    });
  });

  describe('error cases', () => {
    it('returns NOT_A_PROJECT when .testproject is missing', () => {
      fs.mkdirSync(projectDir, { recursive: true });

      const result = server.call('provar.testplan.create-suite', {
        project_path: projectDir,
        plan_name: 'MyPlan',
        suite_name: 'MySuite',
        dry_run: false,
      });

      assert.equal(isError(result), true);
      assert.equal(errorCode(result), 'NOT_A_PROJECT');
    });

    it('returns DIR_NOT_FOUND when plan directory does not exist', () => {
      makeProject(projectDir);
      // No plan created

      const result = server.call('provar.testplan.create-suite', {
        project_path: projectDir,
        plan_name: 'NonExistentPlan',
        suite_name: 'MySuite',
        dry_run: false,
      });

      assert.equal(isError(result), true);
      assert.equal(errorCode(result), 'DIR_NOT_FOUND');
    });

    it('returns FILE_NOT_FOUND when plan .planitem does not exist', () => {
      makeProject(projectDir);
      // Create plan dir but no .planitem
      fs.mkdirSync(path.join(projectDir, 'plans', 'MyPlan'), { recursive: true });

      const result = server.call('provar.testplan.create-suite', {
        project_path: projectDir,
        plan_name: 'MyPlan',
        suite_name: 'MySuite',
        dry_run: false,
      });

      assert.equal(isError(result), true);
      assert.equal(errorCode(result), 'FILE_NOT_FOUND');
    });

    it('returns DIR_EXISTS when suite already exists', () => {
      makeProject(projectDir);
      makePlan(projectDir, 'MyPlan');
      // Pre-create the suite dir
      fs.mkdirSync(path.join(projectDir, 'plans', 'MyPlan', 'AlreadyExists'), { recursive: true });

      const result = server.call('provar.testplan.create-suite', {
        project_path: projectDir,
        plan_name: 'MyPlan',
        suite_name: 'AlreadyExists',
        dry_run: false,
      });

      assert.equal(isError(result), true);
      assert.equal(errorCode(result), 'DIR_EXISTS');
    });
  });
});

// ── provar.testplan.remove-instance ───────────────────────────────────────────

describe('provar.testplan.remove-instance', () => {
  describe('happy path', () => {
    it('removes the .testinstance file and returns expected fields', () => {
      makeProject(projectDir);
      makePlan(projectDir, 'MyPlan');
      const instancePath = path.join(projectDir, 'plans', 'MyPlan', 'MyTest.testinstance');
      fs.writeFileSync(instancePath, '<testPlanInstance guid="x"/>', 'utf-8');

      const result = server.call('provar.testplan.remove-instance', {
        project_path: projectDir,
        instance_path: 'plans/MyPlan/MyTest.testinstance',
        dry_run: false,
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.equal(body['removed'], true);
      assert.equal(body['dry_run'], false);
      assert.equal(fs.existsSync(instancePath), false, 'File should be deleted');
    });
  });

  describe('dry_run', () => {
    it('returns removed=false and does not delete the file', () => {
      makeProject(projectDir);
      makePlan(projectDir, 'MyPlan');
      const instancePath = path.join(projectDir, 'plans', 'MyPlan', 'MyTest.testinstance');
      fs.writeFileSync(instancePath, '<testPlanInstance guid="x"/>', 'utf-8');

      const result = server.call('provar.testplan.remove-instance', {
        project_path: projectDir,
        instance_path: 'plans/MyPlan/MyTest.testinstance',
        dry_run: true,
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.equal(body['removed'], false);
      assert.equal(body['dry_run'], true);
      assert.equal(fs.existsSync(instancePath), true, 'File must not be deleted in dry_run mode');
    });
  });

  describe('error cases', () => {
    it('returns INVALID_PATH when instance_path does not end with .testinstance', () => {
      makeProject(projectDir);

      const result = server.call('provar.testplan.remove-instance', {
        project_path: projectDir,
        instance_path: 'plans/MyPlan/MyTest.testcase',
        dry_run: false,
      });

      assert.equal(isError(result), true);
      assert.equal(errorCode(result), 'INVALID_PATH');
    });

    it('returns FILE_NOT_FOUND when instance file does not exist', () => {
      makeProject(projectDir);

      const result = server.call('provar.testplan.remove-instance', {
        project_path: projectDir,
        instance_path: 'plans/MyPlan/Missing.testinstance',
        dry_run: false,
      });

      assert.equal(isError(result), true);
      assert.equal(errorCode(result), 'FILE_NOT_FOUND');
    });
  });
});

// ── registerAllTestPlanTools ───────────────────────────────────────────────────

describe('registerAllTestPlanTools', () => {
  it('registers all three tools', () => {
    const freshServer = new MockMcpServer();
    registerAllTestPlanTools(freshServer as never, config);

    // Each tool should be callable without throwing "Tool not registered"
    makeProject(projectDir);

    // Verify each tool is registered by checking it doesn't throw
    assert.doesNotThrow(() => {
      freshServer.call('provar.testplan.add-instance', {
        project_path: projectDir,
        test_case_path: 'tests/X.testcase',
        plan_name: 'P',
        overwrite: false,
        dry_run: true,
      });
    });
    assert.doesNotThrow(() => {
      freshServer.call('provar.testplan.create-suite', {
        project_path: projectDir,
        plan_name: 'P',
        suite_name: 'S',
        dry_run: true,
      });
    });
    assert.doesNotThrow(() => {
      freshServer.call('provar.testplan.remove-instance', {
        project_path: projectDir,
        instance_path: 'plans/P/X.testinstance',
        dry_run: true,
      });
    });
  });
});
