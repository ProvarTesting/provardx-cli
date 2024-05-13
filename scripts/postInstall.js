import { exec } from 'child_process';

const command = 'echo y | sfdx plugins:install @provartesting/provardx-plugins-automation';

exec(command, (error) => {
  if (error) {
    console.error(`Error: ${error.message}`);
    return;
  }
});