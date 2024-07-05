import { exec, spawn } from 'child_process';

console.log('starting postinstall');
console.log('starting automation');
const proc1 = spawn('echo y | sf plugins install @provartesting/provardx-plugins-automation', { stdio: 'inherit', shell: true, detached: true });

console.log('starting manager');
const proc2 = spawn('echo y | sf plugins install @provartesting/provardx-plugins-manager', { stdio: 'inherit', shell: true, detached: true });


proc1.on('exit', (code) => {
  console.log(`Process 1 exited with code: ${code}`);
});

proc2.on('exit', (code) => {
  console.log(`Process 2 exited with code: ${code}`);
});

proc1.on('error', (error) => {
  console.error(`Process 1 exited with Error: ${error}`);
});

proc2.on('error', (error) => {
  console.error(`Process 1 exited with Error: ${error}`);
});
