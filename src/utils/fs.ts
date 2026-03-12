import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

export async function copyFile(src: string, dest: string): Promise<void> {
  ensureDir(dirname(dest));
  const content = await Bun.file(src).text();
  await Bun.write(dest, content);
}

export async function copyDir(src: string, dest: string): Promise<void> {
  ensureDir(dest);
  const glob = new Bun.Glob("**/*");
  for await (const path of glob.scan({ cwd: src, onlyFiles: true })) {
    await copyFile(join(src, path), join(dest, path));
  }
}

export function getRegistryPath(): string {
  // The registry is shipped alongside the CLI source
  return join(import.meta.dir, "../../registry");
}

export function relativePath(from: string, to: string): string {
  return relative(from, to);
}
