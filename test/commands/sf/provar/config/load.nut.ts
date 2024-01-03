import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { SfProvarCommandResult } from '../../../../../src/Utility/sfProvarCommandResult';
import { sfProvarConfigGenerateCommand } from '../../../../assertion/generateConstants';
import * as loadConstants from '../../../../assertion/loadConstants';

describe('sf provar config load NUTs', () => {
  let session: TestSession;

  after(async () => {
    await session?.clean();
  });

  it('Boilerplate json file should be loaded successfully and return a success message', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p loadFile.json`);
    const res = execCmd<SfProvarCommandResult>(`${loadConstants.sfProvarConfigLoadCommand} -p loadFile.json`, {
      ensureExitCode: 0,
    }).shellOutput;
    expect(res.stdout).to.deep.equal(loadConstants.loadSuccessMessage);
  });

  it('Boilerplate json file should be loaded successfully and return a success message in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${loadConstants.sfProvarConfigLoadCommand} -p loadFile.json --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(loadConstants.loadSuccessJson);
  });
});
