// Type fixture — the bundler/module shape: `import Faqir from "@faqir-ui/core"`.
//
// Every `@ts-expect-error` below is an assertion that the declaration REJECTS
// the line under it; every line without one is an assertion that it ACCEPTS.
// The compile must produce zero diagnostics, so both directions fail loudly.
// See tests/fixtures/types/tsconfig.json.

import Faqir from "@faqir-ui/core";

// ── 1. reactive ────────────────────────────────────────────────────────────
const cart = Faqir.reactive({ items: [] as string[], total: 0 });
const total: number = cart.total;
// @ts-expect-error — a primitive is not an object; the proxy has nothing to wrap.
Faqir.reactive(42);

// ── 2. effect ──────────────────────────────────────────────────────────────
const stop: () => void = Faqir.effect(() => {
  void cart.total;
});
stop();
// @ts-expect-error — effect takes a function, not a value.
Faqir.effect(cart.total);

// ── 3. untrack ─────────────────────────────────────────────────────────────
const untracked: number = Faqir.untrack(() => cart.total);
// @ts-expect-error — the return type flows through; a number is not a string.
const wrongUntrack: string = Faqir.untrack(() => cart.total);

// ── 4. batch / nextTick ────────────────────────────────────────────────────
Faqir.batch(() => {
  cart.total = 1;
});
Faqir.nextTick();
Faqir.nextTick(() => {});
// @ts-expect-error — nextTick queues a callback, not a delay.
Faqir.nextTick(16);

// ── 5. evaluate ────────────────────────────────────────────────────────────
const sum: number | undefined = Faqir.evaluate<number>("a + b", { a: 1, b: 2 });
Faqir.evaluateAssignment("count++", cart, null);
// @ts-expect-error — evaluate can always fail, so it never returns a bare T.
const bareSum: number = Faqir.evaluate<number>("a + b", {});

// ── 6. data ────────────────────────────────────────────────────────────────
Faqir.data("cart", () => ({ items: [] as string[], total: 0 }));
// @ts-expect-error — `data` names a FACTORY; passing the object registers nothing.
Faqir.data("cart", { items: [], total: 0 });

// ── 7. store ───────────────────────────────────────────────────────────────
Faqir.store("session", { user: null as string | null });
// @ts-expect-error — a store needs both a name and the object it holds.
Faqir.store("session");

// ── 8. directive ───────────────────────────────────────────────────────────
Faqir.directive("highlight", (el, directive, scope) => {
  el.setAttribute("data-expr", directive.expression);
  void directive.modifiers.includes("once");
  void scope.$id("hit");
  return () => el.removeAttribute("data-expr");
});
Faqir.directive("noop", () => {});
Faqir.directive("arg-aware", (_el, directive) => {
  // `arg` is optional: the parser sets it only for `l-bind:`/`l-on:`/`l-source:`.
  const named: string | undefined = directive.arg;
  void named;
});
// @ts-expect-error — the handler's first parameter is the Element, not a string.
Faqir.directive("bad", (el: string) => void el);

// ── 9. magic ───────────────────────────────────────────────────────────────
Faqir.magic("now", () => Date.now());
// @ts-expect-error — a magic is registered by name; the `$` is not part of it.
Faqir.magic(123, () => null);

// ── 10. plugin ─────────────────────────────────────────────────────────────
Faqir.plugin((faqir) => {
  faqir.directive("from-plugin", () => {});
  faqir.magic("fromPlugin", () => 1);
});
Faqir.plugin((faqir) => {
  // @ts-expect-error — the plugin receives the engine, and it has no such member.
  faqir.notAnApi();
});

// ── 11. controller — a known data-ui value must match its declared API ─────
Faqir.controller("dialog", () => ({
  open() {},
  close() {},
  toggle() {},
  destroy() {},
}));
// @ts-expect-error — `dialog` provides open/close/toggle/destroy; this is short.
Faqir.controller("dialog", () => ({ destroy() {} }));

// ── 12. controller — a name the registry does not define ───────────────────
Faqir.controller("my-widget", (root) => ({
  destroy() {
    root.remove();
  },
}));
// @ts-expect-error — a factory must return a controller API, not void.
Faqir.controller("my-other-widget", () => {});

// ── 13. lifecycle ──────────────────────────────────────────────────────────
const host = document.querySelector("main")!;
Faqir.start();
Faqir.initTree(host);
Faqir.initTree(host, null);
Faqir.destroy(host);
// @ts-expect-error — destroy takes the element, not a selector.
Faqir.destroy("main");

