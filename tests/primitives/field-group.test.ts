// ═══════════════════════════════════════════════════════════════════════════
// field-group validation contract normalization  [task 0.6-01 · §7.1]
// ═══════════════════════════════════════════════════════════════════════════
//
// v0.2.x shipped `field-group` with a `data-state="error|valid"` vocabulary.
// 0.6-01 normalizes the validation vocabulary to `invalid | validating |
// disabled` (renaming the shipped `error` → `invalid`, a breaking change logged
// in the manifest `changes`), standardizes the required marker as a
// [data-part="required"] element, and keeps error visibility purely CSS-driven.
//
// This suite pins:
//   • CSS: the error part is hidden by default, revealed only under
//     [data-state="invalid"] (no JS class toggling).
//   • Manifest: schema-valid, documents the normalized states + required part,
//     carries a breaking `changes` entry for 2.0.0.
//   • field-wiring audit is green on the updated reference page.
//   • Registry-wide: zero `data-state="error"` remains on any field-group.
//   • `faqir upgrade` cleanly migrates a project sitting on the old vocabulary.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type Manifest } from "../../src/manifest";
import { parseDocument } from "../../src/parser/html-parser";
import { fieldWiringRule } from "../../src/audit/field-wiring";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { upgrade } from "../../src/commands/upgrade";
import { savePristine, readComponentFiles } from "../../src/utils/pristine";

const ROOT = join(import.meta.dir, "../..");
const FG_DIR = join(ROOT, "registry/primitives/field-group");
const CSS = readFileSync(join(FG_DIR, "field-group.css"), "utf8");
const HTML = readFileSync(join(FG_DIR, "field-group.html"), "utf8");
const MANIFEST = JSON.parse(readFileSync(join(FG_DIR, "field-group.manifest.json"), "utf8")) as Manifest;

// ─────────────────────────────── CSS contract ───────────────────────────────

describe("field-group · error part visibility is CSS-driven (§7.1)", () => {
  it("hides [data-part=\"error\"] by default", () => {
    // The base error-part rule sets display:none — the message only appears via state.
    const baseRule = /\[data-ui="field-group"\]\s+\[data-part="error"\]\s*\{[^}]*\}/.exec(CSS);
    expect(baseRule).not.toBeNull();
    expect(baseRule![0]).toContain("display: none");
  });

  it("reveals the error part only under [data-state=\"invalid\"]", () => {
    expect(CSS).toContain('[data-ui="field-group"][data-state="invalid"] [data-part="error"] {');
    const revealRule = /\[data-state="invalid"\]\s+\[data-part="error"\]\s*\{[^}]*\}/.exec(CSS);
    expect(revealRule![0]).toContain("display: block");
  });

  it("no longer references the removed [data-state=\"error\"] selector", () => {
    expect(CSS).not.toContain('[data-state="error"]');
  });

  it("styles the normalized validating and disabled states", () => {
    expect(CSS).toContain('[data-ui="field-group"][data-state="validating"]');
    expect(CSS).toContain('[data-ui="field-group"][data-state="disabled"]');
  });

  it("styles the standardized [data-part=\"required\"] marker", () => {
    expect(CSS).toContain('[data-ui="field-group"] [data-part="required"] {');
  });
});

// ─────────────────────────────── Manifest ───────────────────────────────

describe("field-group · manifest documents the normalized contract", () => {
  it("is schema-valid", () => {
    expect(validateManifest(MANIFEST)).toEqual([]);
  });

  it("enumerates invalid | validating | disabled states and drops `error`", () => {
    const states = MANIFEST.states as Record<string, unknown>;
    expect(states).toBeDefined();
    expect(states.invalid).toBeDefined();
    expect(states.validating).toBeDefined();
    expect(states.disabled).toBeDefined();
    expect(states.error).toBeUndefined();
  });

  it("documents the required marker as a slot/part", () => {
    const slots = MANIFEST.slots as Record<string, { selector: string }>;
    expect(slots.required).toBeDefined();
    expect(slots.required.selector).toContain("data-part='required'");
  });

  it("carries a breaking 2.0.0 `changes` entry for the rename", () => {
    expect(MANIFEST.version).toBe("2.0.0");
    const changes = MANIFEST.changes ?? [];
    const entry = changes.find((c) => c.version === "2.0.0");
    expect(entry).toBeDefined();
    expect(entry!.breaking).toBe(true);
    expect(entry!.note.toLowerCase()).toContain("invalid");
  });
});

// ─────────────────────────── field-wiring audit ───────────────────────────

