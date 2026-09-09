/**
 * Every directive the framework ships, proven to actually run in a browser —
 * core directives and plugin directives alike. [W2-1 gate]
 *
 * Two of the three silent failures 1.0 shipped were directives that bound to
 * nothing and said nothing:
 *
 *   • `l-validate` never ran at all, because bootstrap only walked out from
 *     `[l-data]` / `[data-ui]` roots, and the canonical `<form l-validate>` —
 *     the markup in the plugin's own header comment — is neither. Registered,
 *     present, visible to `inspect()`, and never applied.
 *   • `l-effect` never ran on a scope root, the exact placement the docs
 *     recommend ("a scope root, beside `l-data`"). It worked on a child, so
 *     every unit test of it passed.
 *
 * The lesson both teach is that a directive needs to be exercised in **each
 * placement the docs endorse**, not just the one the test author reached for.
 * So every core directive here is asserted twice — on a scope root and on a
 * descendant — and the plugin directives are asserted where their own
 * documentation puts them, including outside any scope at all.
 */

import { test, expect, type Page } from "@playwright/test";
import { livePage, PLUGINS } from "./harness";

/** Mount a live page and wait for bootstrap to have run. */
async function mount(page: Page, body: string, plugins?: readonly string[]) {
  await page.setContent(livePage(body, { plugins }), { waitUntil: "load" });
  await page.waitForFunction(() => !!(window as any).Faqir);
}

/** Console errors and warnings — a directive that fails must not fail quietly. */
function collectDiagnostics(page: Page): string[] {
  const out: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") out.push(`[${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => out.push(`[pageerror] ${e.message}`));
  return out;
}

// ── core directives, in both documented placements ──────────────────────────

test.describe("core directives", () => {
  test("l-text, l-bind, l-on, l-show, l-ref and l-effect all run ON A SCOPE ROOT", async ({
    page,
  }) => {
    // Every one of these used to be dropped on the floor here: `initTree`
    // applied only plugin directives to the root, and the tree walk it hands off
    // to visits descendants only.
    const diagnostics = collectDiagnostics(page);
    await mount(
      page,
      `
      <div id="text-root" l-data="{ label: 'from root' }" l-text="label"></div>

      <div id="bind-root" l-data="{ busy: true }" :data-busy="busy"></div>

      <div id="on-root" l-data="{ hits: 0 }" @click="hits++">
        <span id="on-count" l-text="hits"></span>
      </div>

      <div id="show-root" l-data="{ open: false }" l-show="open"></div>

      <div id="ref-root" l-data="{}" l-ref="self">
        <span id="ref-seen" l-text="$refs.self ? 'yes' : 'no'"></span>
      </div>

      <div id="effect-root" l-data="{ n: 1 }" l-effect="window.effectRuns = (window.effectRuns || 0) + 1; window.lastN = n">
        <button id="bump" @click="n++">+</button>
      </div>
      `,
    );

    await expect(page.locator("#text-root")).toHaveText("from root");
    await expect(page.locator("#bind-root")).toHaveAttribute("data-busy", "true");
    await expect(page.locator("#show-root")).toHaveCSS("display", "none");
    await expect(page.locator("#ref-seen")).toHaveText("yes");

    await page.locator("#on-root").click();
    await expect(page.locator("#on-count")).toHaveText("1");

    // l-effect ran once on mount, and re-runs when a value it READ changes.
    expect(await page.evaluate(() => (window as any).effectRuns)).toBe(1);
    await page.locator("#bump").click();
    await expect
      .poll(() => page.evaluate(() => (window as any).lastN))
      .toBe(2);
    expect(await page.evaluate(() => (window as any).effectRuns)).toBe(2);

    expect(diagnostics).toEqual([]);
  });

  test("the same directives run on a DESCENDANT of the scope root", async ({ page }) => {
    const diagnostics = collectDiagnostics(page);
    await mount(
      page,
      `
      <div l-data="{ label: 'from child', busy: true, open: false, hits: 0, n: 1 }">
        <span id="text-child" l-text="label"></span>
        <span id="bind-child" :data-busy="busy"></span>
        <span id="show-child" l-show="open"></span>
        <span id="ref-child" l-ref="marked"></span>
        <span id="ref-child-seen" l-text="$refs.marked ? 'yes' : 'no'"></span>
        <button id="hit-child" @click="hits++">hit</button>
        <span id="hits-child" l-text="hits"></span>
        <span id="effect-child" l-effect="window.childEffect = n"></span>
      </div>
      `,
    );

    await expect(page.locator("#text-child")).toHaveText("from child");
    await expect(page.locator("#bind-child")).toHaveAttribute("data-busy", "true");
    await expect(page.locator("#show-child")).toHaveCSS("display", "none");
    await expect(page.locator("#ref-child-seen")).toHaveText("yes");
    await page.locator("#hit-child").click();
    await expect(page.locator("#hits-child")).toHaveText("1");
    expect(await page.evaluate(() => (window as any).childEffect)).toBe(1);

    expect(diagnostics).toEqual([]);
  });

  test("l-init, l-if, l-for, l-key, l-model, l-html, l-cloak and l-teleport", async ({ page }) => {
    const diagnostics = collectDiagnostics(page);
    await mount(
      page,
      `
      <div id="scope"
           l-data="{ items: [{ id: 1, name: 'one' }, { id: 2, name: 'two' }], on: true, typed: 'hello', markup: '<b id=\\'bold\\'>bold</b>' }"
           l-init="window.initRan = true">
        <template l-if="on"><p id="conditional">shown</p></template>
        <ul id="list">
          <template l-for="item in items" l-key="item.id">
            <li l-text="item.name"></li>
          </template>
        </ul>
        <input id="model" l-model="typed">
        <span id="model-echo" l-text="typed"></span>
        <div id="html" l-html="markup"></div>
        <span id="cloaked" l-cloak></span>
        <div id="ported" l-teleport="#port">moved</div>
      </div>
      <div id="port"></div>
      `,
    );

    expect(await page.evaluate(() => (window as any).initRan)).toBe(true);
    await expect(page.locator("#conditional")).toHaveText("shown");
    await expect(page.locator("#list li")).toHaveText(["one", "two"]);
    await expect(page.locator("#html #bold")).toHaveText("bold");
    await expect(page.locator("#cloaked")).not.toHaveAttribute("l-cloak", /.*/);
    await expect(page.locator("#port > #ported")).toHaveCount(1);

    await page.locator("#model").fill("typed in");
    await expect(page.locator("#model-echo")).toHaveText("typed in");

    // l-if removes, and the removal tears the subtree down.
    await page.evaluate(() => ((document.getElementById("scope") as any).__faqirScope.on = false));
    await expect(page.locator("#conditional")).toHaveCount(0);

    expect(diagnostics).toEqual([]);
  });

  test("l-source binds a collection and its $controller", async ({ page }) => {
    await page.route("https://faqir.test/api/tasks", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify([
          { id: 1, title: "alpha" },
          { id: 2, title: "beta" },
        ]),
      }),
    );

    await mount(
      page,
      `
      <div l-data="{}" l-source:tasks="https://faqir.test/api/tasks">
        <span id="count" l-text="tasks.length"></span>
        <span id="loading" l-text="tasksLoading ? 'yes' : 'no'"></span>
        <ul id="titles">
          <template l-for="t in tasks" l-key="t.id"><li l-text="t.title"></li></template>
        </ul>
      </div>
      `,
    );

    await expect(page.locator("#count")).toHaveText("2");
    await expect(page.locator("#loading")).toHaveText("no");
    await expect(page.locator("#titles li")).toHaveText(["alpha", "beta"]);
  });
});

