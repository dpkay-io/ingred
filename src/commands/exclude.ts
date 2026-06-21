import { resolve } from 'node:path';
import { getProjectId, loadPrivacyConfig, savePrivacyConfig } from '../core/privacy.js';
import { log } from '../utils/logger.js';

export async function excludeCommand(ingredient: string): Promise<void> {
  const workspaceRoot = resolve('.');
  const projectId = getProjectId(workspaceRoot);
  const privacyConfig = await loadPrivacyConfig(projectId);

  if (privacyConfig.excludedIngredients.includes(ingredient)) {
    log.warn(`"${ingredient}" is already excluded.`);
    return;
  }

  privacyConfig.excludedIngredients.push(ingredient);
  await savePrivacyConfig(projectId, privacyConfig);
  log.success(`Excluded "${ingredient}" from compilation`);
  log.hint('Run `ingred mix` to apply changes.');
}

export async function includeCommand(ingredient: string): Promise<void> {
  const workspaceRoot = resolve('.');
  const projectId = getProjectId(workspaceRoot);
  const privacyConfig = await loadPrivacyConfig(projectId);

  if (!privacyConfig.excludedIngredients.includes(ingredient)) {
    log.warn(`"${ingredient}" is not in the exclusion list.`);
    return;
  }

  privacyConfig.excludedIngredients = privacyConfig.excludedIngredients.filter(
    (i) => i !== ingredient,
  );
  await savePrivacyConfig(projectId, privacyConfig);
  log.success(`Removed "${ingredient}" from exclusion list`);
  log.hint('Run `ingred mix` to apply changes.');
}

export async function excludeListCommand(): Promise<void> {
  const workspaceRoot = resolve('.');
  const projectId = getProjectId(workspaceRoot);
  const privacyConfig = await loadPrivacyConfig(projectId);

  if (privacyConfig.excludedIngredients.length === 0) {
    log.info('No ingredients are currently excluded.');
    return;
  }

  log.info('');
  log.info('Excluded ingredients:');
  for (const ingredient of privacyConfig.excludedIngredients) {
    log.info(`  - ${ingredient}`);
  }
  log.info('');
}
