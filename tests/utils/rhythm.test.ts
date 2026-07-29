// ═══════════════════════════════════════════════════════════════════════════
// The default rhythm — FAQIR-SPEC §20  [task 0.9-02]
// ═══════════════════════════════════════════════════════════════════════════
//
// §20 answers the one question v0.8 left open: what does a bare sequence of
// block-level Faqir elements do vertically? The answer lives in four places at
// once — the CSS that implements it (`registry/base/rhythm.css`), the module
// that is its single source (`src/utils/layout.ts`), the spec section that
// states it normatively, and every generated surface an agent reads. Four copies
// of one rule is a drift bug waiting to happen, so this suite makes the copies
// check each other, exactly as `tests/utils/breakpoints.test.ts` does for the
// breakpoint canon:
//
//   1. the inline-level exclusion list is DERIVED from the registry, not kept by
//      hand — a new inline-level component fails here rather than shipping a
//      badge row with broken baselines;
//   2. `registry/base/rhythm.css` and `src/utils/layout.ts` agree on the flow
//      roots, the exclusions, the property, the default token and the ladder;
//   3. FAQIR-SPEC §20 is re-parsed and compared to the module, and its own HTML
//      examples pass `faqir audit` at every severity;
//   4. README, `docs/layout.md`, the skill, `faqir context` and both llms
//      surfaces teach the rule from that one source;
//   5. the layout budget the rule was supposed to move actually moved — the
//      0.9-01 numbers are named here so the delta is asserted, not eyeballed.

import { describe, it, expect } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { auditHtmlSource } from "../../src/audit/checker";
import { loadRegistryManifestMap } from "../../src/utils/components";
import {
  FLOW_GAP_ATTRIBUTE,
  FLOW_ROOTS,
  FLOW_ROOT_TAGS,
  FLOW_SPACE_DEFAULT_TOKEN,
  FLOW_SPACE_PROPERTY,
  INLINE_LEVEL_COMPONENTS,
  LAYOUT_RULES,
  RHYTHM_REJECTED,
  RHYTHM_RULE,
  rhythmLine,
} from "../../src/utils/layout";
import {
  composeContextData,
  formatContextCursorRules,
  formatContextJSON,
  formatContextLlms,
  formatContextLlmsFull,
  formatContextMarkdown,
} from "../../src/generator/context";
import { buildDocsSite, LAYOUT_PAGE } from "../../src/generator/docs";
import { generateShippedSkillFiles } from "../../src/generator/skill";
import type { LayoutBudget } from "../../src/utils/layout-lint";

const ROOT = join(import.meta.dir, "../..");
const REGISTRY = join(ROOT, "registry");
const CSS = readFileSync(join(REGISTRY, "base/rhythm.css"), "utf8");
const SPEC = readFileSync(join(ROOT, "FAQIR-SPEC.md"), "utf8");
const README = readFileSync(join(ROOT, "README.md"), "utf8");
const LAYOUT_DOC = readFileSync(join(ROOT, "docs/layout.md"), "utf8");
const manifests = await loadRegistryManifestMap(REGISTRY);

/** The spacing steps the layout primitives expose, and so does a flow root. */
const GAP_LADDER = [0, 1, 2, 3, 4, 6, 8, 10, 12, 16];

/** Comments stripped, whitespace collapsed — a selector is one line again. */
const cssBody = CSS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();

/** Prose compared on collapsed whitespace, so a re-wrap cannot fail a test. */
const flat = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Every `` `x` `` token of a string, in order. */
const ticked = (s: string): string[] => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

/** `selector { body }` pairs, in source order. The margin rule is the first. */
const RULES = cssBody
  .split("}")
  .map((chunk) => chunk.trim())
  .filter(Boolean)
  .map((chunk) => {
    const brace = chunk.indexOf("{");
    return { sel: chunk.slice(0, brace).trim(), body: chunk.slice(brace + 1).trim() };
  });

/** The one rule that applies the rhythm; everything after it is the ladder. */
const RULE = RULES[0];

/** Remove every `:where(…)` group, parens balanced — what is left carries weight. */
function stripWhere(selector: string): string {
  let out = "";
  for (let i = 0; i < selector.length; ) {
    if (selector.startsWith(":where(", i)) {
      let depth = 0;
      i += ":where".length;
      do {
        if (selector[i] === "(") depth++;
        else if (selector[i] === ")") depth--;
        i++;
      } while (depth > 0 && i < selector.length);
      continue;
    }
    out += selector[i++];
  }
  return out;
}

