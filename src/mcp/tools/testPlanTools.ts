/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from '../server.js';
import { assertPathAllowed, PathPolicyError } from '../security/pathPolicy.js';
import { makeError, makeRequestId } from '../schemas/common.js';
import { log } from '../logging/logger.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Try to extract testCaseId from testcase XML content.
 * Looks for registryId, id, or guid attributes on the root element.
 */
function extractTestCaseId(xmlContent: string): string | null {
  for (const attr of ['registryId', 'id', 'guid']) {
    const match = new RegExp(`${attr}="([^"]+)"`).exec(xmlContent);
    if (match) return match[1];
  }
  return null;
}

/** Normalize path separators to forward slashes. */
function toForwardSlashes(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Build a .testinstance XML string. */
function buildTestInstanceXml(guid: string, testCaseId: string, testCasePath: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    `<testPlanInstance guid="${guid}" testCaseId="${testCaseId}" testCasePath="${testCasePath}">`,
    '  <planSettings/>',
    '  <planFeatures/>',
    '</testPlanInstance>',
  ].join('\n');
}

/** Build a .planitem XML string. */
function buildPlanItemXml(guid: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    `<testPlan guid="${guid}">`,
    '  <planSettings/>',
    '  <planFeatures/>',
    '</testPlan>',
  ].join('\n');
}

// ── provar.testplan.add-instance ──────────────────────────────────────────────

export function registerTestPlanAddInstance(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.testplan.add-instance',
    [
      'Add a .testinstance file to an existing Provar test plan suite directory.',
      'The plan directory and suite directory must already exist.',
      'test_case_path is relative to the project root (e.g. "tests/MyTest.testcase").',
      'suite_path is the path within the plan (e.g. "MySuite" or "MySuite/SubSuite").',
      'Returns the guid assigned to the new instance and the path where it was written.',
    ].join(' '),
    {
      project_path: z.string().describe('Absolute path to the Provar project root'),
      test_case_path: z.string().describe('Path to the .testcase file, relative to project root (e.g. "tests/MyTest.testcase")'),
      plan_name: z.string().describe('Name of the test plan (directory under plans/)'),
      suite_path: z.string().optional().describe('Path within the plan to place the instance (e.g. "MySuite" or "MySuite/SubSuite")'),
      overwrite: z.boolean().optional().default(false).describe('Overwrite the .testinstance file if it already exists (default: false)'),
      dry_run: z.boolean().optional().default(false).describe('Return what would be written without writing to disk (default: false)'),
    },
    ({ project_path, test_case_path, plan_name, suite_path, overwrite, dry_run }) => {
      const requestId = makeRequestId();
      log('info', 'provar.testplan.add-instance', { requestId, project_path, test_case_path, plan_name });

      try {
        assertPathAllowed(project_path, config.allowedPaths);

        const projectRoot = path.resolve(project_path);

        // Verify .testproject exists
        const testProjectFiles = fs.existsSync(projectRoot)
          ? fs.readdirSync(projectRoot).filter((f) => f.endsWith('.testproject'))
          : [];
        if (testProjectFiles.length === 0) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: JSON.stringify(makeError('NOT_A_PROJECT', `No .testproject file found in ${projectRoot}`, requestId)) }],
          };
        }

        // Resolve testcase absolute path
        const absoluteTestCasePath = path.join(projectRoot, test_case_path);
        if (!fs.existsSync(absoluteTestCasePath)) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: JSON.stringify(makeError('FILE_NOT_FOUND', `Test case not found: ${absoluteTestCasePath}`, requestId)) }],
          };
        }
        if (!test_case_path.endsWith('.testcase')) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: JSON.stringify(makeError('INVALID_PATH', 'test_case_path must end with .testcase', requestId)) }],
          };
        }

        // Read testcase XML and extract testCaseId
        const testCaseXml = fs.readFileSync(absoluteTestCasePath, 'utf-8');
        const testCaseId = extractTestCaseId(testCaseXml);
        if (!testCaseId) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: JSON.stringify(makeError('NO_TEST_CASE_ID', `Cannot extract registryId, id, or guid from ${absoluteTestCasePath}`, requestId)) }],
          };
        }

        // Determine instance directory
        const instanceDirParts = ['plans', plan_name];
        if (suite_path) instanceDirParts.push(...suite_path.split('/').filter(Boolean));
        const instanceDir = path.join(projectRoot, ...instanceDirParts);

        if (!fs.existsSync(instanceDir)) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: JSON.stringify(makeError('DIR_NOT_FOUND', `Suite directory does not exist: ${instanceDir}. Create it with provar.testplan.create-suite first.`, requestId)) }],
          };
        }

        // Determine filename and full path
        const instanceFileName = path.basename(test_case_path, '.testcase') + '.testinstance';
        const instanceFilePath = path.join(instanceDir, instanceFileName);

        if (!overwrite && fs.existsSync(instanceFilePath)) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: JSON.stringify(makeError('FILE_EXISTS', `Instance file already exists: ${instanceFilePath}. Set overwrite: true to replace it.`, requestId)) }],
          };
        }

        // Build XML
        const guid = randomUUID();
        const normalizedTestCasePath = toForwardSlashes(test_case_path);
        const xmlContent = buildTestInstanceXml(guid, testCaseId, normalizedTestCasePath);

        if (!dry_run) {
          fs.writeFileSync(instanceFilePath, xmlContent, 'utf-8');
        }

        const response = {
          requestId,
          instance_path: instanceFilePath,
          guid,
          test_case_id: testCaseId,
          test_case_path: normalizedTestCasePath,
          dry_run: dry_run ?? false,
          written: !dry_run,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
      } catch (err: unknown) {
        const error = err as Error & { code?: string };
        return {
          isError: true,
          content: [{ type: 'text' as const, text: JSON.stringify(makeError(error instanceof PathPolicyError ? error.code : (error.code ?? 'ADD_INSTANCE_ERROR'), error.message, requestId)) }],
        };
      }
    }
  );
}

