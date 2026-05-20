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
import { makeError, makeRequestId } from '../schemas/common.js';
import { log } from '../logging/logger.js';
import type { ServerConfig } from '../server.js';
import { assertPathAllowed, PathPolicyError } from '../security/pathPolicy.js';
import { WARNING_CODES, formatWarning } from '../utils/warningCodes.js';
import { parseJUnitResults } from './antTools.js';
import { runSfCommand } from './sfSpawn.js';
import { desc } from './descHelper.js';

// Re-export sf resolution helpers so existing test imports from automationTools continue to work
export { getSfCommonPaths, needsWindowsShell, setSfPathCacheForTesting, setSfPlatformForTesting } from './sfSpawn.js';

function handleSpawnError(
  err: unknown,
  requestId: string,
  toolName: string
): { isError: true; content: Array<{ type: 'text'; text: string }> } {
  const error = err as Error & { code?: string };
  log('error', `${toolName} failed`, { requestId, error: error.message });
  return {
    isError: true as const,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(makeError(error.code ?? 'SF_ERROR', error.message, requestId, false)),
      },
    ],
  };
}

// ── Tool: provar_automation_config_load ──────────────────────────────────────

export function registerAutomationConfigLoad(server: McpServer, config: ServerConfig): void {
  server.registerTool(
    'provar_automation_config_load',
    {
      title: 'Load Automation Config',
      description: desc(
        [
          'Register a provardx-properties.json file as the active Provar configuration.',
          'Invokes `sf provar automation config load --properties-file <path>`, writing the path to ~/.sf/config.json.',
          'REQUIRED before provar_automation_compile or provar_automation_testrun — without this step those commands fail with MISSING_FILE.',
          'Typical workflow: provar_automation_config_load → provar_automation_compile → provar_automation_testrun.',
        ].join(' '),
        'Register a provardx-properties.json as active config; required before compile/testrun.'
      ),
      inputSchema: {
        properties_path: z
          .string()
          .describe(
            desc(
              'Absolute path to the provardx-properties.json file to register as active configuration',
              'string, absolute path to provardx-properties.json'
            )
          ),
        sf_path: z
          .string()
          .optional()
          .describe(
            desc(
              'Path to the sf CLI executable when not in PATH (e.g. "~/.nvm/versions/node/v22.0.0/bin/sf")',
              'string, optional; path to sf CLI'
            )
          ),
      },
    },
    ({ properties_path, sf_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar_automation_config_load', { requestId, properties_path });

      try {
        assertPathAllowed(properties_path, config.allowedPaths);
        const result = runSfCommand(
          ['provar', 'automation', 'config', 'load', '--properties-file', properties_path],
          sf_path
        );
        const response = {
          requestId,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          properties_path,
        };

        if (result.exitCode !== 0) {
          return {
            isError: true as const,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  makeError('AUTOMATION_CONFIG_LOAD_FAILED', result.stderr || result.stdout, requestId)
                ),
              },
            ],
          };
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(response) }], structuredContent: response };
      } catch (err) {
        if (err instanceof PathPolicyError) {
          return {
            isError: true as const,
            content: [
              { type: 'text' as const, text: JSON.stringify(makeError(err.code, err.message, requestId, false)) },
            ],
          };
        }
        return handleSpawnError(err, requestId, 'provar_automation_config_load');
      }
    }
  );
}

// ── Testrun output filter ─────────────────────────────────────────────────────

const NOISE_PATTERNS: RegExp[] = [/com\.networknt\.schema/, /SEVERE.*Failed to configure logger.*\.lck/];

/**
 * Strip Java schema-validator debug lines and stale logger-lock SEVERE warnings
 * from Provar testrun output. These two patterns account for the bulk of output
 * volume and cause MCP responses to be truncated before the pass/fail lines.
 *
 * Everything else (including real SEVERE failures) passes through unchanged.
 * Collapses runs of blank lines to a single blank to keep the output readable.
 * Returns the filtered text and the count of suppressed lines.
 */
