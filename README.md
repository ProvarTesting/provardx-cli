# @provartesting/provardx-cli

[![Version](https://img.shields.io/npm/v/@provartesting/provardx-cli.svg)](https://npmjs.org/package/@provartesting/provardx-cli)
[![Downloads/week](https://img.shields.io/npm/dw/@provartesting/provardx-cli.svg)](https://npmjs.org/package/@provartesting/provardx-cli)

# What is the ProvarDX CLI?

The Provar DX CLI is a Salesforce CLI plugin for Provar customers who want to automate the execution of tests and the reporting of test results and other quality-related reports (e.g. within a DevOps pipeline).

# Installation

```sh-session
$ sf plugins install @provartesting/provardx-cli
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
