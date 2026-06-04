/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { calculateBPScore, runBestPractices, type BPViolation } from '../../../src/mcp/tools/bestPracticesEngine.js';

// ── Helper: build a minimal violation ────────────────────────────────────────

function makeViolation(severity: BPViolation['severity'], weight: number, count?: number): BPViolation {
  return {
    rule_id: 'TEST-001',
    name: 'Test Violation',
    description: '',
    category: 'Test',
    severity,
    weight,
    message: 'Test message',
    recommendation: 'Fix it',
    applies_to: ['testCase'],
    count,
  };
}

// ── Valid XML fixture (passes all schema-level rules) ─────────────────────────

const GUID_TC = '550e8400-e29b-41d4-a716-446655440000';
const GUID_S1 = '550e8400-e29b-41d4-a716-446655440011';
const GUID_S2 = '550e8400-e29b-41d4-a716-446655440012';

const VALID_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="tc-001" guid="${GUID_TC}" registryId="tc-001" name="Login Test">
  <steps>
    <apiCall guid="${GUID_S1}" apiId="UiConnect" name="Connect to browser" testItemId="1"/>
    <apiCall guid="${GUID_S2}" apiId="UiNavigate" name="Navigate to login page" testItemId="2"/>
  </steps>
</testCase>`;

// ── calculateBPScore ──────────────────────────────────────────────────────────

describe('calculateBPScore', () => {
  it('returns 100 when there are no violations', () => {
    assert.equal(calculateBPScore([]), 100);
  });

  it('deducts correctly for a single critical violation (weight=10, count=1)', () => {
    // score = 100 - (10 * 1.0 * 1) = 90
    const score = calculateBPScore([makeViolation('critical', 10)]);
    assert.equal(score, 90);
  });

  it('deducts correctly for a single major violation (weight=4, count=1)', () => {
    // score = 100 - (4 * 0.75 * 1) = 97
    const score = calculateBPScore([makeViolation('major', 4)]);
    assert.equal(score, 97);
  });

  it('deducts correctly for a single minor violation (weight=2, count=1)', () => {
    // score = 100 - (2 * 0.5 * 1) = 99
    const score = calculateBPScore([makeViolation('minor', 2)]);
    assert.equal(score, 99);
  });

  it('deducts correctly for a single info violation (weight=4, count=1)', () => {
    // score = 100 - (4 * 0.25 * 1) = 99
    const score = calculateBPScore([makeViolation('info', 4)]);
    assert.equal(score, 99);
  });

  it('applies log2 diminishing returns when count > 1', () => {
    // count=4: effective_count = 1 + log2(4) = 1 + 2 = 3
    // score = 100 - (10 * 1.0 * 3) = 70
    const score = calculateBPScore([makeViolation('critical', 10, 4)]);
    assert.equal(score, 70);
  });

  it('does not apply diminishing returns when count=1 (explicit)', () => {
    // effective_count = 1 (not > 1)
    const score = calculateBPScore([makeViolation('critical', 10, 1)]);
    assert.equal(score, 90);
  });

  it('accumulates deductions across multiple violations', () => {
    // critical weight=5: 100 - 5 = 95
    // major   weight=4: 95 - 3 = 92
    // net: 92
    const score = calculateBPScore([makeViolation('critical', 5), makeViolation('major', 4)]);
    assert.equal(score, 92);
  });

  it('never returns a negative score regardless of severity', () => {
    const violations = Array.from({ length: 20 }, () => makeViolation('critical', 20));
    const score = calculateBPScore(violations);
    assert.ok(score >= 0, `Expected score >= 0, got ${score}`);
    assert.equal(score, 0);
  });

  it('never returns a score above 100', () => {
    assert.ok(calculateBPScore([]) <= 100);
  });
});

// ── runBestPractices ──────────────────────────────────────────────────────────

describe('runBestPractices', () => {
  describe('valid XML test case', () => {
    it('returns a quality_score between 0 and 100', () => {
      const result = runBestPractices(VALID_XML);
      assert.ok(result.quality_score >= 0, `score ${result.quality_score} should be >= 0`);
      assert.ok(result.quality_score <= 100, `score ${result.quality_score} should be <= 100`);
    });

    it('returns rules_evaluated > 0 when rules are loaded', () => {
      const result = runBestPractices(VALID_XML);
      assert.ok(result.rules_evaluated > 0, 'rules_evaluated should be greater than 0 when rules are loaded');
    });

    it('returns violations as an array', () => {
      const result = runBestPractices(VALID_XML);
      assert.ok(Array.isArray(result.violations), 'violations should be an array');
    });

    it('passes optional testName metadata without error', () => {
      const result = runBestPractices(VALID_XML, { testName: 'Login Test' });
      assert.ok(result.quality_score >= 0 && result.quality_score <= 100);
    });
  });

  describe('empty or invalid XML', () => {
    it('returns quality_score=0 for an empty string (no parseable testCase)', () => {
      const result = runBestPractices('');
      assert.equal(result.quality_score, 0);
      assert.equal(result.violations.length, 0);
    });

    it('does not throw for completely malformed XML', () => {
      assert.doesNotThrow(() => runBestPractices('<<<not xml>>>'));
    });

    it('returns quality_score=0 for XML with wrong root element', () => {
      const result = runBestPractices('<?xml version="1.0"?><notTestCase><steps/></notTestCase>');
      assert.equal(result.quality_score, 0);
    });
  });

  describe('score parity with calculateBPScore', () => {
    it('quality_score matches what calculateBPScore would produce for the same violations', () => {
      const result = runBestPractices(VALID_XML);
      const recalculated = calculateBPScore(result.violations);
      assert.equal(result.quality_score, recalculated);
    });
  });

  describe('uiWithScreenTarget validator', () => {
    const GUID_UWS = '550e8400-e29b-41d4-a716-446655440020';
    const GUID_TC2 = '550e8400-e29b-41d4-a716-446655440030';

    function buildUwsXml(target: string): string {
      return `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="tc-uwstest" guid="${GUID_TC2}" registryId="tc-uwstest" name="UWS Target Test">
  <steps>
    <apiCall guid="${GUID_UWS}" apiId="com.provar.plugins.forcedotcom.core.ui.UiWithScreen" name="With page" testItemId="1">
      <arguments>
        <argument id="target">
          <value class="value" valueClass="string">${target}</value>
        </argument>
      </arguments>
    </apiCall>
  </steps>
