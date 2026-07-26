// ═══════════════════════════════════════════════════════════════════════════
// Breakpoint canon  [task 0.8-01]
// ═══════════════════════════════════════════════════════════════════════════
//
// The canon is the one thing in Faqir that must live in two places at once: the
// numbers are literal in CSS (media queries cannot read custom properties) and
// normative in prose (FAQIR-SPEC.md §15, which is what an agent actually reads).
// Two copies of a number is a drift bug waiting to happen, so this suite makes
// the copies check each other:
//
//   1. the module exports a well-formed, ascending, rem+px ladder;
//   2. every number in the spec's canon table is re-parsed and compared to the
//      module — docs and constants cannot silently diverge;
//   3. the spec's own rules are enforced against the spec's own examples: the
//      CSS fences in §15 use `min-width` and canon values only, and the HTML
//      fences pass `faqir audit` (executable documentation);
//   4. the `data-<attr>-<tier>` grammar round-trips, and refuses the five frozen
//      protocol attributes in both directions.

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BREAKPOINTS,
  BREAKPOINT_LIST,
  PROTOCOL_ATTRIBUTES,
  ROOT_FONT_SIZE_PX,
  TIERS,
  containerQuery,
  isProtocolAttribute,
  isTier,
  mediaQuery,
  minWidth,
  parseResponsiveAttribute,
  responsiveAttribute,
  type Tier,
} from "../../src/utils/breakpoints";
import { auditHtmlSource } from "../../src/audit/checker";
import { loadRegistryManifestMap } from "../../src/utils/components";

const ROOT = join(import.meta.dir, "../..");
const SPEC = readFileSync(join(ROOT, "FAQIR-SPEC.md"), "utf8");

