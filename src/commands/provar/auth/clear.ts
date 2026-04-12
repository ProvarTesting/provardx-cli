/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@provartesting/provardx-plugins-utils';
import { clearCredentials, readStoredCredentials } from '../../../services/auth/credentials.js';
import { qualityHubClient, getQualityHubBaseUrl } from '../../../services/qualityHub/client.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@provartesting/provardx-cli', 'sf.provar.auth.clear');

export default class SfProvarAuthClear extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public async run(): Promise<void> {
    const stored = readStoredCredentials();
    if (stored) {
      const baseUrl = getQualityHubBaseUrl();
      try {
        await qualityHubClient.revokeKey(stored.api_key, baseUrl);
      } catch {
        this.log('  Note: could not reach Quality Hub to revoke key server-side (offline?).');
        this.log('  The local credentials have been removed — the key may still be valid until it expires.');
      }
    }

    clearCredentials();
    this.log('API key cleared.');
    this.log('  Next validation will use local rules only (structural checks, no quality scoring).');
    this.log('  To reconfigure, run: sf provar auth set-key --key <your-key>');
  }
}
