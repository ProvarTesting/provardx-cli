// Construction-contract validation: confirm the construct/amend contract is
// reachable at every MCP protocol surface the LLM sees, and that the runtime
// guard rejects the multi-call construction shape.
//
// Description-contract pass (standard + compact schema modes): assertions on
// tools/list description bodies — every byte the LLM literally sees at the call
// site. Compact mode coverage is critical because PROVAR_MCP_SCHEMA_MODE=compact
// swaps the description for a short one-liner; if the contract isn't in that
// form, compact mode becomes a regression vector.
//
// Runtime-guard pass: drives a real tools/call with the rejected shape
// (steps:[] + dry_run:false + output_path) and asserts the response is a
// structured STEPS_REQUIRED error with a non-empty details.suggestion. This
// catches a regression that the description-pass assertions cannot reach: the
// passive contract surviving in the description while the active guard silently
// regresses (e.g. a refactor reorders the handler so writes happen before the
// check).
//
//   yarn compile
//   node scripts/construction-contract-validate.cjs

'use strict';

const fs = require('fs');
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
        clientInfo: { name: 'construction-contract-validate', version: '1.0.0' },
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
      'protects against the multi-call construction regression at call site'
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
      // Literal substring (not regex) — a regex match would false-positive on
      // hostile rewordings like "constructing...not via generate".
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
// The compact form must STILL carry the contract or PROVAR_MCP_SCHEMA_MODE=compact
// becomes a regression highway (the standard description is swapped out entirely).
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
      'compact generate.description does NOT regress to a contract-free one-liner',
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

// ── Runtime guard: tools/call assertion ─────────────────────────────────────
// Drives a real tools/call(provar_testcase_generate, ...) with the rejected
// shape (steps:[] + dry_run:false + output_path) and asserts the response is
// a structured STEPS_REQUIRED error. This is the only check that catches a
// silent regression where the passive description survives but the active
// runtime guard is removed or reordered after a side effect.
function runRuntimeGuardValidation() {
  return new Promise((resolve, reject) => {
    const server = spawn(process.execPath, [entry, 'mcp', 'start', '--allowed-paths', TMP, '--no-update-check'], {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env },
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

    const results = [];
    const record = (label, ok, detail) => {
      results.push({ label: `[runtime-guard] ${label}`, ok, detail });
    };

    (async () => {
      await rpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'construction-contract-validate-runtime', version: '1.0.0' },
      });

      // Use a unique tmp path so a leftover file from a prior run can't mask the assertion.
      const outPath = path.join(TMP, `construction-contract-validate-${Date.now()}.testcase`);
      try {
        if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
      } catch {
        /* best-effort */
      }

      const callRes = await rpc('tools/call', {
        name: 'provar_testcase_generate',
        arguments: {
          test_case_name: 'construction-contract validate',
          steps: [],
          dry_run: false,
          output_path: outPath,
        },
      });

      // MCP tools/call returns { result: { content: [{ type, text }], isError? } }.
      // The tool's error body is JSON-encoded in content[0].text.
      const result = callRes.result;
      record(
        'tools/call returned a result (no protocol-level error)',
        !!result && !callRes.error,
        callRes.error ? JSON.stringify(callRes.error).slice(0, 120) : 'protocol OK'
      );
      record(
        'result.isError === true (tool-level rejection)',
        result?.isError === true,
        `isError: ${String(result?.isError)} — rejection must surface at content level`
      );

      let body = null;
      try {
        body = JSON.parse(result?.content?.[0]?.text ?? '{}');
      } catch (parseErr) {
        record('content[0].text parses as JSON', false, parseErr.message);
      }
      record(
        'error_code === "STEPS_REQUIRED"',
        body?.error_code === 'STEPS_REQUIRED',
        `error_code: ${body?.error_code} — must match the documented code from docs/mcp.md`
      );
      record(
        'retryable === false',
        body?.retryable === false,
        'STEPS_REQUIRED is a contract violation — retrying with the same payload would never succeed'
      );
      record(
        'details.suggestion is a non-empty string',
        typeof body?.details?.suggestion === 'string' && body.details.suggestion.length > 0,
        'details.suggestion must tell the LLM how to self-correct (canonical multi-call rejection text)'
      );
      record(
        'details.suggestion mentions "FULL step tree"',
        typeof body?.details?.suggestion === 'string' && body.details.suggestion.includes('FULL step tree'),
        'suggestion must point the LLM at the single-call pattern'
      );
      record(
        'details.suggestion mentions dry_run=true escape hatch',
        typeof body?.details?.suggestion === 'string' && body.details.suggestion.includes('dry_run=true'),
        'suggestion must mention dry_run=true for legitimate skeleton-inspection callers'
      );
      record(
        'no file written at output_path (zero side effects)',
        !fs.existsSync(outPath),
        'STEPS_REQUIRED must run BEFORE fs.writeFileSync — no skeleton on disk'
      );

      server.stdin.end();
      resolve(results);
    })().catch((err) => {
      server.kill();
      reject(err);
    });
  });
}

(async () => {
  const standardResults = await runValidation('standard', {}, standardAssertions);
  // Explicitly null out the env var on the standard pass to ensure no leakage.
  // For compact, set PROVAR_MCP_SCHEMA_MODE=compact via the spawn env.
  const compactResults = await runValidation('compact', { PROVAR_MCP_SCHEMA_MODE: 'compact' }, compactAssertions);
  const runtimeGuardResults = await runRuntimeGuardValidation();

  const allResults = [...standardResults, ...compactResults, ...runtimeGuardResults];

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
  console.log(`\nConstruction-contract validation: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((err) => {
  console.error('Validation script error:', err);
  process.exit(2);
});
