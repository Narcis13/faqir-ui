import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCli } from "../src/index";

type AuditJson = {
  ok: boolean;
  summary: {
    total: number;
    files: number;
    components: number;
  };
};

async function main(): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "loom-audit-all-"));

  try {
    await ensureSuccess(["init"], cwd);
    await ensureSuccess(["gallery"], cwd);
    const audit = await captureJson<AuditJson>(["audit", "--json"], cwd);

    if (!audit.ok) {
      throw new Error(`Audit failed with ${audit.summary.total} issue(s)`);
    }

    process.stdout.write(
      `Audit passed across ${audit.summary.files} HTML file(s) and ${audit.summary.components} component instance(s).\n`,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function ensureSuccess(args: string[], cwd: string): Promise<void> {
  const code = await silenceOutput(async () => await runCli(args, cwd));

  if (code !== 0) {
    throw new Error(`Command failed: loom ${args.join(" ")}`);
  }
}

async function captureJson<T>(args: string[], cwd: string): Promise<T> {
  let output = "";
  const originalLog = console.log;
  const originalWrite = process.stdout.write.bind(process.stdout);

  console.log = () => {};
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write;

  try {
    const code = await runCli(args, cwd);

    if (code !== 0) {
      throw new Error(`Command failed: loom ${args.join(" ")}`);
    }

    return JSON.parse(output) as T;
  } finally {
    console.log = originalLog;
    process.stdout.write = originalWrite;
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

if (import.meta.main) {
  await main();
}