// ── 1. the exclusion list is derived, not maintained ────────────────────────

/**
 * Root-box display for every registry component: its own CSS if it declares one,
 * otherwise the UA default of the tag its reference fragment uses. `link` is the
 * case that makes the fallback necessary — an `<a data-ui="link">` sets no
 * display at all and is inline because HTML says so.
 */
const INLINE_TAGS = new Set([
  "a", "span", "kbd", "em", "strong", "code", "small", "label", "abbr", "b", "i", "u", "s",
  "sub", "sup", "button", "input", "select", "textarea", "output", "time", "mark", "q",
  "cite", "meter",
]);

function derivedInlineComponents(): string[] {
  const out: string[] = [];
  for (const kind of ["primitives", "recipes", "patterns"]) {
    const base = join(REGISTRY, kind);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base).sort()) {
      const dir = join(base, name);
      let display: string | null = null;
      for (const file of readdirSync(dir).filter((f) => f.endsWith(".css")).sort()) {
        const src = readFileSync(join(dir, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
        for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
          const selectors = m[1].split(",").map((s) => s.trim());
          if (!selectors.includes(`[data-ui="${name}"]`)) continue;
          const d = /(?:^|;)\s*display\s*:\s*([a-z-]+)/.exec(m[2]);
          if (d) display = d[1];
        }
      }
      if (display === null) {
        const html = join(dir, `${name}.html`);
        if (!existsSync(html)) continue;
        const root = new RegExp(`<([a-z0-9-]+)[^>]*\\sdata-ui="${name}"`).exec(
          readFileSync(html, "utf8"),
        );
        display = root && INLINE_TAGS.has(root[1]) ? "inline" : "block";
      }
      if (display.startsWith("inline")) out.push(name);
    }
  }
  return [...new Set(out)].sort();
}

describe("rhythm — the inline-level exclusions are derived from the registry", () => {
  it("names exactly the components whose root box is inline-level", () => {
    // The whole point of the derivation: a new `inline-flex` primitive that is
    // not added to the list would get a vertical margin, which does not stack an
    // atomic inline — it shifts it inside its line box and breaks the baseline
    // it shares with its neighbours. That is a defect nothing else would catch.
    expect([...INLINE_LEVEL_COMPONENTS]).toEqual(derivedInlineComponents());
  });

  it("names components that exist, none of which is a layout primitive", () => {
    for (const name of INLINE_LEVEL_COMPONENTS) {
      expect(manifests.has(name), `${name} is not in the registry`).toBe(true);
      expect(manifests.get(name)!.category, `${name} must not be a layout primitive`).not.toBe(
        "layout",
      );
    }
  });
});

// ── 2. the CSS and the module agree ─────────────────────────────────────────

