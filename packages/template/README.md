# `@faqir-ui/template`

A small, zero-dependency template language for rendering Faqir pages,
primitives and recipes on the server. Indentation-based like Pug; its component
calls are checked against Faqir's manifests; its output is canonical registry
markup that passes `faqir audit` and that faqir-core's controllers take over in
the browser unchanged. The full language — grammar, every diagnostic code, the
AST — is specified in `template.md`, which ships in this package
(`node_modules/@faqir-ui/template/template.md`; in the repository it is
[`docs/template.md`](https://github.com/Narcis13/faqir-ui/blob/main/docs/template.md)).

```js
import { compile } from "@faqir-ui/template/compile";
import { render } from "@faqir-ui/template";
import { components } from "@faqir-ui/template/registry";
import { createFileLoader } from "@faqir-ui/template/node";

const { ast, diagnostics } = compile(source, {
  file: "pages/welcome.faqir",
  loader: createFileLoader("./templates"),
  components,
});
if (diagnostics.length) throw new Error(diagnostics.map((d) => `${d.file}:${d.line}:${d.col} ${d.code} ${d.message}`).join("\n"));
const html = render(ast, { page });
```

```
+callout(variant="warning")
  @content
    p You need a running kernel and an admin token.
each step, i in page.steps
  +card
    @header
      h3 {{ i + 1 }}. {{ step.title }}
    @body
      p {{ step.text }}
else
  p Nothing here yet.
div(l-data=json(page.state))
  span(l-text="count")
```

- **Entries.** `.` is the runtime (`render`, ≤ 8 KB minified+gzip);
  `/compile` is the compiler, the static analysis a host runs once when a
  template is saved; `/registry` is the component table of every registry
  primitive and recipe; `/node` is a file loader confined to one directory.
  Only `/node` touches `node:`; the rest runs in Node ≥ 18, Bun and a browser.
- **No code from data.** Expressions are paths, literals, operators and calls to
  helpers the host registers. Property reads take own data properties only.
- **Escaping by context.** Text, attributes, URL attributes (scheme
  allow-list), and the `l-data` JSON island — the one way server data reaches
  faqir-core. Data in a faqir-core attribute, `<script>`, `<style>` or an `on*`
  attribute is a compile error.
- **Plain-JSON AST.** `render(JSON.parse(JSON.stringify(ast)), data)` gives the
  same bytes, so a host can store compiled templates as data.
- **Bounded.** Include depth, nesting, output size and render steps are limited,
  so a hostile template cannot run away.
- **Per-page CSS.** `ast.uses` lists every component the output draws, so a
  host can cut `@faqir-ui/core`'s theme bundle down to what a page needs with
  `subsetBundle` from `@faqir-ui/core/subset`, without rendering first.

```
p Run #[code npm ci], then continue.
+tabs
  each t in page.tabs
    @trigger {{ t.label }}
    @panel
      p {{ t.body }}
+card(title="Watch every session" heading="h2")
  @body
    p Sessions stream live.
```

Inline elements go in text as `#[tag text]`; a fill written more than once, or
inside `each`, repeats its part (tabs, accordion items, timeline items,
breadcrumb links), with ids numbered per copy; optional parts left unfilled are
not rendered; a partial can declare `params href label current=false`.

Projects that take Faqir as committed files rather than npm packages install the
engine with `faqir template`, which copies these files into
`<output_dir>/template/` and writes `table.js`, the project's own component
table built from its installed manifests.
