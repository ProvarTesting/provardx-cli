# Provar MCP Server

The Provar DX CLI ships with a built-in **Model Context Protocol (MCP) server** that exposes Provar tools to AI assistants such as Claude Desktop, Claude Code, and Cursor. The server lets an AI agent inspect your Provar project, generate Page Objects and test cases, and validate every level of the test hierarchy — all from inside your AI chat session.

---

## Table of Contents

- [Starting the server](#starting-the-server)
- [Client configuration](#client-configuration)
  - [Claude Desktop](#claude-desktop)
  - [Claude Code](#claude-code)
  - [Cursor / other MCP clients](#cursor--other-mcp-clients)
- [Path security](#path-security)
- [Available tools](#available-tools)
  - [provardx.ping](#provardxping)
  - [provar.project.inspect](#provarprojectinspect)
  - [provar.pageobject.generate](#provarpageobjectgenerate)
  - [provar.pageobject.validate](#provarpageobjectvalidate)
  - [provar.testcase.generate](#provartestcasegenerate)
  - [provar.testcase.validate](#provartestcasevalidate)
  - [provar.testsuite.validate](#provartestsuitevalidate)
  - [provar.testplan.validate](#provartestplanvalidate)
  - [provar.project.validate](#provarprojectvalidate)
  - [provar.properties.generate](#provarpropertiesgenerate)
  - [provar.properties.read](#provarpropertiesread)
  - [provar.properties.set](#provarpropertiesset)
  - [provar.properties.validate](#provarpropertiesvalidate)
  - [provar.ant.generate](#provarantgenerate)
  - [provar.ant.validate](#provarantvalidate)
  - [provar.qualityhub.connect](#provarqualityhubconnect)
  - [provar.qualityhub.display](#provarqualityhubdisplay)
  - [provar.qualityhub.testrun](#provarqualityhubtestrun)
  - [provar.qualityhub.testrun.report](#provarqualityhubtestrunreport)
  - [provar.qualityhub.testrun.abort](#provarqualityhubtestrunabort)
  - [provar.qualityhub.testcase.retrieve](#provarqualityhubtestcaseretrieve)
  - [provar.automation.setup](#provarautomationsetup)
  - [provar.automation.testrun](#provarautomationtestrun)
  - [provar.automation.compile](#provarautomationcompile)
  - [provar.automation.config.load](#provarautomationconfigload)
  - [provar.automation.metadata.download](#provarautomationmetadatadownload)
  - [provar.qualityhub.defect.create](#provarqualityhubdefectcreate)
  - [provar.testrun.report.locate](#provartestrunreportlocate)
  - [provar.testrun.rca](#provartestrunrca)
  - [provar.testplan.add-instance](#provartestplanadinstance)
  - [provar.testplan.create-suite](#provartestplancreatetsuite)
  - [provar.testplan.remove-instance](#provartestplanremoveinstance)
  - [NitroX — Hybrid Model page objects](#nitrox--hybrid-model-page-objects)
    - [provar.nitrox.discover](#provarnitroxdiscover)
    - [provar.nitrox.read](#provarnitroxread)
    - [provar.nitrox.validate](#provarnitroxvalidate)
    - [provar.nitrox.generate](#provarnitroxgenerate)
    - [provar.nitrox.patch](#provarnitroxpatch)
- [AI loop pattern](#ai-loop-pattern)
- [Quality scores explained](#quality-scores-explained)
- [API compatibility — `xml` vs `xml_content`](#api-compatibility--xml-vs-xml_content)

---

## Prerequisites

- **Node.js 18–24** (LTS 22 recommended). Node 25+ is not supported — a transitive dependency (`buffer-equal-constant-time`) crashes on startup. Check with `node --version`.
- **Salesforce CLI** (`sf`) ≥ 2.x
- **Provar Automation IDE** installed with an activated license (see [License requirement](#license-requirement) below)

## Quick start

```sh
# 1. Install the plugin
sf plugins install @provartesting/provardx-cli@beta

# 2. (Optional) Authenticate for full 170+ rule validation
sf provar auth login

# 3. Connect your AI assistant — pick one client below
```

**Claude Code** (one-time, works across all your projects):

```sh
claude mcp add provar -s user -- sf provar mcp start --allowed-paths /path/to/your/provar/project
```

**Claude Desktop** — edit your config file, then restart the app:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

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

> **Windows (Claude Desktop):** If `sf` is not found, use `sf.cmd` as the command instead.

**Verify it's working** — ask your AI assistant: _"Call provardx.ping with message hello"_. You should get `{ "message": "hello" }` back.

---

## License requirement

The MCP server requires **Provar Automation IDE** to be installed on the same machine with an activated license. At startup the server reads `~/Provar/.licenses/*.properties` and verifies that at least one license is in the `Activated` state and was last verified online within the past 48 hours.

If the license check fails, the server exits with a clear error message explaining the reason (not found, stale, or expired). Open Provar Automation IDE to refresh the license online, then retry.

---

## Starting the server

```sh
sf provar mcp start
```

The server communicates over **stdio** (standard input / output). It must be started by your MCP client — do not run it interactively in a terminal.

### Flags

| Flag              | Alias | Default                   | Description                                                                                                       |
| ----------------- | ----- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `--allowed-paths` | `-a`  | Current working directory | Base directories that file-system tools are permitted to read and write. Repeat the flag to allow multiple paths. |

```sh
# Allow access to a specific project directory
sf provar mcp start --allowed-paths /workspace/my-provar-project

# Allow multiple directories
sf provar mcp start -a /workspace/project-a -a /workspace/project-b
```

> **Note:** `--json` is intentionally disabled on this command. stdout is reserved for MCP JSON-RPC messages; all internal logging goes to stderr.

---

## Client configuration

### Claude Code

The simplest approach is the `claude mcp add` CLI command:

```sh
# User-scoped — works across all your projects
claude mcp add provar -s user -- sf provar mcp start --allowed-paths /path/to/your/provar/project

# Project-scoped, shared — creates .mcp.json in project root (commit to source control)
claude mcp add provar -s project -- sf provar mcp start --allowed-paths /path/to/your/provar/project

# Project-scoped, private — stored in .claude/settings.local.json (not committed)
claude mcp add provar -s local -- sf provar mcp start --allowed-paths /path/to/your/provar/project
```

You can also edit `.mcp.json` at your project root directly for the shared project config:

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

### Claude Desktop

Add a `provar` entry to your Claude Desktop MCP configuration file.

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
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

> **Windows:** If `sf` is not found, use `sf.cmd` as the command. Claude Desktop may not inherit the full shell PATH, so `sf.cmd` (the npm-installed wrapper) is more reliable.

Restart Claude Desktop after saving the file. The Provar tools will appear in the tool list.

### Cursor / other MCP clients

Any MCP client that supports the **stdio transport** can use this server. Point `command` at `sf` (or the full path to the Salesforce CLI binary) and pass `["provar", "mcp", "start"]` as arguments, plus `--allowed-paths` as appropriate for your project layout.

---

## Authentication — Quality Hub API

The `provar.testcase.validate` tool can run in two modes depending on whether an API key is configured.

| Mode                | When               | What you get                                        |
| ------------------- | ------------------ | --------------------------------------------------- |
| **Quality Hub API** | API key configured | 170+ rules, quality score, tier-specific thresholds |
| **Local only**      | No key             | Structural/schema rules only                        |

The `validation_source` field in every `provar.testcase.validate` response tells you which mode fired:

| Value            | Meaning                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `quality_hub`    | Full API validation — key is valid and the API responded                                          |
| `local`          | No key configured — local rules only                                                              |
| `local_fallback` | Key is configured but the API was unreachable or returned an error — local rules used as fallback |

When `validation_source` is `local_fallback`, a `validation_warning` field is also returned explaining why.

### Configuring an API key

**Don't have an account?** Request access at the self-service form:  
<https://aqqlrlhga7.execute-api.us-east-1.amazonaws.com/dev/auth/request-access>

**Interactive login (recommended):**

```sh
sf provar auth login
```

Opens a browser to the Provar login page. After you authenticate, the key is stored automatically at `~/.provar/credentials.json`.

**Check current status:**

```sh
sf provar auth status
```

**CI/CD — environment variable:**

```sh
export PROVAR_API_KEY=pv_k_your_key_here
```

The env var takes priority over any stored key. Keys must start with `pv_k_` — any other value is ignored.

**Rotate stored key (no browser required):**

```sh
sf provar auth rotate
```

**Remove stored key:**

```sh
sf provar auth clear
```

### Environment variables

| Variable                 | Purpose                               | Default                                           |
| ------------------------ | ------------------------------------- | ------------------------------------------------- |
| `PROVAR_API_KEY`         | API key for Quality Hub validation    | None — falls back to `~/.provar/credentials.json` |
| `PROVAR_QUALITY_HUB_URL` | Override the Quality Hub API base URL | Dev API Gateway URL (`/dev`)                      |

---

## Path security

All file-system operations (read, write, generate) are restricted to the paths supplied via `--allowed-paths`. Any attempt to access a path outside those roots is rejected with a `PATH_NOT_ALLOWED` error. Path traversal sequences (`../`) are blocked with a `PATH_TRAVERSAL` error.

Symlinks are resolved via `fs.realpathSync` before the containment check, so a symlink inside an allowed directory that points outside it cannot bypass the restriction. For tools that accept multiple path inputs (such as `provar.ant.generate`'s `provar_home`, `project_path`, and `results_path`), all path fields are validated before any file operation occurs — not just the output path.

---

## Available tools

### `provardx.ping`

A lightweight sanity-check tool. Echoes back the message you send. Useful for verifying the server is running and the client is connected.

**Input**

| Parameter | Type   | Required | Description           |
| --------- | ------ | -------- | --------------------- |
| `message` | string | no       | Any text to echo back |

**Output** — `{ message: string }`

---

### `provar.project.inspect`

Inspects a Provar project folder and returns a structured inventory of all key project artefacts. Compiled `bin/` directories are automatically excluded.

**Input**

| Parameter      | Type   | Required | Description                              |
| -------------- | ------ | -------- | ---------------------------------------- |
| `project_path` | string | yes      | Absolute path to the Provar project root |

**Output** — JSON object containing:

| Field                         | Description                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `provar_home`                 | The Provar installation path, or `null` if not found                                                                                 |
| `provar_home_source`          | Where the value came from: `"PROVAR_HOME environment variable"`, `"provardx-properties.json (<rel>)"`, or `"ANT build file (<rel>)"` |
| `provardx_properties_files`   | Relative paths to any `provardx-properties.json` files found (ProvarDX CLI run configs)                                              |
| `ant_build_files`             | Relative paths to `build.xml` and `.properties` files in any `ANT/` directory (pipeline/CLI build configs)                           |
| `source_page_object_dirs`     | `src/pageobjects` directories only — compiled `bin/pageobjects` is excluded                                                          |
| `test_suite_dirs`             | Top-level suite folder names directly under `tests/`                                                                                 |
| `test_case_files`             | Relative paths to all `.testcase` files found recursively under `tests/` (display-capped at 500; full set used for coverage)         |
| `custom_test_step_file_count` | Number of `.java` / `.groovy` / `.jar` files in any `src/customapis/` directory                                                      |
| `data_source_dirs`            | `data/` and `templates/` directories found                                                                                           |
| `data_source_file_count`      | Number of data files (`.csv`, `.xlsx`, `.xls`, `.json`) across all data source dirs                                                  |
| `test_plan_coverage`          | Plan coverage object (see below)                                                                                                     |
| `summary`                     | Counts for every category above, including `coverage_percent`                                                                        |

**`test_plan_coverage` object:**

Provar test plans live in `plans/`. Each plan is a directory containing a `.planitem` definition file and `.testinstance` files (or nested suite sub-directories) that each reference one `.testcase` via the `testCasePath` attribute.

| Field                       | Description                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `test_plan_count`           | Number of test plans (directories at depth 1 under `plans/` containing a `.planitem`) |
| `test_suite_count`          | Number of test suites (`.planitem` directories nested inside a plan)                  |
| `test_instance_count`       | Total number of `.testinstance` files across all plans and suites                     |
| `covered_test_case_paths`   | Sorted list of `.testcase` paths referenced by at least one `.testinstance`           |
| `uncovered_test_case_paths` | Sorted list of `.testcase` paths **not** referenced by any plan — gaps in coverage    |
| `coverage_percent`          | `round(covered / total_test_cases × 100)`                                             |

---

### `provar.pageobject.generate`

Generates a Java Page Object skeleton with the correct `@Page` or `@SalesforcePage` annotation and `@FindBy` field stubs.

**Input**

| Parameter                   | Type                                                   | Required | Description                                              |
| --------------------------- | ------------------------------------------------------ | -------- | -------------------------------------------------------- |
| `class_name`                | string                                                 | yes      | PascalCase Java class name (e.g. `AccountDetailPage`)    |
| `package_name`              | string                                                 | yes      | Java package (e.g. `pageobjects.accounts`)               |
| `page_type`                 | `standard` \| `salesforce`                             | yes      | Generates `@Page` or `@SalesforcePage` annotation        |
| `title`                     | string                                                 | no       | Page title for the annotation                            |
| `connection_name`           | string                                                 | no       | Salesforce connection name (for `@SalesforcePage`)       |
| `salesforce_page_attribute` | string                                                 | no       | Additional Salesforce page attribute                     |
| `fields`                    | array of `{ name, type, locator_type, locator_value }` | no       | WebElement field definitions                             |
| `output_path`               | string                                                 | no       | Full file path to write (must be within `allowed-paths`) |
| `overwrite`                 | boolean                                                | no       | Overwrite existing file (default: `false`)               |
| `dry_run`                   | boolean                                                | no       | Return content without writing to disk                   |
| `idempotency_key`           | string                                                 | no       | Prevents duplicate generation for the same key           |

**Output** — `{ content: string, file_path?: string, written: boolean }`

---

### `provar.pageobject.validate`

Validates a Java Page Object source file against 30+ quality rules (structural correctness, annotation completeness, locator best practices).

**Input**

| Parameter             | Type   | Required | Description                                         |
| --------------------- | ------ | -------- | --------------------------------------------------- |
| `content`             | string | yes      | Full Java source code                               |
| `file_path`           | string | no       | Path to the `.java` file (for context)              |
| `expected_class_name` | string | no       | Expected class name (triggers PO_006 if mismatched) |

**Output**

| Field           | Type           | Description                                           |
| --------------- | -------------- | ----------------------------------------------------- |
| `is_valid`      | boolean        | `true` if zero errors                                 |
| `quality_score` | number (0–100) | Weighted quality score                                |
| `error_count`   | integer        | Number of ERROR-severity issues                       |
| `warning_count` | integer        | Number of WARNING-severity issues                     |
| `class_name`    | string         | Detected class name                                   |
| `package_name`  | string         | Detected package name                                 |
| `field_count`   | integer        | Number of `@FindBy` WebElement fields                 |
| `issues`        | array          | Full issue list with `rule_id`, `severity`, `message` |

**Key rules checked:** PO_001 (missing package), PO_003 (missing class), PO_004 (non-PascalCase class name), PO_006 (class name mismatch), PO_036 (invalid element type), PO_060 (mismatched braces), PO_071–PO_073 (fragile XPath patterns).

---

### `provar.testcase.generate`

Generates an XML test case skeleton with UUID v4 guids and sequential `testItemId` values.

**Input**

| Parameter         | Type                                    | Required | Description                                         |
| ----------------- | --------------------------------------- | -------- | --------------------------------------------------- |
| `test_case_name`  | string                                  | yes      | Human-readable test case name                       |
| `test_case_id`    | string                                  | no       | Custom test case ID (auto-generated if omitted)     |
| `steps`           | array of `{ api_id, name, arguments? }` | no       | Step definitions                                    |
| `output_path`     | string                                  | no       | File path to write (must be within `allowed-paths`) |
| `overwrite`       | boolean                                 | no       | Overwrite existing file (default: `false`)          |
| `dry_run`         | boolean                                 | no       | Return XML without writing to disk                  |
| `idempotency_key` | string                                  | no       | Prevents duplicate generation for the same key      |

**Output** — `{ content: string, file_path?: string, written: boolean }`

---

### `provar.testcase.validate`

Validates an XML test case for schema correctness (validity score) and best practices (quality score). The quality score uses the exact same weighted-deduction formula as the Provar Quality Hub Lambda service, guaranteeing score parity between the MCP and API surfaces.

**Input**

| Parameter   | Type   | Required                                    | Description                                    |
| ----------- | ------ | ------------------------------------------- | ---------------------------------------------- |
| `content`   | string | one of `content`/`xml`/`file_path` required | XML content to validate (MCP field name)       |
| `xml`       | string | one of `content`/`xml`/`file_path` required | XML content to validate (API-compatible alias) |
| `file_path` | string | one of `content`/`xml`/`file_path` required | Path to the `.testcase` XML file               |

**Output**

| Field                            | Type           | Description                                                                                            |
| -------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| `is_valid`                       | boolean        | `true` if zero ERROR-level schema violations                                                           |
| `validity_score`                 | number (0–100) | Schema compliance score (100 − errorCount × 20)                                                        |
| `quality_score`                  | number (0–100) | Best-practices score (weighted deduction formula)                                                      |
| `error_count`                    | integer        | Schema error count                                                                                     |
| `warning_count`                  | integer        | Schema warning count                                                                                   |
| `step_count`                     | integer        | Number of `<apiCall>` steps                                                                            |
| `test_case_id`                   | string         | Value of the `id` attribute                                                                            |
| `test_case_name`                 | string         | Value of the `name` attribute                                                                          |
| `issues`                         | array          | Schema issues with `rule_id`, `severity`, `message`                                                    |
| `best_practices_violations`      | array          | Best-practices violations with `rule_id`, `severity`, `weight`, `message`                              |
| `best_practices_rules_evaluated` | integer        | How many best-practices rules were checked                                                             |
| `validation_source`              | string         | `quality_hub`, `local`, or `local_fallback` — see Authentication section                               |
| `validation_warning`             | string         | Present when `validation_source` is `local` (onboarding) or `local_fallback` (explains why API failed) |

**Key schema rules:** TC_001 (missing XML declaration), TC_002 (malformed XML), TC_003 (wrong root element), TC_010/011/012 (missing/invalid id/guid), TC_031 (invalid apiCall guid), TC_034/035 (non-integer testItemId).

---

### `provar.testsuite.validate`

Validates a Provar test suite — checks for empty suites, duplicate names (within the suite), oversized suites (>75 test cases), and naming convention consistency. Recursively validates child suites and individual test case XML.

**Input**

| Parameter           | Type           | Required | Description                                                                                                  |
| ------------------- | -------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `suite_name`        | string         | yes      | Name of the test suite                                                                                       |
| `test_cases`        | array          | no       | Test cases directly in this suite. Each item: `{ name, xml_content \| xml }`                                 |
| `child_suites`      | array          | no       | Child suites (up to 2 levels of nesting). Each item: `{ name, test_cases?, test_suites?, test_case_count? }` |
| `test_case_count`   | integer        | no       | Override total count for the size check (useful when not sending full XML)                                   |
| `quality_threshold` | number (0–100) | no       | Minimum quality score for a test case to be "valid" (default: 80)                                            |

**Output** — `{ name, level: "suite", quality_score, violations[], test_cases[], test_suites[], summary }`

**Violation rule IDs:** SUITE-EMPTY-001, SUITE-DUP-001, SUITE-DUP-002, SUITE-SIZE-001, SUITE-NAMING-001, SUITE-NAMING-002

---

### `provar.testplan.validate`

Validates a Provar test plan — checks for empty plans, duplicate suite names, oversized plans (>20 suites), plan-completeness metadata, and naming consistency. Recursively validates suites and test cases.

**Input**

| Parameter           | Type           | Required | Description                             |
| ------------------- | -------------- | -------- | --------------------------------------- |
| `plan_name`         | string         | yes      | Name of the test plan                   |
| `test_suites`       | array          | no       | Test suites in this plan                |
| `test_cases`        | array          | no       | Test cases directly in this plan        |
| `test_suite_count`  | integer        | no       | Override suite count for the size check |
| `metadata`          | object         | no       | Plan completeness metadata (see below)  |
| `quality_threshold` | number (0–100) | no       | Minimum quality score (default: 80)     |

**`metadata` fields**

| Field                  | Description                                |
| ---------------------- | ------------------------------------------ |
| `objectives`           | Testing objectives                         |
| `in_scope`             | Features / areas in scope                  |
| `testing_methodology`  | Approach (e.g. risk-based, regression)     |
| `acceptance_criteria`  | Criteria for test completion               |
| `acceptable_pass_rate` | Numeric pass-rate threshold (0–100)        |
| `environments`         | Target environments (e.g. `["QA", "UAT"]`) |
| `test_data_strategy`   | How test data is prepared and cleaned up   |
| `risks`                | Identified risks and mitigations           |

**Output** — `{ name, level: "plan", quality_score, violations[], test_suites[], test_cases[], summary }`

**Violation rule IDs:** PLAN-EMPTY-001, PLAN-DUP-001, PLAN-SIZE-001, PLAN-NAMING-001, PLAN-META-001 through PLAN-META-007

---

### `provar.project.validate`

Validates a Provar project directly from its directory on disk. Reads the plan/suite/testinstance hierarchy from `plans/`, resolves test case XML from `tests/`, extracts project context (connections, environments, secrets password) from the `.testproject` file, and runs the full cross-cutting rule set.

> **Use this tool for whole-project validation.** Pass `project_path` and let the server handle all file reading. Do not read individual test case files and pass XML content inline — this tool does that for you.

**Input**

| Parameter              | Type           | Required | Description                                                                                                          |
| ---------------------- | -------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `project_path`         | string         | yes      | Absolute path to the Provar project root (directory containing `.testproject`)                                       |
| `quality_threshold`    | number (0–100) | no       | Minimum quality score for a test case to be considered valid (default: 80)                                           |
| `save_results`         | boolean        | no       | Write a QH-compatible JSON report to `{project_path}/provardx/validation/` (default: true)                           |
| `results_dir`          | string         | no       | Override the output directory for the saved report (must be within `allowed-paths`)                                  |
| `include_plan_details` | boolean        | no       | Include full per-suite and per-test-case data in the response (default: false — keep false to avoid token explosion) |
| `max_uncovered`        | integer        | no       | Maximum uncovered test case paths to return (default: 20; set to `0` for none)                                       |
| `max_violations`       | integer        | no       | When `include_plan_details: true`, caps project violations returned (default: 50)                                    |

**Output** (slim mode, `include_plan_details: false`)

| Field                  | Description                                           |
| ---------------------- | ----------------------------------------------------- |
| `quality_score`        | Project quality score (0–100)                         |
| `coverage_percent`     | Percentage of test cases covered by at least one plan |
| `violation_summary`    | Map of `rule_id → count` for all violations found     |
| `plan_scores`          | Array of `{ name, quality_score }` per plan           |
| `uncovered_test_cases` | Uncovered test case paths (capped at `max_uncovered`) |
| `save_error`           | Present only if the results file could not be written |

When `include_plan_details: true`, the response additionally includes full `test_plans[]` with nested suite and per-test-case data.

**Violation rule IDs:** PROJ-EMPTY-001, PROJ-DUP-001, PROJ-DUP-002, PROJ-CALLABLE-001, PROJ-CALLABLE-002, PROJ-CONN-001, PROJ-ENV-001, PROJ-ENV-002, PROJ-SECRET-001

**Error codes:** `NOT_A_PROJECT`, `AMBIGUOUS_PROJECT`, `PATH_NOT_FOUND`, `PATH_NOT_ALLOWED`, `PATH_TRAVERSAL`

---

## Quality scores explained

Every validation tool returns one or two scores:

| Score            | Range | Description                                                                                        |
| ---------------- | ----- | -------------------------------------------------------------------------------------------------- |
| `validity_score` | 0–100 | Schema compliance. Deducts 20 points per ERROR. Reflects structural correctness.                   |
| `quality_score`  | 0–100 | Best-practices quality. Uses the same weighted-deduction formula as the Provar Quality Hub Lambda. |

### Scoring formula (best practices)

```
score = max(0, 100 − Σ( weight × severity_multiplier × effective_count ))

severity_multiplier:
  critical → 1.00
  major    → 0.75
  minor    → 0.50
  info     → 0.25

effective_count (diminishing returns):
  count = 1 → 1
  count > 1 → 1 + log₂(count)
```

This formula is identical to the Lambda service, ensuring that a test case receives the **same quality score** whether it is validated by the MCP server or by the Quality Hub API.

### Hierarchy scoring

Suite, plan, and project scores are computed as:

```
quality_score = max(0, avg(child_scores) − Σ(violation_deductions))
```

where `child_scores` are the quality scores of directly contained test cases and child suites.

---

## API compatibility — `xml` vs `xml_content`

Test case tools accept either field name for XML content:

| Field         | Used by               | Notes                                                         |
| ------------- | --------------------- | ------------------------------------------------------------- |
| `xml_content` | Provar MCP (original) | Full XML content of the test case                             |
| `xml`         | Quality Hub batch API | API-compatible alias; takes precedence when both are supplied |

Both names are accepted in all four validation tools (`provar.testcase.validate`, `provar.testsuite.validate`, `provar.testplan.validate`, `provar.project.validate`). This makes it straightforward to share request payloads between the REST API and the MCP surface without conversion.

---

### `provar.properties.generate`

Generates a `provardx-properties.json` file from the standard template. Placeholder values (`${...}`) are pre-filled where optional overrides are not provided.

**Input**

| Parameter      | Type    | Required | Description                                                           |
| -------------- | ------- | -------- | --------------------------------------------------------------------- |
| `output_path`  | string  | yes      | Where to write the file (must end in `.json`, within `allowed-paths`) |
| `project_path` | string  | no       | Pre-fill the `projectPath` field                                      |
| `provar_home`  | string  | no       | Pre-fill the `provarHome` field                                       |
| `results_path` | string  | no       | Pre-fill the `resultsPath` field                                      |
| `overwrite`    | boolean | no       | Overwrite existing file (default: `false`)                            |
| `dry_run`      | boolean | no       | Return content without writing to disk (default: `false`)             |

**Output** — `{ file_path, written, dry_run, content }`

**Error codes:** `FILE_EXISTS`, `INVALID_PATH`, `PATH_NOT_ALLOWED`, `PATH_TRAVERSAL`

---

### `provar.properties.read`

Reads and parses a `provardx-properties.json` file. Use this to inspect the current configuration before making changes with `provar.properties.set`.

**Input**

| Parameter   | Type   | Required | Description                                 |
| ----------- | ------ | -------- | ------------------------------------------- |
| `file_path` | string | yes      | Path to the `provardx-properties.json` file |

**Output** — `{ file_path, content }` where `content` is the parsed JSON object.

**Error codes:** `FILE_NOT_FOUND`, `MALFORMED_JSON`, `PATH_NOT_ALLOWED`

---

### `provar.properties.set`

Updates one or more fields in a `provardx-properties.json` file. Only the supplied fields are changed. Object fields (`environment`, `metadata`) are deep-merged; array fields (`testCase`, `testPlan`, `connectionOverride`) replace the existing value entirely.

**Input**

| Parameter   | Type   | Required | Description                         |
| ----------- | ------ | -------- | ----------------------------------- |
| `file_path` | string | yes      | Path to the file to update          |
| `updates`   | object | yes      | Fields to update (see schema below) |

**`updates` schema**

| Field                    | Type                                                             | Description                                              |
| ------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------- |
| `provarHome`             | string                                                           | Path to Provar installation directory                    |
| `projectPath`            | string                                                           | Path to the Provar test project root                     |
| `resultsPath`            | string                                                           | Path where test results will be written                  |
| `resultsPathDisposition` | `Increment` \| `Replace` \| `Fail`                               | Behaviour when results path already exists               |
| `testOutputLevel`        | `BASIC` \| `DETAILED` \| `DIAGNOSTIC`                            | Amount of test output logged                             |
| `pluginOutputlevel`      | `SEVERE` \| `WARNING` \| `INFO` \| `FINE` \| `FINER` \| `FINEST` | Plugin log verbosity                                     |
| `stopOnError`            | boolean                                                          | Abort test run on first failure                          |
| `excludeCallable`        | boolean                                                          | Omit callable test cases from execution                  |
| `testprojectSecrets`     | string                                                           | Encryption password for test project secrets             |
| `environment`            | object                                                           | `{ testEnvironment, webBrowser, webBrowserConfig, ... }` |
| `metadata`               | object                                                           | `{ metadataLevel, cachePath }`                           |
| `testCase`               | string[]                                                         | Specific test case file paths to run                     |
| `testPlan`               | string[]                                                         | Test plan names to run (wildcards permitted)             |
| `connectionOverride`     | `{ connection, username }[]`                                     | Override Provar connections with SFDX usernames          |

**Output** — `{ file_path, updated_fields, content }`

**Error codes:** `FILE_NOT_FOUND`, `MALFORMED_JSON`, `PATH_NOT_ALLOWED`

---

### `provar.properties.validate`

Validates a `provardx-properties.json` file against the ProvarDX schema. Checks required fields, valid enum values, and warns about unfilled `${PLACEHOLDER}` values. Accepts either a file path or inline JSON content.

**Input**

| Parameter   | Type   | Required                     | Description                    |
| ----------- | ------ | ---------------------------- | ------------------------------ |
| `file_path` | string | one of `file_path`/`content` | Path to the file to validate   |
| `content`   | string | one of `file_path`/`content` | Inline JSON string to validate |

**Output**

| Field           | Description                                     |
| --------------- | ----------------------------------------------- |
| `is_valid`      | `true` if no errors                             |
| `error_count`   | Number of validation errors                     |
| `warning_count` | Number of warnings (e.g. unfilled placeholders) |
| `issues`        | Array of `{ field, severity, message }`         |

**Error codes:** `MISSING_INPUT`, `FILE_NOT_FOUND`, `MALFORMED_JSON`, `PATH_NOT_ALLOWED`

---

### `provar.ant.generate`

Generates a Provar ANT `build.xml` file from structured inputs. Produces the standard `<project>` skeleton with `<taskdef>` declarations, `<Provar-Compile>`, and `<Run-Test-Case>`. Supports targeting tests by folder, test plan, or individual `.testcase` files.

**Input**

| Parameter                           | Type                                                                                      | Required | Default                                | Description                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------- | -------- | -------------------------------------- | --------------------------------------------------------------------- |
| `provar_home`                       | string                                                                                    | yes      | —                                      | Absolute path to the Provar installation directory                    |
| `project_path`                      | string                                                                                    | no       | `..`                                   | Path to the test project root (relative to the ANT folder)            |
| `results_path`                      | string                                                                                    | no       | `../ANT/Results`                       | Where test results are written                                        |
| `project_cache_path`                | string                                                                                    | no       | `../../.provarCaches`                  | Path to the `.provarCaches` directory                                 |
| `license_path`                      | string                                                                                    | no       | —                                      | Path to the Provar `.licenses` directory                              |
| `smtp_path`                         | string                                                                                    | no       | —                                      | Path to the Provar `.smtp` directory                                  |
| `filesets`                          | array                                                                                     | yes      | —                                      | One or more `{ dir, id?, includes? }` objects — see below             |
| `web_browser`                       | `Chrome` \| `Chrome_Headless` \| `Firefox` \| `Edge` \| `Edge_Legacy` \| `Safari` \| `IE` | no       | `Chrome`                               | Browser for test execution                                            |
| `web_browser_configuration`         | string                                                                                    | no       | `Full Screen`                          | Browser window configuration                                          |
| `web_browser_provider_name`         | string                                                                                    | no       | `Desktop`                              | Browser provider name                                                 |
| `web_browser_device_name`           | string                                                                                    | no       | `Full Screen`                          | Browser device name                                                   |
| `test_environment`                  | string                                                                                    | no       | `""`                                   | Named test environment (empty = default)                              |
| `salesforce_metadata_cache`         | `Reuse` \| `Refresh` \| `Reload`                                                          | no       | `Reuse`                                | Metadata cache strategy                                               |
| `results_path_disposition`          | `Increment` \| `Replace` \| `Reuse`                                                       | no       | `Increment`                            | How to handle an existing results folder                              |
| `test_output_level`                 | `BASIC` \| `WARNING` \| `DEBUG`                                                           | no       | `BASIC`                                | Test output verbosity                                                 |
| `plugin_output_level`               | `BASIC` \| `WARNING` \| `DEBUG`                                                           | no       | `WARNING`                              | Plugin output verbosity                                               |
| `stop_test_run_on_error`            | boolean                                                                                   | no       | `false`                                | Abort run on first failure                                            |
| `exclude_callable_test_cases`       | boolean                                                                                   | no       | `true`                                 | Skip callable (library) test cases                                    |
| `dont_fail_build`                   | boolean                                                                                   | no       | —                                      | Prevent ANT build failure even when tests fail                        |
| `invoke_test_run_monitor`           | boolean                                                                                   | no       | `true`                                 | Enable the Provar test run monitor                                    |
| `secrets_password`                  | string                                                                                    | no       | `${env.ProvarSecretsPassword}`         | Secrets store password                                                |
| `test_environment_secrets_password` | string                                                                                    | no       | `${env.ProvarSecretsPassword_EnvName}` | Per-environment secrets password                                      |
| `test_cycle_path`                   | string                                                                                    | no       | —                                      | Path to a TestCycle folder                                            |
| `test_cycle_run_type`               | `ALL` \| `FAILED` \| `NEW`                                                                | no       | —                                      | Which tests in the cycle to run                                       |
| `plan_features`                     | array of `{ name, type, enabled }`                                                        | no       | —                                      | Output/notification features (PDF, PIECHART, EMAIL, JUNIT)            |
| `email_properties`                  | object                                                                                    | no       | —                                      | Email notification settings (omit to exclude `<emailProperties>`)     |
| `attachment_properties`             | object                                                                                    | no       | —                                      | Report attachment settings (omit to exclude `<attachmentProperties>`) |
| `output_path`                       | string                                                                                    | no       | —                                      | Where to write the `build.xml` file                                   |
| `overwrite`                         | boolean                                                                                   | no       | `false`                                | Overwrite if `output_path` already exists                             |
| `dry_run`                           | boolean                                                                                   | no       | `true`                                 | `true` = return XML only; `false` = write to `output_path`            |

**Fileset objects**

Each fileset maps to a `<fileset>` element inside `<Run-Test-Case>`:

| Field      | Description                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| `dir`      | Directory path (relative or absolute)                                                                |
| `id`       | Optional fileset id — use `"testplan"` when pointing at a plans folder, `"testcases"` for test cases |
| `includes` | Optional list of specific `.testcase` or `.testplan` file names — omit to run everything in `dir`    |

Examples:

- Run all tests in a folder: `{ dir: "../tests" }`
- Run a specific test plan: `{ id: "testplan", dir: "../plans/Smoke" }`
- Run specific test cases: `{ dir: "../tests/Accounts", includes: ["CreateAccount.testcase"] }`

**Output** — `{ xml_content, file_path?, written, dry_run }`

**Error codes:** `FILE_EXISTS`, `PATH_NOT_ALLOWED`, `PATH_TRAVERSAL`, `GENERATE_ERROR`

---

### `provar.ant.validate`

Validates a Provar ANT `build.xml` for structural correctness. Accepts either a file path or inline XML content.

**Input**

| Parameter   | Type   | Required                     | Description                    |
| ----------- | ------ | ---------------------------- | ------------------------------ |
| `content`   | string | one of `content`/`file_path` | Inline XML content to validate |
| `file_path` | string | one of `content`/`file_path` | Path to the `build.xml` file   |

**Output**

| Field              | Type           | Description                                                                       |
| ------------------ | -------------- | --------------------------------------------------------------------------------- |
| `is_valid`         | boolean        | `true` if zero ERROR-level issues                                                 |
| `validity_score`   | number (0–100) | Schema compliance score (100 − errorCount × 20)                                   |
| `provar_home`      | string \| null | Value of `provarHome` attribute detected in `<Run-Test-Case>`                     |
| `project_path`     | string \| null | Value of `projectPath` attribute                                                  |
| `results_path`     | string \| null | Value of `resultsPath` attribute                                                  |
| `web_browser`      | string \| null | Value of `webBrowser` attribute                                                   |
| `test_environment` | string \| null | Value of `testEnvironment` attribute                                              |
| `fileset_count`    | integer        | Number of `<fileset>` children of `<Run-Test-Case>`                               |
| `error_count`      | integer        | Number of ERROR-severity issues                                                   |
| `warning_count`    | integer        | Number of WARNING-severity issues                                                 |
| `issues`           | array          | Full issue list with `rule_id`, `severity`, `message`, `applies_to`, `suggestion` |

**Validation rules checked:**

| Rule ID   | Severity | Description                                               |
| --------- | -------- | --------------------------------------------------------- |
| `ANT_001` | WARNING  | Missing XML declaration                                   |
| `ANT_002` | ERROR    | Malformed XML                                             |
| `ANT_003` | ERROR    | Root element is not `<project>`                           |
| `ANT_004` | ERROR    | `<project>` missing `default` attribute                   |
| `ANT_005` | ERROR    | Missing `<taskdef>` for `CompileTask` or `RunnerTask`     |
| `ANT_006` | ERROR    | Default target name not found in `<project>`              |
| `ANT_007` | ERROR    | No `<target>` elements present                            |
| `ANT_010` | WARNING  | No `<Provar-Compile>` step in the default target          |
| `ANT_020` | ERROR    | No `<Run-Test-Case>` element in the default target        |
| `ANT_021` | ERROR    | `<Run-Test-Case>` missing `provarHome` attribute          |
| `ANT_022` | ERROR    | `<Run-Test-Case>` missing `projectPath` attribute         |
| `ANT_023` | ERROR    | `<Run-Test-Case>` missing `resultsPath` attribute         |
| `ANT_030` | WARNING  | `webBrowser` value not in the recognised set              |
| `ANT_031` | WARNING  | `salesforceMetadataCache` value not in the recognised set |
| `ANT_032` | WARNING  | `testOutputlevel` value not in the recognised set         |
| `ANT_033` | WARNING  | `resultsPathDisposition` value not in the recognised set  |
| `ANT_040` | ERROR    | `<Run-Test-Case>` has no `<fileset>` children             |
| `ANT_041` | ERROR    | A `<fileset>` is missing the required `dir` attribute     |

**Error codes:** `MISSING_INPUT`, `FILE_NOT_FOUND`, `PATH_NOT_ALLOWED`, `VALIDATE_ERROR`

---

### `provar.qualityhub.connect`

Connects to a Provar Quality Hub org. Invokes `sf provar quality-hub connect` via the Salesforce CLI.

> **Prerequisite:** The org must already be authorised in the SF CLI (`sf org login web` or `sf org login jwt`).

**Input**

| Parameter    | Type     | Required | Description                         |
| ------------ | -------- | -------- | ----------------------------------- |
| `target_org` | string   | yes      | SF CLI org alias or username        |
| `flags`      | string[] | no       | Additional raw CLI flags to forward |

**Output** — `{ requestId, exitCode, stdout, stderr }`

**Error codes:** `QH_CONNECT_FAILED`, `SF_NOT_FOUND`

---

### `provar.qualityhub.display`

Displays information about the currently connected Quality Hub org. Invokes `sf provar quality-hub display`.

**Input**

| Parameter    | Type     | Required | Description                                |
| ------------ | -------- | -------- | ------------------------------------------ |
| `target_org` | string   | no       | SF CLI org alias (uses default if omitted) |
| `flags`      | string[] | no       | Additional raw CLI flags                   |

**Output** — `{ requestId, exitCode, stdout, stderr }`

---

### `provar.qualityhub.testrun`

Triggers a Quality Hub test run. Invokes `sf provar quality-hub test run`. Returns the test run ID which can be passed to `provar.qualityhub.testrun.report` to poll for results.

**Input**

| Parameter    | Type     | Required | Description                                                                   |
| ------------ | -------- | -------- | ----------------------------------------------------------------------------- |
| `target_org` | string   | yes      | SF CLI org alias or username                                                  |
| `flags`      | string[] | no       | Additional raw CLI flags (e.g. `["--configuration-file", "config/run.json"]`) |

**Output** — `{ requestId, exitCode, stdout, stderr }`

**Error codes:** `QH_TESTRUN_FAILED`, `SF_NOT_FOUND`

---

### `provar.qualityhub.testrun.report`

Polls the status of an in-progress or completed Quality Hub test run. Invokes `sf provar quality-hub test run report`.

**Input**

| Parameter    | Type     | Required | Description                                                   |
| ------------ | -------- | -------- | ------------------------------------------------------------- |
| `target_org` | string   | yes      | SF CLI org alias or username                                  |
| `run_id`     | string   | yes      | Test run ID returned by `provar.qualityhub.testrun`           |
| `flags`      | string[] | no       | Additional raw CLI flags (e.g. `["--result-format", "json"]`) |

**Output** — `{ requestId, exitCode, stdout, stderr }`

**Error codes:** `QH_REPORT_FAILED`, `SF_NOT_FOUND`

---

### `provar.qualityhub.testrun.abort`

Aborts an in-progress Quality Hub test run. Invokes `sf provar quality-hub test run abort`.

**Input**

| Parameter    | Type     | Required | Description                  |
| ------------ | -------- | -------- | ---------------------------- |
| `target_org` | string   | yes      | SF CLI org alias or username |
| `run_id`     | string   | yes      | Test run ID to abort         |
| `flags`      | string[] | no       | Additional raw CLI flags     |

**Output** — `{ requestId, exitCode, stdout, stderr }`

**Error codes:** `QH_ABORT_FAILED`, `SF_NOT_FOUND`

---

### `provar.qualityhub.testcase.retrieve`

Retrieves test cases from Quality Hub by user story or metadata component. Invokes `sf provar quality-hub testcase retrieve`.

**Input**

| Parameter    | Type     | Required | Description                                                                          |
| ------------ | -------- | -------- | ------------------------------------------------------------------------------------ |
| `target_org` | string   | yes      | SF CLI org alias or username                                                         |
| `flags`      | string[] | no       | Additional raw CLI flags (e.g. `["--issues", "US-123", "--test-project", "MyProj"]`) |

**Output** — `{ requestId, exitCode, stdout, stderr }`

**Error codes:** `QH_RETRIEVE_FAILED`, `SF_NOT_FOUND`

---

### `provar.automation.setup`

Detects existing Provar Automation installations on the machine. If found, returns the install path so you can set `provarHome` in your properties file — without downloading anything. If no installation is found, invokes `sf provar automation setup` to download and install the binaries.

Checks in this order:

1. `PROVAR_HOME` environment variable
2. `./ProvarHome` (default CLI install location)
3. `C:\Program Files\Provar*` (Windows system installs)
4. `/Applications/Provar*` (macOS app installs)

**Input**

| Parameter | Type    | Required | Description                                                                   |
| --------- | ------- | -------- | ----------------------------------------------------------------------------- |
| `version` | string  | no       | Specific version to install (e.g. `"2.12.0"`). Omit for latest.               |
| `force`   | boolean | no       | Force a fresh download even if an installation is detected (default: `false`) |

**Output**

| Field               | Type           | Description                                                      |
| ------------------- | -------------- | ---------------------------------------------------------------- |
| `already_installed` | boolean        | `true` if an existing install was found and download was skipped |
| `installations`     | array          | All detected installs: `{ path, version, source }`               |
| `install_path`      | string         | Path to use for `provarHome`                                     |
| `version`           | string \| null | Detected or installed version                                    |
| `message`           | string         | Human-readable summary                                           |

After a successful setup, update `provarHome` in your `provardx-properties.json` using `provar.properties.set`.

**Error codes:** `AUTOMATION_SETUP_FAILED`, `SF_NOT_FOUND`

---

### `provar.automation.testrun`

Triggers a Provar Automation test run using the currently loaded properties file. Invokes `sf provar automation test run`. This is the **LOCAL Execute** step of the AI loop — for grid-managed runs use `provar.qualityhub.testrun`.

**Input**

| Parameter | Type     | Required | Description                                                              |
| --------- | -------- | -------- | ------------------------------------------------------------------------ |
| `flags`   | string[] | no       | Raw CLI flags to forward (e.g. `["--project-path", "/path/to/project"]`) |

**Output** — `{ requestId, exitCode, stdout, stderr }`

**Error codes:** `AUTOMATION_TESTRUN_FAILED`, `SF_NOT_FOUND`

---

### `provar.automation.compile`

Compiles PageObject and PageControl Java source files. Invokes `sf provar automation project compile`. Run this after generating or modifying Page Objects, before triggering a test run.

**Input**

| Parameter | Type     | Required | Description              |
| --------- | -------- | -------- | ------------------------ |
| `flags`   | string[] | no       | Raw CLI flags to forward |

**Output** — `{ requestId, exitCode, stdout, stderr }`

**Error codes:** `AUTOMATION_COMPILE_FAILED`, `SF_NOT_FOUND`

---

### `provar.automation.metadata.download`

Downloads Salesforce metadata into the Provar project cache. Invokes `sf provar automation metadata download`. Run this when you need up-to-date org metadata for Page Object generation or test execution.

**Input**

| Parameter | Type     | Required | Description                                                                   |
| --------- | -------- | -------- | ----------------------------------------------------------------------------- |
| `flags`   | string[] | no       | Raw CLI flags to forward (e.g. `["--connections", "MySalesforceConnection"]`) |

**Output** — `{ requestId, exitCode, stdout, stderr }`

**Error codes:** `AUTOMATION_METADATA_FAILED`, `SF_NOT_FOUND`

---

### `provar.qualityhub.defect.create`

Creates `Defect__c` records in Quality Hub for every failed test execution in a given test run. For each failure, creates a `Defect__c` (with description, step, browser, environment, and tester populated), then links it via `Test_Case_Defect__c` and `Test_Execution_Defect__c` junction records. If Jira or ADO sync is configured in the Quality Hub org, defects automatically sync to those systems.

**Input**

| Parameter      | Type     | Required | Description                                                                                             |
| -------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `run_id`       | string   | yes      | Test run `Tracking_Id__c` returned by `provar.qualityhub.testrun`                                       |
| `target_org`   | string   | yes      | SF CLI org alias or username for the Quality Hub org                                                    |
| `failed_tests` | string[] | no       | Optional filter — list of `Test_Case__c` ID substrings to restrict defect creation to specific failures |

**Output**

| Field     | Type    | Description                                                                                    |
| --------- | ------- | ---------------------------------------------------------------------------------------------- |
| `created` | array   | Created records: `{ defectId, tcDefectId, execDefectId, executionId, testCaseId }` per failure |
| `skipped` | integer | Number of failures skipped (already had defects, or filtered out)                              |
| `message` | string  | Human-readable summary including Jira/ADO sync note                                            |

**Error codes:** `DEFECT_CREATE_FAILED`, `SF_NOT_FOUND`

---

### `provar.automation.config.load`

Register a `provardx-properties.json` file as the active Provar configuration. **Required before `provar.automation.compile` or `provar.automation.testrun`** — without this step those commands fail with `MISSING_FILE`.

Invokes `sf provar automation config load --properties-file <path>`, writing the path to `~/.sf/config.json` under `PROVARDX_PROPERTIES_FILE_PATH`.

| Input             | Type   | Required | Description                                                 |
| ----------------- | ------ | -------- | ----------------------------------------------------------- |
| `properties_path` | string | yes      | Absolute path to the `provardx-properties.json` to register |
| `sf_path`         | string | no       | Path to `sf` executable when not in `PATH`                  |

| Output field      | Description                     |
| ----------------- | ------------------------------- |
| `exitCode`        | Exit code from the sf CLI       |
| `properties_path` | Echoes back the registered path |

**Error codes:** `AUTOMATION_CONFIG_LOAD_FAILED`, `SF_NOT_FOUND`

---

### `provar.testrun.report.locate`

Resolve artifact paths for a completed test run without parsing them. Returns the absolute paths to `JUnit.xml`, `Index.html`, per-test HTML reports, and validation JSONs.

Uses a 4-step resolution algorithm (explicit path → `~/.sf/config.json` → `provardx-properties.json` scan → ANT `build.xml` parse).

| Input          | Type    | Required | Description                                     |
| -------------- | ------- | -------- | ----------------------------------------------- |
| `project_path` | string  | yes      | Absolute path to the Provar project root        |
| `results_path` | string  | no       | Explicit results directory override             |
| `run_index`    | integer | no       | Specific Increment run number (default: latest) |

| Output field         | Description                                                               |
| -------------------- | ------------------------------------------------------------------------- |
| `results_dir`        | Absolute path to the resolved results directory                           |
| `junit_xml`          | Absolute path to `JUnit.xml` if present, else `null`                      |
| `index_html`         | Absolute path to `Index.html` if present, else `null`                     |
| `per_test_reports`   | Array of `{ test_name, html_path }` for each `*.testcase.html` found      |
| `validation_reports` | Paths to JSON files in `{project_path}/provardx/validation/`              |
| `run_index`          | Resolved run index (integer) or `null` if not Increment                   |
| `disposition`        | `"Increment"`, `"Replace"`, or `"unknown"`                                |
| `resolution_source`  | `"explicit"` \| `"sf_config"` \| `"properties_file"` \| `"ant_build_xml"` |

**Error codes:** `RESULTS_NOT_CONFIGURED`

---

### `provar.testrun.rca`

Analyse a completed test run and return a structured Root Cause Analysis report. Reads `JUnit.xml`, classifies each failure into a root cause category, extracts page object and operation names, and flags pre-existing failures across prior Increment runs.

| Input          | Type    | Required | Description                                               |
| -------------- | ------- | -------- | --------------------------------------------------------- |
| `project_path` | string  | yes      | Absolute path to the Provar project root                  |
| `results_path` | string  | no       | Explicit results directory override                       |
| `run_index`    | integer | no       | Specific Increment run to analyse (default: latest)       |
| `locate_only`  | boolean | no       | Skip parsing; return artifact paths only (default: false) |

| Output field            | Description                                                                     |
| ----------------------- | ------------------------------------------------------------------------------- |
| `results_dir`           | Resolved results directory                                                      |
| `run_in_progress`       | `true` when `JUnit.xml` is absent (run still executing)                         |
| `rca_skipped`           | `true` when `locate_only: true`                                                 |
| `run_summary`           | `{ total, passed, failures, errors, skipped, duration_seconds }`                |
| `failures`              | Array of `FailureReport` (see below)                                            |
| `infrastructure_issues` | Recommendations for infra-category failures (credential, driver, license, etc.) |
| `recommendations`       | Deduplicated list of all recommended actions                                    |

**`FailureReport` fields:**

| Field                 | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `test_case`           | Test case filename from JUnit `<testcase name>`          |
| `error_class`         | Extracted exception class name                           |
| `error_message`       | First 500 chars of failure/error text                    |
| `root_cause_category` | One of 12 categories (see table below)                   |
| `root_cause_summary`  | Human-readable cause description                         |
| `recommendation`      | Suggested fix action                                     |
| `page_object`         | Extracted from `Page Object: ...` pattern, or `null`     |
| `operation`           | Extracted from `operation: ...` pattern, or `null`       |
| `report_html`         | Path to per-test HTML report if found, else `null`       |
| `screenshot_dir`      | Path to `Artifacts/` directory if it exists, else `null` |
| `pre_existing`        | `true` if the same test failed in a prior Increment run  |

**Root cause categories:** `DRIVER_VERSION_MISMATCH`, `LOCATOR_STALE`, `TIMEOUT`, `ASSERTION_FAILED`, `CREDENTIAL_FAILURE`, `MISSING_CALLABLE`, `METADATA_CACHE`, `PAGE_OBJECT_COMPILE`, `CONNECTION_REFUSED`, `DATA_SETUP`, `LICENSE_INVALID`, `UNKNOWN`

**Error codes:** `RESULTS_NOT_CONFIGURED`

---

### `provar.testplan.add-instance`

Wire a test case into a plan suite by writing a `.testinstance` file. Handles UUID generation, `testCaseId` extraction from the testcase file's `registryId`/`id`/`guid` attribute, and path normalisation (always forward slashes).

| Input            | Type    | Required | Description                                                         |
| ---------------- | ------- | -------- | ------------------------------------------------------------------- |
| `project_path`   | string  | yes      | Absolute path to the Provar project root                            |
| `test_case_path` | string  | yes      | Relative path from project root, e.g. `tests/Suite/MyTest.testcase` |
| `plan_name`      | string  | yes      | Name of the plan directory under `plans/`                           |
| `suite_path`     | string  | no       | Path within the plan, e.g. `MySuite` or `MySuite/SubSuite`          |
| `dry_run`        | boolean | no       | Return content without writing (default: false)                     |

| Output field     | Description                                                           |
| ---------------- | --------------------------------------------------------------------- |
| `instance_path`  | Absolute path to the written `.testinstance` file                     |
| `guid`           | Generated UUID for the new instance                                   |
| `test_case_id`   | `testCaseId` extracted from the testcase file, or `null` if not found |
| `test_case_path` | Normalised (forward-slash) relative path stored in the XML            |
| `written`        | `false` when `dry_run: true`                                          |

**Error codes:** `NOT_A_PROJECT`, `TESTCASE_NOT_FOUND`, `INVALID_TESTCASE`, `SUITE_NOT_FOUND`, `INSTANCE_EXISTS`, `PATH_NOT_ALLOWED`

---

### `provar.testplan.create-suite`

Create a new test suite directory with a `.planitem` file inside an existing plan. The plan directory and its `.planitem` must already exist.

| Input               | Type    | Required | Description                                           |
| ------------------- | ------- | -------- | ----------------------------------------------------- |
| `project_path`      | string  | yes      | Absolute path to the Provar project root              |
| `plan_name`         | string  | yes      | Name of the existing plan directory under `plans/`    |
| `suite_name`        | string  | yes      | Name of the new suite directory to create             |
| `parent_suite_path` | string  | no       | Path to a parent suite if nesting, e.g. `ParentSuite` |
| `dry_run`           | boolean | no       | Return content without writing (default: false)       |

| Output field    | Description                                   |
| --------------- | --------------------------------------------- |
| `suite_dir`     | Absolute path to the created suite directory  |
| `planitem_path` | Absolute path to the written `.planitem` file |
| `guid`          | Generated UUID for the suite                  |
| `created`       | `false` when `dry_run: true`                  |

**Error codes:** `NOT_A_PROJECT`, `PLAN_NOT_FOUND`, `SUITE_EXISTS`, `PATH_NOT_ALLOWED`

---

### `provar.testplan.remove-instance`

Remove a `.testinstance` file from a plan suite. Path is validated to stay within the project root.

| Input           | Type    | Required | Description                                                 |
| --------------- | ------- | -------- | ----------------------------------------------------------- |
| `project_path`  | string  | yes      | Absolute path to the Provar project root                    |
| `instance_path` | string  | yes      | Relative path from project root to the `.testinstance` file |
| `dry_run`       | boolean | no       | Validate and report without deleting (default: false)       |

| Output field   | Description                       |
| -------------- | --------------------------------- |
| `removed_path` | Absolute path of the removed file |
| `removed`      | `false` when `dry_run: true`      |

**Error codes:** `NOT_A_PROJECT`, `INVALID_INSTANCE`, `INSTANCE_NOT_FOUND`, `PATH_TRAVERSAL`, `PATH_NOT_ALLOWED`

---

---

## NitroX — Hybrid Model page objects

NitroX is Provar's **Hybrid Model** for locators. Instead of hand-written Java Page Objects it uses component-based `.po.json` files that map UI elements for any Salesforce component type: LWC, Screen Flow, Industry / OmniStudio, Experience Cloud, and standard HTML5. These files live in `nitroX/` directories inside your Provar project.

The five `provar.nitrox.*` tools let an AI agent discover existing NitroX page objects, read them as training context, validate new ones against the schema, generate fresh components from a description, and apply surgical edits via JSON merge-patch.

> **Note:** NitroX page objects are read and written directly from disk using the standard file-system path policy (`--allowed-paths`). No `sf` subprocess is involved.

---

### `provar.nitrox.discover`

Scan a set of directories for Provar projects (identified by a `.testproject` marker file) and inventory each project's `nitroX/` and `nitroXPackages/` directories. Useful as a first step before reading or generating files.

By default the tool scans `cwd`. If no project is found there it widens the search to `~/git` and `~/Provar`.

| Input              | Type     | Required | Default   | Description                                                                            |
| ------------------ | -------- | -------- | --------- | -------------------------------------------------------------------------------------- |
| `search_roots`     | string[] | no       | `[cwd()]` | Directories to scan; falls back to `~/git`, `~/Provar` if empty and cwd has no project |
| `max_depth`        | number   | no       | `6`       | Maximum directory depth for `.testproject` search (max 20)                             |
| `include_packages` | boolean  | no       | `true`    | Return `nitroXPackages/` package names in output                                       |

| Output field     | Description                                 |
| ---------------- | ------------------------------------------- |
| `projects`       | Array of project result objects (see below) |
| `searched_roots` | Directories actually searched               |

Each project result:

| Field               | Description                                   |
| ------------------- | --------------------------------------------- |
| `project_path`      | Absolute path to the project root             |
| `nitrox_dir`        | Absolute path to `nitroX/`, or `null`         |
| `nitrox_file_count` | Number of `.po.json` files found              |
| `nitrox_files`      | Full paths to each `.po.json`                 |
| `packages_dir`      | Absolute path to `nitroXPackages/`, or `null` |
| `packages`          | Array of `{ path, name? }` package entries    |

Directories named `node_modules`, `.git`, or any hidden directory (`.`-prefixed) are skipped.

---

### `provar.nitrox.read`

Read one or more NitroX `.po.json` files and return their parsed content for context or training. Provide specific `file_paths` or a `project_path` to read all files from a project's `nitroX/` directory.

| Input          | Type     | Required         | Default | Description                                          |
| -------------- | -------- | ---------------- | ------- | ---------------------------------------------------- |
| `file_paths`   | string[] | one of these two | —       | Specific `.po.json` paths to read                    |
| `project_path` | string   | one of these two | —       | Provar project root — reads all files from `nitroX/` |
| `max_files`    | number   | no               | `20`    | Cap on files returned to avoid context overflow      |

| Output field  | Description                                                                          |
| ------------- | ------------------------------------------------------------------------------------ |
| `files`       | Array of `{ file_path, content, size_bytes }` (or `{ file_path, error }` on failure) |
| `truncated`   | `true` when more files exist than `max_files`                                        |
| `total_found` | Total number of `.po.json` files discovered before the cap                           |

Path policy is enforced per-file. A missing or unparseable file returns an `error` field inside the file entry rather than failing the whole call.

**Error codes:** `MISSING_INPUT`, `FILE_NOT_FOUND`, `PATH_NOT_ALLOWED`, `PATH_TRAVERSAL`

---

### `provar.nitrox.validate`

Validate a NitroX `.po.json` (Hybrid Model component page object) against the FACT schema rules. Returns a quality score (0–100) and a list of issues.

Score formula: `100 − (20 × errors) − (5 × warnings) − (1 × infos)`, minimum 0.

| Input       | Type   | Required     | Description               |
| ----------- | ------ | ------------ | ------------------------- |
| `content`   | string | one of these | JSON string to validate   |
| `file_path` | string | one of these | Path to a `.po.json` file |

| Output field  | Description                            |
| ------------- | -------------------------------------- |
| `valid`       | `true` when no ERROR-severity issues   |
| `score`       | 0–100                                  |
| `issue_count` | Total issues                           |
| `issues`      | Array of `ValidationIssue` (see below) |

**Validation rules:**

| Rule  | Severity | Description                                                                                                                                  |
| ----- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| NX000 | ERROR    | Content is not valid JSON or not a JSON object                                                                                               |
| NX001 | ERROR    | `componentId` is missing or not a valid UUID                                                                                                 |
| NX002 | ERROR    | Root component (no `parentId`) missing `name`, `type`, `pageStructureElement`, or `fieldDetailsElement`                                      |
| NX003 | ERROR    | `tagName` contains whitespace                                                                                                                |
| NX004 | ERROR    | Interaction missing required field (`defaultInteraction`, `implementations` ≥ 1, `interactionType`, `name`, `testStepTitlePattern`, `title`) |
| NX005 | ERROR    | Implementation missing `javaScriptSnippet`                                                                                                   |
| NX006 | ERROR    | Selector missing `xpath`                                                                                                                     |
| NX007 | WARNING  | Element missing `type`                                                                                                                       |
| NX008 | WARNING  | `comparisonType` not one of `"equals"`, `"starts-with"`, `"contains"`                                                                        |
| NX009 | INFO     | Interaction `name` contains characters outside `[A-Za-z0-9 ]`                                                                                |
| NX010 | INFO     | `bodyTagName` contains whitespace                                                                                                            |

**Error codes:** `MISSING_INPUT`, `NX000`, `FILE_NOT_FOUND`, `PATH_NOT_ALLOWED`

---

### `provar.nitrox.generate`

Generate a new NitroX `.po.json` from a component description. All `componentId` fields are assigned fresh UUIDs. Returns the JSON content; writes to disk only when `dry_run=false`.

Applicable to any component type: LWC, Screen Flow, Industry Components, Experience Cloud, HTML5.

| Input                    | Type     | Required | Default   | Description                                             |
| ------------------------ | -------- | -------- | --------- | ------------------------------------------------------- |
| `name`                   | string   | yes      | —         | Path-like name, e.g. `/com/force/myapp/ButtonComponent` |
| `tag_name`               | string   | yes      | —         | LWC or HTML tag, e.g. `lightning-button`, `c-my-cmp`    |
| `type`                   | string   | no       | `"Block"` | `"Block"` or `"Page"`                                   |
| `page_structure_element` | boolean  | no       | `true`    | Whether this is a page structure element                |
| `field_details_element`  | boolean  | no       | `false`   | Whether this is a field details element                 |
| `parameters`             | object[] | no       | —         | Qualifier parameters (see below)                        |
| `elements`               | object[] | no       | —         | Child elements (see below)                              |
| `output_path`            | string   | no       | —         | File path to write when `dry_run=false`                 |
| `overwrite`              | boolean  | no       | `false`   | Overwrite existing file                                 |
| `dry_run`                | boolean  | no       | `true`    | Return JSON without writing                             |

**Parameter object:** `{ name, value, comparisonType?: "equals"|"starts-with"|"contains", default?: boolean }`

**Element object:** `{ label, type_ref, tag_name?, parameters?, selector_xpath? }`

| Output field | Description                                   |
| ------------ | --------------------------------------------- |
| `content`    | Generated JSON string (pretty-printed)        |
| `file_path`  | Resolved absolute path (if `output_path` set) |
| `written`    | `true` when file was written to disk          |
| `dry_run`    | Echo of the `dry_run` input                   |

**Error codes:** `FILE_EXISTS`, `PATH_NOT_ALLOWED`, `PATH_TRAVERSAL`, `GENERATE_ERROR`

---

### `provar.nitrox.patch`

Apply a [JSON merge-patch (RFC 7396)](https://www.rfc-editor.org/rfc/rfc7396) to an existing `.po.json` file. Reads the file, merges the patch, optionally validates the result, and writes back. Use `dry_run=true` (default) to preview changes before committing.

Patch semantics: a key with a `null` value removes that key; any other value replaces it (or recursively merges if both target and patch values are objects).

| Input            | Type    | Required | Default | Description                                     |
| ---------------- | ------- | -------- | ------- | ----------------------------------------------- |
| `file_path`      | string  | yes      | —       | Path to the existing `.po.json`                 |
| `patch`          | object  | yes      | —       | JSON merge-patch to apply                       |
| `dry_run`        | boolean | no       | `true`  | Return merged result without writing            |
| `validate_after` | boolean | no       | `true`  | Run NX validation; blocks write if errors found |

| Output field | Description                                            |
| ------------ | ------------------------------------------------------ |
| `content`    | Merged JSON string (pretty-printed)                    |
| `file_path`  | Absolute path of the file                              |
| `written`    | `true` when file was written                           |
| `dry_run`    | Echo of the `dry_run` input                            |
| `validation` | Validation result (present when `validate_after=true`) |

When `validate_after=true` and the merged content has errors, the write is blocked and the tool returns `isError=true` with code `VALIDATION_FAILED`. Set `validate_after=false` to force-write despite errors.

**Error codes:** `FILE_NOT_FOUND`, `PARSE_ERROR`, `VALIDATION_FAILED`, `PATH_NOT_ALLOWED`, `PATH_TRAVERSAL`

---

## AI loop pattern

The automation tools are designed to support an **AI-driven fix loop**: an agent can iteratively improve test quality without leaving the chat session.

```
provar.project.inspect             → understand what's in the project, find uncovered tests
provar.testcase.validate           → find quality issues in a test case
provar.testcase.generate           → regenerate or fix the test case XML
provar.testplan.add-instance       → wire a new/fixed test case into a plan suite
provar.testplan.create-suite       → create a suite to organise new tests
provar.ant.generate                → generate (or regenerate) the ANT build.xml for CI
provar.ant.validate                → validate an existing build.xml before committing
provar.automation.config.load      → register the properties file (required before compile/testrun)
provar.automation.compile          → compile Page Objects after changes
provar.automation.testrun          → execute tests locally against the real org
provar.testrun.rca                 → diagnose failures: classify root cause, extract page objects
provar.project.validate            → re-score the full project
```

Combined with Quality Hub (grid-managed runs):

```
provar.qualityhub.connect           → authenticate
provar.qualityhub.testrun           → start a Quality Hub-managed grid run
provar.qualityhub.testrun.report    → poll until complete
provar.qualityhub.testcase.retrieve → pull test cases scoped to a user story
provar.qualityhub.defect.create     → file defects for failures automatically
```

NitroX (Hybrid Model) component page object loop:

```
provar.nitrox.discover   → find all NitroX projects and .po.json files on the machine
provar.nitrox.read       → load existing page objects as AI training context
provar.nitrox.validate   → check a generated or edited .po.json for schema issues
provar.nitrox.generate   → create a new .po.json from a component description
provar.nitrox.patch      → apply targeted edits to an existing .po.json (RFC 7396)
```

> **Note:** `provar.automation.*` and `provar.qualityhub.*` tools invoke `sf` CLI subprocesses. The Salesforce CLI must be installed and in `PATH`, or pass `sf_path` pointing to the executable directly (e.g. `~/.nvm/versions/node/v22.0.0/bin/sf`). A missing `sf` binary returns the error code `SF_NOT_FOUND` with an installation hint.
