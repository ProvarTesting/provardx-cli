// Apples-to-apples token measurement: Provar MCP vs. Playwright MCP.
//
// Both servers expose tools/list via JSON-RPC stdio. This script drives each
// server with identical methodology — initialize → tools/list — and reports
// the catalog size (characters, approximate tokens at chars/4) plus a per-tool
// breakdown for the heaviest items.
//
// For Playwright MCP we additionally measure a representative tools/call:
// browser_snapshot on a sample page. That's the per-interaction cost that
// dominates Playwright MCP's 114K-per-test figure.
//
//   node scripts/token-measure-vs-playwright.cjs

'use strict';

const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const TMP = os.tmpdir();
const PROVAR_ENTRY = path.resolve(__dirname, '..', 'bin', 'mcp-start.js');

// ── Generic JSON-RPC stdio driver ───────────────────────────────────────────

function driveServer(name, command, args, env, onConnect) {
  return new Promise((resolve, reject) => {
    const server = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
      shell: process.platform === 'win32',
    });

    let nextId = 1;
    const pending = new Map();
    let buf = '';
    let stderrBuf = '';

    server.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString('utf-8');
    });

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
          /* non-JSON output — ignore */
        }
      }
    });

    server.on('error', (err) => {
      reject(new Error(`${name} spawn error: ${err.message}`));
    });

    const rpc = (method, params, timeoutMs = 30000) => {
      const id = nextId++;
      const req = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      return new Promise((rpcResolve, rpcReject) => {
        pending.set(id, rpcResolve);
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            rpcReject(new Error(`Timeout (${timeoutMs}ms) waiting for ${method} on ${name}`));
          }
        }, timeoutMs);
        server.stdin.write(req);
      });
    };

    (async () => {
      try {
        const result = await onConnect(rpc);
        server.stdin.end();
        // Allow a brief grace period for shutdown
        setTimeout(() => server.kill(), 500);
        resolve({ ...result, stderr: stderrBuf });
      } catch (err) {
        server.kill();
        reject(err);
      }
    })();
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function tokenize(jsonValue) {
  const s = JSON.stringify(jsonValue);
  return {
    chars: s.length,
    tokens: Math.round(s.length / 4),
  };
}

function reportCatalog(name, toolArr) {
  const { chars, tokens } = tokenize(toolArr);
  const perTool = toolArr.map((t) => {
    const sz = tokenize(t);
    return { name: t.name, ...sz, descChars: (t.description ?? '').length };
  });
  perTool.sort((a, b) => b.tokens - a.tokens);
  return {
    name,
    toolCount: toolArr.length,
    catalogChars: chars,
    catalogTokens: tokens,
    meanTokens: Math.round(tokens / Math.max(toolArr.length, 1)),
    topTools: perTool.slice(0, 5),
  };
}

// ── Provar MCP runner ───────────────────────────────────────────────────────

async function measureProvar(label, env) {
  return driveServer(
    `Provar MCP [${label}]`,
    process.execPath,
    [PROVAR_ENTRY, 'mcp', 'start', '--allowed-paths', TMP, '--no-update-check'],
    env,
    async (rpc) => {
      await rpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'token-compare', version: '1.0.0' },
      });
      const tools = await rpc('tools/list', {});
      return reportCatalog(`Provar MCP — ${label}`, tools.result?.tools ?? []);
    }
  );
}

// ── Playwright MCP runner ───────────────────────────────────────────────────

async function measurePlaywright(label, extraArgs = []) {
  return driveServer(`Playwright MCP [${label}]`, 'npx', ['-y', '@playwright/mcp', ...extraArgs], {}, async (rpc) => {
    await rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'token-compare', version: '1.0.0' },
    });
    const tools = await rpc('tools/list', {}, 60000);
    const report = reportCatalog(`Playwright MCP — ${label}`, tools.result?.tools ?? []);

    // Try to measure a representative tools/call too — browser_snapshot
    // against a simple page. This captures the per-interaction cost that
    // Playwright MCP charges on every step.
    try {
      await rpc('tools/call', { name: 'browser_navigate', arguments: { url: 'https://example.com' } }, 60000);
      const snap = await rpc('tools/call', { name: 'browser_snapshot', arguments: {} }, 60000);
      report.snapshotTokens = tokenize(snap.result).tokens;
      report.snapshotPage = 'example.com (simple page baseline)';
    } catch (err) {
      report.snapshotError = err.message;
    }
    return report;
  });
}

