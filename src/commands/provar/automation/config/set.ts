/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fileSystem from 'node:fs';
import { SfCommand, parseVarArgs } from '@salesforce/sf-plugins-core';
import { SfProvarCommandResult, populateResult, ErrorHandler, Messages, ProvarConfig, parseJSONString, setNestedProperty, errorMessages } from '@provartesting/provardx-plugins-utils';


/**
 * Sets the specified property key and value inside provardx-properties.json
 * loaded under config file
 *
 */

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@provartesting/provardx-cli', 'sf.provar.config.set');

export default class SfProvarConfigSet extends SfCommand<SfProvarCommandResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  public static readonly strict = false;

  private errorHandler = new ErrorHandler();

  public async run(): Promise<SfProvarCommandResult> {
    const { argv, flags } = await this.parse(SfProvarConfigSet);
    // eslint-disable-next-line
    const config: ProvarConfig = await ProvarConfig.loadConfig(this.errorHandler);
    const propertiesFilePath = config.get('PROVARDX_PROPERTIES_FILE_PATH')?.toString();

    if (propertiesFilePath === undefined || !fileSystem.existsSync(propertiesFilePath)) {
      this.errorHandler.addErrorsToList('MISSING_FILE', errorMessages.MISSING_FILE_ERROR);
      return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
    }

    try {
      /* eslint-disable */
      const parsed: Object = parseVarArgs({}, argv as string[]);
      if (Object.keys(parsed).length === 0) {
        this.errorHandler.addErrorsToList('MISSING_PROPERTY', errorMessages.MISSING_PROPERTY);
        return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
      }
      const data = fileSystem.readFileSync(propertiesFilePath, { encoding: 'utf8' });
      const propertyFileContent = JSON.parse(data);

      for (let [propertyName, propertyValue] of Object.entries(parsed)) {
        if (!propertyValue) {
          this.errorHandler.addErrorsToList('MISSING_VALUE', errorMessages.MISSING_VALUE);
        }
        if (propertyName.length < 1) {
          this.errorHandler.addErrorsToList('MISSING_PROPERTY', errorMessages.MISSING_PROPERTY);
        }
        try {
          propertyValue = parseJSONString(propertyValue);
        } catch (err: any) {
          this.errorHandler.addErrorsToList('INVALID_VALUE', errorMessages.INVALID_VALUE);
          return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
        }
        if (propertyName.includes('.')) {
          setNestedProperty(propertyFileContent, propertyName, propertyValue);
        } else {
          propertyFileContent[propertyName] = propertyValue;
        }
      }
      if (this.errorHandler.getErrors().length == 0) {
        fileSystem.writeFileSync(propertiesFilePath, JSON.stringify(propertyFileContent, null, 3));
      }
    } catch (err: any) {
      if (err.name === 'InvalidArgumentFormatError') {
        this.errorHandler.addErrorsToList('INVALID_ARGUMENT', errorMessages.INVALID_ARGUMENT);
      } else if (err.name === 'SyntaxError') {
        this.errorHandler.addErrorsToList('MALFORMED_FILE', errorMessages.MALFORMED_FILE_ERROR);
      } else {
        throw err;
      }
    }
    return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
  }
}
