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
import { parseJUnitResults } from './antTools.js';
import { sfSpawnHelper, SfNotFoundError } from './sfSpawn.js';

// ── SF CLI discovery ──────────────────────────────────────────────────────────

/**
 * Returns candidate sf CLI paths in common npm/nvm/volta install locations.
 * Used as a fallback when `sf` is not in PATH.
 */
export function getSfCommonPaths(): string[] {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'] ?? path.join(home, 'AppData', 'Roaming');
    return [
      path.join(appData, 'npm', 'sf.cmd'),
      path.join('C:', 'Program Files', 'nodejs', 'sf.cmd'),
      path.join('C:', 'Program Files (x86)', 'nodejs', 'sf.cmd'),
    ];
  }
  const candidates = [
    '/usr/local/bin/sf',
    path.join(home, '.npm-global', 'bin', 'sf'),
    path.join(home, '.local', 'bin', 'sf'),
    path.join(home, '.volta', 'bin', 'sf'),
  ];
  // nvm — scan the three most-recently installed Node versions
  const nvmBinDir = path.join(process.env['NVM_DIR'] ?? path.join(home, '.nvm'), 'versions', 'node');
  if (fs.existsSync(nvmBinDir)) {
    try {
      for (const v of fs.readdirSync(nvmBinDir).sort().reverse().slice(0, 3)) {
        candidates.push(path.join(nvmBinDir, v, 'bin', 'sf'));
      }
    } catch {
      /* skip */
    }
  }
  return candidates;
}

// ── Shared spawn helper ───────────────────────────────────────────────────────

const MAX_BUFFER = 50 * 1024 * 1024; // 50 MB — prevents ENOBUFS on verbose Provar runs

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Proactively resolve the sf executable path once on first use and cache it.
// This ensures sf is always found even when ENOENT is masked by other errors (e.g. ENOBUFS).
let cachedSfPath: string | null | undefined; // undefined = not yet probed

/**
 * Exposed for testing only — pre-seeds the cached sf executable path, bypassing the probe spawn.
 * Pass `undefined` to reset the cache so the next call triggers a fresh probe.
 */
export function setSfPathCacheForTesting(value: string | null | undefined): void {
  cachedSfPath = value;
}

// Platform override used in tests so Windows-specific shell logic can be exercised on any OS.
let sfPlatformOverride: NodeJS.Platform | undefined;
/** Exposed for testing only — overrides process.platform for needsWindowsShell decisions. */
export function setSfPlatformForTesting(platform: NodeJS.Platform | undefined): void {
  sfPlatformOverride = platform;
}

/**
 * Returns true when spawning `executable` requires the Windows shell.
 * On Windows, `.cmd` and `.bat` batch scripts cannot be executed directly by
 * Node's spawnSync — they must be invoked through cmd.exe (i.e. shell: true).
 * The bare name "sf" also needs this treatment on Windows because the file on
 * disk is actually "sf.cmd" and Node won't auto-append the extension.
 *
 * The `platform` parameter defaults to `process.platform` and is exposed for
 * unit testing so tests can verify both Windows and non-Windows behaviour
 * without having to run on the corresponding OS.
 */
export function needsWindowsShell(executable: string, platform = process.platform): boolean {
  if (platform !== 'win32') return false;
  const lower = executable.toLowerCase();
  return lower.endsWith('.cmd') || lower.endsWith('.bat') || !path.extname(lower);
}

function resolveSfExecutable(): string | null {
  if (cachedSfPath !== undefined) return cachedSfPath;
  const platform = sfPlatformOverride ?? process.platform;

  // Two-phase probe avoids false-positives on Windows with shell:true.
  // When shell:true is used, cmd.exe spawns successfully even when `sf` is
  // missing — it exits non-zero with "not recognised" in stderr but sets no
  // probe.error. Trying shell:false first catches both cases correctly.
  //
  // First attempt: shell:false (works on Linux/macOS; gives ENOENT on Windows if
  // sf.cmd is on PATH but requires the shell).
  const probe = sfSpawnHelper.spawnSync('sf', ['--version'], {
    encoding: 'utf-8',
    shell: false,
    maxBuffer: 1024 * 1024,
  });
  if (!probe.error && probe.status === 0) {
    cachedSfPath = 'sf';
    return cachedSfPath;
  }

  // Windows fallback: retry with shell:true when the plain probe failed
  // with ENOENT — meaning sf.cmd exists on PATH but can't run without the shell.
  if (platform === 'win32' && (probe.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
    const probeShell = sfSpawnHelper.spawnSync('sf', ['--version'], {
      encoding: 'utf-8',
      shell: true,
      maxBuffer: 1024 * 1024,
    });
    if (!probeShell.error && probeShell.status === 0) {
      cachedSfPath = 'sf';
      return cachedSfPath;
    }
  }

  // Fall back to common install locations
  for (const candidate of getSfCommonPaths()) {
    if (fs.existsSync(candidate)) {
      cachedSfPath = candidate;
      return cachedSfPath;
    }
  }
  cachedSfPath = null;
  return null;
}

/**
 * Reject shell metacharacters in an sf_path that will be executed via shell:true.
 * On Windows, cmd.exe interprets & | ; < > ` ' " and newlines as shell syntax.
 * A valid filesystem path should never contain these characters.
 */
function assertShellSafePath(sfPath: string): void {
  if (/[&|;<>`'"\n\r]/.test(sfPath)) {
    throw Object.assign(
      new Error(
        'sf_path contains characters that are unsafe for shell execution on Windows ' +
          '(& | ; < > ` \' " or line-breaks). Provide an absolute filesystem path to the sf executable.'
      ),
      { code: 'INVALID_SF_PATH' }
    );
  }
}

