/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from '../server.js';
import { assertPathAllowed, PathPolicyError } from '../security/pathPolicy.js';
import { makeError, makeRequestId } from '../schemas/common.js';
import { log } from '../logging/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConnectionEntry {
  name: string;
  type: string;
  url?: string;
  sso_configured: boolean;
}

interface EnvironmentEntry {
  name: string;
  connection: string;
  url?: string;
}

// ── Class → human-readable type mapping ──────────────────────────────────────

const CLASS_TO_TYPE: Record<string, string> = {
  sf: 'Salesforce',
  ui: 'Web',
  testmanager: 'Quality Hub',
  webservice: 'Web Service',
  database: 'Database',
  google: 'Google',
  msexc: 'Microsoft',
  zephyr: 'Zephyr',
  zephyrScale: 'Zephyr',
  zephyrServer: 'Zephyr',
  sso: 'SSO',
};

function classToType(className: string): string {
  return CLASS_TO_TYPE[className] ?? className;
}

// ── .testproject parsers ──────────────────────────────────────────────────────

const TP_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  isArray: (name): boolean => name === 'connectionClass' || name === 'connection' || name === 'environment',
});

class XmlParseError extends Error {
  public code = 'CONNECTION_XML_PARSE_ERROR';
}

function parseTestProjectXml(content: string): Record<string, unknown> {
  let parsed: Record<string, unknown>;
  try {
    parsed = TP_PARSER.parse(content) as Record<string, unknown>;
  } catch (e) {
    throw new XmlParseError(`Failed to parse .testproject XML: ${(e as Error).message}`);
  }
  const raw = parsed['testProject'];
  return raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function parseConnectionList(content: string): ConnectionEntry[] {
  const tp = parseTestProjectXml(content);
  const cc = tp['connectionClasses'];
  if (!cc || typeof cc !== 'object') return [];

  const classesRaw = (cc as Record<string, unknown>)['connectionClass'];
  if (!classesRaw) return [];
  const classes = classesRaw as Array<Record<string, unknown>>;

  const connections: ConnectionEntry[] = [];
  for (const cls of classes) {
    const className = cls['@_name'] as string | undefined;
    if (!className) continue;
    const connsRaw = cls['connection'];
    if (!connsRaw) continue;
    for (const conn of connsRaw as Array<Record<string, unknown>>) {
      const connName = conn['@_name'] as string | undefined;
      if (!connName) continue;
      const url = conn['@_url'] as string | undefined;
      connections.push({
        name: connName,
        type: classToType(className),
        ...(url ? { url } : {}),
        sso_configured: className === 'sso',
      });
    }
  }
  return connections;
}

function parseEnvironmentList(content: string): EnvironmentEntry[] {
  const tp = parseTestProjectXml(content);
  const envSection = tp['environments'];
  if (!envSection || typeof envSection !== 'object') return [];

  const envsRaw = (envSection as Record<string, unknown>)['environment'];
  if (!envsRaw) return [];

  const environments: EnvironmentEntry[] = [];
  for (const env of envsRaw as Array<Record<string, unknown>>) {
    const name = env['@_name'] as string | undefined;
    if (!name) continue;
    const connection = env['@_connectionName'] as string | undefined;
    const url = env['@_url'] as string | undefined;
    environments.push({
      name,
      connection: connection ?? '',
      ...(url ? { url } : {}),
    });
  }
  return environments;
}

// ── Tool registration ─────────────────────────────────────────────────────────

export function registerConnectionList(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.connection.list',
    [
      'List all connections and named environments defined in the .testproject file.',
      'Use this before generating test cases or page objects to get the correct connection names.',
      'Returns connections (name, type, url, sso_configured) and environments (name, connection, url).',
      'Prerequisite: the project must have a .testproject file — run provar.project.validate first if unsure.',
      'Security: only connection names, types, and URLs are returned — credential values from .secrets are never included.',
    ].join(' '),
    {
      project_path: z
        .string()
        .describe('Absolute or relative path to the Provar project root directory (must be within --allowed-paths)'),
    },
    ({ project_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar.connection.list', { requestId, project_path });

      try {
        const resolvedPath = path.resolve(project_path);
        assertPathAllowed(resolvedPath, config.allowedPaths);

        const testProjectPath = path.join(resolvedPath, '.testproject');
        if (!fs.existsSync(testProjectPath)) {
          const err = makeError(
            'CONNECTION_FILE_NOT_FOUND',
            `No .testproject file found at: ${testProjectPath}. Run provar.project.validate first to confirm the project structure.`,
            requestId,
            false,
            { suggestion: 'Run provar.project.validate with the project_path to confirm the project root, then retry.' }
          );
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
        }

        assertPathAllowed(testProjectPath, config.allowedPaths);

        let content: string;
        try {
          content = fs.readFileSync(testProjectPath, 'utf-8');
        } catch (readErr) {
          const err = makeError(
            'CONNECTION_FILE_READ_ERROR',
            `Failed to read .testproject: ${(readErr as Error).message}`,
            requestId,
            false
          );
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
        }

        const connections = parseConnectionList(content);
        const environments = parseEnvironmentList(content);

        const result = {
          requestId,
          project_path: resolvedPath,
          connections,
          environments,
          summary: {
            connection_count: connections.length,
            environment_count: environments.length,
          },
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (err: unknown) {
        const error = err as Error & { code?: string };
        const errResult = makeError(
          error instanceof PathPolicyError ? error.code : error.code ?? 'CONNECTION_LIST_ERROR',
          error.message,
          requestId,
          false
        );
        log('error', 'provar.connection.list failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}

export function registerAllConnectionTools(server: McpServer, config: ServerConfig): void {
  registerConnectionList(server, config);
}
