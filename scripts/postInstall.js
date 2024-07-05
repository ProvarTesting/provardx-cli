import { spawn } from 'child_process';


async function spawnProcess(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, { stdio: 'inherit', shell: true });
    proc.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Process exited with code: ${code}`));
      }
    });
    proc.on('error', (error) => {
      reject(error);
    });
  });
}

process.stdout.write('starting postinstall');

await spawnProcess('echo y | sf plugins install @provartesting/provardx-plugins-automation');
await spawnProcess('echo y | sf plugins install @provartesting/provardx-plugins-manager');
