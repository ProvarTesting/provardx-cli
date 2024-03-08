import * as fileSystem from 'node:fs';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { SfProvarCommandResult } from '../../../../src/Utility/sfProvarCommandResult.js';
import * as validateConstants from '../../../assertion/validateConstants.js';
import * as metadataDownloadConstants from '../../../assertion/metadataDownloadConstants.js';
import { errorMessages } from '../../../../src/constants/errorMessages.js';
import { commandConstants } from '../../../../src/constants/commandConstants.js';

describe('sf provar config metadataDownload NUTs', () => {
  let session: TestSession;
  const DOWNLOAD_ERROR = 'Error (1): [DOWNLOAD_ERROR]';
  enum FILE_PATHS {
    METADATA_ERROR_FILE = 'metadataErrorFile.json',
    MALFORMED_METADATA_FILE = 'malformedMetadataFile.json',
    METADATA_DOWNLOAD_FILE = 'metadataDownloadFile.json',
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

  it('Missing file error as json file is not loaded', () => {
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GENERATE_COMMAND} -p ${FILE_PATHS.METADATA_ERROR_FILE}`
    );
    const jsonFilePath = FILE_PATHS.METADATA_ERROR_FILE;
    const data = fileSystem.readFileSync(jsonFilePath, 'utf-8');
    const newData = data.substring(1);
    fileSystem.writeFile(jsonFilePath, newData, (error) => {
      if (error) {
        return;
      }
    });
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_LOAD_COMMAND} -p ${FILE_PATHS.METADATA_ERROR_FILE}`
    );
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} -c RegressionOrg`
    ).shellOutput;
    expect(result.stderr).to.deep.equal(`Error (1): [MISSING_FILE] ${errorMessages.MISSINGFILEERROR}\n\n`);
  });

  it('Missing file error as json file is not loaded', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} --connections RegressionOrg`
    ).shellOutput;
    expect(result.stderr).to.deep.equal(`Error (1): [MISSING_FILE] ${errorMessages.MISSINGFILEERROR}\n\n`);
  });

  it('Missing file error as json file is not loaded', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} --connections "RegressionOrg,RegmainOrg"`
    ).shellOutput;
    expect(result.stderr).to.deep.equal(`Error (1): [MISSING_FILE] ${errorMessages.MISSINGFILEERROR}\n\n`);
  });

  it('Missing file json error in json format as json file is not loaded', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} -c RegressionOrg --json`,
      {
        ensureExitCode: 0,
      }
    );
    expect(result.jsonOutput).to.deep.equal(validateConstants.missingFileJsonError);
  });

  it('Malformed file error as file is made malformed after loading the file', () => {
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GENERATE_COMMAND} -p ${FILE_PATHS.MALFORMED_METADATA_FILE}`
    );
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_LOAD_COMMAND} -p ${FILE_PATHS.MALFORMED_METADATA_FILE}`
    );
    const jsonFilePath = FILE_PATHS.MALFORMED_METADATA_FILE;
    const data = fileSystem.readFileSync(jsonFilePath, 'utf-8');
    const newData = data.substring(1);
    fileSystem.writeFile(jsonFilePath, newData, (error) => {
      if (error) {
        return;
      }
    });
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} -c RegressionOrg`
    ).shellOutput;
    expect(result.stderr).to.deep.equal(`Error (1): [MALFORMED_FILE] ${errorMessages.MALFORMEDFILEERROR}\n\n`);
  });

  it('Metadata should not be downloaded as provarHome & projectPath are not correct and return the error message', () => {
    // generate and load the file
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GENERATE_COMMAND} -p ${FILE_PATHS.METADATA_DOWNLOAD_FILE}`
    );
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_LOAD_COMMAND} -p ${FILE_PATHS.METADATA_DOWNLOAD_FILE}`
    );
    // download metadata for the connection
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} -c RegressionOrg`
    ).shellOutput;
    expect(result.stderr).to.include(DOWNLOAD_ERROR);
  });

  it('Metadata should not be downloaded as provarHome & projectPath are not correct and return the error in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} -c RegressionOrg --json`
    ).jsonOutput;
    expect(result?.result.success).to.deep.equal(false);
    expect(result?.result.errors?.[0]?.code).to.equals('DOWNLOAD_ERROR');
  });

  it('Metadata should be downloaded for the provided connection and return the success message', () => {
    const SET_PROVAR_HOME_VALUE = '"C:/Program Files/Provar/2.12.1.1.02/"';
    const SET_PROJECT_PATH_VALUE = '"D:/Provar Workspace/8Feb/Provar"';
    // set provarHome and projectPath locations
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "provarHome"=${SET_PROVAR_HOME_VALUE}`
    );
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "projectPath"=${SET_PROJECT_PATH_VALUE}`
    );
    // download metadata for the connection
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} -c RegressionOrg`
    ).shellOutput;
    expect(result.stdout).to.deep.equal(metadataDownloadConstants.successMessage);
  });

  it('Metadata should be downloaded for the provided connection and return the success message in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} -c RegressionOrg --json`
    ).jsonOutput;
    expect(result).to.deep.equal(metadataDownloadConstants.successJsonMessage);
  });

  it('Metadata should be downloaded with all metadataLevel options and return the success message', () => {
    interface PropertyFileJsonData {
      metadata: {
        metadataLevel: string;
      };
    }
    const jsonFilePath = `${FILE_PATHS.METADATA_DOWNLOAD_FILE}`;
    const jsonDataString = fileSystem.readFileSync(jsonFilePath, 'utf-8');
    const jsonData: PropertyFileJsonData = JSON.parse(jsonDataString) as PropertyFileJsonData;
    const metadataLevel = ['Reload', 'Refresh'];
    metadataLevel.forEach((metadata) => {
      jsonData.metadata.metadataLevel = metadata;
      const updatedJsonData = JSON.stringify(jsonData, null, 2);
      fileSystem.writeFileSync(jsonFilePath, updatedJsonData, 'utf-8');
      const result = execCmd<SfProvarCommandResult>(
        `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} -c RegmainOrg`
      ).shellOutput;
      expect(result.stdout).to.deep.equal(metadataDownloadConstants.successMessage);
    });
  });

  it('Metadata should not be downloaded and return the error message as invalid value exists in metadataLevel property', () => {
    interface PropertyFileJsonData {
      metadata: {
        metadataLevel: string;
      };
    }
    const incorrectMetadataLevel = 'Reuse1';
    const jsonFilePath = `${FILE_PATHS.METADATA_DOWNLOAD_FILE}`;
    const jsonDataString = fileSystem.readFileSync(jsonFilePath, 'utf-8');
    const jsonData: PropertyFileJsonData = JSON.parse(jsonDataString) as PropertyFileJsonData;
    jsonData.metadata.metadataLevel = incorrectMetadataLevel;
    const updatedJsonDataString = JSON.stringify(jsonData, null, 2);
    fileSystem.writeFileSync(jsonFilePath, updatedJsonDataString, 'utf-8');
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} --connections RegmainOrg`
    ).shellOutput;
    expect(result.stderr).to.include(DOWNLOAD_ERROR);
  });

  it('Metadata should not be downloaded and return the json error message as invalid value exists in metadataLevel property', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} -c RegmainOrg --json`
    ).jsonOutput;
    expect(result?.result.success).to.deep.equal(false);
    expect(result?.result.errors?.[0]?.code).to.equals('DOWNLOAD_ERROR');
  });

  it('Metadata should be downloaded for the provided connection and return the success message', () => {
    interface PropertyFileJsonData {
      metadata: {
        metadataLevel: string;
      };
    }
    const jsonFilePath = `${FILE_PATHS.METADATA_DOWNLOAD_FILE}`;
    const jsonDataString = fileSystem.readFileSync(jsonFilePath, 'utf-8');
    const jsonData: PropertyFileJsonData = JSON.parse(jsonDataString) as PropertyFileJsonData;
    jsonData.metadata.metadataLevel = 'Reuse';
    const updatedJsonDataString = JSON.stringify(jsonData, null, 2);
    fileSystem.writeFileSync(jsonFilePath, updatedJsonDataString, 'utf-8');
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} --connections RegressionOrg`
    ).shellOutput;
    expect(result.stdout).to.deep.equal(metadataDownloadConstants.successMessage);
  });

  it('Metadata should be downloaded for the provided connection and return the success message', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} -c RegmainSandbox,RegmainOrg,RegressionOrg`
    ).shellOutput;
    expect(result.stdout).to.deep.equal(metadataDownloadConstants.successMessage);
  });

  it('Metadata should be downloaded for the provided connection and return the success message in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} -c RegmainSandbox,RegmainOrg,RegressionOrg --json`
    ).jsonOutput;
    expect(result).to.deep.equal(metadataDownloadConstants.successJsonMessage);
  });

  it('Metadata should be downloaded for the provided connection and return the success message', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} -c " RegmainSandbox, RegressionOrg "`
    ).shellOutput;
    expect(result.stdout).to.deep.equal(metadataDownloadConstants.successMessage);
  });

  it('Metadata should be downloaded for the provided connection and return the success message in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} --connections "RegmainOrg, RegressionOrg" --json`
    ).jsonOutput;
    expect(result).to.deep.equal(metadataDownloadConstants.successJsonMessage);
  });

  it('Metadata should not be downloaded as incorrect connection name and return the error message', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} -c RegOrg`
    ).shellOutput;
    expect(result.stderr).to.include(DOWNLOAD_ERROR);
  });

  it('Metadata should not be downloaded as incorrect connection name and return the error message in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} --connections REGMAINORG --json`
    ).jsonOutput;
    expect(result?.result.success).to.deep.equal(false);
    expect(result?.result.errors?.[0]?.code).to.equals('DOWNLOAD_ERROR');
  });

  it('Metadata should be downloaded for the correct connection out of multiple connections and return the sucess message', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} -c RegressionOrg,Regmain`
    ).shellOutput;
    expect(result.stdout).to.deep.equal(metadataDownloadConstants.successMessage);
  });

  it('Metadata should be downloaded for the correct connection out of multiple connections', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} -c RegressionOrg,Regmain --json`
    ).jsonOutput;
    expect(result).to.deep.equal(metadataDownloadConstants.successJsonMessage);
  });

  it('Metadata should be downloaded for the user provided in connection override', () => {
    execCmd<SfProvarCommandResult>(
      // eslint-disable-next-line no-useless-escape
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "connectionOverride"=["{\\"connection\\": \\"RegressionOrg\\", \\"username\\": \\"test-08a5ntrfpe71@example.com\\"}"]`
    );
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} -c RegressionOrg`
    ).shellOutput;
    expect(result.stderr).to.deep.equal(metadataDownloadConstants.validUserMessage);
    expect(result.stdout).to.deep.equal(metadataDownloadConstants.successMessage);
  });

  it('Metadata should not be downloaded for the invalid user provided in connection override', () => {
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "connectionOverride"=["{\\"connection\\": \\"RegressionOrg\\", \\"username\\": \\"ScratchInvalidUser\\"}"]`
    );
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} -c RegressionOrg`
    ).shellOutput;
    expect(result.stderr).to.deep.equal(metadataDownloadConstants.invalidUserMessage);
  });

  it('Metadata should not be downloaded for the invalid user provided in connection override and return the error in json format', () => {
    execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_SET_COMMAND} "connectionOverride"=["{\\"connection\\": \\"RegressionOrg\\", \\"username\\": \\"ScratchInvalidUser\\"}"]`
    );
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} --connections RegressionOrg --json`
    ).jsonOutput;
    expect(result?.result.success).to.deep.equal(false);
    expect(result?.result.errors?.[0]?.code).to.equal('DOWNLOAD_ERROR');
    expect(result?.result.errors?.[0]?.message).to.equal(
      'The following connectionOverride username is not valid: ScratchInvalidUser'
    );
  });

  it('Metadata should not be downloaded for the invalid user name and return the error', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} -c PrereleaseOrg`
    ).shellOutput;
    expect(result.stderr).to.include(DOWNLOAD_ERROR);
  });

  it('Metadata should not be downloaded for the invalid user name and return the error in json format', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} -c PrereleaseOrg --json`
    ).jsonOutput;
    expect(result?.result.success).to.deep.equal(false);
    expect(result?.result.errors?.[0]?.code).to.equals('DOWNLOAD_ERROR');
  });

  it('Metadata should not be downloaded when user does not have download permissions and return the error', () => {
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} -c NonAdmin`
    ).shellOutput;
    expect(result.stderr).to.include(DOWNLOAD_ERROR);
  });

  it('Metadata should be downloaded for the provided connection and return the success message', () => {
    interface PropertyFileJsonData {
      metadata: {
        cachePath: string;
      };
    }
    const jsonFilePath = `${FILE_PATHS.METADATA_DOWNLOAD_FILE}`;
    const jsonDataString = fileSystem.readFileSync(jsonFilePath, 'utf-8');
    const jsonData: PropertyFileJsonData = JSON.parse(jsonDataString) as PropertyFileJsonData;
    jsonData.metadata.cachePath = '../.testData';
    const updatedJsonDataString = JSON.stringify(jsonData, null, 2);
    fileSystem.writeFileSync(jsonFilePath, updatedJsonDataString, 'utf-8');
    const result = execCmd<SfProvarCommandResult>(
      `${commandConstants.SF_PROVAR_AUTOMATION_METADATA_DOWNLOAD_COMMAND} --connections RegmainOrg`
    ).shellOutput;
    expect(result.stdout).to.deep.equal(metadataDownloadConstants.successMessage);
  });
});
