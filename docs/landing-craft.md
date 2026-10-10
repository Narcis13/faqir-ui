# Landing craft — what premium landing pages need, and what Faqir now ships

This note maps the design moves in the page-shaped prompts of a 100-prompt
showcase collection ("Claude Opus 5.5 — 100 HTML Files", the original prompts)
onto Faqir. Each technique was traced to the prompts it came from. It was then
checked against what the registry already did, and given one verdict:

- **shipped** (new code),
- **used** (already possible; the showcase proves it with existing parts),
- **deferred** (needs something out of reach in 1.x, or is not worth its lines yet),
- **rejected** (does not belong in Faqir).

The proof is [`playground/landing-craft.html`](../playground/landing-craft.html):
a full landing page built only from registry components, tokens and directives.
Its theme switcher covers the four new themes.

## Method

**Source prompts.** These were read as landing, product, editorial or portfolio pages:

| Prompt | Page | Read for |
|---|---|---|
| 001 | Stillwater (glassmorphism app) | glass panels, tilt and glare, pricing toggle with sliding pill, testimonial strip |
| 003 | Raster (Swiss poster) | extreme scale contrast, edition mark |
| 006 | Loud House Records (neo-brutalist zine) | hard offset shadows, press-down cards, marquee strip, SOLD OUT stamps |
| 008 | The Last Keepers (long-read) | Didone headline, drop cap, small-caps byline, pull quotes, reading progress |
| 010 | Mercury (liquid chrome hero) | giant chrome wordmark with specular sweep, glass chips, CTA micro-interaction |
| 014 | MOVE (kinetic manifesto) | acid accent on near-black, scroll-driven type, progress rail |
| 015 | The Aurelian (Art Deco hotel) | gold-foil shimmer on headings, wide-tracked Didone capitals, Deco frames and dividers |
| 024 | Maison Varenne (watch product page) | generous whitespace, tracked small captions, spec table, Reserve CTA |
| 035 | Ember & Oak (coffee roaster) | warm craft palette, slab/serif headings, tactile hovers, subscription CTA |
| 040 | Nonna Lucia's tart (recipe) | warm serif headings, italic notes, print stylesheet |
| 043 | Atelier Noire (fashion lookbook) | enormous Didone over imagery, tiny tracked labels, "LOOK 07" marks, parallax word |
| 048 | Squishy (claymorphism kit) | puffy clay shapes, pressed states, squishy pricing toggle |
| 056 | Casa Lumen (blueprint) | technical lettering, self-drawing lines |
| 057 | Hi-Fi Walnut (product) | serif with small caps, brass accent |
| 058 | Radical Shapes (Memphis event) | chunky geometric type, two-colour offset text shadow, patterns, ticket tiers |
| 068 | Mira Okafor (bento portfolio) | bento tiles, lift on hover, cursor spotlight, magnetic button |
| 081 | SIGNAL/NOISE (glitch portfolio) | RGB split headline, stabilise toggle |
| 082 | Rosée (perfume product page) | shimmering "Add to bag" sweep, size selector, wide-tracked captions |
| 085 | Maison Lierre (Art Nouveau) | ornamental borders, decorative initials and dividers |
| 087 | Juno's Sketchbook (portfolio) | paper texture, washi tape, sticky notes |
| 096 | MONOLITH (architecture) | concrete texture, huge tight uppercase grotesk, severe grid, single patina accent |

The other prompts are toys and simulations: fluid solvers, N-body systems,
synths, games and generative canvases. They are out of scope, because Faqir
ships no canvas engines, WebGL or physics (FAQIR-VISION §3, invariant 4).

**The question asked of each page** was this: *which part is a reusable,
CSS-first design move, and which part is a one-off illustration?* Only the
first kind is listed below. Illustrations stay with the page: the SVG
lighthouse, the watch, the perfume bottle, metaballs, croquis, the coffee cup.

**Constraints.**

- SPEC-1.0 §8.2: every shipped change is additive. It is either a new
  component, a new value in a component's own variant group, or a new
  component prop.
- `manifest.schema.json` and `src/protocol.ts` are frozen inputs for this
  work. Because of that, no theme axis value and no token-modifier value was
  added. The axis enums are mirrored in the schema, so a new `depth` or
  `material` value is a spec amendment and is deferred to its own change.

## Technique map

Ranked within each group by how much they lift the ceiling per line of code.
"Before" is what Faqir did before this change.

### Theme level

