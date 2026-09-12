/**
 * `docs/security.md` — that it exists, that it is reachable, and that it is
 * still true.  [task 1.0-02 · §A6]
 *
 * A security document is the one kind of documentation that is worse than
 * nothing when it drifts: a reader who checks it and finds a stale answer stops
 * checking. So the claims that CAN be derived are derived here rather than
 * trusted — the directive names it lists against the engine's own `@ui:directive`
 * vocabulary, the `new Function` claim against the evaluator, the `l-cloak`
 * stylesheet claim against the bootstrap, and the "which patterns need the
 * evaluator" claim against the registry, which is the one most likely to go
 * stale without anybody noticing.
 *
 * Reachability is the other half. §A6 asks for a written guidance doc; a doc
 * nothing links to has not been written as far as its reader is concerned, so
 * the README (human entry point) and the generated context surfaces (agent
 * entry point) are both asserted to carry it.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import {
  generateContext,
  formatContextJSON,
  formatContextMarkdown,
  formatContextLlms,
  formatContextLlmsFull,
  type ContextData,
} from "../../src/generator/context";
import { parseEngineVocabulary } from "../../src/generator/skill";
import { loadPluginMetadata } from "../../src/generator/plugins";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const DOC_PATH = "docs/security.md";
const DOC = readFileSync(join(ROOT, DOC_PATH), "utf8");
const README = readFileSync(join(ROOT, "README.md"), "utf8");
const ENGINE = readFileSync(join(ROOT, "src", "core-src", "engine.js"), "utf8");

// ── 1. every risk §A6 names is actually covered ────────────────────────────

describe("the doc covers §A6's list", () => {
  // FAQIR-NEXT §A6, verbatim: "Document the security posture explicitly:
  // `new Function` evaluator ⇒ requires 'unsafe-eval' CSP; `l-html` is
  // unsanitized by design (like Alpine). Provide a written guidance doc; a
  // CSP-safe evaluator is deliberately out of scope for 1.0."
  const required: [string, RegExp][] = [
    ["the new Function evaluator", /new Function/],
    ["the 'unsafe-eval' requirement", /'unsafe-eval'/],
    ["a copy-pasteable policy", /Content-Security-Policy/],
    ["l-html being unsanitized", /`l-html`[\s\S]{0,400}unsanitized|unsanitized[\s\S]{0,400}`l-html`/],
    ["the Alpine precedent", /Alpine/],
    ["a CSP-safe evaluator being out of scope", /out of scope for 1\.0/],
    ["guidance for CSP-restricted environments", /CSP-restricted/],
    ["the generated-trusted threat model", /generated,? (and )?trusted/i],
    ["the user-supplied threat model", /user-supplied|user-authored|did not author/],
    ["the supply-chain posture", /[Ss]ubresource [Ii]ntegrity/],
    ["how to report a vulnerability", /security\/advisories/],
    // 1.1B-07 — rules land in §4 because they are the one surface whose value
    // is NOT code, and the one that makes a request of its own.
    ["that a rules definition is data, not code", /definition is JSON|Rules are data/],
    ["that a remote rule sends the whole form", /POSTs the whole form|every.{0,20}coerced field/],
    ["that the page's verdict is advisory", /verdict is advisory/],
  ];

  for (const [what, pattern] of required) {
    it(`states ${what}`, () => {
      expect(pattern.test(DOC), `${DOC_PATH} does not cover ${what}`).toBe(true);
    });
  }

  it("says plainly that the failure without 'unsafe-eval' is silent", () => {
    // The measured behaviour: the engine loads, controllers mount, expressions
    // yield undefined. A doc that only said "it needs unsafe-eval" would leave
    // a reader hunting a crash that never comes.
    expect(DOC).toMatch(/silent|quiet/i);
    expect(DOC).toMatch(/empty string/i);
  });
});

// ── 2. the claims that can be derived, derived ─────────────────────────────

describe("the doc's claims still hold against the engine", () => {
  it("is right that expressions are compiled with new Function", () => {
    expect(ENGINE).toContain("new Function(");
    expect(ENGINE).toMatch(/with\(\$scope\)/);
  });

  it("is right that l-html assigns innerHTML and nothing else", () => {
    const handler = /function handleHtml\(el, dir, scope\) \{[\s\S]*?\n  \}/.exec(ENGINE)?.[0] ?? "";
    expect(handler).toContain("innerHTML");
    expect(handler).not.toMatch(/sanitiz|DOMPurify|escape/i);
  });

  it("is right that the only stylesheet the engine injects is l-cloak's", () => {
    const inject = /function injectCloakStyle\(\)[\s\S]*?\n  \}/.exec(ENGINE)?.[0] ?? "";
    expect(inject).toContain("createElement('style')");
    expect(inject).toContain("l-cloak");
    // If a second <style> injection ever appears, the "one stylesheet" framing
    // in §2 of the doc stops being true.
    expect([...ENGINE.matchAll(/createElement\('style'\)/g)].length).toBe(1);
  });

  it("names only directives the engine or an official plugin actually declares", () => {
    const vocab = parseEngineVocabulary(ENGINE);
    const known = new Set(vocab.directives.map((d) => d.name));
    expect(known.size).toBeGreaterThanOrEqual(15);
    // §4 reaches past the engine now — `l-rules` and `l-validate` are the two
    // surfaces whose handling of untrusted values differs from every core
    // directive's, so the doc has to name them. They are still DERIVED, from
    // the same `@ui:provides` headers the skill reads: a plugin renamed without
    // its doc line moving fails here.
    const provided = loadPluginMetadata(join(ROOT, "registry", "core", "plugins"))
      .flatMap((p) => p.provides)
      .filter((token) => token.startsWith("l-"));
    expect(provided).toContain("l-rules");
    for (const name of provided) known.add(name);
    // Every `l-…` token the doc writes in backticks must be a real directive.
    const cited = new Set(
      [...DOC.matchAll(/`(l-[a-z]+)(?::[^`]*)?`/g)].map((m) => m[1]),
    );
    expect(cited.size).toBeGreaterThanOrEqual(8);
    for (const name of cited) {
      expect(
        known.has(name),
        `${DOC_PATH} cites \`${name}\`, which neither the engine nor a plugin declares`,
      ).toBe(true);
    }
  });

  it("names exactly the patterns that need the evaluator", () => {
    // The claim most likely to rot: §6 tells a CSP-restricted reader that
    // patterns are markup and CSS "with two exceptions". Derive the exceptions.
    const patterns = join(ROOT, "registry", "patterns");
    // An `l-*` attribute reaches the evaluator only when it carries a value:
    // `initScope` skips a bare `l-data`, and a value-less plugin directive
    // compiles nothing. `form-page`'s `<form l-data l-validate>` is exactly
    // that case and must NOT count as needing 'unsafe-eval'.
    const NEEDS_EVALUATOR = /\s(?:l-[a-z][a-z:.\-]*|@[a-z][a-z:.\-]*|:[a-z][a-z-]*)="[^"]+"/;
    const reactive = readdirSync(patterns)
      .filter((name) => {
        const html = join(patterns, name, `${name}.html`);
        return existsSync(html) && NEEDS_EVALUATOR.test(readFileSync(html, "utf8"));
      })
      .sort();
    expect(reactive.length).toBeGreaterThan(0);
    const section = DOC.slice(DOC.indexOf("## 6."));
    // The claim is the clause BEFORE "Every other pattern does not"; the prose
    // after it is free to name a counter-example (and does — `form-page`).
    const boundary = section.indexOf("Every other pattern does not");
    expect(boundary, `${DOC_PATH} §6 lost the sentence the pattern claim is made in`).toBeGreaterThan(0);
    const claim = section.slice(0, boundary);
    for (const name of reactive) {
      expect(claim, `${DOC_PATH} §6 does not name the reactive pattern "${name}"`).toContain(`\`${name}\``);
    }
    // …and claims no pattern that does not need it.
    const all = readdirSync(patterns).filter((n) => existsSync(join(patterns, n, `${n}.html`)));
    for (const name of all.filter((n) => !reactive.includes(n))) {
      expect(claim, `${DOC_PATH} §6 claims "${name}" needs the evaluator, but it carries no expression`)
        .not.toContain(`\`${name}\``);
    }
  });

  it("is right that the rules evaluator compiles nothing", () => {
    // §4.1's central claim, and the reason `l-rules` sits in the SAFE table
    // beside `l-text`: the definition is interpreted, never compiled. If the
    // package ever grows an evaluator seam, the doc is wrong the same day.
    const src = join(ROOT, "packages", "rules", "src");
    const files = readdirSync(src).filter((f) => f.endsWith(".js"));
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const file of files) {
      const code = readFileSync(join(src, file), "utf8");
      expect(code, `packages/rules/src/${file}`).not.toMatch(/new Function\(|\beval\(/);
    }
  });

  it("is right that a remote rule POSTs the whole form to the definition's URL", () => {
    // The claim a reader acts on — "a definition you did not author is an
    // exfiltration channel" — is only true if the body really carries every
    // field and the URL really comes from the definition.
    const plugin = readFileSync(join(ROOT, "packages", "rules", "src", "plugin.js"), "utf8");
    const call = /return fetch\([\s\S]*?\}\)/.exec(plugin)?.[0] ?? "";
    expect(call, "the remote validator's fetch call moved").toContain('method: "POST"');
    expect(call).toContain("rule.remote");
    expect(call).toMatch(/path:\s*rule\.path/);
    expect(call).toMatch(/data:\s*collect\(form/);
    // No `credentials` option — which is what makes the doc's "fetch's default
    // same-origin credentials" sentence the accurate one.
    expect(call).not.toContain("credentials");
  });

  it("ships no JavaScript with primitives or patterns, as §6 promises", () => {
    for (const layer of ["primitives", "patterns"] as const) {
      const dir = join(ROOT, "registry", layer);
      for (const name of readdirSync(dir)) {
        const files = readdirSync(join(dir, name));
        expect(files.filter((f) => f.endsWith(".js")), `${layer}/${name}`).toEqual([]);
      }
    }
  });
});

// ── 3. reachability — the human entry point ────────────────────────────────

describe("the README carries the doc", () => {
  it("links it from the table of contents and from a section of its own", () => {
    expect(README).toContain("- [Security](#security)");
    expect(README).toMatch(/^## Security$/m);
    expect(README).toContain(`[docs/security.md](${DOC_PATH})`);
  });

  it("links it from the engine section, where the two behaviours come up", () => {
    const engineSection = README.slice(
      README.indexOf("## Faqir Core"),
      README.indexOf("## The Manifest System"),
    );
    expect(engineSection).toContain(DOC_PATH);
  });

  it("states the same requirement the doc does", () => {
    const section = README.slice(README.indexOf("\n## Security"), README.indexOf("\n## Project Structure"));
    expect(section).toContain("'unsafe-eval'");
    expect(section).toContain("new Function");
    expect(section).toContain("l-html");
  });
});

// ── 4. reachability — the agent entry point ────────────────────────────────

describe("the generated context carries the doc", () => {
  const TEST_DIR = join(import.meta.dir, "../.tmp-security-docs");
  let data: ContextData;

  beforeEach(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
    await init([]);
    await add(["button"]);
    data = await generateContext(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(ROOT);
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("points context.json at the doc and states the requirement inline", () => {
    expect(data.security.reference).toBe(DOC_PATH);
    expect(data.security.csp.script_src).toContain("'unsafe-eval'");
    expect(data.security.csp.policy).toContain("script-src 'self' 'unsafe-eval'");
    expect(Object.keys(data.security.unsafe)).toContain("l-html");
    expect(Object.keys(data.security.safe)).toContain("l-text");
    expect(data.security.rules.length).toBeGreaterThanOrEqual(4);
    expect(formatContextJSON(data)).toContain(DOC_PATH);
  });

  it("classifies the rules surfaces the way §4 does", () => {
    // An agent reads context.json, not the prose. The two files must agree on
    // which side of the line each surface falls: `l-rules` carries data, an
    // attribute validator carries code.
    expect(Object.keys(data.security.safe)).toContain("l-rules");
    expect(Object.keys(data.security.unsafe)).toContain("l-validate:<name>");
    expect(data.security.safe["l-rules"]).toMatch(/never compiled as JavaScript/);
    expect(data.security.rules.join(" ")).toMatch(/remote rule sends the whole/);
  });

  it("reaches every generated surface an agent may read", () => {
    for (const [label, output] of [
      ["context.md", formatContextMarkdown(data)],
      ["llms.txt", formatContextLlms(data)],
      ["llms-full.txt", formatContextLlmsFull(data)],
    ] as const) {
      expect(output, `${label} does not link ${DOC_PATH}`).toContain(DOC_PATH);
      expect(output, `${label} does not state the CSP requirement`).toContain("'unsafe-eval'");
      expect(output, `${label} has no Security section`).toMatch(/^## Security$/mi);
    }
  });

  it("agrees with the doc on the policy it recommends", () => {
    // Two places state a policy; a reader who copies either must get the same
    // one. Compare the directives as a set, not the whitespace.
    const directives = (policy: string) =>
      policy
        .split(";")
        .map((d) => d.trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .sort();
    const fromDoc = /Content-Security-Policy:\s*\n?([\s\S]*?)\n```/.exec(DOC)?.[1] ?? "";
    expect(fromDoc).not.toBe("");
    expect(directives(fromDoc)).toEqual(directives(data.security.csp.policy));
  });
});
