# FAQIR → PROTO — UI Layer Integration Plan (Claude Code Edition)

> **Mission:** when Faqir UI reaches **1.0**, integrate it into the **proto** boilerplate
> (`/Users/narcisbrindusescu/newme/proto`) as **the official UI layer**, replacing PrimeVue 4
> (and ultimately Tailwind), so every future project derived from proto ships Faqir by default.
>
> **Execution model:** 1 coding session = 1 task. Hand any session to Claude Code with the
> prompt template in §4. Every session is self-contained: it states what to read, what to do,
> how to verify, and what "done" means. Sessions must end green (typecheck + tests + lint) and
> committed. Nothing in this plan touches proto's backend architecture — this is a UI-layer
> swap only.
>
> **Where this runs:** sessions execute inside the **proto repo**. Session S0.1 copies this
> file to `proto/docs/faqir-migration/PLAN.md` and all later sessions read it from there.

---

## 0. Progress Tracker

Update the Status column at the end of every session (`✅ done <date>` / `🔶 partial — <note>` / `❌ blocked — <note>`).

| ID | Session | Phase | Depends on | Status |
|----|---------|-------|------------|--------|
| S0.1 | Preflight: verify Faqir 1.0 deliverables, pick Track A/B | 0 — Preflight | — | ⬜ |
| S0.2 | Proto baseline: census, screenshots, migration docs dir | 0 — Preflight | S0.1 | ⬜ |
| S1.1 | Install Faqir CLI, `faqir init`, asset sync script | 1 — Foundation | S0.2 | ⬜ |
| S1.2 | Wire Faqir CSS into Vite/Inertia (coexistence with PrimeVue) | 1 — Foundation | S1.1 | ⬜ |
| S1.3 | Theme + dark mode unification (`data-theme` + `.dark` dual-write) | 1 — Foundation | S1.2 | ⬜ |
| S1.4 | Agent enablement: skill, MCP, context, CLAUDE.md interim rules | 1 — Foundation | S1.1 | ⬜ |
| S2.1 | Add component set; recipe lifecycle composable (`useFaqirRecipe`) | 2 — Vue layer | S1.2 | ⬜ |
| S2.2 | Form-control Vue wrappers with `v-model` | 2 — Vue layer | S2.1 | ⬜ |
| S2.3 | Toast system: vue-sonner → Faqir toast behind `useToast` | 2 — Vue layer | S2.1 | ⬜ |
| S3.1 | Migrate auth pages + AuthLayout | 3 — Pages | S2.2 | ⬜ |
| S3.2 | Migrate AgentLayout app shell (sidebar/topbar/user menu) | 3 — Pages | S2.1, S2.3 | ⬜ |
| S3.3 | Migrate dashboard/index | 3 — Pages | S3.2 | ⬜ |
| S3.4 | Migrate settings/api_keys (+ placeholder page) | 3 — Pages | S3.2 | ⬜ |
| S3.5 | Migrate uploads/index (custom upload dropzone) | 3 — Pages | S3.2 | ⬜ |
| S3.6 | Migrate billing/index | 3 — Pages | S3.2 | ⬜ |
| S3.7 | Migrate admin pages (users, user_detail, promo_codes) | 3 — Pages | S3.2 | ⬜ |
| S3.8 | Migrate agent/index (AI chat) + error pages | 3 — Pages | S3.2 | ⬜ |
| S3.9 | Migrate marketing (home, about, default layout) to Faqir tokens | 3 — Pages | S1.3 | ⬜ |
| S4.1 | Edge public shell: `content.edge` on Faqir tokens/prose | 4 — Edge/PDF | S1.1 | ⬜ |
| S4.2 | PDF/document pipeline: `document.edge` layout + invoice/report templates | 4 — Edge/PDF | S4.1 | ⬜ |
| S4.3 | Adonis-aware `l-source` adapter (CSRF) + JSON API convention | 4 — Edge/PDF | S4.1 | ⬜ |
| S5.1 | Remove PrimeVue, primeicons, tailwindcss-primeui, vue-sonner | 5 — Decommission | S3.1–S3.9 | ⬜ |
| S5.2 | Remove Tailwind (verification-driven) | 5 — Decommission | S5.1 | ⬜ |
| S5.3 | Final QA: full suite, a11y, visual diff vs baseline, size report | 5 — Decommission | S5.2 | ⬜ |
| S5.4 | Lock-in: CLAUDE.md rewrite, docs, template release notes | 5 — Decommission | S5.3 | ⬜ |

~24 sessions. Phases 2/3 sessions marked with the same dependency can run in any order (or in parallel worktrees) once their dependency is done.

---

## 1. The Two Repos — Facts This Plan Is Built On

### 1.1 Proto (the target) — verified July 2026

