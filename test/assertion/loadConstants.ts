/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

export const loadSuccessMessage = 'The properties file was loaded successfully.\n';
export const multipleErrors =
  "Error (1): [MISSING_PROPERTY] The property 'projectPath' is missing. [INVALID_VALUES] The properties 'resultsPathDisposition', 'testOutputLevel', 'pluginOutputlevel', 'stopOnError', 'lightningMode', 'metadata.metadataLevel', 'environment.webBrowser' values are not valid.\n";

export const loadSuccessJson = {
  status: 0,
  result: {
    success: true,
  },
  warnings: [],
};

export const invalidPathJsonError = {
  status: 0,
  result: {
    success: false,
    errors: [
      {
        code: 'INVALID_PATH',
        message: 'The provided path does not exist or is invalid.',
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
        code: 'MISSING_PROPERTY',
        message: "The property 'projectPath' is missing.",
      },
      {
        code: 'INVALID_VALUES',
        message:
          "The properties 'resultsPathDisposition', 'testOutputLevel', 'pluginOutputlevel', 'stopOnError', 'lightningMode', 'metadata.metadataLevel', 'environment.webBrowser' values are not valid.",
      },
    ],
  },
  warnings: [],
};
