import { exec } from 'child_process';

const command = 'echo y | sfdx plugins:install @provartesting/provardx-plugins-automation';
const commandm = 'echo y | sfdx plugins:install @provartesting/provardx-plugins-manager';

exec(command, (error) => {
  if (error) {
    console.error(`Error: ${error.message}`);
    return;
  }
});

exec(commandm, (error) => {
  if (error) {
    console.error(`Error: ${error.message}`);
    return;
  }
});