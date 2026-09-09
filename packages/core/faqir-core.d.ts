// TypeScript declarations for the Faqir engine — `@faqir-ui/core`.  [task 1.0-02 · §A6]
//
// Faqir has no build step and ships no TypeScript: `registry/core/faqir-core.js`
// is hand-written ES5-in-a-UMD-closure, and this file is the contract stated
// beside it rather than emitted from it. Two things keep the two honest:
//
//   • `tests/core/faqir-core-types.test.ts` enumerates the LIVE `Faqir` object,
//     the live `window.__FAQIR_DEVTOOLS__` handle, the engine's `@ui:magic`
//     declarations and every recipe's `@ui:provides` header, and holds each of
//     them against what is declared below — in BOTH directions, so a member
//     added to the engine and a member declared here that the engine does not
//     have are equally a failure.
//   • `tests/fixtures/types/` is compiled by `tsc` with this file on the path:
//     correct usage must compile, and every `@ts-expect-error` line must
//     actually error. Both directions again — a declaration loose enough to
//     accept misuse fails the same way a declaration too tight to accept
//     correct code does.
//
// Consumption. Two shapes are typed here, and this file is the `import` one:
//
//     import Faqir from "@faqir-ui/core";          // default: the whole engine
//     import { start, reactive } from "@faqir-ui/core";  // named, one per member
//     <script src="…/faqir-core.min.js"></script>  // window.Faqir, window.__FAQIR_DEVTOOLS__
//
// Module shape. This file is an ES module, matching `dist/faqir-core.mjs`, which
// is what the package's `import` condition resolves to. It used to be
// `export = Faqir` — the CommonJS form — in a file the package's
// `"type": "module"` classifies as ESM, which is illegal (TS1192 under both
// `node16` and `bundler`) and was the type-level half of a bug whose runtime
// half was `SyntaxError: … does not provide an export named 'default'`.
//
// The interfaces are therefore declared at MODULE level and aliased into a
// `Faqir` namespace, rather than the other way round. Both spellings keep
// working —
//
//     import Faqir, { type ControllerApis } from "@faqir-ui/core";
//     type A = Faqir.ControllerApis["dialog"];   // through the default import
//     type B = ControllerApis["dialog"];         // as a named type
//
// — and, because the interfaces are real module exports now, the augmentation
// form below merges with them for real. Under the old `export =` shape a
// consumer's `declare module "@faqir-ui/core" { interface PluginMagics {…} }`
// merged only by accident of the namespace/module identification; under a
// default export it would have silently declared a SECOND, unrelated interface
// and every augmented member would have fallen through `Scope`'s index
// signature as `unknown`.
//
// Security. The evaluator compiles every `l-*` expression with `new Function`,
// so a page running Faqir needs `script-src … 'unsafe-eval'`, and `l-html`
// writes markup unsanitized by design. Neither is a fact the type system can
// carry — read `docs/security.md` before pointing Faqir at anything a user
// typed.

// ─────────────────────────────────────────────────────────────────────────
// Reactivity
// ─────────────────────────────────────────────────────────────────────────

/** What `effect()` and `$watch()` hand back: call it to stop tracking. */
export type Disposer = () => void;

// ─────────────────────────────────────────────────────────────────────────
// Scope + magics
// ─────────────────────────────────────────────────────────────────────────

/**
 * The magic properties the engine defines on every scope, exactly as the
 * `@ui:magic` block in `src/core-src/engine.js` declares them.
 *
 * They are non-enumerable by construction, which is why `inspect().scope`
 * (a plain deep copy) never contains them and why the drift test reads the
 * engine's declarations rather than `Object.keys` of a live scope.
 */
