// The Night Shift's scripts, loaded for the suite  [task 1.1N-01]
//
// `scripts/dream/*.mjs` is plain ESM outside `tsconfig`'s `include` — these
// scripts run under `node` as well as `bun`, like everything else in `scripts/`.
// So they are imported through a COMPUTED specifier, exactly as
// `tests/meta/spawn-timeouts.test.ts` imports `scripts/spawn.mjs`: a literal
// specifier would send `tsc --noEmit` looking for a `.mjs` declaration file that
// does not exist and should not.
//
// The types below are the surface the tests actually use, written out rather
// than `any`-ed, so a rename in a script shows up here as a type error instead
// of as a green test asserting on `undefined`.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

const load = (name: string) => import(resolve(ROOT, "scripts", "dream", name));

export interface LedgerRow {
  iteration: number;
  date: string;
  kind: string;
  id: string;
  branch: string | null;
  commit: string | null;
  metric: number | string | null;
  delta: number | string | null;
  guard: string | null;
  gates: string | null;
  taste: number | string | null;
  status: string;
  description: string;
}

export interface LedgerModule {
  METRIC_DIRECTION: string;
  LEDGER_PREAMBLE: string;
  LEDGER_COLUMNS: string[];
  LEDGER_STATUSES: string[];
  LEDGER_KINDS: string[];
  LEDGER_EMPTY: string;
  assertCellSafe: (column: string, value: unknown) => string;
  rowCells: (row: Partial<LedgerRow>) => string[];
  formatRow: (row: Partial<LedgerRow>) => string;
  parseLedger: (text: string) => LedgerRow[];
  readLedger: (path: string) => LedgerRow[];
  initLedger: (path: string) => boolean;
  nextPosition: (
    rows: LedgerRow[],
    kind: string,
    metric: unknown,
  ) => { iteration: number; delta: number | null };
  appendRow: (path: string, row: Partial<LedgerRow>) => string;
}

export interface Brief {
  id: string;
  kind: string;
  brief: string;
  axes_hint?: Record<string, unknown>;
  added: string;
  status: string;
}

export interface Queue {
  version: number;
  briefs: Brief[];
}

export interface QueueModule {
  QUEUE_VERSION: number;
  QUEUE_STATUSES: string[];
  QUEUE_TERMINAL: string[];
  QUEUE_TRANSITIONS: Record<string, string[]>;
  QUEUE_KINDS: string[];
  validateQueue: (value: unknown) => { field: string; message: string }[];
  readQueue: (path: string) => Queue;
  writeQueue: (path: string, queue: Queue) => void;
  pickNext: (queue: Queue, kind?: string | null) => Brief | null;
  findBrief: (queue: Queue, id: string) => Brief | null;
  transition: (brief: Brief, status: string) => Brief;
  releaseStale: (queue: Queue) => string[];
  queueSummary: (queue: Queue) => Record<string, number>;
}

export interface Violation {
  path: string;
  kind: "forbidden" | "outside-allow-list";
  reason: string;
}

export interface GuardsModule {
  FORBIDDEN_PATHS: { pattern: RegExp; reason: string }[];
  ALLOWED_PATHS: { pattern: RegExp; by: string }[];
  ALLOWED_GIT_SUBCOMMANDS: string[];
  PROTECTED_BRANCH: string;
  classifyPath: (path: string) => Violation | null;
  checkDiffPaths: (paths: string[]) => { ok: boolean; violations: Violation[] };
  diffViolationSummary: (violations: Violation[]) => string;
  assertCleanStart: (state: { branch: string; dirty: boolean; files?: string[] }) => void;
  assertNotProtected: (branch: string, what?: string) => void;
  assertGitAllowed: (args: string[]) => string[];
  assertGenerateArgsAllowed: (args: string[]) => string[];
}

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export type Runner = (
  command: string,
  args: string[],
  options?: Record<string, unknown>,
) => RunResult;

export interface DreamGate {
  name: string;
  describe: string;
  command: (ctx: Record<string, string>) => [string, string[]];
  timeout: number;
}

export interface DreamResult {
  outcome: "keep" | "discard" | "dry-run" | "empty";
  reason?: string;
  gate?: string;
  brief: Brief | null;
  theme?: string;
  branch?: string;
  commit?: string | null;
  metric?: number | null;
  nearest?: string | null;
  gates?: string[];
  bundleDir?: string;
  violations?: Violation[];
  output?: string;
}

export interface ThemeModule {
  DREAMS_DIR: string;
  QUEUE_FILE: string;
  SEEDS_DIR: string;
  OUT_DIR: string;
  LEDGER_FILE: string;
  THEME_OUT_DIR: string;
  GATE_TIMEOUT: Record<string, number>;
  THEME_GATES: DreamGate[];
  defaultRun: Runner;
  currentBranch: (run: Runner) => string;
  dirtyPaths: (run: Runner) => string[];
  canOpenPullRequest: (run: Runner) => boolean;
  readSeed: (path: string, root?: string) => Record<string, unknown>;
  readMetric: (
    root: string,
    theme: string,
  ) => { metric: number | null; nearest: string | null; tokenDistance?: number | null };
  runThemeDream: (options: Record<string, unknown>) => Promise<DreamResult>;
  parseDreamArgs: (argv: string[]) => { briefId: string | null; seedPath: string | null; dryRun: boolean } | null;
}

export interface SnapshotModule {
  SNAPSHOT_SCHEMES: string[];
  SNAPSHOT_VIEWPORT: { width: number; height: number };
  snapshotPlan: (options: { theme: string; outDir: string; root?: string }) => {
    theme: string;
    preview: string;
    outDir: string;
    viewport: { width: number; height: number };
    shots: { scheme: string; url: string; file: string }[];
  };
  captureSnapshots: (
    plan: unknown,
    options?: { launch?: () => Promise<unknown> },
  ) => Promise<string[]>;
  parseSnapshotArgs: (argv: string[]) => { theme: string; outDir: string } | null;
}

export const loadLedger = () => load("ledger.mjs") as Promise<LedgerModule>;
export const loadQueue = () => load("queue.mjs") as Promise<QueueModule>;
export const loadGuards = () => load("guards.mjs") as Promise<GuardsModule>;
export const loadTheme = () => load("theme.mjs") as Promise<ThemeModule>;
export const loadSnapshot = () => load("snapshot.mjs") as Promise<SnapshotModule>;
