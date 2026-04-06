# summary
Start a local MCP server for Provar tools over stdio transport.

# description
Launches a stateless MCP (Model Context Protocol) server that exposes Provar tools to
AI assistants (Claude Desktop, Claude Code, Cursor) via stdio transport. All MCP
JSON-RPC communication happens over stdout; all internal logging goes to stderr.

Available tools:
  - provardx.ping                — sanity-check: echo back a message
  - provar.project.inspect       — inspect project folder inventory
  - provar.pageobject.generate   — generate Java Page Object skeleton
  - provar.pageobject.validate   — validate Page Object quality
  - provar.testcase.generate     — generate XML test case skeleton
  - provar.testcase.validate     — validate test case XML (validity + best-practices scores)
  - provar.testsuite.validate    — validate test suite hierarchy
  - provar.testplan.validate     — validate test plan with metadata completeness checks
  - provar.project.validate      — validate full project from disk: cross-cutting rules, coverage, quality score

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
