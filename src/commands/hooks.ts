import { readFile, writeFile, unlink, chmod } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileExists, ensureDir } from '../utils/fs.js';
import { log } from '../utils/logger.js';

const HOOK_SENTINEL = '# Installed by ingred.';

const HOOK_NAMES = ['post-checkout', 'post-merge'] as const;

const HOOK_CONTENT = `#!/bin/sh
${HOOK_SENTINEL} Run \`ingred uninstall-hooks\` to remove.
ingred mix --quiet 2>/dev/null || true
`;

export async function installHooksCommand(): Promise<void> {
  const gitDir = resolve('.git');

  if (!(await fileExists(gitDir))) {
    log.error('No .git directory found. Run this command from the root of a git repository.');
    process.exit(1);
  }

  const hooksDir = join(gitDir, 'hooks');
  await ensureDir(hooksDir);

  let installed = 0;
  let skipped = 0;

  for (const hookName of HOOK_NAMES) {
    const hookPath = join(hooksDir, hookName);

    if (await fileExists(hookPath)) {
      const existing = await readFile(hookPath, 'utf-8');

      if (existing.includes(HOOK_SENTINEL)) {
        log.hint(`${hookName}: already installed, skipping`);
        skipped++;
        continue;
      }

      log.warn(`${hookName}: existing hook not managed by ingred — skipping to avoid overwriting`);
      skipped++;
      continue;
    }

    await writeFile(hookPath, HOOK_CONTENT, 'utf-8');

    try {
      await chmod(hookPath, 0o755);
    } catch {
      // chmod may fail on Windows — that's OK
    }

    log.success(`Installed ${hookName} hook`);
    installed++;
  }

  if (installed > 0) {
    log.hint('ingred mix will now run automatically after git checkout and merge.');
  } else if (skipped === HOOK_NAMES.length) {
    log.info('No hooks were installed.');
  }
}

export async function uninstallHooksCommand(): Promise<void> {
  const gitDir = resolve('.git');

  if (!(await fileExists(gitDir))) {
    log.error('No .git directory found. Run this command from the root of a git repository.');
    process.exit(1);
  }

  const hooksDir = join(gitDir, 'hooks');
  let removed = 0;

  for (const hookName of HOOK_NAMES) {
    const hookPath = join(hooksDir, hookName);

    if (!(await fileExists(hookPath))) {
      log.hint(`${hookName}: not found, skipping`);
      continue;
    }

    const content = await readFile(hookPath, 'utf-8');

    if (!content.includes(HOOK_SENTINEL)) {
      log.warn(`${hookName}: not managed by ingred — skipping`);
      continue;
    }

    await unlink(hookPath);
    log.success(`Removed ${hookName} hook`);
    removed++;
  }

  if (removed === 0) {
    log.info('No ingred-managed hooks were found.');
  }
}
