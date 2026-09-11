/**
 * Motion, decoration and control-silhouette families — `registry/tokens/{motion,aliases}.css`  [1.1A-05]
 *
 * The three axes left after type (1.1A-01), shape and focus (1.1A-02/03) and
 * depth and material (1.1A-04). Each is the same shape of problem: a decision
 * the design makes in a dozen stylesheets, which a theme therefore cannot make
 * at all.
 *
 * **Motion.** The easing PALETTE gained a spring. It has no consumer of its own
 * — neither does `--ease-bounce`, which has shipped since 1.0 — because an
 * easing palette is re-pointed, not read: a theme that wants everything to
 * overshoot sets `--ease-default: var(--ease-spring)`. `--motion-hover-lift` is
 * the one motion token components DO read, and it is a `translate` value rather
 * than a length so its default can be `none`, the initial value of that
 * property. Neither `button` nor `card` lifted before this task; at `none` they
 * still do not.
 *
 * **Decoration.** The marks that are neither edge, fill nor type: the link
 * underline (three properties, spelled out in `link` and again in `prose`), the
 * divider style, the zebra stripe, the list marker — and `::selection`, which
 * no component owned at all, so a themed page's one un-themed surface was the
 * highlight the reader drags across it.
 *
 * **Controls.** The silhouettes a theme flips: what a text control paints
 * (`--input-fill`, read by `input`, `textarea` AND `select`, so one declaration
 * fills all three), whether buttons are upper-cased, and the two control shapes
 * that do not follow `--radius-md`.
 *
 * Five things are pinned here:
 *
 * 1. **The families exist with the documented defaults**, and every default is
 *    the value the registry already rendered — `none` where that is the
 *    property's initial value, `currentColor` for the marker, today's numbers
 *    everywhere else. 1.1A-08 derives the `motion`, `decoration` and `controls`
 *    axes from exactly these names.
 *
 * 2. **The spring is guarded.** A custom property stores whatever tokens it is
 *    given, so a browser without `linear()` would accept the spring and then
 *    drop every `transition` that used it — landing on the initial easing, not
 *    on a fallback. The cubic-bezier is therefore declared FIRST, in `:root`,
 *    and the `linear()` upgrade lives inside `@supports`.
 *
 * 3. **No component spells an easing, a link decoration or a control fill.**
 *    The easing sweep is the motion twin of the edge gate in
 *    `shape-focus.test.ts`; it found the last two literals hiding where 1.1A-04
 *    found its six — in `var(--token, fallback)` fallbacks that the token layer
 *    makes unreachable.
 *
 * 4. **The rendered chain still resolves to what it resolved to**, read out of
 *    the shipped stylesheets through a real property rather than asserted from
 *    the source text.
 *
 * 5. **A theme token obliges its whole namespace.** Naming one token
 *    `--checkbox-radius` makes `--checkbox-*` a token family, and the registry
 *    audit then reads every other `--checkbox-…` as a token wearing a fallback
 *    as a disguise. For `checkbox` and `switch` that obligation is worth
 *    meeting — their knobs are static default geometry. For `table` it is not:
 *    `--table-level` is stamped and `--table-thead-h` is MEASURED per element
 *    by the controller, so the zebra is `--stripe-bg` and the `--table-*`
 *    namespace stays out of the themeable surface.
 */
import { describe, it, expect } from "bun:test";
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";

const ROOT = join(import.meta.dir, "../..");
const REGISTRY = join(ROOT, "registry");
const read = (rel: string) => readFileSync(join(REGISTRY, rel), "utf8");

/** Comments blanked, newlines kept — a reported line number is the real one. */
const stripComments = (css: string) =>
  css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));

const MOTION = stripComments(read("tokens/motion.css"));
const ALIASES = stripComments(read("tokens/aliases.css"));

function layerStylesheets(layer: string): { rel: string; css: string }[] {
  const dir = join(REGISTRY, layer);
  return [...new Glob("**/*.css").scanSync(dir)]
    .sort()
    .map((f) => ({ rel: `${layer}/${f}`, css: readFileSync(join(dir, f), "utf8") }));
}
/** Everything a project installs and can render. `themes/` re-points; it does not consume. */
const REGISTRY_SHEETS = [
  ...layerStylesheets("primitives"),
  ...layerStylesheets("base"),
  ...layerStylesheets("recipes"),
  ...layerStylesheets("patterns"),
];

const declaration = (css: string, token: string) =>
  new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(css)?.[1].trim();

