import * as fs from 'fs';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { SfProvarCommandResult } from '../../../../../src/Utility/sfProvarCommandResult';
import { sfProvarConfigGenerateCommand } from '../../../../assertion/generateConstants';
import { sfProvarConfigLoadCommand } from '../../../../assertion/loadConstants';
import * as validateConstants from '../../../../assertion/validateConstants';
import * as setConstants from '../../../../assertion/setConstants';
import { errorMessages } from '../../../../../src/constants/errorMessages';

describe('sf provar config set NUTs', () => {
  let session: TestSession;
  const setProvarHomeValue = '"C:/Users/anchal.goel/Downloads/main_win32_e4145678987_20240117_08768/"';
  const setResultsPathValue = '"C:/Users/anchal.goel/git/ProvarRegressionqam5/test/provardx/Results"';
  const setProjectPathValue = 'C:/Users/anchal.goel/git/ProvarRegression/test';
  const setSmtpPathValue = '" ../test/user/path"';
  const setResultsPathDispositionValue = '"some random test"';
  const setTestOutputLevelValue = 'DIAGNOSTIC';
  const setPluginOutputlevelValue = '"FINEST"';
  const setLightningModeValue = false;
  const setTestEnvironmentValue = '"SIT"';
  const setNewEnvironmentValue = 'testingEnv';
  const setMetadataLevelValue = '"RefreshedMetadata"';
  const setCachePathValue = '../Users/anchalgoel/test/path';
  const setErrorValue = 'fail';
  const setKeyValue = 'KeyTest';
  const setTestValue = 'New_User';
  const setSpecialCharactersValue = 'Str#$%in*_g';
  const setNumberValue = 1234567890;
  const setNumberDecimalValue = 9876.54321;
  const setCountryValue = 'India';
  const setStateValue = 'Uttarakhand';
  const setCityValue = '"Roorkee"';
  const setPositionValue = 'Engineer';

  after(async () => {
    await session?.clean();
    const filePaths = ['setinvalidFile.json', 'setMultiplePropertiesValue.json', 'setErrors.json'];
    filePaths.forEach((filePath) => {
      fs.unlink(filePath, (err) => {
        if (err) {
          return err;
        }
      });
    });
  });

  it('Missing file error should be thrown when json file is not loaded and return the error', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p setinvalidFile.json`);
    const jsonFilePath = 'setinvalidFile.json';
    const data = fs.readFileSync(jsonFilePath, 'utf-8');
    const newData = data.substring(1);
    fs.writeFile(jsonFilePath, newData, (error) => {
      if (error) {
        return;
      }
    });
    execCmd<SfProvarCommandResult>(`${sfProvarConfigLoadCommand} -p setinvalidFile.json`);
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} provarHome=notDefined`
    ).shellOutput;
    expect(res.stderr).to.deep.equal(`Error (1): [MISSING_FILE] ${errorMessages.MISSINGFILEERROR}\n`);
  });

  it('Missing file error should be thrown when json file is not loaded and return the error in json', () => {
    const res = execCmd<SfProvarCommandResult>(`${setConstants.sfProvarConfigSetCommand} resultsPath=path --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(validateConstants.missingFileJsonError);
  });

  it('Missing property error should be thrown when property is not defined and return the error', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p setErrors.json`);
    execCmd<SfProvarCommandResult>(`${sfProvarConfigLoadCommand} -p setErrors.json`);
    execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`);
    const res = execCmd<SfProvarCommandResult>(`${setConstants.sfProvarConfigSetCommand} =Provar`).shellOutput;
    expect(res.stderr).to.deep.equal(`Error (1): [MISSING_PROPERTY] ${errorMessages.MISSING_PROPERTY}\n`);
  });

  it('Missing property error should be thrown when property is not defined and return the error', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} ""=MissingProperty`
    ).shellOutput;
    expect(res.stderr).to.deep.equal(`Error (1): [MISSING_PROPERTY] ${errorMessages.MISSING_PROPERTY}\n`);
  });

  it('Missing property error should be thrown when property is not defined and return the error', () => {
    const res = execCmd<SfProvarCommandResult>(`${setConstants.sfProvarConfigSetCommand}`).shellOutput;
    expect(res.stderr).to.deep.equal(`Error (1): [MISSING_PROPERTY] ${errorMessages.MISSING_PROPERTY}\n`);
  });

  it('Missing property error should be thrown when property is not defined and return the error in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${setConstants.sfProvarConfigSetCommand} =MissingProperty --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(setConstants.missingPropertyJsonError);
  });

  it('Missing value error should be thrown when value is not defined and return the error', () => {
    const res = execCmd<SfProvarCommandResult>(`${setConstants.sfProvarConfigSetCommand} missingValue=`).shellOutput;
    expect(res.stderr).to.deep.equal(`Error (1): [MISSING_VALUE] ${errorMessages.MISSING_VALUE}\n`);
  });

  it('Missing value error should be thrown when value is not defined and return the error', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} "missingValue"=""`
    ).shellOutput;
    expect(res.stderr).to.deep.equal(`Error (1): [MISSING_VALUE] ${errorMessages.MISSING_VALUE}\n`);
  });

  it('Missing value error should be thrown when value is not defined and return the error in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${setConstants.sfProvarConfigSetCommand} missingValueError= --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(setConstants.missingValueJsonError);
  });

  it('Invalid argument error should be thrown when property and value is not defined in correct format and return the error', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} invalid = argument`
    ).shellOutput;
    expect(res.stderr).to.deep.equal(`Error (1): [INVALID_ARGUMENT] ${errorMessages.INVALID_ARGUMENT}\n`);
  });

  it('Invalid argument error should be thrown when property and value is not defined in correct format and return the error', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} attachmentProperties=random value`
    ).shellOutput;
    expect(res.stderr).to.deep.equal(`Error (1): [INVALID_ARGUMENT] ${errorMessages.INVALID_ARGUMENT}\n`);
  });

  it('Invalid argument error should be thrown when property and value is not defined in correct format and return the error in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${setConstants.sfProvarConfigSetCommand} "parsing" = "error" --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(setConstants.invalidArgumentJsonError);
  });

  it('Value should be set successfully for provarHome property in json file and return the success result in json format', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p setMultiplePropertiesValue.json`);
    execCmd<SfProvarCommandResult>(`${sfProvarConfigLoadCommand} -p setMultiplePropertiesValue.json`);
    execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`);
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} provarHome=C:/Users/anchal.goel/Downloads/main_win64_e413157177_20240117_0452/ --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be overwritten successfully for provarHome property in json file and return the success result', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} "provarHome"=${setProvarHomeValue}`
    ).shellOutput;
    expect(res.stdout).to.deep.equal('');
  });

  it('Value should be set successfully for resultsPath property in json file and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} "resultsPath"=${setResultsPathValue} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for projectPath property in json file and return the success result', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} "projectPath"=${setProjectPathValue}`
    ).shellOutput;
    expect(res.stdout).to.deep.equal('');
  });

  it('Value should be set successfully for smtpPath property in json file and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} smtpPath=${setSmtpPathValue} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for resultsPathDisposition property in json file and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} resultsPathDisposition=${setResultsPathDispositionValue} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for testOutputLevel property in json file and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} "testOutputLevel"=${setTestOutputLevelValue} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for pluginOutputlevel property in json file and return the success result', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} pluginOutputlevel=${setPluginOutputlevelValue}`
    ).shellOutput;
    expect(res.stdout).to.deep.equal('');
  });

  it('Value should be set successfully for lightningMode property in json file and return the success result', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} lightningMode=${setLightningModeValue}`
    ).shellOutput;
    expect(res.stdout).to.deep.equal('');
  });

  it('Value should be set successfully for testEnvironment property in environment object in json file', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} "environment.testEnvironment"=${setTestEnvironmentValue}`
    ).shellOutput;
    expect(res.stdout).to.deep.equal('');
  });

  it('New property should be set successfully in environment object in json file and return the success result in json format ', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} environment.newEnvironment=${setNewEnvironmentValue} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for metadataLevel property in json file and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} "metadata.metadataLevel"=${setMetadataLevelValue} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for metadata cachePath property in json file and return the success result', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} metadata.cachePath=${setCachePathValue}`
    ).shellOutput;
    expect(res.stdout).to.deep.equal('');
  });

  it('Multiple properties with values should be set successfully and return the success result', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} metadata.error=${setErrorValue} environment.key=${setKeyValue}`
    ).shellOutput;
    expect(res.stdout).to.deep.equal('');
  });

  it('New property and Value of type array should be set successfully in json file and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} "testCases"="[\\"/Test Case 1.testcase\\",\\"/Test Case 2.testcase\\",\\"/Test Case 3.testcase\\"]" --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New property and Value of type array should be set successfully in json file and return the success result', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} "testcase"="[\\"tests/myTestCase.testcase\\",\\"tests/testSuite1/myTestCase1.testCase\\"]"`
    ).shellOutput;
    expect(res.stdout).to.deep.equal('');
  });

  it('New property and Value of type object should be set successfully in json file and return the success result', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} "emailProperties"="{\\"sendEmail\\":true,\\"primaryRecipients\\":\\"anchal.goel@provartesting.com\\",\\"ccRecipients\\":\\"\\",\\"bccRecipients\\":\\"\\",\\"emailSubject\\":\\"Provar test run report\\",\\"attachExecutionReport\\":true,\\"attachZip\\":false}"`
    ).shellOutput;
    expect(res.stdout).to.deep.equal('');
  });

  it('New property and Value of type string should be set successfully in json file and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${setConstants.sfProvarConfigSetCommand} test=${setTestValue} --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New property and Value of type string with special char should be set successfully in json file and return the success result in json format ', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} "SpecialCharacters"=${setSpecialCharactersValue} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New property and Value of type Boolean should be set successfully in json file and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${setConstants.sfProvarConfigSetCommand} booleanValue=false --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New property and Value of type Boolean should be set successfully in json file and return the success result', () => {
    const res = execCmd<SfProvarCommandResult>(`${setConstants.sfProvarConfigSetCommand} status=true`).shellOutput;
    expect(res.stdout).to.deep.equal('');
  });

  it('New property and Value of type Number should be set successfully in json file and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} number=${setNumberValue} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New property and Value of type Number should be set successfully in json file and return the success result', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} number_Value=${setNumberDecimalValue}`
    ).shellOutput;
    expect(res.stdout).to.deep.equal('');
  });

  it('New property and Value of type Null should be set successfully in json file and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${setConstants.sfProvarConfigSetCommand} nullProperty=null --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New Object with property and Value should be created successfully in json file and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} world.country=${setCountryValue} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
    const result = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} world.state=${setStateValue}`
    ).shellOutput;
    expect(result.stdout).to.deep.equal('');
    const output = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} "world.city"=${setCityValue} --json`
    );
    expect(output.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New Object with nested properties and Value should be created successfully in json file and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} company.team.employee.position=${setPositionValue} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Verifying values of all properties if those are correctly set in above testcases', () => {
    interface PropertyFileJsonData {
      [key: string]: string | boolean | PropertyFileJsonData;
    }
    const jsonData = JSON.parse(fs.readFileSync('./setMultiplePropertiesValue.json', 'utf8')) as PropertyFileJsonData;
    expect(jsonData.provarHome).to.equal(JSON.parse(setProvarHomeValue));
    expect(jsonData.resultsPath).to.equal(JSON.parse(setResultsPathValue));
    expect(jsonData.projectPath).to.equal(setProjectPathValue);
    expect(jsonData.smtpPath).to.equal(JSON.parse(setSmtpPathValue));
    expect(jsonData.resultsPathDisposition).to.equal(JSON.parse(setResultsPathDispositionValue));
    expect(jsonData.testOutputLevel).to.equal(setTestOutputLevelValue);
    expect(jsonData.pluginOutputlevel).to.equal(JSON.parse(setPluginOutputlevelValue));
    expect(jsonData.lightningMode).to.equal(setLightningModeValue);
    expect(jsonData.test).to.equal(setTestValue);
    expect(jsonData.SpecialCharacters).to.equal(setSpecialCharactersValue);
    expect(jsonData.booleanValue).to.equal(false);
    expect(jsonData.status).to.equal(true);
    expect(jsonData.number).to.equal(setNumberValue);
    expect(jsonData.number_Value).to.equal(setNumberDecimalValue);
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
    const jsonData = JSON.parse(fs.readFileSync('./setMultiplePropertiesValue.json', 'utf8')) as PropertyFileJsonData;
    expect(jsonData.metadata.metadataLevel).to.equal(JSON.parse(setMetadataLevelValue));
    expect(jsonData.metadata.cachePath).to.equal(setCachePathValue);
    expect(jsonData.metadata.error).to.equal(setErrorValue);
    expect(jsonData.environment.key).to.equal(setKeyValue);
    expect(jsonData.environment.testEnvironment).to.equal(JSON.parse(setTestEnvironmentValue));
    expect(jsonData.environment.newEnvironment).to.equal(setNewEnvironmentValue);
    expect(jsonData.emailProperties.sendEmail).to.equal(true);
    expect(jsonData.emailProperties.primaryRecipients).to.equal('anchal.goel@provartesting.com');
    expect(jsonData.emailProperties.ccRecipients).to.equal('');
    expect(jsonData.emailProperties.bccRecipients).to.equal('');
    expect(jsonData.emailProperties.emailSubject).to.equal('Provar test run report');
    expect(jsonData.emailProperties.attachExecutionReport).to.equal(true);
    expect(jsonData.emailProperties.attachZip).to.equal(false);
    expect(jsonData.world.country).to.equal(setCountryValue);
    expect(jsonData.world.state).equal(setStateValue);
    expect(jsonData.world.city).equal(JSON.parse(setCityValue));
    expect(jsonData.company.team.employee.position).to.equal(setPositionValue);
  });
});
