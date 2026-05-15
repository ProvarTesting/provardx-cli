// Authoring-guidance validation: confirm the author-test guidance (prompt +
// step-reference resource) is reachable and contains the canonical single-call
// construction copy. Runs without requiring sf CLI to be linked to the local
// plugin.
//
//   yarn compile
//   node scripts/authoring-guidance-validate.cjs

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
    }, 5000);
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
    clientInfo: { name: 'authoring-guidance-validate', version: '1.0.0' },
  });

  // The orchestration prompt must remain registered; the author-test flow
  // depends on it as the LLM's entry point.
  const orch = await rpc('prompts/get', {
    name: 'provar.guide.orchestration',
    arguments: { task: 'author-test' },
  });
  const text = orch.result?.messages?.[0]?.content?.text ?? '';

  record(
    'orchestration(author-test) is reachable',
    text.length > 0,
    text.length > 0 ? `received ${text.length} chars` : `no text returned`
  );

  // Canonical single-call construction copy
  const mustInclude = ['single call', 'ALL steps', 'amend'];
  for (const phrase of mustInclude) {
    const present = text.includes(phrase);
    record(
      `author-test includes "${phrase}"`,
      present,
      present ? `present` : `MISSING — fix would not stop the regression`
    );
  }

  // Multi-call construction anti-patterns
  const mustExclude = ['repeat per step'];
  for (const phrase of mustExclude) {
    const present = text.includes(phrase);
    record(`author-test excludes "${phrase}"`, !present, present ? `STILL PRESENT — regression risk` : `removed`);
  }

  // General orchestration flow's prerequisite graph
  const general = await rpc('prompts/get', {
    name: 'provar.guide.orchestration',
    arguments: {},
  });
  const gtext = general.result?.messages?.[0]?.content?.text ?? '';
  record(
    'prerequisite graph splits generate and step_edit',
    !gtext.includes('provar_testcase_generate OR provar_testcase_step_edit'),
    gtext.includes('provar_testcase_generate OR provar_testcase_step_edit')
      ? `STILL CONFLATED — fix incomplete`
      : `split confirmed`
  );

  // Tool-guide resource must serve content; LLMs read it when picking a tool.
  const guide = await rpc('resources/read', { uri: 'provar://docs/tool-guide' });
  const gcontent = guide.result?.contents?.[0]?.text ?? '';
  record(
    'tool-guide resource is reachable',
    gcontent.length > 0,
    gcontent.length > 0 ? `received ${gcontent.length} chars` : `not served`
  );
  record(
    'tool-guide author-test section recommends single call',
    gcontent.includes('single call') || gcontent.includes('one payload'),
    gcontent.includes('single call') || gcontent.includes('one payload')
      ? `recommended phrasing found`
      : `MISSING canonical phrasing in resource`
  );
  record(
    'tool-guide author-test section excludes "repeat per step"',
    !gcontent.includes('repeat per step'),
    gcontent.includes('repeat per step') ? `STILL PRESENT — regression risk` : `removed`
  );

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
  console.log(`\nAuthoring-guidance validation: ${pass} passed, ${fail} failed`);

  server.stdin.end();
  process.exit(fail > 0 ? 1 : 0);
})().catch((err) => {
  console.error('Validation script error:', err);
  server.kill();
  process.exit(2);
});
