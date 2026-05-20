/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from '../server.js';
import { assertPathAllowed, PathPolicyError } from '../security/pathPolicy.js';
import { makeError, makeRequestId } from '../schemas/common.js';
import { log } from '../logging/logger.js';
import { desc } from './descHelper.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Field entry as returned by provar_org_describe. Mirrors the shape of a Salesforce
 * describeSObjectResult.fields[] element, scoped to the four properties the
 * authoring tools care about.
 */
export interface OrgDescribeField {
  name: string;
  type: string;
  default_value: string | null;
  nillable: boolean;
}

export interface OrgDescribeObject {
  name: string;
  exists: boolean | null;
  required_fields: OrgDescribeField[];
  field_count: number;
  /** Present only when the cache file existed but failed to parse. */
  error_message?: string;
}

export interface OrgDescribeResult {
  workspace_path: string | null;
  cache_age_ms: number | null;
  objects: OrgDescribeObject[];
  details?: { suggestion: string };
}

/*
 * On-disk cache schema (one file per object) consumed by this tool.
 * The cache writer is Provar IDE; this tool is read-only.
 *
 * Layout: <workspace>/.metadata/<connection_name>/<ObjectApiName>.json
 *
 * Each JSON file contains: { name: "Account", fields: [ { name, type, defaultValue, nillable }, ... ] }
 *
 * As a fallback, .xml / .object files (CustomObject metadata) are also accepted
 * to ease migration from the legacy Provar IDE Eclipse cache layout.
 */
interface CachedField {
  name: string;
  type?: string;
  defaultValue?: string | null;
  nillable?: boolean;
}

interface CachedObject {
  name?: string;
  fields?: CachedField[];
}

// ── Workspace discovery ───────────────────────────────────────────────────────

/**
 * Normalise a project basename for use in fallback workspace dir names:
 * "My Project Path " → "my-project-path".
 */
export function projectNameDashes(projectPath: string): string {
  return path.basename(projectPath).trim().replace(/\s+/g, '-').toLowerCase();
}

/**
 * Build the ordered list of candidate workspace directories.
 * First existing wins.
 * 1. <parent>/workspace-<basename>/ — sibling workspace pattern.
 * 2. <parent>/Provar_Workspaces/workspace-<name-dashes>/
 * 3. ~/Provar/workspace-<name-dashes>/ — user-home fallback.
 */
export function workspaceCandidates(projectPath: string): string[] {
  const resolved = path.resolve(projectPath);
  const parent = path.dirname(resolved);
  const basename = path.basename(resolved);
  const dashes = projectNameDashes(resolved);
  return [
    path.join(parent, `workspace-${basename}`),
    path.join(parent, 'Provar_Workspaces', `workspace-${dashes}`),
    path.join(os.homedir(), 'Provar', `workspace-${dashes}`),
  ];
}

/**
 * Returns the first candidate workspace that exists AND is within allowedPaths, or null.
 *
 * Path policy is enforced PER CANDIDATE before any filesystem call: a candidate that
 * sits outside `--allowed-paths` is silently skipped (it is not an error — discovery
 * just moves on to the next). This means we never call fs.existsSync / fs.statSync
 * against directories that the operator has explicitly placed off-limits, including
 * the user-home fallback (~/Provar/...) when home sits outside the policy.
 *
 * When allowedPaths is empty (unrestricted mode), assertPathAllowed is a no-op and
 * all candidates are probed exactly as before.
 */
export function discoverWorkspace(projectPath: string, allowedPaths: string[] = []): string | null {
  for (const candidate of workspaceCandidates(projectPath)) {
    try {
      assertPathAllowed(candidate, allowedPaths);
    } catch {
      // Candidate outside policy — skip without touching the filesystem.
      continue;
    }
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch {
      // Permission errors etc. — skip and try next candidate
    }
  }
  return null;
}

// ── Cache reading ─────────────────────────────────────────────────────────────

const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  isArray: (name): boolean => name === 'fields',
});

/** Parse a JSON cache file into the canonical CachedObject shape. */
function readJsonCacheFile(filePath: string): CachedObject {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as CachedObject;
}

/**
 * Parse a legacy .object XML file (CustomObject metadata) into the canonical shape.
 * Only extracts the bare minimum the tool needs: field name, type, nillable.
 */
function readXmlCacheFile(filePath: string): CachedObject {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = XML_PARSER.parse(raw) as Record<string, unknown>;
  const root = (parsed['CustomObject'] ?? parsed['toolingObjectInfo'] ?? {}) as Record<string, unknown>;
  const fieldsRaw = root['fields'];
  if (!Array.isArray(fieldsRaw)) return { name: path.basename(filePath, path.extname(filePath)), fields: [] };

  const fields: CachedField[] = [];
  for (const f of fieldsRaw as Array<Record<string, unknown>>) {
    const name = (f['fullName'] ?? f['name']) as string | undefined;
    if (!name) continue;
    // fast-xml-parser with parseTagValue=true (the default) coerces `<required>true</required>`
    // into the boolean true; with parseTagValue=false it would stay as the string "true".
    // Accept BOTH forms so we don't misclassify required fields as nillable on either path.
    const requiredRaw = f['required'];
    const isRequired = requiredRaw === true || requiredRaw === 'true';
    fields.push({
      name,
      type: (f['type'] as string | undefined) ?? 'unknown',
      defaultValue: (f['defaultValue'] as string | undefined) ?? null,
      // XML defaults: required = !nillable. In the .object format, "required" is rare,
      // so we default to nillable=true (optional) unless explicitly required.
      nillable: !isRequired,
    });
  }
  return { name: path.basename(filePath, path.extname(filePath)), fields };
}

