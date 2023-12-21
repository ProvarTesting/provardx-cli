import * as fs from 'fs';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { Validator, ValidatorResult } from 'jsonschema';
import { schema } from '../../../../constants/propertyFileSchema';
import { Error } from '../../../../Utility/errorHandler';
import ErrorHandler from '../../../../Utility/errorHandler';
import { substringAfter } from '../../../../Utility/stringSupport';

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

    if (envFilePath === undefined || !fs.existsSync(envFilePath)) {
      this.errorHandler.addErrorsToList(
        'MISSING_FILE',
        'The properties file has not been loaded or cannot be accessed.'
      );
    } else {
      /* eslint-disable */
      const jsonValidator = new Validator();
      try {
        validationResults = jsonValidator.validate(JSON.parse(fs.readFileSync(envFilePath).toString()), schema);
        if (validationResults.errors.length > 0) {
          for (const validationError of validationResults.errors) {
            if (validationError.name === 'required') {
              let property: string = validationError.argument;
              missingRequiredProperties.push(substringAfter(validationError.property, '.') + property);
            }
            if (validationError.name === 'enum') {
              const property: string = validationError.path[0].toString();
              invalidPropertiesValue.push(property);
            }
          }
        }
      } catch (errors: any) {
        this.errorHandler.addErrorsToList('MALFORMED_FILE', 'The properties file is not a valid JSON.');
      }
      const missingPropertiesCount = missingRequiredProperties.length;
      const invalidValuesCount = invalidPropertiesValue.length;

      if (missingPropertiesCount > 0) {
        if (missingPropertiesCount > 1) {
          this.errorHandler.addErrorsToList(
            'MISSING_PROPERTIES',
            'The properties ' + this.addQuotesAround(missingRequiredProperties).join(', ') + ' are missing.'
          );
        } else {
          this.errorHandler.addErrorsToList(
            'MISSING_PROPERTY',
            'The property ' + this.addQuotesAround(missingRequiredProperties) + ' is missing.'
          );
        }
      }
      if (invalidValuesCount > 0) {
        if (invalidValuesCount > 1) {
          this.errorHandler.addErrorsToList(
            'INVALID_VALUES',
            'The properties ' + this.addQuotesAround(invalidPropertiesValue).join(', ') + ' are not valid.'
          );
        } else {
          this.errorHandler.addErrorsToList(
            'INVALID_VALUE',
            'The property ' + this.addQuotesAround(invalidPropertiesValue) + ' value is not valid.'
          );
        }
      }
    }
    const k = this.populateResult(flags);

    return k;
  }

  private populateResult(flags: any): SfProvarConfigValidateResult {
    let result: SfProvarConfigValidateResult = { success: true };

    if (this.errorHandler.getErrors().length > 0) {
      const errorObjects: Error[] = this.errorHandler.getErrors();
      if (!flags['json']) {
        throw messages.createError('error.MULTIPLE_ERRORS', this.errorHandler.errorsToString());
      }
      result = {
        success: false,
        errors: errorObjects,
      };
    } else {
      this.log('The properties file was validated successfully.');
      result = {
        success: true,
      };
    }
    return result;
  }

  private addQuotesAround(array: string[]): string[] {
    return array.map((item) => "'" + item + "'");
  }
}
