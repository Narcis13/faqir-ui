// ═══════════════════════════════════════════════════════════════════════════
// The strict-CSP expression interpreter, unit by unit  [forecraft #50]
// ═══════════════════════════════════════════════════════════════════════════
//
// `src/core-src/csp-evaluator.js` is imported directly — it is an ES module so
// that this file can, and no engine is loaded, so this file runs in the
// production partition without bootstrapping anything.
//
// Most cases are differential: the same source runs through the interpreter and
// through the `new Function('$scope', '$el', '$this', 'with ($scope) …')` the
// default build compiles, against identical fresh scopes, and the two must
// agree on the value returned and on every write left behind. The rest pin what
// only the interpreter does: the forbidden members and the rejected syntax.

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

// Plain JS under src/core-src; imported through a computed specifier, as the
// tests import scripts/*.mjs, so it stays out of the type program.
type Compiled = (this: unknown, $scope: unknown, $el: unknown, $this: unknown) => any;
const { compileExpression, compileStatement } = (await import(join(ROOT, "src", "core-src", "csp-evaluator.js"))) as {
  compileExpression: (src: string) => Compiled;
  compileStatement: (src: string) => Compiled;
};

type Scope = Record<string, any>;

/** What the default build compiles, verbatim. */
function viaFunction(src: string, isExpr: boolean) {
  return new Function("$scope", "$el", "$this", isExpr ? "with($scope) { return (" + src + ") }" : "with($scope) { " + src + " }");
}

function csp(src: string, scope: Scope = {}, el: any = null) {
  return compileExpression(src).call(scope, scope, el, el);
}

function cspRun(src: string, scope: Scope = {}, el: any = null) {
  compileStatement(src).call(scope, scope, el, el);
  return scope;
}

function fixture(): Scope {
  const scope: Scope = {
    n: 2,
    s: "Ada",
    list: [3, 1, 2],
    user: { name: { first: "Ada", last: "Lovelace" }, tags: ["a", "b"], nil: null },
    empty: null,
    flag: false,
    count: 0,
    total: 10,
    obj: { a: 1, b: 2 },
    greet(who: string) {
      return "hi " + who + " from " + (this === scope ? "scope" : "elsewhere");
    },
    self() {
      return this;
    },
  };
  return scope;
}

/** Run one source both ways on twin fixtures; return both outcomes. */
function both(src: string, isExpr = true) {
  const a = fixture();
  const b = fixture();
  let ra: any, rb: any, ea: any, eb: any;
  try {
    ra = viaFunction(src, isExpr).call(a, a, null, null);
  } catch (e) {
    ea = e;
  }
  try {
    rb = (isExpr ? compileExpression : compileStatement)(src).call(b, b, null, null);
  } catch (e) {
    eb = e;
  }
  return { ra, rb, ea, eb, a, b };
}

function agree(src: string, isExpr = true) {
  const { ra, rb, ea, eb, a, b } = both(src, isExpr);
  if (ea || eb) {
    expect(eb?.constructor?.name, src).toBe(ea?.constructor?.name);
    return;
  }
  const norm = (v: any) => (v === a || v === b ? "<scope>" : typeof v === "function" ? "<fn>" : v);
  expect(norm(rb), src).toEqual(norm(ra));
  expect(JSON.stringify(b), src).toBe(JSON.stringify(a));
}

