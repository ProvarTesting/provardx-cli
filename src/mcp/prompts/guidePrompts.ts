/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// ── Prompt: provar.guide.onboarding ──────────────────────────────────────────

export function registerOnboardingPrompt(server: McpServer): void {
  server.prompt(
    'provar.guide.onboarding',
    'First-time setup guide for a Provar project. Walks through project discovery, connection verification, properties configuration, and a first test run. Use this when a user is getting started with ProvarDX for the first time.',
    {
      projectPath: z
        .string()
        .optional()
        .describe(
          'Absolute path to the Provar project root (the folder containing .testproject). If omitted, the guide will ask the user for it.'
        ),
      mode: z
        .string()
        .optional()
        .describe(
          '"local" (default) for running tests via Provar Automation on this machine. "quality-hub" for remote execution via a connected Quality Hub org.'
        ),
    },
    ({ projectPath, mode }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `You are a ProvarDX setup assistant. Help the user connect their Provar project and run their first test.

## Context

${
  projectPath
    ? `The user's Provar project is at: ${projectPath}`
    : 'Ask the user for the path to their Provar project root (the folder containing .testproject). Common locations: ~/ProvarProjects/<name> on Mac/Linux, C:\\Users\\<name>\\ProvarProjects\\<name> on Windows. The marker file is .testproject at the project root.'
}

Execution mode: ${mode === 'quality-hub' ? 'Quality Hub (remote)' : 'Local (Provar Automation)'}


## Workflow

Follow these steps in order. Stop and report if any step fails — do not skip ahead.

### Step 1 — Verify the server is reachable
Call: provardx_ping
If this fails, the MCP server is not running. Tell the user to run: sf provar mcp start --allowed-paths <parent-dir-of-project>

### Step 2 — Inspect the project
Call: provar_project_inspect with the project path.

If PATH_NOT_ALLOWED: the MCP server's --allowed-paths doesn't include this directory. Ask the user to restart with the correct path.
If PATH_NOT_FOUND: confirm the path with the user — typos and path separator differences (/ vs \\) are common.

From the result, summarise in plain language:
- How many test cases were found and where
- Which Salesforce connections are configured
- Whether a provardx-properties.json already exists

### Step 3 — Check connections
Call: provar_connection_list with the project path.

If no connections appear, the project isn't connected to any org yet. Ask the user to open Provar IDE → Project → Connections → Add Connection.

${
  mode === 'quality-hub'
    ? `### Step 4 — Connect to Quality Hub
Call: provar_qualityhub_connect with the user's SF org alias.
Then: provar_qualityhub_display to confirm the correct org is connected.

If NOT_AUTHENTICATED: the user needs to run: sf org login web -o <alias>

### Step 5 — Retrieve available test plans
Call: provar_qualityhub_testcase_retrieve to show what's available to run.
Ask the user which plan they'd like to run first.

### Step 6 — Run first test
Call: provar_qualityhub_testrun with the chosen plan name.
Poll with provar_qualityhub_testrun_report every 30–60 seconds until the run completes.
Stop polling after 20 minutes and ask the user to check Quality Hub directly.`
    : `### Step 4 — Configure properties
If a provardx-properties.json was found in step 2:
  Call: provar_properties_read to show the user the current config.
  Confirm provarHome and connectionName look correct.

If no properties file was found:
  Call: provar_properties_generate using the project path and the first connection name from step 3.

### Step 5 — Register the config
Call: provar_automation_config_load with the properties file path.
This must succeed before compile or test run. If it fails:
  MISSING_FILE: the path is wrong — recheck it.
  AUTOMATION_CONFIG_LOAD_FAILED: call provar_properties_validate to find the issue.

### Step 6 — Compile
Call: provar_automation_compile with the project path.
If this fails with ClassNotFoundException or CompilationException, call provar_pageobject_validate on any .java files in src/pageobjects/ to find the issue.

### Step 7 — Run a first test
Ask the user which test case they'd like to run (or suggest the first one from the inspect result).
Call: provar_automation_testrun with the properties path and the chosen test.`
}

## Common First-Time Issues

| Error | Cause | Fix |
|-------|-------|-----|
| PATH_NOT_ALLOWED | --allowed-paths too narrow | Restart MCP server with parent directory included |
| MISSING_FILE on compile/run | config_load skipped or failed | Run provar_automation_config_load first |
| No connections returned | Project not connected to org | Open Provar IDE → Connections → Add |
| [DOWNLOAD_ERROR] on metadata | Salesforce auth expired | Re-authenticate connection in Provar IDE |
| ClassNotFoundException | Page objects not compiled | Run provar_automation_compile before testrun |

## Finishing Up

After a successful first run, summarise in 3 sentences:
1. What project was connected and how many test cases it has
2. Which connection/org is active
3. What they can do next (run more tests, add to CI, generate new tests)`,
          },
        },
      ],
    })
  );
}

// ── Prompt: provar.guide.troubleshoot ────────────────────────────────────────

export function registerTroubleshootPrompt(server: McpServer): void {
  server.prompt(
    'provar.guide.troubleshoot',
    'Systematic failure diagnosis for Provar test runs. Classifies the error, maps it to a root cause, and gives an actionable fix. Use when a test failed, a tool returned an error, or an agent is looping without progress.',
    {
      errorMessage: z
        .string()
        .optional()
        .describe(
          'The error message, tool output, or failure description. Paste as much as available — the more detail, the better the diagnosis.'
        ),
      projectPath: z.string().optional().describe('Absolute path to the Provar project root, if available.'),
    },
    ({ errorMessage, projectPath }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `You are a ProvarDX diagnostics expert. Identify the root cause of the failure and give an actionable fix.

${
  errorMessage
    ? `## Failure to diagnose\n\n${errorMessage}`
    : 'Ask the user to share the error message, tool output, or a description of what went wrong.'
}
${projectPath ? `\nProject path: ${projectPath}` : ''}

## Loop Detection Rule

If you have tried the same fix 3 times and the error hasn't changed, STOP. Tell the user what you tried and ask them to confirm the environment (org auth, file paths, Provar install).

## Step 1 — Run RCA if a test report exists

If there is a completed test run, use the RCA tool first:
  Call: provar_testrun_report_locate (with project path if available)
  Call: provar_testrun_rca with mode: "rca"

The RCA tool classifies each failure and gives a recommendation per failure. Use it before reading raw stack traces.

## Step 2 — Classify by error pattern

| Pattern in the error | Category | Action |
|---------------------|----------|--------|
| PATH_NOT_ALLOWED | Path policy | Ask user to restart MCP server with --allowed-paths set to the project parent dir |
| MISSING_FILE, AUTOMATION_CONFIG_LOAD_FAILED | Missing prerequisite | Run provar_automation_config_load with the properties file path |
| [DOWNLOAD_ERROR], INVALID_LOGIN, AuthenticationException | Salesforce auth | User must re-authenticate the connection in Provar IDE — cannot fix via MCP |
| ClassNotFoundException, CompilationException | Compile missing | Run provar_automation_compile; run provar_pageobject_validate first if compile fails |
| NoSuchElementException, StaleElementReferenceException | Stale locator | User must re-capture the element in Provar IDE — tell them which test step failed |
| TimeoutException, ElementClickInterceptedException | UI timing | Increase step timeout or check org performance |
| SessionNotCreatedException, Chrome version must be between | WebDriver mismatch | Update ChromeDriver to match installed Chrome |
| AssertionException, UiAssert | Assertion | Verify expected value is correct for current org data state |
| Required fields are missing | Salesforce required field | Check field-level security for the running user |
| FIELD_CUSTOM_VALIDATION_EXCEPTION | Salesforce validation rule | Review validation rules on the target object |
| INVALID_CROSS_REFERENCE_KEY | Record not found | Verify referenced record exists and running user has access |
| bad value for restricted picklist | Picklist mismatch | Run provar_automation_metadata_download; check for trailing spaces |
| LicenseException, license.*expired | License | Contact Provar support — not fixable via MCP |
| caseCall.*cannot.*resolv | Broken callable | Run provar_project_validate; look for PROJ-CALLABLE violations |

## Step 3 — Know when to escalate

Stop and ask the user when:
- The fix requires action in Provar IDE (re-authenticate, re-capture element)
- The fix requires action in a Salesforce org (data, permissions, validation rules)
- The error is LicenseException
- The RCA category is UNKNOWN with no recommendation

When escalating, tell the user: what you tried, what the error says, your best diagnosis, and the specific action they need to take.

## Reading Provar output

Signal lines to look for:
  PASSED: <test-name>
  FAILED: <test-name>
  Provar test run complete: X passed, Y failed

Safely ignore:
  com.networknt.schema.*
  SEVERE.*Failed to configure logger.*\\.lck
  Loading index of metadata`,
          },
        },
      ],
    })
  );
}

// ── Prompt: provar.guide.orchestration ───────────────────────────────────────

export function registerOrchestrationPrompt(server: McpServer): void {
  server.prompt(
    'provar.guide.orchestration',
    'Task sequencing guide for multi-step Provar workflows. Shows the correct tool order for common tasks (run tests, author tests, debug failures, Quality Hub), prerequisite dependencies, and when to stop and ask the user.',
    {
      task: z
        .string()
        .optional()
        .describe(
          'The type of task to sequence: "run-local" (local test execution), "run-quality-hub" (remote runs), "author-test" (writing new tests), "debug-failures" (diagnosing failures), "nitrox" (LWC/Screen Flow work). Omit for a general overview of all flows.'
        ),
    },
    ({ task }) => {
      const flows: Record<string, string> = {
        'run-local': `## Run Tests Locally

Required sequence — do not skip steps:

1. provar_project_inspect       → confirm project root and connections exist
2. provar_properties_read OR provar_properties_generate
3. provar_automation_config_load   ← MUST succeed before step 4
4. provar_automation_compile       ← MUST succeed before step 5
5. provar_automation_testrun
6. provar_testrun_report_locate    → find where results landed
7. provar_testrun_rca              → classify any failures`,

        'run-quality-hub': `## Run Tests via Quality Hub

1. provar_qualityhub_connect        → once per session
2. provar_qualityhub_display        → confirm correct org
3. provar_qualityhub_testrun        → returns run_id
4. provar_qualityhub_testrun_report → poll every 30–60s until terminal status
   Stop polling after 20 minutes — ask user to check Quality Hub directly
5. provar_testrun_rca               → if failures, classify them
6. provar_qualityhub_defect_create  → optional, create defects for failures`,

        'author-test': `## Author a New Test Case

1. provar_project_inspect     → find coverage gaps before writing
2. provar_automation_metadata_download  → if SF metadata is stale (missing fields/objects)
3. provar_pageobject_generate → if a new page object is needed
4. provar_pageobject_validate → validate before compile
5. provar_automation_compile  → after any page object change
6. provar_testcase_generate   → create the test case file
7. provar_testcase_step_edit  → add steps (repeat as needed)
8. provar_testcase_validate   → MUST pass before adding to a plan
9. provar_testplan_add_instance → add to an existing plan
10. provar_testplan_validate   → validate the plan`,

        'debug-failures': `## Debug Failing Tests

1. provar_testrun_report_locate → find the report file
2. provar_testrun_rca           → classify failures by category

Then act on the category:
  AUTH failure      → user must re-authenticate in Provar IDE (cannot fix via MCP)
  LOCATOR failure   → user must re-capture element in Provar IDE
  COMPILE failure   → provar_automation_compile, then provar_pageobject_validate if compile fails
  CALLABLE failure  → provar_project_validate, fix PROJ-CALLABLE violations
  DATA failure      → advise user on org data state
  UNKNOWN           → escalate to user with full RCA output`,

        nitrox: `## NitroX (LWC / Screen Flows / Industry Components)

1. provar_nitrox_discover  → see what's already modeled in the project
2. provar_nitrox_generate  → for the target component
3. provar_nitrox_validate  → always validate immediately after generate
4. provar_nitrox_patch     → to update an existing model
5. provar_nitrox_validate  → always validate after patch

After adding a NitroX model to a page object, run provar_automation_compile.`,

        general: `## All Canonical Task Flows

### Prerequisite graph (hard constraints)
provardx_ping → (confirms server is up — always run first in a fresh session)

provar_properties_* or provar_properties_generate
  └── provar_automation_config_load
        └── provar_automation_compile
              └── provar_automation_testrun
                    └── provar_testrun_report_locate
                          └── provar_testrun_rca

provar_qualityhub_connect
  └── provar_qualityhub_testrun
        └── provar_qualityhub_testrun_report

provar_pageobject_validate
  └── provar_automation_compile (validate before compile — errors are clearer)

provar_nitrox_generate OR provar_nitrox_patch
  └── provar_nitrox_validate (always validate after)

provar_testcase_generate OR provar_testcase_step_edit
  └── provar_testcase_validate
        └── provar_testplan_add_instance
              └── provar_testplan_validate

### Safe to run in parallel (no dependency between them)
- provar_project_inspect + provar_connection_list
- provar_pageobject_validate on multiple files
- provar_testcase_validate on multiple files
- provar_nitrox_validate on multiple models

### Stopping rules
Stop and return to the user when:
1. The same fix has been tried 3 times with identical output
2. The fix requires action in Provar IDE or a Salesforce org
3. A LicenseException appears
4. RCA returns UNKNOWN with no recommendation
5. The task requires a decision only the user can make (which plan, which connection, which org)`,
      };

      const flowContent = flows[task ?? 'general'] ?? flows['general'];

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `You are a ProvarDX workflow coordinator. Follow the task sequence below exactly.

${flowContent}

## Rules for all tasks
- Always call provardx_ping first in a fresh session to confirm the server is up
- Always call provar_project_inspect before any authoring task
- provar_automation_config_load must succeed before compile or testrun — no exceptions
- Validate before execute: testcase_validate before adding to a plan, pageobject_validate before compile
- All paths must be within the --allowed-paths configured for this MCP server
- Stop and ask the user when you hit a stopping rule (see above)`,
            },
          },
        ],
      };
    }
  );
}
