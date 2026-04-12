# Provar MCP

> **Beta:** Provar MCP is currently in Beta. This is offered to all Provar users at no additional cost, and is an open source project hosted on GitHub [here](https://github.com/ProvarTesting/provardx-cli/). General Availability is coming soon. We welcome feedback via [GitHub Issues](https://github.com/ProvarTesting/provardx-cli/issues).

---

## What is Provar MCP?

Provar MCP is an AI-assisted quality layer built directly into the Provar DX CLI. It implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) — an open standard that lets AI assistants call tools on your behalf — and exposes a rich set of Provar project operations to AI clients such as **Claude Desktop**, **Claude Code**, and **Cursor**.

Once connected, your AI assistant can:

- Inspect your Provar Automation project and surface coverage gaps
- Generate Java Page Objects and XML test case skeletons
- Validate every level of the test hierarchy (test cases, suites, plans, and the full project) against 30+ quality rules
- Set up and manage your `provardx-properties.json` run configuration
- Trigger Provar Automation test runs and Provar Quality Hub managed runs — all from inside a chat session

The MCP server runs **entirely on your local machine**. No project files, test code, or credentials are transmitted to Provar servers.

---

## Prerequisites

Before you can use Provar MCP, ensure the following are in place:

| Requirement                               | Version             | Notes                                                                                                                                                                            |
| ----------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Provar Automation**                     | ≥ 2.18.2 or ≥ 3.0.6 | Must be installed with an **activated license** on the same machine. The MCP server reads license state from `~/Provar/.licenses/`.                                              |
| **Salesforce CLI (`sf`)**                 | ≥ 2.x               | Install with `npm install -g @salesforce/cli`                                                                                                                                    |
| **Provar DX CLI plugin**                  | ≥ 1.5.0-beta        | Install with `sf plugins install @provartesting/provardx-cli`                                                                                                                    |
| **Node.js**                               | ≥ 18                | Installed automatically with the Salesforce CLI                                                                                                                                  |
| **An MCP-compatible AI client**           | —                   | Claude Desktop, Claude Code (VS Code / CLI), or Cursor                                                                                                                           |
| **An existing Provar Automation project** | —                   | The MCP server works best when pointed at a real project directory. Project context (connections, environments, Page Objects, test cases) is what the AI reads and reasons over. |

### License requirements

Provar MCP requires an active **Provar Automation** license on the machine where the server runs. Validation is automatic:

1. The server reads `~/Provar/.licenses/*.properties` — the same files written by the Provar Automation IDE — and checks that a license is activated and was last verified online within 48 hours.
2. Successful validations are cached for 2 hours, so frequent server restarts do not cause repeated disk reads.
3. If no valid license is found, the server exits immediately with a clear error message. Open Provar Automation IDE and ensure your license is activated, then retry.

> There is no separate MCP license. Your existing Provar Automation license covers MCP usage.

---

## Installation

### Step 1 — Install the Salesforce CLI

```sh
npm install -g @salesforce/cli
sf --version
```

### Step 2 — Install the Provar DX CLI plugin

```sh
sf plugins install @provartesting/provardx-cli
sf provar mcp start --help
```

### Step 3 — Authenticate with Quality Hub (optional, recommended)

Run `sf provar auth login` to connect your Provar account and unlock full Quality Hub API validation (170+ rules, quality scoring). Without this, the MCP server runs in local-only mode using structural rules.

```sh
sf provar auth login
```

This opens a browser to the Provar login page. After you authenticate, your API key is stored at `~/.provar/credentials.json` and picked up automatically by the MCP server on every subsequent tool call.

For CI/CD pipelines, set the `PROVAR_API_KEY` environment variable instead of running the browser login.

### Step 4 — Configure your AI client

#### Claude Desktop

Edit the Claude Desktop MCP configuration file:

- **macOS / Linux:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

Restart Claude Desktop after saving. The Provar tools will appear in the tool list automatically.

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

Or add directly from a Claude Code session:

```
/mcp add provar sf provar mcp start --allowed-paths /path/to/project
```

#### Cursor

In Cursor Settings → MCP, add:

```json
{
  "provar": {
    "command": "sf",
    "args": ["provar", "mcp", "start", "--allowed-paths", "/path/to/your/provar/project"]
  }
}
```

> **Important:** Set `--allowed-paths` to the root of your Provar Automation project directory. This is the folder containing your `.testproject` file. The server will only read and write files within this boundary.

---

## Verify the connection

Once your AI client is configured, ask it:

> "Call provardx.ping with message 'hello'"

Expected response:

```json
{ "pong": "hello", "ts": "2026-04-07T...", "server": "provar-mcp@1.0.0" }
```

