import type {
  IngredientFile,
  DetectedStack,
  ExternalMapping,
  MatchResult,
} from '../types.js';

// ---------------------------------------------------------------------------
// Known technology vocabulary (~200 terms)
// ---------------------------------------------------------------------------

export const KNOWN_TECH_VOCABULARY: Set<string> = new Set([
  // Languages
  'javascript', 'typescript', 'python', 'ruby', 'rust', 'go', 'golang',
  'java', 'kotlin', 'swift', 'dart', 'php', 'c', 'cpp', 'csharp', 'cs',
  'elixir', 'scala', 'clojure', 'haskell', 'lua', 'perl', 'r', 'shell',
  'bash', 'zsh', 'powershell', 'sql', 'html', 'css', 'sass', 'less',
  'graphql', 'wasm', 'zig', 'nim', 'ocaml', 'fsharp', 'groovy',
  'objective-c', 'objectivec',

  // Frontend frameworks
  'react', 'vue', 'angular', 'svelte', 'solid', 'solidjs', 'preact',
  'next', 'nextjs', 'nuxt', 'nuxtjs', 'gatsby', 'gatsbyjs',
  'remix', 'remixjs', 'astro', 'astrojs', 'qwik', 'lit', 'alpine',
  'alpinejs', 'htmx', 'ember', 'emberjs', 'backbone', 'jquery',

  // Backend frameworks
  'express', 'expressjs', 'fastify', 'koa', 'hono', 'django', 'flask',
  'fastapi', 'rails', 'sinatra', 'spring', 'springboot', 'gin',
  'echo', 'fiber', 'actix', 'axum', 'phoenix', 'laravel', 'symfony',
  'nestjs', 'nest', 'adonis', 'adonisjs', 'hapi', 'sails',
  'rocket', 'warp', 'tide', 'deno', 'bun',

  // Mobile
  'flutter', 'react-native', 'reactnative', 'swiftui', 'jetpack-compose',
  'jetpackcompose', 'expo', 'ionic', 'capacitor', 'xamarin', 'maui',
  'nativescript', 'cordova',

  // CSS / UI libraries
  'tailwind', 'tailwindcss', 'styled-components', 'styledcomponents',
  'emotion', 'bootstrap', 'material-ui', 'materialui', 'mui',
  'chakra', 'chakraui', 'shadcn', 'ant-design', 'antd', 'bulma',
  'foundation', 'radix', 'headlessui', 'daisyui',

  // State management
  'redux', 'mobx', 'zustand', 'pinia', 'recoil', 'jotai', 'valtio',
  'xstate', 'ngrx', 'vuex',

  // Testing
  'jest', 'vitest', 'mocha', 'pytest', 'rspec', 'cypress', 'playwright',
  'selenium', 'testing-library', 'testinglibrary', 'jasmine', 'karma',
  'ava', 'tap', 'supertest', 'msw', 'storybook', 'chromatic',

  // Databases & ORMs
  'postgres', 'postgresql', 'mysql', 'mariadb', 'sqlite', 'mongodb',
  'redis', 'dynamodb', 'cassandra', 'couchdb', 'neo4j', 'elasticsearch',
  'prisma', 'drizzle', 'typeorm', 'sequelize', 'sqlalchemy', 'mongoose',
  'knex', 'kysely', 'mikro-orm', 'mikroorm', 'supabase', 'firebase',
  'firestore', 'fauna', 'planetscale',

  // DevOps & Cloud
  'docker', 'kubernetes', 'k8s', 'terraform', 'pulumi', 'ansible',
  'aws', 'gcp', 'azure', 'vercel', 'netlify', 'cloudflare', 'heroku',
  'digitalocean', 'fly', 'railway', 'render',
  'github-actions', 'githubactions', 'gitlab-ci', 'gitlabci',
  'circleci', 'jenkins', 'travis', 'argocd',

  // Build tools & bundlers
  'webpack', 'vite', 'esbuild', 'rollup', 'parcel', 'turbo', 'turborepo',
  'nx', 'lerna', 'gradle', 'maven', 'cargo', 'pip', 'poetry', 'uv',
  'bundler', 'composer', 'pnpm', 'yarn', 'npm', 'bun',

  // API & protocols
  'rest', 'grpc', 'trpc', 'graphql', 'apollo', 'relay', 'urql',
  'swagger', 'openapi', 'websocket', 'socketio',

  // Auth & identity
  'oauth', 'jwt', 'auth0', 'clerk', 'nextauth', 'passport', 'lucia',

  // Misc tools
  'eslint', 'prettier', 'biome', 'oxlint', 'stylelint',
  'husky', 'lint-staged', 'commitlint',
  'electron', 'electronjs', 'tauri',
  'three', 'threejs', 'd3', 'd3js',
  'nginx', 'caddy', 'traefik',
  'rabbitmq', 'kafka', 'nats',
  'prometheus', 'grafana', 'datadog', 'sentry',
  'monorepo', 'microfrontend', 'microservice',
]);

// ---------------------------------------------------------------------------
// Main matching function
// ---------------------------------------------------------------------------