// ── 1. the families, with the values 1.1 documents ─────────────────────────

describe("motion · the personality tokens", () => {
  it("--motion-hover-lift defaults to none, the initial value of `translate`", () => {
    // NOT a length. `translateY(var(--lift))` with a `0px` default computes
    // `matrix(1,0,0,1,0,0)` where the untouched registry computed `none`, and
    // it would clobber any transform the component sets itself. A theme states
    // the lift as a translate pair: `0 -1px`.
    expect(declaration(MOTION, "--motion-hover-lift")).toBe("none");
  });

  it("--ease-spring is declared in :root as a cubic-bezier, the fallback shape", () => {
    const root = MOTION.slice(MOTION.indexOf(":root"), MOTION.indexOf("@supports"));
    expect(declaration(root, "--ease-spring")).toMatch(/^cubic-bezier\(/);
  });

  it("the linear() spring is declared only inside the @supports guard", () => {
    const guard = /@supports \(animation-timing-function: linear\(0, 1\)\) \{([\s\S]+?)\n\}/.exec(
      MOTION,
    );
    expect(guard, "motion.css must guard the spring with @supports").not.toBeNull();
    expect(guard![1]).toContain("--ease-spring:");
    expect(guard![1]).toContain("linear(");
    // And nowhere else: an unguarded `linear()` is a transition that silently
    // falls back to the INITIAL easing in Safari 16, not to the bezier.
    const outside = MOTION.replace(guard![0], "");
    expect(outside).not.toContain("linear(");
  });

  it("the spring joins a palette, not a set of consumers (like --ease-bounce)", () => {
    // Stated so the next reader does not "fix" the missing consumer: the easing
    // palette is re-pointed by a theme, exactly as --font-sans is.
    expect(MOTION).toContain("--ease-bounce:");
    const consumers = REGISTRY_SHEETS.filter(({ css }) =>
      /var\(--ease-(spring|bounce)\)/.test(css),
    );
    expect(consumers).toEqual([]);
  });
});

describe("decoration · the token contract", () => {
  const DEFAULTS: Record<string, string> = {
    "--link-decoration": "underline",
    "--link-underline-offset": "0.2em",
    "--link-thickness": "1px",
    "--divider-style": "solid",
    "--stripe-bg": "var(--color-bg-subtle)",
    "--selection-bg": "var(--color-primary-subtle)",
    "--selection-fg": "var(--color-fg)",
    // currentColor, NOT the accent: ::marker's initial colour, so a list is
    // unchanged until a theme says otherwise.
    "--marker-color": "currentColor",
  };

  for (const [token, value] of Object.entries(DEFAULTS)) {
    it(`${token} is ${value}`, () => {
      expect(declaration(ALIASES, token)).toBe(value);
    });
  }
});

describe("controls · the silhouette tokens", () => {
  const DEFAULTS: Record<string, string> = {
    "--input-fill": "var(--input-bg)",
    "--input-bg-filled": "var(--color-bg-subtle)",
    "--button-text-transform": "none",
    "--checkbox-radius": "var(--radius-sm)",
    "--switch-radius": "var(--radius-full)",
  };

  for (const [token, value] of Object.entries(DEFAULTS)) {
    it(`${token} is ${value}`, () => {
      expect(declaration(ALIASES, token)).toBe(value);
    });
  }

  it("--input-fill defaults THROUGH --input-bg, so a per-input override survives", () => {
    // The distinction the two names carry: --input-bg is the component
    // override a project has always had, --input-fill is the axis a theme
    // flips. Collapsing them would make a filled theme win over a project that
    // set --input-bg on one field.
    expect(declaration(ALIASES, "--input-fill")).toBe("var(--input-bg)");
    expect(declaration(ALIASES, "--input-bg")).toBe("var(--color-bg)");
  });
});

// ── 2. the consumers ───────────────────────────────────────────────────────

describe("motion · the hover lift reaches the two surfaces that rise", () => {
  for (const rel of ["primitives/button/button.css", "primitives/card/card.css"]) {
    it(`${rel} reads --motion-hover-lift through \`translate\` on :hover`, () => {
      const css = stripComments(read(rel));
      const rule = /:hover \{([^}]*)\}/g;
      const hovers = [...css.matchAll(rule)].map((m) => m[1]);
      expect(
        hovers.some((body) => /translate:\s*var\(--motion-hover-lift\)/.test(body)),
        `${rel} has no :hover rule reading --motion-hover-lift`,
      ).toBe(true);
      // `translate`, never `transform`: the two compose, so a component that
      // grows its own transform later does not lose the theme's lift.
      expect(css).not.toContain("transform: translateY(var(--motion-hover-lift)");
    });

    it(`${rel} transitions \`translate\`, so the lift is animated not snapped`, () => {
      expect(stripComments(read(rel))).toMatch(
        /transition:[^;]*translate var\(--duration-fast\) var\(--ease-default\)/,
      );
    });
  }
});

