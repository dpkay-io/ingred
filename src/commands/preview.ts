import { loadConfig } from '../core/config.js';
import { collectIngredients } from '../core/sources.js';
import { compile } from '../core/compiler.js';
import { getTargetRegistry, registerCustomTargets } from '../core/emitter.js';
import { resolveTargetIds } from '../core/pipeline.js';
import { detectStack } from '../core/detector.js';
import { IngredError, NoSourcesError } from '../utils/errors.js';
import { log } from '../utils/logger.js';
import { resolve } from 'node:path';
import type { MatchResult } from '../types.js';

export async function previewCommand(
  ingredientKey: string,
  opts: { targets?: string },
): Promise<void> {
  const config = await loadConfig();

  if (config.sources.length === 0) {
    throw new NoSourcesError();
  }

  const customTargetIds = new Set<string>(
    (config.customTargets ?? []).map((ct) => ct.id),
  );

  if (customTargetIds.size > 0) {
    registerCustomTargets(config.customTargets!);
  }

  const targetIds = resolveTargetIds(opts.targets, config.settings.targets, customTargetIds);

  // Search all sources for the ingredient matching the key (sourceName/relativePath)
  let foundMatch: MatchResult | null = null;

  for (const source of config.sources) {
    const { ingredients } = await collectIngredients(source);

    for (const ingredient of ingredients) {
      const key = `${ingredient.sourceName}/${ingredient.relativePath}`;
      if (key === ingredientKey) {
        foundMatch = {
          ingredient,
          matchTier: 1,
          matchReason: 'preview (direct lookup)',
        };
        break;
      }
    }

    if (foundMatch) break;
  }

  if (!foundMatch) {
    throw new IngredError(
      `Ingredient "${ingredientKey}" not found.`,
      'Use `ingred list --verbose` to see available ingredient keys (sourceName/relativePath).',
    );
  }

  const compiled = compile([foundMatch]);

  const workspaceRoot = resolve('.');
  const stack = await detectStack(workspaceRoot);

  const registry = getTargetRegistry();
  const SEPARATOR = '─'.repeat(60);

  log.info('');
  log.header(`Preview: ${ingredientKey}`);
  log.info('');

  for (const targetId of targetIds) {
    const target = registry.get(targetId);
    if (!target) continue;

    // Merge global + project for display (same approach as diff command)
    const merged = target.globalOutputPath
      ? compiled.project
      : {
          personaSection: [compiled.global.personaSection, compiled.project.personaSection]
            .filter(Boolean)
            .join('\n\n'),
          engineeringSection: [
            compiled.global.engineeringSection,
            compiled.project.engineeringSection,
          ]
            .filter(Boolean)
            .join('\n\n'),
        };

    const formatted = target.format(merged, stack);

    log.header(`  ${targetId} → ${target.outputPath}`);
    log.info(SEPARATOR);
    log.info(formatted);
    log.info(SEPARATOR);
    log.info('');
  }
}
