const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";

export const log = {
  info(msg: string) {
    console.log(`${BLUE}ℹ${RESET} ${msg}`);
  },
  success(msg: string) {
    console.log(`${GREEN}✓${RESET} ${msg}`);
  },
  warn(msg: string) {
    console.log(`${YELLOW}⚠${RESET} ${msg}`);
  },
  error(msg: string) {
    console.error(`${RED}✗${RESET} ${msg}`);
  },
  step(msg: string) {
    console.log(`  ${DIM}→${RESET} ${msg}`);
  },
  heading(msg: string) {
    console.log(`\n${BOLD}${msg}${RESET}`);
  },
  dim(msg: string) {
    console.log(`${DIM}${msg}${RESET}`);
  },
  blank() {
    console.log();
  },
  table(rows: [string, string][]) {
    const maxKey = Math.max(...rows.map(([k]) => k.length));
    for (const [key, value] of rows) {
      console.log(`  ${CYAN}${key.padEnd(maxKey)}${RESET}  ${value}`);
    }
  },
};
