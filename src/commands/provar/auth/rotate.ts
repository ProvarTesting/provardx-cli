/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@provartesting/provardx-plugins-utils';
import { readStoredCredentials, writeCredentials } from '../../../services/auth/credentials.js';
import { qualityHubClient, getQualityHubBaseUrl, QualityHubAuthError } from '../../../services/qualityHub/client.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@provartesting/provardx-cli', 'sf.provar.auth.rotate');

export default class SfProvarAuthRotate extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public async run(): Promise<void> {
    const stored = readStoredCredentials();

    if (!stored) {
      this.error('No API key stored. Run `sf provar auth login` first.', { exit: 1 });
    }

    const baseUrl = getQualityHubBaseUrl();

    try {
      const keyData = await qualityHubClient.rotateKey(stored.api_key, baseUrl);
      writeCredentials(keyData.api_key, keyData.prefix, 'cognito');
      this.log(`API key rotated (new prefix: ${keyData.prefix}). Valid until ${keyData.expires_at}.`);
      this.log("  Run 'sf provar auth status' to verify.");
    } catch (err) {
      if (err instanceof QualityHubAuthError) {
        this.error(
          'Current key is invalid or expired — rotation requires a valid key.\nRun `sf provar auth login` to authenticate via browser and get a fresh key.',
          { exit: 1 }
        );
      }
      throw err;
    }
  }
}
