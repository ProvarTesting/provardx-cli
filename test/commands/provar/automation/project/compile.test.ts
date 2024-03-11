import { TestContext } from '@salesforce/core/lib/testSetup.js';
import { expect } from 'chai';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import ProvarAutomationProjectCompile from '../../../../../src/commands/provar/automation/project/compile.js';

describe('provar automation project compile', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  it('runs hello', async () => {
    await ProvarAutomationProjectCompile.run([]);
    const output = sfCommandStubs.log
      .getCalls()
      .flatMap((c) => c.args)
      .join('\n');
    expect(output).to.include('hello world');
  });

  it('runs hello with --json and no provided name', async () => {
    const result = await ProvarAutomationProjectCompile.run([]);
    expect(result.path).to.equal(
      'D:\\provardx-cli-checkout\\provardx-cli\\src\\commands\\provar\\automation\\project\\compile.ts'
    );
  });

  it('runs hello world --name Astro', async () => {
    await ProvarAutomationProjectCompile.run(['--name', 'Astro']);
    const output = sfCommandStubs.log
      .getCalls()
      .flatMap((c) => c.args)
      .join('\n');
    expect(output).to.include('hello Astro');
  });
});
