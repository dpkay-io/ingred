import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { ensureDir, fileExists } from '../utils/fs.js';
import { shortHash } from '../utils/hash.js';
import { type ProjectPrivacyConfig, defaultPrivacyConfig } from '../types.js';
import type { MatchResult } from '../types.js';
import { log } from '../utils/logger.js';

const INGRED_DIR = join(homedir(), '.ingred');

export function getProjectId(workspaceRoot: string): string {
  return shortHash(resolve(workspaceRoot));
}

export function getProjectsDir(baseDir?: string): string {
  return join(baseDir ?? INGRED_DIR, 'projects');
}

export function getPrivateCompiledDir(projectId: string, baseDir?: string): string {
  return join(baseDir ?? INGRED_DIR, 'compiled', projectId);
}

function ingredientKey(m: MatchResult): string {
  return `${m.ingredient.sourceName}/${m.ingredient.relativePath}`;
}

export async function loadPrivacyConfig(
  projectId: string,
  baseDir?: string,
): Promise<ProjectPrivacyConfig> {
  const configPath = join(getProjectsDir(baseDir), projectId, 'config.json');
  if (!(await fileExists(configPath))) {
    return defaultPrivacyConfig();
  }
  try {
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.privateIngredients)) {
      log.warn('Privacy config has unexpected shape. Using defaults.');
      return defaultPrivacyConfig();
    }
    return parsed as ProjectPrivacyConfig;
  } catch {
    log.warn('Privacy config is corrupted. Using defaults.');
    return defaultPrivacyConfig();
  }
}

export async function savePrivacyConfig(
  projectId: string,
  config: ProjectPrivacyConfig,
  baseDir?: string,
): Promise<void> {
  const dir = join(getProjectsDir(baseDir), projectId);
  await ensureDir(dir);
  await writeFile(join(dir, 'config.json'), JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export async function clearPrivacyConfig(
  projectId: string,
  baseDir?: string,
): Promise<void> {
  await savePrivacyConfig(projectId, defaultPrivacyConfig(), baseDir);
}

export function splitByPrivacy(
  matches: MatchResult[],
  config: ProjectPrivacyConfig,
): { publicMatches: MatchResult[]; privateMatches: MatchResult[] } {
  const privateSet = new Set(config.privateIngredients);
  const publicMatches: MatchResult[] = [];
  const privateMatches: MatchResult[] = [];

  for (const match of matches) {
    if (privateSet.has(ingredientKey(match))) {
      privateMatches.push(match);
    } else {
      publicMatches.push(match);
    }
  }

  return { publicMatches, privateMatches };
}
