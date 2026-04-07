/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from '../server.js';
import { assertPathAllowed, PathPolicyError } from '../security/pathPolicy.js';
import { makeError, makeRequestId } from '../schemas/common.js';
import { log } from '../logging/logger.js';

export function registerProjectInspect(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.project.inspect',
    [
      'Inspect a Provar project folder and return a structured inventory.',
      'Returns: provardx-properties.json config files (for ProvarDX CLI runs),',
      'ANT build files (build.xml etc in ANT/ dirs, for CLI/pipeline runs),',
      'source page object directories with Java file counts (src/pageobjects — compiled bin/ dirs excluded),',
      '.testcase files found recursively under tests/,',
      'count of custom test step files in src/customapis/,',
      'count of data source files (CSV/XLSX/JSON) in data/ and templates/ dirs,',
      'test plan coverage showing which test cases are covered vs uncovered,',
      'and connection + environment overview parsed from the .testproject file',
      '(Salesforce, UI Testing, Web Services, Quality Hub, Database, and other connection types).',
    ].join(' '),
    {
      project_path: z
        .string()
        .describe('Absolute or relative path to the Provar project root directory'),
    },
    ({ project_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar.project.inspect', { requestId, project_path });

      try {
        assertPathAllowed(project_path, config.allowedPaths);
        const resolved = path.resolve(project_path);

        if (!fs.existsSync(resolved)) {
          const err = makeError('PATH_NOT_FOUND', `Project path does not exist: ${resolved}`, requestId);
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
        }

        const result = buildProjectInventory(resolved, requestId);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (err: unknown) {
        const error = err as Error & { code?: string };
        const errResult = makeError(
          error instanceof PathPolicyError ? error.code : (error.code ?? 'INSPECT_ERROR'),
          error.message,
          requestId,
          false
        );
        log('error', 'provar.project.inspect failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}

// ─── types ────────────────────────────────────────────────────────────────────

interface PageObjectDir {
  path: string;         // relative path from project root
  java_file_count: number;
}

interface SecretsValidation {
  secrets_file: string;           // relative path (from secureStoragePath in .testproject)
  found: boolean;                 // whether the file exists
  encryptor_check_present: boolean; // Provar Secrets Password has been configured
  all_values_encrypted: boolean;  // every non-comment entry has an ENC1() value
  total_entries: number;          // total key=value entries (excluding comments)
  encrypted_count: number;        // entries with ENC1() values
  unencrypted_key_count: number;  // entries WITHOUT ENC1() — pass to PROJ-ENC-001
  unencrypted_keys: string[];     // key names only, never values — e.g. ["uuid.password"]
}

interface SfConnection {
  name: string;
  /** Connection type — "communities" (userType=COMMUNITIES), "portal", or "standard" */
  sub_type: 'standard' | 'communities' | 'portal';
  /**
   * Auth method derived from the primary connectionUrl:
   * - "login-as" — logonAsConnection= is set (delegates to another connection)
   * - "oauth" — authenticationType=OAUTH
   * - "basic" — password= present (username/password, credentials in .secrets)
   * - "unknown" — none of the above matched
   */
  auth_method: 'login-as' | 'oauth' | 'basic' | 'unknown';
  /** Target org type derived from environment= param: SANDBOX, PROD_DEV (Production/Developer), or other */
  sf_environment: 'sandbox' | 'production-developer' | 'other' | null;
  /** Name of the parent connection used for logon-as, or null */
  logon_as_connection: string | null;
  /** true when auth_method !== "login-as" — flag for admin-user review */
  is_direct_login: boolean;
}

interface ConnectionOverview {
  salesforce: SfConnection[];
  ui_testing: string[];
  quality_hub: string[];
  web_service_rest: string[];
  web_service_soap: string[];
  database: string[];
  google: string[];
  microsoft: string[];
  zephyr: string[];
  sso: string[];
  other: Array<{ class: string; name: string }>;
  summary: Record<string, number>;
}

interface TestProjectInfo {
  found: boolean;
  file_path: string | null;
  environments: string[];
  connections: ConnectionOverview;
}

interface PlanCoverage {
  test_plan_count: number;
  test_suite_count: number;
  test_instance_count: number;
  covered_test_case_paths: string[];
  uncovered_test_case_paths: string[];
  coverage_percent: number;
}

// ─── inventory builder ────────────────────────────────────────────────────────

function buildProjectInventory(projectPath: string, requestId: string): Record<string, unknown> {
  const provardxPropertiesFiles: string[] = [];
  const antBuildFiles: string[] = [];
  const sourcePageObjectDirs: PageObjectDir[] = [];
  const testCaseFilesDisplay: string[] = [];    // capped at 500 for API display
  const allTestCasePaths = new Set<string>();   // uncapped — used for coverage
  let customTestStepFileCount = 0;
  let dataSourceFileCount = 0;
  const dataSourceDirs: string[] = [];

  walkDir(projectPath, (filePath, isDir, name) => {
    const rel = path.relative(projectPath, filePath).replace(/\\/g, '/');

    if (isDir) {
      if (name === 'bin') return false;
      if (name === 'plans') return false; // handled by buildPlanCoverage (needs dot-file visibility)

      if (name === 'pageobjects') {
        const parentRel = path.relative(projectPath, path.dirname(filePath)).replace(/\\/g, '/');
        if (parentRel === 'src' || parentRel.endsWith('/src')) {
          // Count .java files now — don't rely on recursion (we return false below)
          const javaCount = countFilesRecursive(filePath, (n) => n.endsWith('.java'));
          sourcePageObjectDirs.push({ path: rel, java_file_count: javaCount });
        }
        return false;
      }

      if (name === 'customapis') {
        customTestStepFileCount += countFilesRecursive(filePath, isSourceFile);
        return false;
      }

      if (name === 'data' || name === 'templates') {
        dataSourceDirs.push(rel);
        dataSourceFileCount += countFilesRecursive(filePath, isDataFile);
        return false;
      }

      return true;
    }

    if (name === 'provardx-properties.json') {
      provardxPropertiesFiles.push(rel);
      return true;
    }

    if (name.endsWith('.testcase') && (rel.startsWith('tests/') || rel.includes('/tests/'))) {
      allTestCasePaths.add(rel);
      if (testCaseFilesDisplay.length < 500) testCaseFilesDisplay.push(rel);
      return true;
    }

    if (rel.startsWith('ANT/') || rel.includes('/ANT/')) {
      if (name.endsWith('.xml') || name.endsWith('.properties')) antBuildFiles.push(rel);
      return true;
    }

    return true;
  });

  const { provarHome, provarHomeSource } = detectProvarHome(projectPath, provardxPropertiesFiles, antBuildFiles);
  const testSuiteDirs = getTopLevelTestSuites(projectPath);
  const planCoverage = buildPlanCoverage(projectPath, allTestCasePaths);
  const testProject = parseTestProject(projectPath);
  const secretsValidation = validateSecretsFile(projectPath, testProject);

  return {
    requestId,
    project_path: projectPath,
    provar_home: provarHome,
    provar_home_source: provarHomeSource,
    provardx_properties_files: provardxPropertiesFiles,
    ant_build_files: antBuildFiles,
    source_page_object_dirs: sourcePageObjectDirs,
    test_suite_dirs: testSuiteDirs,
    test_case_files: testCaseFilesDisplay,
    custom_test_step_file_count: customTestStepFileCount,
    data_source_dirs: dataSourceDirs,
    data_source_file_count: dataSourceFileCount,
    test_plan_coverage: planCoverage,
    test_project: testProject,
    secrets_validation: secretsValidation,
    summary: {
      provardx_properties_count: provardxPropertiesFiles.length,
      ant_build_file_count: antBuildFiles.length,
      source_page_object_dir_count: sourcePageObjectDirs.length,
      page_object_file_count: sourcePageObjectDirs.reduce((s, d) => s + d.java_file_count, 0),
      test_suite_count: testSuiteDirs.length,
      test_case_count: allTestCasePaths.size,
      custom_test_step_count: customTestStepFileCount,
      data_source_count: dataSourceFileCount,
      test_plan_count: planCoverage.test_plan_count,
      test_suites_in_plans_count: planCoverage.test_suite_count,
      test_instance_count: planCoverage.test_instance_count,
      coverage_percent: planCoverage.coverage_percent,
      environment_count: testProject.environments.length,
      connection_count: testProject.connections.summary['total'] ?? 0,
      secrets_encrypted: secretsValidation.all_values_encrypted,
      unencrypted_secret_count: secretsValidation.unencrypted_key_count,
    },
  };
}

// ─── .testproject parser ──────────────────────────────────────────────────────

/**
 * Parses the .testproject file (a hidden dot-file at the project root).
 * Extracts environments and connection overview.
 *
 * Connection class → label mapping (verified across 136 POC projects):
 * - sf → Salesforce (sub-type detection: communities / portal / standard)
 * - ui → UI Testing (browser/Selenium connections)
 * - testmanager → Provar Quality Hub
 * - webservice → Web Service REST (url starts with "restservice:") or SOAP
 * - google → Google (Gmail / Google Workspace)
 * - msexc → Microsoft (Exchange / Outlook via EWS — url starts with "exchange:")
 * - database → Database (Oracle, SQL Server, DB2, MySQL, PostgreSQL — rare in field)
 * - zephyr / zephyrScale / zephyrServer → Zephyr (Cloud & Server)
 * - sso → SSO
 * - anything else → other (raw class name preserved for forward-compatibility)
 */
function parseTestProject(projectPath: string): TestProjectInfo {
  const testProjectPath = path.join(projectPath, '.testproject');
  const empty: TestProjectInfo = {
    found: false,
    file_path: null,
    environments: [],
    connections: emptyConnectionOverview(),
  };

  if (!fs.existsSync(testProjectPath)) return empty;

  let content: string;
  try {
    content = fs.readFileSync(testProjectPath, 'utf-8');
  } catch {
    return empty;
  }

  const environments = parseEnvironments(content);
  const connections = parseConnectionClasses(content);

  return {
    found: true,
    file_path: '.testproject',
    environments,
    connections,
  };
}

// ─── .secrets validator ───────────────────────────────────────────────────────

/**
 * Reads the .secrets file (a Java properties file) and checks that every
 * credential value is wrapped in an ENC1() block.
 *
 * Security note: only key NAMES are returned — plaintext values are never
 * included in the output, even for unencrypted entries.
 *
 * The secrets file path comes from <secureStoragePath> in .testproject
 * (defaults to ".secrets" at the project root).
 *
 * File format:
 * - `# comment`
 * - `<uuid>.<field>=ENC1(base64...)` — correctly encrypted
 * - `<uuid>.<field>=plaintextpassword` — VIOLATION
 * - `Encryptor.check=ENC1(...)` — sentinel (present when password is configured)
 */
function validateSecretsFile(projectPath: string, testProject: TestProjectInfo): SecretsValidation {
  // Resolve path from .testproject <secureStoragePath>, defaulting to ".secrets"
  let secretsRelPath = '.secrets';
  if (testProject.found) {
    try {
      const raw = fs.readFileSync(path.join(projectPath, '.testproject'), 'utf-8');
      const match = raw.match(/<secureStoragePath>([^<]+)<\/secureStoragePath>/);
      if (match?.[1]) secretsRelPath = match[1].trim();
    } catch { /* use default */ }
  }

  const notFound: SecretsValidation = {
    secrets_file: secretsRelPath,
    found: false,
    encryptor_check_present: false,
    all_values_encrypted: false,
    total_entries: 0,
    encrypted_count: 0,
    unencrypted_key_count: 0,
    unencrypted_keys: [],
  };

  const secretsPath = path.join(projectPath, secretsRelPath);
  if (!fs.existsSync(secretsPath)) return notFound;

  let content: string;
  try {
    content = fs.readFileSync(secretsPath, 'utf-8');
  } catch {
    return notFound;
  }

  let encryptorCheckPresent = false;
  let totalEntries = 0;
  let encryptedCount = 0;
  const unencryptedKeys: string[] = [];

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trimEnd();
    // Skip blank lines and comment lines (Java properties # or ! prefix)
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;

    // Split on the FIRST unescaped '=' — everything before is the key
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1); // do NOT trim — value may legitimately start with a space

    if (key === 'Encryptor.check') {
      // Sentinel entry — indicates Provar Secrets Password is configured
      encryptorCheckPresent = true;
      // Count it but don't add to unencrypted list even if somehow unwrapped
      totalEntries++;
      if (value.startsWith('ENC1(')) encryptedCount++;
      continue;
    }

    totalEntries++;
    if (value.startsWith('ENC1(')) {
      encryptedCount++;
    } else {
      // Only record the KEY name — never the plaintext value
      unencryptedKeys.push(key);
    }
  }

  return {
    secrets_file: secretsRelPath,
    found: true,
    encryptor_check_present: encryptorCheckPresent,
    all_values_encrypted: unencryptedKeys.length === 0,
    total_entries: totalEntries,
    encrypted_count: encryptedCount,
    unencrypted_key_count: unencryptedKeys.length,
    unencrypted_keys: unencryptedKeys,
  };
}

function parseEnvironments(content: string): string[] {
  const names: string[] = [];
  const section = content.match(/<environments>([\s\S]*?)<\/environments>/);
  if (!section) return names;
  const pattern = /<environment\s[^>]*\bname="([^"]+)"/g;
  let m;
  while ((m = pattern.exec(section[1])) !== null) names.push(m[1]);
  return names;
}

function parseConnectionClasses(content: string): ConnectionOverview {
  const result = emptyConnectionOverview();

  const classesBlock = content.match(/<connectionClasses>([\s\S]*?)<\/connectionClasses>/);
  if (!classesBlock) return result;

  const classPattern = /<connectionClass\s+name="([^"]+)">([\s\S]*?)<\/connectionClass>/g;
  let classMatch;
  while ((classMatch = classPattern.exec(classesBlock[1])) !== null) {
    const className = classMatch[1];
    const classContent = classMatch[2];

    const connPattern = /<connection\s[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)<\/connection>/g;
    let connMatch;
    while ((connMatch = connPattern.exec(classContent)) !== null) {
      const connName = connMatch[1];
      const connContent = connMatch[2];

      // Collect all url="..." values for this connection (may have per-environment overrides)
      const urlPattern = /\burl="([^"]+)"/g;
      const urls: string[] = [];
      let urlMatch;
      while ((urlMatch = urlPattern.exec(connContent)) !== null) urls.push(urlMatch[1]);

      categoriseConnection(result, className, connName, urls);
    }
  }

  // Build summary totals
  const sfCommunities  = result.salesforce.filter((c) => c.sub_type === 'communities').length;
  const sfPortal       = result.salesforce.filter((c) => c.sub_type === 'portal').length;
  const sfLoginAs      = result.salesforce.filter((c) => c.auth_method === 'login-as').length;
  const sfOAuth        = result.salesforce.filter((c) => c.auth_method === 'oauth').length;
  const sfBasic        = result.salesforce.filter((c) => c.auth_method === 'basic').length;
  const sfDirectLogin  = result.salesforce.filter((c) => c.is_direct_login).length;
  result.summary = {
    salesforce: result.salesforce.length,
    salesforce_standard: result.salesforce.length - sfCommunities - sfPortal,
    salesforce_communities: sfCommunities,
    salesforce_portal: sfPortal,
    salesforce_auth_login_as: sfLoginAs,
    salesforce_auth_oauth: sfOAuth,
    salesforce_auth_basic: sfBasic,
    salesforce_direct_login: sfDirectLogin,   // review these — may be admin users
    ui_testing: result.ui_testing.length,
    quality_hub: result.quality_hub.length,
    web_service_rest: result.web_service_rest.length,
    web_service_soap: result.web_service_soap.length,
    database: result.database.length,
    google: result.google.length,
    microsoft: result.microsoft.length,
    zephyr: result.zephyr.length,
    sso: result.sso.length,
    other: result.other.length,
    total:
      result.salesforce.length +
      result.ui_testing.length +
      result.quality_hub.length +
      result.web_service_rest.length +
      result.web_service_soap.length +
      result.database.length +
      result.google.length +
      result.microsoft.length +
      result.zephyr.length +
      result.sso.length +
      result.other.length,
  };

  return result;
}

