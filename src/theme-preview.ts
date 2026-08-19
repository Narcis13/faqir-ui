/**
 * The standard theme-preview harness (task 1.0R-10).
 *
 * Twelve themes ship a `<name>.theme.json`; only seven shipped the
 * `<name>.preview.html` every one of them declared. Rather than clone the
 * gallery a sixth and seventh time by hand — the five that were missing would
 * have been ~1,350 lines of copy that drifts silently — the gallery is rendered
 * from one function here and written to disk by `bun run gen:theme-previews`,
 * exactly as `gen:theme-manifests` writes the manifests beside it.
 *
 * Scope, stated so the split is not mistaken for an oversight: five themes are
 * GENERATED from `GALLERY_PREVIEWS` below; the other seven are BESPOKE files
 * this module deliberately does not touch, because each one earns its hand
 * authoring — `contrast` paints every focus ring at once, `document-serif`
 * is a whole signed agreement rather than a component gallery, `glass` needs a
 * gradient backdrop to have anything to be translucent against. `BESPOKE_PREVIEWS`
 * names them so a theme added later must choose a side rather than silently
 * ship no preview at all.
 *
 * These harnesses are development artefacts: they ship to no project, and the
 * registry self-audit's document rules deliberately skip them (their DOM is
 * built at runtime from a `<template>`). What IS gated is that every stylesheet
 * they link resolves on disk, and that each generated file still equals a fresh
 * render — see `tests/themes/theme-previews.test.ts`.
 */

/** A theme whose preview is the standard component gallery. */
export interface ThemePreviewSpec {
  /** Theme name — also the stylesheet (`<name>.css`) and the file (`<name>.preview.html`). */
  name: string;
  /** One line under the theme's own title, in the theme's own voice. */
  tagline: string;
  /** Two letters for the avatar, so each gallery is identifiable at a glance. */
  initials: string;
  /**
   * `"both"` renders light and dark side by side, each in its own iframe of the
   * same file (a scoped wrapper would not re-theme alias tokens, which resolve
   * against `:root`). A single-scheme theme renders the one panel it has.
   */
  scheme: "both" | "light" | "dark";
  /** Optional flourish under the tagline — the one place a preview shows a theme's signature. */
  signature?: string;
  /** Extra token stylesheets this theme needs, as registry-relative paths. */
  extraTokens?: string[];
  /** Extra scaffolding CSS for the harness itself (never component CSS). */
  bodyCss?: string;
  /**
   * Concatenated CSS to inline instead of linking. A registry preview links its
   * siblings; a preview `faqir theme generate` drops into a bare `themes/`
   * directory has no siblings to link, so it carries its stylesheets with it.
   */
  inlineCss?: string;
}

/** Token stylesheets every preview loads, in `registry/tokens/index.css` order. */
const TOKEN_SHEETS = [
  "palette",
  "spacing",
  "typography",
  "effects",
  "motion",
  "semantic",
  "aliases",
];

/** The primitives the gallery below actually renders. */
const PRIMITIVES = [
  "button", "input", "textarea", "select", "checkbox", "radio", "switch",
  "label", "badge", "card", "separator", "avatar", "spinner", "kbd", "stack",
  "grid", "surface", "progress", "empty-state", "text", "callout",
  "field-group", "stat",
];

/** The recipes the gallery below actually renders. */
const RECIPES = ["tabs", "table"];

/**
 * Every stylesheet the gallery needs, as registry-relative paths in cascade
 * order. Linking and inlining read this one list, so a preview can never link
 * one set and inline another.
 */
export function previewStylesheets(spec: ThemePreviewSpec): string[] {
  return [
    ...TOKEN_SHEETS.map((token) => `tokens/${token}.css`),
    ...(spec.extraTokens ?? []),
    "base/reset.css",
    `themes/${spec.name}.css`,
    ...PRIMITIVES.map((name) => `primitives/${name}/${name}.css`),
    ...RECIPES.map((name) => `recipes/${name}/${name}.css`),
  ];
}

