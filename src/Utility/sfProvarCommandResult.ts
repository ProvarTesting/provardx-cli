import { Messages } from '@salesforce/core';
import ErrorHandler, { Error } from './errorHandler';

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
