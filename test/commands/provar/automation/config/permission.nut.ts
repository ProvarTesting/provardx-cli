/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fileSystem from 'node:fs';
import { exec } from 'node:child_process';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { SfProvarCommandResult } from '@provartesting/provardx-plugins-utils';
import { INSUFFICIENT_PERMISSIONS, INVALID_PATH } from '../../../../assertion/generateConstants.js';
import { errorInsufficientPermissions, errorInvalidFileExtension } from '../../../../assertion/generateConstants.js';
import { commandConstants } from '../../../../assertion/commandConstants.js';

describe('Handling Insufficient Permissions scenarios as write permission is removed from a folder', () => {
  let testSession: TestSession;

  afterEach(async () => {
    await testSession?.clean();
  });

  if (process.platform === 'win32') {
    it('Boilerplate json file should not be generated inside InsufficientPermission folder with "-p" flag', (done) => {
      const folderPath = './test/InsufficientPermission';
      if (!fileSystem.existsSync(folderPath)) {
        fileSystem.mkdirSync(folderPath);
      }
      const command = `C:/Windows/System32/icacls "${folderPath}" /deny "Everyone:(WD)"`;
      exec(command, (error) => {
        if (error) {
          done(error);
        } else {
          const res = execCmd<SfProvarCommandResult>(
            `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GENERATE_COMMAND} -p ./test/InsufficientPermission/bin.json`
          ).shellOutput;
          expect(res.stderr).to.deep.equal(errorInsufficientPermissions);
          done();
        }
      });
    });

    it('Boilerplate json file should not be generated with "-p" flag as Invalid Path, Extension and Insufficient Permissions', (done) => {
      const folderPath = './test/InsufficientPermission';
      if (!fileSystem.existsSync(folderPath)) {
        fileSystem.mkdirSync(folderPath);
      }
      const command = `C:/Windows/System32/icacls "${folderPath}" /deny "Everyone:(WD)"`;
      exec(command, (error) => {
        if (error) {
          done(error);
        } else {
          const res = execCmd<SfProvarCommandResult>(
            `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GENERATE_COMMAND} -p ./test/InsufficientPermission/cd/Dom.uu`
          ).shellOutput;
          expect(res.stderr).to.deep.equal(errorInvalidFileExtension);
          done();
        }
      });
    });

    it('Boilerplate json file should not be generated inside InsufficientPermission folder with "--properties-file" flag and return the result in json format', (done) => {
      const folderPath = './test/InsufficientPermission';
      if (!fileSystem.existsSync(folderPath)) {
        fileSystem.mkdirSync(folderPath);
      }
      const command = `C:/Windows/System32/icacls "${folderPath}" /deny "Everyone:(WD)"`;
      exec(command, (error) => {
        if (error) {
          done(error);
        } else {
          const result = execCmd<SfProvarCommandResult>(
            `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GENERATE_COMMAND} --properties-file ./test/InsufficientPermission/new.json --json`,
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
      if (!fileSystem.existsSync(folderPath)) {
        fileSystem.mkdirSync(folderPath);
      }
      const command = `C:/Windows/System32/icacls "${folderPath}" /deny "Everyone:(WD)"`;
      exec(command, (error) => {
        if (error) {
          done(error);
        } else {
          const result = execCmd<SfProvarCommandResult>(
            `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GENERATE_COMMAND} -p ./test/InsufficientPermission/u/unit.json --json`,
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
      const folderPath = './test/InsufficientPermission';
      if (!fileSystem.existsSync(folderPath)) {
        fileSystem.mkdirSync(folderPath);
      }
      fileSystem.chmodSync(folderPath, '555');
      const res = execCmd<SfProvarCommandResult>(
        `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GENERATE_COMMAND} --properties-file ./test/InsufficientPermission/Test.json`,
        {
          ensureExitCode: 1,
        }
      ).shellOutput;
      expect(res.stderr).to.contain(errorInsufficientPermissions);
    });

    it('Boilerplate json file should not be generated inside InsufficientPermission folder with "-p" flag and return the result in json format', () => {
      const folderPath = './test/InsufficientPermission';
      if (!fileSystem.existsSync(folderPath)) {
        fileSystem.mkdirSync(folderPath);
      }
      fileSystem.chmodSync(folderPath, '555');
      const result = execCmd<SfProvarCommandResult>(
        `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GENERATE_COMMAND} -p ./test/InsufficientPermission/Dummy.json --json`,
        {
          ensureExitCode: 0,
        }
      );
      expect(result.jsonOutput).to.deep.equal(INSUFFICIENT_PERMISSIONS);
    });
  } else if (process.platform === 'darwin') {
    it('Boilerplate json file should not be generated inside InsufficientPermission folder with "-p" flag', () => {
      const folderPath = './test/InsufficientPermission';
      if (!fileSystem.existsSync(folderPath)) {
        fileSystem.mkdirSync(folderPath);
      }
      fileSystem.chmodSync(folderPath, '555');
      const res = execCmd<SfProvarCommandResult>(
        `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GENERATE_COMMAND} -p ./test/InsufficientPermission/Test.json`,
        {
          ensureExitCode: 1,
        }
      ).shellOutput;
      expect(res.stderr).to.contain(errorInsufficientPermissions);
    });

    it('Boilerplate json file should not be generated inside InsufficientPermission folder with "--properties-file" flag and return the result in json format', () => {
      const folderPath = './test/InsufficientPermission';
      if (!fileSystem.existsSync(folderPath)) {
        fileSystem.mkdirSync(folderPath);
      }
      fileSystem.chmodSync(folderPath, '555');
      const result = execCmd<SfProvarCommandResult>(
        `${commandConstants.SF_PROVAR_AUTOMATION_CONFIG_GENERATE_COMMAND} --properties-file ./test/InsufficientPermission/Dummy.json --json`,
        {
          ensureExitCode: 0,
        }
      );
      expect(result.jsonOutput).to.deep.equal(INSUFFICIENT_PERMISSIONS);
    });
  } else {
    expect(process.platform).that.is.oneOf(['win32', 'linux', 'darwin']);
  }
});
