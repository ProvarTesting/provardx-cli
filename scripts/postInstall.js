import { exec } from 'child_process';

const commandToInstallAutomationPlugin = 'echo y | sfdx plugins:install @provartesting/provardx-plugins-automation';
const commandToInstallManagerPlugin = 'echo y | sfdx plugins:install @provartesting/provardx-plugins-manager';

exec(commandToInstallAutomationPlugin, (error) => {
  if (error) {
    console.error(`Error: ${error.message}`);
    return;
  }
});

exec(commandToInstallManagerPlugin, (error) => {
  if (error) {
    console.error(`Error: ${error.message}`);
    return;
  }
});