import { execSync } from 'child_process';

const commandToInstallAutomationPlugin = 'echo y | sfdx plugins:install @provartesting/provardx-plugins-automation';
const commandToInstallManagerPlugin = 'echo y | sfdx plugins:install @provartesting/provardx-plugins-manager';

console.log('starting postInstall');

execSync(commandToInstallAutomationPlugin, (error) => {
  if (error) {
    console.error(`Error: ${error.message}`);
    return;
  }
});

execSync(commandToInstallManagerPlugin, (error) => {
  if (error) {
    console.error(`Error: ${error.message}`);
    return;
  }
});