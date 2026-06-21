import { resolve, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileExists } from '../utils/fs.js';
import { log } from '../utils/logger.js';
import prompts from 'prompts';

const DEFAULT_REPO_NAME = 'my-ingredients';

// ─── Scaffold file contents ───────────────────────────────────────────────────

const GENERAL_RULES_MD = `# General Rules

These rules apply to all workspaces regardless of tech stack.

- Keep code readable and maintainable
- Write self-documenting variable and function names
- Prefer explicit over implicit
- Handle errors gracefully with clear messages
- Keep functions small and focused on a single responsibility
`;

const REACT_MD = `---
triggers: [react]
scope: engineering
priority: 5
---

# React Rules

- Prefer functional components with hooks over class components
- Use React.memo() for expensive components that re-render often
- Keep component state as local as possible
- Extract reusable logic into custom hooks
- Avoid prop drilling — use context or state management for deeply nested data
`;

const TESTING_MD = `---
triggers: [jest, vitest, mocha, pytest]
scope: engineering
priority: 3
---

# Testing Rules

- Write tests that assert intended behavior, not implementation details
- Prefer integration tests over unit tests for complex interactions
- Use descriptive test names that explain what is being tested
- Keep tests independent and avoid shared mutable state
- Aim for coverage of edge cases and error paths
`;

const PERSONA_COMMUNICATION_STYLE_MD = `---
scope: persona
always: true
---

# Communication Style

- Be concise and direct — no filler words
- Explain the "why" not just the "what"
- Use code examples when they clarify better than prose
- Highlight tradeoffs when multiple approaches exist
`;

const INGRED_YAML = `# ingred.yaml — external mapping file
# Maps ingredient files to tech stacks detected in the workspace.
# Uncomment and modify entries as needed.

# my-special-rules.md:
#   when:
#     dependencies: [express, fastify]

# database-rules.md:
#   when:
#     filesPresent: [docker-compose.yml]
#     dependencies: [pg, mysql2, sequelize]
#     matchAll: true
`;

const REPO_README_MD = `# My Ingredients

This is a personal ingredients repository for [ingred](https://github.com/yourusername/ingred).

## Structure

\`\`\`
my-ingredients/
├── general-rules.md          # Applies to all workspaces (no triggers)
├── react.md                  # Triggered when React is detected
├── testing.md                # Triggered by test frameworks
├── persona/
│   └── communication-style.md  # Always included (always: true)
└── ingred.yaml               # External tech-stack mappings
\`\`\`

## Frontmatter fields

| Field      | Type     | Description                                      |
|------------|----------|--------------------------------------------------|
| triggers   | string[] | Tech tokens that activate this ingredient        |
| scope      | string   | \`engineering\` or \`persona\`                       |
| priority   | number   | Higher = earlier in output (default: 0)          |
| always     | boolean  | Include in every workspace (default: false)      |
| global     | boolean  | Write to global config instead of project        |

## Adding this repo

\`\`\`bash
ingred add ./my-ingredients          # local path
# or
ingred add https://github.com/you/my-ingredients.git
\`\`\`

Then run \`ingred mix\` in any workspace to compile your instructions.
`;

const WORKSPACE_CONFIG_YAML = `# ingred workspace configuration
# Uncomment and modify sections as needed.

# profile: default

# exclude:
#   - source-name/file-to-skip.md

# targets: [claude, cursor]
`;

// ─── Scaffold functions ───────────────────────────────────────────────────────

export async function scaffoldIngredientsRepo(repoDir: string): Promise<void> {
  const personaDir = join(repoDir, 'persona');

  await mkdir(repoDir, { recursive: true });
  await mkdir(personaDir, { recursive: true });

  await writeFile(join(repoDir, 'general-rules.md'), GENERAL_RULES_MD, 'utf-8');
  await writeFile(join(repoDir, 'react.md'), REACT_MD, 'utf-8');
  await writeFile(join(repoDir, 'testing.md'), TESTING_MD, 'utf-8');
  await writeFile(join(personaDir, 'communication-style.md'), PERSONA_COMMUNICATION_STYLE_MD, 'utf-8');
  await writeFile(join(repoDir, 'ingred.yaml'), INGRED_YAML, 'utf-8');
  await writeFile(join(repoDir, 'README.md'), REPO_README_MD, 'utf-8');
}

export async function scaffoldWorkspaceConfig(workspaceRoot: string): Promise<void> {
  const configPath = join(workspaceRoot, '.ingred.yaml');
  await writeFile(configPath, WORKSPACE_CONFIG_YAML, 'utf-8');
}

// ─── Command handler ──────────────────────────────────────────────────────────

export async function initCommand(opts: { repo?: string | boolean; workspace?: boolean }): Promise<void> {
  // --workspace flag: scaffold .ingred.yaml in cwd
  if (opts.workspace) {
    const workspaceRoot = resolve('.');
    const configPath = join(workspaceRoot, '.ingred.yaml');

    if (await fileExists(configPath)) {
      log.warn('.ingred.yaml already exists in this directory.');
      return;
    }

    await scaffoldWorkspaceConfig(workspaceRoot);
    log.success('Created .ingred.yaml');
    log.hint('Edit .ingred.yaml to configure targets, profiles, and exclusions.');
    return;
  }

  // --repo [name] flag: scaffold an ingredients repo
  if (opts.repo !== undefined) {
    const repoName = typeof opts.repo === 'string' ? opts.repo : DEFAULT_REPO_NAME;
    const repoDir = resolve(repoName);

    if (await fileExists(repoDir)) {
      log.warn(`Directory "${repoName}" already exists.`);
      return;
    }

    await scaffoldIngredientsRepo(repoDir);
    log.success(`Created ingredients repo: ${repoName}/`);
    log.hint(`Run \`ingred add ./${repoName}\` to link it, then \`ingred mix\` in any workspace.`);
    return;
  }

  // Interactive mode: ask which action to take
  const modeResponse = await prompts({
    type: 'select',
    name: 'mode',
    message: 'What would you like to initialize?',
    choices: [
      { title: 'Ingredients repo  — create a starter repo of .md rule files', value: 'repo' },
      { title: 'Workspace config  — create .ingred.yaml in the current directory', value: 'workspace' },
    ],
  });

  if (!modeResponse.mode) {
    log.warn('Cancelled.');
    return;
  }

  if (modeResponse.mode === 'workspace') {
    const workspaceRoot = resolve('.');
    const configPath = join(workspaceRoot, '.ingred.yaml');

    if (await fileExists(configPath)) {
      log.warn('.ingred.yaml already exists in this directory.');
      return;
    }

    await scaffoldWorkspaceConfig(workspaceRoot);
    log.success('Created .ingred.yaml');
    log.hint('Edit .ingred.yaml to configure targets, profiles, and exclusions.');
    return;
  }

  // repo mode: ask for name
  const nameResponse = await prompts({
    type: 'text',
    name: 'name',
    message: 'Repo directory name',
    initial: DEFAULT_REPO_NAME,
  });

  if (!nameResponse.name) {
    log.warn('Cancelled.');
    return;
  }

  const repoName: string = nameResponse.name;
  const repoDir = resolve(repoName);

  if (await fileExists(repoDir)) {
    log.warn(`Directory "${repoName}" already exists.`);
    return;
  }

  await scaffoldIngredientsRepo(repoDir);
  log.success(`Created ingredients repo: ${repoName}/`);
  log.hint(`Run \`ingred add ./${repoName}\` to link it, then \`ingred mix\` in any workspace.`);
}