</testCase>`;
    }

    it('passes for a valid SF target URI (sf:ui:target?object=Account&action=view)', () => {
      const result = runBestPractices(buildUwsXml('sf:ui:target?object=Account&amp;action=view'));
      const uwsViolation = result.violations.find(
        (v) => v.rule_id.includes('UI-SCREEN') || v.message.includes('UiWithScreen')
      );
      assert.ok(!uwsViolation, `Expected no uiWithScreenTarget violation, got: ${uwsViolation?.message}`);
    });

    it('passes for a valid page object target URI (ui:pageobject:target?pageId=pageobjects.LoginPage)', () => {
      const result = runBestPractices(buildUwsXml('ui:pageobject:target?pageId=pageobjects.LoginPage'));
      const uwsViolation = result.violations.find(
        (v) => v.message.includes('UiWithScreen') || v.message.includes('pageId')
      );
      assert.ok(!uwsViolation, `Expected no uiWithScreenTarget violation, got: ${uwsViolation?.message}`);
    });

    it('fires for page object target in colon format (ui:pageobject:target:com.example.Class)', () => {
      const result = runBestPractices(buildUwsXml('ui:pageobject:target:com.example.LoginPage'));
      const uwsViolation = result.violations.find(
        (v) => v.message.includes('colon format') || v.message.includes('UiWithScreen')
      );
      assert.ok(uwsViolation, 'Expected uiWithScreenTarget violation for colon format URI');
    });

    it('fires for page object target with pageId missing pageobjects. prefix', () => {
      const result = runBestPractices(buildUwsXml('ui:pageobject:target?pageId=LoginPage'));
      const uwsViolation = result.violations.find(
        (v) => v.message.includes('pageobjects.') || v.message.includes('UiWithScreen')
      );
      assert.ok(uwsViolation, 'Expected uiWithScreenTarget violation for missing pageobjects. prefix');
    });
  });

  // ── UI-NEST-STRUCT-001 — UI action nesting structure ──
  describe('UI-NEST-STRUCT-001 — uiActionNestingStructure validator', () => {
    const GUID_TC3 = '550e8400-e29b-41d4-a716-446655440040';
    const GUID_UWS3 = '550e8400-e29b-41d4-a716-446655440041';
    const GUID_DO3 = '550e8400-e29b-41d4-a716-446655440042';
    const GUID_X = '550e8400-e29b-41d4-a716-446655440043';

    function nestViolations(violations: BPViolation[]): BPViolation[] {
      return violations.filter((v) => v.rule_id === 'UI-NEST-STRUCT-001');
    }

    // ─ Positive cases (must NOT fire) ─────────────────────────────────────────

    for (const shortApi of ['UiDoAction', 'UiAssert', 'UiRead', 'UiFill', 'UiNavigate', 'UiHandleAlert']) {
      it(`passes when ${shortApi} is nested inside UiWithScreen → clauses → clause[substeps] → steps`, () => {
        const apiId = `com.provar.plugins.forcedotcom.core.ui.${shortApi}`;
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="1" guid="${GUID_TC3}" registryId="tc-nest-good-${shortApi}" name="Nest Good ${shortApi}">
  <steps>
    <apiCall guid="${GUID_UWS3}" apiId="com.provar.plugins.forcedotcom.core.ui.UiWithScreen" name="Open screen" testItemId="1">
      <clauses>
        <clause name="substeps" testItemId="2">
          <steps>
            <apiCall guid="${GUID_DO3}" apiId="${apiId}" name="${shortApi} step" testItemId="3" title="${shortApi} title"/>
          </steps>
        </clause>
      </clauses>
    </apiCall>
  </steps>
</testCase>`;
        assert.equal(nestViolations(runBestPractices(xml).violations).length, 0);
      });
    }

    it('passes when UiWithRow is nested inside UiWithScreen substeps, and a UiHandleAlert lives inside UiWithRow substeps', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="1" guid="${GUID_TC3}" registryId="tc-nest-row" name="Nest UiWithRow">
  <steps>
    <apiCall guid="${GUID_UWS3}" apiId="com.provar.plugins.forcedotcom.core.ui.UiWithScreen" name="Screen" testItemId="1">
      <clauses>
        <clause name="substeps" testItemId="2">
          <steps>
            <apiCall guid="${GUID_DO3}" apiId="com.provar.plugins.forcedotcom.core.ui.UiWithRow" name="Row" testItemId="3" title="Row">
              <clauses>
                <clause name="substeps" testItemId="4">
                  <steps>
                    <apiCall guid="${GUID_X}" apiId="com.provar.plugins.forcedotcom.core.ui.UiHandleAlert" name="Alert" testItemId="5" title="Handle alert"/>
                  </steps>
                </clause>
              </clauses>
            </apiCall>
          </steps>
        </clause>
      </clauses>
    </apiCall>
  </steps>
</testCase>`;
      assert.equal(nestViolations(runBestPractices(xml).violations).length, 0);
    });

    it('passes when a UiDoAction sits inside IfThen → then-clause inside a UiWithScreen substeps (control-flow wrapper allowed)', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="1" guid="${GUID_TC3}" registryId="tc-nest-ifthen" name="Nest IfThen">
  <steps>
    <apiCall guid="${GUID_UWS3}" apiId="com.provar.plugins.forcedotcom.core.ui.UiWithScreen" name="Screen" testItemId="1">
      <clauses>
        <clause name="substeps" testItemId="2">
          <steps>
            <apiCall guid="${GUID_DO3}" apiId="com.provar.plugins.bundled.apis.If" name="If" testItemId="3" title="If">
              <clauses>
                <clause name="then" testItemId="4">
                  <steps>
                    <apiCall guid="${GUID_X}" apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction" name="Click" testItemId="5" title="Click in then"/>
                  </steps>
                </clause>
              </clauses>
            </apiCall>
          </steps>
        </clause>
      </clauses>
    </apiCall>
  </steps>
</testCase>`;
      assert.equal(nestViolations(runBestPractices(xml).violations).length, 0);
    });

    it('does not fire for steps inside <clause name="hidden"> (disabled / settings blocks are exempt)', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="1" guid="${GUID_TC3}" registryId="tc-nest-hidden" name="Nest Hidden">
  <steps>
    <apiCall guid="${GUID_UWS3}" apiId="com.provar.plugins.bundled.apis.control.StepGroup" name="Group" testItemId="1">
      <clauses>
        <clause name="hidden" testItemId="2">
          <steps>
            <apiCall guid="${GUID_DO3}" apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction" name="Click" testItemId="3" title="Click hidden"/>
          </steps>
        </clause>
      </clauses>
    </apiCall>
  </steps>
</testCase>`;
      assert.equal(nestViolations(runBestPractices(xml).violations).length, 0);
    });

    it('does not fire for empty <steps/> or test cases with no UI action steps', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="1" guid="${GUID_TC3}" registryId="tc-nest-empty" name="Empty"><steps/></testCase>`;
      assert.equal(nestViolations(runBestPractices(xml).violations).length, 0);
    });

    // ─ Negative cases (must fire) ─────────────────────────────────────────────

    for (const shortApi of ['UiDoAction', 'UiAssert', 'UiRead', 'UiFill', 'UiNavigate', 'UiWithRow', 'UiHandleAlert']) {
      it(`fires exactly once for a root-level ${shortApi}`, () => {
        const apiId = `com.provar.plugins.forcedotcom.core.ui.${shortApi}`;
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="1" guid="${GUID_TC3}" registryId="tc-nest-root-${shortApi}" name="Root ${shortApi}">
  <steps>
    <apiCall guid="${GUID_DO3}" apiId="${apiId}" name="${shortApi}" testItemId="7" title="${shortApi} root"/>
  </steps>
</testCase>`;
        const vs = nestViolations(runBestPractices(xml).violations);
        assert.equal(vs.length, 1, `Expected exactly 1 violation for root-level ${shortApi}`);
        assert.equal(vs[0].severity, 'major');
        assert.equal(vs[0].weight, 7);
        assert.equal(vs[0].category, 'XMLSchema');
        assert.ok(vs[0].message.startsWith(shortApi), `Message should start with ${shortApi}: ${vs[0].message}`);
        assert.ok(vs[0].message.includes('testItemId=7'), `Message should include testItemId: ${vs[0].message}`);
        assert.ok(
          vs[0].message.includes('not nested inside any UiWithScreen or UiWithRow ancestor'),
          `Message should describe missing ancestor: ${vs[0].message}`
        );
      });
    }

    it('fires when UiWithScreen wraps <steps> directly without a <clause name="substeps"> (missing substeps clause)', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="1" guid="${GUID_TC3}" registryId="tc-nest-noclause" name="Nest No Clause">
  <steps>
    <apiCall guid="${GUID_UWS3}" apiId="com.provar.plugins.forcedotcom.core.ui.UiWithScreen" name="Screen" testItemId="1">
      <steps>
        <apiCall guid="${GUID_DO3}" apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction" name="Click" testItemId="2" title="Click no clause"/>
      </steps>
    </apiCall>
  </steps>
</testCase>`;
      const vs = nestViolations(runBestPractices(xml).violations);
      assert.equal(vs.length, 1);
      assert.ok(
        vs[0].message.includes('nested under \'UiWithScreen\' but not via a <clause name="substeps">'),
        `Message should mention missing substeps clause: ${vs[0].message}`
      );
    });

    it('emits one violation per offending step (count parity with QH Lambda)', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="1" guid="${GUID_TC3}" registryId="tc-nest-multi" name="Nest Multi">
  <steps>
    <apiCall guid="${GUID_UWS3}" apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction" name="A" testItemId="1" title="A"/>
    <apiCall guid="${GUID_DO3}" apiId="com.provar.plugins.forcedotcom.core.ui.UiAssert" name="B" testItemId="2" title="B"/>
    <apiCall guid="${GUID_X}" apiId="com.provar.plugins.forcedotcom.core.ui.UiFill" name="C" testItemId="3" title="C"/>
  </steps>
</testCase>`;
      const vs = nestViolations(runBestPractices(xml).violations);
      assert.equal(vs.length, 3, 'Expected one violation per offending step');
      // Each violation should carry no count (count is reserved for the consolidated
      // single-violation pattern used by API-UNKNOWN-001 etc.).
      for (const v of vs) assert.equal(v.count, undefined);
    });

    // ─ Regression: every UI action in the apply set must also be a known API ───
    // (PR #192 Copilot review): UiRead is enforced by UI-NEST-STRUCT-001 and so
    // must also appear in VALID_API_IDS, otherwise a properly-nested UiRead would
    // pass UI-NEST-STRUCT-001 while still being flagged by API-UNKNOWN-001 —
    // a contradictory finding pair the local validator must never emit.
    for (const shortApi of ['UiDoAction', 'UiAssert', 'UiRead', 'UiFill', 'UiNavigate', 'UiWithRow', 'UiHandleAlert']) {
      it(`emits no API-UNKNOWN-001 for a properly-nested ${shortApi} (no contradictory findings)`, () => {
        const apiId = `com.provar.plugins.forcedotcom.core.ui.${shortApi}`;
        const inner =
          shortApi === 'UiWithRow'
            ? `<apiCall guid="${GUID_X}" apiId="${apiId}" name="Row" testItemId="3" title="Row"><clauses><clause name="substeps" testItemId="4"><steps><apiCall guid="${GUID_DO3}" apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction" name="Inner" testItemId="5" title="Inner"/></steps></clause></clauses></apiCall>`
            : `<apiCall guid="${GUID_DO3}" apiId="${apiId}" name="${shortApi}" testItemId="3" title="${shortApi}"/>`;
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="1" guid="${GUID_TC3}" registryId="tc-nest-known-${shortApi}" name="Nest Known ${shortApi}">
  <steps>
    <apiCall guid="${GUID_UWS3}" apiId="com.provar.plugins.forcedotcom.core.ui.UiWithScreen" name="Screen" testItemId="1">
      <clauses>
        <clause name="substeps" testItemId="2">
          <steps>
            ${inner}
          </steps>
        </clause>
      </clauses>
    </apiCall>
  </steps>
</testCase>`;
        const violations = runBestPractices(xml).violations;
        assert.equal(
          nestViolations(violations).length,
          0,
          `UI-NEST-STRUCT-001 must pass for a properly-nested ${shortApi}`
        );
        const apiUnknown = violations.filter((v) => v.rule_id === 'API-UNKNOWN-001');
        assert.equal(
          apiUnknown.length,
          0,
          `API-UNKNOWN-001 must not fire for ${shortApi} — apiId=${apiId} missing from VALID_API_IDS would be a contradictory finding`
        );
      });
    }
  });

  // ── UI-NITROX-CONNECT-ARGS-001 / UI-NITROX-VARIANT-ARG-001 — NitroX MS variants ──

  describe('NitroX MS variants (Dynamics 365 + Power Platform)', () => {
    const TC_GUID = '550e8400-e29b-41d4-a716-446655440100';
    const STEP_GUID = '550e8400-e29b-41d4-a716-446655440101';
    const NITROX_BASE = 'com.provar.plugins.forcedotcom.core.ui.NitroXConnect';

    function buildMsXml(args: { variant: string; extraArgs?: string; generatedParams?: string }): string {
      return `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="1" guid="${TC_GUID}" registryId="tc-ms" name="MS Test">
  <steps>
    <apiCall guid="${STEP_GUID}" apiId="${NITROX_BASE}:${
        args.variant
      }" name="NitroXConnect" testItemId="1" title="MS Connect">
      <arguments>
        <argument id="connectionName"><value class="value" valueClass="string">UiConn</value></argument>
        <argument id="resultName"><value class="value" valueClass="string">MSResult</value></argument>
        <argument id="resultScope"><value class="value" valueClass="string">Test</value></argument>
        ${args.extraArgs ?? ''}
      </arguments>
      ${args.generatedParams ?? ''}
    </apiCall>
  </steps>
</testCase>`;
    }

    function ruleViolations(violations: BPViolation[], ruleId: string): BPViolation[] {
      return violations.filter((v) => v.rule_id === ruleId);
    }

    it('API-UNKNOWN-001 does not fire for any of the four NitroX MS variants', () => {
      for (const variant of ['ms-dynamics365', 'ms-dataverse', 'ms-powerapp', 'ms-powerpage']) {
        const xml = buildMsXml({
          variant,
          extraArgs:
            variant === 'ms-dynamics365'
              ? '<argument id="appName"><value class="value" valueClass="string">Sales Hub</value></argument>'
              : variant === 'ms-powerapp'
              ? '<argument id="powerAppName"><value class="value" valueClass="string">App</value></argument>'
              : variant === 'ms-powerpage'
              ? '<argument id="environment"><value class="value" valueClass="string">Prod</value></argument>' +
                '<argument id="powerPageName"><value class="value" valueClass="string">Page</value></argument>'
              : '',
        });
        const violations = runBestPractices(xml).violations;
        const apiUnknown = ruleViolations(violations, 'API-UNKNOWN-001');
        assert.equal(apiUnknown.length, 0, `API-UNKNOWN-001 must not fire for ${variant}`);
        const variantMissing = ruleViolations(violations, 'UI-NITROX-VARIANT-ARG-001');
        assert.equal(
          variantMissing.length,
          0,
          `UI-NITROX-VARIANT-ARG-001 must not fire when args populated for ${variant}`
        );
      }
    });

    it('API-UNKNOWN-001 still fires for an unknown variant suffix (e.g. ms-bogus)', () => {
      const xml = buildMsXml({ variant: 'ms-bogus' });
      const apiUnknown = ruleViolations(runBestPractices(xml).violations, 'API-UNKNOWN-001');
      assert.ok(apiUnknown.length > 0, 'API-UNKNOWN-001 must fire for ms-bogus');
    });

    it('UI-NITROX-CONNECT-ARGS-001 fires when an ApexConnect-only arg (autoCleanup) is used on a NitroX MS step', () => {
      const xml = buildMsXml({
        variant: 'ms-dynamics365',
        extraArgs:
          '<argument id="appName"><value class="value" valueClass="string">Sales Hub</value></argument>' +
          '<argument id="autoCleanup"><value class="value" valueClass="boolean">true</value></argument>',
      });
      const v = ruleViolations(runBestPractices(xml).violations, 'UI-NITROX-CONNECT-ARGS-001');
      assert.ok(v.length > 0, 'UI-NITROX-CONNECT-ARGS-001 must fire for autoCleanup');
      assert.ok(
        v[0].message.includes('autoCleanup'),
        `expected message to reference autoCleanup, got: ${v[0].message}`
      );
    });

    it('UI-NITROX-CONNECT-ARGS-001 fires when a cross-variant arg (powerAppName) is used on ms-dynamics365', () => {
      const xml = buildMsXml({
        variant: 'ms-dynamics365',
        extraArgs:
          '<argument id="appName"><value class="value" valueClass="string">Sales</value></argument>' +
          '<argument id="powerAppName"><value class="value" valueClass="string">WrongApp</value></argument>',
      });
      const v = ruleViolations(runBestPractices(xml).violations, 'UI-NITROX-CONNECT-ARGS-001');
      assert.ok(v.length > 0, 'UI-NITROX-CONNECT-ARGS-001 must fire for cross-variant arg');
      assert.ok(
        v[0].message.includes('powerAppName'),
        `expected message to reference powerAppName, got: ${v[0].message}`
      );
    });

    it('UI-NITROX-VARIANT-ARG-001 fires when a required variant arg is missing AND no <generatedParameters> declares it', () => {
      const xml = buildMsXml({
        variant: 'ms-powerpage',
        extraArgs: '<argument id="powerPageName"><value class="value" valueClass="string">Page</value></argument>',
        // 'environment' deliberately absent + no generatedParameters
      });
      const v = ruleViolations(runBestPractices(xml).violations, 'UI-NITROX-VARIANT-ARG-001');
      assert.ok(v.length > 0, 'UI-NITROX-VARIANT-ARG-001 must fire when environment is missing');
      assert.ok(
        v[0].message.includes('environment'),
        `expected message to reference environment, got: ${v[0].message}`
      );
    });

    it('UI-NITROX-VARIANT-ARG-001 does NOT fire when the missing arg is declared as a runtime parameter (data-driven pattern)', () => {
      const xml = buildMsXml({
        variant: 'ms-powerpage',
        extraArgs: '<argument id="environment"/><argument id="powerPageName"/>',
        generatedParams: `<generatedParameters>
        <apiParam group="ui" name="environment" title="Environment"><type><textType/></type></apiParam>
        <apiParam group="ui" name="powerPageName" title="Power Page Name"><type><textType/></type></apiParam>
      </generatedParameters>`,
      });
      const v = ruleViolations(runBestPractices(xml).violations, 'UI-NITROX-VARIANT-ARG-001');
      assert.equal(
        v.length,
        0,
        `UI-NITROX-VARIANT-ARG-001 must not fire when generatedParameters declares the args; got: ${JSON.stringify(v)}`
      );
    });

    it('ms-dataverse has no variant-specific args and validates cleanly without extras', () => {
      const xml = buildMsXml({ variant: 'ms-dataverse' });
      const violations = runBestPractices(xml).violations;
      const nitroxIssues = violations.filter((v) => v.rule_id.startsWith('UI-NITROX-'));
      assert.equal(
        nitroxIssues.length,
        0,
        `ms-dataverse must validate without NitroX-specific violations; got: ${JSON.stringify(nitroxIssues)}`
      );
    });

    it('end-to-end: the canonical four-variant fixture has no NitroX-specific violations (data-driven pattern)', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const url = await import('node:url');
      const here = path.dirname(url.fileURLToPath(import.meta.url));
      const fixturePath = path.join(here, '..', '..', 'fixtures', 'ms-dynamics-connect.testcase');
      const xml = fs.readFileSync(fixturePath, 'utf-8');
      const violations = runBestPractices(xml).violations;
      const nitroxIssues = violations.filter(
        (v) => v.rule_id.startsWith('UI-NITROX-') || v.rule_id === 'API-UNKNOWN-001'
      );
      assert.equal(
        nitroxIssues.length,
        0,
        `canonical fixture must not emit NitroX/UNKNOWN violations; got: ${JSON.stringify(nitroxIssues, null, 2)}`
      );
    });
  });
});

// ── mustContainArgument validator (PDX-508) ──────────────────────────────────

describe('mustContainArgument validator', () => {
  const GUID_MCA_TC = '550e8400-e29b-41d4-a716-4466554409a0';
  const GUID_MCA_S1 = '550e8400-e29b-41d4-a716-4466554409a1';
  const GUID_MCA_S2 = '550e8400-e29b-41d4-a716-4466554409a2';

  // Build a single-step (or multi-step) test case from raw <apiCall> XML.
  function buildTc(stepsXml: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="tc-mca" guid="${GUID_MCA_TC}" registryId="tc-mca" name="MCA Test">
  <steps>
${stepsXml}
  </steps>
</testCase>`;
  }

  function find(violations: BPViolation[], ruleId: string): BPViolation | undefined {
    return violations.find((v) => v.rule_id === ruleId);
  }

  // CONTROL-IF-001 — If steps must have a 'condition' argument (critical / weight 8).
  const IF_API = 'com.provar.plugins.bundled.apis.If';

  it('fires when an If step is missing its required condition argument', () => {
    const xml = buildTc(`    <apiCall guid="${GUID_MCA_S1}" apiId="${IF_API}" name="If no condition" testItemId="1"/>`);
    const v = find(runBestPractices(xml).violations, 'CONTROL-IF-001');
    assert.ok(v, 'Expected CONTROL-IF-001 to fire for an If step with no condition');
    assert.equal(v?.severity, 'critical');
    assert.ok(v?.message.includes('condition'), `Message should name the argument: ${v?.message}`);
    assert.ok(v?.message.includes('testItemId=1'), `Message should locate the step: ${v?.message}`);
  });

  it('passes when the If step has a populated condition argument', () => {
    const xml = buildTc(`    <apiCall guid="${GUID_MCA_S1}" apiId="${IF_API}" name="If ok" testItemId="1">
      <arguments>
        <argument id="condition">
          <value class="value" valueClass="string">{{count}} == 1</value>
        </argument>
      </arguments>
    </apiCall>`);
    const v = find(runBestPractices(xml).violations, 'CONTROL-IF-001');
    assert.ok(!v, `Expected no CONTROL-IF-001 violation, got: ${v?.message}`);
  });

  it('fires when the required argument is present but an empty self-closing tag', () => {
    const xml = buildTc(`    <apiCall guid="${GUID_MCA_S1}" apiId="${IF_API}" name="If empty" testItemId="1">
      <arguments>
        <argument id="condition"/>
      </arguments>
    </apiCall>`);
    const v = find(runBestPractices(xml).violations, 'CONTROL-IF-001');
    assert.ok(v, 'Expected CONTROL-IF-001 to fire when condition has no <value>');
  });

  // ASSERT-COMPARISON-001 — AssertValues must have a 'comparisonType' argument.
  const ASSERT_API = 'com.provar.plugins.bundled.apis.AssertValues';

  it('emits a single violation per rule for multiple offenders and does not inflate count (score parity)', () => {
    // The Quality Hub back-end returns one violation per rule; omitting `count`
    // keeps the weighted-deduction score in parity with the Lambda.
    const xml = buildTc(`    <apiCall guid="${GUID_MCA_S1}" apiId="${ASSERT_API}" name="Assert A" testItemId="1"/>
    <apiCall guid="${GUID_MCA_S2}" apiId="${ASSERT_API}" name="Assert B" testItemId="2"/>`);
    const matches = runBestPractices(xml).violations.filter((v) => v.rule_id === 'ASSERT-COMPARISON-001');
    assert.equal(matches.length, 1, 'Expected exactly one ASSERT-COMPARISON-001 violation');
    assert.equal(matches[0].count, undefined, 'count must be unset so the score stays in parity with the back-end');
    assert.ok(matches[0].message.includes('and 0 more') === false);
    assert.ok(
      matches[0].message.includes('testItemId=1') && matches[0].message.includes('testItemId=2'),
      `Message should still name both offenders: ${matches[0].message}`
    );
  });

  it('fires for a disabled step missing the argument (back-end does not skip disabled steps)', () => {
    const xml = buildTc(`    <apiCall guid="${GUID_MCA_S1}" apiId="${IF_API}" name="If disabled" testItemId="1">
      <tags>
        <string>disabled</string>
      </tags>
    </apiCall>`);
    const v = find(runBestPractices(xml).violations, 'CONTROL-IF-001');
    assert.ok(v, 'A missing required argument is load-blocking even on a disabled step (matches the back-end)');
  });

  it('fires when the argument is present but its <value> element is empty (present-and-non-empty semantics)', () => {
    const xml = buildTc(`    <apiCall guid="${GUID_MCA_S1}" apiId="${IF_API}" name="If empty value" testItemId="1">
      <arguments>
        <argument id="condition"><value class="value" valueClass="string"/></argument>
      </arguments>
    </apiCall>`);
    const v = find(runBestPractices(xml).violations, 'CONTROL-IF-001');
    assert.ok(v, 'Expected CONTROL-IF-001 to fire for an empty <value/> (mirrors the back-end)');
  });

  it('passes when the condition is a variable reference with a <path> child', () => {
    const xml = buildTc(`    <apiCall guid="${GUID_MCA_S1}" apiId="${IF_API}" name="If variable" testItemId="1">
      <arguments>
        <argument id="condition"><value class="variable"><path element="isActive"/></value></argument>
      </arguments>
    </apiCall>`);
    const v = find(runBestPractices(xml).violations, 'CONTROL-IF-001');
    assert.ok(!v, `A variable reference with a <path> is a valid condition, got: ${v?.message}`);
  });

  it('fires for a bare <value class="variable"/> with no path or text (effectively empty)', () => {
    const xml = buildTc(`    <apiCall guid="${GUID_MCA_S1}" apiId="${IF_API}" name="If empty variable" testItemId="1">
      <arguments>
        <argument id="condition"><value class="variable"/></argument>
      </arguments>
    </apiCall>`);
    const v = find(runBestPractices(xml).violations, 'CONTROL-IF-001');
    assert.ok(v, 'A bare variable value with no path/text is treated as missing (mirrors the back-end)');
  });

  it('passes when the condition is a comparison-operator value (e.g. class="gt")', () => {
    const xml = buildTc(`    <apiCall guid="${GUID_MCA_S1}" apiId="${IF_API}" name="If gt" testItemId="1">
      <arguments>
        <argument id="condition"><value class="gt"><left/><right/></value></argument>
      </arguments>
    </apiCall>`);
    const v = find(runBestPractices(xml).violations, 'CONTROL-IF-001');
    assert.ok(!v, `A comparison-operator condition is valid, got: ${v?.message}`);
  });

  it('passes an If with no condition argument when the condition is carried in the title (legacy format)', () => {
    const xml = buildTc(
      `    <apiCall guid="${GUID_MCA_S1}" apiId="${IF_API}" name="Legacy If" title="If: {Count(Rows) > 0}" testItemId="1"/>`
    );
    const v = find(runBestPractices(xml).violations, 'CONTROL-IF-001');
    assert.ok(!v, `Legacy condition-in-title format should pass, got: ${v?.message}`);
  });

  it('does not fire for a different apiId that happens to lack the argument', () => {
    const xml = buildTc(
      `    <apiCall guid="${GUID_MCA_S1}" apiId="com.provar.plugins.bundled.apis.SwitchCase" name="Switch case" testItemId="1"/>`
    );
    const v = find(runBestPractices(xml).violations, 'CONTROL-IF-001');
    assert.ok(!v, 'CONTROL-IF-001 must only apply to If steps');
  });

  it('checks steps nested inside control-flow containers (recursive)', () => {
    const xml =
      buildTc(`    <apiCall guid="${GUID_MCA_S1}" apiId="com.provar.plugins.bundled.apis.control.ForEach" name="Loop" testItemId="1">
      <arguments>
        <argument id="list"><value class="value" valueClass="string">{{rows}}</value></argument>
        <argument id="valueName"><value class="value" valueClass="string">row</value></argument>
      </arguments>
      <clauses>
        <clause name="substeps" testItemId="2">
          <steps>
            <apiCall guid="${GUID_MCA_S2}" apiId="${IF_API}" name="Nested If" testItemId="3"/>
          </steps>
        </clause>
      </clauses>
    </apiCall>`);
    const v = find(runBestPractices(xml).violations, 'CONTROL-IF-001');
    assert.ok(v, 'Expected CONTROL-IF-001 to fire for an If nested inside a ForEach');
    assert.ok(v?.message.includes('testItemId=3'), `Message should locate the nested step: ${v?.message}`);
  });
});

