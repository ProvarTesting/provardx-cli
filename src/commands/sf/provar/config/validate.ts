import * as fs from 'fs';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { Validator, ValidatorResult } from 'jsonschema';
import { schema } from '../../../../constants/propertyFileSchema';
import { Error } from '../../../../Utility/errorHandler';
import ErrorHandler from '../../../../Utility/errorHandler';

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

  public async run(): Promise<SfProvarConfigValidateResult> {
    const { flags } = await this.parse(SfProvarConfigValidate);

    const envFilePath = process.env.PROVARDX_PROPERTIES_FILE_PATH;
    const errorHandler: ErrorHandler = new ErrorHandler();
    let validationResults: ValidatorResult;
    let result: SfProvarConfigValidateResult = { success: true };

    const missingRequiredProperties: string[] = [];
    const invalidPropertiesValue: string[] = [];

    if (envFilePath === undefined || !fs.existsSync(envFilePath)) {
      errorHandler.addErrorsToList({
        errorCode: 'MISSING_FILE',
        errorMessage: 'The properties file has not been loaded or cannot be accessed.',
      });
    } else {
      const jsonValidator = new Validator();
      try {
        validationResults = jsonValidator.validate(JSON.parse(fs.readFileSync(envFilePath).toString()), schema);
        if (validationResults.errors.length > 0) {
          for (const validationError of validationResults.errors) {
            if (validationError.name === 'required') {
              missingRequiredProperties.push(validationError.property);
            }
            if (validationError.name === 'enum') {
              const property: string = validationError.path[0].toString();
              invalidPropertiesValue.push(property);
            }
          }
        } // eslint-disable-next-line
      } catch (errors: any) {
        errorHandler.addErrorsToList({
          errorCode: 'MALFORMED_FILE',
          errorMessage: 'The properties file is not a valid JSON.',
        });
      }

      if (missingRequiredProperties.length > 0) {
        errorHandler.addErrorsToList({
          errorCode: 'MISSING_PROPERTY',
          errorMessage: 'The property ' + missingRequiredProperties.toString() + ' is missing.',
        });
      }
      if (invalidPropertiesValue.length > 0) {
        errorHandler.addErrorsToList({
          errorCode: 'INVALID_VALUE',
          errorMessage: 'The property ' + invalidPropertiesValue.toString() + ' value is not valid.',
        });
      }
    }

    if (errorHandler.getErrors().length > 0) {
      const e: Error[] = errorHandler.getErrors();
      if (!flags['json']) {
        throw messages.createError('error.MULTIPLE_ERRORS', errorHandler.errorsToString());
      }
      result = {
        success: false,
        errors: e,
      };
    } else {
      this.log('The properties file was validated successfully.');
      result = {
        success: true,
      };
    }
    return result;
  }
}
