// apps/api/src/media/worker/run-process.ts
//
// Runs ffmpeg, ffprobe and heif-convert for the media worker. Arguments are passed as an array, never
// through a shell, and every path is one the worker created itself, so no uploaded name or byte can
// become a command. Each run has a hard time limit; output is capped so a noisy tool can't exhaust
// memory.
import { spawn } from 'node:child_process';

const MAX_STDOUT_BYTES = 1_048_576;
const STDERR_TAIL_BYTES = 4_096;

export class ProcessFailure extends Error {
  override readonly name = 'ProcessFailure';

  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly signal: NodeJS.Signals | null,
    readonly timedOut: boolean,
    readonly stderrTail: string,
  ) {
    super(message);
  }

  /**
   * A tool that exited with an error could not read the file and never will. A run that was killed
   * (time limit, out of memory) or could not start may succeed on a later attempt.
   */
  get permanent(): boolean {
    return !this.timedOut && this.signal === null && this.exitCode !== null;
  }
}

export async function runProcess(
  command: string,
  args: readonly string[],
  { timeoutMs }: { timeoutMs: number },
): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrTail = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= MAX_STDOUT_BYTES) stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-STDERR_TAIL_BYTES);
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      // Usually ENOENT: the tool is not installed (see FFMPEG_PATH, FFPROBE_PATH, HEIF_CONVERT_PATH).
      reject(new ProcessFailure(`${command} could not start: ${error.message}`, null, null, false, ''));
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      if (exitCode === 0) {
        resolve({ stdout: Buffer.concat(stdout).toString('utf8') });
        return;
      }
      const why = timedOut ? `timed out after ${timeoutMs} ms` : `exited with ${exitCode ?? signal}`;
      reject(
        new ProcessFailure(`${command} ${why}: ${stderrTail.trim()}`, exitCode, signal, timedOut, stderrTail),
      );
    });
  });
}
