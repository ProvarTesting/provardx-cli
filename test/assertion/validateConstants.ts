export const sfProvarConfigValidateCommand = 'sf provar config validate';
export const validateSuccessMessage = 'The properties file was validated successfully.\n';
export const missingFileError =
  'Error (1): [MISSING_FILE] The properties file has not been loaded or cannot be accessed.\n';
export const malformedFileError = 'Error (1): [MALFORMED_FILE] The properties file is not a valid JSON.\n';
export const missingPropertiesError =
  "Error (1): [MISSING_PROPERTIES] The properties 'provarHome', 'projectPath', 'resultsPath' are missing.\n";

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
        errorCode: 'MISSING_PROPERTIES',
        errorMessage: "The properties 'provarHome', 'projectPath', 'resultsPath' are missing.",
      },
    ],
  },
  warnings: [],
};
