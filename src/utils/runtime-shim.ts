/**
 * Bun → Node runtime shim.
 *
 * The CLI source is written against a handful of Bun runtime globals
 * (`Bun.file`, `Bun.write`, `Bun.Glob`, `Bun.serve`). When the CLI is compiled
 * with `bun build --target=node`, those calls are emitted verbatim — Bun does
 * NOT polyfill the `Bun` global for the Node target. This module installs a
 * minimal, dependency-free polyfill on `globalThis.Bun` so the compiled
 * `dist/faqir.mjs` runs on plain Node >= 18.
 *
 * Under the Bun runtime this module is a complete no-op: the guard at the
 * bottom sees the native `Bun` global and never overwrites it. It must be the
 * first import in `src/index.ts` so the polyfill is installed before any
 * command touches a `Bun.*` API.
 */
import {
  createReadStream,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";

/** Lazy, path-backed stand-in for a Bun `BunFile`. */
class NodeBunFile {
  constructor(private readonly path: string) {}

  async text(): Promise<string> {
    return readFile(this.path, "utf8");
  }

  async json(): Promise<unknown> {
    return JSON.parse(await readFile(this.path, "utf8"));
  }

  async exists(): Promise<boolean> {
    try {
      await access(this.path);
      return true;
    } catch {
      return false;
    }
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const buf = await readFile(this.path);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }

  async bytes(): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.path));
  }

  stream(): ReturnType<typeof createReadStream> {
    return createReadStream(this.path);
  }

  get size(): number {
    try {
      return statSync(this.path).size;
    } catch {
      return 0;
    }
  }
}

function bunFile(path: string): NodeBunFile {
  return new NodeBunFile(path);
}

type WriteData = string | ArrayBuffer | ArrayBufferView | NodeBunFile;

async function bunWrite(dest: string, data: WriteData): Promise<number> {
  mkdirSync(dirname(dest), { recursive: true });

  let contents: string | Uint8Array;
  if (typeof data === "string") {
    contents = data;
  } else if (data instanceof NodeBunFile) {
    contents = new Uint8Array(await data.arrayBuffer());
  } else if (data instanceof ArrayBuffer) {
    contents = new Uint8Array(data);
  } else if (ArrayBuffer.isView(data)) {
    contents = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } else {
    contents = String(data);
  }

  await writeFile(dest, contents);
  return typeof contents === "string" ? Buffer.byteLength(contents) : contents.byteLength;
}

interface ScanOptions {
  cwd?: string;
  onlyFiles?: boolean;
  dot?: boolean;
}

/**
 * Translate a (small) glob subset to an anchored RegExp matched against a
 * POSIX-style path relative to the scan root. Supports `**`, `*`, and `?`.
 */
function globToRegExp(glob: string): RegExp {
  let re = "^";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++; // consume the second star
        if (glob[i + 1] === "/") {
          i++; // consume the slash → `**/` matches any number of leading dirs
          re += "(?:.*/)?";
        } else {
          re += ".*";
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if ("\\^$.|+()[]{}".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp(re + "$");
}

/** Minimal stand-in for Bun's `Glob` covering the patterns the CLI uses. */
class NodeGlob {
  private readonly matches: (rel: string) => boolean;
  private readonly dirOnly: boolean;

  constructor(pattern: string) {
    let p = pattern;
    this.dirOnly = p.endsWith("/");
    if (this.dirOnly) p = p.slice(0, -1);
    const re = globToRegExp(p);
    this.matches = (rel) => re.test(rel);
  }

  private collect(opts?: ScanOptions | string): string[] {
    const options: ScanOptions = typeof opts === "string" ? { cwd: opts } : opts ?? {};
    const cwd = options.cwd ?? process.cwd();
    const onlyFiles = options.onlyFiles ?? true;
    const dot = options.dot ?? false;
    const out: string[] = [];

    const walk = (absDir: string, relDir: string): void => {
      let names: string[];
      try {
        names = readdirSync(absDir);
      } catch {
        return;
      }
      for (const name of names) {
        if (!dot && name.startsWith(".")) continue;
        const abs = join(absDir, name);
        let isDir: boolean;
        try {
          isDir = statSync(abs).isDirectory();
        } catch {
          continue;
        }
        const rel = relDir ? `${relDir}/${name}` : name;
        if (isDir) {
          const includeDirs = this.dirOnly || !onlyFiles;
          if (includeDirs && this.matches(rel)) out.push(rel);
          walk(abs, rel);
        } else if (!this.dirOnly && this.matches(rel)) {
          out.push(rel);
        }
      }
    };

    walk(cwd, "");
    return out;
  }

  *scanSync(opts?: ScanOptions | string): Generator<string> {
    yield* this.collect(opts);
  }

  async *scan(opts?: ScanOptions | string): AsyncGenerator<string> {
    for (const rel of this.collect(opts)) yield rel;
  }
}

function readNodeBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** node:http adapter implementing the slice of `Bun.serve` the dev server uses. */
function bunServe(options: any): any {
  const fetchHandler: (req: Request) => Response | Promise<Response> = options.fetch;
  const port: number = options.port ?? 3000;
  const hostname: string = options.hostname ?? "localhost";

  const server = createServer((nodeReq: any, nodeRes: any) => {
    void (async () => {
      try {
        const url = `http://${hostname}:${port}${nodeReq.url ?? "/"}`;
        const headers = new Headers();
        for (const [key, value] of Object.entries(nodeReq.headers)) {
          if (value === undefined) continue;
          headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
        }
        const method: string = nodeReq.method ?? "GET";
        const init: RequestInit = { method, headers };
        if (method !== "GET" && method !== "HEAD") {
          init.body = new Uint8Array(await readNodeBody(nodeReq));
        }
        const request = new Request(url, init);
        const response = await fetchHandler(request);

        nodeRes.statusCode = response.status;
        response.headers.forEach((value: string, key: string) => nodeRes.setHeader(key, value));
        nodeRes.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        nodeRes.statusCode = 500;
        nodeRes.end("Internal Server Error");
      }
    })();
  });

  server.listen(port, hostname);

  return {
    port,
    hostname,
    stop(): void {
      server.close();
    },
    reload(): void {},
    get url(): URL {
      return new URL(`http://${hostname}:${port}`);
    },
  };
}

function installBunShim(): void {
  (globalThis as any).Bun = {
    file: bunFile,
    write: bunWrite,
    Glob: NodeGlob,
    serve: bunServe,
  };
}

// Activate only on runtimes without a native `Bun` global (i.e. plain Node).
if (typeof (globalThis as any).Bun === "undefined") {
  installBunShim();
}
