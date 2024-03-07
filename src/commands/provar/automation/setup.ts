import * as fileSystem from 'node:fs';
import os from 'node:os';
import axios from 'axios';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { SfProvarCommandResult, populateResult } from '../../../Utility/sfProvarCommandResult.js';
import ErrorHandler from '../../../Utility/errorHandler.js';

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
    const filePath = './provarInstaller.exe';
    const fileStream = fileSystem.createWriteStream(filePath);
    let url = '';
    const platform = os.platform();
    switch (platform) {
      case 'darwin':
        url = 'https://download.provartesting.com/2.12.1.1/Provar_2.12.1.1_macos_signed.pkg';
        break;
      case 'win32':
        url = 'https://download.provartesting.com/2.12.1.1/Provar_setup_2.12.1.1_win_64.exe';
        break;
      case 'linux':
        url = 'https://download.provartesting.com/2.12.1.1/Provar_ANT_2.12.1.1.zip';
        break;
      default:
        this.log('Unknown operating system');
    }

    // unlink file
    await axios
      .get(url, { responseType: 'stream' })
      .then((response) => {
        /* eslint-disable */
        response.data.pipe(fileStream);

        fileStream.on('finish', () => {
          this.log('File downloaded successfully');
        });
        return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
      })
      .catch((error) => {
        this.errorHandler.addErrorsToList('SETUP_ERROR', `errorMessages.SETUP_ERROR ${error.message}`);
        return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
      });

    return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
  }
}
