import type { MatchResult, CompileResult, CompiledOutput } from '../types.js';

const PERSONA_PATH_PATTERNS = ['/persona/', '/communication/', '/style/'];

export function compile(matches: MatchResult[]): CompileResult {
  const sorted = [...matches].sort((a, b) => {
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
