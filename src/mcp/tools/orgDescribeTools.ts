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
 * Two layouts are supported, IDE layout first (preferred), then the legacy/native layout:
 *
 *  1. Provar IDE SfObject layout (what the IDE actually writes today):
 *       <workspace>/.metadata/.plugins/com.provar.eclipse.ui/<connection>/<env>/SfObject/<Object>.xml
 *     One file per object, root element <sfObject>, fields under <sfObject><fields><sfField .../>.
 *     `<env>` is the test environment name (e.g. "default", "UAT"); defaults to "default".
 *
 *  2. Legacy / native layout (kept for backward compatibility):
 *       <workspace>/.metadata/<connection_name>/<ObjectApiName>.{json,xml,object}
 *     JSON files contain { name, fields: [ { name, type, defaultValue, nillable }, ... ] };
 *     .xml / .object files are CustomObject / toolingObjectInfo metadata.
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

// Single parser instance handles BOTH on-disk XML formats:
//   - legacy CustomObject / toolingObjectInfo: <fields> repeats directly under the root,
//     so `fields` must always be coerced to an array.
//   - Provar IDE SfObject: a single <fields> container holds repeated <sfField> elements,
//     so `sfField` must also be coerced to an array.
// The two element names never collide within one document, so arraying both is safe.
const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  isArray: (name): boolean => name === 'fields' || name === 'sfField',
});

/** Parse a JSON cache file into the canonical CachedObject shape. */
function readJsonCacheFile(filePath: string): CachedObject {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as CachedObject;
}

/**
 * Parse the Provar IDE SfObject XML format into the canonical shape.
 *
 * Layout: <sfObject n="..." t="..."><fields><sfField n="..." type="..." required="..."/></fields>...
 * Attribute mapping (fast-xml-parser prefixes attributes with `@_`):
 * name ← `@_n` (required; a field with no name is skipped).
 * type ← `@_type` (may be absent → 'unknown'; SF booleans appear as '_boolean').
 * nillable ← NOT(`@_required === 'true'`) (required="true" → nillable=false).
 * default_value ← null (this format carries no defaultValue attribute).
 * The display name is taken from the sfObject `@_t`, else `@_n`, else the file basename.
 * Stub files (detailsLoaded="false", no <fields>) yield an empty field list — exists=true,
 * field_count=0 — rather than an error.
 */
function readSfObjectXml(sfObject: Record<string, unknown>, fallbackName: string): CachedObject {
  const displayName =
    (sfObject['@_t'] as string | undefined) ?? (sfObject['@_n'] as string | undefined) ?? fallbackName;

  // <fields> is arrayed by XML_PARSER; the (single) container holds the <sfField> children.
  const fieldsContainers = sfObject['fields'];
  if (!Array.isArray(fieldsContainers) || fieldsContainers.length === 0) {
    return { name: displayName, fields: [] };
  }
  const container = fieldsContainers[0] as Record<string, unknown>;
  const sfFieldsRaw = container['sfField'];
  if (!Array.isArray(sfFieldsRaw)) return { name: displayName, fields: [] };

  const fields: CachedField[] = [];
  for (const f of sfFieldsRaw as Array<Record<string, unknown>>) {
    const name = f['@_n'] as string | undefined;
    if (!name) continue; // skip nameless container artefacts
    // required="true" → nillable=false; absent → nillable=true (optional).
    const isRequired = f['@_required'] === 'true' || f['@_required'] === true;
    fields.push({
      name,
      type: (f['@_type'] as string | undefined) ?? 'unknown',
      defaultValue: null,
      nillable: !isRequired,
    });
  }
  return { name: displayName, fields };
}

/**
 * Parse a legacy CustomObject / toolingObjectInfo .xml/.object file into the canonical shape.
 * Only extracts the bare minimum the tool needs: field name, type, nillable.
 */
function readCustomObjectXml(root: Record<string, unknown>, fallbackName: string): CachedObject {
  const fieldsRaw = root['fields'];
  if (!Array.isArray(fieldsRaw)) return { name: fallbackName, fields: [] };

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
  return { name: fallbackName, fields };
}

/**
 * Parse an XML cache file into the canonical CachedObject shape. Detects the format from
 * the root element: <sfObject> (Provar IDE layout) vs <CustomObject>/<toolingObjectInfo>
 * (legacy/native layout).
 */
function readXmlCacheFile(filePath: string): CachedObject {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = XML_PARSER.parse(raw) as Record<string, unknown>;
  const fallbackName = path.basename(filePath, path.extname(filePath));

  const sfObject = parsed['sfObject'];
  if (sfObject && typeof sfObject === 'object') {
    return readSfObjectXml(sfObject as Record<string, unknown>, fallbackName);
  }

  const root = (parsed['CustomObject'] ?? parsed['toolingObjectInfo'] ?? {}) as Record<string, unknown>;
  return readCustomObjectXml(root, fallbackName);
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
  environment?: string;
  objects?: string[];
  field_filter?: 'required' | 'all';
}

/** Eclipse plugin id under which the Provar IDE writes its SfObject metadata cache. */
const ECLIPSE_UI_PLUGIN = 'com.provar.eclipse.ui';
const DEFAULT_ENVIRONMENT = 'default';

