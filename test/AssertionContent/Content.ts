export const DEFAULT_PROPERTIES_FILE_CONTENT = {
  provarHome: '{env.ProvarHome}',
  projectPath: '{env.ProvarProjectPath}',
  resultsPath: '{env.ProvarResultsPath}',
  smtpPath: '',
  resultsPathDisposition: 'Increment',
  testOutputLevel: 'BASIC',
  pluginOutputlevel: 'WARNING',
  stopOnError: false,
  lightningMode: true,
  connectionRefreshType: 'Reload',
  metadata: {
    metadataLevel: 'Reuse',
    cachePath: '../.provarCaches',
  },
  environment: {
    testEnvironment: '{env.ProvarTestEnvironment}',
    webBrowser: 'Chrome',
    webBrowserConfig: 'Full Screen',
    webBrowserProviderName: 'Desktop',
    webBrowserDeviceName: 'Full Screen',
  },
  testprojectSecrets: '{env.ProvarSecretsPassword}',
};

export const PASS_FILE_CONTENT = {
  status: 0,
  result: {
    success: true,
  },
  warnings: [],
};

export const INVALID_FILE_EXTENSION = {
  status: 0,
  result: {
    success: false,
    error: {
      code: 'INVALID_FILE_EXTENSION',
      message: 'Only the .json file extension is supported.',
    },
  },
  warnings: [],
};

export const INSUFFICIENT_PERMISSIONS = {
  status: 0,
  result: {
    success: false,
    error: {
      code: 'INSUFFICIENT_PERMISSIONS',
      message: 'The user does not have permissions to create the file.',
    },
  },
  warnings: [],
};
export const INVALID_PATH = {
  status: 0,
  result: {
    success: false,
    error: {
      code: 'INVALID_PATH',
      message: 'The provided path does not exist or is invalid.',
    },
  },
  warnings: [],
};
