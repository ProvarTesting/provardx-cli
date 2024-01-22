/* eslint-disable */
export function getNestedProperty(jsonData: any, property: string): any {
  const propertyPath = property.split('.');
  for (let i = 0; i < propertyPath.length; i++) {
    jsonData = jsonData[propertyPath[i]];
  }
  return jsonData;
}

export function checkNestedProperty(jsonData: any, property: string): boolean {
  const propertyPath = property.split('.');
  for (const nestedProperty of propertyPath) {
    if (!jsonData?.hasOwnProperty(nestedProperty)) {
      return false;
    }
    jsonData = jsonData[nestedProperty];
  }
  return true;
}

export function setNestedProperty(jsonData: any, property: string, value: string | undefined) {
  const propertyPath = property.split('.');
  const propertyPathLength = propertyPath.length;
  for (var i = 0; i < propertyPathLength - 1; i++) {
    var nestedProperty = propertyPath[i];
    if (!jsonData[nestedProperty]) jsonData[nestedProperty] = {};
    jsonData = jsonData[nestedProperty];
  }
  jsonData[propertyPath[propertyPathLength - 1]] = value;
}

export function parseJSONString(jsonInput: string) {
  try {
    return JSON.parse(jsonInput);
  } catch (err) {
    return jsonInput;
  }
}
