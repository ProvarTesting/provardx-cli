import * as fs from 'fs';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { SfProvarCommandResult } from '../../../../../src/Utility/sfProvarCommandResult';
import { sfProvarConfigGenerateCommand } from '../../../../assertion/generateConstants';
import * as loadConstants from '../../../../assertion/loadConstants';
import * as validateConstants from '../../../../assertion/validateConstants';

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

  it('Boilerplate json file should not be loaded when file path is invalid', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} -p invalidFile.json`
    ).shellOutput;
    expect(res.stderr).to.deep.equal(loadConstants.invalidPathError);
  });

  it('Boilerplate json file should not be loaded when file path is invalid and return error message in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} -p invalidFile.json --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(loadConstants.invalidPathJsonError);
  });

  it('Boilerplate json file should be loaded sucessfully when file is overwritten', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p a.json`);
    execCmd<SfProvarCommandResult>(`${loadConstants.sfProvarConfigLoadCommand} -p a.json`);
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p b.json`);
    const res = execCmd<SfProvarCommandResult>(`${loadConstants.sfProvarConfigLoadCommand} -p b.json`).shellOutput;
    expect(res.stdout).to.deep.equal(loadConstants.loadSuccessMessage);
  });

  it('Boilerplate json file should be loaded sucessfully when file is overwritten and return the result in json format', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} --properties-file c.json`);
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} --properties-file c.json --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(loadConstants.loadSuccessJson);
    const filePath = 'c.json';
    fs.unlink(filePath, (err) => {
      if (err) {
        return;
      }
    });
  });

  it('Boilerplate json file should not be loaded when file is deleted and return the error message', () => {
    const res = execCmd<SfProvarCommandResult>(`${loadConstants.sfProvarConfigLoadCommand} -p c.json`).shellOutput;
    expect(res.stderr).to.deep.equal(loadConstants.invalidPathError);
  });

  it('Boilerplate json file should not be loaded when json file is malformed', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p provardx-properties.json`);
    const jsonFilePath = 'provardx-properties.json';
    fs.readFileSync(jsonFilePath, 'utf-8');
    const newData = '';
    fs.writeFile(jsonFilePath, newData, (error) => {
      if (error) {
        return;
      }
    });
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} -p provardx-properties.json`
    ).shellOutput;
    expect(res.stderr).to.deep.equal(validateConstants.malformedFileError);
  });

  it('Boilerplate json file should not be loaded when json file malformed and return the result in json format', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} --properties-file sample.json`);
    const jsonFilePath = 'sample.json';
    const data = fs.readFileSync(jsonFilePath, 'utf-8');
    const newData = data.substring(1);
    fs.writeFile(jsonFilePath, newData, (error) => {
      if (error) {
        return;
      }
    });
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} --properties-file sample.json --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(validateConstants.malformedFileJsonError);
  });
});
