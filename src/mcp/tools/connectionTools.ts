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
import { maskFields, parseFieldsParam } from '../utils/fieldMask.js';
import { desc } from './descHelper.js';

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
  isArray: (name): boolean =>
    name === 'connectionClass' ||
    name === 'connection' ||
    name === 'environment' ||
    name === 'connectionUrl' ||
    name === 'association',
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

interface ConnectionInfo {
  name: string;
  className: string;
  defaultUrl?: string;
  urlsByEnvId: Map<string, string>;
}

function buildConnectionMap(tp: Record<string, unknown>): Map<string, ConnectionInfo> {
  const map = new Map<string, ConnectionInfo>();
  const cc = tp['connectionClasses'];
  if (!cc || typeof cc !== 'object') return map;

  const classesRaw = (cc as Record<string, unknown>)['connectionClass'];
  if (!Array.isArray(classesRaw)) return map;

  for (const cls of classesRaw as Array<Record<string, unknown>>) {
    const className = cls['@_name'] as string | undefined;
    if (!className) continue;
    // Real .testproject XML nests each <connection> inside a <connections> wrapper.
    const connsWrap = cls['connections'] as Record<string, unknown> | undefined;
    const connsRaw = connsWrap?.['connection'];
    if (!Array.isArray(connsRaw)) continue;
    for (const conn of connsRaw as Array<Record<string, unknown>>) {
      const id = conn['@_id'] as string | undefined;
      const name = conn['@_name'] as string | undefined;
      if (!name) continue;

      let defaultUrl: string | undefined;
      const urlsByEnvId = new Map<string, string>();
      const urlsWrap = conn['connectionUrls'] as Record<string, unknown> | undefined;
      const urlsRaw = urlsWrap?.['connectionUrl'];
      if (Array.isArray(urlsRaw)) {
        for (const u of urlsRaw as Array<Record<string, unknown>>) {
          const url = u['@_url'] as string | undefined;
          if (!url) continue;
          const envId = u['@_envId'] as string | undefined;
          // The base entry (no @_envId) is the connection's default URL;
          // entries with @_envId are environment-specific overrides keyed by env GUID.
          if (envId) urlsByEnvId.set(envId, url);
          else if (defaultUrl === undefined) defaultUrl = url;
        }
      }

      const info: ConnectionInfo = { name, className, defaultUrl, urlsByEnvId };
      if (id) map.set(id, info);
      // Also key by name so name-based lookups (e.g. legacy callers) still work.
      map.set(`name:${name}`, info);
    }
  }
  return map;
}

function parseConnectionList(content: string): ConnectionEntry[] {
  const tp = parseTestProjectXml(content);
  const map = buildConnectionMap(tp);
  const connections: ConnectionEntry[] = [];
  const seen = new Set<ConnectionInfo>();
  for (const info of map.values()) {
    if (seen.has(info)) continue;
    seen.add(info);
    connections.push({
      name: info.name,
      type: classToType(info.className),
      ...(info.defaultUrl ? { url: info.defaultUrl } : {}),
      sso_configured: info.className === 'sso',
    });
  }
  return connections;
}

function parseEnvironmentList(content: string): EnvironmentEntry[] {
  const tp = parseTestProjectXml(content);
  const envSection = tp['environments'];
  if (!envSection || typeof envSection !== 'object') return [];

  const envsRaw = (envSection as Record<string, unknown>)['environment'];
  if (!Array.isArray(envsRaw)) return [];

  const connectionMap = buildConnectionMap(tp);
  const environments: EnvironmentEntry[] = [];
  for (const env of envsRaw as Array<Record<string, unknown>>) {
    const name = env['@_name'] as string | undefined;
    if (!name) continue;
    const envGuid = env['@_guid'] as string | undefined;

    let connectionName = '';
    let envUrl: string | undefined;
    // associations may be missing, an empty string (no associations), or an object wrapping an array.
    const assocs = env['associations'];
    if (assocs !== null && typeof assocs === 'object') {
      const assocsRaw = (assocs as Record<string, unknown>)['association'];
      if (Array.isArray(assocsRaw) && assocsRaw.length > 0) {
        const first = assocsRaw[0] as Record<string, unknown>;
        const connId = first['@_connectionId'] as string | undefined;
        if (connId) {
          const info = connectionMap.get(connId);
          if (info) {
            connectionName = info.name;
            if (envGuid) envUrl = info.urlsByEnvId.get(envGuid);
          }
        }
      }
    }

    environments.push({
      name,
      connection: connectionName,
      ...(envUrl ? { url: envUrl } : {}),
    });
  }
  return environments;
}

// ── Tool registration ─────────────────────────────────────────────────────────

export function registerConnectionList(server: McpServer, config: ServerConfig): void {
  server.registerTool(
    'provar_connection_list',
    {
      title: 'List Connections',
      description: desc(
        [
          'List all connections and named environments defined in the .testproject file.',
          'Use this before generating test cases or page objects to get the correct connection names.',
          'Returns connections (name, type, url, sso_configured) and environments (name, connection, url).',
          'Prerequisite: the project must have a .testproject file — run provar_project_validate first if unsure.',
          'Security: only connection names, types, and URLs are returned — credential values from .secrets are never included.',
        ].join(' '),
        'List connections and environments from the .testproject file.'
      ),
      inputSchema: {
        project_path: z
          .string()
          .describe(
            desc(
              'Absolute or relative path to the Provar project root directory (must be within --allowed-paths)',
              'string, absolute path to project root'
            )
          ),
        fields: z
          .string()
          .optional()
          .describe(
            desc(
              'Comma-separated list of top-level response keys to retain (e.g. "connections,summary"). ' +
                'Supports dot notation for nested filtering (e.g. "connections.name,connections.type"). ' +
                'Unknown field names are silently ignored. Omit for full response.',
              'string, optional; comma-separated keys to keep (supports dot notation)'
            )
          ),
      },
    },
    ({ project_path, fields }) => {
      const requestId = makeRequestId();
      log('info', 'provar_connection_list', { requestId, project_path });

      try {
        const resolvedPath = path.resolve(project_path);
        assertPathAllowed(resolvedPath, config.allowedPaths);

        const testProjectPath = path.join(resolvedPath, '.testproject');
        if (!fs.existsSync(testProjectPath)) {
          const err = makeError(
            'CONNECTION_FILE_NOT_FOUND',
            `No .testproject file found at: ${testProjectPath}. Run provar_project_validate first to confirm the project structure.`,
            requestId,
            false,
            { suggestion: 'Run provar_project_validate with the project_path to confirm the project root, then retry.' }
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

        let result: Record<string, unknown> = {
          requestId,
          project_path: resolvedPath,
          connections,
          environments,
          summary: {
            connection_count: connections.length,
            environment_count: environments.length,
          },
        };

        const fieldList = parseFieldsParam(fields);
        if (fieldList) {
          result = maskFields(result, fieldList) as Record<string, unknown>;
        }

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
        log('error', 'provar_connection_list failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}

export function registerAllConnectionTools(server: McpServer, config: ServerConfig): void {
  registerConnectionList(server, config);
}
