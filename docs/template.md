# `@faqir-ui/template` — the Faqir template language

A small, indentation-based template language for rendering Faqir pages,
primitives and recipes on the server. Its grammar is Pug-like; its vocabulary is
Faqir's manifests; its rules are those of a host that renders data it did not
write. The engine is plain JavaScript with no dependencies: the core entry
imports nothing outside its own directory, touches no host global, and runs
unchanged in Node ≥ 18, Bun and a browser.

The markup it writes is canonical registry markup — the same attributes, ARIA
wiring and `hidden` guards the manifests' `templates.html` ship — so it passes
`faqir audit`, and faqir-core's controllers take it over in the browser without
knowing a server drew it.

Contents: [1 Position](#1-position) · [2 A first template](#2-a-first-template) ·
[3 Source text](#3-source-text) · [4 Grammar](#4-grammar) ·
[5 Elements](#5-elements-and-attributes) · [6 Text](#6-text-and-holes) ·
[7 Comments](#7-comments) · [8 Expressions](#8-expressions) ·
[9 Control flow](#9-control-flow) · [10 Composition](#10-composition) ·
[11 Components](#11-components) · [12 Output](#12-output-and-escaping) ·
[13 Limits](#13-limits) · [14 Diagnostics](#14-diagnostics) · [15 API](#15-api) ·
[16 AST](#16-ast) · [17 Relation to `@faqir-ui/render`](#17-relation-to-faqir-uirender) ·
[18 Decisions](#18-decisions) · [19 Examples](#19-examples)

---

## 1. Position

Three rules shape everything below.

1. **Manifests are the grammar.** A component call names a manifest. Its
   arguments are that manifest's variants, states and props; its children fill
   the manifest's slots. A wrong value is a compile error that names the values
   the manifest allows (§11).
2. **No code runs from data, ever.** There is no `eval`, no `new Function`, no
   embedded JavaScript line. Expressions are paths, literals, operators and calls
   to helpers the host registers as plain functions (§8). Property access reads
   own data properties only and refuses `__proto__`, `prototype` and
   `constructor`.
3. **Untrusted data is drawn, never executed.** Every value is escaped for the
   context it lands in (§12). Data never reaches a faqir-core expression, a
   `<script>`, a `<style>` or an `on*` attribute; it reaches the client through
   one construct, the `l-data` island (§11.7). Raw HTML is one explicit,
   greppable keyword that a compile option refuses (§12.5).

A template can be untrusted too: compiling and rendering a hostile template
cannot run code, read outside the loader it is given, recurse without bound, or
produce unbounded output (§13).

## 2. A first template

```
layout "layouts/docs.faqir"

block title
  | {{ page.title }} — indirect

block content
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

`l-text="count"` is a client expression written by the template's author and
passes through untouched. `l-text=page.count` is a compile error
(`directive-interpolation`): it would put server data into the client
evaluator.

## 3. Source text

A template is UTF-8 text, conventionally in a file ending `.faqir`. Line ends
are `\n` or `\r\n`.

- **Lines.** The language is line-based: every construct starts on its own line.
  Blank lines (only spaces) are ignored, except inside a `raw` or comment block
  (§7, §12.5), where they are kept.
- **Indentation** is spaces only. A tab anywhere in a line's indentation is
  `tab-indent`. The first indented line of a file sets its *step* (any number of
  spaces). A child line is indented exactly one step deeper than its parent; a
  line may dedent to any enclosing level. Anything else — a half step, a jump of
  two steps — is `bad-indent`.
- **Nesting** is at most 64 levels in one file (`too-deep`).

## 4. Grammar

EBNF over one logical line, after its indentation has been measured. `text` is
§6's interpolated text; `expr` is §8's expression; `attrs` is §5's attribute list.

```ebnf
line       = statement | element | call | fill | piped | comment ;

statement  = "doctype" "html"
           | "layout" string
           | "block" name
           | "include" string [ "(" attrs ")" ] [ "depth=" digit { digit } ]   (* 1–16, §10.3 *)
           | "params" attrs                  (* no parentheses, §10.3 *)
           | "if" expr | "else" "if" expr | "else"
           | "each" ident [ "," ident ] "in" expr
           | "raw" [ expr ] ;

element    = tag [ "#" idname ] [ "(" attrs ")" ] [ " " text ] ;
call       = "+" name [ "(" attrs ")" ] [ " " text ] ;
fill       = "@" name [ "(" attrs ")" ] [ " " text ] ;
piped      = "|" [ " " text ] ;
comment    = "//-" { any } | "//" { any } ;

attrs      = { attr | "," } ;               (* commas are optional separators *)
attr       = attrname [ "=" ( string | expr ) ] ;

tag        = letter { letter | digit | "-" } ;
name       = lower { lower | digit | "-" } ;
ident      = ( letter | "_" ) { letter | digit | "_" } ;
idname     = ( letter | "_" ) { letter | digit | "_" | "-" } ;
attrname   = ( letter | "_" | ":" | "@" ) { letter | digit | "_" | ":" | "@" | "." | "-" } ;
string     = '"' { char } '"' | "'" { char } "'" ;
```

`text` may hold inline elements, `#[tag(attrs) text]` (§6.1).

A line's first word decides what it is: a keyword above makes a statement, `+`
a call, `@` a fill, `|` piped text, `//` a comment, a letter an element. A line
that is none of these — one starting with `<`, say — is `bad-line`; raw HTML is
written with `raw` (§12.5).

Placement rules, each `misplaced` when broken: `doctype` only as the first line
of a file; `layout` only as the first statement of a file, and then the file
holds nothing but top-level `block`s; a `block` in a page with a layout only at
the top level; `params` only as the first statement of a partial; `@fill` lines
only directly under a call or a fill, or in an `if`/`else`/`each` there (§11.4);
`else` only right after an `if`/`else if` branch or an `each` (`orphan-else`
otherwise).

## 5. Elements and attributes

```
a#home(href="/" aria-current="page") Home
img(src=user.avatar alt="")
button(type="button" disabled=form.locked) Save
```

- **Tag** — an HTML, SVG or MathML element name (current or obsolete, in any
  case), or a custom element name, which has a hyphen. Any other name is
  `unknown-tag`: it is almost always a line of prose that lost its `|`, and the
  message says so — `p` over a line `Open the app now` would otherwise render
  `<p><Open>the app now</Open></p>`. Void elements (`area base br col embed hr
  img input link meta param source track wbr`) take no children
  (`void-children`) and render without a closing tag.
- **`#id` shorthand** — sets `id`. It is the only shorthand: identity goes
  through the five protocol attributes and `id`, and `class` is an ordinary
  attribute written in parentheses.
- **Attributes** are written in parentheses, separated by spaces (a comma is
  allowed). An attribute appears once (`duplicate-attr`).
  - `name` alone — a bare (boolean) attribute.
  - `name="literal"` — a quoted literal; it may hold holes (§6).
  - `name=expr` — an expression (§8). `true` writes the bare attribute; `false`
    omits it; a string or number is the value; anything else, `null` included,
    is the render error `not-text`.
- **Directives pass through.** faqir-core attributes — `l-*`, `:prop`, `@event`,
  with any modifiers such as `.prevent` or `:click` — are written verbatim and
  never evaluated by the engine. Their values must be quoted literals without
  holes (`directive-interpolation`); the one exception is the `l-data` island
  (§11.7).
- **Attribute names** are compared lowercased, as the HTML parser reads them:
  `L-TEXT` is a faqir-core attribute and `ONCLICK` an `on*` one. A name is
  letters, digits and `_ : @ . -` only, so no name can carry another inside it.
- **`on*` attributes are refused** (`event-attr`), literal or not: faqir-core
  writes events as `@event`, and an inline handler would need `'unsafe-inline'`.
- **Plain elements carrying `data-ui`** are allowed and are not checked as
  component calls.
- **`doctype html`** writes `<!doctype html>`; any other doctype is
  `bad-doctype`.

## 6. Text and holes

```
p Hello, {{ user.name }}!
p
  | First line
  | {{ count }} items
```

- **Inline text** follows a tag, call or fill after one space. **Piped text** is
  a `|` line.
- **Holes** are `{{ expr }}`. A hole ends at the `}}` that follows a complete
  expression, so a string literal inside a hole may contain `}}`. A `{{` with no
  closing `}}` and an empty hole are `bad-hole`.
- **Escapes.** `\{{` writes a literal `{{`, and in element text `\#[` writes a
  literal `#[` (§6.1). A backslash anywhere else is literal. Faqir-core writes
  no `{{`, and manifest templates use single `{placeholder}` braces, so neither
  collides with holes.
- **Literal text is escaped like data**: `&`, `<` and `>` become entities. Write
  the character, not an entity: an entity in literal text or a literal
  attribute value (`&lt;id&gt;`, `&mdash;`, `&#169;`) would render as typed, so
  it is `literal-entity`, whose message names the character to write. To show an
  entity's text on purpose, put it in a hole: `{{ "&lt;" }}`. Text inside
  `script` and `style` is not checked.
- A hole's value renders if it is a string, a finite number or a boolean.
  Anything else — `null`, a missing value, an object, an array — is the render
  error `not-text` or `missing`, never silent empty text. Ask for an optional
  value with `??` (§8.3).

### 6.1 Inline elements

```
p Run #[code npm ci], then #[a(href=page.next) read on].
p
  | Pass #[code --resume #[em id]] to continue.
```

Inline text and piped text may hold elements written `#[tag#id(attrs) text]`:
the head of an element line (§5), then nothing or a space and the element's own
text — which may hold holes and further inline elements — up to the `]` that
closes it. Brackets inside it balance, so `#[code a[0]]` is one element.

A line with inline elements becomes a run of Text and Element nodes marked
`glue`, and a glued node renders on the line before it: the output above is
`<p>Run <code>npm ci</code>, then <a href="…">read on</a>.</p>`, with no space
before the comma. Everything an element line is checked for applies to an
inline element, `unknown-tag` and `event-attr` included. Inside `pre`,
`textarea`, `script` and `style`, `#[` is literal text (code in a `pre` is
written as given); elsewhere `\#[` writes it.

## 7. Comments

- `//- text` is a template comment: it and the lines indented under it are not
  emitted.
- `// text` is an HTML comment: the text after `//`, and the lines indented
  under it, are emitted as `<!-- … -->`, block lines verbatim after the block's
  indentation. A comment is literal: a hole, `--`, or a leading `>` in it is
  `bad-comment`, since any of them could end the comment early or turn its text
  into markup.

## 8. Expressions

Expressions are parsed by the engine's own parser into a plain-data tree (§16).
They have no assignment, no function literals, no member calls and no access
to any global.

### 8.1 Grammar

```ebnf
expr     = cond ;
cond     = default [ "?" expr ":" expr ] ;
default  = or { "??" or } ;
or       = and { "||" and } ;
and      = equal { "&&" equal } ;
equal    = compare { ( "==" | "!=" ) compare } ;
compare  = sum { ( "<" | "<=" | ">" | ">=" ) sum } ;
sum      = product { ( "+" | "-" ) product } ;
product  = unary { ( "*" | "/" | "%" ) unary } ;
unary    = ( "!" | "-" ) unary | primary ;
primary  = literal | path | call | "(" expr ")" ;
path     = ident { "." ident | "[" expr "]" } ;
call     = ident "(" [ expr { "," expr } ] ")" ;
literal  = number | string | "true" | "false" | "null" ;
number   = digit { digit } [ "." digit { digit } ] [ ( "e" | "E" ) [ "+" | "-" ] digit { digit } ] ;
```

String literals take `\\ \" \' \n \t` escapes; any other escape is
`bad-string`. A number that is not finite (`1e999`) is `bad-expr`. Nesting
deeper than 32 levels is `expr-too-deep`.

### 8.2 Paths and scope

A path's first name is looked up in the scope: the innermost `each` variables,
then the enclosing ones, then the include parameters (in a partial) or the data
object passed to `render` (elsewhere). Each further step reads one property:

- **Own data properties only.** A step reads a property only if the value holds
  it as its own data property (no getter, nothing inherited). Strings expose
  `length` and their indexes, arrays their indexes and `length`.
- **Forbidden names.** `__proto__`, `prototype` and `constructor` are refused as
  any name — a path step, an `each` variable, a parameter, a helper — at compile
  time (`forbidden-name`), and as a computed key at render time (`type`).
- **Missing is an error.** A name that is not in scope, or a property the value
  does not hold, is the render error `missing`, which names the path and the
  template line. Reading a property of `null`, a number, a boolean or a function
  is the render error `type`.

### 8.3 Operators

| Operator | Meaning |
|---|---|
| `a ?? b` | `a`, unless `a` is a path that is missing or `a` is `null`: then `b`. The only way to ask for an optional value. |
| `a ? b : c` | `b` if `a` is truthy, else `c` |
| `a \|\| b`, `a && b`, `!a` | JavaScript truthiness; `\|\|` and `&&` short-circuit and return an operand |
| `==`, `!=` | strict equality (no coercion) |
| `<`, `<=`, `>`, `>=` | two numbers or two strings; otherwise `type` |
| `+` | two numbers add; a string and a string or a number join as text (numbers as written by `String`); anything else is `type` |
| `-`, `*`, `/`, `%`, unary `-` | numbers only; a result that is not finite is `type` |

### 8.4 Helpers

A call `name(args…)` calls a helper the host registered: a plain function,
given the evaluated arguments, whose result is used as a value. The names are
declared to `compile` (an unknown one is `unknown-helper`) and the functions
passed to `render` (one missing there, or one that throws, is `helper-error`).
Helpers are the host's code, never the template's: a template cannot define,
pass or receive a function.

`json(expr)` is reserved for the `l-data` island (§11.7); anywhere else it is
`json-misplaced`.

## 9. Control flow

```
if user.admin
  a(href="/admin") Admin
else if user.guest
  a(href="/login") Sign in
else
  | Welcome back

each row, i in rows
  tr
    td {{ i + 1 }}
    td {{ row.name }}
else
  tr
    td No rows.

each key, value in settings
  dt {{ key }}
  dd {{ value }}
```

- **`if` / `else if` / `else`** — JavaScript truthiness; a missing path in a test
  is `missing` (write `if page.prev ?? false`).
- **`each`** — over an array, the first name is the item and the optional second
  its index from 0; over a plain object, the first name is the key and the
  second the value, in the object's own key order. `else` renders when the array
  or object is empty. Anything else to iterate is `type`. There is no other loop.
- Loop names shadow outer names inside the body and are gone after it.

## 10. Composition

### 10.1 The loader

Templates load other templates through a **loader**: a function
`(name) => string | null` passed to `compile`. The core never touches a file
system; the `/node` entry supplies `createFileLoader(root)`, which serves files
under one directory and nothing else (§15.2).

A name is a quoted path relative to the loader's root: forward slashes, ending
in `.faqir`, no empty, `.` or `..` segment, no leading `/`, no backslash
(`bad-path`). Names are the same from every file — they are never relative to
the including file. `include` or `layout` without a loader is `no-loader`; a
loader returning `null` is `not-found`.

### 10.2 `layout` and `block`

```
//- layouts/docs.faqir
doctype html
html(lang="en")
  head
    title
      block title
  body
    block content
      p This page has no content.
```

```
//- pages/welcome.faqir
layout "layouts/docs.faqir"

block title
  | Welcome
block content
  p Hello.
```

- A file whose first statement is `layout` is a **page**; the rest of it is
  top-level `block` definitions only (`misplaced` otherwise).
- In the layout, `block name` marks a place and its children are the default.
  The page's `block name` replaces those children. A block the layout does not
  have is `unknown-block`; a block defined twice in one file is
  `duplicate-block`. There is no append or prepend.
- Blocks render in the page's scope, with the page's data.
- A file with blocks and no `layout` renders each block's default content: a
  layout can be rendered on its own.
- A layout cannot itself have a layout (`nested-layout`), and a partial cannot
  hold `layout` or `block` (`misplaced`).

### 10.3 `include` with parameters

```
include "partials/nav-item.faqir" (href=item.href label=item.label current=page.href == item.href)
```

- A partial is rendered with a **fresh scope** holding only its parameters.
  Nothing else of the caller's scope is visible inside it. Parameters are
  written as attributes: `name=expr`, `name="literal with {{ holes }}"`, or a
  bare `name` meaning `true`.
- A partial is the only reusable-markup construct: there are no mixins.
- **`params`** declares a partial's parameters, as its first statement:

  ```
  //- partials/shot.faqir
  params src alt phone=false caption=""
  figure(data-shape=phone ? "phone" : false)
    img(src=src alt=alt width=phone ? "390" : "1280")
    if caption
      figcaption {{ caption }}
  ```

  A bare name must be passed (`missing-param`); `name=value` gives a default,
  a literal or an expression evaluated in the partial's scope, where the
  parameters before it are visible. An include that passes a parameter the
  partial does not declare is `unknown-param`. Both are found at compile time.
  A partial without `params` takes any parameters, and reads a missing one as
  `missing` (ask with `??`). `params` anywhere else — in a page, a layout, or
  below the first statement — is `misplaced`.
- An include that reaches back to a file already on its chain is
  `include-cycle`; a chain deeper than 16 includes is `include-depth`. Both are
  found at compile time, so a template without a budget cannot recurse.
- **Bounded recursion.** An include written with a **depth budget**,
  `depth=N` after its parameters, may reach back to a partial on its chain —
  itself, or through other partials:

  ```
  //- partials/block.faqir
  params block
  section
    h2 {{ block.title }}
    each child in block.children
      include "partials/block.faqir" (block=child) depth=3
  ```

  ```
  //- the page
  include "partials/block.faqir" (block=report)
  ```

  `N` is a whole number from 1 to 16 (`bad-line` otherwise). At render, the
  include may open its partial only while that partial is open fewer than `N`
  times on the include chain: here a report three blocks deep renders, and a
  fourth level is the render error `include-depth` at the include's line and
  column. Every include that reaches back to its chain needs the budget — one
  without it is still `include-cycle` — and the file being compiled is not a
  partial, so it can never be included. How deep a recursion goes depends on
  the data, so the compile-time `include-depth` check counts a budgeted
  include that reaches back as nothing; render enforces the chain limit of 16,
  and the step and output limits (§13), on every include.

## 11. Components

### 11.1 The component table

The engine never parses a manifest. It reads a **component table** — plain data
built from the bindings IR (`src/bindings/ir.ts`, `src/bindings/recipe-ir.ts`),
the same manifest walker the Vue and React bindings use — passed to `compile`
as the `components` option.

- `@faqir-ui/template/registry` exports the table of every registry primitive
  and recipe, written by `bun run build:template-table`. The package's own test
  (run by `bun run test`) fails when it is stale, and so does
  `bun scripts/build-template-table.mjs --check`.
- `faqir template` writes a project's own table from its installed manifests,
  project-made components included, beside a copy of the engine (§15.4).

Each entry holds the component's reference tree (its `templates.html`, with its
contract attributes and placeholders resolved by the IR), its fillable slots,
its variants, states and props (§16.3). Beside the entries, the table maps
each component with a controller — callable or not — to the controller files it
needs, and each plugin directive to its file (§11.6).

A component the table cannot describe is listed under `unavailable` with the
reason, and a call to it is `unknown-component` naming that reason. Three gaps
put a component there: the IR refuses its manifest; its `templates.html` holds
no element carrying its name; or two of its arguments would share a name. Every
registry primitive and recipe is callable today, and
`packages/template/tests/registry.test.ts` holds the list at empty, together
with the callable components whose reference markup fails one named audit rule.

When a `templates.html` is a group of samples — two checkboxes in a cluster, a
radio group — the reference tree is one sample: the outermost element below the
root that holds exactly one element carrying the component's name. That element
is the component (`self` in the tree, §16.3): it takes the root's arguments
(states, variants, `id`, passthrough), while the sample around it (a checkbox's
`<label data-ui="checkbox-label">`) is drawn as the reference ships it. Such a
component takes no default content; its parts are filled by name
(`+checkbox(name="terms")` with `@label I agree` under it).

### 11.2 Calls

```
+dialog(id="confirm" size="sm" title="Delete the flow?")
  @body
    p This cannot be undone.
  @footer
    +button(variant="destructive") Delete
```

`+name` renders the component's reference tree. An unknown name is
`unknown-component`, with the nearest names the table holds.

### 11.3 Arguments

Each argument is matched, in this order:

| Argument | Is | Value |
|---|---|---|
| a **variant**, named by its attribute without `data-` (`variant`, `size`, `cols-md`); a group whose attribute another group of the same component already names is named by its manifest group | written on the element the manifest puts it on | a literal checked at compile time, or an expression checked at render time, against the manifest's values (`bad-value`; a bare variant or a literal with a hole is `bad-value` too). The manifest default writes no attribute. |
| a **state** (manifest `states`, root-applied) or a boolean prop with an `attr`, named in camelCase (table's `no-resize` is `noResize`) | written on the root as the manifest's attribute | bare, or an expression tested for truthiness (a quoted literal is `bad-value`). Off writes nothing — except an `aria-*` state, which writes `"false"`. Several states writing `data-state`: the first that is on wins, else the reference value. |
| a **string prop** the reference tree uses (`title`, `triggerText`) | its placeholder's text or attribute | a literal or an expression giving text; unset, the manifest default |
| `heading`, on a component whose reference tree has headings (card's `h3` title, dialog's `h2`) | the level of those headings, so a card under an `h1` can be an `h2` | a literal `h1` … `h6` (`bad-value` otherwise) |
| `id` | the component's id; every `{id}` in the reference tree derives from it | unset, the next id of the render (§11.5) |
| `class`, `role`, `title`, `tabindex`, `hidden`, `lang`, `dir`, `name`, `value`, `aria-*`, a non-protocol `data-*`, or a faqir-core attribute | passed through onto the root, replacing a reference attribute of the same name | as on a plain element (§5) |

Anything else is `unknown-arg`, which lists the arguments the component takes.
`data-ui`, `data-part`, `data-state`, `data-variant` and `data-size` as raw
arguments are `protocol-attr`: they are written through the manifest's own
names, where they are checked.

### 11.4 Slots

- **Named slots** are filled with `@name` lines under the call. A slot is
  fillable when its part appears on at least one element of the reference
  tree, none of them the root or void. The fill replaces that element's
  children; the element itself, with its contract attributes, always renders.
  When the part holds one part-less sample element beside other structure —
  accordion's trigger, `<span>{label}</span>` beside its `▾` icon — the fill
  goes into that element and the structure stays. Filling any other name is
  `unknown-slot` (which lists the fillable slots).
- **The default slot.** A component whose manifest content model is `inline`,
  `text` or `block` takes plain children (and inline text) as its default slot,
  which replaces the root's reference children. Plain children under any other
  component are `no-default-slot`. A call cannot give both default content and
  named fills (`slot-conflict`).
- **Fill arguments.** `@name(args)` writes attributes on the part's element:
  the states the manifest applies to that part, bare or as an expression
  (`@step(completed)`, `@item(expanded=open)`), and any other attribute as on a
  plain element (`@item(href=page.url)`), replacing a reference attribute of
  the same name. Protocol attributes are `protocol-attr`. A part state writes
  only that part's attribute: where the reference wires it to other parts
  (accordion's `aria-expanded` and `hidden`), set those through their fills
  too (`@trigger(aria-expanded="true")`, `@content(hidden=false)`).
- **Fills of fills.** A fill whose children are fills fills the parts inside its
  own part: `@item` over `@title` and `@description`. Its children are fills or
  content, not both (`slot-conflict`).
- **Repeating fills.** A slot filled more than once, or whose fill sits in an
  `if` or `each` under the call, repeats its part — once per fill, in the order
  written:

  ```
  +tabs
    each t in page.tabs
      @trigger {{ t.label }}
      @panel
        p {{ t.body }}
  +breadcrumb
    @item(href="/") Home
    @item(href="/docs") Docs
    @current Settings
  ```

  What repeats is the part's *unit*: its element, widened to part-less wrappers
  that hold only it (breadcrumb's `<li>`), with the empty decorations that
  follow it (breadcrumb's separator). The copies replace every reference
  occurrence of the unit, where the first one was; a slot whose part repeats in
  the reference (tabs' triggers) is copied even when filled once. Copies of the
  slots that share a parent are laid out in the order their fills are written,
  so `@term`, `@details`, `@term`, `@details` makes a description list.
  Copy 1 is built from the reference's first occurrence and every later copy
  from its second, so the first tab is the selected one and the rest are not.
  An id derived in the unit and numbered like its occurrence
  (`{id}-tab-1`) takes the copy's number, counted per slot at render time, so
  trigger N and panel N stay paired through `each` and `if`. A unit with an id
  it cannot renumber — dialog's `{id}-title` — cannot repeat (`duplicate-slot`).
  Slots whose units point at each other's numbered ids must be filled the same
  number of times when both counts are fixed (`fill-count`).
- **Where a fill goes.** A slot whose part sits inside a part that repeats —
  accordion's `trigger` in `item` — is filled inside that part's fills, never
  directly under the call (`nested-slot`, which names the part). So is a slot
  inside a part this call fills.
- **Required slots.** A fillable slot the manifest marks required must be filled
  (`missing-slot`) when its reference content is a sample — placeholders the IR
  drops, like `<div data-part="body">{body}</div>` — or holds one beside
  structure, or is a single prop placeholder, which the call may set instead
  (`+dialog(title="…")` fills `title`). A required part whose reference content
  is structure or literal text (dialog's `panel`, its `close` button's `✕`) is
  already there. Inside a fill of fills, the slots in its part are required the
  same way; a repeating part with a required slot in it is required itself.
- **Unfilled optional parts are left out** when they would render empty: a part
  whose reference content was a sample, or one prop placeholder the call does
  not set (with no default), or only such parts — card's `description` and
  `footer`, callout's `icon`, a card `header` whose title and description are
  both unset. A part with an id (something may point at it) or with a variant
  the call sets is kept. Other unfilled parts render their reference children,
  with sample placeholders dropped.

### 11.5 Ids

Ids come from the author (`id="…"`, or `#id` on a plain element) or from a
per-render counter: a call whose reference tree uses `{id}` and that gets no
`id` takes `<idPrefix>-<n>`, `n` counting from 1 in render order. `idPrefix`
is a render option, `t` by default. Ids are never random and never derived from
data, so the same input renders the same bytes.

### 11.6 `@ui:requires`

`compile` collects what the page needs in the browser into `ast.requires`, and
`render` writes it as the first line of output (after the doctype, if there is
one) when it is not empty:

```html
<!-- @ui:requires faqir-core.js faqir-validate.js dialog.js -->
```

`faqir-core.js` when any faqir-core attribute or controller is present; then the
plugins whose directives appear (`l-validate` → `faqir-validate.js`, from each
plugin's `@ui:provides` header), sorted; then the controller files of the
recipes the page uses — through calls or plain elements with a literal `data-ui`
— with the recipe controllers they import, sorted.

### 11.7 The `l-data` island

```
div(l-data=json(page.state))
  span(l-text="count")
```

`l-data=json(expr)` is the one way server data reaches the client evaluator. The
value is written as a JSON literal, escaped for the attribute. JSON text is a
pure literal to faqir-core: data cannot leave its strings. The value must be
JSON data — `null`, booleans, finite numbers, strings, arrays and plain objects —
with no key `__proto__` (a JavaScript object literal would take it as the
prototype) and nested at most 64 deep; anything else is `json-value`.
`json(…)` anywhere else, or `l-data` with any other interpolation, is a compile
error.

## 12. Output and escaping

### 12.1 Whitespace

Pug's whitespace rules are a known pain; these are this language's, in full.

1. Every node renders on its own line, indented two spaces per depth of output
   nesting. Between sibling nodes there is therefore always a line break, which
   HTML renders as one space between inline content and ignores between blocks.
   Words never run together across lines.
2. An element whose only child is text renders on one line:
   `<p>Hello</p>`. Text inside the line is written as given. Three things join
   a node to the line before it instead of starting a new one, so that no space
   appears where none was meant:
   - a node of an inline run (§6.1) — an element whose children are all such
     nodes renders on one line too;
   - text that starts with closing punctuation, `. , ; : ! ? ) ] } % … » ” ’`;
   - any node after text that ends with opening punctuation, `( [ { « “ ‘`.

   ```
   p
     | Run
     code npm ci
     | , then continue (
     a(href="/docs") docs
     | ).
   ```

   renders `Run` on its own line and then
   `<code>npm ci</code>, then continue (<a href="/docs">docs</a>).` on the next.
   Straight quotes and dashes, which can open or close, join nothing.
3. Inside `pre`, `textarea`, `script` and `style`, nothing is added: children are
   written one after another and piped lines joined by `\n`, with no
   indentation.
4. `raw` output is written exactly as given, without indentation (§12.5).
5. Output ends with one `\n`.

### 12.2 Contexts

| Context | Escaping |
|---|---|
| Text | `&` `<` `>` become entities |
| Attribute value (always double-quoted) | `&` `<` `>` `"` become entities (`<` and `>` so that no value can close a raw-text parent such as `noscript`) |
| URL attribute: `href`, `src`, `action`, `formaction`, in any case and with any namespace prefix (`xlink:href`) | as an attribute; and after removing ASCII whitespace and control characters, a value with a scheme must use `http`, `https`, `mailto` or `tel` — anything else (`javascript:`, `data:`, `vbscript:`) is the render error `unsafe-url` |
| `l-data` island | JSON text, escaped as an attribute (§11.7) |
| HTML comment | literal only (§7) |

### 12.3 Refused at compile time

- A hole or expression in a faqir-core attribute (`directive-interpolation`),
  except the island.
- Any `on*` attribute (`event-attr`).
- Data in `srcdoc` (a whole document), `style` (CSS) or the SVG animation values
  `to`, `from`, `values` and `by` (which can set an `href` past the URL check):
  `unsafe-attr`. A literal is fine.
- Anything but literal text in `script` or `style` — a hole, an element, a
  control-flow node — or text that would close the element
  early (`</script`, `</style`) — `script-content`. Their literal content is
  written unescaped.
- A hole in a comment, `--` or a leading `>` (`bad-comment`).
- `raw` when the compile option `raw` is `false` (`raw-refused`).

### 12.4 What the engine never emits

No inline script, no inline style, no `on*` handler of its own: everything it
writes beyond the template's own markup is attributes and the `@ui:requires`
comment. Its output works under a CSP without `'unsafe-inline'`.

### 12.5 `raw`

```
raw page.articleHtml
raw
  <p>Literal <em>HTML</em>, written verbatim.</p>
```

`raw expr` writes a string value without escaping (anything but a string is
`type`); `raw` with an indented block writes the block's lines verbatim. It is
the only way to write HTML that the engine did not build, and `grep -n "^ *raw"`
finds every use. `compile(…, { raw: false })` refuses both forms
(`raw-refused`) for templates that must not carry any.

## 13. Limits

| Limit | Default | Error |
|---|---|---|
| Template nesting per file | 64 levels | `too-deep` |
| Expression nesting | 32 levels | `expr-too-deep` |
| Include chain | 16 | `include-depth` (compile; also enforced at render, where a budgeted recursion is counted) |
| Output | 16 MiB (16 777 216 UTF-16 code units), render option `maxOutput` | `output-limit` |
| Render steps (nodes rendered + loop iterations) | 10 000 000, render option `maxSteps` | `step-limit` |
| `json()` nesting | 64 levels | `json-value` |

Compilation reads nothing but what the loader returns; rendering calls nothing
but the registered helpers.

## 14. Diagnostics

`compile` returns `{ ast, diagnostics }`. Each diagnostic is
`{ code, message, file, line, col }` (line and column from 1). Diagnostics are
errors: when there is any, `ast` is `null`. Codes are stable; messages are not.

### 14.1 Compile codes

| Code | When |
|---|---|
| `tab-indent` | a tab in a line's indentation |
| `bad-indent` | indentation that is not one step deeper than the parent or an enclosing level |
| `too-deep` | more than 64 nesting levels |
| `bad-line` | a line that is no construct of §4 |
| `unknown-tag` | an element name that is no HTML, SVG or MathML element and has no hyphen (§5) |
| `bad-attr` | a malformed attribute list |
| `duplicate-attr` | the same attribute twice on one element or call |
| `bad-string` | an unterminated string literal or an unknown escape |
| `bad-hole` | an unterminated or empty `{{ }}` |
| `literal-entity` | an entity in literal text or a literal attribute value (§6) |
| `bad-expr` | an expression syntax error, or a number that is not finite |
| `expr-too-deep` | expression nesting deeper than 32 |
| `forbidden-name` | `__proto__`, `prototype` or `constructor` as a name |
| `orphan-else` | `else` with no `if` or `each` before it |
| `void-children` | children under a void element |
| `bad-doctype` | a doctype other than `doctype html` |
| `misplaced` | a construct where §4 or §10 does not allow it |
| `no-loader` | `include` or `layout` without a loader |
| `bad-path` | an include or layout name outside §10.1's rules |
| `not-found` | the loader has no such file |
| `include-cycle` | an include chain that returns to a file on it, through an include without a `depth=` budget (§10.3) |
| `include-depth` | an include chain deeper than 16 |
| `unknown-param` | an include passing a parameter its partial's `params` does not declare |
| `missing-param` | an include leaving out a parameter declared without a default |
| `nested-layout` | a layout that has a layout |
| `unknown-block` | a page block the layout does not have |
| `duplicate-block` | the same block twice in one file |
| `unknown-component` | a call to a name not in the component table |
| `unknown-arg` | an argument the component does not take |
| `protocol-attr` | a protocol attribute as a raw call argument |
| `bad-value` | a literal argument the manifest does not allow |
| `unknown-slot` | a fill of a slot the component cannot fill |
| `duplicate-slot` | a slot filled twice whose part carries an id a copy cannot renumber |
| `nested-slot` | a fill of a slot that sits in a repeating part, or in a part the call fills, written outside that part's fill |
| `fill-count` | paired repeating slots (triggers and panels) filled a different number of times |
| `no-default-slot` | plain children under a component without a default slot |
| `slot-conflict` | default content and named fills in one call; content and fills under one fill or in one branch |
| `missing-slot` | a required slot left unfilled |
| `unknown-helper` | a call to a helper not declared to `compile` |
| `json-misplaced` | `json()` anywhere but the whole value of `l-data` |
| `directive-interpolation` | a hole or expression in a faqir-core attribute |
| `event-attr` | an `on*` attribute |
| `script-content` | anything but literal text in `script`/`style`, or text that closes it early |
| `unsafe-attr` | data in `srcdoc`, `style`, `to`, `from`, `values` or `by` |
| `bad-comment` | a hole, `--` or leading `>` in an HTML comment |
| `raw-refused` | `raw` under `{ raw: false }` |

### 14.2 Render errors

`render` throws an `Error` whose `code` is one of these, with `file`, `line` and
`col` of the template node, and `path` (the expression's text) where one is
involved.

| Code | When |
|---|---|
| `missing` | a path that is not in scope or not held by its value |
| `type` | a value of the wrong type for an operator, a step, `each`, `raw`, or a forbidden computed key |
| `not-text` | a value that cannot be text or an attribute value |
| `bad-value` | a dynamic variant argument the manifest does not allow |
| `unsafe-url` | a URL attribute whose scheme is not allowed |
| `json-value` | a `json()` value that is not JSON data (§11.7) |
| `helper-error` | a helper missing from `render`'s helpers, or one that threw |
| `include-depth` | includes nesting deeper than 16, or a budgeted include whose partial is already open `depth` times (§10.3) |
| `output-limit` | output beyond `maxOutput` |
| `step-limit` | more than `maxSteps` steps |
| `bad-ast` | a node the renderer does not know, or a malformed or too deeply nested AST |

## 15. API

### 15.1 `@faqir-ui/template` and `@faqir-ui/template/compile`

The package has two isomorphic entries: the **runtime** (`.`, `render`) and the
**compiler** (`/compile`, `compile`). A host compiles once, when a template is
saved — the static analysis — and renders the stored AST at request time; a
browser that draws stored ASTs needs only the runtime, which is the entry the
8 KB size budget holds (`bun run size`).

```js
import { compile } from "@faqir-ui/template/compile";
import { render } from "@faqir-ui/template";

const { ast, diagnostics } = compile(source, {
  file: "pages/welcome.faqir",   // name in diagnostics; default "template.faqir"
  loader,                        // (name) => string | null — needed by include and layout
  components,                    // component table (§11.1); default: none
  helpers: ["upper"],            // helper names calls may use; default: none
  raw: true,                     // false refuses `raw`
});
if (ast) {
  const html = render(ast, data, {
    helpers: { upper: (s) => String(s).toUpperCase() },
    idPrefix: "t",               // §11.5
    maxOutput: 16 * 1024 * 1024, // §13
    maxSteps: 10_000_000,        // §13
  });
}
```

- `compile` never throws for anything in the template; it throws `TypeError` only
  for wrong options. `render` throws `TypeError` for wrong arguments (a limit
  that is not a positive integer, a non-string `idPrefix`) and a render error
  (§14.2) for everything else.
- `render` takes a compiled AST — or the same AST after a JSON round trip:
  `render(JSON.parse(JSON.stringify(ast)), data)` gives the same bytes, so a host
  can store or cache compiled templates as data. `data` is a plain object.

### 15.2 `@faqir-ui/template/node`

```js
import { createFileLoader } from "@faqir-ui/template/node";
const loader = createFileLoader("/srv/app/templates");
```

The loader reads a name (§10.1) as a UTF-8 file under `root`, and returns `null`
for a file that does not exist, a name that breaks §10.1, or a path that leaves
`root` through a symbolic link. It is the only module that touches `node:`.

### 15.3 `@faqir-ui/template/registry`

`export const components` — the registry's component table (§11.1).

### 15.4 Installing without npm

`faqir template` (run in a Faqir project) copies the engine's files into
`<output_dir>/template/` and writes `<output_dir>/template/table.js`, the
project's table from its installed manifests, project-made ones included, and
its installed plugins (the registry's when it has none). The engine's files are
embedded in the CLI at build time from `packages/template/src`, their single
source. The files are committed like the rest of `output_dir`; `--check` reports
drift without writing and exits 1 when there is any. With `--json` it prints
`{ ok, dir, files, drifted }`.

```js
import { compile } from "./ui/template/compile.js";
import { render } from "./ui/template/index.js";
import { createFileLoader } from "./ui/template/node.js";
import { components } from "./ui/template/table.js";
```

## 16. AST

The AST is plain JSON. Every node has `type`; nodes that can be the site of an
error carry `loc: [fileIndex, line, col]`, indexing `Template.files`.

### 16.1 Template nodes

| Node | Shape |
|---|---|
| `Template` | `{ type, files: string[], requires: string[], uses: string[], body: Node[], partials: { [name]: Node[] } }` |
| `Doctype` | `{ type, loc }` |
| `Element` | `{ type, tag, attrs: Attr[], children: Node[], loc }` |
| `Text` | `{ type, parts: Part[], loc }` |
| `Comment` | `{ type, text, loc }` |
| `Raw` | `{ type, text, loc }` or `{ type, expr, loc }` |
| `If` | `{ type, branches: { test: Expr \| null, body: Node[] }[], loc }` |
| `Each` | `{ type, names: string[], of: Expr, body: Node[], else: Node[], loc }` |
| `Include` | `{ type, name, params: { name, value: AttrValue }[], depth?: number, loc }` — `depth`, the recursion budget (§10.3), only when written |
| `Params` | `{ type, params: { name, value: AttrValue \| null }[], loc }` — a partial's first node (§10.3); `null` is a parameter without a default |
| `Component` | `{ type, name, id: AttrValue \| null, body: Node[], loc }` |
| `Copy` | `{ type, slot, bodies: Node[][], loc }` — one fill of a repeating part (§11.4): the Nth copy of `slot` in its component renders `bodies[0]` when N is 1, else the last body |

`uses` lists, sorted, every component name the output draws through a literal
`data-ui` — calls, the components inside them and plain elements — so a host
can build a page's CSS without rendering it (`subsetBundle` in
`@faqir-ui/core/subset`). `Element` and `Text` nodes of an inline run (§6.1)
carry `glue: true`.

`Attr` is `{ name, value, col? }` — `col`, the attribute's column, is there
when the attribute was written in the template. `AttrValue` is one of:

- `true` — bare;
- `{ parts: Part[] }` — a literal with holes;
- `{ expr: Expr }` — an expression (§5);
- `{ expr: Expr, allow: string[], omit: string }` — a variant argument: the value
  must be one of `allow`; equal to `omit` (the default), the attribute is left out;
- `{ json: Expr }` — the `l-data` island.

A `Part` is a string, `{ expr: Expr }`, `{ id: true }` (the enclosing
`Component`'s id), or `{ n: true }` (the number of the enclosing `Copy`).

### 16.2 Expression nodes

| Node | Shape |
|---|---|
| `Literal` | `{ type, value }` |
| `Path` | `{ type, root: string, keys: (string \| Expr)[] }` |
| `Call` | `{ type, name, args: Expr[] }` |
| `Unary` | `{ type, op, arg }` |
| `Binary` | `{ type, op, left, right }` (`op` includes `??`, `\|\|`, `&&`) |
| `Cond` | `{ type, test, then, else }` |

### 16.3 Component table

```js
{
  version: 1,
  plugins: { "l-validate": "faqir-validate.js", … },
  controllers: { dialog: ["dialog.js"], "alert-dialog": ["alert-dialog.js", "dialog.js"], table: ["table.js"], … },
  components: {
    dialog: {
      defaultSlot: false,
      slots: { body: { required: true }, title: { required: true, prop: "title" }, … },
      variants: { size: { attr: "data-size", values: ["sm", "md", "lg", "full"], default: "md" }, … },
      states: { open: { attr: "data-state", value: "open", kind: "value" }, … },
      props: { title: { default: "" }, triggerText: { default: "Open" } },
      bools: [],
      heading: "h2",
      tree: { tag, attrs: [[name, true | { b: arg } | Seg[]]], slot?, dyn?: [[arg, attr]], sample?, self?, children: (TreeNode | Seg)[] }
    },
    accordion: {
      slots: { item: { required: true, states: { expanded: { attr: "data-state", value: "expanded", kind: "value" } } },
               trigger: { required: true, within: "item" }, … },
      …
    }
  },
  unavailable: {}
}
```

`Seg` is a string or `{ p: arg }`, where `arg` is a string prop or `id`. The tree
is the bindings IR's reference tree with its prop names turned into argument
names; `sample` marks an element whose reference text was only sample
placeholders, and `self` the component's own element inside a wrapped sample
(§11.1). A slot's `within` names the repeating part it is filled in, and its
`states` are the manifest states of its part (§11.4); `heading` is the tag of
the reference tree's headings, present when it has any (§11.3).

## 17. Relation to `@faqir-ui/render`

FAQIR-VISION §9 plans `@faqir-ui/render`: definitions JSON → markup, built on
the same insight — a block is a component, manifests are the grammar. This
engine is the layer under it, not a competitor:

- A definition's block (`{ "type": "card", "variant": "outlined", "slots": … }`)
  is, word for word, a component call (`+card(variant="outlined")` with fills).
  A definitions renderer can compile a definition into this AST and let `render`
  draw it, inheriting the escaping, the URL policy, the island and the limits.
- This engine does not implement definitions, profiles, `source` bindings or the
  `html` block. Those stay §9's.
- Both read the same component table, so a gap in a manifest's template shows up
  once, in one place.

## 18. Decisions

1. **Names are root-relative.** Include and layout names are relative to the
   loader's root, never to the including file: one rule, no path arithmetic, and
   one place (`bad-path`) that decides what a name may be.
2. **One raw construct.** `raw` has an expression form and a literal block form;
   literal lines starting with `<` are not HTML (they are `bad-line`). The
   compile option `raw: false` refuses both.
3. **Argument names follow attributes.** A variant argument is its attribute
   without `data-` (`variant`, `size`, `cols-md`), as in the Vue and React
   primitive bindings and in FAQIR-VISION §9's blocks, rather than the manifest
   group name (`visual`), which authors never see in markup.
4. **One component walker.** The table is built from the bindings IR: the
   reference tree from `recipe-ir.ts` for primitives and recipes alike (it keeps
   `role`, `aria-*` and `hidden` exactly as `templates.html` ships them), states
   and the default slot from `ir.ts`. The IR gained two options the bindings
   do not use: keep `l-*` attributes, since server output is taken over by
   faqir-core, not by a framework; and mark elements whose reference text was
   only sample placeholders, which is what decides a required fill.
5. **Required means fill where the reference holds a sample.** A sample is not
   content, so a required slot showing one must be filled (or its prop set); a
   required part whose reference is structure is already there, and asking for
   a fill would replace that structure.
6. **Partials see only their parameters.** No implicit scope leaks into a
   partial, so a partial reads the same wherever it is included.
7. **Missing is loud.** A missing value is an error everywhere — text, attribute,
   test — except on the left of `??`.
8. **Literal text is escaped.** Template text and data take the same escaping, so
   the only way to write markup the engine did not build is `raw`.
9. **One layout level, replace-only blocks, no mixins.** Each dropped feature is
   one less thing a hostile template can use and one less rule to learn.
   Recursion is off by default too: an include cycle is `include-cycle`, so an
   untrusted template that recurses by accident or on purpose fails to compile.
   The one exception is written on the include itself — a `depth=N` budget
   (§10.3) — because nested data (a tree of report blocks) otherwise needs one
   dispatcher partial per level. It adds nothing a hostile template could not
   already do: a budget is at most the include-depth limit of 16, render counts
   it, and a recursion is bounded by the same step and output limits as a
   chain of sixteen distinct partials.
10. **Step limit.** Besides the output limit, rendering counts steps, so nested
    loops over large data with empty bodies cannot spin without output.
11. **The `@ui:requires` comment is always written** when the page needs
    something, as `@faqir-ui/forms` does; there is no option to drop it.
12. **The runtime and the compiler are separate entries.** Compiling is the
    static analysis a host runs when a template is saved; rendering is what
    runs per request, and what a browser drawing stored ASTs needs. The core
    entry is therefore the runtime (about 4 KB minified+gzip, under the 8 KB
    budget); the compiler, with its diagnostics' messages, is about 10 KB and
    has its own entry. Both are zero-dependency and isomorphic.
13. **Inline elements and punctuation, not whitespace control.** Prose is
    full of `code` followed by a comma. Inline `#[…]` elements keep a sentence
    on one line, and the punctuation rule (§12.1) keeps the line-per-node style
    from putting a space before a comma — with no new syntax. A general
    "no space here" marker was left out: it is one more thing to learn for the
    few cases the two do not cover.
14. **A repeated fill copies the reference, it does not invent markup.** Copy 1
    is the reference's first occurrence and later copies its second, so the
    states the reference ships (the selected tab, hidden panels) carry over,
    and ids are renumbered only where the reference numbers them. A part that
    has a fixed id refuses to repeat rather than writing it twice.
15. **Only empty optional parts are left out.** A part is omitted when its
    reference content was a sample or an unset prop — never a part with an id,
    never structure — so what a controller or an ARIA reference looks for is
    still there.

## 19. Examples

A partial and its use:

```
//- partials/nav-item.faqir
params href label current=false
a(data-part="item" href=href aria-label=label aria-current=current ? "page" : false)
  span(data-part="label") {{ label }}
```

```
nav(data-part="nav" aria-label="Pages")
  each item in site.pages
    include "partials/nav-item.faqir" (href=item.href label=item.label current=item.href == page.href)
```

A component with a dynamic variant and a state:

```
+button(variant=action.tone size="sm" loading=action.busy) {{ action.label }}
```

A hydration island beside server-rendered rows:

```
+table
  @tbody
    each row in rows
      tr
        td {{ row.name }}
        td {{ row.count }}
div(l-data=json({ count: 0 }))
```

The last line is a compile error: `json()` takes an expression, and the language
has no object literal — the island's data comes from the data passed to
`render`: `div(l-data=json(page.counter))`.
