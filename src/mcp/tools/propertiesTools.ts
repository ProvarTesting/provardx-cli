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
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { propertyFileContent } from '@provartesting/provardx-plugins-utils';
import type { ServerConfig } from '../server.js';
import { assertPathAllowed, PathPolicyError } from '../security/pathPolicy.js';
import { makeError, makeRequestId } from '../schemas/common.js';
import { log } from '../logging/logger.js';

// ── Validation helpers ────────────────────────────────────────────────────────

interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

const TOP_REQUIRED = ['provarHome', 'projectPath', 'resultsPath', 'metadata', 'environment'] as const;
const METADATA_REQUIRED = ['metadataLevel', 'cachePath'] as const;
const ENV_REQUIRED = ['webBrowser', 'webBrowserConfig', 'webBrowserProviderName', 'webBrowserDeviceName'] as const;

const VALID_RESULTS_DISPOSITION = ['Increment', 'Replace', 'Fail'];
const VALID_OUTPUT_LEVELS = ['BASIC', 'DETAILED', 'DIAGNOSTIC'];
const VALID_PLUGIN_LEVELS = ['SEVERE', 'WARNING', 'INFO', 'FINE', 'FINER', 'FINEST'];
const VALID_BROWSERS = ['Chrome', 'Safari', 'Edge', 'Edge_Legacy', 'Firefox', 'IE', 'Chrome_Headless'];
const VALID_METADATA_LEVELS = ['Reuse', 'Reload', 'Refresh'];

// eslint-disable-next-line complexity
function validateProperties(props: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required top-level fields
  for (const field of TOP_REQUIRED) {
    const val = props[field];
    if (val === undefined || val === null) {
      errors.push({ field, message: `Required field "${field}" is missing`, severity: 'error' });
    } else if (typeof val === 'string' && val.trim() === '') {
      errors.push({ field, message: `Required field "${field}" must not be empty`, severity: 'error' });
    }
  }

  // metadata object
  const meta = props['metadata'] as Record<string, unknown> | undefined;
  if (meta && typeof meta === 'object') {
    for (const f of METADATA_REQUIRED) {
      if (!meta[f])
        errors.push({
          field: `metadata.${f}`,
          message: `Required field "metadata.${f}" is missing`,
          severity: 'error',
        });
    }
    if (meta['metadataLevel'] && !VALID_METADATA_LEVELS.includes(meta['metadataLevel'] as string)) {
      errors.push({
        field: 'metadata.metadataLevel',
        message: `metadata.metadataLevel must be one of: ${VALID_METADATA_LEVELS.join(', ')}`,
        severity: 'error',
      });
    }
  }

  // environment object
  const env = props['environment'] as Record<string, unknown> | undefined;
  if (env && typeof env === 'object') {
    for (const f of ENV_REQUIRED) {
      if (!env[f])
        errors.push({
          field: `environment.${f}`,
          message: `Required field "environment.${f}" is missing`,
          severity: 'error',
        });
    }
    if (env['webBrowser'] && !VALID_BROWSERS.includes(env['webBrowser'] as string)) {
      errors.push({
        field: 'environment.webBrowser',
        message: `webBrowser must be one of: ${VALID_BROWSERS.join(', ')}`,
        severity: 'error',
      });
    }
  }

  // Optional enum fields
  if (
    props['resultsPathDisposition'] &&
    !VALID_RESULTS_DISPOSITION.includes(props['resultsPathDisposition'] as string)
  ) {
    errors.push({
      field: 'resultsPathDisposition',
      message: `Must be one of: ${VALID_RESULTS_DISPOSITION.join(', ')}`,
      severity: 'error',
    });
  }
  if (props['testOutputLevel'] && !VALID_OUTPUT_LEVELS.includes(props['testOutputLevel'] as string)) {
    errors.push({
      field: 'testOutputLevel',
      message: `Must be one of: ${VALID_OUTPUT_LEVELS.join(', ')}`,
      severity: 'error',
    });
  }
  if (props['pluginOutputlevel'] && !VALID_PLUGIN_LEVELS.includes(props['pluginOutputlevel'] as string)) {
    errors.push({
      field: 'pluginOutputlevel',
      message: `Must be one of: ${VALID_PLUGIN_LEVELS.join(', ')}`,
      severity: 'error',
    });
  }

  // Warn about placeholder values still in file
  const placeholders = [
    '${PROVAR_HOME}',
    '${PROVAR_PROJECT_PATH}',
    '${PROVAR_RESULTS_PATH}',
    '${PROVAR_TEST_ENVIRONMENT}',
    '${PROVAR_TEST_PROJECT_SECRETS}',
  ];
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'string' && placeholders.includes(value)) {
      errors.push({
        field: key,
        message: `Field "${key}" still contains placeholder value "${value}" — replace with actual path or use an environment variable`,
        severity: 'warning',
      });
    }
  }

  return errors;
}

