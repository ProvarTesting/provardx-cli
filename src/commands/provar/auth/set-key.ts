/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@provartesting/provardx-plugins-utils';
import { writeCredentials } from '../../../services/auth/credentials.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@provartesting/provardx-cli', 'sf.provar.auth.set-key');

export default class SfProvarAuthSetKey extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    key: Flags.string({
      summary: messages.getMessage('flags.key.summary'),
      required: true,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(SfProvarAuthSetKey);
    const key = flags.key.trim();

    if (!key.startsWith('pv_k_')) {
      this.error(
        'Invalid API key format. Keys must start with "pv_k_". Get your key from https://success.provartesting.com.',
        { exit: 1 }
      );
    }

    const prefix = key.substring(0, 12);
    writeCredentials(key, prefix, 'manual');

    this.log(`API key stored (prefix: ${prefix}).`);
    this.log("Run 'sf provar auth status' to verify.");
  }
}
