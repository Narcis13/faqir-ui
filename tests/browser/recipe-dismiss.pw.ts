/**
 * Every `open` ⇄ `closed` recipe, opened and closed again through **each
 * documented path**, in a real browser with real CSS and real transitions.
 * [W2-1 gate]
 *
 * The drawer shipped in 1.0 stuck at `data-state="closing"` — overlay covering
 * the page, `body` frozen at `overflow: hidden` — whenever it was dismissed
 * through its close button. Escape closed it. The overlay closed it. The
 * programmatic `close()` closed it. Only the button, the one control the
 * manifest marks `required` and lists under DO-NOT-REMOVE, did not: the button's
 * own `background` transition fires a `transitionend` that bubbles to the panel,
 * where it was eaten by the one-shot listener waiting for the panel's
 * `transform`. Partial path coverage is exactly why nothing caught it, so this
 * suite refuses to be partial — every close affordance the reference markup
 * carries gets its own case, on every instance the page declares, not just the
 * first.
 *
 * The matrix is generated from the registry: the recipes, their manifests, and
 * their reference markup. A new recipe, a new close button, or a new instance in
 * a reference page grows it with no edit here.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  discoverDismissibleRecipes,
  liveReferencePage,
  transientStates,
  type RecipeManifest,
} from "./harness";

const recipes = discoverDismissibleRecipes();

test("the dismissible-recipe matrix is non-empty", () => {
  expect(recipes.length).toBeGreaterThan(0);
});

/** The close affordances this suite drives. `close:N` is the Nth close part. */
type Path = "api" | "escape" | "overlay" | `close:${number}`;

interface InstanceInfo {
  id: string;
  isAlert: boolean;
  confirmRequired: boolean;
  closeCount: number;
  hasOverlay: boolean;
  hasTrigger: boolean;
}

/**
 * In-page helpers. Everything here runs in the browser: it reaches a controller
 * the way page code does (through the `_faqir*` handle `$ui` resolves) and
 * reports the invariants a stranded overlay violates.
 */
const PAGE_HELPERS = `
window.__smoke = {
  api(el) {
    for (const k of Object.keys(el)) if (k.startsWith('_faqir')) return el[k];
    return null;
  },
  /** The id of the component whose overlay is painting over the viewport centre. */
  blockedAtCentre() {
    const hit = document.elementFromPoint(
      Math.floor(window.innerWidth / 2),
      Math.floor(window.innerHeight / 2),
    );
    const overlay = hit && hit.closest('[data-part="overlay"]');
    if (!overlay) return null;
    const cs = getComputedStyle(overlay);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
    const owner = overlay.closest('[data-ui]');
    return (owner && (owner.id || owner.dataset.ui)) || 'unknown';
  },
  snapshot(id) {
    const root = document.getElementById(id);
    const overlay = root.querySelector('[data-part="overlay"]');
    return {
      state: root.dataset.state ?? null,
      overlayHidden: overlay ? overlay.hidden : null,
      bodyOverflow: document.body.style.overflow,
      blockedBy: this.blockedAtCentre(),
    };
  },
  /**
   * Put keyboard focus somewhere inside the component, so a key press reaches
   * the controller's own keydown listener the way a user's would. A panel with
   * no tabindex cannot take focus, so prefer a real control inside it.
   */
  focusInside(id) {
    const root = document.getElementById(id);
    const target =
      root.querySelector('[data-part="panel"] button, [data-part="panel"] [href], [data-part="panel"] input, [data-part="panel"] [tabindex]') ||
      root.querySelector('[data-part="panel"]') ||
      root.querySelector('button, [href], input, [tabindex]') ||
      root;
    if (!target.hasAttribute('tabindex') && !/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) {
      target.setAttribute('tabindex', '-1');
    }
    target.focus();
    return document.activeElement === target;
  },
};
`;

/**
 * WAI-ARIA says an alertdialog's backdrop is not a dismissal affordance, and a
 * `data-confirm-required` root additionally traps Escape until the user picks
 * confirm or cancel. Those instances are documented NOT to close on those paths,
 * so asserting they stay open is the real check, not an exemption.
 */
function dismisses(path: Path, info: InstanceInfo): boolean {
  if (path === "overlay" && info.isAlert) return false;
  if (path === "escape" && info.confirmRequired) return false;
  return true;
}

/**
 * How long a state is given to settle before it is called stuck. Comfortably
 * longer than the slowest overlay motion the tokens declare (`duration-slow`),
 * and reached by polling — a healthy component settles in a frame or two, and
 * only a genuinely stranded one pays the whole budget.
 */
const SETTLE_MS = 1000;

/** Wait until the instance's `data-state` is one of `wanted`, or give up. */
async function settle(page: Page, id: string, wanted: string[]): Promise<string | null> {
  const deadline = Date.now() + SETTLE_MS;
  let state: string | null = null;
  do {
    state = await page.evaluate((id) => document.getElementById(id)!.dataset.state ?? null, id);
    if (wanted.includes(state ?? "")) return state;
    await page.waitForTimeout(50);
  } while (Date.now() < deadline);
  return state;
}

