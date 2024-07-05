import { exec } from 'child_process';

console.log('starting postinstall');
console.log('starting automation');
const proc1 = exec('echo y | sf plugins install @provartesting/provardx-plugins-automation', (error, stdout, stderr) => {
  if (error) {
    console.error(`Error: ${error}`);
    return;
  }
  console.log(`stdout: ${stdout}`);
  console.error(`stderr: ${stderr}`);
});

console.log('starting manager');
const proc2 = exec('echo y | sf plugins install @provartesting/provardx-plugins-manager', (error, stdout, stderr) => {
  if (error) {
    console.error(`Error: ${error}`);
    return;
  }
  console.log(`stdout: ${stdout}`);
  console.error(`stderr: ${stderr}`);
});


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
