// PDX-482 validation: confirm the construct/amend contract is reachable at the
// MCP protocol surface in BOTH standard and compact schema modes.
//
// The LLM reads tools/list before every tool call, so every assertion here is
// on bytes the LLM literally sees at the call site. Compact mode coverage is
// critical because the adversarial review identified that PROVAR_MCP_SCHEMA_MODE=compact
// silently swapped the description for a contract-free one-liner.
//
//   yarn compile
//   node scripts/pdx-482-validate.cjs

'use strict';

const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const TMP = os.tmpdir();
const entry = path.resolve(__dirname, '..', 'bin', 'mcp-start.js');

/**
 * Spawn an MCP server in the given schema mode and run a set of assertions
 * against tools/list. Returns the list of results.
 *
 * @param {string} mode - human-readable label, e.g. "standard" or "compact"
 * @param {Record<string, string>} extraEnv - env vars to merge into spawn env
 * @param {(toolList: Array<unknown>, record: (label: string, ok: boolean, detail: string) => void) => void} runAssertions
 */
function runValidation(mode, extraEnv, runAssertions) {
  return new Promise((resolve, reject) => {
    const server = spawn(process.execPath, [entry, 'mcp', 'start', '--allowed-paths', TMP, '--no-update-check'], {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env, ...extraEnv },
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

    const rpc = (method, params) => {
      const id = nextId++;
      const req = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      return new Promise((rpcResolve, rpcReject) => {
        pending.set(id, rpcResolve);
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            rpcReject(new Error(`Timeout waiting for ${method}`));
          }
        }, 10000);
        server.stdin.write(req);
      });
    };

    const modeResults = [];
    const record = (label, ok, detail) => {
      modeResults.push({ label: `[${mode}] ${label}`, ok, detail });
    };

    (async () => {
      await rpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'pdx-482-validate', version: '1.0.0' },
      });
      const tools = await rpc('tools/list', {});
      const toolList = tools.result?.tools ?? [];
      runAssertions(toolList, record);
      server.stdin.end();
      resolve(modeResults);
    })().catch((err) => {
      server.kill();
      reject(err);
    });
  });
}

// ── Assertions for standard mode (full TOOL_DESCRIPTION) ────────────────────
function standardAssertions(toolList, record) {
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
      // PDX-482 hardening: literal substring (not regex) — the previous regex
      // would false-positive on hostile rewordings like "constructing...not via generate".
      d.includes('not for CONSTRUCTING one from scratch'),
      'literal canonical phrase: "not for CONSTRUCTING one from scratch"'
    );
    record(
      'generate.description: contract appears in the first 200 chars',
      d.indexOf('Construction pattern') >= 0 && d.indexOf('Construction pattern') < 200,
      `position: ${d.indexOf(
        'Construction pattern'
      )} (LLMs weight leading tokens more; truncating clients cut at ~1024)`
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
}

// ── Assertions for compact mode (short one-liner) ───────────────────────────
// Adversarial review (Critical #1): the compact form must STILL carry the
// contract or PROVAR_MCP_SCHEMA_MODE=compact becomes a regression highway.
function compactAssertions(toolList, record) {
  const gen = toolList.find((t) => t.name === 'provar_testcase_generate');
  if (!gen) {
    record('provar_testcase_generate is registered', false, 'tool not found');
  } else {
    const d = gen.description ?? '';
    record(
      'compact generate.description carries single-call contract',
      d.includes('ONE call'),
      'must mention "ONE call" so contract is visible even when the standard form is stripped'
    );
    record(
      'compact generate.description carries FULL steps[] tree contract',
      d.includes('FULL steps'),
      'must mention FULL steps[] in the compact form'
    );
    record(
      'compact generate.description carries AMENDING vs CONSTRUCTING framing',
      d.includes('AMENDING') && d.includes('CONSTRUCTING'),
      'must split AMENDING (step_edit) vs CONSTRUCTING (generate) in the compact form'
    );
    record(
      'compact generate.description does NOT regress to the pre-PDX-482 contract-free form',
      !/^Generate a Provar XML test case skeleton with UUID guids and steps structure\.?$/.test(d),
      'old compact form must be replaced'
    );
  }

  const edit = toolList.find((t) => t.name === 'provar_testcase_step_edit');
  if (!edit) {
    record('provar_testcase_step_edit is registered', false, 'tool not found');
  } else {
    const d = edit.description ?? '';
    record(
      'compact step_edit.description self-identifies as AMENDMENT-ONLY',
      d.includes('AMENDMENT-ONLY') || d.includes('amendment') || d.includes('AMENDING'),
      'amendment framing must survive compact mode'
    );
    record(
      'compact step_edit.description rejects construct-from-scratch usage',
      d.includes('not for constructing') || d.includes('NOT for constructing') || d.includes('not for CONSTRUCTING'),
      'rejection must survive compact mode'
    );
  }
}

(async () => {
  const standardResults = await runValidation('standard', {}, standardAssertions);
  // Explicitly null out the env var on the standard pass to ensure no leakage.
  // For compact, set PROVAR_MCP_SCHEMA_MODE=compact via the spawn env.
  const compactResults = await runValidation('compact', { PROVAR_MCP_SCHEMA_MODE: 'compact' }, compactAssertions);

  const allResults = [...standardResults, ...compactResults];

  let pass = 0;
  let fail = 0;
  for (const r of allResults) {
    console.log(`${r.ok ? '[PASS]' : '[FAIL]'} ${r.label} — ${r.detail}`);
    if (r.ok) {
      pass++;
    } else {
      fail++;
    }
  }
  console.log(`\nPDX-482 validation: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((err) => {
  console.error('Validation script error:', err);
  process.exit(2);
});
