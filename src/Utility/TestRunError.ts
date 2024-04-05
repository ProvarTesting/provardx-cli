import { GenericError } from './GenericError.js';

export class TestRunError extends GenericError {
  private testCasePath: string = 'testCasePath';

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