export interface Magics {
  /**
   * The scope ROOT — the element carrying `l-data`, not the element the
   * expression is written on. Every magic that walks the DOM starts here.
   */
  readonly $el: Element;
  /** The scope's `l-ref` elements, keyed by name. */
  readonly $refs: Record<string, Element>;
  /** Every store registered with `Faqir.store()`. */
  readonly $store: Stores;
  /**
   * `data-state` of the `[data-ui]` closest to the scope root. Writable —
   * assigning sets the attribute — and reads re-run when a controller
   * changes it. `undefined` when there is no `[data-ui]` in reach.
   */
  $state: string | undefined;
  /** `data-variant` of that same `[data-ui]`, writable and observed alike. */
  $variant: string | undefined;
  /**
   * The controller API of that same `[data-ui]` — and a lookup for any other.
   *
   * `$ui.open()` reaches the controller of the component this expression sits
   * inside. `$ui('#detail-drawer').open()` reaches another component's, named by
   * a CSS selector, and returns `null` when nothing matches or the match has no
   * controller — so `$ui('#maybe')?.open()` is the safe form. [W2-6]
   *
   * Only `destroy()` is universal — the rest of the surface differs per
   * component, and the engine returns whatever the controller returned. Cast to
   * the component's entry in {@link ControllerApis} to reach the rest:
   * `($ui as unknown as Faqir.ControllerApis["dialog"]).open()`, or
   * `$ui('#d') as Faqir.ControllerApis["dialog"] | null`.
   */
  readonly $ui: UiHandle;
  /** Fires a bubbling, composed `CustomEvent` from the scope root. */
  readonly $dispatch: (event: string, detail?: unknown) => boolean;
  /** Queues `fn` as a microtask, after the effects a mutation queued flush. */
  readonly $nextTick: (fn?: () => void) => void;
  /** Watch one scope key. Returns a disposer. */
  readonly $watch: <T = unknown>(
    key: string,
    callback: (value: T, previous: T) => void,
  ) => Disposer;
  /** `$id('label')` → `faqir-<scope>-label`, stable and unique per scope. */
  readonly $id: (name: string) => string;
  /**
   * The DOM event being handled. Set for the duration of an `l-on` handler
   * and deleted again after it, so it reads as `undefined` anywhere else.
   */
  readonly $event?: Event;
}

/**
 * Extension point for magics a plugin registers with `Faqir.magic()`.
 *
 * Empty here on purpose: `$persist` exists only on a page that loaded
 * `plugins/faqir-persist.js`, so declaring it unconditionally would type a
 * property that is usually not there. Declare the ones you load:
 *
 *     declare module "@faqir-ui/core" {
 *       interface PluginMagics {
 *         $persist: (key: string, value?: unknown) => unknown;
 *       }
 *     }
 *
 * The interfaces are module-level exports, so an augmentation names one
 * directly — there is no `namespace Faqir` wrapper to reach through. The same
 * form opens {@link ControllerApis} and {@link Stores}.
 */
export interface PluginMagics {}

/**
 * A live reactive scope: the `l-data` object, the `data-prop-*` values merged
 * over it, whatever `l-source` injected, and the magics on its prototype.
 *
 * The index signature is `unknown` rather than `any` because the members are
 * genuinely unknown at compile time — narrow or cast at the point of use
 * instead of letting a typo through the whole file.
 */
export interface Scope extends Magics, PluginMagics {
  [key: string]: unknown;
}

/**
 * Every store registered with `Faqir.store()`. Augmentable, the same way
 * {@link PluginMagics} is, when a project wants its stores typed by name.
 */