/** Render the `<head>` stylesheet block: links for a registry preview, one inline `<style>` otherwise. */
function headStyles(spec: ThemePreviewSpec): string {
  if (spec.inlineCss !== undefined) {
    return [
      "  <!-- Tokens, reset, theme and every component this gallery renders, inlined:",
      "       this file is written beside a generated theme with no registry to link. -->",
      "  <style>",
      spec.inlineCss.trimEnd(),
      "  </style>",
    ].join("\n");
  }
  const lines: string[] = [];
  const rel = (path: string) => `  <link rel="stylesheet" href="../${path}">`;
  lines.push("  <!-- Tokens -->");
  for (const token of TOKEN_SHEETS) lines.push(rel(`tokens/${token}.css`));
  for (const extra of spec.extraTokens ?? []) lines.push(rel(extra));
  lines.push("");
  lines.push("  <!-- Base -->");
  lines.push(rel("base/reset.css"));
  lines.push("");
  lines.push("  <!-- Theme under preview -->");
  lines.push(`  <link rel="stylesheet" href="${spec.name}.css">`);
  lines.push("");
  lines.push("  <!-- Primitives -->");
  for (const name of PRIMITIVES) lines.push(rel(`primitives/${name}/${name}.css`));
  lines.push("");
  lines.push("  <!-- Recipes -->");
  for (const name of RECIPES) lines.push(rel(`recipes/${name}/${name}.css`));
  return lines.join("\n");
}

