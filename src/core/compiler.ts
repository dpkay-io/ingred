import type { MatchResult, CompileResult, CompiledOutput } from '../types.js';

const PERSONA_PATH_PATTERNS = ['/persona/', '/communication/', '/style/'];

/**
 * Resolve `extends` chains in the match list.
 *
 * Rules:
 * - A match can extend a base via `meta.extends = 'basename.md'`
 * - The base is looked up by `sourceName/basename` key in the match map
 * - Base content is prepended to child content (separated by `\n\n`)
 * - The base is marked "absorbed" and removed from the standalone output
 * - Only one level of extends is supported; if the base itself has `extends`, throw
 * - Circular extends (A extends B extends A) causes a throw
 * - A missing base is silently ignored — the child still compiles as-is
 */
function resolveExtends(matches: MatchResult[]): MatchResult[] {
  // Build lookup: "sourceName/relativePath" → MatchResult
  const byKey = new Map<string, MatchResult>();
  for (const m of matches) {
    byKey.set(`${m.ingredient.sourceName}/${m.ingredient.relativePath}`, m);
  }

  const absorbed = new Set<string>();
  const resolved: MatchResult[] = [];

  for (const match of matches) {
    const extendsVal = match.ingredient.meta.extends;
    if (!extendsVal) {
      resolved.push(match);
      continue;
    }

    const baseKey = `${match.ingredient.sourceName}/${extendsVal}`;
    const base = byKey.get(baseKey);

    if (!base) {
      // Missing base — emit child as-is
      resolved.push(match);
      continue;
    }

    // Detect circular: base extends back to this child
    const childKey = `${match.ingredient.sourceName}/${match.ingredient.relativePath}`;
    if (base.ingredient.meta.extends) {
      const baseExtendsKey = `${base.ingredient.sourceName}/${base.ingredient.meta.extends}`;
      if (baseExtendsKey === childKey) {
        throw new Error(
          `Circular extends detected: "${match.ingredient.relativePath}" and "${base.ingredient.relativePath}" extend each other`,
        );
      }
      // Multi-level extends not supported
      throw new Error(
        `Only one level of extends is supported. "${base.ingredient.relativePath}" also uses extends — remove the chain or flatten it.`,
      );
    }

    // Absorb the base
    absorbed.add(baseKey);

    // Merge: base content prepended before child content
    const mergedContent = `${base.ingredient.content.trim()}\n\n${match.ingredient.content.trim()}`;
    resolved.push({
      ...match,
      ingredient: {
        ...match.ingredient,
        content: mergedContent,
      },
    });
  }

  // Remove absorbed bases from standalone output
  return resolved.filter(
    (m) => !absorbed.has(`${m.ingredient.sourceName}/${m.ingredient.relativePath}`),
  );
}

export function compile(matches: MatchResult[]): CompileResult {
  const withExtends = resolveExtends(matches);
  const sorted = [...withExtends].sort((a, b) => {
    if (a.ingredient.meta.priority !== b.ingredient.meta.priority) {
      return b.ingredient.meta.priority - a.ingredient.meta.priority;
    }
    if (a.matchTier !== b.matchTier) {
      return b.matchTier - a.matchTier;
    }
    return a.ingredient.relativePath.localeCompare(b.ingredient.relativePath);
  });

  const globalMatches = sorted.filter((m) => m.ingredient.meta.global);
  const projectMatches = sorted.filter((m) => !m.ingredient.meta.global);

  return {
    global: compileSection(globalMatches),
    project: compileSection(projectMatches),
  };
}

function compileSection(matches: MatchResult[]): CompiledOutput {
  const personaBlocks: string[] = [];
  const engineeringBlocks: string[] = [];

  for (const match of matches) {
    const { ingredient } = match;
    const block = `<!-- source: ${ingredient.sourceName}/${ingredient.relativePath} -->\n${ingredient.content.trim()}`;

    if (isPersonaScope(ingredient.meta.scope, ingredient.relativePath, ingredient.meta.scopeExplicit)) {
      personaBlocks.push(block);
    } else {
      engineeringBlocks.push(block);
    }
  }

  return {
    personaSection: personaBlocks.join('\n\n'),
    engineeringSection: engineeringBlocks.join('\n\n'),
  };
}

function isPersonaScope(scope: string, relativePath: string, scopeExplicit?: boolean): boolean {
  if (scope === 'persona') return true;
  if (scopeExplicit) return false;

  const normalized = '/' + relativePath.replace(/\\/g, '/');
  for (const pattern of PERSONA_PATH_PATTERNS) {
    if (normalized.includes(pattern)) return true;
  }

  return false;
}
