# ingred

Compile personalized AI coding instructions into native agent config files.

Developers maintain markdown files with their coding preferences — React patterns, testing approaches, communication style, etc. — in git repos or local directories. `ingred` links to these sources, detects the current workspace's tech stack, matches relevant instruction files, and writes them into the config files that AI agents read on startup.

## Privacy-first by design

Your coding instructions are personal. `ingred` lets you keep sensitive ingredients private — they're compiled into `~/.ingred/compiled/` instead of your workspace, so they never end up in version control. Each target file gets a reference line pointing to the private location, so AI agents still pick them up.

```bash
# Mark a specific ingredient as private
ingred privacy set my-source/salary-negotiation.md --private

# Or make everything private in one shot
ingred mix --all-private
```

Privacy is per-project. Run `ingred privacy list` to see what's public and what's private.

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
# Add an ingredient source (git repo or local directory)
ingred add https://github.com/you/my-ingredients.git
ingred add ~/my-ingredients

# See what's linked
ingred list

# Compile instructions for the current workspace
ingred mix
```

`ingred mix` scans your workspace for config files (package.json, Cargo.toml, go.mod, etc.), figures out what technologies you're using, picks the relevant ingredient files, and writes all five target files.

## Commands

### `ingred add <source>`

Add a git repo or local directory as an ingredient source.

```bash
ingred add https://github.com/you/ingredients.git
ingred add ./local-ingredients
ingred add https://github.com/you/ingredients.git --branch main
```

### `ingred remove <name>`

Remove a linked source.

```bash
ingred remove my-ingredients
```

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
ingred mix --all-private          # mark all matched ingredients as private
ingred mix --verbose              # detailed output
```

With `--interactive` (`-i`), you get a multi-select prompt after matching where you can confirm or skip each ingredient before compilation.

### `ingred privacy`

Control which ingredients are kept private (written to `~/.ingred/compiled/` instead of the workspace config files). Private ingredients are still available to AI agents via a reference path appended to each target file.

```bash
ingred privacy list                                  # show public/private status of matched ingredients
ingred privacy set <source/path.md> --private        # mark an ingredient as private
ingred privacy set <source/path.md> --public         # mark it public again
ingred privacy clear                                 # reset all privacy settings for this project
```

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
