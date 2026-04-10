/* eslint-disable camelcase */
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validateTestCase, registerTestCaseValidate } from '../../../src/mcp/tools/testCaseValidate.js';
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
