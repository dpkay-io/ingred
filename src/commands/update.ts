import { loadConfig, saveConfig } from '../core/config.js';
import { syncSource } from '../core/sources.js';
import { SourceNotFoundError } from '../utils/errors.js';
import { log } from '../utils/logger.js';

export async function updateCommand(
  name?: string,
  opts?: { unpin?: boolean },
): Promise<void> {
  const config = await loadConfig();

  let sources = config.sources;

  if (name) {
    const source = sources.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (!source) {
      throw new SourceNotFoundError(
        name,
        sources.map((s) => s.name),
      );
    }
    sources = [source];
  }

  for (const source of sources) {
    if (source.pin && !opts?.unpin) {
      log.warn(`"${source.name}" is pinned to version ${source.pin}`);
      log.hint(`Use --unpin to remove the pin and update to latest`);
      continue;
    }

    if (opts?.unpin && source.pin) {
      delete source.pin;
      await saveConfig(config);
      log.info(`Unpinned "${source.name}"`);
    }

    await syncSource(source);
    log.success(`Updated "${source.name}"`);
  }
}
