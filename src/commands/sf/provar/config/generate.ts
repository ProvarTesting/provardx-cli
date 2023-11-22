import * as fs from 'fs';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { cli } from 'cli-ux';
import { generateFile, getExtension } from '../../../../Utility/FileSupport';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('provardx-cli', 'sf.provar.config.generate');

export type SfProvarConfigGenerateResult = {
  success: boolean;
  error?: object;
};

export default class SfProvarConfigGenerate extends SfCommand<SfProvarConfigGenerateResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'properties-file': Flags.string({
      summary: messages.getMessage('flags.properties-file.summary'),
      char: 'p',
      required: true,
    }),
    'no-prompt': Flags.boolean({
      summary: messages.getMessage('flags.no-prompt.summary'),
      char: 'n',
    }),
  };

  private errorMessage: string = ''; // eslint-disable-line
  private errorCode: string = ''; // eslint-disable-line

  public async run(): Promise<SfProvarConfigGenerateResult> {
    const { flags } = await this.parse(SfProvarConfigGenerate);
    const PropertiesFileName = flags['properties-file'];
    let result: SfProvarConfigGenerateResult = { success: true };

    if (getExtension(PropertiesFileName) !== '.json') {
      this.errorCode = 'INVALID_FILE_EXTENSION';
      this.errorMessage = 'Only the .json file extension is supported.';
    } else if (fs.existsSync(PropertiesFileName) && !flags['no-prompt']) {
      const selection: string = (await cli.prompt(
        '[FILE_ALREADY_EXISTS] A file with the same name already exists in that location. Do you want to overwrite it? Y/N'
      )) as string;
      if (selection.toLowerCase() === 'y') {
        this.generatePropertiesFile(PropertiesFileName);
      } else {
        this.errorCode = 'GENERATE_OPERATION_DENIED';
        this.errorMessage = 'The operation was cancelled.';
      }
    } else {
      this.generatePropertiesFile(PropertiesFileName);
    }
    if (this.errorCode !== '') {
      if (!flags['json']) {
        throw messages.createError('error.' + this.errorCode);
      }
      result = {
        success: false,
        error: {
          code: this.errorCode,
          message: this.errorMessage,
        },
      };
    }
    return result;
  }

  private generatePropertiesFile(PropertiesFileName: string): void {
    try {
      generateFile(PropertiesFileName);
      this.log('The properties file was generated successfully.');
      // eslint-disable-next-line
    } catch (error: any) {
      this.errorMessage = error.message; // eslint-disable-line
      this.errorCode = error.code; // eslint-disable-line
      if (this.errorMessage.includes('no such file or directory')) {
        this.errorCode = 'INVALID_PATH';
        this.errorMessage = 'The provided path does not exist or is invalid.';
      } else if (this.errorMessage.includes('operation not permitted')) {
        this.errorCode = 'INSUFFICIENT_PERMISSIONS';
        this.errorMessage = 'The user does not have permissions to create the file.';
      }
    }
  }
}