| Technique | Prompts | Before | Verdict | Change / reason |
|---|---|---|---|---|
| Gilded Art Deco: lacquer ground, emerald, wide-tracked Didone caps, double rules, pinstripes | 015, 057 | `luxe` is the only dark serif theme (gold, warm, soft) | **shipped** | `deco` seed: dark, emerald-tinted ground, `serif-modern` uppercase wide, sharp, flat, `stripes`, `double` divider. Gold comes from `highlight[data-variant=foil]` with `--highlight-color` |
| Claymorphism: puffy rounded shapes, pastel ground, chunky rounded type | 048 | `candy` (pill, soft) and `neumorph` (inset) are near but neither is clay | **shipped** | `clay` seed: lilac-tinted ground, `rounded` black weight, round radius, regular border, `layered` depth, `playful` motion, glow focus |
| Memphis: white ground, black geometric type, heavy outline, hard offset shadow, dot confetti, hot pink | 058, 006 | `neo` has hard shadows, but in grotesk, lime and no pattern | **shipped** | `memphis` seed: `sans-geometric` black, crisp radius, heavy border, `hard` depth, `dots`, `springy` |
| Concrete brutalist-minimal: grain, tight uppercase grotesk, sharp slabs, one patina accent | 096, 003 | `swiss` (grid, red) and `brutalist` (no texture) | **shipped** | `monolith` seed: grotesk uppercase tight, sharp hairline, flat, `grain`, minimal motion, spacious |
| Didone fashion editorial in light (bone, oxblood) | 043, 082, 024 | `luxe` is dark-only | deferred | The light colour space is saturated: 21 light peers. Seeds tried at many hues failed the 0.03 ΔE gate without `contrast: high`, and four new themes already cover the batch |
| Warm craft / roastery | 035, 040 | `ink`, `paper` and `organic` cover the warm-serif ground | used | `paper` and `organic` carry it. A fifth theme would only have recoloured them |
| Fluid display type with extreme contrast | 003, 010, 014, 043, 096 | `text` stopped at `4xl` | **shipped** | `text[data-size=display]`: a clamp()-based fluid size that reads the heading role tokens and never forces horizontal scroll |
| Wide tracking and small caps | 008, 015, 024, 043, 082 | Theme axis `type.voice` (`wide`, `small-caps`) | used | `deco` and `luxe` set it; eyebrows get it from `text[data-variant=eyebrow]` |
| Hard offset shadows | 006, 058 | `depth: hard` (`neo`) | used | `memphis` uses it too; `button[data-effect=sink]` collapses it |
| Glass with inner highlight and grain | 001 | `depth: glass`, `material: grain`, `site-header[data-variant=glass]` | used / deferred | Glass and grain combine today. A 1px inner highlight on glass surfaces needs a new `depth` value, which is a schema amendment |
| Clay inner + outer shadow | 048 | `depth: layered` is the closest | deferred | A true clay ramp (inner highlight plus outer shadow) is a new `depth` value, which is a schema amendment. `clay` uses `layered` |
| Paper and concrete textures | 087, 096 | `material: paper / grain` | used | `monolith` grain |
| Single acid accent on near-black | 014 | `neo` is lime on gray, in both schemes | used | Not a new theme: dark-only lime collides with `luxe` on colour |
| Generous editorial measure | 008, 043 | `prose`, `surface[data-max=prose]`, `--measure-*` | used | — |

### CTA and button

| Technique | Prompts | Before | Verdict | Change / reason |
|---|---|---|---|---|
| Arrow that slides on hover | 024, 082 (Reserve / Add to bag) | `link[data-effect=arrow]` existed for links only | **shipped** | `button[data-effect=arrow]`: the trailing icon nudges toward the inline end on hover and focus; mirrored in RTL |
| Press-down (shadow collapse) | 006, 048 | `button[data-effect=press]` only scaled | **shipped** | `button[data-effect=sink]`: rests on the theme's shadow, lifts on hover, collapses into it on `:active` |
| Sheen / shimmer sweep | 015, 082 | `button[data-effect=shine]` | used | — |
| Glow | 010 | `glow` primitive | used | — |
| Magnetic / pointer-follow button | 068 | none | rejected | Moving a focus target under the pointer is a usability cost. The pointer light that `spotlight` gives is the part worth keeping |
| CTA over a backdrop effect | 001, 010 | `cta` template nests `backdrop` | used | — |
| Sticky / banner CTA | 024, 082 | `cta[data-variant=banner]`, `site-header[data-sticky]` | used | — |
| Droplet dripping from the CTA | 010 | none | rejected | A one-off illustration |

