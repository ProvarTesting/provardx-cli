/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from '../server.js';
import { assertPathAllowed, PathPolicyError } from '../security/pathPolicy.js';
import { makeError, makeRequestId, type ValidationIssue } from '../schemas/common.js';
import { log } from '../logging/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NitroXIssue extends ValidationIssue {
  field?: string;
}

interface NitroXValidationResult {
  valid: boolean;
  score: number;
  issue_count: number;
  issues: NitroXIssue[];
}

type JsonObj = Record<string, unknown>;

function isObj(v: unknown): v is JsonObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ── Directory Utilities ───────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', '.git']);

/**
 * Recursively walk directories looking for .testproject marker files.
 * Skips node_modules, .git, and hidden dirs (names starting with '.').
 */
function findProvarProjects(roots: string[], maxDepth: number): string[] {
  const projects: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;
    if (fs.existsSync(path.join(dir, '.testproject'))) {
      projects.push(dir);
      return; // don't recurse into a found project
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), depth + 1);
    }
  }

  for (const root of roots) {
    try {
      if (!fs.existsSync(root)) continue;
      walk(root, 0);
    } catch {
      // Root inaccessible — skip gracefully
    }
  }
  return projects;
}

/** Collect all *.po.json files under a directory, recursively. */
function collectPoJsonFiles(dir: string): string[] {
  const files: string[] = [];
  function walk(d: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(d, entry.name));
      } else if (entry.isFile() && entry.name.endsWith('.po.json')) {
        files.push(path.join(d, entry.name));
      }
    }
  }
  walk(dir);
  return files;
}

// ── NitroX Validator ─────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_COMPARISON_TYPES = ['equals', 'starts-with', 'contains'];
const INTERACTION_NAME_RE = /^[A-Za-z0-9\s]*$/;

/** Validate root-level scalar properties (NX001, NX002, NX003, NX010). */
function validateRootProperties(obj: JsonObj, issues: NitroXIssue[]): void {
  // NX001: componentId must be present and a valid UUID
  if (obj['componentId'] === undefined || obj['componentId'] === null) {
    issues.push({
      rule_id: 'NX001', severity: 'ERROR',
      message: 'componentId is required.',
      applies_to: 'root', field: 'componentId',
    });
  } else if (typeof obj['componentId'] !== 'string' || !UUID_RE.test(obj['componentId'])) {
    issues.push({
      rule_id: 'NX001', severity: 'ERROR',
      message: `componentId must be a valid UUID, got: "${String(obj['componentId'])}".`,
      applies_to: 'root', field: 'componentId',
    });
  }

  // NX002: Root (no parentId) requires name, type, pageStructureElement, fieldDetailsElement
  const hasParentId = obj['parentId'] !== undefined && obj['parentId'] !== null;
  if (!hasParentId) {
    for (const field of ['name', 'type', 'pageStructureElement', 'fieldDetailsElement'] as const) {
      if (obj[field] === undefined || obj[field] === null) {
        issues.push({
          rule_id: 'NX002', severity: 'ERROR',
          message: `Root component requires "${field}".`,
          applies_to: 'root', field,
          suggestion: `Add a "${field}" property to the root component object.`,
        });
      }
    }
  }

  // NX003: tagName must not contain whitespace
  if (typeof obj['tagName'] === 'string' && /\s/.test(obj['tagName'])) {
    issues.push({
      rule_id: 'NX003', severity: 'ERROR',
      message: 'tagName should not contain spaces.',
      applies_to: 'root', field: 'tagName',
      suggestion: 'Remove whitespace from tagName.',
    });
  }

  // NX010: bodyTagName (if present) must not contain whitespace
  if (typeof obj['bodyTagName'] === 'string' && /\s/.test(obj['bodyTagName'])) {
    issues.push({
      rule_id: 'NX010', severity: 'INFO',
      message: 'bodyTagName should not contain spaces.',
      applies_to: 'root', field: 'bodyTagName',
      suggestion: 'Remove whitespace from bodyTagName.',
    });
  }
}

