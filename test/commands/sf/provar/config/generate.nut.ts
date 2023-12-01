import * as fs from 'fs';
import { expect } from 'chai';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { INVALID_PATH, PASS_FILE_CONTENT } from '../../../../AssertionContent/Content';
import { DEFAULT_PROPERTIES_FILE_CONTENT } from '../../../../AssertionContent/Content';
import { INVALID_FILE_EXTENSION } from '../../../../AssertionContent/Content';
import { SfProvarConfigGenerateResult } from '../../../../../src/commands/sf/provar/config/generate';

describe('Config generate', () => {
  let testSession: TestSession;

  afterEach(async () => {
    await testSession?.clean();
  });

  it('Boilerplate json file should be generated with "-p" flag when no path is defined', () => {
    const res = execCmd<SfProvarConfigGenerateResult>('sf provar config generate -p provardx-properties.json', {
      ensureExitCode: 0,
    }).shellOutput;
    expect(res['stdout']).to.deep.equal('The properties file was generated successfully.\n');
  });

  it('Properties defined inside boilerplate json file are matched', () => {
    const filePath = './provardx-properties.json';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const expectedJsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(expectedJsonData).to.deep.equal(DEFAULT_PROPERTIES_FILE_CONTENT);
  });

  it('Boilerplate json file should be generated with "--properties-file" flag when no path is defined', () => {
    const res = execCmd<SfProvarConfigGenerateResult>('sf provar config generate --properties-file test_file.json', {
      ensureExitCode: 0,
    }).shellOutput;
    expect(res['stdout']).to.deep.equal('The properties file was generated successfully.\n');
  });

  it('Boilerplate json file should be overwritten when "-n" flag is provided with flag "-p" ', () => {
    const res = execCmd<SfProvarConfigGenerateResult>('sf provar config generate -p provardx-properties.json -n', {
      ensureExitCode: 0,
    }).shellOutput;
    expect(res.stdout).to.deep.equal('The properties file was generated successfully.\n');
  });

  it('Boilerplate json file should be overwritten when "--no-prompt" flag is provided with flag "--properties-file" ', () => {
    const res = execCmd<SfProvarConfigGenerateResult>(
      'sf provar config generate --properties-file ./test_file.json --no-prompt',
      {
        ensureExitCode: 0,
      }
    ).shellOutput;
    expect(res['stdout']).to.deep.equal('The properties file was generated successfully.\n');
  });

  it('Boilerplate json file should be overwritten when "--no-prompt" flag is provided with flag "-p" ', () => {
    const res = execCmd<SfProvarConfigGenerateResult>(
      'sf provar config generate -p ./test_file.json --no-prompt --json',
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(PASS_FILE_CONTENT);
  });

  it('Boilerplate json file should be overwritten when "-n" flag is provided with flag "--properties-file" ', () => {
    const res = execCmd<SfProvarConfigGenerateResult>(
      'sf provar config generate --properties-file ./test_file.json -n --json',
      {
        ensureExitCode: 0,
      }
    );
    expect(res.jsonOutput).to.deep.equal(PASS_FILE_CONTENT);
  });

  it('Boilerplate json file should be generated with "--properties-file"  when file name has space', () => {
    const res = execCmd<SfProvarConfigGenerateResult>(
      'sf provar config generate --properties-file "./test/AssertionContent bbb.json"',
      {
        ensureExitCode: 0,
      }
    ).shellOutput;
    expect(res['stdout']).to.deep.equal('The properties file was generated successfully.\n');
  });

  it('Boilerplate json file should be generated with "-p" flag using relative path', () => {
    const res = execCmd<SfProvarConfigGenerateResult>('sf provar config generate -p ./test/XYZ.json', {
      ensureExitCode: 0,
    }).shellOutput;
    expect(res['stdout']).to.deep.equal('The properties file was generated successfully.\n');
  });

  it('Boilerplate json file should be generated with "-p" flag and with special char in file name', () => {
    const res = execCmd<SfProvarConfigGenerateResult>(
      'sf provar config generate -p .\\test\\AssertionContent\\D#um$.json',
      {
        ensureExitCode: 0,
      }
    ).shellOutput;
    expect(res['stdout']).to.deep.equal('The properties file was generated successfully.\n');
  });

  it('Boilerplate json file should not be generated with "-p" flag as path is invalid', () => {
    const res = execCmd<SfProvarConfigGenerateResult>('sf provar config generate -p a/aa.json').shellOutput;
    expect(res['stderr']).to.deep.equal('Error (1): INVALID_PATH - The provided path does not exist or is invalid.\n');
  });

  it('Boilerplate json file should not be generated with "-p" flag as extension is invalid', () => {
    const res = execCmd<SfProvarConfigGenerateResult>('sf provar config generate -p ./test/Dom.txt').shellOutput;
    expect(res['stderr']).to.deep.equal(
      'Error (1): INVALID_FILE_EXTENSION - Only the .json file extension is supported.\n'
    );
  });

  it('Boilerplate json file should not be generated with "--properties-file" flag as both path and extension are invalid', () => {
    const res = execCmd<SfProvarConfigGenerateResult>(
      'sf provar config generate --properties-file ./test%cd/Dom.txt'
    ).shellOutput;
    expect(res['stderr']).to.deep.equal(
      'Error (1): INVALID_FILE_EXTENSION - Only the .json file extension is supported.\n'
    );
  });

  it('Boilerplate json file should be generated with "-p" flag and return the result in json format', () => {
    const result = execCmd<SfProvarConfigGenerateResult>('sf provar config generate -p xyz.json --json', {
      ensureExitCode: 0,
    });
    expect(result.jsonOutput).to.deep.equal(PASS_FILE_CONTENT);
  });

  it('Boilerplate json file should not be generated with "-p" flag as path is invalid and return the result in json format', () => {
    const result = execCmd<SfProvarConfigGenerateResult>('sf provar config generate -p x/xyz.json --json', {
      ensureExitCode: 0,
    });
    expect(result.jsonOutput).to.deep.equal(INVALID_PATH);
  });

  it('Boilerplate json file should not be generated with "--properties-file" flag as invalid file extension and return the result in json format', () => {
    const result = execCmd<SfProvarConfigGenerateResult>('sf provar config generate --properties-file Ani.bat --json', {
      ensureExitCode: 0,
    });
    expect(result.jsonOutput).to.deep.equal(INVALID_FILE_EXTENSION);
  });
});