export interface Stores {
  [name: string]: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────
// Directives
// ─────────────────────────────────────────────────────────────────────────

/**
 * One parsed `l-*` / `:` / `@` attribute, as a directive handler receives it.
 *
 * `arg` is present only for the argument-taking forms (`l-bind:<attr>`,
 * `l-on:<event>`, `l-source:<name>`) — the parser does not set the key at all
 * otherwise, which is why it is optional here and `string | null` on
 * {@link InspectedDirective}, where `inspect()` normalizes it.
 */
export interface Directive {
  /** Directive name without the `l-` prefix: `bind`, `on`, `text`, … */
  type: string;
  arg?: string;
  /** The attribute's value, uncompiled. */
  expression: string;
  /** Dot-suffixes, in source order: `l-on:input.debounce500ms` → `["debounce500ms"]`. */
  modifiers: string[];
  /** The attribute name as authored. */
  raw: string;
}

/**
 * {@link Directive} as `inspect()` reports it — the same five keys, with
 * `arg` normalized to `null` instead of being absent. Written out rather
 * than `Omit<Directive, "arg">` so the published surface reads as itself;
 * the drift test holds the two member lists against each other.
 */
export interface InspectedDirective {
  type: string;
  arg: string | null;
  expression: string;
  modifiers: string[];
  raw: string;
}

/**
 * A handler registered with `Faqir.directive()`. Return a cleanup function to
 * have it run when the owning scope is destroyed (`l-if` hide, keyed `l-for`
 * removal, `Faqir.destroy()`).
 */
export type DirectiveHandler = (
  el: Element,
  directive: Directive,
  scope: Scope,
) => void | Disposer;

/**
 * A magic registered with `Faqir.magic()`. Resolved lazily on every read, so
 * it receives the final reactive scope rather than the object being built.
 */
export type MagicFactory = (el: Element, scope: Scope) => unknown;

/** A function passed to `Faqir.plugin()`; it receives the engine itself. */
export type Plugin = (faqir: FaqirGlobal) => void;

// ─────────────────────────────────────────────────────────────────────────
// l-source
// ─────────────────────────────────────────────────────────────────────────

/**
 * The CRUD controller `l-source:<name>` injects into the scope as `$<name>`,
 * beside the `<name>`, `<name>Loading` and `<name>Error` properties.
 *
 * Every method resolves rather than rejects: a failed request writes
 * `<name>Error` and settles. Once the owning scope is destroyed the methods
 * are inert and in-flight requests are aborted.
 */
export interface SourceController<T = Record<string, unknown>> {
  /** (Re)load the collection. A newer call aborts and supersedes an older one. */
  load(): Promise<void>;
  /** POST. Resolves with the created record, or `null` when the request failed. */
  create(payload: Partial<T>): Promise<T | null>;
  /** PATCH by identity key (`id` unless `.key.<name>` said otherwise). */
  update(id: string | number, payload: Partial<T>): Promise<T | null>;
  /** DELETE by identity key. */
  remove(id: string | number): Promise<void>;
  /** Alias of {@link SourceController.load}. */
  refresh(): Promise<void>;
  /** Poll every `interval` ms (the `.poll` modifier's value, else 30000). */
  startPolling(interval?: number): void;
  stopPolling(): void;
}

// ─────────────────────────────────────────────────────────────────────────
// Controllers
// ─────────────────────────────────────────────────────────────────────────

/**
 * The only method every recipe controller has. A controller's real surface is
 * its entry in {@link ControllerApis}; this is what code holding an
 * unidentified controller (`$ui`, `inspect().controller.api`) may call.
 */
export interface ControllerApi {
  destroy(): void;
}

/**
 * What `$ui` is: the local controller's surface, and a function that resolves
 * another component's. [W2-6]
 *
 * Callable because the scope root was the only component an expression could
 * ever reach, which left "open that drawer from this table row" — the most
 * common admin interaction there is — with no expression that could say it.
 */
export interface UiHandle extends Partial<ControllerApi> {
  /** The controller of the component matching `selector`, or `null`. */
  (selector: string): ControllerApi | null;
  /** The controller of the component at (or enclosing) `element`, or `null`. */
  (element: Element): ControllerApi | null;
  /** Any other method the local controller exposes — cast to narrow it. */
  [method: string]: unknown;
}

/**
 * A factory registered with `Faqir.controller()`. It receives the
 * `[data-ui]` root and must be double-init safe — the engine calls it again
 * for elements a MutationObserver sees a second time.
 */
export type ControllerFactory<A extends ControllerApi = ControllerApi> = (root: Element) => A;

export interface AccordionApi extends ControllerApi {
  toggle(index: number): void;
  expand(index: number): void;
  collapse(index: number): void;
  expandAll(): void;
  collapseAll(): void;
}

/** `dialog` and `alert-dialog` share one controller; the panel's role differs. */
export interface DialogApi extends ControllerApi {
  open(): void;
  close(): void;
  toggle(): void;
}

export interface BarcodeApi extends ControllerApi {
  render(): void;
  update(value: string): void;
}

/** A `range` calendar reports two dates; a single-date one reports a string. */
export type CalendarValue = string | null | { start: string | null; end: string | null };

export interface CalendarApi extends ControllerApi {
  getValue(): CalendarValue;
  setValue(value: string): void;
  clear(): void;
  navigate(month: number, year: number): void;
  selectDate(date: Date | string): void;
  focusDate(date: Date | string): void;
  setMin(value: string): void;
  setMax(value: string): void;
  setDisabledDates(list: string[]): void;
}

export interface CarouselApi extends ControllerApi {
  next(): void;
  prev(): void;
  goTo(index: number): void;
  getIndex(): number;
  getCount(): number;
}

export interface ComboboxApi extends ControllerApi {
  open(): void;
  close(): void;
  filter(query: string): void;
  selectOption(index: number): void;
  getValue(): string | null;
  setValue(value: string): void;
}

export interface CommandPaletteApi extends ControllerApi {
  open(): void;
  close(): void;
  filter(query: string): void;
  selectItem(index: number): void;
  registerCommand(command: Record<string, unknown>): void;
}

export interface ContextMenuApi extends ControllerApi {
  open(x?: number, y?: number): void;
  close(options?: { restoreFocus?: boolean }): void;
}

export interface DatePickerApi extends ControllerApi {
  open(): void;
  close(): void;
  getValue(): CalendarValue;
  setValue(date: string): void;
  navigate(month: number, year: number): void;
  selectDate(date: Date | string): void;
}

export interface DrawerApi extends ControllerApi {
  open(): void;
  close(): void;
  toggle(): void;
}

export interface DropdownApi extends ControllerApi {
  open(options?: { focus?: string }): void;
  close(options?: { restoreFocus?: boolean }): void;
  toggle(): void;
}

export interface FileUploadApi extends ControllerApi {
  getFiles(): FileList;
  open(): void;
  /** By index or by the `File` itself. Returns whether anything was removed. */
  remove(target: number | File): boolean;
  clear(): void;
}

export interface InputOtpApi extends ControllerApi {
  getValue(): string;
  /** Silent — does not fire `change`/`complete`. */
  setValue(value: string): void;
  clear(): void;
  focus(): void;
}

export interface MenubarApi extends ControllerApi {
  open(index?: number, focus?: string): void;
  close(restoreFocus?: boolean): void;
}

export interface PaginationApi extends ControllerApi {
  setPage(page: number): void;
  getPage(): number;
  setTotal(total: number): void;
  render(current: number, total: number): void;
}

export interface PopoverApi extends ControllerApi {
  open(): void;
  close(): void;
  toggle(): void;
}

export interface QrCodeApi extends ControllerApi {
  render(): void;
  update(value: string, errorCorrectionLevel?: string): void;
}

export interface SelectCustomApi extends ControllerApi {
  open(): void;
  close(): void;
  toggle(): void;
  select(value: string): void;
  getValue(): string | null;
}

export interface SheetApi extends ControllerApi {
  open(): void;
  close(): void;
  toggle(): void;
}

export interface SidebarApi extends ControllerApi {
  toggle(): void;
  expand(): void;
  collapse(): void;
  open(): void;
  close(): void;
  isMobile(): boolean;
  /** The root's `data-state` — `""` when it carries none. */
  getState(): string;
}

export interface SliderApi extends ControllerApi {
  /** `setValue(thumbIndex, value)` — a single-thumb slider is index 0. */
  setValue(index: number, value: number): void;
  /** A number, or both ends when the slider is a range. */
  getValue(): number | number[];
  getValues(): number[];
  setFormatter(format: ((value: number) => string) | null): void;
}

export interface TableSort {
  index: number;
  direction: string;
}

export interface TableState {
  sorts: TableSort[];
  filter: string;
  columnFilters: [number, string][];
  widths: (string | null)[];
  hidden: boolean[];
}

export interface TableApi extends ControllerApi {
  sort(columnIndex: number, direction?: string): void;
  sortBy(specs: TableSort[]): void;
  clearSort(): void;
  selectRow(index: number): void;
  selectAll(): void;
  deselectAll(): void;
  /** Row indices, in document order. */
  getSelected(): number[];
  getSelectedData(): Record<string, string>[];
  setFilter(query: string): void;
  setColumnFilter(columnIndex: number, query: string): void;
  clearFilters(): void;
  toggleGroup(target: number | Element, force?: boolean): void;
  toggleRow(target: number | Element, force?: boolean): void;
  toggleDetail(target: number | Element, force?: boolean): void;
  expandAll(): void;
  collapseAll(): void;
  startEdit(row: number | Element, column?: number): void;
  commitEdit(focusBack?: boolean): void;
  cancelEdit(focusBack?: boolean): void;
  moveRow(from: number, to: number): void;
  moveColumn(from: number, to: number): void;
  hideColumn(index: number): void;
  showColumn(index: number): void;
  toggleColumn(index: number, force?: boolean): void;
  setColumnWidth(index: number, width: number): void;
  exportCsv(options?: { all?: boolean; separator?: string; filename?: string }): void;
  /** Visible rows by default; `{ all: true }` includes filtered-out ones. */
  getData(options?: { all?: boolean }): Record<string, string>[];
  getState(): TableState;
  setState(state: Partial<TableState>): void;
  refresh(): void;
}

export interface TabsApi extends ControllerApi {
  activate(index: number): void;
}

export interface TagInputApi extends ControllerApi {
  getValue(): string[];
  setValue(values: string[]): void;
  addTag(value: string): void;
  removeTag(value: string): void;
  clear(): void;
}

export interface ToastApi extends ControllerApi {
  /**
   * `message`, `icon` and `actionLabel` are written with `textContent` —
   * markup in them is inert, so an error string or an echoed username is
   * safe. `iconHtml` is the explicit opt-in that writes `innerHTML`, and is
   * an `l-html`-class surface: author-supplied values only.
   */
  add(options?: {
    message?: string;
    tone?: string;
    icon?: string;
    /** Unescaped icon markup (e.g. an inline `<svg>`). Never pass untrusted input. */
    iconHtml?: string;
    actionLabel?: string;
    onAction?: (() => void) | null;
    duration?: number;
  }): string;
  dismiss(id: string): void;
  dismissAll(): void;
}

export interface ToggleGroupApi extends ControllerApi {
  /** An array in `multi` mode, one value (or `null`) in single mode. */
  getValue(): string | string[] | null;
  setValue(value: string | string[] | null): void;
  toggle(value: string): void;
}

export interface TooltipApi extends ControllerApi {
  show(): void;
  hide(): void;
}

export interface TreeViewApi extends ControllerApi {
  select(target: string | Element): boolean;
  expand(target: string | Element): boolean;
  collapse(target: string | Element): boolean;
  toggle(target: string | Element): boolean;
  refresh(): void;
  getSelected(): Element | null;
}

/**
 * Every recipe controller the shipped engine registers, keyed by its
 * `data-ui` value. The method NAMES are held against each recipe's
 * `@ui:provides` header by the drift test, in both directions.
 *
 * Augment it to type a controller of your own:
 *
 *     declare module "@faqir-ui/core" {
 *       interface ControllerApis { "my-widget": MyWidgetApi }
 *     }
 */
export interface ControllerApis {
  accordion: AccordionApi;
  "alert-dialog": DialogApi;
  barcode: BarcodeApi;
  calendar: CalendarApi;
  carousel: CarouselApi;
  combobox: ComboboxApi;
  "command-palette": CommandPaletteApi;
  "context-menu": ContextMenuApi;
  "date-picker": DatePickerApi;
  dialog: DialogApi;
  drawer: DrawerApi;
  dropdown: DropdownApi;
  "file-upload": FileUploadApi;
  "input-otp": InputOtpApi;
  menubar: MenubarApi;
  pagination: PaginationApi;
  popover: PopoverApi;
  "qr-code": QrCodeApi;
  "select-custom": SelectCustomApi;
  sheet: SheetApi;
  sidebar: SidebarApi;
  slider: SliderApi;
  table: TableApi;
  tabs: TabsApi;
  "tag-input": TagInputApi;
  toast: ToastApi;
  "toggle-group": ToggleGroupApi;
  tooltip: TooltipApi;
  "tree-view": TreeViewApi;
}

// ─────────────────────────────────────────────────────────────────────────
// Inspection  [task 0.7-12]
// ─────────────────────────────────────────────────────────────────────────

/** The five protocol attributes, read the way `$state`/`$variant` read them. */
export interface ProtocolState {
  ui: string | null;
  part: string | null;
  variant: string | null;
  size: string | null;
  state: string | null;
}

/**
 * Everything Faqir knows about one element.
 *
 * `scope` is a plain deep copy: magics are absent (they are non-enumerable),
 * functions/elements/cycles collapse to markers, mutating it does not touch
 * the live scope, and reading it registers no reactive dependency.
 *
 * The type parameter names the controller you expect, since the engine cannot
 * know it: `Faqir.inspect<Faqir.ControllerApis["dialog"]>("#confirm")`.
 */
export interface Inspection<A extends ControllerApi = ControllerApi> {
  el: Element;
  /** Nearest ancestor-or-self owning a scope. */
  scopeRoot: Element | null;
  scopeId: number | null;
  scope: Record<string, unknown> | null;
  directives: InspectedDirective[];
  controller: {
    ui: string;
    el: Element;
    api: A;
    /** The api's function keys, sorted. */
    methods: string[];
  } | null;
  state: ProtocolState;
}

/** One entry of `__FAQIR_DEVTOOLS__.scopes()`. */
export interface DevtoolsScope {
  el: Element;
  id: number | null;
  /** `div#cart[data-ui="card"]` — short, human, stable. */
  label: string;
  scope: Record<string, unknown> | null;
}

/** One entry of `__FAQIR_DEVTOOLS__.components()`. */
export interface DevtoolsComponent {
  el: Element;
  label: string;
  ui: string | null;
  variant: string | null;
  size: string | null;
  state: string | null;
  /** This component's OWN parts — parts of a nested `[data-ui]` are excluded. */
  parts: string[];
  /** Whether a controller is mounted on it. */
  controller: boolean;
}

/**
 * One recorded diagnostic. The production engine records none, so
 * `warnings()` is always `[]` there — the four classes exist only in
 * `faqir-core.dev.js`.
 */
export interface DevtoolsWarning {
  kind: "expression" | "directive" | "reorder" | "html";
  message: string;
  /** The offending element, as a short label. */
  element: string | null;
  /** Its `outerHTML`, head-and-tail truncated. */
  html: string;
  [extra: string]: unknown;
}

/**
 * `window.__FAQIR_DEVTOOLS__` — the stable handle agents and the `faqir dev`
 * overlay read. Installed by BOTH builds; only `dev` flips between them.
 */
export interface Devtools {
  /** Handle schema version. Bumped only on a breaking shape change. */
  readonly version: number;
  /** `true` in `faqir-core.dev.js`, `false` in the production engine. */
  readonly dev: boolean;
  /** The Faqir global itself. */
  readonly faqir: FaqirGlobal;
  inspect<A extends ControllerApi = ControllerApi>(
    target: Element | string,
  ): Inspection<A> | null;
  /** Declared scope roots in document order. Defaults to the whole document. */
  scopes(within?: ParentNode): DevtoolsScope[];
  /** Every mounted component, with its protocol attributes and its parts. */
  components(within?: ParentNode): DevtoolsComponent[];
  /** Snapshot of every `Faqir.store()` on the page. */
  stores(): Record<string, Record<string, unknown>>;
  /** Diagnostics recorded so far, oldest first. */
  warnings(): DevtoolsWarning[];
}

// ─────────────────────────────────────────────────────────────────────────
// The global
// ─────────────────────────────────────────────────────────────────────────

export interface FaqirGlobal {
  readonly version: string;