export function filterTestRunOutput(raw: string): { filtered: string; suppressed: number } {
  const lines = raw.split(/\r?\n/);
  const kept: string[] = [];
  let suppressed = 0;
  let lastKeptWasBlank = false;

  for (const rawLine of lines) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (NOISE_PATTERNS.some((p) => p.test(line))) {
      suppressed++;
      continue;
    }
    const isBlank = line.trim() === '';
    if (isBlank && lastKeptWasBlank) continue; // collapse blank runs
    kept.push(line);
    lastKeptWasBlank = isBlank;
  }

  let filtered = kept.join('\n');
  if (suppressed > 0) {
    filtered += `\n[testrun: ${suppressed} lines suppressed (schema validator / logger noise) — use provar_testrun_rca for full results]`;
  }
  return { filtered, suppressed };
}

// ── JUnit results enrichment ──────────────────────────────────────────────────

// Overrideable in tests — bypasses the sf config file read
let sfResultsPathOverride: string | null | undefined;

/** Exposed for testing only — set the results path returned by the sf config reader. Pass undefined to reset. */
export function setSfResultsPathForTesting(p: string | null | undefined): void {
  sfResultsPathOverride = p;
}

/**
 * Resolves the actual results directory for the latest run.
 * Provar's Increment disposition creates Results(1), Results(2)… as siblings of Results/.
 * Returns the latest sibling dir, or the base path if no siblings exist.
 */
