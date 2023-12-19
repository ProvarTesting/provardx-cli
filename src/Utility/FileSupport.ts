import * as fs from 'fs';
import propertyFileContent from '../constants/propertyFileContent.json';

export function generateFile(filePath: string): void {
  fs.writeFileSync(filePath, JSON.stringify(propertyFileContent, null, 3));
}

export function getExtension(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i < 0 ? '' : filename.substr(i);
}
