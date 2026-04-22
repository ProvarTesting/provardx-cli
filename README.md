# @provartesting/provardx-cli

[![Version](https://img.shields.io/npm/v/@provartesting/provardx-cli.svg)](https://npmjs.org/package/@provartesting/provardx-cli)
[![Downloads/week](https://img.shields.io/npm/dw/@provartesting/provardx-cli.svg)](https://npmjs.org/package/@provartesting/provardx-cli)
[![License](https://img.shields.io/npm/l/@provartesting/provardx-cli.svg)](https://github.com/ProvarTesting/provardx-cli/blob/main/LICENSE.md)
[![Get Access](https://img.shields.io/badge/Quality%20Hub%20API-Get%20Access-blue)](https://aqqlrlhga7.execute-api.us-east-1.amazonaws.com/dev/auth/request-access)

# What is the ProvarDX CLI?

The Provar DX CLI is a Salesforce CLI plugin for Provar customers who want to automate the execution of tests using Provar Automation, and the reporting of test results and other quality-related metrics to Provar Quality Hub.

# Installation, Update, and Uninstall

**Requires Node.js 18–24 (LTS 22 recommended).** Node 25+ is not yet supported due to a breaking change in a transitive dependency. Check with `node --version`.

Install the plugin

```sh-session
$ sf plugins install @provartesting/provardx-cli@beta
```

Update plugins

```sh-session
$ sf plugins update
```

Uninstall the plugin

```sh-session
$ sf plugins uninstall @provartesting/provardx-cli
```

# MCP Server (AI-Assisted Quality)

The Provar DX CLI includes a built-in **Model Context Protocol (MCP) server** that connects AI assistants (Claude Desktop, Claude Code, Cursor) directly to your Provar project. Once connected, an AI agent can inspect your project structure, generate Page Objects and test cases, validate every level of the test hierarchy with quality scores, and work with NitroX (Hybrid Model) component page objects for LWC, Screen Flow, Industry Components, Experience Cloud, and HTML5.

Validation runs in two modes: **local only** (structural rules, no key required) or **Quality Hub API** (170+ rules, quality scoring — requires a `pv_k_` API key). Don't have an account? **[Request access](https://aqqlrlhga7.execute-api.us-east-1.amazonaws.com/dev/auth/request-access)**.

## Quick setup

**Requires:** Provar Automation IDE installed with an activated license.

```sh
# 1. Install the plugin — @beta is required for MCP support
sf plugins install @provartesting/provardx-cli@beta

# 2. (Optional) Authenticate for full 170+ rule validation
sf provar auth login
```

**Claude Code** — run once to register the server:

```sh
claude mcp add provar -s user -- sf provar mcp start --allowed-paths /path/to/your/provar/project
```

**Claude Desktop** — add to your config file and restart the app:

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

> **Windows (Claude Desktop):** Use `sf.cmd` instead of `sf` if the server fails to start.

📖 **[docs/mcp.md](https://github.com/ProvarTesting/provardx-cli/blob/main/docs/mcp.md) — full setup, all 35+ tools, 7 MCP prompts, troubleshooting.**

---

# Commands

- [`sf provar auth login`](#sf-provar-auth-login)
- [`sf provar auth rotate`](#sf-provar-auth-rotate)
- [`sf provar auth status`](#sf-provar-auth-status)
- [`sf provar auth clear`](#sf-provar-auth-clear)
- [`sf provar mcp start`](#sf-provar-mcp-start)
- [`sf provar config get`](#sf-provar-config-get)
- [`sf provar config set`](#sf-provar-config-set)
- [`sf provar automation config generate`](#sf-provar-automation-config-generate)
- [`sf provar automation config load`](#sf-provar-automation-config-load)
- [`sf provar automation config validate`](#sf-provar-automation-config-validate)
- [`sf provar automation config get`](#sf-provar-automation-config-get)
- [`sf provar automation config set`](#sf-provar-automation-config-set)
- [`sf provar automation setup`](#sf-provar-automation-setup)
- [`sf provar automation project compile`](#sf-provar-automation-project-compile)
- [`sf provar automation metadata download`](#sf-provar-automation-metadata-download)
- [`sf provar automation test run`](#sf-provar-automation-test-run)
- [`sf provar quality-hub connect`](#sf-provar-quality-hub-connect)
- [`sf provar quality-hub display`](#sf-provar-quality-hub-display)
- [`sf provar quality-hub open`](#sf-provar-quality-hub-open)
- [`sf provar quality-hub testcase retrieve`](#sf-provar-quality-hub-testcase-retrieve)
- [`sf provar quality-hub test run`](#sf-provar-quality-hub-test-run)
- [`sf provar quality-hub test run report`](#sf-provar-quality-hub-test-run-report)
- [`sf provar quality-hub test run abort`](#sf-provar-quality-hub-test-run-abort)
- [`sf provar manager connect`](#sf-provar-manager-connect) _(deprecated — use `sf provar quality-hub connect`)_
- [`sf provar manager display`](#sf-provar-manager-display) _(deprecated — use `sf provar quality-hub display`)_
- [`sf provar manager open`](#sf-provar-manager-open) _(deprecated — use `sf provar quality-hub open`)_
- [`sf provar manager testcase retrieve`](#sf-provar-manager-testcase-retrieve) _(deprecated — use `sf provar quality-hub testcase retrieve`)_
- [`sf provar manager test run`](#sf-provar-manager-test-run) _(deprecated — use `sf provar quality-hub test run`)_
- [`sf provar manager test run report`](#sf-provar-manager-test-run-report) _(deprecated — use `sf provar quality-hub test run report`)_
- [`sf provar manager test run abort`](#sf-provar-manager-test-run-abort) _(deprecated — use `sf provar quality-hub test run abort`)_

## `sf provar auth login`

Log in to Provar Quality Hub and store your API key.

```
USAGE
  $ sf provar auth login [--url <value>]

FLAGS
  --url=<value>  Override the Quality Hub API base URL (for non-production environments).

DESCRIPTION
  Opens a browser to the Provar login page. After you authenticate, your API key is
  stored at ~/.provar/credentials.json and used automatically by the Provar MCP tools
  and CI/CD integrations. The key is valid for approximately 90 days.

  For CI/CD pipelines (GitHub Actions, Jenkins, etc.) where a browser cannot open:
  run sf provar auth login once on your local machine, copy the api_key value from
  ~/.provar/credentials.json, and store it as the PROVAR_API_KEY environment variable
  or secret in your pipeline. Rotate the secret every ~90 days when the key expires.

  Don't have an account? Request access at:
  https://aqqlrlhga7.execute-api.us-east-1.amazonaws.com/dev/auth/request-access

EXAMPLES
  Log in interactively:

    $ sf provar auth login

  Log in against a staging environment:

    $ sf provar auth login --url https://dev.api.example.com
```

## `sf provar auth rotate`

Rotate your stored API key without re-authenticating via browser.

```
USAGE
  $ sf provar auth rotate

DESCRIPTION
  Exchanges your current pv_k_ key for a new one atomically. The old key is
  invalidated immediately. The new key is written to ~/.provar/credentials.json.

  Use this to rotate your key on a regular schedule (~every 90 days) without
  going through the browser login flow. If your current key is already expired,
  run sf provar auth login instead.

EXAMPLES
  Rotate the stored API key:

    $ sf provar auth rotate
```

## `sf provar auth status`

Show the current API key configuration and validate it against Quality Hub.

```
USAGE
  $ sf provar auth status

DESCRIPTION
  Reports whether an API key is configured, where it came from (environment variable
  or credentials file), and performs a live check against the Quality Hub API to
  confirm the key is still valid.

EXAMPLES
  Check auth status:

    $ sf provar auth status
```

## `sf provar auth clear`

Remove the stored API key.

```
USAGE
  $ sf provar auth clear

DESCRIPTION
  Deletes ~/.provar/credentials.json and revokes the key server-side. After clearing,
  the MCP tools fall back to local validation mode. Has no effect if no key is stored.

EXAMPLES
  Remove the stored key:

    $ sf provar auth clear
```

## `sf provar mcp start`

Start a local MCP server for Provar tools over stdio transport.

```
USAGE
  $ sf provar mcp start [-a <value>...]

FLAGS
  -a, --allowed-paths=<value>...  Allowed base directory paths for file operations.
                                  Defaults to the current working directory.
                                  Repeat the flag to allow multiple paths.

DESCRIPTION
  Launches a stateless MCP (Model Context Protocol) server that exposes Provar tools
  to AI assistants (Claude Desktop, Claude Code, Cursor) via stdio transport. All MCP
  JSON-RPC communication happens over stdout; all internal logging goes to stderr.

  Note: --json is not available on this command — stdout is reserved for MCP traffic.

TOOLS EXPOSED
  provar.project.inspect               — inspect project folder inventory
  provar.pageobject.generate           — generate Java Page Object skeleton
  provar.pageobject.validate           — validate Page Object quality (30+ rules)
  provar.testcase.generate             — generate XML test case skeleton
  provar.testcase.validate             — validate test case XML (validity + best-practices scores)
  provar.testsuite.validate            — validate test suite hierarchy
  provar.testplan.validate             — validate test plan with metadata completeness checks
  provar.project.validate              — validate full project: cross-cutting rules, connections, environments
  provar.properties.generate           — generate provardx-properties.json from the standard template
  provar.properties.read               — read and parse a provardx-properties.json file
  provar.properties.set                — update fields in a provardx-properties.json file
  provar.properties.validate           — validate a provardx-properties.json file against the schema
  provar.ant.generate                  — generate an ANT build.xml for CI/CD pipeline execution
  provar.ant.validate                  — validate an ANT build.xml for structural correctness
  provar.qualityhub.connect            — connect to a Quality Hub org
  provar.qualityhub.display            — display connected Quality Hub org info
  provar.qualityhub.testrun            — trigger a Quality Hub test run
  provar.qualityhub.testrun.report     — poll test run status
  provar.qualityhub.testrun.abort      — abort an in-progress test run
  provar.qualityhub.testcase.retrieve  — retrieve test cases by user story / component
  provar.automation.setup              — detect or download/install Provar Automation binaries
  provar.automation.testrun            — trigger a Provar Automation test run (LOCAL)
  provar.automation.compile            — compile Page Objects after changes
  provar.automation.config.load        — register a provardx-properties.json as the active config (required before compile/testrun)
  provar.automation.metadata.download  — download Salesforce metadata into the project
  provar.qualityhub.defect.create      — create Quality Hub defects from failed test executions
  provar.testrun.report.locate         — resolve artifact paths (JUnit.xml, HTML reports) for a completed test run
  provar.testrun.rca                   — analyse a completed test run: classify failures, extract page objects, detect pre-existing issues
  provar.testplan.add-instance         — wire a test case into a plan suite by writing a .testinstance file
  provar.testplan.create-suite         — create a new test suite directory with .planitem inside a plan
  provar.testplan.remove-instance      — remove a .testinstance file from a plan suite
  provar.nitrox.discover               — discover projects containing NitroX (Hybrid Model) page objects
  provar.nitrox.read                   — read NitroX .po.json files and return parsed content
  provar.nitrox.validate               — validate a NitroX .po.json against schema rules
  provar.nitrox.generate               — generate a new NitroX .po.json from a component description
  provar.nitrox.patch                  — apply a JSON merge-patch to an existing NitroX .po.json file

EXAMPLES
  Start MCP server (accepts stdio connections from Claude Desktop / Cursor):

    $ sf provar mcp start

  Start with an explicit allowed path:

    $ sf provar mcp start --allowed-paths /workspace/provar

  Allow multiple directories:

    $ sf provar mcp start -a /workspace/project-a -a /workspace/project-b
```

📖 **Full tool documentation and client configuration: [docs/mcp.md](https://github.com/ProvarTesting/provardx-cli/blob/main/docs/mcp.md)**

## `sf provar config get`

Retrieve a value from the specified JSON file.

```
USAGE
  $ sf provar config get -f <value> [--json]

FLAGS
  -f, --file-path=<value>  (required) File path of the JSON file to get the property value from.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Retrieve a value from the specified JSON file.

EXAMPLES
  Get the testEnvironment value within the environment property from the config.json file:

    $ sf provar config get environment.testEnvironment -f config.json
```

## `sf provar config set`

Set one or more properties in the specified JSON file.

```
USAGE
  $ sf provar config set [--json]

FLAGS
  -f, --file-path=<value>  (required) File path of the JSON file to get the property value from.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Set one or more properties in the specified JSON file.

EXAMPLES
  Set the environment to “SIT” in the config.json properties file:

    $ sf provar config set environment.testEnvironment="SIT" -f config.json

  Set the testEnvironment to “SIT” and the webBrowser to “Chrome”, within the environment property.

    $ sf provar config set environment.testEnvironment="SIT" environment.webBrowser="Chrome" -f config.json

  Set testCases to a list of test case paths in the config.json properties file.

    $ sf provar config set testCases='["tests/myTestCase.testcase","tests/testSuite1/myTestCase1.testCase"]' -f config.json
```

## `sf provar automation config generate`

Generate a boilerplate ProvarDX properties file.

```
USAGE
  $ sf provar automation config generate [--json] [-p <value>]

FLAGS
 -p, --properties-file=<value>    (required) Path to the properties file that will be generated.
 -n, --no-prompt                  Don't prompt to confirm file should be overwritten.

GLOBAL FLAGS
  --json    Format output as json.

DESCRIPTION
  Generate a boilerplate property file.

EXAMPLES
  Generate a basic properties file named provardx-properties.json:

    $ sf provar automation config generate -p provardx-properties.json
```

## `sf provar automation config load`

Validate and load a ProvarDX properties file for later use.

```
USAGE
  $ sf provar automation config load -p <value> [--json]

FLAGS
  -p, --properties-file=<value>  (required) Path of the properties file to be loaded.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Validate and load a ProvarDX properties file for later use.

EXAMPLES
  Validate that the myproperties.json file is valid.

    $ sf provar automation config load -p myproperties.json
```

## `sf provar automation config validate`

Check if the loaded properties file has all the required properties set.

```
USAGE
  $ sf provar automation config validate [--json]

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Check if the loaded properties file has all the required properties set.

EXAMPLES
  Check if the loaded properties file has all the required properties set:

    $ sf provar automation config validate
```

## `sf provar automation config get`

Retrieve a value from the loaded properties file.

```
USAGE
  $ sf provar automation config get [--json]

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Retrieve a value from the loaded properties file.

EXAMPLES
  Get the testEnvironment property value from the provardx-properties.json properties file:

    $ sf provar automation config get environment.testEnvironment
```

## `sf provar automation config set`

Set one or more properties in the loaded properties file.

```
USAGE
  $ sf provar automation config set [--json]

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Set one or more properties in the loaded properties file.

EXAMPLES
  Set the environment to "SIT” in the provardx-properties.json properties file:

    $ sf provar automation config set environment.testEnvironment="SIT"

  Set the testEnvironment to "SIT” and the webBrowser to "Chrome”, within the environment property:

    $ sf provar automation config set environment.testEnvironment="SIT" environment.webBrowser="Chrome"

  Set testCases to a list of test case paths in the provardx-properties.json properties file:

    $ sf provar automation config set testCases='["tests/myTestCase.testcase","tests/testSuite1/myTestCase1.testCase"]'
```

## `sf provar automation setup`

Download and install Provar Automation.

```
USAGE
  $ sf provar automation setup [--json] [-v <value>]

FLAGS
  -v, --version=<value>  Provar Automation build version number.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Download and install Provar Automation.

EXAMPLES
  Install version Provar Automation version 2.12.1:

    $ sf provar automation setup --version 2.12.1
```

## `sf provar automation project compile`

Compile PageObject and PageControl Java source files into object code.

```
USAGE
  $ sf provar automation project compile [--json]

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Compile PageObject and PageControl Java source files into object code.

EXAMPLES
  Compile the project using the configuration set in the properties file:

    $ sf provar automation project compile
```

## `sf provar automation metadata download`

Download any required metadata for a specified Provar Salesforce connection.

```
USAGE
  $ sf provar automation metadata download -c <value> [--json]

FLAGS
  -c, --connections=<value>  (required) Comma-separated list of names of Provar Salesforce connections to use, as defined in the project.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Download any required metadata for a specified Provar Salesforce connection.

EXAMPLES
  Refresh metadata for the MySalesforceConnection connection and store it in folder set in the properties file:

    $ sf provar automation metadata download -c MySalesforceConnection
```

## `sf provar automation test run`

Run the tests as specified in the loaded properties file.

```
USAGE
  $ sf provar automation test run [--json]

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Run the tests as specified in the loaded properties file.

EXAMPLES
  Run the tests as specified in the loaded properties file:

    $ sf provar automation test run
```

## `sf provar quality-hub connect`

Connect to a Provar Quality Hub org.

```
USAGE
  $ sf provar quality-hub connect -o <value> [--json]

FLAGS
  -o, --target-org=<value>  (required) Username or alias set in the SF CLI which corresponds to the Provar Quality Hub org.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Load the alias or username to be used in subsequent Quality Hub commands.

EXAMPLES
  Connect to the Quality Hub org stored with alias "ProvarQualityHub":

    $ sf provar quality-hub connect -o ProvarQualityHub
```

## `sf provar quality-hub display`

Display information about the connected Provar Quality Hub org.

```
USAGE
  $ sf provar quality-hub display [--json]

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  Display information about the connected Quality Hub org:

    $ sf provar quality-hub display
```

## `sf provar quality-hub open`

Open Provar Quality Hub in a browser.

```
USAGE
  $ sf provar quality-hub open [--json]

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  Open Quality Hub in a browser:

    $ sf provar quality-hub open
```

## `sf provar quality-hub testcase retrieve`

Retrieve test cases related to the provided user stories or metadata components.

```
USAGE
  $ sf provar quality-hub testcase retrieve -p <value> -t Apex|ProvarAutomation [--json] [-m <value>] [-f <value>] [-i <value>] [-o <value>] [-n <value>] [-l <value>]

FLAGS
  -f, --metadata-file=<value>          Path to a text file containing the list of metadata components.
  -i, --issues=<value>                 Comma-separated list of issue IDs or keys.
  -l, --test-plan=<value>              Test Plan name. Use to retrieve test instance file paths.
  -m, --metadata-components=<value>    Semicolon-separated list of metadata components.
  -n, --ignore-metadata=<value>        Semicolon-separated list of metadata types to ignore.
  -o, --output=<value>                 Output to a specific file instead of stdout.
  -p, --test-project=<value>           (required) Test Project key to filter by.
  -t, --test-automation-tool=<option>  (required) <options: Apex|ProvarAutomation>

EXAMPLES
  Retrieve Provar Automation test cases for user story "TM-766":

    $ sf provar quality-hub testcase retrieve -p PAT -t ProvarAutomation -i "TM-766" --json
```

## `sf provar quality-hub test run`

Run tests via Provar Quality Hub.

```
USAGE
  $ sf provar quality-hub test run -f <value> [--json] [-y] [-w <value>] [-p <value>] [-o <value>] [-r <value>]

FLAGS
  -f, --configuration-file=<value>  (required) Path to the configuration file.
  -o, --output=<value>              Output to a specific file instead of stdout.
  -p, --polling-interval=<value>    [default: 60] Polling interval in seconds.
  -r, --result-format=<value>       [default: human] Format of the test results.
  -w, --wait=<value>                Polling timeout in minutes.
  -y, --synchronous                 Run synchronously.

EXAMPLES
  Run tests and store results as JSON:

    $ sf provar quality-hub test run -f config/run-grid-tests.json -w 10 -p 30 -r json -o results.json
```

## `sf provar quality-hub test run report`

Check or poll for the status of a Quality Hub test run.

```
USAGE
  $ sf provar quality-hub test run report -i <value> [--json] [-r <value>] [-o <value>]

FLAGS
  -i, --test-run=<value>       (required) Test run ID.
  -o, --output=<value>         Output to a specific file instead of stdout.
  -r, --result-format=<value>  [default: human] Format of the test results.

EXAMPLES
  Retrieve results for a test run:

    $ sf provar quality-hub test run report -i 45f70417-df21-4917-a667-abc2ee46dc63 -r json -o results.json
```

## `sf provar quality-hub test run abort`

Abort an in-progress test run triggered via Provar Quality Hub.

```
USAGE
  $ sf provar quality-hub test run abort -i <value> [--json] [-p <value>] [-w <value>]

FLAGS
  -i, --test-run=<value>          (required) Test run ID.
  -p, --polling-interval=<value>  [default: 30] Polling interval in seconds.
  -w, --wait=<value>              [default: 2] Polling timeout in minutes.

EXAMPLES
  Abort a test run:

    $ sf provar quality-hub test run abort -i 45f70417-df21-4917-a667-abc2ee46dc63
```

---

> **Deprecated commands:** The `sf provar manager *` commands below are retained for backwards compatibility and will print a deprecation warning when used. Use the equivalent `sf provar quality-hub *` commands above for all new pipelines.

---

## `sf provar manager connect`

Load the alias or username to be used in subsequent commands to connect to Provar Manager.

```
USAGE
  $ sf provar manager connect -o <value> [--json]

FLAGS
  -o, --target-org=<value>  (required) Username or alias set in the SF CLI which corresponds to the Provar Manager org.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Load the alias or username to be used in subsequent commands to connect to Provar Manager.

EXAMPLES
  Connect to the Provar Manager org that has been previously authorised using the SF CLI, and stored with the alias "ProvarManager":

    $ sf provar manager connect -o ProvarManager
```

## `sf provar manager display`

Display information about the connected Provar Manager org.

```
USAGE
  $ sf provar manager display [--json]

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Display information about the connected Provar Manager org.

EXAMPLES
  Display information about the connected Provar Manager org:

    $ sf provar manager display
```

## `sf provar manager open`

Open Provar Manager in a browser.

```
USAGE
  $ sf provar manager open [--json]

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Open Provar Manager in a browser.

EXAMPLES
  Open Provar Manager in a browser:

    $ sf provar manager open
```

## `sf provar manager testcase retrieve`

Retrieve test cases related to the provided user stories (issues) or metadata components, for a given test project.

```
USAGE
  $ sf provar manager testcase retrieve -p <value> -t Apex|ProvarAutomation [--json] [--flags-dir <value>] [-m <value>] [-f <value>] [-i <value>] [-o <value>] [-n <value>] [-l <value>]

FLAGS
  -f, --metadata-file=<value>          Path to a text file that contains the list of metadata components in source format.
  -i, --issues=<value>                 A comma-separated list of issue IDs, keys, or external IDs.
  -l, --test-plan=<value>              Test Plan Name. Use if you want to retrieve test instance file paths.
  -m, --metadata-components=<value>    Semicolon-separated list of metadata components, grouped and prefixed by their metadata type.
  -n, --ignore-metadata=<value>        Semicolon-separated list of metadata types to ignore from METADATA-COMPONENTS or METADATA-FILE.
  -o, --output=<value>                 Output to a specific file instead of stdout.
  -p, --test-project=<value>           (required) Test Project key to filter by.
  -t, --test-automation-tool=<option>  (required) Test Automation tool used to automate the tests.
                                       <options: Apex|ProvarAutomation>

DESCRIPTION
  Retrieve test cases related to the provided user stories (issues) or metadata components, for a given test project.

EXAMPLES
  Retrieve Apex unit test class ids from the test project "Salesforce Project" with key "SFP" that cover the "NewLeadFormController" and "ExistingLeadFormController" Apex classes:

    $ sf provar manager testcase retrieve -p SFP -t Apex -m "ApexClass:NewLeadFormController,ExistingLeadFormController"

  Retrieve Provar Automation test case paths from the test project with key "PAT" related to the user story with key "TM-766", in JSON format:

    $ sf provar manager testcase retrieve -p PAT -t ProvarAutomation -i "TM-766" --json

  Retrieve Provar Automation test case paths from the test project with key "PAT" related to the metadata listed in the file "changes.txt", ignoring changes to custom objects, output to "testcases.txt":

    $ sf provar manager testcase retrieve -p PAT -t ProvarAutomation -f changes.txt -n CustomObject -o testcases.txt

  Example of a list of metadata changes:

    base/main/default/layouts/Release__c-Release Layout.layout-meta.xml
    base/main/default/objects/Sprint__c/fields/Sprint_Goal__c.field-meta.xml

```

## `sf provar manager test run`

Run tests via Provar Manager.

```
USAGE
  $ sf provar manager test run -f <value> [--json] [-y] [-w <value>] [-p <value>] [-o <value>] [-r <value>]

FLAGS
  -f, --configuration-file=<value>  (required) Path to the configuration file.
  -o, --output=<value>              Output to a specific file instead of stdout.
  -p, --polling-interval=<value>    [default: 60] Sets the polling interval in seconds. Default is 60 seconds.
  -r, --result-format=<value>       [default: human] Format of the test results.
  -w, --wait=<value>                Sets the polling timeout in minutes.
  -y, --synchronous                 Runs command synchronously; if not specified, the command is run asynchronously.

GLOBAL FLAGS
  --json               Format output as json.

DESCRIPTION
  Run tests via Provar Manager.

EXAMPLES
  Run tests as per the config/run-grid-test.json configuration file, wait 10 minutes, poll every 30 seconds, and store the results as JSON in the results.json file:

    $ sf provar manager test run -f config/run-grid-tests.json -w 10 -p 30 -r json -o results.json

  Run tests as per the config/run-grid-test.json configuration file, wait 20 minutes, and store the results as JUnit in the junit-results.xml file:

    $ sf provar manager test run -f config/run-grid-tests.json -w 20 -r junit -o junit-results.xml

```

## `sf provar manager test run report`

Check or poll for the status of a test run operation.

```
USAGE
  $ sf provar manager test run report -i <value> [--json] [-r <value>] [-o <value>]

FLAGS
  -i, --test-run=<value>       (required) Test run ID.
  -o, --output=<value>         Output to a specific file instead of stdout.
  -r, --result-format=<value>  [default: human] Format of the test results.

GLOBAL FLAGS
  --json               Format output as json.

DESCRIPTION
  Check or poll for the status of a test run operation.

EXAMPLES
  Retrieve results for test run 45f70417-df21-4917-a667-abc2ee46dc63 and store the results as JSON in the results.json file

    $ sf provar manager test run report -i 45f70417-df21-4917-a667-abc2ee46dc63 -r json -o results.json

  Retrieve results for test run 45f70417-df21-4917-a667-abc2ee46dc63 and store the results as JUnit in the junit-results.xml file:

    $ sf provar manager test run report -i 45f70417-df21-4917-a667-abc2ee46dc63 -r junit -o junit-results.xml

```

## `sf provar manager test run abort`

Abort an in-progress test run triggered via Provar Manager.

```
USAGE
  $ sf provar manager test run abort -i <value> [--json] [-p <value>] [-w <value>]

FLAGS
  -i, --test-run=<value>          (required) Test run ID.
  -p, --polling-interval=<value>  [default: 30] Sets the polling interval in
                                  seconds. Default is 30 seconds.
  -w, --wait=<value>              [default: 2] Sets the polling timeout in
                                  minutes. Default is 2 minutes.

GLOBAL FLAGS
  --json               Format output as json.

DESCRIPTION
  Abort an in-progress test run triggered via Provar Manager.

EXAMPLES
  Abort test run with ID 45f70417-df21-4917-a667-abc2ee46dc63

    $ sf provar manager test run abort -i 45f70417-df21-4917-a667-abc2ee46dc63

```
