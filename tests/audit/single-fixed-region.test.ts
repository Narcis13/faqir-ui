// Fixed-region uniqueness — `single-fixed-region` (task 0.9-06, FAQIR-PLAN §15).
//
// The rule combines markup with a component's own stylesheet: every toast
// container is valid alone, but two top-right roots resolve to the same fixed
// viewport anchor and paint over each other. The contract is generic because
// drawer, sheet and command-palette panels can express the same collision.

import { beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auditHtmlSource } from "../../src/audit/html-audit";
import { getRuleInventory, SINGLE_FIXED_REGION_RULE } from "../../src/audit/rules";
import { extractComponents } from "../../src/parser/html-parser";
import { loadRegistryManifestMap, loadRegistryStylesheetMap } from "../../src/utils/components";

const REGISTRY = join(import.meta.dir, "../../registry");

let manifests: Awaited<ReturnType<typeof loadRegistryManifestMap>>;
let styles: Awaited<ReturnType<typeof loadRegistryStylesheetMap>>;
beforeAll(async () => {
  manifests = await loadRegistryManifestMap(REGISTRY);
  styles = await loadRegistryStylesheetMap(REGISTRY);
});

function fixedFindings(source: string, suppliedStyles = styles) {
  return auditHtmlSource({ source, file: "fixture.html", manifests, styles: suppliedStyles }).filter(
    (result) => result.rule_id === SINGLE_FIXED_REGION_RULE.id,
  );
}

function toast(position: string, id: string): string {
  return (
    `<div data-ui="toast" data-part="container" data-variant="${position}" ` +
    `role="region" aria-label="Notifications" id="${id}"></div>`
  );
}

describe("single-fixed-region", () => {
  it("reports exactly one group for two top-right containers and names both", () => {
    const findings = fixedFindings(`${toast("top-right", "first")}${toast("top-right", "second")}`);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].component_name).toBe("toast");
    expect(findings[0].message).toContain('id="first"');
    expect(findings[0].message).toContain('id="second"');
    expect(findings[0].message).toContain("block-start=0");
    expect(findings[0].message).toContain("inline-end=0");
  });

  it("is silent for one container at a position", () => {
    expect(fixedFindings(toast("top-right", "only"))).toEqual([]);
  });

  it("is silent for four containers at four distinct positions", () => {
    const source = ["top-right", "top-left", "bottom-right", "bottom-left"]
      .map((position) => toast(position, position))
      .join("");
    expect(fixedFindings(source)).toEqual([]);
  });

  it("the shipped toast reference has one root per position and stacks two at top-right", () => {
    const source = readFileSync(join(REGISTRY, "recipes", "toast", "toast.html"), "utf8");
    const containers = extractComponents(source, "toast.html").filter(
      (component) => component.name === "toast",
    );
    expect(containers).toHaveLength(4);
    expect(containers.map((component) => component.root.attrs["data-variant"]).sort()).toEqual([
      "bottom-left",
      "bottom-right",
      "top-left",
      "top-right",
    ]);
    const topRight = containers.find(
      (component) => component.root.attrs["data-variant"] === "top-right",
    )!;
    expect(topRight.root.children.filter((element) => element.attrs["data-part"] === "toast")).toHaveLength(
      2,
    );
    expect(fixedFindings(source)).toEqual([]);
  });

  it("ignores a hidden duplicate, including one hidden by an ancestor", () => {
    const source =
      toast("top-right", "visible") +
      `<section hidden>${toast("top-right", "hidden-by-parent")}</section>` +
      toast("bottom-left", "other-position");
    expect(fixedFindings(source)).toEqual([]);
  });

  it("does not confuse a panel with its intentional fixed backdrop", () => {
    const source =
      '<div data-ui="command-palette" data-state="open">' +
      '<div data-part="overlay"></div><div data-part="panel"></div></div>';
    expect(fixedFindings(source)).toEqual([]);
  });

  it.each(["drawer", "sheet", "command-palette"])(
    "catches the same visible-panel collision for %s",
    (name) => {
      const variant = name === "drawer" ? ' data-variant="left"' : name === "sheet" ? ' data-variant="bottom"' : "";
      const source =
        `<div data-ui="${name}" data-state="open"><div data-part="panel"${variant}></div></div>` +
        `<div data-ui="${name}" data-state="open"><div data-part="panel"${variant}></div></div>`;
      const findings = fixedFindings(source);
      expect(findings, name).toHaveLength(1);
      expect(findings[0].component_name).toBe(name);
      expect(findings[0].message).toContain("panel regions");
    },
  );

  it.each(["drawer", "sheet", "command-palette"])(
    "keeps the shipped hidden %s reference silent",
    (name) => {
      const source = readFileSync(join(REGISTRY, "recipes", name, `${name}.html`), "utf8");
      expect(fixedFindings(source)).toEqual([]);
    },
  );

  it("skips the rule when the component stylesheet is unavailable", () => {
    expect(fixedFindings(`${toast("top-right", "a")}${toast("top-right", "b")}`, new Map())).toEqual(
      [],
    );
    const ids = auditHtmlSource({
      source: `${toast("top-right", "a")}${toast("top-right", "b")}`,
      file: "fixture.html",
      manifests,
    }).map((result) => result.rule_id);
    expect(ids).not.toContain(SINGLE_FIXED_REGION_RULE.id);
  });

  it("honours skipRules", () => {
    const ids = auditHtmlSource({
      source: `${toast("top-right", "a")}${toast("top-right", "b")}`,
      file: "fixture.html",
      manifests,
      styles,
      skipRules: [SINGLE_FIXED_REGION_RULE.id],
    }).map((result) => result.rule_id);
    expect(ids).not.toContain(SINGLE_FIXED_REGION_RULE.id);
  });

  it("ships in the rule inventory with generic markup+stylesheet scope", () => {
    const entry = getRuleInventory().find((rule) => rule.id === SINGLE_FIXED_REGION_RULE.id);
    expect(entry).toBeDefined();
    expect(entry!.applies_to).toContain("stylesheet");
    expect(entry!.description).not.toContain("toast");
    expect(entry!.exempt?.join(" ")).toContain("different region kinds");
  });
});
