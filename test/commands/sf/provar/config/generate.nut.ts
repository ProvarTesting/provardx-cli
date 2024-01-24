import * as fs from 'fs';
import { expect } from 'chai';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { INVALID_PATH, PASS_FILE_CONTENT, INVALID_FILE_EXTENSION } from '../../../../assertion/generateConstants';
import { SfProvarCommandResult } from '../../../../../src/Utility/sfProvarCommandResult';
import { successMessage, errorInvalidPath, errorInvalidFileExtension } from '../../../../assertion/generateConstants';
import PropertyFileContent from '../../../../../src/constants/propertyFileContent.json';
import { commandConstants } from '../../../../../src/constants/commandConstants';

describe('Config generate', () => {
  let testSession: TestSession;

  afterEach(async () => {
    await testSession?.clean();
  });

  it('Boilerplate json file should be generated with "-p" flag when no path is defined', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} -p provardx-properties.json`,
      {
        ensureExitCode: 0,
      }
    ).shellOutput;
    expect(res['stdout']).to.deep.equal(successMessage);
  });

  it('Properties defined inside boilerplate json file are matched', () => {
    const filePath = './provardx-properties.json';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const expectedJsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(expectedJsonData).to.deep.equal(PropertyFileContent);
  });

  it('Boilerplate json file should be generated with "--properties-file" flag when no path is defined', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} --properties-file test_file.json`,
      {
        ensureExitCode: 0,
      }
    ).shellOutput;
    expect(res['stdout']).to.deep.equal(successMessage);
  });

  it('Boilerplate json file should be overwritten when "-n" flag is provided with flag "-p" ', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} -p provardx-properties.json -n`,
      {
        ensureExitCode: 0,
      }
    ).shellOutput;
    expect(res.stdout).to.deep.equal(successMessage);
  });

  it('Boilerplate json file should be overwritten when "--no-prompt" flag is provided with flag "--properties-file" ', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} --properties-file ./test_file.json --no-prompt`,
      {
        ensureExitCode: 0,
      }
    ).shellOutput;
    expect(res['stdout']).to.deep.equal(successMessage);
  });

  it('Boilerplate json file should be overwritten when "--no-prompt" flag is provided with flag "-p" ', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} -p ./test_file.json --no-prompt --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(PASS_FILE_CONTENT);
  });

  it('Boilerplate json file should be overwritten when "-n" flag is provided with flag "--properties-file" ', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} --properties-file ./test_file.json -n --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(PASS_FILE_CONTENT);
  });

  it('Boilerplate json file should be generated with "--properties-file"  when file name has space', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} --properties-file "./test/assertion bbb.json"`,
      {
        ensureExitCode: 0,
      }
    ).shellOutput;
    expect(res['stdout']).to.deep.equal(successMessage);
  });

  it('Boilerplate json file should be generated with "-p" flag using relative path', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} -p ./test/XYZ.json`,
      {
        ensureExitCode: 0,
      }
    ).shellOutput;
    expect(res['stdout']).to.deep.equal(successMessage);
  });

  it('Boilerplate json file should be generated with "-p" flag and with special char in file name', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} -p .\\test\\assertion\\D#um$.json`,
      {
        ensureExitCode: 0,
      }
    ).shellOutput;
    expect(res['stdout']).to.deep.equal(successMessage);
  });

  it('Boilerplate json file should not be generated with "-p" flag as path is invalid', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} -p a/aa.json`
    ).shellOutput;
    expect(res['stderr']).to.deep.equal(errorInvalidPath);
  });

  it('Boilerplate json file should not be generated with "-p" flag as extension is invalid', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} -p ./test/Dom.txt`
    ).shellOutput;
    expect(res['stderr']).to.deep.equal(errorInvalidFileExtension);
  });

  it('Boilerplate json file should not be generated with "--properties-file" flag as both path and extension are invalid', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} --properties-file ./test%cd/Dom.txt`
    ).shellOutput;
    expect(res['stderr']).to.deep.equal(errorInvalidFileExtension);
  });

  it('Boilerplate json file should be generated with "-p" flag and return the result in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} -p xyz.json --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(PASS_FILE_CONTENT);
  });

  it('Boilerplate json file should not be generated with "-p" flag as path is invalid and return the result in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} -p x/xyz.json --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(INVALID_PATH);
  });

  it('Boilerplate json file should not be generated with "--properties-file" flag as invalid file extension and return the result in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} --properties-file Ani.bat --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(INVALID_FILE_EXTENSION);
  });
});
