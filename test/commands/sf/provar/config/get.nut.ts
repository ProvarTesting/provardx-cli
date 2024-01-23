import * as fs from 'fs';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { SfProvarCommandResult } from '../../../../../src/Utility/sfProvarCommandResult';
import { sfProvarConfigGenerateCommand } from '../../../../assertion/generateConstants';
import { sfProvarConfigLoadCommand } from '../../../../assertion/loadConstants';
import * as validateConstants from '../../../../assertion/validateConstants';
import * as getConstants from '../../../../assertion/getConstants';
import * as setConstants from '../../../../assertion/setConstants';
import { errorMessages } from '../../../../../src/constants/errorMessages';

describe('sf provar config get NUTs', () => {
  let session: TestSession;

  after(async () => {
    await session?.clean();
    const filePaths = ['getinvalidFile.json', 'getValues.json'];
    filePaths.forEach((filePath) => {
      fs.unlink(filePath, (err) => {
        if (err) {
          return err;
        }
      });
    });
  });

  it('Missing file error as json file is not loaded', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p getinvalidFile.json`);
    const jsonFilePath = 'getinvalidFile.json';
    const data = fs.readFileSync(jsonFilePath, 'utf-8');
    const newData = data.substring(1);
    fs.writeFile(jsonFilePath, newData, (error) => {
      if (error) {
        return;
      }
    });
    execCmd<SfProvarCommandResult>(`${sfProvarConfigLoadCommand} -p getinvalidFile.json`);
    const res = execCmd<SfProvarCommandResult>(`${getConstants.sfProvarConfigGetCommand} provarHome`).shellOutput;
    expect(res.stderr).to.deep.equal(`Error (1): [MISSING_FILE] ${errorMessages.MISSINGFILEERROR}\n`);
  });

  it('Missing file error in json format as json file is not loaded', () => {
    const res = execCmd<SfProvarCommandResult>(`${getConstants.sfProvarConfigGetCommand} resultsPath --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(validateConstants.missingFileJsonError);
  });

  it('Missing property error as property name is missing', () => {
    execCmd<SfProvarCommandResult>(`${sfProvarConfigGenerateCommand} -p getValues.json`);
    execCmd<SfProvarCommandResult>(`${sfProvarConfigLoadCommand} -p getValues.json`);
    execCmd<SfProvarCommandResult>(`${validateConstants.sfProvarConfigValidateCommand}`);
    const getOutput = execCmd<SfProvarCommandResult>(`${getConstants.sfProvarConfigGetCommand}`).shellOutput;
    expect(getOutput.stderr).to.deep.equal(`Error (1): [MISSING_PROPERTY] ${errorMessages.MISSING_PROPERTY_GET}\n`);
  });

  it('Missing property error in json format as property name is missing', () => {
    const getOutput = execCmd<SfProvarCommandResult>(`${getConstants.sfProvarConfigGetCommand} --json`).jsonOutput;
    expect(getOutput).to.deep.equal(getConstants.missingPropertyGetJson);
  });

  it('Unknown Property error as property is not present in the file', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${getConstants.sfProvarConfigGetCommand} metadata.test`
    ).shellOutput;
    expect(getOutput.stderr).to.deep.equal(`Error (1): [UNKNOWN_PROPERTY] ${errorMessages.UNKNOWN_PROPERTY}\n`);
  });

  it('Unknown Property error as property is not present in the file', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${getConstants.sfProvarConfigGetCommand} environment.webBrowserProvider`
    ).shellOutput;
    expect(getOutput.stderr).to.deep.equal(`Error (1): [UNKNOWN_PROPERTY] ${errorMessages.UNKNOWN_PROPERTY}\n`);
  });

  it('Unknown Property error as property is not present in the file', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${getConstants.sfProvarConfigGetCommand} projectPath.web`
    ).shellOutput;
    expect(getOutput.stderr).to.deep.equal(`Error (1): [UNKNOWN_PROPERTY] ${errorMessages.UNKNOWN_PROPERTY}\n`);
  });

  it('Unknown Property error in json format as property is not present in the file', () => {
    const res = execCmd<SfProvarCommandResult>(`${getConstants.sfProvarConfigGetCommand} sample --json`, {
      ensureExitCode: 0,
    });
    expect(res.jsonOutput).to.deep.equal(getConstants.unknownPropertyJson);
  });

  it('value should be returned for provarHome property', () => {
    const setProvarHome = 'C:/Users/anchal.goel/Downloads/main_win64_e413157177_20240117_0452/';
    execCmd<SfProvarCommandResult>(`${setConstants.sfProvarConfigSetCommand} provarHome=${setProvarHome}`);
    const getOutput = execCmd<SfProvarCommandResult>(`${getConstants.sfProvarConfigGetCommand} provarHome`).shellOutput;
    expect(getOutput.stdout).to.deep.equal(`${setProvarHome}\n`);
  });

  it('value should be returned for projectPath property', () => {
    const setprojectPath = 'C:/Users/anchal.goel/Desktop/main_win64_e413157177_20240117_0452/';
    const Output = execCmd<SfProvarCommandResult>(`${getConstants.sfProvarConfigGetCommand} projectPath`).shellOutput;
    expect(Output.stdout).to.deep.equal('${PROVAR_PROJECT_PATH}\n');
    execCmd<SfProvarCommandResult>(`${setConstants.sfProvarConfigSetCommand} projectPath=${setprojectPath}`);
    const getOutput = execCmd<SfProvarCommandResult>(
      `${getConstants.sfProvarConfigGetCommand} "projectPath"`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal(`${setprojectPath}\n`);
  });

  it('value should be returned for resultsPath property in json format', () => {
    execCmd<SfProvarCommandResult>(
      `${setConstants.sfProvarConfigSetCommand} "resultsPath"="C:/Users/anchal.goel/git/ProvarRegressionqam5/test/provardx/Results"`
    );
    const getOutput = execCmd<SfProvarCommandResult>(`${getConstants.sfProvarConfigGetCommand} resultsPath --json`, {
      ensureExitCode: 0,
    });
    expect(getOutput.jsonOutput).to.deep.equal(getConstants.getResultsPathValue);
  });

  it('value should be returned for smtpPath property', () => {
    const getOutput = execCmd<SfProvarCommandResult>(`${getConstants.sfProvarConfigGetCommand} "smtpPath"`).shellOutput;
    expect(getOutput.stdout).to.deep.equal('\n');
  });

  it('value should be returned for testOutputLevel property', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${getConstants.sfProvarConfigGetCommand} testOutputLevel`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal('BASIC\n');
  });

  it('value should be returned for resultsPathDisposition property in json format', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${getConstants.sfProvarConfigGetCommand} "resultsPathDisposition" --json`
    ).jsonOutput;
    expect(getOutput?.result.success).to.deep.equal(true);
    expect(getOutput?.result.value).to.deep.equal('Increment');
  });

  it('value should be returned for lightningMode property in json format', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${getConstants.sfProvarConfigGetCommand} lightningMode --json`
    ).jsonOutput;
    expect(getOutput?.result.success).to.deep.equal(true);
    expect(getOutput?.result.value).to.deep.equal(true);
  });

  it('Value should be returned successfully for metdata object', () => {
    const getOutput = execCmd<SfProvarCommandResult>(`${getConstants.sfProvarConfigGetCommand} metadata`).shellOutput;
    expect(getOutput.stdout).to.deep.equal("{ metadataLevel: 'Reuse', cachePath: '../.provarCaches' }\n");
  });

  it('Value should be returned successfully for environment object in json format', () => {
    const getOutput = execCmd<SfProvarCommandResult>(`${getConstants.sfProvarConfigGetCommand} environment --json`, {
      ensureExitCode: 0,
    });
    expect(getOutput.jsonOutput).to.deep.equal(getConstants.getEnvironmentJsonObject);
  });

  it('Value should be returned successfully for testEnvironment property in environment object', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${getConstants.sfProvarConfigGetCommand} environment.testEnvironment`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal('${PROVAR_TEST_ENVIRONMENT}\n');
  });

  it('Value should be returned successfully for webBrowserDeviceName property in environment object', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${getConstants.sfProvarConfigGetCommand} "environment.webBrowserDeviceName"`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal('Full Screen\n');
  });

  it('Value should be returned successfully for cachePath property in metadata object', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${getConstants.sfProvarConfigGetCommand} metadata.cachePath --json`
    ).jsonOutput;
    expect(getOutput?.result.success).to.deep.equal(true);
    expect(getOutput?.result.value).to.deep.equal('../.provarCaches');
  });

  it('Value should be returned successfully for testprojectSecrets property', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${getConstants.sfProvarConfigGetCommand} testprojectSecrets`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal('${PROVAR_TEST_PROJECT_SECRETS}\n');
  });

  it('Value should be returned successfully for connectionRefreshType property', () => {
    const getOutput = execCmd<SfProvarCommandResult>(
      `${getConstants.sfProvarConfigGetCommand} connectionRefreshType metadata.metadataLevel`
    ).shellOutput;
    expect(getOutput.stdout).to.deep.equal('Reload\n');
  });
});
