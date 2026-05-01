/* eslint-disable camelcase */
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  validateTestCase,
  registerTestCaseValidate,
  validateTestCaseXml,
} from '../../../src/mcp/tools/testCaseValidate.js';
import type { ServerConfig } from '../../../src/mcp/server.js';
import {
  qualityHubClient,
  QualityHubAuthError,
  QualityHubRateLimitError,
} from '../../../src/services/qualityHub/client.js';

// Valid UUID v4 values (format: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx)
const GUID_TC = '550e8400-e29b-41d4-a716-446655440000';
const GUID_S1 = '6ba7b810-9dad-4000-8000-00c04fd430c8';
const GUID_S2 = '6ba7b811-9dad-4001-9001-00c04fd430c8';

const VALID_TC = `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="test-001" guid="${GUID_TC}" registryId="abc123" name="My Test">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="UiConnect" name="Connect to browser" testItemId="1"/>
    <apiCall guid="${GUID_S2}" apiId="UiNavigate" name="Navigate to login" testItemId="2"/>
  </steps>
</testCase>`;

describe('validateTestCase', () => {
  describe('valid test case', () => {
    it('returns is_valid=true with zero errors', () => {
      const r = validateTestCase(VALID_TC);
      assert.equal(r.is_valid, true);
      assert.equal(r.error_count, 0);
      assert.equal(r.step_count, 2);
      assert.equal(r.test_case_id, 'test-001');
      assert.equal(r.test_case_name, 'My Test');
    });
  });

  describe('document-level rules', () => {
    it('TC_001: flags missing XML declaration', () => {
      const r = validateTestCase(`<testCase id="x" guid="${GUID_TC}" registryId="r"><steps/></testCase>`);
      assert.ok(
        r.issues.some((i) => i.rule_id === 'TC_001'),
        'Expected TC_001'
      );
      assert.equal(r.is_valid, false);
    });

    it('TC_002: flags malformed XML', () => {
      const r = validateTestCase('<?xml version="1.0"?><testCase id="x" unclosed');
      assert.ok(
        r.issues.some((i) => i.rule_id === 'TC_002'),
        'Expected TC_002'
      );
    });

    it('TC_003: flags wrong root element', () => {
      const r = validateTestCase('<?xml version="1.0"?><notTestCase/>');
      assert.ok(
        r.issues.some((i) => i.rule_id === 'TC_003'),
        'Expected TC_003'
      );
    });
  });

  describe('testCase attribute rules', () => {
    it('TC_010: flags missing id', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?><testCase guid="${GUID_TC}" registryId="r"><steps/></testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'TC_010'),
        'Expected TC_010'
      );
    });

    it('TC_011: flags missing guid', () => {
      const r = validateTestCase(
        '<?xml version="1.0" encoding="UTF-8"?><testCase id="x" registryId="r"><steps/></testCase>'
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'TC_011'),
        'Expected TC_011'
      );
    });

    it('TC_012: flags non-UUID-v4 guid', () => {
      const r = validateTestCase(
        '<?xml version="1.0" encoding="UTF-8"?><testCase id="x" guid="not-a-uuid" registryId="r"><steps/></testCase>'
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'TC_012'),
        'Expected TC_012'
      );
    });
  });

  describe('apiCall rules', () => {
    it('TC_031: flags invalid apiCall guid', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r">
  <steps>
    <apiCall guid="bad-guid" apiId="UiConnect" name="N" testItemId="1"/>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'TC_031'),
        'Expected TC_031'
      );
    });

    it('TC_034 + TC_035: flags non-integer testItemId', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="UiConnect" name="N" testItemId="abc"/>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'TC_035'),
        'Expected TC_035'
      );
    });
  });

  describe('score boundaries', () => {
    it('validity_score is never negative', () => {
      const r = validateTestCase('<?xml version="1.0"?><wrong/>');
      assert.ok(r.validity_score >= 0);
    });
  });

  describe('validation_source field', () => {
    it('returns validation_source: "local" from the pure function', () => {
      const r = validateTestCase(VALID_TC);
      assert.equal(r.validation_source, 'local');
    });
  });

  describe('self-closing element handling', () => {
    // fast-xml-parser yields '' for a self-closing element with no attributes.
    // These must not throw "Cannot use 'in' operator to search for '...' in ''"

    it('does not throw on bare <testCase/> — reports schema errors gracefully', () => {
      assert.doesNotThrow(() => validateTestCase('<testCase/>'));
      const r = validateTestCase('<testCase/>');
      assert.ok(r.error_count > 0, 'Expected schema errors for bare <testCase/>');
      assert.ok(r.validity_score >= 0);
    });

    it('does not throw on a <testCase> with self-closing <steps/>', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="t1" guid="${GUID_TC}" name="SelfClosingSteps">
  <steps/>
</testCase>`;
      assert.doesNotThrow(() => validateTestCase(xml));
      const r = validateTestCase(xml);
      assert.equal(r.step_count, 0);
    });
  });

  describe('TC_012 / TC_031 suggestion text', () => {
    it('TC_012 suggestion names crypto.randomUUID() and variant byte rule', () => {
      const r = validateTestCase(
        '<?xml version="1.0" encoding="UTF-8"?><testCase id="x" guid="not-a-uuid" registryId="r"><steps/></testCase>'
      );
      const issue = r.issues.find((i) => i.rule_id === 'TC_012');
      assert.ok(issue, 'Expected TC_012 issue');
      assert.ok(
        issue.suggestion?.includes('crypto.randomUUID()'),
        `Suggestion should mention crypto.randomUUID(): ${issue.suggestion}`
      );
      assert.ok(
        issue.suggestion?.includes('8, 9, a, or b'),
        `Suggestion should mention variant byte: ${issue.suggestion}`
      );
    });

    it('TC_031 suggestion names crypto.randomUUID() and variant byte rule', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r">
  <steps>
    <apiCall guid="bad-guid" apiId="UiConnect" name="N" testItemId="1"/>
  </steps>
</testCase>`
      );
      const issue = r.issues.find((i) => i.rule_id === 'TC_031');
      assert.ok(issue, 'Expected TC_031 issue');
      assert.ok(
        issue.suggestion?.includes('crypto.randomUUID()'),
        `Suggestion should mention crypto.randomUUID(): ${issue.suggestion}`
      );
      assert.ok(
        issue.suggestion?.includes('8, 9, a, or b'),
        `Suggestion should mention variant byte: ${issue.suggestion}`
      );
    });
  });

  describe('DATA-001', () => {
    it('warns when testCase has a <dataTable> child element', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <dataTable>mydata.csv</dataTable>
  <steps>
    <apiCall guid="${GUID_S1}" apiId="SetValues" name="Set" testItemId="1"/>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'DATA-001'),
        'Expected DATA-001'
      );
      const issue = r.issues.find((i) => i.rule_id === 'DATA-001')!;
      assert.equal(issue.severity, 'WARNING');
    });

    it('does not fire when no <dataTable> present', () => {
      const r = validateTestCase(VALID_TC);
      assert.ok(!r.issues.some((i) => i.rule_id === 'DATA-001'), 'DATA-001 should not fire for valid test case');
    });
  });

  describe('ASSERT-001', () => {
    it('warns when AssertValues uses argument id="values"', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="AssertValues" name="Check values" testItemId="1">
      <arguments>
        <argument id="values"/>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'ASSERT-001'),
        'Expected ASSERT-001'
      );
      const issue = r.issues.find((i) => i.rule_id === 'ASSERT-001')!;
      assert.equal(issue.severity, 'WARNING');
      assert.ok(issue.message.includes('Check values'), `Message should include step name: ${issue.message}`);
    });

    it('does not fire for AssertValues with expectedValue/actualValue arguments', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="AssertValues" name="Compare" testItemId="1">
      <arguments>
        <argument id="expectedValue">expected</argument>
        <argument id="actualValue">actual</argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        !r.issues.some((i) => i.rule_id === 'ASSERT-001'),
        'ASSERT-001 should not fire for non-values arguments'
      );
    });

    it('does not fire for non-AssertValues apiCall with argument id="values"', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="SetValues" name="Set" testItemId="1">
      <arguments>
        <argument id="values"/>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(!r.issues.some((i) => i.rule_id === 'ASSERT-001'), 'ASSERT-001 should not fire for SetValues');
    });
  });

  describe('UI-TARGET-001', () => {
    it('errors when UiWithScreen target argument uses class="value" (plain string)', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiWithScreen" name="Open screen" testItemId="1">
      <arguments>
        <argument id="target">
          <value class="value" valueClass="string">sf:ui:target?object=Account</value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'UI-TARGET-001'),
        'Expected UI-TARGET-001'
      );
      const issue = r.issues.find((i) => i.rule_id === 'UI-TARGET-001')!;
      assert.equal(issue.severity, 'ERROR');
      assert.ok(issue.message.includes('uiTarget'), `Message should mention uiTarget: ${issue.message}`);
    });

    it('does not fire when UiWithScreen target uses class="uiTarget"', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiWithScreen" name="Open screen" testItemId="1">
      <arguments>
        <argument id="target">
          <value class="uiTarget" uri="sf:ui:target?object=Account"/>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        !r.issues.some((i) => i.rule_id === 'UI-TARGET-001'),
        'UI-TARGET-001 should not fire for correct uiTarget class'
      );
    });

    it('does not fire when UiWithScreen has no target argument', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiWithScreen" name="Open screen" testItemId="1">
      <arguments>
        <argument id="windowSize"><value class="value" valueClass="string">1280</value></argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        !r.issues.some((i) => i.rule_id === 'UI-TARGET-001'),
        'UI-TARGET-001 should not fire when no target argument present'
      );
    });

    it('also fires for UiWithRow steps with wrong target class', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiWithRow" name="Row step" testItemId="1">
      <arguments>
        <argument id="target">
          <value class="value" valueClass="string">sf:ui:target?object=Account</value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'UI-TARGET-001'),
        'Expected UI-TARGET-001 for UiWithRow'
      );
    });
  });

  describe('UI-LOCATOR-001', () => {
    it('errors when UiDoAction locator argument uses class="value" (plain string)', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction" name="Click btn" testItemId="1">
      <arguments>
        <argument id="locator">
          <value class="value" valueClass="string">sf:ui:locator:label?label=Save</value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'UI-LOCATOR-001'),
        'Expected UI-LOCATOR-001'
      );
      const issue = r.issues.find((i) => i.rule_id === 'UI-LOCATOR-001')!;
      assert.equal(issue.severity, 'ERROR');
      assert.ok(issue.message.includes('uiLocator'), `Message should mention uiLocator: ${issue.message}`);
    });

    it('does not fire when UiDoAction locator uses class="uiLocator"', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction" name="Click btn" testItemId="1">
      <arguments>
        <argument id="locator">
          <value class="uiLocator" uri="sf:ui:locator:label?label=Save"/>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        !r.issues.some((i) => i.rule_id === 'UI-LOCATOR-001'),
        'UI-LOCATOR-001 should not fire for correct uiLocator class'
      );
    });

    it('also fires for UiAssert steps with wrong locator class', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiAssert" name="Assert field" testItemId="1">
      <arguments>
        <argument id="locator">
          <value class="value" valueClass="string">sf:ui:locator:label?label=Name</value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'UI-LOCATOR-001'),
        'Expected UI-LOCATOR-001 for UiAssert'
      );
    });
  });

  describe('SETVALUES-STRUCTURE-001', () => {
    it('errors when SetValues values argument uses class="value" (plain string)', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.core.data.SetValues" name="Set vars" testItemId="1">
      <arguments>
        <argument id="values">
          <value class="value" valueClass="string">myVar=hello</value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'SETVALUES-STRUCTURE-001'),
        'Expected SETVALUES-STRUCTURE-001'
      );
      const issue = r.issues.find((i) => i.rule_id === 'SETVALUES-STRUCTURE-001')!;
      assert.equal(issue.severity, 'ERROR');
      assert.ok(issue.message.includes('valueList'), `Message should mention valueList: ${issue.message}`);
    });

    it('does not fire when SetValues values argument uses class="valueList"', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.core.data.SetValues" name="Set vars" testItemId="1">
      <arguments>
        <argument id="values">
          <value class="valueList" mutable="Mutable">
            <namedValues>
              <namedValue name="myVar">
                <value class="value" valueClass="string">hello</value>
              </namedValue>
            </namedValues>
          </value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        !r.issues.some((i) => i.rule_id === 'SETVALUES-STRUCTURE-001'),
        'SETVALUES-STRUCTURE-001 should not fire for correct valueList structure'
      );
    });

    it('does not fire when SetValues has no values argument (self-closing)', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.core.data.SetValues" name="Set vars" testItemId="1">
      <arguments/>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        !r.issues.some((i) => i.rule_id === 'SETVALUES-STRUCTURE-001'),
        'SETVALUES-STRUCTURE-001 should not fire when no values argument present'
      );
    });

    it('does not fire for AssertValues (only targets SetValues)', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.core.data.AssertValues" name="Assert" testItemId="1">
      <arguments>
        <argument id="values">
          <value class="value" valueClass="string">myVar=hello</value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        !r.issues.some((i) => i.rule_id === 'SETVALUES-STRUCTURE-001'),
        'SETVALUES-STRUCTURE-001 should not fire for AssertValues'
      );
    });
  });

  describe('VAR-REF-001', () => {
    it('warns when a plain string value contains a {VarName} pattern', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="SomeApi" name="Use var" testItemId="1">
      <arguments>
        <argument id="accountId">
          <value class="value" valueClass="string">{AccountId}</value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'VAR-REF-001'),
        'Expected VAR-REF-001'
      );
      const issue = r.issues.find((i) => i.rule_id === 'VAR-REF-001')!;
      assert.equal(issue.severity, 'WARNING');
      assert.ok(issue.message.includes('{AccountId}'), `Message should include variable name: ${issue.message}`);
    });

    it('warns for dotted path {Obj.Field} stored as plain string', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="SomeApi" name="Use obj" testItemId="1">
      <arguments>
        <argument id="name">
          <value class="value" valueClass="string">{Record.Name}</value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'VAR-REF-001'),
        'Expected VAR-REF-001 for dotted path'
      );
      assert.ok(
        r.issues.find((i) => i.rule_id === 'VAR-REF-001')!.message.includes('{Record.Name}'),
        'Message should include dotted variable name'
      );
    });

    it('does not fire when value uses class="variable" (correct structure)', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="SomeApi" name="Use var" testItemId="1">
      <arguments>
        <argument id="accountId">
          <value class="variable">
            <path element="AccountId"/>
          </value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        !r.issues.some((i) => i.rule_id === 'VAR-REF-001'),
        'VAR-REF-001 should not fire for correct class="variable" structure'
      );
    });

    it('does not fire for plain string content without curly braces', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="SomeApi" name="Use literal" testItemId="1">
      <arguments>
        <argument id="name">
          <value class="value" valueClass="string">John Smith</value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        !r.issues.some((i) => i.rule_id === 'VAR-REF-001'),
        'VAR-REF-001 should not fire for plain string without curly braces'
      );
    });
  });
});

