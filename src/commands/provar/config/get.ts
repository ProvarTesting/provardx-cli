/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fileSystem from 'node:fs';
import * as path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import {
  errorMessages,
  SfProvarCommandResult,
  populateResult,
  ErrorHandler,
  checkNestedProperty,
  getNestedProperty,
  Messages,
} from '@provartesting/provardx-plugins-utils';

/**
 * Gets the value for specified propertykey under arguments from provardx-properties.json
 * laoded under config.json
 *
 */

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@provartesting/provardx-cli', 'provar.config.get');

export default class SfProvarConfigGet extends SfCommand<SfProvarCommandResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  public static readonly strict = false;
  public static readonly flags = {
    'file-path': Flags.string({
      summary: messages.getMessage('flags.file-path.summary'),
      char: 'f',
      required: true,
    }),
  };
  private errorHandler = new ErrorHandler();

  public async run(): Promise<SfProvarCommandResult> {
    const { argv, flags } = await this.parse(SfProvarConfigGet);
    const propertiesFilePath = path.resolve(flags['file-path']);
    let attributeValue = null;

    if (propertiesFilePath === undefined || !fileSystem.existsSync(propertiesFilePath)) {
      this.errorHandler.addErrorsToList('INVALID_PATH', errorMessages.INVALID_PATH);
      return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
    }
    try {
      /* eslint-disable */
      if (!argv.length) {
        this.errorHandler.addErrorsToList('MISSING_PROPERTY', errorMessages.MISSING_PROPERTY_GET);
        return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
      }

      const data = fileSystem.readFileSync(propertiesFilePath, { encoding: 'utf8' });
      const propertyFileContent = JSON.parse(data);

      const propertyName: string = (argv as string[])[0];
      if (propertyName.includes('.')) {
        if (!checkNestedProperty(propertyFileContent, propertyName)) {
          this.errorHandler.addErrorsToList('UNKNOWN_PROPERTY', errorMessages.UNKNOWN_PROPERTY);
        } else {
          attributeValue = getNestedProperty(propertyFileContent, propertyName);
        }
      } else {
        if (!propertyFileContent.hasOwnProperty(propertyName)) {
          this.errorHandler.addErrorsToList('UNKNOWN_PROPERTY', errorMessages.UNKNOWN_PROPERTY);
        } else {
          attributeValue = propertyFileContent[propertyName];
        }
      }
    } catch (err: any) {
      if (err.name === 'SyntaxError') {
        this.errorHandler.addErrorsToList('MALFORMED_FILE', errorMessages.MALFORMED_FILE_ERROR);
      } else {
        throw err;
      }
    }

    return populateResult(flags, this.errorHandler, messages, this.log.bind(this), attributeValue);
  }
}
