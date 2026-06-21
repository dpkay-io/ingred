import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { syncSource, collectIngredients } from './sources.js';
import { detectStack } from './detector.js';
import { matchIngredients } from './matcher.js';
import { compile } from './compiler.js';
import { getProjectId, loadPrivacyConfig, splitByPrivacy } from './privacy.js';
import { registerCustomTargets } from './emitter.js';
import { NoSourcesError, IngredError } from '../utils/errors.js';
import { log } from '../utils/logger.js';
import type {
  IngredConfig,
  IngredientFile,
  ExternalMapping,
  DetectedStack,
  MatchResult,
  CompileResult,
  TargetId,
  ProjectConfig,
} from '../types.js';

export interface PipelineResult {
  config: IngredConfig;
  stack: DetectedStack;
  allIngredients: IngredientFile[];
  allMappings: ExternalMapping[];
  matches: MatchResult[];
  selectedMatches: MatchResult[];
  publicMatches: MatchResult[];
  privateMatches: MatchResult[];
  compiled: CompileResult;
  privateCompiled: CompileResult | null;
  targetIds: TargetId[];
  projectId: string;
  privacyConfig: ProjectConfig;
}

export interface PipelineOptions {
  targets?: string;
  verbose?: boolean;
  quiet?: boolean;
  skipSync?: boolean;
  skipCompile?: boolean;
}

const BUILTIN_TARGETS = new Set<TargetId>([
  'claude', 'cursor', 'copilot', 'agents', 'gemini',
  'windsurf', 'cline', 'aider',
]);

export function resolveTargetIds(
  targetsOpt: string | undefined,
  defaults: TargetId[],
  customTargetIds: Set<string> = new Set(),
): TargetId[] {
  if (!targetsOpt) return defaults;
  const allKnown = new Set<string>([...BUILTIN_TARGETS, ...customTargetIds]);
  const requested = targetsOpt.split(',').map((t) => t.trim().toLowerCase());
  const invalid = requested.filter((t) => !allKnown.has(t));
  const valid = requested.filter((t) => allKnown.has(t)) as TargetId[];
  if (invalid.length > 0) {
    log.warn(`Unknown target(s): ${invalid.join(', ')}. Valid targets: ${[...allKnown].join(', ')}`);
  }
  if (valid.length === 0) {
    throw new IngredError('No valid targets specified.', `Valid targets: ${[...allKnown].join(', ')}`);
  }
  return valid;
}

export async function runPipeline(opts: PipelineOptions = {}): Promise<PipelineResult> {
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
  const workspaceRoot = resolve('.');

  // Sync sources
  if (!opts.skipSync) {
    if (!opts.quiet) log.info('Syncing sources...');
    for (const source of config.sources) {
      await syncSource(source);
    }
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

  if (!opts.quiet) {
    const techList = [...stack.technologies].sort().join(', ');
    log.info('');
    log.item('Stack detected', techList || '(none)');

    if (stack.technologies.size === 0) {
      log.warn('Could not detect tech stack in current directory.');
      log.hint('Only universal ingredients (no tech affiliation) will be included.');
    }
  }

  // Match ingredients
  const matches = matchIngredients(allIngredients, stack, allMappings);

  if (!opts.quiet) {
    log.item('Matched', `${matches.length} of ${allIngredients.length} ingredients`);

    if (opts.verbose) {
      log.info('');
      for (const m of matches) {
        const globalTag = m.ingredient.meta.global ? ' [global]' : '';
        log.info(`  ${m.ingredient.sourceName}/${m.ingredient.relativePath}${globalTag}`);
        log.hint(`    Tier ${m.matchTier}: ${m.matchReason}`);
      }
    }
  }

  // Resolve privacy info
  const projectId = getProjectId(workspaceRoot);
  const privacyConfig = await loadPrivacyConfig(projectId);

  // Filter excluded ingredients
  const excludedSet = new Set(privacyConfig.excludedIngredients);
  const filteredMatches = matches.filter(
    (m) => !excludedSet.has(`${m.ingredient.sourceName}/${m.ingredient.relativePath}`),
  );
  if (!opts.quiet && filteredMatches.length < matches.length) {
    log.item('Excluded', `${matches.length - filteredMatches.length} ingredients`);
  }
  const selectedMatches = filteredMatches;

  // Early return if compile is skipped (caller handles selection + compile)
  if (opts.skipCompile) {
    const emptyCompiled: CompileResult = {
      global: { personaSection: '', engineeringSection: '' },
      project: { personaSection: '', engineeringSection: '' },
    };
    return {
      config,
      stack,
      allIngredients,
      allMappings,
      matches,
      selectedMatches,
      publicMatches: [],
      privateMatches: [],
      compiled: emptyCompiled,
      privateCompiled: null,
      targetIds,
      projectId,
      privacyConfig,
    };
  }

  // Split by privacy and compile
  const { publicMatches, privateMatches } = splitByPrivacy(selectedMatches, privacyConfig);
  const compiled = compile(publicMatches);
  const privateCompiled = privateMatches.length > 0 ? compile(privateMatches) : null;

  return {
    config,
    stack,
    allIngredients,
    allMappings,
    matches,
    selectedMatches,
    publicMatches,
    privateMatches,
    compiled,
    privateCompiled,
    targetIds,
    projectId,
    privacyConfig,
  };
}
