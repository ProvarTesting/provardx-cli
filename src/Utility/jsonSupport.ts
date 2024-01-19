/* eslint-disable */
export function getNestedProperty(jsondata: any, attribute: string): any {
  const attributes = attribute.split('.');
  for (let i = 0; i < attributes.length; i++) {
    jsondata = jsondata[attributes[i]];
  }
  return jsondata;
}

export function checkNestedProperty(jsondata: any, attribute: string): boolean {
  const attributes = attribute.split('.');
  for (const attr of attributes) {
    if (!jsondata?.hasOwnProperty(attr)) {
      return false;
    }
    jsondata = jsondata[attr];
  }
  return true;
}

export function setNestedProperty(jsondata: any, attribute: string, value: string | undefined) {
  const argList = attribute.split('.');
  const arglen = argList.length;
  for (var i = 0; i < arglen - 1; i++) {
    var arg = argList[i];
    if (!jsondata[arg]) jsondata[arg] = {};
    jsondata = jsondata[arg];
  }
  jsondata[argList[arglen - 1]] = value;
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
