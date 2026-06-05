const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';

const noColor = process.env['NO_COLOR'] !== undefined;

function c(code: string, text: string): string {
  return noColor ? text : `${code}${text}${RESET}`;
}

export const log = {
  info(msg: string) {
    console.log(msg);
  },
  success(msg: string) {
    console.log(c(GREEN, `  ✓ ${msg}`));
  },
  warn(msg: string) {
    console.log(c(YELLOW, `  ⚠ ${msg}`));
  },
  error(msg: string) {
    console.error(c(RED, `  ✗ ${msg}`));
  },
  hint(msg: string) {
    console.log(c(DIM, `  ${msg}`));
  },
  header(msg: string) {
    console.log(c(BOLD + CYAN, msg));
  },
  item(label: string, value: string) {
    console.log(`  ${c(DIM, label + ':')} ${value}`);
  },
};
