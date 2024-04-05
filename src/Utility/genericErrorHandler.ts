/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { GenericError } from './GenericError.js';

/**
 * ErrorHandler class to manage multiple errors thrown during command execution.
 */
export default class GenericErrorHandler {
  private errors: GenericError[] = [];

  public addErrorsToList(errorObject: GenericError): void {
    this.errors.push(errorObject);
  }
  public errorsToStringArray(): string[] {
    return this.errors.map((e) => `${e.toString()}\n`);
  }

  public getErrors(): object[] {
    return this.errors.map((e) => e.constructError());
  }
}
