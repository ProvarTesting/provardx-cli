import * as fileSystem from 'node:fs';
import { spawn } from 'node:child_process';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { xml2json } from 'xml-js';
import { SfProvarCommandResult, populateResult } from '../../../../Utility/sfProvarCommandResult.js';
import { ProvarConfig } from '../../../../Utility/provarConfig.js';
import { errorMessages } from '../../../../constants/errorMessages.js';
import UserSupport from '../../../../Utility/userSupport.js';
import { getStringAfterSubstring } from '../../../../Utility/stringSupport.js';
import { checkNestedProperty } from '../../../../Utility/jsonSupport.js';
import GenericErrorHandler from '../../../../Utility/genericErrorHandler.js';
import { TestRunError } from '../../../../Utility/TestRunError.js';
import { GenericError } from '../../../../Utility/GenericError.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@provartesting/provardx-cli', 'provar.automation.test.run');

export default class ProvarAutomationTestRun extends SfCommand<SfProvarCommandResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  private genericErrorHandler: GenericErrorHandler = new GenericErrorHandler();

  public async run(): Promise<SfProvarCommandResult> {
    const { flags } = await this.parse(ProvarAutomationTestRun);
    const config: ProvarConfig = await ProvarConfig.loadConfig(this.genericErrorHandler);
    const propertiesFilePath = config.get('PROVARDX_PROPERTIES_FILE_PATH')?.toString();

    if (propertiesFilePath === undefined || !fileSystem.existsSync(propertiesFilePath)) {
      const errorObj: GenericError = new GenericError();
      errorObj.setCode('MISSING_FILE');
      errorObj.setMessage(errorMessages.MISSINGFILEERROR);
      this.genericErrorHandler.addErrorsToList(errorObj);
      return populateResult(flags, this.genericErrorHandler, messages, this.log.bind(this));
    }

    try {
      /* eslint-disable */
      const propertiesdata = fileSystem.readFileSync(propertiesFilePath, { encoding: 'utf8' });
      const propertiesInstance = JSON.parse(propertiesdata);
      const rawProperties = JSON.stringify(propertiesInstance);
      const userSupport = new UserSupport();
      const updateProperties = userSupport.prepareRawProperties(rawProperties);
      const userInfo = await userSupport.getDxUsersInfo(
        propertiesInstance.connectionOverride,
        this.genericErrorHandler
      );
      if (userInfo === null) {
        return populateResult(flags, this.genericErrorHandler, messages, this.log.bind(this));
      }
      const userInfoString = userSupport.prepareRawProperties(JSON.stringify({ dxUsers: userInfo }));
      const projectPath = propertiesInstance.projectPath;
      if (!fileSystem.existsSync(projectPath)) {
        const errorObj: GenericError = new GenericError();
        errorObj.setCode('INVALID_PATH');
        errorObj.setMessage('projectPath doesnot exist');
        this.genericErrorHandler.addErrorsToList(errorObj);
        return populateResult(flags, this.genericErrorHandler, messages, this.log.bind(this));
      }
      const logFilePath = projectPath + '/log.txt';

      const provarDxJarPath = propertiesInstance.provarHome + '/provardx/provardx.jar';
      const testRunCommand =
        'java -cp "' +
        provarDxJarPath +
        '" com.provar.provardx.DxCommandExecuter ' +
        updateProperties +
        ' ' +
        userInfoString +
        ' Runtests';

      await this.runJavaCommand(testRunCommand, logFilePath);
    } catch (error: any) {
      if (error.name === 'SyntaxError') {
        const errorObj: GenericError = new GenericError();
        errorObj.setCode('MALFORMED_FILE');
        errorObj.setMessage(errorMessages.MALFORMEDFILEERROR);
        this.genericErrorHandler.addErrorsToList(errorObj);
      } else if (error.name === 'MultipleFailureError') {
        return populateResult(flags, this.genericErrorHandler, messages, this.log.bind(this));
      } else {
        const errorObj: GenericError = new GenericError();
        errorObj.setCode('TEST_RUN_ERROR');
        errorObj.setMessage(`${error.errorMessage}`);
        this.genericErrorHandler.addErrorsToList(errorObj);
      }
    }
    return populateResult(flags, this.genericErrorHandler, messages, this.log.bind(this));
  }

  private async runJavaCommand(command: string, logFilePath: string): Promise<void> {
    const resolvers: any = {
      done: null,
      error: null,
    };
    const promise = new Promise<void>((resolve, error) => {
      resolvers.done = resolve;
      resolvers.error = error;
    });
    const javaProcessOutput = spawn(command, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });

    javaProcessOutput.stdout.on('data', (data: { toString: () => string }) => {
      const logMessage = data.toString().trim();
      this.extract(logMessage, logFilePath);
    });
    javaProcessOutput.stderr.on('error', (error: { toString: () => string }) => {
      const logError = error.toString().trim();
      this.extract(logError, logFilePath);
      resolvers.done();
      // resolvers.error(error);
    });

    javaProcessOutput.stderr.on('finish', (error: { toString: () => string }) => {
      resolvers.done();
    });
    return promise;
  }

  private extract(logMessage: string, logFilePath: string): void {
    const reportSuccessMsg = 'JUnit XML report written successfully.';
    if (logMessage.includes(reportSuccessMsg)) {
      const xmlJunitReportPath = getStringAfterSubstring(logMessage, reportSuccessMsg);
      this.xmlParser(xmlJunitReportPath);
    }
    fileSystem.appendFileSync(logFilePath, logMessage, { encoding: 'utf-8' });
  }

  private xmlParser(filePath: string): void {
    if (fileSystem.existsSync(filePath)) {
      const xmlContent = fileSystem.readFileSync(filePath, 'utf8');
      const dataString = xml2json(xmlContent, { compact: true });
      const jsondata = JSON.parse(dataString);
      const testsuiteJson = jsondata?.testsuite;
      for (let testCase of testsuiteJson.testcase) {
        if (checkNestedProperty(testCase, 'failure')) {
          const errorObj: TestRunError = new TestRunError();
          errorObj.setTestCasePath(`${testCase._attributes.name}`);
          errorObj.setMessage(`${testCase.failure._cdata}.`);
          this.genericErrorHandler.addErrorsToList(errorObj);
        }
      }
    }
  }
}
