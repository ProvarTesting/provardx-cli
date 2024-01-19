/* eslint-disable */
export function getNestedProperty(jsonData: any, attribute: string): any {
  const attributePath = attribute.split('.');
  for (let i = 0; i < attributePath.length; i++) {
    jsonData = jsonData[attributePath[i]];
  }
  return jsonData;
}

export function checkNestedProperty(jsonData: any, attribute: string): boolean {
  const attributePath = attribute.split('.');
  for (const attr of attributePath) {
    if (!jsonData?.hasOwnProperty(attr)) {
      return false;
    }
    jsonData = jsonData[attr];
  }
  return true;
}

export function setNestedProperty(jsonData: any, attribute: string, value: string | undefined) {
  const attributePath = attribute.split('.');
  const attributesLength = attributePath.length;
  for (var i = 0; i < attributesLength - 1; i++) {
    var arg = attributePath[i];
    if (!jsonData[arg]) jsonData[arg] = {};
    jsonData = jsonData[arg];
  }
  jsonData[attributePath[attributesLength - 1]] = value;
}

export function parseJSONString(jsonInput: string) {
  try {
    // Attempt to parse the input as JSON
    return JSON.parse(jsonInput);
  } catch (err) {
    // If parsing as JSON fails, treat it as a regular string
    return jsonInput;
  }
}