// ── Handler-level tests (registerTestCaseValidate) ────────────────────────────

describe('registerTestCaseValidate handler', () => {
  // Minimal stub server that captures the registered handler for direct invocation.
  // Cast to McpServer via unknown — safe because registerTestCaseValidate only calls server.tool().
  class CapturingServer {
    public capturedHandler: ((args: Record<string, unknown>) => Promise<unknown>) | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public tool(...args: any[]): void {
      this.capturedHandler = args[args.length - 1] as (args: Record<string, unknown>) => Promise<unknown>;
    }
  }

  let capServer: CapturingServer;
  let savedApiKey: string | undefined;
  let origHomedir: () => string;
  let tempDir: string;
  let apiStub: sinon.SinonStub | null = null;

  beforeEach(() => {
    // Redirect home so readStoredCredentials() finds no file
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provar-handler-test-'));
    origHomedir = os.homedir;
    (os as unknown as { homedir: () => string }).homedir = (): string => tempDir;

    savedApiKey = process.env.PROVAR_API_KEY;
    delete process.env.PROVAR_API_KEY;

    capServer = new CapturingServer();
    registerTestCaseValidate(capServer as unknown as McpServer, { allowedPaths: [] });
  });

  afterEach(() => {
    (os as unknown as { homedir: () => string }).homedir = origHomedir;
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (savedApiKey !== undefined) {
      process.env.PROVAR_API_KEY = savedApiKey;
    } else {
      delete process.env.PROVAR_API_KEY;
    }
    apiStub?.restore();
    apiStub = null;
  });

  it('no key → validation_source "local" with onboarding warning', async () => {
    const res = (await capServer.capturedHandler!({ content: VALID_TC })) as { content: Array<{ text: string }> };
    const result = JSON.parse(res.content[0].text) as Record<string, unknown>;
    assert.equal(result['validation_source'], 'local');
    const warning = String(result['validation_warning']);
    assert.ok(warning, 'Expected validation_warning to be set');
    assert.ok(warning.includes('Quality Hub'), 'Warning must mention Quality Hub');
  });

  it('key + API success → validation_source "quality_hub" with local metadata', async () => {
    process.env.PROVAR_API_KEY = 'pv_k_testkey12345';
    apiStub = sinon.stub(qualityHubClient, 'validateTestCaseViaApi').resolves({
      is_valid: true,
      validity_score: 100,
      quality_score: 90,
      issues: [],
    });
    const res = (await capServer.capturedHandler!({ content: VALID_TC })) as { content: Array<{ text: string }> };
    const result = JSON.parse(res.content[0].text) as Record<string, unknown>;
    assert.equal(result['validation_source'], 'quality_hub');
    assert.equal(result['is_valid'], true);
    assert.equal(result['quality_score'], 90);
    // Metadata extracted from XML locally and merged into the API response
    assert.equal(result['test_case_id'], 'test-001');
    assert.equal(result['test_case_name'], 'My Test');
    assert.equal(result['step_count'], 2);
  });

  it('key + network error → validation_source "local_fallback" with unreachable warning', async () => {
    process.env.PROVAR_API_KEY = 'pv_k_testkey12345';
    apiStub = sinon.stub(qualityHubClient, 'validateTestCaseViaApi').rejects(new Error('connect ECONNREFUSED'));
    const res = (await capServer.capturedHandler!({ content: VALID_TC })) as { content: Array<{ text: string }> };
    const result = JSON.parse(res.content[0].text) as Record<string, unknown>;
    assert.equal(result['validation_source'], 'local_fallback');
    assert.ok(String(result['validation_warning']).toLowerCase().includes('unreachable'));
  });

  it('key + QualityHubAuthError → validation_source "local_fallback" with auth warning', async () => {
    process.env.PROVAR_API_KEY = 'pv_k_testkey12345';
    apiStub = sinon.stub(qualityHubClient, 'validateTestCaseViaApi').rejects(new QualityHubAuthError('Unauthorized'));
    const res = (await capServer.capturedHandler!({ content: VALID_TC })) as { content: Array<{ text: string }> };
    const result = JSON.parse(res.content[0].text) as Record<string, unknown>;
    assert.equal(result['validation_source'], 'local_fallback');
    assert.ok(String(result['validation_warning']).includes('invalid or expired'));
  });

  it('key + QualityHubRateLimitError → validation_source "local_fallback" with rate limit warning', async () => {
    process.env.PROVAR_API_KEY = 'pv_k_testkey12345';
    apiStub = sinon
      .stub(qualityHubClient, 'validateTestCaseViaApi')
      .rejects(new QualityHubRateLimitError('Too Many Requests'));
    const res = (await capServer.capturedHandler!({ content: VALID_TC })) as { content: Array<{ text: string }> };
    const result = JSON.parse(res.content[0].text) as Record<string, unknown>;
    assert.equal(result['validation_source'], 'local_fallback');
    assert.ok(String(result['validation_warning']).toLowerCase().includes('rate limit'));
  });
});

// ── validateTestCaseXml ───────────────────────────────────────────────────────

function makeConfig(allowedPath: string): ServerConfig {
  return { allowedPaths: [allowedPath] } as unknown as ServerConfig;
}

describe('validateTestCaseXml', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-xml-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads file from disk and returns validation result', () => {
    const filePath = path.join(tmpDir, 'test.testcase');
    fs.writeFileSync(filePath, VALID_TC);
    const result = validateTestCaseXml(filePath, makeConfig(tmpDir));
    assert.equal(result.is_valid, true);
    assert.equal(result.error_count, 0);
  });

  it('throws TESTCASE_FILE_NOT_FOUND when file does not exist', () => {
    const missing = path.join(tmpDir, 'missing.testcase');
    assert.throws(
      () => validateTestCaseXml(missing, makeConfig(tmpDir)),
      (err: Error & { code?: string }) => err.code === 'TESTCASE_FILE_NOT_FOUND'
    );
  });

  it('throws when file path is outside allowed paths', () => {
    const outside = path.join(os.tmpdir(), 'outside.testcase');
    assert.throws(() => validateTestCaseXml(outside, makeConfig(tmpDir)));
  });
});
