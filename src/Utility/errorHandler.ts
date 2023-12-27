import { ErrorCode } from './errorCodes';

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