If this fails, see the [Troubleshooting](#troubleshooting) section.

---

## Use cases

### Inspect your project

Get an instant inventory of your Provar project — file counts, coverage gaps, and missing configurations.

**Prompt:**

> "Use provar.project.inspect on my project at `/workspace/MyProvarProject` and tell me what you find — how many test cases are there, and which ones aren't covered by any test plan?"

**What you get back:**

- Total test case count, suite structure, Page Object count
- A list of test cases not referenced by any test plan (coverage gaps)
- Whether a `provardx-properties.json` config file exists

---

### Validate a test case

Score an existing test case for schema compliance and best-practice quality issues.

**Prompt:**

> "Validate the test case at `/workspace/MyProvarProject/tests/regression/LoginTest.testcase` and explain any issues."

**What you get back:**

- `validity_score` (schema compliance, 0–100) and `quality_score` (best practices, 0–100)
- Specific rule violations with IDs, severities, and descriptions
- Actionable suggestions (e.g. "Add a missing XML declaration", "Test case ID is not a valid UUID")
- `validation_source` — `"quality_hub"` if authenticated, `"local"` if no API key is configured

> **Get more:** Run `sf provar auth login` once to unlock Quality Hub API validation (170+ rules). Without a key the tool still returns useful results using local structural rules.

---

### Generate a Page Object

Have the AI scaffold a new Java Page Object for a Salesforce page with correct annotations and `@FindBy` stubs.

**Prompt:**

> "Generate a Salesforce Page Object for the Account Detail page. Include fields for Account Name (input), Industry (select), and a Save button. Write it to `/workspace/MyProvarProject/src/pageobjects/accounts/AccountDetailPage.java`."

**What you get back:**

- A valid Java file with `@SalesforcePage` annotation
- `@FindBy` annotations for each field using sensible locator strategies
- File written to disk (use `dry_run: true` in the tool call to preview without writing)

---

### Generate a test case

Scaffold a new XML test case with a proper UUID, sequential step IDs, and a clean structure ready for Provar Automation.

**Prompt:**

> "Generate a test case called 'Verify Account Creation' with steps for navigating to the Accounts page, clicking New, filling in Account Name, and saving. Write it to `/workspace/MyProvarProject/tests/smoke/VerifyAccountCreation.testcase`."

---

### Set up your run configuration

Let the AI create and validate a `provardx-properties.json` — the properties file that tells the Provar DX CLI how to run your tests.

**Prompt:**

> "Generate a `provardx-properties.json` at `/workspace/MyProvarProject/provardx-properties.json` with projectPath set to `/workspace/MyProvarProject` and provarHome set to `/Applications/Provar`. Then validate it and tell me if anything is missing."

---

### Validate the full project hierarchy

Get a single quality score for your entire project — test cases, suites, plans, connections, environments, and cross-cutting rules all evaluated together.

**Prompt:**

> "Validate the full test project at `/workspace/MyProvarProject`. The project has connections named `SandboxOrg` and `ProdOrg`, and environments `QA` and `UAT`. Give me a quality report."

**What you get back:**

- Overall project quality score (0–100)
- Test plan coverage percentage
- Breakdown of violations by rule ID
- Per-plan quality scores

---

### Trigger a Provar Automation test run

Ask the AI to run your local Provar Automation test suite and report results.

**Prompt:**

> "Load the properties file at `/workspace/MyProvarProject/provardx-properties.json`, compile the project, then run the tests and tell me the results."

**The AI will chain:**

1. `provar.automation.config.load` — registers the properties file
2. `provar.automation.compile` — compiles Page Objects
3. `provar.automation.testrun` — executes the test run
4. `provar.testrun.report.locate` — finds the JUnit/HTML report paths

---

### Trigger a Quality Hub managed test run

Kick off a managed test run via Provar Quality Hub and poll until it completes.

**Pre-requisite:** Authenticate the Salesforce CLI against your Quality Hub org first:

```sh
sf org login web -a MyQHOrg
sf provar quality-hub connect -o MyQHOrg
```

**Prompt:**

> "Connect to the Quality Hub org MyQHOrg, start a test run using config file `config/smoke-run.json`, and poll every 30 seconds until it completes or fails."

**The AI will chain:**

1. `provar.qualityhub.connect` — connects to the org
2. `provar.qualityhub.testrun` — triggers the run
3. `provar.qualityhub.testrun.report` — polls status in a loop
4. Reports final pass/fail status and a summary of results

---

### Root cause analysis after a test run failure

After a failed run, ask the AI to classify failures and identify patterns.

**Prompt:**

> "My test run just finished. Analyse the results at `/workspace/MyProvarProject/Results/` and classify any failures — tell me which are pre-existing issues and which look like new regressions."

**What you get back:**

- Classified failure categories (environment issue, assertion failure, locator issue, etc.)
- Identification of Page Objects involved in failures
- Suggested next steps

---

### Create a Quality Hub defect from a failed test

Turn a failed test execution directly into a Quality Hub defect, without leaving your AI chat.

**Prompt:**

> "The test 'LoginTest' failed in the last run. Create a defect in Quality Hub for it."

---

## Available tools (reference)

| Tool                                  | What it does                                                     |
| ------------------------------------- | ---------------------------------------------------------------- |
| `provardx.ping`                       | Sanity check — verifies the server is running                    |
| `provar.project.inspect`              | Inventory project artefacts and surface coverage gaps            |
| `provar.project.validate`             | Full project quality validation from disk                        |
| `provar.pageobject.generate`          | Generate a Java Page Object skeleton                             |
| `provar.pageobject.validate`          | Validate Page Object quality (30+ rules)                         |
| `provar.testcase.generate`            | Generate an XML test case skeleton                               |
| `provar.testcase.validate`            | Validate test case XML (schema + best-practices scores)          |
| `provar.testsuite.validate`           | Validate a test suite hierarchy                                  |
| `provar.testplan.validate`            | Validate a test plan with metadata completeness checks           |
| `provar.testplan.add-instance`        | Wire a test case into a plan suite                               |
| `provar.testplan.create-suite`        | Create a new test suite inside a plan                            |
| `provar.testplan.remove-instance`     | Remove a test instance from a plan suite                         |
| `provar.properties.generate`          | Generate a `provardx-properties.json` from the standard template |
| `provar.properties.read`              | Read and parse a `provardx-properties.json`                      |
| `provar.properties.set`               | Update fields in a `provardx-properties.json`                    |
| `provar.properties.validate`          | Validate a `provardx-properties.json` against the schema         |
| `provar.ant.generate`                 | Generate an ANT `build.xml` for CI/CD pipeline execution         |
| `provar.ant.validate`                 | Validate an ANT `build.xml`                                      |
| `provar.automation.setup`             | Detect or download/install Provar Automation binaries            |
| `provar.automation.config.load`       | Register a properties file as the active config                  |
| `provar.automation.compile`           | Compile Page Objects after changes                               |
| `provar.automation.metadata.download` | Download Salesforce metadata into the project                    |
| `provar.automation.testrun`           | Trigger a local Provar Automation test run                       |
| `provar.qualityhub.connect`           | Connect to a Quality Hub org                                     |
| `provar.qualityhub.display`           | Display connected Quality Hub org info                           |
| `provar.qualityhub.testrun`           | Trigger a Quality Hub managed test run                           |
| `provar.qualityhub.testrun.report`    | Poll test run status                                             |
| `provar.qualityhub.testrun.abort`     | Abort an in-progress test run                                    |
| `provar.qualityhub.testcase.retrieve` | Retrieve test cases by user story or component                   |
| `provar.qualityhub.defect.create`     | Create Quality Hub defects from failed executions                |
| `provar.testrun.report.locate`        | Resolve JUnit/HTML report paths after a run                      |
| `provar.testrun.rca`                  | Classify failures and detect regressions                         |

---

## Security

- **Local only.** The MCP server communicates via stdio — no TCP port is opened, no network listener is started.
- **Path-scoped.** All file operations are restricted to the directories you specify via `--allowed-paths`. Path traversal (`../`) is blocked.
- **No data exfiltration.** Project files, test code, and credentials are never transmitted to Provar servers.
- **Credential safety.** Quality Hub and Automation tools invoke the Salesforce CLI as a subprocess. Org credentials stay in the SF CLI's own credential store and are never read or logged by the MCP server.
- **Audit log.** Every tool invocation is logged to stderr with a unique request ID in structured JSON format. Capture stderr to maintain an audit trail.

---

## Troubleshooting

**"No activated Provar license found" / `LICENSE_NOT_FOUND`**
Open Provar Automation IDE → Help → Manage License → ensure the license is Activated. Then restart the MCP server.

**"Warning: license validated from offline cache" (on stderr)**
The server started successfully but the license cache is over 2 hours old. This is a warning only. If the cache exceeds 48 hours without a successful online re-validation, the next startup will fail. Restart the server while Provar Automation IDE is connected to the internet to refresh the cache.

**`SF_NOT_FOUND` error from Quality Hub / Automation tools**
The `sf` CLI binary is not on the PATH that the MCP server sees (common with macOS GUI apps). Use the full binary path in your MCP config:

```json
{ "command": "/usr/local/bin/sf", "args": ["provar", "mcp", "start", "--allowed-paths", "..."] }
```

**`PATH_NOT_ALLOWED` error**
The path passed to a tool is outside the `--allowed-paths` root. Update `--allowed-paths` in your client config and restart the server.

**Tools not appearing in Claude Desktop**
After editing `claude_desktop_config.json`, fully quit and reopen Claude Desktop (Cmd+Q on macOS, not just close the window).

**Server starts then immediately exits**
Check the plugin is installed: `sf plugins | grep provardx`. If missing: `sf plugins install @provartesting/provardx-cli`.

---

## Support

- **Bug reports and feature requests (COMING SOON):** [github.com/ProvarTesting/provardx-cli/issues](https://github.com/ProvarTesting/provardx-cli/issues)
- **Provar Automation / Quality Hub support:** Contact Provar Support through your usual channel or through the [Provar Success Portal](https://success.provartesting.com/).