export function matchIngredients(
  ingredients: IngredientFile[],
  stack: DetectedStack,
  mappings: ExternalMapping[],
): MatchResult[] {
  const results: MatchResult[] = [];
  const seenBasenames = new Map<string, number>(); // basename -> index in results

  for (const ingredient of ingredients) {
    const tier1 = matchTier1(ingredient, stack);
    const tier2 = matchTier2(ingredient, stack);
    const tier3 = matchTier3(ingredient, stack, mappings);

    // If no tier matched, skip
    if (!tier1 && !tier2 && !tier3) continue;

    // Determine the highest tier that matched
    let matchTier: 1 | 2 | 3;
    let matchReason: string;

    if (tier3) {
      matchTier = 3;
      matchReason = tier3;
    } else if (tier2) {
      matchTier = 2;
      matchReason = tier2;
    } else {
      matchTier = 1;
      matchReason = tier1!;
    }

    // Deduplicate by basename: keep the one from the earlier source (lower index)
    const basename = getBasename(ingredient.relativePath);
    const existingIndex = seenBasenames.get(basename);

    if (existingIndex !== undefined) {
      // Already have an ingredient with this basename — keep the earlier one (already in results)
      continue;
    }

    seenBasenames.set(basename, results.length);
    results.push({ ingredient, matchTier, matchReason });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Tier 1 — Implicit matching (filename/folder heuristic)
// ---------------------------------------------------------------------------

function matchTier1(ingredient: IngredientFile, stack: DetectedStack): string | null {
  const tokens = tokenizePath(ingredient.relativePath);
  const stackLower = toLowerSet(stack.technologies);

  // Check if any path token directly matches a stack technology
  for (const token of tokens) {
    if (stackLower.has(token)) {
      return `filename token "${token}" matches stack`;
    }
  }

  // Check if any token is in KNOWN_TECH_VOCABULARY
  const knownTokens = tokens.filter((t) => KNOWN_TECH_VOCABULARY.has(t));

  if (knownTokens.length === 0) {
    // No tech-related tokens in the path — treat as universal
    return 'universal (no tech tokens in path)';
  }

  // Some tokens are in vocabulary but none matched the stack — try content fallback
  return contentScanFallback(ingredient, stackLower);
}

function contentScanFallback(
  ingredient: IngredientFile,
  stackLower: Set<string>,
): string | null {
  const lines = ingredient.content.split('\n').slice(0, 50);
  const contentText = lines.join(' ').toLowerCase();

  const contentKeywords: string[] = [];

  for (const term of KNOWN_TECH_VOCABULARY) {
    if (contentContainsTerm(contentText, term)) {
      contentKeywords.push(term);
    }
  }

  // Check if any content keywords match the stack
  for (const keyword of contentKeywords) {
    if (stackLower.has(keyword)) {
      return `content keyword "${keyword}" matches stack`;
    }
  }

  // Filename had tech affinity but neither filename nor content matched the stack — exclude
  return null;
}

function contentContainsTerm(text: string, term: string): boolean {
  let startFrom = 0;
  while (startFrom < text.length) {
    const idx = text.indexOf(term, startFrom);
    if (idx === -1) return false;

    const before = idx > 0 ? text[idx - 1] : ' ';
    const after = idx + term.length < text.length ? text[idx + term.length] : ' ';

    if (!isAlphanumeric(before) && !isAlphanumeric(after)) {
      return true;
    }
    startFrom = idx + 1;
  }
  return false;
}

function isAlphanumeric(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122)   // a-z
  );
}

// ---------------------------------------------------------------------------
// Tier 2 — Inline triggers (frontmatter)
// ---------------------------------------------------------------------------

function matchTier2(ingredient: IngredientFile, stack: DetectedStack): string | null {
  const { meta } = ingredient;

  if (meta.always) {
    return 'always: true';
  }

  if (meta.triggers.includes('*')) {
    return 'trigger: wildcard (*)';
  }

  if (meta.triggers.length === 0) {
    return null;
  }

  const stackLower = toLowerSet(stack.technologies);

  for (const trigger of meta.triggers) {
    if (stackLower.has(trigger.toLowerCase())) {
      return `trigger "${trigger}" matches stack`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Tier 3 — External mapping
// ---------------------------------------------------------------------------

function matchTier3(
  ingredient: IngredientFile,
  stack: DetectedStack,
  mappings: ExternalMapping[],
): string | null {
  const basename = getBasename(ingredient.relativePath);

  for (const mapping of mappings) {
    // Check if this ingredient's relativePath (or its basename) appears in the mapping's files
    const fileMatch = mapping.files.some(
      (f) => f === ingredient.relativePath || f === basename,
    );
    if (!fileMatch) continue;

    // Evaluate the `when` condition
    if (evaluateWhen(mapping, stack)) {
      return `external mapping for "${basename}"`;
    }
  }

  return null;
}

function evaluateWhen(mapping: ExternalMapping, stack: DetectedStack): boolean {
  const { when } = mapping;

  // If `when` has no conditions, treat as non-matching (explicit conditions required)
  const hasDeps = when.dependencies && when.dependencies.length > 0;
  const hasFiles = when.filesPresent && when.filesPresent.length > 0;

  if (!hasDeps && !hasFiles) return false;

  const stackLower = toLowerSet(stack.technologies);

  // dependencies: match any against stack.technologies
  if (hasDeps) {
    const depMatch = when.dependencies!.some((dep) => stackLower.has(dep.toLowerCase()));
    if (depMatch) return true;
  }

  // filesPresent: check against stack.detectedFiles keys
  if (hasFiles) {
    const fileMatch = when.filesPresent!.some((f) => stack.detectedFiles.has(f));
    if (fileMatch) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function tokenizePath(relativePath: string): string[] {
  return relativePath
    .split(/[/\\._-]/)
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length > 0);
}

function getBasename(relativePath: string): string {
  const parts = relativePath.split(/[/\\]/);
  return parts[parts.length - 1];
}

function toLowerSet(set: Set<string>): Set<string> {
  const lower = new Set<string>();
  for (const item of set) {
    lower.add(item.toLowerCase());
  }
  return lower;
}
