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
import { registerProjectValidateFromPath } from '../../../src/mcp/tools/projectValidateFromPath.js';
import type { ServerConfig } from '../../../src/mcp/server.js';

// ── Minimal McpServer mock ─────────────────────────────────────────────────────

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

// ── Project fixture helpers ────────────────────────────────────────────────────

const TESTPROJECT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testProject>
  <environment name="Dev" url="https://dev.example.com"/>
  <connection name="SalesforceOrg" type="salesforce"/>
  <secureStoragePath>.secrets</secureStoragePath>
</testProject>`;

function makeXml(tcGuid: string, stepGuid: string, id: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="${id}" guid="${tcGuid}" registryId="${id}" name="${id}">
  <steps>
    <apiCall guid="${stepGuid}" apiId="UiConnect" name="Connect" testItemId="1"/>
  </steps>
</testCase>`;
}

function writeFile(p: string, content: string): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf-8');
}

const G = {
  tc1: '550e8400-e29b-41d4-a716-446655440001',
  s1:  '550e8400-e29b-41d4-a716-446655440011',
};

/** Build a minimal valid Provar project in the given directory */
function makeProject(root: string, planName = 'smoke', tcName = 'Login'): void {
  writeFile(path.join(root, '.testproject'), TESTPROJECT_XML);
  writeFile(path.join(root, 'tests', `${tcName}.testcase`),
    makeXml(G.tc1, G.s1, `tc-${tcName.toLowerCase()}`));
  writeFile(path.join(root, 'plans', planName, `${tcName}.testinstance`),
    `testCasePath="tests/${tcName}.testcase"\n`);
}

// ── Test setup ─────────────────────────────────────────────────────────────────

const tempDirs: string[] = [];

function mktemp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvfp-test-'));
  tempDirs.push(dir);
  return dir;
}

let server: MockMcpServer;
let config: ServerConfig;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mktemp();
  server = new MockMcpServer();
  config = { allowedPaths: [os.tmpdir()] };
  registerProjectValidateFromPath(server as never, config);
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── provar.project.validate ────────────────────────────────────────────────────

