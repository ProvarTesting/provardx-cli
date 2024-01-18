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
    const filePaths = ['setinvalidFile.json', 'setEnvValue.json', 'setTestCases.json'];
    filePaths.forEach((filePath) => {
      fs.unlink(filePath, (err) => {
        if (err) {
          return err;
        }
      });
    });
  });

  it('Value should not be set in json file if json file is not loaded in sf config ', () => {
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
      `${setConstants.sfProvarConfigSetCommand} provarHome='"notDefined"'`
    ).shellOutput;
    expect(res.stderr).to.deep.equal(`Error (1): [MISSING_FILE] ${errorMessages.MISSINGFILEERROR}\n`);
  });

  it('Value should not be set in json file as file does not exist', () => {
    const res = execCmd<SfProvarCommandResult>(`${sfProvarConfigSetCommand} resultsPath=path --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(validateConstants.missingFileJsonError);
  });

  it('Value should be set successfully for environment property in json file', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p setEnvValue.json`);
    execCmd<SfProvarCommandResult>(`${sfProvarConfigLoadCommand} -p setEnvValue.json`);
    execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`);
    const res = execCmd<SfProvarCommandResult>(
      `${sfProvarConfigSetCommand} environment.testEnvironment=SIT`
    ).shellOutput;
    expect(res.stdout).to.deep.equal('');
  });

  it('Value should be set successfully for environment property in json file in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${sfProvarConfigSetCommand} metadata.metadataLevel="REUSE" --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Property and Value should be set successfully in json file', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p setTestCases.json`);
    execCmd<SfProvarCommandResult>(`${sfProvarConfigLoadCommand} -p setTestCases.json`);
    execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`);
    const res = execCmd<SfProvarCommandResult>(
      `${sfProvarConfigSetCommand} "testCases"=["tests/myTestCase.testcase","tests/testSuite1/myTestCase1.testCase"] --json`
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });
});
