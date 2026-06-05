import { resolve } from 'node:path';
import { loadConfig } from '../core/config.js';
import { collectIngredients } from '../core/sources.js';
import { detectStack } from '../core/detector.js';
import { matchIngredients } from '../core/matcher.js';
import { walkMarkdownFiles } from '../utils/fs.js';
import { log } from '../utils/logger.js';
import { NoSourcesError } from '../utils/errors.js';
import type { IngredientFile, ExternalMapping } from '../types.js';

export async function listCommand(opts: {
  verbose?: boolean;
  matched?: boolean;
}): Promise<void> {
  const config = await loadConfig();

  if (config.sources.length === 0) {
    throw new NoSourcesError();
  }

  log.header('Ingredient Sources\n');

  for (const source of config.sources) {
    const mdFiles = await walkMarkdownFiles(source.cachePath);
    log.info(`  ${source.name}`);
    log.item('    Type', source.type);
    log.item('    Origin', source.origin);
    log.item('    Files', `${mdFiles.length} markdown`);

    if (opts.verbose) {
      for (const f of mdFiles) {
        const rel = f.slice(source.cachePath.length + 1).replace(/\\/g, '/');
        log.info(`      - ${rel}`);
      }
    }
  }

  if (opts.matched) {
    log.info('');
    log.header('Matching against current workspace\n');

    const workspaceRoot = resolve('.');
    const stack = await detectStack(workspaceRoot);
    const techList = [...stack.technologies].sort().join(', ');

    log.item('  Stack', techList || '(none)');
    log.info('');

    const allIngredients: IngredientFile[] = [];
    const allMappings: ExternalMapping[] = [];

    for (const source of config.sources) {
      const { ingredients, mappings } = await collectIngredients(source);
      allIngredients.push(...ingredients);
      allMappings.push(...mappings);
    }

    const matches = matchIngredients(allIngredients, stack, allMappings);

    if (matches.length === 0) {
      log.warn('No ingredients match the current workspace.');
    } else {
      log.info(`  ${matches.length} of ${allIngredients.length} ingredients matched:\n`);
      for (const m of matches) {
        log.success(`${m.ingredient.sourceName}/${m.ingredient.relativePath}`);
        log.hint(`    Tier ${m.matchTier}: ${m.matchReason}`);
      }
    }
  }
}
