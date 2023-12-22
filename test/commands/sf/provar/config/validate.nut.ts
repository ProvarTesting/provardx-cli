import * as fs from 'fs';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { SfProvarConfigValidateResult } from '../../../../../src/commands/sf/provar/config/validate';
import { sfProvarConfigValidateCommand } from '../../../../assertion/validateConstants';
import { SfProvarConfigGenerateResult } from '../../../../../src/commands/sf/provar/config/generate';
import { sfProvarConfigGenerateCommand } from '../../../../assertion/generateConstants';
import { malformedFileError, malformedFileJsonError } from '../../../../assertion/validateConstants';
import { missingFileError, missingFileJsonError } from '../../../../assertion/validateConstants';
import { missingPropertiesError, missingPropertyJsonError } from '../../../../assertion/validateConstants';
import { validateSuccessMessage, validateSuccessJson } from '../../../../assertion/validateConstants';

describe('sf provar config validate NUTs', () => {
  let session: TestSession;

  after(async () => {
    await session?.clean();
  });

  it('Boilerplate json file should be validated successfully with all required & optional attributes', () => {
    execCmd<SfProvarConfigGenerateResult>(`${sfProvarConfigGenerateCommand} -p validateFile.json`);
    process.env.PROVARDX_PROPERTIES_FILE_PATH = './validateFile.json';
    const res = execCmd<SfProvarConfigValidateResult>(`${sfProvarConfigValidateCommand}`, {
      ensureExitCode: 0,
    }).shellOutput;
    expect(res.stdout).to.deep.equal(validateSuccessMessage);
  });

  it('Boilerplate json file should be validated successfully with all required & optional attributes and return result in json format', () => {
    const res = execCmd<SfProvarConfigValidateResult>(`${sfProvarConfigValidateCommand} --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(validateSuccessJson);
  });

  it('Boilerplate json file should be validated successfully with all the required attributes and their type', () => {
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

  it('Boilerplate json file should be not validated if the file has not been loaded', () => {
    delete process.env.PROVARDX_PROPERTIES_FILE_PATH;
    const res = execCmd<SfProvarConfigValidateResult>(`${sfProvarConfigValidateCommand}`).shellOutput;
    expect(res.stderr).to.deep.equal(missingFileError);
  });

  it('Boilerplate json file should be not validated if the file has not been loaded and return result in json format', () => {
    const res = execCmd<SfProvarConfigValidateResult>(`${sfProvarConfigValidateCommand} --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(missingFileJsonError);
  });

  it('Boilerplate json file should be not validated as it is invalid json file', () => {
    execCmd<SfProvarConfigGenerateResult>(`${sfProvarConfigGenerateCommand} -p validateFileNew.json`);
    const jsonFilePath = './validateFileNew.json';
    const data = fs.readFileSync(jsonFilePath, 'utf-8');
    const newData = data.substring(1);
    fs.writeFile(jsonFilePath, newData, (error) => {
      if (error) {
        return;
      }
    });
    process.env.PROVARDX_PROPERTIES_FILE_PATH = './validateFileNew.json';
    const res = execCmd<SfProvarConfigValidateResult>(`${sfProvarConfigValidateCommand}`).shellOutput;
    expect(res.stderr).to.deep.equal(malformedFileError);
  });

  it('Boilerplate json file should be not validated as it is invalid json file and return result in json format', () => {
    const res = execCmd<SfProvarConfigValidateResult>(`${sfProvarConfigValidateCommand} --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(malformedFileJsonError);
  });

  it('Boilerplate json file should be not validated as few required properties are missing in file', () => {
    execCmd<SfProvarConfigGenerateResult>(`${sfProvarConfigGenerateCommand} -p propertyError.json`);
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
    const propertiesToRemove: string[] = ['provarHome', 'projectPath', 'resultsPath'];
    removeProperties(originalJsonData, propertiesToRemove);
    const updatedJsonData = JSON.stringify(originalJsonData, null, 2);
    fs.writeFileSync(jsonFilePath, updatedJsonData, 'utf-8');
    expect(originalJsonData).to.not.have.all.keys(propertiesToRemove);
    process.env.PROVARDX_PROPERTIES_FILE_PATH = './propertyError.json';
    const res = execCmd<SfProvarConfigValidateResult>(`${sfProvarConfigValidateCommand}`).shellOutput;
    expect(res.stderr).to.deep.equal(missingPropertiesError);
  });

  it('Boilerplate json file should be not validated as few required properties are missing in file and return the result in json format', () => {
    const res = execCmd<SfProvarConfigValidateResult>(`${sfProvarConfigValidateCommand} --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(missingPropertyJsonError);
  });
});
