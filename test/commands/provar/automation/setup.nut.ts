import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { SfProvarCommandResult } from '../../../../src/Utility/sfProvarCommandResult.js';
import * as setupConstants from '../../../assertion/setupConstants.js';
import { commandConstants } from '../../../../src/constants/commandConstants.js';
import { errorMessages } from '../../../../src/constants/errorMessages.js';

describe('sf provar automation setup NUTs', () => {
  let testSession: TestSession;

  afterEach(async () => {
    await testSession?.clean();
  });

  it('Invalid build should not be installed using flag -v and return the error message', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_SETUP_COMMAND} -v 7.12.1`
    ).shellOutput;
    expect(result.stderr).to.deep.equal(`Error (1): [SETUP_ERROR] ${errorMessages.SETUP_ERROR}Provided version is not a valid version.\n\n`);
  });

  it('Invalid build should not be installed using flag --version and return the success result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_SETUP_COMMAND} --version 21.345.00 --json`,
      {
        ensureExitCode: 0,
      }
    ).jsonOutput;
    expect(res).to.deep.equal(setupConstants.failureJsonMessage);
  });

  it('Build should be installed using flag -v and return the success output', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_SETUP_COMMAND} -v 2.12.1`
    ).shellOutput;
    expect(result.stdout).to.deep.equal(setupConstants.successMessage);
  });

  it('INSUFFICIENT_PERMISSIONS error on installing the build again using flag --version', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_SETUP_COMMAND} --version 2.12.1 --json`,
      {
        ensureExitCode: 0,
      }
    ).jsonOutput;
    expect(res).to.deep.equal(setupConstants.insufficientPermissions);
  });
});
