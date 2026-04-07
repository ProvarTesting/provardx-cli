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
    } catch { /* skip */ }
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

/** Exposed for testing only — pre-seeds the cached sf executable path, bypassing the probe spawn. */
export function setSfPathCacheForTesting(value: string | null): void {
  cachedSfPath = value;
}

function resolveSfExecutable(): string | null {
  if (cachedSfPath !== undefined) return cachedSfPath;
  // Check PATH first via a cheap version probe
  const probe = sfSpawnHelper.spawnSync('sf', ['--version'], { encoding: 'utf-8', shell: false, maxBuffer: 1024 * 1024 });
  if (!probe.error) {
    cachedSfPath = 'sf';
    return cachedSfPath;
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


function runSfCommand(args: string[], sfPath?: string): SpawnResult {
  // Use explicit path if provided; otherwise use cached probe result
  const executable = sfPath ?? resolveSfExecutable();
  if (!executable) throw new SfNotFoundError();

  const result = sfSpawnHelper.spawnSync(executable, args, { encoding: 'utf-8', shell: false, maxBuffer: MAX_BUFFER });

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

function handleSpawnError(err: unknown, requestId: string, toolName: string): { isError: true; content: Array<{ type: 'text'; text: string }> } {
  const error = err as Error & { code?: string };
  log('error', `${toolName} failed`, { requestId, error: error.message });
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: JSON.stringify(makeError(error.code ?? 'SF_ERROR', error.message, requestId, false)) }],
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
      properties_path: z.string().describe('Absolute path to the provardx-properties.json file to register as active configuration'),
      sf_path: z.string().optional().describe('Path to the sf CLI executable when not in PATH (e.g. "~/.nvm/versions/node/v22.0.0/bin/sf")'),
    },
    ({ properties_path, sf_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar.automation.config.load', { requestId, properties_path });

      try {
        assertPathAllowed(properties_path, config.allowedPaths);
        const result = runSfCommand(['provar', 'automation', 'config', 'load', '--properties-file', properties_path], sf_path);
        const response = { requestId, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, properties_path };

        if (result.exitCode !== 0) {
          return { isError: true as const, content: [{ type: 'text' as const, text: JSON.stringify(makeError('AUTOMATION_CONFIG_LOAD_FAILED', result.stderr || result.stdout, requestId)) }] };
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(response) }], structuredContent: response };
      } catch (err) {
        if (err instanceof PathPolicyError) {
          return { isError: true as const, content: [{ type: 'text' as const, text: JSON.stringify(makeError(err.code, err.message, requestId, false)) }] };
        }
        return handleSpawnError(err, requestId, 'provar.automation.config.load');
      }
    }
  );
}

// ── Tool: provar.automation.testrun ───────────────────────────────────────────

export function registerAutomationTestRun(server: McpServer): void {
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
      flags: z.array(z.string()).optional().default([]).describe('Raw CLI flags to forward (e.g. ["--project-path", "/path/to/project"])'),
      sf_path: z.string().optional().describe('Path to the sf CLI executable when not in PATH (e.g. "~/.nvm/versions/node/v22.0.0/bin/sf")'),
    },
    ({ flags, sf_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar.automation.testrun', { requestId });

      try {
        const result = runSfCommand(['provar', 'automation', 'test', 'run', ...flags], sf_path);
        const response = { requestId, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };

        if (result.exitCode !== 0) {
          return { isError: true as const, content: [{ type: 'text' as const, text: JSON.stringify(makeError('AUTOMATION_TESTRUN_FAILED', result.stderr || result.stdout, requestId)) }] };
        }

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
      flags: z.array(z.string()).optional().default([]).describe('Raw CLI flags to forward (e.g. ["--project-path", "/path/to/project"])'),
      sf_path: z.string().optional().describe('Path to the sf CLI executable when not in PATH (e.g. "~/.nvm/versions/node/v22.0.0/bin/sf")'),
    },
    ({ flags, sf_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar.automation.compile', { requestId });

      try {
        const result = runSfCommand(['provar', 'automation', 'project', 'compile', ...flags], sf_path);
        const response = { requestId, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };

        if (result.exitCode !== 0) {
          return { isError: true as const, content: [{ type: 'text' as const, text: JSON.stringify(makeError('AUTOMATION_COMPILE_FAILED', result.stderr || result.stdout, requestId)) }] };
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
      flags: z.array(z.string()).optional().default([]).describe(
        'Raw CLI flags to forward. Use ["-c", "Name1,Name2"] to specify connections (required). Example: ["-c", "MyOrg,SandboxOrg"]'
      ),
      sf_path: z.string().optional().describe('Path to the sf CLI executable when not in PATH (e.g. "~/.nvm/versions/node/v22.0.0/bin/sf")'),
    },
    ({ flags, sf_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar.automation.metadata.download', { requestId });

      try {
        const result = runSfCommand(['provar', 'automation', 'metadata', 'download', ...flags], sf_path);
        const message = result.stderr || result.stdout;

        if (result.exitCode !== 0) {
          const isDownloadError = message.includes('[DOWNLOAD_ERROR]');
          const details: Record<string, unknown> = isDownloadError ? { suggestion: DOWNLOAD_ERROR_SUGGESTION } : {};
          return { isError: true as const, content: [{ type: 'text' as const, text: JSON.stringify(makeError('AUTOMATION_METADATA_FAILED', message, requestId, false, details)) }] };
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
  win32: [
    'C:/Program Files',
    'C:/Program Files (x86)',
  ],
  darwin: [
    '/Applications',
  ],
  linux: [
    '/opt',
    '/usr/local',
  ],
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
      version: z.string().optional().describe(
        'Specific Provar Automation version to install, e.g. "2.12.0". Omit to install the latest release.'
      ),
      force: z.boolean().optional().default(false).describe(
        'Force a fresh download even if an existing installation is already detected (default: false).'
      ),
      sf_path: z.string().optional().describe('Path to the sf CLI executable when not in PATH (e.g. "~/.nvm/versions/node/v22.0.0/bin/sf")'),
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
            content: [{ type: 'text' as const, text: JSON.stringify(makeError('AUTOMATION_SETUP_FAILED', result.stderr || result.stdout, requestId)) }],
          };
        }

        // ── 3. Locate the freshly installed ProvarHome ───────────────────────
        const freshInstalls = findExistingInstallations();
        const localInstall = freshInstalls.find(i => i.source === 'local') ?? freshInstalls[0];
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
  registerAutomationTestRun(server);
  registerAutomationCompile(server);
  registerAutomationMetadataDownload(server);
}
