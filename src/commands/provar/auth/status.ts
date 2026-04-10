/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@provartesting/provardx-plugins-utils';
import { readStoredCredentials } from '../../../services/auth/credentials.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@provartesting/provardx-cli', 'sf.provar.auth.status');

export default class SfProvarAuthStatus extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  // eslint-disable-next-line @typescript-eslint/require-await
  public async run(): Promise<void> {
    const envKey = process.env.PROVAR_API_KEY?.trim();

    if (envKey) {
      if (!envKey.startsWith('pv_k_')) {
        this.log('API key misconfigured.');
        this.log('  Source:   environment variable (PROVAR_API_KEY)');
        this.log(`  Value:    "${envKey.substring(0, 10)}..." does not start with "pv_k_"`);
        this.log('');
        this.log('  Validation mode: local only (invalid key — not used for API calls)');
        this.log('  Fix: update PROVAR_API_KEY to a valid pv_k_ key from https://success.provartesting.com');
        return;
      }
      this.log('API key configured');
      this.log('  Source:   environment variable (PROVAR_API_KEY)');
      this.log(`  Prefix:   ${envKey.substring(0, 12)}`);
      this.log('');
      this.log('  Validation mode: Quality Hub API');
      return;
    }

    const stored = readStoredCredentials();
    if (stored) {
      this.log('API key configured');
      this.log('  Source:   ~/.provar/credentials.json');
      this.log(`  Prefix:   ${stored.prefix}`);
      this.log(`  Set at:   ${stored.set_at}`);
      if (stored.username) this.log(`  Account:  ${stored.username}`);
      if (stored.tier) this.log(`  Tier:     ${stored.tier}`);
      if (stored.expires_at) this.log(`  Expires:  ${stored.expires_at}`);
      this.log('');
      this.log('  Validation mode: Quality Hub API');
      return;
    }

    this.log('No API key configured.');
    this.log('');
    this.log('To enable Quality Hub validation (170 rules):');
    this.log('  1. Get your API key from https://success.provartesting.com');
    this.log('  2. Run: sf provar auth set-key --key <your-key>');
    this.log('');
    this.log('For CI/CD: set the PROVAR_API_KEY environment variable.');
    this.log('');
    this.log('Validation mode: local only (structural rules, no quality scoring)');
  }
}
