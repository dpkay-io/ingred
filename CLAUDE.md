# CLAUDE.md

## Project overview

`ingred` is a CLI tool that compiles personalized AI coding instructions (stored as markdown files in git repos or local directories) into native agent config files (CLAUDE.md, .cursorrules, .github/copilot-instructions.md, AGENTS.md, GEMINI.md).

## Tech stack

- Node.js 18+ / TypeScript (strict mode)
- ESM-only (`"type": "module"`, all imports use `.js` extension)
- `commander` for CLI parsing, `prompts` for interactive selection
- `tsup` for bundling (ESM, node18 target, shebang banner)
- `node:test` + `node:assert/strict` for testing (via `tsx --test`)

## Build and run

```bash
npm run build        # tsup → dist/cli.js (ESM bundle)
npm run dev          # tsx src/cli.ts (dev mode)
npm run test         # tsx --test tests/**/*.test.ts
npm run typecheck    # tsc --noEmit
```

The bin entry is `./dist/cli.js`. After `npm run build`, run with `node dist/cli.js`.

## Architecture

Entry point: `src/cli.ts` → commander program with 4 commands (add, remove, list, mix).

**Data flow for `ingred mix`:**
Config → Sync sources → Walk .md files → Parse frontmatter → Detect workspace stack → Three-tier match → (optional) Interactive selection → Sort/group by scope → Compile sections → Format per target → Write files

**Key modules:**
- `src/core/config.ts` — `~/.ingred/config.json` CRUD
- `src/core/sources.ts` — git clone/pull, local path resolution, .md file walking
- `src/core/detector.ts` — workspace stack detection from manifest files, alias normalization
- `src/core/matcher.ts` — three-tier matching engine with `KNOWN_TECH_VOCABULARY` (~200 terms)
- `src/core/compiler.ts` — sorts matched ingredients by priority, groups by scope (persona vs engineering)
- `src/core/emitter.ts` — writes compiled output to target files with sentinel-based safety

**Parsers:**
- `src/parsers/frontmatter.ts` — zero-dep YAML frontmatter parser (strings, numbers, booleans, string arrays)
- `src/parsers/manifest.ts` — 10 parsers for package.json, Cargo.toml, go.mod, pyproject.toml, requirements.txt, Gemfile, pubspec.yaml, composer.json, pom.xml, build.gradle
- `src/parsers/ingred-yaml.ts` — external mapping file parser

**Targets:** `src/targets/{claude,cursor,copilot,agents,gemini}.ts` — each implements `format(compiled, stack)` returning the formatted string for that agent's config file.

## Key conventions

- All tech tokens are lowercased throughout the system
- `INGRED_SENTINEL` in `src/types.ts` is the comment that marks files as ingred-owned
- `DEFAULT_META` in `src/types.ts` is the fallback for ingredients without frontmatter
- Matching tiers: 1 = filename heuristic, 2 = frontmatter triggers, 3 = external ingred.yaml mapping
- Scope `persona` maps to `<system_persona>` XML section in CLAUDE.md output; `engineering` maps to `<engineering_rules>`
- Files in folders named `persona/`, `communication/`, `style/` auto-classify as persona scope

## Testing

Tests use `node:test` runner with `tsx` loader. Test files are in `tests/unit/`. Fixtures are in `tests/fixtures/`.

Run a single test file: `npx tsx --test tests/unit/matcher.test.ts`
