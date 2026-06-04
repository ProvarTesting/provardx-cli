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
import { runBestPractices } from '../../../src/mcp/tools/bestPracticesEngine.js';
import type { ServerConfig } from '../../../src/mcp/server.js';
import {
  ASSERT_VALUES_COMPARISON_TYPES,
  UI_ASSERT_COMPARISON_TYPES,
} from '../../../src/mcp/rules/comparisonTypeSets.js';
import {
  qualityHubClient,
  QualityHubAuthError,
  QualityHubRateLimitError,
} from '../../../src/services/qualityHub/client.js';

// Valid UUID v4 values (format: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx)
const GUID_TC = '550e8400-e29b-41d4-a716-446655440000';
const GUID_S1 = '6ba7b810-9dad-4000-8000-00c04fd430c8';
const GUID_S2 = '6ba7b811-9dad-4001-9001-00c04fd430c8';

const VALID_TC = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<testCase guid="${GUID_TC}" id="1" registryId="abc123">
  <summary/>
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiConnect" name="Connect to browser" testItemId="1"/>
    <apiCall guid="${GUID_S2}" apiId="com.provar.plugins.forcedotcom.core.ui.UiNavigate" name="Navigate to login" testItemId="2"/>
  </steps>
</testCase>`;

describe('validateTestCase', () => {
  describe('valid test case', () => {
    it('returns is_valid=true with zero errors', () => {
      const r = validateTestCase(VALID_TC);
      assert.equal(r.is_valid, true);
      assert.equal(r.error_count, 0);
      assert.equal(r.step_count, 2);
      assert.equal(r.test_case_id, '1');
      assert.equal(r.test_case_name, null); // name attr is absent per Provar spec
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

    it('TC_010: flags non-"1" id (e.g. UUID used as id)', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?><testCase id="${GUID_TC}" guid="${GUID_TC}" registryId="r"><steps/></testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'TC_010'),
        'Expected TC_010 for UUID used as id'
      );
    });

    it('TC_010: does not fire when id="1" (the correct literal)', () => {
      const r = validateTestCase(VALID_TC);
      assert.ok(!r.issues.some((i) => i.rule_id === 'TC_010'), 'TC_010 must not fire when id="1"');
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
    const DATA_TABLE_TC = `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <dataTable>mydata.csv</dataTable>
  <steps>
    <apiCall guid="${GUID_S1}" apiId="SetValues" name="Set" testItemId="1"/>
  </steps>