describe("differential: the interpreter agrees with the `new Function` build", () => {
  const expressions = [
    // literals
    "1", "1.5e3", "0x1f", ".5", "'it\\'s'", '"tab\\tnew\\nline \\u0041 \\x42 \\u{1F600}"', "true", "false", "null",
    "`plain`", "`n is ${n} and ${n * 2}`", "`nested ${`inner ${s}`}`", "[1, 2, ...list]", "[]",
    "{ a: 1, 'b-c': 2, [s]: 3, n, ...obj }", "({ x: { y: [1, { z: 2 }] } }).x.y[1].z",
    // member, optional, calls
    "user.name.first", "user['name']['last']", "user.tags[1]", "user.tags.length", "empty?.x", "empty?.x.y.z",
    "user?.name?.first", "user.nil?.deep", "empty?.[0]", "empty?.()", "user.missing?.()", "list.indexOf(2)",
    "s.toLowerCase().split('')", "Math.max(...list)", "greet('you')", "self() === this", "this === $scope",
    "String(n)", "JSON.stringify(obj)", "Object.keys(obj).join(',')", "[...'abc'].length",
    // operators
    "-n", "+s", "!flag", "!!list", "~n", "typeof n", "typeof nothingAtAll", "typeof user.nil", "void 0",
    "n + 1 * 2", "(n + 1) * 2", "2 ** 3 ** 2", "(-2) ** 2", "total % 3", "total / 4 - 1", "1 << 3 >> 1 >>> 0",
    "n & 3 | 4 ^ 1", "n == '2'", "n === '2'", "n != 3", "n !== 2", "n < 3 && n >= 2", "'a' in obj", "'zz' in obj",
    "list instanceof Array", "empty ?? 'fallback'", "flag || 'or'", "n && 'and'", "flag ?? 'kept'",
    "n > 1 ? 'big' : 'small'", "n > 5 ? 'a' : n > 1 ? 'b' : 'c'", "(1, 2, n)",
    // functions
    "list.map(x => x * 2)", "list.map((x, i) => x + i)", "list.filter(function (x) { return x > 1 })",
    "list.reduce((a, b) => a + b, 0)", "(() => this)() === $scope", "((...r) => r.length)(1, 2, 3)",
    "[1, 2, 3].map(x => { if (x > 1) return x; return 0 })", "(function named(k) { return k ? named(k - 1) + 1 : 0 })(3)",
    "{ get double() { return this.n * 2 }, n: 4 }.double", "new Date(0).getTime()", "new Array(3).length",
    "/a+b/gi.test('xAABy')", "'a  b'.split(/\\s+/).length", "'x/y'.replace(/\\//, '-')",
    "{ m() { return this.v }, v: 7 }.m()", "{ async: 1, get: 2, set: 3, of: 4 }.get",
    // reads of globals and parameters
    "Number.isFinite(n)", "parseInt('42', 10)", "undefined", "NaN !== NaN", "$scope.n", "typeof $el",
  ];
  for (const src of expressions) it(`expression: ${src}`, () => agree(src));

  const statements = [
    "count++", "++count", "count--; count--", "count += 5", "count -= 1; count *= 3", "total /= 4", "total %= 3",
    "total **= 2", "total <<= 1", "total >>= 1", "total >>>= 1", "total &= 6", "total |= 1", "total ^= 3",
    "flag ||= 'set'", "n ||= 99", "n &&= 'and'", "flag &&= 'no'", "empty ??= 'filled'", "n ??= 5",
    "user.name.first = 'Grace'", "user['tags'][0] = 'z'", "list.push(9); list.sort()", "obj.c = obj.a + obj.b",
    "s = s + '!'; n = n * n", "if (n > 1) count = 1; else count = 2", "if (flag) { count = 1 } else if (n) { count = 3 }",
    "var t = n * 2; count = t", "let a = 1, b = 2; count = a + b", "const k = 'z'; obj[k] = 1",
    "for (const x of list) count += x", "for (let k in obj) count++", "for (const x of list) { if (x === 1) continue; if (x === 2) break; count += x }",
    "delete obj.a", "delete obj['b']", "{ count = 4; n = 1 }", ";;count = 7;", "count = list.length\nn = 1",
    "return", "count = 1; return; count = 2",
  ];
  for (const src of statements) it(`statement: ${JSON.stringify(src)}`, () => agree(src, false));

  it("throws what the compiled build throws, at the same point", () => {
    for (const src of ["missingName", "user.nil.deep", "empty.x", "s()", "user.name()", "missing()", "new 1"]) agree(src);
    for (const src of ["missingName++", "empty.x = 1", "q = missingName"]) agree(src, false);
  });
});

