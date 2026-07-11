import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { readConfig, writeConfig } from "../../src/utils/config";
import { copyDir, getRegistryPath } from "../../src/utils/fs";
import { buildRegistryIndex, serializeRegistryIndex } from "../../src/utils/registry-index";
import { __setFetchImpl } from "../../src/utils/remote-registry";

const ROOT = join(import.meta.dir, "../..");
const TEST_DIR = join(import.meta.dir, "../.tmp-add-remote-test");
const REMOTE_DIR = join(import.meta.dir, "../.tmp-remote-registry");

// The remote registry is a folder of static files served over a base URL. A
// fetch seam maps `<BASE>/<path>` to a file in REMOTE_DIR and returns real
// Response objects — so the whole fetch → hash-verify → write pipeline runs
// against genuine bytes, no live socket required (Bun's test runtime blocks
// localhost fetch). `missing`/`tamper` let a test simulate a broken or hostile
// host.
const BASE = "https://registry.example.test/ui";
const missing = new Set<string>();
const tamper = new Map<string, string>();
let restoreFetch: () => void;

function staticFetch(url: string): Promise<Response> {
  if (!url.startsWith(BASE)) {
    return Promise.resolve(new Response("bad base", { status: 404 }));
  }
  const rel = decodeURIComponent(url.slice(BASE.length).replace(/^\//, ""));
  if (missing.has(rel)) return Promise.resolve(new Response("not found", { status: 404 }));
  if (tamper.has(rel)) return Promise.resolve(new Response(tamper.get(rel)!, { status: 200 }));
  const abs = join(REMOTE_DIR, rel);
  if (!existsSync(abs)) return Promise.resolve(new Response("not found", { status: 404 }));
  return Promise.resolve(new Response(readFileSync(abs)));
}

beforeAll(async () => {
  // Build a static registry fixture from real components: button (no deps) and
  // card (composition.contains → button).
  rmSync(REMOTE_DIR, { recursive: true, force: true });
  const registry = getRegistryPath();
  await copyDir(join(registry, "primitives/button"), join(REMOTE_DIR, "primitives/button"));
  await copyDir(join(registry, "primitives/card"), join(REMOTE_DIR, "primitives/card"));
  const index = buildRegistryIndex(REMOTE_DIR);
  await Bun.write(join(REMOTE_DIR, "registry-index.json"), serializeRegistryIndex(index));

  restoreFetch = __setFetchImpl(staticFetch);
});

afterAll(() => {
  restoreFetch();
  rmSync(REMOTE_DIR, { recursive: true, force: true });
});

beforeEach(() => {
  missing.clear();
  tamper.clear();
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
  process.chdir(TEST_DIR);
});

afterEach(() => {
  process.chdir(ROOT);
  rmSync(TEST_DIR, { recursive: true, force: true });
});

/** Run add() capturing process.exit, so an aborted install is observable. */
async function runAdd(args: string[]): Promise<number> {
  let exitCode = 0;
  const origExit = process.exit;
  process.exit = ((code: number) => {
    exitCode = code;
    throw new Error("exit");
  }) as never;
  try {
    await add(args);
  } catch (err) {
    if (!(err instanceof Error) || err.message !== "exit") throw err;
  } finally {
    process.exit = origExit;
  }
  return exitCode;
}

describe("faqir add --registry (remote)", () => {
  it("happy path: fetches, verifies, and installs a single component", async () => {
    await init([]);
    const code = await runAdd(["button", "--registry", BASE]);
    expect(code).toBe(0);

    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives).toContain("button");

    const dir = join(TEST_DIR, "ui/primitives/button");
    expect(existsSync(join(dir, "button.css"))).toBe(true);
    expect(existsSync(join(dir, "button.html"))).toBe(true);
    expect(existsSync(join(dir, "button.manifest.json"))).toBe(true);

    // byte-identical to what the host served
    const got = readFileSync(join(dir, "button.css"));
    const want = readFileSync(join(REMOTE_DIR, "primitives/button/button.css"));
    expect(Buffer.compare(got, want)).toBe(0);
  });

  it("resolves dependencies across the remote index", async () => {
    await init([]);
    await runAdd(["card", "--registry", BASE]);

    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives).toContain("card");
    expect(config.installed.primitives).toContain("button");
    expect(existsSync(join(TEST_DIR, "ui/primitives/button/button.css"))).toBe(true);
  });

  it("skips dependency fetch with --no-deps", async () => {
    await init([]);
    await runAdd(["card", "--registry", BASE, "--no-deps"]);

    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives).toContain("card");
    expect(config.installed.primitives).not.toContain("button");
  });

  it("hash mismatch → aborts with nothing written", async () => {
    await init([]);
    tamper.set("primitives/button/button.css", "/* tampered payload */");

    const code = await runAdd(["button", "--registry", BASE]);
    expect(code).toBe(1);

    // nothing written, config untouched
    expect(existsSync(join(TEST_DIR, "ui/primitives/button"))).toBe(false);
    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives).not.toContain("button");
  });

  it("missing file (404) → clean error, nothing written", async () => {
    await init([]);
    missing.add("primitives/button/button.html");

    const code = await runAdd(["button", "--registry", BASE]);
    expect(code).toBe(1);
    expect(existsSync(join(TEST_DIR, "ui/primitives/button"))).toBe(false);
    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives).not.toContain("button");
  });

  it("partial failure across components writes NOTHING (buffer-then-commit)", async () => {
    await init([]);
    // button verifies fine; card is tampered. Because writes are buffered until
    // every component is verified, button must NOT be written either.
    tamper.set("primitives/card/card.css", "/* tampered */");

    const code = await runAdd(["button", "card", "--registry", BASE]);
    expect(code).toBe(1);

    expect(existsSync(join(TEST_DIR, "ui/primitives/button"))).toBe(false);
    expect(existsSync(join(TEST_DIR, "ui/primitives/card"))).toBe(false);
    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives).toEqual([]);
  });

  it("bad index URL → clean error, nothing written", async () => {
    await init([]);
    const code = await runAdd(["button", "--registry", "https://wrong.example.test/nope"]);
    expect(code).toBe(1);
    expect(existsSync(join(TEST_DIR, "ui/primitives/button"))).toBe(false);
  });

  it("unknown component in remote index → clean error", async () => {
    await init([]);
    const code = await runAdd(["no-such-component", "--registry", BASE]);
    expect(code).toBe(1);
    expect(existsSync(join(TEST_DIR, "ui/primitives/no-such-component"))).toBe(false);
  });

  it("--all installs every component in the remote index", async () => {
    await init([]);
    await runAdd(["--all", "--registry", BASE]);
    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives).toContain("button");
    expect(config.installed.primitives).toContain("card");
  });
});

describe("scoped names via faqir.config.json registries map", () => {
  async function initWithRegistry(scopeKey: string) {
    await init([]);
    const config = await readConfig(TEST_DIR);
    config.registries = { [scopeKey]: BASE };
    await writeConfig(config, TEST_DIR);
  }

  it("resolves @scope/name through the registries map", async () => {
    await initWithRegistry("@remote");
    const code = await runAdd(["@remote/button"]);
    expect(code).toBe(0);

    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives).toContain("button");
    expect(existsSync(join(TEST_DIR, "ui/primitives/button/button.css"))).toBe(true);
  });

  it("accepts a scope key written without the leading @", async () => {
    await initWithRegistry("remote");
    await runAdd(["@remote/button"]);
    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives).toContain("button");
  });

  it("unknown scope → helpful error, nothing written", async () => {
    await initWithRegistry("@remote");
    const code = await runAdd(["@unknown/button"]);
    expect(code).toBe(1);
    expect(existsSync(join(TEST_DIR, "ui/primitives/button"))).toBe(false);
    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives).not.toContain("button");
  });
});
