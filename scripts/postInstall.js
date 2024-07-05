import { execSync } from 'child_process';

try {
  console.log('starting postinstall');
  // console.log('starting automation');

  // const command = 'echo y | sf plugins install @provartesting/provardx-plugins-automation';
  // const commandOutput = execSync(command);
  // console.log(commandOutput);
  // console.log('starting manager');

  const commandm = 'echo y | sf plugins install @provartesting/provardx-plugins-manager';
  const commandOutputm = execSync(commandm)
  console.log(commandOutputm);

  // const commandm = 'echo y | sf plugins install @provartesting/provardx-plugins-manager';
  // execSync(commandm, { stdio: 'inherit' });
} catch (error) {
  console.error(`Error: ${error}`);
}
