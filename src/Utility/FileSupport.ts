import * as fs from 'fs';
import { DEFAULT_PROPERTIES_FILE_CONTENT } from '../constants/PropertyFileContent';

//  eslint-disable-next-line
export function generatePropertyFile(filePath: string, log: Function): void {
  fs.writeFileSync(filePath, DEFAULT_PROPERTIES_FILE_CONTENT);
  log('The properties file was generated successfully.');
}

export function getExtension(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i < 0 ? '' : filename.substr(i);
}
