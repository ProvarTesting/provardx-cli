/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { ErrorCode } from './errorCode';

/**
 * ErrorHandler to manage multiple errors thrown while execution of commands.
 *
 * @author Palak Bansal
 */

export type Error = {
  code: ErrorCode;
  message: string;
};

export default class ErrorHandler {
  private errors: Error[] = [];

  public addErrorsToList(eCode: ErrorCode, eMessage: string): void {
    this.errors.push({
      code: eCode,
      message: eMessage,
    });
  }

  public getErrors(): Error[] {
    return this.errors;
  }

  public errorsToStringArray(): string[] {
    return this.errors.map((e) => `[${e.code}] ${e.message}`);
  }
}
