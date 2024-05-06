/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fileSystem from 'node:fs';
import { resolve } from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { errorMessages, SfProvarCommandResult, populateResult, ErrorHandler, ProvarConfig, PropertyFileValidator, Messages } from '@provartesting/provardx-plugins-utils';

/**
 * Loads the path to provardx-properties.json to the user directory ${user}/.sf/config.json
 * So, that further any command can be run at any location by picking up the properties.json file
 * from config.json file.
 *
 */

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@provartesting/provardx-cli', 'sf.provar.config.load');

export default class SfProvarConfigLoad extends SfCommand<SfProvarCommandResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  public static readonly flags = {
    'properties-file': Flags.string({
      summary: messages.getMessage('flags.properties-file.summary'),
      char: 'p',
      required: true,
    }),
  };
  private errorHandler: ErrorHandler = new ErrorHandler();

  public async run(): Promise<SfProvarCommandResult> {
    const { flags } = await this.parse(SfProvarConfigLoad);
    /* eslint-disable */
    const propertiesFileName = resolve(flags['properties-file']);
    const propertyFileValidator = new PropertyFileValidator(this.errorHandler);
    const config: ProvarConfig = await ProvarConfig.loadConfig(this.errorHandler);

    if (!fileSystem.existsSync(propertiesFileName)) {
      this.errorHandler.addErrorsToList('INVALID_PATH', errorMessages.INVALID_PATH);
      return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
    }
    config.set('PROVARDX_PROPERTIES_FILE_PATH', propertiesFileName);
    await config.write();
    if (!(await propertyFileValidator.validate())) {
      config.unset('PROVARDX_PROPERTIES_FILE_PATH');
      await config.write();
    }

    return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
  }
}
