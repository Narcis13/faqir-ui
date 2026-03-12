import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCli } from "../src/index";

type BenchmarkSummary = {
  name: string;
  iterations: number;
  averageMs: number;
  fastestMs: number;
  slowestMs: number;
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const suites: Array<{ name: string; run(cwd: string): Promise<void> }> = [
    {
      name: "cli-smoke",
      async run(cwd) {
        await ensureSuccess(["init"], cwd);
        await ensureSuccess(["add", "button", "dialog", "tabs", "dropdown"], cwd);
        await ensureSuccess(["audit", "--json"], cwd);
      },
    },
    {
      name: "gallery-audit",
      async run(cwd) {
        await ensureSuccess(["init"], cwd);
        await ensureSuccess(["gallery"], cwd);
        await ensureSuccess(["audit", "--file", "ui/gallery.html", "--json"], cwd);
      },
    },
  ];
  const results = await Promise.all(suites.map(async (suite) => await benchmarkSuite(suite.name, options.iterations, suite.run)));

  if (options.json) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return;
  }

  for (const result of results) {
    process.stdout.write(
      [
        `${result.name}`,
        `  avg ${result.averageMs.toFixed(2)}ms`,
        `  fastest ${result.fastestMs.toFixed(2)}ms`,
        `  slowest ${result.slowestMs.toFixed(2)}ms`,
        `  iterations ${result.iterations}`,
      ].join("\n") + "\n",
    );
  }
}

async function benchmarkSuite(
  name: string,
  iterations: number,
  run: (cwd: string) => Promise<void>,
): Promise<BenchmarkSummary> {
  const samples: number[] = [];

  for (let index = 0; index < iterations; index += 1) {
    const cwd = await mkdtemp(join(tmpdir(), `loom-bench-${name}-`));
    const startedAt = performance.now();

    try {
      await run(cwd);
      samples.push(performance.now() - startedAt);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }

  return {
    name,
    iterations,
    averageMs: samples.reduce((sum, sample) => sum + sample, 0) / samples.length,
    fastestMs: Math.min(...samples),
    slowestMs: Math.max(...samples),
  };
}

async function ensureSuccess(args: string[], cwd: string): Promise<void> {
  const code = await silenceOutput(async () => await runCli(args, cwd));

  if (code !== 0) {
    throw new Error(`Command failed: loom ${args.join(" ")}`);
  }
}

async function silenceOutput(callback: () => Promise<number>): Promise<number> {
  const originalLog = console.log;
  const originalWrite = process.stdout.write.bind(process.stdout);

  console.log = () => {};
  process.stdout.write = (() => true) as typeof process.stdout.write;

  try {
    return await callback();
  } finally {
    console.log = originalLog;
    process.stdout.write = originalWrite;
  }
}

function parseArgs(args: string[]): { iterations: number; json: boolean } {
  let iterations = 3;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--iterations") {
      const value = Number(args[index + 1]);

      if (!Number.isFinite(value) || value < 1) {
        throw new Error("--iterations requires a positive number");
      }

      iterations = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return { iterations, json };
}

if (import.meta.main) {
  await main();
}
