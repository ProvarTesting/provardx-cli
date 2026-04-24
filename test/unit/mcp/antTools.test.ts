/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { registerAntGenerate, validateAntXml, parseJUnitResults } from '../../../src/mcp/tools/antTools.js';
import type { ServerConfig } from '../../../src/mcp/server.js';

// ── Minimal McpServer mock ─────────────────────────────────────────────────────
// Note: bypasses Zod parsing — always pass explicit values for fields with defaults.

type ToolHandler = (args: Record<string, unknown>) => unknown;

class MockMcpServer {
  private handlers = new Map<string, ToolHandler>();

  public tool(name: string, _description: string, _schema: unknown, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  public call(name: string, args: Record<string, unknown>): ReturnType<ToolHandler> {
    const h = this.handlers.get(name);
    if (!h) throw new Error(`Tool not registered: ${name}`);
    return h(args);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseText(result: unknown): Record<string, unknown> {
  const r = result as { content: Array<{ type: string; text: string }> };
  return JSON.parse(r.content[0].text) as Record<string, unknown>;
}

function isError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true;
}

// Minimal valid inputs for the generate tool (all fields with defaults supplied explicitly,
// since we bypass Zod and defaults are not applied by the mock server).
// Path fields use tmpDir so they pass assertPathAllowed when called with a strict server.
function minimalInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    provar_home: tmpDir,
    project_path: tmpDir,
    results_path: path.join(tmpDir, 'Results'),
    filesets: [{ dir: '../tests' }], // filesets.dir is not path-checked at runtime
    web_browser: 'Chrome',
    web_browser_configuration: 'Full Screen',
    web_browser_provider_name: 'Desktop',
    web_browser_device_name: 'Full Screen',
    test_environment: '',
    salesforce_metadata_cache: 'Reuse',
    results_path_disposition: 'Increment',
    test_output_level: 'BASIC',
    plugin_output_level: 'WARNING',
    stop_test_run_on_error: false,
    exclude_callable_test_cases: true,
    invoke_test_run_monitor: true,
    secrets_password: '${env.ProvarSecretsPassword}',
    dry_run: true,
    overwrite: false,
    ...overrides,
  };
}

// Minimal valid ANT XML for the validate tool.
const VALID_ANT = `<?xml version="1.0" encoding="UTF-8"?>
<project default="runtests">
  <taskdef name="Provar-Compile" classname="com.provar.testrunner.ant.CompileTask" classpath="/provar/ant/ant-provar.jar"/>
  <taskdef name="Run-Test-Case" classname="com.provar.testrunner.ant.RunnerTask" classpath="/provar/ant/ant-provar.jar"/>
  <target name="runtests">
    <Provar-Compile provarHome="/provar" projectPath=".."/>
    <Run-Test-Case provarHome="/provar" projectPath=".." resultsPath="../ANT/Results" webBrowser="Chrome">
      <fileset dir="../tests"/>
    </Run-Test-Case>
  </target>
</project>`;

// ── Test setup ─────────────────────────────────────────────────────────────────

let tmpDir: string;
let server: MockMcpServer;
let config: ServerConfig;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anttools-test-'));
  server = new MockMcpServer();
  // Use unrestricted mode for XML-generation tests; dedicated path-policy tests below
  // use their own strictServer with { allowedPaths: [tmpDir] }.
  config = { allowedPaths: [] };
  registerAntGenerate(server as never, config);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── provar.ant.generate ────────────────────────────────────────────────────────

