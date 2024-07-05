import { execSync } from 'node:child_process';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url)
const messages = Messages.loadMessages('@provartesting/provardx-cli', 'provar.install');

export type ProvarInstallResult = {
  path: string;
};

export default class ProvarInstall extends SfCommand<ProvarInstallResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  /* eslint-disable */
  public async run(): Promise<ProvarInstallResult> {
    process.stdout.write('starting postinstall');

    execSync('echo y | sf plugins install @provartesting/provardx-plugins-automation', { stdio: 'inherit' });
    execSync('echo y | sf plugins install @provartesting/provardx-plugins-manager', { stdio: 'inherit' });
    return {
      path: 'D:\\provardx-cli\\provardx-cli\\src\\commands\\provar\\install.ts',
    };
  }

}