// ── provar.testplan.create-suite ──────────────────────────────────────────────

export function registerTestPlanCreateSuite(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.testplan.create-suite',
    [
      'Create a new suite directory inside a Provar test plan.',
      'The plan directory must already exist with a .planitem file at its root.',
      'Writes a new .planitem file into the created suite directory.',
      'Returns the guid assigned to the new suite.',
    ].join(' '),
    {
      project_path: z.string().describe('Absolute path to the Provar project root'),
      plan_name: z.string().describe('Name of the test plan (directory under plans/)'),
      suite_name: z.string().describe('Name of the new suite directory to create'),
      parent_suite_path: z.string().optional().describe('Path of the parent suite within the plan (e.g. "MySuite"). Omit to create at plan root.'),
      dry_run: z.boolean().optional().default(false).describe('Return what would be created without writing to disk (default: false)'),
    },
    ({ project_path, plan_name, suite_name, parent_suite_path, dry_run }) => {
      const requestId = makeRequestId();
      log('info', 'provar.testplan.create-suite', { requestId, project_path, plan_name, suite_name });

      try {
        assertPathAllowed(project_path, config.allowedPaths);

        const projectRoot = path.resolve(project_path);

        // Verify .testproject exists
        const testProjectFiles = fs.existsSync(projectRoot)
          ? fs.readdirSync(projectRoot).filter((f) => f.endsWith('.testproject'))
          : [];
        if (testProjectFiles.length === 0) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: JSON.stringify(makeError('NOT_A_PROJECT', `No .testproject file found in ${projectRoot}`, requestId)) }],
          };
        }

        // Verify plan directory exists
        const planDir = path.join(projectRoot, 'plans', plan_name);
        if (!fs.existsSync(planDir)) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: JSON.stringify(makeError('DIR_NOT_FOUND', `Plan directory does not exist: ${planDir}`, requestId)) }],
          };
        }

        // Verify plan .planitem exists
        const planItemPath = path.join(planDir, '.planitem');
        if (!fs.existsSync(planItemPath)) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: JSON.stringify(makeError('FILE_NOT_FOUND', `Plan .planitem file does not exist: ${planItemPath}`, requestId)) }],
          };
        }

        // Determine suite directory
        const suiteDirParts = [planDir];
        if (parent_suite_path) suiteDirParts.push(...parent_suite_path.split('/').filter(Boolean));
        suiteDirParts.push(suite_name);
        const suiteDir = path.join(...suiteDirParts);

        if (fs.existsSync(suiteDir)) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: JSON.stringify(makeError('DIR_EXISTS', `Suite directory already exists: ${suiteDir}`, requestId)) }],
          };
        }

        const guid = randomUUID();
        const xmlContent = buildPlanItemXml(guid);
        const newPlanItemPath = path.join(suiteDir, '.planitem');

        if (!dry_run) {
          fs.mkdirSync(suiteDir, { recursive: true });
          fs.writeFileSync(newPlanItemPath, xmlContent, 'utf-8');
        }

        const response = {
          requestId,
          suite_dir: suiteDir,
          planitem_path: newPlanItemPath,
          guid,
          dry_run: dry_run ?? false,
          created: !dry_run,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
      } catch (err: unknown) {
        const error = err as Error & { code?: string };
        return {
          isError: true,
          content: [{ type: 'text' as const, text: JSON.stringify(makeError(error instanceof PathPolicyError ? error.code : (error.code ?? 'CREATE_SUITE_ERROR'), error.message, requestId)) }],
        };
      }
    }
  );
}

