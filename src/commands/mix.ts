import { resolve } from 'node:path';
import { loadConfig } from '../core/config.js';
import { syncSource, collectIngredients } from '../core/sources.js';
import { detectStack } from '../core/detector.js';
import { matchIngredients } from '../core/matcher.js';
import { compile } from '../core/compiler.js';
import { emit } from '../core/emitter.js';
import { NoSourcesError, IngredError } from '../utils/errors.js';
import { log } from '../utils/logger.js';
import {
  getProjectId,
  loadPrivacyConfig,
  savePrivacyConfig,
  splitByPrivacy,
  getPrivateCompiledDir,
} from '../core/privacy.js';
import type { IngredientFile, ExternalMapping, TargetId, ProjectPrivacyConfig } from '../types.js';
import prompts from 'prompts';

const VALID_TARGETS = new Set<TargetId>(['claude', 'cursor', 'copilot', 'agents', 'gemini']);

const SIZE_WARNINGS: Partial<Record<TargetId, number>> = {
  claude: 80,
  cursor: 150,
  copilot: 120,
  agents: 150,
  gemini: 120,
};

export async function mixCommand(opts: {
  dryRun?: boolean;
  force?: boolean;
  targets?: string;
  interactive?: boolean;
  verbose?: boolean;
  allPrivate?: boolean;
}): Promise<void> {
  const config = await loadConfig();

  if (config.sources.length === 0) {
    throw new NoSourcesError();
  }

  const targetIds = resolveTargets(opts.targets, config.settings.targets);
  const workspaceRoot = resolve('.');

  // Sync sources
  log.info('Syncing sources...');
  for (const source of config.sources) {
    await syncSource(source);
  }

  // Collect ingredients from all sources
  const allIngredients: IngredientFile[] = [];
  const allMappings: ExternalMapping[] = [];

  for (const source of config.sources) {
    const { ingredients, mappings } = await collectIngredients(source);
    allIngredients.push(...ingredients);
    allMappings.push(...mappings);
  }

  // Detect workspace stack
  const stack = await detectStack(workspaceRoot);
  const techList = [...stack.technologies].sort().join(', ');

  log.info('');
  log.item('Stack detected', techList || '(none)');

  if (stack.technologies.size === 0) {
    log.warn('Could not detect tech stack in current directory.');
    log.hint('Only universal ingredients (no tech affiliation) will be included.');
  }

  // Match ingredients
  const matches = matchIngredients(allIngredients, stack, allMappings);

  log.item('Matched', `${matches.length} of ${allIngredients.length} ingredients`);

  if (opts.verbose) {
    log.info('');
    for (const m of matches) {
      const globalTag = m.ingredient.meta.global ? ' [global]' : '';
      log.info(`  ${m.ingredient.sourceName}/${m.ingredient.relativePath}${globalTag}`);
      log.hint(`    Tier ${m.matchTier}: ${m.matchReason}`);
    }
  }

  if (matches.length === 0) {
    log.info('');
    log.warn('No ingredients matched the detected stack.');
    log.hint('Check that your ingredient files use matching filenames (e.g., react.md)');
    log.hint('or add frontmatter triggers. Run `ingred list --verbose` to see all ingredients.');
    return;
  }

  // Interactive selection
  let selectedMatches = matches;

  if (opts.interactive) {
    const response = await prompts({
      type: 'multiselect',
      name: 'selected',
      message: 'Select ingredients to include',
      choices: matches.map((m, i) => ({
        title: `${m.ingredient.sourceName}/${m.ingredient.relativePath}`,
        description: `Tier ${m.matchTier}: ${m.matchReason}`,
        value: i,
        selected: true,
      })),
      instructions: false,
    });

    if (!response.selected) {
      log.info('');
      log.warn('Selection cancelled.');
      return;
    }

    const indices = new Set<number>(response.selected);
    selectedMatches = matches.filter((_, i) => indices.has(i));

    if (selectedMatches.length === 0) {
      log.info('');
      log.warn('No ingredients selected.');
      return;
    }

    log.item('Selected', `${selectedMatches.length} of ${matches.length} ingredients`);
  }

  // Privacy split
  const projectId = getProjectId(workspaceRoot);
  let privacyConfig = await loadPrivacyConfig(projectId);

  if (opts.allPrivate) {
    privacyConfig = {
      version: 1,
      privateIngredients: selectedMatches.map(
        (m) => `${m.ingredient.sourceName}/${m.ingredient.relativePath}`,
      ),
    };
    await savePrivacyConfig(projectId, privacyConfig);
  }

  if (opts.interactive) {
    const privacySet = new Set(privacyConfig.privateIngredients);
    const privacyResponse = await prompts({
      type: 'multiselect',
      name: 'private',
      message: 'Which ingredients should be private?',
      choices: selectedMatches.map((m, i) => {
        const key = `${m.ingredient.sourceName}/${m.ingredient.relativePath}`;
        return {
          title: key,
          value: i,
          selected: privacySet.has(key),
        };
      }),
      instructions: false,
    });

    if (privacyResponse.private) {
      const privateIndices = new Set<number>(privacyResponse.private);
      privacyConfig = {
        version: 1,
        privateIngredients: selectedMatches
          .filter((_, i) => privateIndices.has(i))
          .map((m) => `${m.ingredient.sourceName}/${m.ingredient.relativePath}`),
      };
      await savePrivacyConfig(projectId, privacyConfig);
    }
  }

  const { publicMatches, privateMatches } = splitByPrivacy(selectedMatches, privacyConfig);

  if (opts.verbose && privateMatches.length > 0) {
    log.info('');
    log.item('Private', `${privateMatches.length} ingredients`);
    for (const m of privateMatches) {
      log.hint(`    ${m.ingredient.sourceName}/${m.ingredient.relativePath}`);
    }
  }

  // Compile
  const compiled = compile(publicMatches);
  const privateCompiled = privateMatches.length > 0 ? compile(privateMatches) : null;

  // Dry run — show what would be written
  if (opts.dryRun) {
    log.info('');
    log.header('Dry run — no files written');
    log.info('');
    for (const targetId of targetIds) {
      log.info(`  Would write: ${targetId}`);
    }
    if (privateMatches.length > 0) {
      const compiledDir = getPrivateCompiledDir(projectId);
      log.info('');
      log.info(`  Private content would be written to:`);
      log.info(`    ${compiledDir}`);
    }
    return;
  }

  // Emit
  const privateEmitOpts = (() => {
    const compiledDir = getPrivateCompiledDir(projectId);
    const tildeCompiledDir = '~/.ingred/compiled/' + projectId;
    return {
      privateCompiled,
      compiledDir,
      tildeCompiledDir,
    };
  })();

  const results = await emit(compiled, stack, targetIds, opts.force ?? false, privateEmitOpts);

  log.info('');
  log.header('ingred mix complete');
  log.info('');

  const written = results.filter((r) => r.status === 'written');
  const skipped = results.filter((r) => r.status === 'skipped');

  if (written.length > 0) {
    for (const r of written) {
      const label = r.location === 'global' ? `${r.target} (global)` : r.target;
      log.success(label);
      if (r.location === 'project') {
        checkSizeWarning(r.target, compiled.project);
      }
    }
  }

  if (skipped.length > 0) {
    log.info('');
    for (const r of skipped) {
      const label = r.location === 'global' ? `${r.target} (global)` : r.target;
      log.warn(`${label} (${r.reason} — use --force to overwrite)`);
    }
  }

  if (privateMatches.length > 0) {
    log.info('');
    log.item('Private ingredients', `written to ~/.ingred/compiled/${projectId}/`);
  }
}