### Hero and sections

| Technique | Prompts | Before | Verdict | Change / reason |
|---|---|---|---|---|
| Full-bleed cover hero with an oversized headline | 010, 043, 096, 015 | `hero` had `center` and `split` | **shipped** | `hero[data-variant=cover]`: near-viewport height, content anchored low, fluid oversized headline |
| Kinetic / staggered headline reveal | 014, 015, 010 | `reveal` (wrapper) and bento's `data-animate` | **shipped** | `hero[data-animate]`: eyebrow, headline, copy, actions and media rise in sequence on load, timed by the motion tokens. It is static under reduced motion and in print |
| Eyebrow / kicker | 024, 043, 082, 096 | a `data-part="eyebrow"` slot with no style of its own | **shipped** | `text[data-variant=eyebrow]`: small, uppercase, wide-tracked, accent-coloured |
| Gold foil / chrome gradient text with a specular sweep | 010, 015 | `highlight` `gradient` / `shimmer` | **shipped** | `highlight[data-variant=foil]`: metallic bands from the primary ramp (or `--highlight-color`) with a slow ambient sweep |
| Outlined display type | 043, 058 | none | **shipped** | `highlight[data-variant=outline]`: stroked letters, guarded by `@supports` |
| Two-colour offset text shadow | 058, 006 | none | **shipped** | `highlight[data-variant=echo]`: two hard offsets in two accents |
| Stamps and edition marks ("SOLD OUT", "LOOK 07", "No. 0417") | 003, 006, 043 | `badge` (status colours only) | **shipped** | New `stamp` primitive: rotated, double-ruled, uppercase, in rect or round seal shape. A new component rather than a badge variant, because its shape is a second axis that badge's colour group cannot carry |
| Ornamental section divider | 015, 085, 008 | `separator` solid/dashed/dotted/thick | **shipped** | `separator[data-style=ornament]`: a centred diamond with rules fading out on both sides; a label replaces the diamond |
| Drop cap | 008, 085 | none | **shipped** | `text[data-dropcap]`: `initial-letter` where supported, a float fallback otherwise |
| Pointer spotlight on tiles | 001, 068 | bento had a static hover pool | **shipped** | New CSS-only `spotlight` primitive, with `light` and `border` effects. It fades in on hover and on focus-within at `--spotlight-x` / `--spotlight-y`. A page makes it follow the pointer with one `@pointermove` directive (the `html_follow` template). It is inert on touch, under reduced motion, in forced colours and in print |
| 3D tilt toward the pointer with a specular glare | 001, 032 | none | deferred | Tilt needs the pointer's position normalised to the box, so it needs a controller or plugin. The engine's `engine + controllers` budget has no room for one (see below), and the `faqir-pointer` plugin VISION §7.3 plans is outside this change |
| Marquee strip | 006, 058 | `marquee`, `logo-cloud[data-variant=marquee]` | used | — |
| Scroll reveal | 008, 043, 096 | `reveal` with `animation-timeline: view()` | used | — |
| Reading / scroll progress | 008, 014, 043 | `scroll-progress` | used | — |
| Pull quote | 008 | `quote[data-variant=pull]` | used | — |
| Bento tiles with lift | 068 | `bento`, `card[data-hover]` | used | The spotlight is added through `spotlight` |
| Parallax word behind content | 043 | none | deferred | VISION §7.3's `parallax` primitive. It needs its own design pass (depth layers and audit rule `parallax-depth`) |
| Scroll-scrubbed kinetic scenes (letters assembling, words stretching) | 014 | none | rejected | Per-glyph choreography is one-off art, and splitting words into glyph spans damages the accessible name |
| RGB split / glitch headline | 081 | none | rejected | A one-off effect with a flashing hazard; it would need a reduced-motion story bigger than its value |
| Custom cursor ("VIEW" ring, pencil trail) | 043, 087 | none | rejected | Replaces a platform affordance; a11y cost with no reusable payoff |
| Self-drawing SVG lines | 015, 056, 085, 087 | none | deferred | VISION §7.4 icon `draw`; it belongs to the icon/SVG workstream |
| Curtain-wipe page intro | 043 | none | rejected | It delays the first frame; the hero entrance covers the same need without hiding content |
| View-transition shared-element expand | 068 | none | deferred | VISION §7.2 `l-transition.view`, which is an engine change of its own |

