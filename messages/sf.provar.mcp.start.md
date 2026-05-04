# summary

Start a local MCP server for Provar tools over stdio transport.

# description

Launches a stateless MCP (Model Context Protocol) server that exposes Provar tools to
AI assistants (Claude Desktop, Claude Code, Cursor) via stdio transport. All MCP
JSON-RPC communication happens over stdout; all internal logging goes to stderr.

Available tools:

Project & inspection:

- provar.project.inspect — inspect project folder inventory
- provar.project.validate — validate full project from disk: coverage, quality scores

Page Object:

- provar.pageobject.generate — generate a Java Page Object skeleton
- provar.pageobject.validate — validate Page Object quality and naming

Test Case:

- provar.testcase.generate — generate an XML test case skeleton
- provar.testcase.validate — validate test case XML (validity + best-practices scores)
- provar.testcase.step.edit — atomically add or remove a single step in a test case

Test Suite / Plan:

- provar.testsuite.validate — validate test suite hierarchy
- provar.testplan.validate — validate test plan metadata completeness
- provar.testplan.create-suite — create a test suite under a plan
- provar.testplan.add-instance — add a test instance to a plan
- provar.testplan.remove-instance — remove a test instance from a plan

Properties files:

- provar.properties.read — read a Provar properties file
- provar.properties.set — set a key in a Provar properties file
- provar.properties.validate — validate a properties file structure
- provar.properties.generate — generate a properties file skeleton

Quality Hub (sf provar quality-hub wrappers):

- provar.qualityhub.connect — connect to a Quality Hub org
- provar.qualityhub.display — display connected org info
- provar.qualityhub.testrun — trigger a Quality Hub test run
- provar.qualityhub.testrun.report — poll test run status
- provar.qualityhub.testrun.abort — abort a running test run
- provar.qualityhub.testcase.retrieve — retrieve test case results
- provar.qualityhub.defect.create — create defects for failed test executions
- provar.qualityhub.examples.retrieve — retrieve corpus examples for a given step type

Automation (sf provar automation wrappers):

- provar.automation.setup — set up the Provar Automation runtime
- provar.automation.metadata.download — download Salesforce metadata
- provar.automation.compile — compile Provar test assets
- provar.automation.testrun — run Provar tests
- provar.automation.config.load — load a Provar configuration

ANT build:

- provar.ant.generate — generate an ANT build.xml
- provar.ant.validate — validate an ANT build.xml

Test result analysis:

- provar.testrun.rca — root cause analysis on a test result
- provar.testrun.report.locate — locate a test result report

NitroX (Provar NitroX component tools):

- provar.nitrox.discover — discover NitroX component metadata
- provar.nitrox.generate — generate a NitroX component
- provar.nitrox.patch — patch a NitroX component definition
- provar.nitrox.read — read a NitroX component definition
- provar.nitrox.validate — validate a NitroX component

Connections:

- provar.connection.list — list connections and named environments from .testproject

For full tool documentation see docs/mcp.md in this repository.

# flags.allowed-paths.summary

Allowed base directory paths for file operations. Defaults to current directory.

# flags.auto-defects.summary

When enabled, testrun.report suggestions will prompt defect creation on failures.

# flags.auto-update.summary

When enabled, automatically installs the latest version of the plugin and restarts the MCP connection on startup.

# flags.no-update-check.summary

Skip the update check at startup. Also controlled by the PROVAR_NO_UPDATE_CHECK environment variable.

# examples

- Start MCP server (accepts stdio connections from Claude Desktop / Cursor):
  <%= config.bin %> <%= command.id %>
- Start with explicit allowed paths:
  <%= config.bin %> <%= command.id %> --allowed-paths /workspace/provar
- Allow multiple project directories:
  <%= config.bin %> <%= command.id %> -a /workspace/project-a -a /workspace/project-b
