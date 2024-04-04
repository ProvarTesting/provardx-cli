/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { ErrorCode } from './errorCode.js';

export class GenericError {
  private message: string = 'message';
  private code: ErrorCode = 'TEST_RUN_ERROR';

  public getCode(): ErrorCode {
    return this.code;
  }
  public setCode(value: ErrorCode): void {
    this.code = value;
  }

  public getMessage(): string {
    return this.message;
  }
  public setMessage(value: string): void {
    this.message = value;
  }

  public toString(): string {
    return `[${this.code}] ${this.message}`;
  }

  public constructError(): object {
    return {
      code: this.getCode(),
      message: this.getMessage(),
    };
  }
}

export class TestRunError extends GenericError {
  private testCasePath: string = 'testCasePath';
  public constructor(message: string) {
    super();
    this.setMessage(message);
  }
  public getTestCasePath(): string {
    return this.testCasePath;
  }
  public setTestCasePath(value: string): void {
    this.testCasePath = value;
  }
  public toString(): string {
    return `[${this.testCasePath}] ${this.getMessage()}`;
  }
  public constructError(): object {
    return {
      testCasePath: this.getTestCasePath(),
      message: this.getMessage(),
    };
  }
}

/**
 * ErrorHandler class to manage multiple errors thrown during command execution.
 */
export default class GenericErrorHandler {
  private errors: GenericError[] = [];

  public addErrorsToList(errorObject: GenericError): void {
    this.errors.push(errorObject);
  }
  public errorsToStringArray(): string[] {
    return this.errors.map((e) => e.toString());
  }

  public errorsToString(): string {
    return this.errors.map((e) => e.toString()).join('\n');
  }

  public getErrors(): object[] {
    return this.errors.map((e) => e.constructError());
  }
}
