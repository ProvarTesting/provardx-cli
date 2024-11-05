# summary

Set one or more properties in the specified JSON file.

# description

Set one or more properties in the specified JSON file.

# examples

- Set the environment to “SIT” in the config.json properties file:

  $ sf provar config set environment.testEnvironment="SIT" -f config.json

- Set the testEnvironment to “SIT” and the webBrowser to “Chrome”, within the environment property.

  $ sf provar config set environment.testEnvironment="SIT" environment.webBrowser="Chrome" -f config.json

- Set testCases to a list of test case paths in the config.json properties file.

  $ sf provar config set testCases='["tests/myTestCase.testcase","tests/testSuite1/myTestCase1.testCase"]' -f config.json

# error.MultipleFailure

%s


# flags.file-path.summary

Config file-path to set the properties to.
