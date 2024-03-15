import * as fileSystem from 'node:fs';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { SfProvarCommandResult } from '../../../../../src/Utility/sfProvarCommandResult.js';
import { commandConstants } from '../../../../../src/constants/commandConstants.js';
import * as compileConstants from '../../../../assertion/compileConstants.js';

describe('provar automation project compile NUTs', () => {
  let session: TestSession;
  enum FILE_PATHS {
    COMPILE_FILE = 'metadataDownloadFile.json',
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

  it('Compile command should be successful', () => {
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GENERATE_COMMAND} -p ${FILE_PATHS.COMPILE_FILE}`
    );
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_LOAD_COMMAND} -p ${FILE_PATHS.COMPILE_FILE}`
    );
    const SET_PROVAR_HOME_VALUE = '"C:/Program Files/Provar/2.12.1.1.02/"';
    const SET_PROJECT_PATH_VALUE = '"D:/Provar Workspace/8Feb/Provar"';
    // set provarHome and projectPath locations
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "provarHome"=${SET_PROVAR_HOME_VALUE}`
    );
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "projectPath"=${SET_PROJECT_PATH_VALUE}`
    );
    const result = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_AUTOMATION_PROJECT_COMPILE_COMMAND}`).shellOutput;
    expect(result.stdout).to.deep.equal(compileConstants.successMessage);
  });

  it('Compile command should be successful and return the result in json', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_PROJECT_COMPILE_COMMAND} --json`
    ).jsonOutput;
    expect(result).to.deep.equal(compileConstants.successJsonMessage);
  });
});
