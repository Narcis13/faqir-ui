// Dashboard-shell is a page-level pattern that intentionally contains many
// other components. Its common slot names (`header`, `footer`, `nav`, `metric`)
// must therefore be anchored to the shell's direct regions; a broad descendant
// selector would restyle a nested card, callout, or navigation component.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CSS = readFileSync(
  join(
    import.meta.dir,
    "../..",
    "registry",
    "patterns",
    "dashboard-shell",
    "dashboard-shell.css",
  ),
  "utf8",
);

describe("dashboard-shell slot scoping", () => {
  it("anchors every shell region to the root as a direct child", () => {
    for (const part of ["sidebar", "header", "content", "footer"]) {
      expect(CSS).toContain(
        `[data-ui="dashboard-shell"] > [data-part="${part}"]`,
      );
      expect(CSS).not.toContain(
        `[data-ui="dashboard-shell"] [data-part="${part}"]`,
      );
    }
  });

  it("anchors nested shell-only parts through their owning region", () => {
    const owners = {
      logo: "sidebar",
      nav: "sidebar",
      "nav-item": "sidebar",
      "sidebar-user": "sidebar",
      search: "header",
      "header-actions": "header",
      "user-menu": "header",
      metric: "content",
      "activity-item": "content",
    } as const;

    for (const [part, owner] of Object.entries(owners)) {
      const selectors = [...CSS.matchAll(/([^{}]+)\{/g)]
        .map((match) => match[1])
        .filter(
          (selector) =>
            selector.includes('[data-ui="dashboard-shell"]') &&
            selector.includes(`[data-part="${part}"]`),
        );
      expect(selectors.length, `${part} has no dashboard-shell rule`).toBeGreaterThan(0);
      for (const selector of selectors) {
        expect(selector, `${part} escapes ${owner}`).toContain(
          `> [data-part="${owner}"]`,
        );
      }
    }
  });
});
