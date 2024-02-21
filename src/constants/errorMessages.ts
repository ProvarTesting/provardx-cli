/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
export enum errorMessages {
  INVALID_PATH = 'The provided path does not exist or is invalid.',
  GENERATE_OPERATION_DENIED = 'The operation was cancelled.',
  MISSINGFILEERROR = 'The properties file has not been loaded or cannot be accessed.',
  MALFORMEDFILEERROR = 'The properties file is not a valid JSON.',
  MISSING_VALUE = 'The value is missing.',
  MISSING_PROPERTY = 'The property is missing.',
  INVALID_ARGUMENT = 'The property/value cannot be parsed.',
  INVALID_VALUE = 'The value cannot be parsed.',
  INVALID_PROPERTY = 'The property cannot be parsed.',
  MISSING_PROPERTY_GET = 'Please, specify a property to get from the properties file.',
  UNKNOWN_PROPERTY = 'The property is not present in the file.',
}
