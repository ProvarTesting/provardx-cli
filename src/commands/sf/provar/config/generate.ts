import * as fs from 'fs';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { generateFile, getExtension } from '../../../../Utility/fileSupport';
import ErrorHandler, { Error } from '../../../../Utility/errorHandler';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('provardx-cli', 'sf.provar.config.generate');

export type SfProvarConfigGenerateResult = {
  success: boolean;
  errors?: Error[];
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

  private errorHandler: ErrorHandler = new ErrorHandler();

  public async run(): Promise<SfProvarConfigGenerateResult> {
    const { flags } = await this.parse(SfProvarConfigGenerate);
    const PropertiesFileName = flags['properties-file'];

    if (getExtension(PropertiesFileName) !== '.json') {
      this.errorHandler.addErrorsToList('INVALID_FILE_EXTENSION', 'Only the .json file extension is supported.');
    } else if (fs.existsSync(PropertiesFileName) && !flags['no-prompt']) {
      if (!(await this.confirm(messages.getMessage('PropertiesFileOverwritePromptConfirm')))) {
        this.errorHandler.addErrorsToList('GENERATE_OPERATION_DENIED', 'The operation was cancelled.');
      } else {
        this.generatePropertiesFile(PropertiesFileName);
      }
      return this.populateResult(flags);
    } else {
      this.generatePropertiesFile(PropertiesFileName);
    }

    return this.populateResult(flags);
  }

  private generatePropertiesFile(PropertiesFileName: string): void {
    try {
      generateFile(PropertiesFileName);
      /* eslint-disable */
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.errorHandler.addErrorsToList('INVALID_PATH', 'The provided path does not exist or is invalid.');
      } else if (error.code === 'EPERM' || error.code === 'EACCES') {
        this.errorHandler.addErrorsToList(
          'INSUFFICIENT_PERMISSIONS',
          'The user does not have permissions to create the file.'
        );
      }
    }
  }

  private populateResult(flags: any): SfProvarConfigGenerateResult {
    let result: SfProvarConfigGenerateResult = { success: true };

    if (this.errorHandler.getErrors().length > 0) {
      const errorObjects: Error[] = this.errorHandler.getErrors();
      if (!flags['json']) {
        throw messages.createError('error.MULTIPLE_ERRORS', this.errorHandler.errorsToStringArray());
      }
      result = {
        success: false,
        errors: errorObjects,
      };
    } else {
      this.log(messages.getMessage('success_message'));
      result = {
        success: true,
      };
    }
    return result;
  }
}