// ── provar.testplan.remove-instance ──────────────────────────────────────────

export function registerTestPlanRemoveInstance(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.testplan.remove-instance',
    [
      'Remove a .testinstance file from a Provar test plan.',
      'instance_path is relative to the project root.',
      'Returns the path of the removed file.',
    ].join(' '),
    {
      project_path: z.string().describe('Absolute path to the Provar project root'),
      instance_path: z.string().describe('Path to the .testinstance file, relative to project root'),
      dry_run: z.boolean().optional().default(false).describe('Return what would be removed without deleting (default: false)'),
    },
    ({ project_path, instance_path, dry_run }) => {
      const requestId = makeRequestId();
      log('info', 'provar.testplan.remove-instance', { requestId, project_path, instance_path });

      try {
        assertPathAllowed(project_path, config.allowedPaths);

        const projectRoot = path.resolve(project_path);
        const absolutePath = path.join(projectRoot, instance_path);

        // Assert no traversal outside project root
        const resolvedProjectRoot = path.resolve(projectRoot);
        const resolvedAbsolute = path.resolve(absolutePath);
        if (!resolvedAbsolute.startsWith(resolvedProjectRoot + path.sep) && resolvedAbsolute !== resolvedProjectRoot) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: JSON.stringify(makeError('PATH_TRAVERSAL', `Path traversal detected: ${instance_path}`, requestId)) }],
          };
        }

        // Must end with .testinstance
        if (!instance_path.endsWith('.testinstance')) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: JSON.stringify(makeError('INVALID_PATH', 'instance_path must end with .testinstance', requestId)) }],
          };
        }

        // File must exist
        if (!fs.existsSync(absolutePath)) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: JSON.stringify(makeError('FILE_NOT_FOUND', `Instance file not found: ${absolutePath}`, requestId)) }],
          };
        }

        if (!dry_run) {
          fs.unlinkSync(absolutePath);
        }

        const response = {
          requestId,
          removed_path: absolutePath,
          dry_run: dry_run ?? false,
          removed: !dry_run,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
      } catch (err: unknown) {
        const error = err as Error & { code?: string };
        return {
          isError: true,
          content: [{ type: 'text' as const, text: JSON.stringify(makeError(error instanceof PathPolicyError ? error.code : (error.code ?? 'REMOVE_INSTANCE_ERROR'), error.message, requestId)) }],
        };
      }
    }
  );
}

// ── Convenience re-export ─────────────────────────────────────────────────────

export function registerAllTestPlanTools(server: McpServer, config: ServerConfig): void {
  registerTestPlanAddInstance(server, config);
  registerTestPlanCreateSuite(server, config);
  registerTestPlanRemoveInstance(server, config);
}
