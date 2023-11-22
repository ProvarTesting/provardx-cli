import * as fs from 'fs';
import PropertyFileContent from '../constants/PropertyFileContent.json';

export function generateFile(filePath: string): void {
  fs.writeFileSync(filePath, JSON.stringify(PropertyFileContent, null, 3));
}

export function getExtension(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i < 0 ? '' : filename.substr(i);
}