describe("decoration · the consumers", () => {
  it("link draws all three underline properties from the family", () => {
    const css = stripComments(read("primitives/link/link.css"));
    expect(css).toContain("text-decoration-line: var(--link-decoration)");
    expect(css).toContain("text-decoration-thickness: var(--link-thickness)");
    expect(css).toContain("text-underline-offset: var(--link-underline-offset)");
  });

  it("separator takes its STYLE slot from --divider-style", () => {
    const css = stripComments(read("primitives/separator/separator.css"));
    // Both orientations, and the two ::before/::after rules of the labelled form.
    const rules = [...css.matchAll(/border-(?:top|inline-start):\s*([^;]+);/g)]
      .map((m) => m[1])
      // `none` is how the labelled form REMOVES the rule it then redraws on
      // ::before/::after — an absent edge has no style to theme.
      .filter((v) => v !== "none");
    expect(rules.length).toBeGreaterThanOrEqual(3);
    for (const value of rules) {
      expect(value, `separator draws an edge without the divider style: ${value}`).toContain(
        "var(--divider-style)",
      );
    }
    // The data-style variants stay literal ON PURPOSE: `dashed` there is the
    // author asking for a dashed rule through the protocol, not the theme's
    // default divider — the same call GLYPH_RULES makes in shape-focus.
    expect(css).toContain('[data-ui="separator"][data-style="dashed"]');
    expect(css).toMatch(/border-top-style:\s*dashed/);
  });

  it("every striped-table rule reads --stripe-bg (all four, hover twins included)", () => {
    const css = stripComments(read("recipes/table/table.css"));
    const striped = [...css.matchAll(/\[data-variant="striped"\][^{]*\{([^}]*)\}/g)];
    expect(striped.length).toBe(4);
    for (const [, body] of striped) {
      expect(body).toContain("background: var(--stripe-bg)");
    }
  });

  it("reset.css owns ::selection, and spells out nothing", () => {
    const css = stripComments(read("base/reset.css"));
    const rule = /(?:^|\n)::selection \{([^}]*)\}/.exec(css);
    expect(rule, "reset.css must define ::selection").not.toBeNull();
    expect(rule![1]).toContain("background-color: var(--selection-bg)");
    expect(rule![1]).toContain("color: var(--selection-fg)");
    // Same discipline as the focus ring next to it: a literal here is a colour
    // no theme can reach.
    expect(rule![1]).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
  });

  it("prose reads the link family and the marker colour", () => {
    const css = stripComments(read("base/prose.css"));
    expect(css).toContain("text-decoration-line: var(--link-decoration)");
    expect(css).toContain("text-underline-offset: var(--link-underline-offset)");
    expect(css).toContain("color: var(--marker-color)");
    expect(css).toMatch(/li::marker \{/);
  });
});

describe("controls · the consumers", () => {
  it("all three text controls paint --input-fill", () => {
    expect(stripComments(read("primitives/input/input.css"))).toContain(
      "background: var(--input-fill)",
    );
    // textarea and select keep their own override in front of the shared axis.
    expect(stripComments(read("primitives/textarea/textarea.css"))).toContain(
      "background: var(--textarea-bg, var(--input-fill))",
    );
    expect(stripComments(read("primitives/select/select.css"))).toContain(
      "background: var(--select-bg, var(--input-fill))",
    );
  });

  it("button reads --button-text-transform and checkbox/switch their radii", () => {
    expect(stripComments(read("primitives/button/button.css"))).toContain(
      "text-transform: var(--button-text-transform)",
    );
    expect(stripComments(read("primitives/checkbox/checkbox.css"))).toContain(
      "border-radius: var(--checkbox-radius)",
    );
    const sw = stripComments(read("primitives/switch/switch.css"));
    // Track AND both thumbs: a squared theme squares the whole control.
    expect([...sw.matchAll(/border-radius: var\(--switch-radius\)/g)].length).toBe(3);
    expect(sw).not.toContain("border-radius: var(--radius-full)");
  });
});

