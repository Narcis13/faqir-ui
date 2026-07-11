// Zero-dependency JSON Schema (Draft-07 subset) validator.
//
// Faqir ships no runtime JSON-schema dependency, but task 0.5-07 publishes a
// versioned `manifest.schema.json` and gates CI on (a) every registry manifest
// validating against it and (b) the schema itself being valid JSON Schema
// (meta-validation against the Draft-07 meta-schema). Both checks run through
// this validator.
//
// It implements the Draft-07 keywords the manifest schema and the Draft-07
// meta-schema actually use — enough to validate our schema against the
// meta-schema and our data against our schema. Unsupported keywords are ignored
// (treated as "pass"), which is the spec-sanctioned behaviour for an unknown
// keyword, never a spurious failure.

export interface SchemaError {
  /** JSON-pointer-ish path to the offending instance location. */
  path: string;
  /** Human-readable reason. */
  message: string;
}

type JSONSchema = boolean | Record<string, unknown>;

/** Decode one JSON-pointer reference token (`~1` → `/`, `~0` → `~`). */
function decodePointerToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** Resolve a local `#/a/b` JSON-pointer `$ref` against the root schema. */
function resolveRef(root: JSONSchema, ref: string): JSONSchema | undefined {
  if (ref === "#") return root;
  if (!ref.startsWith("#/")) return undefined;
  const segments = ref.slice(2).split("/").map(decodePointerToken);
  let current: unknown = root;
  for (const seg of segments) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[seg];
    if (current === undefined) return undefined;
  }
  return current as JSONSchema;
}

/** JSON structural deep-equality (used by `enum`, `const`, `uniqueItems`). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

/** The JSON-Schema "type" of a value (integer folded into number). */
function jsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function matchesType(value: unknown, type: string): boolean {
  const actual = jsonType(value);
  if (type === "integer") return actual === "number" && Number.isInteger(value as number);
  if (type === "number") return actual === "number";
  return actual === type;
}

interface Ctx {
  root: JSONSchema;
  errors: SchemaError[];
}

function err(ctx: Ctx, path: string, message: string): void {
  ctx.errors.push({ path: path || "(root)", message });
}

/**
 * Validate `data` against a (sub)schema, appending any failures to `ctx.errors`.
 * Returns nothing — callers inspect `ctx.errors`. Sub-validations that must not
 * leak errors (inside `anyOf`/`oneOf`/`not`) run through {@link countErrors}.
 */
function validateNode(ctx: Ctx, schema: JSONSchema, data: unknown, path: string): void {
  if (schema === true) return;
  if (schema === false) {
    err(ctx, path, "schema is `false` — no value is valid here");
    return;
  }
  if (typeof schema !== "object" || schema === null) return;

  const s = schema as Record<string, unknown>;

  // $ref short-circuits (Draft-07: siblings ignored alongside $ref).
  if (typeof s.$ref === "string") {
    const resolved = resolveRef(ctx.root, s.$ref);
    if (resolved === undefined) {
      err(ctx, path, `unresolvable $ref '${s.$ref}'`);
      return;
    }
    validateNode(ctx, resolved, data, path);
    return;
  }

  // type
  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? (s.type as string[]) : [s.type as string];
    if (!types.some((t) => matchesType(data, t))) {
      err(ctx, path, `expected type ${types.join(" | ")}, got ${jsonType(data)}`);
    }
  }

  // enum / const
  if (Array.isArray(s.enum) && !s.enum.some((v) => deepEqual(v, data))) {
    err(ctx, path, `value is not one of the permitted enum values`);
  }
  if ("const" in s && !deepEqual(s.const, data)) {
    err(ctx, path, `value does not equal the required const`);
  }

  const type = jsonType(data);

  if (type === "object") validateObject(ctx, s, data as Record<string, unknown>, path);
  if (type === "array") validateArray(ctx, s, data as unknown[], path);
  if (type === "string") validateString(ctx, s, data as string, path);
  if (type === "number") validateNumber(ctx, s, data as number, path);

  // Combinators
  if (Array.isArray(s.allOf)) {
    for (const sub of s.allOf as JSONSchema[]) validateNode(ctx, sub, data, path);
  }
  if (Array.isArray(s.anyOf)) {
    const anyOk = (s.anyOf as JSONSchema[]).some((sub) => countErrors(ctx.root, sub, data) === 0);
    if (!anyOk) err(ctx, path, "value does not match any of the anyOf schemas");
  }
  if (Array.isArray(s.oneOf)) {
    const matches = (s.oneOf as JSONSchema[]).filter((sub) => countErrors(ctx.root, sub, data) === 0).length;
    if (matches !== 1) err(ctx, path, `value must match exactly one oneOf schema (matched ${matches})`);
  }
  if (s.not !== undefined) {
    if (countErrors(ctx.root, s.not as JSONSchema, data) === 0) {
      err(ctx, path, "value must not match the 'not' schema");
    }
  }

  // if / then / else
  if (s.if !== undefined) {
    const condOk = countErrors(ctx.root, s.if as JSONSchema, data) === 0;
    const branch = condOk ? s.then : s.else;
    if (branch !== undefined) validateNode(ctx, branch as JSONSchema, data, path);
  }
}