function resolveLatestResultsDir(resultsBase: string): string {
  const parent = path.dirname(resultsBase);
  const base = path.basename(resultsBase);
  try {
    const safeName = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${safeName}\\((\\d+)\\)$`);
    const indices = fs
      .readdirSync(parent, { withFileTypes: true })
      .filter((e) => e.isDirectory() && pattern.test(e.name))
      .map((e) => parseInt((pattern.exec(e.name) as RegExpExecArray)[1], 10));
    if (indices.length > 0) {
      const maxIdx = indices.reduce((a, b) => (a > b ? a : b), 0);
      return path.join(parent, `${base}(${maxIdx})`);
    }
  } catch {
    // ignore filesystem errors
  }
  return resultsBase;
}

/**
 * Reads resultsPath from the currently active provardx-properties.json (via ~/.sf/config.json),
 * then resolves to the latest Increment-mode sibling directory.
 * Returns null when the sf config or properties file cannot be read or is outside allowed paths.
 */
function readResultsPathFromSfConfig(config: ServerConfig): string | null {
  if (sfResultsPathOverride !== undefined) return sfResultsPathOverride;
  try {
    const sfConfigPath = path.join(os.homedir(), '.sf', 'config.json');
    if (!fs.existsSync(sfConfigPath)) return null;
    const sfConfig = JSON.parse(fs.readFileSync(sfConfigPath, 'utf-8')) as Record<string, unknown>;
    const propFilePath = sfConfig['PROVARDX_PROPERTIES_FILE_PATH'] as string | undefined;
    if (!propFilePath || !fs.existsSync(propFilePath)) return null;
    // Guard: only read the properties file if it is within the session's allowed paths.
    assertPathAllowed(propFilePath, config.allowedPaths);
    const props = JSON.parse(fs.readFileSync(propFilePath, 'utf-8')) as Record<string, unknown>;
    const resultsBase = props['resultsPath'] as string | undefined;
    if (!resultsBase) return null;
    const resultsDir = resolveLatestResultsDir(resultsBase);
    // Guard: only read the results directory if it is within the session's allowed paths.
    assertPathAllowed(resultsDir, config.allowedPaths);
    return resultsDir;
  } catch {
    return null;
  }
}

// ── Tool: provar_automation_testrun ───────────────────────────────────────────

/**
 * JUnit introspection for the testrun response. Returns enough structure that
 * downstream warning emitters (RUN-001 zero-tests, future JUNIT-001 expected-vs-
 * actual mismatch) can read a single object instead of re-parsing.
 */
type JUnitIntrospection = {
  steps: ReturnType<typeof parseJUnitResults>['steps'];
  stepCount: number;
  parseWarning: string | undefined;
  resultsPathResolved: boolean;
  /**
   * True iff at least one JUnit XML file was located AND parsed without throwing.
   * Gates RUN-001: a `stepCount === 0` only means "zero tests executed" when we know we
   * actually have parseable data. With `parsedAny === false` the count is "we don't know",
   * which must stay silent (details.warning already covers it).
   */
  parsedAny: boolean;
};

function introspectJUnit(config: ServerConfig): JUnitIntrospection {
  const resultsPath = readResultsPathFromSfConfig(config);
  if (!resultsPath) {
    return { steps: [], stepCount: 0, parseWarning: undefined, resultsPathResolved: false, parsedAny: false };
  }
  const { steps, warning, parsedAny } = parseJUnitResults(resultsPath);
  return { steps, stepCount: steps.length, parseWarning: warning, resultsPathResolved: true, parsedAny };
}

const ZERO_TESTS_MESSAGE =
  'Test run exited successfully but zero tests were executed. ' +
  'Check the testCase / testCases (note spelling) field in provardx-properties.json.';

export function registerAutomationTestRun(server: McpServer, config: ServerConfig): void {
  server.registerTool(
    'provar_automation_testrun',
    {
      title: 'Run Tests',
      description: desc(
        [
          'Trigger a LOCAL Provar automation test run using installed Provar binaries. Invokes `sf provar automation test run`.',
          'PREREQUISITE: Run provar_automation_config_load first to register a provardx-properties.json — without this the command fails with MISSING_FILE.',
          'Requires Provar to be installed locally and provarHome set correctly in the properties file.',
          'Use provar_automation_setup first if Provar is not yet installed.',
          'For grid/CI execution via Provar Quality Hub instead of running locally, use provar_qualityhub_testrun.',
          'Output buffer: a 50 MB maxBuffer is set so ENOBUFS on verbose Provar runs is now rare.',
          'If ENOBUFS still occurs (extremely verbose logging), run `sf provar automation test run --json` directly in the terminal and pipe or tail the output instead of retrying this tool.',
          'Zero-tests guard: if the sf exit code is 0, the results directory was located, and at least one JUnit XML file parsed successfully but contains zero executed tests, a RUN-001 warning is added to `warnings[]` — usually a typo such as `testCase` vs `testCases` in provardx-properties.json. When no JUnit data is available (dir missing or all XML unparseable), `details.warning` is set instead and RUN-001 stays silent.',
          'Typical local AI loop: config.load → compile → testrun → inspect results.',
          'Each failed step in `steps[]` may include optional error_category (INFRASTRUCTURE|ASSERTION|LOCATOR|TIMEOUT|OTHER)',
          'and retryable (boolean) fields when the failure text matches a known pattern — use these to drive automated retry policy.',
        ].join(' '),
        'Run local Provar tests via sf CLI; requires config_load first. Surfaces RUN-001 on zero-tests-executed.'
      ),
      inputSchema: {
        flags: z
          .array(z.string())
          .optional()
          .default([])
          .describe(
            desc(
              'Raw CLI flags to forward (e.g. ["--project-path", "/path/to/project"])',
              'array, optional; raw CLI flags'
            )
          ),
        sf_path: z
          .string()
          .optional()
          .describe(
            desc(
              'Path to the sf CLI executable when not in PATH (e.g. "~/.nvm/versions/node/v22.0.0/bin/sf")',
              'string, optional; path to sf CLI'
            )
          ),
      },
    },
    ({ flags, sf_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar_automation_testrun', { requestId });

      try {
        const result = runSfCommand(['provar', 'automation', 'test', 'run', ...flags], sf_path);
        const { filtered, suppressed } = filterTestRunOutput(result.stdout);

        // Enrich the response with structured step data + warning hooks from JUnit XML.
        // Single introspection call keeps the wiring extensible (e.g. future JUNIT-001
        // expected-vs-actual mismatch can read stepCount from the same struct).
        const junit = introspectJUnit(config);

        if (result.exitCode !== 0) {
          const { filtered: filteredErr, suppressed: suppressedErr } = filterTestRunOutput(
            result.stderr || result.stdout
          );
          const errBody: Record<string, unknown> = {
            ...makeError('AUTOMATION_TESTRUN_FAILED', filteredErr, requestId),
            ...(suppressedErr > 0 ? { output_lines_suppressed: suppressedErr } : {}),
          };
          if (junit.steps.length > 0) errBody['steps'] = junit.steps;
          if (!junit.resultsPathResolved || junit.parseWarning) {
            errBody['details'] = {
              warning:
                junit.parseWarning ??
                'Could not locate results directory — step-level output unavailable. Run provar_automation_config_load first.',
            };
          }
          return { isError: true as const, content: [{ type: 'text' as const, text: JSON.stringify(errBody) }] };
        }

        const response: Record<string, unknown> = {
          requestId,
          exitCode: result.exitCode,
          stdout: filtered,
          stderr: result.stderr,
        };
        if (suppressed > 0) response['output_lines_suppressed'] = suppressed;
        if (junit.steps.length > 0) response['steps'] = junit.steps;
        if (junit.parseWarning) response['details'] = { warning: junit.parseWarning };

        // RUN-001: sf reported success but zero tests actually executed.
        // Almost always a typo in the testCase / testCases field of provardx-properties.json.
        // Only fires when:
        //   1. The results dir was located (resultsPathResolved), AND
        //   2. At least one JUnit XML file was successfully parsed (parsedAny).
        // Without (2) `stepCount === 0` just means "we don't have parseable data" — not
        // "zero tests ran" — and the agent would be misdirected toward a typo when the
        // real issue is a missing/unparseable results dir. That case is already surfaced
        // via `details.warning` from the parse layer. With parsedAny === true and zero
        // extracted steps, we know the selector genuinely matched nothing.
        if (junit.resultsPathResolved && junit.parsedAny && junit.stepCount === 0) {
          const warningStr = formatWarning(WARNING_CODES.RUN_001, ZERO_TESTS_MESSAGE);
          // Append rather than overwrite so future warning emitters (e.g. JUNIT-001 mismatch
          // in PDX-491) can coexist on the same response without stepping on each other.
          const existing = response['warnings'] as string[] | undefined;
          response['warnings'] = existing ? existing.concat(warningStr) : [warningStr];
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(response) }], structuredContent: response };
      } catch (err) {
        return handleSpawnError(err, requestId, 'provar_automation_testrun');
      }
    }
  );
}

// ── Tool: provar_automation_compile ───────────────────────────────────────────

export function registerAutomationCompile(server: McpServer): void {
  server.registerTool(
    'provar_automation_compile',
    {
      title: 'Compile Test Assets',
      description: desc(
        [
          'Compile a Provar automation project. Invokes `sf provar automation project compile`.',
          'PREREQUISITE: Run provar_automation_config_load first to register a provardx-properties.json — without this the command fails with MISSING_FILE.',
          'Run this before triggering a test run after modifying test cases.',
        ].join(' '),
        'Compile a Provar project; requires config_load first.'
      ),
      inputSchema: {
        flags: z
          .array(z.string())
          .optional()
          .default([])
          .describe(
            desc(
              'Raw CLI flags to forward (e.g. ["--project-path", "/path/to/project"])',
              'array, optional; raw CLI flags'
            )
          ),
        sf_path: z
          .string()
          .optional()
          .describe(
            desc(
              'Path to the sf CLI executable when not in PATH (e.g. "~/.nvm/versions/node/v22.0.0/bin/sf")',
              'string, optional; path to sf CLI'
            )
          ),
      },
    },
    ({ flags, sf_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar_automation_compile', { requestId });

      try {
        const result = runSfCommand(['provar', 'automation', 'project', 'compile', ...flags], sf_path);
        const response = { requestId, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };

        if (result.exitCode !== 0) {
          return {
            isError: true as const,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(makeError('AUTOMATION_COMPILE_FAILED', result.stderr || result.stdout, requestId)),
              },
            ],
          };
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(response) }], structuredContent: response };
      } catch (err) {
        return handleSpawnError(err, requestId, 'provar_automation_compile');
      }
    }
  );
}

// ── Tool: provar_automation_metadata_download ─────────────────────────────────

const DOWNLOAD_ERROR_SUGGESTION =
  'A [DOWNLOAD_ERROR] almost always means a Salesforce authentication failure for the connection being used. ' +
  'Check: (1) the connection credentials in the Provar project .secrets file are current and not expired; ' +
  '(2) the named connection exists in the project and the name is spelled correctly (case-sensitive); ' +
  '(3) if using a scratch org, confirm it has not expired (`sf org list`); ' +
  '(4) if testprojectSecrets is set in provardx-properties.json, it must be the encryption key string used to decrypt .secrets — not a file path.';

export function registerAutomationMetadataDownload(server: McpServer): void {
  server.registerTool(
    'provar_automation_metadata_download',
    {
      title: 'Download Salesforce Metadata',
      description: desc(
        [
          'Download Salesforce metadata for one or more connections into a Provar project.',
          'Invokes `sf provar automation metadata download`.',
          'PREREQUISITE: Call provar_automation_config_load first — without it the command fails with MISSING_FILE.',
          'Use the -c flag to specify connections: flags: ["-c", "ConnectionName1,ConnectionName2"].',
          'Connection names are case-sensitive and must match the names defined in the Provar project.',
          'If the download fails with [DOWNLOAD_ERROR], this is almost always a Salesforce authentication issue —',
          'check that the credentials in the project .secrets file are current and that any referenced scratch orgs have not expired.',
        ].join(' '),
        'Download Salesforce metadata for project connections; requires config_load first.'
      ),
      inputSchema: {
        flags: z
          .array(z.string())
          .optional()
          .default([])
          .describe(
            desc(
              'Raw CLI flags to forward. Use ["-c", "Name1,Name2"] (or the equivalent --connections form) to target specific connections. Example: ["-c", "MyOrg,SandboxOrg"]',
              'array, optional; raw CLI flags e.g. ["-c", "ConnName"]'
            )
          ),
        sf_path: z
          .string()
          .optional()
          .describe(
            desc(
              'Path to the sf CLI executable when not in PATH (e.g. "~/.nvm/versions/node/v22.0.0/bin/sf")',
              'string, optional; path to sf CLI'
            )
          ),
      },
    },
    ({ flags, sf_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar_automation_metadata_download', { requestId });

      try {
        const result = runSfCommand(['provar', 'automation', 'metadata', 'download', ...flags], sf_path);
        const message = result.stderr || result.stdout;

        if (result.exitCode !== 0) {
          const isDownloadError = message.includes('[DOWNLOAD_ERROR]');
          const details: Record<string, unknown> | undefined = isDownloadError
            ? { suggestion: DOWNLOAD_ERROR_SUGGESTION }
            : undefined;
          return {
            isError: true as const,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(makeError('AUTOMATION_METADATA_FAILED', message, requestId, false, details)),
              },
            ],
          };
        }

        const response = { requestId, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
        return { content: [{ type: 'text' as const, text: JSON.stringify(response) }], structuredContent: response };
      } catch (err) {
        return handleSpawnError(err, requestId, 'provar_automation_metadata_download');
      }
    }
  );
}

// ── Tool: provar_automation_setup ─────────────────────────────────────────────

/** Known system-level Provar install paths per platform. */
const SYSTEM_INSTALL_BASES: Record<string, string[]> = {
  win32: ['C:/Program Files', 'C:/Program Files (x86)'],
  darwin: ['/Applications'],
  linux: ['/opt', '/usr/local'],
};

interface ProvarInstall {
  path: string;
  version: string | null;
  source: 'local' | 'env' | 'system';
}

/** Try to read a Provar version string from well-known files inside an install dir. */
function readProvarVersion(installPath: string): string | null {
  for (const candidate of ['version.txt', 'VERSION', 'provardx/version.txt', 'lib/version.txt']) {
    try {
      const content = fs.readFileSync(path.join(installPath, candidate), 'utf-8').trim();
      if (content) return content;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/** Return true if the directory looks like a valid Provar installation (has provardx.jar). */
function isValidProvarHome(dir: string): boolean {
  return fs.existsSync(path.join(dir, 'provardx', 'provardx.jar'));
}

/**
 * Scan common install locations and return every Provar installation found on this machine.
 * Checks (in order): PROVAR_HOME env var, ./ProvarHome (CLI-installed), platform system dirs.
 */
function findExistingInstallations(): ProvarInstall[] {
  const found: ProvarInstall[] = [];
  const seen = new Set<string>();

  function addIfValid(installPath: string, source: ProvarInstall['source']): void {
    const resolved = path.resolve(installPath);
    if (seen.has(resolved)) return;
    if (!fs.existsSync(resolved)) return;
    if (isValidProvarHome(resolved)) {
      seen.add(resolved);
      found.push({ path: resolved, version: readProvarVersion(resolved), source });
    }
  }

  // 1. PROVAR_HOME environment variable
  const envHome = process.env['PROVAR_HOME'];
  if (envHome) addIfValid(envHome, 'env');

  // 2. ./ProvarHome — where `sf provar automation setup` installs by default
  addIfValid(path.join(process.cwd(), 'ProvarHome'), 'local');

  // 3. Platform-specific system install dirs — scan for any Provar* subdirectory
  const bases = SYSTEM_INSTALL_BASES[process.platform] ?? [];
  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    let entries: string[];
    try {
      entries = fs.readdirSync(base);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.toLowerCase().startsWith('provar')) {
        const fullPath = path.join(base, entry);
        // For macOS .app bundles the resources sit inside Contents/Resources
        const candidates = [
          fullPath,
          path.join(fullPath, 'Contents', 'Resources'),
          path.join(fullPath, 'Contents', 'Resources', 'ProvarHome'),
        ];
        for (const candidate of candidates) {
          addIfValid(candidate, 'system');
        }
      }
    }
  }

  return found;
}

export function registerAutomationSetup(server: McpServer): void {
  server.registerTool(
    'provar_automation_setup',
    {
      title: 'Install Provar Automation',
      description: desc(
        [
          'Download and install Provar Automation binaries locally. Invokes `sf provar automation setup`.',
          'Before downloading, checks for existing Provar installations in:',
          '  • PROVAR_HOME environment variable',
          '  • ./ProvarHome (default CLI install location)',
          '  • C:\\Program Files\\Provar* (Windows system installs)',
          '  • /Applications/Provar* (macOS app installs)',
          'If an existing installation is found, returns its path so you can set provarHome in the properties file — skipping the download unless force is true.',
          'After a successful install, update the provarHome property in provardx-properties.json to the returned install_path using provar_properties_set.',
        ].join(' '),
        'Download and install Provar Automation binaries; skips if already installed.'
      ),
      inputSchema: {
        version: z
          .string()
          .optional()
          .describe(
            desc(
              'Specific Provar Automation version to install, e.g. "2.12.0". Omit to install the latest release.',
              'string, optional; version to install e.g. "2.12.0"'
            )
          ),
        force: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            desc(
              'Force a fresh download even if an existing installation is already detected (default: false).',
              'bool, optional; force re-download'
            )
          ),
        sf_path: z
          .string()
          .optional()
          .describe(
            desc(
              'Path to the sf CLI executable when not in PATH (e.g. "~/.nvm/versions/node/v22.0.0/bin/sf")',
              'string, optional; path to sf CLI'
            )
          ),
      },
    },
    ({ version, force, sf_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar_automation_setup', { requestId, version, force });

      try {
        // ── 1. Check for existing installations ──────────────────────────────
        const existing = findExistingInstallations();

        if (existing.length > 0 && !force) {
          const primary = existing[0];
          const response = {
            requestId,
            already_installed: true,
            installations: existing,
            install_path: primary.path,
            version: primary.version,
            message: [
              `Found ${existing.length} existing Provar installation(s). Skipped download.`,
              `Set provarHome to "${primary.path}" in your provardx-properties.json,`,
              'or pass force: true to download and overwrite with a fresh copy.',
            ].join(' '),
          };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(response) }],
            structuredContent: response,
          };
        }

        // ── 2. Run sf provar automation setup ────────────────────────────────
        const flags = version ? ['--version', version] : [];
        const result = runSfCommand(['provar', 'automation', 'setup', ...flags], sf_path);

        if (result.exitCode !== 0) {
          return {
            isError: true as const,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(makeError('AUTOMATION_SETUP_FAILED', result.stderr || result.stdout, requestId)),
              },
            ],
          };
        }

        // ── 3. Locate the freshly installed ProvarHome ───────────────────────
        const freshInstalls = findExistingInstallations();
        const localInstall = freshInstalls.find((i) => i.source === 'local') ?? freshInstalls[0];
        const installPath = localInstall?.path ?? path.resolve(process.cwd(), 'ProvarHome');
        const detectedVersion = localInstall?.version ?? version ?? null;

        const response = {
          requestId,
          already_installed: false,
          forced: force,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          install_path: installPath,
          version: detectedVersion,
          message: [
            `Provar Automation installed successfully at: ${installPath}.`,
            'Update provarHome in your provardx-properties.json to this path using provar_properties_set.',
          ].join(' '),
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
      } catch (err) {
        return handleSpawnError(err, requestId, 'provar_automation_setup');
      }
    }
  );
}

// ── Bulk registration ─────────────────────────────────────────────────────────

export function registerAllAutomationTools(server: McpServer, config: ServerConfig): void {
  registerAutomationSetup(server);
  registerAutomationConfigLoad(server, config);
  registerAutomationTestRun(server, config);
  registerAutomationCompile(server);
  registerAutomationMetadataDownload(server);
}
