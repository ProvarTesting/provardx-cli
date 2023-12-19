export type Error = {
  errorCode: string;
  errorMessage: string;
};

export default class ErrorHandler {
  private errors: Error[] = [];

  public addErrorsToList(error: Error): void {
    this.errors.push(error);
  }

  public getErrors(): Error[] {
    return this.errors;
  }

  public errorsToString(): string[] {
    const errorStrings: string[] = [];
    let errorString = '';

    this.errors.forEach((e) => {
      errorString = '[' + e.errorCode + '] ' + e.errorMessage;
      errorStrings.push(errorString);
    });
    return errorStrings;
  }
}
