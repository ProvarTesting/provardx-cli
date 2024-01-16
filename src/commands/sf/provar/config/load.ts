import * as fileSystem from 'fs';
import { resolve } from 'path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { SfProvarCommandResult, populateResult } from '../../../../Utility/sfProvarCommandResult';
import ErrorHandler from '../../../../Utility/errorHandler';
import { ProvarConfig } from '../../../../Utility/provarConfig';
import PropertyFileValidator from '../../../../Utility/propertyFileValidator';
import { errorMessages } from '../../../../constants/errorMessages';

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
    /* eslint-disable */
    const propertiesFileName = resolve(flags['properties-file']);
    const propertyFileValidator = new PropertyFileValidator(this.errorHandler);
    const config: ProvarConfig = await propertyFileValidator.loadConfig();

    if (!fileSystem.existsSync(propertiesFileName)) {
      this.errorHandler.addErrorsToList('INVALID_PATH', errorMessages.INVALID_PATH);
      return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
    }
    config.set('PROVARDX_PROPERTIES_FILE_PATH', propertiesFileName);
    await config.write();
    if (!propertyFileValidator.validate()) {
      config.unset('PROVARDX_PROPERTIES_FILE_PATH');
      await config.write();
    }

    return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
  }
}