// eslint-disable-next-line complexity
function categoriseConnection(
  result: ConnectionOverview,
  className: string,
  name: string,
  urls: string[]
): void {
  // Use the first URL for type inference; env-override URLs share the same class
  const primaryUrl = urls[0] ?? '';

  switch (className) {
    case 'sf': {
      // ── sub-type ──────────────────────────────────────────────────────────
      const isCommunities = primaryUrl.includes('userType=COMMUNITIES');
      const isPortal = !isCommunities && primaryUrl.includes('portal=');
      const subType: 'standard' | 'communities' | 'portal' = isCommunities
        ? 'communities'
        : isPortal
          ? 'portal'
          : 'standard';

      // ── auth method ───────────────────────────────────────────────────────
      const logonAsMatch = primaryUrl.match(/logonAsConnection=([^;]+)/);
      const isLogonAs = logonAsMatch !== null;
      const isOAuth = primaryUrl.includes('authenticationType=OAUTH');
      const isBasic = primaryUrl.includes('password=');
      const authMethod: SfConnection['auth_method'] = isLogonAs
        ? 'login-as'
        : isOAuth
          ? 'oauth'
          : isBasic
            ? 'basic'
            : 'unknown';

      // ── SF environment (org type) ─────────────────────────────────────────
      const envMatch = primaryUrl.match(/(?:^|;)environment=([^;]+)/);
      const envValue = envMatch?.[1]?.toUpperCase();
      const sfEnvironment: SfConnection['sf_environment'] =
        envValue === 'SANDBOX'   ? 'sandbox' :
        envValue === 'PROD_DEV'  ? 'production-developer' :
        envValue                 ? 'other' :
                                   null;

      result.salesforce.push({
        name,
        sub_type: subType,
        auth_method: authMethod,
        sf_environment: sfEnvironment,
        logon_as_connection: logonAsMatch?.[1] ?? null,
        is_direct_login: !isLogonAs,
      });
      break;
    }
    case 'ui':
      result.ui_testing.push(name);
      break;
    case 'testmanager':
      result.quality_hub.push(name);
      break;
    case 'webservice':
      if (primaryUrl.startsWith('restservice:')) {
        result.web_service_rest.push(name);
      } else {
        result.web_service_soap.push(name);
      }
      break;
    case 'database':
      result.database.push(name);
      break;
    case 'google':
      result.google.push(name);
      break;
    case 'msexc':        // Microsoft Exchange / Outlook (EWS)
    case 'microsoft':    // kept as fallback in case variant exists
      result.microsoft.push(name);
      break;
    case 'zephyr':
    case 'zephyrScale':
    case 'zephyrServer':
      result.zephyr.push(name);
      break;
    case 'sso':
      result.sso.push(name);
      break;
    default:
      result.other.push({ class: className, name });
      break;
  }
}