describe('provar.ant.generate', () => {
  describe('dry_run', () => {
    it('returns xml_content without writing to disk', () => {
      const result = server.call('provar.ant.generate', minimalInput());

      assert.equal(isError(result), false);
      const body = parseText(result);
      assert.ok(typeof body['xml_content'] === 'string' && body['xml_content'].length > 0);
      assert.equal(body['written'], false);
      assert.equal(body['dry_run'], true);
    });

    it('does NOT write a file even when output_path is provided', () => {
      const outPath = path.join(tmpDir, 'build.xml');
      server.call('provar.ant.generate', minimalInput({ output_path: outPath, dry_run: true }));

      assert.equal(fs.existsSync(outPath), false, 'file must not be written in dry_run mode');
    });
  });

  describe('generated XML structure', () => {
    function getXml(overrides: Record<string, unknown> = {}): string {
      const result = server.call('provar.ant.generate', minimalInput(overrides));
      return parseText(result)['xml_content'] as string;
    }

    it('produces a <project default="runtests"> root element', () => {
      const xml = getXml();
      assert.ok(xml.includes('<project default="runtests">'), 'Expected <project default="runtests">');
    });

    it('includes <taskdef> for CompileTask', () => {
      const xml = getXml();
      assert.ok(xml.includes('com.provar.testrunner.ant.CompileTask'), 'Expected CompileTask taskdef');
    });

    it('includes <taskdef> for RunnerTask', () => {
      const xml = getXml();
      assert.ok(xml.includes('com.provar.testrunner.ant.RunnerTask'), 'Expected RunnerTask taskdef');
    });

    it('includes <taskdef> for TestCycleReportTask', () => {
      const xml = getXml();
      assert.ok(xml.includes('com.provar.testrunner.ant.TestCycleReportTask'), 'Expected TestCycleReportTask taskdef');
    });

    it('includes <Provar-Compile> step', () => {
      const xml = getXml();
      assert.ok(xml.includes('<Provar-Compile'), 'Expected <Provar-Compile> step');
    });

    it('includes <Run-Test-Case> element', () => {
      const xml = getXml();
      assert.ok(xml.includes('<Run-Test-Case'), 'Expected <Run-Test-Case> element');
    });

    it('sets provarHome via the property reference', () => {
      const xml = getXml();
      assert.ok(xml.includes('provarHome="${provar.home}"'), 'Expected provarHome property ref');
    });

    it('sets projectPath via the property reference', () => {
      const xml = getXml();
      assert.ok(xml.includes('projectPath="${testproject.home}"'), 'Expected projectPath property ref');
    });

    it('sets the provar.home property to the provided provar_home value', () => {
      const customHome = path.join(tmpDir, 'custom-provar');
      const xml = getXml({ provar_home: customHome });
      assert.ok(xml.includes(`<property name="provar.home" value="${customHome}"/>`), 'Expected provar.home property');
    });

    it('renders webBrowser attribute', () => {
      const xml = getXml({ web_browser: 'Chrome_Headless' });
      assert.ok(xml.includes('webBrowser="Chrome_Headless"'), 'Expected webBrowser attribute');
    });

    it('renders salesforceMetadataCache attribute (correct spelling)', () => {
      const xml = getXml({ salesforce_metadata_cache: 'Refresh' });
      assert.ok(
        xml.includes('salesforceMetadataCache="Refresh"'),
        'Expected salesforceMetadataCache (not saleforce...)'
      );
    });

    it('renders excludeCallableTestCases attribute', () => {
      const xml = getXml({ exclude_callable_test_cases: true });
      assert.ok(xml.includes('excludeCallableTestCases="true"'));
    });

    it('renders stopTestRunOnError attribute', () => {
      const xml = getXml({ stop_test_run_on_error: true });
      assert.ok(xml.includes('stopTestRunOnError="true"'));
    });

    it('includes a simple <fileset> element with the correct dir', () => {
      const xml = getXml({ filesets: [{ dir: '../tests/Scenarios' }] });
      assert.ok(xml.includes('dir="../tests/Scenarios"'), 'Expected fileset dir');
    });

    it('adds <include> elements when includes are provided', () => {
      const xml = getXml({
        filesets: [{ dir: '../tests/Suite', includes: ['LoginTest.testcase', 'LogoutTest.testcase'] }],
      });
      assert.ok(xml.includes('<include name="LoginTest.testcase"/>'));
      assert.ok(xml.includes('<include name="LogoutTest.testcase"/>'));
    });

    it('sets fileset id="testplan" for plan-based runs', () => {
      const xml = getXml({
        filesets: [{ id: 'testplan', dir: '../plans/Smoke' }],
      });
      assert.ok(xml.includes('id="testplan"'), 'Expected fileset id attribute');
      assert.ok(xml.includes('dir="../plans/Smoke"'));
    });

    it('renders multiple filesets', () => {
      const xml = getXml({
        filesets: [
          { dir: '../tests/Suite1', includes: ['Test1.testcase'] },
          { dir: '../tests/Suite2', includes: ['Test2.testcase'] },
        ],
      });
      assert.ok(xml.includes('dir="../tests/Suite1"'));
      assert.ok(xml.includes('dir="../tests/Suite2"'));
    });

    it('renders <planFeature> elements when provided', () => {
      const xml = getXml({
        plan_features: [
          { name: 'PDF', type: 'OUTPUT', enabled: true },
          { name: 'PIECHART', type: 'OUTPUT', enabled: false },
        ],
      });
      assert.ok(xml.includes('<planFeature name="PDF" type="OUTPUT" enabled="true"/>'));
      assert.ok(xml.includes('<planFeature name="PIECHART" type="OUTPUT" enabled="false"/>'));
    });

    it('renders <emailProperties> when email_properties is provided', () => {
      const xml = getXml({
        email_properties: {
          send_email: true,
          primary_recipients: 'test@example.com',
          cc_recipients: '',
          bcc_recipients: '',
          email_subject: 'Test run report',
          attach_execution_report: true,
          attach_zip: false,
        },
      });
      assert.ok(xml.includes('<emailProperties'), 'Expected <emailProperties>');
      assert.ok(xml.includes('sendEmail="true"'));
      assert.ok(xml.includes('primaryRecipients="test@example.com"'));
    });

    it('renders <attachmentProperties> when attachment_properties is provided', () => {
      const xml = getXml({
        attachment_properties: {
          include_all_failures_in_summary: true,
          include_only_failures: false,
          include_bdd: false,
          include_skipped: false,
          include_test_case_description: false,
          include_screenshots: true,
          include_warning_messages: false,
          include_info_messages: false,
          include_debug_messages: false,
          include_test_step_time: true,
          include_test_step_path_hierarchy: true,
          include_full_screen_shot: false,
        },
      });
      assert.ok(xml.includes('<attachmentProperties'), 'Expected <attachmentProperties>');
      assert.ok(xml.includes('includeAllFailuresInSummary="true"'));
      assert.ok(xml.includes('includeScreenshots="true"'));
    });

    it('does not include <emailProperties> when email_properties is omitted', () => {
      const xml = getXml();
      assert.equal(xml.includes('<emailProperties'), false);
    });

    it('does not include <attachmentProperties> when attachment_properties is omitted', () => {
      const xml = getXml();
      assert.equal(xml.includes('<attachmentProperties'), false);
    });

    it('omits optional test_cycle_path attribute when not provided', () => {
      const xml = getXml();
      assert.equal(xml.includes('testCyclePath'), false);
    });

    it('renders testCyclePath and testCycleRunType when provided', () => {
      const xml = getXml({
        test_cycle_path: '../TestCycle',
        test_cycle_run_type: 'ALL',
      });
      assert.ok(xml.includes('testCyclePath="${testcycle.path}"'));
      assert.ok(xml.includes('testCycleRunType="ALL"'));
    });

    it('renders licensePath when provided', () => {
      const xml = getXml({ license_path: '${env.PROVAR_HOME}/.licenses' });
      assert.ok(xml.includes('licensePath='));
    });

    it('renders smtpPath when provided', () => {
      const xml = getXml({ smtp_path: '${env.PROVAR_HOME}/.smtp' });
      assert.ok(xml.includes('smtpPath='));
    });

    it('renders dontFailBuild when provided', () => {
      const xml = getXml({ dont_fail_build: true });
      assert.ok(xml.includes('dontFailBuild="true"'));
    });

    it('escapes XML special characters in provar_home', () => {
      const xml = getXml({ provar_home: 'C:/Provar & "Test"/' });
      assert.ok(xml.includes('&amp;'), 'Expected & escaped');
      assert.ok(xml.includes('&quot;'), 'Expected " escaped');
    });

    it('escapes XML special characters in fileset dir', () => {
      const xml = getXml({ filesets: [{ dir: '../tests/<Special>' }] });
      assert.ok(xml.includes('&lt;') && xml.includes('&gt;'), 'Expected < > escaped in fileset dir');
    });
  });

  describe('writing to disk', () => {
    it('writes file when dry_run=false and output_path provided', () => {
      const outPath = path.join(tmpDir, 'build.xml');
      const result = server.call('provar.ant.generate', minimalInput({ output_path: outPath, dry_run: false }));

      assert.equal(isError(result), false);
      assert.equal(fs.existsSync(outPath), true, 'file should be written');
      assert.equal(parseText(result)['written'], true);
    });

    it('written file contains valid XML with <project> root', () => {
      const outPath = path.join(tmpDir, 'build.xml');
      server.call('provar.ant.generate', minimalInput({ output_path: outPath, dry_run: false }));

      const content = fs.readFileSync(outPath, 'utf-8');
      assert.ok(content.includes('<project'), 'Written file must contain <project>');
    });

    it('does NOT write when dry_run=false but no output_path', () => {
      const result = server.call('provar.ant.generate', minimalInput({ dry_run: false, output_path: undefined }));

      assert.equal(isError(result), false);
      assert.equal(parseText(result)['written'], false);
    });

    it('returns FILE_EXISTS when file exists and overwrite=false', () => {
      const outPath = path.join(tmpDir, 'build.xml');
      fs.writeFileSync(outPath, '<old/>', 'utf-8');

      const result = server.call(
        'provar.ant.generate',
        minimalInput({ output_path: outPath, dry_run: false, overwrite: false })
      );

      assert.equal(isError(result), true);
      assert.equal(parseText(result)['error_code'], 'FILE_EXISTS');
    });

    it('overwrites when overwrite=true and file exists', () => {
      const outPath = path.join(tmpDir, 'build.xml');
      fs.writeFileSync(outPath, '<old/>', 'utf-8');

      const result = server.call(
        'provar.ant.generate',
        minimalInput({ output_path: outPath, dry_run: false, overwrite: true })
      );

      assert.equal(isError(result), false);
      const written = fs.readFileSync(outPath, 'utf-8');
      assert.ok(written.includes('<project'), 'old content should be replaced');
    });

    it('creates parent directories as needed', () => {
      const outPath = path.join(tmpDir, 'ANT', 'build.xml');
      server.call('provar.ant.generate', minimalInput({ output_path: outPath, dry_run: false }));

      assert.equal(fs.existsSync(outPath), true, 'nested directory should be created');
    });
  });

  describe('path policy', () => {
    // Helper that overrides the three required path inputs to be within tmpDir,
    // so tests can isolate a single invalid field at a time.
    function strictInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return minimalInput({
        provar_home: tmpDir,
        project_path: tmpDir,
        results_path: path.join(tmpDir, 'Results'),
        ...overrides,
      });
    }

    it('returns PATH_NOT_ALLOWED when output_path is outside allowedPaths', () => {
      const strictServer = new MockMcpServer();
      registerAntGenerate(strictServer as never, { allowedPaths: [tmpDir] });

      const result = strictServer.call(
        'provar.ant.generate',
        strictInput({
          output_path: path.join(os.tmpdir(), 'evil-build.xml'),
          dry_run: false,
          overwrite: false,
        })
      );

      assert.equal(isError(result), true);
      const code = parseText(result)['error_code'] as string;
      assert.ok(code === 'PATH_NOT_ALLOWED' || code === 'PATH_TRAVERSAL', `Unexpected error code: ${code}`);
    });

    it('output_path is not checked in dry_run=true mode', () => {
      const strictServer = new MockMcpServer();
      registerAntGenerate(strictServer as never, { allowedPaths: [tmpDir] });

      // Input paths are within tmpDir; only the output_path is outside — but dry_run
      // skips the write so the output_path should not be validated.
      const result = strictServer.call(
        'provar.ant.generate',
        strictInput({ output_path: '/etc/evil-build.xml', dry_run: true })
      );

      assert.equal(isError(result), false, 'output_path should not be checked in dry_run mode');
    });

    it('rejects provar_home outside allowedPaths', () => {
      const strictServer = new MockMcpServer();
      registerAntGenerate(strictServer as never, { allowedPaths: [tmpDir] });

      const result = strictServer.call(
        'provar.ant.generate',
        strictInput({ provar_home: path.join(os.tmpdir(), 'evil-provar'), dry_run: true })
      );

      assert.equal(isError(result), true);
      const code = parseText(result)['error_code'] as string;
      assert.ok(code === 'PATH_NOT_ALLOWED' || code === 'PATH_TRAVERSAL', `Unexpected error code: ${code}`);
    });

    it('rejects project_path containing ".." (PATH_TRAVERSAL)', () => {
      const strictServer = new MockMcpServer();
      registerAntGenerate(strictServer as never, { allowedPaths: [tmpDir] });

      const result = strictServer.call('provar.ant.generate', strictInput({ project_path: '../evil', dry_run: true }));

      assert.equal(isError(result), true);
      assert.equal(parseText(result)['error_code'], 'PATH_TRAVERSAL');
    });

    it('rejects results_path outside allowedPaths', () => {
      const strictServer = new MockMcpServer();
      registerAntGenerate(strictServer as never, { allowedPaths: [tmpDir] });

      const result = strictServer.call(
        'provar.ant.generate',
        strictInput({ results_path: path.join(os.tmpdir(), 'evil-results'), dry_run: true })
      );

      assert.equal(isError(result), true);
      const code = parseText(result)['error_code'] as string;
      assert.ok(code === 'PATH_NOT_ALLOWED' || code === 'PATH_TRAVERSAL', `Unexpected error code: ${code}`);
    });

    it('rejects optional license_path outside allowedPaths when provided', () => {
      const strictServer = new MockMcpServer();
      registerAntGenerate(strictServer as never, { allowedPaths: [tmpDir] });

      const result = strictServer.call(
        'provar.ant.generate',
        strictInput({ license_path: path.join(os.tmpdir(), 'evil-licenses'), dry_run: true })
      );

      assert.equal(isError(result), true);
      const code = parseText(result)['error_code'] as string;
      assert.ok(code === 'PATH_NOT_ALLOWED' || code === 'PATH_TRAVERSAL', `Unexpected error code: ${code}`);
    });
  });
});

