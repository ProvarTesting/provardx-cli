import * as fileSystem from 'node:fs';
import axios from 'axios';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { SfProvarCommandResult, populateResult } from '../../../Utility/sfProvarCommandResult.js';
import ErrorHandler from '../../../Utility/errorHandler.js';
import { unzipFileSynchronously, unlinkFileIfExist } from '../../../Utility/fileSupport.js';
import { errorMessages } from '../../../constants/errorMessages.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@provartesting/provardx-cli', 'provar.automation.setup');

export default class ProvarAutomationSetup extends SfCommand<SfProvarCommandResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    version: Flags.string({
      summary: messages.getMessage('flags.version.summary'),
      char: 'v',
    }),
  };

  private errorHandler: ErrorHandler = new ErrorHandler();

  public async run(): Promise<SfProvarCommandResult> {
    const { flags } = await this.parse(ProvarAutomationSetup);
    const provarHomePath = './ProvarHome';
    const fileStream = fileSystem.createWriteStream(`${provarHomePath}.zip`);
    let url = 'https://download.provartesting.com/latest/Provar_ANT_latest.zip';
    if (flags.version) {
      url = `https://download.provartesting.com/${flags.version}/Provar_ANT_${flags.version}.zip`;
    }
    /* eslint-disable */
    try {
      unlinkFileIfExist(`${provarHomePath}.zip`);
      unlinkFileIfExist(`${provarHomePath}`);
    } catch (error: any) {
      if (error.code === 'EPERM' || error.code === 'EACCES') {
        this.errorHandler.addErrorsToList(
          'INSUFFICIENT_PERMISSIONS',
          'The user does not have permissions to delete the existing folder.'
        );
      }
      return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
    }

    try {
      const response = await axios.get(url, { responseType: 'stream' });
      response.data.pipe(fileStream);
      await unzipFileSynchronously(fileStream, provarHomePath);
      unlinkFileIfExist(`${provarHomePath}.zip`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.errorHandler.addErrorsToList('INVALID_PATH', errorMessages.INVALID_PATH);
      } else if (error.code === 'EPERM' || error.code === 'EACCES') {
        this.errorHandler.addErrorsToList('INSUFFICIENT_PERMISSIONS', errorMessages.INSUFFICIENT_PERMISSIONS);
      } else if (error.code === 'ERR_BAD_REQUEST') {
        this.errorHandler.addErrorsToList(
          'SETUP_ERROR',
          `${errorMessages.SETUP_ERROR}Provided version is not a valid version.`
        );
        unlinkFileIfExist(`${provarHomePath}.zip`);
      } else {
        this.errorHandler.addErrorsToList('SETUP_ERROR', `${errorMessages.SETUP_ERROR} ${error.message}`);
      }
    }

    return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
  }
}
