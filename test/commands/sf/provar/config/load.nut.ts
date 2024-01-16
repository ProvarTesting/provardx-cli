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
      'loadValidateSuccess.json',
      'loadinvalidFile.json',
      'basicFile.json',
      'advanceFile.json',
      'loadMalformedFile.json',
      'loadMalformedNew.json',
      'loadErrorProperty.json',
      'loadSuccessNew.json',
      'loadInvalidPropertyValue.json',
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

  it('Boilerplate json file should be loaded and validated successfully and return the success message', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p loadValidateSuccess.json`);
    // load the file
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} -p loadValidateSuccess.json`,
      {
        ensureExitCode: 0,
      }
    ).shellOutput;
    expect(res.stdout).to.deep.equal(loadConstants.loadSuccessMessage);
    // validate the file
    const result = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`, {
      ensureExitCode: 0,
    }).shellOutput;
    expect(result.stdout).to.deep.equal(validateConstants.validateSuccessMessage);
  });

  it('Boilerplate json file should be loaded and validated successfully and return the result in json format', () => {
    // load the file
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} -p loadValidateSuccess.json --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(loadConstants.loadSuccessJson);
    // validate the file
    const result = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand} --json`, {
      ensureExitCode: 0,
    });
    expect(result.jsonOutput).to.deep.equal(validateConstants.validateSuccessJson);
  });

  it('Boilerplate json file should not be loaded when file path is invalid', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p ./loadinvalidFile.json`);
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} -p test/loadinvalidFile.json`
    ).shellOutput;
    expect(res.stderr).to.deep.equal(loadConstants.invalidPathError);
  });

  it('Boilerplate json file should not be loaded when file path is invalid and return error message in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} -p test/loadinvalidFile.json --json`,
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

  it('Boilerplate json file should not be loaded when json file is malformed and return the error message', () => {
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
    // validating the file
    const result = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`).shellOutput;
    expect(result.stderr).to.deep.equal(validateConstants.malformedFileError);
  });

  it('Boilerplate json file should not be loaded when json file is malformed and return the error message in json format', () => {
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
    // validating the file
    const result = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand} --json`, {
      ensureExitCode: 0,
    });
    expect(result.jsonOutput).to.deep.equal(validateConstants.malformedFileJsonError);
  });

  it('Existing boilerplate json file which contains valid data should be loaded again and return a success message', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} --properties-file loadSuccess.json`,
      {
        ensureExitCode: 0,
      }
    ).shellOutput;
    expect(res.stdout).to.deep.equal(loadConstants.loadSuccessMessage);
  });

  it('Boilerplate json file should not be loaded as required property is missing in json file and return the error message', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p ./loadErrorProperty.json`);
    interface PropertyFileJsonData {
      [key: string]: string | boolean;
    }
    function removeProperties(jsonObject: PropertyFileJsonData, propertiesToRemove: string[]): void {
      propertiesToRemove.forEach((property) => {
        delete jsonObject[property];
      });
    }
    const jsonFilePath = './loadErrorProperty.json';
    const jsonData = fs.readFileSync(jsonFilePath, 'utf-8');
    const originalJsonData: PropertyFileJsonData = JSON.parse(jsonData) as PropertyFileJsonData;
    const propertiesToRemove: string[] = ['provarHome'];
    removeProperties(originalJsonData, propertiesToRemove);
    const updatedJsonData = JSON.stringify(originalJsonData, null, 2);
    fs.writeFileSync(jsonFilePath, updatedJsonData, 'utf-8');
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} -p ./loadErrorProperty.json`
    ).shellOutput;
    expect(res.stderr).to.deep.equal(validateConstants.missingPropertyError);
    // validating the file
    const result = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`).shellOutput;
    expect(result.stderr).to.deep.equal(validateConstants.missingPropertyError);
  });

  it('Boilerplate json file should not be loaded as multiple required properties are missing in file and return the error message in json format', () => {
    interface PropertyFileJsonData {
      [key: string]: string | boolean | PropertyFileJsonData;
    }
    const jsonFilePath = 'loadErrorProperty.json';
    const jsonData = fs.readFileSync(jsonFilePath, 'utf-8');
    const originalJsonData: PropertyFileJsonData = JSON.parse(jsonData) as PropertyFileJsonData;
    function removeProperties(jsonObject: PropertyFileJsonData, propertiesToRemove: string[]): void {
      propertiesToRemove.forEach((property) => {
        const nestedProperties = property.split('.');
        deleteNestedProperty(jsonObject, nestedProperties);
      });
    }
    function deleteNestedProperty(obj: PropertyFileJsonData, path: string[]): void {
      const property = path.shift();
      if (property !== undefined && Object.prototype.hasOwnProperty.call(obj, property)) {
        if (path.length === 0) {
          delete obj[property];
        } else if (typeof obj[property] === 'object') {
          deleteNestedProperty(obj[property] as PropertyFileJsonData, path);
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
    // validating the file
    const result = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand} --json`, {
      ensureExitCode: 0,
    });
    expect(result.jsonOutput).to.deep.equal(validateConstants.missingPropertiesJsonError);
  });

  it('Boilerplate json file which contains valid data should be loaded successfully and return a success message in json format', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p ./loadSuccessNew.json`);
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} --properties-file ./loadSuccessNew.json --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(loadConstants.loadSuccessJson);
  });

  it('Boilerplate json file should not be loaded as invalid value exists for one property and return the error message', () => {
    interface PropertyFileJsonData {
      [key: string]: string | boolean | number | PropertyFileJsonData;
    }
    const incorrectResultsPathDisposition = 'Increement';
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p loadInvalidPropertyValue.json`);
    const jsonFilePath = 'loadInvalidPropertyValue.json';
    // reading the json data
    const jsonDataString = fs.readFileSync(jsonFilePath, 'utf-8');
    const jsonData: PropertyFileJsonData = JSON.parse(jsonDataString) as PropertyFileJsonData;
    // passing invalid value to resultsPathDisposition property in json
    jsonData.resultsPathDisposition = incorrectResultsPathDisposition;
    const updatedJsonDataString = JSON.stringify(jsonData, null, 2);
    fs.writeFileSync(jsonFilePath, updatedJsonDataString, 'utf-8');
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} -p loadInvalidPropertyValue.json`
    ).shellOutput;
    expect(res.stderr).to.deep.equal(validateConstants.invalidValueError);
    // validating the file
    const result = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`).shellOutput;
    expect(result.stderr).to.deep.equal(validateConstants.invalidValueError);
  });

  it('updating values for multiple properties', () => {
    interface PropertyFileJsonData {
      [key: string]: string | boolean | PropertyFileJsonData;
    }
    const incorrectPluginOutputlevel = 'WARNIING';
    const incorrectTestOutputLevel = 'DETAILL';
    const incorrectStopOnError = '0';
    const incorrectLightningMode = '1';
    // reading the json data
    const jsonFilePath = 'loadInvalidPropertyValue.json';
    const jsonDataString = fs.readFileSync(jsonFilePath, 'utf-8');
    const jsonData: PropertyFileJsonData = JSON.parse(jsonDataString) as PropertyFileJsonData;
    // passing invalid values to multiple properties in json
    jsonData.pluginOutputlevel = incorrectPluginOutputlevel;
    jsonData.testOutputLevel = incorrectTestOutputLevel;
    jsonData.stopOnError = incorrectStopOnError;
    jsonData.lightningMode = incorrectLightningMode;
    const updatedJsonDataString = JSON.stringify(jsonData, null, 2);
    fs.writeFileSync(jsonFilePath, updatedJsonDataString, 'utf-8');
  });

  it('Boilerplate json file should not be loaded as invalid value exists for multiple properties and return the error message in json format', () => {
    interface PropertyFileJsonData {
      metadata: {
        metadataLevel: string;
      };
      environment: {
        webBrowser: string;
      };
    }
    const incorrectMetadataLevel = 'reloaad';
    const incorrectWebBrowser = 'FF';
    const jsonFilePath = 'loadInvalidPropertyValue.json';
    const jsonDataString = fs.readFileSync(jsonFilePath, 'utf-8');
    const jsonData: PropertyFileJsonData = JSON.parse(jsonDataString) as PropertyFileJsonData;
    jsonData.metadata.metadataLevel = incorrectMetadataLevel;
    jsonData.environment.webBrowser = incorrectWebBrowser;
    const updatedJsonDataString = JSON.stringify(jsonData, null, 2);
    fs.writeFileSync(jsonFilePath, updatedJsonDataString, 'utf-8');
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} -p loadInvalidPropertyValue.json --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(validateConstants.invalidValuesJsonError);
  });

  it('Boilerplate json file should not be loaded as multiple error exists and return the error message', () => {
    interface PropertyFileJsonData {
      [key: string]: string | boolean;
    }
    function removeProperties(jsonObject: PropertyFileJsonData, propertiesToRemove: string[]): void {
      propertiesToRemove.forEach((property) => {
        delete jsonObject[property];
      });
    }
    const jsonFilePath = 'loadInvalidPropertyValue.json';
    const jsonData = fs.readFileSync(jsonFilePath, 'utf-8');
    const originalJsonData: PropertyFileJsonData = JSON.parse(jsonData) as PropertyFileJsonData;
    const propertiesToRemove: string[] = ['projectPath'];
    removeProperties(originalJsonData, propertiesToRemove);
    const updatedJsonData = JSON.stringify(originalJsonData, null, 2);
    fs.writeFileSync(jsonFilePath, updatedJsonData, 'utf-8');
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} -p loadInvalidPropertyValue.json`
    ).shellOutput;
    expect(res.stderr).to.deep.equal(loadConstants.multipleErrors);
  });

  it('Boilerplate json file should not be loaded as multiple error exists and return the error message in json format', () => {
    const res = execCmd<SfProvarCommandResult>(
      `${loadConstants.sfProvarConfigLoadCommand} -p loadInvalidPropertyValue.json --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(loadConstants.multipleJsonErrors);
  });

  it('Existing boilerplate json file which contains valid data should be loaded again and return a success message', () => {
    const res = execCmd<SfProvarCommandResult>(`${loadConstants.sfProvarConfigLoadCommand} -p loadSuccess.json`, {
      ensureExitCode: 0,
    }).shellOutput;
    expect(res.stdout).to.deep.equal(loadConstants.loadSuccessMessage);
    // validate the file
    const result = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`, {
      ensureExitCode: 0,
    }).shellOutput;
    expect(result.stdout).to.deep.equal(validateConstants.validateSuccessMessage);
  });
});