</testCase>`;

    it('warns (structural) when testCase has a <dataTable> child element and mode is unknown', () => {
      const r = validateTestCase(DATA_TABLE_TC);
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

    it('PDX-489: emits DATA-001 with formatWarning text when planMode is direct', () => {
      const r = validateTestCase(DATA_TABLE_TC, undefined, { planMode: 'direct' });
      const issue = r.issues.find((i) => i.rule_id === 'DATA-001');
      assert.ok(issue, 'Expected DATA-001 to fire in direct mode');
      assert.ok(
        issue.message.startsWith('WARNING [DATA-001]:'),
        `Message must use formatWarning prefix, got: ${issue.message}`
      );
      assert.ok(
        issue.message.includes('only iterates when run through a test plan instance'),
        `Message must reference the plan-instance fix: ${issue.message}`
      );
      assert.ok(
        issue.message.includes('provar_testplan_add-instance'),
        `Message must reference provar_testplan_add-instance: ${issue.message}`
      );
    });

    it('PDX-489: suppresses DATA-001 when planMode is plan', () => {
      const r = validateTestCase(DATA_TABLE_TC, undefined, { planMode: 'plan' });
      assert.ok(
        !r.issues.some((i) => i.rule_id === 'DATA-001'),
        'DATA-001 must not fire when the test case is referenced from a .testinstance'
      );
    });

    it('PDX-489: keeps structural DATA-001 when planMode is unknown', () => {
      const r = validateTestCase(DATA_TABLE_TC, undefined, { planMode: 'unknown' });
      const issue = r.issues.find((i) => i.rule_id === 'DATA-001');
      assert.ok(issue, 'Expected DATA-001 to fire in unknown mode');
      assert.ok(
        !issue.message.startsWith('WARNING [DATA-001]:'),
        'Unknown-mode message should NOT use the formatWarning prefix (preserves prior behaviour)'
      );
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

    it('fires when UiWithScreen target <value> has no class attribute', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiWithScreen" name="Open screen" testItemId="1">
      <arguments>
        <argument id="target">
          <value>sf:ui:target?object=Account</value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'UI-TARGET-001'),
        'UI-TARGET-001 should fire when <value> has no class attribute'
      );
      const issue = r.issues.find((i) => i.rule_id === 'UI-TARGET-001')!;
      assert.ok(issue.message.includes('(missing)'), `Message should note missing class: ${issue.message}`);
    });

    it('fires when UiWithScreen target uses self-closing <value/> (empty string from fast-xml-parser)', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiWithScreen" name="Open screen" testItemId="1">
      <arguments>
        <argument id="target">
          <value/>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'UI-TARGET-001'),
        'UI-TARGET-001 should fire for self-closing <value/> (no class attribute)'
      );
      const issue = r.issues.find((i) => i.rule_id === 'UI-TARGET-001')!;
      assert.ok(issue.message.includes('(missing)'), `Message should note missing class: ${issue.message}`);
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

    it('fires when UiDoAction locator <value> has no class attribute', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction" name="Click btn" testItemId="1">
      <arguments>
        <argument id="locator">
          <value>sf:ui:locator:label?label=Save</value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'UI-LOCATOR-001'),
        'UI-LOCATOR-001 should fire when <value> has no class attribute'
      );
      const issue = r.issues.find((i) => i.rule_id === 'UI-LOCATOR-001')!;
      assert.ok(issue.message.includes('(missing)'), `Message should note missing class: ${issue.message}`);
    });

    it('fires when UiDoAction locator uses self-closing <value/> (empty string from fast-xml-parser)', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction" name="Click btn" testItemId="1">
      <arguments>
        <argument id="locator">
          <value/>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'UI-LOCATOR-001'),
        'UI-LOCATOR-001 should fire for self-closing <value/> (no class attribute)'
      );
      const issue = r.issues.find((i) => i.rule_id === 'UI-LOCATOR-001')!;
      assert.ok(issue.message.includes('(missing)'), `Message should note missing class: ${issue.message}`);
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

    // PDX-497: UI-LOCATOR-001 now covers the full locator-bearing API set —
    // UiDoAction, UiAssert, UiRead, UiFill. Prior to PDX-497 the validator used
    // a narrow substring match for UiDoAction/UiAssert only, so UiRead/UiFill
    // could carry a plain-string locator and silently fail at Provar runtime.
    it('also fires for UiRead steps with wrong locator class', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiRead" name="Read field" testItemId="1">
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
        'Expected UI-LOCATOR-001 for UiRead'
      );
    });

    it('does not fire for UiRead with correct uiLocator class', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiRead" name="Read field" testItemId="1">
      <arguments>
        <argument id="locator">
          <value class="uiLocator" uri="sf:ui:locator:label?label=Name"/>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        !r.issues.some((i) => i.rule_id === 'UI-LOCATOR-001'),
        'UI-LOCATOR-001 should not fire for UiRead with correct uiLocator class'
      );
    });

    it('also fires for UiFill steps with wrong locator class', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiFill" name="Fill field" testItemId="1">
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
        'Expected UI-LOCATOR-001 for UiFill'
      );
    });

    it('does not fire for UiFill with correct uiLocator class', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiFill" name="Fill field" testItemId="1">
      <arguments>
        <argument id="locator">
          <value class="uiLocator" uri="sf:ui:locator:label?label=Name"/>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        !r.issues.some((i) => i.rule_id === 'UI-LOCATOR-001'),
        'UI-LOCATOR-001 should not fire for UiFill with correct uiLocator class'
      );
    });

    // PDX-497: UiNavigate is a UI action but does NOT carry a `locator`
    // argument (its target is a URL/screen, not a locator). UI-LOCATOR-001
    // must not fire even when a (misplaced) locator is present — this is a
    // structural rule that only applies to APIs in the locator-bearing set.
    it('does not fire for UiNavigate even when locator argument is present', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiNavigate" name="Navigate" testItemId="1">
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
        !r.issues.some((i) => i.rule_id === 'UI-LOCATOR-001'),
        'UI-LOCATOR-001 must not fire for UiNavigate (not a locator-bearing API)'
      );
    });
  });

  // PDX-506: UiDoAction `interaction` must serialise as class="uiInteraction".
  // The Cox Demo "Create Test Case (Generated)" file ran green from the CLI but
  // rendered the IDE Action widget blank because `interaction` was a plain string.
  describe('UI-INTERACTION-001', () => {
    // REPRODUCE: the exact broken Cox Demo shape — a plain-string `interaction`.
    // This assertion FAILS against pre-fix validator code (no rule existed) and
    // PASSES once UI-INTERACTION-001 is added.
    it('errors when UiDoAction interaction argument uses class="value" (plain string)', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction" name="Click btn" testItemId="1">
      <arguments>
        <argument id="interaction">
          <value class="value" valueClass="string">ui:interaction?name=click</value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'UI-INTERACTION-001'),
        'Expected UI-INTERACTION-001'
      );
      const issue = r.issues.find((i) => i.rule_id === 'UI-INTERACTION-001')!;
      assert.equal(issue.severity, 'ERROR');
      assert.ok(issue.message.includes('uiInteraction'), `Message should mention uiInteraction: ${issue.message}`);
    });

    // CLEARED: the corrected typed-uiInteraction form must pass with no false positive.
    it('does not fire when UiDoAction interaction uses class="uiInteraction"', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction" name="Click btn" testItemId="1">
      <arguments>
        <argument id="interaction">
          <value class="uiInteraction" uri="ui:interaction?name=action"/>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        !r.issues.some((i) => i.rule_id === 'UI-INTERACTION-001'),
        'UI-INTERACTION-001 should not fire for correct uiInteraction class'
      );
    });

    it('fires when UiDoAction interaction <value> has no class attribute', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction" name="Click btn" testItemId="1">
      <arguments>
        <argument id="interaction">
          <value>ui:interaction?name=click</value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'UI-INTERACTION-001'),
        'UI-INTERACTION-001 should fire when <value> has no class attribute'
      );
      const issue = r.issues.find((i) => i.rule_id === 'UI-INTERACTION-001')!;
      assert.ok(issue.message.includes('(missing)'), `Message should note missing class: ${issue.message}`);
    });

    it('does not fire for a UI action step without an interaction argument', () => {
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
        !r.issues.some((i) => i.rule_id === 'UI-INTERACTION-001'),
        'UI-INTERACTION-001 must not fire when no interaction argument is present'
      );
    });
  });

  // PDX-507: a UiAssert field assertion must be nested inside
  // fieldAssertions/uiFieldAssertion (bare <fieldLocator uri/>). The flat shape
  // (top-level fieldLocator/attributeName/comparisonType/expectedValue args) runs
  // green from the CLI but renders the IDE Result Assertions tab blank. Contract
  // confirmed against the real corpus (AllPOCProjects): 0/3,778 UiAssert steps
  // use a flat fieldLocator argument.
  describe('UI-ASSERT-STRUCTURE-001', () => {
    // REPRODUCE: the exact broken Cox Demo flat shape. On pre-fix code the rule
    // did not exist, so provar_testcase_validate did NOT flag this shape and this
    // test's assertion therefore FAILS on main; it PASSES once the rule is added.
    it('errors when UiAssert carries a flat fieldLocator argument (Cox Demo shape)', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiAssert" name="Assert Priority error" testItemId="1">
      <arguments>
        <argument id="resultName">
          <value class="value" valueClass="string">Values</value>
        </argument>
        <argument id="fieldLocator">
          <value class="value" valueClass="string">ui:locator?name=Priority</value>
        </argument>
        <argument id="attributeName">
          <value class="value" valueClass="string">error</value>
        </argument>
        <argument id="comparisonType">
          <value class="value" valueClass="string">Contains</value>
        </argument>
        <argument id="expectedValue">
          <value class="value" valueClass="string">Priority must be set</value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'UI-ASSERT-STRUCTURE-001'),
        'Expected UI-ASSERT-STRUCTURE-001'
      );
      const issue = r.issues.find((i) => i.rule_id === 'UI-ASSERT-STRUCTURE-001')!;
      assert.equal(issue.severity, 'ERROR');
      assert.ok(
        issue.message.includes('fieldAssertions') || issue.message.includes('uiFieldAssertion'),
        `Message should mention the nested structure: ${issue.message}`
      );
    });

    // CLEARED: the corpus-confirmed nested form must pass with no false positive.
    it('does not fire for the nested uiFieldAssertion structure', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiAssert" name="Assert Name" testItemId="1">
      <arguments>
        <argument id="resultName">
          <value class="value" valueClass="string">Values</value>
        </argument>
        <argument id="resultScope">
          <value class="value" valueClass="string">Test</value>
        </argument>
        <argument id="fieldAssertions">
          <value class="valueList" mutable="Mutable">
            <uiFieldAssertion resultName="Name">
              <fieldLocator uri="ui:locator?name=Name&amp;binding=sf%3Aui%3Abinding%3Aobject%3Fobject%3DAccount%26field%3DName"/>
              <attributeAssertions>
                <uiAttributeAssertion attributeName="value" comparisonType="EqualTo">
                  <value class="value" valueClass="string">Test</value>
                </uiAttributeAssertion>
              </attributeAssertions>
            </uiFieldAssertion>
          </value>
        </argument>
        <argument id="captureAfter">
          <value class="value" valueClass="string">false</value>
        </argument>
        <argument id="columnAssertions">
          <value class="valueList" mutable="Mutable"/>
        </argument>
        <argument id="pageAssertions">
          <value class="valueList" mutable="Mutable"/>
        </argument>
        <argument id="beforeWait"/>
        <argument id="autoRetry"/>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        !r.issues.some((i) => i.rule_id === 'UI-ASSERT-STRUCTURE-001'),
        'UI-ASSERT-STRUCTURE-001 should not fire for the nested structure'
      );
    });

    // CLEARED (anchored to the real fixture): the corrected Contact_Lead_nested
    // fixture uses the nested form and must pass with no false positive.
    it('does not fire for the Contact_Lead_nested.testcase fixture', () => {
      const fixturePath = path.resolve(process.cwd(), 'test', 'fixtures', 'testcases', 'Contact_Lead_nested.testcase');
      const xml = fs.readFileSync(fixturePath, 'utf-8');
      const r = validateTestCase(xml);
      assert.ok(
        !r.issues.some((i) => i.rule_id === 'UI-ASSERT-STRUCTURE-001'),
        'Nested fixture should not trigger UI-ASSERT-STRUCTURE-001'
      );
    });

    it('does not fire for a non-UiAssert step with a fieldLocator-like argument', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction" name="Click" testItemId="1">
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
        !r.issues.some((i) => i.rule_id === 'UI-ASSERT-STRUCTURE-001'),
        'UI-ASSERT-STRUCTURE-001 must only apply to UiAssert steps'
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

    it('fires when SetValues values <value> has no class attribute', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.bundled.apis.control.SetValues" name="Set vars" testItemId="1">
      <arguments>
        <argument id="values">
          <value>someText</value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'SETVALUES-STRUCTURE-001'),
        'SETVALUES-STRUCTURE-001 should fire when <value> has no class attribute'
      );
      const issue = r.issues.find((i) => i.rule_id === 'SETVALUES-STRUCTURE-001')!;
      assert.ok(issue.message.includes('(missing)'), `Message should note missing class: ${issue.message}`);
    });

    it('fires when SetValues values uses self-closing <value/> (empty string from fast-xml-parser)', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.core.data.SetValues" name="Set vars" testItemId="1">
      <arguments>
        <argument id="values">
          <value/>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'SETVALUES-STRUCTURE-001'),
        'SETVALUES-STRUCTURE-001 should fire for self-closing <value/> (no class attribute)'
      );
      const issue = r.issues.find((i) => i.rule_id === 'SETVALUES-STRUCTURE-001')!;
      assert.ok(issue.message.includes('(missing)'), `Message should note missing class: ${issue.message}`);
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

  describe('VAR-REF-002', () => {
    it('warns when {VarName} is embedded inside a larger string value', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="SomeApi" name="SOQL query" testItemId="1">
      <arguments>
        <argument id="query">
          <value class="value" valueClass="string">SELECT Id FROM Account WHERE Id = &apos;{AccountId}&apos;</value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'VAR-REF-002'),
        `Expected VAR-REF-002, got: ${JSON.stringify(r.issues.map((i) => i.rule_id))}`
      );
      const issue = r.issues.find((i) => i.rule_id === 'VAR-REF-002')!;
      assert.equal(issue.severity, 'WARNING');
      assert.ok(issue.message.includes('AccountId'), `Message should mention the variable: ${issue.message}`);
      assert.ok(issue.suggestion?.includes('compound'), `Suggestion should mention compound: ${issue.suggestion}`);
    });

    it('warns for {NOW} system variable embedded in a SetValues string', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.core.data.SetValues" name="Set date" testItemId="1">
      <arguments>
        <argument id="values">
          <value class="value" valueClass="string">startDate=prefix_{NOW}</value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'VAR-REF-002'),
        `Expected VAR-REF-002, got: ${JSON.stringify(r.issues.map((i) => i.rule_id))}`
      );
      const issue = r.issues.find((i) => i.rule_id === 'VAR-REF-002')!;
      assert.ok(issue.message.includes('NOW'), `Message should mention NOW: ${issue.message}`);
    });

    it('does NOT fire VAR-REF-002 for a pure {VarName} value (that is VAR-REF-001)', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="SomeApi" name="Pure var" testItemId="1">
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
        !r.issues.some((i) => i.rule_id === 'VAR-REF-002'),
        'VAR-REF-002 must not fire for a pure {VarName} value'
      );
      assert.ok(
        r.issues.some((i) => i.rule_id === 'VAR-REF-001'),
        'VAR-REF-001 should still fire for pure {VarName}'
      );
    });

    it('does NOT fire VAR-REF-002 for correct class="compound" XML', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="x" guid="${GUID_TC}" registryId="r" name="T">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="SomeApi" name="Compound arg" testItemId="1">
      <arguments>
        <argument id="query">
          <value class="compound">
            <parts>
              <value valueClass="string">SELECT Id FROM Account WHERE Id = &apos;</value>
              <variable><path element="AccountId"/></variable>
              <value valueClass="string">&apos;</value>
            </parts>
          </value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`
      );
      assert.ok(
        !r.issues.some((i) => i.rule_id === 'VAR-REF-002'),
        'VAR-REF-002 must not fire when class="compound" is used correctly'
      );
    });
  });

  // ── UI-NEST-STRUCT-001 — fixture integration: Contact_Lead reporter artifacts ──
  describe('UI-NEST-STRUCT-001 fixture integration', () => {
    // Tests run from the repo root via wireit/yarn; resolve relative to cwd to avoid ESM __dirname.
    const fixturesDir = path.resolve(process.cwd(), 'test', 'fixtures', 'testcases');

    it('Contact_Lead_flat.testcase (BAD reporter artifact) fires UI-NEST-STRUCT-001 for the exact expected testItemIds', () => {
      const xml = fs.readFileSync(path.join(fixturesDir, 'Contact_Lead_flat.testcase'), 'utf-8');
      const r = validateTestCase(xml);
      const bps = (r.best_practices_violations ?? []).filter((v) => v.rule_id === 'UI-NEST-STRUCT-001');
      assert.equal(bps.length, 10, `Expected 10 UI-NEST-STRUCT-001 violations, got ${bps.length}`);
      // Each violation embeds its testItemId in the message — extract and compare.
      const tids = bps
        .map((v) => /testItemId=(\d+)/.exec(v.message)?.[1])
        .filter((s): s is string => Boolean(s))
        .map((s) => parseInt(s, 10))
        .sort((a, b) => a - b);
      assert.deepEqual(
        tids,
        [5, 8, 9, 10, 13, 14, 15, 16, 17, 18],
        `Expected testItemIds {5,8,9,10,13,14,15,16,17,18}, got ${JSON.stringify(tids)}`
      );
      // Shape assertions on every violation.
      for (const v of bps) {
        assert.equal(v.severity, 'major');
        assert.equal(v.weight, 7);
        assert.equal(v.category, 'XMLSchema');
      }
    });

    it('Contact_Lead_nested.testcase (GOOD reporter artifact) does not fire UI-NEST-STRUCT-001', () => {
      const xml = fs.readFileSync(path.join(fixturesDir, 'Contact_Lead_nested.testcase'), 'utf-8');
      const r = validateTestCase(xml);
      const bp = (r.best_practices_violations ?? []).find((v) => v.rule_id === 'UI-NEST-STRUCT-001');
      assert.equal(bp, undefined, `Nested fixture should not trigger UI-NEST-STRUCT-001, got: ${bp?.message}`);
    });
  });
});

