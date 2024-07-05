import { spawn } from 'child_process';

async function spawnProcess(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, { shell: true });
    proc.on('exit', (code) => {
      resolve();
    });
    proc.on('error', (error) => {
      reject(error);
    });
  });
}

process.stdout.write('starting postinstall');

spawnProcess('echo y | sf plugins install @provartesting/provardx-plugins-automation');
spawnProcess('echo y | sf plugins install @provartesting/provardx-plugins-manager');