/** The gallery body — identical for every theme, so the theme is the only variable. */
function gallery(spec: ThemePreviewSpec): string {
  const signature = spec.signature ? `\n        ${spec.signature}` : "";
  return `      <!-- Theme signature -->
      <div data-ui="stack" data-gap="2">
        <h1 data-ui="heading" data-size="2">${spec.name}</h1>
        <p data-ui="text" data-variant="muted">${spec.tagline}</p>${signature}
      </div>

      <!-- Buttons -->
      <div data-ui="stack" data-gap="3">
        <h2 data-ui="heading" data-size="4">Buttons</h2>
        <div data-ui="stack" data-variant="horizontal" data-gap="2" data-align="center" data-wrap>
          <button data-ui="button" data-variant="primary">Primary</button>
          <button data-ui="button" data-variant="secondary">Secondary</button>
          <button data-ui="button" data-variant="destructive">Destructive</button>
          <button data-ui="button" data-variant="ghost">Ghost</button>
          <button data-ui="button" data-variant="outline">Outline</button>
          <button data-ui="button" data-variant="link">Link</button>
        </div>
        <div data-ui="stack" data-variant="horizontal" data-gap="2" data-align="center" data-wrap>
          <button data-ui="button" data-variant="primary" data-size="sm">Small</button>
          <button data-ui="button" data-variant="primary" data-size="md">Medium</button>
          <button data-ui="button" data-variant="primary" data-size="lg">Large</button>
          <button data-ui="button" data-variant="primary" disabled>Disabled</button>
          <button data-ui="button" data-variant="primary" data-state="loading">Loading</button>
        </div>
      </div>

      <div data-ui="separator"></div>

      <!-- Form controls -->
      <div data-ui="stack" data-gap="3">
        <h2 data-ui="heading" data-size="4">Form controls</h2>
        <div data-ui="grid" data-cols="2" data-gap="4">
          <div data-ui="field-group">
            <label data-part="label">Email address</label>
            <div data-part="input"><input data-ui="input" type="email" placeholder="you@example.com"></div>
            <p data-part="description">We'll never share your email.</p>
          </div>
          <div data-ui="field-group" data-invalid>
            <label data-part="label">Password</label>
            <div data-part="input"><input data-ui="input" type="password" value="123" aria-invalid="true"></div>
            <p data-part="error">Password must be at least 8 characters.</p>
          </div>
        </div>
        <div data-ui="grid" data-cols="2" data-gap="4">
          <select data-ui="select"><option>Production</option><option>Staging</option></select>
          <textarea data-ui="textarea" rows="2" placeholder="Leave a comment…"></textarea>
        </div>
        <div data-ui="stack" data-variant="horizontal" data-gap="5" data-align="center" data-wrap>
          <label data-ui="checkbox-label"><input data-ui="checkbox" type="checkbox" checked> Remember me</label>
          <div data-ui="radio-group" data-variant="horizontal">
            <label data-ui="radio-label"><input data-ui="radio" type="radio" name="plan" checked> Monthly</label>
            <label data-ui="radio-label"><input data-ui="radio" type="radio" name="plan"> Yearly</label>
          </div>
          <label data-ui="switch-label"><input data-ui="switch" type="checkbox" role="switch" checked> Notifications</label>
        </div>
      </div>

      <div data-ui="separator"></div>

      <!-- Badges + misc -->
      <div data-ui="stack" data-gap="3">
        <h2 data-ui="heading" data-size="4">Badges &amp; misc</h2>
        <div data-ui="stack" data-variant="horizontal" data-gap="2" data-align="center" data-wrap>
          <span data-ui="badge">Default</span>
          <span data-ui="badge" data-variant="primary">Primary</span>
          <span data-ui="badge" data-variant="secondary">Secondary</span>
          <span data-ui="badge" data-variant="destructive">Destructive</span>
          <span data-ui="badge" data-variant="success">Success</span>
          <span data-ui="badge" data-variant="warning">Warning</span>
        </div>
        <div data-ui="stack" data-variant="horizontal" data-gap="3" data-align="center" data-wrap>
          <div data-ui="avatar"><span data-part="fallback">${spec.initials}</span></div>
          <div data-ui="spinner"></div>
          <span><kbd data-ui="kbd">⌘</kbd> <kbd data-ui="kbd">K</kbd></span>
          <div data-ui="progress" role="progressbar" aria-valuenow="64" aria-valuemin="0" aria-valuemax="100" style="flex: 1; min-width: 10rem;">
            <div data-part="track"><div data-part="fill" style="width: 64%;"></div></div>
          </div>
        </div>
      </div>

      <div data-ui="separator"></div>

      <!-- Feedback callouts -->
      <div data-ui="stack" data-gap="3">
        <h2 data-ui="heading" data-size="4">Feedback</h2>
        <div data-ui="grid" data-cols="2" data-gap="3">
          <div data-ui="callout" data-variant="info" role="note">
            <span data-part="icon">&#x2139;</span>
            <div data-part="content"><strong data-part="title">Information</strong><p>Deploys are paused during maintenance.</p></div>
          </div>
          <div data-ui="callout" data-variant="success" role="note">
            <span data-part="icon">&#x2713;</span>
            <div data-part="content"><strong data-part="title">Success</strong><p>Your workspace has been created.</p></div>
          </div>
          <div data-ui="callout" data-variant="warning" role="note">
            <span data-part="icon">&#x26A0;</span>
            <div data-part="content"><strong data-part="title">Warning</strong><p>Your trial ends in 3 days.</p></div>
          </div>
          <div data-ui="callout" data-variant="destructive" role="alert">
            <span data-part="icon">&#x2717;</span>
            <div data-part="content"><strong data-part="title">Error</strong><p>Payment failed — card declined.</p></div>
          </div>
        </div>
      </div>

      <div data-ui="separator"></div>

      <!-- Cards + stats -->
      <div data-ui="stack" data-gap="3">
        <h2 data-ui="heading" data-size="4">Cards &amp; stats</h2>
        <div data-ui="grid" data-cols="3" data-gap="4">
          <div data-ui="stat" data-trend="up"><span data-part="value">12,580</span><span data-part="label">Monthly revenue</span><span data-part="change">+15.3%</span></div>
          <div data-ui="stat" data-trend="down"><span data-part="value">7</span><span data-part="label">Open incidents</span><span data-part="change">-8%</span></div>
          <div data-ui="stat" data-trend="neutral"><span data-part="value">24</span><span data-part="label">Active seats</span><span data-part="change">No change</span></div>
        </div>
        <div data-ui="card">
          <div data-part="header"><h3 data-part="title">Project settings</h3><p data-part="description">Manage how this project builds and deploys.</p></div>
          <div data-part="body"><p>Card body content styled entirely by theme tokens.</p></div>
          <div data-part="footer">
            <button data-ui="button" data-variant="primary" data-size="sm">Save</button>
            <button data-ui="button" data-variant="ghost" data-size="sm">Cancel</button>
          </div>
        </div>
      </div>

      <div data-ui="separator"></div>

      <!-- Tabs + table -->
      <div data-ui="stack" data-gap="3">
        <h2 data-ui="heading" data-size="4">Tabs &amp; table</h2>
        <div data-ui="tabs">
          <div data-part="list" role="tablist">
            <button data-part="trigger" role="tab" aria-selected="true">Members</button>
            <button data-part="trigger" role="tab" aria-selected="false" tabindex="-1">Invitations</button>
            <button data-part="trigger" role="tab" aria-selected="false" tabindex="-1">Roles</button>
          </div>
          <div data-part="panel" role="tabpanel">
            <div data-ui="table" data-variant="striped" data-size="sm">
              <table data-part="table">
                <thead data-part="thead">
                  <tr data-part="tr">
                    <th data-part="th" scope="col">Name</th>
                    <th data-part="th" scope="col">Role</th>
                    <th data-part="th" scope="col">Status</th>
                  </tr>
                </thead>
                <tbody data-part="tbody">
                  <tr data-part="tr"><td data-part="td">Alice Johnson</td><td data-part="td">Admin</td><td data-part="td"><span data-ui="badge" data-variant="success">Active</span></td></tr>
                  <tr data-part="tr"><td data-part="td">Bogdan Pop</td><td data-part="td">Editor</td><td data-part="td"><span data-ui="badge" data-variant="warning">Pending</span></td></tr>
                  <tr data-part="tr"><td data-part="td">Carmen Ionescu</td><td data-part="td">Viewer</td><td data-part="td"><span data-ui="badge">Invited</span></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div data-ui="separator"></div>

      <!-- Empty state -->
      <div data-ui="empty-state" data-size="sm">
        <span data-part="icon">&#x1F4E6;</span>
        <h3 data-part="title">No deployments yet</h3>
        <p data-part="description">Push to your default branch to create the first one.</p>
        <div data-part="actions"><button data-ui="button" data-variant="primary" data-size="sm">Read the docs</button></div>
      </div>`;
}

