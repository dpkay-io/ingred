import { resolve } from 'node:path';
import { loadConfig } from '../core/config.js';
import { syncSource, collectIngredients } from '../core/sources.js';
import { detectStack } from '../core/detector.js';
import { matchIngredients } from '../core/matcher.js';
import {
  getProjectId,
  loadPrivacyConfig,
  savePrivacyConfig,
  clearPrivacyConfig,
} from '../core/privacy.js';
import { NoSourcesError } from '../utils/errors.js';
import { log } from '../utils/logger.js';
import type { IngredientFile, ExternalMapping } from '../types.js';

export async function privacyListCommand(): Promise<void> {
  const config = await loadConfig();
  if (config.sources.length === 0) {
    throw new NoSourcesError();
  }

  const workspaceRoot = resolve('.');
  const projectId = getProjectId(workspaceRoot);
  const privacyConfig = await loadPrivacyConfig(projectId);
  const privateSet = new Set(privacyConfig.privateIngredients);

  // Sync and collect
  for (const source of config.sources) {
    await syncSource(source);
  }

  const allIngredients: IngredientFile[] = [];
  const allMappings: ExternalMapping[] = [];
  for (const source of config.sources) {
    const { ingredients, mappings } = await collectIngredients(source);
    allIngredients.push(...ingredients);
    allMappings.push(...mappings);
  }

  const stack = await detectStack(workspaceRoot);
  const matches = matchIngredients(allIngredients, stack, allMappings);

  if (matches.length === 0) {
    log.info('No ingredients match the current workspace.');
    return;
  }

  log.info('');
  for (const m of matches) {
    const key = `${m.ingredient.sourceName}/${m.ingredient.relativePath}`;
    const status = privateSet.has(key) ? 'private' : 'public';
    const icon = status === 'private' ? '  🔒 ' : '  📖 ';
    log.info(`${icon}${key}    ${status}`);
  }
  log.info('');
}

export async function privacySetCommand(
  ingredient: string,
  opts: { private?: boolean; public?: boolean },
): Promise<void> {
  const workspaceRoot = resolve('.');
  const projectId = getProjectId(workspaceRoot);
  const privacyConfig = await loadPrivacyConfig(projectId);

  if (opts.private) {
    if (!privacyConfig.privateIngredients.includes(ingredient)) {
      privacyConfig.privateIngredients.push(ingredient);
    }
    await savePrivacyConfig(projectId, privacyConfig);
    log.success(`Marked "${ingredient}" as private`);
  } else if (opts.public) {
    privacyConfig.privateIngredients = privacyConfig.privateIngredients.filter(
      (i) => i !== ingredient,
    );
    await savePrivacyConfig(projectId, privacyConfig);
    log.success(`Marked "${ingredient}" as public`);
  } else {
    log.error('Specify --private or --public');
  }

  log.hint('Run `ingred mix` to apply changes.');
}

export async function privacyClearCommand(): Promise<void> {
  const workspaceRoot = resolve('.');
  const projectId = getProjectId(workspaceRoot);
  await clearPrivacyConfig(projectId);
  log.success('All privacy settings cleared for this project');
  log.hint('Run `ingred mix` to apply changes.');
}
