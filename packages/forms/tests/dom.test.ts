import { afterEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { auditHtmlSource } from "../../../src/audit/checker";
import { loadRegistryManifestMap } from "../../../src/utils/components";
import { getRegistryPath } from "../../../src/utils/fs";
import { buildForm } from "../src/dom.js";
import { renderForm } from "../src/index.js";
import type { ObjectSchema } from "../src/index.js";
import { SPAWN_TIMEOUT, runSync } from "../../../tests/helpers/spawn";
import { GOLDEN_CASES } from "./cases";

// The global `document` is happy-dom's, from the repository preload.

/** Golden cases buildForm takes: no wizard, and no rules definition. */
const DOM_CASES = GOLDEN_CASES.filter((fixture) =>
  !(fixture.uiSchema && "ui:wizard" in fixture.uiSchema) &&
  !fixture.opts?.rules &&
  !renderForm(fixture.schema, fixture.uiSchema, fixture.opts).includes('<script type="application/json"'));

/** Wiring and binding attributes: ids are a counter in one, a name in the other. */
const WIRING = new Set(["id", "for", "aria-describedby", "aria-labelledby"]);

/**
 * An element tree as comparable lines: tag, sorted attributes, text, comments.
 * Ids, idrefs and directives are left out — they are where the two builders
 * are meant to differ — and a row's `name[0].x` reads as renderForm's static
 * `name[].x`. A `<template>` stands for the one row it stamps.
 */
function shape(node: Node, depth = 0, out: string[] = []): string[] {
  const pad = "  ".repeat(depth);
  if (node.nodeType === 3) {
    const text = (node.textContent ?? "").trim();
    if (text) out.push(`${pad}"${text}"`);
    return out;
  }
  if (node.nodeType === 8) {
    out.push(`${pad}<!--${node.textContent}-->`);
    return out;
  }
  if (node.nodeType !== 1) return out;
  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  if (tag === "template") {
    for (const child of (element as HTMLTemplateElement).content.childNodes) shape(child, depth, out);
    return out;
  }
  const attrs = [...element.attributes]
    .filter((attr) => !WIRING.has(attr.name) && !/^(?:l-|:|@)/.test(attr.name))
    // renderForm's row buttons are `:disabled`-gated; buildForm sets the attribute.
    .filter((attr) => !(tag === "button" && attr.name === "disabled"))
    .map((attr) => `${attr.name}=${JSON.stringify(attr.name === "name" ? attr.value.replace(/\[\d+\]/g, "[]") : attr.value)}`)
    .sort();
  out.push(`${pad}<${tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}>`);
  for (const child of element.childNodes) shape(child, depth + 1, out);
  return out;
}

function renderedForm(html: string): HTMLFormElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  const form = host.querySelector("form");
  if (!form) throw new Error("renderForm produced no form");
  return form;
}

/** Every id is unique and every idref resolves inside the form. */
function expectWired(form: HTMLFormElement) {
  const ids = [...form.querySelectorAll("[id]")].map((element) => element.id);
  expect(new Set(ids).size).toBe(ids.length);
  const known = new Set([form.id, ...ids]);
  for (const element of form.querySelectorAll("[for], [aria-describedby], [aria-labelledby]")) {
    for (const name of ["for", "aria-describedby", "aria-labelledby"]) {
      for (const ref of (element.getAttribute(name) ?? "").split(/\s+/).filter(Boolean)) {
        expect(known.has(ref), `${name}="${ref}" on <${element.tagName.toLowerCase()}>`).toBe(true);
      }
    }
  }
}