describe("rhythm — registry/base/rhythm.css is the module, in CSS", () => {
  it("opens on the flow-root list the module declares", () => {
    const first = /^:where\(([^)]*)\)/.exec(RULE.sel);
    expect(first, "the rule must start with a :where() flow-root list").not.toBeNull();
    const roots = first![1].split(",").map((s) => s.trim());
    expect(roots).toEqual([...FLOW_ROOTS]);
  });

  it("spaces components and nested flow roots, and nothing else", () => {
    // Both halves of the owl name the same participant set: `[data-ui]` plus the
    // flow-root tags. Not "any child" — that would put 3rem between a heading and
    // its own paragraph.
    const participants = [...RULE.sel.matchAll(/[>+] :where\(([^)]*)\)/g)].map((m) =>
      m[1].split(",").map((x) => x.trim()),
    );
    expect(participants.length, "the rule must be an owl: participant + participant").toBe(2);
    for (const set of participants) expect(set).toEqual(["[data-ui]", ...FLOW_ROOT_TAGS]);
  });

  it("excludes every inline-level component and nothing else", () => {
    // The exclusion is the one `:where()` group that lists many components.
    const groups = [...RULE.sel.matchAll(/:where\(([^)]*)\)/g)].map((m) => m[1]);
    const exclusion = groups.find((g) => (g.match(/\[data-ui=/g) ?? []).length > 10);
    expect(exclusion, "the rule must carry an inline-level exclusion group").toBeDefined();
    const names = [...exclusion!.matchAll(/\[data-ui="([^"]+)"\]/g)].map((m) => m[1]);
    expect(names).toEqual([...INLINE_LEVEL_COMPONENTS]);
  });

  it("spends the property and the default token the module names", () => {
    expect(cssBody).toContain(
      `margin-block-start: var(${FLOW_SPACE_PROPERTY}, var(--${FLOW_SPACE_DEFAULT_TOKEN}));`,
    );
  });

  it("is an adjacent-sibling rule, so no margin sits at a box edge to collapse through", () => {
    // `+` and not `:not(:first-child)`: the first child can never match, so there
    // is never a leading margin to collapse out of a padding-less flow root —
    // and a non-participant between two participants suppresses the margin,
    // which is what keeps a heading welded to the thing it labels.
    expect(RULE.sel).toContain("+ :where(");
    expect(RULE.sel, "the owl form makes :first-child unnecessary").not.toContain(":first-child");
  });

  it("is logical-property only and weighs nothing", () => {
    expect(cssBody, "physical margins do not flip in RTL").not.toMatch(/margin-(top|bottom):/);
    // A default that cannot be overridden is not a default: with every `:where()`
    // group removed, nothing selector-shaped may remain — no tag, no attribute,
    // no class — so the rule weighs (0,0,0) and any component rule beats it.
    // `:not()` itself is weightless (it takes the weight of its argument, and
    // every argument here is a `:where()`), so strip it too — what is left must
    // be nothing at all.
    const bare = stripWhere(RULE.sel).replace(/:not|[()\s>+]/g, "");
    expect(bare, "a selector fragment outside :where() would carry weight").toBe("");
  });

  it("exposes the whole data-gap ladder on a flow root, scoped to flow roots", () => {
    const rules = RULES.slice(1).map((r) => {
      const m = new RegExp(`^:where\\(([^)]*)\\)\\[${FLOW_GAP_ATTRIBUTE}="(\\d+)"\\]$`).exec(r.sel);
      expect(m, `ladder rule is not a flow-root data-gap rule: ${r.sel}`).not.toBeNull();
      const value = new RegExp(`^${FLOW_SPACE_PROPERTY}: ([^;]+);$`).exec(r.body);
      expect(value, `ladder rule does not set ${FLOW_SPACE_PROPERTY}: ${r.body}`).not.toBeNull();
      return [null, m![1], m![2], value![1]] as [null, string, string, string];
    });
    expect(rules.map((m) => Number(m[2])), "the ladder the layout primitives take").toEqual(
      GAP_LADDER,
    );
    for (const m of rules) {
      expect(m[1].split(",").map((s) => s.trim()), "the ladder is scoped to flow roots").toEqual([
        ...FLOW_ROOTS,
      ]);
      const step = Number(m[2]);
      expect(m[3]).toBe(step === 0 ? "0px" : `var(--space-${step})`);
    }
  });

  it("ships in every surface that installs base CSS", () => {
    const wired: [string, string][] = [
      ["src/generator/docs.ts", '"reset", "prose", "rhythm", "motion-presets"'],
      ["tests/visual/matrix.ts", '"reset", "prose", "rhythm", "motion-presets"'],
      ["src/commands/init.ts", '"base", "rhythm.css"'],
      ["src/commands/doctor.ts", '"rhythm.css"'],
      ["src/commands/scaffold.ts", "base/rhythm.css"],
      ["src/utils/bundler.ts", '"base/rhythm.css"'],
      ["scripts/build-core-package.mjs", '"rhythm.css"'],
    ];
    for (const [file, needle] of wired) {
      expect(readFileSync(join(ROOT, file), "utf8"), `${file} does not install rhythm.css`).toContain(
        needle,
      );
    }
  });
});

// ── 3. the spec states it, and obeys itself ─────────────────────────────────

