import fileSystem from 'node:fs';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import ErrorHandler from '../../../Utility/errorHandler.js';
import { ProvarConfig } from '../../../Utility/provarConfig.js';
import { errorMessages } from '../../../constants/errorMessages.js';
import { SfProvarCommandResult, populateResult } from '../../../Utility/sfProvarCommandResult.js';

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
    'log-level': Flags.option({
      summary: messages.getMessage('flags.log-level.summary'),
      char: 'l',
      options: ['INFO', 'SEVERE', 'WARNING', 'FINE', 'FINER', 'FINEST'] as const,
    })(),
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
    const propertiesdata = fileSystem.readFileSync(propertiesFilePath, { encoding: 'utf8' });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const propertiesInstance = JSON.parse(propertiesdata);

    if (flags.connections) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      propertiesInstance.connectionName = flags.connections;
    }

    return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
  }
}