/** The body of FAQIR-SPEC.md §15 — up to the next top-level heading or EOF. */
function specSection(): string {
  const start = SPEC.indexOf("## 15. Layout & Responsiveness");
  expect(start, "FAQIR-SPEC.md must carry the canon as §15").toBeGreaterThan(-1);
  const rest = SPEC.slice(start + 3);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

/** Fenced code blocks of one language inside a markdown body. */
function fences(body: string, lang: string): string[] {
  return [...body.matchAll(new RegExp("```" + lang + "\\n([\\s\\S]*?)```", "g"))].map((m) => m[1]);
}

// ── 1. the module ───────────────────────────────────────────────────────────

describe("breakpoint canon — the constants module", () => {
  it("exports four tiers, ascending, with rem and px", () => {
    expect([...TIERS]).toEqual(["sm", "md", "lg", "xl"]);
    expect(BREAKPOINT_LIST.map((b) => b.tier)).toEqual([...TIERS]);

    for (const bp of BREAKPOINT_LIST) {
      expect(bp.rem, `${bp.tier} rem`).toBeGreaterThan(0);
      // The px column is documentation of the rem value, never an independent
      // number — it must be exactly the rem value at the documented root size.
      expect(bp.px, `${bp.tier} px`).toBe(bp.rem * ROOT_FONT_SIZE_PX);
    }

    const rems = BREAKPOINT_LIST.map((b) => b.rem);
    expect(rems, "the ladder is strictly ascending").toEqual([...rems].sort((a, b) => a - b));
    expect(new Set(rems).size).toBe(rems.length);
  });

  it("is the ladder the phase committed to", () => {
    expect(BREAKPOINTS.sm).toEqual({ tier: "sm", rem: 40, px: 640 });
    expect(BREAKPOINTS.md).toEqual({ tier: "md", rem: 48, px: 768 });
    expect(BREAKPOINTS.lg).toEqual({ tier: "lg", rem: 64, px: 1024 });
    expect(BREAKPOINTS.xl).toEqual({ tier: "xl", rem: 80, px: 1280 });
  });

  it("is frozen — a consumer cannot mutate the canon it read", () => {
    expect(Object.isFrozen(BREAKPOINTS)).toBe(true);
    expect(Object.isFrozen(BREAKPOINTS.md)).toBe(true);
    expect(() => {
      (BREAKPOINTS as Record<string, unknown>).md = { tier: "md", rem: 50, px: 800 };
    }).toThrow();
    expect(BREAKPOINTS.md.rem).toBe(48);
  });

  it("emits min-width queries only, in rem", () => {
    for (const tier of TIERS) {
      const rem = BREAKPOINTS[tier].rem;
      expect(minWidth(tier)).toBe(`min-width: ${rem}rem`);
      expect(mediaQuery(tier)).toBe(`@media (min-width: ${rem}rem)`);
      expect(containerQuery(tier)).toBe(`@container (min-width: ${rem}rem)`);
      expect(containerQuery(tier, "faqir-table")).toBe(`@container faqir-table (min-width: ${rem}rem)`);
      // No helper can produce the shape the canon forbids.
      expect(mediaQuery(tier)).not.toContain("max-width");
      expect(containerQuery(tier)).not.toContain("max-width");
    }
  });

  it("recognizes canon tiers and nothing else", () => {
    for (const tier of TIERS) expect(isTier(tier)).toBe(true);
    for (const nope of ["xs", "2xl", "sm ", "SM", "", "base"]) expect(isTier(nope)).toBe(false);
  });
});

// ── 2. docs ↔ constants drift ───────────────────────────────────────────────

describe("breakpoint canon — the spec and the module agree", () => {
  const section = specSection();

  it("re-parses the canon table out of FAQIR-SPEC.md §15", () => {
    // | `sm` | `40rem` | 640px | … |
    const rows = [
      ...section.matchAll(/^\|\s*`(\w+)`\s*\|\s*`([\d.]+)rem`\s*\|\s*(\d+)px\s*\|/gm),
    ].map((m) => ({ tier: m[1], rem: Number(m[2]), px: Number(m[3]) }));

    expect(rows.length, "the spec's canon table must have one row per tier").toBe(TIERS.length);
    expect(rows.map((r) => r.tier), "documented in ascending tier order").toEqual([...TIERS]);

    for (const row of rows) {
      const bp = BREAKPOINTS[row.tier as Tier];
      expect(row.rem, `${row.tier}: spec rem vs src/utils/breakpoints.ts`).toBe(bp.rem);
      expect(row.px, `${row.tier}: spec px vs src/utils/breakpoints.ts`).toBe(bp.px);
    }
  });

  it("documents the min-width-only idiom and points at the canon module", () => {
    expect(section).toContain("`min-width` only");
    expect(section).toContain("src/utils/breakpoints.ts");
    // The dead zone is the reason the rule exists — keep the evidence in the doc.
    expect(section).toContain("640.5px");
  });

  it("documents the grammar and excludes all five protocol attributes", () => {
    expect(section).toContain("data-<attr>-<tier>");
    for (const attr of PROTOCOL_ATTRIBUTES) {
      expect(section, `${attr} named in the exclusion`).toContain(attr);
    }
  });

  it("names the doctrine hierarchy in order", () => {
    const intrinsic = section.indexOf("Intrinsic first");
    const container = section.indexOf("Container queries second");
    const viewport = section.indexOf("Viewport media queries last");
    expect(intrinsic).toBeGreaterThan(-1);
    expect(container).toBeGreaterThan(intrinsic);
    expect(viewport).toBeGreaterThan(container);
  });
});

// ── 3. the spec obeys itself ────────────────────────────────────────────────

describe("breakpoint canon — §15's own examples are executable documentation", () => {
  const section = specSection();

  it("uses only canon min-width thresholds in its CSS examples", () => {
    const css = fences(section, "css");
    expect(css.length, "the doctrine is shown, not just described").toBeGreaterThanOrEqual(3);

    const canon = new Set(BREAKPOINT_LIST.map((b) => `min-width: ${b.rem}rem`));
    let queries = 0;
    for (const block of css) {
      for (const m of block.matchAll(/@(?:media|container)[^{]*\(([^)]+)\)/g)) {
        const condition = m[1].trim();
        expect(condition, "no max-width breakpoint in the canon's own examples").not.toContain("max-width");
        expect([...canon], `off-canon threshold: ${condition}`).toContain(condition);
        queries++;
      }
    }
    expect(queries, "at least the container and viewport examples carry a query").toBeGreaterThanOrEqual(2);
  });

  it("passes faqir audit on every HTML example", async () => {
    const manifests = await loadRegistryManifestMap(join(ROOT, "registry"));
    const html = fences(section, "html");
    expect(html.length, "the grammar is demonstrated in markup").toBeGreaterThanOrEqual(1);

    const findings: string[] = [];
    html.forEach((source, i) => {
      for (const r of auditHtmlSource({ source, file: `FAQIR-SPEC.md#15[${i}]`, manifests })) {
        findings.push(`${r.file}:${r.line} [${r.severity}/${r.rule_id}] ${r.message}`);
      }
    });
    expect(findings.join("\n")).toBe("");
  });

  it("demonstrates the grammar with attributes the canon module can parse back", () => {
    const html = fences(section, "html").join("\n");
    const suffixed = [...html.matchAll(/\b(data-[a-z-]+)="/g)]
      .map((m) => m[1])
      .filter((name) => parseResponsiveAttribute(name) !== null);

    expect(suffixed.length, "§15 shows at least one responsive attribute").toBeGreaterThan(0);
    for (const name of suffixed) {
      const parsed = parseResponsiveAttribute(name)!;
      expect(responsiveAttribute(parsed.base, parsed.tier)).toBe(name);
    }
  });
});

// ── 4. the grammar ──────────────────────────────────────────────────────────

describe("breakpoint canon — the responsive attribute grammar", () => {
  it("builds and parses data-<attr>-<tier> round-trip", () => {
    expect(responsiveAttribute("cols", "md")).toBe("data-cols-md");
    expect(responsiveAttribute("data-cols", "md")).toBe("data-cols-md");
    expect(responsiveAttribute("gap", "xl")).toBe("data-gap-xl");

    for (const tier of TIERS) {
      const name = responsiveAttribute("cols", tier);
      expect(parseResponsiveAttribute(name)).toEqual({ base: "data-cols", tier });
    }
  });

  it("refuses the five protocol attributes in both directions", () => {
    for (const attr of PROTOCOL_ATTRIBUTES) {
      expect(isProtocolAttribute(attr)).toBe(true);
      expect(isProtocolAttribute(attr.replace(/^data-/, ""))).toBe(true);
      expect(() => responsiveAttribute(attr, "md")).toThrow(/protocol attribute/);
      // A hand-written `data-size-md` is not reachable through the grammar —
      // parsing it returns null so 0.8-10 can flag it rather than honour it.
      expect(parseResponsiveAttribute(`${attr}-md`), `${attr}-md must not parse`).toBeNull();
    }
    expect(isProtocolAttribute("data-cols")).toBe(false);
  });

  it("returns null for anything that is not a responsive component attribute", () => {
    for (const name of ["data-cols", "data-cols-xs", "data-cols-2xl", "cols-md", "data-md", "data", "-md", ""]) {
      expect(parseResponsiveAttribute(name), name).toBeNull();
    }
  });

  it("rejects a non-canon tier at construction", () => {
    expect(() => responsiveAttribute("cols", "xs" as Tier)).toThrow(/not a canon tier/);
  });
});
