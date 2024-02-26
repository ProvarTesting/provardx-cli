import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import { cli } from 'cli-ux';
import ErrorHandler from './errorHandler.js';

export default class ProvarDXUtility {
  /**
   * Updates the dx properties json string before it is send to command executer.
   */
  /* eslint-disable */
  public prepareRawProperties(rawProperties: string): string {
    return '"' + rawProperties.replace(/"/g, '\\"') + '"';
  }

  /**
   * Gets the dx user info and generated the password for dx user if not already created.
   *
   * @param overrides Connection overrides provided in dx property file.
   */
  public async getDxUsersInfo(overrides: any, errorHandler: ErrorHandler): Promise<any> {
    const dxUsers: string[] = [];
    if (overrides === undefined) {
      return dxUsers;
    }
    for (const override of overrides) {
      const username = override.username;
      const message = 'Validating and retrieving dx user info: ' + username;
      let dxUserInfo = await this.executeCommand('sfdx org:display:user --json --target-org ' + username, message);
      let jsonDxUser = JSON.parse(dxUserInfo.toString());
      if (jsonDxUser.status !== 0) {
        errorHandler.addErrorsToList(
          'DOWNLOAD_ERROR',
          `The following connectionOverride username is not valid: ${username}`
        );
        continue;
      }
      if (jsonDxUser.result.password == null) {
        const generatePasswordCommand = 'sfdx force:user:password:generate --targetusername ' + username;
        await this.executeCommand(generatePasswordCommand, 'Generating password for user: ' + username);
        dxUserInfo = await this.executeCommand(
          'sfdx org:display:user --json --target-org ' + username,
          'Getting generated password for user: ' + username
        );
        jsonDxUser = JSON.parse(dxUserInfo.toString());
      }
      jsonDxUser.result.connection = override['connection'];
      jsonDxUser.result.password = this.handleSpecialCharacters(jsonDxUser.result.password);
      dxUsers.push(jsonDxUser);
    }
    return dxUsers;
  }

  /**
   * Executes the provided dx command.
   * @param command Command string
   * @param message Message to be displayed while command execution is in progress.
   */
  private async executeCommand(command: string, message: string): Promise<any> {
    if (message) {
      cli.action.start(message);
    }
    let isSucessful = false;
    const execPromise = promisify(exec);

    try {
      const result = await execPromise(command);
      isSucessful = true;
      return result.stdout;
    } catch (e: any) {
      let errorMessage = e.message;
      errorMessage = errorMessage.substring(errorMessage.indexOf('{'), errorMessage.indexOf('}') + 1);
      return errorMessage;
    } finally {
      if (message) {
        cli.action.stop(isSucessful ? 'successful' : 'failed');
      }
    }
  }

  private handleSpecialCharacters(password: string): string {
    if (password) {
      password = encodeURIComponent(password);
    }
    return password;
  }
}
