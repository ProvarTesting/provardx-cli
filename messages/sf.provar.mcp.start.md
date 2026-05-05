# summary

Start a local MCP server for Provar tools over stdio transport.

# description

Launches a stateless MCP (Model Context Protocol) server that exposes Provar tools to
AI assistants (Claude Desktop, Claude Code, Cursor) via stdio transport. All MCP
JSON-RPC communication happens over stdout; all internal logging goes to stderr.

Available tools:

Project & inspection:

- provar_project_inspect — inspect project folder inventory
- provar_project_validate — validate full project from disk: coverage, quality scores
- provar_connection_list — list connections and named environments from the project

Page Object:

- provar_pageobject_generate — generate a Java Page Object skeleton
- provar_pageobject_validate — validate Page Object quality and naming

Test Case:

- provar_testcase_generate — generate an XML test case skeleton
- provar_testcase_validate — validate test case XML (validity + best-practices scores)
- provar_testcase_step_edit — atomically add or remove a single step in a test case

Test Suite / Plan:

- provar_testsuite_validate — validate test suite hierarchy
- provar_testplan_validate — validate test plan metadata completeness
- provar_testplan_create-suite — create a test suite under a plan
- provar_testplan_add-instance — add a test instance to a plan
- provar_testplan_remove-instance — remove a test instance from a plan

Properties files:

- provar_properties_read — read a Provar properties file
- provar_properties_set — set a key in a Provar properties file
- provar_properties_validate — validate a properties file structure
- provar_properties_generate — generate a properties file skeleton

Quality Hub (sf provar quality-hub wrappers):

- provar_qualityhub_connect — connect to a Quality Hub org
- provar_qualityhub_display — display connected org info
- provar_qualityhub_testrun — trigger a Quality Hub test run
- provar_qualityhub_testrun_report — poll test run status
- provar_qualityhub_testrun_abort — abort a running test run
- provar_qualityhub_testcase_retrieve — retrieve test case results
- provar_qualityhub_defect_create — create defects for failed test executions
- provar_qualityhub_examples_retrieve — retrieve corpus examples for test generation grounding

Automation (sf provar automation wrappers):

- provar_automation_setup — set up the Provar Automation runtime
- provar_automation_metadata_download — download Salesforce metadata
- provar_automation_compile — compile Provar test assets
- provar_automation_testrun — run Provar tests
- provar_automation_config_load — load a Provar configuration

ANT build:

- provar_ant_generate — generate an ANT build.xml
- provar_ant_validate — validate an ANT build.xml

Test result analysis:

- provar_testrun_rca — root cause analysis on a test result
- provar_testrun_report_locate — locate a test result report

For full tool documentation see docs/mcp.md in this repository.

# flags.allowed-paths.summary

Allowed base directory paths for file operations. Defaults to current directory.

# flags.auto-defects.summary

When enabled, testrun.report suggestions will prompt defect creation on failures.

# examples

- Start MCP server (accepts stdio connections from Claude Desktop / Cursor):
  <%= config.bin %> <%= command.id %>
- Start with explicit allowed paths:
  <%= config.bin %> <%= command.id %> --allowed-paths /workspace/provar
- Allow multiple project directories:
  <%= config.bin %> <%= command.id %> -a /workspace/project-a -a /workspace/project-b
