// Script-name lint: enforces the convention that files under scripts/ are
// named by what they DO, not by which ticket prompted them.
//
// Why: ticket-prefixed filenames anchor the codebase to internal Jira IDs,
// confuse future readers when the original ticket is closed/archived, and
// leak internal process language into customer-visible artifacts (CI logs,
// PR diffs, file trees that pilots may receive). Behaviour-named scripts
// stay readable as the codebase evolves.
//
// Rule: no file in scripts/ may match /^pdx[-_]?\d+/i.
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

const offenders = fs
  .readdirSync(SCRIPTS_DIR, { withFileTypes: true })
  .filter((e) => e.isFile())
  .map((e) => e.name)
  .filter((name) => TICKET_PREFIX_RE.test(name))
  .sort();

if (offenders.length === 0) {
  console.log('lint-script-names: OK (no ticket-prefixed script filenames)');
  process.exit(0);
}

console.error('lint-script-names: FAIL — scripts/ contains ticket-prefixed filenames:');
for (const name of offenders) console.error(`  - scripts/${name}`);
console.error(
  '\nRename each file to describe what it DOES, not which ticket added it (e.g. `authoring-flow-trace.cjs` instead of `pdx-481-trace.cjs`).'
);
process.exit(1);
