/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fs from 'fs';
import propertyFileContent from '../constants/propertyFileContent.json';

/**
 * Contains all the methods that deals with generic file related operations.
 *
 */

export function generateFile(filePath: string): void {
  fs.writeFileSync(filePath, JSON.stringify(propertyFileContent, null, 3));
}

export function getExtension(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i < 0 ? '' : filename.substr(i);
}
