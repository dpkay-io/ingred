import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { ensureDir, fileExists } from '../utils/fs.js';
import { type IngredConfig, defaultConfig } from '../types.js';
import { log } from '../utils/logger.js';

const INGRED_DIR = join(homedir(), '.ingred');
const CONFIG_PATH = join(INGRED_DIR, 'config.json');
const CACHE_DIR = join(INGRED_DIR, 'cache');

export function getIngredDir(): string {
  return INGRED_DIR;
}

export function getCacheDir(): string {
  return CACHE_DIR;
}

export async function loadConfig(): Promise<IngredConfig> {
  if (!(await fileExists(CONFIG_PATH))) {
    return defaultConfig();
  }
  const raw = await readFile(CONFIG_PATH, 'utf-8');
  try {
    return JSON.parse(raw) as IngredConfig;
  } catch {
    log.warn('Config file is corrupted. Using default config.');
    return defaultConfig();
  }
}

export async function saveConfig(config: IngredConfig): Promise<void> {
  await ensureDir(INGRED_DIR);
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
