import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function readTextFile(path: string): Promise<string> {
  return await readFile(path, "utf8");
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, content, "utf8");
}

export async function copyTextFile(sourcePath: string, targetPath: string): Promise<void> {
  await writeTextFile(targetPath, await readTextFile(sourcePath));
}

export async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readTextFile(path));
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function appendUniqueLine(path: string, line: string): Promise<void> {
  const existing = (await fileExists(path)) ? await readTextFile(path) : "";
  const lines = existing.split(/\r?\n/).filter(Boolean);

  if (lines.includes(line)) {
    return;
  }

  const next = [...lines, line].join("\n");
  await writeTextFile(path, `${next}\n`);
}