function emptyConnectionOverview(): ConnectionOverview {
  return {
    salesforce: [],
    ui_testing: [],
    quality_hub: [],
    web_service_rest: [],
    web_service_soap: [],
    database: [],
    google: [],
    microsoft: [],
    zephyr: [],
    sso: [],
    other: [],
    summary: {},
  };
}

// ─── test plan coverage ───────────────────────────────────────────────────────

/**
 * Builds a map of testcase UUID (registryId / id / guid) → project-relative path.
 * Used as a UUID-based fallback when testCasePath in a .testinstance doesn't match
 * the on-disk path exactly (e.g. different separators or moved files).
 */
function buildProjectTestCaseIdMap(projectPath: string): Map<string, string> {
  const testsDir = path.join(projectPath, 'tests');
  const idMap = new Map<string, string>();
  if (!fs.existsSync(testsDir)) return idMap;

  function walk(dir: string): void {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(fullPath); }
        else if (entry.name.endsWith('.testcase')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const rel = path.relative(projectPath, fullPath).replace(/\\/g, '/');
            for (const attr of ['registryId', 'id', 'guid'] as const) {
              const m = content.match(new RegExp(`${attr}=["']([^"']+)["']`));
              if (m?.[1] && !idMap.has(m[1])) idMap.set(m[1], rel);
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  }
  walk(testsDir);
  return idMap;
}

/**
 * Plans structure:
 * - plans/
 * - plans/{PlanName}/ — test plan directory
 * - plans/{PlanName}/.planitem — plan definition (hidden dot-file)
 * - plans/{PlanName}/{SuiteName}/ — test suite directory
 * - plans/{PlanName}/{SuiteName}/.planitem — suite definition
 * - plans/{PlanName}/{SuiteName}/{Name}.testinstance — references .testcase via testCasePath
 *
 * Depth (relative to plans/):
 * - split('/').length === 2 → plan-level .planitem
 * - split('/').length >= 3 → suite-level .planitem
 */
function buildPlanCoverage(projectPath: string, allTestCasePaths: Set<string>): PlanCoverage {
  const plansDir = path.join(projectPath, 'plans');
  const noCoverage: PlanCoverage = {
    test_plan_count: 0,
    test_suite_count: 0,
    test_instance_count: 0,
    covered_test_case_paths: [],
    uncovered_test_case_paths: [...allTestCasePaths].sort(),
    coverage_percent: 0,
  };

  if (!fs.existsSync(plansDir)) return noCoverage;

  // Build UUID fallback map: registryId/id/guid → project-relative path
  const testCaseIdMap = buildProjectTestCaseIdMap(projectPath);

  let testPlanCount = 0;
  let testSuiteCount = 0;
  let testInstanceCount = 0;
  const referencedPaths = new Set<string>();

  walkPlansDir(plansDir, (filePath, isDir, name) => {
    if (isDir) return true;

    const relToPlans = path.relative(plansDir, filePath).replace(/\\/g, '/');
    const depth = relToPlans.split('/').length;

    if (name === '.planitem') {
      if (depth === 2) testPlanCount++;
      else if (depth >= 3) testSuiteCount++;
      return true;
    }

    if (name.endsWith('.testinstance')) {
      testInstanceCount++;
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        // Primary: path-based match
        const pathMatch = content.match(/testCasePath=["']([^"']+)["']/);
        if (pathMatch?.[1]) referencedPaths.add(pathMatch[1].replace(/\\/g, '/'));
        // Fallback: UUID match via testCaseId → testcase registryId/id/guid
        const idMatch = content.match(/testCaseId=["']([^"']+)["']/);
        if (idMatch?.[1]) {
          const resolvedPath = testCaseIdMap.get(idMatch[1]);
          if (resolvedPath) referencedPaths.add(resolvedPath);
        }
      } catch { /* skip */ }
      return true;
    }

    return true;
  });

  const coveredPaths: string[] = [];
  const uncoveredPaths: string[] = [];
  for (const tc of [...allTestCasePaths].sort()) {
    (referencedPaths.has(tc) ? coveredPaths : uncoveredPaths).push(tc);
  }

  return {
    test_plan_count: testPlanCount,
    test_suite_count: testSuiteCount,
    test_instance_count: testInstanceCount,
    covered_test_case_paths: coveredPaths,
    uncovered_test_case_paths: uncoveredPaths,
    coverage_percent:
      allTestCasePaths.size > 0 ? Math.round((coveredPaths.length / allTestCasePaths.size) * 100) : 0,
  };
}

