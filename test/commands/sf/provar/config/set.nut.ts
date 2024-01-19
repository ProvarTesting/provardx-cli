import * as fs from 'fs';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { SfProvarCommandResult } from '../../../../../src/Utility/sfProvarCommandResult';
import { sfProvarConfigGenerateCommand } from '../../../../assertion/generateConstants';
import { sfProvarConfigLoadCommand } from '../../../../assertion/loadConstants';
import * as validateConstants from '../../../../assertion/validateConstants';
import { sfProvarConfigSetCommand } from '../../../../assertion/setConstants';
import * as setConstants from '../../../../assertion/setConstants';
import { errorMessages } from '../../../../../src/constants/errorMessages';

describe('sf provar config set NUTs', () => {
  let session: TestSession;

  after(async () => {
    await session?.clean();
    const filePaths = ['setinvalidFile.json', 'setMultiplePropertiesValue.json'];
    filePaths.forEach((filePath) => {
      fs.unlink(filePath, (err) => {
        if (err) {
          return err;
        }
      });
    });
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
    const res = execCmd<SfProvarCommandResult>(`${sfProvarConfigSetCommand} resultsPath=path --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(validateConstants.missingFileJsonError);
  });

  it('Value should be set successfully for provarHome property in json file and return the result in json format', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p setMultiplePropertiesValue.json`);
    execCmd<SfProvarCommandResult>(`${sfProvarConfigLoadCommand} -p setMultiplePropertiesValue.json`);
    execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`);
    const res = execCmd<SfProvarCommandResult>(
      `${sfProvarConfigSetCommand} provarHome=C:/Users/anchal.goel/Downloads/main_win64_e413157177_20240117_0452/ --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for resultsPath property in json file and return the result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${sfProvarConfigSetCommand} "resultsPath"="C:/Users/anchal.goel/git/ProvarRegressionqam5/test/provardx/Results" --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for projectPath property in json file and return the result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${sfProvarConfigSetCommand} "projectPath"=C:/Users/anchal.goel/git/ProvarRegression/test`
    ).shellOutput;
    expect(res.stdout).to.deep.equal('');
  });

  it('Value should be set successfully for smtpPath property in json file and return the result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${sfProvarConfigSetCommand} smtpPath=" ../test/user/path" --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for resultsPathDisposition property in json file in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${sfProvarConfigSetCommand} resultsPathDisposition="some random test" --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for testOutputLevel property in json file and return the result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${sfProvarConfigSetCommand} "testOutputLevel"=DIAGNOSTIC --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for testEnvironment property in environment object in json file', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${sfProvarConfigSetCommand} environment.testEnvironment=SIT`
    ).shellOutput;
    expect(res.stdout).to.deep.equal('');
  });

  it('New property should be set successfully in environment object in json file', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${sfProvarConfigSetCommand} environment.newEnvironment="testing" --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for metadata property in json file in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${sfProvarConfigSetCommand} "metadata.metadataLevel"=RefreshedMetadata --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New property and Value should be set successfully in json file', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${sfProvarConfigSetCommand} "testCases"=["/Test Case 1.testcase","/Test Case 2.testcase","/Test Case 3.testcase"] --json`
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New property and Value of type string should be set successfully in json file', () => {
    const res = execCmd<SfProvarCommandResult>(`${sfProvarConfigSetCommand} test=NewUser  --json`);
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New property and Value of type string with special char should be set successfully in json file', () => {
    const res = execCmd<SfProvarCommandResult>(`${sfProvarConfigSetCommand} SpecialCharacters='Str#$%in_g' --json`);
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New property and Value of type Boolean should be set successfully in json file', () => {
    const res = execCmd<SfProvarCommandResult>(`${sfProvarConfigSetCommand} booleanValue=false --json`);
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New property and Value of type Boolean should be set successfully in json file', () => {
    const res = execCmd<SfProvarCommandResult>(`${sfProvarConfigSetCommand} status=true --json`);
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New property and Value of type Number should be set successfully in json file', () => {
    const res = execCmd<SfProvarCommandResult>(`${sfProvarConfigSetCommand} number=0129 --json`);
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New property and Value of type Null should be set successfully in json file', () => {
    const res = execCmd<SfProvarCommandResult>(`${sfProvarConfigSetCommand} nullProperty=null --json`);
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New Object with property and Value should be created successfully in json file', () => {
    const res = execCmd<SfProvarCommandResult>(`${sfProvarConfigSetCommand} world.country=India --json`);
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
    const result = execCmd<SfProvarCommandResult>(`${sfProvarConfigSetCommand} world.state=Uttarakhand --json`);
    expect(result.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
    const output = execCmd<SfProvarCommandResult>(`${sfProvarConfigSetCommand} "world.city"="Roorkee" --json`);
    expect(output.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('New Object with property and Value should be created successfully in json file', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${sfProvarConfigSetCommand} company.team.employee.position=Engineer --json`
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });
});
