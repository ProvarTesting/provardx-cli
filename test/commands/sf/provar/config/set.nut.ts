import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { SfProvarCommandResult } from '../../../../../src/Utility/sfProvarCommandResult';
import { sfProvarConfigGenerateCommand } from '../../../../assertion/generateConstants';
import { sfProvarConfigLoadCommand } from '../../../../assertion/loadConstants';
import { sfProvarConfigValidateCommand } from '../../../../assertion/validateConstants';
import { sfProvarConfigSetCommand } from '../../../../assertion/setConstants';
import * as setConstants from '../../../../assertion/setConstants';
// import { errorMessages } from '../../../../../src/constants/errorMessages';

describe('sf provar config set NUTs', () => {
  let session: TestSession;

  after(async () => {
    await session?.clean();
  });

  it('Value should be set successfully for environment property in json file', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p setEnvValue.json`);
    execCmd<SfProvarCommandResult>(`${sfProvarConfigLoadCommand} -p setEnvValue.json`);
    execCmd<SfProvarCommandResult>(`${sfProvarConfigValidateCommand}`);
    const res = execCmd<SfProvarCommandResult>(
      `${sfProvarConfigSetCommand} environment.testEnvironment='"SIT"'`
    ).shellOutput;
    expect(res.stdout).to.deep.equal('');
  });

  it('Value should be set successfully for environment property in json file in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${sfProvarConfigSetCommand} environment.testEnvironment='"TEST"' --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });

  it('Value should be set successfully for environment property in json file', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p setTestCases.json`);
    execCmd<SfProvarCommandResult>(`${sfProvarConfigLoadCommand} -p setTestCases.json`);
    execCmd<SfProvarCommandResult>(`${sfProvarConfigValidateCommand}`);
    const res = execCmd<SfProvarCommandResult>(
      `${sfProvarConfigSetCommand} testCases='["tests/myTestCase.testcase","tests/testSuite1/myTestCase1.testCase"]' --json`
    );
    expect(res.jsonOutput).to.deep.equal(setConstants.setSuccessJson);
  });
});
