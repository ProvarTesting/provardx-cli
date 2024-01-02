import * as fs from 'fs';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { SfProvarCommandResult } from '../../../../../src/Utility/sfProvarCommandResult';
import { sfProvarConfigGenerateCommand } from '../../../../assertion/generateConstants';
import * as validateConstants from '../../../../assertion/validateConstants';

describe('sf provar config validate NUTs', () => {
  let session: TestSession;

  after(async () => {
    await session?.clean();
  });

  it('Boilerplate json file should be validated successfully with all required & optional attributes', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p validateFile.json`);
    process.env.PROVARDX_PROPERTIES_FILE_PATH = './validateFile.json';
    const res = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`, {
      ensureExitCode: 0,
    }).shellOutput;
    expect(res.stdout).to.deep.equal(validateConstants.validateSuccessMessage);
  });

  it('Boilerplate json file should be validated successfully with all required & optional attributes and return result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand} --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(validateConstants.validateSuccessJson);
  });

  it('Boilerplate json file should be validated successfully with all the required attributes and their types', () => {
    describe('JSON file contains all required attribute', () => {
      interface MyJsonData {
        [key: string]: string | number | boolean;
      }
      const jsonData = JSON.parse(fs.readFileSync('./validateFile.json', 'utf8')) as MyJsonData;
      const requiredAttributes: string[] = ['provarHome', 'projectPath', 'resultsPath'];
      const metadataNestedAttributes: string[] = ['metadataLevel', 'cachePath'];
      const environmentNestedAttributes: string[] = [
        'webBrowser',
        'webBrowserConfig',
        'webBrowserProviderName',
        'webBrowserDeviceName',
      ];
      checkRequiredAttributes(jsonData, requiredAttributes);
      checkMetadataNestedAttributes(jsonData.metadata, metadataNestedAttributes);
      checkEnvironmentNestedAttributes(jsonData.environment, environmentNestedAttributes);
    });

    function checkRequiredAttributes(data: unknown, requiredAttributes: string[]): void {
      requiredAttributes.forEach((attribute) => {
        it(`should have the required attribute '${attribute}'`, () => {
          expect(data).to.have.property(attribute).that.is.a('string');
        });
      });
    }

    function checkMetadataNestedAttributes(data: unknown, metadataNestedAttributes: string[]): void {
      metadataNestedAttributes.forEach((attribute) => {
        it(`should have the required attribute '${attribute}'`, () => {
          expect(data).to.have.property(attribute).that.is.a('string');
        });
      });
    }

    function checkEnvironmentNestedAttributes(data: unknown, environmentNestedAttributes: string[]): void {
      environmentNestedAttributes.forEach((attribute) => {
        it(`should have the required attribute '${attribute}'`, () => {
          expect(data).to.have.property(attribute).that.is.a('string');
        });
      });
    }
  });

  it('Boilerplate json file should not be validated if the file has not been loaded', () => {
    delete process.env.PROVARDX_PROPERTIES_FILE_PATH;
    const res = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`).shellOutput;
    expect(res.stderr).to.deep.equal(validateConstants.missingFileError);
  });

  it('Boilerplate json file should not be validated if the file has not been loaded and return result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand} --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(validateConstants.missingFileJsonError);
  });

  it('Boilerplate json file should not be validated as it is invalid json file', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p malformedFile.json`);
    const jsonFilePath = './malformedFile.json';
    const data = fs.readFileSync(jsonFilePath, 'utf-8');
    const newData = data.substring(1);
    fs.writeFile(jsonFilePath, newData, (error) => {
      if (error) {
        return;
      }
    });
    process.env.PROVARDX_PROPERTIES_FILE_PATH = './malformedFile.json';
    // validating json file
    const res = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`).shellOutput;
    expect(res.stderr).to.deep.equal(validateConstants.malformedFileError);
  });

  it('Boilerplate json file should not be validated as it is invalid json file and return result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand} --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(validateConstants.malformedFileJsonError);
  });

  it('Boilerplate json file should not be validated as one required property is missing in json file', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p propertyError.json`);
    interface MyJsonData {
      [key: string]: string | boolean;
    }
    function removeProperties(jsonObject: MyJsonData, propertiesToRemove: string[]): void {
      propertiesToRemove.forEach((property) => {
        delete jsonObject[property];
      });
    }
    const jsonFilePath = './propertyError.json';
    const jsonData = fs.readFileSync(jsonFilePath, 'utf-8');
    const originalJsonData: MyJsonData = JSON.parse(jsonData) as MyJsonData;
    const propertiesToRemove: string[] = ['provarHome'];
    removeProperties(originalJsonData, propertiesToRemove);
    const updatedJsonData = JSON.stringify(originalJsonData, null, 2);
    fs.writeFileSync(jsonFilePath, updatedJsonData, 'utf-8');
    expect(originalJsonData).to.not.have.all.keys(propertiesToRemove);
    // loading the file in the environment
    process.env.PROVARDX_PROPERTIES_FILE_PATH = './propertyError.json';
    // validatig the file
    const res = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`).shellOutput;
    expect(res.stderr).to.deep.equal(validateConstants.missingPropertyError);
  });

  it('Boilerplate json file should not be validated as one required property is missing in json file and return the result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand} --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(validateConstants.missingPropertyJsonError);
  });

  it('Boilerplate json file should not be validated as multiple required properties are missing in the file', () => {
    interface MyJsonData {
      [key: string]: string | boolean | MyJsonData;
    }
    const jsonFilePath = './propertyError.json';
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
    const res = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`).shellOutput;
    expect(res.stderr).to.deep.equal(validateConstants.missingPropertiesError);
  });

  it('Boilerplate json file should not be validated as multiple required properties are missing in file and return the result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand} --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(validateConstants.missingPropertiesJsonError);
  });

  it('Boilerplate json file should not be validated as invalid property value', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p ./valueError.json`);
    interface MyJsonData {
      [key: string]: string | boolean | MyJsonData;
    }
    const jsonFilePath = './valueError.json';
    const jsonDataString = fs.readFileSync(jsonFilePath, 'utf-8');
    const jsonData: MyJsonData = JSON.parse(jsonDataString) as MyJsonData;
    jsonData.resultsPathDisposition = 'Decrement';
    const updatedJsonDataString = JSON.stringify(jsonData, null, 2);
    fs.writeFileSync(jsonFilePath, updatedJsonDataString, 'utf-8');
    process.env.PROVARDX_PROPERTIES_FILE_PATH = './valueError.json';
    // validating json file
    const res = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`).shellOutput;
    expect(res.stderr).to.deep.equal(validateConstants.invalidValueError);
  });

  it('Boilerplate json file should not be validated as invalid property value and return the result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand} --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(validateConstants.invalidValueJsonError);
  });

  it('updating value of properties pluginOutputlevel,testOutputLevel,stopOnError,lightningMode in json file', () => {
    interface MyJsonData {
      [key: string]: string | boolean | MyJsonData;
    }
    const jsonFilePath = './valueError.json';
    const jsonDataString = fs.readFileSync(jsonFilePath, 'utf-8');
    const jsonData: MyJsonData = JSON.parse(jsonDataString) as MyJsonData;
    jsonData.pluginOutputlevel = 'Error';
    jsonData.testOutputLevel = 'BASICC';
    jsonData.stopOnError = '2';
    jsonData.lightningMode = '3';
    const updatedJsonDataString = JSON.stringify(jsonData, null, 2);
    fs.writeFileSync(jsonFilePath, updatedJsonDataString, 'utf-8');
  });

  it('Boilerplate json file should not be validated as invalid value exists for multiple properties', () => {
    interface Environment {
      webBrowser?: string;
      metadataLevel?: string;
    }
    interface MyJsonData {
      environment?: Environment;
      metadata?: Environment;
    }
    const jsonFilePath = './valueError.json';
    const jsonDataString = fs.readFileSync(jsonFilePath, 'utf-8');
    const jsonData: MyJsonData = JSON.parse(jsonDataString) as MyJsonData;

    if (jsonData.environment) {
      jsonData.environment = jsonData.environment || {};
      jsonData.environment.webBrowser = 'Opera';
    }

    if (jsonData.metadata) {
      jsonData.metadata = jsonData.metadata || {};
      jsonData.metadata.metadataLevel = 'Reusee';
    }
    const updatedJsonDataString = JSON.stringify(jsonData, null, 2);
    fs.writeFileSync(jsonFilePath, updatedJsonDataString, 'utf-8');
    // validating json file
    const res = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`).shellOutput;
    expect(res.stderr).to.deep.equal(validateConstants.invalidValuesError);
  });

  it('Boilerplate json file should not be validated as invalid value exists for multiple properties and return the result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand} --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(validateConstants.invalidValuesJsonError);
  });

  it('Boilerplate json file should not be validated as multiple error exists', () => {
    interface MyJsonData {
      [key: string]: string | boolean;
    }
    function removeProperties(jsonObject: MyJsonData, propertiesToRemove: string[]): void {
      propertiesToRemove.forEach((property) => {
        delete jsonObject[property];
      });
    }
    const jsonFilePath = './valueError.json';
    const jsonData = fs.readFileSync(jsonFilePath, 'utf-8');
    const originalJsonData: MyJsonData = JSON.parse(jsonData) as MyJsonData;
    const propertiesToRemove: string[] = ['provarHome'];
    removeProperties(originalJsonData, propertiesToRemove);
    const updatedJsonData = JSON.stringify(originalJsonData, null, 2);
    fs.writeFileSync(jsonFilePath, updatedJsonData, 'utf-8');
    // validating json file
    const res = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`).shellOutput;
    expect(res.stderr).to.deep.equal(validateConstants.multipleErrors);
  });

  it('Boilerplate json file should not be validated as multiple error exists and return the result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand} --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(validateConstants.multipleJsonErrors);
  });

  describe('Validate properties which having a valid range of options in json file', () => {
    it('Boilerplate json file should be validated successfully for the property resultsPathDisposition', () => {
      interface MyJsonData {
        [key: string]: string | boolean | MyJsonData;
      }
      execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p ./propertyRange.json`);
      process.env.PROVARDX_PROPERTIES_FILE_PATH = './propertyRange.json';
      const jsonFilePath = './propertyRange.json';
      const jsonDataString = fs.readFileSync(jsonFilePath, 'utf-8');
      const jsonData: MyJsonData = JSON.parse(jsonDataString) as MyJsonData;
      const resultsPathDisposition = ['Increment', 'Replace', 'Fail'];
      resultsPathDisposition.forEach((resultsPath) => {
        jsonData.resultsPathDisposition = resultsPath;
        const updatedJsonData = JSON.stringify(jsonData, null, 2);
        fs.writeFileSync(jsonFilePath, updatedJsonData, 'utf-8');
        // validating the file
        const res = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`).shellOutput;
        expect(res.stdout).to.deep.equal(validateConstants.validateSuccessMessage);
      });
    });

    it('Boilerplate json file should be validated successfully for the property testOutputLevel', () => {
      interface MyJsonData {
        [key: string]: string | boolean | MyJsonData;
      }
      const jsonFilePath = './propertyRange.json';
      const jsonDataString = fs.readFileSync(jsonFilePath, 'utf-8');
      const jsonData: MyJsonData = JSON.parse(jsonDataString) as MyJsonData;
      const testOutputLevel = ['BASIC', 'DETAILED', 'DIAGNOSTIC'];
      testOutputLevel.forEach((testOutput) => {
        jsonData.testOutputLevel = testOutput;
        const updatedJsonData = JSON.stringify(jsonData, null, 2);
        fs.writeFileSync(jsonFilePath, updatedJsonData, 'utf-8');
        // validating the file
        const res = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`).shellOutput;
        expect(res.stdout).to.deep.equal(validateConstants.validateSuccessMessage);
      });
    });

    it('Boilerplate json file should be validated successfully for the property pluginOutputlevel', () => {
      interface MyJsonData {
        [key: string]: string | boolean | MyJsonData;
      }
      const jsonFilePath = './propertyRange.json';
      const jsonDataString = fs.readFileSync(jsonFilePath, 'utf-8');
      const jsonData: MyJsonData = JSON.parse(jsonDataString) as MyJsonData;
      const pluginOutputlevel = ['SEVERE', 'WARNING', 'INFO', 'FINE', 'FINER', 'FINEST'];
      pluginOutputlevel.forEach((pluginOutput) => {
        jsonData.pluginOutputlevel = pluginOutput;
        const updatedJsonData = JSON.stringify(jsonData, null, 2);
        fs.writeFileSync(jsonFilePath, updatedJsonData, 'utf-8');
        // validating the file
        const res = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`).shellOutput;
        expect(res.stdout).to.deep.equal(validateConstants.validateSuccessMessage);
      });
    });

    it('Boilerplate json file should be validated successfully for the property metadataLevel', () => {
      interface MyJsonData {
        metadata: {
          metadataLevel: string;
        };
      }
      const jsonFilePath = './propertyRange.json';
      const jsonDataString = fs.readFileSync(jsonFilePath, 'utf-8');
      const jsonData: MyJsonData = JSON.parse(jsonDataString) as MyJsonData;
      const metadataLevel = ['Reuse', 'Reload', 'Refresh'];
      metadataLevel.forEach((metadata) => {
        jsonData.metadata.metadataLevel = metadata;
        const updatedJsonData = JSON.stringify(jsonData, null, 2);
        fs.writeFileSync(jsonFilePath, updatedJsonData, 'utf-8');
        // validating the file
        const res = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`).shellOutput;
        expect(res.stdout).to.deep.equal(validateConstants.validateSuccessMessage);
      });
    });

    it('Boilerplate json file should be validated successfully for the property webBrowser', () => {
      interface MyJsonData {
        environment: {
          webBrowser: string;
        };
      }
      const jsonFilePath = './propertyRange.json';
      const jsonDataString = fs.readFileSync(jsonFilePath, 'utf-8');
      const jsonData: MyJsonData = JSON.parse(jsonDataString) as MyJsonData;
      const webBrowser = ['Chrome', 'Safari', 'Edge', 'Edge_Legacy', 'Firefox', 'IE', 'Chrome_Headless'];
      webBrowser.forEach((browser) => {
        jsonData.environment.webBrowser = browser;
        const updatedJsonData = JSON.stringify(jsonData, null, 2);
        fs.writeFileSync(jsonFilePath, updatedJsonData, 'utf-8');
        // validating the file
        const res = execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`).shellOutput;
        expect(res.stdout).to.deep.equal(validateConstants.validateSuccessMessage);
      });
    });
  });
});