// ── 3. the sweeps ──────────────────────────────────────────────────────────

describe("no component spells an easing of its own", () => {
  /**
   * Timing functions in a `transition` / `animation` value. `var(--…)`
   * expressions are blanked FIRST — `var(--ease-out)` is the token doing its
   * job, and a sweep that reads the name inside it reports all 242 of them.
   *
   * `linear` survives by NAME in two idioms, each named below and asserted
   * exhaustively so the exemption cannot quietly grow: a continuous rotation
   * (a spinner that eases stutters once per turn) and a zero-duration
   * `visibility` step (the standard way to defer a visibility flip to the end
   * of a slide). Neither is a personality a theme would state — the same call
   * `GLYPH_RULES` makes for the table's CSS-triangle carets.
   */
  // The two function forms carry no trailing word boundary — `\b` after the
  // closing paren never matches, which is how the first draft of this sweep
  // sailed past a planted `cubic-bezier(…)`. Only the keywords take one.
  const EASING =
    /cubic-bezier\([^)]*\)|steps\([^)]*\)|\b(?:ease-in-out|ease-out|ease-in|ease|linear)\b/;
  const blankVars = (value: string) => value.replace(/var\(--[^)]*\)/g, "");
  const ROTATION = /animation:\s*faqir-spin\s/;
  const VISIBILITY_STEP = /visibility 0s linear/;

  const offenders: string[] = [];
  const exempt: string[] = [];
  let inspected = 0;
  for (const { rel, css } of REGISTRY_SHEETS) {
    const src = stripComments(css);
    for (const m of src.matchAll(/(transition|animation)(?:-timing-function)?\s*:\s*([^;}]+)/g)) {
      inspected++;
      const line = src.slice(0, m.index).split("\n").length;
      const bare = blankVars(m[2]);
      if (!EASING.test(bare)) continue;
      if (ROTATION.test(m[0]) || VISIBILITY_STEP.test(bare)) {
        exempt.push(`${rel}:${line}`);
        continue;
      }
      offenders.push(`${rel}:${line} — ${m[2].trim().replace(/\s+/g, " ")}`);
    }
  }

  it("inspects real declarations (the sweep is not vacuous)", () => {
    expect(inspected).toBeGreaterThan(50);
  });

  it("every easing in the registry arrives through a token", () => {
    expect(offenders).toEqual([]);
  });

  it("the exempt sites are exactly the two rotations and the four visibility steps", () => {
    expect(exempt.sort()).toEqual([
      "patterns/dashboard-shell/dashboard-shell.css:65",
      "patterns/dashboard-shell/dashboard-shell.css:81",
      "primitives/button/button.css:137",
      "primitives/spinner/spinner.css:12",
      "recipes/sidebar/sidebar.css:54",
      "recipes/sidebar/sidebar.css:65",
    ]);
  });
});

describe("no component spells a link decoration of its own", () => {
  /**
   * `text-decoration*` VALUES that draw a line. `none` is how a component
   * REMOVES the UA underline (breadcrumb, auth-form, button all reset before
   * they decorate on hover) and `inherit` is reset.css handing `<a>` back to
   * its container — neither is a decoration this family owns.
   */
  const offenders: string[] = [];
  let inspected = 0;
  for (const { rel, css } of REGISTRY_SHEETS) {
    const src = stripComments(css);
    for (const m of src.matchAll(
      /(text-decoration(?:-line|-thickness)?|text-underline-offset)\s*:\s*([^;}]+)/g,
    )) {
      inspected++;
      const value = m[2].trim();
      if (value === "none" || value === "inherit" || value.includes("var(")) continue;
      // `line-through` is semantics — a struck-out price, a cancelled date —
      // not the theme's link style.
      if (value === "line-through") continue;
      offenders.push(`${rel}:${src.slice(0, m.index).split("\n").length} — ${m[1]}: ${value}`);
    }
  }

  it("inspects real declarations (the sweep is not vacuous)", () => {
    expect(inspected).toBeGreaterThan(8);
  });

  it("every underline in the registry arrives through --link-*", () => {
    expect(offenders).toEqual([]);
  });
});

// ── 4. rendered, not asserted from the source text ─────────────────────────

