// Compile-time checks over the composed AST (docs/template.md §5, §8.4, §11.6,
// §11.7, §12.3): where data may not go, which helpers exist, and what the page
// needs in the browser. One walk over every node and every expression site.
// It also turns `l-data=json(…)` into the island node (`{ json }`), since
// that is where the attribute is recognised. Attribute names are compared
// lowercased: the HTML parser lowercases them, so `L-TEXT` is `l-text`.

import { reportAt } from "./diagnostics.js";

/**
 * @typedef {import("./diagnostics.js").Context} Context
 * @typedef {{ ctx: Context, helpers: Set<string>, raw: boolean, table: any,
 *   core: boolean, plugins: Set<string>, controllers: Set<string>, uses: Set<string> }} Checker
 */

/** True for an attribute faqir-core evaluates (§5). */
export function isDirective(/** @type {string} */ name) {
  const n = name.toLowerCase();
  return n.startsWith("l-") || n.startsWith(":") || n.startsWith("@");
}

/**
 * Attributes that take no data (§12.3): `srcdoc` is a whole document, `style`
 * is CSS, and SVG animation values can set an `href` the URL check never sees.
 */
const NO_DATA_ATTRS = new Set(["srcdoc", "style", "to", "from", "values", "by"]);

/** True for a bare attribute or a literal without holes. @param {any} value */
function isLiteral(value) {
  return value === true || Boolean(value.parts && value.parts.every((/** @type {unknown} */ p) => typeof p === "string"));
}

/**
 * Check the body and every partial; return the `@ui:requires` list (§11.6)
 * and every component the output draws (§16.1 `uses`).
 * @param {any[]} body
 * @param {Record<string, any[]>} partials
 * @param {Context} ctx
 * @param {{ helpers: string[], raw: boolean, table: any }} options
 * @returns {{ requires: string[], uses: string[] }}
 */
export function check(body, partials, ctx, options) {
  /** @type {Checker} */
  const k = {
    ctx, helpers: new Set(options.helpers), raw: options.raw, table: options.table,
    core: false, plugins: new Set(), controllers: new Set(), uses: new Set(),
  };
  checkNodes(body, k, false);
  for (const nodes of Object.values(partials)) checkNodes(nodes, k, false);
  if (k.controllers.size > 0) k.core = true;
  const requires = [...(k.core ? ["faqir-core.js"] : []), ...[...k.plugins].sort(), ...[...k.controllers].sort()];
  return { requires, uses: [...k.uses].sort() };
}

/**
 * @param {any[]} nodes
 * @param {Checker} k
 * @param {boolean} script inside script/style content
 */
function checkNodes(nodes, k, script) {
  for (const node of nodes) checkNode(node, k, script);
}

/**
 * Check one node and its children.
 * @param {any} node
 * @param {Checker} k
 * @param {boolean} script
 */
function checkNode(node, k, script) {
  if (script && node.type !== "Text") reportAt(k.ctx, "script-content", "script and style hold literal text only", node.loc);
  switch (node.type) {
    case "Element": return checkElement(node, k);
    case "Text": return checkText(node, k, script);
    case "Raw":
      if (!k.raw) reportAt(k.ctx, "raw-refused", "raw HTML is refused by this compile", node.loc);
      if (node.expr) checkExpr(node.expr, node.loc, k);
      return;
    case "If":
      for (const b of node.branches) {
        if (b.test) checkExpr(b.test, node.loc, k);
        checkNodes(b.body, k, script);
      }
      return;
    case "Each":
      checkExpr(node.of, node.loc, k);
      checkNodes(node.body, k, script);
      checkNodes(node.else, k, script);
      return;
    case "Include":
      for (const p of node.params) checkValue(p.value, node.loc, k);
      return;
    case "Params":
      for (const p of node.params) if (p.value !== null) checkValue(p.value, node.loc, k);
      return;
    case "Copy":
      for (const nodes of node.bodies) checkNodes(nodes, k, script);
      return;
    case "Component":
      // The expansion's root carries a literal data-ui, which records the
      // component's controllers like any plain data-ui element.
      if (node.id) checkValue(node.id, node.loc, k);
      checkNodes(node.body, k, script);
  }
}