### Pricing and social proof

| Technique | Prompts | Before | Verdict | Change / reason |
|---|---|---|---|---|
| Monthly/yearly toggle with a sliding pill | 001, 048 | `toggle-group` (per-item fill, no thumb); pricing had no billing concept | **shipped** | `toggle-group[data-variant=segmented]`: one thumb slides under the checked radio, in pure CSS (`:has()`, feature-detected) |
| Price swap on toggle with zero JS | 001, 048 | none | **shipped** | `pricing` slots `billing`, `monthly`, `yearly`: radios with `value="monthly"` and `value="yearly"` swap the prices through `:has()`. Without `:has()`, monthly prices show and the switch hides |
| Highlighted plan | 001, 048, 058 | `pricing` `featured` state | used | — |
| Testimonial strip / wall | 001, 068 | `testimonials` `grid`, `columns` and `marquee` | used | — |
| Logo cloud | — | `logo-cloud` | used | — |
| Flip-digit countdown | 058 | none | deferred | VISION §7.3 `countdown` recipe; event pages only |
| Count-up stats | 068 | none | deferred | VISION §7.3 `counter`: `@property` integer counting, which deserves its own primitive |

## What shipped, by lift per line

1. `toggle-group[data-variant=segmented]` and the pricing billing swap: the most recognisable premium pricing move, with no JavaScript.
2. `hero[data-variant=cover]` and `hero[data-animate]`: the first frame.
3. `text[data-size=display]` and `text[data-variant=eyebrow]`: editorial type scale.
4. `highlight` `foil`, `outline` and `echo`: display-type finishes that carry a theme's character.
5. `spotlight` (`light`, `border`): a hover light whose pointer-following is one directive the page opts into.
6. `button` `arrow` and `sink`: CTA micro-interactions.
7. `stamp`: edition marks and status seals.
8. `separator[data-style=ornament]` and `text[data-dropcap]`: editorial ornament.
9. Four seed themes: `deco`, `clay`, `memphis`, `monolith`.

## Found along the way

Building the showcase from registry parts surfaced five defects in components
that already existed. Each was fixed at its source:

- **`quote`: every quote after the first drew the nested mark (‘ instead of “).**
  The mark is `open-quote`, which raises the document's quote depth, and nothing
  lowered it again. A `no-close-quote` on `::after` fixes it.
- **`bento`, `reveal` and `highlight`: reduced motion lost the cascade.** Their
  `animation: none` selectors were less specific than the `[data-animate]` /
  trigger rules they were meant to cancel, so the entrances still played. Each
  reduced-motion block now repeats the entrance selectors.
  `tests/registry/reduced-motion-specificity.test.ts` pins this for every
  registry stylesheet: an entrance selector must be cancelled at its own
  specificity, and it fails on the old CSS.
- **`pricing`: the heading ignored the theme's heading voice**, so it rendered
  bold and in mixed case under `deco` and `luxe`. It now reads `--heading-weight`,
  `--heading-tracking`, `--heading-transform` and `--heading-caps`, as `bento`
  does.

The engine's size budget changed the design of `spotlight`. It was first
built as a recipe, with a controller that published the pointer position.
Every recipe controller is assembled into the engine bundle, and that bundle's
`engine + controllers` budget (46 KB gzip) had about 140 B of room left on the
CDN build. Even a controller cut to its bare minimum did not fit, and raising a
budget is not this change's call.

So the light became CSS. It shows on `:hover` and `:focus-within`, and a
page that wants it to follow the pointer writes the two position properties
from one `@pointermove` directive, which costs the engine nothing. The 3D
tilt needs more than that, so it is deferred.

## Themes and the colour gate

All four themes are pure seeds (`registry/themes/<name>.seed.json`). None has a
signature stylesheet, because the registry has no such mechanism yet and the
looks they need come from components. Each one clears the shipped
distinctiveness gate against all 27 peers:

- at least 4 differing axes, and 6 or more in practice;
- at least 0.03 mean OKLab ΔE.

The tightest new pair is `clinical`/`monolith` at ΔE 0.0319.

The colour gate is what shaped the seeds. Light-scheme colour space is
crowded, and a light seed with `contrast: standard` failed at every hue tried.
Three of the four therefore carry `contrast: high` and a `tinted` ground, and
`deco` is dark-only, on emerald rather than gold: gold on near-black *is*
`luxe` (ΔE 0.013–0.021 at every gold tried).
