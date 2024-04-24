import fileSystem from 'node:fs';
import { spawnSync } from 'node:child_process';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { errorMessages, sfCommandConstants, ErrorHandler, ProvarConfig, SfProvarCommandResult, populateResult, UserSupport, fileContainsString, removeSpaces, getStringAfterSubstring, Messages } from 'provardx-plugins-utils';

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
      this.errorHandler.addErrorsToList('MISSING_FILE', errorMessages.MISSING_FILE_ERROR);
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
      const userSupport = new UserSupport();
      const updateProperties = userSupport.prepareRawProperties(rawProperties);
      const userInfo = await userSupport.getDxUsersInfo(propertiesInstance.connectionOverride, this.errorHandler);
      if (userInfo === null) {
        return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
      }
      const userInfoString = userSupport.prepareRawProperties(JSON.stringify({ dxUsers: userInfo }));
      const provarDxJarPath = propertiesInstance.provarHome + '/provardx/provardx.jar';
      const downloadMetadatacommand =
        'java -cp "' +
        provarDxJarPath +
        '"' +
        sfCommandConstants.DX_COMMAND_EXECUTER +
        updateProperties +
        ' ' +
        userInfoString +
        ' Metadata';

      const javaProcessOutput = spawnSync(downloadMetadatacommand, { shell: true });
      const downloadSuccessMessage = 'Download completed successfully';
      if (!fileContainsString(javaProcessOutput.stderr.toString(), downloadSuccessMessage)) {
        const errorMessage = `ERROR${getStringAfterSubstring(javaProcessOutput.stderr.toString(), 'ERROR')}`;
        this.errorHandler.addErrorsToList('DOWNLOAD_ERROR', `${errorMessage}`);
      }
    } catch (error: any) {
      if (error.name === 'SyntaxError') {
        this.errorHandler.addErrorsToList('MALFORMED_FILE', errorMessages.MALFORMED_FILE_ERROR);
      } else if (error.name === 'MultipleFailureError') {
        return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
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
      const connectionOverride = [];
      for (const override of properties.connectionOverride) {
        if (connections.indexOf(override.connection) !== -1) {
          connectionOverride.push(override);
        }
      }
      properties.connectionOverride = connectionOverride;
    }
  }
}
