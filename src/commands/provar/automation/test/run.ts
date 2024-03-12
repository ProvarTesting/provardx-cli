import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@provartesting/provardx-cli', 'provar.automation.test.run');

export type ProvarAutomationTestRunResult = {
  path: string;
};

export default class ProvarAutomationTestRun extends SfCommand<ProvarAutomationTestRunResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    name: Flags.string({
      summary: messages.getMessage('flags.name.summary'),
      description: messages.getMessage('flags.name.description'),
      char: 'n',
      required: false,
    }),
  };

  public async run(): Promise<ProvarAutomationTestRunResult> {
    const { flags } = await this.parse(ProvarAutomationTestRun);

    const name = flags.name ?? 'world';
    this.log(
      `hello ${name} from D:\\provardx-cli-checkout\\provardx-cli\\src\\commands\\provar\\automation\\test\\run.ts`
    );
    return {
      path: 'D:\\provardx-cli-checkout\\provardx-cli\\src\\commands\\provar\\automation\\test\\run.ts',
    };
  }
}
