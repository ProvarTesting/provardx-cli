import * as fileSystem from 'node:fs';
import { spawn } from 'node:child_process';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { xml2json } from 'xml-js';
import { SfProvarCommandResult, populateResult } from '../../../../Utility/sfProvarCommandResult.js';
import ErrorHandler from '../../../../Utility/errorHandler.js';
import { ProvarConfig } from '../../../../Utility/provarConfig.js';
import { errorMessages } from '../../../../constants/errorMessages.js';
import UserSupport from '../../../../Utility/userSupport.js';
import { getStringAfterSubstring } from '../../../../Utility/stringSupport.js';
import { checkNestedProperty } from '../../../../Utility/jsonSupport.js';

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
      const projectPath = propertiesInstance.projectPath;
      if (!fileSystem.existsSync(projectPath)) {
        this.errorHandler.addErrorsToList('INVALID_PATH', 'prjectPath doesnot exist');
        return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
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
        this.errorHandler.addErrorsToList('MALFORMED_FILE', errorMessages.MALFORMEDFILEERROR);
      } else if (error.name === 'MULTIPLE_ERRORSError') {
        return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
      } else {
        this.errorHandler.addErrorsToList('TEST_RUN_ERROR', `${error.errorMessage}`);
      }
    }
    return populateResult(flags, this.errorHandler, messages, this.log.bind(this));
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
          this.errorHandler.addDynamicErrorsToList(`${testCase._attributes.name}`, `${testCase.failure._cdata}.`);
        }
      }
    }
  }
}
