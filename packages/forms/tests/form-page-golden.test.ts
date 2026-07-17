// Shared golden fixture for the `form-page` pattern (task 0.6-14).
//
// `registry/patterns/form-page/form-page.html` is the canonical schema-rendered
// form page — and it is *pinned to the generator*: its body is exactly what
// `@faqir-ui/forms` emits for FORM_PAGE_SCHEMA (from cases.ts), preceded only by
// the pattern's `@ui:component/kind/composition` discovery header. If either the
// generator's output or the committed pattern drifts, this test fails, so the
// two can never diverge silently.

import { beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auditHtmlSource } from "../../../src/audit/checker";
import { loadRegistryManifestMap } from "../../../src/utils/components";
import { getRegistryPath } from "../../../src/utils/fs";
import { renderForm } from "../src/index.js";
import { FORM_PAGE_SCHEMA, FORM_PAGE_UI, FORM_PAGE_OPTS } from "./cases";

const PATTERN_PATH = join(
  import.meta.dir,
  "../../../registry/patterns/form-page/form-page.html",
);

/**
 * The pattern file = `@ui:component/kind/composition` header + a blank line +
 * the verbatim generator output (which begins with its own `@ui:requires`
 * marker). Strip only the pattern-authoring header lines so what remains is
 * exactly the generator's contribution.
 */
function patternBody(raw: string): string {
  const lines = raw.split("\n");
  let i = 0;
  while (
    i < lines.length &&
    (/^<!-- @ui:(component|kind|composition)\b/.test(lines[i]) || lines[i].trim() === "")
  ) {
    i++;
  }
  return lines.slice(i).join("\n");
}

let manifests: Awaited<ReturnType<typeof loadRegistryManifestMap>>;
beforeAll(async () => {
  manifests = await loadRegistryManifestMap(getRegistryPath());
});

describe("form-page pattern ↔ @faqir-ui/forms generator", () => {
  it("pattern markup matches the generator output byte-for-byte", () => {
    const raw = readFileSync(PATTERN_PATH, "utf8");
    const expected = renderForm(FORM_PAGE_SCHEMA, FORM_PAGE_UI, FORM_PAGE_OPTS);
    expect(patternBody(raw)).toBe(expected);
  });

  it("carries the pattern discovery header the generator never emits", () => {
    const raw = readFileSync(PATTERN_PATH, "utf8");
    expect(raw).toContain("<!-- @ui:component form-page -->");
    expect(raw).toContain("<!-- @ui:kind pattern -->");
    expect(raw.startsWith("<!-- @ui:component form-page -->")).toBe(true);
  });

  it("renders the reference schema deterministically", () => {
    const first = renderForm(FORM_PAGE_SCHEMA, FORM_PAGE_UI, FORM_PAGE_OPTS);
    expect(renderForm(FORM_PAGE_SCHEMA, FORM_PAGE_UI, FORM_PAGE_OPTS)).toBe(first);
  });

  it("is audit-clean", () => {
    const source = readFileSync(PATTERN_PATH, "utf8");
    const findings = auditHtmlSource({ source, file: "form-page.html", manifests });
    expect(findings).toEqual([]);
  });

  it("has zero custom JavaScript", () => {
    const raw = readFileSync(PATTERN_PATH, "utf8");
    expect(raw).not.toContain("<script");
    expect(raw).not.toContain("onclick");
  });
});
