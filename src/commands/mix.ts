import { watch } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runPipeline, resolveTargetIds } from '../core/pipeline.js';
import { compile } from '../core/compiler.js';
import { emit, getTargetRegistry } from '../core/emitter.js';
import { log } from '../utils/logger.js';
import { addToGitignore } from '../utils/gitignore.js';
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
  watch?: boolean;
  gitignore?: boolean;
}): Promise<void> {
  if (opts.watch) {
    if (opts.dryRun) { log.error('--watch cannot be used with --dry-run.'); return; }
    if (opts.interactive) { log.error('--watch cannot be used with --interactive.'); return; }
    if (opts.allPrivate) { log.error('--watch cannot be used with --all-private.'); return; }
  }
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
      choices: matches.map((m, i) => {
        const meta = m.ingredient.meta;
        const triggerInfo = meta.always
          ? 'always'
          : meta.triggers.length > 0
            ? `triggers: ${meta.triggers.join(', ')}`
            : 'universal';
        return {
          title: `${m.ingredient.sourceName}/${m.ingredient.relativePath}`,
          description: `Tier ${m.matchTier}: ${m.matchReason} | ${triggerInfo} | scope: ${meta.scope} | priority: ${meta.priority}`,
          value: i,
          selected: true,
        };
      }),
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

  // Gitignore management
  const writtenProjectResults = results.filter((r) => r.status === 'written' && r.location === 'project' && r.path);

  if (opts.gitignore && writtenProjectResults.length > 0) {
    const changed = await updateGitignore(stack.workspaceRoot, writtenProjectResults);
    if (changed && !opts.quiet) {
      log.info('');
      const registry = getTargetRegistry();
      const count = writtenProjectResults
        .map((r) => registry.get(r.target)?.outputPath)
        .filter(Boolean).length;
      log.item('.gitignore', `updated with ${count} generated file(s)`);
    }
  } else if (!opts.gitignore && writtenProjectResults.length > 0 && !privacyConfig.gitignoreSuggested) {
    if (!opts.quiet) {
      log.info('');
      log.hint('Tip: run with --gitignore to add generated files to .gitignore');
    }
    privacyConfig = { ...privacyConfig, gitignoreSuggested: true };
    await savePrivacyConfig(projectId, privacyConfig);
  }

  // Watch mode
  if (opts.watch) {
    log.info('');
    log.info('Watching for changes... (Ctrl+C to stop)');

    const watchers: ReturnType<typeof watch>[] = [];
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const rerun = async () => {
      try {
        const timestamp = new Date().toLocaleTimeString();
        const rerunResult = await runPipeline({
          targets: opts.targets,
          verbose: false,
          quiet: true,
          skipSync: true,
        });
        const { matches: rerunMatches, stack: rerunStack, targetIds: rerunTargetIds, projectId: rerunProjectId, privacyConfig: rerunPrivacyConfig } = rerunResult;
        const { publicMatches: rerunPublic, privateMatches: rerunPrivate } = splitByPrivacy(rerunMatches, rerunPrivacyConfig);
        const rerunCompiled = compile(rerunPublic);
        const rerunPrivateCompiled = rerunPrivate.length > 0 ? compile(rerunPrivate) : null;
        const rerunCompiledDir = getPrivateCompiledDir(rerunProjectId);
        const rerunTildeCompiledDir = '~/.ingred/compiled/' + rerunProjectId;
        const rerunResults = await emit(rerunCompiled, rerunStack, rerunTargetIds, opts.force ?? false, {
          privateCompiled: rerunPrivateCompiled,
          compiledDir: rerunCompiledDir,
          tildeCompiledDir: rerunTildeCompiledDir,
        });

        if (opts.gitignore) {
          const rerunWrittenProject = rerunResults.filter((r) => r.status === 'written' && r.location === 'project' && r.path);
          await updateGitignore(rerunStack.workspaceRoot, rerunWrittenProject);
        }

        const written = rerunResults.filter((r) => r.status === 'written').length;
        log.info(`[${timestamp}] Recompiled — ${rerunMatches.length} ingredients → ${written} targets`);
      } catch (err) {
        log.error(`Watch recompile failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    const onFileChange = (_event: string, filename: string | null) => {
      if (!filename || !filename.endsWith('.md')) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(rerun, 500);
    };

    for (const source of config.sources) {
      try {
        const w = watch(source.cachePath, { recursive: true }, onFileChange);
        watchers.push(w);
      } catch {
        log.warn(`Recursive watch not available for ${source.name}, watching top-level only`);
        try {
          const w = watch(source.cachePath, onFileChange);
          watchers.push(w);
        } catch { /* skip unavailable source */ }
      }
    }

    process.on('SIGINT', () => {
      for (const w of watchers) w.close();
      log.info('');
      log.info('Watch stopped.');
      process.exit(0);
    });

    await new Promise(() => {}); // Keep process alive
  }
}

function checkSizeWarning(targetId: TargetId | string, compiled: { personaSection: string; engineeringSection: string }): void {
  const threshold = SIZE_WARNINGS[targetId as TargetId];
  if (!threshold) return;

  const totalLines =
    (compiled.personaSection ? compiled.personaSection.split('\n').length : 0) +
    (compiled.engineeringSection ? compiled.engineeringSection.split('\n').length : 0);

  if (totalLines > threshold) {
    log.warn(`  Compiled content is ${totalLines} lines (recommended: <${threshold} for ${targetId})`);
  }
}

async function updateGitignore(
  workspaceRoot: string,
  writtenResults: { target: TargetId | string }[],
): Promise<boolean> {
  if (writtenResults.length === 0) return false;
  const gitignorePath = join(workspaceRoot, '.gitignore');
  let existing = '';
  try { existing = await readFile(gitignorePath, 'utf-8'); } catch { /* no file yet */ }
  const registry = getTargetRegistry();
  const paths = writtenResults
    .map((r) => registry.get(r.target)?.outputPath)
    .filter((p): p is string => p !== null && p !== undefined);
  const updated = addToGitignore(existing, paths);
  if (updated === existing) return false;
  await writeFile(gitignorePath, updated, 'utf-8');
  return true;
}
