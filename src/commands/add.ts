import { resolve, basename } from 'node:path';
import { rm } from 'node:fs/promises';
import { loadConfig, saveConfig, getCacheDir } from '../core/config.js';
import { ensureDir, fileExists, walkMarkdownFiles } from '../utils/fs.js';
import { isGitUrl, assertGitAvailable, gitClone, gitPull, gitCurrentBranch } from '../utils/git.js';
import { shortHash } from '../utils/hash.js';
import { IngredError } from '../utils/errors.js';
import { log } from '../utils/logger.js';
import type { IngredSource } from '../types.js';

export async function addCommand(
  source: string,
  opts: { branch?: string },
): Promise<void> {
  const config = await loadConfig();
  const isGit = isGitUrl(source);
  let cachePath: string;
  let name: string;

  if (isGit) {
    await assertGitAvailable();
    const hash = shortHash(source);
    cachePath = resolve(getCacheDir(), hash);
    name = deriveNameFromUrl(source);

    await ensureDir(getCacheDir());

    if (await fileExists(resolve(cachePath, '.git'))) {
      const needsReclone = opts.branch
        ? await needsBranchSwitch(cachePath, opts.branch)
        : false;

      if (needsReclone) {
        log.info(`Branch changed to "${opts.branch}", re-cloning...`);
        await rm(cachePath, { recursive: true, force: true });
        await gitClone(source, cachePath, opts.branch);
      } else {
        log.info(`Updating existing cache for "${name}"...`);
        try {
          await gitPull(cachePath);
        } catch {
          log.info('Pull failed, re-cloning fresh...');
          await rm(cachePath, { recursive: true, force: true });
          await gitClone(source, cachePath, opts.branch);
        }
      }
    } else {
      log.info(`Cloning ${source}...`);
      await gitClone(source, cachePath, opts.branch);
    }
  } else {
    cachePath = resolve(source);
    if (!(await fileExists(cachePath))) {
      throw new IngredError(
        `Directory not found: ${cachePath}`,
        'Check that the path exists and is accessible.',
      );
    }
    name = basename(cachePath);
  }

  const mdFiles = await walkMarkdownFiles(cachePath);
  if (mdFiles.length === 0) {
    throw new IngredError(
      `No markdown files found in ${cachePath}`,
      'Are you pointing to the right directory?',
    );
  }

  const duplicateOrigin = config.sources.find(
    (s) => s.origin === (isGit ? source : cachePath),
  );
  if (duplicateOrigin) {
    log.info(`Source "${duplicateOrigin.name}" already points to this origin. Syncing instead.`);
    await saveConfig(config);
    log.success(`"${duplicateOrigin.name}" is up to date (${mdFiles.length} ingredient files found)`);
    return;
  }

  const existing = config.sources.find((s) => s.name === name);
  if (existing) {
    let suffix = 2;
    while (config.sources.some((s) => s.name === `${name}-${suffix}`)) {
      suffix++;
    }
    name = `${name}-${suffix}`;
    log.warn(`Name "${existing.name}" already taken, using "${name}" instead.`);
  }

  const entry: IngredSource = {
    name,
    type: isGit ? 'git' : 'local',
    origin: isGit ? source : cachePath,
    cachePath,
    addedAt: new Date().toISOString(),
    ...(opts.branch ? { branch: opts.branch } : {}),
  };

  config.sources.push(entry);
  await saveConfig(config);

  log.success(`Added "${name}" (${mdFiles.length} ingredient files found)`);
}

function deriveNameFromUrl(url: string): string {
  const cleaned = url.replace(/\.git$/, '').replace(/\/$/, '');
  const parts = cleaned.split(/[\/:]/).filter(Boolean);
  return parts[parts.length - 1] || 'unnamed';
}

async function needsBranchSwitch(repoPath: string, targetBranch: string): Promise<boolean> {
  try {
    const current = await gitCurrentBranch(repoPath);
    return current !== targetBranch;
  } catch {
    return true;
  }
}