/**
 * An element: its attributes, and its content (literal-only for script/style).
 * @param {any} node
 * @param {Checker} k
 */
function checkElement(node, k) {
  for (const attr of node.attrs) checkAttr(attr, node, k);
  const tag = String(node.tag).toLowerCase();
  checkNodes(node.children, k, tag === "script" || tag === "style");
  const ui = node.attrs.find((/** @type {any} */ a) => a.name.toLowerCase() === "data-ui")?.value;
  const name = ui?.parts?.length === 1 && typeof ui.parts[0] === "string" ? ui.parts[0] : undefined;
  if (name) k.uses.add(name);
  const files = name && k.table?.controllers ? Object.getOwnPropertyDescriptor(k.table.controllers, name)?.value : undefined;
  for (const file of files ?? []) k.controllers.add(file);
}

/**
 * One attribute: refuse `on*`, keep data out of faqir-core attributes, turn
 * `l-data=json(…)` into the island, and note the plugin it needs.
 * @param {any} attr
 * @param {any} node
 * @param {Checker} k
 */
function checkAttr(attr, node, k) {
  const loc = attr.col ? [node.loc[0], node.loc[1], attr.col] : node.loc;
  const name = attr.name.toLowerCase();
  if (name.startsWith("on")) return reportAt(k.ctx, "event-attr", `${attr.name}: inline event handlers are refused; use @event`, loc);
  if (NO_DATA_ATTRS.has(name.replace(/^.*:/, "")) && !isLiteral(attr.value)) {
    return reportAt(k.ctx, "unsafe-attr", `${attr.name} takes a literal, not data`, loc);
  }
  if (!isDirective(name)) {
    for (const part of attr.value.parts ?? []) if (typeof part === "string") checkEntity(part, loc, k);
    return checkValue(attr.value, loc, k);
  }
  k.core = true;
  const plugin = k.table?.plugins?.[name.replace(/[:.].*$/, "")];
  if (typeof plugin === "string") k.plugins.add(plugin);
  if (name === "l-data" && isJsonCall(attr.value)) {
    attr.value = { json: attr.value.expr.args[0] };
    return checkExpr(attr.value.json, loc, k);
  }
  if (!isLiteral(attr.value)) {
    reportAt(k.ctx, "directive-interpolation", `${attr.name} is evaluated by faqir-core; it takes a literal, not server data`, loc);
  }
}

/** True for an attribute value that is exactly `json(expr)`. @param {any} value */
function isJsonCall(value) {
  return value?.expr?.type === "Call" && value.expr.name === "json" && value.expr.args.length === 1;
}

/**
 * Text: holes are refused in script/style content, and so is a closing tag.
 * @param {any} node
 * @param {Checker} k
 * @param {boolean} script
 */
function checkText(node, k, script) {
  for (const part of node.parts) {
    if (typeof part === "string") {
      if (script && /<\/(script|style)/i.test(part)) reportAt(k.ctx, "script-content", "script/style content cannot close its element", node.loc);
      if (!script) checkEntity(part, node.loc, k);
    } else if (script) {
      reportAt(k.ctx, "script-content", "a hole cannot go into script or style content", node.loc);
    } else if (part.expr) {
      checkExpr(part.expr, node.loc, k);
    }
  }
}

/**
 * The named entities people write by reflex, with their characters for the
 * hint. A name not here (`R&D;`) is not taken for an entity: the browser
 * would show it as typed too.
 */