// ── 14. inspect — the result is nullable and its shape is closed ───────────
const snapshot = Faqir.inspect("#total");
const variant: string | null | undefined = snapshot?.state.variant;
const directiveTypes: string[] = snapshot?.directives.map((d) => d.type) ?? [];
// `inspect()` normalizes `arg` to null, unlike the handler-facing Directive.
const firstArg: string | null | undefined = snapshot?.directives[0]?.arg;
// @ts-expect-error — inspect returns null for a selector that matches nothing.
Faqir.inspect("#total").state;
// @ts-expect-error — `state` carries the five protocol attributes and no more.
void snapshot?.state.role;

// ── 15. inspect<A> — naming the controller you expect ──────────────────────
const dialog = Faqir.inspect<Faqir.ControllerApis["dialog"]>("#confirm");
dialog?.controller?.api.open();
// @ts-expect-error — typo in a method the dialog controller does not provide.
dialog?.controller?.api.opne();

const table = Faqir.inspect<Faqir.ControllerApis["table"]>("[data-ui='table']");
const selectedRows: number[] | undefined = table?.controller?.api.getSelected();
table?.controller?.api.exportCsv({ all: true });
// @ts-expect-error — exportCsv takes options, not a column index.
table?.controller?.api.exportCsv(2);

// ── 16. $ui narrows to destroy() only until you say which component it is ──
Faqir.directive("via-ui", (_el, _dir, scope) => {
  // The local controller's universal method. Optional, because the element the
  // expression sits on may have no controller at all.
  scope.$ui.destroy?.();
  (scope.$ui as unknown as Faqir.ControllerApis["tabs"]).activate(1);
  // @ts-expect-error — an unidentified controller exposes only destroy().
  scope.$ui.activate(1);

  // ── W2-6: the same handle resolves ANOTHER component's controller ──
  scope.$ui("#detail-drawer")?.destroy();
  (scope.$ui("#tabs") as Faqir.ControllerApis["tabs"] | null)?.activate(1);
  scope.$ui(document.body)?.destroy();
  // @ts-expect-error — the lookup takes a selector or an element, not a number.
  scope.$ui(7);
});

// ── 17. the scope's magics ─────────────────────────────────────────────────
Faqir.directive("magics", (_el, _dir, scope) => {
  const root: Element = scope.$el;
  const field: Element | undefined = scope.$refs.field;
  const dispatched: boolean = scope.$dispatch("saved", { id: 1 });
  scope.$state = "open";
  const disposer: () => void = scope.$watch<number>("qty", (next, prev) => {
    void (next - prev);
  });
  void [root, field, dispatched, disposer, scope.$id("panel")];
  // @ts-expect-error — $el is the scope root, assigned by the engine, not by you.
  scope.$el = document.body;
});

// ── 18. scope members are `unknown`, not `any` ─────────────────────────────
Faqir.directive("opaque", (_el, _dir, scope) => {
  const raw = scope.anything;
  const narrowed = raw as number;
  void (narrowed + 1);
  // @ts-expect-error — an unknown scope key is not silently a number.
  void (scope.anything + 1);
});

// ── 19. devtools ───────────────────────────────────────────────────────────
const labels: string[] = Faqir.devtools.scopes().map((s) => s.label);
const parts: string[][] = Faqir.devtools.components(host).map((c) => c.parts);
const stores: Record<string, Record<string, unknown>> = Faqir.devtools.stores();
const kinds = Faqir.devtools.warnings().map((w) => w.kind);
const isDev: boolean = Faqir.devtools.dev;
void [labels, parts, stores, kinds, isDev];
// @ts-expect-error — the four diagnostic classes are a closed union.
const badKind: Faqir.DevtoolsWarning["kind"] = "network";
// @ts-expect-error — the handle's version is read-only; the engine sets it.
Faqir.devtools.version = 2;

// ── 20. version is read-only ───────────────────────────────────────────────
const version: string = Faqir.version;
// @ts-expect-error — the engine reports its version; callers do not set it.
Faqir.version = "9.9.9";

// ── 21. the l-source controller shape ──────────────────────────────────────
interface Task {
  id: number;
  title: string;
  done: boolean;
}
declare const tasks: Faqir.SourceController<Task>;
void tasks.load();
void tasks.create({ title: "write the types" });
void tasks.update(1, { done: true });
void tasks.remove(1);
tasks.startPolling(5000);
tasks.stopPolling();
// @ts-expect-error — create takes a payload, not a whole request options bag.
void tasks.create({ method: "POST" });

void [total, sum, untracked, wrongUntrack, bareSum, stop, variant, directiveTypes, firstArg];
void [selectedRows, version, badKind];