describe('provar.project.validate (from path)', () => {
  describe('happy path', () => {
    it('returns a result (not an error) for a valid project', () => {
      makeProject(tmpDir);
      const result = server.call('provar.project.validate', {
        project_path: tmpDir,
        save_results: false,
      });

      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.ok('quality_score' in body, 'Expected quality_score');
      assert.ok('plans_summary' in body, 'Expected plans_summary in default response');
      assert.ok(!('plans' in body), 'plans should not appear in default (slim) response');
    });

    it('quality_score is between 0 and 100', () => {
      makeProject(tmpDir);
      const result = server.call('provar.project.validate', {
        project_path: tmpDir,
        save_results: false,
      });

      const score = parseText(result)['quality_score'] as number;
      assert.ok(score >= 0 && score <= 100, `Expected 0-100, got ${score}`);
    });

    it('returns requestId in the response', () => {
      makeProject(tmpDir);
      const result = server.call('provar.project.validate', {
        project_path: tmpDir,
        save_results: false,
      });

      const body = parseText(result);
      assert.ok(typeof body['requestId'] === 'string' && body['requestId'].length > 0);
    });
  });

  describe('error cases', () => {
    it('returns NOT_A_PROJECT when .testproject is absent', () => {
      // Empty temp dir — no .testproject
      const result = server.call('provar.project.validate', {
        project_path: tmpDir,
        save_results: false,
      });

      assert.equal(isError(result), true);
      assert.equal(parseText(result)['error_code'], 'NOT_A_PROJECT');
    });

    it('returns NOT_A_PROJECT even when plans/ exists but .testproject is absent', () => {
      fs.mkdirSync(path.join(tmpDir, 'plans'), { recursive: true });
      const result = server.call('provar.project.validate', {
        project_path: tmpDir,
        save_results: false,
      });

      assert.equal(isError(result), true);
      assert.equal(parseText(result)['error_code'], 'NOT_A_PROJECT');
    });

    it('returns PATH_NOT_ALLOWED for project_path outside allowedPaths', () => {
      const strictServer = new MockMcpServer();
      registerProjectValidateFromPath(strictServer as never, { allowedPaths: [tmpDir] });

      const result = strictServer.call('provar.project.validate', {
        project_path: '/etc',
        save_results: false,
      });

      assert.equal(isError(result), true);
      const code = parseText(result)['error_code'] as string;
      assert.ok(code === 'PATH_NOT_ALLOWED' || code === 'PATH_TRAVERSAL', `Unexpected: ${code}`);
    });

    it('returns PATH_NOT_ALLOWED for results_dir outside allowedPaths', () => {
      makeProject(tmpDir);
      const strictServer = new MockMcpServer();
      registerProjectValidateFromPath(strictServer as never, { allowedPaths: [tmpDir] });

      const result = strictServer.call('provar.project.validate', {
        project_path: tmpDir,
        save_results: true,
        results_dir: '/etc/evil-results',
      });

      assert.equal(isError(result), true);
      const code = parseText(result)['error_code'] as string;
      assert.ok(code === 'PATH_NOT_ALLOWED' || code === 'PATH_TRAVERSAL', `Unexpected: ${code}`);
    });
  });

  describe('save_results', () => {
    it('does NOT write a results file when save_results=false', () => {
      makeProject(tmpDir);
      server.call('provar.project.validate', {
        project_path: tmpDir,
        save_results: false,
      });

      const defaultResultsDir = path.join(tmpDir, 'provardx', 'validation');
      const exists = fs.existsSync(defaultResultsDir) &&
        fs.readdirSync(defaultResultsDir).length > 0;
      assert.equal(exists, false, 'No results file should be written when save_results=false');
    });

    it('writes a results file to default location when save_results=true', () => {
      makeProject(tmpDir);
      server.call('provar.project.validate', {
        project_path: tmpDir,
        save_results: true,
      });

      const defaultResultsDir = path.join(tmpDir, 'provardx', 'validation');
      assert.equal(fs.existsSync(defaultResultsDir), true, 'Results directory should be created');
      const files = fs.readdirSync(defaultResultsDir);
      assert.ok(files.length > 0, 'At least one results file should be written');
    });

    it('writes results to a custom results_dir when provided', () => {
      makeProject(tmpDir);
      const customResultsDir = path.join(tmpDir, 'my-results');

      server.call('provar.project.validate', {
        project_path: tmpDir,
        save_results: true,
        results_dir: customResultsDir,
      });

      assert.equal(fs.existsSync(customResultsDir), true, 'Custom results dir should be created');
      const files = fs.readdirSync(customResultsDir);
      assert.ok(files.length > 0, 'Results file should be written to custom dir');
    });
  });

  describe('quality_threshold', () => {
    it('accepts a custom quality_threshold', () => {
      makeProject(tmpDir);
      const result = server.call('provar.project.validate', {
        project_path: tmpDir,
        quality_threshold: 90,
        save_results: false,
      });

      assert.equal(isError(result), false);
    });
  });

  describe('include_plan_details', () => {
    it('default response uses plans_summary not plans', () => {
      makeProject(tmpDir);
      const result = server.call('provar.project.validate', {
        project_path: tmpDir,
        save_results: false,
      });
      const body = parseText(result);
      assert.ok('plans_summary' in body, 'slim response should have plans_summary');
      assert.ok(!('plans' in body), 'slim response should not have plans');
      assert.ok('hint' in body, 'slim response should have hint');
    });

    it('include_plan_details:true returns full plans array', () => {
      makeProject(tmpDir);
      const result = server.call('provar.project.validate', {
        project_path: tmpDir,
        save_results: false,
        include_plan_details: true,
      });
      const body = parseText(result);
      assert.ok('plans' in body, 'detailed response should have plans');
      assert.ok(!('plans_summary' in body), 'detailed response should not have plans_summary');
    });

    it('plans_summary entries have name, quality_score, suite_count, test_case_count', () => {
      makeProject(tmpDir);
      const result = server.call('provar.project.validate', { project_path: tmpDir, save_results: false });
      const body = parseText(result);
      const plansSummary = body['plans_summary'] as Array<Record<string, unknown>>;
      assert.ok(Array.isArray(plansSummary));
      if (plansSummary.length > 0) {
        const plan = plansSummary[0];
        assert.ok('name' in plan, 'plan_summary should have name');
        assert.ok('quality_score' in plan, 'plan_summary should have quality_score');
        assert.ok('suite_count' in plan, 'plan_summary should have suite_count');
        assert.ok('test_case_count' in plan, 'plan_summary should have test_case_count');
        assert.ok('violation_count' in plan, 'plan_summary should have violation_count');
      }
    });
  });

  describe('max_uncovered', () => {
    it('uncovered_test_cases is truncated to max_uncovered', () => {
      // Make project with 3 test cases but only 1 in a plan → 2 uncovered
      const root = mktemp();
      writeFile(path.join(root, '.testproject'), TESTPROJECT_XML);
      for (const name of ['Login', 'Logout', 'Search']) {
        writeFile(path.join(root, 'tests', `${name}.testcase`), makeXml(G.tc1, G.s1, `tc-${name.toLowerCase()}`));
      }
      writeFile(path.join(root, 'plans', 'smoke', 'Login.testinstance'), 'testCasePath="tests/Login.testcase"\n');

      const result = server.call('provar.project.validate', {
        project_path: root,
        save_results: false,
        max_uncovered: 1,
      });
      const body = parseText(result);
      const coverage = body['coverage'] as Record<string, unknown>;
      const uncovered = coverage['uncovered_test_cases'] as string[];
      assert.ok(uncovered.length <= 1, 'Should be truncated to max_uncovered=1');
      assert.equal(coverage['uncovered_truncated'], true);
    });
  });
});
