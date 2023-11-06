import { TestContext } from '@salesforce/core/lib/testSetup';

describe('hello world', () => {
  const $$ = new TestContext();

  beforeEach(() => {});

  afterEach(() => {
    $$.restore();
  });
});
