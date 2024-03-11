import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import { cli } from 'cli-ux';
/**
 * Executes the provided dx command.
 *
 * @param command Command string
 * @param message Message to be displayed while command execution is in progress.
 */
/* eslint-disable */
export async function executeCommand(command: string, message: string): Promise<any> {
  if (message) {
    cli.action.start(message);
  }
  let isSucessful = false;
  const execPromise = promisify(exec);
  try {
    const result = await execPromise(command);
    isSucessful = true;
    return result.stdout;
  } catch (e: any) {
    return e.stdout;
  } finally {
    if (message) {
      cli.action.stop(isSucessful ? 'successful' : 'failed');
    }
  }
}
