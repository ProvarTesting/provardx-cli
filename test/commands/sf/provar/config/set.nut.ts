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

  after(async () => {
    await session?.clean();
    // const filePaths = ['setinvalidFile.json', 'setMultiplePropertiesValue.json'];
    // filePaths.forEach((filePath) => {
    //   fs.unlink(filePath, (err) => {
    //     if (err) {
    //       return err;
    //     }
    //   });
    // });
  });

  it('Value should not be set in json file if json file is not loaded in sf config file path and return the error', () => {
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

  it('Value should not be set in json file as file does not exist in sf config file path and return the error in json fomat', () => {
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
    const res = execCmd<SfProvarCommandResult>(`${setConstants.sfProvarConfigSetCommand} missingValue= --json`, {
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
      `${setConstants.sfProvarConfigSetCommand} "provarHome"="C:/Users/anchal.goel/Downloads/main_win64_e4145678987_20240117_0452/"`
    ).shellOutput;
    expect(res.stdout).to.deep.equal('');
  });

  it('Value should be set successfully for resultsPath property in json file and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} "resultsPath"="C:/Users/anchal.goel/git/ProvarRegressionqam5/test/provardx/Results" --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for projectPath property in json file and return the success result', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} "projectPath"=C:/Users/anchal.goel/git/ProvarRegression/test`
    ).shellOutput;
    expect(res.stdout).to.deep.equal('');
  });

  it('Value should be set successfully for smtpPath property in json file and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} smtpPath=" ../test/user/path" --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for resultsPathDisposition property in json file and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} resultsPathDisposition="some random test" --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for testOutputLevel property in json file and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} "testOutputLevel"=DIAGNOSTIC --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for pluginOutputlevel property in json file and return the success result', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} pluginOutputlevel="FINEST"`
    ).shellOutput;
    expect(res.stdout).to.deep.equal('');
  });

  it('Value should be set successfully for testEnvironment property in environment object in json file', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} "environment.testEnvironment"="SIT"`
    ).shellOutput;
    expect(res.stdout).to.deep.equal('');
  });

  it('New property should be set successfully in environment object in json file and return the success result in json format ', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} environment.newEnvironment=testingEnv --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for metadata property in json file and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} "metadata.metadataLevel"="RefreshedMetadata" --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for metadata cachePath property in json file and return the success result', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} metadata.cachePath=../Users/anchalgoel/test/path`
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

  it('New property and Value of type object should be set successfully in json file and return the success resul', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} "emailProperties"="{\\"sendEmail\\":true,\\"primaryRecipients\\":\\"anchal.goel@provartesting.com\\",\\"ccRecipients\\":\\"\\",\\"bccRecipients\\":\\"\\",\\"emailSubject\\":\\"Provar test run report\\",\\"attachExecutionReport\\":true,\\"attachZip\\":false}"`
    ).shellOutput;
    expect(res.stdout).to.deep.equal('');
  });

  it('New property and Value of type string should be set successfully in json file and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${setConstants.sfProvarConfigSetCommand} test=New_User  --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New property and Value of type string with special char should be set successfully in json file and return the success result in json format ', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} "SpecialCharacters"=Str#$%in*_g --json`,
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
    const res = execCmd<SfProvarCommandResult>(`${setConstants.sfProvarConfigSetCommand} number=1234567890 --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New property and Value of type Number should be set successfully in json file and return the success result', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} number_Value=9876.54321`
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
    const res = execCmd<SfProvarCommandResult>(`${setConstants.sfProvarConfigSetCommand} world.country=India --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
    const result = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} world.state=Uttarakhand`
    ).shellOutput;
    expect(result.stdout).to.deep.equal('');
    const output = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} "world.city"="Roorkee" --json`
    );
    expect(output.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New Object with nested property and Value should be created successfully in json file and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} company.team.employee.position=Engineer --json`,
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
    expect(jsonData.provarHome).to.equal('C:/Users/anchal.goel/Downloads/main_win64_e4145678987_20240117_0452/');
    expect(jsonData.resultsPath).to.equal('C:/Users/anchal.goel/git/ProvarRegressionqam5/test/provardx/Results');
    expect(jsonData.projectPath).to.equal('C:/Users/anchal.goel/git/ProvarRegression/test');
    expect(jsonData.smtpPath).to.equal(' ../test/user/path');
    expect(jsonData.resultsPathDisposition).to.equal('some random test');
    expect(jsonData.testOutputLevel).to.equal('DIAGNOSTIC');
    expect(jsonData.pluginOutputlevel).to.equal('FINEST');
    expect(jsonData.test).to.equal('New_User');
    expect(jsonData.SpecialCharacters).to.equal('Str#$%in*_g');
    expect(jsonData.booleanValue).to.equal(false);
    expect(jsonData.status).to.equal(true);
    expect(jsonData.number).to.equal(1234567890);
    expect(jsonData.number_Value).to.equal(9876.54321);
    expect(jsonData.nullProperty).to.equal(null);
  });

  it('Verifying values of all nested properties', () => {
    interface PropertyFileJsonData {
      metadata: {
        metadataLevel: string;
        cachePath: string;
      };
      environment: {
        testEnvironment: string;
        newEnvironment: string;
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
    expect(jsonData.metadata.metadataLevel).to.equal('RefreshedMetadata');
    expect(jsonData.metadata.cachePath).to.equal('../Users/anchalgoel/test/path');
    expect(jsonData.environment.testEnvironment).to.equal('SIT');
    expect(jsonData.environment.newEnvironment).to.equal('testingEnv');
    expect(jsonData.emailProperties.sendEmail).to.equal(true);
    expect(jsonData.emailProperties.primaryRecipients).to.equal('anchal.goel@provartesting.com');
    expect(jsonData.emailProperties.ccRecipients).to.equal('');
    expect(jsonData.emailProperties.bccRecipients).to.equal('');
    expect(jsonData.emailProperties.emailSubject).to.equal('Provar test run report');
    expect(jsonData.emailProperties.attachExecutionReport).to.equal(true);
    expect(jsonData.emailProperties.attachZip).to.equal(false);
    expect(jsonData.world.country).to.equal('India');
    expect(jsonData.world.state).equal('Uttarakhand');
    expect(jsonData.world.city).equal('Roorkee');
    expect(jsonData.company.team.employee.position).to.equal('Engineer');
  });
});