/**
 * The runtime that mounts the gallery. A light-only theme gets one panel and no
 * iframes: offering a dark half for a theme whose manifest says `dark_mode:
 * "none"` would show the reader a scheme the theme does not have.
 */
function mountScript(spec: ThemePreviewSpec): string {
  if (spec.scheme !== "both") {
    return `    // This theme ships one scheme (\`scheme: "${spec.scheme}"\` in its manifest), so
    // there is one panel and no split to offer: a half showing a scheme the
    // theme does not have would be a preview of the base tokens, not of it.
    document.addEventListener("DOMContentLoaded", () => {
      const panel = document.createElement("main");
      panel.className = "scheme-panel";
      panel.appendChild(document.getElementById("gallery").content.cloneNode(true));
      document.body.appendChild(panel);
    });`;
  }
  return `    // ?scheme=light|dark → render the gallery under that scheme (data-theme on
    // the document root, exactly as a real project applies it). No param →
    // both schemes side by side, each in its own iframe of this same file.
    const scheme = new URLSearchParams(location.search).get("scheme");
    if (scheme === "light" || scheme === "dark") {
      document.documentElement.setAttribute("data-theme", scheme);
      document.addEventListener("DOMContentLoaded", () => {
        const panel = document.createElement("main");
        panel.className = "scheme-panel";
        panel.innerHTML = \`<div class="scheme-tag"><span data-ui="badge" data-variant="secondary">\${scheme}</span></div>\`;
        panel.appendChild(document.getElementById("gallery").content.cloneNode(true));
        document.body.appendChild(panel);
      });
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        const split = document.createElement("div");
        split.className = "schemes";
        for (const s of ["light", "dark"]) {
          const frame = document.createElement("iframe");
          frame.src = \`\${location.pathname}?scheme=\${s}\`;
          frame.title = \`\${s} scheme\`;
          split.appendChild(frame);
        }
        document.body.appendChild(split);
      });
    }`;
}

