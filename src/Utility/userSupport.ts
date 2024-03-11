import { sfCommandConstants } from '../constants/sfCommandConstants.js';
import ErrorHandler from './errorHandler.js';
import { executeCommand } from './provardxExecutor.js';

export default class UserSupport {
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
    if (overrides === undefined || overrides.length === 0) {
      return dxUsers;
    }
    for (const override of overrides) {
      const username = override.username;
      const message = 'Validating and retrieving dx user info: ' + username;
      let dxUserInfo = await executeCommand(sfCommandConstants.DISPLAY_USER_INFO + username, message);
      let jsonDxUser = JSON.parse(dxUserInfo);
      if (jsonDxUser.status !== 0) {
        errorHandler.addErrorsToList(
          'DOWNLOAD_ERROR',
          `The following connectionOverride username is not valid: ${username}`
        );
        continue;
      }
      ({ jsonDxUser, dxUserInfo } = await this.generatePasswordIfNotPresent(jsonDxUser, username, dxUserInfo));
      jsonDxUser.result.connection = override['connection'];
      jsonDxUser.result.password = this.handleSpecialCharacters(jsonDxUser.result.password);
      dxUsers.push(jsonDxUser);
    }
    if (dxUsers.length === 0) {
      return null;
    }
    return dxUsers;
  }

  private async generatePasswordIfNotPresent(jsonDxUser: any, username: any, dxUserInfo: any) {
    if (jsonDxUser.result.password == null) {
      const generatePasswordCommand = sfCommandConstants.GENERATE_PASSWORD + username;
      await executeCommand(generatePasswordCommand, 'Generating password for user: ' + username);
      dxUserInfo = await executeCommand(
        sfCommandConstants.DISPLAY_USER_INFO + username,
        'Getting generated password for user: ' + username
      );
      jsonDxUser = JSON.parse(dxUserInfo.toString());
    }
    return { jsonDxUser, dxUserInfo };
  }

  private handleSpecialCharacters(password: string): string {
    if (password) {
      password = encodeURIComponent(password);
    }
    return password;
  }
}