- **Stack:** AdonisJS 7 · Inertia 2 (`@adonisjs/inertia`) · Vue 3 · PrimeVue 4 (Aura) · Tailwind 4 (CSS-first via `@tailwindcss/vite`) · pnpm · Biome · Japa.
- **SSR is scoped:** `config/inertia.ts` → `ssr.pages` limits SSR to `home` and `about` only; all authenticated pages are client-rendered. SSR entry `inertia/ssr.ts` must always mirror `inertia/app.ts`.
- **Two rendering paths (constitutional in proto's CLAUDE.md):**
  - *Inertia/Vue* → authenticated app (`inertia/pages/**`).
  - *Edge templates* (`resources/views/**`) → SEO pages, PDFs (via Puppeteer), emails. The Vite/Tailwind pipeline is **not** loaded on Edge pages; `resources/views/layouts/content.edge` carries ~150 lines of bespoke inline CSS with its own ad-hoc tokens.
- **Current UI layer:** PrimeVue registered in `app.ts` + `ssr.ts` with Aura preset, `darkModeSelector: '.dark'`, cssLayer order `theme, base, primevue`. Tailwind entry `inertia/css/app.css` with `@plugin "tailwindcss-primeui"` and `@custom-variant dark`. Icons: `primeicons`. Toasts: `vue-sonner` (`<Toaster>` in all three layouts, flash→toast via `inertia/composables/useToast.ts`).
- **Layouts / CSS scopes (3):** `layouts/default.vue` (marketing, `.marketing-layout` bare-element CSS, forced light), `layouts/AuthLayout.vue` (`.auth-layout`, forced light), `layouts/AgentLayout.vue` (app shell, PrimeVue + Tailwind `surface-*` utilities, owns dark mode).
- **Dark mode contract:** `.dark` class on `<html>`, set pre-paint by an inline script in `resources/views/inertia_layout.edge` reading `localStorage.theme`; managed by `inertia/composables/useDarkMode.ts` + `components/ThemeToggle.vue`.
- **Pages to migrate:** `auth/{login,register,forgot_password,reset_password,verify_email}`, `dashboard/index`, `settings/api_keys`, `uploads/index`, `billing/index`, `admin/{users,user_detail,promo_codes}`, `agent/index`, `errors/{not_found,server_error}`, `home`, `about`, `placeholder`.
- **Typed routes:** Tuyau (`@tuyau/core`), codegen in `.adonisjs/client/`, `<Form route="login.store">`, `urlFor()`. Untouched by this plan.
- **Shared props:** `app/middleware/inertia_middleware.ts` shares `errors`, `flash`, `auth`, `locale`. Untouched.
- **i18n:** vue-i18n catalogs `inertia/locales/messages/{ro,en}.ts` (keep); PrimeVue locales `inertia/locales/{ro,en}.ts` (delete in S5.1). Romanian default.
- **CSP is disabled** (`config/shield.ts`) — inline styles/scripts and Faqir's `new Function` evaluator are unblocked. CSRF is ON (XSRF-TOKEN cookie), except `/webhooks/stripe`.
- **Commands:** `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm typecheck` (tsc + vue-tsc), `npx biome check --write .`.
- **Conventions:** snake_case files, PascalCase Vue components, thin controllers → services, pnpm only, keep template domain-agnostic.

### 1.2 Faqir (the source) — verified July 2026 at ~v0.5

- **What it is:** zero-class attribute protocol (`data-ui` / `data-part` / `data-state` / `data-variant` / `data-size`), CSS targets attributes only, all styling via OKLCH design tokens, every component has a machine-readable manifest. Distribution is shadcn-style: `faqir add` copies source files into the project (`ui/` by default), tracked in `faqir.config.json`, bundled to one `ui/faqir.bundle.css`.
- **Registry (66 components):** ~38 primitives (CSS-only), ~22 recipes (CSS + `create<Name>(root)` JS controller), 7 patterns. Icons = CSS-mask Lucide subset via `faqir add icons --only <names>`.
- **Browser runtime:** `faqir-core.js` (~12 KB gzip) — Alpine-style `l-*` directives, auto-init of recipe controllers via MutationObserver, `l-source` declarative REST binding. **Optional** — components style themselves with CSS alone; recipe controllers are importable standalone ESM (`export function createDialog(root)`).
- **Themes:** `data-theme="light|dark|auto"` on `<html>`; 7+ themes as token-override CSS; `document` theme for print/PDF.
- **Documents/print:** `document` pattern + theme + tokens (A4/letter `@page`), primitives `key-value`, `signature`, `page-break`, `callout`, `stat`, `description-list`, `qr-code` — built for Puppeteer-style HTML→PDF.
- **Agent surface:** `@faqir-ui/mcp` stdio server (`faqir_generate`, `faqir_audit_html`, `faqir_repair_html`, …), `faqir-creator` Claude skill, `faqir context` → `.faqir/context.json`, `faqir audit --stdin --json`.
- **CLI on Node:** `bin/faqir` launcher prefers Bun but runs on plain Node ≥18 via compiled `dist/faqir.mjs` (v0.3 deliverable). Proto must NOT need Bun.
- **⚠️ Known gap:** `l-source` and `api-source.js` issue bare `fetch()` — no CSRF header, no credentials option, no hook. S4.3 solves this for proto.
- **Roadmap:** v0.6 ("Forms, Data & Documents") ships `@faqir-ui/vue` generated bindings, `field-group` validation contract, `@faqir-ui/forms`, `faqir theme generate`. **Not built at the time this plan was written** — hence the Track A/B gate in S0.1.

---

## 2. Architecture Decisions (ratified — do not re-litigate mid-session)

**D1 — Two consumption modes mirror proto's two rendering paths.**
- *Inertia/Vue app:* Faqir contributes **CSS + markup contracts + recipe controllers**. **Vue owns all reactivity.** `faqir-core.js` and every `l-*` directive are **forbidden inside `inertia/**`** (this is Faqir's own doctrine, FAQIR-NEXT §11.1: "inside Vue/React, faqir-core's directives are not used"). Data reaches pages via Inertia props; mutations go through Inertia forms/visits or Tuyau.
- *Edge pages / PDFs:* full Faqir — bundle CSS, optionally `faqir-core.js` + `l-*` + `l-source` for interactive public pages, `document` pattern/theme for PDFs. Zero-JS Edge pages (SEO articles, emails-adjacent) link CSS only.

**D2 — Track A vs Track B for Vue components (decided in S0.1).**
- *Track A (preferred, if 1.0 shipped `@faqir-ui/vue`):* use the generated bindings (`LButton`, `LDialog`, …) for recipes and form controls; use **raw `data-ui` markup** for layout/static primitives (stack, grid, surface, card, badge, text) — that is idiomatic Faqir and keeps templates greppable/auditable.
- *Track B (fallback):* raw `data-ui` markup for all primitives; hand-written thin wrappers in `inertia/components/ui/` **only** for (a) recipes that need lifecycle (`FDialog`, `FDropdown`, `FTabs`, `FToast`, `FTable`, `FPagination`, `FSidebar`, `FDatePicker`, `FCommandPalette` as needed) and (b) form controls that need `v-model` (`FInput`, `FSelect`, `FCheckbox`, `FSwitch`, `FTextarea`, `FFieldGroup`). Prefix `F*` locally so a later swap to official `L*` bindings is a mechanical rename.

**D3 — File layout in proto.**
- Faqir-managed source of truth: **`ui/` at proto root** (`faqir init --dir ui`), `faqir.config.json` at root. `ui/` is committed — you own the files.
- Vite/Inertia consumes the bundle by import from `inertia/css/app.css` (hashed, cache-busted by Vite).
- Edge/PDF consumes static copies in **`public/faqir/`** (`faqir.bundle.css`, `faqir-core.js`, `api-source.js`, `adonis-source.js`, document theme) produced by `scripts/sync_faqir_assets.mjs`, wired into `pnpm dev`/`pnpm build`. Two consumers, one source, one sync script.

**D4 — Cascade strategy during coexistence.** While PrimeVue/Tailwind are still present, the Faqir bundle is imported into a dedicated cascade layer (`@import './../../ui/faqir.bundle.css' layer(faqir);`) ordered **after** PrimeVue's layers so Faqir wins on its own attribute selectors but Faqir's element-level reset cannot fight Tailwind preflight unpredictably. After S5.2 (Tailwind gone) the import becomes unlayered and Faqir's reset is the only reset.

**D5 — Dark mode converges on `data-theme`.** Transition: `useDarkMode` + the pre-paint script write **both** `.dark` and `data-theme` (S1.3). Final state after S5.1: `data-theme` only; `.dark` and `@custom-variant dark` deleted. Marketing/auth layouts force `data-theme="light"` exactly as they force light today.

**D6 — No backend changes.** Controllers, services, transformers, validators, Tuyau, shared props, i18n plumbing, tests' data layer: untouched. If a session believes it needs a backend change, stop and record it in `docs/faqir-migration/NOTES.md` instead.

**D7 — PrimeVue leaves, then Tailwind.** PrimeVue + primeicons + tailwindcss-primeui + vue-sonner are removed in S5.1 (hard gate: zero references). Tailwind removal (S5.2) is verification-driven: after page migration, grep for utility-class usage; migrate stragglers to Faqir layout primitives/tokens; only then remove. If >30 utility usages remain that have no clean Faqir equivalent, keeping Tailwind is a legitimate outcome — record the decision, don't force it.

**D8 — Every session ends green and committed.** `pnpm typecheck` + `pnpm test` + `npx biome check --write .` all pass; commit on branch `faqir-migration` with message `faqir(S<id>): <summary>`. One session = one commit (squash local noise).

---

## 3. Global Invariants (apply to every session)

1. **Never** put `l-data`, `l-model`, `l-for`, or any `l-*` attribute in a `.vue` file.
2. **Never** add a CSS class for styling in migrated markup — Faqir styles via `data-*` attributes and tokens. (Tailwind utilities in *not-yet-migrated* files are fine until S5.2.)
3. **Never** hand-edit files under `ui/` that `faqir upgrade` manages, except through `faqir` commands or deliberate, documented drift (the pristine store tracks it — `faqir diff <component>` shows drift).
4. Keep `inertia/app.ts` and `inertia/ssr.ts` mirrored for anything you register/import in either.
5. Respect the three CSS scopes until each is migrated; do not leak Faqir resets into unmigrated scopes ahead of schedule (D4 handles this).
6. Preserve every user-visible behavior and every shared-prop contract: Japa functional tests (incl. `.withInertia()` prop assertions) must pass unmodified unless a test asserts a PrimeVue-specific DOM detail — those may be updated, and the change must be listed in the session's commit body.
7. All work happens in proto unless the session explicitly says otherwise. Use pnpm, Biome, snake_case files, PascalCase components.
8. When generating Faqir markup, follow the `faqir-creator` skill; validate non-trivial blocks with `faqir audit --stdin` (pipe the rendered HTML) or the MCP `faqir_audit_html` tool.
9. If a session discovers a Faqir bug or missing component, do **not** fork/patch `ui/` silently: record it in `docs/faqir-migration/NOTES.md` under "Upstream findings" (these feed back into the faqir repo), then work around it locally with `faqir create <name>` custom components if needed.
10. Convert relative time to absolute dates in all notes.

---

## 4. Session Prompt Template (paste into Claude Code, from proto root)

```
Read docs/faqir-migration/PLAN.md sections 2, 3 and the session block for S<X.Y>.
Also read every file listed in that session's "Read first".
Execute session S<X.Y> exactly as specified. Do not start other sessions.
When done: run the acceptance commands, fix anything red, update the tracker
row for S<X.Y> in docs/faqir-migration/PLAN.md, append a 3-6 line entry to
docs/faqir-migration/NOTES.md (what changed, surprises, upstream findings),
and commit on branch faqir-migration as: faqir(S<X.Y>): <summary>.
```

---

# PHASE 0 — PREFLIGHT

## S0.1 — Verify Faqir 1.0 deliverables; choose Track A or B

**Where:** starts in the faqir repo, ends in proto.
**Goal:** confirm the assumptions in §1.2 against what Faqir 1.0 actually shipped; ratify Track A or Track B; seed proto's migration docs.

**Read first:** `faqir/FAQIR-NEXT.md` §15 + §18, `faqir/FAQIR-PLAN.md` (final status), `faqir/package.json`, `faqir/registry/registry-index.json`.

**Steps:**
1. In the faqir repo, verify each item and record PASS/FAIL:
   - [ ] `npm view faqir-ui-cli version` reports ≥1.0.0 (or the release tag the user designates as "1.0").
   - [ ] CLI runs on plain Node: `FAQIR_FORCE_NODE=1 npx faqir-ui-cli@latest --version` (or local `bin/faqir`) without Bun on PATH.
   - [ ] `faqir init/add/bundle/audit/context/theme/upgrade` all present in `faqir help`.
   - [ ] Registry count and presence of components this plan uses: button, input, textarea, select, checkbox, radio, switch, label, field-group, card, badge, avatar, separator, spinner, progress, stepper, empty-state, nav, text, stack, grid, surface, callout, stat, kbd, skeleton, breadcrumb, chip, link, icon, dialog, alert-dialog, drawer, sheet, dropdown, popover, tooltip, tabs, accordion, combobox, select-custom, command-palette, table, pagination, toast, date-picker, sidebar, qr-code + patterns auth-form, dashboard-shell, settings-page, crud-table, document.
   - [ ] `@faqir-ui/vue` published? (`npm view @faqir-ui/vue version`) → **Track A** if yes and it covers recipes + form controls; else **Track B**.
   - [ ] `@faqir-ui/mcp` runnable: `npx @faqir-ui/mcp` (or `npx faqir-mcp`) starts a stdio server.
   - [ ] `faqir-creator` skill artifact exists (repo `.claude/skills/faqir-creator/` or `faqir context --skill`).
   - [ ] `l-source`/`api-source.js` fetch layer: does 1.0 now support custom headers/credentials (check `registry/core/api-source.js` and engine `l-source` fetch call sites)? If yes, S4.3 simplifies — note it.
   - [ ] Optional nice-to-haves that reshape sessions if present: `@faqir-ui/forms`, `faqir theme generate`, `faqir-core.d.ts`, `file-upload` recipe, `wizard`/`form-page` patterns.
2. Write the results to `proto/docs/faqir-migration/PREFLIGHT.md` (create the directory) with a clear **"TRACK: A"** or **"TRACK: B"** line and a list of plan deviations (e.g. "file-upload recipe exists → S3.5 uses it instead of custom dropzone").
3. Copy this plan file into `proto/docs/faqir-migration/PLAN.md`. If any FAIL above invalidates a session, annotate that session's block in the copied plan (do not delete it — mark `⚠ adjusted per PREFLIGHT`).
4. In proto: `git checkout -b faqir-migration`.

**Acceptance:**
- `proto/docs/faqir-migration/PREFLIGHT.md` exists with every checkbox resolved PASS/FAIL and a TRACK decision.
- `proto/docs/faqir-migration/PLAN.md` exists; tracker row S0.1 updated.
- Committed: `faqir(S0.1): preflight + track decision`.

**Guardrails:** no proto source changes beyond `docs/` and the branch. If Faqir is not actually at 1.0, STOP after writing PREFLIGHT.md and report to the user — do not begin migration against a pre-1.0 Faqir.

---

## S0.2 — Proto baseline census + screenshots

**Goal:** a before-picture the final QA (S5.3) diffs against, plus a precise inventory of what must be migrated.

**Read first:** `inertia/pages/**` (skim), `inertia/layouts/*.vue`, `inertia/css/app.css`, `inertia/composables/*.ts`.

**Steps:**
1. Verify the branch is green before touching anything: `pnpm typecheck && pnpm test && npx biome check .` — record results in `docs/faqir-migration/BASELINE.md`.
2. Census (write all of this into BASELINE.md as tables):
   - PrimeVue component usage: `grep -rn "from 'primevue/" inertia/ | sort` — one row per component × file.
   - primeicons usage: `grep -rn "pi pi-" inertia/`.
   - vue-sonner usage: `grep -rn "vue-sonner\|<Toaster" inertia/`.
   - Tailwind utility density per file (rough): `grep -rlc 'class="' inertia/pages inertia/layouts inertia/components`.
   - tailwindcss-primeui tokens: `grep -rn "surface-\|primary-" inertia/ --include="*.vue" | wc -l`.
3. Production build baseline: `pnpm build`; record client bundle sizes (JS + CSS) from the Vite output into BASELINE.md (these are the numbers Faqir must beat in S5.3).
4. Screenshots: run `pnpm dev`, capture every page listed in §1.1 in light + dark (authenticated pages require a seeded login — use existing seeders/test user; document how in BASELINE.md). Store under `docs/faqir-migration/baseline-screens/`. If browser automation is unavailable, capture at minimum: login, dashboard, admin/users, settings/api_keys, home. Screenshots are reference material — commit them.
5. Create empty `docs/faqir-migration/NOTES.md` with headings: `## Session log`, `## Upstream findings`, `## Deferred items`.

**Acceptance:** BASELINE.md complete (green-state proof, censuses, bundle sizes, screenshot index); commit `faqir(S0.2): baseline census + screenshots`.

**Guardrails:** read-only with respect to app code. No dependency changes.

---

# PHASE 1 — FOUNDATION

## S1.1 — Install Faqir CLI, init `ui/`, asset sync script

**Goal:** Faqir's file tree exists in proto, CLI is a dev dependency, and Edge-facing static assets sync to `public/faqir/`.

**Read first:** `docs/faqir-migration/PREFLIGHT.md`, proto `package.json`, `.gitignore`, faqir README "Quick Start" + "CLI Reference".

**Steps:**
1. `pnpm add -D faqir-ui-cli` (exact 1.0.x version, pin it). Verify `pnpm exec faqir --version` runs (Node launcher; no Bun requirement — if it demands Bun, STOP, record in NOTES.md, report).
2. `pnpm exec faqir init --dir ui --theme default` at proto root. Inspect the result: `ui/{tokens,base,core,primitives,recipes,patterns}/`, `faqir.config.json`, `.faqir/context.json`, `ui/faqir.bundle.css`.
3. Config hygiene: in `faqir.config.json` confirm `output_dir: "./ui"`, `bundle.auto: true`. Add `.faqir/` to `.gitignore` **except** keep `context.json` tracked if the team wants agents to read it from the repo (recommended: track it). `ui/` is fully committed.
4. Create `scripts/sync_faqir_assets.mjs` (plain Node, no deps): copies `ui/faqir.bundle.css`, `ui/core/faqir-core.js`, `ui/core/api-source.js` (if present) → `public/faqir/`, creating the dir. Idempotent, logs what it copied.
5. Wire scripts in `package.json`: `"faqir:bundle": "faqir bundle && node scripts/sync_faqir_assets.mjs"`, and append `&& node scripts/sync_faqir_assets.mjs` semantics into `dev`/`build` flows the proto way — simplest: make `pnpm dev` and `pnpm build` run `node scripts/sync_faqir_assets.mjs` first (mirror how `bin/ensure_port.js` is already chained in `dev`). `public/faqir/` is committed (deterministic, reviewable) — add it to Biome ignore if Biome complains.
6. Doctor: `pnpm exec faqir doctor` → all green.

**Acceptance:**
- `pnpm exec faqir list` shows an initialized project (0 components installed yet is fine).
- `public/faqir/faqir.bundle.css` exists after `pnpm faqir:bundle`.
- `pnpm typecheck && pnpm test` still green (nothing app-facing changed).
- Commit `faqir(S1.1): faqir init + asset sync`.

**Guardrails:** do not import anything into the Vue app yet. Do not modify `inertia/css/app.css` yet.

---

## S1.2 — Wire Faqir CSS into Vite/Inertia (coexistence)

**Goal:** the Faqir bundle loads on every Inertia page, layered so nothing existing regresses.

**Read first:** `inertia/css/app.css` (all of it), `inertia/app.ts`, `inertia/ssr.ts`, `vite.config.ts`, plan §2 D4.

**Steps:**
1. In `inertia/css/app.css`, immediately after the Tailwind/primeui imports, add:
   ```css
   @import "../../ui/faqir.bundle.css" layer(faqir);
   ```
   and declare explicit layer order at the top so the cascade is deterministic during coexistence (PrimeVue already uses `theme, base, primevue`): ensure `faqir` comes after `primevue` and before Tailwind's `utilities`. Consult Tailwind 4 + PrimeVue cssLayer docs via Context7 if the exact `@layer` statement ordering is unclear — get this right rather than fast.
2. Verify HMR: `pnpm dev`, edit a token in `ui/tokens/` — confirm the change appears (Vite watches the imported file; if not, add `ui/**` to vite `server.watch` or note that `pnpm faqir:bundle` must be rerun after CLI operations — record the actual behavior in NOTES.md).
3. Regression sweep: with `pnpm dev` running, open login, dashboard, admin/users, home in light + dark. Compare against `baseline-screens/`. Expected deltas: none, or trivially-explainable ones from Faqir's tokens (`:root` custom properties don't restyle elements by themselves; the reset is inside the layered import and must NOT visibly change PrimeVue pages — if it does, the layer ordering in step 1 is wrong; fix it now).
4. Smoke Faqir rendering: temporarily drop `<button data-ui="button" data-variant="primary">Faqir works</button>` into `pages/placeholder.vue`, verify it renders styled, screenshot it, then decide: keep placeholder.vue as the living Faqir smoke page for the whole migration (recommended — it's a template throwaway page) and leave the button in.
5. SSR parity: `pnpm build` must succeed including the SSR bundle (home/about render server-side with the new import).

**Acceptance:** visual parity on unmigrated pages (spot-check vs baseline); Faqir button renders correctly on placeholder; `pnpm build` green; `pnpm typecheck && pnpm test` green. Commit `faqir(S1.2): faqir bundle wired into vite (layered)`.

**Guardrails:** zero component migrations in this session. If layering cannot prevent reset bleed, fallback documented option: postpone Faqir's `reset.css` (rebundle with base excluded via config/`--no-core`-style options or a bundle exclusion — check `faqir bundle --help`) until S5.2, and record the deviation.

---

## S1.3 — Theme + dark mode unification (dual-write)

**Goal:** one user action toggles both dark-mode systems; Faqir components and PrimeVue components always agree on the scheme.

**Read first:** `inertia/composables/useDarkMode.ts`, `inertia/components/ThemeToggle.vue`, `resources/views/inertia_layout.edge` (pre-paint script), `layouts/default.vue` + `AuthLayout.vue` (forced-light logic), faqir `registry/themes/default.css` (how `[data-theme]` works).

**Steps:**
1. Extend `useDarkMode.ts`: wherever `.dark` is added/removed on `document.documentElement`, also set `data-theme="dark"` / `"light"`. Keep the same localStorage key and preference semantics (including "system" → set `data-theme="auto"` if the composable has an auto mode; otherwise resolve to light/dark explicitly — match existing behavior exactly).
2. Update the pre-paint inline script in `inertia_layout.edge` to set both `.dark` and `data-theme` before first paint (same logic, two writes). Keep it tiny and dependency-free.
3. Forced-light surfaces: `default.vue` and `AuthLayout.vue` currently strip `.dark` on mount — extend to also set `data-theme="light"`.
4. Verify: toggle theme on dashboard — PrimeVue surfaces AND the placeholder Faqir button both flip. Reload mid-dark — no flash of wrong theme (pre-paint works). Marketing + auth pages stay light in both.
5. Document the contract in NOTES.md: "until S5.1, `.dark` and `data-theme` are dual-written; S5.1 deletes `.dark`."

**Acceptance:** manual toggle + reload verification on 3 pages × 2 schemes; tests/typecheck/lint green. Commit `faqir(S1.3): data-theme dual-write`.

---

## S1.4 — Agent enablement (skill, MCP, context, interim CLAUDE.md)

**Goal:** every future Claude Code session in proto is Faqir-native: skill loaded, MCP available, context generated, rules written.

**Read first:** proto `CLAUDE.md`, faqir README "AI Agent Integration", PREFLIGHT.md (MCP/skill availability).

**Steps:**
1. Install the `faqir-creator` skill into proto: copy the skill directory (or unzip `faqir-creator.skill`) into `proto/.claude/skills/faqir-creator/`. If 1.0's `faqir context --skill` generates a project-scoped SKILL.md, prefer generating it here so it reflects *installed* components.
2. Register the MCP server in proto's `.mcp.json` (create if absent): `@faqir-ui/mcp` via `npx`, stdio. Verify it starts.
3. `pnpm exec faqir context --format md` → commit the generated context artifacts (`.faqir/context.json` + markdown if produced).
4. Add an interim section to proto `CLAUDE.md` titled **"UI layer — MIGRATION IN PROGRESS"** stating: Faqir is the target UI layer; new UI code MUST use Faqir (data-ui attributes, tokens, no classes); PrimeVue exists only in not-yet-migrated pages and must not be used in new code; the two-consumption-mode rule (D1: no `l-*` in Vue; Vue owns reactivity); pointer to `docs/faqir-migration/PLAN.md`. Keep proto's existing sections intact.
5. Add the session prompt template (§4) to `docs/faqir-migration/PLAN.md` top if the copy drifted.

**Acceptance:** skill visible to Claude Code in proto; MCP server listed and starts; CLAUDE.md updated; commit `faqir(S1.4): agent enablement`.

---

# PHASE 2 — VUE INTEGRATION LAYER

## S2.1 — Add the component set; recipe lifecycle composable

**Goal:** all needed Faqir components installed under `ui/`; a single composable pattern makes any recipe controller usable from Vue with correct lifecycle.

**Read first:** PREFLIGHT.md (Track decision), faqir README "JavaScript Controllers", one recipe controller source (e.g. `ui/recipes/dialog/dialog.js` after install), `inertia/tsconfig.json` + `vite.config.ts` (aliases).

**Steps:**
1. Install components (one command, dependency resolution is automatic):
   `pnpm exec faqir add button input textarea select checkbox radio switch label field-group card badge avatar separator spinner progress stepper empty-state nav text stack grid surface callout stat kbd skeleton breadcrumb chip link dialog alert-dialog drawer dropdown popover tooltip tabs accordion combobox select-custom command-palette table pagination toast date-picker sidebar`
   plus icons: `pnpm exec faqir add icons --only check,x,chevron-down,chevron-right,chevron-left,menu,search,plus,trash-2,pencil,eye,eye-off,sun,moon,globe,user,settings,log-out,upload,download,credit-card,key,shield,alert-triangle,info,copy,external-link,loader-circle,bell,home,file-text` (extend the list as pages need; rerunning `--only` merges).
   Then `pnpm faqir:bundle`.
2. **Track A:** `pnpm add @faqir-ui/vue`; register nothing globally (import per use, matching proto's PrimeVue convention); confirm SSR-safety note from the package docs; write a 20-line usage example into `pages/placeholder.vue`. Skip steps 3–4.
3. **Track B:** create `inertia/composables/useFaqirRecipe.ts`:
   - Signature: `useFaqirRecipe<T>(factory: (el: HTMLElement) => T, elRef: Ref<HTMLElement | null>): { api: ShallowRef<T | null> }`.
   - `onMounted` → `api.value = factory(elRef.value!)`; `onBeforeUnmount` → `api.value?.destroy?.()`.
   - SSR-safe (guards on `typeof window`), no faqir-core import.
4. **Track B:** add a Vite alias `#ui/*` → `./ui/*` (both `vite.config.ts` and `inertia/tsconfig.json` paths) so wrappers do `import { createDialog } from '#ui/recipes/dialog/dialog.js'`. Add a `.d.ts` shim (`inertia/types/faqir.d.ts`) declaring the controller factory modules (`declare module '#ui/recipes/*/*.js'` with a generic `create*` export) — refine per-recipe types only where used.
5. Prove the pattern: build `inertia/components/ui/FDialog.vue` (Track B) or use `LDialog` (Track A) on `placeholder.vue`: trigger button opens it, Escape closes, focus is trapped. This is the reference implementation every Phase 3 session copies.
6. Confirm the auto-generated `ui/core/faqir.js` (auto-init) is NOT imported anywhere in `inertia/` — auto-init belongs to Edge pages only.

**Acceptance:** placeholder page demonstrates a working dialog (open/close/focus/Escape) client-side; `pnpm build` (incl. SSR) green; typecheck/tests/lint green. Commit `faqir(S2.1): component set + recipe lifecycle`.

**Guardrails:** no page migrations. Do not import `faqir-core.js` in the Vue app — controllers only.

---

## S2.2 — Form-control wrappers with `v-model`

**Goal (Track B; Track A = verify bindings cover this and write the mapping table instead):** typed, `v-model`-capable wrappers so migrated forms are as ergonomic as PrimeVue was.

**Read first:** `ui/primitives/{input,select,checkbox,switch,textarea,field-group}/*.html` + manifests (anatomy!), `pages/auth/login.vue` (current form idiom with Inertia `<Form>`), the `faqir-creator` skill references for form markup.

**Steps:**
1. Create in `inertia/components/ui/`: `FInput.vue`, `FTextarea.vue`, `FSelect.vue`, `FCheckbox.vue`, `FSwitch.vue`, `FRadioGroup.vue`, `FLabel.vue`, `FFieldGroup.vue`, `FButton.vue`.
   - Each renders the exact manifest markup (`data-ui`, parts, variants as typed props: `variant?: 'primary' | ...` unions copied from the manifest), `defineModel()` for two-way binding, passes through `disabled`, `name`, `id`, `required`, and ARIA attrs, forwards slots.
   - `FFieldGroup` handles label + control + error/description wiring (`aria-describedby`, `aria-invalid`, `data-state="error"`) and accepts an `error?: string` prop — designed to plug Inertia's `errors` shared prop straight in.
   - `FButton` maps `loading?: boolean` → `data-state="loading"` + disables.
2. Keep them dumb: no validation logic, no fetch, no global state. Styling comes 100% from the Faqir bundle — the wrappers ship no CSS.
3. Build a kitchen-sink section on `placeholder.vue`: every wrapper bound to a local `ref`, an error-state field-group, a loading button. Verify keyboard + screen-reader basics (labels associated, error announced via aria-describedby).
4. `vue-tsc` must fully type `v-model` on each (no `any` leaks).

**Acceptance:** kitchen-sink renders and binds correctly in light+dark; typecheck/tests/lint green; commit `faqir(S2.2): form wrappers`.

---

## S2.3 — Toasts: vue-sonner → Faqir toast behind the existing API

**Goal:** swap the toast engine without touching call sites: `useToast.ts` keeps its public signature, `useFlashToasts()` keeps working.

**Read first:** `inertia/composables/useToast.ts` (entire), the three layout files (where `<Toaster>` mounts), `ui/recipes/toast/toast.js` + manifest.

**Steps:**
1. Create `inertia/components/ui/FToaster.vue`: renders the Faqir toast region markup, initializes the toast controller via the S2.1 pattern, and exposes the controller through a tiny module-level singleton (`inertia/composables/toast_bus.ts`) so `useToast()` can enqueue from anywhere (Vue-owned state; no faqir-core).
2. Rewrite `useToast.ts` internals to call the Faqir controller (map existing semantics: success/error/info variants, auto-dismiss timing, top-center position). **Do not change its exported API.** `useFlashToasts()` (flash-prop watcher) stays identical.
3. Replace `<Toaster position="top-center" rich-colors />` with `<FToaster />` in all three layouts; remove the `vue-sonner/style.css` import from `app.ts` (and ssr.ts if present). Leave the vue-sonner package installed until S5.1 (removal session owns dependency deletion).
4. Verify: trigger a flash (e.g. failed login) → toast appears; success path (e.g. locale switch or any flashing action) → success toast; stacking + auto-dismiss work; dark mode styles correct.

**Acceptance:** flash→toast works on at least 2 real flows; no call-site changes outside `useToast.ts`/layouts; green + commit `faqir(S2.3): faqir toasts`.

---

# PHASE 3 — PAGE MIGRATION

**Shared method for every S3.x session (read once, apply each time):**
1. Read the target page(s) + the census rows for them in BASELINE.md.
2. Rebuild the template with: raw `data-ui` markup for layout/static primitives (stack/grid/surface/card/badge/text/callout/stat/separator/skeleton/empty-state), `F*`/`L*` wrappers for form controls and recipes. Replace `pi pi-*` icons with `<span data-ui="icon" data-icon="...">` (add missing glyphs via `faqir add icons --only ...` + rebundle).
3. Keep ALL logic identical: same Inertia `<Form route>`/`router` calls, same props, same composables, same i18n keys ($t usage unchanged).
4. Remove now-unused PrimeVue imports from the migrated file(s) only.
5. Verify against baseline screenshots: same information architecture, both schemes (except forced-light scopes), mobile width (grid auto-stack <640px).
6. Validate a representative rendered block with `faqir audit --stdin` (paste the browser-rendered outerHTML, not the .vue source).
7. Acceptance for every S3.x: page functions end-to-end (submit forms, navigate, paginate…), Japa green (update only PrimeVue-DOM-coupled assertions, list them in the commit body), typecheck/lint green, commit `faqir(S3.x): <pages>`.

## S3.1 — Auth pages + AuthLayout
**Scope:** `layouts/AuthLayout.vue`, `pages/auth/{login,register,forgot_password,reset_password,verify_email}.vue`, `components/GoogleButton.vue`.
**Notes:** model on the `auth-form` pattern (`ui/patterns/auth-form/`). AuthLayout's `.auth-layout` bare-element CSS in `app.css` shrinks or disappears — replace with surface/stack/card markup; keep forced-light behavior (S1.3). GoogleButton becomes an `FButton variant="outline"` with the Google mark inline SVG. Wire Inertia `errors` into `FFieldGroup error` — this is the first real test of S2.2. The 5 pages are small and share structure: do all 5 in this one session.

## S3.2 — AgentLayout app shell
**Scope:** `layouts/AgentLayout.vue`, `components/SidebarNav.vue`, `components/ThemeToggle.vue`, `components/LanguageSwitcher.vue`.
**Notes:** the highest-risk session — every authenticated page renders inside this. Use the `sidebar` recipe (collapsible rail/mobile drawer) + `nav` + `dropdown` (user menu) + `avatar`; consult `dashboard-shell` pattern for composition. Replace all `surface-*`/`dark:` Tailwind utilities in these files with Faqir layout primitives + tokens. ThemeToggle keeps `useDarkMode` (dual-write from S1.3); LanguageSwitcher becomes a Faqir dropdown, keeps `PUT /locale` flow. Test: sidebar collapse persists across navigation (Inertia persistent layout), mobile drawer opens/closes, user menu logout works, keyboard nav through the menu.

## S3.3 — Dashboard
**Scope:** `pages/dashboard/index.vue`. Stat cards → `stat` primitive in a `grid`; any placeholder content → `empty-state`. Small session — also use it to fix anything the S3.2 shell got subtly wrong (first full page inside the new shell).

## S3.4 — Settings: API keys (+ retire placeholder demo)
**Scope:** `pages/settings/api_keys.vue`, `pages/placeholder.vue`.
**Notes:** typical CRUD-ish page: `table` recipe (key list), `dialog` (create/reveal key), `FInput` + copy-to-clipboard button (`icon` copy), destructive confirm via `alert-dialog`. Model on `settings-page`/`crud-table` patterns. Once done, strip the placeholder kitchen-sink down to a minimal Faqir smoke section (or keep it as the living style-guide page — recommended; rename heading "UI Kitchen Sink").

## S3.5 — Uploads
**Scope:** `pages/uploads/index.vue`.
**Notes:** PrimeVue `FileUpload` has no Faqir registry equivalent (unless PREFLIGHT found a `file-upload` recipe — then use it). Otherwise build `inertia/components/ui/FUploadZone.vue`: a styled dropzone using Faqir primitives (surface + callout + icon + progress), native `<input type="file">`, drag-over via `data-state="dragover"`, emits `files` — upload itself keeps whatever mechanism the page uses today (Inertia/XHR to the existing controller). Image previews/thumbnails keep existing markup with `image` primitive. If drift from registry is needed, prefer `pnpm exec faqir create upload-zone --kind recipe` so the custom component lives in `ui/` and is bundled/audited like everything else — decide based on whether it's reusable template material (it is — choose `faqir create`).

## S3.6 — Billing
**Scope:** `pages/billing/index.vue`. Plan cards → `card` + `badge` + `key-value`; invoice list → `table`; portal/checkout buttons → `FButton` (links via `link` or button-as-anchor per manifest). Stripe logic untouched.

## S3.7 — Admin
**Scope:** `pages/admin/{users,user_detail,promo_codes}.vue`.
**Notes:** the `crud-table` pattern is the blueprint: `table` (sortable columns as today), `pagination`, filters (`FInput` search, `FSelect`), row actions via `dropdown`, edits via `dialog`, destructive actions via `alert-dialog`. `user_detail` → `description-list`/`key-value` + tabs if present. This is likely the largest session; if it overruns, split promo_codes into a follow-up half-session S3.7b and record it in the tracker.

## S3.8 — Agent chat + error pages
**Scope:** `pages/agent/index.vue`, `pages/errors/{not_found,server_error}.vue`.
**Notes:** chat UI = stack + card/surface bubbles + `FInput`/`FTextarea` composer + `spinner`/`skeleton` streaming states; keep the AI SDK streaming logic byte-identical. Error pages → `empty-state` + button home. Error pages render outside AgentLayout — check which layout they use and keep it.

## S3.9 — Marketing pages + default layout
**Scope:** `layouts/default.vue`, `pages/home.vue`, `pages/about.vue`, the `.marketing-layout` block in `inertia/css/app.css`, `components/Seo.vue` untouched.
**Notes:** these are SSR pages — after migration run `pnpm build` and verify SSR output renders Faqir markup server-side (view-source shows `data-ui` attributes; no hydration warnings in console). Replace bare-element CSS with Faqir `prose` + tokens + layout primitives; forced light stays. Delete the now-dead `.marketing-layout` CSS from app.css. SEO meta/JSON-LD flows untouched.

---

# PHASE 4 — EDGE / DOCUMENT SURFACE

## S4.1 — Edge public shell on Faqir
**Goal:** `resources/views/layouts/content.edge` stops carrying bespoke CSS and consumes Faqir from `public/faqir/`.

**Read first:** `resources/views/layouts/content.edge` (entire — note slots hero/toc/main and the cspNonce usage), `resources/views/pages/{article,guides}.edge`, `app/services/content/guides.ts` (view model — do not change), faqir `base/prose.css`.

**Steps:**
1. Replace the inline `<style>` block with `<link rel="stylesheet" href="/faqir/faqir.bundle.css">` + a *small* inline override block only for what Faqir genuinely lacks (target: <30 lines; the old ~150-line block dies).
2. Rebuild the shell structure with Faqir markup: topbar → `nav`, hero → surface/stack/text, TOC → nav variant, article body → `prose`, footer → stack. Zero JS remains zero JS (no faqir-core here).
3. Force `data-theme="light"` on `<html>` in this layout (public content is light, matching today), or wire a theme if the design calls for it — default: light.
4. Verify every consumer: `/` guides routes, `article.edge`, `seo_smoke.edge` render correctly (`pnpm dev`, hit the routes). Run `faqir audit --stdin` on one rendered article's HTML — fix findings.
5. Japa functional tests for guides/seo must stay green (they assert content/meta, not CSS — confirm).

**Acceptance:** all Edge content pages render on Faqir with ≤30 lines of page-specific CSS; audit clean; tests green; commit `faqir(S4.1): edge shell on faqir`.

## S4.2 — PDF/document pipeline
**Goal:** proto gets a first-class Faqir document layout for Puppeteer PDFs — the template's "print story".

**Read first:** faqir `ui/patterns/document/` + `document` theme + `tokens/document.css`, proto's Puppeteer usage (grep `puppeteer` in `app/services/`), CLAUDE.md "PDFs from HTML" note.

**Steps:**
1. `pnpm exec faqir theme set` — NO: keep app theme as-is; instead add the document theme file to the sync script output (`public/faqir/faqir.document.css` — bundle it via `faqir bundle --output` with the document theme or copy the prebuilt per-theme bundle if 1.0 ships one; PREFLIGHT knows).
2. Create `resources/views/layouts/document.edge`: A4 default, links `/faqir/faqir.document.css`, exposes slots (header, body, footer) using the `document` pattern markup (page-break, signature, key-value, table, qr-code available).
3. Create one demonstration template `resources/views/pdfs/sample_report.edge` (generic, domain-agnostic — e.g. "Account summary") rendered from a tiny service method + an ace-testable route or command (`node ace` command preferred to keep it out of HTTP; follow thin-controller doctrine).
4. Render it through the existing Puppeteer service to `tmp/` PDF; verify page geometry (A4 margins), page-break behavior across 2+ pages, table print compactness, signature block.
5. Document usage in `docs/faqir-migration/NOTES.md` + a short `docs/PDF.md` (how to add a new PDF template in 5 steps).

**Acceptance:** a real PDF file generated locally from the new layout, visually correct; commit `faqir(S4.2): document/pdf pipeline`.

## S4.3 — Adonis-aware data binding for interactive Edge pages
**Goal:** make `l-source`/`apiSource` safely usable on Edge pages against Adonis (CSRF + credentials), and codify the JSON API convention.

**Read first:** PREFLIGHT.md item on the fetch layer (if 1.0 added header/credential hooks, use them and simplify), `public/faqir/api-source.js`, `config/shield.ts` (CSRF config), an existing JSON controller (`app/controllers/api/me_controller.ts`).

**Steps:**
1. Create `public/faqir/adonis_source.js`: wraps/patches the fetch layer to (a) read the `XSRF-TOKEN` cookie and send it as `X-XSRF-TOKEN` on POST/PATCH/DELETE, (b) set `credentials: 'same-origin'` explicitly. Implementation depends on 1.0's hook surface: prefer a documented hook; else a thin `apiSource`-compatible factory that delegates. No faqir-core patching.
2. Add it to the sync script sources (it lives in `scripts/` or `ui/core/` as the source of truth — pick `ui/core/` via `faqir create`-adjacent custom file only if the CLI tolerates it; otherwise keep source in `resources/js/` and sync to `public/faqir/`). Keep it <80 lines.
3. Build a working demo: an interactive Edge page (e.g. `resources/views/pages/demo_tasks.edge`, dev-only route behind `NODE_ENV !== 'production'` guard or a `/dev/` route group) with full Faqir runtime: bundle CSS + `adonis_source.js` + `faqir-core.js`, an `l-source:items="/api/demo-tasks"` CRUD list against a throwaway in-memory or DB-less service — OR, if adding even a demo endpoint violates template purity, write the demo against the existing `api.me` read-only endpoint (list of one) and document the write-path pattern in prose. Decide by proto's "domain-agnostic" rule; prefer the read-only demo + documented pattern.
4. Write `docs/EDGE_INTERACTIVE.md`: when to use this (public interactive pages) vs Inertia (authenticated app), the CSRF story, the `no l-* in Vue` rule restated.
5. Verify: demo page loads, fetches with session cookie, and a mutating call (if implemented) passes Shield's CSRF check.

**Acceptance:** demo functional in dev; docs written; commit `faqir(S4.3): adonis l-source adapter`.

---

# PHASE 5 — DECOMMISSION & LOCK-IN

## S5.1 — Remove PrimeVue, primeicons, tailwindcss-primeui, vue-sonner
**Hard gates before any deletion (all must return zero):**
```bash
grep -rn "from 'primevue" inertia/            # 0 hits
grep -rn "pi pi-" inertia/                    # 0 hits
grep -rn "vue-sonner" inertia/                # 0 hits
grep -rn "primeuix\|@primeuix" inertia/       # 0 hits
grep -rn "tailwindcss-primeui" inertia/       # 0 hits (css plugin line counts)
```
If any hit remains → that page's S3.x session is incomplete; go fix it there first.
**Steps:** remove PrimeVue registration + Aura/locale imports from `app.ts` AND `ssr.ts`; delete `inertia/locales/{en,ro}.ts` (PrimeVue locales — vue-i18n catalogs in `locales/messages/` stay); update `useLocale.ts` to drop PrimeVue locale syncing; remove `@plugin "tailwindcss-primeui"` from `app.css`; drop the `.dark` dual-write (S1.3) → `data-theme` only: update `useDarkMode.ts`, the pre-paint script in `inertia_layout.edge`, forced-light layouts, and delete `@custom-variant dark` once no `dark:` utilities remain (check — if S5.2 hasn't run, `dark:` utilities may still exist; in that case keep the variant until S5.2 and note it); `pnpm remove primevue @primeuix/themes primeicons tailwindcss-primeui vue-sonner`.
**Acceptance:** app boots, all pages render, theme toggle works on `data-theme` alone, full Japa suite + typecheck + build (incl. SSR) green. Commit `faqir(S5.1): remove primevue stack`.

## S5.2 — Remove Tailwind (verification-driven)
**Steps:** census first: `grep -rn 'class="' inertia/ --include='*.vue'` and classify — Tailwind utilities vs. semantic hooks vs. third-party needs. Migrate every remaining utility usage to Faqir primitives/tokens (layout → stack/grid/surface; spacing/typography → tokens or, rarely, a scoped `<style>` using Faqir tokens). Then: remove `@import "tailwindcss"` and `@tailwindcss/vite` from `app.css`/`vite.config.ts`, `pnpm remove tailwindcss @tailwindcss/vite`, unlayer the Faqir import (D4 final state), slim `app.css` to: Faqir import + any residual app-specific CSS (target <50 lines).
**Escape hatch (legitimate):** if classification finds real, irreducible utility needs (>30 sites), STOP, write the case in NOTES.md, keep Tailwind, and adjust CLAUDE.md wording in S5.4 to "Tailwind allowed for layout edge-cases only". Do not grind through a forced migration that worsens the code.
**Acceptance:** either Tailwind fully removed with all pages visually intact, or the documented keep-decision; green + commit `faqir(S5.2): remove tailwind` (or `faqir(S5.2): tailwind keep-decision`).

## S5.3 — Final QA
**Steps:**
1. Full suite: `pnpm test`, `pnpm typecheck`, `npx biome check .`, `pnpm build` (client + SSR).
2. Visual pass: re-screenshot every page from S0.2's list (same auth/seed method) into `docs/faqir-migration/final-screens/`; compare side-by-side with baseline — differences should be *intentional restyling only*, no lost functionality/content. Note diffs in NOTES.md.
3. A11y: run axe (via `@japa/browser-client`/Playwright, or the browser devtools axe extension) on: login, dashboard, admin/users, settings, home, one Edge article. Zero serious/critical violations — fix or file.
4. Size report: record client JS + CSS bundle sizes vs BASELINE.md numbers in `docs/faqir-migration/RESULTS.md` (expect a large JS win from dropping PrimeVue). Include `public/faqir/*` sizes.
5. Protocol conformance: `pnpm exec faqir audit` over any plain-HTML surfaces it can see + `--stdin` spot-checks of 3 rendered app pages; zero errors.
6. Fresh-clone boot check (template guarantee): clone proto to a temp dir, `pnpm i`, `pnpm dev` with zero external creds — must boot (proto's optional-module rule).
**Acceptance:** RESULTS.md complete with all six gates green; commit `faqir(S5.3): final QA`.

## S5.4 — Lock-in: docs + template release
**Steps:**
1. Rewrite proto `CLAUDE.md` UI sections: replace every PrimeVue mention; new canon: *"UI layer: Faqir UI (zero-class, manifest-driven). App reactivity: Vue via Inertia props. Rules: data-ui attributes + tokens only, no CSS classes for styling, no `l-*` directives in Vue files, recipes via wrappers in `inertia/components/ui/`, add components with `pnpm exec faqir add`, always rebundle + sync, validate markup with `faqir audit --stdin`, Edge pages use `public/faqir/` assets, PDFs use `layouts/document.edge`."* Keep the two-rendering-paths doctrine, updated.
2. Update `docs/FEATURES.md` (UI module entry), delete stale PrimeVue references across `docs/`.
3. Write `docs/UI.md`: how to add a component, add an icon, create a custom component (`faqir create`), theme/dark-mode contract, upgrade flow (`faqir diff` / `faqir upgrade`), the kitchen-sink page.
4. Move `docs/faqir-migration/` → keep as historical record; add a final entry to NOTES.md; flip all tracker rows.
5. Merge `faqir-migration` → `main` (PR with a summary generated from NOTES.md), tag proto (e.g. `template-faqir-1.0`).
6. Report "Upstream findings" from NOTES.md back to the faqir repo as issues/notes.
**Acceptance:** merged, tagged, docs coherent; a brand-new Claude Code session in proto, told only "add a small settings page", produces Faqir markup unprompted (spot-test it).

---

## 5. Risks & Gotchas Register (consult when a session hits weirdness)

| # | Risk | Watch for | Mitigation |
|---|------|-----------|------------|
| R1 | Faqir reset vs Tailwind preflight during coexistence | Unmigrated pages shift spacing/borders after S1.2 | D4 layering; fallback: exclude Faqir base from bundle until S5.2 |
| R2 | PrimeVue cssLayer order interplay | PrimeVue components restyled after S1.2 | Explicit `@layer` order statement; test matrix in S1.2 step 3 |
| R3 | SSR divergence | home/about hydration warnings, build failures | Mirror app.ts/ssr.ts always (Invariant 4); S3.9 explicit SSR check |
| R4 | Dark-mode split brain during transition | Faqir dark + PrimeVue light on same screen | S1.3 dual-write is atomic — both writes in the same function, no partial paths |
| R5 | `l-source` CSRF failures on Edge | 403s on POST from Edge demo | S4.3 adapter; never use bare `apiSource` for mutations |
| R6 | Icon glyph gaps | Missing icon renders as empty box | `faqir add icons --only …` merges; add per-session as needed; `icon-name` audit rule catches unknowns |
| R7 | Bundle staleness | Styles missing for a just-added component | `bundle.auto: true` covers CLI ops; sync script chained into dev/build; when in doubt `pnpm faqir:bundle` |
| R8 | vue-tsc friction on wrapper props/controller imports | `any` leaks, red builds | S2.1 step 4 shims; type unions copied from manifests |
| R9 | Japa assertions coupled to PrimeVue DOM | Test failures in Phase 3 | Allowed to update; must be listed in commit body (Invariant 6) |
| R10 | Session scope blowout (esp. S3.2, S3.7) | Half-migrated page at session end | Split rule: finish a coherent subset, mark tracker 🔶 with exact remainder, spawn S<x>b |
| R11 | Faqir upgrade drift after customizing `ui/` files | `faqir upgrade` conflicts later | Prefer `faqir create` for custom needs; run `faqir diff` before any upgrade; Invariant 3 |
| R12 | CSP enabled later in proto | faqir-core's `new Function` breaks Edge interactive pages | Documented in EDGE_INTERACTIVE.md (S4.3): CSP needs `unsafe-eval` for `l-*` pages; CSS-only Edge pages unaffected |

## 6. Session-Independence Rules (why this plan survives context resets)

- Every session names its **Read first** files — no session assumes memory of another session's diff beyond what's committed + tracker/NOTES entries.
- State lives in three committed files: `PLAN.md` (tracker), `NOTES.md` (log + findings + deferrals), `PREFLIGHT.md` (environment truth). A fresh Claude Code session needs nothing else.
- The kitchen-sink `placeholder.vue` page is the living proof-of-integration; if a session breaks something foundational, it shows there first.
- If a session cannot meet acceptance, it must leave the branch green (revert incomplete work or gate it), set 🔶/❌ with the exact remainder, and stop. Never leave red for the next session.

---

*Authored 2026-07-12 in the faqir repo, from a joint code audit of faqir@0.2.4 (v0.5 frontier) and proto@main. Re-validate §1 facts in S0.1 when 1.0 lands — repos will have moved.*
