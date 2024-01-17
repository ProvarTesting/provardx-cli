import * as fileSystem from 'fs';
import { SfCommand, parseVarArgs } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { SfProvarCommandResult, populateResult } from '../../../../Utility/sfProvarCommandResult';
import ErrorHandler from '../../../../Utility/errorHandler';
import { errorMessages } from '../../../../constants/errorMessages';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('provardx-cli', 'sf.provar.config.set');

export default class SfProvarConfigSet extends SfCommand<SfProvarCommandResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  public static readonly strict = false;

  private errorHandler = new ErrorHandler();

  public async run(): Promise<SfProvarCommandResult> {
    const { args, argv, flags } = await this.parse(SfProvarConfigSet);
    const propertiesFilePath = 'D:/provardx-cli/prop.json';
    if (propertiesFilePath === undefined || !fileSystem.existsSync(propertiesFilePath)) {
      this.errorHandler.addErrorsToList('MISSING_FILE', errorMessages.MISSINGFILEERROR);
      return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
    }

    try {
      /* eslint-disable */
      const data = fileSystem.readFileSync(propertiesFilePath, { encoding: 'utf8' });
      const propertyFileContent = JSON.parse(data);

      const parsed = parseVarArgs(args, argv as string[]);
      for (const [attributeName, attributeValue] of Object.entries(parsed)) {
        if (!attributeValue) {
          this.errorHandler.addErrorsToList('MISSING_VALUE', errorMessages.MISSING_VALUE);
        }
        if (attributeName.length < 1) {
          this.errorHandler.addErrorsToList('MISSING_PROPERTY', errorMessages.MISSING_PROPERTY);
        }
        if (attributeName.includes('.')) {
          setNestedProperty(propertyFileContent, attributeName, attributeValue);
        } else {
          propertyFileContent[attributeName] = attributeValue;
        }
      }
      if (this.errorHandler.getErrors().length == 0) {
        fileSystem.writeFileSync(propertiesFilePath, JSON.stringify(propertyFileContent, null, 3));
      }
    } catch (err: any) {
      if (err.name === 'InvalidArgumentFormatError') {
        this.errorHandler.addErrorsToList('INVALID_ARGUMENT', errorMessages.INVALID_ARGUMENT);
      } else {
        this.errorHandler.addErrorsToList('MALFORMED_FILE', errorMessages.MALFORMEDFILEERROR);
      }
    }
    return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
  }
}

function setNestedProperty(jsondata: any, attribute: string, value: string | undefined) {
  var argList = attribute.split('.');
  var arglen = argList.length;
  for (var i = 0; i < arglen - 1; i++) {
    var arg = argList[i];
    if (!jsondata[arg]) jsondata[arg] = {};
    jsondata = jsondata[arg];
  }
  jsondata[argList[arglen - 1]] = value;
}
