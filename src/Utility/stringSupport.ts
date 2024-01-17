export function substringAfter(str: string, separator: string): string {
  if (!str) {
    return str;
  }
  if (separator == null) {
    return '';
  }
  const pos = str.indexOf(separator);
  if (pos === -1) {
    return '';
  }

  return str.substring(pos + separator.length);
}
export function addQuotesAround(array: string[]): string[] {
  return array.map((item) => "'" + item + "'");
}
