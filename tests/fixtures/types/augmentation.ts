// Type fixture — the plugin extension points.
//
// A plugin adds names the engine has never heard of: `Faqir.magic()` puts a
// `$magic` on every scope, `Faqir.controller()` mounts an API on a `data-ui`
// value the registry does not ship, `Faqir.store()` names a global store.
// Declaring them is the caller's job, and these are the three interfaces
// `faqir-core.d.ts` leaves open for it. If any of them stops being augmentable,
// this file stops compiling.

import Faqir from "@faqir-ui/core";

// ── 1. a magic added by a plugin ───────────────────────────────────────────
// `plugins/faqir-persist.js` registers exactly this one.
// `export = Faqir` makes the namespace's members the module's exports, so an
// augmentation names the interface directly — no `namespace Faqir` wrapper.
declare module "@faqir-ui/core" {
  interface PluginMagics {
    $persist: (key: string, value?: unknown) => unknown;
  }
}

// ── 2. a controller of your own ────────────────────────────────────────────
interface SparklineApi extends Faqir.ControllerApi {
  update(points: number[]): void;
  getPoints(): number[];
}

declare module "@faqir-ui/core" {
  interface ControllerApis {
    sparkline: SparklineApi;
  }
}

// ── 3. a store, typed by name ──────────────────────────────────────────────
declare module "@faqir-ui/core" {
  interface Stores {
    session: { user: string | null; token: string | null };
  }
}

// ── the augmentations are live on the declared surface ─────────────────────
Faqir.plugin((faqir) => {
  faqir.magic("persist", (el) => (key: string) => el.getAttribute(key));
  // Once `sparkline` is a known name, its factory must satisfy the API.
  faqir.controller("sparkline", (root) => ({
    update(points: number[]) {
      root.setAttribute("data-points", points.join(","));
    },
    getPoints: () => [],
    destroy() {},
  }));
});

// @ts-expect-error — a declared controller name no longer accepts a bare stub.
Faqir.controller("sparkline", () => ({ destroy() {} }));

Faqir.directive("uses-plugin-magic", (_el, _dir, scope) => {
  void scope.$persist("draft");
  const user: string | null = scope.$store.session.user;
  void user;
  // @ts-expect-error — the augmentation types the store; `roles` is not on it.
  void scope.$store.session.roles;
});

const sparkline = Faqir.inspect<Faqir.ControllerApis["sparkline"]>("[data-ui='sparkline']");
sparkline?.controller?.api.update([1, 2, 3]);
// @ts-expect-error — update takes the points, not a count.
sparkline?.controller?.api.update(3);
