#!/usr/bin/env node
// Lightweight zero-install entrypoint for the Provar MCP server.
// Usage: npx -y @provartesting/provardx-cli@beta mcp start --allowed-paths /path/to/project

const args = process.argv.slice(2);

if (args[0] !== 'mcp' || args[1] !== 'start') {
  process.stderr.write(
    'Usage: provardx mcp start --allowed-paths <path> [--auto-defects] [--auto-update] [--no-update-check]\n'
  );
  process.exit(1);
}

const remaining = args.slice(2);
/** @type {string[]} */
const allowedPaths = [];
let autoDefects = false;
let autoUpdate = false;
let noUpdateCheck = false;

for (let i = 0; i < remaining.length; i++) {
  const arg = remaining[i];
  if (arg === '--allowed-paths' || arg === '-a') {
    if (i + 1 >= remaining.length) {
      process.stderr.write('[provar-mcp] Error: --allowed-paths requires a path value.\n');
      process.exit(1);
    }
    allowedPaths.push(remaining[++i]);
  } else if (arg.startsWith('--allowed-paths=')) {
    allowedPaths.push(arg.slice('--allowed-paths='.length));
  } else if (arg === '--auto-defects') {
    autoDefects = true;
  } else if (arg === '--auto-update') {
    autoUpdate = true;
  } else if (arg === '--no-update-check') {
    noUpdateCheck = true;
  }
}

if (allowedPaths.length === 0) {
  process.stderr.write(
    '[provar-mcp] Error: --allowed-paths is required.\n' +
      'Example: npx -y @provartesting/provardx-cli@beta mcp start --allowed-paths /path/to/project\n'
  );
  process.exit(1);
}

if (autoDefects) {
  process.env['PROVAR_AUTO_DEFECTS'] = '1';
}

// Dynamic imports placed after arg validation so early-exit paths need no compiled lib.
const { validateLicense, LicenseError } = await import('../lib/mcp/licensing/index.js');
const { checkForUpdate } = await import('../lib/mcp/update/updateChecker.js');
const { createProvarMcpServer } = await import('../lib/mcp/server.js');
const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');

try {
  const result = await validateLicense();
  if (result.offlineGrace) {
    process.stderr.write('[provar-mcp] Warning: license validated from offline cache (last checked > 2h ago).\n');
  }
} catch (err) {
  if (err instanceof LicenseError) {
    process.stderr.write(`[provar-mcp] Error: ${/** @type {Error} */ (err).message}\n`);
    process.exit(1);
  }
  throw err;
}

const updateResult = await checkForUpdate({ noUpdateCheck, autoUpdate });
const server = createProvarMcpServer({ allowedPaths, updateResult });
const transport = new StdioServerTransport();
await server.connect(transport);
