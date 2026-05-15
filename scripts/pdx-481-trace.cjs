// PDX-481 prompt-flow trace.
//
// Drives the patched MCP server over JSON-RPC stdio and captures the EXACT
// bytes that an MCP client (Claude Desktop / Cursor / etc.) would surface to
// its LLM at every decision point in the test-authoring flow:
//
//   1. The orchestration prompt the LLM reads when planning ("I want to author a new test case")
//   2. The tool-guide resource the LLM reads when picking the right tool
//   3. The provar_testcase_generate tool description the LLM reads at the call site
//   4. The provar_testcase_step_edit tool description (amend-only contract)
//   5. The actual XML the tool emits when given a real multi-scenario payload
//
// Run from the worktree root after `yarn compile`:
//   node scripts/pdx-481-trace.cjs

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
      /* ignore non-JSON */
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

function divider(label) {
  console.log('\n' + '═'.repeat(78));
  console.log('  ' + label);
  console.log('═'.repeat(78));
}

function subdivider(label) {
  console.log('\n' + '─'.repeat(78));
  console.log('  ' + label);
  console.log('─'.repeat(78));
}

function indent(text, prefix = '    ') {
  return text
    .split('\n')
    .map((l) => prefix + l)
    .join('\n');
}

function extractSection(text, headerRegex, nextHeaderRegex) {
  const startMatch = headerRegex.exec(text);
  if (!startMatch) return '<section not found>';
  const start = startMatch.index;
  const tail = text.slice(start);
  const endMatch = nextHeaderRegex.exec(tail.slice(headerRegex.source.length));
  return endMatch ? tail.slice(0, endMatch.index + headerRegex.source.length) : tail;
}

