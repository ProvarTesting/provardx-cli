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
    const filePaths = [
      'loadSuccess.json',
      'loadinvalidFile.json',
      'basicFile.json',
      'advanceFile.json',
      'loadMalformedFile.json',
      'loadMalformedNew.json',
      'loadErrorProperty',
    ];
    filePaths.forEach((filePath) => {
      fs.unlink(filePath, (err) => {
        if (err) {
          return err;
        }
      });
    });
  });

  it('Boilerplate json file should be loaded successfully and return a success message', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p loadSuccess.json`);
    const res = execCmd<SfProvarCommandResult>(`${loadConstants.sfProvarConfigLoadCommand} -p loadSuccess.json`, {
      ensureExitCode: 0,
    }).shellOutput;
    expect(res.stdout).to.deep.equal(loadConstants.loadSuccessMessage);
  });

  it('Boilerplate json file should be loaded successfully and return a success message in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} -p loadSuccess.json --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(loadConstants.loadSuccessJson);
  });

  it('Boilerplate json file should not be loaded when file path is invalid', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} -p loadinvalidFile.json`
    ).shellOutput;
    expect(res.stderr).to.deep.equal(loadConstants.invalidPathError);
  });

  it('Boilerplate json file should not be loaded when file path is invalid and return error message in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} -p loadinvalidFile.json --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(loadConstants.invalidPathJsonError);
  });

  it('Boilerplate json file should be loaded sucessfully when file is overwritten', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p basicFile.json`);
    execCmd<SfProvarCommandResult>(`${loadConstants.sfProvarConfigLoadCommand} -p basicFile.json`);
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p advanceFile.json`);
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} -p advanceFile.json`
    ).shellOutput;
    expect(res.stdout).to.deep.equal(loadConstants.loadSuccessMessage);
  });

  it('Boilerplate json file should be loaded sucessfully when file is overwritten and return the result in json format', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} --properties-file overwrite-advanceFile.json`);
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} --properties-file overwrite-advanceFile.json --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(loadConstants.loadSuccessJson);
    const filePath = 'overwrite-advanceFile.json';
    fs.unlink(filePath, (err) => {
      if (err) {
        return;
      }
    });
  });

  it('Boilerplate json file should not be loaded when file is deleted and return the error message', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} -p overwrite-advanceFile.json`
    ).shellOutput;
    expect(res.stderr).to.deep.equal(loadConstants.invalidPathError);
  });

  it('Boilerplate json file should not be loaded when json file is malformed', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p loadMalformedFile.json`);
    const jsonFilePath = 'loadMalformedFile.json';
    fs.readFileSync(jsonFilePath, 'utf-8');
    const newData = '';
    fs.writeFile(jsonFilePath, newData, (error) => {
      if (error) {
        return;
      }
    });
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} -p loadMalformedFile.json`
    ).shellOutput;
    expect(res.stderr).to.deep.equal(validateConstants.malformedFileError);
  });

  it('Boilerplate json file should not be loaded when json file malformed and return the error in json format', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} --properties-file loadMalformedNew.json`);
    const jsonFilePath = 'loadMalformedNew.json';
    const data = fs.readFileSync(jsonFilePath, 'utf-8');
    const newData = data.substring(1);
    fs.writeFile(jsonFilePath, newData, (error) => {
      if (error) {
        return;
      }
    });
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} --properties-file loadMalformedNew.json --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(validateConstants.malformedFileJsonError);
  });

  it('Boilerplate json file should not be loaded as required property is missing in json file and return the error', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p ./loadErrorProperty.json`);
    interface MyJsonData {
      [key: string]: string | boolean;
    }
    function removeProperties(jsonObject: MyJsonData, propertiesToRemove: string[]): void {
      propertiesToRemove.forEach((property) => {
        delete jsonObject[property];
      });
    }
    const jsonFilePath = './loadErrorProperty.json';
    const jsonData = fs.readFileSync(jsonFilePath, 'utf-8');
    const originalJsonData: MyJsonData = JSON.parse(jsonData) as MyJsonData;
    const propertiesToRemove: string[] = ['provarHome'];
    removeProperties(originalJsonData, propertiesToRemove);
    const updatedJsonData = JSON.stringify(originalJsonData, null, 2);
    fs.writeFileSync(jsonFilePath, updatedJsonData, 'utf-8');
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} -p ./loadErrorProperty.json`
    ).shellOutput;
    expect(res.stderr).to.deep.equal(validateConstants.missingPropertyError);
  });

  it('Boilerplate json file should not be loaded as multiple required properties are missing in file and return the error in json format', () => {
    interface MyJsonData {
      [key: string]: string | boolean | MyJsonData;
    }
    const jsonFilePath = 'loadErrorProperty.json';
    const jsonData = fs.readFileSync(jsonFilePath, 'utf-8');
    const originalJsonData: MyJsonData = JSON.parse(jsonData) as MyJsonData;
    function removeProperties(jsonObject: MyJsonData, propertiesToRemove: string[]): void {
      propertiesToRemove.forEach((property) => {
        const nestedProperties = property.split('.');
        deleteNestedProperty(jsonObject, nestedProperties);
      });
    }
    function deleteNestedProperty(obj: MyJsonData, path: string[]): void {
      const property = path.shift();
      if (property !== undefined && Object.prototype.hasOwnProperty.call(obj, property)) {
        if (path.length === 0) {
          delete obj[property];
        } else if (typeof obj[property] === 'object') {
          deleteNestedProperty(obj[property] as MyJsonData, path);
        }
      }
    }
    const propertiesToRemove: string[] = [
      'projectPath',
      'resultsPath',
      'metadata.metadataLevel',
      'metadata.cachePath',
      'environment.webBrowser',
      'environment.webBrowserConfig',
      'environment.webBrowserProviderName',
      'environment.webBrowserDeviceName',
    ];
    removeProperties(originalJsonData, propertiesToRemove);
    const updatedJsonData = JSON.stringify(originalJsonData, null, 2);
    fs.writeFileSync(jsonFilePath, updatedJsonData, 'utf-8');
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} -p loadErrorProperty.json --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(validateConstants.missingPropertiesJsonError);
  });
});