describe("scope lookup follows `with ($scope)`", () => {
  it("resolves scope keys through `in`, so a proxy's `has` trap decides", () => {
    const seen: string[] = [];
    const target: Scope = { mine: 1 };
    const scope = new Proxy(target, {
      has(t, k) {
        seen.push(String(k));
        return k in t || k === "virtual";
      },
      get(t, k) {
        return k === "virtual" ? "from-trap" : (t as any)[k];
      },
    });
    expect(csp("virtual + mine", scope)).toBe("from-trap1");
    expect(seen).toContain("virtual");
  });

  it("falls back to $scope, $el and $this, then to globals", () => {
    const el = { tagName: "DIV" };
    expect(csp("$el.tagName", {}, el)).toBe("DIV");
    expect(csp("$this === $el", {}, el)).toBe(true);
    expect(csp("$el", { $el: "magic wins" }, el)).toBe("magic wins");
    expect(csp("$this", { $this: "never shadowed? it is, by a scope key" }, el)).toBe("never shadowed? it is, by a scope key");
    expect(csp("Math.PI")).toBe(Math.PI);
  });

  it("an inherited scope key (the magics' prototype) resolves like an own one", () => {
    const magics = Object.create(null, { $state: { get: () => "open" }, $dispatch: { value: (n: string) => "fired " + n } });
    const scope = Object.create(magics);
    scope.open = true;
    expect(csp("$state === 'open' && open", scope)).toBe(true);
    expect(csp("$dispatch('picked')", scope)).toBe("fired picked");
  });

  it("calls a scope function with the scope as `this`, a global one without", () => {
    const scope = fixture();
    expect(csp("greet('me')", scope)).toBe("hi me from scope");
    (globalThis as any).__cspThisProbe = function (this: unknown) {
      return this;
    };
    try {
      expect(csp("__cspThisProbe()", scope)).toBeUndefined();
      expect(csp("user.self ? 1 : 2", scope)).toBe(2);
    } finally {
      delete (globalThis as any).__cspThisProbe;
    }
  });

  it("assigning a name nobody declared creates a global, as sloppy code does", () => {
    try {
      cspRun("__cspCreated = 5", {});
      expect((globalThis as any).__cspCreated).toBe(5);
    } finally {
      delete (globalThis as any).__cspCreated;
    }
  });

  it("a write a getter-only magic refuses is ignored, not thrown", () => {
    const scope = Object.create(Object.create(null, { $refs: { get: () => ({}) } }));
    expect(() => cspRun("$refs = 1", scope)).not.toThrow();
  });

  it("closures see the scope live, and arrows keep the caller's `this`", () => {
    const scope: Scope = { n: 1, fns: null };
    cspRun("fns = { arrow: () => this.n, plain() { return this.n } }", scope);
    scope.n = 5;
    expect(scope.fns.arrow()).toBe(5);
    expect(scope.fns.plain.call({ n: 9 })).toBe(9);
  });

  it("$event and $modelValue arrive as scope keys and are read as such", () => {
    const scope: Scope = { key: "", $event: { key: "Enter" } };
    cspRun("key = $event.key === ' ' ? 'Space' : $event.key", scope);
    expect(scope.key).toBe("Enter");
    const model: Scope = { form: { name: "" }, $modelValue: "typed 'quote' \\ and \n newline" };
    cspRun("form.name = $modelValue", model);
    expect(model.form.name).toBe("typed 'quote' \\ and \n newline");
  });

  it("caches one compiled function per source and kind", () => {
    expect(compileExpression("n + 1")).toBe(compileExpression("n + 1"));
    expect(compileStatement("n + 1")).not.toBe(compileExpression("n + 1"));
  });
});

describe("forbidden members", () => {
  for (const name of ["constructor", "__proto__", "prototype"]) {
    it(`"${name}" is a SyntaxError as a static member`, () => {
      expect(() => compileExpression(`s.${name}`)).toThrow(SyntaxError);
      expect(() => compileExpression(`s.${name}`)).toThrow(`Access to "${name}" is forbidden`);
      expect(() => compileStatement(`obj.${name}.polluted = 1`)).toThrow(SyntaxError);
    });

    it(`"${name}" is a TypeError as a computed member, however it is spelled`, () => {
      const scope: Scope = { s: "x", k: name, parts: [name.slice(0, 3), name.slice(3)] };
      expect(() => csp(`s['${name}']`, scope)).toThrow(TypeError);
      expect(() => csp("s[k]", scope)).toThrow(`Access to "${name}" is forbidden`);
      expect(() => csp("s[parts.join('')]", scope)).toThrow(TypeError);
      expect(() => csp("s?.[k]", scope)).toThrow(TypeError);
      expect(() => cspRun("s[k] = 1", scope)).toThrow(TypeError);
      expect(() => csp("{ [k]: 1 }", scope)).toThrow(TypeError);
    });
  }

  it("closes the classic reach from a value to Function", () => {
    expect(() => compileExpression("''.constructor.constructor('return this')()")).toThrow(SyntaxError);
    expect(() => compileExpression("[]['const' + 'ructor']['const' + 'ructor']('x')")).not.toThrow();
    expect(() => csp("[]['const' + 'ructor']['const' + 'ructor']('x')")).toThrow(TypeError);
  });

  it("refuses a __proto__ key in an object literal, and leaves Object.prototype alone", () => {
    expect(() => compileExpression("{ __proto__: { polluted: 1 } }")).toThrow(SyntaxError);
    expect(() => cspRun("o = {}; o['__pro' + 'to__'].polluted = 1", {})).toThrow(TypeError);
    expect(({} as any).polluted).toBeUndefined();
  });

  it("a property that merely contains the word is fine", () => {
    expect(csp("{ constructorName: 1, prototypes: 2 }.prototypes")).toBe(2);
    expect(csp("x.constructorName", { x: { constructorName: "ok" } })).toBe("ok");
  });
});

