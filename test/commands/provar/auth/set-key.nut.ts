/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execCmd } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { SfProvarCommandResult } from '@provartesting/provardx-plugins-utils';

const CREDS_PATH = path.join(os.homedir(), '.provar', 'credentials.json');

describe('sf provar auth set-key NUTs', () => {
  let credentialsBackup: string | null = null;

  before(() => {
    if (fs.existsSync(CREDS_PATH)) {
      credentialsBackup = fs.readFileSync(CREDS_PATH, 'utf-8');
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

  it('stores a valid pv_k_ key and reports the prefix', () => {
    const output = execCmd<SfProvarCommandResult>(
      'provar auth set-key --key pv_k_nuttest1234567890'
    ).shellOutput;
    expect(output.stderr).to.equal('');
    expect(output.stdout).to.include('API key stored');
    expect(output.stdout).to.include('pv_k_nuttest');
  });

  it('credentials file is created with the correct content', () => {
    execCmd<SfProvarCommandResult>('provar auth set-key --key pv_k_nuttest1234567890');
    expect(fs.existsSync(CREDS_PATH)).to.equal(true);
    const stored = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8')) as Record<string, string>;
    expect(stored['api_key']).to.equal('pv_k_nuttest1234567890');
    expect(stored['source']).to.equal('manual');
    expect(stored['prefix']).to.equal('pv_k_nuttest');
    expect(stored['set_at']).to.be.a('string');
  });

  it('trims leading/trailing whitespace from the key before storing', () => {
    execCmd<SfProvarCommandResult>('provar auth set-key --key "  pv_k_trimtest12345  "');
    const stored = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8')) as Record<string, string>;
    expect(stored['api_key']).to.equal('pv_k_trimtest12345');
  });

  it('rejects a key that does not start with pv_k_', () => {
    const output = execCmd<SfProvarCommandResult>(
      'provar auth set-key --key invalid-key-format'
    ).shellOutput;
    expect(output.stderr).to.include('pv_k_');
  });

  it('overwrites an existing stored key with a new one', () => {
    execCmd<SfProvarCommandResult>('provar auth set-key --key pv_k_first123456789');
    execCmd<SfProvarCommandResult>('provar auth set-key --key pv_k_second12345678');
    const stored = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8')) as Record<string, string>;
    expect(stored['api_key']).to.equal('pv_k_second12345678');
  });
});
