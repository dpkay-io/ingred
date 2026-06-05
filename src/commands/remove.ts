import { rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { loadConfig, saveConfig, getCacheDir } from '../core/config.js';
import { SourceNotFoundError } from '../utils/errors.js';
import { log } from '../utils/logger.js';

export async function removeCommand(name: string): Promise<void> {
  const config = await loadConfig();
  const idx = config.sources.findIndex(
    (s) => s.name.toLowerCase() === name.toLowerCase(),
  );

  if (idx === -1) {
    throw new SourceNotFoundError(
      name,
      config.sources.map((s) => s.name),
    );
  }

  const source = config.sources[idx];

  if (source.type === 'git') {
    const cacheDir = resolve(getCacheDir());
    const resolved = resolve(source.cachePath);
    if (resolved.startsWith(cacheDir + sep)) {
      try {
        await rm(source.cachePath, { recursive: true, force: true });
      } catch {
        log.warn(`Could not remove cache directory: ${source.cachePath}`);
      }
    } else {
      log.warn(`Cache path is outside ingred cache directory, skipping removal: ${source.cachePath}`);
    }
  }

  config.sources.splice(idx, 1);
  await saveConfig(config);

  log.success(`Removed "${source.name}"`);
}