function runSfCommand(args: string[], sfPath?: string): SpawnResult {
  // Use explicit path if provided; otherwise use cached probe result
  const executable = sfPath ?? resolveSfExecutable();
  if (!executable) throw new SfNotFoundError();

  const platform = sfPlatformOverride ?? process.platform;
  const useShell = needsWindowsShell(executable, platform);

  // Guard against injection when shell:true is used with a user-supplied path.
  // Common install locations returned by resolveSfExecutable() are safe by construction.
  if (useShell && sfPath) {
    assertShellSafePath(sfPath);
  }

  const result = sfSpawnHelper.spawnSync(executable, args, {
    encoding: 'utf-8',
    shell: useShell,
    maxBuffer: MAX_BUFFER,
  });

  if (result.error) {
    const err = result.error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new SfNotFoundError(sfPath);
    }
    throw result.error;
  }

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  };
}

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

// ── Tool: provar.automation.config.load ──────────────────────────────────────

export function registerAutomationConfigLoad(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.automation.config.load',
    [
      'Register a provardx-properties.json file as the active Provar configuration.',
      'Invokes `sf provar automation config load --properties-file <path>`, writing the path to ~/.sf/config.json.',
      'REQUIRED before provar.automation.compile or provar.automation.testrun — without this step those commands fail with MISSING_FILE.',
      'Typical workflow: provar.automation.config.load → provar.automation.compile → provar.automation.testrun.',
    ].join(' '),
    {
      properties_path: z
        .string()
        .describe('Absolute path to the provardx-properties.json file to register as active configuration'),
      sf_path: z
        .string()
        .optional()
        .describe('Path to the sf CLI executable when not in PATH (e.g. "~/.nvm/versions/node/v22.0.0/bin/sf")'),
    },
    ({ properties_path, sf_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar.automation.config.load', { requestId, properties_path });

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
        return handleSpawnError(err, requestId, 'provar.automation.config.load');
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
    filtered += `\n[testrun: ${suppressed} lines suppressed (schema validator / logger noise) — use provar.testrun.rca for full results]`;
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

// ── Tool: provar.automation.testrun ───────────────────────────────────────────

export function registerAutomationTestRun(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.automation.testrun',
    [
      'Trigger a LOCAL Provar automation test run using installed Provar binaries. Invokes `sf provar automation test run`.',
      'PREREQUISITE: Run provar.automation.config.load first to register a provardx-properties.json — without this the command fails with MISSING_FILE.',
      'Requires Provar to be installed locally and provarHome set correctly in the properties file.',
      'Use provar.automation.setup first if Provar is not yet installed.',
      'For grid/CI execution via Provar Quality Hub instead of running locally, use provar.qualityhub.testrun.',
      'Typical local AI loop: config.load → compile → testrun → inspect results.',
    ].join(' '),
    {
      flags: z
        .array(z.string())
        .optional()
        .default([])
        .describe('Raw CLI flags to forward (e.g. ["--project-path", "/path/to/project"])'),
      sf_path: z
        .string()
        .optional()
        .describe('Path to the sf CLI executable when not in PATH (e.g. "~/.nvm/versions/node/v22.0.0/bin/sf")'),
    },
    ({ flags, sf_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar.automation.testrun', { requestId });

      try {
        const result = runSfCommand(['provar', 'automation', 'test', 'run', ...flags], sf_path);
        const { filtered, suppressed } = filterTestRunOutput(result.stdout);

        // Attempt to enrich the response with structured step data from JUnit XML
        const resultsPath = readResultsPathFromSfConfig(config);
        const { steps, warning: junitWarning } = resultsPath
          ? parseJUnitResults(resultsPath)
          : { steps: [], warning: undefined };

        if (result.exitCode !== 0) {
          const { filtered: filteredErr, suppressed: suppressedErr } = filterTestRunOutput(
            result.stderr || result.stdout
          );
          const errBody: Record<string, unknown> = {
            ...makeError('AUTOMATION_TESTRUN_FAILED', filteredErr, requestId),
            ...(suppressedErr > 0 ? { output_lines_suppressed: suppressedErr } : {}),
          };
          if (steps.length > 0) errBody['steps'] = steps;
          if (!resultsPath || junitWarning) {
            errBody['details'] = {
              warning:
                junitWarning ??
                'Could not locate results directory — step-level output unavailable. Run provar.automation.config.load first.',
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
        if (steps.length > 0) response['steps'] = steps;
        if (junitWarning) response['details'] = { warning: junitWarning };
        return { content: [{ type: 'text' as const, text: JSON.stringify(response) }], structuredContent: response };
      } catch (err) {
        return handleSpawnError(err, requestId, 'provar.automation.testrun');
      }
    }
  );
}

// ── Tool: provar.automation.compile ───────────────────────────────────────────

export function registerAutomationCompile(server: McpServer): void {
  server.tool(
    'provar.automation.compile',
    [
      'Compile a Provar automation project. Invokes `sf provar automation project compile`.',
      'PREREQUISITE: Run provar.automation.config.load first to register a provardx-properties.json — without this the command fails with MISSING_FILE.',
      'Run this before triggering a test run after modifying test cases.',
    ].join(' '),
    {
      flags: z
        .array(z.string())
        .optional()
        .default([])
        .describe('Raw CLI flags to forward (e.g. ["--project-path", "/path/to/project"])'),
      sf_path: z
        .string()
        .optional()
        .describe('Path to the sf CLI executable when not in PATH (e.g. "~/.nvm/versions/node/v22.0.0/bin/sf")'),
    },
    ({ flags, sf_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar.automation.compile', { requestId });

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
        return handleSpawnError(err, requestId, 'provar.automation.compile');
      }
    }
  );
}

// ── Tool: provar.automation.metadata.download ─────────────────────────────────

const DOWNLOAD_ERROR_SUGGESTION =
  'A [DOWNLOAD_ERROR] almost always means a Salesforce authentication failure for the connection being used. ' +
  'Check: (1) the connection credentials in the Provar project .secrets file are current and not expired; ' +
  '(2) the named connection exists in the project and the name is spelled correctly (case-sensitive); ' +
  '(3) if using a scratch org, confirm it has not expired (`sf org list`); ' +
  '(4) if testprojectSecrets is set in provardx-properties.json, it must be the encryption key string used to decrypt .secrets — not a file path.';

export function registerAutomationMetadataDownload(server: McpServer): void {
  server.tool(
    'provar.automation.metadata.download',
    [
      'Download Salesforce metadata for one or more connections into a Provar project.',
      'Invokes `sf provar automation metadata download`.',
      'PREREQUISITE: Call provar.automation.config.load first — without it the command fails with MISSING_FILE.',
      'Use the -c flag to specify connections: flags: ["-c", "ConnectionName1,ConnectionName2"].',
      'Connection names are case-sensitive and must match the names defined in the Provar project.',
      'If the download fails with [DOWNLOAD_ERROR], this is almost always a Salesforce authentication issue —',
      'check that the credentials in the project .secrets file are current and that any referenced scratch orgs have not expired.',
    ].join(' '),
    {
      flags: z
        .array(z.string())
        .optional()
        .default([])
        .describe(
          'Raw CLI flags to forward. Use ["-c", "Name1,Name2"] (or the equivalent --connections form) to target specific connections. Example: ["-c", "MyOrg,SandboxOrg"]'
        ),
      sf_path: z
        .string()
        .optional()
        .describe('Path to the sf CLI executable when not in PATH (e.g. "~/.nvm/versions/node/v22.0.0/bin/sf")'),
    },
    ({ flags, sf_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar.automation.metadata.download', { requestId });

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
        return handleSpawnError(err, requestId, 'provar.automation.metadata.download');
      }
    }
  );
}

// ── Tool: provar.automation.setup ─────────────────────────────────────────────

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
  server.tool(
    'provar.automation.setup',
    [
      'Download and install Provar Automation binaries locally. Invokes `sf provar automation setup`.',
      'Before downloading, checks for existing Provar installations in:',
      '  • PROVAR_HOME environment variable',
      '  • ./ProvarHome (default CLI install location)',
      '  • C:\\Program Files\\Provar* (Windows system installs)',
      '  • /Applications/Provar* (macOS app installs)',
      'If an existing installation is found, returns its path so you can set provarHome in the properties file — skipping the download unless force is true.',
      'After a successful install, update the provarHome property in provardx-properties.json to the returned install_path using provar.properties.set.',
    ].join(' '),
    {
      version: z
        .string()
        .optional()
        .describe('Specific Provar Automation version to install, e.g. "2.12.0". Omit to install the latest release.'),
      force: z
        .boolean()
        .optional()
        .default(false)
        .describe('Force a fresh download even if an existing installation is already detected (default: false).'),
      sf_path: z
        .string()
        .optional()
        .describe('Path to the sf CLI executable when not in PATH (e.g. "~/.nvm/versions/node/v22.0.0/bin/sf")'),
    },
    ({ version, force, sf_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar.automation.setup', { requestId, version, force });

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
            'Update provarHome in your provardx-properties.json to this path using provar.properties.set.',
          ].join(' '),
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
      } catch (err) {
        return handleSpawnError(err, requestId, 'provar.automation.setup');
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
