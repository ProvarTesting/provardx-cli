# University of Provar — Provar MCP Course

**Course title:** AI-Assisted Quality with Provar MCP
**Format:** Self-paced, hands-on labs
**Audience:** Provar Automation users who want to accelerate test authoring and quality analysis using AI assistants
**Status:** Beta — course content will be updated as Provar MCP reaches General Availability

---

## Course overview

This course teaches you to use **Provar MCP** — the AI-powered extension to the Provar DX CLI — to speed up every stage of the Provar Automation workflow: from inspecting a project and generating Page Objects, to running tests and triaging failures, all from inside an AI chat session.

By the end of this course you will be able to:

- Connect an AI assistant (Claude, Cursor) to your Provar Automation project
- Ask the AI to inspect projects, validate quality, and surface gaps — without writing a single command
- Generate Page Objects and test case skeletons using natural-language prompts
- Trigger test runs and analyse results through the AI interface
- Use Provar Quality Hub managed runs from the AI chat

**Estimated time:** 4–5 hours across all modules

---

## Prerequisites

Before starting this course, you should have:

- **Provar Automation** installed with an activated license (≥ v2.18.2 or 3.0.6)
- **An existing Provar Automation project** on your local machine (the AI reads project context from disk — the richer the project, the more useful the results)
- **Salesforce CLI (`sf`)** installed: `npm install -g @salesforce/cli`
- **Provar DX CLI plugin** installed: `sf plugins install @provartesting/provardx-cli`
- **One of:** Claude Desktop, Claude Code (VS Code or CLI), or Cursor

If you haven't set up the Provar DX CLI before, complete the _Getting Started with Provar DX CLI_ course first.

---

## Module 1: Introduction to Provar MCP

**Learning objectives**

- Understand what MCP is and why Provar uses it
- Describe what the Provar MCP server does and does not do
- Explain the license and project directory requirements

### 1.1 — What is MCP?

The **Model Context Protocol (MCP)** is an open standard created to let AI assistants call external tools safely and predictably. Instead of the AI guessing how to interact with a system, you expose a set of clearly defined tools — each with inputs, outputs, and documented behavior — and the AI calls them on your behalf.

Provar MCP wraps the entire Provar DX CLI toolchain as MCP tools. Your AI assistant can inspect your project, generate files, validate quality, and trigger runs — all without you typing a single CLI command.

### 1.2 — How it works

```
Your AI client (Claude Desktop / Claude Code / Cursor)
        ↓  MCP stdio transport
Provar MCP Server  (sf provar mcp start)
        ↓  reads/writes files within --allowed-paths
Your Provar Automation project on disk
        ↓  spawns subprocesses for test runs / Quality Hub
Salesforce CLI (sf)
```

The server runs on your machine. Nothing leaves your machine except outbound calls you explicitly trigger (e.g. a Quality Hub test run hitting your Salesforce org).

### 1.3 — What you need

- A **Provar Automation license** — the MCP server reads your existing IDE license from `~/Provar/.licenses/`. No separate license is required.
- An **existing Provar Automation project directory** — this is the `--allowed-paths` root you point the server at. The AI uses the project's Page Objects, test cases, plans, connections, and environments as context.

> **Tip:** The more complete your Provar project is, the better the AI's suggestions will be. A project with real Page Objects, named connections, and a populated test plan gives the AI much more to work with than an empty skeleton.

### 1.4 — Knowledge check

1. Where does the MCP server run — on your local machine or on Provar's servers? (local)
2. Does Provar MCP require a separate license, or does it use your existing Provar Automation license? (uses existing license)
3. What flag do you use when starting the MCP server to specify which project directory the AI can access? (--allowed-paths)

---

## Module 2: Installation and Setup

**Learning objectives**

- Install and verify the Provar DX CLI plugin
- Configure at least one MCP-compatible AI client
- Verify the connection using the ping tool

### Lab 2.1 — Install the plugin

Open a terminal and run:

```sh
sf plugins install @provartesting/provardx-cli
```

Verify the MCP command is available:

```sh
sf provar mcp start --help
```

You should see a list of flags and tool descriptions. If you see an error, confirm the Salesforce CLI is installed: `sf --version`.

### Lab 2.2 — Configure Claude Desktop

