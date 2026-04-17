# Provar MCP Server — Pilot Evaluation Guide

This guide is for teams evaluating the Provar MCP server. It covers prerequisites, local setup, security and data handling, and suggested evaluation scenarios.

---

## What is the Provar MCP Server?

The Provar MCP server is a built-in component of the Provar DX CLI that exposes Provar project operations to AI assistants (Claude Desktop, Claude Code, Cursor) via the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP). Once connected, an AI agent can:

- Inspect your Provar project structure and coverage gaps
- Generate Java Page Objects and test case XML skeletons
- Validate test cases, suites, plans, and the full project hierarchy against quality rules
- Read, generate, and update `provardx-properties.json` run configurations
- Trigger Provar Automation test runs and Quality Hub managed runs directly from the AI chat
- Discover, validate, generate, and edit NitroX (Hybrid Model) `.po.json` component page objects for LWC, Screen Flow, Industry Components, Experience Cloud, and HTML5

The server runs **locally on your machine**. It does not phone home, transmit your project files to Provar servers, or require any Provar-side infrastructure changes.

---

## Prerequisites

| Requirement                 | Version | Notes                                                                                                                                 |
| --------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Provar Automation IDE       | ≥ 2.x   | Must be installed with an **activated licence** on the same machine. The MCP server reads the licence from `~/Provar/.licenses/`.     |
| Salesforce CLI (`sf`)       | ≥ 2.x   | `npm install -g @salesforce/cli`                                                                                                      |
| Provar DX CLI plugin        | ≥ 1.5.0 | `sf plugins install @provartesting/provardx-cli@beta`                                                                                 |
| An MCP-compatible AI client | —       | Claude Desktop, Claude Code, or Cursor                                                                                                |
| Node.js                     | 18–24   | Installed automatically with the SF CLI. **Node 25+ is not supported** — a transitive dependency crashes on startup. Use Node 22 LTS. |

---

## Installation

### 1. Install the Salesforce CLI

```sh
npm install -g @salesforce/cli
```

Verify:

```sh
sf --version
```

### 2. Install the Provar DX CLI plugin

```sh
sf plugins install @provartesting/provardx-cli@beta
```

Verify:

```sh
sf provar mcp start --help
```

### 3. Configure your AI client

#### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "provar": {
      "command": "sf",
      "args": ["provar", "mcp", "start", "--allowed-paths", "/path/to/your/provar/project"]
    }
  }
}
```

> **Licence:** The server reads your Provar Automation IDE licence automatically from `~/Provar/.licenses/`. No extra configuration is required — just ensure Provar Automation IDE is installed and activated on this machine.

Restart Claude Desktop after saving the file. The Provar tools will appear in the tool list.

#### Claude Code (VS Code / CLI)

Add to your project's `.claude/mcp.json`:

```json
{
  "mcpServers": {
    "provar": {
      "command": "sf",
      "args": ["provar", "mcp", "start", "--allowed-paths", "/path/to/your/provar/project"]
    }
  }
}
```

Or add directly from the Claude Code session:

```
/mcp add provar sf provar mcp start --allowed-paths /path/to/project
```

#### Cursor

In Cursor settings → MCP, add:

```json
{
  "provar": {
    "command": "sf",
    "args": ["provar", "mcp", "start", "--allowed-paths", "/path/to/your/provar/project"]
  }
}
```

---

## Testing the Connection

Before testing with a real project, verify the server is reachable using the `provardx.ping` tool. In your AI client, ask:

> "Call provardx.ping with message 'hello'"

Expected response:

```json
{ "pong": "hello", "ts": "2026-03-27T...", "server": "provar-mcp@1.0.0" }
```

If this fails, check that:

- The SF CLI is on your `PATH` (`which sf` or `where sf`)
- The Provar DX plugin is installed (`sf plugins`)
- The `--allowed-paths` value matches the actual directory on disk

---

## Suggested Evaluation Scenarios

Work through these in order — they build on each other.

### Scenario 1: Project Inspection

**Goal:** Understand what the AI can see in your project.

Prompt your AI assistant:

> "Use provar.project.inspect on `/path/to/my/project` and tell me what you find — how many test cases, any coverage gaps?"

**What to look for:**

- Accurate file counts
- Identification of uncovered test cases (those not referenced by any test plan)
- Detection of `provardx-properties.json` files and Provar home path

---

### Scenario 2: Test Case Validation

**Goal:** Score an existing test case for quality issues.

> "Validate the test case at `/path/to/project/tests/LoginTest.testcase` and explain any issues found."

**What to look for:**

- `validity_score` and `quality_score` both returned (0–100)
- Specific rule violations called out (e.g. TC_010 missing test case ID, TC_001 missing XML declaration)
- Best-practices suggestions (e.g. hardcoded credentials, missing step descriptions)
- `validation_source: "local"` if no API key is configured, `"quality_hub"` if authenticated

> **Tip:** Run `sf provar auth login` before this scenario to unlock Quality Hub API validation (170+ rules). Without a key the tool still returns useful results using local rules only.

---

### Scenario 3: Generate a Page Object

**Goal:** Have the AI scaffold a new Page Object for a Salesforce page.

> "Generate a Salesforce Page Object for the Account Detail page, with fields for Account Name (input), Phone (input), and Save button (button). Write it to `/path/to/project/src/pageobjects/accounts/AccountDetailPage.java`."

**What to look for:**

- Valid Java output with correct `@SalesforcePage` annotation
- `@FindBy` annotations with sensible locator strategies
- File written to disk (or dry-run if you omit the path)

---

### Scenario 4: Properties File Setup

**Goal:** Have the AI create and configure the run properties file.

> "Generate a `provardx-properties.json` at `/path/to/project/provardx-properties.json` with projectPath set to `/path/to/project` and provarHome set to `/path/to/provar`. Then validate it."

**What to look for:**

- File created with correct structure
- Validation reports any remaining `${PLACEHOLDER}` values as warnings
- No errors for the fields you provided

---

### Scenario 5: Full Hierarchy Validation

**Goal:** Validate the entire project and get a quality report.

> "Validate the full test project hierarchy. The project has connections named `SandboxOrg` and `ProdOrg`, environments `QA` and `UAT`, and the secrets password is set."

**What to look for:**

- `quality_score` for the project (0–100)
- Any `PROJ-*` rule violations (duplicate names, unresolved references)
- Suite and plan scores bubbled up into the project score

---

### Scenario 6 (requires SF CLI auth): Quality Hub Test Run

**Goal:** Trigger a managed test run from the AI.

Pre-requisite: `sf org login web -a MyQHOrg` then `sf provar quality-hub connect -o MyQHOrg`.

> "Connect to the Quality Hub org MyQHOrg, start a test run using config file `config/smoke-run.json`, and poll every 30 seconds until it completes."

**What to look for:**

- The AI chaining: `provar.qualityhub.connect` → `provar.qualityhub.testrun` → `provar.qualityhub.testrun.report` (looped)
- The run ID extracted from the `testrun` response and passed to `testrun.report`
- Final result status reported back

---

### Scenario 8: Quality Hub API Validation

**Goal:** Confirm that `provar.testcase.validate` upgrades from local rules to the full Quality Hub API ruleset when an API key is present.

**Setup:** Run `sf provar auth login` and complete the browser login, then confirm with `sf provar auth status`.

> "Validate the test case at `/path/to/project/tests/LoginTest.testcase` and tell me what validation_source was used."

**What to look for:**

- `validation_source: "quality_hub"` in the response — confirms the API path is active
- `quality_score` reflecting the full 170+ rule evaluation
- If the API is unreachable, `validation_source: "local_fallback"` and a `validation_warning` field explaining why

**To reset and test the fallback:** run `sf provar auth clear`, repeat the prompt, and verify `validation_source` reverts to `"local"`.

---

### Scenario 7: NitroX (Hybrid Model) Page Object Generation

**Goal:** Have the AI discover, understand, and generate NitroX component page objects.

NitroX is Provar's Hybrid Model for locators — it maps Salesforce component-based UIs (LWC, Screen Flow, Industry Components, Experience Cloud, HTML5) into `.po.json` files stored in the `nitroX/` directory of your Provar project.

**Step 1 — Discover existing page objects:**

> "Discover all NitroX page objects in my Provar project at `/path/to/my/project` and tell me how many there are."

**What to look for:** The AI calls `provar.nitrox.discover`, finds the `nitroX/` directory, and reports the file count.

**Step 2 — Read examples for context:**

> "Read up to 5 NitroX page objects from my project so you understand the structure."

**What to look for:** The AI calls `provar.nitrox.read` and summarises the patterns it sees (tagName, qualifier, element types, interactions).

**Step 3 — Generate a new component:**

> "Generate a NitroX page object for a `lightning-combobox` component named `/com/force/ui/ComboBox`. It should have a `value` qualifier parameter and a single element with a click interaction. Save it to `/path/to/my/project/nitroX/lwc/ComboBox.po.json`."

**What to look for:**

- The AI calls `provar.nitrox.generate` with `dry_run: true` first, then writes after your confirmation
- Generated JSON has valid UUIDs for all `componentId` fields
- `tagName`, `parameters`, and `elements` match your description

**Step 4 — Validate the result:**

> "Validate the file you just wrote and tell me the score."

**What to look for:**

- `provar.nitrox.validate` returns `valid: true` and `score: 100`
- Any issues are listed with rule IDs (NX001–NX010) and suggestions

**Step 5 — Apply a targeted edit:**

> "Update the qualifier parameter comparisonType from `equals` to `contains`."

**What to look for:**

- The AI calls `provar.nitrox.patch` with `dry_run: true` to show the change
- After confirmation, calls again with `dry_run: false`
- `validate_after: true` (the default) confirms the patch didn't break the schema

---

### Scenario 9 (requires API key): AI Test Generation from User Story

**Goal:** Demonstrate the full Phase 2 AI-assisted test generation loop: corpus retrieval → LLM synthesis → generate + validate.

**Setup:** Run `sf provar auth login` and complete the browser login.

> "I want to generate a Provar test case for: As a sales rep I want to create an Opportunity in Salesforce with a close date, amount, and stage. Use the corpus to find similar examples first."

**What to look for:**

- `provar.qualityhub.examples.retrieve` called with the user story as query, returning `examples` array with `similarity_score` values and XML content
- The AI using the retrieved XML as few-shot context when calling `provar.testcase.generate`
- `provar.testcase.validate` confirming `quality_score >= 70`
- If no API key: tool returns `{ examples: [], warning: "..." }` with `isError: false` and the AI continues without grounding

**To test graceful degrade:** Run `sf provar auth clear` and repeat. Verify `examples: []` with a warning and generation still proceeds.

---

### Scenario 10: Corpus Retrieval — No Key / Rate Limit

**Goal:** Confirm `provar.qualityhub.examples.retrieve` never hard-errors on API failure.

> "Fetch 3 corpus examples for: Create a Contact in Salesforce."

**Without an API key configured:**

- `isError` must be `false` (NOT `true`) — the generation workflow must continue
- `examples` must be `[]`
- `warning` must mention `sf provar auth login`

**What to look for:**

- The AI acknowledges the missing key and offers to continue without grounding
- No error is thrown that would abort the session

---

## Security Model

### What the server does

- Reads and writes files **only within the paths you specify via `--allowed-paths`**
- Validates all incoming paths against those roots before any file operation
- Blocks path traversal attempts (`../`) with a `PATH_TRAVERSAL` error
- Resolves symlinks via `fs.realpathSync` before the containment check — a symlink inside an allowed directory pointing outside it cannot bypass the restriction
- Validates all path-type input fields (e.g. `provar_home`, `project_path`, `results_path` in `provar.ant.generate`) before any file operation, not just the output path
- Invokes `sf` CLI subprocesses for Quality Hub and Automation tools — these use the SF CLI's existing credential store (`~/.sf/credentials.json`), which the MCP server does not read directly

### Licence validation

At startup the server reads `~/Provar/.licenses/*.properties` to verify that a Provar Automation IDE licence is activated on the machine. No network call is made during this check — it relies entirely on the licence state that the IDE has already validated and written to disk. The server makes no outbound connections for licence purposes.

**Evaluating without a local Provar IDE installation?** Set the `PROVAR_DEV_WHITELIST_KEYS` environment variable to one or more comma-separated licence keys to bypass the licence check entirely. This is intended for Provar engineering and CI environments:

```json
{
  "mcpServers": {
    "provar": {
      "command": "sf",
      "args": ["provar", "mcp", "start", "--allowed-paths", "/path/to/project"],
      "env": {
        "PROVAR_DEV_WHITELIST_KEYS": "your-provar-licence-key"
      }
    }
  }
}
```

> ⚠️ Do not use `PROVAR_DEV_WHITELIST_KEYS` in production environments — it bypasses all licence enforcement.

### What the server does NOT do

- It does not transmit your project files, test code, or credentials to Provar servers
- It does not make any network calls (licence is validated locally from the IDE's state)
- It does not open any network ports or HTTP listeners (stdio transport only)
- It does not store state between requests — every tool call is stateless
- It does not read or modify files outside `--allowed-paths`
- It does not log sensitive field values (secrets, credentials) — log output goes to stderr only and contains request IDs and tool names

### Transport security

The MCP server uses **stdio transport** exclusively. Communication travels over the same process pipes that your AI client (Claude Desktop, Cursor, etc.) controls. There is no exposed TCP socket, no authentication token, and no network listener. The attack surface is limited to the process you explicitly launch.

### Credential handling

**Salesforce org credentials** — the Quality Hub and Automation tools invoke `sf` subprocesses. Salesforce org credentials are managed entirely by the Salesforce CLI and stored in its own credential store (`~/.sf/`). The Provar MCP server never reads, parses, or transmits those credentials.

**Provar API key** — the `provar.testcase.validate` tool optionally reads a `pv_k_` API key to enable Quality Hub API validation. The key is stored at `~/.provar/credentials.json` (written by `sf provar auth login`) or read from the `PROVAR_API_KEY` environment variable. The key is sent to the Provar Quality Hub API only when a validation request is made — it is never logged or written anywhere other than `~/.provar/credentials.json`.

### Path policy enforcement

```
PathPolicy: assertPathAllowed(filePath, allowedPaths)
  → PATH_TRAVERSAL  if filePath contains ".." segments
  → PATH_NOT_ALLOWED if resolved (symlink-dereferenced) path is outside all allowed roots
  → passes otherwise
```

This check runs before every file read and write, including all path-type input fields — not just output file paths. Symlinks are dereferenced so that a symlink inside an allowed directory cannot escape containment. The allowed roots are set at server startup via `--allowed-paths` and cannot be changed while the server is running.

### Audit log

All tool invocations are logged to **stderr** with a unique `requestId` per call. The log format is structured JSON:

```
[INFO] provar.testcase.validate {"requestId":"req-a1b2c3","file_path":"/workspace/..."}
```

You can capture stderr from the MCP server process to maintain an audit trail of all AI agent tool calls.

---

## Known Limitations

| Limitation                                            | Details                                                                                                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No async operations                                   | Quality Hub test run tools use synchronous SF CLI invocations. Long-running runs should use `provar.qualityhub.testrun.report` in a polling loop.                                                       |
| SF CLI must be in PATH                                | The `provar.qualityhub.*` and `provar.automation.*` tools spawn `sf` as a subprocess. If `sf` is not on `PATH`, you get `SF_NOT_FOUND`.                                                                 |
| No Windows native paths in `--allowed-paths` via JSON | Use forward slashes in MCP client config JSON, even on Windows. The server normalises paths internally.                                                                                                 |
| Page Object validation is static                      | The `provar.pageobject.validate` tool parses Java source statically. It does not compile or resolve imports.                                                                                            |
| Quality scores are local                              | The MCP quality scores are computed locally using the same formula as the Quality Hub Lambda. They are not submitted to or stored by any Provar service unless you call the Quality Hub API separately. |

---

## Troubleshooting

**"No activated Provar license found on this machine" / `LICENSE_NOT_FOUND`**

The server could not find an activated licence in `~/Provar/.licenses/`. Open Provar Automation IDE, go to **Help → Manage Licence**, and ensure your licence is activated. Then retry starting the MCP server.

If you are evaluating without a local Provar IDE installation, set `PROVAR_DEV_WHITELIST_KEYS` in the MCP server environment to bypass the licence check (see below).

**"[provar-mcp] Warning: license validated from offline cache" (appears on stderr)**

The server started successfully but the MCP licence cache is stale (more than 2 hours since the last validation). This is a warning only — the server is running. The grace window is 48 hours; if the cache exceeds that without a successful re-validation the next startup will fail with `LICENSE_NOT_FOUND`. To reset: restart the MCP server while Provar Automation IDE is open and connected to the internet.

**"SF_NOT_FOUND" error from quality hub / automation tools**

The `sf` CLI binary is not on the `PATH` that the MCP server process sees. On macOS, GUI apps can have a different `PATH` than your terminal. Fix by using the full path in the MCP config:

```json
{
  "command": "/usr/local/bin/sf",
  "args": ["provar", "mcp", "start", "--allowed-paths", "..."]
}
```

**"PATH_NOT_ALLOWED" error**

The path you passed to a tool is outside the `--allowed-paths` root you configured. Either update `--allowed-paths` in your client config and restart the server, or use a path within the allowed root.

**Tools not appearing in Claude Desktop**

After editing `claude_desktop_config.json`, you must fully restart Claude Desktop (not just the window). On macOS, use `Cmd+Q` to quit, then reopen.

**Server starts but immediately exits**

Check that the SF CLI plugin is installed: `sf plugins | grep provardx`. If missing, run `sf plugins install @provartesting/provardx-cli@beta`.

---

## Support

For issues with the Provar DX CLI or MCP server, raise a ticket at [github.com/ProvarTesting/provardx-cli/issues](https://github.com/ProvarTesting/provardx-cli/issues).

For issues with Provar Automation or Quality Hub, contact Provar support through your usual channel.
