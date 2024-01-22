import * as fs from 'fs';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { SfProvarCommandResult } from '../../../../../src/Utility/sfProvarCommandResult';
import { sfProvarConfigGenerateCommand } from '../../../../assertion/generateConstants';
import { sfProvarConfigLoadCommand } from '../../../../assertion/loadConstants';
import { sfProvarConfigValidateCommand } from '../../../../assertion/validateConstants';
import * as getConstants from '../../../../assertion/getConstants';
import { errorMessages } from '../../../../../src/constants/errorMessages';

describe('sf provar config set NUTs', () => {
  let session: TestSession;

  after(async () => {
    await session?.clean();
  });

  it('Value should be get successfully for environment property in json file and return the result', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p getEnvValue.json`);
    execCmd<SfProvarCommandResult>(`${sfProvarConfigLoadCommand} -p getEnvValue.json`);
    execCmd<SfProvarCommandResult>(`${sfProvarConfigValidateCommand}`);
    interface PropertyFileJsonData {
      environment: {
        testEnvironment: string;
      };
    }
    const jsonFilePath = 'getEnvValue.json';
    const jsonData: PropertyFileJsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8')) as PropertyFileJsonData;
    const testEnvironmentValue = jsonData.environment.testEnvironment;
    const res = execCmd<SfProvarCommandResult>(
      `${getConstants.sfProvarConfigGetCommand} environment.testEnvironment`
    ).shellOutput;
    expect(res.stdout).to.deep.equal(testEnvironmentValue);
  });

  it('Value should be get successfully for metdata property in json file and return result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${getConstants.sfProvarConfigGetCommand} metadata.metadataLevel --json`,
      {
        ensureExitCode: 0,
      }
    ).jsonOutput;
    expect(res?.result.success).to.deep.equal('true');
    // expect(res?.result.value).to.deep.equal('Reuse');
  });

  it('Value should not be get if json file does not exists in sf config file', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p getinvalidFile.json`);
    execCmd<SfProvarCommandResult>(`${sfProvarConfigLoadCommand} -p getinvalidFile.json`);
    const res = execCmd<SfProvarCommandResult>(`${getConstants.sfProvarConfigGetCommand} provarHome`).shellOutput;
    expect(res.stderr).to.deep.equal(`Error (1): [MISSING_FILE] ${errorMessages.MISSINGFILEERROR}\n`);
  });
});