/** Validate a parsed NitroX .po.json object against schema-derived rules. */
export function validateNitroXContent(obj: JsonObj): NitroXValidationResult {
  const issues: NitroXIssue[] = [];

  validateRootProperties(obj, issues);

  // Validate root-level parameters
  if (Array.isArray(obj['parameters'])) {
    for (const param of obj['parameters']) {
      if (isObj(param)) validateParameter(param, 'root', issues);
    }
  }

  // Validate root-level interactions
  if (Array.isArray(obj['interactions'])) {
    for (const interaction of obj['interactions']) {
      if (isObj(interaction)) validateInteraction(interaction, 'root', issues);
    }
  }

  // Validate root-level selectors
  if (Array.isArray(obj['selectors'])) {
    for (const sel of obj['selectors']) {
      if (isObj(sel)) validateSelector(sel, issues);
    }
  }

  // Validate elements recursively
  if (Array.isArray(obj['elements'])) {
    for (const el of obj['elements']) {
      if (isObj(el)) validateElement(el, issues);
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'ERROR').length;
  const warningCount = issues.filter((i) => i.severity === 'WARNING').length;
  const infoCount = issues.filter((i) => i.severity === 'INFO').length;
  const score = Math.max(0, 100 - 20 * errorCount - 5 * warningCount - 1 * infoCount);

  return { valid: errorCount === 0, score, issue_count: issues.length, issues };
}

function validateElement(el: JsonObj, issues: NitroXIssue[]): void {
  // NX007: Element should have type
  if (!el['type']) {
    issues.push({
      rule_id: 'NX007', severity: 'WARNING',
      message: 'Element is missing required "type".',
      applies_to: 'element',
      suggestion: 'Add a "type" field to the element (e.g. "content" or "component::UUID").',
    });
  }

  if (Array.isArray(el['selectors'])) {
    for (const sel of el['selectors']) {
      if (isObj(sel)) validateSelector(sel, issues);
    }
  }
  if (Array.isArray(el['interactions'])) {
    for (const interaction of el['interactions']) {
      if (isObj(interaction)) validateInteraction(interaction, 'element', issues);
    }
  }
  if (Array.isArray(el['parameters'])) {
    for (const param of el['parameters']) {
      if (isObj(param)) validateParameter(param, 'element', issues);
    }
  }
  if (Array.isArray(el['elements'])) {
    for (const nested of el['elements']) {
      if (isObj(nested)) validateElement(nested, issues);
    }
  }
}

function validateInteraction(interaction: JsonObj, context: string, issues: NitroXIssue[]): void {
  // NX004: required fields
  for (const field of ['defaultInteraction', 'interactionType', 'name', 'testStepTitlePattern', 'title'] as const) {
    if (interaction[field] === undefined || interaction[field] === null) {
      issues.push({
        rule_id: 'NX004', severity: 'ERROR',
        message: `Interaction in ${context} missing required field "${field}".`,
        applies_to: 'interaction', field,
      });
    }
  }
  if (!Array.isArray(interaction['implementations']) || interaction['implementations'].length === 0) {
    issues.push({
      rule_id: 'NX004', severity: 'ERROR',
      message: `Interaction in ${context} must have at least one implementation.`,
      applies_to: 'interaction', field: 'implementations',
    });
  } else {
    for (const impl of interaction['implementations']) {
      if (isObj(impl)) validateImplementation(impl, context, issues);
    }
  }

  // NX009: name should match ^[A-Za-z0-9\s]*$
  if (typeof interaction['name'] === 'string' && !INTERACTION_NAME_RE.test(interaction['name'])) {
    issues.push({
      rule_id: 'NX009', severity: 'INFO',
      message: `Interaction name "${interaction['name']}" should contain only alphanumeric characters and spaces.`,
      applies_to: 'interaction', field: 'name',
      suggestion: 'Remove special characters from the interaction name.',
    });
  }
}

function validateImplementation(impl: JsonObj, context: string, issues: NitroXIssue[]): void {
  // NX005: must have javaScriptSnippet
  if (!impl['javaScriptSnippet']) {
    issues.push({
      rule_id: 'NX005', severity: 'ERROR',
      message: `Implementation in ${context} missing required "javaScriptSnippet".`,
      applies_to: 'implementation', field: 'javaScriptSnippet',
    });
  }
}

function validateSelector(sel: JsonObj, issues: NitroXIssue[]): void {
  // NX006: must have xpath
  if (!sel['xpath']) {
    issues.push({
      rule_id: 'NX006', severity: 'ERROR',
      message: 'Selector missing required "xpath".',
      applies_to: 'selector', field: 'xpath',
      suggestion: 'Add an "xpath" property to the selector.',
    });
  }
}

function validateParameter(param: JsonObj, context: string, issues: NitroXIssue[]): void {
  // NX008: comparisonType must be one of valid enum values
  if (param['comparisonType'] !== undefined && !VALID_COMPARISON_TYPES.includes(String(param['comparisonType']))) {
    issues.push({
      rule_id: 'NX008', severity: 'WARNING',
      message: `Parameter in ${context} has invalid comparisonType "${String(param['comparisonType'])}". Must be one of: ${VALID_COMPARISON_TYPES.join(', ')}.`,
      applies_to: 'parameter', field: 'comparisonType',
      suggestion: `Use one of: ${VALID_COMPARISON_TYPES.join(', ')}`,
    });
  }
}

// ── Generate Builder ──────────────────────────────────────────────────────────

interface ParameterInput {
  name: string;
  value: string;
  comparisonType?: string;
  default?: boolean;
}

interface ElementInput {
  label: string;
  type_ref: string;
  tag_name?: string;
  parameters?: ParameterInput[];
  selector_xpath?: string;
}

interface GenerateInput {
  name: string;
  tag_name: string;
  type: 'Block' | 'Page';
  page_structure_element: boolean;
  field_details_element: boolean;
  parameters?: ParameterInput[];
  elements?: ElementInput[];
}

function buildNitroXJson(input: GenerateInput): JsonObj {
  const result: JsonObj = {
    componentId: randomUUID(),
    name: input.name,
    tagName: input.tag_name,
    type: input.type,
    pageStructureElement: input.page_structure_element,
    fieldDetailsElement: input.field_details_element,
  };

  if (input.parameters && input.parameters.length > 0) {
    result['parameters'] = input.parameters.map((p, i) => ({
      name: p.name,
      value: p.value,
      ...(p.comparisonType !== undefined && { comparisonType: p.comparisonType }),
      ...(p.default !== undefined && { default: p.default }),
      index: i,
    }));
  }

  if (input.elements && input.elements.length > 0) {
    result['elements'] = input.elements.map((el) => buildElement(el));
  }

  return result;
}

function buildElement(el: ElementInput): JsonObj {
  const element: JsonObj = {
    componentId: randomUUID(),
    type: el.type_ref,
    label: el.label,
  };

  if (el.tag_name) {
    element['elementTagName'] = el.tag_name;
  }
  if (el.parameters && el.parameters.length > 0) {
    element['parameters'] = el.parameters.map((p, i) => ({
      name: p.name,
      value: p.value,
      ...(p.comparisonType !== undefined && { comparisonType: p.comparisonType }),
      ...(p.default !== undefined && { default: p.default }),
      index: i,
    }));
  }
  if (el.selector_xpath) {
    element['selectors'] = [{ xpath: el.selector_xpath }];
  }

  return element;
}

// ── RFC 7396 Merge-Patch ──────────────────────────────────────────────────────

function applyMergePatch(target: JsonObj, patch: JsonObj): JsonObj {
  const result: JsonObj = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete result[key];
    } else if (isObj(value) && isObj(result[key])) {
      result[key] = applyMergePatch(result[key] as JsonObj, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ── Tool Registrations ────────────────────────────────────────────────────────

export function registerNitroXDiscover(server: McpServer): void {
  server.tool(
    'provar.nitrox.discover',
    [
      'Discover Provar projects containing NitroX (Hybrid Model) page objects.',
      'Scans directories for .testproject marker files, then inventories nitroX/ and nitroXPackages/ directories.',
      'NitroX is Provar\'s Hybrid Model for locators — component-based page objects for LWC,',
      'Screen Flow, Industry Components, Experience Cloud, and HTML5 components.',
      'Results provide file paths and package info for use with provar.nitrox.read, validate, and generate.',
    ].join(' '),
    {
      search_roots: z
        .array(z.string())
        .optional()
        .describe('Directories to scan (default: cwd; if empty, falls back to ~/git and ~/Provar)'),
      max_depth: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(6)
        .describe('Maximum directory depth for .testproject search'),
      include_packages: z
        .boolean()
        .default(true)
        .describe('Include nitroXPackages/ package.json metadata in results'),
    },
    ({ search_roots, max_depth, include_packages }) => {
      const requestId = makeRequestId();
      log('info', 'provar.nitrox.discover', { requestId, search_roots, max_depth });

      try {
        let roots = search_roots && search_roots.length > 0 ? search_roots : [process.cwd()];
        let projects = findProvarProjects(roots, max_depth);

        // If no .testproject found in cwd, widen to home-dir defaults
        if (projects.length === 0 && (!search_roots || search_roots.length === 0)) {
          const fallbackRoots = [
            path.join(os.homedir(), 'git'),
            path.join(os.homedir(), 'Provar'),
          ];
          const fallbackProjects = findProvarProjects(fallbackRoots, max_depth);
          if (fallbackProjects.length > 0) {
            projects = fallbackProjects;
            roots = fallbackRoots;
          }
        }

        const projectResults = projects.map((projectPath) => {
          const nitroxDir = path.join(projectPath, 'nitroX');
          const packagesDir = path.join(projectPath, 'nitroXPackages');
          const hasNitrox = fs.existsSync(nitroxDir);
          const hasPackages = fs.existsSync(packagesDir);
          const nitroxFiles = hasNitrox ? collectPoJsonFiles(nitroxDir) : [];

          let packages: Array<{ path: string; name?: string; error?: string }> = [];
          if (include_packages && hasPackages) {
            try {
              packages = fs
                .readdirSync(packagesDir, { withFileTypes: true })
                .filter((e) => e.isDirectory())
                .map((e) => {
                  const pkgDir = path.join(packagesDir, e.name);
                  const pkgJson = path.join(pkgDir, 'package.json');
                  if (!fs.existsSync(pkgJson)) return { path: pkgDir };
                  try {
                    const parsed = JSON.parse(fs.readFileSync(pkgJson, 'utf-8')) as JsonObj;
                    return { path: pkgDir, name: String(parsed['name'] ?? '') };
                  } catch {
                    return { path: pkgDir, error: 'invalid JSON' };
                  }
                });
            } catch {
              // packagesDir inaccessible — return empty packages
            }
          }

          return {
            project_path: projectPath,
            nitrox_dir: hasNitrox ? nitroxDir : null,
            nitrox_file_count: nitroxFiles.length,
            nitrox_files: nitroxFiles,
            packages_dir: hasPackages ? packagesDir : null,
            packages,
          };
        });

        const result = { requestId, projects: projectResults, searched_roots: roots };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (err: unknown) {
        const error = err as Error;
        const errResult = makeError('DISCOVER_ERROR', error.message, requestId, false);
        log('error', 'provar.nitrox.discover failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}

export function registerNitroXRead(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.nitrox.read',
    [
      'Read one or more NitroX .po.json (Hybrid Model page object) files and return their parsed content.',
      'Use this to load examples before generating or validating.',
      'Provide file_paths for specific files, or project_path to read all .po.json files from a project\'s nitroX/ directory.',
    ].join(' '),
    {
      file_paths: z.array(z.string()).optional().describe('Specific .po.json file paths to read'),
      project_path: z
        .string()
        .optional()
        .describe('Provar project path — reads all .po.json files from nitroX/ directory'),
      max_files: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe('Maximum number of files to return (prevents context overflow)'),
    },
    ({ file_paths, project_path, max_files }) => {
      const requestId = makeRequestId();
      log('info', 'provar.nitrox.read', {
        requestId,
        file_count: file_paths?.length,
        project_path,
      });

      try {
        if (!file_paths?.length && !project_path) {
          const err = makeError('MISSING_INPUT', 'Provide either file_paths or project_path.', requestId);
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
        }

        let targets: string[] = [];

        if (file_paths?.length) {
          targets = file_paths;
        } else if (project_path) {
          assertPathAllowed(project_path, config.allowedPaths);
          const resolved = path.resolve(project_path);
          if (!fs.existsSync(resolved)) {
            const err = makeError('FILE_NOT_FOUND', `Project path not found: ${resolved}`, requestId);
            return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
          }
          const nitroxDir = path.join(resolved, 'nitroX');
          if (!fs.existsSync(nitroxDir)) {
            const err = makeError(
              'FILE_NOT_FOUND',
              `No nitroX/ directory found in: ${resolved}`,
              requestId
            );
            return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
          }
          targets = collectPoJsonFiles(nitroxDir);
        }

        const truncated = targets.length > max_files;
        const toRead = targets.slice(0, max_files);

        const files = toRead.map((filePath) => {
          const resolved = path.resolve(filePath);
          try {
            assertPathAllowed(resolved, config.allowedPaths);
          } catch (e: unknown) {
            const policyErr = e as PathPolicyError;
            return { file_path: resolved, error: policyErr.message, content: null, size_bytes: 0 };
          }
          if (!fs.existsSync(resolved)) {
            return { file_path: resolved, error: 'FILE_NOT_FOUND', content: null, size_bytes: 0 };
          }
          try {
            const raw = fs.readFileSync(resolved, 'utf-8');
            const content = JSON.parse(raw) as unknown;
            return { file_path: resolved, content, size_bytes: raw.length };
          } catch {
            return { file_path: resolved, error: 'PARSE_ERROR', content: null, size_bytes: 0 };
          }
        });

        const result = { requestId, files, truncated, total_found: targets.length };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (err: unknown) {
        const error = err as Error & { code?: string };
        const errResult = makeError(
          error instanceof PathPolicyError ? error.code : 'READ_ERROR',
          error.message,
          requestId,
          false
        );
        log('error', 'provar.nitrox.read failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}

export function registerNitroXValidate(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.nitrox.validate',
    [
      'Validate a NitroX .po.json (Hybrid Model component page object) against schema rules.',
      'Works for any NitroX-mapped component type: LWC, Screen Flow, Industry Components, Experience Cloud, HTML5.',
      'Returns a quality score (0–100) and a list of issues with rule IDs (NX001–NX010), severity, and suggestions.',
      'Score formula: 100 − (20 × errors) − (5 × warnings) − (1 × infos).',
    ].join(' '),
    {
      content: z.string().optional().describe('JSON string of the .po.json content to validate'),
      file_path: z.string().optional().describe('Path to a .po.json file to validate'),
    },
    ({ content, file_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar.nitrox.validate', { requestId, has_content: !!content, file_path });

      try {
        let source = content;

        if (!source && file_path) {
          assertPathAllowed(file_path, config.allowedPaths);
          const resolved = path.resolve(file_path);
          if (!fs.existsSync(resolved)) {
            const err = makeError('FILE_NOT_FOUND', `File not found: ${resolved}`, requestId);
            return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
          }
          source = fs.readFileSync(resolved, 'utf-8');
        }

        if (!source) {
          const err = makeError('MISSING_INPUT', 'Provide either content or file_path.', requestId);
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(source);
        } catch {
          const err = makeError('NX000', 'Invalid JSON: could not parse content.', requestId);
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
        }

        if (!isObj(parsed)) {
          const err = makeError('NX000', 'Content must be a JSON object.', requestId);
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
        }

        const validation = validateNitroXContent(parsed);
        const result = { requestId, ...validation };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (err: unknown) {
        const error = err as Error & { code?: string };
        const errResult = makeError(
          error instanceof PathPolicyError ? error.code : 'VALIDATE_ERROR',
          error.message,
          requestId,
          false
        );
        log('error', 'provar.nitrox.validate failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}

const ParameterInputSchema = z.object({
  name: z.string().describe('Parameter/qualifier name'),
  value: z.string().describe('Parameter value'),
  comparisonType: z.enum(['equals', 'starts-with', 'contains']).optional(),
  default: z.boolean().optional().describe('Whether this is the default parameter value'),
});

const ElementInputSchema = z.object({
  label: z.string().describe('Human-readable element label'),
  type_ref: z
    .string()
    .describe('Component type reference (e.g. "component::UUID" or "content")'),
  tag_name: z.string().optional().describe('Optional HTML/LWC tag name override'),
  parameters: z.array(ParameterInputSchema).optional(),
  selector_xpath: z.string().optional().describe('XPath selector for this element'),
});

export function registerNitroXGenerate(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.nitrox.generate',
    [
      'Generate a new NitroX .po.json (Hybrid Model page object) from a component description.',
      'Applicable to any component type supported by Provar\'s Hybrid Model:',
      'LWC, Screen Flow, Industry Components, Experience Cloud, HTML5.',
      'All componentId fields are assigned fresh UUIDs. Returns JSON content;',
      'writes to disk only when dry_run=false.',
    ].join(' '),
    {
      name: z
        .string()
        .describe('Path-like component name, e.g. /com/force/myapp/ButtonComponent'),
      tag_name: z
        .string()
        .describe('LWC or HTML tag name, e.g. lightning-button or c-my-component'),
      type: z.enum(['Block', 'Page']).default('Block').describe('Component type'),
      page_structure_element: z
        .boolean()
        .default(true)
        .describe('Whether this is a page structure element'),
      field_details_element: z
        .boolean()
        .default(false)
        .describe('Whether this is a field details element'),
      parameters: z.array(ParameterInputSchema).optional().describe('Component parameters/qualifiers'),
      elements: z.array(ElementInputSchema).optional().describe('Child elements'),
      output_path: z
        .string()
        .optional()
        .describe('File path to write (requires dry_run=false)'),
      overwrite: z.boolean().default(false).describe('Overwrite if output_path already exists'),
      dry_run: z
        .boolean()
        .default(true)
        .describe('Return JSON without writing to disk (default)'),
    },
    (input) => {
      const requestId = makeRequestId();
      log('info', 'provar.nitrox.generate', { requestId, name: input.name, dry_run: input.dry_run });

      try {
        const generated = buildNitroXJson({
          name: input.name,
          tag_name: input.tag_name,
          type: input.type,
          page_structure_element: input.page_structure_element,
          field_details_element: input.field_details_element,
          parameters: input.parameters,
          elements: input.elements,
        });
        const content = JSON.stringify(generated, null, 2);
        let filePath: string | undefined;
        let written = false;

        if (input.output_path && !input.dry_run) {
          filePath = path.resolve(input.output_path);
          assertPathAllowed(filePath, config.allowedPaths);
          if (fs.existsSync(filePath) && !input.overwrite) {
            const err = makeError(
              'FILE_EXISTS',
              `File already exists: ${filePath}. Set overwrite=true to replace.`,
              requestId
            );
            return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
          }
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, content, 'utf-8');
          written = true;
          log('info', 'provar.nitrox.generate: wrote file', { requestId, filePath });
        }

        const result = { requestId, content, file_path: filePath, written, dry_run: input.dry_run };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (err: unknown) {
        const error = err as Error & { code?: string };
        const errResult = makeError(
          error instanceof PathPolicyError ? error.code : (error.code ?? 'GENERATE_ERROR'),
          error.message,
          requestId,
          false
        );
        log('error', 'provar.nitrox.generate failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}

export function registerNitroXPatch(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.nitrox.patch',
    [
      'Apply a JSON merge-patch (RFC 7396) to an existing NitroX .po.json file.',
      'Reads the file, merges the patch (null values remove keys, other values replace or recurse into objects),',
      'optionally validates the merged result, and writes back.',
      'Use dry_run=true (default) to preview the merged output without writing.',
    ].join(' '),
    {
      file_path: z.string().describe('Path to the existing .po.json file to patch'),
      patch: z
        .record(z.unknown())
        .describe(
          'JSON merge-patch to apply (RFC 7396: null removes key, any other value replaces)'
        ),
      dry_run: z
        .boolean()
        .default(true)
        .describe('Return merged result without writing to disk (default)'),
      validate_after: z
        .boolean()
        .default(true)
        .describe('Run NX validation on merged result; blocks write if errors found'),
    },
    ({ file_path, patch, dry_run, validate_after }) => {
      const requestId = makeRequestId();
      log('info', 'provar.nitrox.patch', { requestId, file_path, dry_run });

      try {
        assertPathAllowed(file_path, config.allowedPaths);
        const resolved = path.resolve(file_path);

        if (!fs.existsSync(resolved)) {
          const err = makeError('FILE_NOT_FOUND', `File not found: ${resolved}`, requestId);
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
        }

        let original: unknown;
        try {
          original = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
        } catch {
          const err = makeError('PARSE_ERROR', 'File contains invalid JSON.', requestId);
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
        }

        if (!isObj(original)) {
          const err = makeError('PARSE_ERROR', 'File content must be a JSON object.', requestId);
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
        }

        const merged = applyMergePatch(original, patch as JsonObj);
        const content = JSON.stringify(merged, null, 2);

        let validation: NitroXValidationResult | undefined;
        if (validate_after) {
          validation = validateNitroXContent(merged);
          if (!dry_run && !validation.valid) {
            const errCount = validation.issues.filter((i) => i.severity === 'ERROR').length;
            const err = makeError(
              'VALIDATION_FAILED',
              `Patched content has ${errCount} error(s). Fix issues or set validate_after=false to skip.`,
              requestId,
              false,
              { validation }
            );
            return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
          }
        }

        let written = false;
        if (!dry_run) {
          fs.writeFileSync(resolved, content, 'utf-8');
          written = true;
          log('info', 'provar.nitrox.patch: wrote file', { requestId, filePath: resolved });
        }

        const result = {
          requestId,
          content,
          file_path: resolved,
          written,
          dry_run,
          ...(validation !== undefined && { validation }),
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (err: unknown) {
        const error = err as Error & { code?: string };
        const errResult = makeError(
          error instanceof PathPolicyError ? error.code : (error.code ?? 'PATCH_ERROR'),
          error.message,
          requestId,
          false
        );
        log('error', 'provar.nitrox.patch failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}

export function registerAllNitroXTools(server: McpServer, config: ServerConfig): void {
  registerNitroXDiscover(server);
  registerNitroXRead(server, config);
  registerNitroXValidate(server, config);
  registerNitroXGenerate(server, config);
  registerNitroXPatch(server, config);
}
