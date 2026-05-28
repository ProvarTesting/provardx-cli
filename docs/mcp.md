# Provar MCP Server

The Provar DX CLI ships with a built-in **Model Context Protocol (MCP) server** that exposes Provar tools to AI assistants such as Claude Desktop, Claude Code, GitHub Copilot, Cursor, and Agentforce Vibes. The server lets an AI agent inspect your Provar project, generate Page Objects and test cases, and validate every level of the test hierarchy — all from inside your AI chat session.

---

## Table of Contents

- [Configuration reference](#configuration-reference)
  - [CLI flags](#cli-flags)
  - [Environment variables](#environment-variables)
  - [Setting these in your MCP client config](#setting-these-in-your-mcp-client-config)
- [Client configuration](#client-configuration)
  - [The standard config (recommended)](#the-standard-config-recommended)
  - [Find your config file by operating system](#find-your-config-file-by-operating-system)
  - [Client-specific notes](#client-specific-notes)
- [Path security](#path-security)
- [Available tools](#available-tools)
  - [provardx_ping](#provardx_ping)
  - [provar_project_inspect](#provar_project_inspect)
  - [provar_connection_list](#provar_connection_list)
  - [provar_pageobject_generate](#provar_pageobject_generate)
  - [provar_pageobject_validate](#provar_pageobject_validate)
  - [provar_testcase_generate](#provar_testcase_generate)
  - [provar_testcase_validate](#provar_testcase_validate)
  - [provar_testsuite_validate](#provar_testsuite_validate)
  - [provar_testplan_validate](#provar_testplan_validate)
  - [provar_project_validate](#provar_project_validate)
  - [provar_properties_generate](#provar_properties_generate)
  - [provar_properties_read](#provar_properties_read)
  - [provar_properties_set](#provar_properties_set)
  - [provar_properties_validate](#provar_properties_validate)
  - [provar_ant_generate](#provar_ant_generate)
  - [provar_ant_validate](#provar_ant_validate)
  - [provar_qualityhub_connect](#provar_qualityhub_connect)
  - [provar_qualityhub_display](#provar_qualityhub_display)
  - [provar_qualityhub_testrun](#provar_qualityhub_testrun)
  - [provar_qualityhub_testrun_report](#provar_qualityhub_testrun_report)
  - [provar_qualityhub_testrun_abort](#provar_qualityhub_testrun_abort)
  - [provar_qualityhub_testcase_retrieve](#provar_qualityhub_testcase_retrieve)
  - [provar_automation_setup](#provar_automation_setup)
  - [provar_automation_testrun](#provar_automation_testrun)
  - [provar_automation_compile](#provar_automation_compile)
  - [provar_automation_config_load](#provar_automation_config_load)
  - [provar_automation_metadata_download](#provar_automation_metadata_download)
  - [provar_qualityhub_defect_create](#provar_qualityhub_defect_create)
  - [provar_testrun_report_locate](#provar_testrun_report_locate)
  - [provar_testrun_rca](#provar_testrun_rca)
  - [provar_testcase_step_edit](#provar_testcase_step_edit)
  - [provar_testplan_add-instance](#provar_testplan_add-instance)
  - [provar_testplan_create-suite](#provar_testplan_create-suite)
  - [provar_testplan_remove-instance](#provar_testplan_remove-instance)
  - [Org metadata access](#org-metadata-access)
    - [provar_org_describe](#provar_org_describe)
  - [Data-driven execution](#data-driven-execution)
  - [NitroX — Hybrid Model page objects](#nitrox--hybrid-model-page-objects)
    - [provar_nitrox_discover](#provar_nitrox_discover)
    - [provar_nitrox_read](#provar_nitrox_read)
    - [provar_nitrox_validate](#provar_nitrox_validate)
    - [provar_nitrox_generate](#provar_nitrox_generate)
    - [provar_nitrox_patch](#provar_nitrox_patch)
  - [Quality Hub API tools](#quality-hub-api-tools)
    - [provar_qualityhub_examples_retrieve](#provar_qualityhub_examples_retrieve)
  - [Org metadata via Salesforce Hosted MCP](#org-metadata-via-salesforce-hosted-mcp)
- [MCP Prompts](#mcp-prompts)
  - [Migration prompts](#migration-prompts)
    - [provar.migrate.crt](#provarmigratecrt)
    - [provar.migrate.selenium](#provarmigrateselenium)
    - [provar.migrate.playwright](#provarmigrateplaywright)
  - [AI loop prompts](#ai-loop-prompts)
    - [provar.loop.generate](#provarloopgenerate)
    - [provar.loop.fix](#provarloopfix)
    - [provar.loop.review](#provarloopreview)
    - [provar.loop.coverage](#provarloopcoverage)
    - [provar.loop.db](#provarloopdb)
- [MCP Resources](#mcp-resources)
  - [provar://docs/step-reference](#provardocsstep-reference)
  - [provar://nitrox/component-catalog](#provarnitroxcomponent-catalog)
  - [provar://nitrox/catalog-source](#provarnitroxcatalog-source)
- [AI loop pattern](#ai-loop-pattern)
- [Quality scores explained](#quality-scores-explained)
- [API compatibility — `xml` vs `xml_content`](#api-compatibility--xml-vs-xml_content)
- [Performance Tuning](#performance-tuning)
- [Warning codes](#warning-codes)

---

## Prerequisites

### Required for all uses

- **Node.js 18–24** (LTS 22 recommended). Node 25+ is not supported — a transitive dependency (`buffer-equal-constant-time`) crashes on startup. Check with `node --version`.
- **Provar Automation IDE** ≥ 3.x installed with an activated license (see [License requirement](#license-requirement) below).

That's it for the core flows. The MCP server runs entirely via `npx` — **no separate npm package install is required**, and **no Salesforce CLI is needed** for NitroX, validation, generation, properties, ant, inspect, or connection tools.

### Optional — Salesforce CLI (`sf`) for QH / Automation / org tools

> **Heads up:** `npx -y @provartesting/provardx-cli` auto-installs the package itself, but it does **not** install Salesforce CLI. Although `@provartesting/provardx-cli` can function as an sf plugin, npx does not pull in `@salesforce/cli` as a transitive dependency.

Install **Salesforce CLI ≥ 2.x** _only_ if you plan to use one of the following tool families:

| Tool family       | Tools (label and tool ID)                                                                                                                                                                                                                                                                                                                                                                                                                                         | Why sf is needed                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Quality Hub       | **Connect to Quality Hub** (`provar_qualityhub_connect`), **Display Quality Hub Info** (`provar_qualityhub_display`), **Trigger Quality Hub Test Run** (`provar_qualityhub_testrun`), **Poll Quality Hub Test Run** (`provar_qualityhub_testrun_report`), **Abort Quality Hub Test Run** (`provar_qualityhub_testrun_abort`), **Retrieve Quality Hub Test Cases** (`provar_qualityhub_testcase_retrieve`), **Create Defects** (`provar_qualityhub_defect_create`) | Shell out to `sf provar quality-hub ...` commands.      |
| Provar Automation | **Install Provar Automation** (`provar_automation_setup`), **Load Automation Config** (`provar_automation_config_load`), **Download Salesforce Metadata** (`provar_automation_metadata_download`), **Compile Test Assets** (`provar_automation_compile`), **Run Tests** (`provar_automation_testrun`)                                                                                                                                                             | Shell out to `sf provar automation ...` commands.       |
| Org metadata      | **Describe Org Objects From Workspace Cache** (`provar_org_describe`)                                                                                                                                                                                                                                                                                                                                                                                             | Reads Salesforce orgs authenticated via `sf org login`. |

> **Note:** `provar_qualityhub_examples_retrieve` ("Retrieve Corpus Examples") lives in the `qualityhub` tool group but talks to Quality Hub directly over HTTPS — it does **not** shell to `sf` and works without Salesforce CLI installed.

If you need these tools, you have **two separate installs** to do in addition to the npx-cached MCP server package:

1. **Install Salesforce CLI** — `npm install -g @salesforce/cli` on any OS, or the [Windows / macOS installers](https://developer.salesforce.com/tools/salesforcecli).
2. **Register the Provar plugin under sf** — `sf plugins install @provartesting/provardx-cli`. This is independent of the npx install: sf maintains its own plugin directory (`%LOCALAPPDATA%\sf\` on Windows, `~/.local/share/sf/` on Linux/macOS) and the QH/Automation tools shell out to `sf provar ...` subcommands, which sf can only resolve if it finds the plugin in its own directory.

The MCP server itself never needs the sf-plugin copy; it loads from the npx cache. The sf-plugin copy exists purely so that the spawned `sf` child processes can find the `provar` topic.

## Quick start

The MCP server runs via `npx` — no separate package install needed, no `sf` CLI required for the core flows. Add this entry to your AI client's MCP config file:

```json
{
  "mcpServers": {
    "provar": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@provartesting/provardx-cli",
        "mcp",
        "start",
        "--allowed-paths",
        "/path/to/your/provar/project",
        "--auto-update"
      ]
    }
  }
}
```

**Where does this go?** It depends on your AI client and operating system. See [Client configuration → Find your config file by operating system](#find-your-config-file-by-operating-system) for the exact path. Common entries at a glance:

- **Claude Code:** `~/.claude.json` (global) or `<project>/.mcp.json` (project-scoped, shared)
- **Claude Desktop:** opened via **Claude menu → Settings → Developer → Edit Config**
- **Cursor:** `~/.cursor/mcp.json` (global) or `<project>/.cursor/mcp.json` (workspace)
- **GitHub Copilot (VS Code):** `<workspace>/.vscode/mcp.json` — note the top-level key is **`"servers"`**, not `"mcpServers"`

After saving, **fully restart** your AI client (`Cmd+Q` on macOS, Quit from the system tray on Windows — closing the window is not enough for Claude Desktop). Then verify by asking your assistant: _"Call provardx_ping with message hello"_. You should get `{ "pong": "hello", "ts": "...", "server": "provar-mcp@..." }` back.

**(Optional) Authenticate Quality Hub for full validation** — adds 170+ remote rules to `provar_testcase_validate`. Set `PROVAR_API_KEY` in your MCP config's `"env"` block (see [Configuration reference → Environment variables](#environment-variables)) or, if you have `sf` installed, run `sf provar auth login` to fetch a key interactively. The server works without this — validation falls back to a curated local rule set.

---

## License requirement

The MCP server requires **Provar Automation IDE** to be installed on the same machine with an activated license. At startup the server reads `~/Provar/.licenses/*.properties` and verifies that at least one license is in the `Activated` state and was last verified online within the past 48 hours.

If the license check fails, the server exits with a clear error message explaining the reason (not found, stale, or expired). Open Provar Automation IDE to refresh the license online, then retry.

---

## Configuration reference

The single source of truth for every CLI flag and environment variable the MCP server reads at runtime. The deep-dive subsections under [Performance Tuning](#performance-tuning) provide additional context for individual settings but always cross-link back here.

### CLI flags

Both `sf provar mcp start` and the standalone npx entry point (`npx -y @provartesting/provardx-cli@beta mcp start`) accept the same four flags. The only behavioural difference is the default for `--allowed-paths`.

| Flag                | Alias | Default (`sf provar mcp start`) | Default (npx entry point)            | Description                                                                                                                                               |
| ------------------- | ----- | ------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--allowed-paths`   | `-a`  | Current working directory       | **Required — hard error if omitted** | Base directories that file-system tools are permitted to read and write. Repeat the flag to allow multiple paths.                                         |
| `--auto-defects`    |       | `false`                         | `false`                              | Enables the Quality Hub auto-defect creation flow. Internally sets `PROVAR_AUTO_DEFECTS=1` so downstream tools can read it.                               |
| `--auto-update`     |       | `false`                         | `false`                              | Automatically installs the latest beta at startup and exits so the client reconnects with the new version. Skipped if running from a development symlink. |
| `--no-update-check` |       | `false`                         | `false`                              | Skip the startup npm-registry update check. Also controlled by the `PROVAR_NO_UPDATE_CHECK` environment variable (see the env-var table below).           |

> **`--allowed-paths` is CLI-only — there is no environment-variable equivalent.** If you need to inject the value from an env var, expand it shell-side at invocation time (e.g. `--allowed-paths "$PROVAR_PROJECT"` in bash, `--allowed-paths $env:PROVAR_PROJECT` in PowerShell).

```sh
# Allow access to a specific project directory
sf provar mcp start --allowed-paths /workspace/my-provar-project

# Allow multiple directories
sf provar mcp start -a /workspace/project-a -a /workspace/project-b
```

### Environment variables

The MCP server reads the following environment variables at startup or during tool invocation. Internal/dev-only variables (license bypass, ALGAS dev credentials) are intentionally not documented here — they remain source-only and are not supported for production use.

| Variable                     | Purpose                                                                                                                                                                                 | Default                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `PROVAR_HOME`                | Provar Automation install root. Used to locate license files (`<PROVAR_HOME>/.licenses/*.properties`) and resolve home-relative tool defaults.                                          | `~/Provar` (`%USERPROFILE%\Provar` on Windows) |
| `PROVAR_API_KEY`             | API key for Quality Hub validation. Takes priority over any stored key in `~/.provar/credentials.json`. Must start with `pv_k_` — any other value is ignored.                           | None — falls back to stored credentials        |
| `PROVAR_QUALITY_HUB_URL`     | Override the Quality Hub API base URL. Set when pointing at a non-default Quality Hub environment.                                                                                      | Dev API Gateway URL (`/dev`)                   |
| `PROVAR_MCP_TOOLS`           | Comma-separated list of tool groups to register at startup. Deep-dive: [Tool group filtering](#tool-group-filtering-provar_mcp_tools).                                                  | All groups registered                          |
| `PROVAR_MCP_SCHEMA_MODE`     | Set to `compact` to shorten all tool descriptions. Deep-dive: [Compact descriptions](#compact-descriptions-provar_mcp_schema_mode).                                                     | Standard (full) descriptions                   |
| `PROVAR_MCP_MAX_TOOL_DEPTH`  | Agentic loop guard — max tool calls per MCP session before further calls return `TOOL_BUDGET_EXCEEDED`. Deep-dive: [Agentic loop guard](#agentic-loop-guard-provar_mcp_max_tool_depth). | `50`                                           |
| `PROVAR_MCP_EMIT_TOKEN_META` | When `true`, appends a `_meta` token-attribution block to every tool response. Deep-dive: [Per-call token attribution](#per-call-token-attribution-provar_mcp_emit_token_meta).         | unset (no `_meta` block)                       |
| `PROVAR_MCP_VALIDATION_DIR`  | Override the directory where `provar_testcase_validate` writes validation diff artifacts.                                                                                               | `<repo>/.provar-mcp/validation/`               |
| `PROVAR_NO_UPDATE_CHECK`     | When set (any non-empty value), skips the startup npm-registry update check. Same effect as `--no-update-check`.                                                                        | unset (check runs)                             |
| `PROVAR_AUTO_DEFECTS`        | When `1`, enables the Quality Hub auto-defect creation flow. Normally set by passing the `--auto-defects` flag rather than directly.                                                    | unset (auto-defects disabled)                  |

### Setting these in your MCP client config

You do **not** need to start the server from a shell that already has the variables exported. Every MCP client that supports launching servers (Claude Desktop, Claude Code, Cursor, VS Code GitHub Copilot, Agentforce Vibes, and any other client following the spec) accepts an **`"env"` object** alongside `"command"` and `"args"` in the server entry. The client launches the server as a child process with those variables present in its environment — equivalent to having `export VAR=value` set before invoking `sf provar mcp start` manually.

Worked example — `.mcp.json` (Claude Code project scope) or `claude_desktop_config.json` (Claude Desktop) combining CLI flags via `args` and environment variables via `env`:

```json
{
  "mcpServers": {
    "provar": {
      "command": "sf",
      "args": ["provar", "mcp", "start", "--allowed-paths", "/path/to/your/provar/project", "--auto-update"],
      "env": {
        "PROVAR_API_KEY": "pv_k_your_key_here",
        "PROVAR_MCP_TOOLS": "nitrox,authoring",
        "PROVAR_MCP_EMIT_TOKEN_META": "true",
        "PROVAR_MCP_MAX_TOOL_DEPTH": "30"
      }
    }
  }
}
```

Notes:

- All env-var values must be **strings** in JSON. `"true"`, `"false"`, and numeric values like `"30"` are quoted; the server parses them on read.
- `"env"` is merged with the parent process's environment by the MCP client. Variables you don't list here keep whatever value the client inherits (usually the user's shell environment).
- If you set `PROVAR_API_KEY` here, it takes priority over any key stored at `~/.provar/credentials.json` by `sf provar auth login`. Convenient for CI runners or for using different keys across different Provar projects without touching the stored credentials.
- The CLI-only flag `--allowed-paths` still goes in `args`, not `env` — see the [CLI flags](#cli-flags) callout above.

---

## Client configuration

The MCP server is launched as a child process by your AI client (Claude Code, Claude Desktop, Cursor, VS Code GitHub Copilot, Agentforce Vibes, etc.). **All clients use the same config shape** — a JSON file with `command`, `args`, and optional `env`. The only thing that varies is **where the file lives** on disk.

### The standard config (recommended)

Use `npx` as the command. This is the most portable invocation:

- `npx -y` **auto-installs `@provartesting/provardx-cli` on first run** and caches it for subsequent calls — no separate `sf plugins install` step needed.
- It does **not** require `sf` to be on PATH, which sidesteps the most common failure mode in GUI clients (Claude Desktop, Cursor, VS Code) that don't inherit your interactive shell environment.
- It works identically across Windows, macOS, and Linux.

```json
{
  "mcpServers": {
    "provar": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@provartesting/provardx-cli",
        "mcp",
        "start",
        "--allowed-paths",
        "/path/to/your/provar/project",
        "--auto-update"
      ],
      "env": {}
    }
  }
}
```

**Multiple project roots:** repeat the `--allowed-paths` flag, one entry per directory:

```json
"args": [
  "-y", "@provartesting/provardx-cli", "mcp", "start",
  "--allowed-paths", "/path/to/project-a",
  "--allowed-paths", "/path/to/project-b",
  "--auto-update"
]
```

**Environment variables** (e.g. `PROVAR_API_KEY`, `PROVAR_MCP_TOOLS`, `PROVAR_MCP_EMIT_TOKEN_META`) go in the `"env"` object — see [Setting these in your MCP client config](#setting-these-in-your-mcp-client-config) above for the full pattern.

### Find your config file by operating system

The config file location depends on both your operating system and your MCP client. Click your OS to expand.

<details>
<summary><b>Windows</b></summary>

| Client                               | Config file location                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code (user-scoped, global)    | `%USERPROFILE%\.claude.json`                                                                                                          |
| Claude Code (project-scoped, shared) | `<workspace>\.mcp.json` — commit to source control                                                                                    |
| Claude Desktop (direct installer)    | `%APPDATA%\Claude\claude_desktop_config.json`                                                                                         |
| Claude Desktop (Microsoft Store)     | `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json` — ⚠️ see Store-sandbox note below |
| GitHub Copilot (VS Code)             | `<workspace>\.vscode\mcp.json`                                                                                                        |
| Cursor (workspace)                   | `<workspace>\.cursor\mcp.json`                                                                                                        |
| Cursor (global)                      | `%USERPROFILE%\.cursor\mcp.json`                                                                                                      |
| Agentforce Vibes                     | Open the extension's **Settings → Configure MCP Servers**, which edits `a4d_mcp_settings.json`                                        |

**Worked example** (windows-style paths, multiple project roots, auto-update on, token-meta enabled):

```json
{
  "mcpServers": {
    "provar": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@provartesting/provardx-cli",
        "mcp",
        "start",
        "--allowed-paths",
        "C:\\Users\\you\\git\\provar-manager-regression",
        "--allowed-paths",
        "C:\\Users\\you\\git\\Provar Manager\\test-manager",
        "--allowed-paths",
        "C:\\Users\\you\\git\\provardx-cli",
        "--auto-update"
      ],
      "env": {
        "PROVAR_MCP_EMIT_TOKEN_META": "true"
      }
    }
  }
}
```

**Windows specifics:**

- JSON path separators must be **escaped backslashes** (`\\`) or forward slashes (`/`). Single backslash is a JSON escape character and will produce a parse error.
- Paths containing spaces (like `Provar Manager`) work — JSON quoting handles them. No extra quoting needed inside the args string.
- **Microsoft Store version of Claude Desktop:** the Store edition runs in an app sandbox that can block child-process spawning, causing the MCP server to disconnect immediately with `Server disconnected` errors. Prefer the **direct installer** from claude.ai/download. If you must use the Store version, run Claude Desktop as administrator.

</details>

<details>
<summary><b>macOS</b></summary>

| Client                               | Config file location                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Claude Code (user-scoped, global)    | `~/.claude.json`                                                                               |
| Claude Code (project-scoped, shared) | `<workspace>/.mcp.json` — commit to source control                                             |
| Claude Desktop                       | `~/Library/Application Support/Claude/claude_desktop_config.json`                              |
| GitHub Copilot (VS Code)             | `<workspace>/.vscode/mcp.json`                                                                 |
| Cursor (workspace)                   | `<workspace>/.cursor/mcp.json`                                                                 |
| Cursor (global)                      | `~/.cursor/mcp.json`                                                                           |
| Agentforce Vibes                     | Open the extension's **Settings → Configure MCP Servers**, which edits `a4d_mcp_settings.json` |

**Worked example:**

```json
{
  "mcpServers": {
    "provar": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@provartesting/provardx-cli",
        "mcp",
        "start",
        "--allowed-paths",
        "/Users/you/git/provar-project-a",
        "--allowed-paths",
        "/Users/you/git/provar-project-b",
        "--auto-update"
      ],
      "env": {
        "PROVAR_MCP_EMIT_TOKEN_META": "true"
      }
    }
  }
}
```

**macOS specifics:**

- **Claude Desktop restart:** **Cmd+Q** to fully quit Claude Desktop after saving — closing the window only minimizes it and leaves the old server attached. Then reopen.
- **`Settings → Developer → Edit Config`** in the Claude Desktop menu bar opens the config file directly without you needing to navigate `~/Library/...` manually.

</details>

<details>
<summary><b>Linux</b></summary>

| Client                               | Config file location                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Claude Code (user-scoped, global)    | `~/.claude.json`                                                                               |
| Claude Code (project-scoped, shared) | `<workspace>/.mcp.json` — commit to source control                                             |
| Claude Desktop                       | Not officially supported on Linux by Anthropic. Use Claude Code instead.                       |
| GitHub Copilot (VS Code)             | `<workspace>/.vscode/mcp.json`                                                                 |
| Cursor (workspace)                   | `<workspace>/.cursor/mcp.json`                                                                 |
| Cursor (global)                      | `~/.cursor/mcp.json`                                                                           |
| Agentforce Vibes                     | Open the extension's **Settings → Configure MCP Servers**, which edits `a4d_mcp_settings.json` |

**Worked example:**

```json
{
  "mcpServers": {
    "provar": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@provartesting/provardx-cli",
        "mcp",
        "start",
        "--allowed-paths",
        "/home/you/git/provar-project",
        "--auto-update"
      ],
      "env": {}
    }
  }
}
```

</details>

### Client-specific notes

The config shape above (npx + `@provartesting/provardx-cli` + `mcp start`) works as-is across all clients. The notes below cover each client's particular config-file conventions, restart procedures, and known gotchas.

<details>
<summary><b>Claude Code (terminal &amp; VS Code extension)</b></summary>

Claude Code can be configured via the `claude` CLI command or by editing the JSON config file directly. The CLI is just a typing shortcut — it writes to the same files documented in the per-OS tables above.

**Via the `claude` CLI (one-time setup):**

```sh
# User-scoped — registers once and works across all your projects
claude mcp add provar -s user -- npx -y @provartesting/provardx-cli mcp start --allowed-paths /path/to/your/provar/project --auto-update

# Project-scoped, shared — run from your project root; writes .mcp.json there; commit to source control
claude mcp add provar -s project -- npx -y @provartesting/provardx-cli mcp start --allowed-paths /path/to/your/provar/project --auto-update

# Project-scoped, private — stored in .claude/settings.local.json; not committed
claude mcp add provar -s local -- npx -y @provartesting/provardx-cli mcp start --allowed-paths /path/to/your/provar/project --auto-update
```

**Via the JSON config file:** edit the location for your scope (see [per-OS table](#find-your-config-file-by-operating-system) above) and paste the [standard config](#the-standard-config-recommended) under `mcpServers.provar`. The Claude Code terminal and the VS Code Claude Code extension share the same config files, so changes propagate everywhere.

**Verification:** ask Claude to call `provardx_ping` with a message. A clean response like `{ "pong": "...", "ts": "...", "server": "provar-mcp@1.5.2-beta.4" }` confirms the server is connected.

</details>

<details>
<summary><b>Claude Desktop (macOS / Windows app)</b></summary>

Claude Desktop is configured only via the JSON config file — there is no `claude` CLI helper for the Desktop app. The fastest way to open the config file is from inside the app itself.

**Edit the config:**

1. Open **Claude menu → Settings → Developer → Edit Config**. The file opens directly without you needing to navigate Finder / Explorer manually.
2. Paste the [standard config](#the-standard-config-recommended) under `mcpServers.provar` and save.
3. **Fully quit and relaunch** Claude Desktop. **Cmd+Q on macOS** — closing the window only minimizes; the server stays attached to the old config until full quit. On Windows, right-click the system-tray icon → **Quit**.

**Platform notes:**

- **macOS:** config file lives at `~/Library/Application Support/Claude/claude_desktop_config.json`.
- **Windows (direct installer):** `%APPDATA%\Claude\claude_desktop_config.json`.
- **Windows (Microsoft Store):** the Store edition runs in an app sandbox that often blocks child-process spawning, causing the MCP server to disconnect immediately with `Server disconnected` errors. **Use the direct installer from claude.ai/download instead.** If you must use the Store version, run Claude Desktop as administrator.
- **Linux:** Claude Desktop is not officially supported on Linux. Use Claude Code instead.

**Verification:** ask Claude Desktop to call `provardx_ping` with a message. A clean response like `{ "pong": "...", "ts": "...", "server": "provar-mcp@1.5.2-beta.4" }` confirms the server is connected.

</details>

<details>
<summary><b>GitHub Copilot</b></summary>

#### VS Code (primary integration)

Create or edit `.vscode/mcp.json` in your workspace root and commit it to source control to share with your team. Note that VS Code uses the key **`"servers"`** (not `"mcpServers"`):

```json
{
  "servers": {
    "provar": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@provartesting/provardx-cli",
        "mcp",
        "start",
        "--allowed-paths",
        "${workspaceFolder}",
        "--auto-update"
      ],
      "env": {}
    }
  }
}
```

The `${workspaceFolder}` variable expands to the absolute path of the open workspace root, so the same config works for everyone on the team without per-machine path edits.

After saving, open the **GitHub Copilot Chat** panel and select **Agent** mode. The Provar tools will appear in the available tools list.

> **`TypeError: Cannot read properties of undefined (reading 'prototype')` on Windows?**
> VS Code's MCP server process inherits the _system_ PATH, which may differ from your terminal shell. If you have Node.js 25+ installed at `C:\Program Files\nodejs\` (e.g. from the Windows installer) and use `nvm`/`fnm` for a lower version in your terminal, VS Code will pick Node 25 and crash — Node 25+ is not supported. See [Prerequisites](#prerequisites).
>
> Fix: remove or downgrade the system-wide Node.js to LTS 22, or use the `env` field in `.vscode/mcp.json` to override the PATH:
>
> ```json
> "env": {
>   "PATH": "C:\\Users\\<you>\\AppData\\Roaming\\fnm\\aliases\\default;${env:PATH}"
> }
> ```
>
> Replace the `fnm` path with the output of `fnm which 22` (or whichever LTS you use).

#### Generic (any other Copilot surface)

Surfaces other than VS Code (e.g. GitHub.com Agent mode, future Copilot CLI integrations) follow the standard MCP server spec. Use the [recommended npx config](#the-standard-config-recommended) above as-is.

</details>

<details>
<summary><b>Cursor</b></summary>

Cursor supports both project-level and global MCP configuration via JSON files. The schema matches Claude Code's `mcpServers` key:

- **Workspace** — `<workspace>/.cursor/mcp.json` (commit to source control)
- **Global** — `~/.cursor/mcp.json` (`%USERPROFILE%\.cursor\mcp.json` on Windows)

Paste the [standard config](#the-standard-config-recommended) into either file under `mcpServers.provar`. After saving, restart Cursor (full quit, not just window close). The Provar tools appear under **Settings → MCP**.

</details>

<details>
<summary><b>Agentforce Vibes</b></summary>

[Agentforce Vibes](https://marketplace.visualstudio.com/items?itemName=salesforce.salesforcedx-einstein-gpt) is Salesforce's AI pair-programming extension for VS Code (extension ID `salesforce.salesforcedx-einstein-gpt`). Open the extension's **Settings → Configure MCP Servers** to edit `a4d_mcp_settings.json`, then add a `provar` entry:

```json
{
  "mcpServers": {
    "provar": {
      "disabled": false,
      "type": "stdio",
      "timeout": 600,
      "command": "npx",
      "args": [
        "-y",
        "@provartesting/provardx-cli",
        "mcp",
        "start",
        "--allowed-paths",
        "${workspaceFolder}",
        "--auto-update"
      ],
      "env": {}
    }
  }
}
```

> **Tool limit:** Agentforce Vibes loads approximately 20 tools per MCP server at runtime. The Provar MCP server exposes 38 tools — you may need to restart or re-enable the server between tasks if the active tool list gets out of date. Salesforce is tracking this limit; consult the [Agentforce Vibes MCP documentation](https://developer.salesforce.com/docs/platform/einstein-for-devs/guide/devagent-mcp.html) for the latest guidance.

</details>

<details>
<summary><b>Other MCP-compatible clients</b></summary>

Any client that follows the **stdio transport** of the [MCP spec](https://modelcontextprotocol.io) can connect to the Provar MCP server. The standard config above works as-is. Adjust the top-level key (some clients use `"mcpServers"`, VS Code Copilot uses `"servers"`, others may differ) to match your client's documented schema.

</details>

---

## Authentication — Quality Hub API

The `provar_testcase_validate` tool can run in two modes depending on whether an API key is configured.

| Mode                | When               | What you get                                        |
| ------------------- | ------------------ | --------------------------------------------------- |
| **Quality Hub API** | API key configured | 170+ rules, quality score, tier-specific thresholds |
| **Local only**      | No key             | Structural/schema rules only                        |

The `validation_source` field in every `provar_testcase_validate` response tells you which mode fired:

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

## Agent performance tuning

Two environment variables let you reduce the context budget consumed by the ProvarDX MCP server — useful when working with agents that have a limited context window or a large number of registered tools.

### Compact descriptions (`PROVAR_MCP_SCHEMA_MODE`)

> _See [Configuration reference → Environment variables](#environment-variables) for the canonical env-var table._

```
PROVAR_MCP_SCHEMA_MODE=compact
```

When set to `compact`, most tool and parameter descriptions are replaced with short summaries (typically ≤15 words). This can save hundreds of tokens per tool in the initial context handshake, at the cost of reduced in-description guidance for the agent.

Use this mode if:

- Your agent reports context limit warnings on startup
- You are using a smaller model with a tighter context budget
- Your agents already have domain context and don't need verbose descriptions

### Tool group filtering (`PROVAR_MCP_TOOLS`)

> _See [Configuration reference → Environment variables](#environment-variables) for the canonical env-var table._

```
PROVAR_MCP_TOOLS=nitrox,authoring
```

Restricts which tool groups are registered when the server starts. Only the groups listed (comma-separated, case-insensitive) are made available. `provardx_ping` is always registered regardless of this setting.

| Group name   | Tools registered                                                                                                                                                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nitrox`     | `provar_nitrox_discover`, `provar_nitrox_generate`, `provar_nitrox_patch`, `provar_nitrox_read`, `provar_nitrox_validate`                                                                                                                                                     |
| `automation` | `provar_automation_setup`, `provar_automation_config_load`, `provar_automation_metadata_download`, `provar_automation_compile`, `provar_automation_testrun`                                                                                                                   |
| `qualityhub` | `provar_qualityhub_connect`, `provar_qualityhub_display`, `provar_qualityhub_testrun`, `provar_qualityhub_testrun_abort`, `provar_qualityhub_testrun_report`, `provar_qualityhub_examples_retrieve`, `provar_qualityhub_testcase_retrieve`, `provar_qualityhub_defect_create` |
| `validation` | `provar_project_validate`, `provar_ant_generate`, `provar_ant_validate`, `provar_properties_*`, `provar_testcase_validate`, `provar_testsuite_validate`, `provar_testplan_validate`, `provar_pageobject_validate`                                                             |
| `authoring`  | `provar_testcase_generate`, `provar_pageobject_generate`, `provar_testcase_step_edit`, `provar_testplan_*`                                                                                                                                                                    |
| `inspect`    | `provar_project_inspect`                                                                                                                                                                                                                                                      |
| `connection` | `provar_connection_list`                                                                                                                                                                                                                                                      |
| `rca`        | `provar_testrun_rca`, `provar_testrun_report_locate`                                                                                                                                                                                                                          |

**Example — NitroX-only session:**

```json
{
  "env": {
    "PROVAR_MCP_TOOLS": "nitrox"
  }
}
```

---

## Path security

All file-system operations (read, write, generate) are restricted to the paths supplied via `--allowed-paths`. Any attempt to access a path outside those roots is rejected with a `PATH_NOT_ALLOWED` error. Path traversal sequences (`../`) are blocked with a `PATH_TRAVERSAL` error.

Symlinks are resolved via `fs.realpathSync` before the containment check, so a symlink inside an allowed directory that points outside it cannot bypass the restriction. For tools that accept multiple path inputs (such as `provar_ant_generate`'s `provar_home`, `project_path`, and `results_path`), all path fields are validated before any file operation occurs — not just the output path.

On **Windows**, path comparisons are performed case-insensitively to account for the fact that `fs.realpathSync` does not always canonicalize drive-letter case (e.g. `c:\` vs `C:\`). This means `C:\Projects\my-project` and `c:\projects\my-project` are treated as equivalent when checking against `--allowed-paths`.

---

## Warning codes

Cross-cutting warning codes surfaced by validation, configuration, and run tooling. These complement the per-tool `rule_id` codes (e.g. `TC_001`, `VAR-REF-001`) documented under [Available tools](#available-tools). Subsequent revisions will refine the meanings as the relevant tool surfaces stabilise.

| Code             | Surfaced by                             | Meaning                                                                                                                                           |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PROVARHOME-001` | properties / automation tooling         | `provarHome` is missing, blank, or does not point to a Provar install                                                                             |
| `DATA-001`       | `provar_testcase_validate`              | `<dataTable>` iteration is silently ignored when a test case runs in direct `testCase`-mode (see [Data-driven execution](#data-driven-execution)) |
| `PARALLEL-001`   | automation / run tooling                | Parallel-mode cache mismatch between properties and active runtime config                                                                         |
| `SCHEMA-001`     | strict properties / config validators   | Unknown or misspelled key in a JSON / properties schema (typo guard)                                                                              |
| `RUN-001`        | `provar_automation_testrun` and friends | Test run produced no executable results — check input selection                                                                                   |
| `JUNIT-001`      | report / RCA tooling                    | JUnit results file is missing, empty, or not parseable                                                                                            |

Warning-code messages emitted via `formatWarning()` follow the shape `WARNING [<CODE>]: <message>` (optionally suffixed with ` Did you mean '<suggestion>'?` when a typo is detected). Other free-form warnings without a structured code — such as the placeholder warnings emitted by `provar_properties_validate` — remain plain strings. See `src/mcp/utils/warningCodes.ts` for the canonical enum.

---

## Available tools

### `provardx_ping`

A lightweight sanity-check tool. Echoes back the message you send. Useful for verifying the server is running and the client is connected.

**Input**

| Parameter | Type   | Required | Description           |
| --------- | ------ | -------- | --------------------- |
| `message` | string | no       | Any text to echo back |

**Output**

| Field             | Type           | Description                                          |
| ----------------- | -------------- | ---------------------------------------------------- |
| `pong`            | string         | The echoed message                                   |
| `ts`              | string         | ISO-8601 timestamp                                   |
| `server`          | string         | Server name and version (e.g. `provar-mcp@1.5.0`)    |
| `updateAvailable` | boolean        | Whether a newer version is available in the registry |
| `latestVersion`   | string \| null | Latest version found in the npm registry, or `null`  |
| `updateCommand`   | string \| null | Command to run to update the plugin, or `null`       |

---

### `provar_project_inspect`

Inspects a Provar project folder and returns a structured inventory of all key project artefacts. Compiled `bin/` directories are automatically excluded.

**Input**

| Parameter      | Type                              | Required | Description                                                                                                                                                                                                                               |
| -------------- | --------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project_path` | string                            | yes      | Absolute path to the Provar project root                                                                                                                                                                                                  |
| `detail`       | `summary` \| `standard` \| `full` | no       | Response verbosity. `"summary"` returns only `requestId`, `project_path`, `provar_home`, and `summary`. `"standard"` (default) returns full inventory. `"full"` is identical to `"standard"` for this tool.                               |
| `fields`       | string                            | no       | Comma-separated top-level keys to retain (e.g. `"test_case_files,summary"`). Supports dot notation for nested filtering (e.g. `"test_project.connections"`). Unknown field names are silently ignored. Applied after the `detail` filter. |

**Output** — JSON object containing:

| Field                         | Description                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `requestId`                   | Unique identifier for this request (always present, including in `detail="summary"` responses)                                       |
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

### `provar_connection_list`

Lists all connections and named environments defined in the project's `.testproject` file. Use this **before** generating test cases or page objects to discover the exact connection names to use.

**Prerequisite:** the project must have a `.testproject` file. Run `provar_project_validate` first if unsure of the project root.

**Security:** only connection names, types, and URLs are returned — credential values from `.secrets` are never included in the output.

**Input**

| Parameter      | Type   | Required | Description                                                                                                                                                                      |
| -------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project_path` | string | yes      | Absolute path to the Provar project root (within `allowed-paths`)                                                                                                                |
| `fields`       | string | no       | Comma-separated response keys to retain (e.g. `"connections,summary"`). Supports dot notation (e.g. `"connections.name,connections.type"`). Unknown fields are silently ignored. |

**Output**

```json
{
  "connections": [
    { "name": "MyOrg", "type": "Salesforce", "url": "sfdc://...", "sso_configured": false },
    { "name": "OktaSso", "type": "SSO", "url": "sso://...", "sso_configured": true }
  ],
  "environments": [
    { "name": "QA", "connection": "MyOrg", "url": "https://qa.example.com" },
    { "name": "UAT", "connection": "AdminOrg" }
  ],
  "summary": { "connection_count": 2, "environment_count": 2 }
}
```

Connection `type` values: `Salesforce`, `Web`, `Quality Hub`, `Web Service`, `Database`, `Google`, `Microsoft`, `Zephyr`, `SSO`, or the raw class name for unknown types.

**Error codes**

| Code                        | Meaning                                                                   |
| --------------------------- | ------------------------------------------------------------------------- |
| `CONNECTION_FILE_NOT_FOUND` | No `.testproject` at the given path. Run `provar_project_validate` first. |
| `PATH_NOT_ALLOWED`          | `project_path` is outside the server's `--allowed-paths`                  |

---

### `provar_pageobject_generate`

Generates a Java Page Object skeleton with the correct `@Page` or `@SalesforcePage` annotation and `@FindBy` field stubs. Optionally generates an `ILoginPage` implementation stub for non-SF SSO connections.

**Input**

| Parameter                   | Type                                                               | Required | Description                                                                                             |
| --------------------------- | ------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------- |
| `class_name`                | string                                                             | yes      | PascalCase Java class name (e.g. `AccountDetailPage`)                                                   |
| `package_name`              | string                                                             | yes      | Java package (e.g. `pageobjects.accounts`)                                                              |
| `page_type`                 | `standard` \| `salesforce`                                         | yes      | Generates `@Page` or `@SalesforcePage` annotation                                                       |
| `title`                     | string                                                             | no       | Page title for the annotation                                                                           |
| `connection_name`           | string                                                             | no       | Salesforce connection name (for `@SalesforcePage`)                                                      |
| `salesforce_page_attribute` | string                                                             | no       | Additional Salesforce page attribute                                                                    |
| `fields`                    | array of `{ name, element_type, locator_strategy, locator_value }` | no       | WebElement field definitions                                                                            |
| `sso_class`                 | string                                                             | no       | PascalCase class name for an `ILoginPage` stub (non-SF SSO). Written alongside the page object on disk. |
| `output_path`               | string                                                             | no       | Full file path to write (must be within `allowed-paths`)                                                |
| `overwrite`                 | boolean                                                            | no       | Overwrite existing file (default: `false`)                                                              |
| `dry_run`                   | boolean                                                            | no       | Return content without writing to disk                                                                  |
| `idempotency_key`           | string                                                             | no       | Prevents duplicate generation for the same key                                                          |

**Output** — `{ java_source: string, file_path?: string, written: boolean, sso_stub_source?: string, sso_stub_file_path?: string, sso_stub_written?: boolean }`

When `sso_class` is provided the response includes `sso_stub_source` (the `ILoginPage` implementation), `sso_stub_file_path` (derived from `output_path`'s directory), and `sso_stub_written`.

---

### `provar_pageobject_validate`

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

### `provar_testcase_generate`

Generates an XML test case skeleton with UUID v4 guids and sequential `testItemId` values.

The tool's chip-level `title` — `Generate Test Case (full steps in one call)` — carries the construction contract so that MCP clients which render only the title (Claude Desktop tool-picker chips, Cursor audit pane, inline tool-call references) surface the single-call requirement to the agent before any description is read.

> **Construction pattern (read first).** Pass the FULL step tree for the test case in a single call via the `steps[]` array. Do **not** call this tool with `steps: []` and then append steps via repeated `provar_testcase_step_edit` calls — that pattern drops scenarios, flattens nesting, and produces inconsistent step types. `provar_testcase_step_edit` is for **amending** an already-validated test case (single-step add, attribute fix, debug edit), not for **constructing** one from scratch.

**Generated `<testCase>` element structure (Provar requirements):**

```xml
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<testCase guid="<uuid>" id="1" registryId="<uuid>">
  <summary/>
  <steps>...</steps>
</testCase>
```

- `id` is always the integer literal `"1"` — Provar ignores any other value
- No `name` attribute on `<testCase>` — Provar derives the name from the file name
- `<summary/>` must appear before `<steps>`
- `standalone="no"` is required in the XML declaration

**URI-aware XML structure:** use `target_uri` to pick the correct XML nesting:

- Omit or use a `sf:` URI → flat Salesforce step structure (existing behaviour)
- `ui:pageobject:target?pageId=pageobjects.Page` → wraps all steps in a `UiWithScreen` element (testItemId=1); substeps clause at testItemId=2; inner steps start at testItemId=3

**Argument XML conventions** (automatically applied by the generator):

| Argument key / value pattern                                                                   | Emitted XML class                     | API context                          |
| ---------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------ |
| `target` key                                                                                   | `class="uiTarget"`                    | UiWithScreen, UiWithRow              |
| `locator` key                                                                                  | `class="uiLocator"`                   | UiDoAction, UiAssert, UiRead, UiFill |
| Value matches `{VarName}` or `{A.B}`                                                           | `class="variable"` + `<path>`         | Any step                             |
| SetValues attributes                                                                           | `class="valueList"/<namedValues>`     | SetValues only                       |
| Value `YYYY-MM-DDTHH:MM:SS` + optional `.fff` + optional `Z`/`±HH:MM` (ISO-8601, end-anchored) | `class="value" valueClass="datetime"` | Any step                             |
| Value `YYYY-MM-DD` (ISO-8601)                                                                  | `class="value" valueClass="date"`     | Any step                             |
| Value `true` / `false`                                                                         | `class="value" valueClass="boolean"`  | Any step                             |
| Numeric value `^-?\d+(\.\d+)?$` (`42`, `-5`, `3.14`)                                           | `class="value" valueClass="decimal"`  | Any step                             |
| All other values                                                                               | `class="value" valueClass="string"`   | Any step                             |

`valueClass` is inferred automatically by `inferSalesforceValueClass(key, val, fieldTypeHint?)`. Detection order: explicit `fieldTypeHint` (wired in a follow-up tool surface — `field_type_hints` param) → ISO-8601 datetime (with optional fractional seconds and timezone, end-anchored) → ISO-8601 date → boolean → decimal → string. Per the canonical Provar reference numbers always emit as `valueClass="decimal"` (there is no separate `integer` valueClass). Provar runtime silently discards date fields emitted as `valueClass="string"`, so always pass date / datetime values in ISO-8601 form.

AssertValues uses **flat** argument structure (`expectedValue`, `actualValue`, `comparisonType`) — not the `valueList`/namedValues format.

**Input**

| Parameter             | Type                                     | Required | Description                                                                                                                                                                             |
| --------------------- | ---------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test_case_name`      | string                                   | yes      | Human-readable test case name                                                                                                                                                           |
| `steps`               | array of `{ api_id, name, attributes? }` | no       | Step definitions                                                                                                                                                                        |
| `target_uri`          | string                                   | no       | Page object URI. `ui:pageobject:target?pageId=pageobjects.X` triggers `UiWithScreen` nesting; `sf:` or absent → flat.                                                                   |
| `grouping_mode`       | `auto` \| `flat` \| `single-screen`      | no       | Controls how UI action siblings (`UiDoAction`, `UiAssert`, `UiRead`, `UiFill`, `UiNavigate`, `UiWithRow`, `UiHandleAlert`) are nested under a preceding `UiWithScreen`. Default `auto`. |
| `output_path`         | string                                   | no       | File path to write (must be within `allowed-paths`)                                                                                                                                     |
| `overwrite`           | boolean                                  | no       | Overwrite existing file (default: `false`)                                                                                                                                              |
| `dry_run`             | boolean                                  | no       | Return XML without writing to disk                                                                                                                                                      |
| `validate_after_edit` | boolean                                  | no       | Run structural validation after generation (default: `true`). Returns `TESTCASE_INVALID` if invalid. Set `false` to skip.                                                               |
| `idempotency_key`     | string                                   | no       | Prevents duplicate generation for the same key                                                                                                                                          |

**`grouping_mode` — auto-nesting UI actions under `UiWithScreen`.** Provar IDE renders a test case correctly only when UI action steps (the 7-API set: `UiDoAction`, `UiAssert`, `UiRead`, `UiFill`, `UiNavigate`, `UiWithRow`, `UiHandleAlert`) live inside their owning `UiWithScreen`'s `<clauses><clause name="substeps"><steps>…</steps></clause></clauses>` block. When the caller passes a flat `steps[]` payload, the generator auto-groups trailing UI-action siblings into that block. This API set matches the validator's `UI-NEST-STRUCT-001` rule exactly, so generator output never false-fails validation.

| Mode             | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auto` (default) | When a `UiWithScreen` is followed by UI action siblings (any of `UiDoAction`, `UiAssert`, `UiRead`, `UiFill`, `UiNavigate`, `UiWithRow`, `UiHandleAlert`), those siblings are absorbed into the screen's `<clause name="substeps">` block. The grouping run stops at the next `UiWithScreen`, any non-UI step (`SetValues`, `ApexConnect`, …), or end of list. `UiWithRow` plays a dual role: when it follows a `UiWithScreen` it is pulled in as a child container and absorbs its own following UI actions. When the payload contains screen containers but no `UiWithScreen` at root (e.g. starts with `UiWithRow`), the generator synthesizes a root `UiWithScreen` wrapper (`target` = `target_uri` or `sf:ui:target`) so the output still satisfies `UI-NEST-STRUCT-001` — without that wrapper, the root `UiWithRow` itself would fail validation. `testItemId`s are assigned depth-first: parent screen, then its substeps slot, then its children. Numbering remains sequential and gap-free. |
| `flat`           | Legacy behaviour: every step is emitted as a root sibling, no `<clauses>` block is generated. Use this for payloads that are already structured correctly by the caller, or when debugging the pre-PDX-495 shape.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `single-screen`  | Wraps every step in one synthetic `UiWithScreen` whose `target` is `sf:ui:target` (or the URI passed via `target_uri`). Matches the existing `ui:pageobject:target` semantics. Use for tests that all live on a single screen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

If `target_uri` is `ui:pageobject:target?pageId=…` the single-screen wrap takes precedence regardless of `grouping_mode` — this is the pre-existing non-SF nesting behaviour.

**`ApexSoqlQuery` argument IDs** (common source of runtime errors — wrong names are silently accepted but fail at runtime):

| Argument ID          | Purpose                                     |
| -------------------- | ------------------------------------------- |
| `soqlQuery`          | The SOQL SELECT statement                   |
| `resultListName`     | Variable name that receives the result list |
| `apexConnectionName` | Named Salesforce connection                 |
| `resultScope`        | Optional scope (Test, Local, Global)        |

**Microsoft Dynamics 365 + Power Platform shorthands** (Provar 3.0.7+) — auto-expand to the `NitroXConnect:ms-*` family. See the `provar://docs/step-reference` resource for full argument and `<generatedParameters>` documentation.

| Shorthand              | Fully-qualified apiId                                                 | Variant-specific args          |
| ---------------------- | --------------------------------------------------------------------- | ------------------------------ |
| `MSDynamics365Connect` | `com.provar.plugins.forcedotcom.core.ui.NitroXConnect:ms-dynamics365` | `appName`                      |
| `MSDataverseConnect`   | `com.provar.plugins.forcedotcom.core.ui.NitroXConnect:ms-dataverse`   | _(none)_                       |
| `MSPowerAppConnect`    | `com.provar.plugins.forcedotcom.core.ui.NitroXConnect:ms-powerapp`    | `powerAppName`                 |
| `MSPowerPageConnect`   | `com.provar.plugins.forcedotcom.core.ui.NitroXConnect:ms-powerpage`   | `environment`, `powerPageName` |

Validation rules: `UI-NITROX-CONNECT-ARGS-001` (critical, bans ApexConnect-only and cross-variant args), `UI-NITROX-VARIANT-ARG-001` (minor, requires variant-specific arg unless declared in `<generatedParameters>`).

**Output** — `{ xml_content: string, file_path?: string, written: boolean, validation?: ValidationResult }`

`validation` is present when `validate_after_edit=true` (default). If the generated XML fails validation the tool returns `TESTCASE_INVALID` with the `validation` field in `details`.

**Error codes**

| Code               | Meaning                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TESTCASE_INVALID` | Generated XML failed structural validation (see `details.validation`)                                                                                                                |
| `FILE_EXISTS`      | `output_path` already exists and `overwrite=false`                                                                                                                                   |
| `STEPS_REQUIRED`   | Called with `steps:[]` + `dry_run:false` + `output_path` — constructing a test case requires the full step tree on the write path. `details.suggestion` tells the caller how to fix. |

**`STEPS_REQUIRED`.** The rejected shape is `steps:[]` + `dry_run:false` + `output_path`. Constructing a test case requires the full step tree in a single call; passing an empty array on the write path would produce a skeleton-only file. All other empty-steps shapes remain allowed:

| `steps.length` | `dry_run`     | `output_path` | Result                                                  |
| -------------- | ------------- | ------------- | ------------------------------------------------------- |
| 0              | `true`        | any           | Allowed — preserves skeleton inspection / IDE preview   |
| 0              | `false`       | absent        | Allowed — no file would be written anyway               |
| 0              | `false`       | **present**   | **Rejected** with `STEPS_REQUIRED` (no file is written) |
| ≥ 1            | true or false | any           | Allowed — normal happy path                             |

`details.suggestion` instructs the caller to pass the FULL step tree in a single call, clarifies that `provar_testcase_step_edit` is for amendment-only, and notes the `dry_run=true` escape hatch for skeleton inspection.

---

### `provar_testcase_validate`

Validates an XML test case for schema correctness (validity score) and best practices (quality score). The quality score uses the exact same weighted-deduction formula as the Provar Quality Hub Lambda service, guaranteeing score parity between the MCP and API surfaces.

**Input**

| Parameter         | Type                              | Required                                    | Description                                                                                                                                                                             |
| ----------------- | --------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content`         | string                            | one of `content`/`xml`/`file_path` required | XML content to validate (MCP field name)                                                                                                                                                |
| `xml`             | string                            | one of `content`/`xml`/`file_path` required | XML content to validate (API-compatible alias)                                                                                                                                          |
| `file_path`       | string                            | one of `content`/`xml`/`file_path` required | Path to the `.testcase` XML file                                                                                                                                                        |
| `detail`          | `summary` \| `standard` \| `full` | no                                          | Response verbosity. `"summary"`: is_valid, scores, and stop signal only. `"standard"`/`"full"`: full issues list (default).                                                             |
| `baseline_run_id` | string                            | no                                          | `run_id` from a previous call. Returns only new/resolved issues since that run (`{ added, resolved, unchanged_count, run_id }`). Returns `BASELINE_NOT_FOUND` if the run ID is unknown. |

**Output**

| Field                            | Type           | Description                                                                                                                    |
| -------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `run_id`                         | string         | Stable identifier for this validation run. Pass as `baseline_run_id` in the next call to receive only new/resolved issues.     |
| `completeness_score`             | number (0–1)   | Ratio of valid test cases to total test cases validated (`0.0`–`1.0`).                                                         |
| `recommended_next_action`        | string         | `"stop"` (all passing), `"continue"` (issues remain), or `"escalate"` (no baseline yet — run without `baseline_run_id` first). |
| `is_valid`                       | boolean        | `true` if zero ERROR-level schema violations                                                                                   |
| `validity_score`                 | number (0–100) | Schema compliance score (100 − errorCount × 20)                                                                                |
| `quality_score`                  | number (0–100) | Best-practices score (weighted deduction formula)                                                                              |
| `error_count`                    | integer        | Schema error count                                                                                                             |
| `warning_count`                  | integer        | Schema warning count                                                                                                           |
| `step_count`                     | integer        | Number of `<apiCall>` steps                                                                                                    |
| `test_case_id`                   | string         | Value of the `id` attribute                                                                                                    |
| `test_case_name`                 | string         | Value of the `name` attribute                                                                                                  |
| `issues`                         | array          | Schema issues with `rule_id`, `severity`, `message`                                                                            |
| `best_practices_violations`      | array          | Best-practices violations with `rule_id`, `severity`, `weight`, `message`                                                      |
| `best_practices_rules_evaluated` | integer        | How many best-practices rules were checked                                                                                     |
| `validation_source`              | string         | `quality_hub`, `local`, or `local_fallback` — see Authentication section                                                       |
| `validation_warning`             | string         | Present when `validation_source` is `local` (onboarding) or `local_fallback` (explains why API failed)                         |

**Key schema rules:** TC_001 (missing XML declaration), TC_002 (malformed XML), TC_003 (wrong root element), TC_010/011/012 (missing/invalid id/guid), TC_031 (invalid apiCall guid), TC_034/035 (non-integer testItemId).

**Warning rules:**

- **DATA-001** — `testCase` declares a `<dataTable>` element. When the validator is called with `file_path` and the project's `provardx-properties.json` references that test case directly via top-level `testCase` or `testCases` (rather than via a `.testinstance` inside a plan), the warning carries the `WARNING [DATA-001]:` prefix and recommends wiring the test into a plan via `provar_testplan_add-instance`. When `file_path` is not supplied (or the project context cannot be resolved), the warning falls back to a structural advisory recommending `SetValues` (Test scope) steps. The warning is suppressed entirely when a `.testinstance` references the test case, because data-driven iteration works in that mode. See also [Data-driven execution](#data-driven-execution).
- **ASSERT-001** — An `AssertValues` step uses the `argument id="values"` (namedValues) format, which is designed for UI element attribute assertions. For Apex/SOQL result or variable comparisons this silently passes as `null=null`. Use separate `expectedValue`, `actualValue`, and `comparisonType` arguments instead.
- **UI-TARGET-001** — A UiWithScreen or UiWithRow `target` argument uses the wrong XML class (e.g. `class="value"`). Must be `class="uiTarget"` or the screen binding is silently ignored at runtime.
- **UI-LOCATOR-001** — A locator-bearing UI step (`UiDoAction`, `UiAssert`, `UiRead`, `UiFill`) has a `locator` argument that uses the wrong XML class. Must be `class="uiLocator"` or Provar cannot resolve the element.
- **SETVALUES-STRUCTURE-001** (ERROR) — A `SetValues` step's `values` argument uses `class="value"` (plain string) instead of `class="valueList"` with `<namedValues>` children. This causes an immediate `ClassCastException` at runtime.
- **UI-NEST-STRUCT-001** (severity `major`, weight 7, category `XMLSchema`) — A UI action step (`UiDoAction`, `UiAssert`, `UiRead`, `UiFill`, `UiNavigate`, `UiWithRow`, or `UiHandleAlert`) is emitted outside a screen ancestor. To pass, every UI action must descend from a `UiWithScreen` or `UiWithRow` `apiCall` through a `<clause name="substeps">` path. Control-flow wrappers (`If`/`ForEach`/`DoWhile`/`WaitFor`/`Switch`) between the screen ancestor and the UI action are allowed; steps inside `<clause name="hidden">` are exempt (disabled / settings blocks). One violation is emitted per offending step, so `(rule_id, test_item_id)` de-duplicates cleanly against the Quality Hub API. Provar IDE cannot bind flat-emitted UI actions to a screen context and they will not render in the editor. Wrap each offending step in the canonical chain:
  ```xml
  <apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiWithScreen" ...>
    <arguments>...</arguments>
    <clauses>
      <clause name="substeps" testItemId="…">
        <steps>
          <apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction" .../>
          <apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiWithRow" ...> ... </apiCall>
        </steps>
      </clause>
    </clauses>
  </apiCall>
  ```
  `UiWithRow` plays a dual role: it is itself a UI action that must be nested, and a container whose `<clause name="substeps">` satisfies the rule for its descendants. Mirrors Quality Hub's `UiActionNestingStructureValidator`.
- **VAR-REF-001** — An argument value looks like a variable reference (`{VarName}` or `{Obj.Field}`) but is stored as `class="value" valueClass="string"`. Provar will treat it as a literal string, not resolve the variable. Replace with `class="variable"` and `<path>` elements.
- **VAR-REF-002** — A `{VarName}` token is embedded inside a larger plain string (e.g. `SELECT Id FROM Account WHERE Id = '{AccountId}'`). Provar does not perform `{…}` interpolation in string values at runtime; the braces are emitted literally. Use `class="compound"` with `<parts>` children to split the literal text and variable references. In `provar_testcase_generate`, pass the value with `{VarName}` placeholders — the generator emits compound XML automatically.

**Error codes**

| Code                 | Meaning                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `BASELINE_NOT_FOUND` | The `baseline_run_id` was not found. Run without `baseline_run_id` first to establish a baseline. |
| `VALIDATE_ERROR`     | Unexpected validation error                                                                       |
| `FILE_NOT_FOUND`     | `file_path` does not exist                                                                        |
| `PATH_NOT_ALLOWED`   | `file_path` is outside the server's `--allowed-paths`                                             |

---

### `provar_testsuite_validate`

Validates a Provar test suite — checks for empty suites, duplicate names (within the suite), oversized suites (>75 test cases), and naming convention consistency. Recursively validates child suites and individual test case XML.

**Input**

| Parameter           | Type                              | Required | Description                                                                                                                                      |
| ------------------- | --------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `suite_name`        | string                            | yes      | Name of the test suite                                                                                                                           |
| `test_cases`        | array                             | no       | Test cases directly in this suite. Each item: `{ name, xml_content \| xml }`                                                                     |
| `child_suites`      | array                             | no       | Child suites (up to 2 levels of nesting). Each item: `{ name, test_cases?, test_suites?, test_case_count? }`                                     |
| `test_case_count`   | integer                           | no       | Override total count for the size check (useful when not sending full XML)                                                                       |
| `quality_threshold` | number (0–100)                    | no       | Minimum quality score for a test case to be "valid" (default: 80)                                                                                |
| `detail`            | `summary` \| `standard` \| `full` | no       | Response verbosity. `"summary"`: name, scores, and stop signal only. `"standard"`/`"full"`: full violations and per-test-case results (default). |
| `baseline_run_id`   | string                            | no       | `run_id` from a previous call. Returns only new/resolved violations since that run. Returns `BASELINE_NOT_FOUND` if the run ID is unknown.       |

**Output** — `{ run_id, completeness_score, recommended_next_action, name, level: "suite", quality_score, violations[], test_cases[], test_suites[], summary }`

| Field                     | Type         | Description                                                                                                         |
| ------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| `run_id`                  | string       | Stable identifier for this run. Pass as `baseline_run_id` in the next call to receive only new/resolved violations. |
| `completeness_score`      | number (0–1) | Ratio of valid test cases to total (`0.0`–`1.0`).                                                                   |
| `recommended_next_action` | string       | `"stop"`, `"continue"`, or `"escalate"` — see [Quality scores explained](#quality-scores-explained).                |

**Violation rule IDs:** SUITE-EMPTY-001, SUITE-DUP-001, SUITE-DUP-002, SUITE-SIZE-001, SUITE-NAMING-001, SUITE-NAMING-002

---

### `provar_testplan_validate`

Validates a Provar test plan — checks for empty plans, duplicate suite names, oversized plans (>20 suites), plan-completeness metadata, and naming consistency. Recursively validates suites and test cases.

**Input**

| Parameter           | Type                              | Required | Description                                                                                                                                  |
| ------------------- | --------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan_name`         | string                            | yes      | Name of the test plan                                                                                                                        |
| `test_suites`       | array                             | no       | Test suites in this plan                                                                                                                     |
| `test_cases`        | array                             | no       | Test cases directly in this plan                                                                                                             |
| `test_suite_count`  | integer                           | no       | Override suite count for the size check                                                                                                      |
| `metadata`          | object                            | no       | Plan completeness metadata (see below)                                                                                                       |
| `quality_threshold` | number (0–100)                    | no       | Minimum quality score (default: 80)                                                                                                          |
| `detail`            | `summary` \| `standard` \| `full` | no       | Response verbosity. `"summary"`: name, scores, and stop signal only. `"standard"`/`"full"`: full violations and hierarchy results (default). |

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

**Output** — `{ completeness_score, recommended_next_action, name, level: "plan", quality_score, violations[], test_suites[], test_cases[], summary }`

| Field                     | Type         | Description                                                                                          |
| ------------------------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| `completeness_score`      | number (0–1) | Ratio of valid test cases to total (`0.0`–`1.0`).                                                    |
| `recommended_next_action` | string       | `"stop"`, `"continue"`, or `"escalate"` — see [Quality scores explained](#quality-scores-explained). |

**Violation rule IDs:** PLAN-EMPTY-001, PLAN-DUP-001, PLAN-SIZE-001, PLAN-NAMING-001, PLAN-META-001 through PLAN-META-007

---

### `provar_project_validate`

Validates a Provar project directly from its directory on disk. Reads the plan/suite/testinstance hierarchy from `plans/`, resolves test case XML from `tests/`, extracts project context (connections, environments, secrets password) from the `.testproject` file, and runs the full cross-cutting rule set.

> **Use this tool for whole-project validation.** Pass `project_path` and let the server handle all file reading. Do not read individual test case files and pass XML content inline — this tool does that for you.

**Input**

| Parameter              | Type                              | Required | Description                                                                                                                                                                       |
| ---------------------- | --------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project_path`         | string                            | yes      | Absolute path to the Provar project root (directory containing `.testproject`)                                                                                                    |
| `quality_threshold`    | number (0–100)                    | no       | Minimum quality score for a test case to be considered valid (default: 80)                                                                                                        |
| `save_results`         | boolean                           | no       | Write a QH-compatible JSON report to `{project_path}/provardx/validation/` (default: true)                                                                                        |
| `results_dir`          | string                            | no       | Override the output directory for the saved report (must be within `allowed-paths`)                                                                                               |
| `detail`               | `summary` \| `standard` \| `full` | no       | Response verbosity. `"summary"`: key scores and stop signal only. `"standard"`: slim violation summary (default). `"full"`: full per-suite and per-test-case data.                |
| `baseline_run_id`      | string                            | no       | `run_id` from a previous call. Returns only new/resolved project violations since that run. Returns `BASELINE_NOT_FOUND` if the run ID is unknown. Requires `save_results: true`. |
| `include_plan_details` | boolean                           | no       | **@deprecated** — use `detail="full"` instead. Include full per-suite and per-test-case data (default: false).                                                                    |
| `max_uncovered`        | integer                           | no       | **@deprecated** — response is automatically scoped by `detail` level. Maximum uncovered test case paths to return (default: 20).                                                  |
| `max_violations`       | integer                           | no       | **@deprecated** — response is automatically scoped by `detail` level. Caps project violations returned when `include_plan_details: true` (default: 50).                           |

**Output** (slim mode, `include_plan_details: false`)

| Field                     | Description                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `run_id`                  | Stable identifier for this run (only present when `save_results: true`). Pass as `baseline_run_id` in the next call to receive only new/resolved violations. |
| `completeness_score`      | Ratio of valid test cases to total (`0.0`–`1.0`).                                                                                                            |
| `recommended_next_action` | `"stop"`, `"continue"`, or `"escalate"` — see [Quality scores explained](#quality-scores-explained).                                                         |
| `quality_score`           | Project quality score (0–100)                                                                                                                                |
| `coverage_percent`        | Percentage of test cases covered by at least one plan                                                                                                        |
| `violation_summary`       | Map of `rule_id → count` for all violations found                                                                                                            |
| `plan_scores`             | Array of `{ name, quality_score }` per plan                                                                                                                  |
| `uncovered_test_cases`    | Uncovered test case paths (capped at `max_uncovered`)                                                                                                        |
| `save_error`              | Present only if the results file could not be written                                                                                                        |
| `plan_integrity_warnings` | Present when any plan or suite directory is missing a `.planitem` file — test instances in those directories are silently invisible to the Provar runner     |

When `include_plan_details: true`, the response additionally includes full `test_plans[]` with nested suite and per-test-case data.

**Plan integrity warnings:** `provar.project.validate` now walks every `plans/` subdirectory and checks that a `.planitem` file is present at both the plan level and each suite subfolder level. If any are missing, the response includes a `plan_integrity_warnings` array. Use `provar.testplan.create-suite` to create missing `.planitem` files without losing any existing test instances.

**Violation rule IDs:** PROJ-EMPTY-001, PROJ-DUP-001, PROJ-DUP-002, PROJ-CALLABLE-001, PROJ-CALLABLE-002, PROJ-CONN-001, PROJ-ENV-001, PROJ-ENV-002, PROJ-SECRET-001

**Error codes:** `NOT_A_PROJECT`, `AMBIGUOUS_PROJECT`, `PATH_NOT_FOUND`, `PATH_NOT_ALLOWED`, `PATH_TRAVERSAL`, `BASELINE_NOT_FOUND` (baseline run not found — run without `baseline_run_id` first to establish a baseline)

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

Both names are accepted in all four validation tools (`provar_testcase_validate`, `provar_testsuite_validate`, `provar_testplan_validate`, `provar_project_validate`). This makes it straightforward to share request payloads between the REST API and the MCP surface without conversion.

---

### `provar_properties_generate`

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

### `provar_properties_read`

Reads and parses a `provardx-properties.json` file directly from disk. Use this to inspect the current configuration before making changes with `provar_properties_set`.

If the file you read differs on critical fields (`provarHome`, `projectPath`, `resultsPath`) from the file currently registered via `provar_automation_config_load`, the response will include a `details.warning` listing the divergent keys. This catches the common case where the agent reads one file but test runs use another.

**Input**

| Parameter   | Type   | Required | Description                                 |
| ----------- | ------ | -------- | ------------------------------------------- |
| `file_path` | string | yes      | Path to the `provardx-properties.json` file |

**Output** — `{ requestId, file_path, content[, details.warning] }` where `content` is the parsed JSON object. `details.warning` is present when the file diverges from the active sf config.

**Error codes:** `PROPERTIES_FILE_NOT_FOUND`, `MALFORMED_JSON`, `PATH_NOT_ALLOWED`, `PATH_TRAVERSAL`

---

### `provar_properties_set`

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

**Error codes:** `PROPERTIES_FILE_NOT_FOUND`, `MALFORMED_JSON`, `PATH_NOT_ALLOWED`

---

### `provar_properties_validate`

Validates a `provardx-properties.json` file against the ProvarDX schema. Checks required fields, valid enum values, and warns about unfilled `${PLACEHOLDER}` values. Also surfaces a `SCHEMA-001` warning for any unknown top-level, `metadata.*`, or `environment.*` key, with a "Did you mean ..." suggestion when a canonical key is within Levenshtein distance 2. Accepts either a file path or inline JSON content.

**Input**

| Parameter   | Type   | Required                     | Description                    |
| ----------- | ------ | ---------------------------- | ------------------------------ |
| `file_path` | string | one of `file_path`/`content` | Path to the file to validate   |
| `content`   | string | one of `file_path`/`content` | Inline JSON string to validate |

**Output**

| Field           | Description                                                 |
| --------------- | ----------------------------------------------------------- |
| `is_valid`      | `true` if no errors (warnings alone do not flip `is_valid`) |
| `error_count`   | Number of validation errors                                 |
| `warning_count` | Number of warnings (placeholders, unknown keys, etc.)       |
| `errors`        | Array of `{ field, severity: 'error', message }`            |
| `warnings`      | Array of `{ field, severity: 'warning', message }`          |

**Warning codes (`warnings` array):**

- `SCHEMA-001` — unknown key at top-level / `metadata.*` / `environment.*`. Example: `WARNING [SCHEMA-001]: Unknown field 'testCases' at top-level. Did you mean 'testCase'?` Unknown keys are **warnings, not errors**, so additive Provar versions do not break older MCP clients. The classic instance is the `testCases` (plural) typo for the canonical `testCase` (singular) — if you see SCHEMA-001 on `testCases`, fix the spelling before running any tests.

**Error codes:** `MISSING_INPUT`, `PROPERTIES_FILE_NOT_FOUND`, `MALFORMED_JSON`, `PATH_NOT_ALLOWED`

---

### `provar_ant_generate`

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

### `provar_ant_validate`

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

### `provar_qualityhub_connect`

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

### `provar_qualityhub_display`

Displays information about the currently connected Quality Hub org. Invokes `sf provar quality-hub display`.

**Input**

| Parameter    | Type                              | Required | Description                                                                                                                                              |
| ------------ | --------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target_org` | string                            | no       | SF CLI org alias (uses default if omitted)                                                                                                               |
| `flags`      | string[]                          | no       | Additional raw CLI flags                                                                                                                                 |
| `detail`     | `summary` \| `standard` \| `full` | no       | Response verbosity. `"summary"` returns only `requestId` and `exitCode`. `"standard"` (default) returns `requestId`, `exitCode`, `stdout`, and `stderr`. |
| `fields`     | string                            | no       | Comma-separated response keys to retain (e.g. `"exitCode,stdout"`). Unknown fields are silently ignored. Applied after the `detail` filter.              |

**Output** — `{ requestId, exitCode, stdout, stderr }`. Use `detail="summary"` to reduce to `{ requestId, exitCode }` only, or pass `fields` to select specific keys.

---

### `provar_qualityhub_testrun`

Triggers a Quality Hub test run. Invokes `sf provar quality-hub test run`. Returns the test run ID which can be passed to `provar_qualityhub_testrun_report` to poll for results.

> **Wildcard warning:** if any value in `flags` contains `*` or `?`, the tool adds `details.warning` explaining that QH plan-level reporting will be skipped. Execution still proceeds — the warning is non-blocking.

**Input**

| Parameter    | Type     | Required | Description                                                                                                                                   |
| ------------ | -------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `target_org` | string   | yes      | SF CLI org alias or username                                                                                                                  |
| `flags`      | string[] | no       | Additional raw CLI flags (e.g. `["--plan-name", "SmokeTests"]`). Avoid wildcards in `--plan-name` values — they skip QH plan-level reporting. |

**Output** — `{ requestId, exitCode, stdout, stderr, details?: { warning: string } }`

**Error codes:** `QH_TESTRUN_FAILED`, `SF_NOT_FOUND`

---

### `provar_qualityhub_testrun_report`

Polls the status of an in-progress or completed Quality Hub test run. Invokes `sf provar quality-hub test run report`.

**Input**

| Parameter    | Type     | Required | Description                                                   |
| ------------ | -------- | -------- | ------------------------------------------------------------- |
| `target_org` | string   | yes      | SF CLI org alias or username                                  |
| `run_id`     | string   | yes      | Test run ID returned by `provar_qualityhub_testrun`           |
| `flags`      | string[] | no       | Additional raw CLI flags (e.g. `["--result-format", "json"]`) |

**Output** — `{ requestId, exitCode, stdout, stderr }`

**Error codes:** `QH_REPORT_FAILED`, `SF_NOT_FOUND`

---

### `provar_qualityhub_testrun_abort`

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

### `provar_qualityhub_testcase_retrieve`

Retrieves test cases from Quality Hub by user story or metadata component. Invokes `sf provar quality-hub testcase retrieve`.

**Input**

| Parameter    | Type                              | Required | Description                                                                                                                                              |
| ------------ | --------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target_org` | string                            | yes      | SF CLI org alias or username                                                                                                                             |
| `flags`      | string[]                          | no       | Additional raw CLI flags (e.g. `["--issues", "US-123", "--test-project", "MyProj"]`)                                                                     |
| `detail`     | `summary` \| `standard` \| `full` | no       | Response verbosity. `"summary"` returns only `requestId` and `exitCode`. `"standard"` (default) returns `requestId`, `exitCode`, `stdout`, and `stderr`. |
| `fields`     | string                            | no       | Comma-separated response keys to retain (e.g. `"exitCode,stdout"`). Unknown fields are silently ignored. Applied after the `detail` filter.              |

**Output** — `{ requestId, exitCode, stdout, stderr }`. Use `detail="summary"` to reduce to `{ requestId, exitCode }` only, or pass `fields` to select specific keys.

**Error codes:** `QH_RETRIEVE_FAILED`, `SF_NOT_FOUND`

---

### `provar_automation_setup`

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

After a successful setup, update `provarHome` in your `provardx-properties.json` using `provar_properties_set`.

**Error codes:** `AUTOMATION_SETUP_FAILED`, `SF_NOT_FOUND`

---

### `provar_automation_testrun`

Triggers a Provar Automation test run using the currently loaded properties file. Invokes `sf provar automation test run`. This is the **LOCAL Execute** step of the AI loop — for grid-managed runs use `provar_qualityhub_testrun`.

**Input**

| Parameter | Type     | Required | Description                                                              |
| --------- | -------- | -------- | ------------------------------------------------------------------------ |
| `flags`   | string[] | no       | Raw CLI flags to forward (e.g. `["--project-path", "/path/to/project"]`) |

**Output** — `{ requestId, exitCode, stdout, stderr[, output_lines_suppressed][, steps][, details.warning][, warnings] }`

The `stdout` field is filtered before returning: Java schema-validator lines (`com.networknt.schema.*`) and stale logger-lock `SEVERE` warnings are stripped. If any lines were suppressed, `output_lines_suppressed` contains the count.

After each run, the tool scans the results directory for JUnit XML files and adds a `steps` array when results are found:

```json
"steps": [
  { "testItemId": "1", "title": "TC-Login-001-LoginAndVerify.testcase", "status": "pass" },
  { "testItemId": "2", "title": "TC-Login-002-ForgotPassword.testcase", "status": "fail", "errorMessage": "TimeoutException: page did not load",
 "error_category": "TIMEOUT", "retryable": true }
]

Each entry represents one test case. status is "pass", "fail", or "skip". If the results directory cannot be located or contains no JUnit XML,
details.warning explains why and steps is absent.

Failed steps may include two optional classification fields:

- error_category — one of INFRASTRUCTURE, ASSERTION, LOCATOR, TIMEOUT, OTHER, set when the failure text matches a known pattern.
- retryable — true when error_category is INFRASTRUCTURE or TIMEOUT (transient causes), false for ASSERTION/LOCATOR/OTHER. Absent when no
pattern matched.

Zero-tests guard (RUN-001): when the sf command exits 0, the results directory was located, and at least one JUnit XML file parsed successfully
but contains zero executed test cases, the response includes a warnings[] array containing a RUN-001 (#warning-codes) message. This is almost
always a typo such as testCase vs testCases (or some other unknown key) in provardx-properties.json — the run silently selected nothing. The
warning is additive and never flips exitCode or sets isError; the failure surface remains driven by the underlying sf exit code.

▎ Why RUN-001 stays silent when no JUnit data is available: if the results directory cannot be located, contains no XML files, or every XML file
▎  fails to parse, the tool genuinely has no data on which to assert "zero tests ran" — the absence of parsed results is just "we don't know
▎ what ran". In those cases the response carries details.warning (explaining why structured step data is missing) and RUN-001 is suppressed to
▎ avoid misdirecting the agent toward a typo when the real issue is a missing/unreadable results dir.

Error codes: AUTOMATION_TESTRUN_FAILED, SF_NOT_FOUND
Warning codes: RUN-001 (zero tests executed despite success)
```

### `provar_automation_compile`

Compiles PageObject and PageControl Java source files. Invokes `sf provar automation project compile`. Run this after generating or modifying Page Objects, before triggering a test run.

**Input**

| Parameter | Type     | Required | Description              |
| --------- | -------- | -------- | ------------------------ |
| `flags`   | string[] | no       | Raw CLI flags to forward |

**Output** — `{ requestId, exitCode, stdout, stderr }`

**Error codes:** `AUTOMATION_COMPILE_FAILED`, `SF_NOT_FOUND`

---

### `provar_automation_metadata_download`

Downloads Salesforce metadata into the Provar project cache. Invokes `sf provar automation metadata download`. Run this when you need up-to-date org metadata for Page Object generation or test execution.

**Input**

| Parameter | Type     | Required | Description                                                                   |
| --------- | -------- | -------- | ----------------------------------------------------------------------------- |
| `flags`   | string[] | no       | Raw CLI flags to forward (e.g. `["--connections", "MySalesforceConnection"]`) |

**Output** — `{ requestId, exitCode, stdout, stderr }`

**Error codes:** `AUTOMATION_METADATA_FAILED`, `SF_NOT_FOUND`

---

### `provar_qualityhub_defect_create`

Creates `Defect__c` records in Quality Hub for every failed test execution in a given test run. For each failure, creates a `Defect__c` (with description, step, browser, environment, and tester populated), then links it via `Test_Case_Defect__c` and `Test_Execution_Defect__c` junction records. If Jira or ADO sync is configured in the Quality Hub org, defects automatically sync to those systems.

**Input**

| Parameter      | Type     | Required | Description                                                                                             |
| -------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `run_id`       | string   | yes      | Test run `Tracking_Id__c` returned by `provar_qualityhub_testrun`                                       |
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

### `provar_automation_config_load`

Register a `provardx-properties.json` file as the active Provar configuration. **Required before `provar_automation_compile` or `provar_automation_testrun`** — without this step those commands fail with `MISSING_FILE`.

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

### `provar_testrun_report_locate`

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

### `provar_testrun_rca`

Analyse a completed test run and return a structured Root Cause Analysis report. Reads `JUnit.xml`, classifies each failure into a root cause category, extracts page object and operation names, and flags pre-existing failures across prior Increment runs.

| Input          | Type    | Required | Description                                                                                                                              |
| -------------- | ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `project_path` | string  | yes      | Absolute path to the Provar project root                                                                                                 |
| `results_path` | string  | no       | Explicit results directory override; must be within `--allowed-paths` if provided                                                        |
| `run_index`    | integer | no       | Specific Increment run to analyse (default: latest)                                                                                      |
| `locate_only`  | boolean | no       | Skip parsing; return artifact paths only (default: false)                                                                                |
| `mode`         | string  | no       | `"rca"` (default) — full classification report. `"failures"` — lightweight `[{ testItemId, title, errorMessage }]` array, no RCA fields. |

**mode=rca output fields:**

| Output field            | Description                                                                     |
| ----------------------- | ------------------------------------------------------------------------------- |
| `results_dir`           | Resolved results directory                                                      |
| `run_in_progress`       | `true` when `JUnit.xml` is absent (run still executing)                         |
| `rca_skipped`           | `true` when `locate_only: true`                                                 |
| `run_summary`           | `{ total, passed, failures, errors, skipped, duration_seconds }`                |
| `failures`              | Array of `FailureReport` (see below)                                            |
| `infrastructure_issues` | Recommendations for infra-category failures (credential, driver, license, etc.) |
| `recommendations`       | Deduplicated list of all recommended actions                                    |

**mode=failures output fields:**

| Output field      | Description                                                          |
| ----------------- | -------------------------------------------------------------------- |
| `results_dir`     | Resolved results directory                                           |
| `failures`        | `Array<{ testItemId: string, title: string, errorMessage: string }>` |
| `details.warning` | Set when `JUnit.xml` is absent; `failures` will be empty             |

Use `mode="failures"` when you only need the list of failing test case names without loading the full HTML report. Use `mode="rca"` (default) for root-cause classification and fix recommendations.

**`FailureReport` fields (mode=rca only):**

| Field                 | Description                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `test_case`           | Test case filename from JUnit `<testcase name>`                                                                                                        |
| `error_class`         | Extracted exception class name                                                                                                                         |
| `error_message`       | First 500 chars of failure/error text                                                                                                                  |
| `root_cause_category` | One of 17 categories (see list below)                                                                                                                  |
| `root_cause_summary`  | Human-readable cause description                                                                                                                       |
| `recommendation`      | Suggested fix action                                                                                                                                   |
| `page_object`         | Extracted from `Page Object: ...` pattern, or `null`                                                                                                   |
| `operation`           | Extracted from `operation: ...` pattern, or `null`                                                                                                     |
| `report_html`         | Path to per-test HTML report if found, else `null`                                                                                                     |
| `screenshot_dir`      | Path to `Artifacts/` directory if it exists, else `null`                                                                                               |
| `pre_existing`        | `true` if the same test failed in a prior Increment run                                                                                                |
| `error_category`      | Optional. One of `INFRASTRUCTURE` \| `ASSERTION` \| `LOCATOR` \| `TIMEOUT` \| `OTHER`. Absent when no known pattern matched.                           |
| `retryable`           | Optional. `true` when `error_category` is `INFRASTRUCTURE` or `TIMEOUT` (transient causes); `false` otherwise. Absent when `error_category` is absent. |

**Root cause categories:** `DRIVER_VERSION_MISMATCH`, `LOCATOR_STALE`, `TIMEOUT`, `ASSERTION_FAILED`, `CREDENTIAL_FAILURE`, `MISSING_CALLABLE`, `METADATA_CACHE`, `PAGE_OBJECT_COMPILE`, `CONNECTION_REFUSED`, `DATA_SETUP`, `LICENSE_INVALID`, `SALESFORCE_VALIDATION`, `SALESFORCE_PICKLIST`, `SALESFORCE_REFERENCE`, `SALESFORCE_ACCESS`, `SALESFORCE_TRIGGER`, `UNKNOWN`

**Error category vs. root cause category:** `root_cause_category` is fine-grained (17 buckets) and drives the human-readable `recommendation`. `error_category` is coarse-grained (5 buckets) and drives automated retry policy via `retryable`. The two are independent classifiers over the same failure text — both may be set on the same failure.

Salesforce DML error categories (`SALESFORCE_*`) represent test-data failures — they appear in `failures[].root_cause_category` but are **not** included in `infrastructure_issues`.

**Error codes:** `RESULTS_NOT_CONFIGURED`, `PATH_NOT_ALLOWED`, `PATH_TRAVERSAL`

---

### `provar_testcase_step_edit`

Atomically add or remove a single step (`<apiCall>`) in a Provar XML test case file. Writes a `.bak` backup before mutating, runs structural validation after the edit, and automatically restores the backup if validation fails.

The tool's chip-level `title` — `Amend Existing Test Case Step` — signals the amendment-only contract in MCP clients that render only the title (Claude Desktop tool-picker chips, Cursor audit pane, inline tool-call references). An agent that reads only the title still sees that this tool operates on an existing test case, not a new one.

> **When to use.** This tool is for **amending** an existing, already-validated test case (single-step add, attribute fix, debug edit). It is **not** for constructing a test case from scratch by calling it repeatedly after a `steps: []` `provar_testcase_generate`. Building a case step-by-step via repeated `step_edit` calls produces structurally invalid test cases (dropped scenarios, flat asserts, inconsistent step types). For new test cases, pass the full step tree to `provar_testcase_generate` in a single call.

Prerequisites: the test case file must exist and be valid XML with a `<testCase><steps>` structure.

| Input                 | Type    | Required       | Description                                                                                                             |
| --------------------- | ------- | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `test_case_path`      | string  | yes            | Absolute path to the `.testcase` file; must be within `--allowed-paths`                                                 |
| `mode`                | string  | yes            | `"remove"` — delete a step; `"add"` — insert a new step                                                                 |
| `test_item_id`        | string  | yes            | For `remove`: `testItemId` of the step to delete. For `add`: `testItemId` of the anchor step.                           |
| `position`            | string  | no (add only)  | `"before"` or `"after"` relative to the anchor step (default: `"after"`)                                                |
| `step_xml`            | string  | yes (add only) | The `<apiCall ...>...</apiCall>` XML fragment for the new step. Must be well-formed and contain an `<apiCall>` element. |
| `validate_after_edit` | boolean | no             | Run structural validation after the mutation; restores backup on failure (default: `true`)                              |

| Output field   | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `success`      | `true` on successful mutation                              |
| `test_item_id` | The `test_item_id` that was targeted                       |
| `mode`         | `"remove"` or `"add"`                                      |
| `validation`   | `TestCaseValidationResult` when `validate_after_edit=true` |

**Error codes:**

| Code                     | Meaning                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `STEP_NOT_FOUND`         | No step with the given `testItemId` found; `details.all_test_item_ids` lists every ID in the file |
| `INVALID_STEP_XML`       | `step_xml` failed XML parsing or contains no `<apiCall>` element; file is not modified            |
| `INVALID_XML_AFTER_EDIT` | Post-mutation validation failed; original file has been restored from backup                      |
| `FILE_NOT_FOUND`         | `test_case_path` does not exist                                                                   |
| `MISSING_INPUT`          | `step_xml` is required for `mode=add` but was not provided                                        |
| `PATH_NOT_ALLOWED`       | `test_case_path` or its `.bak` path is outside `--allowed-paths`                                  |

**Example — remove step 3:**

```json
{
  "test_case_path": "/projects/myapp/tests/Login.testcase",
  "mode": "remove",
  "test_item_id": "3"
}
```

**Example — insert a Sleep step after step 2:**

```json
{
  "test_case_path": "/projects/myapp/tests/Login.testcase",
  "mode": "add",
  "test_item_id": "2",
  "position": "after",
  "step_xml": "<apiCall apiId=\"com.provar.plugins.bundled.apis.control.Sleep\" testItemId=\"99\" guid=\"550e8400-e29b-41d4-a716-446655440099\" name=\"Wait 2s\"><arguments><argument apiId=\"sleepTime\" value=\"2000\"/></arguments></apiCall>"
}
```

---

### `provar_testplan_add-instance`

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

### `provar_testplan_create-suite`

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

### `provar_testplan_remove-instance`

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

## Data-driven execution

Provar's data-driven execution relies on the `<dataTable>` element inside a `.testcase` XML. The runtime only **iterates rows** when the test case is launched through a test-plan instance (a `.testinstance` file under `plans/`). When the same test case is launched directly via the top-level `testCase` or `testCases` property in `provardx-properties.json`, the runtime ignores the data table entirely — every step referencing a `<value class="variable">` resolves to `null`, and the test typically completes "successfully" against an empty row set.

This produces silent-pass behaviour that is hard to spot from a log: the run exits 0, JUnit shows one test case, and the data-driven assertions never fire. The MCP server detects this configuration mismatch and surfaces a **`DATA-001`** warning so an AI agent can recover before the next run.

**When does `DATA-001` fire?**

| Condition (validator called with `file_path`)                                                | DATA-001 emitted? | Severity |
| -------------------------------------------------------------------------------------------- | ----------------- | -------- |
| `<dataTable>` present **and** referenced from a `.testinstance` inside `plans/`              | No                | —        |
| `<dataTable>` present **and** referenced via top-level `testCase` / `testCases` array        | Yes               | WARNING  |
| `<dataTable>` present **and** project context cannot be resolved (no active properties file) | Yes (structural)  | WARNING  |
| No `<dataTable>` element                                                                     | No                | —        |

The plan-mode resolver consults the properties file registered by [`provar_automation_config_load`](#provar_automation_config_load) (`PROVARDX_PROPERTIES_FILE_PATH` in `~/.sf/config.json`), reads `projectPath`, then:

1. Walks `<projectPath>/plans/**/*.testinstance` for any `testCasePath="..."` referencing the test under validation. If found → `plan` mode → DATA-001 suppressed.
2. Otherwise checks `testCase` / `testCases` for a direct reference. If found → `direct` mode → DATA-001 with the PDX-489 advisory.
3. Falls back to `unknown` mode when no project context is resolvable — DATA-001 still fires (structural fallback) so authors editing a test case in isolation are still warned.

**Recommended workaround**

When `DATA-001` fires in direct mode, wire the test case into a plan via [`provar_testplan_add-instance`](#provar_testplan_add-instance) and run via the `testPlan` property in `provardx-properties.json` instead of `testCase` / `testCases`. The pattern is:

1. Use [`provar_testplan_create-suite`](#provar_testplan_create-suite) to add a suite under an existing plan if needed.
2. Use [`provar_testplan_add-instance`](#provar_testplan_add-instance) to create the `.testinstance` linking the test case to the suite.
3. Update `provardx-properties.json` to reference the plan (and remove the direct `testCase` entry if it no longer applies) before invoking [`provar_automation_testrun`](#provar_automation_testrun).
4. Re-run [`provar_testcase_validate`](#provar_testcase_validate) on the test case file — DATA-001 should no longer appear.

The constraint is also referenced in the [`provar_testcase_generate`](#provar_testcase_generate) tool description so an agent constructing a new data-driven test case sees the limitation up front, and in [`provar_automation_testrun`](#provar_automation_testrun) so an agent triggering a run is reminded that direct-mode execution will not iterate.

---

## Org metadata access

Tools that surface Salesforce org metadata to authoring tools without making a live API call. These read from data that has already been written to disk by the Provar IDE — they do **not** trigger metadata downloads themselves and they do **not** require an authenticated session.

> **Distinct from `.provarCaches`:** the runtime cache used by `provar_automation_testrun` lives at `<resultsPath>/.provarCaches/` and is regenerated per run. The cache read by `provar_org_describe` lives in the Provar IDE **workspace** (`<workspace>/.metadata/<connection_name>/`) and is updated when a user opens the project and loads a connection in the IDE.

### `provar_org_describe`

Read cached Salesforce describe data for one connection from the Provar workspace `.metadata` cache. Returns the object list, required-field schema, and a cache age. Use this before calling `provar_testcase_generate` so the generator can produce steps with correctly-typed field values.

**Prerequisite:** the project must have been opened in Provar IDE at least once with the named connection loaded. If the cache is missing, the tool returns a structured response with `details.suggestion` rather than an error.

**Workspace discovery heuristic** — the tool walks candidate directories in this order and uses the first one that exists:

1. `<parent-of-project>/workspace-<basename>/` — sibling workspace pattern (default for Provar IDE in this workspace layout).
2. `<parent-of-project>/Provar_Workspaces/workspace-<name-dashes>/` — shared `Provar_Workspaces` directory.
3. `~/Provar/workspace-<name-dashes>/` — user-home fallback.

`<name-dashes>` is the project's basename with whitespace collapsed to single dashes and lowercased: `"My Project"` → `"my-project"`.

| Input             | Type                    | Required | Default      | Description                                                                                                                                                                    |
| ----------------- | ----------------------- | -------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `project_path`    | string                  | yes      | —            | Absolute path to the Provar test project root (the directory containing `.testproject`). Must be within `--allowed-paths`.                                                     |
| `connection_name` | string                  | yes      | —            | Connection name as defined in `.testproject` (e.g. `"MyOrg"`). Must match the `.metadata` subdirectory exactly. Path separators in this value are rejected (`PATH_TRAVERSAL`). |
| `objects`         | string[]                | no       | all          | Filter — only return data for these object API names. When omitted, lists every object cached under the connection directory.                                                  |
| `field_filter`    | `'required'` \| `'all'` | no       | `'required'` | Which fields to return. `'required'` includes only fields with `nillable=false`; `'all'` returns every cached field.                                                           |

| Output field              | Description                                                                                                                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requestId`               | UUID for this invocation. Echoed in MCP server logs for cross-correlation. Consistent with the rest of the MCP tool surface.                                                                                                             |
| `workspace_path`          | Absolute resolved path to the discovered workspace, or `null` when none of the three candidate directories exists (or all candidates were outside `--allowed-paths`).                                                                    |
| `cache_age_ms`            | `mtime` delta in milliseconds of the connection cache directory, or `null` when the cache is missing.                                                                                                                                    |
| `objects[]`               | Array of `{ name, exists, required_fields, field_count, error_message? }`. `exists` is `true` (cache file present), `false` (requested but not cached), or `null` (cache miss — the whole `.metadata/<connection>` directory is absent). |
| `objects[].error_message` | Present **only** when a cache file existed but failed to parse (`exists: true, field_count: 0`). Lets the agent distinguish a corrupt / unsupported cache file from a missing one.                                                       |
| `details.suggestion`      | Present **only** on cache miss. Tells the agent how to populate the cache (open Provar IDE) or how to proceed without it (inline hints).                                                                                                 |

**Example — happy path:**

```jsonc
// Request
{
  "project_path": "/Users/me/git/MyProject",
  "connection_name": "MyOrg",
  "objects": ["Account", "Contact"],
  "field_filter": "required"
}

// Response
{
  "requestId": "01HEXX...K7P",
  "workspace_path": "/Users/me/git/workspace-MyProject",
  "cache_age_ms": 1839200,
  "objects": [
    {
      "name": "Account",
      "exists": true,
      "required_fields": [
        { "name": "Name", "type": "string", "default_value": null, "nillable": false }
      ],
      "field_count": 24
    },
    {
      "name": "Contact",
      "exists": true,
      "required_fields": [
        { "name": "LastName", "type": "string", "default_value": null, "nillable": false }
      ],
      "field_count": 31
    }
  ]
}
```

**Example — cache miss:**

```jsonc
// Response when the .metadata/<connection_name> directory does not exist
{
  "requestId": "01HEXX...K7P",
  "workspace_path": "/Users/me/git/workspace-MyProject",
  "cache_age_ms": null,
  "objects": [{ "name": "Account", "exists": null, "required_fields": [], "field_count": 0 }],
  "details": {
    "suggestion": "Open this project in Provar IDE and load the 'MyOrg' connection, or pass field-type hints inline to provar_testcase_generate."
  }
}
```

**Example — parse error on a cached file:**

```jsonc
// Response when Account.json exists but is corrupt / unparseable
{
  "requestId": "01HEXX...K7P",
  "workspace_path": "/Users/me/git/workspace-MyProject",
  "cache_age_ms": 1839200,
  "objects": [
    {
      "name": "Account",
      "exists": true,
      "required_fields": [],
      "field_count": 0,
      "error_message": "Failed to parse cache file (Account.json): Unexpected token } in JSON at position 42"
    }
  ]
}
```

**On-disk cache schema (one file per object).** The tool reads `.json` first, then `.xml`, then `.object` as a fallback:

```jsonc
// <workspace>/.metadata/<connection_name>/Account.json
{
  "name": "Account",
  "fields": [
    { "name": "Name", "type": "string", "defaultValue": null, "nillable": false },
    { "name": "Phone", "type": "phone", "defaultValue": null, "nillable": true }
  ]
}
```

**Error codes:**

| Code               | Meaning                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `PATH_NOT_ALLOWED` | `project_path` or the resolved workspace path is outside `--allowed-paths`.                    |
| `PATH_TRAVERSAL`   | `project_path` contains `..` segments, or `connection_name` contains a path separator or `..`. |

---

## NitroX — Hybrid Model page objects

NitroX is Provar's **Hybrid Model** for locators. Instead of hand-written Java Page Objects it uses component-based `.po.json` files that map UI elements for any Salesforce component type: LWC, Screen Flow, Industry / OmniStudio, Experience Cloud, and standard HTML5. These files live in `nitroX/` directories inside your Provar project.

The five `provar_nitrox_*` tools let an AI agent discover existing NitroX page objects, read them as training context, validate new ones against the schema, generate fresh components from a description, and apply surgical edits via JSON merge-patch.

> **Tip:** Before calling `provar_nitrox_generate`, read the `provar://nitrox/component-catalog` resource to understand the component types, tagName conventions, interaction titles, and attribute patterns from the shipped base packages.

> **Note:** NitroX page objects are read and written directly from disk using the standard file-system path policy (`--allowed-paths`). No `sf` subprocess is involved.

> **Schema sourcing:** The `FactComponent.schema` and `FactPackage.schema` JSON schemas bundled in this package are used by editors and IDE tooling (e.g., VS Code JSON language server, SchemaStore) to provide IntelliSense when authoring `.po.json` files. They are fetched from an internal Provar source during each `provardx-cli` release build alongside the component catalog, so the bundled copies always reflect the latest NitroX specification. Both schemas are pinned to the same internal revision to avoid version skew. If the fetch fails at build time, the previously committed schemas are used as a fallback. Check `provar://nitrox/catalog-source` to see whether the schemas in a running server were successfully refreshed (`schemasUpdated: true`).

---

### `provar_nitrox_discover`

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

### `provar_nitrox_read`

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

### `provar_nitrox_validate`

Validate a NitroX `.po.json` (Hybrid Model component page object) against the FACT schema rules. Returns a quality score (0–100) and a combined list of issues from two sequential validation passes:

1. **Hardcoded semantic rules (NX001–NX010)** — always run
2. **JSON schema validation (`NX_SCHEMA_*`)** — runs when the bundled `FactComponent.schema.json` is available; falls back to hardcoded-rules-only if the schema cannot be loaded

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

**Hardcoded rules:**

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

**JSON schema rules (`NX_SCHEMA_*`):**

Rule IDs follow the pattern `NX_SCHEMA_<KEYWORD>` where `<KEYWORD>` is the AJV validation keyword in `SCREAMING_SNAKE_CASE`. Common rule IDs:

| Rule ID                           | Severity | Description                                                                    |
| --------------------------------- | -------- | ------------------------------------------------------------------------------ |
| `NX_SCHEMA_TYPE`                  | ERROR    | Property has the wrong JSON type (e.g. string where boolean expected)          |
| `NX_SCHEMA_REQUIRED`              | ERROR    | Required property missing (per JSON schema `required` array)                   |
| `NX_SCHEMA_MIN_ITEMS`             | WARNING  | Array has fewer items than `minItems` requires                                 |
| `NX_SCHEMA_ADDITIONAL_PROPERTIES` | WARNING  | Property not defined in the schema (schema uses `additionalProperties: false`) |
| `NX_SCHEMA_PATTERN`               | WARNING  | String value does not match the schema `pattern`                               |
| `NX_SCHEMA_ENUM`                  | WARNING  | Value not in the allowed `enum` list                                           |

Schema issues complement — and may overlap with — the hardcoded NX rules. When overlap occurs, both rule IDs appear in the `issues` array.

**Error codes:** `MISSING_INPUT`, `NX000`, `FILE_NOT_FOUND`, `PATH_NOT_ALLOWED`

---

### `provar_nitrox_generate`

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

### `provar_nitrox_patch`

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

## Quality Hub API tools

These tools call the Quality Hub HTTP API directly (no `sf` subprocess). They require a Provar API key set via `sf provar auth login`.

### `provar_qualityhub_examples_retrieve`

Retrieve N similar Provar test case examples from the Quality Hub corpus (1000+ tests indexed in Bedrock). Use this **before** `provar_testcase_generate` to provide few-shot grounding examples.

If retrieval fails for any reason (no key, invalid key, rate limit, network error), the tool returns `{ examples: [], count: 0, warning: "..." }` with `isError: false` so the generation workflow can continue without grounding. It **never** hard-errors on API failure.

| Input                 | Type    | Required | Default | Description                                                                    |
| --------------------- | ------- | -------- | ------- | ------------------------------------------------------------------------------ |
| `query`               | string  | yes      | —       | User story, requirement, or test content to search against the corpus          |
| `n`                   | integer | no       | `5`     | Number of examples to return. Clamped to [1, 10].                              |
| `app_filter`          | string  | no       | —       | Bias results toward a Salesforce cloud (e.g. `"SalesCloud"`, `"ServiceCloud"`) |
| `prefer_high_quality` | boolean | no       | `true`  | When `true`, favours tier4/tier3 corpus examples over lower tiers              |

| Output field      | Description                                                           |
| ----------------- | --------------------------------------------------------------------- |
| `retrieval_id`    | Opaque ID for the retrieval request (useful for debugging)            |
| `examples`        | Array of corpus examples (empty on failure or zero results)           |
| `count`           | Number of examples returned                                           |
| `query_truncated` | `true` if the query was truncated server-side (max 2000 chars)        |
| `warning`         | Present when retrieval was skipped; contains onboarding/error details |

Each element in `examples`:

| Field               | Description                                                       |
| ------------------- | ----------------------------------------------------------------- |
| `id`                | Corpus path (e.g. `tier4/SalesCloud/create.xml`)                  |
| `name`              | Test case name                                                    |
| `xml`               | Full Provar XML test case content                                 |
| `similarity_score`  | Similarity score in [0, 1]                                        |
| `salesforce_object` | Primary Salesforce object the test exercises                      |
| `quality_tier`      | Corpus tier (`tier4`, `tier3`, `tier2`, `tier1`)                  |
| `full_content`      | `true` when the full XML was returned (not truncated server-side) |

**Error codes:** `INVALID_QUERY` (empty query — only error that sets `isError: true`)

---

### Org metadata via Salesforce Hosted MCP

Provar MCP does not include a built-in org introspection tool. Instead, connect the **Salesforce Hosted MCP Server** (`platform/sobject-reads`) alongside Provar MCP and call `getObjectSchema` to retrieve sObject field metadata. Pass the result as additional context in your `provar_qualityhub_examples_retrieve` query.

| Endpoint   | URL                                                                         |
| ---------- | --------------------------------------------------------------------------- |
| Production | `https://api.salesforce.com/platform/mcp/v1/platform/sobject-reads`         |
| Sandbox    | `https://api.salesforce.com/platform/mcp/v1/sandbox/platform/sobject-reads` |

The SF Hosted MCP uses per-user OAuth 2.0, respects field-level security and sharing rules automatically, and is maintained by Salesforce. See [Salesforce Hosted MCP Server docs](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/sobject-reads.html) for setup.

**Fallback (no SF MCP configured):** append key field API names directly to your `provar_qualityhub_examples_retrieve` query. Example: `"... [Opportunity: CloseDate (Date), Amount (Currency), StageName (Picklist), CustomField__c (Text)]"`

---

## MCP Prompts

The Provar MCP server registers **11 MCP prompts** that pre-wire the tool chain into guided workflows. AI clients that support MCP prompts can invoke them directly by name instead of manually orchestrating the underlying tool sequence. **Important:** prompts that need to list, read, or write local project files (for example, `.testcase` files used by `provar.loop.fix` and `provar.loop.coverage`) also require a client with its own workspace/file tools, such as Claude Code or another MCP-compatible client with local file access configured; MCP prompt support alone is not sufficient for those workflows.

---

### Migration prompts

These prompts convert tests from other frameworks into Provar XML. Each prompt:

1. Calls `provar_qualityhub_examples_retrieve` with keywords from the source test to load few-shot grounding examples.
2. Generates a Provar XML test case using those examples as structural context.
3. Writes the file to the target project.
4. Calls `provar_testcase_validate` and iterates until the output is clean.

---

#### `provar.migrate.crt`

Convert a Copado Robotic Testing (CRT) test — either a QWord step sequence or a Robot Framework `.robot` file — into a Provar XML test case.

**Arguments**

| Parameter     | Type   | Required | Description                                                                      |
| ------------- | ------ | -------- | -------------------------------------------------------------------------------- |
| `source`      | string | yes      | The CRT test content. Accepts a numbered QWord sequence or a full `.robot` file. |
| `projectPath` | string | no       | Absolute path to the Provar project root for writing the output file.            |
| `testName`    | string | no       | Target test case name. Inferred from the source if omitted.                      |

---

#### `provar.migrate.selenium`

Convert a Selenium WebDriver test (Java, Python, or JavaScript) that targets a Salesforce org into a Provar XML test case.

**Arguments**

| Parameter     | Type   | Required | Description                                                                    |
| ------------- | ------ | -------- | ------------------------------------------------------------------------------ |
| `source`      | string | yes      | The Selenium test file content (JUnit/TestNG, unittest/pytest, or Jest/Mocha). |
| `projectPath` | string | no       | Absolute path to the Provar project root for writing the output file.          |
| `testName`    | string | no       | Target test case name. Inferred from the class/method name if omitted.         |

---

#### `provar.migrate.playwright`

Convert a Playwright test (TypeScript or JavaScript) that targets a Salesforce org into a Provar XML test case.

**Arguments**

| Parameter     | Type   | Required | Description                                                                     |
| ------------- | ------ | -------- | ------------------------------------------------------------------------------- |
| `source`      | string | yes      | The Playwright test file content (`@playwright/test` or `playwright` library).  |
| `projectPath` | string | no       | Absolute path to the Provar project root for writing the output file.           |
| `testName`    | string | no       | Target test case name. Inferred from the `test()` block description if omitted. |

---

### AI loop prompts

These prompts drive the iterative test generation and quality improvement loop.

---

#### `provar.loop.generate`

Generate a Provar XML test case from a user story or acceptance criteria. Retrieves corpus examples for grounding, generates the test, writes it to the project, then validates it.

**Arguments**

| Parameter     | Type   | Required | Description                                                                           |
| ------------- | ------ | -------- | ------------------------------------------------------------------------------------- |
| `story`       | string | yes      | The user story or acceptance criteria. Include the Salesforce object and action.      |
| `projectPath` | string | no       | Absolute path to the Provar project root.                                             |
| `testName`    | string | no       | Output test case file name (without extension). Inferred from the story if omitted.   |
| `objectName`  | string | no       | Primary Salesforce object under test (e.g. `"Opportunity"`). Scopes the corpus query. |

---

#### `provar.loop.fix`

Fix a failing Provar test case using RCA output. Reads the current XML, interprets the failure, applies targeted fixes, and re-validates until the test passes.

**Arguments**

| Parameter      | Type   | Required | Description                                                            |
| -------------- | ------ | -------- | ---------------------------------------------------------------------- |
| `testcasePath` | string | yes      | Absolute path to the `.testcase` file to fix.                          |
| `rcaOutput`    | string | yes      | The failure message or RCA output from `provar_testrun_rca`.           |
| `projectPath`  | string | no       | Absolute path to the Provar project root (used for context if needed). |

---

#### `provar.loop.review`

Review a Provar test case for quality, coverage, and best practices. Returns a scored report with specific improvement suggestions.

**Arguments**

| Parameter      | Type   | Required | Description                                      |
| -------------- | ------ | -------- | ------------------------------------------------ |
| `testcasePath` | string | yes      | Absolute path to the `.testcase` file to review. |
| `projectPath`  | string | no       | Absolute path to the Provar project root.        |

---

#### `provar.loop.coverage`

Analyse coverage gaps for a Salesforce object or feature area. Inspects the project's existing tests, identifies what is not covered, and generates new test cases to close the gaps.

**Arguments**

| Parameter     | Type   | Required | Description                                                                                                                                                                                |
| ------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `objectName`  | string | yes      | Primary Salesforce object to check coverage for (e.g. `"Opportunity"`, `"Lead"`).                                                                                                          |
| `projectPath` | string | yes      | Absolute path to the Provar project root.                                                                                                                                                  |
| `targetOrg`   | string | no       | Salesforce org alias or username. When provided, existing Quality Hub test cases for this object are retrieved via `provar_qualityhub_testcase_retrieve` before the coverage gap analysis. |

---

#### `provar.loop.db`

Generate a Provar XML test case that connects to an **external database** (SQL Server, Oracle, MySQL, PostgreSQL, etc.) and verifies query results. This prompt is distinct from the Salesforce/SOQL loop — it targets `DbConnect` + `SqlQuery` steps and enforces the correct patterns for `funcCall` row counts and structured variable paths for field access, which are the most common source of errors in database test generation.

**Arguments**

| Parameter        | Type   | Required | Description                                                                                                                                                                          |
| ---------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `story`          | string | yes      | Description of what the database test should verify. Include the database type, table name, query intent, and what values should be asserted.                                        |
| `projectPath`    | string | no       | Absolute path to the Provar project root. Used to locate the `tests/` directory when writing the output file.                                                                        |
| `testName`       | string | no       | Optional file name for the test case (without extension). Inferred from the story if omitted.                                                                                        |
| `connectionName` | string | no       | The Provar Connection Manager database connection name (`DbConnect.connectionName`). Identifies which connection entry to use. If omitted, the story should describe the connection. |

**What the prompt enforces:**

- `DbConnect.connectionId` must use `valueClass="id"` — not `"string"`
- `DbConnect.resultName` must exactly equal `SqlQuery.dbConnectionName` (the coupling point)
- Row counts use `<value class="funcCall" id="Count">` — not `{Count(Var)}` string expressions
- Indexed field access uses a structured `<value class="variable"><path><filter class="index">` — not `{Var[0].Field}` string expressions

---

## MCP Resources

The Provar MCP server exposes **MCP resources** — structured reference content that AI clients can read directly from the server.

---

### `provar://docs/step-reference`

Canonical reference for all Provar XML test step API IDs, argument formats, validation rules, and corpus-verified examples. AI clients can read this resource to understand correct step structure when generating or reviewing test cases — without needing to fetch it from disk.

**URI:** `provar://docs/step-reference`  
**MIME type:** `text/markdown`

The resource content is the same as `docs/PROVAR_TEST_STEP_REFERENCE.md` in this repository, compiled into the package at build time.

---

### `provar://nitrox/component-catalog`

Catalog of all shipped NitroX (Hybrid Model) base component packages. Lists every package with its components, types, tagNames, interactions, and attributes. Read this before calling `provar_nitrox_generate` to understand available component patterns and naming conventions.

**URI:** `provar://nitrox/component-catalog`  
**MIME type:** `text/markdown`

The resource content is the same as `docs/NITROX_COMPONENT_CATALOG.md` in this repository, compiled into the package at build time.

The catalog is automatically refreshed from an internal Provar source during each `provardx-cli` release build. If the fetch fails at build time (e.g. network unavailable), the previously committed catalog is used as a fallback and a warning is logged.

To check which version is bundled in a running server, read the `provar://nitrox/catalog-source` resource.

---

### `provar://nitrox/catalog-source`

Version metadata for the bundled NitroX component catalog and JSON schemas. Returns the internal source commit SHA, fetch timestamp, and schema update status recorded during the release build that produced this package.

**URI:** `provar://nitrox/catalog-source`  
**MIME type:** `application/json`

```json
{
  "branch": "main",
  "commitSha": "<40-char SHA or null if fetched from fallback>",
  "fetchedAt": "<ISO 8601 timestamp or null>",
  "schemasUpdated": "<true | false | null>"
}
```

`commitSha` and `fetchedAt` are `null` when the release build could not reach the internal source (fallback catalog in use). `schemasUpdated` is `true` when both `FactComponent.schema` and `FactPackage.schema` were successfully fetched from the same internal revision and bundled into this release; `false` when the schema fetch failed and the previously committed schemas are in use; `null` when the catalog source was not generated (dev build or an older release that predates this metadata).

---

## AI loop pattern

The automation tools are designed to support an **AI-driven fix loop**: an agent can iteratively improve test quality without leaving the chat session.

```
provar_project_inspect             → understand what's in the project, find uncovered tests
[SF MCP] getObjectSchema           → retrieve org field metadata (Salesforce Hosted MCP — optional but recommended)
provar_qualityhub_examples_retrieve → fetch few-shot grounding examples from the corpus
provar_testcase_validate           → find quality issues in a test case
provar_testcase_generate           → regenerate or fix the test case XML
provar_testplan_add-instance       → wire a new/fixed test case into a plan suite
provar_testplan_create-suite       → create a suite to organise new tests
provar_ant_generate                → generate (or regenerate) the ANT build.xml for CI
provar_ant_validate                → validate an existing build.xml before committing
provar_automation_config_load      → register the properties file (required before compile/testrun)
provar_automation_compile          → compile Page Objects after changes
provar_automation_testrun          → execute tests locally against the real org
provar_testrun_rca                 → diagnose failures: classify root cause, extract page objects
provar_project_validate            → re-score the full project
```

Combined with Quality Hub (grid-managed runs):

```
provar_qualityhub_connect           → authenticate
provar_qualityhub_testrun           → start a Quality Hub-managed grid run
provar_qualityhub_testrun_report    → poll until complete
provar_qualityhub_testcase_retrieve → pull test cases scoped to a user story
provar_qualityhub_defect_create     → file defects for failures automatically
```

NitroX (Hybrid Model) component page object loop:

```
provar_nitrox_discover   → find all NitroX projects and .po.json files on the machine
provar_nitrox_read       → load existing page objects as AI training context
provar_nitrox_validate   → check a generated or edited .po.json for schema issues
provar_nitrox_generate   → create a new .po.json from a component description
provar_nitrox_patch      → apply targeted edits to an existing .po.json (RFC 7396)
```

> **Note:** `provar_automation_*` and `provar_qualityhub_*` tools invoke `sf` CLI subprocesses. The Salesforce CLI must be installed and in `PATH`, or pass `sf_path` pointing to the executable directly (e.g. `~/.nvm/versions/node/v22.0.0/bin/sf`). A missing `sf` binary returns the error code `SF_NOT_FOUND` with an installation hint.

---

## Performance Tuning

These environment variables let you control agentic-loop safety and observability without modifying tool code.

### Agentic loop guard (`PROVAR_MCP_MAX_TOOL_DEPTH`)

> _See [Configuration reference → Environment variables](#environment-variables) for the canonical env-var table._

Limits the number of Provar tool calls an AI agent may make within a single MCP session before the server starts returning errors instead of results.

```
PROVAR_MCP_MAX_TOOL_DEPTH=30   # allow at most 30 tool calls per session (default: 50)
```

Once the limit is reached, every further call returns:

```json
{
  "error": "TOOL_BUDGET_EXCEEDED",
  "callsMade": 30,
  "limit": 30,
  "suggestion": "Summarize progress and return control to the user."
}
```

| Property  | Value                                                                      |
| --------- | -------------------------------------------------------------------------- |
| Default   | `50`                                                                       |
| Scope     | Per MCP session (`sessionId` from the MCP SDK)                             |
| Exemption | `provardx_ping` is never counted or blocked                                |
| Memory    | Sessions are tracked in-process; restarting the server resets all counters |

The guard is designed to prevent runaway agentic loops from making hundreds of tool calls without human review. Set it lower (e.g. `10`) for tightly supervised workflows; raise it or omit it for long-running automation pipelines where you trust the agent.

### Per-call token attribution (`PROVAR_MCP_EMIT_TOKEN_META`)

> _See [Configuration reference → Environment variables](#environment-variables) for the canonical env-var table._

Appends a `_meta` object to `structuredContent` on every tool response, giving observability tooling a lightweight token-cost signal per call.

```
PROVAR_MCP_EMIT_TOKEN_META=true
```

When enabled, `structuredContent` gains a `_meta` key:

```json
{
  "result": "...",
  "_meta": {
    "tool": "provar_project_inspect",
    "detailLevel": "standard",
    "estimatedTokens": 412
  }
}
```

On `TOOL_BUDGET_EXCEEDED` errors the meta also includes the session cumulative total:

```json
{
  "_meta": {
    "tool": "provar_project_inspect",
    "detailLevel": "standard",
    "estimatedTokens": 38,
    "sessionTotalEstimatedTokens": 8204
  }
}
```

| Field                         | Description                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `tool`                        | Name of the tool that produced this response                                                 |
| `detailLevel`                 | Value of the `detail` argument passed by the caller (`"summary"`, `"standard"`, or `"full"`) |
| `estimatedTokens`             | `ceil(len(JSON.stringify(response)) / 4)` — a rough character-to-token estimate              |
| `sessionTotalEstimatedTokens` | Cumulative estimate for the session; only present on budget-exceeded errors                  |

> **Implementation note:** `_meta` is intentionally placed only in `structuredContent`, never in `content[0].text`. LLM clients read `content[0].text`; including observability data there would waste tokens on every response.
