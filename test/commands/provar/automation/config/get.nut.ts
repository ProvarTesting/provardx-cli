import * as fileSystem from 'node:fs';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { errorMessages, SfProvarCommandResult } from '@provartesting/provardx-plugins-utils';
// import * as validateConstants from '../../../../assertion/validateConstants.js';
import * as getConstants from '../../../../assertion/getConstants.js';
import { commandConstants } from '../../../../assertion/commandConstants.js';

describe('sf provar config get NUTs', () => {
  let session: TestSession;
  enum FILE_PATHS {
    INVALID_FILE = 'getInvalidFile.json',
    VALUES_FILE = 'getValues.json',
  }

  after(async () => {
    await session?.clean();
    Object.values(FILE_PATHS).forEach((filePath) => {
      fileSystem.unlink(filePath, (err) => {
        if (err) {
          return err;
        }
      });
    });
  });

  it('Missing property error as property name is missing', () => {
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GENERATE_COMMAND} -p ${FILE_PATHS.VALUES_FILE}`
    );
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_LOAD_COMMAND} -p ${FILE_PATHS.VALUES_FILE}`
    );
    execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_VALIDATE_COMMAND}`);
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE}`
    ).shellOutput;
    expect(getOutput.stderr).to.deep.equal(`Error (1): [MISSING_PROPERTY] ${errorMessages.MISSING_PROPERTY_GET}\n\n`);
  });

  it('Missing property error in json format as property name is missing', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} --json`
    ).jsonOutput;
    expect(getOutput).to.deep.equal(getConstants.missingPropertyGetJson);
  });

  it('Unknown Property error as property is not present in the file', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} metadata.test`
    ).shellOutput;
    expect(getOutput.stderr).to.deep.equal(`Error (1): [UNKNOWN_PROPERTY] ${errorMessages.UNKNOWN_PROPERTY}\n\n`);
  });

  it('Unknown Property error as property is not present in the file', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} environment.webBrowserProvider`
    ).shellOutput;
    expect(getOutput.stderr).to.deep.equal(`Error (1): [UNKNOWN_PROPERTY] ${errorMessages.UNKNOWN_PROPERTY}\n\n`);
  });

  it('Unknown Property error as property is not present in the file', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} projectPath.web`
    ).shellOutput;
    expect(getOutput.stderr).to.deep.equal(`Error (1): [UNKNOWN_PROPERTY] ${errorMessages.UNKNOWN_PROPERTY}\n\n`);
  });

  it('Unknown Property error in json format as property is not present in the file', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} sample --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(getConstants.unknownPropertyJson);
  });

  it('value should be returned for provarHome property', () => {
    const setProvarHome = 'C:/Users/anchal.goel/Downloads/main_win64_e413157177_20240117_0452/';
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} provarHome=${setProvarHome}`
    );
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} provarHome`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal(`${setProvarHome}\n`);
  });

  it('value should be returned for projectPath property', () => {
    const setProjectPath = 'C:/Users/anchal.goel/Desktop/main_win64_e413157177_20240117_0452/';
    const output = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} projectPath`
    ).shellOutput;
    expect(output.stdout).to.deep.equal('${PROVAR_PROJECT_PATH}\n');
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} projectPath=${setProjectPath}`
    );
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} "projectPath"`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal(`${setProjectPath}\n`);
  });

  it('value should be returned for resultsPath property in json format', () => {
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} "resultsPath"="C:/Users/anchal.goel/git/ProvarRegressionqam5/test/provardx/Results"`
    );
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} resultsPath --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(getOutput.jsonOutput).to.deep.equal(getConstants.getResultsPathValue);
  });

  it('value should be returned for smtpPath property', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} "smtpPath"`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal('\n');
  });
  it('value should be returned for testOutputLevel property', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} testOutputLevel`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal('BASIC\n');
  });

  it('value should be returned for pluginOutputlevel property', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} pluginOutputlevel`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal('WARNING\n');
  });

  it('value should be returned for resultsPathDisposition property in json format', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} "resultsPathDisposition" --json`
    ).jsonOutput;
    expect(getOutput?.result.success).to.deep.equal(true);
    expect(getOutput?.result.value).to.deep.equal('Increment');
  });

  it('value should be returned for lightningMode property in json format', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} lightningMode --json`
    ).jsonOutput;
    expect(getOutput?.result.success).to.deep.equal(true);
    expect(getOutput?.result.value).to.deep.equal(true);
  });

  it('Value should be returned successfully for metdata object', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} metadata`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal("{ metadataLevel: 'Reuse', cachePath: '../.provarCaches' }\n");
  });

  it('Value should be returned successfully for environment object in json format', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} environment --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(getOutput.jsonOutput).to.deep.equal(getConstants.getEnvironmentJsonObject);
  });

  it('Value should be returned successfully for testEnvironment property in environment object', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} environment.testEnvironment`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal('${PROVAR_TEST_ENVIRONMENT}\n');
  });

  it('Value should be returned successfully for webBrowserDeviceName property in environment object', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} "environment"."webBrowserDeviceName"`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal('Full Screen\n');
  });

  it('Value should be returned successfully for cachePath property in metadata object', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} metadata.cachePath --json`
    ).jsonOutput;
    expect(getOutput?.result.success).to.deep.equal(true);
    expect(getOutput?.result.value).to.deep.equal('../.provarCaches');
  });

  it('Value should be returned successfully for testprojectSecrets property', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} testprojectSecrets`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal('${PROVAR_TEST_PROJECT_SECRETS}\n');
  });

  it('Value should be returned successfully for connectionRefreshType property', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} connectionRefreshType`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal('Reload\n');
  });

  it('value should be returned for new added property', () => {
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} "Test Suite"="Multiple Suites"`
    );
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GET_COMMAND} -f ${FILE_PATHS.VALUES_FILE} "Test Suite"`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal('Multiple Suites\n');
  });

});
