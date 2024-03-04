/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fileSystem from 'node:fs';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { SfProvarCommandResult } from '../../../../src/Utility/sfProvarCommandResult.js';
import * as validateConstants from '../../../assertion/validateConstants.js';
import * as loadConstants from '../../../assertion/loadConstants.js';
import { errorMessages } from '../../../../src/constants/errorMessages.js';
import { commandConstants } from '../../../../src/constants/commandConstants.js';

describe('sf provar config validate NUTs', () => {
  let session: TestSession;

  after(async () => {
    await session?.clean();
    const filePaths = [
      'malformedFile.json',
      'MissingFile.json',
      'propertyError.json',
      'propertyRange.json',
      'validateFile.json',
      'valueError.json',
      'loadEmptyValues.json'
    ];
    filePaths.forEach((filePath) => {
      fileSystem.unlink(filePath, (err) => {
        if (err) {
          return err;
        }
      });
    });
  });

  it('Boilerplate json file should not be validated if the file has not been loaded', () => {
    execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} -p MissingFile.json`);
    const res = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND}`).shellOutput;
    expect(res.stderr).to.deep.equal(`Error (1): [MISSING_FILE] ${errorMessages.MISSINGFILEERROR}\n\n`);
  });

  it('Boilerplate json file should not be validated if the file has not been loaded and return result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND} --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(validateConstants.missingFileJsonError);
  });

  it('Boilerplate json file should be validated successfully with all required & optional attributes', () => {
    execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} -p validateFile.json`);
    execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_LOAD_COMMAND} -p validateFile.json`);
    const res = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND}`, {
      ensureExitCode: 0,
    }).shellOutput;
    expect(res.stdout).to.deep.equal(validateConstants.validateSuccessMessage);
  });

  it('Boilerplate json file should be validated successfully with all required & optional attributes and return result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND} --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(validateConstants.validateSuccessJson);
  });

  it('Boilerplate json file should be validated successfully with all the required attributes and their types', () => {
    describe('JSON file contains all required attribute', () => {
      interface PropertyFileJsonData {
        [key: string]: string | number | boolean;
      }
      const jsonData = JSON.parse(fileSystem.readFileSync('./validateFile.json', 'utf8')) as PropertyFileJsonData;
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

  it('Boilerplate json file should not be validated as json file is malformed', () => {
    execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} -p malformedFile.json`);
    execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_LOAD_COMMAND} -p malformedFile.json`);
    const jsonFilePath = './malformedFile.json';
    const data = fileSystem.readFileSync(jsonFilePath, 'utf-8');
    const newData = data.substring(1);
    fileSystem.writeFile(jsonFilePath, newData, (error) => {
      if (error) {
        return;
      }
    });
    // validating json file
    const res = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND}`).shellOutput;
    expect(res.stderr).to.deep.equal(`Error (1): [MALFORMED_FILE] ${errorMessages.MALFORMEDFILEERROR}\n\n`);
  });

  it('Boilerplate json file should not be validated as json file is malformed and return result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND} --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(validateConstants.malformedFileJsonError);
  });

  it('Boilerplate json file should not be validated as one required property is missing in json file', () => {
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} --properties-file propertyError.json`
    );
    // loading json file
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_LOAD_COMMAND} --properties-file ./propertyError.json`
    );
    interface PropertyFileJsonData {
      [key: string]: string | boolean;
    }
    function removeProperties(jsonObject: PropertyFileJsonData, propertiesToRemove: string[]): void {
      propertiesToRemove.forEach((property) => {
        delete jsonObject[property];
      });
    }
    const jsonFilePath = './propertyError.json';
    const jsonData = fileSystem.readFileSync(jsonFilePath, 'utf-8');
    const originalJsonData: PropertyFileJsonData = JSON.parse(jsonData) as PropertyFileJsonData;
    const propertiesToRemove: string[] = ['provarHome'];
    removeProperties(originalJsonData, propertiesToRemove);
    const updatedJsonData = JSON.stringify(originalJsonData, null, 2);
    fileSystem.writeFileSync(jsonFilePath, updatedJsonData, 'utf-8');
    expect(originalJsonData).to.not.have.all.keys(propertiesToRemove);
    // validating json file
    const res = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND}`).shellOutput;
    expect(res.stderr).to.deep.equal(`${validateConstants.missingPropertyError}`);
  });

  it('Boilerplate json file should not be validated as one required property is missing in json file and return the result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND} --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(validateConstants.missingPropertyJsonError);
  });

  it('Boilerplate json file should not be validated as multiple required properties are missing in the file', () => {
    interface PropertyFileJsonData {
      [key: string]: string | boolean | PropertyFileJsonData;
    }
    const jsonFilePath = './propertyError.json';
    const jsonData = fileSystem.readFileSync(jsonFilePath, 'utf-8');
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
    fileSystem.writeFileSync(jsonFilePath, updatedJsonData, 'utf-8');
    // validating json file
    const res = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND}`).shellOutput;
    expect(res.stderr).to.deep.equal(`${validateConstants.missingPropertiesError}`);
  });

  it('Boilerplate json file should not be validated as multiple required properties are missing in file and return the result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND} --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(validateConstants.missingPropertiesJsonError);
  });

  it('Boilerplate json file should not be validated as invalid property value', () => {
    execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} -p ./valueError.json`);
    // loading the json file
    execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_LOAD_COMMAND} -p ./valueError.json`);
    interface PropertyFileJsonData {
      [key: string]: string | boolean | PropertyFileJsonData;
    }
    const incorrectResultsPathDisposition = 'Decrement';
    const jsonFilePath = './valueError.json';
    const jsonDataString = fileSystem.readFileSync(jsonFilePath, 'utf-8');
    const jsonData: PropertyFileJsonData = JSON.parse(jsonDataString) as PropertyFileJsonData;
    jsonData.resultsPathDisposition = incorrectResultsPathDisposition;
    const updatedJsonDataString = JSON.stringify(jsonData, null, 2);
    fileSystem.writeFileSync(jsonFilePath, updatedJsonDataString, 'utf-8');
    // validating json file
    const res = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND}`).shellOutput;
    expect(res.stderr).to.deep.equal(`${validateConstants.invalidValueError}`);
  });

  it('Boilerplate json file should not be validated as invalid property value and return the result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND} --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(validateConstants.invalidValueJsonError);
  });

  it('updating value of properties pluginOutputlevel,testOutputLevel,stopOnError,lightningMode in json file', () => {
    interface PropertyFileJsonData {
      [key: string]: string | boolean | PropertyFileJsonData;
    }
    const incorrectPluginOutputlevel = 'Error';
    const incorrectTestOutputLevel = 'BASICC';
    const incorrectStopOnError = '2';
    const incorrectLightningMode = '1';
    const jsonFilePath = './valueError.json';
    const jsonDataString = fileSystem.readFileSync(jsonFilePath, 'utf-8');
    const jsonData: PropertyFileJsonData = JSON.parse(jsonDataString) as PropertyFileJsonData;
    jsonData.pluginOutputlevel = incorrectPluginOutputlevel;
    jsonData.testOutputLevel = incorrectTestOutputLevel;
    jsonData.stopOnError = incorrectStopOnError;
    jsonData.lightningMode = incorrectLightningMode;
    const updatedJsonDataString = JSON.stringify(jsonData, null, 2);
    fileSystem.writeFileSync(jsonFilePath, updatedJsonDataString, 'utf-8');
  });

  it('Boilerplate json file should not be validated as invalid value exists for multiple properties', () => {
    interface Environment {
      webBrowser?: string;
      metadataLevel?: string;
    }
    interface PropertyFileJsonData {
      environment?: Environment;
      metadata?: Environment;
    }
    const incorrectWebBrowser = 'Opera';
    const incorrectMetadataLevel = 'Reusee';
    const jsonFilePath = './valueError.json';
    const jsonDataString = fileSystem.readFileSync(jsonFilePath, 'utf-8');
    const jsonData: PropertyFileJsonData = JSON.parse(jsonDataString) as PropertyFileJsonData;

    if (jsonData.environment) {
      jsonData.environment = jsonData.environment || {};
      jsonData.environment.webBrowser = incorrectWebBrowser;
    }

    if (jsonData.metadata) {
      jsonData.metadata = jsonData.metadata || {};
      jsonData.metadata.metadataLevel = incorrectMetadataLevel;
    }
    const updatedJsonDataString = JSON.stringify(jsonData, null, 2);
    fileSystem.writeFileSync(jsonFilePath, updatedJsonDataString, 'utf-8');
    // validating json file
    const res = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND}`).shellOutput;
    expect(res.stderr).to.deep.equal(`${validateConstants.invalidValuesError}`);
  });

  it('Boilerplate json file should not be validated as invalid value exists for multiple properties and return the result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND} --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(validateConstants.invalidValuesJsonError);
  });

  it('Boilerplate json file should not be validated as multiple error exists', () => {
    interface PropertyFileJsonData {
      [key: string]: string | boolean;
    }
    function removeProperties(jsonObject: PropertyFileJsonData, propertiesToRemove: string[]): void {
      propertiesToRemove.forEach((property) => {
        delete jsonObject[property];
      });
    }
    const jsonFilePath = './valueError.json';
    const jsonData = fileSystem.readFileSync(jsonFilePath, 'utf-8');
    const originalJsonData: PropertyFileJsonData = JSON.parse(jsonData) as PropertyFileJsonData;
    const propertiesToRemove: string[] = ['provarHome'];
    removeProperties(originalJsonData, propertiesToRemove);
    const updatedJsonData = JSON.stringify(originalJsonData, null, 2);
    fileSystem.writeFileSync(jsonFilePath, updatedJsonData, 'utf-8');
    // validating json file
    const res = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND}`).shellOutput;
    expect(res.stderr).to.deep.equal(`${validateConstants.multipleErrors}`);
  });

  it('Boilerplate json file should not be validated as multiple error exists and return the result in json format', () => {
    const res = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND} --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(validateConstants.multipleJsonErrors);
  });

  describe('Validate properties which having a valid range of options in json file', () => {
    it('Boilerplate json file should be validated successfully for the property resultsPathDisposition', () => {
      interface PropertyFileJsonData {
        [key: string]: string | boolean | PropertyFileJsonData;
      }
      execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} -p ./propertyRange.json`);
      execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_LOAD_COMMAND} -p ./propertyRange.json`);
      const jsonFilePath = './propertyRange.json';
      const jsonDataString = fileSystem.readFileSync(jsonFilePath, 'utf-8');
      const jsonData: PropertyFileJsonData = JSON.parse(jsonDataString) as PropertyFileJsonData;
      const resultsPathDisposition = ['Increment', 'Replace', 'Fail'];
      resultsPathDisposition.forEach((resultsPath) => {
        jsonData.resultsPathDisposition = resultsPath;
        const updatedJsonData = JSON.stringify(jsonData, null, 2);
        fileSystem.writeFileSync(jsonFilePath, updatedJsonData, 'utf-8');
        // validating the file
        const res = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND}`).shellOutput;
        expect(res.stdout).to.deep.equal(validateConstants.validateSuccessMessage);
      });
    });

    it('Boilerplate json file should be validated successfully for the property testOutputLevel', () => {
      interface PropertyFileJsonData {
        [key: string]: string | boolean | PropertyFileJsonData;
      }
      const jsonFilePath = './propertyRange.json';
      const jsonDataString = fileSystem.readFileSync(jsonFilePath, 'utf-8');
      const jsonData: PropertyFileJsonData = JSON.parse(jsonDataString) as PropertyFileJsonData;
      const testOutputLevel = ['BASIC', 'DETAILED', 'DIAGNOSTIC'];
      testOutputLevel.forEach((testOutput) => {
        jsonData.testOutputLevel = testOutput;
        const updatedJsonData = JSON.stringify(jsonData, null, 2);
        fileSystem.writeFileSync(jsonFilePath, updatedJsonData, 'utf-8');
        // validating the file
        const res = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND}`).shellOutput;
        expect(res.stdout).to.deep.equal(validateConstants.validateSuccessMessage);
      });
    });

    it('Boilerplate json file should be validated successfully for the property pluginOutputlevel', () => {
      interface PropertyFileJsonData {
        [key: string]: string | boolean | PropertyFileJsonData;
      }
      const jsonFilePath = './propertyRange.json';
      const jsonDataString = fileSystem.readFileSync(jsonFilePath, 'utf-8');
      const jsonData: PropertyFileJsonData = JSON.parse(jsonDataString) as PropertyFileJsonData;
      const pluginOutputlevel = ['SEVERE', 'WARNING', 'INFO', 'FINE', 'FINER', 'FINEST'];
      pluginOutputlevel.forEach((pluginOutput) => {
        jsonData.pluginOutputlevel = pluginOutput;
        const updatedJsonData = JSON.stringify(jsonData, null, 2);
        fileSystem.writeFileSync(jsonFilePath, updatedJsonData, 'utf-8');
        // validating the file
        const res = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND}`).shellOutput;
        expect(res.stdout).to.deep.equal(validateConstants.validateSuccessMessage);
      });
    });

    it('Boilerplate json file should be validated successfully for the property metadataLevel', () => {
      interface PropertyFileJsonData {
        metadata: {
          metadataLevel: string;
        };
      }
      const jsonFilePath = './propertyRange.json';
      const jsonDataString = fileSystem.readFileSync(jsonFilePath, 'utf-8');
      const jsonData: PropertyFileJsonData = JSON.parse(jsonDataString) as PropertyFileJsonData;
      const metadataLevel = ['Reuse', 'Reload', 'Refresh'];
      metadataLevel.forEach((metadata) => {
        jsonData.metadata.metadataLevel = metadata;
        const updatedJsonData = JSON.stringify(jsonData, null, 2);
        fileSystem.writeFileSync(jsonFilePath, updatedJsonData, 'utf-8');
        // validating the file
        const res = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND}`).shellOutput;
        expect(res.stdout).to.deep.equal(validateConstants.validateSuccessMessage);
      });
    });

    it('Boilerplate json file should be validated successfully for the property webBrowser', () => {
      interface PropertyFileJsonData {
        environment: {
          webBrowser: string;
        };
      }
      const jsonFilePath = './propertyRange.json';
      const jsonDataString = fileSystem.readFileSync(jsonFilePath, 'utf-8');
      const jsonData: PropertyFileJsonData = JSON.parse(jsonDataString) as PropertyFileJsonData;
      const webBrowser = ['Chrome', 'Safari', 'Edge', 'Edge_Legacy', 'Firefox', 'IE', 'Chrome_Headless'];
      webBrowser.forEach((browser) => {
        jsonData.environment.webBrowser = browser;
        const updatedJsonData = JSON.stringify(jsonData, null, 2);
        fileSystem.writeFileSync(jsonFilePath, updatedJsonData, 'utf-8');
        // validating the file
        const res = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND}`).shellOutput;
        expect(res.stdout).to.deep.equal(validateConstants.validateSuccessMessage);
      });
    });
  });

  it('Boilerplate json file contains empty values for required properties', () => {
    interface PropertyFileJsonData {
      [key: string]: string | boolean | number;
    }
    execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_GENERATE_COMMAND} -p loadEmptyValues.json`);
    const jsonFilePath = 'loadEmptyValues.json';
    // reading the json data
    const jsonDataString = fileSystem.readFileSync(jsonFilePath, 'utf-8');
    const jsonData: PropertyFileJsonData = JSON.parse(jsonDataString) as PropertyFileJsonData;
    jsonData.provarHome = '';
    jsonData.projectPath = '';
    jsonData.resultsPath = '';
    const updatedJsonDataString = JSON.stringify(jsonData, null, 2);
    fileSystem.writeFileSync(jsonFilePath, updatedJsonDataString, 'utf-8');
  });

  it('Boilerplate json file should not allow empty values for required properties and return the error', () => {
    interface PropertyFileJsonData {
      metadata: {
        metadataLevel: string;
        cachePath: string;
      };
      environment: {
        webBrowser: string;
        webBrowserConfig: string;
        webBrowserProviderName: string;
        webBrowserDeviceName: string;
      };
    }
    const jsonFilePath = 'loadEmptyValues.json';
    // reading the json data
    const jsonDataString = fileSystem.readFileSync(jsonFilePath, 'utf-8');
    const jsonData: PropertyFileJsonData = JSON.parse(jsonDataString) as PropertyFileJsonData;
    jsonData.metadata.metadataLevel = '';
    jsonData.metadata.cachePath = '';
    jsonData.environment.webBrowser = '';
    jsonData.environment.webBrowserConfig = '';
    jsonData.environment.webBrowserProviderName = '';
    jsonData.environment.webBrowserDeviceName = '';
    const updatedJsonDataString = JSON.stringify(jsonData, null, 2);
    fileSystem.writeFileSync(jsonFilePath, updatedJsonDataString, 'utf-8');
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_LOAD_COMMAND} -p loadEmptyValues.json `
    ).shellOutput;
    expect(result.stderr).to.deep.equal(loadConstants.invalidValuesError);
    const result1 = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND}`).shellOutput;
    expect(result1.stderr).to.deep.equal(`Error (1): [MISSING_FILE] ${errorMessages.MISSINGFILEERROR}\n\n`);
  });

  it('Boilerplate json file should not allow empty values for required properties and return the error in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_CONFIG_LOAD_COMMAND} -p loadEmptyValues.json --json`
    ).jsonOutput;
    expect(result).to.deep.equal(loadConstants.invalidValuesJsonError);
    const result1 = execCmd<SfProvarCommandResult>(`${commandConstants.SF_PROVAR_CONFIG_VALIDATE_COMMAND} --json`, {
      ensureExitCode: 0,
    });
    expect(result1.jsonOutput).to.deep.equal(validateConstants.missingFileJsonError);
  });
});