function resolveTargets(targetsOpt: string | undefined, defaults: TargetId[]): TargetId[] {
  if (!targetsOpt) return defaults;

  const requested = targetsOpt.split(',').map((t) => t.trim().toLowerCase());
  const invalid = requested.filter((t) => !VALID_TARGETS.has(t as TargetId));
  const valid = requested.filter((t) => VALID_TARGETS.has(t as TargetId)) as TargetId[];

  if (invalid.length > 0) {
    log.warn(`Unknown target(s): ${invalid.join(', ')}. Valid targets: ${[...VALID_TARGETS].join(', ')}`);
  }
  if (valid.length === 0) {
    throw new IngredError(
      `No valid targets specified.`,
      `Valid targets: ${[...VALID_TARGETS].join(', ')}`,
    );
  }

  return valid;
}

function checkSizeWarning(targetId: TargetId, compiled: { personaSection: string; engineeringSection: string }): void {
  const threshold = SIZE_WARNINGS[targetId];
  if (!threshold) return;

  const totalLines =
    (compiled.personaSection ? compiled.personaSection.split('\n').length : 0) +
    (compiled.engineeringSection ? compiled.engineeringSection.split('\n').length : 0);

  if (totalLines > threshold) {
    log.warn(`  Compiled content is ${totalLines} lines (recommended: <${threshold} for ${targetId})`);
  }
}
