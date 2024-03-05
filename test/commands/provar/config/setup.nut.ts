import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { SfProvarCommandResult } from '../../../../src/Utility/sfProvarCommandResult.js';
import * as setupConstants from '../../../assertion/setupConstants.js';
import { commandConstants } from '../../../../src/constants/commandConstants.js';

describe('sf provar automation setup NUTs', () => {
  let testSession: TestSession;

  afterEach(async () => {
    await testSession?.clean();
  });

  it('Build should be installed using flag -v and return the success output', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_SETUP_COMMAND} -v 2.12.1`
    ).shellOutput;
    expect(result.stdout).to.deep.equal(setupConstants.successMessage);
  });

  it('Build should be installed using flag -v and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_SETUP_COMMAND} -v 2.12.1 --json`,
      {
        ensureExitCode: 0,
      }
    ).jsonOutput;
    expect(res).to.deep.equal(setupConstants.successJsonMessage);
  });

  it('Build should be installed using flag --version and return the success output', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_SETUP_COMMAND} --version 2.12.1`
    ).shellOutput;
    expect(result.stdout).to.deep.equal(setupConstants.successMessage);
  });

  it('Build should be installed using flag --version and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_SETUP_COMMAND} --version 2.12.1 --json`,
      {
        ensureExitCode: 0,
      }
    ).jsonOutput;
    expect(res).to.deep.equal(setupConstants.successJsonMessage);
  });
});