describe("field-group · field-wiring audit is green on the updated reference page", () => {
  it("produces zero findings on the new-vocabulary reference page", () => {
    const findings = fieldWiringRule.check(parseDocument(HTML, "field-group.html"));
    expect(findings).toEqual([]);
  });

  it("the reference page uses the normalized invalid state, not error", () => {
    expect(HTML).toContain('data-state="invalid"');
    expect(HTML).not.toContain('data-state="error"');
  });
});

// ─────────────── Registry-wide: no field-group left on `error` ───────────────

describe("field-group · no registry consumer uses the removed error state", () => {
  it("zero `data-state=\"error\"` on any [data-ui=\"field-group\"] across the registry", () => {
    const registryRoot = join(ROOT, "registry");
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".html")) {
          const doc = parseDocument(readFileSync(full, "utf8"), full);
          for (const el of doc.elements) {
            if (el.attrs["data-ui"] === "field-group" && el.attrs["data-state"] === "error") {
              offenders.push(full);
            }
          }
        }
      }
    };
    walk(registryRoot);
    expect(offenders).toEqual([]);
  });
});

// ─────────────────────── faqir upgrade migration path ───────────────────────

describe("field-group · faqir upgrade migrates a project off the old vocabulary", () => {
  const TEST_DIR = join(import.meta.dir, "../.tmp-field-group-upgrade");
  const WORK = join(TEST_DIR, "ui/primitives/field-group");

  // A faithful-enough snapshot of the pre-2.0.0 field-group CSS: the old `error`
  // state vocabulary. Only needs to differ from the registry copy and be old-vocab.
  const OLD_CSS = `/* @ui:component field-group */
[data-ui="field-group"] [data-part="error"] {
  color: var(--field-error-color);
  display: none;
}
[data-ui="field-group"][data-state="error"] [data-part="error"] {
  display: block;
}
`;

  const runUpgrade = async (fn: () => Promise<void>) => {
    const chunks: string[] = [];
    const origLog = console.log;
    const origWrite = process.stdout.write.bind(process.stdout);
    const origExit = process.exit;
    let code = 0;
    console.log = (...a: unknown[]) => { chunks.push(a.map(String).join(" ") + "\n"); };
    (process.stdout as unknown as { write: (s: string) => boolean }).write = (s: string) => {
      chunks.push(s);
      return true;
    };
    process.exit = ((c: number) => { code = c; throw new Error("__exit__"); }) as never;
    try { await fn(); } catch (e) {
      if (!(e instanceof Error) || e.message !== "__exit__") throw e;
    } finally {
      console.log = origLog;
      process.stdout.write = origWrite;
      process.exit = origExit;
    }
    return { output: chunks.join(""), code };
  };

  beforeEach(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
    await init([]);
    await add(["field-group"]);
  });

  afterEach(() => {
    process.chdir(ROOT);
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("fast-forwards an old-vocabulary field-group to the invalid vocabulary and surfaces the breaking change", async () => {
    // Rewind the working copy to the old `error` vocabulary + version 1.0.0, then
    // snapshot that exact state as the pristine base so ours == base (clean FF).
    writeFileSync(join(WORK, "field-group.css"), OLD_CSS);
    const oldManifest = JSON.parse(readFileSync(join(WORK, "field-group.manifest.json"), "utf8"));
    oldManifest.version = "1.0.0";
    delete oldManifest.changes;
    oldManifest.states = {
      default: { attr: 'data-state="default"', default: true },
      error: { attr: 'data-state="error"', description: "Red border and visible error message" },
      valid: { attr: 'data-state="valid"', description: "Green accent indicating valid input" },
    };
    writeFileSync(join(WORK, "field-group.manifest.json"), JSON.stringify(oldManifest, null, 2) + "\n");

    // Base snapshot = the current (old) working copy, recorded at 1.0.0.
    const files = await readComponentFiles(WORK);
    await savePristine(TEST_DIR, { name: "field-group", version: "1.0.0", layer: "primitives", files });

    const { output, code } = await runUpgrade(() => upgrade(["field-group"]));

    // Clean fast-forward (ours == base), old → new version, breaking flagged.
    expect(code).toBe(0);
    expect(output).toContain("1.0.0 → 2.0.0");
    expect(output.toLowerCase()).toContain("breaking");

    // Working copy is now on the normalized vocabulary.
    const migratedCss = readFileSync(join(WORK, "field-group.css"), "utf8");
    expect(migratedCss).toContain('[data-state="invalid"]');
    expect(migratedCss).not.toContain('[data-state="error"]');
  });
});