describe("buildForm builds the same widgets as renderForm", () => {
  it("covers the golden cases it accepts", () => {
    expect(DOM_CASES.map((fixture) => fixture.name)).toEqual(expect.arrayContaining([
      "string-input", "string-textarea", "string-enum-radio", "string-enum-select", "number", "integer",
      "boolean-checkbox", "boolean-switch", "format-date", "format-email", "format-uri", "nested-object",
      "array-enum-checkbox-group", "array-enum-multi-select", "array-of-objects", "layout-groups",
      "additional-properties", "examples-const",
    ]));
  });

  it("matches a nullable schema (the golden one carries rules)", () => {
    const schema: ObjectSchema = {
      type: "object",
      properties: {
        nickname: { type: ["string", "null"], title: "Nickname", maxLength: 20, default: null },
        age: { type: ["null", "integer"], minimum: 0 },
        address: { type: ["object", "null"], properties: { city: { type: ["string", "null"] } }, required: ["city"] },
      },
      required: ["nickname"],
    };
    expect(shape(buildForm(schema, document))).toEqual(shape(renderedForm(renderForm(schema))));
  });

  for (const fixture of DOM_CASES) {
    it(`matches ${fixture.name} element for element`, () => {
      const built = buildForm(fixture.schema, document, fixture.uiSchema, fixture.opts);
      const rendered = renderedForm(renderForm(fixture.schema, fixture.uiSchema, fixture.opts));
      expect(shape(built)).toEqual(shape(rendered));
      expectWired(built);
    });
  }

  it("is audit-clean", async () => {
    const manifests = await loadRegistryManifestMap(getRegistryPath());
    for (const fixture of DOM_CASES) {
      const source = buildForm(fixture.schema, document, fixture.uiSchema, fixture.opts).outerHTML;
      const findings = auditHtmlSource({ source, file: `${fixture.name}.html`, manifests });
      expect(findings, `${fixture.name}: ${findings.map((f) => `${f.rule_id}: ${f.message}`).join("\n")}`).toEqual([]);
    }
  });

  it("builds on the document it is given, not a global one", () => {
    const other = new Window().document as unknown as Document;
    const form = buildForm({ type: "object", properties: { name: { type: "string" } } }, other);
    expect(form.ownerDocument).toBe(other);
    expect(form.querySelector('input[data-ui="input"]')?.ownerDocument).toBe(other);
  });

  it("imports under plain Node, which has no DOM", () => {
    const entry = pathToFileURL(join(import.meta.dir, "../src/dom.js")).href;
    const script = `const { buildForm } = await import(${JSON.stringify(entry)});\n` +
      `if (typeof buildForm !== "function" || typeof document !== "undefined") process.exit(2);`;
    const result = runSync("node", ["--input-type=module", "--eval", script], {
      encoding: "utf8",
      timeout: SPAWN_TIMEOUT.CLI,
    });
    expect(result.status, result.stderr).toBe(0);
  });
});

describe("buildForm puts schema strings in as text", () => {
  const X = `"><img src=x onerror=alert(1)>`;
  const HOSTILE: ObjectSchema = {
    type: "object",
    title: `T${X}`,
    description: `D${X}`,
    properties: {
      [X]: { type: "string", description: X, default: X, pattern: X, examples: [X] },
      [`radio${X}`]: { type: "string", title: X, enum: [X, `b${X}`] },
      [`select${X}`]: { type: "string", title: X, enum: ["1", "2", "3", "4", X] },
      [`set${X}`]: { type: "array", title: X, items: { type: "string", enum: [X, `b${X}`] }, default: [X] },
      [`obj${X}`]: {
        type: "object", title: X, description: X,
        properties: { [X]: { type: "boolean", title: X, description: X } },
      },
      [`date${X}`]: { type: "string", format: "date", title: X },
      rows: {
        type: "array", title: X, description: X,
        items: { type: "object", properties: { dose: { type: "string", title: X, enum: [X, "b"] } } },
      },
    },
    required: [X],
  };
  const UI = { [`obj${X}`]: { [X]: { widget: "switch" } }, rows: { addLabel: X, removeLabel: X } } as const;
  /** Where a schema string may land: data and constraint attributes, set through setAttribute. */
  const DATA_ATTRIBUTES = new Set(["name", "value", "placeholder", "pattern", "aria-label", "data-value"]);

  it("renders a property name like `\"><img onerror>` as text", () => {
    const form = buildForm(HOSTILE, document, UI as never);
    expect(form.querySelector("img, [onerror], [src]")).toBeNull();
    const host = document.createElement("div");
    host.innerHTML = form.outerHTML;
    expect(host.querySelector("img, [onerror], [src]")).toBeNull();

    const labels = [...form.querySelectorAll('[data-part="label"]')].map((label) => label.textContent ?? "");
    expect(labels).toContain(`${X} *`);
    expect(form.querySelector("h1")?.textContent).toBe(`T${X}`);
    expect(form.querySelector('legend[data-part="title"]')?.textContent).toBe(X);
    expect(form.querySelector('[data-ui="radio"]')?.getAttribute("value")).toBe(X);
  });

  it("leaves no schema-derived string in an id, an idref or a directive", () => {
    const form = buildForm(HOSTILE, document, UI as never);
    const landed = new Set<string>();
    for (const element of [form, ...form.querySelectorAll("*")]) {
      for (const attr of element.attributes) {
        expect(attr.name, `<${element.tagName.toLowerCase()} ${attr.name}>`).not.toMatch(/^[:@]/);
        if (attr.name.startsWith("l-")) {
          expect(["l-data", "l-validate"]).toContain(attr.name);
          expect(attr.value).toBe("");
        }
        if (attr.value.includes("onerror")) {
          expect(DATA_ATTRIBUTES.has(attr.name), `${attr.name}="${attr.value}"`).toBe(true);
          landed.add(attr.name);
        }
      }
    }
    // The hostile strings did reach the data attributes — the walk saw them.
    expect([...landed].sort()).toEqual(["aria-label", "name", "pattern", "placeholder", "value"]);
    expectWired(form);
  });
});

