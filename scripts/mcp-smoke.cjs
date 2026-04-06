// MCP smoke test — runs sf provar mcp start as a subprocess and exercises all tools via JSON-RPC
//
// PASS = JSON-RPC result received (tool responded; content may still contain an error code — that's fine)
// FAIL = JSON-RPC error (protocol-level: unknown method, missing required arg, server crash, timeout)
//
// Usage:  node scripts/mcp-smoke.cjs [2>$null]
// Note:   Run with stderr suppressed to avoid sf update warnings mixing into output.
//
// Env flags:
//   SMOKE_REQUEST_TIMEOUT_MS  Per-request timeout in ms (default: 30000)
//   SMOKE_OVERALL_TIMEOUT_MS  Hard deadline for the whole run in ms (default: 120000)
//   SMOKE_INCLUDE_SETUP       Set to "1" to include provar.automation.setup (may download
//                             binaries if no Provar install is found — disabled by default)

const { spawn } = require('child_process');
const readline = require('readline');
const os = require('os');
const path = require('path');

const TMP = os.tmpdir();
const REQUEST_TIMEOUT_MS = Number(process.env['SMOKE_REQUEST_TIMEOUT_MS'] ?? 30_000);
const OVERALL_TIMEOUT_MS = Number(process.env['SMOKE_OVERALL_TIMEOUT_MS'] ?? 120_000);
const INCLUDE_SETUP = process.env['SMOKE_INCLUDE_SETUP'] === '1';

// ----------------------------------------------------------------------------
// Server process
// ----------------------------------------------------------------------------
const server = spawn('sf', ['provar', 'mcp', 'start', '--allowed-paths', TMP], {
  stdio: ['pipe', 'pipe', 'inherit'],
  shell: true,
  env: {
    ...process.env,
    PROVAR_DEV_WHITELIST_KEYS: process.env.PROVAR_DEV_WHITELIST_KEYS || 'true',
  },
});

const rl = readline.createInterface({ input: server.stdout });
let msgId = 0;
const pending = new Map(); // id → { label, resolve, timer }
const results = [];

rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }

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
function rpc(label, method, params) {
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
  server.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n'
  );

  // ── 1. tools/list ─────────────────────────────────────────────────────────
  await send('tools/list', {});

  // ── 2. provardx.ping ──────────────────────────────────────────────────────
  await callTool('provardx.ping', { message: 'smoke-test' });

  // ── 3. provar.project.inspect ─────────────────────────────────────────────
  // TMP has no .testproject → structured "not a Provar project" response
  await callTool('provar.project.inspect', { project_path: TMP });

  // ── 4. provar.pageobject.generate (dry_run) ───────────────────────────────
  await callTool('provar.pageobject.generate', {
    class_name: 'AccountDetailPage',
    package_name: 'pageobjects.accounts',
    page_type: 'standard',
    dry_run: true,
  });

  // ── 5. provar.pageobject.validate ─────────────────────────────────────────
  await callTool('provar.pageobject.validate', {
    content: 'public class AccountDetailPage {}',
  });

  // ── 6. provar.testcase.generate (dry_run) ─────────────────────────────────
  await callTool('provar.testcase.generate', {
    test_case_name: 'Smoke Test Case',
    dry_run: true,
  });

  // ── 7. provar.testcase.validate ───────────────────────────────────────────
  await callTool('provar.testcase.validate', { content: '<testCase/>' });

  // ── 8. provar.testsuite.validate ──────────────────────────────────────────
  await callTool('provar.testsuite.validate', { suite_name: 'SmokeTestSuite' });

  // ── 9. provar.testplan.validate ───────────────────────────────────────────
  await callTool('provar.testplan.validate', { plan_name: 'SmokeTestPlan' });

  // ── 10. provar.project.validate ───────────────────────────────────────────
  // TMP is not a Provar project → PATH_NOT_FOUND or NOT_A_PROJECT result
  await callTool('provar.project.validate', { project_path: TMP });

  // ── 11. provar.properties.generate (dry_run) ──────────────────────────────
  await callTool('provar.properties.generate', {
    output_path: path.join(TMP, 'smoke-props.json'),
    dry_run: true,
  });

  // ── 12. provar.properties.read ────────────────────────────────────────────
  // Non-existent file → FILE_NOT_FOUND result
  await callTool('provar.properties.read', {
    file_path: path.join(TMP, 'nonexistent-props.json'),
  });

  // ── 13. provar.properties.set ─────────────────────────────────────────────
  // Non-existent file → FILE_NOT_FOUND result
  await callTool('provar.properties.set', {
    file_path: path.join(TMP, 'nonexistent-props.json'),
    updates: { stopOnError: true },
  });

  // ── 14. provar.properties.validate ───────────────────────────────────────
  // Empty JSON → validation issues about missing required fields
  await callTool('provar.properties.validate', { content: '{}' });

  // ── 15. provar.ant.generate (dry_run) ─────────────────────────────────────
  await callTool('provar.ant.generate', {
    provar_home: path.join(TMP, 'provar'),
    filesets: [{ dir: '../tests' }],
    dry_run: true,
  });

  // ── 16. provar.ant.validate ───────────────────────────────────────────────
  // Minimal XML — will have validation issues but not crash
  await callTool('provar.ant.validate', { content: '<project/>' });

  // ── 17. provar.qualityhub.connect ─────────────────────────────────────────
  // No real org → SF_NOT_FOUND or auth error result
  await callTool('provar.qualityhub.connect', { target_org: 'smoke-test-org' });

  // ── 18. provar.qualityhub.display ─────────────────────────────────────────
  await callTool('provar.qualityhub.display', {});

  // ── 19. provar.qualityhub.testrun ─────────────────────────────────────────
  await callTool('provar.qualityhub.testrun', { target_org: 'smoke-test-org' });

  // ── 20. provar.qualityhub.testrun.report ──────────────────────────────────
  await callTool('provar.qualityhub.testrun.report', {
    target_org: 'smoke-test-org',
    run_id: 'fake-run-id-000',
  });

  // ── 21. provar.qualityhub.testrun.abort ───────────────────────────────────
  await callTool('provar.qualityhub.testrun.abort', {
    target_org: 'smoke-test-org',
    run_id: 'fake-run-id-000',
  });

  // ── 22. provar.qualityhub.testcase.retrieve ───────────────────────────────
  await callTool('provar.qualityhub.testcase.retrieve', { target_org: 'smoke-test-org' });

  // ── 23. provar.qualityhub.defect.create ───────────────────────────────────
  await callTool('provar.qualityhub.defect.create', {
    run_id: 'fake-run-id-000',
    target_org: 'smoke-test-org',
  });

  // ── 24. provar.automation.setup ───────────────────────────────────────────
  // Skipped by default: when no Provar installation is found on the CI runner,
  // this tool downloads the full Provar binary (~200 MB), which is a destructive
  // side effect in a smoke test. Enable with SMOKE_INCLUDE_SETUP=1.
  if (INCLUDE_SETUP) {
    await callTool('provar.automation.setup', {});
  }

  // ── 25. provar.automation.metadata.download ───────────────────────────────
  await callTool('provar.automation.metadata.download', {});

  // ── 26. provar.automation.compile ─────────────────────────────────────────
  await callTool('provar.automation.compile', {});

  // ── 27. provar.automation.testrun ─────────────────────────────────────────
  await callTool('provar.automation.testrun', {});

  // ── 28. provar.automation.config.load ─────────────────────────────────────
  await callTool('provar.automation.config.load', {
    properties_path: path.join(TMP, 'nonexistent-props.json'),
  });

  // ── 29. provar.testrun.report.locate ─────────────────────────────────────
  // TMP is not a Provar project → RESULTS_NOT_CONFIGURED result
  await callTool('provar.testrun.report.locate', { project_path: TMP });

  // ── 30. provar.testrun.rca ───────────────────────────────────────────────
  await callTool('provar.testrun.rca', { project_path: TMP });

  // ── 31. provar.testplan.add-instance ─────────────────────────────────────
  // TMP is not a Provar project → NOT_A_PROJECT result
  await callTool('provar.testplan.add-instance', {
    project_path: TMP,
    test_case_path: 'tests/Smoke/SmokeTest.testcase',
    plan_name: 'SmokePlan',
  });

  // ── 32. provar.testplan.create-suite ─────────────────────────────────────
  await callTool('provar.testplan.create-suite', {
    project_path: TMP,
    plan_name: 'SmokePlan',
    suite_name: 'SmokeSuite',
  });

  // ── 33. provar.testplan.remove-instance ──────────────────────────────────
  await callTool('provar.testplan.remove-instance', {
    project_path: TMP,
    instance_path: 'plans/SmokePlan/SmokeSuite/smoke.testinstance',
  });

  server.stdin.end();
}

// ----------------------------------------------------------------------------
// Results
// ----------------------------------------------------------------------------
server.on('close', () => {
  clearTimeout(overallTimer);
  // initialize + tools/list + 32 tools (setup excluded from default count)
  const TOTAL_EXPECTED = 33 + (INCLUDE_SETUP ? 1 : 0);
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
    console.error(`WARNING: Only ${results.length} of ${TOTAL_EXPECTED} expected responses received — server may have crashed mid-run`);
  }

  process.exit(failed > 0 || results.length < TOTAL_EXPECTED ? 1 : 0);
});

server.on('error', (err) => {
  console.error('Failed to start MCP server:', err.message);
  process.exit(1);
});

// Give server 3 s to initialise, then run tests
setTimeout(runTests, 3000);
