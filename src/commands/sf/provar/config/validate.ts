import * as fileSystem from 'fs';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { Validator, ValidatorResult } from 'jsonschema';
import { schema } from '../../../../constants/propertyFileSchema';
import { Error } from '../../../../Utility/errorHandler';
import ErrorHandler from '../../../../Utility/errorHandler';
import { addQuotesAround, substringAfter } from '../../../../Utility/stringSupport';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('provardx-cli', 'sf.provar.config.validate');

export type SfProvarConfigValidateResult = {
  success: boolean;
  errors?: Error[];
};

export default class SfProvarConfigValidate extends SfCommand<SfProvarConfigValidateResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  private errorHandler: ErrorHandler = new ErrorHandler();

  public async run(): Promise<SfProvarConfigValidateResult> {
    const { flags } = await this.parse(SfProvarConfigValidate);

    const envFilePath = process.env.PROVARDX_PROPERTIES_FILE_PATH;
    let validationResults: ValidatorResult;

    const missingRequiredProperties: string[] = [];
    const invalidPropertiesValue: string[] = [];

    if (envFilePath === undefined || !fileSystem.existsSync(envFilePath)) {
      this.errorHandler.addErrorsToList('MISSING_FILE', messages.getMessage('missingFile_message'));
    } else {
      /* eslint-disable */
      const jsonValidator = new Validator();
      try {
        validationResults = jsonValidator.validate(JSON.parse(fileSystem.readFileSync(envFilePath).toString()), schema);
        if (validationResults.errors.length > 0) {
          for (const validationError of validationResults.errors) {
            if (validationError.name === 'required') {
              let substring = substringAfter(validationError.property, '.');
              if (substring) {
                substring = substring.concat('.');
              }
              missingRequiredProperties.push(substring + validationError.argument);
            } else if (validationError.name === 'enum' || validationError.name === 'type') {
              invalidPropertiesValue.push(substringAfter(validationError.property, '.'));
            }
          }
        }
      } catch (errors: any) {
        this.errorHandler.addErrorsToList('MALFORMED_FILE', messages.getMessage('malformedJSON_message'));
        return this.populateResult(flags);
      }
      const missingPropertiesCount = missingRequiredProperties.length;
      const invalidValuesCount = invalidPropertiesValue.length;

      if (missingPropertiesCount > 1) {
        this.errorHandler.addErrorsToList(
          'MISSING_PROPERTIES',
          `The properties ${addQuotesAround(missingRequiredProperties).join(', ')} are missing.`
        );
      } else if (missingPropertiesCount == 1) {
        this.errorHandler.addErrorsToList(
          'MISSING_PROPERTY',
          `The property ${addQuotesAround(missingRequiredProperties)} is missing.`
        );
      }

      if (invalidValuesCount > 1) {
        this.errorHandler.addErrorsToList(
          'INVALID_VALUES',
          `The properties ${addQuotesAround(invalidPropertiesValue).join(', ')} values are not valid.`
        );
      } else if (invalidValuesCount == 1) {
        this.errorHandler.addErrorsToList(
          'INVALID_VALUE',
          `The property ${addQuotesAround(invalidPropertiesValue)} value is not valid.`
        );
      }
    }
    return this.populateResult(flags);
  }

  private populateResult(flags: any): SfProvarConfigValidateResult {
    let result: SfProvarConfigValidateResult = { success: true };

    if (this.errorHandler.getErrors().length > 0) {
      const errorObjects: Error[] = this.errorHandler.getErrors();
      if (!flags['json']) {
        throw messages.createError('error.MULTIPLE_ERRORS', this.errorHandler.errorsToStringArray());
      }
      result = {
        success: false,
        errors: errorObjects,
      };
    } else {
      this.log(messages.getMessage('success_message'));
      result = {
        success: true,
      };
    }
    return result;
  }
}
