/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import ErrorHandler from '../../../../Utility/errorHandler';
import { SfProvarCommandResult, populateResult } from '../../../../Utility/sfProvarCommandResult';
import PropertyFileValidator from '../../../../Utility/propertyFileValidator';

/**
 * Validates the provardx-properties.json against JSON standards and provardx schema
 * mentioned under PropertyFileSchema.ts
 *
 * @author Palak Bansal
 */

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('provardx-cli', 'sf.provar.config.validate');

export default class SfProvarConfigValidate extends SfCommand<SfProvarCommandResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  private errorHandler: ErrorHandler = new ErrorHandler();

  public async run(): Promise<SfProvarCommandResult> {
    const { flags } = await this.parse(SfProvarConfigValidate);
    const propertyFileValidator = new PropertyFileValidator(this.errorHandler);
    await propertyFileValidator.validate();

    return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
  }
}