(async () => {
  await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'pdx-481-trace', version: '1.0.0' },
  });

  // ── 1. The orchestration prompt's author-test flow ────────────────────────
  divider('TRACE 1 — what the LLM reads when "planning a test-case authoring task"');
  console.log('Tool call simulated: prompts/get(provar.guide.orchestration, task=author-test)');
  console.log('This is what an MCP client surfaces to the LLM as the planning brief.\n');

  const orch = await rpc('prompts/get', {
    name: 'provar.guide.orchestration',
    arguments: { task: 'author-test' },
  });
  const orchText = orch.result?.messages?.[0]?.content?.text ?? '<empty>';
  console.log(indent(orchText));

  // ── 2. The tool-guide resource ────────────────────────────────────────────
  divider('TRACE 2 — what the LLM reads when "picking the right tool to author a test"');
  console.log('Tool call simulated: resources/read(provar://docs/tool-guide)');
  console.log('Excerpting the "I want to write a new test" section only.\n');

  const guide = await rpc('resources/read', { uri: 'provar://docs/tool-guide' });
  const guideText = guide.result?.contents?.[0]?.text ?? '<empty>';
  const section = extractSection(guideText, /## "I want to write a new test"/, /\n## "/);
  console.log(indent(section));

  // ── 3. The provar_testcase_generate tool description ──────────────────────
  divider('TRACE 3 — what the LLM reads at the call site of provar_testcase_generate');
  console.log('Tool call simulated: tools/list (filtered to provar_testcase_generate)');
  console.log('First 1000 chars of the description string surfaced to the model.\n');

  const tools = await rpc('tools/list', {});
  const toolList = tools.result?.tools ?? [];
  const gen = toolList.find((t) => t.name === 'provar_testcase_generate');
  console.log(
    indent(
      (gen?.description ?? '<not found>').slice(0, 1000) + (gen?.description?.length > 1000 ? '… (truncated)' : '')
    )
  );

  subdivider('steps[] field description (read by the LLM when filling the argument)');
  const stepsField = gen?.inputSchema?.properties?.steps;
  console.log(indent(stepsField?.description ?? '<no field description>'));

  // ── 4. The provar_testcase_step_edit tool description ─────────────────────
  divider('TRACE 4 — what the LLM reads at the call site of provar_testcase_step_edit');
  console.log('Tool call simulated: tools/list (filtered to provar_testcase_step_edit)\n');

  const edit = toolList.find((t) => t.name === 'provar_testcase_step_edit');
  console.log(
    indent(
      (edit?.description ?? '<not found>').slice(0, 1000) + (edit?.description?.length > 1000 ? '… (truncated)' : '')
    )
  );

  // ── 5. Real tool call — multi-scenario single-call generate ───────────────
  divider('TRACE 5 — real tool call: provar_testcase_generate with a 3-scenario payload');
  console.log("Tool call simulated: an LLM that follows TRACE 1-3's guidance constructs");
  console.log('the full step tree and passes it in ONE call. We capture the output:\n');

  const callResult = await rpc('tools/call', {
    name: 'provar_testcase_generate',
    arguments: {
      // eslint-disable-next-line camelcase
      test_case_name: 'AccountFlow',
      steps: [
        // Scenario 1 — Create Account
        { api_id: 'UiConnect', name: 'Salesforce Connect: AdminOauth', attributes: {} },
        {
          api_id: 'SetValues',
          name: 'Set Account Test Data',
          attributes: { AccountName: 'Acme', AccountPhone: '555-0100' },
        },
        { api_id: 'UiNavigate', name: 'Scenario 1 - When: navigate to Account home', attributes: {} },
        { api_id: 'UiDoAction', name: 'Scenario 1 - When: click New', attributes: {} },
        {
          api_id: 'SetValues',
          name: 'Scenario 1 - When: fill form',
          attributes: { Name: '{AccountName}', Phone: '{AccountPhone}' },
        },
        { api_id: 'UiDoAction', name: 'Scenario 1 - When: click Save', attributes: {} },
        // Scenario 2 — Verify on list view (the scenario that went missing on 1.5.0)
        { api_id: 'UiNavigate', name: 'Scenario 2 - Then: go to Account list', attributes: {} },
        {
          api_id: 'AssertValues',
          name: 'Scenario 2 - Then: assert Name on list',
          attributes: { expectedValue: '{AccountName}', actualValue: 'Name', comparisonType: 'EqualTo' },
        },
        {
          api_id: 'AssertValues',
          name: 'Scenario 2 - Then: assert Phone on list',
          attributes: { expectedValue: '{AccountPhone}', actualValue: 'Phone', comparisonType: 'EqualTo' },
        },
        // Scenario 3 — Open detail and assert all
        { api_id: 'UiDoAction', name: 'Scenario 3 - When: open Account detail', attributes: {} },
        {
          api_id: 'AssertValues',
          name: 'Scenario 3 - Then: assert Name on detail',
          attributes: { expectedValue: '{AccountName}', actualValue: 'Name', comparisonType: 'EqualTo' },
        },
        {
          api_id: 'AssertValues',
          name: 'Scenario 3 - Then: assert Phone on detail',
          attributes: { expectedValue: '{AccountPhone}', actualValue: 'Phone', comparisonType: 'EqualTo' },
        },
      ],
      dry_run: true,
      overwrite: false,
    },
  });

  const content = callResult.result?.content?.[0]?.text ?? '{}';
  const body = JSON.parse(content);

  subdivider('Tool response — top-level fields');
  console.log(indent(`step_count: ${body.step_count}`));
  console.log(indent(`written:    ${body.written}`));
  console.log(indent(`is_valid:   ${body.validation?.is_valid}`));
  console.log(indent(`validity:   ${body.validation?.validity_score}`));
  console.log(indent(`quality:    ${body.validation?.quality_score}`));
  console.log(indent(`errors:     ${body.validation?.error_count}`));

  subdivider('Generated XML — assertions a reviewer can run by eye');
  const xml = body.xml_content;

  const checks = [
    [
      'Sequential testItemIds 1..12, no gaps',
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every((n) => xml.includes(`testItemId="${n}"`)),
    ],
    ['No spurious testItemId="13"', !xml.includes('testItemId="13"')],
    ['Scenario 1 - When marker present', xml.includes('Scenario 1 - When: navigate to Account home')],
    ['Scenario 2 - Then marker present (the one 1.5.0 dropped)', xml.includes('Scenario 2 - Then: go to Account list')],
    ['Scenario 3 - When marker present', xml.includes('Scenario 3 - When: open Account detail')],
    ['All 4 AssertValues steps emitted', (xml.match(/AssertValues/g) ?? []).length >= 4],
    ['No silent UiAssert substitution', !xml.includes('com.provar.plugins.forcedotcom.core.ui.UiAssert')],
    ['{VarName} placeholders emit class="variable"', xml.includes('class="variable"')],
  ];
  for (const [label, ok] of checks) {
    console.log(indent(`${ok ? '✅' : '❌'} ${label}`));
  }

  subdivider('Raw XML — first 80 lines of what the LLM gets back');
  const xmlLines = xml.split('\n').slice(0, 80);
  console.log(indent(xmlLines.join('\n')));

  server.stdin.end();
  process.exit(0);
})().catch((err) => {
  console.error('trace error:', err);
  server.kill();
  process.exit(1);
});
