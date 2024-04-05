import { ErrorCode } from './errorCode.js';

export class GenericError {
  private message: string = 'message';
  private code: ErrorCode = 'GENERIC_ERROR';

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