  // ── Reactivity ──
  /** Wrap an object in the reactive proxy. Idempotent — already-reactive in, same out. */
  reactive<T extends object>(obj: T): T;
  /** Run `fn`, re-running it whenever a reactive value it read changes. */
  effect(fn: () => void): Disposer;
  /** Run `fn` with effect flushing deferred until it returns. */
  batch(fn: () => void): void;
  /** Run `fn` without registering any dependency it reads. */
  untrack<T>(fn: () => T): T;
  /** Queue `fn` as a microtask — after the effects a mutation queued flush. */
  nextTick(fn?: () => void): void;

  // ── Expressions ──
  /**
   * Compile and run one expression against a scope. Errors are reported, not
   * thrown, and yield `undefined`.
   *
   * Compilation uses `new Function`, which is what makes `'unsafe-eval'` a
   * requirement — see `docs/security.md`. Never build the string from input
   * you did not author.
   */
  evaluate<T = unknown>(expression: string, scope: object, el?: Element | null): T | undefined;
  /** The statement form — `l-on`, `l-init`. Same caveats, no return value. */
  evaluateAssignment(expression: string, scope: object, el?: Element | null): void;

  // ── Registration ──
  /** Name a scope factory, so `l-data="cart"` resolves to it instead of an object literal. */
  data<T extends Record<string, unknown>>(name: string, factory: () => T): void;
  /** Register a global reactive store, reachable in expressions as `$store.<name>`. */
  store<T extends object>(name: string, obj: T): void;
  /** Register `l-<name>`. The `l-` prefix is NOT part of `name`. */
  directive(name: string, handler: DirectiveHandler): void;
  /** Register `$<name>`. The `$` is NOT part of `name`. */
  magic(name: string, callback: MagicFactory): void;
  /** Call `fn` with the engine. The whole plugin protocol. */
  plugin(fn: Plugin): void;
  /** Register a controller for a `data-ui` value. */
  controller<K extends keyof ControllerApis>(
    name: K,
    factory: ControllerFactory<ControllerApis[K]>,
  ): void;
  controller<N extends string>(
    name: N extends keyof ControllerApis ? never : N,
    factory: ControllerFactory,
  ): void;