// ─── provar home detection ────────────────────────────────────────────────────

function detectProvarHome(
  projectPath: string,
  provardxFiles: string[],
  antFiles: string[]
): { provarHome: string | null; provarHomeSource: string | null } {
  // 1. Environment variable (set by CI or local Provar installer)
  const envHome = process.env['PROVAR_HOME'];
  if (envHome) return { provarHome: envHome, provarHomeSource: 'PROVAR_HOME environment variable' };

  // 2. provardx-properties.json — provarHome field
  for (const rel of provardxFiles) {
    try {
      const props = JSON.parse(fs.readFileSync(path.join(projectPath, rel), 'utf-8')) as Record<string, unknown>;
      if (typeof props['provarHome'] === 'string') {
        return { provarHome: props['provarHome'], provarHomeSource: `provardx-properties.json (${rel})` };
      }
    } catch { /* skip */ }
  }

  // 3. ANT build.xml — <property name="provarHome" value="..." />
  for (const rel of antFiles) {
    if (!rel.endsWith('.xml')) continue;
    try {
      const content = fs.readFileSync(path.join(projectPath, rel), 'utf-8');
      const match =
        content.match(/name=["']provarHome["'][^/]*value=["']([^"']+)["']/i) ??
        content.match(/value=["']([^"']+)["'][^/]*name=["']provarHome["']/i);
      if (match?.[1]) return { provarHome: match[1], provarHomeSource: `ANT build file (${rel})` };
    } catch { /* skip */ }
  }

  return { provarHome: null, provarHomeSource: null };
}

// ─── test suite folder structure ──────────────────────────────────────────────

function getTopLevelTestSuites(projectPath: string): string[] {
  const suites: string[] = [];
  for (const candidate of ['tests', 'Tests']) {
    const testsDir = path.join(projectPath, candidate);
    if (!fs.existsSync(testsDir)) continue;
    try {
      const entries = fs.readdirSync(testsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) suites.push(`${candidate}/${entry.name}`);
      }
    } catch { /* skip */ }
    break;
  }
  return suites;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function isSourceFile(name: string): boolean {
  return name.endsWith('.java') || name.endsWith('.groovy') || name.endsWith('.jar');
}

function isDataFile(name: string): boolean {
  return name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv') || name.endsWith('.json');
}

function countFilesRecursive(dir: string, filter: (name: string) => boolean): number {
  let count = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        count += countFilesRecursive(full, filter);
      } else if (filter(entry.name)) {
        count++;
      }
    }
  } catch { /* skip */ }
  return count;
}

/**
 * General project walker — skips dot-files and node_modules.
 * Return false from visitor to skip recursion into a directory.
 */
function walkDir(
  dir: string,
  visitor: (filePath: string, isDir: boolean, name: string) => boolean,
  depth = 0
): void {
  if (depth > 10) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    const recurse = visitor(fullPath, entry.isDirectory(), entry.name);
    if (entry.isDirectory() && recurse) walkDir(fullPath, visitor, depth + 1);
  }
}

/**
 * Plans-directory walker — does NOT skip dot-files (.planitem starts with '.').
 */
function walkPlansDir(
  dir: string,
  visitor: (filePath: string, isDir: boolean, name: string) => boolean,
  depth = 0
): void {
  if (depth > 8) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    const recurse = visitor(fullPath, entry.isDirectory(), entry.name);
    if (entry.isDirectory() && recurse) walkPlansDir(fullPath, visitor, depth + 1);
  }
}