// ── validateAntXml ─────────────────────────────────────────────────────────────

describe('validateAntXml', () => {
  describe('valid ANT XML', () => {
    it('returns is_valid=true with zero errors', () => {
      const r = validateAntXml(VALID_ANT);
      assert.equal(r.is_valid, true);
      assert.equal(r.error_count, 0);
      assert.equal(r.fileset_count, 1);
      assert.equal(r.provar_home, '/provar');
      assert.equal(r.project_path, '..');
      assert.equal(r.results_path, '../ANT/Results');
      assert.equal(r.web_browser, 'Chrome');
    });

    it('validity_score is 100 for a valid file', () => {
      const r = validateAntXml(VALID_ANT);
      assert.equal(r.validity_score, 100);
    });
  });

  describe('document-level rules', () => {
    it('ANT_001: warns about missing XML declaration', () => {
      // No <?xml …?> header — everything else is valid
      const noDecl = VALID_ANT.replace(/^<\?xml[^?]*\?>\n/, '');
      const r = validateAntXml(noDecl);
      assert.ok(
        r.issues.some((i) => i.rule_id === 'ANT_001'),
        'Expected ANT_001 warning'
      );
      // Still structurally valid — XML declaration is a warning only
      assert.equal(r.error_count, 0);
    });

    it('ANT_002: flags malformed XML', () => {
      const r = validateAntXml('<?xml version="1.0"?><project unclosed');
      assert.ok(
        r.issues.some((i) => i.rule_id === 'ANT_002'),
        'Expected ANT_002 error'
      );
      assert.equal(r.is_valid, false);
    });

    it('ANT_003: flags wrong root element', () => {
      const r = validateAntXml('<?xml version="1.0"?><notProject/>');
      assert.ok(
        r.issues.some((i) => i.rule_id === 'ANT_003'),
        'Expected ANT_003 error'
      );
      assert.equal(r.is_valid, false);
    });
  });

  describe('project-level rules', () => {
    it('ANT_004: flags missing default attribute on <project>', () => {
      const xml = VALID_ANT.replace('default="runtests"', '');
      const r = validateAntXml(xml);
      assert.ok(
        r.issues.some((i) => i.rule_id === 'ANT_004'),
        'Expected ANT_004 error'
      );
    });

    it('ANT_005: flags missing CompileTask taskdef', () => {
      // Build XML with only RunnerTask taskdef (no CompileTask)
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<project default="runtests">
  <taskdef name="Run-Test-Case" classname="com.provar.testrunner.ant.RunnerTask" classpath="/provar/ant/ant-provar.jar"/>
  <target name="runtests">
    <Run-Test-Case provarHome="/provar" projectPath=".." resultsPath="../ANT/Results">
      <fileset dir="../tests"/>
    </Run-Test-Case>
  </target>
</project>`;
      const r = validateAntXml(xml);
      assert.ok(
        r.issues.some((i) => i.rule_id === 'ANT_005' && i.message.includes('CompileTask')),
        'Expected ANT_005 for CompileTask'
      );
    });

    it('ANT_005: flags missing RunnerTask taskdef', () => {
      // Build XML with only CompileTask taskdef (no RunnerTask)
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<project default="runtests">
  <taskdef name="Provar-Compile" classname="com.provar.testrunner.ant.CompileTask" classpath="/provar/ant/ant-provar.jar"/>
  <target name="runtests">
    <Run-Test-Case provarHome="/provar" projectPath=".." resultsPath="../ANT/Results">
      <fileset dir="../tests"/>
    </Run-Test-Case>
  </target>
</project>`;
      const r = validateAntXml(xml);
      assert.ok(
        r.issues.some((i) => i.rule_id === 'ANT_005' && i.message.includes('RunnerTask')),
        'Expected ANT_005 for RunnerTask'
      );
    });

    it('ANT_006: flags default target not found', () => {
      const xml = VALID_ANT.replace('name="runtests"', 'name="something-else"');
      const r = validateAntXml(xml);
      assert.ok(
        r.issues.some((i) => i.rule_id === 'ANT_006'),
        'Expected ANT_006 error'
      );
    });
  });

  describe('target-level rules', () => {
    it('ANT_010: warns when <Provar-Compile> is absent', () => {
      // Build XML without <Provar-Compile>
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<project default="runtests">
  <taskdef name="Provar-Compile" classname="com.provar.testrunner.ant.CompileTask" classpath="/provar/ant/ant-provar.jar"/>
  <taskdef name="Run-Test-Case" classname="com.provar.testrunner.ant.RunnerTask" classpath="/provar/ant/ant-provar.jar"/>
  <target name="runtests">
    <Run-Test-Case provarHome="/provar" projectPath=".." resultsPath="../ANT/Results" webBrowser="Chrome">
      <fileset dir="../tests"/>
    </Run-Test-Case>
  </target>
</project>`;
      const r = validateAntXml(xml);
      assert.ok(
        r.issues.some((i) => i.rule_id === 'ANT_010'),
        'Expected ANT_010 warning'
      );
    });

    it('ANT_020: flags missing <Run-Test-Case>', () => {
      // Replace the Run-Test-Case block with a noop comment
      const xml = VALID_ANT.replace(/<Run-Test-Case[\s\S]*?<\/Run-Test-Case>/, '<!-- removed -->');
      const r = validateAntXml(xml);
      assert.ok(
        r.issues.some((i) => i.rule_id === 'ANT_020'),
        'Expected ANT_020 error'
      );
    });
  });

  describe('Run-Test-Case required attribute rules', () => {
    it('ANT_021: flags missing provarHome', () => {
      // Build XML without provarHome on Run-Test-Case specifically
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<project default="runtests">
  <taskdef name="Provar-Compile" classname="com.provar.testrunner.ant.CompileTask" classpath="/provar/ant/ant-provar.jar"/>
  <taskdef name="Run-Test-Case" classname="com.provar.testrunner.ant.RunnerTask" classpath="/provar/ant/ant-provar.jar"/>
  <target name="runtests">
    <Provar-Compile provarHome="/provar" projectPath=".."/>
    <Run-Test-Case projectPath=".." resultsPath="../ANT/Results" webBrowser="Chrome">
      <fileset dir="../tests"/>
    </Run-Test-Case>
  </target>
</project>`;
      const r = validateAntXml(xml);
      assert.ok(
        r.issues.some((i) => i.rule_id === 'ANT_021'),
        'Expected ANT_021 error'
      );
    });

    it('ANT_022: flags missing projectPath', () => {
      // Build XML without projectPath on Run-Test-Case specifically
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<project default="runtests">
  <taskdef name="Provar-Compile" classname="com.provar.testrunner.ant.CompileTask" classpath="/provar/ant/ant-provar.jar"/>
  <taskdef name="Run-Test-Case" classname="com.provar.testrunner.ant.RunnerTask" classpath="/provar/ant/ant-provar.jar"/>
  <target name="runtests">
    <Provar-Compile provarHome="/provar" projectPath=".."/>
    <Run-Test-Case provarHome="/provar" resultsPath="../ANT/Results" webBrowser="Chrome">
      <fileset dir="../tests"/>
    </Run-Test-Case>
  </target>
</project>`;
      const r = validateAntXml(xml);
      assert.ok(
        r.issues.some((i) => i.rule_id === 'ANT_022'),
        'Expected ANT_022 error'
      );
    });

    it('ANT_023: flags missing resultsPath', () => {
      const xml = VALID_ANT.replace(' resultsPath="../ANT/Results"', '');
      const r = validateAntXml(xml);
      assert.ok(
        r.issues.some((i) => i.rule_id === 'ANT_023'),
        'Expected ANT_023 error'
      );
    });
  });

  describe('Run-Test-Case enum value rules', () => {
    it('ANT_030: warns about unrecognised webBrowser value', () => {
      const xml = VALID_ANT.replace('webBrowser="Chrome"', 'webBrowser="InternetExplorer6"');
      const r = validateAntXml(xml);
      assert.ok(
        r.issues.some((i) => i.rule_id === 'ANT_030'),
        'Expected ANT_030 warning'
      );
    });

    it('ANT_031: warns about unrecognised salesforceMetadataCache value', () => {
      const xml = VALID_ANT.replace('<Run-Test-Case', '<Run-Test-Case salesforceMetadataCache="BadValue"');
      const r = validateAntXml(xml);
      assert.ok(
        r.issues.some((i) => i.rule_id === 'ANT_031'),
        'Expected ANT_031 warning'
      );
    });

    it('ANT_032: warns about unrecognised testOutputlevel value', () => {
      const xml = VALID_ANT.replace('<Run-Test-Case', '<Run-Test-Case testOutputlevel="VERBOSE"');
      const r = validateAntXml(xml);
      assert.ok(
        r.issues.some((i) => i.rule_id === 'ANT_032'),
        'Expected ANT_032 warning'
      );
    });

    it('ANT_033: warns about unrecognised resultsPathDisposition value', () => {
      const xml = VALID_ANT.replace('<Run-Test-Case', '<Run-Test-Case resultsPathDisposition="Overwrite"');
      const r = validateAntXml(xml);
      assert.ok(
        r.issues.some((i) => i.rule_id === 'ANT_033'),
        'Expected ANT_033 warning'
      );
    });
  });

  describe('fileset rules', () => {
    it('ANT_040: flags Run-Test-Case with no <fileset> children', () => {
      const xml = VALID_ANT.replace('<fileset dir="../tests"/>', '');
      const r = validateAntXml(xml);
      assert.ok(
        r.issues.some((i) => i.rule_id === 'ANT_040'),
        'Expected ANT_040 error'
      );
    });

    it('ANT_041: flags a fileset missing dir attribute', () => {
      const xml = VALID_ANT.replace('<fileset dir="../tests"/>', '<fileset/>');
      const r = validateAntXml(xml);
      assert.ok(
        r.issues.some((i) => i.rule_id === 'ANT_041'),
        'Expected ANT_041 error'
      );
    });

    it('reports fileset_count correctly', () => {
      const r = validateAntXml(VALID_ANT);
      assert.equal(r.fileset_count, 1);
    });
  });

  describe('score boundaries', () => {
    it('validity_score is never negative', () => {
      // Many errors at once
      const r = validateAntXml('<?xml version="1.0"?><wrong/>');
      assert.ok(r.validity_score >= 0, `Score should be >= 0, got: ${r.validity_score}`);
    });

    it('validity_score decreases by 20 per error', () => {
      // One error: ANT_003 wrong root
      const r = validateAntXml('<?xml version="1.0"?><wrong/>');
      assert.equal(r.error_count, 1);
      assert.equal(r.validity_score, 80);
    });

    it('is_valid is false when there are errors', () => {
      const r = validateAntXml('<?xml version="1.0"?><wrong/>');
      assert.equal(r.is_valid, false);
    });
  });

  describe('round-trip: generate then validate', () => {
    it('XML produced by the generator passes validation', () => {
      // Use the mock server to generate, then validate the output
      const result = server.call('provar.ant.generate', minimalInput());
      const xml = parseText(result)['xml_content'] as string;
      const validation = validateAntXml(xml);

      assert.equal(validation.is_valid, true, `Expected valid XML, got issues: ${JSON.stringify(validation.issues)}`);
      assert.equal(validation.error_count, 0);
    });
  });
});

// ── parseJUnitResults ─────────────────────────────────────────────────────────

describe('parseJUnitResults', () => {
  let junitTmpDir: string;

  beforeEach(() => {
    junitTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'junit-test-'));
  });

  afterEach(() => {
    fs.rmSync(junitTmpDir, { recursive: true, force: true });
  });

  it('returns warning when results directory does not exist', () => {
    const result = parseJUnitResults(path.join(junitTmpDir, 'nonexistent'));
    assert.deepEqual(result.steps, []);
    assert.ok(result.warning?.includes('not found'));
  });

  it('returns warning when directory contains no XML files', () => {
    const result = parseJUnitResults(junitTmpDir);
    assert.deepEqual(result.steps, []);
    assert.ok(result.warning?.includes('No JUnit XML'));
  });

  it('extracts steps from a bare <testsuite> JUnit file', () => {
    const xml =
      '<?xml version="1.0"?><testsuite name="suite"><testcase name="LoginTest"/><testcase name="LogoutTest"><failure message="Element not found"/></testcase></testsuite>';
    fs.writeFileSync(path.join(junitTmpDir, 'JUnit.xml'), xml);
    const result = parseJUnitResults(junitTmpDir);
    assert.equal(result.steps.length, 2);
    assert.equal(result.steps[0].status, 'pass');
    assert.equal(result.steps[1].status, 'fail');
    assert.ok(result.steps[1].errorMessage?.includes('Element not found'));
    assert.equal(result.warning, undefined);
  });

  it('extracts steps from a <testsuites> wrapper JUnit file', () => {
    const xml =
      '<?xml version="1.0"?><testsuites><testsuite name="s1"><testcase name="TC1"><skipped/></testcase></testsuite></testsuites>';
    fs.writeFileSync(path.join(junitTmpDir, 'JUnit.xml'), xml);
    const result = parseJUnitResults(junitTmpDir);
    assert.equal(result.steps.length, 1);
    assert.equal(result.steps[0].status, 'skip');
    assert.equal(result.steps[0].title, 'TC1');
  });

  it('returns warning when XML parses but contains no testcase elements', () => {
    const xml = '<?xml version="1.0"?><testsuite name="empty"/>';
    fs.writeFileSync(path.join(junitTmpDir, 'JUnit.xml'), xml);
    const result = parseJUnitResults(junitTmpDir);
    assert.deepEqual(result.steps, []);
    assert.ok((result.warning?.length ?? 0) > 0);
  });

  it('combines message attribute and CDATA body in failure text', () => {
    const xml =
      '<?xml version="1.0"?><testsuite><testcase name="T1"><failure message="Execution failed"><![CDATA[stack trace here]]></failure></testcase></testsuite>';
    fs.writeFileSync(path.join(junitTmpDir, 'JUnit.xml'), xml);
    const result = parseJUnitResults(junitTmpDir);
    assert.equal(result.steps.length, 1);
    assert.ok(result.steps[0].errorMessage?.includes('Execution failed'));
    assert.ok(result.steps[0].errorMessage?.includes('stack trace here'));
  });
});