1. Find the Claude Desktop config file:

   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add the Provar server entry, replacing `/path/to/your/provar/project` with the actual path to your project directory:

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

3. Fully quit and reopen Claude Desktop.

4. In a new conversation, look for Provar tools in the tool list. You should see entries like `provar.project.inspect`, `provar.testcase.validate`, etc.

> **macOS note:** If `sf` is not found, use the full path. Find it with `which sf` in your terminal, then use that path as the `"command"` value.

### Lab 2.3 — Configure Claude Code

If you're using Claude Code (VS Code or CLI), add the server to `.claude/mcp.json` in your project root:

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

Alternatively, run this inside a Claude Code session:

```
/mcp add provar sf provar mcp start --allowed-paths /path/to/project
```

### Lab 2.4 — Verify the connection

In your AI client, type:

> "Call provardx.ping with message 'hello'"

Expected response:

```json
{ "pong": "hello", "ts": "2026-04-07T12:00:00Z", "server": "provar-mcp@1.0.0" }
```

**If this fails:**

- Confirm `sf plugins | grep provardx` shows the plugin installed
- Confirm the `--allowed-paths` directory exists on disk
- On macOS GUI apps, use the full path to `sf` in the config

### Lab 2.5 — Authenticate with Quality Hub (recommended)

This step unlocks full Quality Hub API validation (170+ rules, quality scoring). Without it, the MCP server runs in local-only mode.

```sh
sf provar auth login
```

A browser window opens to the Provar login page. After authenticating, confirm the key was stored:

```sh
sf provar auth status
```

You should see `API key configured` with a source of `~/.provar/credentials.json`.

> **CI/CD alternative:** Instead of the browser login, set `PROVAR_API_KEY=pv_k_your_key` in your environment. This takes priority over the stored credentials file.

### Knowledge check

1. After editing `claude_desktop_config.json`, what do you need to do for the changes to take effect?
   _(Fully quit and reopen Claude Desktop — closing the window is not enough)_
2. What does `provardx.ping` tell you when it responds successfully?
   _(That the MCP server is running, the client is connected, and the server version)_
3. You get a `LICENSE_NOT_FOUND` error when the server starts. What is the most likely cause and how do you fix it?
   _(Provar Automation IDE license is not activated on this machine — open Provar Automation IDE, go to Help → Manage License, activate the license, then retry)_
4. What command would you run to check whether your Quality Hub API key is valid?
   _(`sf provar auth status` — it performs a live check against the Quality Hub API and shows the key source, tier, and expiry)_

---

## Module 3: Inspecting Your Project

**Learning objectives**

- Use `provar.project.inspect` to get a full inventory of a Provar project
- Identify test coverage gaps from inspection output
- Understand what project context the AI uses when reasoning about your tests

### 3.1 — What inspection tells you

`provar.project.inspect` reads your entire project directory and returns:

| What                                   | Why it matters                                                  |
| -------------------------------------- | --------------------------------------------------------------- |
| Test case count and paths              | Baseline for coverage analysis                                  |
| Page Object directories                | Understand source structure                                     |
| Test plan / suite / instance hierarchy | Drives the coverage calculation                                 |
| Uncovered test case paths              | Test cases not in any test plan — gaps the AI can help you fill |
| `provardx-properties.json` files       | Whether run configurations are set up                           |
| Data source files                      | Whether test data exists                                        |

### Lab 3.1 — Inspect your project

Point the AI at your project and ask for a summary:

> "Use provar.project.inspect on `/path/to/your/provar/project` and give me a summary: how many test cases, suites, and plans are there? Which test cases aren't in any plan?"

**What to observe:**