/** Deep merge: source values overwrite target values recursively for objects. */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const [key, val] of Object.entries(source)) {
    if (
      val !== null &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      result[key] !== null &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key] as Record<string, unknown>, val as Record<string, unknown>);
    } else {
      result[key] = val;
    }
  }
  return result;
}

// ── provar.properties.generate ────────────────────────────────────────────────

export function registerPropertiesGenerate(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.properties.generate',
    [
      'Generate a provardx-properties.json file from the standard template.',
      'Optionally pre-fills projectPath and provarHome if provided.',
      'The generated file uses ${PLACEHOLDER} values that must be replaced before running tests.',
      'Use provar.properties.set afterwards to update specific fields.',
    ].join(' '),
    {
      output_path: z.string().describe('Where to write the file (e.g. /path/to/project/provardx-properties.json)'),
      project_path: z.string().optional().describe('Pre-fill the projectPath field with this value'),
      provar_home: z.string().optional().describe('Pre-fill the provarHome field with this value'),
      results_path: z.string().optional().describe('Pre-fill the resultsPath field with this value'),
      overwrite: z
        .boolean()
        .optional()
        .default(false)
        .describe('Overwrite the file if it already exists (default: false)'),
      dry_run: z.boolean().optional().default(false).describe('Return the content without writing (default: false)'),
    },
    ({ output_path, project_path, provar_home, results_path, overwrite, dry_run }) => {
      const requestId = makeRequestId();
      log('info', 'provar.properties.generate', { requestId, output_path });

      try {
        assertPathAllowed(output_path, config.allowedPaths);
        const resolved = path.resolve(output_path);

        if (!overwrite && fs.existsSync(resolved)) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  makeError(
                    'FILE_EXISTS',
                    `File already exists: ${resolved}. Set overwrite: true to replace it.`,
                    requestId
                  )
                ),
              },
            ],
          };
        }

        if (!resolved.endsWith('.json')) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(makeError('INVALID_PATH', 'output_path must end with .json', requestId)),
              },
            ],
          };
        }

        // Start from the template and apply any provided overrides
        const content: Record<string, unknown> = { ...(propertyFileContent as unknown as Record<string, unknown>) };
        if (project_path) content['projectPath'] = project_path;
        if (provar_home) content['provarHome'] = provar_home;
        if (results_path) content['resultsPath'] = results_path;

        const json = JSON.stringify(content, null, 2);

        if (!dry_run) {
          fs.mkdirSync(path.dirname(resolved), { recursive: true });
          fs.writeFileSync(resolved, json, 'utf-8');
        }

        const nextSteps = dry_run
          ? 'Review the content, write to disk, then run provar.automation.config.load to register this file before compiling or running tests.'
          : `Run provar.automation.config.load with properties_path "${resolved}" to register this configuration. Required before provar.automation.compile or provar.automation.testrun will work.`;

        const response = {
          requestId,
          file_path: resolved,
          written: !dry_run,
          dry_run: dry_run ?? false,
          content,
          next_steps: nextSteps,
        };
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
                  error instanceof PathPolicyError ? error.code : error.code ?? 'GENERATE_ERROR',
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

// ── Runtime divergence detection ──────────────────────────────────────────────

// Overrideable in tests so we don't touch the real ~/.sf directory
let sfConfigDirOverride: string | null = null;

/** Exposed for testing only — override the directory that contains config.json. Pass null to reset. */
export function setSfConfigDirForTesting(dir: string | null): void {
  sfConfigDirOverride = dir;
}

/**
 * Returns the properties file path registered via `sf provar automation config load`,
 * or null if the sf config cannot be read.
 */
