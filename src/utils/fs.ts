import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

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

/**
 * Directory of the current module, resolved across runtimes.
 * Bun exposes `import.meta.dir`; the compiled Node bundle does not, so we fall
 * back to deriving it from `import.meta.url`.
 */
function moduleDir(): string {
  const dir = (import.meta as { dir?: string }).dir;
  if (typeof dir === "string" && dir.length > 0) return dir;
  return dirname(fileURLToPath(import.meta.url));
}

let cachedPackageRoot: string | null = null;

/**
 * Resolve the package root that ships the `registry/`. Depth-agnostic so it
 * works both from source (`src/utils/…`, run under Bun) and from the compiled
 * single-file bundle (`dist/faqir.mjs`, run under Node) — the two live at
 * different depths relative to the registry.
 */
function resolvePackageRoot(): string {
  if (cachedPackageRoot) return cachedPackageRoot;

  let dir = moduleDir();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "registry"))) {
      cachedPackageRoot = dir;
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Fallback to the historical src/utils layout assumption.
  cachedPackageRoot = join(moduleDir(), "../..");
  return cachedPackageRoot;
}

export function getRegistryPath(): string {
  // The registry is shipped alongside the compiled CLI (and the source).
  return join(resolvePackageRoot(), "registry");
}

export function getPackageRoot(): string {
  return resolvePackageRoot();
}

export function relativePath(from: string, to: string): string {
  return relative(from, to);
}
