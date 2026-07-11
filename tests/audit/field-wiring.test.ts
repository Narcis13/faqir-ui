// field-wiring audit rule (task 0.4-17 · §7.1, §8.3).
//
// Enforces the field-group ARIA contract: aria-describedby references the existing
// description/error part IDs (no missing, no dangling), aria-invalid is present iff
// the group is invalid, and label `for` matches the control `id`. Auto-repair
// generates missing IDs and wires them to the exact §7.1 canonical form.

import { describe, it, expect } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseDocument, extractComponents } from "../../src/parser/html-parser";
import { fieldWiringRule, FIELD_WIRING_RULE_ID } from "../../src/audit/field-wiring";
import { DOCUMENT_RULES, getRuleInventory } from "../../src/audit/rules";
import { applyRepairs } from "../../src/audit/repairer";

const check = (html: string) => fieldWiringRule.check(parseDocument(html, "test.html"));

/** The §7.1 canonical field-group — the reference for "valid, passes untouched". */
const CANONICAL = `<div data-ui="field-group" data-state="invalid">
  <label data-part="label" for="email">Email <span data-part="required">*</span></label>
  <input data-ui="input" id="email" aria-describedby="email-hint email-error" aria-invalid="true">
  <p data-part="description" id="email-hint">We never share it.</p>
  <p data-part="error" id="email-error">Enter a valid email address.</p>
</div>`;

// ───────────────────────────── valid cases ─────────────────────────────

describe("field-wiring · valid field-groups pass untouched", () => {
  it("passes the §7.1 canonical example", () => {
    expect(check(CANONICAL).length).toBe(0);
  });

  it("passes the shipped registry field-group reference page", async () => {
    const refPath = join(import.meta.dir, "../../registry/primitives/field-group/field-group.html");
    const html = readFileSync(refPath, "utf8");
    expect(check(html).length).toBe(0);
  });

  it("passes a group with no description/error parts (nothing to wire)", () => {
    const html = `<div data-ui="field-group">
  <label data-part="label" for="name">Name</label>
  <div data-part="input"><input data-ui="input" id="name" name="name"></div>
</div>`;
    expect(check(html).length).toBe(0);
  });

  it("passes a non-invalid group whose control has no aria-invalid", () => {
    const html = `<div data-ui="field-group" data-state="valid">
  <label data-part="label" for="iban">IBAN</label>
  <input data-ui="input" id="iban">
  <p data-part="description">Verified</p>
</div>`;
    expect(check(html).length).toBe(0);
  });

  it("skips a field-group with no control at all (required-slot's job)", () => {
    const html = `<div data-ui="field-group"><label data-part="label">Orphan</label></div>`;
    expect(check(html).length).toBe(0);
  });
});

// ───────────── tolerate shipped `error` AND normalized `invalid` ─────────────

describe("field-wiring · tolerates both invalid-state namings", () => {
  it("accepts a fully-wired group in the shipped `error` state", () => {
    const html = `<div data-ui="field-group" data-state="error">
  <label data-part="label" for="cui">CUI</label>
  <input data-ui="input" id="cui" aria-invalid="true" aria-describedby="cui-error">
  <p data-part="error" id="cui-error">Bad CUI</p>
</div>`;
    expect(check(html).length).toBe(0);
  });

  it("accepts a fully-wired group in the normalized `invalid` state", () => {
    const html = `<div data-ui="field-group" data-state="invalid">
  <label data-part="label" for="cui">CUI</label>
  <input data-ui="input" id="cui" aria-invalid="true" aria-describedby="cui-error">
  <p data-part="error" id="cui-error">Bad CUI</p>
</div>`;
    expect(check(html).length).toBe(0);
  });

  it("requires aria-invalid under BOTH namings", () => {
    for (const state of ["error", "invalid"]) {
      const html = `<div data-ui="field-group" data-state="${state}">
  <label data-part="label" for="cui">CUI</label>
  <input data-ui="input" id="cui" aria-describedby="cui-error">
  <p data-part="error" id="cui-error">Bad CUI</p>
</div>`;
      const results = check(html);
      expect(results.length).toBe(1);
      expect(results[0].message).toContain("aria-invalid");
    }
  });
});

// ───────────────────── each violation class flags ─────────────────────

