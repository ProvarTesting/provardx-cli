export const DEFAULT_PROPERTIES_FILE_CONTENT = `{
   "provarHome":"{env.ProvarHome}",
   "projectPath":"{env.ProvarProjectPath}",
   "resultsPath":"{env.ProvarResultsPath}",
   "smtpPath": "",
   "resultsPathDisposition": "Increment", 
   "testOutputLevel":"BASIC",
   "pluginOutputlevel":"WARNING",
   "stopOnError":false,
   "lightningMode":true,
   "connectionRefreshType":"Reload",
   "metadata":{
      "metadataLevel":"Reuse",
      "cachePath":"../.provarCaches"
   },
   "environment":{
      "testEnvironment":"{env.ProvarTestEnvironment}",
      "webBrowser":"Chrome",
      "webBrowserConfig":"Full Screen",
      "webBrowserProviderName":"Desktop",
      "webBrowserDeviceName":"Full Screen"
   },
   "testprojectSecrets":"{env.ProvarSecretsPassword}"
}
`;