// ── PDX-509: validity bridge (critical BP → is_valid) ─────────────────────────

describe('PDX-509 — validity bridge', () => {
  const UNKNOWN_API_TC = `<?xml version="1.0" encoding="UTF-8"?>
<testCase guid="${GUID_TC}" id="1">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.bogus.NotARealApi" name="Bad step" testItemId="1"/>
  </steps>
</testCase>`;

  // Empty-but-present <steps>: Layer-1 TC_020 does NOT fire (steps element exists),
  // and the critical VALID-STEPS-001 BP rule is Layer-1-owned, so it must NOT be bridged.
  const EMPTY_STEPS_TC = `<?xml version="1.0" encoding="UTF-8"?>
<testCase guid="${GUID_TC}" id="1">
  <steps></steps>
</testCase>`;

  // A {Var} stored as a plain string is VAR-STRING-LITERAL-001 (major) — must NOT gate is_valid.
  const MAJOR_ONLY_TC = `<?xml version="1.0" encoding="UTF-8"?>
<testCase guid="${GUID_TC}" id="1">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.testapis.ApexCreateObject" name="Create" testItemId="1">
      <arguments>
        <argument id="Name"><value class="value" valueClass="string">{AccountId}</value></argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`;

  it('a critical best-practice violation (unknown apiId) flips is_valid=false and surfaces in issues[]', () => {
    const r = validateTestCase(UNKNOWN_API_TC);
    assert.equal(r.is_valid, false, 'unknown apiId is load-blocking → is_valid must be false');
    const issue = r.issues.find((i) => i.rule_id === 'API-UNKNOWN-001');
    assert.ok(issue, 'API-UNKNOWN-001 should be bridged into issues[]');
    assert.equal(issue?.severity, 'ERROR');
    // The bridged critical also remains in best_practices_violations[] for scoring parity.
    assert.ok(
      (r.best_practices_violations ?? []).some((v) => v.rule_id === 'API-UNKNOWN-001'),
      'bridged critical stays in best_practices_violations[] (score parity)'
    );
  });

  it('a major best-practice violation does NOT flip is_valid', () => {
    const r = validateTestCase(MAJOR_ONLY_TC);
    assert.equal(r.is_valid, true, 'a major (runtime) violation loads — is_valid stays true');
    assert.ok(
      (r.best_practices_violations ?? []).some((v) => v.rule_id === 'VAR-STRING-LITERAL-001'),
      'the major violation is still reported'
    );
  });

  it('a Layer-1-owned critical (empty <steps>) is NOT bridged — Layer-1 is authoritative', () => {
    const r = validateTestCase(EMPTY_STEPS_TC);
    // TC_020 only fires on a MISSING <steps>; an empty-but-present <steps> loads.
    assert.equal(r.is_valid, true, 'empty-but-present <steps> loads — is_valid stays true');
    assert.equal(
      r.issues.find((i) => i.rule_id === 'VALID-STEPS-001'),
      undefined,
      'VALID-STEPS-001 must not be surfaced into issues[] (Layer-1 owns steps presence)'
    );
  });

  it('bridging does not perturb quality_score (Lambda parity preserved)', () => {
    const r = validateTestCase(UNKNOWN_API_TC);
    const bp = runBestPractices(UNKNOWN_API_TC);
    assert.equal(r.quality_score, bp.quality_score, 'quality_score is computed from the untouched BP list');
  });
});

