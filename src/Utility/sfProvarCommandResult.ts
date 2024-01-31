/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { Messages } from '@salesforce/core';
import ErrorHandler, { Error } from './errorHandler.js';

/**
 * Declaring return type and populating return object for async run method of the commands.
 *
 */

export type SfProvarCommandResult = {
  success: boolean;
  value?: string;
  errors?: Error[];
};

/* eslint-disable */
export function populateResult(
  flags: any,
  errorHandler: ErrorHandler,
  messages: Messages<string>,
  log: Function,
  value?: string
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
    messages.messages.has('success_message') ? log(messages.getMessage('success_message')) : '';
    value != null ? log(value) : '';
    result = {
      success: true,
      value: value,
    };
  }
  return result;
}
