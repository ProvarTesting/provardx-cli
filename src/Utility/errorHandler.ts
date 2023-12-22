export type Error = {
  errorCode: string;
  errorMessage: string;
};

export default class ErrorHandler {
  private errors: Error[] = [];

  public addErrorsToList(eCode: string, eMessage: string): void {
    this.errors.push({
      errorCode: eCode,
      errorMessage: eMessage,
    });
  }

  public getErrors(): Error[] {
    return this.errors;
  }

  public errorsToStringArray(): string[] {
    const errorStrings: string[] = [];
    let errorString = '';

    this.errors.forEach((e) => {
      errorString = '[' + e.errorCode + '] ' + e.errorMessage;
      errorStrings.push(errorString);
    });
    return errorStrings;
  }
}
