// The trigger contract — `trigger-contract` (task 0.9-05, FAQIR-PLAN §15).
//
// `dialog.css` had no rule for `[data-part="trigger"]` at all, so all four of its
// triggers rendered as the reset's bare `<button>` while the same sheet dressed
// its footer with `data-ui="button"`. One file, two answers: a missing contract,
// not a missing declaration.
//
// The contract this suite pins is that there are exactly TWO ways to satisfy it
// and no third:
//
//   • the trigger carries a `data-ui` — a primitive styles it;
//   • the component's own stylesheet declares a rule for `[data-part="trigger"]`.
//
// Neither is a finding. Both at once is silent (they are not exclusive — a
// recipe may dress a delegated trigger further). And a component whose sheet the
// caller cannot supply is skipped rather than guessed at, which is the same
// stance `undeclared-attribute` takes toward a manifest it cannot find.

import { describe, expect, it, beforeAll } from "bun:test";
import { join } from "node:path";
import { extractComponents } from "../../src/parser/html-parser";
import {
  TRIGGER_CONTRACT_RULE,
  TRIGGER_PART,
  buildTriggerContractResults,
  getRuleInventory,
  stylesheetStylesPart,
} from "../../src/audit/rules";
import { auditHtmlSource } from "../../src/audit/html-audit";
import { loadRegistryManifestMap, loadRegistryStylesheetMap } from "../../src/utils/components";

const REGISTRY = join(import.meta.dir, "../../registry");

let manifests: Awaited<ReturnType<typeof loadRegistryManifestMap>>;
let styles: Awaited<ReturnType<typeof loadRegistryStylesheetMap>>;
beforeAll(async () => {
  manifests = await loadRegistryManifestMap(REGISTRY);
  styles = await loadRegistryStylesheetMap(REGISTRY);
});

/** One component out of a fragment, ready to hand to the rule. */
function componentOf(source: string, name: string) {
  const found = extractComponents(source, "f.html").find((c) => c.name === name);
  expect(found, `no [data-ui="${name}"] in the fixture`).toBeDefined();
  return found!;
}

const BARE = '<div data-ui="dialog"><button data-part="trigger">Open</button></div>';
const DELEGATED =
  '<div data-ui="dialog"><button data-part="trigger" data-ui="button">Open</button></div>';
const SHEET_STYLES_IT = '[data-ui="dialog"] [data-part="trigger"] { cursor: pointer; }';