/** Render the complete `<name>.preview.html` harness for one theme. */
export function renderThemePreview(spec: ThemePreviewSpec): string {
  const bodyCss = spec.bodyCss ?? "body { margin: 0; background: var(--color-bg); color: var(--color-fg); }";
  const split = spec.scheme === "both"
    ? `    /* Split view (no ?scheme= param): each scheme renders in its own iframe so
       data-theme sits on that document's root — alias tokens (--card-bg etc.)
       resolve against :root, so a scoped wrapper div would not re-theme them. */
    .schemes { display: grid; grid-template-columns: 1fr 1fr; height: 100vh; }
    @media (max-width: 1100px) { .schemes { grid-template-columns: 1fr; grid-auto-rows: 100vh; height: auto; } }
    .schemes iframe { border: 0; inline-size: 100%; block-size: 100%; }
`
    : "";
  return `<!DOCTYPE html>
<html lang="en" data-theme="${spec.scheme === "dark" ? "dark" : "light"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Faqir UI — ${spec.name} theme preview</title>

${headStyles(spec)}

  <style>
    /* Preview scaffolding only — everything inside the panel is pure Faqir. */
    ${bodyCss}
${split}    .scheme-panel { padding: var(--space-8) var(--space-6); max-inline-size: 52rem; margin-inline: auto; }
    .scheme-tag { position: sticky; top: var(--space-3); z-index: var(--z-sticky); }
  </style>
</head>
<body>

  <!-- GENERATED by faqir · regenerate with \`bun run gen:theme-previews\` · do not edit by hand -->
  <!-- The gallery is authored once and cloned into each scheme panel below. -->
  <template id="gallery">
    <div data-ui="stack" data-gap="8">

${gallery(spec)}

    </div>
  </template>

  <script>
${mountScript(spec)}
  </script>
</body>
</html>
`;
}

/**
 * The five themes whose preview this module renders. Each entry is the editorial
 * half — the tagline, the two initials, the optional signature flourish — that a
 * generator cannot derive; everything else comes from `renderThemePreview`.
 */
export const GALLERY_PREVIEWS: ThemePreviewSpec[] = [
  {
    name: "default",
    tagline: "The neutral baseline every other theme is a departure from — light and dark.",
    initials: "DE",
    scheme: "both",
  },
  {
    name: "midnight",
    tagline: "Deep navy and purple with vibrant cyan accents — dark-first and technical.",
    initials: "MI",
    scheme: "both",
    signature: `<div style="height: var(--space-2); border-radius: var(--radius-full); background: var(--color-primary);" aria-hidden="true"></div>`,
  },
  {
    name: "brutalist",
    tagline: "Pure black on white — thick borders, no shadows, zero rounding.",
    initials: "BR",
    scheme: "both",
    signature: `<div style="height: var(--space-2); background: var(--color-primary); border-block-end: var(--space-0h) solid var(--color-fg);" aria-hidden="true"></div>`,
  },
  {
    name: "paper",
    tagline: "Warm cream surfaces, dark brown text, earthy accents — print-inspired.",
    initials: "PA",
    scheme: "both",
  },
  {
    name: "document",
    tagline: "Ink-efficient business documents — light only, sized for the printed page.",
    initials: "DO",
    scheme: "light",
    extraTokens: ["tokens/document.css", "tokens/doc-aliases.css"],
    bodyCss: "body { margin: 0; background: var(--color-bg-muted); color: var(--color-fg); }",
  },
];

/**
 * The seven themes whose preview is hand-authored and must not be regenerated.
 * Listed so that `registry/themes/*.css` minus generated minus bespoke is empty:
 * a new theme has to declare which kind of preview it ships.
 */
export const BESPOKE_PREVIEWS = [
  "aurora",
  "contrast",
  "document-serif",
  "glass",
  "slate",
  "soft",
  "terminal",
] as const;
