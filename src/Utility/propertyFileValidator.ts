/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fileSystem from 'fs';
import { SfError } from '@salesforce/core';
import { Validator, ValidatorResult } from 'jsonschema';
import { errorMessages } from '../constants/errorMessages';
import { propertyFileSchema } from '../constants/propertyFileSchema';
import ErrorHandler, { Error } from './errorHandler';
import { substringAfter, addQuotesAround } from './stringSupport';
import { ProvarConfig } from './provarConfig';

/**
 * Contains code to load the config file and validation login for provardx-properties.json
 *
 */

export default class PropertyFileValidator {
  public validationResults!: ValidatorResult;
  private errorHandler: ErrorHandler;

  public constructor(errorHandler: ErrorHandler) {
    this.errorHandler = errorHandler;
  }

  public async validate(): Promise<boolean> {
    const config: ProvarConfig = await this.loadConfig();
    const filePath = config.get('PROVARDX_PROPERTIES_FILE_PATH')?.toString();

    const missingRequiredProperties: string[] = [];
    const invalidPropertiesValue: string[] = [];
    if (filePath === undefined || !fileSystem.existsSync(filePath)) {
      this.errorHandler.addErrorsToList('MISSING_FILE', errorMessages.MISSINGFILEERROR);
    } else {
      /* eslint-disable */
      const jsonValidator = new Validator();
      try {
        this.validationResults = jsonValidator.validate(
          JSON.parse(fileSystem.readFileSync(filePath).toString()),
          propertyFileSchema
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
        this.errorHandler.addErrorsToList('MALFORMED_FILE', errorMessages.MALFORMEDFILEERROR);
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

  async loadConfig(): Promise<ProvarConfig> {
    try {
      const config = await ProvarConfig.create();
      await config.read();
      return config;
    } catch (error) {
      if (error instanceof SfError) {
        this.errorHandler.addErrorsToList(error.code, error.message);
      }
      throw error;
    }
  }
}
