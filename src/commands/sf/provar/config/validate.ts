import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import ErrorHandler from '../../../../Utility/errorHandler';
import { SfProvarCommandResult, populateResult } from '../../../../Utility/sfProvarCommandResult';
import ValidationSupport from '../../../../Utility/validationSupport';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('provardx-cli', 'sf.provar.config.validate');

export default class SfProvarConfigValidate extends SfCommand<SfProvarCommandResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  private errorHandler: ErrorHandler = new ErrorHandler();

  public async run(): Promise<SfProvarCommandResult> {
    const { flags } = await this.parse(SfProvarConfigValidate);
    const validationSupport = new ValidationSupport(this.errorHandler);
    validationSupport.validatePropertiesJson();

    return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
  }
}