describe("field-wiring · violation classes", () => {
  it("flags missing describedby (part has an id the control never references)", () => {
    const html = `<div data-ui="field-group">
  <label data-part="label" for="email">Email</label>
  <input data-ui="input" id="email">
  <p data-part="error" id="email-error">Bad</p>
</div>`;
    const results = check(html);
    expect(results.length).toBe(1);
    expect(results[0].rule_id).toBe(FIELD_WIRING_RULE_ID);
    expect(results[0].severity).toBe("error");
    expect(results[0].message).toContain("aria-describedby");
    expect(results[0].message).toContain("#email-error");
  });

  it("flags an invalid group whose error part is unwired (no id, no describedby)", () => {
    const html = `<div data-ui="field-group" data-state="invalid">
  <label data-part="label" for="x">X</label>
  <input data-ui="input" id="x" aria-invalid="true">
  <p data-part="error">Required</p>
</div>`;
    const results = check(html);
    const missing = results.filter((r) => r.message.includes("aria-describedby"));
    expect(missing.length).toBe(1);
  });

  it("flags a dangling describedby ref (points at no element in the document)", () => {
    const html = `<div data-ui="field-group">
  <label data-part="label" for="email">Email</label>
  <input data-ui="input" id="email" aria-describedby="ghost-id">
</div>`;
    const results = check(html);
    expect(results.length).toBe(1);
    expect(results[0].message).toContain("dangling");
    expect(results[0].message).toContain("#ghost-id");
  });

  it("flags invalid-state without aria-invalid", () => {
    const html = `<div data-ui="field-group" data-state="error">
  <label data-part="label" for="cui">CUI</label>
  <input data-ui="input" id="cui" aria-describedby="cui-error">
  <p data-part="error" id="cui-error">Bad</p>
</div>`;
    const results = check(html);
    expect(results.length).toBe(1);
    expect(results[0].message).toContain("aria-invalid");
    expect(results[0].message.toLowerCase()).toContain("invalid state");
  });

  it("flags aria-invalid asserted while NOT invalid (the iff reverse)", () => {
    const html = `<div data-ui="field-group" data-state="valid">
  <label data-part="label" for="iban">IBAN</label>
  <input data-ui="input" id="iban" aria-invalid="true">
</div>`;
    const results = check(html);
    expect(results.length).toBe(1);
    expect(results[0].message).toContain("not in the invalid");
  });

  it("flags a label/for mismatch", () => {
    const html = `<div data-ui="field-group">
  <label data-part="label" for="wrong">Email</label>
  <input data-ui="input" id="email">
</div>`;
    const results = check(html);
    expect(results.length).toBe(1);
    expect(results[0].message).toContain("does not match the control");
  });

  it("flags a label with no `for` at all", () => {
    const html = `<div data-ui="field-group">
  <label data-part="label">Email</label>
  <input data-ui="input" id="email">
</div>`;
    const results = check(html);
    expect(results.length).toBe(1);
    expect(results[0].message).toContain("does not match the control");
  });

  it("pins each finding to a precise line/column", () => {
    const html = `<div data-ui="field-group">
  <label data-part="label" for="wrong">Email</label>
  <input data-ui="input" id="email">
</div>`;
    const [r] = check(html);
    expect(r.line).toBe(2); // the <label>
    expect(r.column).toBe(3);
  });
});

// ───────────────────────── repair round-trip ─────────────────────────

