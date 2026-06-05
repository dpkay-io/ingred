import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GitNotAvailableError } from './errors.js';

const execFileAsync = promisify(execFile);

export async function isGitAvailable(): Promise<boolean> {
  try {
    await execFileAsync('git', ['--version']);
    return true;
  } catch {
    return false;
  }
}

export async function assertGitAvailable(): Promise<void> {
  if (!(await isGitAvailable())) {
    throw new GitNotAvailableError();
  }
}

export async function gitClone(url: string, dest: string, branch?: string): Promise<void> {
  const args = ['clone', '--depth', '1'];
  if (branch) {
    args.push('--branch', branch);
  }
  args.push(url, dest);
  await execFileAsync('git', args, { timeout: 60_000 });
}

export async function gitPull(repoPath: string): Promise<void> {
  await execFileAsync('git', ['-C', repoPath, 'pull', '--ff-only'], {
    timeout: 30_000,
  });
}

export async function gitCurrentBranch(repoPath: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', repoPath, 'rev-parse', '--abbrev-ref', 'HEAD'],
    { timeout: 10_000 },
  );
  return stdout.trim();
}

export function isGitUrl(input: string): boolean {
  return (
    input.includes('://') ||
    input.endsWith('.git') ||
    input.startsWith('git@') ||
    input.startsWith('github.com/') ||
    input.startsWith('gitlab.com/')
  );
}