- Review the `uncovered_test_case_paths` list — these are coverage gaps
- Check whether `provardx_properties_files` is empty (if so, you'll need to create one in Module 6)
- Note the `coverage_percent` value

### Lab 3.2 — Coverage gap analysis

After the basic inspection, push further:

> "Based on the inspection, which test suites have the most uncovered tests? Suggest a plan for adding those to an existing test plan."

The AI will reason over the coverage data and suggest specific `.testinstance` additions.

### Knowledge check

1. What is `coverage_percent` measuring in the inspection output?
   _(The percentage of test case files that are referenced by at least one `.testinstance` in a test plan)_
2. What is the difference between a test suite and a test plan in Provar's hierarchy?
   _(A test plan is the top-level container — a directory under `plans/` with a `.planitem` file. A test suite is a named sub-directory inside a plan, also containing a `.planitem`, used to group related test instances)_
3. If `uncovered_test_case_paths` lists 15 tests, what does that mean in practice?
   _(Those 15 test cases are not wired into any test plan via a `.testinstance` file, so they will never be executed by a plan-driven run and won't contribute to Quality Hub reporting)_

---

## Module 4: Validating Test Quality

**Learning objectives**

- Validate a test case and interpret validity and quality scores
- Validate a Page Object against structural and locator rules
- Run a full project-level validation and understand the output

### 4.1 — Two types of scores

Every validation tool returns up to two scores:

| Score            | Range | What it measures                                                   |
| ---------------- | ----- | ------------------------------------------------------------------ |
| `validity_score` | 0–100 | Schema compliance — is the file structurally correct?              |
| `quality_score`  | 0–100 | Best practices — does the file follow Provar's quality guidelines? |

A file can be valid (no schema errors) but have a low quality score (missing descriptions, hardcoded data, no test case ID).

### 4.2 — Two validation modes

The `provar.testcase.validate` tool operates in one of two modes depending on whether a Quality Hub API key is configured:

| Mode                | `validation_source` | Rules                            | Requires                      |
| ------------------- | ------------------- | -------------------------------- | ----------------------------- |
| **Quality Hub API** | `quality_hub`       | 170+ rules, full quality scoring | `sf provar auth login` (once) |
| **Local only**      | `local`             | Structural and schema rules      | Nothing                       |

If a key is configured but the API is temporarily unreachable, the tool falls back to local rules and sets `validation_source: "local_fallback"` with a `validation_warning` explaining why.

Run `sf provar auth login` before the labs in this module to get the full Quality Hub experience. If you skipped Lab 2.5, do it now.

### Lab 4.1 — Validate a single test case

Pick any `.testcase` file in your project and run:

> "Validate the test case at `/path/to/project/tests/SmokeTest.testcase`. Explain each issue found and tell me how to fix them."

**What to observe:**

- `validity_score` — any value below 100 means schema errors are present
- `quality_score` — check the `best_practices_violations` list for actionable items
- Rule IDs like `TC_010` (missing test case ID) or `TC_001` (missing XML declaration) — these are the most common issues in new projects

### Lab 4.2 — Validate a Page Object

Open a `.java` Page Object file in your project and ask:

> "Validate the Page Object at `/path/to/project/src/pageobjects/MyPage.java`. Highlight any issues with locators or annotations."

**What to observe:**

- `quality_score` out of 100
- Issues flagged under rules like `PO_071`–`PO_073` (fragile XPath patterns — replace with `@id` or `By.cssSelector`)
- `PO_004` (non-PascalCase class name) — naming convention violations

### Lab 4.3 — Full project validation

Run a project-wide quality scan:

> "Validate the full test project at `/path/to/project`. Give me the overall quality score, the per-plan scores, and the top 5 violation types across the project."

**What to observe:**

- `quality_score` for the project as a whole
- `coverage_percent` (how many test cases are in at least one plan)
- `violation_summary` — a map of rule IDs to counts, useful for spotting systemic issues
- `plan_scores` — which plans have the lowest scores and need the most attention

### Knowledge check

1. A test case has a `validity_score` of 100 and a `quality_score` of 62. What does this tell you?
   _(The file is structurally valid XML with no schema errors, but it violates several best-practice rules — e.g. missing descriptions, hardcoded data, or no test case ID — that reduce the quality score)_
2. Which rule ID fires when a test case is missing its XML declaration?
   _(`TC_001`)_
3. What does `PROJ-CONN-001` signal in a project-level validation?
   _(A test case or test instance references a Salesforce connection name that is not defined in the project's `.testproject` file)_

---

## Module 5: Generating Test Artefacts

**Learning objectives**

- Generate a Java Page Object from a natural-language description
- Generate an XML test case skeleton with steps
- Use dry run mode to preview output before writing to disk

### 5.1 — Page Object generation

Provar Page Objects are Java classes annotated with `@Page` or `@SalesforcePage`. The `provar.pageobject.generate` tool creates a skeleton with correct structure, package declaration, and `@FindBy` field stubs — ready for you to refine and complete.

### Lab 5.1 — Generate a Salesforce Page Object

> "Generate a Salesforce Page Object for the Contact Detail page. Include these fields: Contact Name (input, locator type: id, locator value: 'firstName'), Email (input), Phone (input), and a Save button. The class name should be ContactDetailPage, package pageobjects.contacts. Do a dry run first — don't write to disk yet."

**What to observe:**

- The generated Java file with `@SalesforcePage` annotation
- `@FindBy` annotations for each field
- The `written: false` response confirming nothing was written

Once you're happy with the output, remove the dry run instruction:

> "Now write it to `/path/to/project/src/pageobjects/contacts/ContactDetailPage.java`."

### Lab 5.2 — Generate a test case

> "Generate a test case called 'Create New Contact' with the following steps: navigate to Contacts, click New, fill in the contact name, enter email and phone, click Save, and verify the record was created. Write it to `/path/to/project/tests/smoke/CreateNewContact.testcase`."

**What to observe:**

- Valid XML output with a generated UUID and sequential `testItemId` values
- Steps mapped to Provar API step types
- File written to disk

### Lab 5.3 — Validate what you just generated

Always validate generated artefacts before committing them to source control:

> "Validate the test case we just wrote at `/path/to/project/tests/smoke/CreateNewContact.testcase`."

If the quality score is below 80, ask:

> "What would bring the quality score above 80? Make the changes."

### Knowledge check

1. What is the difference between `dry_run: true` and omitting the `output_path` parameter when generating a Page Object?
   _(Both return the content without writing to disk, but `dry_run: true` makes the intent explicit and works even if an `output_path` is provided — the path is ignored. Omitting `output_path` simply means there is nowhere to write)_
2. Why should you validate a generated test case immediately after generation?
   _(Generated artefacts may be missing best-practice fields — like a test case description or step metadata — that drop the quality score below the 80-point threshold required for plan coverage to count in Quality Hub)_
3. What annotation does `provar.pageobject.generate` use for Salesforce pages vs non-Salesforce pages?
   _(`@SalesforcePage` for Salesforce pages; `@Page` for standard web pages)_

---

## Module 6: Run Configuration

**Learning objectives**

- Generate and validate a `provardx-properties.json` file using the AI
- Update individual properties without editing JSON by hand
- Understand the connection between the properties file and test execution

### 6.1 — What is `provardx-properties.json`?

This is the configuration file that tells the Provar DX CLI how and where to run tests: which Provar installation to use, which test cases or suites to run, which environment, browser, and connections to use. The MCP tools can create, read, update, and validate this file on your behalf.

### Lab 6.1 — Generate a properties file

> "Generate a `provardx-properties.json` at `/path/to/project/provardx-properties.json`. Set projectPath to `/path/to/project` and provarHome to `/path/to/provar/installation`. Then validate it and tell me which fields still need to be filled in."

**What to observe:**

- A complete properties file created from the standard template
- The validation response lists any fields still containing `${PLACEHOLDER}` values — these need real values before the file can drive a test run

### Lab 6.2 — Update a specific property

> "Update the `environment.testEnvironment` field in `/path/to/project/provardx-properties.json` to `QA`."

The AI uses `provar.properties.set` to make a targeted update without touching the rest of the file.

### Knowledge check

1. What does `provar.automation.config.load` do, and why is it required before triggering a test run?
   _(It validates and registers a `provardx-properties.json` as the active configuration in the current session. The compile and testrun tools depend on this loaded state — without it they don't know which project, Provar home, or test cases to use)_
2. What happens if `provardx-properties.json` still contains `${PLACEHOLDER}` values when you try to run tests?
   _(The config load step will surface validation warnings for each unresolved placeholder. The run may still attempt to start but will likely fail when Provar Automation encounters the literal placeholder string instead of a real value)_

---

## Module 7: Running Tests

**Learning objectives**

- Trigger a local Provar Automation test run through the AI
- Poll a Quality Hub managed test run from the AI chat
- Locate and interpret test run artefacts (JUnit XML, HTML reports)

### Lab 7.1 — Local Provar Automation test run

> "Load the properties file at `/path/to/project/provardx-properties.json`, compile the Page Objects, then run the tests. Report the results when done."

**The AI chains these tools:**

1. `provar.automation.config.load` — registers the properties file
2. `provar.automation.compile` — compiles Java Page Objects
3. `provar.automation.testrun` — executes the run
4. `provar.testrun.report.locate` — finds the report artefacts

**What to observe:**

- The AI confirms the properties file is loaded successfully before attempting compilation
- Any compilation errors are surfaced before the test run starts
- After the run, the AI tells you where the JUnit XML and HTML report files are

### Lab 7.2 — Quality Hub managed test run

**Pre-requisite:** Authenticate your Quality Hub org with the Salesforce CLI:

```sh
sf org login web -a MyQHOrg
sf provar quality-hub connect -o MyQHOrg
```

Then in your AI client:

> "Connect to the Quality Hub org MyQHOrg, trigger a test run using the config at `/path/to/project/config/smoke-run.json`, and poll every 30 seconds until the run completes. Tell me the final pass/fail count."

**What to observe:**

- The AI extracts the run ID from the trigger response and uses it for polling
- Poll loop continues until status is `Completed`, `Failed`, or `Aborted`
- Final results summarised with pass count, fail count, and any error messages

### Lab 7.3 — Locate artefacts and read results

> "Find the JUnit XML results for the run that just completed and summarise any failures."

The AI uses `provar.testrun.report.locate` to resolve the artefact paths, then reads the JUnit XML to extract failure details.

### Knowledge check

1. What does `provar.automation.compile` do, and when is it necessary?
   _(It compiles Java Page Object and Page Control source files into class files. It is necessary after any Page Object is created or modified — Provar Automation executes the compiled `.class` files, not the `.java` source)_
2. Why does a Quality Hub test run use a polling loop rather than waiting synchronously?
   _(Quality Hub runs are executed on a remote grid and can take minutes to hours. The MCP tools invoke `sf` CLI subprocesses synchronously, so a long-running run would block the entire AI conversation. Polling with `provar.qualityhub.testrun.report` lets the AI check in periodically and report status without blocking)_
3. Where does `provar.testrun.report.locate` look for report artefacts?
   _(It searches the project's `Results/` directory for the most recent JUnit XML and HTML report files written by the last Provar Automation test run)_

---

## Module 8: Root Cause Analysis and Defect Creation

**Learning objectives**

- Use `provar.testrun.rca` to classify test failures
- Distinguish pre-existing issues from new regressions
- Create a Quality Hub defect from a failed test execution

### Lab 8.1 — Classify failures after a run

After a test run with failures:

> "Analyse the test run that just completed. Classify each failure — which are likely pre-existing issues and which look like new regressions? What Page Objects were involved?"

**What to observe:**

- Failures categorised by type: environment issue, locator failure, assertion failure, timeout, etc.
- Pre-existing issues (failures that appear in historical runs) distinguished from new failures
- Page Objects referenced in failures called out for targeted review

### Lab 8.2 — Create a defect in Quality Hub

> "The test 'LoginTest' failed with an assertion error on the Account Name field. Create a defect in Quality Hub for it, tagged to the 'Regression' test project."

The AI uses `provar.qualityhub.defect.create` to raise the defect without you leaving the chat session.

### Knowledge check

1. What information does `provar.testrun.rca` use to classify failures as pre-existing vs new?
   _(It reads the JUnit XML results from the completed run, analyses failure messages and stack traces, and cross-references them against the test case history and Page Objects involved to identify patterns that suggest a pre-existing flake vs a newly introduced failure)_
2. What is required in Quality Hub before you can create a defect from an MCP tool call?
   _(The Quality Hub org must be connected via `provar.qualityhub.connect` (or `sf provar quality-hub connect`) in the current session, and the test project you're filing against must already exist in Quality Hub)_

---

## Module 9: Test Plan Management

**Learning objectives**

- Add a test case to an existing test plan using the AI
- Create a new test suite inside a plan
- Remove a test instance that is no longer needed

### Lab 9.1 — Wire a test case into a plan

After generating a new test case in Module 5:

> "Add the test case at `/path/to/project/tests/smoke/CreateNewContact.testcase` to the test plan 'Smoke Tests', under the suite 'Contact Management'. Create the instance file at `/path/to/project/plans/SmokeTests/ContactManagement/CreateNewContact.testinstance`."

The AI uses `provar.testplan.add-instance` to write the `.testinstance` file with the correct `testCasePath` attribute.

### Lab 9.2 — Create a new suite in a plan

> "Create a new test suite called 'Account Management' inside the 'Smoke Tests' plan at `/path/to/project/plans/SmokeTests/AccountManagement/`."

### Lab 9.3 — Validate the plan after changes

> "Now validate the 'Smoke Tests' plan and confirm coverage has improved."

### Knowledge check

1. What file type does `provar.testplan.add-instance` create, and what key attribute does it contain?
   _(A `.testinstance` file. The key attribute is `testCasePath`, which holds the relative path to the `.testcase` file being wired into the plan)_
2. After adding test instances to a plan, how does that affect the `coverage_percent` reported by `provar.project.inspect`?
   _(The newly wired test cases move from `uncovered_test_case_paths` to `covered_test_case_paths`, increasing the `coverage_percent` value)_

---

## Module 10: Putting It All Together

**Learning objectives**

- Execute a full end-to-end workflow from project inspection to validated artefacts and test execution
- Combine multiple MCP tools in a single AI conversation

### Lab 10.1 — The full workflow

Work through this sequence in a single AI conversation:

1. **Inspect** — Ask the AI to inspect your project and identify 2–3 coverage gaps
2. **Generate** — Have the AI create a Page Object and a test case for one of those gaps
3. **Validate** — Validate both artefacts and fix any issues the AI finds
4. **Plan** — Add the new test case to an existing test plan
5. **Run** — Load the properties file, compile, and run the tests
6. **Report** — Ask the AI to summarise the run and flag any failures

### Lab 10.2 — Reflect on the AI loop

After completing the workflow, consider:

- How many CLI commands did you avoid typing?
- At which step did the AI's suggestions most closely match what you would have done manually?
- Where did you need to correct the AI or provide more context?

---

## Course summary

You have now covered the full Provar MCP feature set:

| Area               | Key tools                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Project awareness  | `provar.project.inspect`, `provar.project.validate`                                                               |
| Quality validation | `provar.testcase.validate`, `provar.pageobject.validate`, `provar.testsuite.validate`, `provar.testplan.validate` |
| Test authoring     | `provar.pageobject.generate`, `provar.testcase.generate`                                                          |
| Run configuration  | `provar.properties.generate`, `provar.properties.set`, `provar.automation.config.load`                            |
| Test execution     | `provar.automation.testrun`, `provar.qualityhub.testrun`, `provar.testrun.report.locate`                          |
| Failure analysis   | `provar.testrun.rca`, `provar.qualityhub.defect.create`                                                           |
| Plan management    | `provar.testplan.add-instance`, `provar.testplan.create-suite`, `provar.testplan.remove-instance`                 |

## Frequently asked questions

**Do I need a new license for Provar MCP?**
No. Your existing Provar Automation license covers MCP usage. The MCP server reads your IDE license automatically.

**Can I use Provar MCP without an existing Provar project?**
The AI can generate new artefacts (Page Objects, test cases, properties files) from scratch, but project-level tools like `provar.project.inspect` and `provar.project.validate` require a project directory with at least a `.testproject` file. We recommend starting from an existing project.

**Will the AI send my project files to Provar?**
No. The MCP server runs entirely on your local machine. File contents pass between the server and your AI client only (e.g. Claude Desktop, which runs locally). No data is sent to Provar's servers.

**Is the AI making changes to my project automatically?**
Generation tools write files only when you provide an `output_path` and do not use `dry_run`. If you're unsure, ask the AI to show you the content first (dry run), then confirm before writing.

**Provar MCP is labelled Beta — is it production-ready?**
Beta means the core feature set is complete and we are gathering feedback. It is suitable for use on real projects, but some edge cases may be rough. Please report issues at [github.com/ProvarTesting/provardx-cli/issues](https://github.com/ProvarTesting/provardx-cli/issues). GA is coming soon.