function readActivePropertiesPath(): string | null {
  try {
    const sfDir = sfConfigDirOverride ?? path.join(os.homedir(), '.sf');
    const sfConfigPath = path.join(sfDir, 'config.json');
    if (!fs.existsSync(sfConfigPath)) return null;
    const sfConfig = JSON.parse(fs.readFileSync(sfConfigPath, 'utf-8')) as Record<string, unknown>;
    return (sfConfig['PROVARDX_PROPERTIES_FILE_PATH'] as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/**
 * Compare two properties objects on the keys most likely to cause silent bugs.
 * Returns a human-readable description of any divergent keys, or null if all match.
 */
function buildDivergenceWarning(
  diskPath: string,
  diskContent: Record<string, unknown>,
  activePath: string,
  activeContent: Record<string, unknown>
): string | null {
  const KEY_FIELDS = ['provarHome', 'projectPath', 'resultsPath'];
  const divergent = KEY_FIELDS.filter((k) => JSON.stringify(diskContent[k]) !== JSON.stringify(activeContent[k]));
  if (divergent.length === 0) return null;
  const details = divergent
    .map((k) => `${k}: disk="${String(diskContent[k])}" vs active="${String(activeContent[k])}"`)
    .join(', ');
  return (
    `The file you read (${diskPath}) differs from the active sf config (${activePath}) on: ${details}. ` +
    'Test runs use the active config values — run provar.automation.config.load with the correct file to sync.'
  );
}

// ── provar.properties.read ────────────────────────────────────────────────────

export function registerPropertiesRead(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.properties.read',
    'Read and parse a provardx-properties.json file. Returns the parsed content so you can inspect current settings before making changes with provar.properties.set.',
    {
      file_path: z.string().describe('Path to the provardx-properties.json file'),
    },
    ({ file_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar.properties.read', { requestId, file_path });

      try {
        assertPathAllowed(file_path, config.allowedPaths);
        const resolved = path.resolve(file_path);

        if (!fs.existsSync(resolved)) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  makeError(
                    'PROPERTIES_FILE_NOT_FOUND',
                    `Properties file not found: ${resolved}. Use provar.properties.generate to create it.`,
                    requestId
                  )
                ),
              },
            ],
          };
        }

        const raw = fs.readFileSync(resolved, 'utf-8');
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(makeError('MALFORMED_JSON', 'File is not valid JSON', requestId)),
              },
            ],
          };
        }

        // Check whether the file being read matches what's registered as active in the sf config.
        // If they differ on critical fields, surface a warning so the agent doesn't silently use stale values.
        let divergenceWarning: string | undefined;
        const activePath = readActivePropertiesPath();
        if (activePath && path.resolve(activePath) !== resolved) {
          try {
            // Guard: only read the active file if it is within the session's allowed paths.
            assertPathAllowed(activePath, config.allowedPaths);
            const activeContent = JSON.parse(fs.readFileSync(activePath, 'utf-8')) as Record<string, unknown>;
            divergenceWarning = buildDivergenceWarning(resolved, parsed, activePath, activeContent) ?? undefined;
          } catch {
            // Ignore — active path may be outside allowed paths or unreadable
          }
        }

        const response: Record<string, unknown> = { requestId, file_path: resolved, content: parsed };
        if (divergenceWarning) response['details'] = { warning: divergenceWarning };
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
                  error instanceof PathPolicyError ? error.code : error.code ?? 'READ_ERROR',
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

// ── provar.properties.set ─────────────────────────────────────────────────────

const updatesSchema = z
  .object({
    provarHome: z.string().optional().describe('Path to Provar installation directory'),
    projectPath: z.string().optional().describe('Path to the Provar test project root'),
    resultsPath: z.string().optional().describe('Path where test results will be written'),
    resultsPathDisposition: z
      .enum(['Increment', 'Replace', 'Fail'])
      .optional()
      .describe('What to do if results path already exists'),
    testOutputLevel: z.enum(['BASIC', 'DETAILED', 'DIAGNOSTIC']).optional().describe('Amount of test output logged'),
    pluginOutputlevel: z
      .enum(['SEVERE', 'WARNING', 'INFO', 'FINE', 'FINER', 'FINEST'])
      .optional()
      .describe('Amount of plugin output logged'),
    stopOnError: z.boolean().optional().describe('Abort test run on first failure'),
    excludeCallable: z.boolean().optional().describe('Omit callable test cases from execution'),
    testprojectSecrets: z
      .string()
      .optional()
      .describe(
        'Encryption key (password string) used to decrypt the .secrets file in the Provar project root. ' +
          'This is the key itself — NOT a file path. Omit this field unless your project uses secrets encryption.'
      ),
    environment: z
      .object({
        testEnvironment: z.string().optional().describe('Name of the test environment to run against'),
        webBrowser: z.enum(['Chrome', 'Safari', 'Edge', 'Edge_Legacy', 'Firefox', 'IE', 'Chrome_Headless']).optional(),
        webBrowserConfig: z.string().optional(),
        webBrowserProviderName: z.string().optional(),
        webBrowserDeviceName: z.string().optional(),
      })
      .optional()
      .describe('Test execution environment settings'),
    metadata: z
      .object({
        metadataLevel: z.enum(['Reuse', 'Reload', 'Refresh']).optional().describe('Salesforce metadata cache strategy'),
        cachePath: z.string().optional().describe('Path for the metadata cache'),
      })
      .optional()
      .describe('Salesforce metadata settings'),
    testCase: z
      .array(z.string())
      .optional()
      .describe(
        'Specific test case file paths to run (relative to projectPath/tests/). NOTE: <dataTable> data-driven iteration does NOT work in this mode — data table variables resolve as null. To run data-driven tests, add the test case to a plan with provar.testplan.add-instance and run via testPlan instead.'
      ),
    testPlan: z.array(z.string()).optional().describe('Test plan names to run (wildcards permitted)'),
    connectionOverride: z
      .array(
        z.object({
          connection: z.string().describe('Provar connection name'),
          username: z.string().describe('SFDX username or alias to substitute'),
        })
      )
      .optional()
      .describe('Override Provar connections with SFDX usernames'),
  })
  .describe('Fields to update in the properties file — only provided fields are changed');

