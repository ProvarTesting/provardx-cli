/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { Messages } from '@salesforce/core';
import ErrorHandler, { Error } from './errorHandler';

/**
 * Declaring return type and populating return object for async run method of the commands.
 *
 * @author Palak Bansal
 */

export type SfProvarCommandResult = {
  success: boolean;
  errors?: Error[];
};

/* eslint-disable */
export function populateResult(
  flags: any,
  errorHandler: ErrorHandler,
  messages: Messages<string>,
  log: Function
): SfProvarCommandResult {
  let result: SfProvarCommandResult = { success: true };

  if (errorHandler.getErrors().length > 0) {
    const errorObjects: Error[] = errorHandler.getErrors();
    if (!flags['json']) {
      throw messages.createError('error.MULTIPLE_ERRORS', errorHandler.errorsToStringArray());
    }
    result = {
      success: false,
      errors: errorObjects,
    };
  } else {
    log(messages.getMessage('success_message'));
    result = {
      success: true,
    };
  }
  return result;
}