describe("rejected syntax names the construct", () => {
  const cases: Array<[string, boolean, RegExp]> = [
    ["class A {}", false, /Unsupported syntax "class"/],
    ["async () => 1", true, /Unexpected/],
    ["await load()", true, /Unsupported syntax "await"/],
    ["function* g() {}", true, /Unexpected "\*"/],
    ["const { a } = obj", false, /Unexpected "\{"/],
    ["(a = 1) => a", true, /Unexpected "=>"/],
    ["function (a = 1) { return a }", true, /default parameter/],
    ["[count, n] = [1, 2]", false, /Invalid assignment target/],
    ["switch (n) { case 1: break }", false, /Unsupported syntax "switch"/],
    ["try { x() } catch (e) {}", false, /Unsupported syntax "try"/],
    ["while (n) n--", false, /Unsupported syntax "while"/],
    ["for (let i = 0; i < 3; i++) n++", false, /for loop other than/],
    ["function f() {}", false, /function declaration/],
    ["tag`x`", true, /tagged template/],
    ["break", false, /Illegal break/],
    ["a b", false, /Unexpected "b"/],
    ["n +", true, /Unexpected end of input/],
    ["'open", true, /Unterminated string/],
    ["`open", true, /Unterminated template/],
    ["/open", true, /Unterminated regular expression/],
    ["#x", true, /Unexpected character "#"/],
    ["n; m", true, /Unexpected ";"/],
    ["1 = 2", false, /Invalid assignment target/],
    ["a?.b = 1", false, /Invalid assignment target/],
    ["import('x')", true, /Unsupported syntax "import"/],
    ["new.target", true, /new\.target/],
  ];
  for (const [src, isExpr, message] of cases) {
    it(`${isExpr ? "expression" : "statement"} ${JSON.stringify(src)}`, () => {
      const compile = isExpr ? compileExpression : compileStatement;
      expect(() => compile(src)).toThrow(SyntaxError);
      expect(() => compile(src)).toThrow(message);
    });
  }

  it("rejects at compile time, like `new Function`, even on a branch never run", () => {
    expect(() => compileStatement("if (false) { class X {} }")).toThrow(SyntaxError);
  });
});

// Every directive expression the registry and the docs site ship must be in the
// subset — the grammar was read off them, and this keeps it that way.
describe("coverage: every shipped directive expression parses", () => {
  const ATTR =
    /(?:^|[\s<])((?:l-[a-z][\w-]*(?::[\w.:-]+)?)|(?:@[a-z][\w.:-]*)|(?::[a-z][\w.-]*))\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const NOT_EXPRESSIONS = /^(?:l-ref|l-cloak|l-teleport|l-transition|l-validate|l-mask|l-source)\b/;
  const STATEMENT = /^(?:l-on|@|l-init|l-effect|l-intersect)/;

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (name.endsWith(".html")) out.push(full);
    }
    return out;
  }

  const files = [...walk(join(ROOT, "registry")), ...walk(join(ROOT, "site", "content"))];
  const found: Array<{ file: string; attr: string; src: string; isExpr: boolean }> = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(ATTR)) {
      const attr = m[1]!;
      if (NOT_EXPRESSIONS.test(attr)) continue;
      let src = (m[2] ?? m[3] ?? "")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
      if (attr === "l-for") src = src.replace(/^\s*(?:\(?\s*\w+\s*(?:,\s*\w+)?\s*\)?\s+in\s+)/, "");
      if (attr === "l-rules" && src.startsWith("#")) continue;
      found.push({ file: file.slice(ROOT.length + 1), attr, src, isExpr: !STATEMENT.test(attr) });
    }
  }

  it("finds a real population to check", () => {
    expect(found.length).toBeGreaterThan(100);
    expect(new Set(found.map((f) => f.file)).size).toBeGreaterThan(4);
  });

  it("parses all of them", () => {
    const failures: string[] = [];
    for (const f of found) {
      try {
        viaFunction(f.src, f.isExpr);
      } catch {
        continue; // not JavaScript at all (a placeholder in prose) — not the subset's business
      }
      try {
        (f.isExpr ? compileExpression : compileStatement)(f.src);
      } catch (e: any) {
        failures.push(`${f.file} ${f.attr}="${f.src}": ${e.message}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
