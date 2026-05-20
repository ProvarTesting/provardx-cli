// MCP smoke test — runs sf provar mcp start as a subprocess and exercises all tools via JSON-RPC
//
// PASS = JSON-RPC result received (tool responded; content may still contain an error code — that's fine)
// FAIL = JSON-RPC error (protocol-level: unknown method, missing required arg, server crash, timeout)
//
// Usage:  node scripts/mcp-smoke.cjs [--profile <groups>] [2>$null]
//         --profile  Comma-separated list of tool groups to exercise (default: all groups).
//                    Group names match PROVAR_MCP_TOOLS values: nitrox, automation, qualityhub,
//                    validation, authoring, inspect, connection, rca.
//                    Example: node scripts/mcp-smoke.cjs --profile automation,qualityhub
// Note:   Run with stderr suppressed to avoid sf update warnings mixing into output.
//
// Env flags:
//   SMOKE_REQUEST_TIMEOUT_MS  Per-request timeout in ms (default: 30000)
//   SMOKE_OVERALL_TIMEOUT_MS  Hard deadline for the whole run in ms (default: 120000)
//   SMOKE_INCLUDE_SETUP       Set to "1" to include provar_automation_setup (may download
//                             binaries if no Provar install is found — disabled by default)

const { spawn } = require('child_process');
const readline = require('readline');
const os = require('os');
const path = require('path');

const TMP = os.tmpdir();
const REQUEST_TIMEOUT_MS = Number(process.env['SMOKE_REQUEST_TIMEOUT_MS'] ?? 30_000);
const OVERALL_TIMEOUT_MS = Number(process.env['SMOKE_OVERALL_TIMEOUT_MS'] ?? 120_000);
const INCLUDE_SETUP = process.env['SMOKE_INCLUDE_SETUP'] === '1';

// --profile flag: restrict which tool groups are exercised
const profileArg = (() => {
  const idx = process.argv.indexOf('--profile');
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  const eq = process.argv.find((a) => a.startsWith('--profile='));
  return eq ? eq.slice('--profile='.length) : null;
})();
const ACTIVE_GROUPS = profileArg
  ? new Set(
      profileArg
        .split(',')
        .map((g) => g.trim().toLowerCase())
        .filter(Boolean)
    )
  : null;

/** Returns true if the group should be exercised (profile includes it, or no profile set). */
function inGroup(group) {
  return ACTIVE_GROUPS === null || ACTIVE_GROUPS.has(group);
}

if (ACTIVE_GROUPS) {
  console.log(`Profile: [${[...ACTIVE_GROUPS].join(', ')}] — skipping other groups`);
}

// ----------------------------------------------------------------------------
// Server process
// ----------------------------------------------------------------------------
const server = spawn('sf', ['provar', 'mcp', 'start', '--allowed-paths', TMP], {
  stdio: ['pipe', 'pipe', 'inherit'],
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    PROVAR_DEV_WHITELIST_KEYS: process.env.PROVAR_DEV_WHITELIST_KEYS || '',
    ...(ACTIVE_GROUPS ? { PROVAR_MCP_TOOLS: [...ACTIVE_GROUPS].join(',') } : {}),
  },
});

const rl = readline.createInterface({ input: server.stdout });
let msgId = 0;
const pending = new Map(); // id → { label, resolve, timer }
const results = [];

rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  if (msg.id !== undefined && pending.has(msg.id)) {
    const { label, resolve, timer } = pending.get(msg.id);
    clearTimeout(timer);
    pending.delete(msg.id);
    const ok = !msg.error;
    results.push({ label, ok, data: msg.error || msg.result });
    resolve();
  }
});

// ----------------------------------------------------------------------------
// Overall hard deadline — kills the server so CI never hangs indefinitely
// ----------------------------------------------------------------------------
const overallTimer = setTimeout(() => {
  console.error(`\nFATAL: overall timeout of ${OVERALL_TIMEOUT_MS}ms exceeded — aborting`);
  // Mark every still-pending call as timed out
  for (const [, { label, resolve }] of pending) {
    results.push({ label, ok: false, data: { message: `overall timeout (${OVERALL_TIMEOUT_MS}ms)` } });
    resolve();
  }
  pending.clear();
  server.kill();
}, OVERALL_TIMEOUT_MS);
overallTimer.unref(); // don't prevent natural exit if tests finish early

// ----------------------------------------------------------------------------
// RPC helpers (with per-request timeout)
// ----------------------------------------------------------------------------
let expectedCount = 0;