describe("the chains resolve to what they resolved to before", () => {
  /**
   * Mount the token layer plus one component sheet and read a real property
   * back. happy-dom resolves `var()` chains but implements no logical border
   * longhand and mis-splits a `var(--a, var(--b))` sitting in a shorthand's
   * width slot (1.1A-02/03), so every probe below reads a LONGHAND whose whole
   * value is one custom property.
   */
  function computed(sheets: string[], html: string, selector: string, property: string): string {
    const win = new Window();
    const doc = win.document;
    const style = doc.createElement("style");
    style.textContent = sheets.join("\n");
    doc.head.appendChild(style);
    doc.body.innerHTML = html;
    const el = doc.querySelector(selector)!;
    const value = win.getComputedStyle(el).getPropertyValue(property);
    win.close();
    return value;
  }

  // The whole token layer, in the cascade order `tokens/index.css` states —
  // read from that file rather than hand-listed, which is how this probe first
  // came to load a `radius.css` that has never existed.
  const TOKENS = [...read("tokens/index.css").matchAll(/@import\s+'\.\/([^']+)'/g)]
    .map((m) => read(`tokens/${m[1]}`))
    .join("\n");

  it("a button's text-transform resolves to none, as it did by inheritance", () => {
    expect(
      computed(
        [TOKENS, read("primitives/button/button.css")],
        '<button data-ui="button">Go</button>',
        '[data-ui="button"]',
        "text-transform",
      ),
    ).toBe("none");
  });

  it("the hover lift substitutes to `none` — a real property, not the token text", () => {
    // happy-dom matches no :hover and reads back no custom property, so the
    // probe is the SUBSTITUTION itself: a rule spelled exactly as button's and
    // card's hover rules are, read through `translate`. `none` here is what
    // makes those two rules compute what the untouched registry computed.
    expect(
      computed(
        [TOKENS, ".probe { translate: var(--motion-hover-lift); }"],
        '<div class="probe"></div>',
        ".probe",
        "translate",
      ),
    ).toBe("none");
  });

  it("a theme's lift reaches that same rule", () => {
    expect(
      computed(
        [TOKENS, ":root { --motion-hover-lift: 0 -1px; }", ".probe { translate: var(--motion-hover-lift); }"],
        '<div class="probe"></div>',
        ".probe",
        "translate",
      ),
    ).toBe("0 -1px");
  });

  it("a checkbox's radius still resolves through --radius-sm", () => {
    // Compared against the SAME chain read on a bare element rather than
    // against the token's source text: happy-dom resolves `0.25rem` to `4px`,
    // so a string comparison with the declaration would fail on the unit.
    const direct = computed(
      [TOKENS, ".probe { border-radius: var(--radius-sm); }"],
      '<div class="probe"></div>',
      ".probe",
      "border-radius",
    );
    expect(direct).not.toBe("");
    expect(
      computed(
        [TOKENS, read("primitives/checkbox/checkbox.css")],
        '<input type="checkbox" data-ui="checkbox">',
        '[data-ui="checkbox"]',
        "border-radius",
      ),
    ).toBe(direct);
  });

  it("an input's fill still resolves to --color-bg", () => {
    const bg = computed(
      [TOKENS, read("primitives/input/input.css")],
      '<input data-ui="input">',
      '[data-ui="input"]',
      "background-color",
    );
    const direct = computed(
      [TOKENS, ".probe { background-color: var(--color-bg); }"],
      '<div class="probe"></div>',
      ".probe",
      "background-color",
    );
    expect(bg).toBe(direct);
  });

  it("an underline theme reaches every text control through one declaration", () => {
    // The converse proof: the axis is real, not decorative. A theme setting
    // --input-fill fills input, textarea and select alike.
    const themed = `:root { --input-fill: #eef; }`;
    for (const [sheet, html, selector] of [
      ["primitives/input/input.css", '<input data-ui="input">', '[data-ui="input"]'],
      ["primitives/textarea/textarea.css", '<textarea data-ui="textarea"></textarea>', '[data-ui="textarea"]'],
      ["primitives/select/select.css", '<select data-ui="select"></select>', '[data-ui="select"]'],
    ] as const) {
      expect(
        computed([TOKENS, read(sheet), themed], html, selector, "background-color"),
        `${selector} did not follow --input-fill`,
      ).toBe("#eef");
    }
  });

  it("a squared theme squares the switch's track and its thumb together", () => {
    const themed = `:root { --switch-radius: 0px; }`;
    expect(
      computed(
        [TOKENS, read("primitives/switch/switch.css"), themed],
        '<input type="checkbox" data-ui="switch">',
        '[data-ui="switch"]',
        "border-radius",
      ),
    ).toBe("0px");
  });
});
