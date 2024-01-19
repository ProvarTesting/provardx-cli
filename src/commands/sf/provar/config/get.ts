import * as fileSystem from 'fs';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { SfProvarCommandResult, populateResult } from '../../../../Utility/sfProvarCommandResult';
import ErrorHandler from '../../../../Utility/errorHandler';
import { ProvarConfig } from '../../../../Utility/provarConfig';
import { errorMessages } from '../../../../constants/errorMessages';
import { checkNestedProperty, getNestedProperty } from '../../../../Utility/jsonSupport';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('provardx-cli', 'sf.provar.config.get');

export default class SfProvarConfigGet extends SfCommand<SfProvarCommandResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  public static readonly strict = false;

  private errorHandler = new ErrorHandler();

  public async run(): Promise<SfProvarCommandResult> {
    const { argv, flags } = await this.parse(SfProvarConfigGet);
    const config: ProvarConfig = await ProvarConfig.loadConfig(this.errorHandler);
    const propertiesFilePath = config.get('PROVARDX_PROPERTIES_FILE_PATH')?.toString();
    let attributeValue = null;

    if (propertiesFilePath === undefined || !fileSystem.existsSync(propertiesFilePath)) {
      this.errorHandler.addErrorsToList('MISSING_FILE', errorMessages.MISSINGFILEERROR);
      return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
    }
    try {
      /* eslint-disable */
      const data = fileSystem.readFileSync(propertiesFilePath, { encoding: 'utf8' });
      const propertyFileContent = JSON.parse(data);

      for (const attributeName of argv as string[]) {
        if (attributeName.includes('.')) {
          if (!checkNestedProperty(propertyFileContent, attributeName)) {
            this.errorHandler.addErrorsToList('UNKNOWN_PROPERTY', errorMessages.UNKNOWN_PROPERTY);
          } else {
            attributeValue = getNestedProperty(propertyFileContent, attributeName);
          }
        } else {
          if (!propertyFileContent.hasOwnProperty(attributeName)) {
            this.errorHandler.addErrorsToList('UNKNOWN_PROPERTY', errorMessages.UNKNOWN_PROPERTY);
          } else {
            attributeValue = propertyFileContent[attributeName];
          }
        }
      }
    } catch (err: any) {
      this.errorHandler.addErrorsToList('MALFORMED_FILE', errorMessages.MALFORMEDFILEERROR);
    }

    return populateResult(flags, this.errorHandler, messages, this.log.bind(this), attributeValue);
  }
}