function rpc(label, method, params) {
  expectedCount++;
  return new Promise((resolve) => {
    const id = ++msgId;
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      results.push({ label, ok: false, data: { message: `request timeout (${REQUEST_TIMEOUT_MS}ms)` } });
      console.error(`  TIMEOUT: ${label} did not respond within ${REQUEST_TIMEOUT_MS}ms`);
      server.kill(); // kill so the process exits rather than hanging
      resolve();
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { label, resolve, timer });
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

function send(method, params) {
  return rpc(method, method, params);
}

function callTool(name, args) {
  return rpc(name, 'tools/call', { name, arguments: args });
}

// ----------------------------------------------------------------------------
// Test runner
// ----------------------------------------------------------------------------
async function runTests() {
  // ── 0. Handshake ──────────────────────────────────────────────────────────
  await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'mcp-smoke', version: '1.0' },
  });
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');

  // ── 1. tools/list ─────────────────────────────────────────────────────────
  await send('tools/list', {});

  // ── 2. provardx_ping ──────────────────────────────────────────────────────
  await callTool('provardx_ping', { message: 'smoke-test' });

  // ── 3. provar_project_inspect ─────────────────────────────────────────────
  // TMP has no .testproject → structured "not a Provar project" response
  if (inGroup('inspect')) await callTool('provar_project_inspect', { project_path: TMP });

  // ── 4. provar_pageobject_generate (dry_run) ───────────────────────────────
  if (inGroup('authoring'))
    await callTool('provar_pageobject_generate', {
      class_name: 'AccountDetailPage',
      package_name: 'pageobjects.accounts',
      page_type: 'standard',
      dry_run: true,
    });

  // ── 5. provar_pageobject_validate ─────────────────────────────────────────
  if (inGroup('validation'))
    await callTool('provar_pageobject_validate', {
      content: 'public class AccountDetailPage {}',
    });

  // ── 6. provar_testcase_generate (dry_run) ─────────────────────────────────
  if (inGroup('authoring'))
    await callTool('provar_testcase_generate', {
      test_case_name: 'Smoke Test Case',
      dry_run: true,
    });

  // ── 6b. provar_testcase_generate STEPS_REQUIRED runtime guard ────────────
  // Drives the rejected shape (steps:[] + dry_run:false + output_path) so the
  // multi-call construction shape is exercised on every smoke run. The smoke
  // framework counts any JSON-RPC response as PASS; the assertion that the
  // body carries error_code='STEPS_REQUIRED' lives in
  // scripts/construction-contract-validate.cjs.
  if (inGroup('authoring'))
    await callTool('provar_testcase_generate', {
      test_case_name: 'STEPS_REQUIRED Guard Smoke',
      steps: [],
      dry_run: false,
      output_path: path.join(TMP, 'steps-required-smoke-rejected.testcase'),
    });

  // ── 7. provar_testcase_validate ───────────────────────────────────────────
  if (inGroup('validation')) await callTool('provar_testcase_validate', { content: '<testCase/>' });

  // ── 8. provar_testsuite_validate ──────────────────────────────────────────
  if (inGroup('validation')) await callTool('provar_testsuite_validate', { suite_name: 'SmokeTestSuite' });

  // ── 9. provar_testplan_validate ───────────────────────────────────────────
  if (inGroup('validation')) await callTool('provar_testplan_validate', { plan_name: 'SmokeTestPlan' });

  // ── 10. provar_project_validate ───────────────────────────────────────────
  // TMP is not a Provar project → PATH_NOT_FOUND or NOT_A_PROJECT result
  if (inGroup('validation')) await callTool('provar_project_validate', { project_path: TMP });

  // ── 11. provar_properties_generate (dry_run) ──────────────────────────────
  if (inGroup('validation'))
    await callTool('provar_properties_generate', {
      output_path: path.join(TMP, 'smoke-props.json'),
      dry_run: true,
    });

  // ── 12. provar_properties_read ────────────────────────────────────────────
  // Non-existent file → FILE_NOT_FOUND result
  if (inGroup('validation'))
    await callTool('provar_properties_read', {
      file_path: path.join(TMP, 'nonexistent-props.json'),
    });

  // ── 13. provar_properties_set ─────────────────────────────────────────────
  // Non-existent file → FILE_NOT_FOUND result
  if (inGroup('validation'))
    await callTool('provar_properties_set', {
      file_path: path.join(TMP, 'nonexistent-props.json'),
      updates: { stopOnError: true },
    });

  // ── 14. provar_properties_validate ───────────────────────────────────────
  // Empty JSON → validation issues about missing required fields
  if (inGroup('validation')) await callTool('provar_properties_validate', { content: '{}' });

  // ── 15. provar_ant_generate (dry_run) ─────────────────────────────────────
  if (inGroup('validation'))
    await callTool('provar_ant_generate', {
      provar_home: path.join(TMP, 'provar'),
      filesets: [{ dir: '../tests' }],
      dry_run: true,
    });

  // ── 16. provar_ant_validate ───────────────────────────────────────────────
  // Minimal XML — will have validation issues but not crash
  if (inGroup('validation')) await callTool('provar_ant_validate', { content: '<project/>' });

  // ── 17. provar_qualityhub_connect ─────────────────────────────────────────
  // No real org → SF_NOT_FOUND or auth error result
  if (inGroup('qualityhub')) await callTool('provar_qualityhub_connect', { target_org: 'smoke-test-org' });

  // ── 18. provar_qualityhub_display ─────────────────────────────────────────
  if (inGroup('qualityhub')) await callTool('provar_qualityhub_display', {});

  // ── 19. provar_qualityhub_testrun ─────────────────────────────────────────
  if (inGroup('qualityhub')) await callTool('provar_qualityhub_testrun', { target_org: 'smoke-test-org' });

  // ── 20. provar_qualityhub_testrun_report ──────────────────────────────────
  if (inGroup('qualityhub'))
    await callTool('provar_qualityhub_testrun_report', {
      target_org: 'smoke-test-org',
      run_id: 'fake-run-id-000',
    });

  // ── 21. provar_qualityhub_testrun_abort ───────────────────────────────────
  if (inGroup('qualityhub'))
    await callTool('provar_qualityhub_testrun_abort', {
      target_org: 'smoke-test-org',
      run_id: 'fake-run-id-000',
    });

  // ── 22. provar_qualityhub_testcase_retrieve ───────────────────────────────
  if (inGroup('qualityhub')) await callTool('provar_qualityhub_testcase_retrieve', { target_org: 'smoke-test-org' });

  // ── 23. provar_qualityhub_defect_create ───────────────────────────────────
  if (inGroup('qualityhub'))
    await callTool('provar_qualityhub_defect_create', {
      run_id: 'fake-run-id-000',
      target_org: 'smoke-test-org',
    });

  // ── 24. provar_automation_setup ───────────────────────────────────────────
  // Skipped by default: when no Provar installation is found on the CI runner,
  // this tool downloads the full Provar binary (~200 MB), which is a destructive
  // side effect in a smoke test. Enable with SMOKE_INCLUDE_SETUP=1.
  if (INCLUDE_SETUP && inGroup('automation')) {
    await callTool('provar_automation_setup', {});
  }

  // ── 25. provar_automation_metadata_download ───────────────────────────────
  if (inGroup('automation')) await callTool('provar_automation_metadata_download', {});

  // ── 26. provar_automation_compile ─────────────────────────────────────────
  if (inGroup('automation')) await callTool('provar_automation_compile', {});

  // ── 27. provar_automation_testrun ─────────────────────────────────────────
  if (inGroup('automation')) await callTool('provar_automation_testrun', {});

  // ── 28. provar_automation_config_load ─────────────────────────────────────
  if (inGroup('automation'))
    await callTool('provar_automation_config_load', {
      properties_path: path.join(TMP, 'nonexistent-props.json'),
    });

  // ── 29. provar_testrun_report_locate ─────────────────────────────────────
  // TMP is not a Provar project → RESULTS_NOT_CONFIGURED result
  if (inGroup('rca')) await callTool('provar_testrun_report_locate', { project_path: TMP });

  // ── 30. provar_testrun_rca ───────────────────────────────────────────────
  if (inGroup('rca')) await callTool('provar_testrun_rca', { project_path: TMP });

  // ── 31. provar_testplan_create ────────────────────────────────────────────
  // TMP is not a Provar project → NOT_A_PROJECT result
  if (inGroup('authoring'))
    await callTool('provar_testplan_create', {
      project_path: TMP,
      plan_name: 'SmokePlan',
    });

  // ── 32. provar_testplan_add-instance ─────────────────────────────────────
  // TMP is not a Provar project → NOT_A_PROJECT result
  if (inGroup('authoring'))
    await callTool('provar_testplan_add-instance', {
      project_path: TMP,
      test_case_path: 'tests/Smoke/SmokeTest.testcase',
      plan_name: 'SmokePlan',
    });

  // ── 33. provar_testplan_create-suite ─────────────────────────────────────
  if (inGroup('authoring'))
    await callTool('provar_testplan_create-suite', {
      project_path: TMP,
      plan_name: 'SmokePlan',
      suite_name: 'SmokeSuite',
    });

  // ── 34. provar_testplan_remove-instance ──────────────────────────────────
  if (inGroup('authoring'))
    await callTool('provar_testplan_remove-instance', {
      project_path: TMP,
      instance_path: 'plans/SmokePlan/SmokeSuite/smoke.testinstance',
    });

  // ── 35. provar_nitrox_discover ────────────────────────────────────────────
  // TMP has no .testproject → empty projects list, no crash
  if (inGroup('nitrox')) await callTool('provar_nitrox_discover', { search_roots: [TMP] });

  // ── 36. provar_nitrox_validate ────────────────────────────────────────────
  // Minimal valid root component → score 100
  if (inGroup('nitrox'))
    await callTool('provar_nitrox_validate', {
      content: JSON.stringify({
        componentId: '550e8400-e29b-41d4-a716-446655440000',
        name: '/com/smoke/SmokeComponent',
        type: 'Block',
        pageStructureElement: true,
        fieldDetailsElement: false,
      }),
    });

  // ── 36. provar_nitrox_generate (dry_run) ─────────────────────────────────
  if (inGroup('nitrox'))
    await callTool('provar_nitrox_generate', {
      name: '/com/smoke/SmokeComponent',
      tag_name: 'c-smoke',
      dry_run: true,
    });

  // ── 37. provar_nitrox_read ────────────────────────────────────────────────
  // Non-existent file → FILE_NOT_FOUND result (not a protocol error)
  if (inGroup('nitrox'))
    await callTool('provar_nitrox_read', {
      file_paths: [path.join(TMP, 'nonexistent.po.json')],
    });

  // ── 38. provar_nitrox_patch ───────────────────────────────────────────────
  // Non-existent file → FILE_NOT_FOUND result (not a protocol error)
  if (inGroup('nitrox'))
    await callTool('provar_nitrox_patch', {
      file_path: path.join(TMP, 'nonexistent.po.json'),
      patch: { name: '/com/smoke/Patched' },
    });

  // ── 39. provar_qualityhub_examples_retrieve ───────────────────────────────
  // No API key in CI → graceful degrade with warning, empty examples (isError: false)
  if (inGroup('qualityhub'))
    await callTool('provar_qualityhub_examples_retrieve', {
      query: 'As a sales rep I want to create an Opportunity in Salesforce',
      n: 3,
    });

  // ── 40. prompts/list ──────────────────────────────────────────────────────
  await send('prompts/list', {});

  // ── 41–43. provar.migrate.* prompts ──────────────────────────────────────
  await rpc('provar.migrate.crt (prompt)', 'prompts/get', {
    name: 'provar.migrate.crt',
    arguments: { source: 'Step 1: ClickText Accounts' },
  });
  await rpc('provar.migrate.selenium (prompt)', 'prompts/get', {
    name: 'provar.migrate.selenium',
    arguments: { source: 'driver.get("https://example.com")' },
  });
  await rpc('provar.migrate.playwright (prompt)', 'prompts/get', {
    name: 'provar.migrate.playwright',
    arguments: { source: 'await page.goto("https://example.com")' },
  });

  // ── 44–47. provar.loop.* prompts ─────────────────────────────────────────
  await rpc('provar.loop.generate (prompt)', 'prompts/get', {
    name: 'provar.loop.generate',
    arguments: { story: 'As a sales rep I want to close an opportunity so that revenue is recorded.' },
  });
  await rpc('provar.loop.fix (prompt)', 'prompts/get', {
    name: 'provar.loop.fix',
    arguments: {
      testcasePath: '/tmp/CloseOpportunity.testcase',
      rcaOutput: 'STEP FAILED: Click the Save button — element not found',
    },
  });
  await rpc('provar.loop.review (prompt)', 'prompts/get', {
    name: 'provar.loop.review',
    arguments: { testcasePath: '/tmp/CloseOpportunity.testcase' },
  });
  await rpc('provar.loop.coverage (prompt)', 'prompts/get', {
    name: 'provar.loop.coverage',
    arguments: { objectName: 'Opportunity', projectPath: '/tmp/provar-project' },
  });

  // ── 48. provar.loop.db prompt ─────────────────────────────────────────────
  await rpc('provar.loop.db (prompt)', 'prompts/get', {
    name: 'provar.loop.db',
    arguments: { story: 'Verify Users table has at least one Active record after Salesforce flow runs' },
  });

  // ── 49. provar.guide.onboarding prompt ───────────────────────────────────
  await rpc('provar.guide.onboarding (prompt)', 'prompts/get', {
    name: 'provar.guide.onboarding',
    arguments: { mode: 'local' },
  });

  // ── 50. provar.guide.troubleshoot prompt ──────────────────────────────────
  await rpc('provar.guide.troubleshoot (prompt)', 'prompts/get', {
    name: 'provar.guide.troubleshoot',
    arguments: { errorMessage: 'ClassNotFoundException: pageobjects.LoginPage' },
  });

  // ── 51. provar.guide.orchestration prompt ─────────────────────────────────
  await rpc('provar.guide.orchestration (prompt)', 'prompts/get', {
    name: 'provar.guide.orchestration',
    arguments: { task: 'run-local' },
  });

  // ── 52. provar_connection_list ────────────────────────────────────────────
  // TMP has no .testproject → CONNECTION_FILE_NOT_FOUND result (not a protocol error)
  if (inGroup('connection')) await callTool('provar_connection_list', { project_path: TMP });

  // ── 53. provar_testcase_step_edit ─────────────────────────────────────────
  // TMP/nonexistent.testcase does not exist → FILE_NOT_FOUND result
  if (inGroup('authoring'))
    await callTool('provar_testcase_step_edit', {
      test_case_path: path.join(TMP, 'nonexistent.testcase'),
      mode: 'remove',
      test_item_id: '1',
    });

  // ── 54. provar_org_describe — cache miss ─────────────────────────────────
  // TMP has no workspace at all → cache-miss response with details.suggestion
  if (inGroup('inspect'))
    await callTool('provar_org_describe', {
      project_path: TMP,
      connection_name: 'SmokeOrg',
      objects: ['Account'],
    });

  // ── 55. provar_org_describe — happy path ─────────────────────────────────
  // Set up a sibling workspace + .metadata/<connection> with one fake object.
  if (inGroup('inspect')) {
    const fs = require('fs');
    const orgProject = path.join(TMP, 'org-describe-smoke-project');
    fs.mkdirSync(orgProject, { recursive: true });
    const cxnDir = path.join(TMP, 'workspace-org-describe-smoke-project', '.metadata', 'SmokeOrg');
    fs.mkdirSync(cxnDir, { recursive: true });
    fs.writeFileSync(
      path.join(cxnDir, 'Account.json'),
      JSON.stringify({
        name: 'Account',
        fields: [{ name: 'Name', type: 'string', defaultValue: null, nillable: false }],
      })
    );
    await callTool('provar_org_describe', {
      project_path: orgProject,
      connection_name: 'SmokeOrg',
    });
  }

  server.stdin.end();
}

// ----------------------------------------------------------------------------
// Results
// ----------------------------------------------------------------------------
server.on('close', () => {
  clearTimeout(overallTimer);
  const TOTAL_EXPECTED = expectedCount;
  let passed = 0;
  let failed = 0;

  results.forEach((r) => {
    const status = r.ok ? '[PASS]' : '[FAIL]';
    const summary = r.ok
      ? JSON.stringify(r.data).slice(0, 200)
      : (r.data?.message || JSON.stringify(r.data) || '').slice(0, 200);
    console.log(`${status} ${r.label}: ${summary}`);
    r.ok ? passed++ : failed++;
  });

  console.log(`\n${passed} passed, ${failed} failed (${results.length}/${TOTAL_EXPECTED} responses received)`);

  if (results.length < TOTAL_EXPECTED) {
    console.error(
      `WARNING: Only ${results.length} of ${TOTAL_EXPECTED} expected responses received — server may have crashed mid-run`
    );
  }

  process.exit(failed > 0 || results.length < TOTAL_EXPECTED ? 1 : 0);
});

server.on('error', (err) => {
  console.error('Failed to start MCP server:', err.message);
  process.exit(1);
});

// Give server 3 s to initialise, then run tests
setTimeout(runTests, 3000);
