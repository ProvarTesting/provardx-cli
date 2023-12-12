// import * as fs from 'fs';
import { exec } from 'child_process';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { SfProvarConfigGenerateResult } from '../../../../../src/commands/sf/provar/config/generate';
import { INSUFFICIENT_PERMISSIONS, INVALID_PATH } from '../../../../AssertionContent/Content';

describe('Handling Insufficient Permissions scenarios as write permission is removed from a folder', () => {
  let testSession: TestSession;

  afterEach(async () => {
    await testSession?.clean();
  });

  if (process.platform === 'win32') {
    it('Boilerplate json file should not be generated inside InsufficientPermission folder with "-p" flag', (done) => {
      const folderPath = './test/InsufficientPermission';
      const command = `C:/Windows/System32/icacls "${folderPath}" /deny "Everyone:(WD)"`;
      exec(command, (error) => {
        if (error) {
          done(error);
        } else {
          const res = execCmd<SfProvarConfigGenerateResult>(
            'sf provar config generate -p ./test/InsufficientPermission/bin.json'
          ).shellOutput;
          expect(res.stderr).to.deep.equal(
            'Error (1): INSUFFICIENT_PERMISSIONS - The user does not have permissions to create the file.\n'
          );
          done();
        }
      });
    });

    it('Boilerplate json file should not be generated with "-p" flag as Invalid Path, Extension and Insufficient Permissions', (done) => {
      const folderPath = './test/InsufficientPermission';
      const command = `C:/Windows/System32/icacls "${folderPath}" /deny "Everyone:(WD)"`;
      exec(command, (error) => {
        if (error) {
          done(error);
        } else {
          const res = execCmd<SfProvarConfigGenerateResult>(
            'sf provar config generate -p ./test/InsufficientPermission/cd/Dom.uu'
          ).shellOutput;
          expect(res.stderr).to.deep.equal(
            'Error (1): INVALID_FILE_EXTENSION - Only the .json file extension is supported.\n'
          );
          done();
        }
      });
    });

    it('Boilerplate json file should not be generated inside InsufficientPermission folder with "--properties-file" flag and return the result in json format', (done) => {
      const folderPath = './test/InsufficientPermission';
      const command = `C:/Windows/System32/icacls "${folderPath}" /deny "Everyone:(WD)"`;
      exec(command, (error) => {
        if (error) {
          done(error);
        } else {
          const result = execCmd<SfProvarConfigGenerateResult>(
            'sf provar config generate --properties-file ./test/InsufficientPermission/new.json --json',
            {
              ensureExitCode: 0,
            }
          );
          expect(result.jsonOutput).to.deep.equal(INSUFFICIENT_PERMISSIONS);
          done();
        }
      });
    });

    it('Boilerplate json file should not be generated with "-p" flag as Invalid Path and Insufficient Permission and return the result in json format', (done) => {
      const folderPath = './test/InsufficientPermission';
      const command = `C:/Windows/System32/icacls "${folderPath}" /deny "Everyone:(WD)"`;
      exec(command, (error) => {
        if (error) {
          done(error);
        } else {
          const result = execCmd<SfProvarConfigGenerateResult>(
            'sf provar config generate -p ./test/InsufficientPermission/u/unit.json --json',
            {
              ensureExitCode: 0,
            }
          );
          expect(result.jsonOutput).to.deep.equal(INVALID_PATH);
          done();
        }
      });
    });
  } else if (process.platform === 'linux') {
    it('Boilerplate json file should not be generated inside InsufficientPermission folder with "--properties-file" flag', () => {
      // const folderPath = './test/InsufficientPermission';
      // fs.chmodSync(folderPath, '555');
      const res = execCmd<SfProvarConfigGenerateResult>(
        'sf provar config generate --properties-file ./test/InsufficientPermission/Test.json',
        {
          ensureExitCode: 0,
        }
      ).shellOutput;
      console.log('result'); // eslint-disable-line
      console.log('stderr'+res.stderr); // eslint-disable-line
      console.log('stdout'+res.stdout); // eslint-disable-line
      expect(res.stderr).to.deep.equal(
        'Error (1): INSUFFICIENT_PERMISSIONS - The user does not have permissions to create the file.\n'
      );
    });

    it('Boilerplate json file should not be generated inside InsufficientPermission folder with "-p" flag and return the result in json format', () => {
      // const folderPath = './test/InsufficientPermission';
      // fs.chmodSync(folderPath, '555');
      const result = execCmd<SfProvarConfigGenerateResult>(
        'sf provar config generate -p ./test/InsufficientPermission/Dummy.json --json',
        {
          ensureExitCode: 0,
        }
      );
      expect(result.jsonOutput).to.deep.equal(INSUFFICIENT_PERMISSIONS);
    });
  }
});