// ── plugin directives ───────────────────────────────────────────────────────

test.describe("plugin directives", () => {
  test("every shipped plugin registers the directive it advertises", async ({ page }) => {
    // The registration half of the l-validate failure was always fine — this
    // pins that half so a regression is told apart from the binding half below.
    await mount(page, `<div l-data="{}"></div>`, PLUGINS);

    const registered = await page.evaluate(() => {
      const el = document.createElement("div");
      document.body.appendChild(el);
      return (window as any).Faqir ? true : false;
    });
    expect(registered).toBe(true);

    for (const plugin of PLUGINS) {
      const applied = await page.evaluate((name) => {
        // A directive is registered iff applying it to a fresh element does
        // something the engine's default branch would not: the engine reports an
        // unknown directive and otherwise leaves the element alone.
        const probe = document.createElement("div");
        probe.setAttribute("l-data", "{}");
        probe.setAttribute(`l-${name}`, "");
        document.body.appendChild(probe);
        (window as any).Faqir.initTree(probe, null);
        const seen = (window as any).Faqir.inspect(probe).directives.map((d: any) => d.type);
        probe.remove();
        return seen.includes(name);
      }, plugin);
      expect(applied, `l-${plugin} is not parsed as a directive`).toBe(true);
    }
  });

  test("l-validate marks a field invalid — WITHOUT any l-data on the page", async ({ page }) => {
    // The exact markup from the plugin's own header comment. No scope anywhere:
    // this is the configuration that used to do nothing, silently.
    const diagnostics = collectDiagnostics(page);
    await mount(
      page,
      `
      <form id="signup" l-validate novalidate>
        <div data-ui="field-group">
          <label data-part="label" for="email">Work email</label>
          <input data-part="input" id="email" name="email" type="email" required
                 data-error-required="We need an address.">
          <p data-part="error" id="email-error"></p>
        </div>
        <button type="submit" id="save">Save</button>
      </form>
      `,
      ["validate"],
    );

    await page.locator("#save").click();

    const group = page.locator("#signup [data-ui='field-group']");
    await expect(group).toHaveAttribute("data-state", "invalid");
    await expect(page.locator("#email-error")).toHaveText("We need an address.");
    await expect(page.locator("#email")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#email")).toHaveAttribute("aria-describedby", "email-error");

    // Fixing it live clears the error — the post-submit revalidation contract.
    await page.locator("#email").fill("someone@example.com");
    await expect(group).not.toHaveAttribute("data-state", "invalid");
    await expect(page.locator("#email-error")).toHaveText("");

    expect(diagnostics).toEqual([]);
  });

  test("l-validate also works inside an l-data scope", async ({ page }) => {
    await mount(
      page,
      `
      <div l-data="{ submitted: false }">
        <form id="scoped" l-validate="submitted = true" novalidate>
          <div data-ui="field-group">
            <input data-part="input" id="name" name="name" required>
            <p data-part="error"></p>
          </div>
          <button type="submit" id="go">Go</button>
        </form>
        <span id="flag" l-text="submitted ? 'submitted' : 'not yet'"></span>
      </div>
      `,
      ["validate"],
    );

    await page.locator("#go").click();
    await expect(page.locator("#scoped [data-ui='field-group']")).toHaveAttribute(
      "data-state",
      "invalid",
    );
    await expect(page.locator("#flag")).toHaveText("not yet");

    // Clean form → the expression runs as the on-valid hook.
    await page.locator("#name").fill("Ada");
    await page.locator("#go").click();
    await expect(page.locator("#flag")).toHaveText("submitted");
  });

  test("l-collapse animates height and leaves no inline residue", async ({ page }) => {
    await mount(
      page,
      `
      <div l-data="{ open: false }">
        <button id="toggle" @click="open = !open">toggle</button>
        <div id="panel" l-collapse="open"><p style="height: 120px">content</p></div>
      </div>
      `,
      ["collapse"],
    );

    const panel = page.locator("#panel");
    await expect.poll(() => panel.evaluate((el) => (el as HTMLElement).offsetHeight)).toBe(0);

    await page.locator("#toggle").click();
    await expect.poll(() => panel.evaluate((el) => (el as HTMLElement).offsetHeight)).toBeGreaterThan(100);
    // Settled open: no inline height left pinning the element.
    await expect
      .poll(() => panel.evaluate((el) => (el as HTMLElement).style.height))
      .toBe("");

    await page.locator("#toggle").click();
    await expect.poll(() => panel.evaluate((el) => (el as HTMLElement).offsetHeight)).toBe(0);
  });

  test("l-intersect fires on enter and .once stops after the first", async ({ page }) => {
    await mount(
      page,
      `
      <div l-data="{ seen: 0, onceCount: 0 }">
        <span id="seen" l-text="seen"></span>
        <span id="once" l-text="onceCount"></span>
        <div style="height: 200vh"></div>
        <div id="sentinel" l-intersect="seen++" style="height: 20px"></div>
        <div id="once-sentinel" l-intersect.once="onceCount++" style="height: 20px"></div>
        <div style="height: 200vh"></div>
      </div>
      `,
      ["intersect"],
    );

    await expect(page.locator("#seen")).toHaveText("0");
    await page.locator("#sentinel").scrollIntoViewIfNeeded();
    await expect(page.locator("#seen")).toHaveText("1");
    await expect(page.locator("#once")).toHaveText("1");

    // Scroll away and back: `.once` must not fire a second time.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    await page.locator("#once-sentinel").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await expect(page.locator("#once")).toHaveText("1");
  });

  test("l-mask formats the display value and keeps the model raw", async ({ page }) => {
    await mount(
      page,
      `
      <div l-data="{ phone: '' }">
        <input id="phone" l-model="phone" l-mask="(999) 999-9999">
        <span id="raw" l-text="phone"></span>
      </div>
      `,
      ["mask"],
    );

    await page.locator("#phone").click();
    await page.keyboard.type("5551234567");

    await expect(page.locator("#phone")).toHaveValue("(555) 123-4567");
    await expect(page.locator("#raw")).toHaveText("5551234567");
  });

  test("l-persist restores state across a reload", async ({ page }) => {
    const body = `
      <div l-data="{ count: 0 }" l-persist="count" data-persist-namespace="smoke">
        <button id="inc" @click="count++">+1</button>
        <span id="count" l-text="count"></span>
      </div>
    `;
    // localStorage is per-origin and about:blank has none, so serve the page
    // from a real (routed) origin for this one case.
    await page.route("https://faqir.test/persist", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: livePage(body, { plugins: ["persist"] }),
      }),
    );

    await page.goto("https://faqir.test/persist");
    await page.locator("#inc").click();
    await page.locator("#inc").click();
    await expect(page.locator("#count")).toHaveText("2");

    await page.reload();
    await expect(page.locator("#count")).toHaveText("2");
  });
});
