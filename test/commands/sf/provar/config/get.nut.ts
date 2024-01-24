import * as fileSystem from 'fs';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { SfProvarCommandResult } from '../../../../../src/Utility/sfProvarCommandResult';
import * as validateConstants from '../../../../assertion/validateConstants';
import * as getConstants from '../../../../assertion/getConstants';
import { errorMessages } from '../../../../../src/constants/errorMessages';
import { commandConstants } from '../../../../../src/constants/commandConstants';

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

  it('Missing file error as json file is not loaded', () => {
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} -p ${FILE_PATHS.INVALID_FILE}`
    );
    const jsonFilePath = FILE_PATHS.INVALID_FILE;
    const data = fileSystem.readFileSync(jsonFilePath, 'utf-8');
    const newData = data.substring(1);
    fileSystem.writeFile(jsonFilePath, newData, (error) => {
      if (error) {
        return;
      }
    });
    execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_LOAD_COMMAND} -p ${FILE_PATHS.INVALID_FILE}`);
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} provarHome`
    ).shellOutput;
    expect(result.stderr).to.deep.equal(`Error (1): [MISSING_FILE] ${errorMessages.MISSINGFILEERROR}\n`);
  });

  it('Missing file error in json format as json file is not loaded', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} resultsPath --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(validateConstants.missingFileJsonError);
  });

  it('Missing property error as property name is missing', () => {
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} -p ${FILE_PATHS.VALUES_FILE}`
    );
    execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_LOAD_COMMAND} -p ${FILE_PATHS.VALUES_FILE}`);
    execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND}`);
    const getOutput = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND}`).shellOutput;
    expect(getOutput.stderr).to.deep.equal(`Error (1): [MISSING_PROPERTY] ${errorMessages.MISSING_PROPERTY_GET}\n`);
  });

  it('Missing property error in json format as property name is missing', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} --json`
    ).jsonOutput;
    expect(getOutput).to.deep.equal(getConstants.missingPropertyGetJson);
  });

  it('Unknown Property error as property is not present in the file', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} metadata.test`
    ).shellOutput;
    expect(getOutput.stderr).to.deep.equal(`Error (1): [UNKNOWN_PROPERTY] ${errorMessages.UNKNOWN_PROPERTY}\n`);
  });

  it('Unknown Property error as property is not present in the file', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} environment.webBrowserProvider`
    ).shellOutput;
    expect(getOutput.stderr).to.deep.equal(`Error (1): [UNKNOWN_PROPERTY] ${errorMessages.UNKNOWN_PROPERTY}\n`);
  });

  it('Unknown Property error as property is not present in the file', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} projectPath.web`
    ).shellOutput;
    expect(getOutput.stderr).to.deep.equal(`Error (1): [UNKNOWN_PROPERTY] ${errorMessages.UNKNOWN_PROPERTY}\n`);
  });

  it('Unknown Property error in json format as property is not present in the file', () => {
    const result = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} sample --json`, {
      ensureExitCode: 0,
    });
    expect(result.jsonOutput).to.deep.equal(getConstants.unknownPropertyJson);
  });

  it('value should be returned for provarHome property', () => {
    const setProvarHome = 'C:/Users/anchal.goel/Downloads/main_win64_e413157177_20240117_0452/';
    execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_SET_COMMAND} provarHome=${setProvarHome}`);
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} provarHome`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal(`${setProvarHome}\n`);
  });

  it('value should be returned for projectPath property', () => {
    const setProjectPath = 'C:/Users/anchal.goel/Desktop/main_win64_e413157177_20240117_0452/';
    const output = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} projectPath`
    ).shellOutput;
    expect(output.stdout).to.deep.equal('${PROVAR_PROJECT_PATH}\n');
    execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_SET_COMMAND} projectPath=${setProjectPath}`);
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} "projectPath"`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal(`${setProjectPath}\n`);
  });

  it('value should be returned for resultsPath property in json format', () => {
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_SET_COMMAND} "resultsPath"="C:/Users/anchal.goel/git/ProvarRegressionqam5/test/provardx/Results"`
    );
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} resultsPath --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(getOutput.jsonOutput).to.deep.equal(getConstants.getResultsPathValue);
  });

  it('value should be returned for smtpPath property', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} "smtpPath"`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal('\n');
  });

  it('value should be returned for testOutputLevel property', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} testOutputLevel`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal('BASIC\n');
  });

  it('value should be returned for resultsPathDisposition property in json format', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} "resultsPathDisposition" --json`
    ).jsonOutput;
    expect(getOutput?.result.success).to.deep.equal(true);
    expect(getOutput?.result.value).to.deep.equal('Increment');
  });

  it('value should be returned for lightningMode property in json format', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} lightningMode --json`
    ).jsonOutput;
    expect(getOutput?.result.success).to.deep.equal(true);
    expect(getOutput?.result.value).to.deep.equal(true);
  });

  it('Value should be returned successfully for metdata object', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} metadata`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal("{ metadataLevel: 'Reuse', cachePath: '../.provarCaches' }\n");
  });

  it('Value should be returned successfully for environment object in json format', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} environment --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(getOutput.jsonOutput).to.deep.equal(getConstants.getEnvironmentJsonObject);
  });

  it('Value should be returned successfully for testEnvironment property in environment object', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} environment.testEnvironment`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal('${PROVAR_TEST_ENVIRONMENT}\n');
  });

  it('Value should be returned successfully for webBrowserDeviceName property in environment object', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} "environment"."webBrowserDeviceName"`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal('Full Screen\n');
  });

  it('Value should be returned successfully for cachePath property in metadata object', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} metadata.cachePath --json`
    ).jsonOutput;
    expect(getOutput?.result.success).to.deep.equal(true);
    expect(getOutput?.result.value).to.deep.equal('../.provarCaches');
  });

  it('Value should be returned successfully for testprojectSecrets property', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} testprojectSecrets`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal('${PROVAR_TEST_PROJECT_SECRETS}\n');
  });

  it('Value should be returned successfully for connectionRefreshType property', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} connectionRefreshType metadata.metadataLevel`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal('Reload\n');
  });

  it('value should be returned for new added property', () => {
    execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_SET_COMMAND} "Test Suite"="Multiple Suites"`);
    const getOutput = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GET_COMMAND} "Test Suite"`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal('Multiple Suites\n');
  });
});