describe('render / load-blocking validators (Tier 2)', () => {
  const GUID_T2_TC = '550e8400-e29b-41d4-a716-4466554408b0';
  const GUID_T2_S1 = '550e8400-e29b-41d4-a716-4466554408b1';
  const APEX_CONNECT = 'com.provar.plugins.forcedotcom.core.testapis.ApexConnect';
  const SET_VALUES = 'com.provar.plugins.bundled.apis.control.SetValues';

  // Wrap raw <apiCall> XML in a minimal, schema-valid test case.
  function buildTc(stepsXml: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="tc-t2" guid="${GUID_T2_TC}" registryId="tc-t2" name="Tier2 Test">
  <steps>
${stepsXml}
  </steps>
</testCase>`;
  }

  // Wrap a single <value> in an AssertValues argument (whole-tree validators don't need apiCall context).
  function buildValueStep(valueXml: string): string {
    return buildTc(`    <apiCall guid="${GUID_T2_S1}" apiId="com.provar.plugins.bundled.apis.AssertValues" name="Assert" testItemId="1">
      <arguments>
        <argument id="actualValue">${valueXml}</argument>
      </arguments>
    </apiCall>`);
  }

  function find(violations: BPViolation[], ruleId: string): BPViolation | undefined {
    return violations.find((v) => v.rule_id === ruleId);
  }

  // ── valueClassCasing (RENDER-CASE-001) ──────────────────────────────────────
  describe('valueClassCasing — RENDER-CASE-001', () => {
    it('fires when a known valueClass is spelled with wrong case', () => {
      const v = find(
        runBestPractices(buildValueStep('<value class="value" valueClass="Boolean">true</value>')).violations,
        'RENDER-CASE-001'
      );
      assert.ok(v, 'Expected RENDER-CASE-001 to fire for valueClass="Boolean"');
      assert.equal(v?.severity, 'critical');
      assert.ok(v?.message.includes("'boolean'"), `Message should suggest lowercase: ${v?.message}`);
    });

    it('passes when the valueClass is already lowercase', () => {
      const v = find(
        runBestPractices(buildValueStep('<value class="value" valueClass="boolean">true</value>')).violations,
        'RENDER-CASE-001'
      );
      assert.ok(!v, `Lowercase valueClass should pass, got: ${v?.message}`);
    });

    it('does not fire for class-attribute tokens used as a valueClass (e.g. FuncCall) — out of scope', () => {
      // funcCall/valueList/variable/operators are `class="..."` values, never `valueClass`
      // values, so they are not in the corpus-confirmed valueClass set and are not normalized.
      const v = find(
        runBestPractices(buildValueStep('<value class="value" valueClass="FuncCall">x</value>')).violations,
        'RENDER-CASE-001'
      );
      assert.ok(!v, 'valueClass="FuncCall" must NOT fire — funcCall is a class value, not a valueClass');
    });

    it('normalizes valueClass="ID" → "id" (id is a real corpus valueClass)', () => {
      const v = find(
        runBestPractices(buildValueStep('<value class="value" valueClass="ID">001x</value>')).violations,
        'RENDER-CASE-001'
      );
      assert.ok(v, 'Expected RENDER-CASE-001 to fire for valueClass="ID"');
      assert.ok(v?.message.includes("'id'"), `Message should suggest lowercase 'id': ${v?.message}`);
    });

    it('passes for camelCase dateTime and does not fire for already-correct id', () => {
      const r = runBestPractices(
        buildValueStep('<value class="value" valueClass="dateTime">1736899200000</value>')
      ).violations.find((x) => x.rule_id === 'RENDER-CASE-001');
      assert.ok(!r, 'valueClass="dateTime" is canonical and must pass');
    });
  });

  // ── booleanCasing (RENDER-BOOL-001) ─────────────────────────────────────────
  describe('booleanCasing — RENDER-BOOL-001', () => {
    it('fires for an uppercase boolean value', () => {
      const v = find(
        runBestPractices(buildValueStep('<value class="value" valueClass="boolean">True</value>')).violations,
        'RENDER-BOOL-001'
      );
      assert.ok(v, 'Expected RENDER-BOOL-001 to fire for "True"');
      assert.equal(v?.severity, 'critical');
    });

    it('passes for a lowercase boolean value', () => {
      const v = find(
        runBestPractices(buildValueStep('<value class="value" valueClass="boolean">false</value>')).violations,
        'RENDER-BOOL-001'
      );
      assert.ok(!v, `Lowercase boolean should pass, got: ${v?.message}`);
    });

    it('does not fire when the value is not a boolean valueClass', () => {
      const v = find(
        runBestPractices(buildValueStep('<value class="value" valueClass="string">True</value>')).violations,
        'RENDER-BOOL-001'
      );
      assert.ok(!v, 'Only valueClass="boolean" values are checked for boolean casing');
    });
  });

  // ── invalidValueClass (VALUE-CLASS-001) ─────────────────────────────────────
  describe('invalidValueClass — VALUE-CLASS-001', () => {
    it('fires for a hallucinated class like "null"', () => {
      const v = find(runBestPractices(buildValueStep('<value class="null"/>')).violations, 'VALUE-CLASS-001');
      assert.ok(v, 'Expected VALUE-CLASS-001 to fire for class="null"');
      assert.equal(v?.severity, 'critical');
      assert.ok(v?.message.includes('actualValue'), `Message should name the argument: ${v?.message}`);
    });

    it('fires for an invalid valueClass on a class="value" element', () => {
      const v = find(
        runBestPractices(buildValueStep('<value class="value" valueClass="money">1</value>')).violations,
        'VALUE-CLASS-001'
      );
      assert.ok(v, 'Expected VALUE-CLASS-001 to fire for valueClass="money"');
      assert.ok(v?.message.includes('valueClass'), `Message should call out the valueClass: ${v?.message}`);
    });

    it('passes for a valid class="value" valueClass="string"', () => {
      const v = find(
        runBestPractices(buildValueStep('<value class="value" valueClass="string">x</value>')).violations,
        'VALUE-CLASS-001'
      );
      assert.ok(!v, `A valid value class should pass, got: ${v?.message}`);
    });

    it('accepts class="invalid" (back-end hardcodes it in the valid set — parity)', () => {
      const v = find(runBestPractices(buildValueStep('<value class="invalid"/>')).violations, 'VALUE-CLASS-001');
      assert.ok(!v, 'class="invalid" is accepted by the back-end and must not fire here');
    });
  });

  // ── dateValueClassFormat (RENDER-DATE-VALUECLASS-001) ───────────────────────
  describe('dateValueClassFormat — RENDER-DATE-VALUECLASS-001', () => {
    it('fires for an ISO date string with valueClass="date"', () => {
      const v = find(
        runBestPractices(buildValueStep('<value class="value" valueClass="date">2025-01-15</value>')).violations,
        'RENDER-DATE-VALUECLASS-001'
      );
      assert.ok(v, 'Expected the date-format rule to fire for an ISO string');
      assert.equal(v?.severity, 'critical');
    });

    it('passes for an epoch-millis integer with valueClass="date"', () => {
      const v = find(
        runBestPractices(buildValueStep('<value class="value" valueClass="date">1736899200000</value>')).violations,
        'RENDER-DATE-VALUECLASS-001'
      );
      assert.ok(!v, `Epoch millis should pass, got: ${v?.message}`);
    });

    it('does not fire when the same string is stored as valueClass="string"', () => {
      const v = find(
        runBestPractices(buildValueStep('<value class="value" valueClass="string">2025-01-15</value>')).violations,
        'RENDER-DATE-VALUECLASS-001'
      );
      assert.ok(!v, 'Only date/dateTime valueClasses are checked for epoch format');
    });
  });

  // ── apexConnectReuseConnection (APEX-REUSE-CONN-001) ────────────────────────
  describe('apexConnectReuseConnection — APEX-REUSE-CONN-001', () => {
    it('fires when reuseConnectionName carries a non-empty value', () => {
      const xml = buildTc(`    <apiCall guid="${GUID_T2_S1}" apiId="${APEX_CONNECT}" name="Connect" testItemId="1">
      <arguments>
        <argument id="reuseConnectionName"><value class="value" valueClass="string">Reuse</value></argument>
      </arguments>
    </apiCall>`);
      const v = find(runBestPractices(xml).violations, 'APEX-REUSE-CONN-001');
      assert.ok(v, 'Expected APEX-REUSE-CONN-001 to fire for a non-empty reuseConnectionName');
      assert.equal(v?.severity, 'major');
    });

    it('passes when reuseConnectionName is left blank', () => {
      const xml = buildTc(`    <apiCall guid="${GUID_T2_S1}" apiId="${APEX_CONNECT}" name="Connect" testItemId="1">
      <arguments>
        <argument id="reuseConnectionName"/>
      </arguments>
    </apiCall>`);
      const v = find(runBestPractices(xml).violations, 'APEX-REUSE-CONN-001');
      assert.ok(!v, `A blank reuseConnectionName should pass, got: ${v?.message}`);
    });
  });

  // ── apexConnectValidArguments (APEX-CONNECT-ARGS-001) ───────────────────────
  describe('apexConnectValidArguments — APEX-CONNECT-ARGS-001', () => {
    it('fires for a hallucinated argument id', () => {
      const xml = buildTc(`    <apiCall guid="${GUID_T2_S1}" apiId="${APEX_CONNECT}" name="Connect" testItemId="1">
      <arguments>
        <argument id="connectionName"><value class="value" valueClass="string">SF</value></argument>
        <argument id="commandTimeout"><value class="value" valueClass="decimal">30</value></argument>
      </arguments>
    </apiCall>`);
      const v = find(runBestPractices(xml).violations, 'APEX-CONNECT-ARGS-001');
      assert.ok(v, 'Expected APEX-CONNECT-ARGS-001 to fire for commandTimeout');
      assert.equal(v?.severity, 'critical');
      assert.ok(v?.message.includes('commandTimeout'), `Message should name the bad arg: ${v?.message}`);
    });

    it('passes when all argument ids are in the whitelist', () => {
      const xml = buildTc(`    <apiCall guid="${GUID_T2_S1}" apiId="${APEX_CONNECT}" name="Connect" testItemId="1">
      <arguments>
        <argument id="connectionName"><value class="value" valueClass="string">SF</value></argument>
        <argument id="resultName"><value class="value" valueClass="string">conn</value></argument>
      </arguments>
    </apiCall>`);
      const v = find(runBestPractices(xml).violations, 'APEX-CONNECT-ARGS-001');
      assert.ok(!v, `All-valid arguments should pass, got: ${v?.message}`);
    });
  });

  // ── apexConnectConnectionIdValueClass (APEX-CONNECT-CONNID-001) ─────────────
  describe('apexConnectConnectionIdValueClass — APEX-CONNECT-CONNID-001', () => {
    it('fires when connectionId uses valueClass="string"', () => {
      const xml = buildTc(`    <apiCall guid="${GUID_T2_S1}" apiId="${APEX_CONNECT}" name="Connect" testItemId="1">
      <arguments>
        <argument id="connectionId"><value class="value" valueClass="string">default</value></argument>
      </arguments>
    </apiCall>`);
      const v = find(runBestPractices(xml).violations, 'APEX-CONNECT-CONNID-001');
      assert.ok(v, 'Expected APEX-CONNECT-CONNID-001 to fire for valueClass="string"');
      assert.equal(v?.severity, 'critical');
    });

    it('passes when connectionId uses valueClass="id"', () => {
      const xml = buildTc(`    <apiCall guid="${GUID_T2_S1}" apiId="${APEX_CONNECT}" name="Connect" testItemId="1">
      <arguments>
        <argument id="connectionId"><value class="value" valueClass="id">bce7fd3f-0f81-4c5c-ab68-c3edd44b5d1e</value></argument>
      </arguments>
    </apiCall>`);
      const v = find(runBestPractices(xml).violations, 'APEX-CONNECT-CONNID-001');
      assert.ok(!v, `valueClass="id" should pass, got: ${v?.message}`);
    });

    it('passes when connectionId is left empty', () => {
      const xml = buildTc(`    <apiCall guid="${GUID_T2_S1}" apiId="${APEX_CONNECT}" name="Connect" testItemId="1">
      <arguments>
        <argument id="connectionId"/>
      </arguments>
    </apiCall>`);
      const v = find(runBestPractices(xml).violations, 'APEX-CONNECT-CONNID-001');
      assert.ok(!v, `An empty connectionId should pass, got: ${v?.message}`);
    });
  });

  // ── setValuesInvalidElements (SETVALUES-INVALID-ELEMENT-001) ────────────────
  describe('setValuesInvalidElements — SETVALUES-INVALID-ELEMENT-001', () => {
    it('fires for hallucinated <namedValueSet>/<name> elements', () => {
      const xml = buildTc(`    <apiCall guid="${GUID_T2_S1}" apiId="${SET_VALUES}" name="Set" testItemId="1">
      <arguments>
        <argument id="values">
          <value class="valueList" mutable="Mutable">
            <namedValues mutable="Mutable">
              <namedValueSet>
                <name>LeadId</name>
                <value class="variable"><path element="x"/></value>
              </namedValueSet>
            </namedValues>
          </value>
        </argument>
      </arguments>
    </apiCall>`);
      const v = find(runBestPractices(xml).violations, 'SETVALUES-INVALID-ELEMENT-001');
      assert.ok(v, 'Expected SETVALUES-INVALID-ELEMENT-001 to fire for <namedValueSet>/<name>');
      assert.equal(v?.severity, 'critical');
    });

    it('passes for a correctly-structured SetValues step', () => {
      const xml = buildTc(`    <apiCall guid="${GUID_T2_S1}" apiId="${SET_VALUES}" name="Set" testItemId="1">
      <arguments>
        <argument id="values">
          <value class="valueList" mutable="Mutable">
            <namedValues mutable="Mutable">
              <namedValue name="valuePath"><value class="value" valueClass="string">MyVar</value></namedValue>
              <namedValue name="value"><value class="value" valueClass="string">1</value></namedValue>
              <namedValue name="valueScope"><value class="value" valueClass="string">Test</value></namedValue>
            </namedValues>
          </value>
        </argument>
      </arguments>
    </apiCall>`);
      const v = find(runBestPractices(xml).violations, 'SETVALUES-INVALID-ELEMENT-001');
      assert.ok(!v, `A correctly-structured SetValues step should pass, got: ${v?.message}`);
    });
  });
});

describe('back-end-only rules (Tier 4)', () => {
  const GUID_T4_TC = '550e8400-e29b-41d4-a716-4466554407c0';
  const GUID_T4_S1 = '550e8400-e29b-41d4-a716-4466554407c1';
  const APEX_CREATE = 'com.provar.plugins.forcedotcom.core.testapis.ApexCreateObject';
  const ASSERT_VALUES = 'com.provar.plugins.bundled.apis.AssertValues';
  const SET_VALUES = 'com.provar.plugins.bundled.apis.control.SetValues';
  const DB_CONNECT = 'com.provar.plugins.bundled.apis.db.DbConnect';
  const SQL_QUERY = 'com.provar.plugins.bundled.apis.db.SqlQuery';
  const UI_DO_ACTION = 'com.provar.plugins.forcedotcom.core.ui.UiDoAction';

  function buildTc(stepsXml: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="tc-t4" guid="${GUID_T4_TC}" registryId="tc-t4" name="Tier4 Test">
  <steps>
${stepsXml}
  </steps>
</testCase>`;
  }

  function find(violations: BPViolation[], ruleId: string): BPViolation | undefined {
    return violations.find((v) => v.rule_id === ruleId);
  }

  function countOf(violations: BPViolation[], ruleId: string): number {
    return violations.filter((v) => v.rule_id === ruleId).length;
  }

  // Wrap one <argument> around a raw <value> on an ApexCreateObject step (avoids triggering other Tier 4 rules).
  function buildArgStep(valueXml: string): string {
    return buildTc(`    <apiCall guid="${GUID_T4_S1}" apiId="${APEX_CREATE}" name="Create" testItemId="1">
      <arguments>
        <argument id="fieldValue">${valueXml}</argument>
      </arguments>
    </apiCall>`);
  }

  // ── numeric tag-value robustness (no .trim crash) ──────────────────────────
  describe('numeric <value> text does not crash the engine', () => {
    it('runs cleanly when a value element holds a bare number (parsed as a JS number)', () => {
      // fast-xml-parser yields a NUMBER for <value>123456</value>; a bare `.trim()`
      // on that previously threw "(...).trim is not a function" and turned real
      // validation into a VALIDATE_ERROR. nodeText coerces to string first.
      const xml = buildArgStep('<value class="value" valueClass="decimal">123456</value>');
      let result: ReturnType<typeof runBestPractices> | undefined;
      assert.doesNotThrow(() => {
        result = runBestPractices(xml);
      }, 'numeric tag value must not crash runBestPractices');
      assert.ok(result && typeof result.quality_score === 'number');
    });
  });

  // ── varStringLiteral (VAR-STRING-LITERAL-001) — multi-violation ─────────────
  describe('varStringLiteral — VAR-STRING-LITERAL-001', () => {
    it('fires for a {Var} stored as class="value" valueClass="string"', () => {
      const v = find(
        runBestPractices(buildArgStep('<value class="value" valueClass="string">{AccountId}</value>')).violations,
        'VAR-STRING-LITERAL-001'
      );
      assert.ok(v, 'Expected VAR-STRING-LITERAL-001 to fire for {AccountId}');
      assert.equal(
        v?.severity,
        'major',
        'a runtime execution error (the test still loads) — major, not minor/critical'
      );
    });

    it('emits one violation per offending value (back-end returns a list)', () => {
      const xml = buildTc(`    <apiCall guid="${GUID_T4_S1}" apiId="${APEX_CREATE}" name="Create" testItemId="1">
      <arguments>
        <argument id="a"><value class="value" valueClass="string">{AccountId}</value></argument>
        <argument id="b"><value class="value" valueClass="string">{Obj.Field}</value></argument>
      </arguments>
    </apiCall>`);
      assert.equal(
        countOf(runBestPractices(xml).violations, 'VAR-STRING-LITERAL-001'),
        2,
        'each offending value is its own violation'
      );
    });

    it('passes when the value is a proper class="variable" reference', () => {
      const v = find(
        runBestPractices(buildArgStep('<value class="variable"><path element="AccountId"/></value>')).violations,
        'VAR-STRING-LITERAL-001'
      );
      assert.ok(!v, `A class="variable" reference should pass, got: ${v?.message}`);
    });

    it('fires for UI-target args (sfUiTargetObjectId) — a bare {Var} is NOT interpolated there', () => {
      // Field evidence: a literal {AccountId} in sfUiTargetObjectId lands in the
      // URL as %7BAccountId%7D and the step hard-fails. The back-end exemption was
      // wrong; we removed it locally, so the rule must now fire.
      const xml = buildTc(`    <apiCall guid="${GUID_T4_S1}" apiId="${APEX_CREATE}" name="Create" testItemId="1">
      <arguments>
        <argument id="sfUiTargetObjectId"><value class="value" valueClass="string">{AccountId}</value></argument>
      </arguments>
    </apiCall>`);
      const v = find(runBestPractices(xml).violations, 'VAR-STRING-LITERAL-001');
      assert.ok(v, 'sfUiTargetObjectId must flag a bare {Var} literal — it is not interpolated at runtime');
      assert.equal(v?.severity, 'major');
    });

    it('still passes for binding-style {ns:key} expressions (the colon is excluded)', () => {
      const xml = buildTc(`    <apiCall guid="${GUID_T4_S1}" apiId="${APEX_CREATE}" name="Create" testItemId="1">
      <arguments>
        <argument id="sfUiTargetObjectId"><value class="value" valueClass="string">{targetUrl:object}</value></argument>
      </arguments>
    </apiCall>`);
      const v = find(runBestPractices(xml).violations, 'VAR-STRING-LITERAL-001');
      assert.ok(!v, 'binding-style {ns:key} is safe and must not be flagged');
    });

    it('does not fire when the surrounding text is more than a bare token', () => {
      const v = find(
        runBestPractices(buildArgStep('<value class="value" valueClass="string">Hello {Name}</value>')).violations,
        'VAR-STRING-LITERAL-001'
      );
      assert.ok(!v, 'only a whole-string {Token} is flagged, not embedded references');
    });
  });

  // ── dbConnectResultNameMismatch (CONN-DB-002) ──────────────────────────────
  describe('dbConnectResultNameMismatch — CONN-DB-002', () => {
    function dbStep(apiId: string, argId: string, value: string, tid: string): string {
      return `    <apiCall guid="${GUID_T4_S1}" apiId="${apiId}" name="${apiId.split('.').pop()}" testItemId="${tid}">
      <arguments>
        <argument id="${argId}"><value class="value" valueClass="string">${value}</value></argument>
      </arguments>
    </apiCall>`;
    }

    it('fires when a DB operation references a dbConnectionName that no DbConnect produced', () => {
      const xml = buildTc(
        `${dbStep(DB_CONNECT, 'resultName', 'SQLServer', '1')}\n${dbStep(
          SQL_QUERY,
          'dbConnectionName',
          'WrongName',
          '2'
        )}`
      );
      const v = find(runBestPractices(xml).violations, 'CONN-DB-002');
      assert.ok(v, 'Expected CONN-DB-002 to fire for a mismatched dbConnectionName');
      assert.equal(v?.severity, 'major');
      assert.ok(v?.message.includes('SQLServer'), `Message should name the valid resultName(s): ${v?.message}`);
    });

    it('passes when the dbConnectionName matches the DbConnect resultName', () => {
      const xml = buildTc(
        `${dbStep(DB_CONNECT, 'resultName', 'SQLServer', '1')}\n${dbStep(
          SQL_QUERY,
          'dbConnectionName',
          'SQLServer',
          '2'
        )}`
      );
      const v = find(runBestPractices(xml).violations, 'CONN-DB-002');
      assert.ok(!v, `A matching dbConnectionName should pass, got: ${v?.message}`);
    });

    it('does not fire when there is no DbConnect (delegated to CONN-DB-001)', () => {
      const xml = buildTc(dbStep(SQL_QUERY, 'dbConnectionName', 'SQLServer', '1'));
      const v = find(runBestPractices(xml).violations, 'CONN-DB-002');
      assert.ok(!v, 'with no DbConnect resultName the mismatch rule defers to CONN-DB-001');
    });
  });

  // ── setValuesFuncCallString (SETVALUES-FUNC-STR-001) ───────────────────────
  describe('setValuesFuncCallString — SETVALUES-FUNC-STR-001', () => {
    function setValuesStep(valueXml: string): string {
      return buildTc(`    <apiCall guid="${GUID_T4_S1}" apiId="${SET_VALUES}" name="Set" testItemId="1">
      <arguments>
        <argument id="values">
          <value class="valueList" mutable="Mutable">
            <namedValues mutable="Mutable">
              <namedValue name="value">${valueXml}</namedValue>
            </namedValues>
          </value>
        </argument>
      </arguments>
    </apiCall>`);
    }

    it('fires for a {Func(args)} string interpolation', () => {
      const v = find(
        runBestPractices(setValuesStep('<value class="value" valueClass="string">{Count(AccountList)}</value>'))
          .violations,
        'SETVALUES-FUNC-STR-001'
      );
      assert.ok(v, 'Expected SETVALUES-FUNC-STR-001 to fire for {Count(...)}');
      assert.equal(v?.severity, 'major');
    });

    it('passes when the value is a proper funcCall element', () => {
      const v = find(
        runBestPractices(
          setValuesStep(
            '<value class="funcCall" id="Count"><argument id="value"><value class="variable"><path element="AccountList"/></value></argument></value>'
          )
        ).violations,
        'SETVALUES-FUNC-STR-001'
      );
      assert.ok(!v, `A funcCall value should pass, got: ${v?.message}`);
    });
  });

  // ── setValuesZeroIndexString (SETVALUES-ZERO-IDX-001) ──────────────────────
  describe('setValuesZeroIndexString — SETVALUES-ZERO-IDX-001', () => {
    function setValuesStep(text: string): string {
      return buildTc(`    <apiCall guid="${GUID_T4_S1}" apiId="${SET_VALUES}" name="Set" testItemId="1">
      <arguments>
        <argument id="values">
          <value class="valueList" mutable="Mutable">
            <namedValues mutable="Mutable">
              <namedValue name="value"><value class="value" valueClass="string">${text}</value></namedValue>
            </namedValues>
          </value>
        </argument>
      </arguments>
    </apiCall>`);
    }

    it('fires for a [0] index in a string template', () => {
      const v = find(runBestPractices(setValuesStep('{AccountList[0].Name}')).violations, 'SETVALUES-ZERO-IDX-001');
      assert.ok(v, 'Expected SETVALUES-ZERO-IDX-001 to fire for [0]');
    });

    it('passes for a 1-indexed string template', () => {
      const v = find(runBestPractices(setValuesStep('{AccountList[1].Name}')).violations, 'SETVALUES-ZERO-IDX-001');
      assert.ok(!v, `A [1] index should pass, got: ${v?.message}`);
    });
  });

  // ── assertValuesStringExpr (ASSERT-STR-VAR-001) ────────────────────────────
  describe('assertValuesStringExpr — ASSERT-STR-VAR-001', () => {
    function assertStep(argId: string, valueXml: string): string {
      return buildTc(`    <apiCall guid="${GUID_T4_S1}" apiId="${ASSERT_VALUES}" name="Assert" testItemId="1">
      <arguments>
        <argument id="${argId}">${valueXml}</argument>
      </arguments>
    </apiCall>`);
    }

    it('fires when expectedValue is a {Var} string literal', () => {
      const v = find(
        runBestPractices(assertStep('expectedValue', '<value class="value" valueClass="string">{RowCount}</value>'))
          .violations,
        'ASSERT-STR-VAR-001'
      );
      assert.ok(v, 'Expected ASSERT-STR-VAR-001 to fire for a {RowCount} literal');
      assert.equal(v?.severity, 'major');
    });

    it('passes when the value is a proper class="variable" reference', () => {
      const v = find(
        runBestPractices(assertStep('expectedValue', '<value class="variable"><path element="RowCount"/></value>'))
          .violations,
        'ASSERT-STR-VAR-001'
      );
      assert.ok(!v, `A class="variable" reference should pass, got: ${v?.message}`);
    });

    it('does not fire for a plain literal that is not a brace expression', () => {
      const v = find(
        runBestPractices(assertStep('expectedValue', '<value class="value" valueClass="string">Acme</value>'))
          .violations,
        'ASSERT-STR-VAR-001'
      );
      assert.ok(!v, 'a literal value that is not a {…} expression is fine');
    });
  });

  // ── uiLocatorButtonCasing (UI-LOCATOR-BUTTON-CASING-001) ───────────────────
  describe('uiLocatorButtonCasing — UI-LOCATOR-BUTTON-CASING-001', () => {
    function uiStep(uri: string): string {
      return buildTc(`    <apiCall guid="${GUID_T4_S1}" apiId="${UI_DO_ACTION}" name="Click" testItemId="1">
      <arguments>
        <argument id="locator"><value class="uiLocator" uri="${uri}"/></argument>
      </arguments>
    </apiCall>`);
    }

    it('fires for the wrong-cased Cancel button (name=Cancel)', () => {
      const v = find(runBestPractices(uiStep('ui:locator?name=Cancel')).violations, 'UI-LOCATOR-BUTTON-CASING-001');
      assert.ok(v, 'Expected UI-LOCATOR-BUTTON-CASING-001 to fire for name=Cancel');
      assert.equal(v?.severity, 'major');
    });

    it('fires for name=Continue (record-type Continue needs name=save&path=selectRecordType)', () => {
      const v = find(runBestPractices(uiStep('ui:locator?name=Continue')).violations, 'UI-LOCATOR-BUTTON-CASING-001');
      assert.ok(v, 'Expected UI-LOCATOR-BUTTON-CASING-001 to fire for name=Continue');
    });

    it('passes for the correct lowercase name=cancel', () => {
      const v = find(runBestPractices(uiStep('ui:locator?name=cancel')).violations, 'UI-LOCATOR-BUTTON-CASING-001');
      assert.ok(!v, `name=cancel is correct and should pass, got: ${v?.message}`);
    });

    it('does not match a prefix (name=Cancelled must not fire)', () => {
      const v = find(runBestPractices(uiStep('ui:locator?name=Cancelled')).violations, 'UI-LOCATOR-BUTTON-CASING-001');
      assert.ok(!v, 'the name= boundary must not match a longer name');
    });
  });

  // ── uiLocatorRecordTypeField (UI-LOCATOR-RECORDTYPE-001) ───────────────────
  describe('uiLocatorRecordTypeField — UI-LOCATOR-RECORDTYPE-001', () => {
    function uiStep(uri: string): string {
      return buildTc(`    <apiCall guid="${GUID_T4_S1}" apiId="${UI_DO_ACTION}" name="Pick" testItemId="1">
      <arguments>
        <argument id="locator"><value class="uiLocator" uri="${uri}"/></argument>
      </arguments>
    </apiCall>`);
    }

    it('fires for name=recordTypeId', () => {
      const v = find(
        runBestPractices(uiStep('ui:locator?name=recordTypeId&amp;field=RecordTypeId')).violations,
        'UI-LOCATOR-RECORDTYPE-001'
      );
      assert.ok(v, 'Expected UI-LOCATOR-RECORDTYPE-001 to fire for name=recordTypeId');
      assert.equal(v?.severity, 'major');
    });

    it('fires for the lowercase name=recordType', () => {
      const v = find(runBestPractices(uiStep('ui:locator?name=recordType')).violations, 'UI-LOCATOR-RECORDTYPE-001');
      assert.ok(v, 'Expected UI-LOCATOR-RECORDTYPE-001 to fire for name=recordType');
    });

    it('passes for the correct name=RecordType', () => {
      const v = find(
        runBestPractices(uiStep('ui:locator?name=RecordType&amp;field=RecordTypeId')).violations,
        'UI-LOCATOR-RECORDTYPE-001'
      );
      assert.ok(!v, `name=RecordType is correct and should pass, got: ${v?.message}`);
    });
  });
});