export function registerPropertiesSet(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.properties.set',
    [
      'Update one or more fields in a provardx-properties.json file.',
      'Only the provided fields are changed — all other fields are preserved.',
      'Object fields (environment, metadata) are deep-merged.',
      'Array fields (testCase, testPlan, connectionOverride) replace the existing value entirely.',
      'Use provar.properties.read first to inspect the current state.',
    ].join(' '),
    {
      file_path: z.string().describe('Path to the provardx-properties.json file to update'),
      updates: updatesSchema,
    },
    ({ file_path, updates }) => {
      const requestId = makeRequestId();
      log('info', 'provar.properties.set', { requestId, file_path });

      try {
        assertPathAllowed(file_path, config.allowedPaths);
        const resolved = path.resolve(file_path);

        if (!fs.existsSync(resolved)) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  makeError(
                    'PROPERTIES_FILE_NOT_FOUND',
                    `File not found: ${resolved}. Use provar.properties.generate to create it first.`,
                    requestId
                  )
                ),
              },
            ],
          };
        }

        let current: Record<string, unknown>;
        try {
          current = JSON.parse(fs.readFileSync(resolved, 'utf-8')) as Record<string, unknown>;
        } catch {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(makeError('MALFORMED_JSON', 'Existing file is not valid JSON', requestId)),
              },
            ],
          };
        }

        const updatesRecord = updates as Record<string, unknown>;
        const merged = deepMerge(current, updatesRecord);
        const updatedFields = Object.keys(updatesRecord);

        fs.writeFileSync(resolved, JSON.stringify(merged, null, 2), 'utf-8');

        const response = { requestId, file_path: resolved, updated_fields: updatedFields, content: merged };
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
                  error instanceof PathPolicyError ? error.code : error.code ?? 'SET_ERROR',
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

// ── provar.properties.validate ────────────────────────────────────────────────

export function registerPropertiesValidate(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.properties.validate',
    [
      'Validate a provardx-properties.json file against the ProvarDX schema.',
      'Checks required fields, valid enum values, and warns about unfilled placeholder values.',
      'Accepts either a file path or inline JSON content.',
    ].join(' '),
    {
      file_path: z.string().optional().describe('Path to the provardx-properties.json file to validate'),
      content: z.string().optional().describe('Inline JSON string to validate (alternative to file_path)'),
    },
    ({ file_path, content }) => {
      const requestId = makeRequestId();
      log('info', 'provar.properties.validate', { requestId, file_path });

      if (!file_path && !content) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(makeError('MISSING_INPUT', 'Provide either file_path or content', requestId)),
            },
          ],
        };
      }

      try {
        let rawJson: string;

        if (file_path) {
          assertPathAllowed(file_path, config.allowedPaths);
          const resolved = path.resolve(file_path);
          if (!fs.existsSync(resolved)) {
            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(
                    makeError('PROPERTIES_FILE_NOT_FOUND', `File not found: ${resolved}`, requestId)
                  ),
                },
              ],
            };
          }
          rawJson = fs.readFileSync(resolved, 'utf-8');
        } else {
          rawJson = content!;
        }

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(rawJson) as Record<string, unknown>;
        } catch {
          const response = {
            requestId,
            is_valid: false,
            error_count: 1,
            warning_count: 0,
            errors: [{ field: '(root)', message: 'File is not valid JSON', severity: 'error' }],
            warnings: [],
          };
          return { content: [{ type: 'text' as const, text: JSON.stringify(response) }], structuredContent: response };
        }

        const allIssues = validateProperties(parsed);
        const errors = allIssues.filter((e) => e.severity === 'error');
        const warnings = allIssues.filter((e) => e.severity === 'warning');

        const response = {
          requestId,
          is_valid: errors.length === 0,
          error_count: errors.length,
          warning_count: warnings.length,
          errors,
          warnings,
        };
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
                  error instanceof PathPolicyError ? error.code : error.code ?? 'VALIDATE_ERROR',
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

// ── Convenience re-export ─────────────────────────────────────────────────────

export function registerAllPropertiesTools(server: McpServer, config: ServerConfig): void {
  registerPropertiesGenerate(server, config);
  registerPropertiesRead(server, config);
  registerPropertiesSet(server, config);
  registerPropertiesValidate(server, config);
}
