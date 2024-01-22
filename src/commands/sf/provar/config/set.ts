import * as fileSystem from 'fs';
import { SfCommand, parseVarArgs } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { SfProvarCommandResult, populateResult } from '../../../../Utility/sfProvarCommandResult';
import ErrorHandler from '../../../../Utility/errorHandler';
import { errorMessages } from '../../../../constants/errorMessages';
import { ProvarConfig } from '../../../../Utility/provarConfig';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('provardx-cli', 'sf.provar.config.set');

export default class SfProvarConfigSet extends SfCommand<SfProvarCommandResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  public static readonly strict = false;

  private errorHandler = new ErrorHandler();

  public async run(): Promise<SfProvarCommandResult> {
    const { argv, flags } = await this.parse(SfProvarConfigSet);
    // eslint-disable-next-line
    const config: ProvarConfig = await ProvarConfig.loadConfig(this.errorHandler);
    const propertiesFilePath = config.get('PROVARDX_PROPERTIES_FILE_PATH')?.toString();

    if (propertiesFilePath === undefined || !fileSystem.existsSync(propertiesFilePath)) {
      this.errorHandler.addErrorsToList('MISSING_FILE', errorMessages.MISSINGFILEERROR);
      return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
    }

    try {
      /* eslint-disable */
      const parsed: Object = parseVarArgs({}, argv as string[]);
      if (Object.keys(parsed).length === 0) {
        this.errorHandler.addErrorsToList('MISSING_PROPERTY', errorMessages.MISSING_PROPERTY);
        return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
      }
      const data = fileSystem.readFileSync(propertiesFilePath, { encoding: 'utf8' });
      const propertyFileContent = JSON.parse(data);

      for (let [propertyName, propertyValue] of Object.entries(parsed)) {
        if (!propertyValue) {
          this.errorHandler.addErrorsToList('MISSING_VALUE', errorMessages.MISSING_VALUE);
        }
        if (propertyName.length < 1) {
          this.errorHandler.addErrorsToList('MISSING_PROPERTY', errorMessages.MISSING_PROPERTY);
        }
        try {
          propertyValue = parseJSONString(propertyValue);
        } catch (err: any) {
          this.errorHandler.addErrorsToList('INVALID_VALUE', errorMessages.INVALID_VALUE);
          return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
        }
        if (propertyName.includes('.')) {
          setNestedProperty(propertyFileContent, propertyName, propertyValue);
        } else {
          propertyFileContent[propertyName] = propertyValue;
        }
      }
      if (this.errorHandler.getErrors().length == 0) {
        fileSystem.writeFileSync(propertiesFilePath, JSON.stringify(propertyFileContent, null, 3));
      }
    } catch (err: any) {
      if (err.name === 'InvalidArgumentFormatError') {
        this.errorHandler.addErrorsToList('INVALID_ARGUMENT', errorMessages.INVALID_ARGUMENT);
      } else if (err.name === 'SyntaxError') {
        this.errorHandler.addErrorsToList('MALFORMED_FILE', errorMessages.MALFORMEDFILEERROR);
      } else {
        throw err;
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

function parseJSONString(jsonInput: string) {
  try {
    // Attempt to parse the input as JSON
    return JSON.parse(jsonInput);
  } catch (err) {
    // If parsing as JSON fails, treat it as a regular string
    return jsonInput;
  }
}
