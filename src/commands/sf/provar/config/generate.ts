import * as fs from 'fs';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { cli } from 'cli-ux';
import { DEFAULT_PROPERTIES_FILE_CONTENT } from '../../../../constants/PropertyFileContent';

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
    propertiesfile: Flags.string({
      summary: messages.getMessage('flags.propertiesfile.summary'),
      char: 'p',
      required: true,
    }),
  };

  public async run(): Promise<SfProvarConfigGenerateResult> {
    const { flags } = await this.parse(SfProvarConfigGenerate);
    const PropertiesFileName = flags['propertiesfile'];
    let result: SfProvarConfigGenerateResult = { success: true };
    let errorMessage: string = ''; // eslint-disable-line
    let errorCode: string = ''; // eslint-disable-line
    this.log();

    if (getExtension(PropertiesFileName) !== '.json') {
      errorCode = 'INVALID_FILE_EXTENSION';
      errorMessage = 'Only the .json file extension is supported.';
    } else if (fs.existsSync(PropertiesFileName)) {
      const selection: string = (await cli.prompt(
        '[FILE_ALREADY_EXISTS] A file with the same name already exists in that location. Do you want to overwrite it? Y/N'
      )) as string;

      if (selection.toLowerCase() === 'y') {
        generatePropertyFile(PropertiesFileName);
      }
    } else {
      try {
        generatePropertyFile(PropertiesFileName);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        errorMessage = error.message; // eslint-disable-line
        errorCode = error.code; // eslint-disable-line
        if (errorMessage.includes('no such file or directory')) {
          errorCode = 'INVALID_PATH';
          errorMessage = 'The provided path does not exist or is invalid.';
        } else if (errorMessage.includes('operation not permitted')) {
          errorCode = 'INSUFFICIENT_PERMISSIONS';
          errorMessage = 'The user does not have permissions to create the file.';
        }
      }
    }
    if (errorCode !== '') {
      if (!Object.prototype.hasOwnProperty.call(flags, 'json')) {
        throw messages.createError('error.' + errorCode);
      }
      result = {
        success: false,
        error: {
          code: errorCode,
          message: errorMessage,
        },
      };
    }
    return result;
  }
}

function getExtension(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i < 0 ? '' : filename.substr(i);
}

function generatePropertyFile(filePath: string): void {
  fs.writeFileSync(filePath, DEFAULT_PROPERTIES_FILE_CONTENT);
  // console.log('The properties file was generated successfully.');
  return;
}
