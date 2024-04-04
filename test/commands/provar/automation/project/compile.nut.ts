import * as fileSystem from 'node:fs';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { SfProvarCommandResult } from '../../../../../src/Utility/sfProvarCommandResult.js';
import { commandConstants } from '../../../../../src/constants/commandConstants.js';
import { errorMessages } from '../../../../../src/constants/errorMessages.js';
import * as compileConstants from '../../../../assertion/compileConstants.js';
import * as validateConstants from '../../../../assertion/validateConstants.js';
// import * as setupConstants from '../../../../assertion/setupConstants.js';

describe('provar automation project compile NUTs', () => {
  let session: TestSession;
  enum FILE_PATHS {
    COMPILE_FILE = 'compileFile.json',
    MISSING_FILE = 'missingFile.json'
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

  it('Boilerplate json file should not be compiled if the file has not been loaded', () => {
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GENERATE_COMMAND} -p ${FILE_PATHS.MISSING_FILE}`
    );
    interface PropertyFileJsonData {
      [key: string]: string | boolean | number;
    }
    const jsonFilePath = 'MissingFile.json';
    // reading the json data
    const jsonDataString = fileSystem.readFileSync(jsonFilePath, 'utf-8');
    const jsonData: PropertyFileJsonData = JSON.parse(jsonDataString) as PropertyFileJsonData;
    jsonData.provarHome = '';
    jsonData.projectPath = '';
    const updatedJsonDataString = JSON.stringify(jsonData, null, 2);
    fileSystem.writeFileSync(jsonFilePath, updatedJsonDataString, 'utf-8');
    execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_LOAD_COMMAND}`);
    const res = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_PROJECT_COMPILE_COMMAND}`
    ).shellOutput;
    expect(res.stderr).to.deep.equal(`Error (1): [MISSING_FILE] ${errorMessages.MISSINGFILEERROR}\n\n`);
  });

  it('Boilerplate json file should not be compiled if the file has not been loaded and return result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_PROJECT_COMPILE_COMMAND} --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(validateConstants.missingFileJsonError);
  });

  // it('Build should be installed using flag -v and return the success output', () => {
  //   const result = execCmd<SfProvarCommandResult>(
  //     `${commandConstants.SF_PROVAR_AUTOMATION_SETUP_COMMAND}`
  //   ).shellOutput;
  //   expect(result.stdout).to.deep.equal(setupConstants.successMessage);
  // });

  it('Compile command should be successful', () => {
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GENERATE_COMMAND} -p ${FILE_PATHS.COMPILE_FILE}`
    );
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_LOAD_COMMAND} -p ${FILE_PATHS.COMPILE_FILE}`
    );
    const SET_PROVAR_HOME_VALUE = '"./ProvarHome"';
    const SET_PROJECT_PATH_VALUE = '"./ProvarRegression/AutomationRevamp"';
    // set provarHome and projectPath locations
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "provarHome"=${SET_PROVAR_HOME_VALUE}`
    );
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "projectPath"=${SET_PROJECT_PATH_VALUE}`
    );
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_PROJECT_COMPILE_COMMAND}`
    ).shellOutput;
    expect(result.stdout).to.deep.equal(compileConstants.successMessage);
  });

  it('Compile command should be successful and return the result in json', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_PROJECT_COMPILE_COMMAND} --json`
    ).jsonOutput;
    expect(result).to.deep.equal(compileConstants.successJsonMessage);
  });
});
