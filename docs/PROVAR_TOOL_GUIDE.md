# ProvarDX MCP Tool Guide

Reference for selecting the right MCP tool for a given goal. Organised by what you're trying to accomplish, not by tool name.

---

## "I want to understand my project"

Start here with any new or unfamiliar project.

```
provar_project_inspect  { project_path }
```

Returns: test case inventory, connection list, plan coverage, config files, ANT files. Run before any authoring or execution task.

To validate structure (not just inventory):

```
provar_project_validate  { project_path }
```

Returns: structure violations, broken callables, missing references.

---

## "I want to run tests"

### Locally (Provar Automation)

Fixed sequence — do not skip steps:

```
1. provar_automation_config_load  { properties_path }     ← required first
2. provar_automation_compile      { project_path }         ← required before run
3. provar_automation_testrun      { properties_path, ... }
```

No properties file yet? Generate one first:

```
provar_properties_generate  { output_path }   ← required; path to write the .json file
                             { project_path }  ← optional; pre-fills projectPath field
```

Then set the connection name:

```
provar_properties_set  { file_path: "<output_path>", key: "connectionName", value: "<name>" }
```

### Via Quality Hub (remote)

```
1. provar_qualityhub_connect        { target_org }
2. provar_qualityhub_testrun        { target_org, flags: ["--plan-name", "<name>"] }
3. provar_qualityhub_testrun_report { target_org, run_id }   ← poll until done
```

**When to use local vs Quality Hub:**

- Local: developer iteration, fast feedback, single machine
- Quality Hub: CI/CD, team-wide, managed environments, plan-level reporting

---

## "I want to understand why tests failed"

```
1. provar_testrun_report_locate  { project_path }   ← find where results landed
2. provar_testrun_rca            { project_path }   ← required; results_path/run_index optional
```

`provar_testrun_rca` classifies each failure (auth, locator, assertion, data, etc.) and gives a recommendation per failure. Use `mode: "failures"` for the raw failure list without classification.

---

## "I want to write a new test"

A Provar test case is a tree (scenarios → UI screens → asserts), not a flat list of steps. The agent that calls `provar_testcase_generate` is responsible for constructing the full tree in **one** call. Splitting authoring across many tool calls causes scenario numbering drift, flat asserts, and inconsistent step types — `provar_testcase_step_edit` is for **amending** an existing test case, not for **constructing** one.

Recommended sequence:

```
1. provar_project_inspect              { project_path }                        ← find coverage gaps first
2. provar_qualityhub_examples_retrieve { object_or_scenario }                  ← ground in corpus examples for the step types you need
3. provar_testcase_generate            { test_case_name, steps: [<ALL steps>] } ← single call, full step tree in one payload
4. provar_testcase_validate            { file_path }                            ← must pass before adding to plan
5. provar_testplan_add-instance        { project_path, plan_name, test_case_path }
6. provar_testplan_validate            { project_path, plan_name }
```

Use `provar_testcase_step_edit` only when:

- Adding a single step to an existing, already-validated test case
- Fixing a step's attributes after a validation finding
- Targeted edits during debugging

Do **not** use `provar_testcase_step_edit` to construct a test case step-by-step from an empty skeleton — the LLM loses scenario context between calls and the resulting structure is unreliable.

---

## "I want to work with Salesforce metadata"

```
provar_automation_metadata_download  { project_path, ... }
```

Run when: first setting up a project, fields/objects are missing from test steps, or after Salesforce org changes. If this fails with `[DOWNLOAD_ERROR]`, the credentials are the issue — re-authenticate the connection in Provar IDE.

---

## "I want to work with page objects"

```
provar_pageobject_generate  { project_path, target_url, ... }   ← generate
provar_pageobject_validate  { file_path }                        ← validate first
provar_automation_compile   { project_path }                     ← after any change
```

Always validate before compile. Validation errors are easier to read than compile errors.

---

## "I want to work with LWC / Screen Flows (NitroX)"

```
provar_nitrox_discover   { project_path }        ← see what's already modeled
provar_nitrox_generate   { project_path, ... }   ← generate for a component
provar_nitrox_validate   { file_path }           ← always validate after generate
provar_nitrox_patch      { file_path, ... }      ← update existing model
provar_nitrox_validate   { file_path }           ← always validate after patch
```

---

## "I want to manage configuration"

```
provar_properties_read      { file_path }              ← read current config
provar_properties_set       { file_path, key, value }  ← change a single value
provar_properties_validate  { file_path }              ← validate after changes
```

| Property         | Controls                                                  |
| ---------------- | --------------------------------------------------------- |
| `provarHome`     | Path to Provar Automation installation                    |
| `projectPath`    | Path to the Provar project                                |
| `resultsPath`    | Where test results are written                            |
| `connectionName` | Which Salesforce connection to use                        |
| `metadataLevel`  | `Reload` / `Refresh` / `Reuse` — metadata cache behaviour |

---

## "I want to check which orgs are available"

```
provar_connection_list  { project_path }
```

Returns all connections in `.testproject`. Use the `name` field from each connection as `connectionName` in properties files.

---

## "I want to create a defect for a failed test"

```
1. provar_qualityhub_testrun        { target_org, ... }    ← captures run_id from response
2. provar_testrun_rca               { project_path }       ← classify failures
3. provar_qualityhub_defect_create  { run_id, target_org } ← run_id from step 1
```

Requires Quality Hub to be connected (`provar_qualityhub_connect` first).

---

## Tool Selection Anti-Patterns

**Don't run `testrun` without `config_load` first.** It fails with `MISSING_FILE` every time.

**Don't run `compile` on a broken page object.** Validate with `provar_pageobject_validate` first.

**Don't call `metadata_download` to fix an assertion failure.** Metadata download refreshes the field cache; it doesn't fix org data state.

**Don't guess the project path.** Confirm with the user or inspect a known parent directory.

**Don't parse raw testrun stdout for pass/fail.** Use `provar_testrun_rca` — raw output contains Java logging noise.
