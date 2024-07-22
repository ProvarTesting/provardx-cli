# @provartesting/provardx-cli

[![Version](https://img.shields.io/npm/v/@provartesting/provardx-cli.svg)](https://npmjs.org/package/@provartesting/provardx-cli)
[![Downloads/week](https://img.shields.io/npm/dw/@provartesting/provardx-cli.svg)](https://npmjs.org/package/@provartesting/provardx-cli)
[![License](https://img.shields.io/npm/l/@provartesting/provardx-cli.svg)](https://github.com/ProvarTesting/provardx-cli/blob/main/LICENSE.md)

# What is the ProvarDX CLI?

The Provar DX CLI is a Salesforce CLI plugin for Provar customers who want to automate the execution of tests using Provar Automation, and the reporting of test results and other quality-related metrics to Provar Manager.

# Installation, Update, and Uninstall

Install the plugin
```sh-session
$ sf plugins install @provartesting/provardx-cli
```

Update plugins
```sh-session
$ sf plugins update
```

Uninstall the plugin
```sh-session
$ sf plugins uninstall @provartesting/provardx-cli
```

# Commands

- [`sf provar automation config generate`](#sf-provar-automation-config-generate)
- [`sf provar automation config validate`](#sf-provar-automation-config-validate)
- [`sf provar automation config load`](#sf-provar-automation-config-load)
- [`sf provar automation config get`](#sf-provar-automation-config-get)
- [`sf provar automation config set`](#sf-provar-automation-config-set)
- [`sf provar automation setup`](#sf-provar-automation-setup)
- [`sf provar automation project compile`](#sf-provar-automation-project-compile)
- [`sf provar automation metadata download`](#sf-provar-automation-metadata-download)
- [`sf provar automation test run`](#sf-provar-automation-test-run)
- [`sf provar manager connect`](#sf-provar-manager-connect)
- [`sf provar manager testcase retrieve`](#sf-provar-manager-testcase-retrieve)

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
