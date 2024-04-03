/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { ErrorCode } from './errorCode.js';

export class ErrorClass {
  protected message: string = 'message';
  private code: ErrorCode | undefined;
  public toString(): string {
    return `[${this.code}] ${this.message}`;
  }
}

export class TestRunErrorClass extends ErrorClass {
  private testCasePath: string = 'testCasePath';
  public toString(): string {
    return `[${this.testCasePath}] ${this.message}`;
  }
}

/**
 * ErrorHandler class to manage multiple errors thrown during command execution.
 */
export default class ErrorHandler {
  private errors: ErrorClass[] = [];

  public addErrorsToList(errorObject: ErrorClass): void {
    this.errors.push(errorObject);
  }

  public getErrors(): ErrorClass[] {
    return this.errors;
  }

  public errorsToStringArray(): string[] {
    return this.errors.map((e) => e.toString());
  }
}