/** Look up the cache file for one object, trying .json then .xml. */
function findObjectCacheFile(connectionDir: string, objectName: string): string | null {
  const jsonPath = path.join(connectionDir, `${objectName}.json`);
  if (fs.existsSync(jsonPath)) return jsonPath;
  const xmlPath = path.join(connectionDir, `${objectName}.xml`);
  if (fs.existsSync(xmlPath)) return xmlPath;
  // Legacy CustomObject layout (.object extension)
  const objPath = path.join(connectionDir, `${objectName}.object`);
  if (fs.existsSync(objPath)) return objPath;
  return null;
}

/** List all cached object names (stripped of extension) in a connection directory. */
function listCachedObjectNames(connectionDir: string): string[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(connectionDir);
  } catch {
    return [];
  }
  const names = new Set<string>();
  for (const entry of entries) {
    const ext = path.extname(entry);
    if (ext === '.json' || ext === '.xml' || ext === '.object') {
      names.add(path.basename(entry, ext));
    }
  }
  return [...names].sort();
}

/** Read one object's cache file and convert it to an OrgDescribeObject. */
function readObject(connectionDir: string, objectName: string, fieldFilter: 'required' | 'all'): OrgDescribeObject {
  const file = findObjectCacheFile(connectionDir, objectName);
  if (!file) {
    return { name: objectName, exists: false, required_fields: [], field_count: 0 };
  }
  let cached: CachedObject;
  try {
    cached = path.extname(file) === '.json' ? readJsonCacheFile(file) : readXmlCacheFile(file);
  } catch (e) {
    const errorMessage = (e as Error).message;
    log('warn', 'org_describe: failed to parse cache file', { file, error: errorMessage });
    // The cache file is present but unreadable. Report exists=true so the caller
    // can distinguish "cache corrupt / unsupported format" from "object not cached"
    // (exists=false). field_count=0 since we have no parsed fields, and error_message
    // carries the underlying parse failure for diagnostics.
    return {
      name: objectName,
      exists: true,
      required_fields: [],
      field_count: 0,
      error_message: `Failed to parse cache file (${path.basename(file)}): ${errorMessage}`,
    };
  }

  const allFields = cached.fields ?? [];
  const filtered = fieldFilter === 'required' ? allFields.filter((f) => f.nillable === false) : allFields;

  const fields: OrgDescribeField[] = filtered.map((f) => ({
    name: f.name,
    type: f.type ?? 'unknown',
    default_value: f.defaultValue ?? null,
    nillable: f.nillable ?? true,
  }));

  return {
    name: cached.name ?? objectName,
    exists: true,
    required_fields: fields,
    field_count: allFields.length,
  };
}

/** Compute the mtime delta (ms) of a directory. Returns null on error. */
function cacheAgeMs(dir: string): number | null {
  try {
    const stat = fs.statSync(dir);
    return Math.max(0, Date.now() - stat.mtimeMs);
  } catch {
    return null;
  }
}

// ── Suggestion strings ────────────────────────────────────────────────────────

function cacheMissSuggestion(connectionName: string): string {
  return (
    `Open this project in Provar IDE and load the '${connectionName}' connection, ` +
    'or pass field-type hints inline to provar_testcase_generate.'
  );
}

// ── Core logic ────────────────────────────────────────────────────────────────

interface DescribeArgs {
  project_path: string;
  connection_name: string;
  objects?: string[];
  field_filter?: 'required' | 'all';
}

/**
 * Resolve & policy-check the workspace + connection directory.
 * Returns the connection directory if it exists and is allowed, otherwise null.
 */
function resolveConnectionDir(
  workspacePath: string | null,
  connectionName: string,
  allowedPaths: string[]
): { connectionDir: string | null; resolvedWorkspace: string | null } {
  if (!workspacePath) return { connectionDir: null, resolvedWorkspace: null };

  // Reject path-shaped connection names outright. A real connection name from a
  // .testproject is an identifier (e.g. "MyOrg"); any separator or traversal
  // segment is almost certainly a misuse or injection attempt.
  const hasSeparator = connectionName.includes('/') || connectionName.includes('\\');
  const hasTraversal = connectionName === '..' || connectionName.split(/[/\\]+/).includes('..');
  if (hasSeparator || hasTraversal) {
    throw new PathPolicyError(
      'PATH_TRAVERSAL',
      `Invalid connection_name (must not contain path separators or directory-traversal segments ('..')): ${connectionName}`
    );
  }

  // Path policy: workspace MUST be inside allowed paths before any fs call against it.
  const resolvedWorkspace = path.resolve(workspacePath);
  assertPathAllowed(resolvedWorkspace, allowedPaths);

  const connectionDir = path.resolve(resolvedWorkspace, '.metadata', connectionName);
  // Belt-and-braces check after composition.
  assertPathAllowed(connectionDir, allowedPaths);

  if (!fs.existsSync(connectionDir) || !fs.statSync(connectionDir).isDirectory()) {
    return { connectionDir: null, resolvedWorkspace };
  }
  return { connectionDir, resolvedWorkspace };
}