/** FAQIR-SPEC §20's body — up to the next top-level heading or EOF. */
function specSection(): string {
  const start = SPEC.indexOf("## 20. Rhythm");
  expect(start, "FAQIR-SPEC.md must carry the rhythm doctrine as §20").toBeGreaterThan(-1);
  const rest = SPEC.slice(start + 3);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

describe("rhythm — FAQIR-SPEC §20 and the module cannot disagree", () => {
  const section = specSection();
  const body = flat(section);

  it("states the rule verbatim, as one sentence", () => {
    expect(body, "§20 must carry RHYTHM_RULE word for word").toContain(`**${flat(RHYTHM_RULE)}**`);
    // One sentence is the acceptance criterion, not a style preference: it is
    // what makes the rule tellable to an agent in a single line.
    expect(RHYTHM_RULE.split(". ").length).toBe(1);
    expect(RHYTHM_RULE.endsWith(".")).toBe(true);
  });

  it("re-parses the flow-root list out of the section", () => {
    const line = /Flow roots:([^.]*)\./.exec(body);
    expect(line, "§20 must list its flow roots").not.toBeNull();
    expect(ticked(line![1])).toEqual([...FLOW_ROOTS]);
  });

  it("re-parses the inline-level exclusions out of the section", () => {
    const line = new RegExp(
      `Inline-level components the rule skips \\((\\d+)\\):([^.]*)\\.`,
    ).exec(body);
    expect(line, "§20 must list the components the rule skips").not.toBeNull();
    expect(Number(line![1])).toBe(INLINE_LEVEL_COMPONENTS.length);
    expect(ticked(line![2])).toEqual([...INLINE_LEVEL_COMPONENTS]);
  });

  it("names the property, the default token and the opt-out", () => {
    expect(body).toContain(`\`${FLOW_SPACE_PROPERTY}\` defaults to \`--${FLOW_SPACE_DEFAULT_TOKEN}\``);
    expect(body).toContain(`\`${FLOW_GAP_ATTRIBUTE}="0"\` turns the rhythm off`);
  });

  it("records both rejected candidates with the reason each lost", () => {
    expect(RHYTHM_REJECTED.length).toBe(2);
    for (const r of RHYTHM_REJECTED) {
      expect(body, `§20 omits the rejected candidate ${r.candidate}`).toContain(
        `**Rejected — ${r.candidate}.**`,
      );
      expect(body, `§20 omits why ${r.candidate} lost`).toContain(flat(r.why));
    }
  });

  it("passes faqir audit on every HTML example, at every severity", () => {
    const fences = [...section.matchAll(/```html\n([\s\S]*?)```/g)].map((m) => m[1]);
    // The bare sequence, the nested/surface case and the opt-out.
    expect(fences.length, "§20 shows the rule, not only states it").toBeGreaterThanOrEqual(3);

    const findings = fences.flatMap((source, i) =>
      auditHtmlSource({ source, file: `FAQIR-SPEC.md#20[${i}]`, manifests }).map(
        (r) => `${r.file}:${r.line} [${r.severity}/${r.rule_id}] ${r.message}`,
      ),
    );
    expect(findings.join("\n")).toBe("");
  });

  it("demonstrates the opt-out and the no-wrapper case in its own markup", () => {
    const fences = [...section.matchAll(/```html\n([\s\S]*?)```/g)].map((m) => m[1]);
    const all = fences.join("\n");
    expect(all, "§20 must show the opt-out").toContain(`${FLOW_GAP_ATTRIBUTE}="0"`);
    // The claim the whole decision rests on: spaced output, nothing wrapped.
    expect(fences[0], "the first example must not wrap anything in a layout primitive")
      .not.toMatch(/data-ui="(stack|cluster|grid|switcher)"/);
  });
});

// ── 4. one source, every surface ────────────────────────────────────────────

const context = composeContextData({
  entries: [...manifests].filter(([name, m]) => m.name === name),
  theme: { name: "default", manifest_found: false },
  themeName: "default",
  pluginMetadata: [],
  componentCount: { primitives: 0, recipes: 0, patterns: 0 },
  generatedAt: "1970-01-01T00:00:00.000Z",
  scope: "registry",
});

describe("rhythm — every surface teaches it from src/utils/layout.ts", () => {
  it("carries the rule and its data in context.json", () => {
    const json = JSON.parse(formatContextJSON(context));
    expect(json.layout.flow.rule).toBe(RHYTHM_RULE);
    expect(json.layout.flow.space).toBe(FLOW_SPACE_PROPERTY);
    expect(json.layout.flow.default_token).toBe(`--${FLOW_SPACE_DEFAULT_TOKEN}`);
    expect(json.layout.flow.roots).toEqual([...FLOW_ROOTS]);
    expect(json.layout.flow.skips_inline).toEqual([...INLINE_LEVEL_COMPONENTS]);
    expect(json.layout.flow.opt_out).toBe(`${FLOW_GAP_ATTRIBUTE}="0"`);
    expect(json.layout.flow.rejected.map((r: { candidate: string }) => r.candidate)).toEqual(
      RHYTHM_REJECTED.map((r) => r.candidate),
    );
    // And the short form is in the rules an agent reads first.
    expect(json.responsive.rules).toEqual([...LAYOUT_RULES]);
    expect(json.responsive.rules.join(" ")).toContain("Vertical rhythm is the default");
  });

  it("states it in llms.txt, so an agent that reads only the index knows it", () => {
    expect(flat(formatContextLlms(context))).toContain(flat(rhythmLine()));
  });

  it("expands it in llms-full.txt, rejected candidates included", () => {
    const full = flat(formatContextLlmsFull(context));
    expect(full).toContain(flat(rhythmLine()));
    for (const r of RHYTHM_REJECTED) expect(full).toContain(flat(r.why));
  });

  it("states it in the markdown and cursorrules context formats", () => {
    expect(flat(formatContextMarkdown(context))).toContain(flat(rhythmLine()));
    expect(flat(formatContextCursorRules(context))).toContain(flat(rhythmLine()));
  });

  it("states it in the generated skill", async () => {
    const files = await generateShippedSkillFiles();
    const skill = files.find((f) => f.relPath === "SKILL.md")!.content;
    expect(flat(skill)).toContain(flat(rhythmLine()));
  });

  it("gives the docs site a rhythm section with both rejected candidates", () => {
    const page = buildDocsSite().find((f) => f.path === LAYOUT_PAGE)!.content;
    expect(page).toContain('id="rhythm"');
    expect(flat(page)).toContain(flat(rhythmLine().replace(/`/g, "")));
    for (const r of RHYTHM_REJECTED) expect(flat(page)).toContain(flat(r.why));
  });

  it("states it in README and docs/layout.md, with the same sentence", () => {
    for (const [label, doc] of [["README.md", README], ["docs/layout.md", LAYOUT_DOC]] as const) {
      const text = flat(doc);
      expect(text, `${label} omits the rule`).toContain(flat(RHYTHM_RULE));
      expect(text, `${label} omits the default token`).toContain(`--${FLOW_SPACE_DEFAULT_TOKEN}`);
      expect(text, `${label} omits the opt-out`).toContain(`${FLOW_GAP_ATTRIBUTE}="0"`);
      for (const root of FLOW_ROOTS) {
        expect(text, `${label} omits the flow root ${root}`).toContain(`\`${root}\``);
      }
    }
  });
});

// ── 5. the number it was supposed to move ───────────────────────────────────

describe("rhythm — the layout budget fell, and by how much", () => {
  // 0.9-01 committed the baseline this task inherited. Naming the numbers here
  // is what makes the delta an assertion rather than an anecdote: if a later
  // change quietly re-cramps the site, the ratchet in `layout-lint.pw.ts` catches
  // the rise and this catches the loss of the win that paid for §20.
  const BASELINE_0_9_01 = { seams: 183, seamPages: 42, zeroGutterPages: 79, pages: 180 };

  const budget = JSON.parse(
    readFileSync(join(ROOT, "tests/visual/layout-budget.json"), "utf8"),
  ) as LayoutBudget;

  it("measures the same pages, so the comparison is like for like", () => {
    expect(budget.totals.pages).toBe(BASELINE_0_9_01.pages);
  });

  it("drops the seam count without a single fragment being edited", () => {
    expect(budget.totals.seams, "§20 must lower the seam count").toBeLessThan(
      BASELINE_0_9_01.seams,
    );
    expect(budget.totals.seamPages, "§20 must lower the seam-bearing page count").toBeLessThan(
      BASELINE_0_9_01.seamPages,
    );
  });

  it("leaves the gutter to 0.9-03, which is the task that owns it", () => {
    // The rule is vertical only; a page flush against the window edge stays
    // flush. Asserting this keeps the win honest — the seam drop is the rhythm
    // rule's, not a side effect of some other change.
    expect(budget.totals.zeroGutterPages).toBe(BASELINE_0_9_01.zeroGutterPages);
  });
});
