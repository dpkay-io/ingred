import { Command } from 'commander';
import { addCommand } from './commands/add.js';
import { removeCommand } from './commands/remove.js';
import { listCommand } from './commands/list.js';
import { mixCommand } from './commands/mix.js';
import { initCommand } from './commands/init.js';
import { updateCommand } from './commands/update.js';
import { privacyListCommand, privacySetCommand, privacyClearCommand } from './commands/privacy.js';
import { excludeCommand, includeCommand, excludeListCommand } from './commands/exclude.js';
import { diffCommand } from './commands/diff.js';
import { checkCommand } from './commands/check.js';
import { previewCommand } from './commands/preview.js';
import { searchCommand } from './commands/search.js';
import { installHooksCommand, uninstallHooksCommand } from './commands/hooks.js';
import { statusCommand } from './commands/status.js';
import { IngredError } from './utils/errors.js';
import { log } from './utils/logger.js';
import { VERSION } from './types.js';

const program = new Command();

program
  .name('ingred')
  .description('Compile personalized AI coding instructions into native agent config files')
  .version(VERSION);

program
  .command('add')
  .description('Add an ingredient source (git repo or local directory)')
  .argument('<source>', 'Git repo URL or local directory path')
  .option('-b, --branch <branch>', 'Git branch to use')
  .action(addCommand);

program
  .command('remove')
  .description('Remove an ingredient source')
  .argument('<name>', 'Name of the source to remove')
  .action(removeCommand);

program
  .command('update')
  .description('Sync ingredient sources')
  .argument('[name]', 'Source name (all if omitted)')
  .option('--unpin', 'Remove version pin and update to latest')
  .action(updateCommand);

program
  .command('list')
  .description('List linked ingredient sources')
  .option('-v, --verbose', 'Show individual ingredient files')
  .option('-m, --matched', 'Show which ingredients match the current workspace')
  .action(listCommand);

program
  .command('init')
  .description('Initialize an ingredients repo or workspace config')
  .option('--repo [name]', 'Create a new ingredients repo (default: my-ingredients)')
  .option('--workspace', 'Create .ingred.yaml in current directory')
  .action(initCommand);

program
  .command('mix')
  .description('Compile and write agent config files for the current workspace')
  .option('-n, --dry-run', 'Show what would be written without writing')
  .option('-f, --force', 'Overwrite existing non-ingred files')
  .option('-t, --targets <ids>', 'Comma-separated target IDs (claude,cursor,copilot,agents,gemini)')
  .option('-i, --interactive', 'Interactively select which ingredients to include')
  .option('-v, --verbose', 'Show detailed matching information')
  .option('-p, --all-private', 'Mark all matched ingredients as private')
  .option('-q, --quiet', 'Suppress all output except errors')
  .option('-w, --watch', 'Watch source files and recompile on changes')
  .action(mixCommand);

program
  .command('diff')
  .description('Show what ingred mix would change without writing')
  .option('-t, --targets <ids>', 'Comma-separated target IDs')
  .action(diffCommand);

const privacy = program
  .command('privacy')
  .description('Manage ingredient privacy settings for the current workspace');

privacy
  .command('list')
  .description('Show ingredients with their privacy status')
  .action(privacyListCommand);

privacy
  .command('set')
  .description('Set privacy for an ingredient')
  .argument('<ingredient>', 'Ingredient key (sourceName/relativePath)')
  .option('--private', 'Mark as private')
  .option('--public', 'Mark as public')
  .action(privacySetCommand);

privacy
  .command('clear')
  .description('Reset all privacy settings for this workspace')
  .action(privacyClearCommand);

program
  .command('exclude')
  .description('Exclude an ingredient from compilation')
  .argument('[ingredient]', 'Ingredient key (sourceName/relativePath)')
  .option('-l, --list', 'Show current exclusions')
  .action(async (ingredient: string | undefined, opts: { list?: boolean }) => {
    if (opts.list || !ingredient) {
      await excludeListCommand();
    } else {
      await excludeCommand(ingredient);
    }
  });

program
  .command('include')
  .description('Remove an ingredient from the exclusion list')
  .argument('<ingredient>', 'Ingredient key (sourceName/relativePath)')
  .action(includeCommand);

program
  .command('check')
  .description('Validate ingredient files for correctness')
  .argument('[source]', 'Source name to check (all if omitted)')
  .option('--strict', 'Treat warnings as errors')
  .action(checkCommand);

program
  .command('preview')
  .description('Preview how a single ingredient renders across targets')
  .argument('<ingredient>', 'Ingredient key (sourceName/relativePath)')
  .option('-t, --targets <ids>', 'Comma-separated target IDs')
  .action(previewCommand);

program
  .command('search')
  .description('Search GitHub for ingredient repos')
  .argument('<query>', 'Search query')
  .action(searchCommand);

program
  .command('install-hooks')
  .description('Install git hooks for auto-running ingred mix')
  .action(installHooksCommand);

program
  .command('uninstall-hooks')
  .description('Remove ingred-installed git hooks')
  .action(uninstallHooksCommand);

program
  .command('status')
  .description('Show overview of sources, matches, and target files')
  .action(statusCommand);

program.parseAsync().catch((err: unknown) => {
  if (err instanceof IngredError) {
    log.error(err.message);
    if (err.hint) {
      log.hint(err.hint);
    }
    process.exit(1);
  }
  throw err;
});
