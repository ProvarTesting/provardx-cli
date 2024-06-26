/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

export const successMessage = 'The properties file was generated successfully.\n';
export const errorInvalidPath = 'Error (1): [INVALID_PATH] The provided path does not exist or is invalid.\n\n';
export const errorInvalidFileExtension =
  'Error (1): [INVALID_FILE_EXTENSION] Only the .json file extension is supported.\n\n';
export const errorInsufficientPermissions =
  'Error (1): [INSUFFICIENT_PERMISSIONS] The user does not have permissions to create the file.\n\n';

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
    errors: [
      {
        code: 'INVALID_FILE_EXTENSION',
        message: 'Only the .json file extension is supported.',
      },
    ],
  },
  warnings: [],
};

export const INSUFFICIENT_PERMISSIONS = {
  status: 0,
  result: {
    success: false,
    errors: [
      {
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'The user does not have permissions to create the file.',
      },
    ],
  },
  warnings: [],
};
export const INVALID_PATH = {
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