describe("field-wiring · repair", () => {
  let dir = "";
  const write = (name: string, body: string) => {
    dir = mkdtempSync(join(tmpdir(), "faqir-fieldwiring-"));
    const p = join(dir, name);
    writeFileSync(p, body);
    return p;
  };

  it("repairs a fully-broken field-group to the exact §7.1 canonical wiring", async () => {
    const broken = `<div data-ui="field-group" data-state="invalid">
  <label data-part="label">Email <span data-part="required">*</span></label>
  <input data-ui="input" name="email">
  <p data-part="description">We never share it.</p>
  <p data-part="error">Enter a valid email address.</p>
</div>`;
    const p = write("page.html", broken);
    try {
      const results = fieldWiringRule.check(parseDocument(broken, "page.html"));
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.fix)).toBe(true);

      const summary = await applyRepairs(results, dir);
      expect(summary.fixes_applied).toBe(1);

      const after = readFileSync(p, "utf8");

      // Re-audit is clean.
      expect(fieldWiringRule.check(parseDocument(after, "page.html")).length).toBe(0);

      // The exact §7.1 canonical wiring, verified structurally.
      const [comp] = extractComponents(after, "page.html");
      const control = findControl(after);
      expect(control["id"]).toBe("email");
      expect(control["aria-describedby"]).toBe("email-hint email-error");
      expect(control["aria-invalid"]).toBe("true");
      expect(comp.parts["label"][0].attrs["for"]).toBe("email");
      expect(comp.parts["description"][0].attrs["id"]).toBe("email-hint");
      expect(comp.parts["error"][0].attrs["id"]).toBe("email-error");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("generates deterministic IDs across runs (repair twice → identical bytes)", async () => {
    const broken = `<div data-ui="field-group" data-state="invalid">
  <label data-part="label">Email</label>
  <input data-ui="input" name="email">
  <p data-part="error">Bad</p>
</div>`;

    const p1 = write("a.html", broken);
    await applyRepairs(fieldWiringRule.check(parseDocument(broken, "a.html")), dir);
    const first = readFileSync(p1, "utf8");
    rmSync(dir, { recursive: true, force: true });

    const p2 = write("a.html", broken);
    await applyRepairs(fieldWiringRule.check(parseDocument(broken, "a.html")), dir);
    const second = readFileSync(p2, "utf8");

    expect(second).toBe(first);
    rmSync(dir, { recursive: true, force: true });
  });

  it("is idempotent — repairing already-canonical markup changes nothing", async () => {
    const p = write("canon.html", CANONICAL);
    try {
      const results = fieldWiringRule.check(parseDocument(CANONICAL, "canon.html"));
      expect(results.length).toBe(0);
      const summary = await applyRepairs(results, dir);
      expect(summary.fixes_applied).toBe(0);
      expect(readFileSync(p, "utf8")).toBe(CANONICAL);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("makes a minimal edit when only aria-invalid is missing (preserves existing ids)", async () => {
    const broken = `<div data-ui="field-group" data-state="error">
  <label data-part="label" for="cui">CUI</label>
  <input data-ui="input" id="cui" aria-describedby="cui-error">
  <p data-part="error" id="cui-error">Bad</p>
</div>`;
    const p = write("min.html", broken);
    try {
      const results = fieldWiringRule.check(parseDocument(broken, "min.html"));
      await applyRepairs(results, dir);
      const after = readFileSync(p, "utf8");
      expect(after).toContain('aria-invalid="true"');
      // Existing ids untouched — no new -hint/-error ids invented.
      expect(after).toContain('id="cui"');
      expect(after).toContain('id="cui-error"');
      expect(fieldWiringRule.check(parseDocument(after, "min.html")).length).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("removes a spurious aria-invalid when the group is not invalid", async () => {
    const broken = `<div data-ui="field-group" data-state="valid">
  <label data-part="label" for="iban">IBAN</label>
  <input data-ui="input" id="iban" aria-invalid="true">
</div>`;
    const p = write("spurious.html", broken);
    try {
      const results = fieldWiringRule.check(parseDocument(broken, "spurious.html"));
      await applyRepairs(results, dir);
      const after = readFileSync(p, "utf8");
      expect(after).not.toContain("aria-invalid");
      expect(fieldWiringRule.check(parseDocument(after, "spurious.html")).length).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("repairs multiple broken field-groups in one file", async () => {
    const broken = `<form>
  <div data-ui="field-group" data-state="invalid">
    <label data-part="label">First</label>
    <input data-ui="input" name="first">
    <p data-part="error">Bad first</p>
  </div>
  <div data-ui="field-group" data-state="invalid">
    <label data-part="label">Second</label>
    <input data-ui="input" name="second">
    <p data-part="error">Bad second</p>
  </div>
</form>`;
    const p = write("multi.html", broken);
    try {
      const results = fieldWiringRule.check(parseDocument(broken, "multi.html"));
      const summary = await applyRepairs(results, dir);
      expect(summary.fixes_applied).toBe(2);
      const after = readFileSync(p, "utf8");
      expect(fieldWiringRule.check(parseDocument(after, "multi.html")).length).toBe(0);
      expect(after).toContain('id="first"');
      expect(after).toContain('id="first-error"');
      expect(after).toContain('id="second"');
      expect(after).toContain('id="second-error"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("derives the base id from label text when the control has no id or name", async () => {
    const broken = `<div data-ui="field-group">
  <label data-part="label" for="wrong">Postal Code</label>
  <textarea data-ui="textarea"></textarea>
  <p data-part="description" id="pc-desc">Hint</p>
</div>`;
    const p = write("label-derived.html", broken);
    try {
      const results = fieldWiringRule.check(parseDocument(broken, "label-derived.html"));
      await applyRepairs(results, dir);
      const after = readFileSync(p, "utf8");
      // slug("Postal Code") → "postal-code"
      expect(after).toContain('id="postal-code"');
      expect(after).toContain('for="postal-code"');
      expect(fieldWiringRule.check(parseDocument(after, "label-derived.html")).length).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─────────────────── registration + inventory ───────────────────

describe("field-wiring · registration", () => {
  it("is registered in DOCUMENT_RULES", () => {
    expect(DOCUMENT_RULES.map((r) => r.id)).toContain(FIELD_WIRING_RULE_ID);
  });

  it("appears in the audit rule inventory as an HTML-document rule", () => {
    const entry = getRuleInventory().find((r) => r.id === FIELD_WIRING_RULE_ID);
    expect(entry).toBeDefined();
    expect(entry!.applies_to).toBe("HTML document");
    expect(entry!.severity).toBe("error");
    expect(entry!.description.length).toBeGreaterThan(0);
  });
});

/** Read the first form control's attributes out of repaired HTML. */
function findControl(html: string): Record<string, string> {
  const doc = parseDocument(html, "x.html");
  const el = doc.elements.find((e) => ["input", "select", "textarea"].includes(e.tag));
  return el ? el.attrs : {};
}