describe("the trigger contract", () => {
  it("reports a trigger that nothing styles", () => {
    const results = buildTriggerContractResults(componentOf(BARE, "dialog"), "");
    expect(results.length).toBe(1);
    expect(results[0].rule_id).toBe("trigger-contract");
    expect(results[0].severity).toBe("error");
    expect(results[0].component_name).toBe("dialog");
    expect(results[0].line).toBe(1);
    // The message must name both ways out, or it is a rule that says "no".
    expect(results[0].message).toContain('data-ui="button"');
    expect(results[0].message).toContain("dialog.css");
    // Auto-fixable toward the delegating form — the one `alert-dialog` took.
    expect(results[0].fix).toEqual({
      type: "add-attribute",
      offset: results[0].fix!.offset,
      details: { attribute: "data-ui", value: "button", part: TRIGGER_PART },
    });
  });

  it("is silent when the trigger delegates to a primitive", () => {
    expect(buildTriggerContractResults(componentOf(DELEGATED, "dialog"), "")).toEqual([]);
  });

  it("is silent when the recipe styles the part itself", () => {
    expect(buildTriggerContractResults(componentOf(BARE, "dialog"), SHEET_STYLES_IT)).toEqual([]);
  });

  it("is silent when both forms hold at once — they are not exclusive", () => {
    expect(buildTriggerContractResults(componentOf(DELEGATED, "dialog"), SHEET_STYLES_IT)).toEqual(
      [],
    );
  });

  it("reports every unstyled trigger in the component, not just the first", () => {
    const source =
      '<div data-ui="dialog">' +
      '<button data-part="trigger">a</button>' +
      '<button data-part="trigger">b</button>' +
      '<button data-part="trigger" data-ui="button">c</button>' +
      "</div>";
    const results = buildTriggerContractResults(componentOf(source, "dialog"), "");
    expect(results.length).toBe(2);
  });

  it("says nothing about a component with no trigger at all", () => {
    const source = '<div data-ui="dialog"><div data-part="panel">p</div></div>';
    expect(buildTriggerContractResults(componentOf(source, "dialog"), "")).toEqual([]);
  });

  // "Styles the part" is what the CSS parser says it is: a name inside a comment
  // or an at-rule prelude is not a rule, and a substring test would count both.
  describe("stylesheetStylesPart", () => {
    it("sees a real rule, in any position in the selector", () => {
      expect(stylesheetStylesPart('[data-part="trigger"] { color: red }', "trigger")).toBe(true);
      expect(
        stylesheetStylesPart('[data-ui="x"] [data-part="trigger"]:hover { color: red }', "trigger"),
      ).toBe(true);
      expect(
        stylesheetStylesPart('[data-part="a"],\n[data-part="trigger"] { color: red }', "trigger"),
      ).toBe(true);
      expect(
        stylesheetStylesPart(
          '@media (min-width: 48rem) { [data-part="trigger"] { color: red } }',
          "trigger",
        ),
      ).toBe(true);
    });

    it("does not see the name in a comment, and does not confuse parts", () => {
      expect(stylesheetStylesPart('/* [data-part="trigger"] is unstyled */ a { color: red }', "trigger")).toBe(
        false,
      );
      expect(stylesheetStylesPart('[data-part="triggers"] { color: red }', "trigger")).toBe(false);
      expect(stylesheetStylesPart('[data-part="panel"] { color: red }', "trigger")).toBe(false);
      expect(stylesheetStylesPart("", "trigger")).toBe(false);
    });
  });

  // Attribution is the composition-aware one: `inbox`'s tab triggers belong to
  // `tabs`, whose sheet answers for them — the pattern is not asked to style a
  // part it does not own.
  it("attributes a nested component's trigger to that component's sheet", () => {
    const source =
      '<div data-ui="inbox"><div data-ui="tabs"><div data-part="list">' +
      '<button data-part="trigger" role="tab">One</button></div></div></div>';
    const findings = auditHtmlSource({
      source,
      file: "f.html",
      manifests,
      styles,
    }).filter((r) => r.rule_id === TRIGGER_CONTRACT_RULE.id);
    expect(findings).toEqual([]);

    // …and the same markup with `tabs` handed an empty sheet DOES report, on
    // `tabs` rather than on `inbox` — proof the silence above is the sheet
    // answering, not the pattern being skipped.
    const seeded = new Map(styles);
    seeded.set("tabs", "");
    const seededFindings = auditHtmlSource({ source, file: "f.html", manifests, styles: seeded })
      .filter((r) => r.rule_id === TRIGGER_CONTRACT_RULE.id);
    expect(seededFindings.length).toBe(1);
    expect(seededFindings[0].component_name).toBe("tabs");
  });

  it("skips a component whose stylesheet the caller cannot supply", () => {
    const ids = auditHtmlSource({ source: BARE, file: "f.html", manifests, styles: new Map() }).map(
      (r) => r.rule_id,
    );
    expect(ids).not.toContain(TRIGGER_CONTRACT_RULE.id);
    // …and an auditor given no `styles` at all never runs it either.
    const noStyles = auditHtmlSource({ source: BARE, file: "f.html", manifests }).map(
      (r) => r.rule_id,
    );
    expect(noStyles).not.toContain(TRIGGER_CONTRACT_RULE.id);
  });

  it("is in the rule inventory, with its scope and its exemption encoded", () => {
    const entry = getRuleInventory().find((r) => r.id === TRIGGER_CONTRACT_RULE.id);
    expect(entry).toBeDefined();
    expect(entry!.severity).toBe("error");
    expect(entry!.applies_to).toContain("stylesheet");
    expect(entry!.exempt?.join(" ")).toContain("stylesheet is not available");
  });
});