function buildCacheMissResponse(
  resolvedWorkspace: string | null,
  args: DescribeArgs,
  requestId: string
): Record<string, unknown> {
  const objects: OrgDescribeObject[] = (args.objects ?? []).map((name) => ({
    name,
    exists: null,
    required_fields: [],
    field_count: 0,
  }));
  return {
    requestId,
    workspace_path: resolvedWorkspace,
    cache_age_ms: null,
    objects,
    details: { suggestion: cacheMissSuggestion(args.connection_name) },
  };
}

function buildHappyResponse(
  resolvedWorkspace: string,
  connectionDir: string,
  args: DescribeArgs,
  requestId: string
): Record<string, unknown> {
  const fieldFilter = args.field_filter ?? 'required';
  const requestedNames = args.objects?.length ? args.objects : listCachedObjectNames(connectionDir);
  const objects = requestedNames.map((name) => readObject(connectionDir, name, fieldFilter));
  return {
    requestId,
    workspace_path: resolvedWorkspace,
    cache_age_ms: cacheAgeMs(connectionDir),
    objects,
  };
}

// ── Tool registration ─────────────────────────────────────────────────────────

export function registerOrgDescribe(server: McpServer, config: ServerConfig): void {
  server.registerTool(
    'provar_org_describe',
    {
      title: 'Describe Org Objects From Workspace Cache',
      description: desc(
        [
          'Read cached Salesforce describe data for one connection from the Provar workspace .metadata cache.',
          'Prerequisite: the project must have been opened in Provar IDE at least once with the named connection loaded',
          '— this tool is read-only and does NOT trigger a metadata download.',
          'Workspace discovery tries in order: <parent>/workspace-<basename>, ',
          '<parent>/Provar_Workspaces/workspace-<name-dashes>, then ~/Provar/workspace-<name-dashes>.',
          'Returns an empty result with details.suggestion when the cache is missing.',
          'Distinct from the runtime .provarCaches cache used by test execution.',
        ].join(' '),
        'Read cached describe data for one connection from the Provar workspace .metadata cache.'
      ),
      inputSchema: {
        project_path: z
          .string()
          .describe(
            desc(
              'Absolute path to the Provar test project root (the directory containing .testproject). Must be within --allowed-paths.',
              'string, absolute path to Provar test project root'
            )
          ),
        connection_name: z
          .string()
          .describe(
            desc(
              'Connection name as defined in the .testproject file (e.g. "MyOrg"). The .metadata cache subdirectory must match this exactly.',
              'string, connection name as defined in .testproject'
            )
          ),
        objects: z
          .array(z.string())
          .optional()
          .describe(
            desc(
              'Optional filter — only return data for these object API names (e.g. ["Account","Contact"]). When omitted, lists all cached objects for the connection.',
              'string[], optional; restrict to these object API names'
            )
          ),
        field_filter: z
          .enum(['required', 'all'])
          .optional()
          .default('required')
          .describe(
            desc(
              'Which fields to include. "required" (default) returns only fields with nillable=false; "all" returns every cached field.',
              "'required' | 'all'; default 'required'"
            )
          ),
      },
    },
    (args: DescribeArgs) => {
      const requestId = makeRequestId();
      log('info', 'provar_org_describe', {
        requestId,
        connection_name: args.connection_name,
        object_count: args.objects?.length ?? null,
      });

      try {
        assertPathAllowed(args.project_path, config.allowedPaths);
        const workspacePath = discoverWorkspace(args.project_path, config.allowedPaths);
        const { connectionDir, resolvedWorkspace } = resolveConnectionDir(
          workspacePath,
          args.connection_name,
          config.allowedPaths
        );

        if (!connectionDir) {
          const response = buildCacheMissResponse(resolvedWorkspace, args, requestId);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(response) }],
            structuredContent: response,
          };
        }

        const response = buildHappyResponse(resolvedWorkspace!, connectionDir, args, requestId);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
      } catch (err: unknown) {
        const error = err as Error & { code?: string };
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                makeError(
                  error instanceof PathPolicyError ? error.code : error.code ?? 'ORG_DESCRIBE_ERROR',
                  error.message,
                  requestId
                )
              ),
            },
          ],
        };
      }
    }
  );
}

export function registerAllOrgDescribeTools(server: McpServer, config: ServerConfig): void {
  registerOrgDescribe(server, config);
}
