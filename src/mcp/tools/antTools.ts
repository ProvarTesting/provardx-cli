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
import { XMLParser } from 'fast-xml-parser';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from '../server.js';
import { assertPathAllowed, PathPolicyError } from '../security/pathPolicy.js';
import { makeError, makeRequestId, type ValidationIssue } from '../schemas/common.js';
import { log } from '../logging/logger.js';

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const FilesetSchema = z.object({
  dir: z.string().describe('Directory path (relative or absolute) for the fileset'),
  id: z
    .string()
    .optional()
    .describe(
      'Fileset id — use "testplan" for plan-based runs, "testcases" for test case runs, omit for default'
    ),
  includes: z
    .array(z.string())
    .optional()
    .describe(
      'Specific .testcase or .testplan file names to include (e.g. ["Login.testcase"]). Omit to run everything in dir.'
    ),
});

const PlanFeatureSchema = z.object({
  name: z
    .enum(['PDF', 'PIECHART', 'EMAIL', 'JUNIT'])
    .describe('Feature name (PDF, PIECHART, EMAIL, JUNIT)'),
  type: z.enum(['OUTPUT', 'NOTIFICATION']).describe('Feature type'),
  enabled: z.boolean().describe('Whether this feature is enabled'),
});

const EmailPropertiesSchema = z.object({
  send_email: z.boolean().default(false),
  primary_recipients: z.string().default(''),
  cc_recipients: z.string().optional().default(''),
  bcc_recipients: z.string().optional().default(''),
  email_subject: z.string().default('Provar test run report'),
  attach_execution_report: z.boolean().default(true),
  attach_zip: z.boolean().default(false),
});

const AttachmentPropertiesSchema = z.object({
  include_all_failures_in_summary: z.boolean().default(true),
  include_only_failures: z.boolean().default(false),
  include_bdd: z.boolean().default(false),
  include_skipped: z.boolean().default(false),
  include_test_case_description: z.boolean().default(false),
  include_screenshots: z.boolean().default(true),
  include_warning_messages: z.boolean().default(false),
  include_info_messages: z.boolean().default(false),
  include_debug_messages: z.boolean().default(false),
  include_test_step_time: z.boolean().default(true),
  include_test_step_path_hierarchy: z.boolean().default(true),
  include_full_screen_shot: z.boolean().default(false),
});

// ── Generate tool ─────────────────────────────────────────────────────────────

