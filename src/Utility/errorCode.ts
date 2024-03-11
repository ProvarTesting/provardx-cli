/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

export type ErrorCode =
  | 'MISSING_FILE'
  | 'MALFORMED_FILE'
  | 'MISSING_PROPERTY'
  | 'MISSING_PROPERTIES'
  | 'INVALID_VALUES'
  | 'INVALID_VALUE'
  | 'MISSING_VALUE'
  | 'INVALID_FILE_EXTENSION'
  | 'GENERATE_OPERATION_DENIED'
  | 'INVALID_PATH'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'INVALID_ARGUMENT'
  | 'INVALID_PROPERTY'
  | 'UNKNOWN_PROPERTY'
  | 'DOWNLOAD_ERROR';
