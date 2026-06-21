import { basename } from 'node:path';
import { loadConfig } from '../core/config.js';
import { collectIngredients } from '../core/sources.js';
import { KNOWN_TECH_VOCABULARY } from '../core/matcher.js';
import { log } from '../utils/logger.js';
import { NoSourcesError, SourceNotFoundError } from '../utils/errors.js';
import type { IngredientFile } from '../types.js';

const VALID_SCOPES = new Set(['engineering', 'persona']);

// ---------------------------------------------------------------------------
// Levenshtein distance (max edit distance check)
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function findSimilarTokens(token: string): string[] {
  const similar: string[] = [];
  for (const known of KNOWN_TECH_VOCABULARY) {
    if (levenshtein(token, known) < 3) {
      similar.push(known);
    }
  }
  return similar.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Core validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

export function validateIngredient(ingredient: IngredientFile): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Error: empty content
  if (ingredient.content.trim().length === 0) {
    errors.push('Content is empty (no text after frontmatter)');
  }

  // Error: invalid scope
  if (!VALID_SCOPES.has(ingredient.meta.scope)) {
    errors.push(
      `Invalid scope "${ingredient.meta.scope}". Must be "engineering" or "persona".`,
    );
  }

  // Warn: trigger tokens not in KNOWN_TECH_VOCABULARY
  for (const trigger of ingredient.meta.triggers) {
    const normalized = trigger.toLowerCase();
    if (!KNOWN_TECH_VOCABULARY.has(normalized)) {
      const suggestions = findSimilarTokens(normalized);
      const hint =
        suggestions.length > 0
          ? ` (did you mean: ${suggestions.join(', ')}?)`
          : '';
      warnings.push(`Unknown trigger "${trigger}"${hint}`);
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export async function checkCommand(
  sourceName?: string,
  opts?: { strict?: boolean },
): Promise<void> {
  const config = await loadConfig();

  if (config.sources.length === 0) {
    throw new NoSourcesError();
  }

  const sources =
    sourceName !== undefined
      ? (() => {
          const found = config.sources.filter((s) => s.name === sourceName);
          if (found.length === 0) {
            throw new SourceNotFoundError(
              sourceName,
              config.sources.map((s) => s.name),
            );
          }
          return found;
        })()
      : config.sources;

  let totalErrors = 0;
  let totalWarnings = 0;
  let totalValid = 0;

  for (const source of sources) {
    log.header(`\nSource: ${source.name}\n`);

    const { ingredients } = await collectIngredients(source);

    // Track duplicate basenames within this source
    const basenameCounts = new Map<string, number>();
    for (const ing of ingredients) {
      const base = basename(ing.relativePath);
      basenameCounts.set(base, (basenameCounts.get(base) ?? 0) + 1);
    }

    for (const ingredient of ingredients) {
      const { errors, warnings } = validateIngredient(ingredient);
      const effectiveErrors = opts?.strict
        ? [...errors, ...warnings.map((w) => `(strict) ${w}`)]
        : errors;

      // Duplicate basename warning
      const base = basename(ingredient.relativePath);
      if ((basenameCounts.get(base) ?? 0) > 1) {
        const msg = `Duplicate filename "${base}" within source`;
        if (opts?.strict) {
          effectiveErrors.push(`(strict) ${msg}`);
        } else {
          warnings.push(msg);
        }
      }

      const label = ingredient.relativePath;

      if (effectiveErrors.length > 0) {
        log.error(`${label}`);
        for (const e of effectiveErrors) {
          log.hint(`    ${e}`);
        }
        totalErrors += effectiveErrors.length;
      } else if (!opts?.strict && warnings.length > 0) {
        log.warn(`${label}`);
        for (const w of warnings) {
          log.hint(`    ${w}`);
        }
        totalWarnings += warnings.length;
      } else {
        log.success(`${label}`);
        totalValid++;
      }
    }
  }

  log.info('');
  log.info(
    `Results: ${totalValid} valid, ${totalWarnings} warning(s), ${totalErrors} error(s)`,
  );

  if (totalErrors > 0) {
    process.exit(1);
  }
}