export function registerAntGenerate(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.ant.generate',
    [
      'Generate a Provar ANT build.xml file.',
      'Produces the standard <project> skeleton with Provar-Compile and Run-Test-Case tasks.',
      'Supports targeting tests by project folder, plan folder, or specific .testcase files via filesets.',
      'Returns XML content. Writes to disk only when dry_run=false.',
    ].join(' '),
    {
      // ── Core paths ──────────────────────────────────────────────────────────
      provar_home: z
        .string()
        .describe(
          'Absolute path to the Provar installation directory (e.g. "C:/Program Files/Provar/"). Used for provar.home property and ant taskdef classpaths.'
        ),
      project_path: z
        .string()
        .default('..')
        .describe(
          'Path to the Provar test project root. Defaults to ".." (parent of the ANT folder).'
        ),
      results_path: z
        .string()
        .default('../ANT/Results')
        .describe('Path where test results are written. Defaults to "../ANT/Results".'),
      project_cache_path: z
        .string()
        .optional()
        .describe(
          'Path to the .provarCaches directory. Defaults to "../../.provarCaches" relative to the ANT folder.'
        ),
      license_path: z
        .string()
        .optional()
        .describe('Path to the Provar .licenses directory (e.g. "${env.PROVAR_HOME}/.licenses").'),
      smtp_path: z
        .string()
        .optional()
        .describe('Path to the Provar .smtp directory (e.g. "${env.PROVAR_HOME}/.smtp").'),

      // ── Test selection ──────────────────────────────────────────────────────
      filesets: z
        .array(FilesetSchema)
        .min(1)
        .describe(
          'One or more filesets defining which tests to run. ' +
            'To run all tests under a folder: { dir: "../tests" }. ' +
            'To run a plan: { id: "testplan", dir: "../plans/MyPlan" }. ' +
            'To run specific test cases: { dir: "../tests/Suite", includes: ["MyTest.testcase"] }.'
        ),

      // ── Browser / environment ───────────────────────────────────────────────
      web_browser: z
        .enum(['Chrome', 'Chrome_Headless', 'Firefox', 'Edge', 'Edge_Legacy', 'Safari', 'IE'])
        .default('Chrome')
        .describe('Web browser to use for test execution.'),
      web_browser_configuration: z
        .string()
        .default('Full Screen')
        .describe('Browser window configuration (e.g. "Full Screen").'),
      web_browser_provider_name: z
        .string()
        .default('Desktop')
        .describe('Browser provider name (e.g. "Desktop").'),
      web_browser_device_name: z
        .string()
        .default('Full Screen')
        .describe('Browser device name (e.g. "Full Screen").'),
      test_environment: z
        .string()
        .default('')
        .describe('Named test environment to use (must match a connection in the project). Empty string uses default.'),

      // ── Cache / metadata ────────────────────────────────────────────────────
      salesforce_metadata_cache: z
        .enum(['Reuse', 'Refresh', 'Reload'])
        .default('Reuse')
        .describe(
          'Salesforce metadata cache strategy: Reuse (fastest, uses cached), Refresh (re-downloads), Reload (clears and re-downloads).'
        ),

      // ── Output / logging ────────────────────────────────────────────────────
      results_path_disposition: z
        .enum(['Increment', 'Replace', 'Reuse'])
        .default('Increment')
        .describe(
          'How to handle the results folder when it already exists: Increment (new subfolder), Replace (overwrite), Reuse (append).'
        ),
      test_output_level: z
        .enum(['BASIC', 'WARNING', 'DEBUG'])
        .default('BASIC')
        .describe('Verbosity level for test output logs.'),
      plugin_output_level: z
        .enum(['BASIC', 'WARNING', 'DEBUG'])
        .default('WARNING')
        .describe('Verbosity level for plugin output logs.'),

      // ── Execution behaviour ─────────────────────────────────────────────────
      stop_test_run_on_error: z
        .boolean()
        .default(false)
        .describe('Abort the entire test run when any test case fails.'),
      exclude_callable_test_cases: z
        .boolean()
        .default(true)
        .describe('Skip test cases marked as callable (library/helper) when true.'),
      dont_fail_build: z
        .boolean()
        .optional()
        .describe(
          'When true, the ANT build does not fail even if tests fail. Useful for CI pipelines that collect results separately.'
        ),
      invoke_test_run_monitor: z
        .boolean()
        .default(true)
        .describe('Enable the Provar test run monitor.'),

      // ── Secrets / security ──────────────────────────────────────────────────
      secrets_password: z
        .string()
        .default('${env.ProvarSecretsPassword}')
        .describe(
          'Encryption key used to decrypt the Provar .secrets file (the password string itself, not a file path). Defaults to reading from the ProvarSecretsPassword environment variable.'
        ),
      test_environment_secrets_password: z
        .string()
        .optional()
        .describe(
          'Per-environment secrets password. Defaults to reading from the ProvarSecretsPassword_EnvName environment variable.'
        ),

      // ── Test Cycle ──────────────────────────────────────────────────────────
      test_cycle_path: z
        .string()
        .optional()
        .describe('Path to a TestCycle folder (used with test cycle reporting).'),
      test_cycle_run_type: z
        .enum(['ALL', 'FAILED', 'NEW'])
        .optional()
        .describe('Which tests in the cycle to run (ALL, FAILED, NEW).'),

      // ── Plan features ───────────────────────────────────────────────────────
      plan_features: z
        .array(PlanFeatureSchema)
        .optional()
        .describe(
          'Output and notification features to enable/disable (e.g. PDF, PIECHART, EMAIL). ' +
            'Only meaningful when running by test plan.'
        ),

      // ── Email / attachment reporting ────────────────────────────────────────
      email_properties: EmailPropertiesSchema.optional().describe(
        'Email notification settings. Omit to exclude <emailProperties> from the XML.'
      ),
      attachment_properties: AttachmentPropertiesSchema.optional().describe(
        'Attachment/report content settings. Omit to exclude <attachmentProperties> from the XML.'
      ),

      // ── File output ─────────────────────────────────────────────────────────
      output_path: z
        .string()
        .optional()
        .describe('Where to write the build.xml file (returned in response). Required when dry_run=false.'),
      overwrite: z
        .boolean()
        .default(false)
        .describe('Overwrite output_path if the file already exists.'),
      dry_run: z
        .boolean()
        .default(true)
        .describe('true = return XML only (default); false = write to output_path.'),
    },
    (input) => {
      const requestId = makeRequestId();
      log('info', 'provar.ant.generate', {
        requestId,
        output_path: input.output_path,
        dry_run: input.dry_run,
      });

      try {
        // Validate all path inputs before writing anything — these get embedded in the
        // generated ANT build.xml and would be accessed by ANT at execution time.
        assertPathAllowed(input.provar_home, config.allowedPaths);
        assertPathAllowed(input.project_path, config.allowedPaths);
        assertPathAllowed(input.results_path, config.allowedPaths);
        if (input.license_path) assertPathAllowed(input.license_path, config.allowedPaths);
        if (input.smtp_path) assertPathAllowed(input.smtp_path, config.allowedPaths);
        if (input.project_cache_path) assertPathAllowed(input.project_cache_path, config.allowedPaths);

        const xmlContent = buildAntXml(input);
        const filePath = input.output_path ? path.resolve(input.output_path) : undefined;
        let written = false;

        if (filePath && !input.dry_run) {
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
          fs.writeFileSync(filePath, xmlContent, 'utf-8');
          written = true;
          log('info', 'provar.ant.generate: wrote file', { requestId, filePath });
        }

        const result = {
          requestId,
          xml_content: xmlContent,
          file_path: filePath,
          written,
          dry_run: input.dry_run,
        };
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
        log('error', 'provar.ant.generate failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}

// ── Validate tool ─────────────────────────────────────────────────────────────

export function registerAntValidate(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.ant.validate',
    [
      'Validate a Provar ANT build.xml for structural correctness.',
      'Checks XML well-formedness, required <taskdef> declarations, <Provar-Compile> step,',
      '<Run-Test-Case> with required attributes (provarHome, projectPath, resultsPath),',
      'and at least one <fileset> child. Returns is_valid, issues list, and a validity_score.',
    ].join(' '),
    {
      content: z
        .string()
        .optional()
        .describe('XML content to validate directly'),
      file_path: z
        .string()
        .optional()
        .describe('Path to the build.xml file to validate'),
    },
    ({ content, file_path }) => {
      const requestId = makeRequestId();
      log('info', 'provar.ant.validate', { requestId, has_content: !!content, file_path });

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

        const validation = validateAntXml(source);
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
        log('error', 'provar.ant.validate failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}

// ── XML builder ───────────────────────────────────────────────────────────────

type AntGenerateInput = {
  provar_home: string;
  project_path: string;
  results_path: string;
  project_cache_path?: string;
  license_path?: string;
  smtp_path?: string;
  filesets: Array<{ dir: string; id?: string; includes?: string[] }>;
  web_browser: string;
  web_browser_configuration: string;
  web_browser_provider_name: string;
  web_browser_device_name: string;
  test_environment: string;
  salesforce_metadata_cache: string;
  results_path_disposition: string;
  test_output_level: string;
  plugin_output_level: string;
  stop_test_run_on_error: boolean;
  exclude_callable_test_cases: boolean;
  dont_fail_build?: boolean;
  invoke_test_run_monitor: boolean;
  secrets_password: string;
  test_environment_secrets_password?: string;
  test_cycle_path?: string;
  test_cycle_run_type?: string;
  plan_features?: Array<{ name: string; type: string; enabled: boolean }>;
  email_properties?: {
    send_email: boolean;
    primary_recipients: string;
    cc_recipients?: string;
    bcc_recipients?: string;
    email_subject: string;
    attach_execution_report: boolean;
    attach_zip: boolean;
  };
  attachment_properties?: {
    include_all_failures_in_summary: boolean;
    include_only_failures: boolean;
    include_bdd: boolean;
    include_skipped: boolean;
    include_test_case_description: boolean;
    include_screenshots: boolean;
    include_warning_messages: boolean;
    include_info_messages: boolean;
    include_debug_messages: boolean;
    include_test_step_time: boolean;
    include_test_step_path_hierarchy: boolean;
    include_full_screen_shot: boolean;
  };
};

function buildRtcOptionalAttrs(input: AntGenerateInput, a: (s: string) => string): string[] {
  const attrs: string[] = [];
  if (input.dont_fail_build !== undefined) {
    attrs.push(`\t\t\t\tdontFailBuild="${input.dont_fail_build}"`);
  }
  if (input.invoke_test_run_monitor) {
    attrs.push('\t\t\t\tinvokeTestRunMonitor="true"');
  }
  if (input.license_path) {
    attrs.push(`\t\t\t\tlicensePath="${a(input.license_path)}"`);
  }
  if (input.smtp_path) {
    attrs.push(`\t\t\t\tsmtpPath="${a(input.smtp_path)}"`);
  }
  if (input.test_cycle_path) {
    attrs.push('\t\t\t\ttestCyclePath="${testcycle.path}"');
  }
  if (input.test_cycle_run_type) {
    attrs.push(`\t\t\t\ttestCycleRunType="${a(input.test_cycle_run_type)}"`);
  }
  return attrs;
}

function buildAntXml(input: AntGenerateInput): string {
  const a = escapeXmlAttr;
  const cachePath = input.project_cache_path ?? '../../.provarCaches';

  // ── Properties ──────────────────────────────────────────────────────────────
  const lines: string[] = [
    '<project default="runtests">',
    '\t<property environment="env"/>',
    `\t<property name="provar.home" value="${a(input.provar_home)}"/>`,
    `\t<property name="testproject.home" value="${a(input.project_path)}"/>`,
    `\t<property name="testproject.results" value="${a(input.results_path)}"/>`,
    `\t<property name="secrets.password" value="${a(input.secrets_password)}"/>`,
  ];

  if (input.test_environment_secrets_password) {
    lines.push(
      `\t<property name="testenvironment.secretspassword" value="${a(input.test_environment_secrets_password)}"/>`
    );
  } else {
    lines.push(
      '\t<property name="testenvironment.secretspassword" value="${env.ProvarSecretsPassword_EnvName}"/>'
    );
  }

  if (input.test_cycle_path) {
    lines.push(`\t<property name="testcycle.path" value="${a(input.test_cycle_path)}"/>`);
  }

  lines.push('');

  // ── Taskdefs ────────────────────────────────────────────────────────────────
  lines.push(
    '\t<taskdef name="Provar-Compile" classname="com.provar.testrunner.ant.CompileTask" classpath="${provar.home}/ant/ant-provar.jar"/>',
    '\t<taskdef name="Run-Test-Case" classname="com.provar.testrunner.ant.RunnerTask" classpath="${provar.home}/ant/ant-provar.jar;${provar.home}/ant/ant-provar-bundled.jar;${provar.home}/ant/ant-provar-sf.jar"/>',
    '\t<taskdef name="Test-Cycle-Report" classname="com.provar.testrunner.ant.TestCycleReportTask" classpath="${provar.home}/ant/ant-provar.jar;${provar.home}/ant/ant-provar-bundled.jar;${provar.home}/ant/ant-provar-sf.jar"/>',
    ''
  );

  // ── Target ──────────────────────────────────────────────────────────────────
  lines.push('\t<target name="runtests">', '');
  lines.push('\t\t<Provar-Compile provarHome="${provar.home}" projectPath="${testproject.home}"/>', '');

  // ── Run-Test-Case opening tag ────────────────────────────────────────────────
  const rtcAttrs: string[] = [
    '\t\t<Run-Test-Case provarHome="${provar.home}"',
    '\t\t\t\tprojectPath="${testproject.home}"',
    '\t\t\t\tresultsPath="${testproject.results}"',
    `\t\t\t\tresultsPathDisposition="${a(input.results_path_disposition)}"`,
    `\t\t\t\ttestEnvironment="${a(input.test_environment)}"`,
    `\t\t\t\twebBrowser="${a(input.web_browser)}"`,
    `\t\t\t\twebBrowserConfiguration="${a(input.web_browser_configuration)}"`,
    `\t\t\t\twebBrowserProviderName="${a(input.web_browser_provider_name)}"`,
    `\t\t\t\twebBrowserDeviceName="${a(input.web_browser_device_name)}"`,
    `\t\t\t\texcludeCallableTestCases="${input.exclude_callable_test_cases}"`,
    `\t\t\t\tsalesforceMetadataCache="${a(input.salesforce_metadata_cache)}"`,
    `\t\t\t\tprojectCachePath="${a(cachePath)}"`,
    `\t\t\t\ttestOutputlevel="${a(input.test_output_level)}"`,
    `\t\t\t\tpluginOutputlevel="${a(input.plugin_output_level)}"`,
    `\t\t\t\tstopTestRunOnError="${input.stop_test_run_on_error}"`,
    '\t\t\t\tsecretsPassword="${secrets.password}"',
    '\t\t\t\ttestEnvironmentSecretsPassword="${testenvironment.secretspassword}"',
  ];

  rtcAttrs.push(...buildRtcOptionalAttrs(input, a));

  // Join: all but last get no closing, last gets >
  lines.push(rtcAttrs.join('\n') + '\n\t\t\t\t>');
  lines.push('');

  // ── Filesets ─────────────────────────────────────────────────────────────────
  for (const fileset of input.filesets) {
    const idAttr = fileset.id ? ` id="${a(fileset.id)}"` : '';
    if (fileset.includes && fileset.includes.length > 0) {
      lines.push(`\t\t\t<fileset${idAttr} dir="${a(fileset.dir)}">`);
      for (const inc of fileset.includes) {
        lines.push(`\t\t\t\t<include name="${a(inc)}"/>`);
      }
      lines.push('\t\t\t</fileset>');
    } else {
      lines.push(`\t\t\t<fileset${idAttr} dir="${a(fileset.dir)}"></fileset>`);
    }
  }

  lines.push('');

  // ── Plan features ─────────────────────────────────────────────────────────────
  if (input.plan_features && input.plan_features.length > 0) {
    for (const pf of input.plan_features) {
      lines.push(
        `\t\t\t<planFeature name="${a(pf.name)}" type="${a(pf.type)}" enabled="${pf.enabled}"/>`
      );
    }
    lines.push('');
  }

  // ── Email properties ──────────────────────────────────────────────────────────
  if (input.email_properties) {
    const ep = input.email_properties;
    lines.push(
      `\t\t\t<emailProperties sendEmail="${ep.send_email}" primaryRecipients="${a(ep.primary_recipients)}" ccRecipients="${a(ep.cc_recipients ?? '')}" bccRecipients="${a(ep.bcc_recipients ?? '')}" emailSubject="${a(ep.email_subject)}" attachExecutionReport="${ep.attach_execution_report}" attachZip="${ep.attach_zip}"/>`
    );
  }

  // ── Attachment properties ─────────────────────────────────────────────────────
  if (input.attachment_properties) {
    const ap = input.attachment_properties;
    lines.push(
      `\t\t\t<attachmentProperties includeAllFailuresInSummary="${ap.include_all_failures_in_summary}" includeOnlyFailures="${ap.include_only_failures}" includeBdd="${ap.include_bdd}" includeSkipped="${ap.include_skipped}" includeTestCaseDescription="${ap.include_test_case_description}" includeScreenshots="${ap.include_screenshots}" includeWarningMessages="${ap.include_warning_messages}" includeInfoMessages="${ap.include_info_messages}" includeDebugMessages="${ap.include_debug_messages}" includeTestStepTime="${ap.include_test_step_time}" includeTestStepPathHierarchy="${ap.include_test_step_path_hierarchy}" includeFullScreenShot="${ap.include_full_screen_shot}"/>`
    );
  }

  lines.push('\t\t</Run-Test-Case>', '', '\t</target>', '</project>', '');

  return lines.join('\n');
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Validator ─────────────────────────────────────────────────────────────────

export interface AntValidationResult {
  is_valid: boolean;
  validity_score: number;
  provar_home: string | null;
  project_path: string | null;
  results_path: string | null;
  web_browser: string | null;
  test_environment: string | null;
  fileset_count: number;
  error_count: number;
  warning_count: number;
  issues: ValidationIssue[];
}

const REQUIRED_TASKDEF_CLASSNAMES = [
  'com.provar.testrunner.ant.CompileTask',
  'com.provar.testrunner.ant.RunnerTask',
];

const VALID_BROWSERS = ['Chrome', 'Chrome_Headless', 'Firefox', 'Edge', 'Edge_Legacy', 'Safari', 'IE'];
const VALID_CACHE = ['Reuse', 'Refresh', 'Reload'];
const VALID_OUTPUT_LEVELS = ['BASIC', 'WARNING', 'DEBUG'];
const VALID_DISPOSITIONS = ['Increment', 'Replace', 'Reuse'];

interface RtcValidationResult {
  provarHome: string | null;
  projectPath: string | null;
  resultsPath: string | null;
  webBrowser: string | null;
  testEnvironment: string | null;
  filesetCount: number;
}

function validateProjectStructure(
  project: Record<string, unknown>,
  defaultTarget: string | undefined,
  issues: ValidationIssue[]
): Record<string, unknown> | null {
  if (!defaultTarget) {
    issues.push({
      rule_id: 'ANT_004',
      severity: 'ERROR',
      message: '<project> missing required "default" attribute.',
      applies_to: 'project',
      suggestion: 'Add default="runtests" (or your target name) to <project>.',
    });
  }

  const taskdefs = (project['taskdef'] as Array<Record<string, unknown>> | undefined) ?? [];
  for (const requiredClass of REQUIRED_TASKDEF_CLASSNAMES) {
    const found = taskdefs.some((td) => (td['@_classname'] as string | undefined) === requiredClass);
    if (!found) {
      issues.push({
        rule_id: 'ANT_005',
        severity: 'ERROR',
        message: `Missing <taskdef> for classname "${requiredClass}".`,
        applies_to: 'taskdef',
        suggestion: `Add <taskdef classname="${requiredClass}" ...> to the project.`,
      });
    }
  }

  const targets = (project['target'] as Array<Record<string, unknown>> | undefined) ?? [];
  const defaultTargetEl = defaultTarget
    ? targets.find((t) => (t['@_name'] as string | undefined) === defaultTarget)
    : undefined;

  if (defaultTarget && !defaultTargetEl) {
    issues.push({
      rule_id: 'ANT_006',
      severity: 'ERROR',
      message: `Default target "${defaultTarget}" not found in <project>.`,
      applies_to: 'project',
      suggestion: `Add a <target name="${defaultTarget}"> element.`,
    });
    return null;
  }

  const target = defaultTargetEl ?? targets[0];
  if (!target) {
    issues.push({
      rule_id: 'ANT_007',
      severity: 'ERROR',
      message: 'No <target> elements found in <project>.',
      applies_to: 'project',
      suggestion: 'Add at least one <target> element.',
    });
    return null;
  }
  return target;
}

function validateRtcEnumAttrs(rtc: Record<string, unknown>, webBrowser: string | null, issues: ValidationIssue[]): void {
  if (webBrowser && !VALID_BROWSERS.includes(webBrowser)) {
    issues.push({ rule_id: 'ANT_030', severity: 'WARNING', message: `webBrowser "${webBrowser}" is not a recognised value. Expected one of: ${VALID_BROWSERS.join(', ')}.`, applies_to: 'Run-Test-Case', suggestion: `Use one of the supported browser values: ${VALID_BROWSERS.join(', ')}.` });
  }
  const metadataCache = rtc['@_salesforceMetadataCache'] as string | undefined;
  if (metadataCache && !VALID_CACHE.includes(metadataCache)) {
    issues.push({ rule_id: 'ANT_031', severity: 'WARNING', message: `salesforceMetadataCache "${metadataCache}" is not a recognised value. Expected one of: ${VALID_CACHE.join(', ')}.`, applies_to: 'Run-Test-Case', suggestion: `Use one of: ${VALID_CACHE.join(', ')}.` });
  }
  const testOutputLevel = rtc['@_testOutputlevel'] as string | undefined;
  if (testOutputLevel && !VALID_OUTPUT_LEVELS.includes(testOutputLevel)) {
    issues.push({ rule_id: 'ANT_032', severity: 'WARNING', message: `testOutputlevel "${testOutputLevel}" is not a recognised value. Expected one of: ${VALID_OUTPUT_LEVELS.join(', ')}.`, applies_to: 'Run-Test-Case', suggestion: `Use one of: ${VALID_OUTPUT_LEVELS.join(', ')}.` });
  }
  const disposition = rtc['@_resultsPathDisposition'] as string | undefined;
  if (disposition && !VALID_DISPOSITIONS.includes(disposition)) {
    issues.push({ rule_id: 'ANT_033', severity: 'WARNING', message: `resultsPathDisposition "${disposition}" is not a recognised value. Expected one of: ${VALID_DISPOSITIONS.join(', ')}.`, applies_to: 'Run-Test-Case', suggestion: `Use one of: ${VALID_DISPOSITIONS.join(', ')}.` });
  }
}

function validateRunTestCase(rtc: Record<string, unknown>, issues: ValidationIssue[]): RtcValidationResult {
  const provarHome = (rtc['@_provarHome'] as string | undefined) ?? null;
  const projectPath = (rtc['@_projectPath'] as string | undefined) ?? null;
  const resultsPath = (rtc['@_resultsPath'] as string | undefined) ?? null;
  const webBrowser = (rtc['@_webBrowser'] as string | undefined) ?? null;
  const testEnvironment = (rtc['@_testEnvironment'] as string | undefined) ?? null;

  if (!provarHome) {
    issues.push({ rule_id: 'ANT_021', severity: 'ERROR', message: '<Run-Test-Case> missing required "provarHome" attribute.', applies_to: 'Run-Test-Case', suggestion: 'Add provarHome="${provar.home}" to <Run-Test-Case>.' });
  }
  if (!projectPath) {
    issues.push({ rule_id: 'ANT_022', severity: 'ERROR', message: '<Run-Test-Case> missing required "projectPath" attribute.', applies_to: 'Run-Test-Case', suggestion: 'Add projectPath="${testproject.home}" to <Run-Test-Case>.' });
  }
  if (!resultsPath) {
    issues.push({ rule_id: 'ANT_023', severity: 'ERROR', message: '<Run-Test-Case> missing required "resultsPath" attribute.', applies_to: 'Run-Test-Case', suggestion: 'Add resultsPath="${testproject.results}" to <Run-Test-Case>.' });
  }
  validateRtcEnumAttrs(rtc, webBrowser, issues);
  const filesets = (rtc['fileset'] as Array<Record<string, unknown>> | undefined) ?? [];
  if (filesets.length === 0) {
    issues.push({ rule_id: 'ANT_040', severity: 'ERROR', message: '<Run-Test-Case> has no <fileset> children — no tests will be selected.', applies_to: 'Run-Test-Case', suggestion: 'Add at least one <fileset dir="..."/> pointing to your tests or plans folder.' });
  }
  for (const [i, fsEntry] of filesets.entries()) {
    if (!(fsEntry['@_dir'] as string | undefined)) {
      issues.push({ rule_id: 'ANT_041', severity: 'ERROR', message: `<fileset> at index ${i} is missing required "dir" attribute.`, applies_to: 'fileset', suggestion: 'Add dir="..." to each <fileset> element.' });
    }
  }
  return { provarHome, projectPath, resultsPath, webBrowser, testEnvironment, filesetCount: filesets.length };
}

/** Pure function — exported for unit testing */
export function validateAntXml(xmlContent: string): AntValidationResult {
  const issues: ValidationIssue[] = [];

  // ANT_001: XML declaration
  if (!xmlContent.trimStart().startsWith('<?xml')) {
    issues.push({
      rule_id: 'ANT_001',
      severity: 'WARNING',
      message: 'Missing XML declaration. Consider adding <?xml version="1.0" encoding="UTF-8"?> as the first line.',
      applies_to: 'document',
      suggestion: 'Add XML declaration as the first line.',
    });
  }

  // Parse
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    isArray: (tagName) =>
      ['taskdef', 'target', 'fileset', 'include', 'planFeature'].includes(tagName),
  });
  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xmlContent) as Record<string, unknown>;
  } catch (e: unknown) {
    const parseError = e as Error;
    issues.push({
      rule_id: 'ANT_002',
      severity: 'ERROR',
      message: `XML parse error: ${parseError.message}`,
      applies_to: 'document',
      suggestion: 'Fix XML syntax errors.',
    });
    return finalizeAnt(issues, null, null, null, null, null, 0);
  }

  // ANT_003: Root element must be <project>
  if (!('project' in parsed)) {
    issues.push({
      rule_id: 'ANT_003',
      severity: 'ERROR',
      message: 'Root element must be <project>.',
      applies_to: 'document',
      suggestion: 'Wrap content in a <project> element.',
    });
    return finalizeAnt(issues, null, null, null, null, null, 0);
  }

  const project = parsed['project'] as Record<string, unknown>;
  const defaultTarget = project['@_default'] as string | undefined;

  const target = validateProjectStructure(project, defaultTarget, issues);
  if (!target) {
    return finalizeAnt(issues, null, null, null, null, null, 0);
  }

  // ANT_010: Provar-Compile step
  const compileStep = target['Provar-Compile'] as Record<string, unknown> | undefined;
  if (!compileStep) {
    issues.push({
      rule_id: 'ANT_010',
      severity: 'WARNING',
      message: 'No <Provar-Compile> step found in the default target.',
      applies_to: 'target',
      suggestion: 'Add <Provar-Compile provarHome="..." projectPath="..."/> before Run-Test-Case.',
    });
  }

  // ANT_020: Run-Test-Case step
  const rtc = target['Run-Test-Case'] as Record<string, unknown> | undefined;
  if (!rtc) {
    issues.push({
      rule_id: 'ANT_020',
      severity: 'ERROR',
      message: 'No <Run-Test-Case> element found in the default target.',
      applies_to: 'target',
      suggestion: 'Add a <Run-Test-Case ...> element to run tests.',
    });
    return finalizeAnt(issues, null, null, null, null, null, 0);
  }

  const { provarHome, projectPath, resultsPath, webBrowser, testEnvironment, filesetCount } =
    validateRunTestCase(rtc, issues);

  return finalizeAnt(issues, provarHome, projectPath, resultsPath, webBrowser, testEnvironment, filesetCount);
}

function finalizeAnt(
  issues: ValidationIssue[],
  provarHome: string | null,
  projectPath: string | null,
  resultsPath: string | null,
  webBrowser: string | null,
  testEnvironment: string | null,
  filesetCount: number
): AntValidationResult {
  const errorCount = issues.filter((i) => i.severity === 'ERROR').length;
  const warningCount = issues.filter((i) => i.severity === 'WARNING').length;
  const validityScore = Math.max(0, 100 - errorCount * 20);

  return {
    is_valid: errorCount === 0,
    validity_score: validityScore,
    provar_home: provarHome,
    project_path: projectPath,
    results_path: resultsPath,
    web_browser: webBrowser,
    test_environment: testEnvironment,
    fileset_count: filesetCount,
    error_count: errorCount,
    warning_count: warningCount,
    issues,
  };
}

// ── Registration ──────────────────────────────────────────────────────────────

export function registerAllAntTools(server: McpServer, config: ServerConfig): void {
  registerAntGenerate(server, config);
  registerAntValidate(server, config);
}
