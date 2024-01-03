import * as fileSystem from 'fs';
import { resolve } from 'path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { SfProvarCommandResult, populateResult } from '../../../../Utility/sfProvarCommandResult';
import ErrorHandler from '../../../../Utility/errorHandler';
import PropertyFileValidator from '../../../../Utility/propertyFileValidator';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('provardx-cli', 'sf.provar.config.load');

export default class SfProvarConfigLoad extends SfCommand<SfProvarCommandResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  public static readonly flags = {
    'properties-file': Flags.string({
      summary: messages.getMessage('flags.properties-file.summary'),
      char: 'p',
      required: true,
    }),
  };
  private errorHandler: ErrorHandler = new ErrorHandler();

  public async run(): Promise<SfProvarCommandResult> {
    const { flags } = await this.parse(SfProvarConfigLoad);
    const propertiesFileName = resolve(flags['properties-file']);
    const propertyFileValidator = new PropertyFileValidator(this.errorHandler);
    if (!fileSystem.existsSync(propertiesFileName)) {
      this.errorHandler.addErrorsToList('INVALID_PATH', 'The provided path does not exist or is invalid.');
      return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
    }
    process.env.PROVARDX_PROPERTIES_FILE_PATH = propertiesFileName;
    if (!propertyFileValidator.validate()) {
      delete process.env.PROVARDX_PROPERTIES_FILE_PATH;
    }

    return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
  }
}
