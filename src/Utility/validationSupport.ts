import * as fileSystem from 'fs';
import { Validator, ValidatorResult } from 'jsonschema';
import { schema } from '../constants/propertyFileSchema';
import ErrorHandler, { Error } from './errorHandler';
import { substringAfter, addQuotesAround } from './stringSupport';

export default class ValidationSupport {
  public validationResults!: ValidatorResult;
  private errorHandler: ErrorHandler;
  private MISSINGFILEERROR = 'The properties file has not been loaded or cannot be accessed.;';
  private MALFORMEDFILEERROR = 'The properties file is not a valid JSON.';

  public constructor(errorHandler: ErrorHandler) {
    this.errorHandler = errorHandler;
  }

  public validatePropertiesJson(): boolean {
    const envFilePath = process.env.PROVARDX_PROPERTIES_FILE_PATH;
    const missingRequiredProperties: string[] = [];
    const invalidPropertiesValue: string[] = [];
    if (envFilePath === undefined || !fileSystem.existsSync(envFilePath)) {
      this.errorHandler.addErrorsToList('MISSING_FILE', this.MISSINGFILEERROR);
    } else {
      /* eslint-disable */
      const jsonValidator = new Validator();
      try {
        this.validationResults = jsonValidator.validate(
          JSON.parse(fileSystem.readFileSync(envFilePath).toString()),
          schema
        );
        if (this.validationResults.errors.length > 0) {
          for (const validationError of this.validationResults.errors) {
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
        this.errorHandler.addErrorsToList('MALFORMED_FILE', this.MALFORMEDFILEERROR);
        return false;
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
    if (this.errorHandler.getErrors().length > 0) {
      return false;
    }
    return true;
  }

  public getValidationErrors(): Error[] {
    return this.errorHandler.getErrors();
  }
}
