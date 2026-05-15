// Script-name lint: enforces the convention that files under scripts/ are
// named by what they DO, not by which ticket prompted them.
//
// Why: ticket-prefixed filenames anchor the codebase to internal Jira IDs,
// confuse future readers when the original ticket is closed/archived, and
// leak internal process language into customer-visible artifacts (CI logs,
// PR diffs, file trees that pilots may receive). Behaviour-named scripts
// stay readable as the codebase evolves.
//
// Rule: no file ANYWHERE under scripts/ (including nested subdirectories)
// may have a basename matching /^pdx[-_]?\d+/i. The walk is recursive so a
// nested `scripts/tmp/pdx-123.cjs` does not bypass the gate.
//
// Run:
//   node scripts/lint-script-names.cjs
// Or via the lint chain:
//   yarn lint            # wireit runs lint:script-names as a dependency

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SCRIPTS_DIR = path.resolve(__dirname);
const TICKET_PREFIX_RE = /^pdx[-_]?\d+/i;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

const offenders = walk(SCRIPTS_DIR)
  .filter((full) => TICKET_PREFIX_RE.test(path.basename(full)))
  .map((full) => path.relative(path.dirname(SCRIPTS_DIR), full).replace(/\\/g, '/'))
  .sort();

if (offenders.length === 0) {
  console.log('lint-script-names: OK (no ticket-prefixed script filenames under scripts/)');
  process.exit(0);
}

console.error('lint-script-names: FAIL — scripts/ contains ticket-prefixed filenames:');
for (const rel of offenders) console.error(`  - ${rel}`);
console.error(
  '\nRename each file to describe what it DOES, not which ticket added it (e.g. `authoring-flow-trace.cjs` instead of `pdx-481-trace.cjs`).'
);
process.exit(1);
