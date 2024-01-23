export const sfProvarConfigGetCommand = 'sf provar config get';
export const getSuccessJson = {
  status: 0,
  result: {
    success: true,
  },
  warnings: [],
};

export const getResultsPathValue = {
  status: 0,
  result: {
    success: true,
    value: 'C:/Users/anchal.goel/git/ProvarRegressionqam5/test/provardx/Results',
  },
  warnings: [],
};

export const getEnvironmentJsonObject = {
  status: 0,
  result: {
    success: true,
    value: {
      testEnvironment: '${PROVAR_TEST_ENVIRONMENT}',
      webBrowser: 'Chrome',
      webBrowserConfig: 'Full Screen',
      webBrowserProviderName: 'Desktop',
      webBrowserDeviceName: 'Full Screen',
    },
  },
  warnings: [],
};

export const missingPropertyGetJson = {
  status: 0,
  result: {
    success: false,
    errors: [
      {
        code: 'MISSING_PROPERTY',
        message: 'Please, specify a property to get from the properties file.',
      },
    ],
  },
  warnings: [],
};

export const unknownPropertyJson = {
  status: 0,
  result: {
    success: false,
    errors: [
      {
        code: 'UNKNOWN_PROPERTY',
        message: 'The property is not present in the file.',
      },
    ],
  },
  warnings: [],
};
