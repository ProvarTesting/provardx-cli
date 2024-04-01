/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
/* eslint-disable */

import * as fs from 'node:fs';
import StreamZip from 'node-stream-zip';
import { propertyFileContent } from '../constants/propertyFileContent.js';

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

export function unzipFile(srcDirectory: string, targetDirectory: string, onComplete: () => void): void {
  const zip = new StreamZip({
    file: srcDirectory,
    storeEntries: true,
  });
  zip.on('ready', () => {
    zip.extract(null, targetDirectory, () => {
      zip.close();
      onComplete();
    });
  });
}

export function unlinkFileIfExist(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function fileContainsString(fileContent: string, searchString: string): boolean {
  return fileContent.includes(searchString);
}
