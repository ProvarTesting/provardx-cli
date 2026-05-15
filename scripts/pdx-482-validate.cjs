// PDX-482 validation: confirm the construct/amend contract is reachable at the
// MCP protocol surface. The LLM reads tools/list before every tool call, so
// every assertion here is on bytes the LLM literally sees at the call site.
//
//   yarn compile
//   node scripts/pdx-482-validate.cjs

'use strict';

const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const TMP = os.tmpdir();
const entry = path.resolve(__dirname, '..', 'bin', 'mcp-start.js');

const server = spawn(process.execPath, [entry, 'mcp', 'start', '--allowed-paths', TMP, '--no-update-check'], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

let nextId = 1;
const pending = new Map();
let buf = '';

server.stdout.on('data', (chunk) => {
  buf += chunk.toString('utf-8');
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      const cb = pending.get(msg.id);
      if (cb) {
        pending.delete(msg.id);
        cb(msg);
      }
    } catch {
      /* ignore */
    }
  }
});

function rpc(method, params) {
  const id = nextId++;
  const req = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timeout waiting for ${method}`));
      }
    }, 10000);
    server.stdin.write(req);
  });
}

const results = [];
function record(label, ok, detail) {
  results.push({ label, ok, detail });
}

(async () => {
  await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'pdx-482-validate', version: '1.0.0' },
  });

  const tools = await rpc('tools/list', {});
  const toolList = tools.result?.tools ?? [];

  // ── provar_testcase_generate tool description ─────────────────────────────
  const gen = toolList.find((t) => t.name === 'provar_testcase_generate');
  if (!gen) {
    record('provar_testcase_generate is registered', false, 'tool not found');
  } else {
    const d = gen.description ?? '';
    record(
      'generate.description leads with "Construction pattern"',
      /^[^.]*Construction pattern/.test(d),
      d.slice(0, 80)
    );
    record(
      'generate.description contains "single call"',
      d.includes('single call'),
      'protects against PDX-479 regression at call site'
    );
    record(
      'generate.description contains "FULL step tree"',
      d.includes('FULL step tree'),
      'instructs full payload in one call'
    );
    record(
      'generate.description contains "AMENDING"',
      d.includes('AMENDING'),
      'marks step_edit as amendment-only at the generate call site'
    );
    record(
      'generate.description rejects CONSTRUCTING via step_edit',
      /step_edit[^.]*not for CONSTRUCTING|CONSTRUCTING[^.]*not/i.test(d),
      'explicit rejection of the PDX-479 pattern'
    );
    record(
      'generate.description gives stop-and-assemble guidance',
      d.includes('stop and assemble') || d.includes('stop, and assemble'),
      'tells agents what to do when they catch themselves in the multi-call pattern'
    );

    const stepsField = gen.inputSchema?.properties?.steps;
    const fd = stepsField?.description ?? '';
    record(
      'generate.steps.description contains "COMPLETE step tree"',
      fd.includes('COMPLETE step tree'),
      'field-level contract'
    );
    record(
      'generate.steps.description contains "single call"',
      fd.includes('single call'),
      'field-level single-call reminder'
    );
    record(
      'generate.steps.description warns about amendments-only step_edit',
      fd.includes('amendments only') || fd.includes('for amendments'),
      'field-level amend-only warning'
    );
  }

  // ── provar_testcase_step_edit tool description ───────────────────────────
  const edit = toolList.find((t) => t.name === 'provar_testcase_step_edit');
  if (!edit) {
    record('provar_testcase_step_edit is registered', false, 'tool not found');
  } else {
    const d = edit.description ?? '';
    record(
      'step_edit.description self-identifies as AMENDMENT-ONLY',
      d.includes('AMENDMENT-ONLY') || d.includes('AMENDING'),
      'lead-in framing the LLM reads first'
    );
    record(
      'step_edit.description rejects construct-from-scratch usage',
      d.includes('NOT for constructing') || d.includes('not for constructing'),
      'explicit rejection at call site'
    );
    record(
      'step_edit.description points at provar_testcase_generate for new test cases',
      d.includes('provar_testcase_generate'),
      'tells LLM where to go instead'
    );
    record(
      'step_edit.description spells out the structural defects from misuse',
      d.includes('dropped scenarios') || d.includes('flat asserts') || d.includes('inconsistent step types'),
      'consequence is explicit so the contract is judgement-friendly'
    );
  }

  let pass = 0;
  let fail = 0;
  for (const r of results) {
    console.log(`${r.ok ? '[PASS]' : '[FAIL]'} ${r.label} — ${r.detail}`);
    if (r.ok) {
      pass++;
    } else {
      fail++;
    }
  }
  console.log(`\nPDX-482 validation: ${pass} passed, ${fail} failed`);

  server.stdin.end();
  process.exit(fail > 0 ? 1 : 0);
})().catch((err) => {
  console.error('Validation script error:', err);
  server.kill();
  process.exit(2);
});
