import fileSystem from 'node:fs';
import { spawnSync } from 'node:child_process';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import ErrorHandler from '../../../Utility/errorHandler.js';
import { ProvarConfig } from '../../../Utility/provarConfig.js';
import { errorMessages } from '../../../constants/errorMessages.js';
import { SfProvarCommandResult, populateResult } from '../../../Utility/sfProvarCommandResult.js';
import ProvarDXUtility from '../../../Utility/provarDxUtils.js';
import { fileContainsString, getStringAfterSubstring } from '../../../Utility/fileSupport.js';
import { removeSpaces } from '../../../Utility/stringSupport.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@provartesting/provardx-cli', 'provar.metadata.download');

export default class ProvarMetadataDownload extends SfCommand<SfProvarCommandResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    connections: Flags.string({
      summary: messages.getMessage('flags.connections.summary'),
      char: 'c',
      required: true,
    }),
  };

  private errorHandler: ErrorHandler = new ErrorHandler();

  public async run(): Promise<SfProvarCommandResult> {
    const { flags } = await this.parse(ProvarMetadataDownload);

    const config: ProvarConfig = await ProvarConfig.loadConfig(this.errorHandler);
    const propertiesFilePath = config.get('PROVARDX_PROPERTIES_FILE_PATH')?.toString();
    if (propertiesFilePath === undefined || !fileSystem.existsSync(propertiesFilePath)) {
      this.errorHandler.addErrorsToList('MISSING_FILE', errorMessages.MISSINGFILEERROR);
      return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
    }

    try {
      const propertiesdata = fileSystem.readFileSync(propertiesFilePath, { encoding: 'utf8' });
      /* eslint-disable */
      const propertiesInstance = JSON.parse(propertiesdata);

      if (flags.connections) {
        propertiesInstance.connectionName = removeSpaces(flags.connections);
      }

      this.doConnectionOverrides(propertiesInstance);

      const rawProperties = JSON.stringify(propertiesInstance);
      const provarDxUtils = new ProvarDXUtility();
      const updateProperties = provarDxUtils.prepareRawProperties(rawProperties);
      const userInfo = await provarDxUtils.getDxUsersInfo(propertiesInstance.connectionOverride, this.errorHandler);
      const userInfoString =
        flags.connections && userInfo === null
          ? ''
          : provarDxUtils.prepareRawProperties(JSON.stringify({ dxUsers: userInfo }));
      const jarPath = propertiesInstance.provarHome + '/provardx/provardx.jar';
      const command =
        'java -cp "' +
        jarPath +
        '" com.provar.provardx.DxCommandExecuter ' +
        updateProperties +
        ' ' +
        userInfoString +
        ' Metadata';

      const javaProcessOutput = spawnSync(command, { shell: true });
      const logFilePath = `${propertiesInstance.projectPath}/log.txt`;
      const downloadSuccessMessage = 'Download completed successfully';

      fileSystem.writeFileSync(logFilePath, javaProcessOutput.stderr.toString(), { encoding: 'utf-8' });

      const fileContent = fileSystem.readFileSync(logFilePath)?.toString();
      if (!fileContainsString(fileContent, downloadSuccessMessage)) {
        const errorMessage = getStringAfterSubstring(fileContent, 'ERROR');
        this.errorHandler.addErrorsToList('DOWNLOAD_ERROR', `${errorMessage}`);
      }
      fileSystem.unlink(logFilePath, (error) => {});
    } catch (error: any) {
      if (error.name === 'SyntaxError') {
        this.errorHandler.addErrorsToList('MALFORMED_FILE', errorMessages.MALFORMEDFILEERROR);
      } else {
        this.errorHandler.addErrorsToList('DOWNLOAD_ERROR', `${error.errorMessage}`);
      }
    }

    return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
  }

  private doConnectionOverrides(properties: any): void {
    if (!properties.connectionOverride && !properties.connectionName) {
      return;
    }

    if (properties.connectionName && properties.connectionOverride) {
      const connections = properties.connectionName.split(',');
      const connOver = [];
      for (const override of properties.connectionOverride) {
        if (connections.indexOf(override.connection) !== -1) {
          connOver.push(override);
        }
      }
      properties.connectionOverride = connOver;
    }
  }
}
