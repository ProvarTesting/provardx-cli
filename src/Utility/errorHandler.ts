export type ErrorCode =
  | 'MISSING_FILE'
  | 'MALFORMED_FILE'
  | 'MISSING_PROPERTY'
  | 'MISSING_PROPERTIES'
  | 'INVALID_VALUES'
  | 'INVALID_VALUE';
export type Error = {
  errorCode: ErrorCode;
  errorMessage: string;
};

export default class ErrorHandler {
  private errors: Error[] = [];

  public addErrorsToList(eCode: ErrorCode, eMessage: string): void {
    this.errors.push({
      errorCode: eCode,
      errorMessage: eMessage,
    });
  }

  public getErrors(): Error[] {
    return this.errors;
  }

  public errorsToStringArray(): string[] {
    return this.errors.map((e) => `[${e.errorCode}] ${e.errorMessage}`);
  }
}
