import * as fileSystem from 'node:fs';
import { spawnSync } from 'node:child_process';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { SfProvarCommandResult, populateResult } from '../../../../Utility/sfProvarCommandResult.js';
import ErrorHandler from '../../../../Utility/errorHandler.js';
import { ProvarConfig } from '../../../../Utility/provarConfig.js';
import { errorMessages } from '../../../../constants/errorMessages.js';
import UserSupport from '../../../../Utility/userSupport.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@provartesting/provardx-cli', 'provar.automation.test.run');

export default class ProvarAutomationTestRun extends SfCommand<SfProvarCommandResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  private errorHandler: ErrorHandler = new ErrorHandler();
  public async run(): Promise<SfProvarCommandResult> {
    const { flags } = await this.parse(ProvarAutomationTestRun);

    this.log('asd');

    const config: ProvarConfig = await ProvarConfig.loadConfig(this.errorHandler);
    const propertiesFilePath = config.get('PROVARDX_PROPERTIES_FILE_PATH')?.toString();

    if (propertiesFilePath === undefined || !fileSystem.existsSync(propertiesFilePath)) {
      this.errorHandler.addErrorsToList('MISSING_FILE', errorMessages.MISSINGFILEERROR);
      return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
    }

    try {
      /* eslint-disable */
      const propertiesdata = fileSystem.readFileSync(propertiesFilePath, { encoding: 'utf8' });
      const propertiesInstance = JSON.parse(propertiesdata);
      const rawProperties = JSON.stringify(propertiesInstance);
      const userSupport = new UserSupport();
      const updateProperties = userSupport.prepareRawProperties(rawProperties);
      const userInfo = await userSupport.getDxUsersInfo(propertiesInstance.connectionOverride, this.errorHandler);
      if (userInfo === null) {
        return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
      }
      const userInfoString = userSupport.prepareRawProperties(JSON.stringify({ dxUsers: userInfo }));
      const provarDxJarPath = propertiesInstance.provarHome + '/provardx/provardx.jar';
      const testRunCommand =
        'java -cp "' +
        provarDxJarPath +
        '" com.provar.provardx.DxCommandExecuter ' +
        updateProperties +
        ' ' +
        userInfoString +
        ' ' +
        'Runtests';
      spawnSync(testRunCommand, { shell: true });
      //  const javaProcessOutput = spawnSync(testRunCommand, { shell: true });
      // const testRun = '';
      // if (!fileContainsString(javaProcessOutput.stderr.toString(), testRun)) {
      //   const errorMessage = getStringAfterSubstring(javaProcessOutput.stderr.toString(), 'ERROR');
      //   this.errorHandler.addErrorsToList('TEST_RUN_ERROR', `${errorMessage}`);
      // }
    } catch (error: any) {
      if (error.name === 'SyntaxError') {
        this.errorHandler.addErrorsToList('MALFORMED_FILE', errorMessages.MALFORMEDFILEERROR);
      } else if (error.name === 'MULTIPLE_ERRORSError') {
        return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
      } else {
        this.errorHandler.addErrorsToList('TEST_RUN_ERROR', `${error.errorMessage}`);
      }
    }
    return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
  }
}
