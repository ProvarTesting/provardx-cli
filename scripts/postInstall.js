import { execSync } from 'child_process';

try {
  const command = 'echo y | sf plugins install @provartesting/provardx-plugins-automation';
  execSync(command, { stdio: 'inherit' });

  const commandm = 'echo y | sf plugins install @provartesting/provardx-plugins-manager';
  execSync(commandm, { stdio: 'inherit' });
} catch (error) {
  let textDecoder = new TextDecoder('utf-8');
  const errormsg = textDecoder.decode(error.message);
  console.error(`Error: ${errormsg}`);
}
