import { exec } from 'child_process';

try {
  const command = 'echo y | sf plugins install @provartesting/provardx-plugins-automation';
  exec(command, { stdio: 'inherit' });

  // const commandm = 'echo y | sf plugins install @provartesting/provardx-plugins-manager';
  // execSync(commandm, { stdio: 'inherit' });
} catch (error) {
  console.error(`Error: ${error.message}`);
}