describe("buildForm repeatable rows", () => {
  const SCHEMA: ObjectSchema = {
    type: "object",
    properties: {
      meds: {
        type: "array",
        title: "Medications",
        minItems: 1,
        maxItems: 3,
        items: {
          type: "object",
          properties: { name: { type: "string", title: "Name" }, dose: { type: "number" } },
          required: ["name"],
        },
      },
    },
  };
  let host: HTMLElement | null = null;
  afterEach(() => {
    host?.remove();
    host = null;
  });

  const rows = (form: HTMLFormElement) => [...form.querySelectorAll('[data-ui="card"][data-variant="filled"]')];
  const names = (form: HTMLFormElement) => [...form.querySelectorAll("[name]")].map((control) => control.getAttribute("name"));
  const buttons = (form: HTMLFormElement) => {
    const all = [...form.querySelectorAll<HTMLButtonElement>('button[data-ui="button"]')];
    return { add: all.find((b) => b.textContent === "Add Medications")!, remove: all.filter((b) => b.textContent === "Remove Medications") };
  };

  it("adds and removes a row, renumbering the names", () => {
    host = document.createElement("div");
    document.body.append(host);
    const form = buildForm(SCHEMA, document);
    host.append(form);

    expect(rows(form)).toHaveLength(1);
    expect(names(form)).toEqual(["meds[0].name", "meds[0].dose"]);
    expect(buttons(form).remove[0].hasAttribute("disabled")).toBe(true); // at minItems

    buttons(form).add.click();
    expect(rows(form)).toHaveLength(2);
    expect(names(form)).toEqual(["meds[0].name", "meds[0].dose", "meds[1].name", "meds[1].dose"]);
    expect(buttons(form).remove.every((b) => !b.hasAttribute("disabled"))).toBe(true);
    expect(rows(form)[1].querySelector("input")?.hasAttribute("required")).toBe(true);

    buttons(form).add.click();
    expect(rows(form)).toHaveLength(3);
    expect(buttons(form).add.hasAttribute("disabled")).toBe(true); // at maxItems
    buttons(form).add.click();
    expect(rows(form)).toHaveLength(3);

    const second = rows(form)[1].querySelector<HTMLInputElement>('[data-ui="input"]')!;
    second.value = "Aspirin";
    buttons(form).remove[0].click();
    expect(rows(form)).toHaveLength(2);
    expect(second.getAttribute("name")).toBe("meds[0].name");
    expect(second.value).toBe("Aspirin");
    expect(buttons(form).add.hasAttribute("disabled")).toBe(false);
    expect(form.ownerDocument.activeElement).toBe(buttons(form).add);

    buttons(form).remove[0].click();
    expect(rows(form)).toHaveLength(1);
    expect(buttons(form).remove[0].hasAttribute("disabled")).toBe(true);
    buttons(form).remove[0].click();
    expect(rows(form)).toHaveLength(1);
    expectWired(form);
  });

  it("gives every added row its own ids", () => {
    const form = buildForm(SCHEMA, document);
    buttons(form).add.click();
    const [first, second] = rows(form);
    const label = (row: Element) => row.querySelector('label[data-part="label"]')!;
    expect(label(first).getAttribute("for")).not.toBe(label(second).getAttribute("for"));
    expect(second.querySelector(`#${label(second).getAttribute("for")}`)?.getAttribute("name")).toBe("meds[1].name");
    expectWired(form);
  });
});

describe("buildForm refuses what it does not build", () => {
  const BASE: ObjectSchema = { type: "object", properties: { a: { type: "string" }, b: { type: "string" } } };

  it("throws on a wizard", () => {
    const ui = { "ui:wizard": { steps: [{ title: "A", fields: ["a"] }, { title: "B", fields: ["b"] }] } };
    expect(() => buildForm(BASE, document, ui)).toThrow(/does not build a wizard/);
  });

  it("throws on anything that needs a rules definition", () => {
    expect(() => buildForm(BASE, document, {}, { rules: { rules: [] } } as never)).toThrow(/opts\.rules/);
    expect(() => buildForm({ ...BASE, dependentRequired: { a: ["b"] } }, document)).toThrow(/needs a rules definition/);
    expect(() => buildForm({ type: "object", properties: { slug: { type: "string", pattern: "^[a-z.-]+$" } } }, document))
      .toThrow(/needs a rules definition/);
  });

  it("throws renderForm's own error on an unsupported schema", () => {
    const schema = { type: "object", properties: { a: { type: "null" } } } as unknown as ObjectSchema;
    expect(() => buildForm(schema, document)).toThrow('@faqir-ui/forms: unsupported type "null" at jsonSchema.properties.a.type.');
  });

  it("does not let a schema string forge the rules marker", () => {
    const schema: ObjectSchema = {
      type: "object",
      description: '<script type="application/json"> l-rules="#x"',
      properties: { a: { type: "string" } },
    };
    expect(buildForm(schema, document).querySelector("p")?.textContent).toBe(schema.description!);
  });
});
