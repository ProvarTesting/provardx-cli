import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { validateTestCase } from '../../../src/mcp/tools/testCaseValidate.js';

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
      const r = validateTestCase(
        `<testCase id="x" guid="${GUID_TC}" registryId="r"><steps/></testCase>`
      );
      assert.ok(r.issues.some((i) => i.rule_id === 'TC_001'), 'Expected TC_001');
      assert.equal(r.is_valid, false);
    });

    it('TC_002: flags malformed XML', () => {
      const r = validateTestCase('<?xml version="1.0"?><testCase id="x" unclosed');
      assert.ok(r.issues.some((i) => i.rule_id === 'TC_002'), 'Expected TC_002');
    });

    it('TC_003: flags wrong root element', () => {
      const r = validateTestCase('<?xml version="1.0"?><notTestCase/>');
      assert.ok(r.issues.some((i) => i.rule_id === 'TC_003'), 'Expected TC_003');
    });
  });

  describe('testCase attribute rules', () => {
    it('TC_010: flags missing id', () => {
      const r = validateTestCase(
        `<?xml version="1.0" encoding="UTF-8"?><testCase guid="${GUID_TC}" registryId="r"><steps/></testCase>`
      );
      assert.ok(r.issues.some((i) => i.rule_id === 'TC_010'), 'Expected TC_010');
    });

    it('TC_011: flags missing guid', () => {
      const r = validateTestCase(
        '<?xml version="1.0" encoding="UTF-8"?><testCase id="x" registryId="r"><steps/></testCase>'
      );
      assert.ok(r.issues.some((i) => i.rule_id === 'TC_011'), 'Expected TC_011');
    });

    it('TC_012: flags non-UUID-v4 guid', () => {
      const r = validateTestCase(
        '<?xml version="1.0" encoding="UTF-8"?><testCase id="x" guid="not-a-uuid" registryId="r"><steps/></testCase>'
      );
      assert.ok(r.issues.some((i) => i.rule_id === 'TC_012'), 'Expected TC_012');
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
      assert.ok(r.issues.some((i) => i.rule_id === 'TC_031'), 'Expected TC_031');
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
      assert.ok(r.issues.some((i) => i.rule_id === 'TC_035'), 'Expected TC_035');
    });
  });

  describe('score boundaries', () => {
    it('validity_score is never negative', () => {
      const r = validateTestCase('<?xml version="1.0"?><wrong/>');
      assert.ok(r.validity_score >= 0);
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
});
