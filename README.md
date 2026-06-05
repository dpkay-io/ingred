# ingred

Compile personalized AI coding instructions into native agent config files.

Developers maintain markdown files with their coding preferences — React patterns, testing approaches, communication style, etc. — in git repos or local directories. `ingred` links to these sources, detects the current workspace's tech stack, matches relevant instruction files, and writes them into the config files that AI agents read on startup.

## Supported targets

| Target | Output file |
|--------|-------------|
| Claude | `CLAUDE.md` |
| Cursor | `.cursorrules` |
| Copilot | `.github/copilot-instructions.md` |
| Agents | `AGENTS.md` |
| Gemini | `GEMINI.md` |

## Install

```
npm install -g ingred
```

Requires Node.js 18+.

## Quick start

```bash
# Link an ingredient source (git repo or local directory)
ingred link https://github.com/you/my-ingredients.git
ingred link ~/my-ingredients

# See what's linked
ingred list

# Compile instructions for the current workspace
ingred mix
```

`ingred mix` scans your workspace for config files (package.json, Cargo.toml, go.mod, etc.), figures out what technologies you're using, picks the relevant ingredient files, and writes all five target files.

## Commands

### `ingred link <source>`

Link a git repo or local directory as an ingredient source.

```bash
ingred link https://github.com/you/ingredients.git
ingred link ./local-ingredients
ingred link https://github.com/you/ingredients.git --branch main
```

### `ingred unlink <name>`

Remove a linked source.

```bash
ingred unlink my-ingredients
```

### `ingred add <source>`

Alias for `link`. Establishes the convention for community profiles.

### `ingred list`

Show linked sources and their ingredient files.

```bash
ingred list              # sources and file counts
ingred list --verbose    # show each file with triggers/scope
ingred list --matched    # run stack detection and show what would match
```

### `ingred mix`

The main command. Syncs sources, detects the workspace stack, matches ingredients, compiles, and writes target files.

```bash
ingred mix                        # write all targets
ingred mix --dry-run              # preview without writing
ingred mix --targets claude,cursor # only specific targets
ingred mix --force                # overwrite even non-ingred files
ingred mix --interactive          # select which ingredients to include
ingred mix --verbose              # detailed output
```

With `--interactive` (`-i`), you get a multi-select prompt after matching where you can confirm or skip each ingredient before compilation.

## How matching works

Every ingredient file is evaluated through three independent tiers. If any tier matches, the file is included.

**Tier 1 — Filename heuristic.** Tokens from the file path are checked against the detected stack. `react-patterns.md` matches a React workspace. Files with no tech tokens in their name (like `general-rules.md`) are treated as universal and always included. A content scanning fallback checks the first 50 lines when the filename is ambiguous.

**Tier 2 — Frontmatter triggers.** Ingredient files can declare explicit triggers:

```markdown
---
triggers: [react, typescript]
scope: engineering
priority: 10
---

Your instructions here...
```

- `triggers` — list of tech tokens; matches if any is in the detected stack
- `always: true` — always include regardless of stack
- `scope` — `engineering` (default) or `persona`
- `priority` — higher values appear first in output (default: 0)

**Tier 3 — External mapping.** An `ingred.yaml` at the source root can map files to conditions:

```yaml
mappings:
  - files: [react-patterns.md]
    when:
      dependencies: [react]
  - files: [mobile-guidelines.md]
    when:
      files_present: [pubspec.yaml]
```

## Stack detection

`ingred` detects technologies by parsing config files in the workspace root:

| File | Detected tokens |
|------|----------------|
| `package.json` | `node`, `javascript`, all dependency names |
| `tsconfig.json` | `typescript`, `node` |
| `Cargo.toml` | `rust`, `cargo`, crate names |
| `go.mod` | `go`, `golang`, module basenames |
| `pyproject.toml` | `python`, dependency names |
| `requirements.txt` | `python`, package names |
| `Gemfile` | `ruby`, gem names |
| `pubspec.yaml` | `dart`, `flutter`, dependency names |
| `composer.json` | `php`, package names |
| `pom.xml` | `java`, `maven`, artifact IDs |
| `build.gradle(.kts)` | `java`/`kotlin`, `gradle`, artifacts |
| `Package.swift` | `swift`, `ios` |
| `Dockerfile` | `docker` |

## File safety

Generated files start with a sentinel comment. On subsequent runs, `ingred mix` only overwrites files that contain this sentinel. Hand-written config files are never touched unless you pass `--force`.

## Config

Configuration is stored at `~/.ingred/config.json`. Git repos are cached under `~/.ingred/cache/`.

## License

MIT