async function openInstance(page: Page, info: InstanceInfo): Promise<string | null> {
  // Through the trigger first — a controller reached only by its API is a
  // controller half-tested. Recipes whose trigger is not a click-to-open
  // affordance (a context menu's right-click target, a combobox's input) fall
  // back to the documented method.
  if (info.hasTrigger) {
    const trigger = page.locator(`#${info.id} [data-part="trigger"]`).first();
    await trigger.scrollIntoViewIfNeeded().catch(() => {});
    await trigger.click({ force: true }).catch(() => {});
    if ((await settle(page, info.id, ["open"])) === "open") return "open";
  }
  await page.evaluate((id) => (window as any).__smoke.api(document.getElementById(id)!)?.open?.(), info.id);
  return settle(page, info.id, ["open"]);
}

async function dismissInstance(page: Page, info: InstanceInfo, path: Path): Promise<void> {
  if (path === "escape") {
    await page.evaluate((id) => (window as any).__smoke.focusInside(id), info.id);
    await page.keyboard.press("Escape");
  } else if (path === "overlay") {
    // Dispatched rather than pointer-clicked on purpose: an overlay is
    // `position: fixed; inset: 0`, so its geometric centre is underneath the
    // panel. What is documented — and what a user hitting the exposed edge
    // triggers — is the overlay's own click handler.
    await page.locator(`#${info.id} [data-part="overlay"]`).dispatchEvent("click");
  } else if (path.startsWith("close:")) {
    // A real pointer, deliberately: the hover styles a pointer triggers, and the
    // `transitionend` events they bubble, ARE the mechanism behind the bug this
    // suite exists to catch.
    const button = page.locator(`#${info.id} [data-part="close"]`).nth(Number(path.slice(6)));
    await button.scrollIntoViewIfNeeded().catch(() => {});
    await button.click({ force: true });
  } else {
    await page.evaluate((id) => (window as any).__smoke.api(document.getElementById(id)!)?.close?.(), info.id);
  }
  // An instance documented NOT to dismiss on this path is expected to stay open;
  // every other one must reach "closed". Either way this returns as soon as the
  // state stops moving, and only a stranded component waits out the budget.
  await settle(page, info.id, dismisses(path, info) ? ["closed"] : ["open"]);
}

for (const recipe of recipes) {
  const transient = transientStates(recipe);

  test(`${recipe.name} · opens and closes through every documented path`, async ({ page }) => {
    const failures: string[] = [];

    await page.setContent(liveReferencePage(recipe.htmlRel), { waitUntil: "load" });
    await page.addScriptTag({ content: PAGE_HELPERS });

    const instances = (await page.evaluate((name) => {
      return [...document.querySelectorAll(`[data-ui="${name}"]`)].map((root, i) => {
        if (!root.id) root.id = `smoke-${name}-${i}`; // stable handle for the run
        const panel = root.querySelector('[data-part="panel"]');
        return {
          id: root.id,
          isAlert: panel?.getAttribute("role") === "alertdialog",
          confirmRequired: root.hasAttribute("data-confirm-required"),
          closeCount: root.querySelectorAll('[data-part="close"]').length,
          hasOverlay: !!root.querySelector('[data-part="overlay"]'),
          hasTrigger: !!root.querySelector('[data-part="trigger"]'),
        };
      });
    }, recipe.name)) as InstanceInfo[];

    expect(instances.length, `${recipe.name}.html declares no instance`).toBeGreaterThan(0);

    for (const info of instances) {
      const paths: Path[] = ["api"];
      if (recipe.escapeCloses) paths.push("escape");
      if (info.hasOverlay) paths.push("overlay");
      for (let i = 0; i < info.closeCount; i++) paths.push(`close:${i}`);

      for (const path of paths) {
        const label = `${recipe.name}#${info.id} via ${path}`;

        const opened = await openInstance(page, info);
        if (opened !== "open") {
          failures.push(`${label}: did not open (state "${opened}")`);
          continue;
        }

        await dismissInstance(page, info, path);
        const after = await page.evaluate((id) => (window as any).__smoke.snapshot(id), info.id);

        if (!dismisses(path, info)) {
          if (after.state !== "open") {
            failures.push(`${label}: documented NOT to dismiss, but state is "${after.state}"`);
          }
          // Put it back before the next path.
          await page.evaluate(
            (id) => (window as any).__smoke.api(document.getElementById(id)!)?.close?.(),
            info.id,
          );
          await settle(page, info.id, ["closed"]);
          continue;
        }

        // ── the invariants a stranded overlay breaks ────────────────────────
        if (transient.includes(after.state ?? "")) {
          failures.push(
            `${label}: stranded in the transient state "${after.state}" — it never finalised`,
          );
        } else if (after.state !== "closed") {
          failures.push(`${label}: expected state "closed", got "${after.state}"`);
        }
        if (after.overlayHidden === false) failures.push(`${label}: overlay left visible`);
        if (after.blockedBy) failures.push(`${label}: page still covered by ${after.blockedBy}`);
        if (after.bodyOverflow === "hidden") failures.push(`${label}: body left scroll-locked`);
      }
    }

    expect(failures, `\n${failures.join("\n")}\n`).toEqual([]);
  });
}