// ── Output formatting ───────────────────────────────────────────────────────

function fmtRow(s) {
  return `${s.name.padEnd(58)} ${String(s.toolCount).padStart(5)}  ${String(s.catalogTokens).padStart(7)}`;
}

(async () => {
  console.log('Apples-to-apples token measurement: Provar MCP vs. Playwright MCP\n');
  console.log('Methodology: spawn each server, send initialize → tools/list, count chars,');
  console.log('estimate tokens at ~4 chars/token. Numbers reflect what the MCP client');
  console.log('serializes and sends to the LLM as its tool catalog.\n');

  console.log('Measuring Provar MCP (3 configurations)...');
  const provarStandard = await measureProvar('STANDARD (all groups, full descriptions)', {});
  const provarCompact = await measureProvar('COMPACT (all groups, compact descriptions)', {
    PROVAR_MCP_SCHEMA_MODE: 'compact',
  });
  const provarAuthoring = await measureProvar('AUTHORING (compact + inspect/connection/validation/authoring only)', {
    PROVAR_MCP_SCHEMA_MODE: 'compact',
    PROVAR_MCP_TOOLS: 'authoring,inspect,connection,validation',
  });

  console.log('Measuring Playwright MCP (default / out-of-the-box)...');
  let pwDefault;
  try {
    pwDefault = await measurePlaywright('DEFAULT (out-of-the-box)');
  } catch (err) {
    console.error(`  ⚠ Playwright MCP measurement failed: ${err.message}`);
    pwDefault = null;
  }

  console.log('\n══════════════════════════════════════════════════════════════════════════════════');
  console.log(`Scenario                                                 Tools  ~Tokens`);
  console.log('══════════════════════════════════════════════════════════════════════════════════');
  console.log(fmtRow(provarStandard));
  console.log(fmtRow(provarCompact));
  console.log(fmtRow(provarAuthoring));
  if (pwDefault) console.log(fmtRow(pwDefault));
  console.log('══════════════════════════════════════════════════════════════════════════════════\n');

  if (pwDefault) {
    const ratioStd = (pwDefault.catalogTokens / provarStandard.catalogTokens).toFixed(2);
    const ratioCpt = (pwDefault.catalogTokens / provarCompact.catalogTokens).toFixed(2);
    const ratioAut = (pwDefault.catalogTokens / provarAuthoring.catalogTokens).toFixed(2);
    console.log('Tool-catalog ratio (Playwright MCP / Provar MCP):');
    console.log(`  vs Provar STANDARD :  ${ratioStd}× larger`);
    console.log(`  vs Provar COMPACT  :  ${ratioCpt}× larger`);
    console.log(`  vs Provar AUTHORING:  ${ratioAut}× larger\n`);

    if (pwDefault.snapshotTokens) {
      console.log(`Per-interaction cost (Playwright MCP — ${pwDefault.snapshotPage}):`);
      console.log(`  browser_snapshot response: ~${pwDefault.snapshotTokens} tokens`);
      console.log(`  (multiply by interactions per test to project the full session cost)`);
    } else if (pwDefault.snapshotError) {
      console.log(`Per-interaction measurement skipped: ${pwDefault.snapshotError}`);
    }
  }

  console.log('\nTop 5 most expensive tools — Provar MCP STANDARD:');
  for (const t of provarStandard.topTools) {
    console.log(`  ${t.name.padEnd(42)} ~${String(t.tokens).padStart(5)} tokens  (desc: ${t.descChars} chars)`);
  }

  if (pwDefault) {
    console.log('\nTop 5 most expensive tools — Playwright MCP DEFAULT:');
    for (const t of pwDefault.topTools) {
      console.log(`  ${t.name.padEnd(42)} ~${String(t.tokens).padStart(5)} tokens  (desc: ${t.descChars} chars)`);
    }
  }

  process.exit(0);
})().catch((err) => {
  console.error('\nMeasurement error:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
