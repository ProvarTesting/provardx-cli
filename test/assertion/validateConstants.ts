export const sfProvarConfigValidateCommand = 'sf provar config validate';

export const validateSuccessMessage = 'The properties file was validated successfully.\n';

export const missingFileError =
  'Error (1): [MISSING_FILE] The properties file has not been loaded or cannot be accessed.\n';

export const malformedFileError = 'Error (1): [MALFORMED_FILE] The properties file is not a valid JSON.\n';

export const missingPropertyError = "Error (1): [MISSING_PROPERTY] The property 'provarHome' is missing.\n";

export const missingPropertiesError =
  "Error (1): [MISSING_PROPERTIES] The properties 'provarHome', 'projectPath', 'resultsPath', 'metadata.metadataLevel', 'metadata.cachePath', 'environment.webBrowser', 'environment.webBrowserConfig', 'environment.webBrowserProviderName', 'environment.webBrowserDeviceName' are missing.\n";

export const invalidValueError =
  "Error (1): [INVALID_VALUE] The property 'resultsPathDisposition' value is not valid.\n";

export const invalidValuesError =
  "Error (1): [INVALID_VALUES] The properties 'resultsPathDisposition', 'pluginOutputlevel', 'metadata.metadataLevel', 'environment.webBrowser' values are not valid.\n";

export const multipleErrors =
  "Error (1): [MISSING_PROPERTY] The property 'provarHome' is missing. [INVALID_VALUES] The properties 'resultsPathDisposition', 'pluginOutputlevel', 'metadata.metadataLevel', 'environment.webBrowser' values are not valid.\n";

export const validateSuccessJson = {
  status: 0,
  result: {
    success: true,
  },
  warnings: [],
};

export const missingFileJsonError = {
  status: 0,
  result: {
    success: false,
    errors: [
      {
        errorCode: 'MISSING_FILE',
        errorMessage: 'The properties file has not been loaded or cannot be accessed.',
      },
    ],
  },
  warnings: [],
};

export const malformedFileJsonError = {
  status: 0,
  result: {
    success: false,
    errors: [
      {
        errorCode: 'MALFORMED_FILE',
        errorMessage: 'The properties file is not a valid JSON.',
      },
    ],
  },
  warnings: [],
};

export const missingPropertyJsonError = {
  status: 0,
  result: {
    success: false,
    errors: [
      {
        errorCode: 'MISSING_PROPERTY',
        errorMessage: "The property 'provarHome' is missing.",
      },
    ],
  },
  warnings: [],
};

export const missingPropertiesJsonError = {
  status: 0,
  result: {
    success: false,
    errors: [
      {
        errorCode: 'MISSING_PROPERTIES',
        errorMessage:
          "The properties 'provarHome', 'projectPath', 'resultsPath', 'metadata.metadataLevel', 'metadata.cachePath', 'environment.webBrowser', 'environment.webBrowserConfig', 'environment.webBrowserProviderName', 'environment.webBrowserDeviceName' are missing.",
      },
    ],
  },
  warnings: [],
};

export const invalidValueJsonError = {
  status: 0,
  result: {
    success: false,
    errors: [
      {
        errorCode: 'INVALID_VALUE',
        errorMessage: "The property 'resultsPathDisposition' value is not valid.",
      },
    ],
  },
  warnings: [],
};

export const invalidValuesJsonError = {
  status: 0,
  result: {
    success: false,
    errors: [
      {
        errorCode: 'INVALID_VALUES',
        errorMessage:
          "The properties 'resultsPathDisposition', 'pluginOutputlevel', 'metadata.metadataLevel', 'environment.webBrowser' values are not valid.",
      },
    ],
  },
  warnings: [],
};

export const multipleJsonErrors = {
  status: 0,
  result: {
    success: false,
    errors: [
      {
        errorCode: 'MISSING_PROPERTY',
        errorMessage: "The property 'provarHome' is missing.",
      },
      {
        errorCode: 'INVALID_VALUES',
        errorMessage:
          "The properties 'resultsPathDisposition', 'pluginOutputlevel', 'metadata.metadataLevel', 'environment.webBrowser' values are not valid.",
      },
    ],
  },
  warnings: [],
};
