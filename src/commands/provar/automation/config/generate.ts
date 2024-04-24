/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import fs from 'node:fs';
import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { errorMessages, SfProvarCommandResult, populateResult, generateFile, getExtension, ErrorHandler, Messages } from 'provardx-plugins-utils';

/**
 * Generates the boiler plate provardx-properties.json
 *
 */

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@provartesting/provardx-cli', 'sf.provar.config.generate');

export default class SfProvarConfigGenerate extends SfCommand<SfProvarCommandResult> {
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

  public async run(): Promise<SfProvarCommandResult> {
    const { flags } = await this.parse(SfProvarConfigGenerate);
    const PropertiesFileName = flags['properties-file'];

    if (getExtension(PropertiesFileName) !== '.json') {
      this.errorHandler.addErrorsToList('INVALID_FILE_EXTENSION', 'Only the .json file extension is supported.');
    } else if (fs.existsSync(PropertiesFileName) && !flags['no-prompt']) {
      if (!(await this.confirm({ message: messages.getMessage('PropertiesFileOverwritePromptConfirm') }))) {
        this.errorHandler.addErrorsToList('GENERATE_OPERATION_DENIED', errorMessages.GENERATE_OPERATION_DENIED);
      } else {
        this.generatePropertiesFile(PropertiesFileName);
      }
    } else {
      this.generatePropertiesFile(PropertiesFileName);
    }

    return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
  }

  private generatePropertiesFile(PropertiesFileName: string): void {
    try {
      generateFile(PropertiesFileName);
      /* eslint-disable */
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.errorHandler.addErrorsToList('INVALID_PATH', errorMessages.INVALID_PATH);
      } else if (error.code === 'EPERM' || error.code === 'EACCES') {
        this.errorHandler.addErrorsToList(
          'INSUFFICIENT_PERMISSIONS',
          'The user does not have permissions to create the file.'
        );
      }
    }
  }
}
