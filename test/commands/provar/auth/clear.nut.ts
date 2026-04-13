/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execCmd } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { SfProvarCommandResult } from '@provartesting/provardx-plugins-utils';

const CREDS_PATH = path.join(os.homedir(), '.provar', 'credentials.json');

function seedCredentials(): void {
  fs.mkdirSync(path.dirname(CREDS_PATH), { recursive: true });
  fs.writeFileSync(
    CREDS_PATH,
    JSON.stringify({ api_key: 'pv_k_cleartest123456', prefix: 'pv_k_clearte', set_at: new Date().toISOString(), source: 'manual' }),
    'utf-8'
  );
}

describe('sf provar auth clear NUTs', () => {
  let credentialsBackup: string | null = null;

  before(() => {
    if (fs.existsSync(CREDS_PATH)) {
      credentialsBackup = fs.readFileSync(CREDS_PATH, 'utf-8');
      fs.rmSync(CREDS_PATH);
    }
  });

  after(() => {
    if (credentialsBackup !== null) {
      fs.mkdirSync(path.dirname(CREDS_PATH), { recursive: true });
      fs.writeFileSync(CREDS_PATH, credentialsBackup, 'utf-8');
    } else if (fs.existsSync(CREDS_PATH)) {
      fs.rmSync(CREDS_PATH);
    }
  });

  it('does not throw and prints confirmation when no credentials file exists', () => {
    const output = execCmd<SfProvarCommandResult>('provar auth clear').shellOutput;
    expect(output.stderr).to.equal('');
    expect(output.stdout).to.include('API key cleared');
  });

  it('removes the credentials file and reports success', () => {
    seedCredentials();
    expect(fs.existsSync(CREDS_PATH)).to.equal(true);

    const output = execCmd<SfProvarCommandResult>('provar auth clear').shellOutput;
    expect(output.stderr).to.equal('');
    expect(output.stdout).to.include('API key cleared');
    expect(fs.existsSync(CREDS_PATH)).to.equal(false);
  });

  it('is idempotent — clearing twice does not throw', () => {
    seedCredentials();
    execCmd<SfProvarCommandResult>('provar auth clear');
    const output = execCmd<SfProvarCommandResult>('provar auth clear').shellOutput;
    expect(output.stderr).to.equal('');
    expect(output.stdout).to.include('API key cleared');
  });

  it('status shows no key after clear', () => {
    seedCredentials();
    execCmd<SfProvarCommandResult>('provar auth clear');
    const output = execCmd<SfProvarCommandResult>('provar auth status').shellOutput;
    expect(output.stdout).to.include('No API key configured');
  });
});