/** Run a sub-validation in isolation and return how many errors it produced. */
function countErrors(root: JSONSchema, schema: JSONSchema, data: unknown): number {
  const sub: Ctx = { root, errors: [] };
  validateNode(sub, schema, data, "");
  return sub.errors.length;
}

function validateObject(ctx: Ctx, s: Record<string, unknown>, data: Record<string, unknown>, path: string): void {
  const keys = Object.keys(data);

  if (Array.isArray(s.required)) {
    for (const key of s.required as string[]) {
      if (!(key in data)) err(ctx, path, `missing required property '${key}'`);
    }
  }

  if (typeof s.minProperties === "number" && keys.length < s.minProperties) {
    err(ctx, path, `expected at least ${s.minProperties} properties, got ${keys.length}`);
  }
  if (typeof s.maxProperties === "number" && keys.length > s.maxProperties) {
    err(ctx, path, `expected at most ${s.maxProperties} properties, got ${keys.length}`);
  }

  const properties = (s.properties as Record<string, JSONSchema>) || {};
  const patternProperties = (s.patternProperties as Record<string, JSONSchema>) || {};
  const matchedByPattern = new Set<string>();

  for (const key of keys) {
    const childPath = `${path}/${key}`;
    let covered = false;
    if (Object.prototype.hasOwnProperty.call(properties, key)) {
      covered = true;
      validateNode(ctx, properties[key], data[key], childPath);
    }
    for (const [pattern, sub] of Object.entries(patternProperties)) {
      if (new RegExp(pattern).test(key)) {
        covered = true;
        matchedByPattern.add(key);
        validateNode(ctx, sub, data[key], childPath);
      }
    }
    if (!covered && s.additionalProperties !== undefined) {
      if (s.additionalProperties === false) {
        err(ctx, childPath, `additional property '${key}' is not allowed`);
      } else if (typeof s.additionalProperties === "object") {
        validateNode(ctx, s.additionalProperties as JSONSchema, data[key], childPath);
      }
    }
  }

  if (s.propertyNames !== undefined) {
    for (const key of keys) validateNode(ctx, s.propertyNames as JSONSchema, key, `${path}/${key}`);
  }

  if (typeof s.dependencies === "object" && s.dependencies !== null) {
    for (const [key, dep] of Object.entries(s.dependencies as Record<string, unknown>)) {
      if (!(key in data)) continue;
      if (Array.isArray(dep)) {
        for (const req of dep as string[]) {
          if (!(req in data)) err(ctx, path, `property '${key}' requires '${req}'`);
        }
      } else {
        validateNode(ctx, dep as JSONSchema, data, path);
      }
    }
  }
}

