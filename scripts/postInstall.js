import { execSync } from 'node:child_process';

const commandToInstallAutomationPlugin = 'echo y | sf plugins install @provartesting/provardx-plugins-automation';
const commandToInstallManagerPlugin = 'echo y | sf plugins install @provartesting/provardx-plugins-manager';

console.log('starting postInstall');

execSync(commandToInstallAutomationPlugin, (error) => {
  if (error) {
    const errormessage = error.message ? error.message.toString('utf-8') : 'Unknown error';
    console.error(`Error: ${errormessage}`);
    return;
  }
});

execSync(commandToInstallManagerPlugin, (error) => {
  if (error) {
    const errormessage = error.message ? error.message.toString('utf-8') : 'Unknown error';
    console.error(`Error: ${errormessage}`);
    return;
  }
});