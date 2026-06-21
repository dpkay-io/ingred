import { runPipeline, resolveTargetIds } from '../core/pipeline.js';
import { compile } from '../core/compiler.js';
import { emit } from '../core/emitter.js';
import { log } from '../utils/logger.js';
import {
  savePrivacyConfig,
  splitByPrivacy,
  getPrivateCompiledDir,
} from '../core/privacy.js';
import type { MatchResult, TargetId } from '../types.js';
import prompts from 'prompts';

const SIZE_WARNINGS: Partial<Record<TargetId, number>> = {
  claude: 80,
  cursor: 150,
  copilot: 120,
  agents: 150,
  gemini: 120,
  windsurf: 150,
  cline: 120,
  aider: 100,
};

export async function mixCommand(opts: {
  dryRun?: boolean;
  force?: boolean;
  targets?: string;
  interactive?: boolean;
  verbose?: boolean;
  allPrivate?: boolean;
  quiet?: boolean;
}): Promise<void> {
  const {
    config,
    stack,
    matches,
    targetIds,
    projectId,
    privacyConfig: initialPrivacyConfig,
  } = await runPipeline({
    targets: opts.targets,
    verbose: opts.verbose,
    quiet: opts.quiet,
    skipCompile: true,
  });

  if (matches.length === 0) {
    if (!opts.quiet) {
      log.info('');
      log.warn('No ingredients matched the detected stack.');
      log.hint('Check that your ingredient files use matching filenames (e.g., react.md)');
      log.hint('or add frontmatter triggers. Run `ingred list --verbose` to see all ingredients.');
    }
    return;
  }

  // Interactive selection
  let selectedMatches: MatchResult[] = matches;

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

    if (!opts.quiet) {
      log.item('Selected', `${selectedMatches.length} of ${matches.length} ingredients`);
    }
  }

  // Privacy split
  let privacyConfig = initialPrivacyConfig;

  if (opts.allPrivate) {
    privacyConfig = {
      version: 1,
      privateIngredients: selectedMatches.map(
        (m) => `${m.ingredient.sourceName}/${m.ingredient.relativePath}`,
      ),
      excludedIngredients: privacyConfig.excludedIngredients,
    };
    await savePrivacyConfig(projectId, privacyConfig);
  }

  if (opts.interactive && !opts.allPrivate) {
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

    if (!privacyResponse.private) {
      log.info('');
      log.warn('Privacy selection cancelled.');
      return;
    }

    const privateIndices = new Set<number>(privacyResponse.private);
    privacyConfig = {
      version: 1,
      privateIngredients: selectedMatches
        .filter((_, i) => privateIndices.has(i))
        .map((m) => `${m.ingredient.sourceName}/${m.ingredient.relativePath}`),
      excludedIngredients: privacyConfig.excludedIngredients,
    };
    await savePrivacyConfig(projectId, privacyConfig);
  }

  const { publicMatches, privateMatches } = splitByPrivacy(selectedMatches, privacyConfig);

  if (!opts.quiet && opts.verbose && privateMatches.length > 0) {
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
    if (!opts.quiet) {
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

  if (!opts.quiet) {
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
        } else if (r.location === 'global') {
          checkSizeWarning(r.target, compiled.global);
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
