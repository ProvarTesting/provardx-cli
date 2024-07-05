import { execSync } from 'child_process';

const command = 'echo y | sfdx plugins:install @provartesting/provardx-plugins-automation';
const commandm = 'echo y | sfdx plugins:install @provartesting/provardx-plugins-manager';

execSync(command, (error) => {
  if (error) {
    console.error(`Error: ${error.message}`);
    return;
  }
});

execSync(commandm, (error) => {
  if (error) {
    console.error(`Error: ${error.message}`);
    return;
  }
});