  // ── Lifecycle ──
  /** Bootstrap. Runs automatically unless the script tag carries `data-manual`. */
  start(): void;
  /** Initialize one subtree, optionally inside an existing scope. */
  initTree(root: Element, parentScope?: Scope | null): void;
  /**
   * Run the cleanups registered on `el` and its descendants — `l-source`
   * aborts, poll teardown, effect disposers, `l-model` listeners, `$watch`
   * subscriptions, and any `__faqirTeardown` the scope's data declared (which is
   * how `apiSource()` stops its polling). Structural directives call this for
   * you; it is exposed for imperative teardown of a subtree.
   *
   * "and its descendants" is a walk over CHILD NODES, not elements: `l-if` and
   * `l-for` own their subtree through an anchor COMMENT, and that is the node
   * their list effect's disposer lives on. Until W3-1 the walk was
   * `querySelectorAll('*')` and the disposers were dropped on the floor anyway,
   * so both structural directives went on running against a destroyed scope —
   * this doc was true of the intent and false of the engine.
   *
   * It does NOT remove rendered DOM. An `l-if` branch that is showing stays
   * showing; what stops is everything that was driving it.
   */
  destroy(el: Element): void;

  // ── Inspection ──
  /** A snapshot of one element, by node or by selector. */
  inspect<A extends ControllerApi = ControllerApi>(
    target: Element | string,
  ): Inspection<A> | null;
  /**
   * The same object installed at `window.__FAQIR_DEVTOOLS__`. Exposed here
   * too so code holding a specific engine instance reaches ITS handle rather
   * than whichever engine touched the global last.
   */
  readonly devtools: Devtools;
}

declare const Faqir: FaqirGlobal;

/**
 * The namespace spelling. Every name is an ALIAS of the module-level
 * declaration, not a copy, so `Faqir.PluginMagics` and the augmentable
 * `PluginMagics` are one interface — augment either, see it through both.
 */
declare namespace Faqir {
  export { Disposer, Magics, PluginMagics, Scope, Stores, Directive,
    InspectedDirective, DirectiveHandler, MagicFactory, Plugin,
    SourceController, ControllerApi, ControllerFactory, AccordionApi,
    DialogApi, BarcodeApi, CalendarValue, CalendarApi, CarouselApi,
    ComboboxApi, CommandPaletteApi, ContextMenuApi, DatePickerApi, DrawerApi,
    DropdownApi, FileUploadApi, InputOtpApi, MenubarApi, PaginationApi,
    PopoverApi, QrCodeApi, SelectCustomApi, SheetApi, SidebarApi, SliderApi,
    TableSort, TableState, TableApi, TabsApi, TagInputApi, ToastApi,
    ToggleGroupApi, TooltipApi, TreeViewApi, ControllerApis, ProtocolState,
    Inspection, DevtoolsScope, DevtoolsComponent, DevtoolsWarning, Devtools,
    FaqirGlobal };
}

export default Faqir;

// The same members as named exports, matching `dist/faqir-core.mjs`. A bundler
// cannot destructure a UMD default, which is why the ESM build hands these out
// individually and why they are declared individually here.
export declare const version: FaqirGlobal["version"];
export declare const reactive: FaqirGlobal["reactive"];
export declare const effect: FaqirGlobal["effect"];
export declare const batch: FaqirGlobal["batch"];
export declare const untrack: FaqirGlobal["untrack"];
export declare const evaluate: FaqirGlobal["evaluate"];
export declare const evaluateAssignment: FaqirGlobal["evaluateAssignment"];
export declare const nextTick: FaqirGlobal["nextTick"];
export declare const data: FaqirGlobal["data"];
export declare const store: FaqirGlobal["store"];
export declare const directive: FaqirGlobal["directive"];
export declare const magic: FaqirGlobal["magic"];
export declare const plugin: FaqirGlobal["plugin"];
export declare const controller: FaqirGlobal["controller"];
export declare const start: FaqirGlobal["start"];
export declare const initTree: FaqirGlobal["initTree"];
export declare const inspect: FaqirGlobal["inspect"];
export declare const devtools: FaqirGlobal["devtools"];
export declare const destroy: FaqirGlobal["destroy"];

declare global {
  /**
   * The classic-script global, set by `faqir-core.min.js` (and by any UMD load
   * that falls to the global branch). Declared here rather than with
   * `export as namespace Faqir`, which under a default export would have made
   * the global the module's export *record* — `Faqir.default.start()` — instead
   * of the engine itself.
   */
  const Faqir: FaqirGlobal;
  namespace Faqir {
    export { Disposer, Magics, PluginMagics, Scope, Stores, Directive,
      InspectedDirective, DirectiveHandler, MagicFactory, Plugin,
      SourceController, ControllerApi, ControllerFactory, AccordionApi,
      DialogApi, BarcodeApi, CalendarValue, CalendarApi, CarouselApi,
      ComboboxApi, CommandPaletteApi, ContextMenuApi, DatePickerApi,
      DrawerApi, DropdownApi, FileUploadApi, InputOtpApi, MenubarApi,
      PaginationApi, PopoverApi, QrCodeApi, SelectCustomApi, SheetApi,
      SidebarApi, SliderApi, TableSort, TableState, TableApi, TabsApi,
      TagInputApi, ToastApi, ToggleGroupApi, TooltipApi, TreeViewApi,
      ControllerApis, ProtocolState, Inspection, DevtoolsScope,
      DevtoolsComponent, DevtoolsWarning, Devtools, FaqirGlobal };
  }
  interface Window {
    /** Set by the classic-script build; absent under a bundler import. */
    Faqir?: FaqirGlobal;
    /** Installed by both engine builds on every Faqir page. */
    __FAQIR_DEVTOOLS__?: Devtools;
  }
}
