import { Command } from 'commander';
import { addCommand } from './commands/add.js';
import { removeCommand } from './commands/remove.js';
import { listCommand } from './commands/list.js';
import { mixCommand } from './commands/mix.js';
import { IngredError } from './utils/errors.js';
import { log } from './utils/logger.js';

const program = new Command();

program
  .name('ingred')
  .description('Compile personalized AI coding instructions into native agent config files')
  .version('0.1.0');

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
  .command('list')
  .description('List linked ingredient sources')
  .option('-v, --verbose', 'Show individual ingredient files')
  .option('-m, --matched', 'Show which ingredients match the current workspace')
  .action(listCommand);

program
  .command('mix')
  .description('Compile and write agent config files for the current workspace')
  .option('-n, --dry-run', 'Show what would be written without writing')
  .option('-f, --force', 'Overwrite existing non-ingred files')
  .option('-t, --targets <ids>', 'Comma-separated target IDs (claude,cursor,copilot,agents,gemini)')
  .option('-i, --interactive', 'Interactively select which ingredients to include')
  .option('-v, --verbose', 'Show detailed matching information')
  .action(mixCommand);

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
