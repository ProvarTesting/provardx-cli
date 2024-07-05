import { exec, execSync } from 'child_process';

try {
  const command = 'echo y | sf plugins install @provartesting/provardx-plugins-automation';
  const commandOutput = execSync(command);
  console.log(commandOutput);
  const commandm = 'echo y | sf plugins install @provartesting/provardx-plugins-manager';
  const commandOutputm = execSync(commandm)
  console.log(commandOutputm);

  // const commandm = 'echo y | sf plugins install @provartesting/provardx-plugins-manager';
  // execSync(commandm, { stdio: 'inherit' });
} catch (error) {
  console.error(`Error: ${error}`);
}