describe('structural / load-affecting validators (Tier 5)', () => {
  const GUID_T5_TC = '550e8400-e29b-41d4-a716-4466554406d0';
  const GUID_T5_S1 = '550e8400-e29b-41d4-a716-4466554406d1';
  const SET_VALUES = 'com.provar.plugins.bundled.apis.control.SetValues';
  const UI_ASSERT = 'com.provar.plugins.forcedotcom.core.ui.UiAssert';
  const UI_DO_ACTION = 'com.provar.plugins.forcedotcom.core.ui.UiDoAction';
  const GENERIC = 'com.provar.plugins.forcedotcom.core.testapis.ApexExecute';

  function buildTc(stepsXml: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="tc-t5" guid="${GUID_T5_TC}" registryId="tc-t5" name="Tier5 Test">
  <steps>
${stepsXml}
  </steps>
</testCase>`;
  }

  function find(violations: BPViolation[], ruleId: string): BPViolation | undefined {
    return violations.find((v) => v.rule_id === ruleId);
  }

  // ── validFuncCallId (FUNCCALL-VALID-001) ───────────────────────────────────
  describe('validFuncCallId — FUNCCALL-VALID-001', () => {
    function funcStep(valueXml: string): string {
      return buildTc(`    <apiCall guid="${GUID_T5_S1}" apiId="${GENERIC}" name="Exec" testItemId="1">
      <arguments>
        <argument id="value">${valueXml}</argument>
      </arguments>
    </apiCall>`);
    }

    it('fires for a hallucinated funcCall id', () => {
      const v = find(
        runBestPractices(funcStep('<value class="funcCall" id="Concatenate"/>')).violations,
        'FUNCCALL-VALID-001'
      );
      assert.ok(v, 'Expected FUNCCALL-VALID-001 to fire for id="Concatenate"');
      assert.equal(v?.severity, 'major');
    });

    it('passes for a real Provar built-in (Count)', () => {
      const v = find(
        runBestPractices(funcStep('<value class="funcCall" id="Count"/>')).violations,
        'FUNCCALL-VALID-001'
      );
      assert.ok(!v, `id="Count" is valid and should pass, got: ${v?.message}`);
    });
  });

  // ── rootAttributes (RENDER-ROOT-001) ───────────────────────────────────────
  describe('rootAttributes — RENDER-ROOT-001', () => {
    it('fires when the root testCase carries an unknown attribute', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="tc-t5" guid="${GUID_T5_TC}" registryId="tc-t5" name="Tier5" bogusAttr="x"><steps/></testCase>`;
      const v = find(runBestPractices(xml).violations, 'RENDER-ROOT-001');
      assert.ok(v, 'Expected RENDER-ROOT-001 to fire for an unknown root attribute');
      assert.ok(v?.message.includes('bogusAttr'), `Message should name the bad attr: ${v?.message}`);
    });

    it('passes when the root has only known attributes', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testCase id="tc-t5" guid="${GUID_T5_TC}" registryId="tc-t5" name="Tier5" visibility="Public" failureBehaviour="Continue"><steps/></testCase>`;
      const v = find(runBestPractices(xml).violations, 'RENDER-ROOT-001');
      assert.ok(!v, `Only known root attrs should pass, got: ${v?.message}`);
    });
  });

  // ── setValuesStructure (SETVALUES-STRUCTURE-001) ───────────────────────────
  describe('setValuesStructure — SETVALUES-STRUCTURE-001', () => {
    it('fires for a SetValues step with no <namedValues> container', () => {
      const xml = buildTc(`    <apiCall guid="${GUID_T5_S1}" apiId="${SET_VALUES}" name="Set" testItemId="1">
      <arguments><argument id="values"><value class="valueList"/></argument></arguments>
    </apiCall>`);
      const v = find(runBestPractices(xml).violations, 'SETVALUES-STRUCTURE-001');
      assert.ok(v, 'Expected SETVALUES-STRUCTURE-001 to fire when <namedValues> is missing');
      assert.equal(v?.severity, 'critical');
    });

    it('passes when the SetValues step contains a <namedValues> container', () => {
      const xml = buildTc(`    <apiCall guid="${GUID_T5_S1}" apiId="${SET_VALUES}" name="Set" testItemId="1">
      <arguments><argument id="values"><value class="valueList"><namedValues><namedValue name="value"><value class="value" valueClass="string">1</value></namedValue></namedValues></value></argument></arguments>
    </apiCall>`);
      const v = find(runBestPractices(xml).violations, 'SETVALUES-STRUCTURE-001');
      assert.ok(!v, `A SetValues with <namedValues> should pass, got: ${v?.message}`);
    });
  });

  // ── namedValueName (SETVALUES-NAME-001) ────────────────────────────────────
  describe('namedValueName — SETVALUES-NAME-001', () => {
    it('fires when a namedValue lacks a name attribute', () => {
      const xml = buildTc(`    <apiCall guid="${GUID_T5_S1}" apiId="${SET_VALUES}" name="Set" testItemId="1">
      <arguments><argument id="values"><value class="valueList"><namedValues><namedValue><value class="value" valueClass="string">1</value></namedValue></namedValues></value></argument></arguments>
    </apiCall>`);
      const v = find(runBestPractices(xml).violations, 'SETVALUES-NAME-001');
      assert.ok(v, 'Expected SETVALUES-NAME-001 to fire for a nameless namedValue');
      assert.equal(v?.severity, 'critical');
    });

    it('passes when every namedValue has a name attribute', () => {
      const xml = buildTc(`    <apiCall guid="${GUID_T5_S1}" apiId="${SET_VALUES}" name="Set" testItemId="1">
      <arguments><argument id="values"><value class="valueList"><namedValues><namedValue name="value"><value class="value" valueClass="string">1</value></namedValue></namedValues></value></argument></arguments>
    </apiCall>`);
      const v = find(runBestPractices(xml).violations, 'SETVALUES-NAME-001');
      assert.ok(!v, `A named namedValue should pass, got: ${v?.message}`);
    });
  });

  // ── namedValueValue (SETVALUES-VALUE-001) ──────────────────────────────────
  describe('namedValueValue — SETVALUES-VALUE-001', () => {
    it('fires when a namedValue has no child <value>', () => {
      const xml = buildTc(`    <apiCall guid="${GUID_T5_S1}" apiId="${SET_VALUES}" name="Set" testItemId="1">
      <arguments><argument id="values"><value class="valueList"><namedValues><namedValue name="value"/></namedValues></value></argument></arguments>
    </apiCall>`);
      const v = find(runBestPractices(xml).violations, 'SETVALUES-VALUE-001');
      assert.ok(v, 'Expected SETVALUES-VALUE-001 to fire for a namedValue with no <value> child');
      assert.equal(v?.severity, 'critical');
    });

    it('passes when every namedValue has a child <value>', () => {
      const xml = buildTc(`    <apiCall guid="${GUID_T5_S1}" apiId="${SET_VALUES}" name="Set" testItemId="1">
      <arguments><argument id="values"><value class="valueList"><namedValues><namedValue name="value"><value class="value" valueClass="string">1</value></namedValue></namedValues></value></argument></arguments>
    </apiCall>`);
      const v = find(runBestPractices(xml).violations, 'SETVALUES-VALUE-001');
      assert.ok(!v, `A namedValue with a <value> child should pass, got: ${v?.message}`);
    });
  });

  // ── uiAssertHallucinatedGeneratedParameters (UI-ASSERT-STRUCT-002) ─────────
  describe('uiAssertHallucinatedGeneratedParameters — UI-ASSERT-STRUCT-002', () => {
    it('fires for a UiAssert step containing <generatedParameters>', () => {
      const xml = buildTc(`    <apiCall guid="${GUID_T5_S1}" apiId="${UI_ASSERT}" name="Assert" testItemId="1">
      <generatedParameters><apiParam name="foo"/></generatedParameters>
    </apiCall>`);
      const v = find(runBestPractices(xml).violations, 'UI-ASSERT-STRUCT-002');
      assert.ok(v, 'Expected UI-ASSERT-STRUCT-002 to fire for hallucinated generatedParameters');
      assert.equal(v?.severity, 'critical');
    });

    it('passes for a UiAssert step with no generatedParameters', () => {
      const xml = buildTc(`    <apiCall guid="${GUID_T5_S1}" apiId="${UI_ASSERT}" name="Assert" testItemId="1"/>`);
      const v = find(runBestPractices(xml).violations, 'UI-ASSERT-STRUCT-002');
      assert.ok(!v, `A UiAssert with no generatedParameters should pass, got: ${v?.message}`);
    });
  });

  // ── uiAssertMissingArguments (UI-ASSERT-STRUCT-001) ────────────────────────
  describe('uiAssertMissingArguments — UI-ASSERT-STRUCT-001', () => {
    it('fires for a UiAssert step missing required arguments', () => {
      const xml = buildTc(`    <apiCall guid="${GUID_T5_S1}" apiId="${UI_ASSERT}" name="Assert" testItemId="1">
      <arguments><argument id="resultName"/></arguments>
    </apiCall>`);
      const v = find(runBestPractices(xml).violations, 'UI-ASSERT-STRUCT-001');
      assert.ok(v, 'Expected UI-ASSERT-STRUCT-001 to fire when required args are missing');
      assert.equal(v?.severity, 'critical');
      assert.ok(v?.message.includes('fieldAssertions'), `Message should list a missing arg: ${v?.message}`);
    });

    it('passes when all required UiAssert arguments are present', () => {
      const args = [
        'fieldAssertions',
        'columnAssertions',
        'pageAssertions',
        'resultScope',
        'captureAfter',
        'beforeWait',
        'autoRetry',
      ]
        .map((a) => `<argument id="${a}"/>`)
        .join('');
      const xml = buildTc(`    <apiCall guid="${GUID_T5_S1}" apiId="${UI_ASSERT}" name="Assert" testItemId="1">
      <arguments>${args}</arguments>
    </apiCall>`);
      const v = find(runBestPractices(xml).violations, 'UI-ASSERT-STRUCT-001');
      assert.ok(!v, `All required args present should pass, got: ${v?.message}`);
    });
  });

  // ── bindingParameterOrder (UI-BINDING-ORDER-001) ───────────────────────────
  describe('bindingParameterOrder — UI-BINDING-ORDER-001', () => {
    function locStep(uri: string): string {
      return buildTc(`    <apiCall guid="${GUID_T5_S1}" apiId="${UI_DO_ACTION}" name="Click" testItemId="1">
      <arguments><argument id="locator"><value class="uiLocator" uri="${uri}"/></argument></arguments>
    </apiCall>`);
    }

    it('fires for an action-before-object binding order', () => {
      const v = find(
        runBestPractices(locStep('ui:locator?binding=object%3Faction%3DNEW%26object%3DAccount')).violations,
        'UI-BINDING-ORDER-001'
      );
      assert.ok(v, 'Expected UI-BINDING-ORDER-001 to fire for action-first order');
      assert.equal(
        v?.severity,
        'major',
        'wrong binding order errors at runtime (the test loads) — major, not critical'
      );
    });

    it('passes for the object-first binding order', () => {
      const v = find(
        runBestPractices(locStep('ui:locator?binding=object%3Fobject%3DAccount%26action%3DNEW')).violations,
        'UI-BINDING-ORDER-001'
      );
      assert.ok(!v, `object-first order should pass, got: ${v?.message}`);
    });

    it('does not fire for a locator with no binding= parameter', () => {
      const v = find(runBestPractices(locStep('ui:locator?name=save')).violations, 'UI-BINDING-ORDER-001');
      assert.ok(!v, 'a locator without a binding is out of scope for this rule');
    });
  });

  // ── uiConnectionNameLiteral (UI-CONN-LITERAL-001) ──────────────────────────
  describe('uiConnectionNameLiteral — UI-CONN-LITERAL-001', () => {
    function uiConnStep(valueXml: string): string {
      return buildTc(`    <apiCall guid="${GUID_T5_S1}" apiId="${UI_DO_ACTION}" name="Click" testItemId="1">
      <arguments><argument id="uiConnectionName">${valueXml}</argument></arguments>
    </apiCall>`);
    }

    it('fires when uiConnectionName is a variable reference', () => {
      const v = find(
        runBestPractices(uiConnStep('<value class="variable"><path element="ConnName"/></value>')).violations,
        'UI-CONN-LITERAL-001'
      );
      assert.ok(v, 'Expected UI-CONN-LITERAL-001 to fire for a variable uiConnectionName');
      assert.equal(v?.severity, 'critical');
    });

    it('passes when uiConnectionName is a literal string', () => {
      const v = find(
        runBestPractices(uiConnStep('<value class="value" valueClass="string">MyConnection</value>')).violations,
        'UI-CONN-LITERAL-001'
      );
      assert.ok(!v, `A literal uiConnectionName should pass, got: ${v?.message}`);
    });
  });
});