/** True when dir exists and is a directory (any error → false). */
function isExistingDir(dir: string): boolean {
  try {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Reject path-shaped connection / environment names outright. A real connection or
 * environment name is an identifier (e.g. "MyOrg", "UAT"); any separator or traversal
 * segment is almost certainly a misuse or injection attempt.
 */
function assertIdentifier(value: string, fieldName: string): void {
  const hasSeparator = value.includes('/') || value.includes('\\');
  const hasTraversal = value === '..' || value.split(/[/\\]+/).includes('..');
  if (hasSeparator || hasTraversal) {
    throw new PathPolicyError(
      'PATH_TRAVERSAL',
      `Invalid ${fieldName} (must not contain path separators or directory-traversal segments ('..')): ${value}`
    );
  }
}

/**
 * Resolve the Provar IDE SfObject cache directory for a connection + environment, if present.
 *
 * Layout: <workspace>/.metadata/.plugins/com.provar.eclipse.ui/<connection>/<env>/SfObject
 * Resolution: try the requested <env> first; if its SfObject dir is missing, scan the
 * connection dir for ANY <envDir>/SfObject that exists (preferring `default`).
 *
 * Path policy is enforced on the eclipse.ui dir, the connection dir, and every candidate
 * SfObject dir before any further filesystem call against it. Returns null when no usable
 * SfObject directory exists under policy.
 */
function resolveSfObjectDir(
  resolvedWorkspace: string,
  connectionName: string,
  environment: string,
  allowedPaths: string[]
): string | null {
  const pluginDir = path.resolve(resolvedWorkspace, '.metadata', '.plugins', ECLIPSE_UI_PLUGIN);
  assertPathAllowed(pluginDir, allowedPaths);

  const connectionDir = path.resolve(pluginDir, connectionName);
  assertPathAllowed(connectionDir, allowedPaths);
  if (!isExistingDir(connectionDir)) return null;

  // Build ordered env candidates: requested env first, then `default`, then any others.
  const requested = path.resolve(connectionDir, environment, 'SfObject');
  assertPathAllowed(requested, allowedPaths);
  if (isExistingDir(requested)) return requested;

  let envDirs: string[];
  try {
    envDirs = fs.readdirSync(connectionDir);
  } catch {
    return null;
  }
  // Prefer `default`, then alphabetical for determinism.
  const ordered = [...envDirs].sort((a, b) => {
    if (a === DEFAULT_ENVIRONMENT) return -1;
    if (b === DEFAULT_ENVIRONMENT) return 1;
    return a.localeCompare(b);
  });
  for (const env of ordered) {
    if (env === environment) continue; // already tried
    const candidate = path.resolve(connectionDir, env, 'SfObject');
    try {
      assertPathAllowed(candidate, allowedPaths);
    } catch {
      continue; // outside policy — skip silently
    }
    if (isExistingDir(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolve & policy-check the workspace + cache directory.
 *
 * Prefers the Provar IDE SfObject layout
 * (`<workspace>/.metadata/.plugins/com.provar.eclipse.ui/<connection>/<env>/SfObject`),
 * falling back to the legacy/native layout (`<workspace>/.metadata/<connection_name>`).
 * Returns the cache directory if one exists and is allowed, otherwise null.
 */
function resolveConnectionDir(
  workspacePath: string | null,
  connectionName: string,
  environment: string,
  allowedPaths: string[]
): { connectionDir: string | null; resolvedWorkspace: string | null } {
  if (!workspacePath) return { connectionDir: null, resolvedWorkspace: null };

  assertIdentifier(connectionName, 'connection_name');
  assertIdentifier(environment, 'environment');

  // Path policy: workspace MUST be inside allowed paths before any fs call against it.
  const resolvedWorkspace = path.resolve(workspacePath);
  assertPathAllowed(resolvedWorkspace, allowedPaths);

  // Preferred: Provar IDE SfObject layout.
  const sfObjectDir = resolveSfObjectDir(resolvedWorkspace, connectionName, environment, allowedPaths);
  if (sfObjectDir) return { connectionDir: sfObjectDir, resolvedWorkspace };

  // Fallback: legacy/native <workspace>/.metadata/<connection_name>.
  const legacyDir = path.resolve(resolvedWorkspace, '.metadata', connectionName);
  // Belt-and-braces check after composition.
  assertPathAllowed(legacyDir, allowedPaths);
  if (!isExistingDir(legacyDir)) {
    return { connectionDir: null, resolvedWorkspace };
  }
  return { connectionDir: legacyDir, resolvedWorkspace };
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
          '(and, for the named test environment, the relevant objects expanded) — this tool is read-only and does NOT trigger a metadata download.',
          'Workspace discovery tries in order: <parent>/workspace-<basename>, ',
          '<parent>/Provar_Workspaces/workspace-<name-dashes>, then ~/Provar/workspace-<name-dashes>.',
          'Within the workspace it prefers the Provar IDE SfObject cache at',
          '.metadata/.plugins/com.provar.eclipse.ui/<connection>/<environment>/SfObject/<Object>.xml',
          '(environment defaults to "default"; if the requested environment is absent it falls back to any cached environment),',
          'and falls back to the legacy .metadata/<connection_name>/<Object>.{json,xml,object} layout.',
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
              'Connection name as defined in the .testproject file (e.g. "MyOrg"). The cache subdirectory must match this exactly. String identifier, NOT a file path — path separators or ".." are rejected (PATH_TRAVERSAL).',
              'string, connection name as defined in .testproject'
            )
          ),
        environment: z
          .string()
          .optional()
          .default('default')
          .describe(
            desc(
              'Test environment name whose cached metadata to read in the Provar IDE SfObject layout (e.g. "default", "UAT"). Defaults to "default". If the requested environment has no cached metadata, the tool falls back to any environment that does (preferring "default"). Ignored for the legacy .metadata/<connection_name> layout. String identifier, NOT a file path — path separators or ".." are rejected (PATH_TRAVERSAL).',
              "string, test environment name; default 'default'"
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
          args.environment ?? DEFAULT_ENVIRONMENT,
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