const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "a no-break space", ensp: "an en space", emsp: "an em space",
  thinsp: "a thin space", shy: "a soft hyphen", zwj: "a zero-width joiner", zwnj: "a zero-width non-joiner",
  mdash: "—", ndash: "–", minus: "−", hellip: "…", bull: "•", middot: "·", deg: "°", prime: "′", Prime: "″",
  copy: "©", reg: "®", trade: "™", sect: "§", para: "¶", dagger: "†", Dagger: "‡", permil: "‰",
  laquo: "«", raquo: "»", lsaquo: "‹", rsaquo: "›", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", sbquo: "‚", bdquo: "„",
  larr: "←", rarr: "→", uarr: "↑", darr: "↓", harr: "↔", lArr: "⇐", rArr: "⇒", hArr: "⇔",
  times: "×", divide: "÷", plusmn: "±", le: "≤", ge: "≥", ne: "≠", asymp: "≈", infin: "∞", frac12: "½", frac14: "¼", frac34: "¾",
  sup1: "¹", sup2: "²", sup3: "³", micro: "µ", cent: "¢", pound: "£", euro: "€", yen: "¥", curren: "¤",
  iexcl: "¡", iquest: "¿", szlig: "ß", aacute: "á", agrave: "à", acirc: "â", auml: "ä", atilde: "ã", aring: "å",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", iacute: "í", igrave: "ì", icirc: "î", iuml: "ï",
  oacute: "ó", ograve: "ò", ocirc: "ô", ouml: "ö", otilde: "õ", oslash: "ø", uacute: "ú", ugrave: "ù", ucirc: "û", uuml: "ü",
  ccedil: "ç", ntilde: "ñ", Eacute: "É", Ccedil: "Ç", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", Ntilde: "Ñ",
  check: "✓", cross: "✗", star: "☆", hearts: "♥", nabla: "∇", sum: "∑", prod: "∏", radic: "√", alpha: "α", beta: "β", pi: "π", lambda: "λ",
};

/**
 * Literal text is escaped like data (§6), so an entity in it renders as typed:
 * `&lt;id&gt;` shows `&lt;id&gt;`. That is never what was meant
 * (`literal-entity`); the character itself is written instead.
 * @param {string} text
 * @param {number[]} loc
 * @param {Checker} k
 */
function checkEntity(text, loc, k) {
  for (const m of text.matchAll(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/g)) {
    const body = m[1];
    const code = /^#[xX]/.test(body) ? parseInt(body.slice(2), 16) : body.startsWith("#") ? Number(body.slice(1)) : NaN;
    /** @type {string | undefined} */
    const char = Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code)
      : Object.prototype.hasOwnProperty.call(ENTITIES, body) ? /** @type {Record<string, string>} */ (ENTITIES)[body] : undefined;
    if (char === undefined) continue;
    const what = [...char].length === 1 ? `"${char}" itself` : char;
    reportAt(k.ctx, "literal-entity", `"${m[0]}" would render as typed, since literal text is escaped; write ${what} (a hole, {{ "${m[0]}" }}, shows it as typed)`, loc);
    return;
  }
}

/**
 * The expressions inside an attribute or parameter value.
 * @param {any} value
 * @param {number[]} loc
 * @param {Checker} k
 */
function checkValue(value, loc, k) {
  if (value === true) return;
  if (value.expr) return checkExpr(value.expr, loc, k);
  for (const part of value.parts ?? []) if (part.expr) checkExpr(part.expr, loc, k);
}

/**
 * Every call in an expression must name a declared helper; `json` is only
 * for the island.
 * @param {any} expr
 * @param {number[]} loc
 * @param {Checker} k
 */
function checkExpr(expr, loc, k) {
  if (expr.type === "Call") {
    if (expr.name === "json") reportAt(k.ctx, "json-misplaced", "json() is only the whole value of l-data", loc);
    else if (!k.helpers.has(expr.name)) reportAt(k.ctx, "unknown-helper", `no helper "${expr.name}" is declared`, loc);
  }
  for (const child of [expr.arg, expr.left, expr.right, expr.test, expr.then, expr.else, ...(expr.args ?? []), ...(expr.keys ?? [])]) {
    if (child && typeof child === "object") checkExpr(child, loc, k);
  }
}
