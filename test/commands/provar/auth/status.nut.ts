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

describe('sf provar auth status NUTs', () => {
  let credentialsBackup: string | null = null;
  let envBackup: string | undefined;

  before(() => {
    envBackup = process.env.PROVAR_API_KEY;
    delete process.env.PROVAR_API_KEY;
    if (fs.existsSync(CREDS_PATH)) {
      credentialsBackup = fs.readFileSync(CREDS_PATH, 'utf-8');
      fs.rmSync(CREDS_PATH);
    }
  });

  after(() => {
    if (envBackup !== undefined) {
      process.env.PROVAR_API_KEY = envBackup;
    } else {
      delete process.env.PROVAR_API_KEY;
    }
    if (credentialsBackup !== null) {
      fs.mkdirSync(path.dirname(CREDS_PATH), { recursive: true });
      fs.writeFileSync(CREDS_PATH, credentialsBackup, 'utf-8');
    } else if (fs.existsSync(CREDS_PATH)) {
      fs.rmSync(CREDS_PATH);
    }
  });

  afterEach(() => {
    delete process.env.PROVAR_API_KEY;
    if (fs.existsSync(CREDS_PATH)) {
      fs.rmSync(CREDS_PATH);
    }
  });

  it('reports no key configured when neither env var nor file is set', () => {
    const output = execCmd<SfProvarCommandResult>('provar auth status').shellOutput;
    expect(output.stderr).to.equal('');
    expect(output.stdout).to.include('No API key configured');
    expect(output.stdout).to.include('local only');
  });

  it('reports key source as credentials file when set via set-key', () => {
    execCmd<SfProvarCommandResult>('provar auth set-key --key pv_k_statustest12345');
    const output = execCmd<SfProvarCommandResult>('provar auth status').shellOutput;
    expect(output.stderr).to.equal('');
    expect(output.stdout).to.include('API key configured');
    expect(output.stdout).to.include('credentials.json');
    expect(output.stdout).to.include('pv_k_statuste');
    expect(output.stdout).to.include('Quality Hub API');
  });

  it('reports key source as environment variable when PROVAR_API_KEY is set', () => {
    process.env.PROVAR_API_KEY = 'pv_k_envstatustest12';
    const output = execCmd<SfProvarCommandResult>('provar auth status').shellOutput;
    expect(output.stderr).to.equal('');
    expect(output.stdout).to.include('API key configured');
    expect(output.stdout).to.include('PROVAR_API_KEY');
    expect(output.stdout).to.include('Quality Hub API');
  });

  it('reports misconfiguration when PROVAR_API_KEY lacks pv_k_ prefix', () => {
    process.env.PROVAR_API_KEY = 'sk-wrong-prefix-value';
    const output = execCmd<SfProvarCommandResult>('provar auth status').shellOutput;
    expect(output.stderr).to.equal('');
    expect(output.stdout).to.include('misconfigured');
    expect(output.stdout).to.include('pv_k_');
    expect(output.stdout).to.include('local only');
  });
});