function validateArray(ctx: Ctx, s: Record<string, unknown>, data: unknown[], path: string): void {
  if (typeof s.minItems === "number" && data.length < s.minItems) {
    err(ctx, path, `expected at least ${s.minItems} items, got ${data.length}`);
  }
  if (typeof s.maxItems === "number" && data.length > s.maxItems) {
    err(ctx, path, `expected at most ${s.maxItems} items, got ${data.length}`);
  }
  if (s.uniqueItems === true) {
    for (let i = 0; i < data.length; i++) {
      for (let j = i + 1; j < data.length; j++) {
        if (deepEqual(data[i], data[j])) {
          err(ctx, path, `items must be unique (indices ${i} and ${j} are equal)`);
        }
      }
    }
  }

  if (Array.isArray(s.items)) {
    const tuple = s.items as JSONSchema[];
    data.forEach((item, i) => {
      if (i < tuple.length) validateNode(ctx, tuple[i], item, `${path}/${i}`);
      else if (typeof s.additionalItems === "object") {
        validateNode(ctx, s.additionalItems as JSONSchema, item, `${path}/${i}`);
      } else if (s.additionalItems === false) {
        err(ctx, `${path}/${i}`, "additional array items are not allowed");
      }
    });
  } else if (s.items !== undefined) {
    data.forEach((item, i) => validateNode(ctx, s.items as JSONSchema, item, `${path}/${i}`));
  }

  if (s.contains !== undefined) {
    const ok = data.some((item) => countErrors(ctx.root, s.contains as JSONSchema, item) === 0);
    if (!ok) err(ctx, path, "no array item matches the 'contains' schema");
  }
}

function validateString(ctx: Ctx, s: Record<string, unknown>, data: string, path: string): void {
  // Count Unicode code points, per spec, not UTF-16 units.
  const length = [...data].length;
  if (typeof s.minLength === "number" && length < s.minLength) {
    err(ctx, path, `string shorter than minLength ${s.minLength}`);
  }
  if (typeof s.maxLength === "number" && length > s.maxLength) {
    err(ctx, path, `string longer than maxLength ${s.maxLength}`);
  }
  if (typeof s.pattern === "string" && !new RegExp(s.pattern).test(data)) {
    err(ctx, path, `string does not match pattern /${s.pattern}/`);
  }
  // `format` is annotation-only in Draft-07 — intentionally not enforced.
}

function validateNumber(ctx: Ctx, s: Record<string, unknown>, data: number, path: string): void {
  if (typeof s.minimum === "number" && data < s.minimum) {
    err(ctx, path, `value ${data} is below minimum ${s.minimum}`);
  }
  if (typeof s.maximum === "number" && data > s.maximum) {
    err(ctx, path, `value ${data} is above maximum ${s.maximum}`);
  }
  if (typeof s.exclusiveMinimum === "number" && data <= s.exclusiveMinimum) {
    err(ctx, path, `value ${data} is not above exclusiveMinimum ${s.exclusiveMinimum}`);
  }
  if (typeof s.exclusiveMaximum === "number" && data >= s.exclusiveMaximum) {
    err(ctx, path, `value ${data} is not below exclusiveMaximum ${s.exclusiveMaximum}`);
  }
  if (typeof s.multipleOf === "number" && s.multipleOf > 0) {
    const q = data / s.multipleOf;
    if (Math.abs(q - Math.round(q)) > 1e-9) err(ctx, path, `value ${data} is not a multiple of ${s.multipleOf}`);
  }
}

/**
 * Validate `data` against `schema` (which is also used as the `$ref` resolution
 * root). Returns an array of `{ path, message }` errors — empty when valid.
 */
export function validateAgainstSchema(schema: JSONSchema, data: unknown): SchemaError[] {
  const ctx: Ctx = { root: schema, errors: [] };
  validateNode(ctx, schema, data, "");
  return ctx.errors;
}
