import { execSync } from 'node:child_process';

const commandToInstallAutomationPlugin = 'echo y | sf plugins install @provartesting/provardx-plugins-automation';
const commandToInstallManagerPlugin = 'echo y | sf plugins install @provartesting/provardx-plugins-manager';

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