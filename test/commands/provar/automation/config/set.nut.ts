import * as fileSystem from 'node:fs';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { SfProvarCommandResult } from '../../../../../src/Utility/sfProvarCommandResult.js';
import * as validateConstants from '../../../../assertion/validateConstants.js';
import * as setConstants from '../../../../assertion/setConstants.js';
import { errorMessages } from '../../../../../src/constants/errorMessages.js';
import { commandConstants } from '../../../../../src/constants/commandConstants.js';

describe('sf provar config set NUTs', () => {
  let session: TestSession;
  const SET_PROVAR_HOME_VALUE = '"C:/Users/anchal.goel/Downloads/main_win32_e4145678987_20240117_08768/"';
  const SET_RESULTS_PATH_VALUE = '"C:/Users/anchal.goel/git/ProvarRegressionqam5/test/provardx/Results"';
  const SET_PROJECT_PATH_VALUE = 'C:/Users/anchal.goel/git/ProvarRegression/test';
  const SET_SMTP_PATH_VALUE = '" ../test/user/path"';
  const SET_RESULTS_PATH_DISPOSITION_VALUE = '"some random test"';
  const SET_TEST_OUTPUT_LEVEL_VALUE = 'DIAGNOSTIC';
  const SET_PLUGIN_OUTPUTLEVEL_VALUE = '"FINEST"';
  const SET_LIGHTNING_MODE_VALUE = false;
  const SET_TEST_ENVIRONMENT_VALUE = '"SIT"';
  const SET_NEW_ENVIRONMENT_VALUE = 'testingEnv';
  const SET_METADATA_LEVEL_VALUE = '"RefreshedMetadata"';
  const SET_CACHE_PATH_VALUE = '../Users/anchalgoel/test/path';
  const SET_ERROR_VALUE = 'fail';
  const SET_KEY_VALUE = 'KeyTest';
  const SET_TEST_VALUE = 'New_User';
  const SET_SPECIAL_CHARACTERS_VALUE = 'Str#$%in*_g';
  const SET_NUMBER_VALUE = 1_234_567_890;
  const SET_NUMBER_DECIMAL_VALUE = 9876.543_21;
  const SET_COUNTRY_VALUE = 'India';
  const SET_STATE_VALUE = 'Uttarakhand';
  const SET_CITY_VALUE = '"Roorkee"';
  const SET_POSITION_VALUE = 'Engineer';
  enum FILE_PATHS {
    INVALID_FILE = 'setInvalidFile.json',
    FILE_MULTIPLE_FILES = 'setMultiplePropertiesValue.json',
    ERROR_FILE = 'setErrors.json',
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

  it('Missing file error should be thrown when json file is not loaded and return the error', () => {
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GENERATE_COMMAND} -p ${FILE_PATHS.INVALID_FILE}`
    );
    const jsonFilePath = FILE_PATHS.INVALID_FILE;
    const data = fileSystem.readFileSync(jsonFilePath, 'utf-8');
    const newData = data.substring(1);
    fileSystem.writeFile(jsonFilePath, newData, (error) => {
      if (error) {
        return;
      }
    });
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_LOAD_COMMAND} -p ${FILE_PATHS.INVALID_FILE}`
    );
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} provarHome=notDefined`
    ).shellOutput;
    expect(result.stderr).to.deep.equal(`Error (1): [MISSING_FILE] ${errorMessages.MISSING_FILE_ERROR}\n\n`);
  });

  it('Missing file error should be thrown when json file is not loaded and return the error in json', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} resultsPath=path --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(validateConstants.missingFileJsonError);
  });

  it('Missing property error should be thrown when property is not defined and return the error', () => {
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GENERATE_COMMAND} -p ${FILE_PATHS.ERROR_FILE}`
    );
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_LOAD_COMMAND} -p ${FILE_PATHS.ERROR_FILE}`
    );
    execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_VALIDATE_COMMAND}`);
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} =Provar`
    ).shellOutput;
    expect(result.stderr).to.deep.equal(`Error (1): [MISSING_PROPERTY] ${errorMessages.MISSING_PROPERTY}\n\n`);
  });

  it('Missing property error should be thrown when property is not defined and return the error', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} ""=MissingProperty`
    ).shellOutput;
    expect(result.stderr).to.deep.equal(`Error (1): [MISSING_PROPERTY] ${errorMessages.MISSING_PROPERTY}\n\n`);
  });

  it('Missing property error should be thrown when property is not defined and return the error', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND}`
    ).shellOutput;
    expect(result.stderr).to.deep.equal(`Error (1): [MISSING_PROPERTY] ${errorMessages.MISSING_PROPERTY}\n\n`);
  });

  it('Missing property error should be thrown when property is not defined and return the error in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} =MissingProperty --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(setConstants.missingPropertyJsonError);
  });

  it('Missing value error should be thrown when value is not defined and return the error', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} missingValue=`
    ).shellOutput;
    expect(result.stderr).to.deep.equal(`Error (1): [MISSING_VALUE] ${errorMessages.MISSING_VALUE}\n\n`);
  });

  it('Missing value error should be thrown when value is not defined and return the error', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "missingValue"=""`
    ).shellOutput;
    expect(result.stderr).to.deep.equal(`Error (1): [MISSING_VALUE] ${errorMessages.MISSING_VALUE}\n\n`);
  });

  it('Missing value error should be thrown when value is not defined and return the error in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} missingValueError= --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(setConstants.missingValueJsonError);
  });

  it('Invalid argument error should be thrown when property and value is not defined in correct format and return the error', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} invalid = argument`
    ).shellOutput;
    expect(result.stderr).to.deep.equal(`Error (1): [INVALID_ARGUMENT] ${errorMessages.INVALID_ARGUMENT}\n\n`);
  });

  it('Invalid argument error should be thrown when property and value is not defined in correct format and return the error', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} attachmentProperties=random value`
    ).shellOutput;
    expect(result.stderr).to.deep.equal(`Error (1): [INVALID_ARGUMENT] ${errorMessages.INVALID_ARGUMENT}\n\n`);
  });

  it('Invalid argument error should be thrown when property and value is not defined in correct format and return the error in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "parsing" = "error" --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(setConstants.invalidArgumentJsonError);
  });

  it('Value should be set successfully for provarHome property in json file and return the success result in json format', () => {
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GENERATE_COMMAND} -p ${FILE_PATHS.FILE_MULTIPLE_FILES}`
    );
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_LOAD_COMMAND} -p ${FILE_PATHS.FILE_MULTIPLE_FILES}`
    );
    execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_VALIDATE_COMMAND}`);
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} provarHome=C:/Users/anchal.goel/Downloads/main_win64_e413157177_20240117_0452/ --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be overwritten successfully for provarHome property in json file and return the success result', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "provarHome"=${SET_PROVAR_HOME_VALUE}`
    ).shellOutput;
    expect(result.stdout).to.deep.equal('');
  });

  it('Value should be set successfully for resultsPath property in json file and return the success result in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "resultsPath"=${SET_RESULTS_PATH_VALUE} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for projectPath property in json file and return the success result', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "projectPath"=${SET_PROJECT_PATH_VALUE}`
    ).shellOutput;
    expect(result.stdout).to.deep.equal('');
  });

  it('Value should be set successfully for smtpPath property in json file and return the success result in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} smtpPath=${SET_SMTP_PATH_VALUE} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for resultsPathDisposition property in json file and return the success result in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} resultsPathDisposition=${SET_RESULTS_PATH_DISPOSITION_VALUE} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for testOutputLevel property in json file and return the success result in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "testOutputLevel"=${SET_TEST_OUTPUT_LEVEL_VALUE} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for pluginOutputlevel property in json file and return the success result', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} pluginOutputlevel=${SET_PLUGIN_OUTPUTLEVEL_VALUE}`
    ).shellOutput;
    expect(result.stdout).to.deep.equal('');
  });

  it('Value should be set successfully for lightningMode property in json file and return the success result', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} lightningMode=${SET_LIGHTNING_MODE_VALUE}`
    ).shellOutput;
    expect(result.stdout).to.deep.equal('');
  });

  it('Value should be set successfully for testEnvironment property in environment object in json file', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "environment.testEnvironment"=${SET_TEST_ENVIRONMENT_VALUE}`
    ).shellOutput;
    expect(result.stdout).to.deep.equal('');
  });

  it('New property should be set successfully in environment object in json file and return the success result in json format ', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} environment.newEnvironment=${SET_NEW_ENVIRONMENT_VALUE} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for metadataLevel property in json file and return the success result in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "metadata.metadataLevel"=${SET_METADATA_LEVEL_VALUE} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for metadata cachePath property in json file and return the success result', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} metadata.cachePath=${SET_CACHE_PATH_VALUE}`
    ).shellOutput;
    expect(result.stdout).to.deep.equal('');
  });

  it('Multiple properties with values should be set successfully and return the success result', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} metadata.error=${SET_ERROR_VALUE} environment.key=${SET_KEY_VALUE}`
    ).shellOutput;
    expect(result.stdout).to.deep.equal('');
  });

  it('New property and Value of type array should be set successfully in json file and return the success result in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "testCases"="[\\"/Test Case 1.testcase\\",\\"/Test Case 2.testcase\\",\\"/Test Case 3.testcase\\"]" --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New property and Value of type array should be set successfully in json file and return the success result', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "testcase"="[\\"tests/myTestCase.testcase\\",\\"tests/testSuite1/myTestCase1.testCase\\"]"`
    ).shellOutput;
    expect(result.stdout).to.deep.equal('');
  });

  it('New property and Value of type object should be set successfully in json file and return the success result', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "emailProperties"="{\\"sendEmail\\":true,\\"primaryRecipients\\":\\"anchal.goel@provartesting.com\\",\\"ccRecipients\\":\\"\\",\\"bccRecipients\\":\\"\\",\\"emailSubject\\":\\"Provar test run report\\",\\"attachExecutionReport\\":true,\\"attachZip\\":false}"`
    ).shellOutput;
    expect(result.stdout).to.deep.equal('');
  });

  it('New property and Value of type string should be set successfully in json file and return the success result in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} test=${SET_TEST_VALUE} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New property and Value of type string with special char should be set successfully in json file and return the success result in json format ', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "SpecialCharacters"=${SET_SPECIAL_CHARACTERS_VALUE} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New property and Value of type Boolean should be set successfully in json file and return the success result in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} booleanValue=false --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New property and Value of type Boolean should be set successfully in json file and return the success result', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} status=true`
    ).shellOutput;
    expect(result.stdout).to.deep.equal('');
  });

  it('New property and Value of type Number should be set successfully in json file and return the success result in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} number=${SET_NUMBER_VALUE} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New property and Value of type Number should be set successfully in json file and return the success result', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} number_Value=${SET_NUMBER_DECIMAL_VALUE}`
    ).shellOutput;
    expect(result.stdout).to.deep.equal('');
  });

  it('New property and Value of type Null should be set successfully in json file and return the success result in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} nullProperty=null --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New Object with property and Value should be created successfully in json file and return the success result in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} world.country=${SET_COUNTRY_VALUE} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
    const resultSet = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} world.state=${SET_STATE_VALUE}`
    ).shellOutput;
    expect(resultSet.stdout).to.deep.equal('');
    const output = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "world.city"=${SET_CITY_VALUE} --json`
    );
    expect(output.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New Object with nested properties and Value should be created successfully in json file and return the success result in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} company.team.employee.position=${SET_POSITION_VALUE} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Verifying values of all properties if those are correctly set in above testcases', () => {
    interface PropertyFileJsonData {
      [key: string]: string | boolean | PropertyFileJsonData;
    }
    const jsonData = JSON.parse(
      fileSystem.readFileSync(`./${FILE_PATHS.FILE_MULTIPLE_FILES}`, 'utf8')
    ) as PropertyFileJsonData;
    expect(jsonData.provarHome).to.equal(JSON.parse(SET_PROVAR_HOME_VALUE));
    expect(jsonData.resultsPath).to.equal(JSON.parse(SET_RESULTS_PATH_VALUE));
    expect(jsonData.projectPath).to.equal(SET_PROJECT_PATH_VALUE);
    expect(jsonData.smtpPath).to.equal(JSON.parse(SET_SMTP_PATH_VALUE));
    expect(jsonData.resultsPathDisposition).to.equal(JSON.parse(SET_RESULTS_PATH_DISPOSITION_VALUE));
    expect(jsonData.testOutputLevel).to.equal(SET_TEST_OUTPUT_LEVEL_VALUE);
    expect(jsonData.pluginOutputlevel).to.equal(JSON.parse(SET_PLUGIN_OUTPUTLEVEL_VALUE));
    expect(jsonData.lightningMode).to.equal(SET_LIGHTNING_MODE_VALUE);
    expect(jsonData.test).to.equal(SET_TEST_VALUE);
    expect(jsonData.SpecialCharacters).to.equal(SET_SPECIAL_CHARACTERS_VALUE);
    expect(jsonData.booleanValue).to.equal(false);
    expect(jsonData.status).to.equal(true);
    expect(jsonData.number).to.equal(SET_NUMBER_VALUE);
    expect(jsonData.number_Value).to.equal(SET_NUMBER_DECIMAL_VALUE);
    expect(jsonData.nullProperty).to.equal(null);
    expect(jsonData.lightningMode).to.equal(false);
    expect(jsonData.testCases).to.have.members([
      '/Test Case 1.testcase',
      '/Test Case 2.testcase',
      '/Test Case 3.testcase',
    ]);
    expect(jsonData.testcase).to.have.members(['tests/myTestCase.testcase', 'tests/testSuite1/myTestCase1.testCase']);
  });

  it('Verifying values of all nested properties', () => {
    interface PropertyFileJsonData {
      metadata: {
        metadataLevel: string;
        cachePath: string;
        error: string;
      };
      environment: {
        testEnvironment: string;
        newEnvironment: string;
        key: string;
      };
      emailProperties: {
        sendEmail: boolean;
        primaryRecipients: string;
        ccRecipients: string;
        bccRecipients: string;
        emailSubject: string;
        attachExecutionReport: boolean;
        attachZip: boolean;
      };
      world: {
        country: string;
        state: string;
        city: string;
      };
      company: {
        team: {
          employee: {
            position: string;
          };
        };
      };
    }
    const jsonData = JSON.parse(
      fileSystem.readFileSync(`./${FILE_PATHS.FILE_MULTIPLE_FILES}`, 'utf8')
    ) as PropertyFileJsonData;
    expect(jsonData.metadata.metadataLevel).to.equal(JSON.parse(SET_METADATA_LEVEL_VALUE));
    expect(jsonData.metadata.cachePath).to.equal(SET_CACHE_PATH_VALUE);
    expect(jsonData.metadata.error).to.equal(SET_ERROR_VALUE);
    expect(jsonData.environment.key).to.equal(SET_KEY_VALUE);
    expect(jsonData.environment.testEnvironment).to.equal(JSON.parse(SET_TEST_ENVIRONMENT_VALUE));
    expect(jsonData.environment.newEnvironment).to.equal(SET_NEW_ENVIRONMENT_VALUE);
    expect(jsonData.emailProperties.sendEmail).to.equal(true);
    expect(jsonData.emailProperties.primaryRecipients).to.equal('anchal.goel@provartesting.com');
    expect(jsonData.emailProperties.ccRecipients).to.equal('');
    expect(jsonData.emailProperties.bccRecipients).to.equal('');
    expect(jsonData.emailProperties.emailSubject).to.equal('Provar test run report');
    expect(jsonData.emailProperties.attachExecutionReport).to.equal(true);
    expect(jsonData.emailProperties.attachZip).to.equal(false);
    expect(jsonData.world.country).to.equal(SET_COUNTRY_VALUE);
    expect(jsonData.world.state).equal(SET_STATE_VALUE);
    expect(jsonData.world.city).equal(JSON.parse(SET_CITY_VALUE));
    expect(jsonData.company.team.employee.position).to.equal(SET_POSITION_VALUE);
  });
});
