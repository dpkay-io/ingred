# Interactive Mix Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `--interactive` / `-i` flag to `ingred mix` that shows a `prompts` multi-select after matching, letting users confirm/skip ingredients before compilation.

**Architecture:** Insert an interactive filtering step between `matchIngredients()` and `compile()` in `src/commands/mix.ts`. Uses the `prompts` library for a multi-select prompt where all matched ingredients are pre-selected and the user can deselect ones they don't want. No persistence — fresh selection every run.

**Tech Stack:** Node.js, TypeScript, `prompts` library

---

### Task 1: Install `prompts` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install prompts and its type definitions**

Run:
```bash
npm install prompts
npm install -D @types/prompts
```

- [ ] **Step 2: Verify installation**

Run:
```bash
npm ls prompts
```

Expected: `prompts@X.X.X` listed under dependencies.

- [ ] **Step 3: Verify typecheck still passes**

Run:
```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "add prompts dependency for interactive mix mode"
```

---

### Task 2: Add `--interactive` flag to CLI

**Files:**
- Modify: `src/cli.ts:36-43`

- [ ] **Step 1: Add the `-i, --interactive` option to the mix command**

In `src/cli.ts`, add the option to the mix command chain. The current code (lines 36-43):

```typescript
program
  .command('mix')
  .description('Compile and write agent config files for the current workspace')
  .option('-n, --dry-run', 'Show what would be written without writing')
  .option('-f, --force', 'Overwrite existing non-ingred files')
  .option('-t, --targets <ids>', 'Comma-separated target IDs (claude,cursor,copilot,agents,gemini)')
  .option('-v, --verbose', 'Show detailed matching information')
  .action(mixCommand);
```

Add the new option before `.action()`:

```typescript
program
  .command('mix')
  .description('Compile and write agent config files for the current workspace')
  .option('-n, --dry-run', 'Show what would be written without writing')
  .option('-f, --force', 'Overwrite existing non-ingred files')
  .option('-t, --targets <ids>', 'Comma-separated target IDs (claude,cursor,copilot,agents,gemini)')
  .option('-i, --interactive', 'Interactively select which ingredients to include')
  .option('-v, --verbose', 'Show detailed matching information')
  .action(mixCommand);
```

- [ ] **Step 2: Verify typecheck passes**

Run:
```bash
npm run typecheck
```

Expected: No errors (commander options are loosely typed).

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "add --interactive flag to mix command"
```

---

### Task 3: Write failing test for interactive filtering

**Files:**
- Create: `tests/unit/mix-interactive.test.ts`

The interactive prompt itself can't be unit-tested (it requires a TTY), but we can extract the filtering logic into a testable function. However, since the feature is a thin integration (~15 lines in mix.ts using `prompts` directly), and testing stdin interaction in `node:test` is impractical, we'll test this manually via `npm run dev`.

Instead, we write a test to verify the contract: that `compile()` respects a filtered subset of matches, confirming the pipeline works when matches are reduced.

- [ ] **Step 1: Write the test**

Create `tests/unit/mix-interactive.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../src/core/compiler.js';
import type { MatchResult, IngredientFile } from '../../src/types.js';
import { DEFAULT_META } from '../../src/types.js';

function makeMatch(relativePath: string, content: string): MatchResult {
  const ingredient: IngredientFile = {
    filePath: `/fake/${relativePath}`,
    relativePath,
    sourceName: 'test',
    content,
    meta: { ...DEFAULT_META },
  };
  return { ingredient, matchTier: 1, matchReason: 'test' };
}

describe('compile with filtered matches (interactive simulation)', () => {
  it('compiles only the matches passed to it', () => {
    const match1 = makeMatch('react.md', 'React rules');
    const match2 = makeMatch('typescript.md', 'TS rules');
    const match3 = makeMatch('testing.md', 'Test rules');

    const allResult = compile([match1, match2, match3]);
    const filteredResult = compile([match1, match3]);

    assert.ok(allResult.project.engineeringSection.includes('TS rules'));
    assert.ok(!filteredResult.project.engineeringSection.includes('TS rules'));
    assert.ok(filteredResult.project.engineeringSection.includes('React rules'));
    assert.ok(filteredResult.project.engineeringSection.includes('Test rules'));
  });

  it('returns empty sections when no matches passed', () => {
    const result = compile([]);
    assert.equal(result.project.engineeringSection, '');
    assert.equal(result.project.personaSection, '');
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run:
```bash
npx tsx --test tests/unit/mix-interactive.test.ts
```

Expected: Both tests pass. These verify that `compile()` correctly handles subsets of matches — the contract the interactive mode depends on.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/mix-interactive.test.ts
git commit -m "add tests for compile with filtered match subsets"
```

---

### Task 4: Add interactive prompt to mix command

**Files:**
- Modify: `src/commands/mix.ts:1-10` (imports), `src/commands/mix.ts:22-27` (opts type), `src/commands/mix.ts:66-88` (between match and compile)

- [ ] **Step 1: Add the import for prompts**

Add at the top of `src/commands/mix.ts`, after the existing imports:

```typescript
import prompts from 'prompts';
```

- [ ] **Step 2: Add `interactive` to the opts type**

Update the opts parameter type of `mixCommand` (line 22-27):

```typescript
export async function mixCommand(opts: {
  dryRun?: boolean;
  force?: boolean;
  targets?: string;
  interactive?: boolean;
  verbose?: boolean;
}): Promise<void> {
```

- [ ] **Step 3: Add interactive selection between match and compile**

After the existing match logging and early-return check (after line 85, before the `// Compile` comment on line 87), insert:

```typescript
  // Interactive selection
  let selectedMatches = matches;

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

    log.item('Selected', `${selectedMatches.length} of ${matches.length} ingredients`);
  }
```

- [ ] **Step 4: Update compile call to use selectedMatches**

Change line 88 from:

```typescript
  const compiled = compile(matches);
```

To:

```typescript
  const compiled = compile(selectedMatches);
```

- [ ] **Step 5: Verify typecheck passes**

Run:
```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 6: Verify existing tests still pass**

Run:
```bash
npm run test
```

Expected: All tests pass.

- [ ] **Step 7: Verify build succeeds**

Run:
```bash
npm run build
```

Expected: `dist/cli.js` is produced without errors. `prompts` is bundled correctly.

- [ ] **Step 8: Commit**

```bash
git add src/commands/mix.ts
git commit -m "add interactive ingredient selection to mix command"
```

---

### Task 5: Manual testing

- [ ] **Step 1: Test interactive mode with a real workspace**

Navigate to a workspace with ingredient sources configured and run:

```bash
npm run dev -- mix --interactive
```

Expected: After matching, a multi-select prompt appears listing all matched ingredients with their source/path and match reason. All are pre-selected. Arrow keys navigate, space toggles, enter confirms.

- [ ] **Step 2: Test cancellation (Ctrl+C)**

Run `npm run dev -- mix --interactive` and press Ctrl+C at the prompt.

Expected: Prints "Selection cancelled." and exits cleanly (no stack trace).

- [ ] **Step 3: Test deselecting all**

Run `npm run dev -- mix --interactive` and deselect all items, then press enter.

Expected: Prints "No ingredients selected." and exits.

- [ ] **Step 4: Test non-interactive mode still works**

Run:
```bash
npm run dev -- mix
```

Expected: Behaves exactly as before — no prompt, all matches compiled automatically.

- [ ] **Step 5: Test combined flags**

Run:
```bash
npm run dev -- mix --interactive --dry-run
```

Expected: Prompt appears, user selects ingredients, then dry-run output shows what would be written (no files created).