// ── Handler-level tests (registerTestCaseValidate) ────────────────────────────

describe('registerTestCaseValidate handler', () => {
  // Minimal stub server that captures the registered handler for direct invocation.
  // Cast to McpServer via unknown — safe because registerTestCaseValidate only calls server.tool().
  class CapturingServer {
    public capturedHandler: ((args: Record<string, unknown>) => Promise<unknown>) | null = null;
    public capturedDescription: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public tool(...args: any[]): void {
      this.capturedHandler = args[args.length - 1] as (args: Record<string, unknown>) => Promise<unknown>;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public registerTool(...args: any[]): void {
      const config = args[1] as { description?: string };
      if (config?.description) this.capturedDescription = config.description;
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

  describe('PDX-509 — tri-state status + quality_threshold', () => {
    const BAD_TC = `<?xml version="1.0" encoding="UTF-8"?>
<testCase guid="${GUID_TC}" id="1">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.bogus.NotARealApi" name="Bad" testItemId="1"/>
  </steps>
</testCase>`;

    // Loadable (is_valid true) but carries a major (VAR-STRING-LITERAL-001) so quality_score < 100.
    const NEEDS_IMPROVEMENT_TC = `<?xml version="1.0" encoding="UTF-8"?>
<testCase guid="${GUID_TC}" id="1">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="com.provar.plugins.forcedotcom.core.testapis.ApexCreateObject" name="Create" testItemId="1">
      <arguments>
        <argument id="Name"><value class="value" valueClass="string">{AccountId}</value></argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`;

    async function validate(args: Record<string, unknown>): Promise<Record<string, unknown>> {
      const res = (await capServer.capturedHandler!(args)) as { content: Array<{ text: string }> };
      return JSON.parse(res.content[0].text) as Record<string, unknown>;
    }

    it('status="invalid" + default quality_threshold 90 when a critical defect blocks loading', async () => {
      const r = await validate({ content: BAD_TC });
      assert.equal(r['is_valid'], false);
      assert.equal(r['status'], 'invalid');
      assert.equal(r['quality_threshold'], 90, 'default threshold is 90');
    });

    it('status="valid" when loadable and meets the threshold', async () => {
      const r = await validate({ content: VALID_TC, quality_threshold: 0 });
      assert.equal(r['is_valid'], true);
      assert.equal(r['status'], 'valid');
      assert.equal(r['meets_quality_threshold'], true);
    });

    it('status="needs_improvement" when loadable but below the threshold', async () => {
      // Loadable, but a major violation keeps quality_score below the strict bar of 100.
      const r = await validate({ content: NEEDS_IMPROVEMENT_TC, quality_threshold: 100 });
      assert.equal(r['is_valid'], true);
      assert.ok((r['quality_score'] as number) < 100, 'fixture must score below 100');
      assert.equal(r['status'], 'needs_improvement');
      assert.equal(r['meets_quality_threshold'], false);
    });

    it('per-call quality_threshold overrides the PROVAR_MCP_QUALITY_THRESHOLD env var', async () => {
      const saved = process.env.PROVAR_MCP_QUALITY_THRESHOLD;
      process.env.PROVAR_MCP_QUALITY_THRESHOLD = '50';
      try {
        const r = await validate({ content: VALID_TC, quality_threshold: 80 });
        assert.equal(r['quality_threshold'], 80, 'per-call arg wins over the env var');
      } finally {
        if (saved !== undefined) process.env.PROVAR_MCP_QUALITY_THRESHOLD = saved;
        else delete process.env.PROVAR_MCP_QUALITY_THRESHOLD;
      }
    });

    it('PROVAR_MCP_QUALITY_THRESHOLD is used when no per-call arg is given', async () => {
      const saved = process.env.PROVAR_MCP_QUALITY_THRESHOLD;
      process.env.PROVAR_MCP_QUALITY_THRESHOLD = '75';
      try {
        const r = await validate({ content: VALID_TC });
        assert.equal(r['quality_threshold'], 75, 'env var is the effective threshold');
      } finally {
        if (saved !== undefined) process.env.PROVAR_MCP_QUALITY_THRESHOLD = saved;
        else delete process.env.PROVAR_MCP_QUALITY_THRESHOLD;
      }
    });
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
    assert.equal(result['test_case_id'], '1'); // id="1" per Provar spec
    assert.equal(result['test_case_name'], null); // name attr absent per Provar spec
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

  describe('PDX-470 — detail level', () => {
    it('standard response includes is_valid, issues, and run_id', async () => {
      const res = (await capServer.capturedHandler!({
        content: VALID_TC,
        detail: 'standard',
      })) as { content: Array<{ text: string }> };
      const result = JSON.parse(res.content[0].text) as Record<string, unknown>;
      assert.ok('is_valid' in result, 'standard should include is_valid');
      assert.ok('issues' in result, 'standard should include issues');
      assert.ok('run_id' in result, 'standard should include run_id');
    });

    it('summary response includes only key fields, not issues', async () => {
      const res = (await capServer.capturedHandler!({
        content: VALID_TC,
        detail: 'summary',
      })) as { content: Array<{ text: string }> };
      const result = JSON.parse(res.content[0].text) as Record<string, unknown>;
      assert.ok('is_valid' in result, 'summary should include is_valid');
      assert.ok('quality_score' in result, 'summary should include quality_score');
      assert.ok('completeness_score' in result, 'summary should include completeness_score');
      assert.ok('recommended_next_action' in result, 'summary should include recommended_next_action');
      assert.ok(!('issues' in result), 'summary should NOT include issues');
    });
  });

  describe('PDX-473 — completeness_score and recommended_next_action', () => {
    it('completeness_score is 100 for a valid test case', async () => {
      const res = (await capServer.capturedHandler!({ content: VALID_TC })) as {
        content: Array<{ text: string }>;
      };
      const result = JSON.parse(res.content[0].text) as Record<string, unknown>;
      assert.equal(result['completeness_score'], 100);
    });

    it('recommended_next_action is not "stop" when quality violations remain (Bug 9)', async () => {
      // VALID_TC is structurally valid (is_valid=true, score=100) but has BP violations.
      // "stop" must not fire until ALL violations are resolved.
      const res = (await capServer.capturedHandler!({ content: VALID_TC })) as {
        content: Array<{ text: string }>;
      };
      const result = JSON.parse(res.content[0].text) as Record<string, unknown>;
      assert.ok(
        ['inspect_failures', 'fix_and_revalidate'].includes(result['recommended_next_action'] as string),
        `Expected inspect_failures or fix_and_revalidate when BP violations remain, got: ${String(
          result['recommended_next_action']
        )}`
      );
    });

    it('recommended_next_action is inspect_failures for an invalid test case (first run)', async () => {
      const badXml = '<?xml version="1.0"?><testCase id="x" guid="not-a-uuid" registryId="r"><steps/></testCase>';
      const res = (await capServer.capturedHandler!({ content: badXml })) as {
        content: Array<{ text: string }>;
      };
      const result = JSON.parse(res.content[0].text) as Record<string, unknown>;
      assert.equal(result['completeness_score'], 0);
      assert.equal(result['recommended_next_action'], 'inspect_failures');
    });
  });

  describe('PDX-471 — baseline_run_id diff mode', () => {
    it('run_id is present in every response', async () => {
      const res = (await capServer.capturedHandler!({ content: VALID_TC })) as {
        content: Array<{ text: string }>;
      };
      const result = JSON.parse(res.content[0].text) as Record<string, unknown>;
      assert.ok(typeof result['run_id'] === 'string' && result['run_id'].length > 0);
    });

    it('returns BASELINE_NOT_FOUND for an unknown baseline_run_id', async () => {
      const res = (await capServer.capturedHandler!({
        content: VALID_TC,
        baseline_run_id: 'nonexistent-run-id-xyz',
      })) as { isError?: boolean; content: Array<{ text: string }> };
      assert.equal(res.isError, true);
      const body = JSON.parse(res.content[0].text) as Record<string, unknown>;
      assert.equal(body['error_code'], 'BASELINE_NOT_FOUND');
    });

    it('diff mode returns added/resolved/unchanged_count when baseline exists', async () => {
      const first = (await capServer.capturedHandler!({ content: VALID_TC })) as {
        content: Array<{ text: string }>;
      };
      const firstBody = JSON.parse(first.content[0].text) as Record<string, unknown>;
      const runId = firstBody['run_id'] as string;

      const second = (await capServer.capturedHandler!({
        content: VALID_TC,
        baseline_run_id: runId,
      })) as { content: Array<{ text: string }> };
      assert.ok(!(second as { isError?: boolean }).isError);
      const diffBody = JSON.parse(second.content[0].text) as Record<string, unknown>;
      assert.ok('added' in diffBody, 'diff should include added');
      assert.ok('resolved' in diffBody, 'diff should include resolved');
      assert.ok('unchanged_count' in diffBody, 'diff should include unchanged_count');
    });
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

// ── PDX-489 handler-level DATA-001 integration ────────────────────────────────

/**
 * Build a project that wires a dataTable test case directly (via testCase /
 * testCases array) OR through a .testinstance — and writes ~/.sf/config.json
 * pointing at the project's provardx-properties.json so the handler can
 * resolve plan mode without explicit overrides.
 */
function buildDataTableProject(
  tmpRoot: string,
  references: 'direct-testCase' | 'direct-testCases' | 'plan'
): { testCasePath: string; allowedPaths: string[] } {
  const projectPath = path.join(tmpRoot, 'project');
  fs.mkdirSync(path.join(projectPath, 'tests', 'Module'), { recursive: true });
  const testCasePath = path.join(projectPath, 'tests', 'Module', 'DataTest.testcase');
  fs.writeFileSync(
    testCasePath,
    `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="1" guid="550e8400-e29b-41d4-a716-446655440000" registryId="r" name="DataTest">
  <dataTable>mydata.csv</dataTable>
  <steps>
    <apiCall guid="6ba7b810-9dad-4000-8000-00c04fd430c8" apiId="SetValues" name="S" testItemId="1"/>
  </steps>
</testCase>`
  );

  const props: Record<string, unknown> = {
    projectPath,
    provarHome: '/tmp/provarHome',
    resultsPath: 'ANT/Results',
  };

  if (references === 'direct-testCase') {
    props.testCase = ['Module/DataTest.testcase'];
  } else if (references === 'direct-testCases') {
    props.testCases = ['Module/DataTest.testcase'];
  } else {
    fs.mkdirSync(path.join(projectPath, 'plans', 'Plan1', 'Suite1'), { recursive: true });
    fs.writeFileSync(
      path.join(projectPath, 'plans', 'Plan1', 'Suite1', 'DataTest.testinstance'),
      '<testInstance testCasePath="Module/DataTest.testcase"/>'
    );
  }

  const propertiesPath = path.join(projectPath, 'provardx-properties.json');
  fs.writeFileSync(propertiesPath, JSON.stringify(props, null, 2));

  // Wire ~/.sf/config.json so the resolver picks up the properties file.
  const sfDir = path.join(tmpRoot, '.sf');
  fs.mkdirSync(sfDir, { recursive: true });
  fs.writeFileSync(path.join(sfDir, 'config.json'), JSON.stringify({ PROVARDX_PROPERTIES_FILE_PATH: propertiesPath }));

  return { testCasePath, allowedPaths: [tmpRoot] };
}

describe('PDX-489: DATA-001 handler integration via validateTestCaseXml', () => {
  let tmpRoot: string;
  let origHomedir: () => string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pdx489-handler-'));
    origHomedir = os.homedir;
    (os as unknown as { homedir: () => string }).homedir = (): string => tmpRoot;
  });

  afterEach(() => {
    (os as unknown as { homedir: () => string }).homedir = origHomedir;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('fires DATA-001 with formatWarning prefix when properties uses top-level testCase', () => {
    const { testCasePath, allowedPaths } = buildDataTableProject(tmpRoot, 'direct-testCase');
    const result = validateTestCaseXml(testCasePath, { allowedPaths } as unknown as ServerConfig);
    const issue = result.issues.find((i) => i.rule_id === 'DATA-001');
    assert.ok(issue, 'Expected DATA-001 in direct testCase mode');
    assert.ok(issue.message.startsWith('WARNING [DATA-001]:'), `Expected formatWarning prefix: ${issue.message}`);
    assert.ok(
      issue.message.includes('provar_testplan_add-instance'),
      `Expected guidance to plan-instance: ${issue.message}`
    );
  });

  it('fires DATA-001 when properties uses testCases (plural) — typo-tolerant', () => {
    const { testCasePath, allowedPaths } = buildDataTableProject(tmpRoot, 'direct-testCases');
    const result = validateTestCaseXml(testCasePath, { allowedPaths } as unknown as ServerConfig);
    const issue = result.issues.find((i) => i.rule_id === 'DATA-001');
    assert.ok(issue, 'Expected DATA-001 when testCases array references the test');
    assert.ok(issue.message.startsWith('WARNING [DATA-001]:'));
  });

  it('does NOT fire DATA-001 when test case is referenced from a .testinstance', () => {
    const { testCasePath, allowedPaths } = buildDataTableProject(tmpRoot, 'plan');
    const result = validateTestCaseXml(testCasePath, { allowedPaths } as unknown as ServerConfig);
    assert.ok(
      !result.issues.some((i) => i.rule_id === 'DATA-001'),
      'DATA-001 must not fire when the test case is wired via a plan instance'
    );
  });

  it('does NOT fire DATA-001 when test case has no <dataTable> (direct mode)', () => {
    // Reuse the direct project but rewrite the test case content without a <dataTable>.
    const { testCasePath, allowedPaths } = buildDataTableProject(tmpRoot, 'direct-testCase');
    fs.writeFileSync(testCasePath, VALID_TC);
    const result = validateTestCaseXml(testCasePath, { allowedPaths } as unknown as ServerConfig);
    assert.ok(
      !result.issues.some((i) => i.rule_id === 'DATA-001'),
      'DATA-001 must not fire when no <dataTable> is present'
    );
  });
});

// ── tool description ──────────────────────────────────────────────────────────

describe('provar_testcase_validate description', () => {
  class DescriptionCapturingServer {
    public capturedDescription: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public registerTool(...args: any[]): void {
      const config = args[1] as { description?: string };
      if (config?.description) this.capturedDescription = config.description;
    }
  }

  it('includes step-reference guidance', () => {
    const srv = new DescriptionCapturingServer();
    registerTestCaseValidate(srv as unknown as McpServer, { allowedPaths: [] });
    assert.ok(srv.capturedDescription, 'description should be captured');
    assert.ok(
      String(srv.capturedDescription).includes('provar://docs/step-reference'),
      'description should include step-reference guidance'
    );
  });
});

describe('COMPARISON-TYPE-001: context-aware comparisonType enum validator', () => {
  const G1 = '6ba7b810-9dad-4000-8000-00c04fd430c8';

  const assertValuesTC = (cmp: string): string =>
    `<?xml version="1.0" encoding="UTF-8"?>
<testCase guid="${GUID_TC}" id="1">
  <steps>
    <apiCall guid="${G1}" apiId="com.provar.plugins.bundled.apis.AssertValues" name="Assert values" testItemId="1">
      <arguments>
        <argument id="expectedValue"><value class="variable"><path element="Expected"/></value></argument>
        <argument id="comparisonType"><value class="value" valueClass="string">${cmp}</value></argument>
        <argument id="actualValue"><value class="variable"><path element="Actual"/></value></argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`;

  const uiAssertTC = (cmp: string): string =>
    `<?xml version="1.0" encoding="UTF-8"?>
<testCase guid="${GUID_TC}" id="1">
  <steps>
    <apiCall guid="${G1}" apiId="com.provar.plugins.forcedotcom.core.ui.UiAssert" name="UI Assert" testItemId="1">
      <arguments>
        <argument id="fieldAssertions">
          <value class="valueList" mutable="Mutable">
            <uiFieldAssertion resultName="Name">
              <attributeAssertions>
                <uiAttributeAssertion attributeName="value" comparisonType="${cmp}"/>
              </attributeAssertions>
            </uiFieldAssertion>
          </value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`;

  const hasComparisonError = (r: ReturnType<typeof validateTestCase>): boolean =>
    r.issues.some((i) => i.rule_id === 'COMPARISON-TYPE-001' && i.severity === 'ERROR');

  it('passes every valid AssertValues constant (incl. NotEqualTo) on an AssertValues step', () => {
    for (const cmp of ASSERT_VALUES_COMPARISON_TYPES) {
      const r = validateTestCase(assertValuesTC(cmp));
      assert.ok(!hasComparisonError(r), `AssertValues comparisonType="${cmp}" must not fire COMPARISON-TYPE-001`);
    }
  });

  it('passes every valid UI Assert constant on a UI Assert step', () => {
    for (const cmp of UI_ASSERT_COMPARISON_TYPES) {
      const r = validateTestCase(uiAssertTC(cmp));
      assert.ok(!hasComparisonError(r), `UI Assert comparisonType="${cmp}" must not fire COMPARISON-TYPE-001`);
    }
  });

  it('fires ERROR for NotEqualTo on a UI Assert step (valid for AssertValues, not UI)', () => {
    // Context-sensitive: the same value passes on AssertValues but is load-blocking on a UI Assert.
    assert.ok(!hasComparisonError(validateTestCase(assertValuesTC('NotEqualTo'))));
    const r = validateTestCase(uiAssertTC('NotEqualTo'));
    assert.ok(hasComparisonError(r), 'NotEqualTo on a UI Assert must fire COMPARISON-TYPE-001');
    assert.equal(r.is_valid, false, 'a load-blocking comparisonType must make the test case invalid');
  });

  it('fires ERROR for a constant in neither set (NotEqualToo) on both step types', () => {
    const av = validateTestCase(assertValuesTC('NotEqualToo'));
    assert.ok(hasComparisonError(av), 'NotEqualToo on AssertValues must fire COMPARISON-TYPE-001');
    const ui = validateTestCase(uiAssertTC('NotEqualToo'));
    assert.ok(hasComparisonError(ui), 'NotEqualToo on a UI Assert must fire COMPARISON-TYPE-001');
  });

  it('does not fire for a variable-reference comparisonType (cannot be checked statically)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testCase guid="${GUID_TC}" id="1">
  <steps>
    <apiCall guid="${G1}" apiId="com.provar.plugins.bundled.apis.AssertValues" name="Assert" testItemId="1">
      <arguments>
        <argument id="comparisonType"><value class="variable"><path element="DynamicOp"/></value></argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`;
    assert.ok(!hasComparisonError(validateTestCase(xml)));
  });
});
