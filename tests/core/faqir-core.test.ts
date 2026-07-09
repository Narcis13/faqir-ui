import { describe, it, expect, beforeEach, afterEach } from "bun:test";

// Import faqir-core.js — it's a UMD module that attaches Faqir to globalThis
// We need to re-require it fresh for some tests
const Faqir = require("../../registry/core/faqir-core.js");

// Helper to flush all pending microtasks — setTimeout(0) runs after the microtask queue drains
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  document.body.innerHTML = "";
  // Let any pending MutationObserver callbacks from previous tests settle
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// ═══════════════════════════════════════════════════════
// Section 1: Reactive Engine
// ═══════════════════════════════════════════════════════

describe("Reactive Engine", () => {
  describe("reactive()", () => {
    it("creates a reactive proxy", () => {
      const obj = Faqir.reactive({ count: 0 });
      expect(obj.count).toBe(0);
      obj.count = 5;
      expect(obj.count).toBe(5);
    });

    it("returns same proxy if already reactive", () => {
      const obj = Faqir.reactive({ x: 1 });
      const obj2 = Faqir.reactive(obj);
      expect(obj).toBe(obj2);
    });

    it("tracks nested property access", () => {
      const obj = Faqir.reactive({ a: 1, b: 2 });
      let sum = 0;
      Faqir.effect(() => {
        sum = obj.a + obj.b;
      });
      expect(sum).toBe(3);
    });
  });

  describe("effect()", () => {
    it("runs immediately on creation", () => {
      let ran = false;
      Faqir.effect(() => {
        ran = true;
      });
      expect(ran).toBe(true);
    });

    it("re-runs when tracked reactive property changes", async () => {
      const state = Faqir.reactive({ count: 0 });
      let observed = 0;
      Faqir.effect(() => {
        observed = state.count;
      });
      expect(observed).toBe(0);

      state.count = 42;
      await tick();
      expect(observed).toBe(42);
    });

    it("does not re-run for untracked properties", async () => {
      const state = Faqir.reactive({ a: 1, b: 2 });
      let runs = 0;
      Faqir.effect(() => {
        void state.a;
        runs++;
      });
      expect(runs).toBe(1);

      state.b = 99;
      await tick();
      expect(runs).toBe(1); // b was not tracked
    });

    it("returns a cleanup function", async () => {
      const state = Faqir.reactive({ x: 0 });
      let observed = 0;
      const cleanup = Faqir.effect(() => {
        observed = state.x;
      });

      state.x = 10;
      await tick();
      expect(observed).toBe(10);

      cleanup();
      state.x = 20;
      await tick();
      expect(observed).toBe(10); // effect was cleaned up
    });

    it("handles multiple effects on same property", async () => {
      const state = Faqir.reactive({ v: 0 });
      let a = 0, b = 0;
      Faqir.effect(() => { a = state.v; });
      Faqir.effect(() => { b = state.v * 2; });
      expect(a).toBe(0);
      expect(b).toBe(0);

      state.v = 5;
      await tick();
      expect(a).toBe(5);
      expect(b).toBe(10);
    });

    it("handles 5+ effects on same property", async () => {
      const state = Faqir.reactive({ v: 0 });
      const results: number[] = [0, 0, 0, 0, 0];
      for (let i = 0; i < 5; i++) {
        const idx = i;
        Faqir.effect(() => { results[idx] = state.v + idx; });
      }
      expect(results).toEqual([0, 1, 2, 3, 4]);

      state.v = 10;
      await tick();
      expect(results).toEqual([10, 11, 12, 13, 14]);
    });

    it("does not skip effects when one throws", async () => {
      const state = Faqir.reactive({ v: 0 });
      let a = 0, b = 0;
      Faqir.effect(() => { a = state.v; });
      Faqir.effect(() => {
        if (state.v === 5) throw new Error("boom");
      });
      Faqir.effect(() => { b = state.v; });

      state.v = 5;
      await tick();
      // Effect 2 throws, but effects 1 and 3 should still run
      expect(a).toBe(5);
      expect(b).toBe(5);
    });

    it("flushes cascading effects in the same cycle", async () => {
      const state = Faqir.reactive({ a: 0, b: 0 });
      let observed = 0;
      // Effect 1: when a changes, set b = a * 2
      Faqir.effect(() => { state.b = state.a * 2; });
      // Effect 2: read b
      Faqir.effect(() => { observed = state.b; });
      expect(observed).toBe(0);

      state.a = 3;
      await tick();
      // b should be 6, and the observer should see it in the same flush
      expect(state.b).toBe(6);
      expect(observed).toBe(6);
    });
  });

  describe("batch()", () => {
    it("defers effect execution until batch completes", () => {
      const state = Faqir.reactive({ a: 0, b: 0 });
      let runs = 0;
      Faqir.effect(() => {
        void state.a;
        void state.b;
        runs++;
      });
      expect(runs).toBe(1);

      Faqir.batch(() => {
        state.a = 1;
        state.b = 2;
      });
      // After batch, effects run synchronously
      expect(runs).toBe(2); // Only one additional run, not two
    });
  });

  describe("untrack()", () => {
    it("reads without creating dependency", async () => {
      const state = Faqir.reactive({ tracked: 1, untracked: 1 });
      let runs = 0;
      Faqir.effect(() => {
        void state.tracked;
        Faqir.untrack(() => {
          void state.untracked;
        });
        runs++;
      });
      expect(runs).toBe(1);

      state.untracked = 99;
      await tick();
      expect(runs).toBe(1); // no re-run

      state.tracked = 99;
      await tick();
      expect(runs).toBe(2); // tracked change triggers re-run
    });
  });
});

// ═══════════════════════════════════════════════════════
// Section 2: Expression Evaluator
// ═══════════════════════════════════════════════════════

describe("Expression Evaluator", () => {
  it("evaluates simple expressions", () => {
    const result = Faqir.evaluate("1 + 2", {}, document.createElement("div"));
    expect(result).toBe(3);
  });

  it("evaluates expressions with scope variables", () => {
    const scope = Faqir.reactive({ count: 10 });
    const result = Faqir.evaluate("count * 2", scope, document.createElement("div"));
    expect(result).toBe(20);
  });

  it("evaluates string expressions", () => {
    const scope = Faqir.reactive({ name: "World" });
    const result = Faqir.evaluate("'Hello ' + name", scope, document.createElement("div"));
    expect(result).toBe("Hello World");
  });

  it("evaluates ternary expressions", () => {
    const scope = Faqir.reactive({ isActive: true });
    const result = Faqir.evaluate("isActive ? 'yes' : 'no'", scope, document.createElement("div"));
    expect(result).toBe("yes");
  });

  it("evaluates boolean expressions", () => {
    const scope = Faqir.reactive({ a: true, b: false });
    expect(Faqir.evaluate("a && b", scope, document.createElement("div"))).toBe(false);
    expect(Faqir.evaluate("a || b", scope, document.createElement("div"))).toBe(true);
  });

  it("returns undefined on error", () => {
    const result = Faqir.evaluate("nonExistent.foo.bar", {}, document.createElement("div"));
    expect(result).toBeUndefined();
  });

  it("evaluates assignment statements", () => {
    const scope = Faqir.reactive({ count: 0 });
    Faqir.evaluateAssignment("count = 42", scope, document.createElement("div"));
    expect(scope.count).toBe(42);
  });

  it("evaluates increment statements", () => {
    const scope = Faqir.reactive({ count: 5 });
    Faqir.evaluateAssignment("count++", scope, document.createElement("div"));
    expect(scope.count).toBe(6);
  });

  it("caches compiled expressions", () => {
    const scope = Faqir.reactive({ x: 1 });
    const el = document.createElement("div");
    // Call same expression twice — should use cache
    expect(Faqir.evaluate("x + 1", scope, el)).toBe(2);
    expect(Faqir.evaluate("x + 1", scope, el)).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════
// Section 3: Directives
// ═══════════════════════════════════════════════════════

describe("Directives", () => {
  describe("l-data", () => {
    it("initializes a reactive scope from an expression", async () => {
      document.body.innerHTML = `
        <div l-data="{ count: 0 }">
          <span l-text="count"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      const span = document.querySelector("span")!;
      expect(span.textContent).toBe("0");
    });

    it("reads data-prop-* attributes into scope", async () => {
      document.body.innerHTML = `
        <div l-data="{}" data-prop-greeting="hello">
          <span l-text="greeting"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      const span = document.querySelector("span")!;
      expect(span.textContent).toBe("hello");
    });

    it("supports registered data factories via Faqir.data()", async () => {
      Faqir.data("counter", () => ({ count: 99 }));
      document.body.innerHTML = `
        <div l-data="counter">
          <span l-text="count"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      const span = document.querySelector("span")!;
      expect(span.textContent).toBe("99");
    });
  });

  describe("l-text", () => {
    it("sets text content reactively", async () => {
      document.body.innerHTML = `
        <div l-data="{ msg: 'hello' }">
          <span l-text="msg"></span>
        </div>
      `;
      Faqir.start();
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("hello");
    });

    it("updates when reactive data changes", async () => {
      document.body.innerHTML = `
        <div l-data="{ count: 0 }">
          <span l-text="count"></span>
          <button @click="count++">Inc</button>
        </div>
      `;
      Faqir.start();
      await tick();

      const span = document.querySelector("span")!;
      expect(span.textContent).toBe("0");

      document.querySelector("button")!.click();
      await tick();
      expect(span.textContent).toBe("1");
    });

    it("handles null/undefined as empty string", async () => {
      document.body.innerHTML = `
        <div l-data="{ val: null }">
          <span l-text="val"></span>
        </div>
      `;
      Faqir.start();
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("");
    });
  });

  describe("l-html", () => {
    it("sets innerHTML reactively", async () => {
      document.body.innerHTML = `
        <div l-data="{ content: '<b>bold</b>' }">
          <div l-html="content"></div>
        </div>
      `;
      Faqir.start();
      await tick();
      const target = document.querySelector("[l-html]")!;
      expect(target.innerHTML).toBe("<b>bold</b>");
    });
  });

  describe("l-bind / :attr", () => {
    it("binds attributes reactively", async () => {
      document.body.innerHTML = `
        <div l-data="{ url: 'https://example.com' }">
          <a l-bind:href="url">Link</a>
        </div>
      `;
      Faqir.start();
      await tick();
      expect(document.querySelector("a")!.getAttribute("href")).toBe("https://example.com");
    });

    it("supports shorthand :attr syntax", async () => {
      document.body.innerHTML = `
        <div l-data="{ title: 'Hello' }">
          <span :title="title">text</span>
        </div>
      `;
      Faqir.start();
      await tick();
      expect(document.querySelector("span")!.getAttribute("title")).toBe("Hello");
    });

    it("handles class binding with string", async () => {
      document.body.innerHTML = `
        <div l-data="{ cls: 'foo bar' }">
          <span :class="cls">text</span>
        </div>
      `;
      Faqir.start();
      await tick();
      expect(document.querySelector("span")!.className).toBe("foo bar");
    });

    it("handles class binding with object", async () => {
      document.body.innerHTML = `
        <div l-data="{ isActive: true, isHidden: false }">
          <span :class="{ active: isActive, hidden: isHidden }">text</span>
        </div>
      `;
      Faqir.start();
      await tick();
      const span = document.querySelector("span")!;
      expect(span.classList.contains("active")).toBe(true);
      expect(span.classList.contains("hidden")).toBe(false);
    });

    it("handles class binding with array", async () => {
      document.body.innerHTML = `
        <div l-data="{ classes: ['foo', null, 'bar'] }">
          <span :class="classes">text</span>
        </div>
      `;
      Faqir.start();
      await tick();
      expect(document.querySelector("span")!.className).toBe("foo bar");
    });

    it("handles style binding with object", async () => {
      document.body.innerHTML = `
        <div l-data="{ styles: { color: 'red', fontSize: '16px' } }">
          <span :style="styles">text</span>
        </div>
      `;
      Faqir.start();
      await tick();
      const span = document.querySelector("span")!;
      expect(span.style.color).toBe("red");
      expect(span.style.fontSize).toBe("16px");
    });

    it("handles style binding with string", async () => {
      document.body.innerHTML = `
        <div l-data="{ s: 'color: blue;' }">
          <span :style="s">text</span>
        </div>
      `;
      Faqir.start();
      await tick();
      expect(document.querySelector("span")!.style.cssText).toContain("color: blue");
    });

    it("handles boolean attributes", async () => {
      document.body.innerHTML = `
        <div l-data="{ isDisabled: true }">
          <button :disabled="isDisabled">btn</button>
        </div>
      `;
      Faqir.start();
      await tick();
      expect(document.querySelector("button")!.hasAttribute("disabled")).toBe(true);
    });

    it("removes attribute when value is null/false", async () => {
      document.body.innerHTML = `
        <div l-data="{ val: null }">
          <span :data-info="val">text</span>
        </div>
      `;
      Faqir.start();
      await tick();
      expect(document.querySelector("span")!.hasAttribute("data-info")).toBe(false);
    });

    it("re-evaluates all sibling l-bind effects sharing the same dependency", async () => {
      document.body.innerHTML = `
        <div l-data="{ rating: 0 }">
          <span class="star" l-bind:data-state="rating >= 1 ? 'active' : ''">1</span>
          <span class="star" l-bind:data-state="rating >= 2 ? 'active' : ''">2</span>
          <span class="star" l-bind:data-state="rating >= 3 ? 'active' : ''">3</span>
          <span class="star" l-bind:data-state="rating >= 4 ? 'active' : ''">4</span>
          <span class="star" l-bind:data-state="rating >= 5 ? 'active' : ''">5</span>
          <button @click="rating = 3">Rate 3</button>
        </div>
      `;
      Faqir.start();
      await tick();

      const stars = document.querySelectorAll(".star");
      // Initially all should have empty data-state
      for (let i = 0; i < 5; i++) {
        expect(stars[i].getAttribute("data-state")).toBe("");
      }

      // Click to set rating = 3
      document.querySelector("button")!.click();
      await tick();

      // Stars 1-3 should be active, 4-5 should be empty
      expect(stars[0].getAttribute("data-state")).toBe("active");
      expect(stars[1].getAttribute("data-state")).toBe("active");
      expect(stars[2].getAttribute("data-state")).toBe("active");
      expect(stars[3].getAttribute("data-state")).toBe("");
      expect(stars[4].getAttribute("data-state")).toBe("");
    });

    it("re-evaluates sibling boolean attribute bindings on shared dependency", async () => {
      document.body.innerHTML = `
        <div l-data="{ level: 0 }">
          <button class="b" l-bind:disabled="level < 1">A</button>
          <button class="b" l-bind:disabled="level < 2">B</button>
          <button class="b" l-bind:disabled="level < 3">C</button>
          <button @click="level = 2">Set 2</button>
        </div>
      `;
      Faqir.start();
      await tick();

      const buttons = document.querySelectorAll(".b");
      // Initially level=0, all should be disabled
      expect(buttons[0].hasAttribute("disabled")).toBe(true);
      expect(buttons[1].hasAttribute("disabled")).toBe(true);
      expect(buttons[2].hasAttribute("disabled")).toBe(true);

      // Click to set level = 2
      document.querySelector("[\\@click]")!.click();
      await tick();

      // level=2: A (level<1=false) enabled, B (level<2=false) enabled, C (level<3=true) disabled
      expect(buttons[0].hasAttribute("disabled")).toBe(false);
      expect(buttons[1].hasAttribute("disabled")).toBe(false);
      expect(buttons[2].hasAttribute("disabled")).toBe(true);
    });

    it("re-evaluates sibling class bindings (array mode) on shared dependency", async () => {
      document.body.innerHTML = `
        <div l-data="{ step: 0 }">
          <div id="s1" l-bind:class="[step >= 1 ? 'done' : 'pending']">Step 1</div>
          <div id="s2" l-bind:class="[step >= 2 ? 'done' : 'pending']">Step 2</div>
          <div id="s3" l-bind:class="[step >= 3 ? 'done' : 'pending']">Step 3</div>
          <button @click="step = 2">Advance</button>
        </div>
      `;
      Faqir.start();
      await tick();

      const s1 = document.querySelector("#s1")!;
      const s2 = document.querySelector("#s2")!;
      const s3 = document.querySelector("#s3")!;

      // Initially step=0, all should be 'pending'
      expect(s1.className).toBe("pending");
      expect(s2.className).toBe("pending");
      expect(s3.className).toBe("pending");

      // Click to set step = 2
      document.querySelector("button")!.click();
      await tick();

      // Items 1-2 should have 'done', item 3 should have 'pending'
      expect(s1.className).toBe("done");
      expect(s2.className).toBe("done");
      expect(s3.className).toBe("pending");
    });
  });

  describe("l-on / @event", () => {
    it("handles click events", async () => {
      document.body.innerHTML = `
        <div l-data="{ count: 0 }">
          <button @click="count++">Inc</button>
          <span l-text="count"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      document.querySelector("button")!.click();
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("1");
    });

    it("supports prevent modifier", async () => {
      document.body.innerHTML = `
        <div l-data="{ submitted: false }">
          <form @submit.prevent="submitted = true">
            <button type="submit">Submit</button>
          </form>
          <span l-text="submitted"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      const form = document.querySelector("form")!;
      const event = new Event("submit", { cancelable: true });
      form.dispatchEvent(event);
      await tick();
      expect(event.defaultPrevented).toBe(true);
    });

    it("supports once modifier", async () => {
      document.body.innerHTML = `
        <div l-data="{ count: 0 }">
          <button @click.once="count++">Inc</button>
          <span l-text="count"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      const btn = document.querySelector("button")!;
      btn.click();
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("1");

      btn.click();
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("1"); // still 1
    });

    it("supports self modifier", async () => {
      document.body.innerHTML = `
        <div l-data="{ clicked: false }">
          <div id="outer" @click.self="clicked = true">
            <span id="inner">inner</span>
          </div>
          <span l-text="clicked"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      // Click on inner should NOT trigger
      document.querySelector("#inner")!.dispatchEvent(
        new Event("click", { bubbles: true })
      );
      await tick();
      expect(document.querySelector("[l-text]")!.textContent).toBe("false");

      // Click on outer itself should trigger
      const outer = document.querySelector("#outer")!;
      outer.dispatchEvent(
        new Event("click", { bubbles: false })
      );
      await tick();
      // Note: with self modifier, e.target must equal the element
    });

    it("supports key modifiers for keydown", async () => {
      document.body.innerHTML = `
        <div l-data="{ pressed: false }">
          <input @keydown.enter="pressed = true" />
          <span l-text="pressed"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      const input = document.querySelector("input")!;
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("true");
    });

    it("does not trigger for wrong key", async () => {
      document.body.innerHTML = `
        <div l-data="{ pressed: false }">
          <input @keydown.escape="pressed = true" />
          <span l-text="pressed"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      const input = document.querySelector("input")!;
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("false");
    });

    it("provides $event in scope", async () => {
      document.body.innerHTML = `
        <div l-data="{ eventType: '' }">
          <button @click="eventType = $event.type">Click</button>
          <span l-text="eventType"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      document.querySelector("button")!.click();
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("click");
    });
  });

  describe("l-model", () => {
    it("two-way binds text input", async () => {
      document.body.innerHTML = `
        <div l-data="{ name: 'initial' }">
          <input l-model="name" />
          <span l-text="name"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      const input = document.querySelector("input")! as HTMLInputElement;
      expect(input.value).toBe("initial");

      // Simulate user input
      input.value = "updated";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("updated");
    });

    it("two-way binds checkbox", async () => {
      document.body.innerHTML = `
        <div l-data="{ checked: false }">
          <input type="checkbox" l-model="checked" />
          <span l-text="checked"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      const input = document.querySelector("input")! as HTMLInputElement;
      expect(input.checked).toBe(false);

      input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("true");
    });

    it("checkbox array mode — adds/removes values", async () => {
      document.body.innerHTML = `
        <div l-data='{ "tags": [] }'>
          <input type="checkbox" value="a" l-model="tags" />
          <input type="checkbox" value="b" l-model="tags" />
          <input type="checkbox" value="c" l-model="tags" />
          <span l-text="tags.join(',')"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      const boxes = document.querySelectorAll("input[type='checkbox']") as NodeListOf<HTMLInputElement>;
      expect(boxes[0].checked).toBe(false);
      expect(boxes[1].checked).toBe(false);
      expect(boxes[2].checked).toBe(false);

      // Check "a"
      boxes[0].checked = true;
      boxes[0].dispatchEvent(new Event("change", { bubbles: true }));
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("a");

      // Check "c"
      boxes[2].checked = true;
      boxes[2].dispatchEvent(new Event("change", { bubbles: true }));
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("a,c");

      // Uncheck "a"
      boxes[0].checked = false;
      boxes[0].dispatchEvent(new Event("change", { bubbles: true }));
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("c");
    });

    it("checkbox array mode — reflects pre-populated array", async () => {
      document.body.innerHTML = `
        <div l-data='{ "tags": ["b", "c"] }'>
          <input type="checkbox" value="a" l-model="tags" />
          <input type="checkbox" value="b" l-model="tags" />
          <input type="checkbox" value="c" l-model="tags" />
        </div>
      `;
      Faqir.start();
      await tick();

      const boxes = document.querySelectorAll("input[type='checkbox']") as NodeListOf<HTMLInputElement>;
      expect(boxes[0].checked).toBe(false);
      expect(boxes[1].checked).toBe(true);
      expect(boxes[2].checked).toBe(true);
    });

    it("two-way binds select", async () => {
      document.body.innerHTML = `
        <div l-data="{ color: 'red' }">
          <select l-model="color">
            <option value="red">Red</option>
            <option value="blue">Blue</option>
          </select>
          <span l-text="color"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      const select = document.querySelector("select")! as HTMLSelectElement;
      expect(select.value).toBe("red");

      select.value = "blue";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("blue");
    });

    it("supports .number modifier", async () => {
      document.body.innerHTML = `
        <div l-data="{ num: 0 }">
          <input l-model.number="num" />
          <span l-text="typeof num"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      const input = document.querySelector("input")! as HTMLInputElement;
      input.value = "42";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("number");
    });

    it("supports .trim modifier", async () => {
      document.body.innerHTML = `
        <div l-data="{ text: '' }">
          <input l-model.trim="text" />
          <span l-text="text"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      const input = document.querySelector("input")! as HTMLInputElement;
      input.value = "  hello  ";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("hello");
    });

    it("supports .lazy modifier (change event instead of input)", async () => {
      document.body.innerHTML = `
        <div l-data="{ text: '' }">
          <input l-model.lazy="text" />
          <span l-text="text"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      const input = document.querySelector("input")! as HTMLInputElement;
      input.value = "lazy-value";

      // input event should NOT update
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("");

      // change event SHOULD update
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("lazy-value");
    });

    it("binds radio buttons", async () => {
      document.body.innerHTML = `
        <div l-data="{ color: 'red' }">
          <input type="radio" name="color" value="red" l-model="color" />
          <input type="radio" name="color" value="blue" l-model="color" />
          <span l-text="color"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      const radios = document.querySelectorAll("input[type='radio']") as NodeListOf<HTMLInputElement>;
      expect(radios[0].checked).toBe(true);
      expect(radios[1].checked).toBe(false);

      radios[1].checked = true;
      radios[1].dispatchEvent(new Event("change", { bubbles: true }));
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("blue");
    });
  });

  describe("l-show", () => {
    it("toggles visibility based on expression", async () => {
      document.body.innerHTML = `
        <div l-data="{ visible: true }">
          <span l-show="visible">Hello</span>
        </div>
      `;
      Faqir.start();
      await tick();

      const span = document.querySelector("span")!;
      expect(span.style.display).not.toBe("none");
    });

    it("hides element when expression is false", async () => {
      document.body.innerHTML = `
        <div l-data="{ visible: false }">
          <span l-show="visible">Hello</span>
        </div>
      `;
      Faqir.start();
      await tick();

      const span = document.querySelector("span")!;
      expect(span.style.display).toBe("none");
    });

    it("reactively toggles visibility", async () => {
      document.body.innerHTML = `
        <div l-data="{ visible: true }">
          <span l-show="visible">Hello</span>
          <button @click="visible = !visible">Toggle</button>
        </div>
      `;
      Faqir.start();
      await tick();

      const span = document.querySelector("span")!;
      expect(span.style.display).not.toBe("none");

      document.querySelector("button")!.click();
      await tick();
      expect(span.style.display).toBe("none");
    });
  });

  describe("l-if", () => {
    it("conditionally renders template content", async () => {
      document.body.innerHTML = `
        <div l-data="{ show: true }">
          <template l-if="show"><span class="content">Visible</span></template>
        </div>
      `;
      Faqir.start();
      await tick();

      expect(document.querySelector(".content")).not.toBeNull();
      expect(document.querySelector(".content")!.textContent).toBe("Visible");
    });

    it("does not render when false", async () => {
      document.body.innerHTML = `
        <div l-data="{ show: false }">
          <template l-if="show"><span class="content">Hidden</span></template>
        </div>
      `;
      Faqir.start();
      await tick();

      expect(document.querySelector(".content")).toBeNull();
    });

    it("reactively adds/removes content", async () => {
      document.body.innerHTML = `
        <div l-data="{ show: false }">
          <template l-if="show"><span class="content">Dynamic</span></template>
          <button @click="show = !show">Toggle</button>
        </div>
      `;
      Faqir.start();
      await tick();
      expect(document.querySelector(".content")).toBeNull();

      document.querySelector("button")!.click();
      await tick();
      expect(document.querySelector(".content")).not.toBeNull();

      document.querySelector("button")!.click();
      await tick();
      expect(document.querySelector(".content")).toBeNull();
    });

    it("warns when not used on template element", async () => {
      const warnings: string[] = [];
      const origWarn = console.warn;
      console.warn = (...args: any[]) => { warnings.push(args.join(" ")); };

      document.body.innerHTML = `
        <div l-data="{}">
          <div l-if="true">Should warn</div>
        </div>
      `;
      Faqir.start();
      await tick();

      console.warn = origWarn;
      expect(warnings.some((w) => w.includes("l-if must be used on a <template>"))).toBe(true);
    });
  });

  describe("l-for", () => {
    it("renders a list from array", async () => {
      document.body.innerHTML = `
        <div l-data="{ items: ['a', 'b', 'c'] }">
          <ul>
            <template l-for="item in items"><li l-text="item"></li></template>
          </ul>
        </div>
      `;
      Faqir.start();
      await tick();

      const lis = document.querySelectorAll("li");
      expect(lis.length).toBe(3);
      expect(lis[0].textContent).toBe("a");
      expect(lis[1].textContent).toBe("b");
      expect(lis[2].textContent).toBe("c");
    });

    it("provides item and index", async () => {
      document.body.innerHTML = `
        <div l-data="{ items: ['x', 'y'] }">
          <template l-for="(item, i) in items"><span l-text="i + ':' + item"></span></template>
        </div>
      `;
      Faqir.start();
      await tick();

      const spans = document.querySelectorAll("span");
      expect(spans.length).toBe(2);
      expect(spans[0].textContent).toBe("0:x");
      expect(spans[1].textContent).toBe("1:y");
    });

    it("handles numeric range", async () => {
      document.body.innerHTML = `
        <div l-data="{}">
          <template l-for="n in 3"><span l-text="n"></span></template>
        </div>
      `;
      Faqir.start();
      await tick();

      const spans = document.querySelectorAll("span");
      expect(spans.length).toBe(3);
      expect(spans[0].textContent).toBe("1");
      expect(spans[1].textContent).toBe("2");
      expect(spans[2].textContent).toBe("3");
    });

    it("warns when not used on template element", async () => {
      const warnings: string[] = [];
      const origWarn = console.warn;
      console.warn = (...args: any[]) => { warnings.push(args.join(" ")); };

      document.body.innerHTML = `
        <div l-data="{}">
          <div l-for="item in [1,2,3]">nope</div>
        </div>
      `;
      Faqir.start();
      await tick();

      console.warn = origWarn;
      expect(warnings.some((w) => w.includes("l-for must be used on a <template>"))).toBe(true);
    });
  });

  describe("l-ref", () => {
    it("registers element reference in $refs", async () => {
      document.body.innerHTML = `
        <div l-data="{ label: '' }" id="scope-root">
          <input l-ref="myInput" value="test" />
          <button @click="label = $refs.myInput.value">Read</button>
          <span l-text="label"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      document.querySelector("button")!.click();
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("test");
    });
  });

  describe("l-init", () => {
    it("runs initialization code once", async () => {
      document.body.innerHTML = `
        <div l-data="{ initialized: false }">
          <div l-init="initialized = true"></div>
          <span l-text="initialized"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      expect(document.querySelector("span")!.textContent).toBe("true");
    });
  });

  describe("l-effect", () => {
    it("runs a side effect with dependency tracking", async () => {
      document.body.innerHTML = `
        <div l-data="{ count: 0, doubled: 0 }">
          <div l-effect="doubled = count * 2"></div>
          <button @click="count++">Inc</button>
          <span l-text="doubled"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      expect(document.querySelector("span")!.textContent).toBe("0");

      document.querySelector("button")!.click();
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("2");
    });
  });

  describe("l-cloak", () => {
    it("removes l-cloak attribute after bootstrap", async () => {
      document.body.innerHTML = `
        <div l-data="{}" l-cloak>
          <span>Hidden until ready</span>
        </div>
      `;
      Faqir.start();
      await tick();

      expect(document.querySelector("[l-cloak]")).toBeNull();
    });
  });

  describe("l-teleport", () => {
    it("moves element to target location", async () => {
      document.body.innerHTML = `
        <div l-data="{}">
          <div l-teleport="#target">Teleported</div>
        </div>
        <div id="target"></div>
      `;
      Faqir.start();
      await tick();

      const target = document.querySelector("#target")!;
      expect(target.children.length).toBe(1);
      expect(target.children[0].textContent).toBe("Teleported");
    });
  });
});

// ═══════════════════════════════════════════════════════
// Section 4: Magic Properties
// ═══════════════════════════════════════════════════════

describe("Magic Properties", () => {
  describe("$el", () => {
    it("references the current scope root element", async () => {
      document.body.innerHTML = `
        <div l-data="{ tag: '' }" id="my-root">
          <button @click="tag = $el.id">Get ID</button>
          <span l-text="tag"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      document.querySelector("button")!.click();
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("my-root");
    });
  });

  describe("$refs", () => {
    it("provides access to ref'd elements", async () => {
      document.body.innerHTML = `
        <div l-data="{ val: '' }">
          <input l-ref="nameInput" value="Claude" />
          <button @click="val = $refs.nameInput.value">Read</button>
          <span l-text="val"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      document.querySelector("button")!.click();
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("Claude");
    });
  });

  describe("$store", () => {
    it("provides access to global stores", async () => {
      Faqir.store("app", { theme: "dark" });

      document.body.innerHTML = `
        <div l-data="{}">
          <span l-text="$store.app.theme"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      expect(document.querySelector("span")!.textContent).toBe("dark");
    });
  });

  describe("$dispatch", () => {
    it("dispatches custom events", async () => {
      document.body.innerHTML = `
        <div l-data="{ received: '' }" @custom-event.window="received = 'got it'">
          <button @click="$dispatch('custom-event')">Fire</button>
          <span l-text="received"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      // Dispatch directly for testing
      let eventFired = false;
      document.querySelector("button")!.addEventListener("custom-event", () => {
        eventFired = true;
      });

      document.querySelector("button")!.click();
      await tick();
      // The $dispatch fires a CustomEvent that bubbles
    });
  });

  describe("$id", () => {
    it("generates scoped IDs", async () => {
      document.body.innerHTML = `
        <div l-data="{ myId: '' }">
          <div l-init="myId = $id('panel')"></div>
          <span l-text="myId"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      const text = document.querySelector("span")!.textContent!;
      expect(text).toMatch(/^faqir-\d+-panel$/);
    });
  });

  describe("$state / $variant", () => {
    it("reads data-state from closest [data-ui]", async () => {
      document.body.innerHTML = `
        <div data-ui="dialog" data-state="closed" l-data="{}">
          <span l-text="$state"></span>
        </div>
      `;
      Faqir.start();
      await tick();

      expect(document.querySelector("span")!.textContent).toBe("closed");
    });

    it("writes data-state to closest [data-ui]", async () => {
      document.body.innerHTML = `
        <div data-ui="dialog" data-state="closed" l-data="{}">
          <button @click="$state = 'open'">Open</button>
        </div>
      `;
      Faqir.start();
      await tick();

      document.querySelector("button")!.click();
      await tick();
      expect(document.querySelector("[data-ui]")!.getAttribute("data-state")).toBe("open");
    });
  });

  describe("$ui", () => {
    it("accesses controller API on closest [data-ui]", async () => {
      document.body.innerHTML = `
        <div data-ui="accordion" l-data="{}">
          <div data-part="item" data-state="collapsed">
            <button data-part="trigger">Toggle</button>
            <div data-part="content" hidden>Content</div>
          </div>
        </div>
      `;
      Faqir.start();
      await tick();

      const root = document.querySelector("[data-ui='accordion']")! as HTMLElement;
      expect((root as any)._faqirAccordion).toBeDefined();
      expect(typeof (root as any)._faqirAccordion.expand).toBe("function");
    });
  });
});

// ═══════════════════════════════════════════════════════
// Section 5: Faqir Bridge
// ═══════════════════════════════════════════════════════

describe("Faqir Bridge", () => {
  it("auto-initializes controllers for [data-ui] elements", async () => {
    document.body.innerHTML = `
      <div data-ui="dropdown">
        <button data-part="trigger">Open</button>
        <div data-part="menu" hidden>
          <button data-part="item">Item 1</button>
        </div>
      </div>
    `;
    Faqir.start();
    await tick();

    const root = document.querySelector("[data-ui='dropdown']")! as HTMLElement;
    expect((root as any)._faqirDropdown).toBeDefined();
    expect(typeof (root as any)._faqirDropdown.open).toBe("function");
  });
});

// ═══════════════════════════════════════════════════════
// Section 6: Core Utilities (bundled in faqir-core)
// ═══════════════════════════════════════════════════════

describe("Core Utilities (via Faqir API)", () => {
  describe("Faqir.store()", () => {
    it("creates a global reactive store", async () => {
      Faqir.store("testStore", { count: 0 });

      document.body.innerHTML = `
        <div l-data="{}">
          <span l-text="$store.testStore.count"></span>
        </div>
      `;
      Faqir.start();
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("0");
    });
  });

  describe("Faqir.data()", () => {
    it("registers a named data factory", async () => {
      Faqir.data("myComponent", () => ({
        label: "From Factory",
      }));

      document.body.innerHTML = `
        <div l-data="myComponent">
          <span l-text="label"></span>
        </div>
      `;
      Faqir.start();
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("From Factory");
    });
  });

  describe("Faqir.directive()", () => {
    it("registers custom directives", async () => {
      Faqir.directive("uppercase", (el: Element, dir: any, scope: any) => {
        Faqir.effect(() => {
          const val = Faqir.evaluate(dir.expression, scope, el);
          el.textContent = String(val).toUpperCase();
        });
      });

      document.body.innerHTML = `
        <div l-data="{ msg: 'hello' }">
          <span l-uppercase="msg"></span>
        </div>
      `;
      Faqir.start();
      await tick();
      expect(document.querySelector("span")!.textContent).toBe("HELLO");
    });
  });

  describe("Faqir.plugin()", () => {
    it("executes plugin function with Faqir instance", () => {
      let received: any = null;
      Faqir.plugin((faqir: any) => {
        received = faqir;
      });
      expect(received).toBe(Faqir);
    });
  });

  describe("Faqir.controller()", () => {
    it("registers custom controllers", async () => {
      Faqir.controller("my-widget", (root: HTMLElement) => {
        const api = { getValue: () => "custom-value" };
        (root as any)._faqirMyWidget = api;
        return api;
      });

      document.body.innerHTML = `<div data-ui="my-widget"></div>`;
      Faqir.start();
      await tick();

      const el = document.querySelector("[data-ui='my-widget']")!;
      expect((el as any)._faqirMyWidget.getValue()).toBe("custom-value");
    });
  });

  describe("Faqir.version", () => {
    it("exposes version string", () => {
      expect(Faqir.version).toBe("0.1.0");
    });
  });
});

// ═══════════════════════════════════════════════════════
// Section 7: Recipe Controllers
// ═══════════════════════════════════════════════════════

describe("Recipe Controllers", () => {
  describe("Dialog", () => {
    let root: HTMLElement;

    beforeEach(() => {
      document.body.innerHTML = `
        <div data-ui="dialog" data-state="closed">
          <button data-part="trigger">Open</button>
          <div data-part="overlay" hidden></div>
          <div data-part="panel" hidden tabindex="-1">
            <button data-part="close">X</button>
            <button class="focusable">Focus me</button>
          </div>
        </div>
      `;
      Faqir.start();
      root = document.querySelector("[data-ui='dialog']")! as HTMLElement;
    });

    it("opens dialog on trigger click", () => {
      root.querySelector("[data-part='trigger']")!.dispatchEvent(new Event("click"));
      expect(root.dataset.state).toBe("open");
      expect((root.querySelector("[data-part='overlay']") as HTMLElement).hidden).toBe(false);
      expect((root.querySelector("[data-part='panel']") as HTMLElement).hidden).toBe(false);
    });

    it("closes dialog on close button click", () => {
      (root as any)._faqirDialog.open();
      expect(root.dataset.state).toBe("open");

      root.querySelector("[data-part='close']")!.dispatchEvent(new Event("click"));
      // Should transition to closed (may go through closing state)
      expect(["closing", "closed"]).toContain(root.dataset.state);
    });

    it("closes on Escape key", () => {
      (root as any)._faqirDialog.open();
      root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(["closing", "closed"]).toContain(root.dataset.state);
    });

    it("closes on overlay click", () => {
      (root as any)._faqirDialog.open();
      root.querySelector("[data-part='overlay']")!.dispatchEvent(new Event("click"));
      expect(["closing", "closed"]).toContain(root.dataset.state);
    });

    it("has open/close/toggle/destroy API", () => {
      const api = (root as any)._faqirDialog;
      expect(typeof api.open).toBe("function");
      expect(typeof api.close).toBe("function");
      expect(typeof api.toggle).toBe("function");
      expect(typeof api.destroy).toBe("function");
    });

    it("toggle switches state", () => {
      const api = (root as any)._faqirDialog;
      api.toggle();
      expect(root.dataset.state).toBe("open");
      api.toggle();
      expect(["closing", "closed"]).toContain(root.dataset.state);
    });

    it("destroy removes API reference", () => {
      (root as any)._faqirDialog.destroy();
      expect((root as any)._faqirDialog).toBeUndefined();
    });
  });

  describe("Drawer", () => {
    let root: HTMLElement;

    beforeEach(() => {
      document.body.innerHTML = `
        <div data-ui="drawer" data-state="closed">
          <button data-part="trigger">Open</button>
          <div data-part="overlay" hidden></div>
          <div data-part="panel" hidden tabindex="-1">
            <button data-part="close">X</button>
          </div>
        </div>
      `;
      Faqir.start();
      root = document.querySelector("[data-ui='drawer']")! as HTMLElement;
    });

    it("opens and closes via API", () => {
      const api = (root as any)._faqirDrawer;
      api.open();
      expect(root.dataset.state).toBe("open");
      api.close();
      expect(["closing", "closed"]).toContain(root.dataset.state);
    });

    it("closes on Escape", () => {
      (root as any)._faqirDrawer.open();
      root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(["closing", "closed"]).toContain(root.dataset.state);
    });
  });

  describe("Tabs", () => {
    let root: HTMLElement;

    beforeEach(() => {
      document.body.innerHTML = `
        <div data-ui="tabs">
          <div data-part="list" role="tablist">
            <button data-part="trigger" role="tab" aria-selected="true">Tab 1</button>
            <button data-part="trigger" role="tab" aria-selected="false" tabindex="-1">Tab 2</button>
            <button data-part="trigger" role="tab" aria-selected="false" tabindex="-1">Tab 3</button>
          </div>
          <div data-part="panel" role="tabpanel">Panel 1</div>
          <div data-part="panel" role="tabpanel" hidden>Panel 2</div>
          <div data-part="panel" role="tabpanel" hidden>Panel 3</div>
        </div>
      `;
      Faqir.start();
      root = document.querySelector("[data-ui='tabs']")! as HTMLElement;
    });

    it("activates tab by index", () => {
      const api = (root as any)._faqirTabs;
      api.activate(1);

      const triggers = root.querySelectorAll("[data-part='trigger']");
      expect(triggers[0].getAttribute("aria-selected")).toBe("false");
      expect(triggers[1].getAttribute("aria-selected")).toBe("true");

      const panels = root.querySelectorAll("[data-part='panel']");
      expect((panels[0] as HTMLElement).hidden).toBe(true);
      expect((panels[1] as HTMLElement).hidden).toBe(false);
    });

    it("supports keyboard navigation (ArrowRight)", () => {
      const list = root.querySelector("[data-part='list']")!;
      list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

      const triggers = root.querySelectorAll("[data-part='trigger']");
      expect(triggers[1].getAttribute("aria-selected")).toBe("true");
    });

    it("supports keyboard navigation (ArrowLeft wraps)", () => {
      const list = root.querySelector("[data-part='list']")!;
      list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));

      const triggers = root.querySelectorAll("[data-part='trigger']");
      // Wraps to last: (0 - 1 + 3) % 3 = 2
      expect(triggers[2].getAttribute("aria-selected")).toBe("true");
    });

    it("Home/End keys jump to first/last tab", () => {
      const api = (root as any)._faqirTabs;
      const list = root.querySelector("[data-part='list']")!;

      list.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
      expect(api.getActiveIndex()).toBe(2);

      list.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
      expect(api.getActiveIndex()).toBe(0);
    });

    it("click activates tab", () => {
      const triggers = root.querySelectorAll("[data-part='trigger']");
      (triggers[2] as HTMLElement).click();

      expect(triggers[2].getAttribute("aria-selected")).toBe("true");
      expect(triggers[0].getAttribute("aria-selected")).toBe("false");
    });
  });

  describe("Dropdown", () => {
    let root: HTMLElement;

    beforeEach(() => {
      document.body.innerHTML = `
        <div data-ui="dropdown" data-state="closed">
          <button data-part="trigger" aria-expanded="false">Menu</button>
          <div data-part="menu" hidden>
            <button data-part="item">Item 1</button>
            <button data-part="item">Item 2</button>
            <button data-part="item">Item 3</button>
          </div>
        </div>
      `;
      Faqir.start();
      root = document.querySelector("[data-ui='dropdown']")! as HTMLElement;
    });

    it("opens on trigger click", () => {
      root.querySelector("[data-part='trigger']")!.dispatchEvent(new Event("click"));
      expect(root.dataset.state).toBe("open");
      expect((root.querySelector("[data-part='menu']") as HTMLElement).hidden).toBe(false);
    });

    it("closes on Escape in menu", () => {
      (root as any)._faqirDropdown.open();
      root.querySelector("[data-part='menu']")!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
      expect(root.dataset.state).toBe("closed");
    });

    it("has full API", () => {
      const api = (root as any)._faqirDropdown;
      expect(typeof api.open).toBe("function");
      expect(typeof api.close).toBe("function");
      expect(typeof api.toggle).toBe("function");
      expect(typeof api.destroy).toBe("function");
    });
  });

  describe("Accordion", () => {
    let root: HTMLElement;

    beforeEach(() => {
      document.body.innerHTML = `
        <div data-ui="accordion">
          <div data-part="item" data-state="collapsed">
            <button data-part="trigger" aria-expanded="false">Section 1</button>
            <div data-part="content" hidden>Content 1</div>
          </div>
          <div data-part="item" data-state="collapsed">
            <button data-part="trigger" aria-expanded="false">Section 2</button>
            <div data-part="content" hidden>Content 2</div>
          </div>
        </div>
      `;
      Faqir.start();
      root = document.querySelector("[data-ui='accordion']")! as HTMLElement;
    });

    it("expands item by index", () => {
      (root as any)._faqirAccordion.expand(0);
      const items = root.querySelectorAll("[data-part='item']");
      expect(items[0].getAttribute("data-state")).toBe("expanded");
      expect((items[0].querySelector("[data-part='content']") as HTMLElement).hidden).toBe(false);
    });

    it("collapses item by index", () => {
      (root as any)._faqirAccordion.expand(0);
      (root as any)._faqirAccordion.collapse(0);
      const items = root.querySelectorAll("[data-part='item']");
      expect(items[0].getAttribute("data-state")).toBe("collapsed");
      expect((items[0].querySelector("[data-part='content']") as HTMLElement).hidden).toBe(true);
    });

    it("toggle switches state", () => {
      const api = (root as any)._faqirAccordion;
      api.toggle(0);
      expect(root.querySelectorAll("[data-part='item']")[0].getAttribute("data-state")).toBe("expanded");
      api.toggle(0);
      expect(root.querySelectorAll("[data-part='item']")[0].getAttribute("data-state")).toBe("collapsed");
    });

    it("single mode collapses others", () => {
      root.dataset.variant = "single";
      const api = (root as any)._faqirAccordion;
      api.expand(0);
      api.expand(1);
      const items = root.querySelectorAll("[data-part='item']");
      expect(items[0].getAttribute("data-state")).toBe("collapsed");
      expect(items[1].getAttribute("data-state")).toBe("expanded");
    });

    it("expandAll/collapseAll work", () => {
      const api = (root as any)._faqirAccordion;
      api.expandAll();
      const items = root.querySelectorAll("[data-part='item']");
      expect(items[0].getAttribute("data-state")).toBe("expanded");
      expect(items[1].getAttribute("data-state")).toBe("expanded");

      api.collapseAll();
      expect(items[0].getAttribute("data-state")).toBe("collapsed");
      expect(items[1].getAttribute("data-state")).toBe("collapsed");
    });

    it("click on trigger toggles item", () => {
      const trigger = root.querySelectorAll("[data-part='trigger']")[0] as HTMLElement;
      trigger.click();
      expect(root.querySelectorAll("[data-part='item']")[0].getAttribute("data-state")).toBe("expanded");
    });
  });

  describe("Tooltip", () => {
    let root: HTMLElement;

    beforeEach(() => {
      document.body.innerHTML = `
        <div data-ui="tooltip" data-state="hidden">
          <button data-part="trigger">Hover me</button>
          <div data-part="content" hidden>Tooltip text</div>
        </div>
      `;
      Faqir.start();
      root = document.querySelector("[data-ui='tooltip']")! as HTMLElement;
    });

    it("has show/hide/destroy API", () => {
      const api = (root as any)._faqirTooltip;
      expect(typeof api.show).toBe("function");
      expect(typeof api.hide).toBe("function");
      expect(typeof api.destroy).toBe("function");
    });

    it("show makes content visible", () => {
      (root as any)._faqirTooltip.show();
      expect(root.dataset.state).toBe("visible");
      expect((root.querySelector("[data-part='content']") as HTMLElement).hidden).toBe(false);
    });

    it("hide makes content hidden", () => {
      (root as any)._faqirTooltip.show();
      (root as any)._faqirTooltip.hide();
      expect(root.dataset.state).toBe("hidden");
      expect((root.querySelector("[data-part='content']") as HTMLElement).hidden).toBe(true);
    });
  });

  describe("Toast", () => {
    let root: HTMLElement;

    beforeEach(() => {
      document.body.innerHTML = `<div data-ui="toast"></div>`;
      Faqir.start();
      root = document.querySelector("[data-ui='toast']")! as HTMLElement;
    });

    it("adds a toast notification", () => {
      const api = (root as any)._faqirToast;
      const id = api.add({ message: "Hello!", duration: 0 });
      expect(typeof id).toBe("string");
      expect(root.querySelector("[data-part='toast']")).not.toBeNull();
      expect(root.querySelector("[data-part='message']")!.textContent).toBe("Hello!");
    });

    it("dismisses a toast by id", () => {
      const api = (root as any)._faqirToast;
      const id = api.add({ message: "Bye!", duration: 0 });
      expect(root.querySelectorAll("[data-part='toast']").length).toBe(1);

      api.dismiss(id);
      expect(root.querySelectorAll("[data-part='toast']").length).toBe(0);
    });

    it("dismissAll removes all toasts", () => {
      const api = (root as any)._faqirToast;
      api.add({ message: "1", duration: 0 });
      api.add({ message: "2", duration: 0 });
      expect(root.querySelectorAll("[data-part='toast']").length).toBe(2);

      api.dismissAll();
      expect(root.querySelectorAll("[data-part='toast']").length).toBe(0);
    });

    it("toast includes close button", () => {
      const api = (root as any)._faqirToast;
      api.add({ message: "With close", duration: 0 });
      expect(root.querySelector("[data-part='close']")).not.toBeNull();
    });

    it("toast supports action button", () => {
      let actionCalled = false;
      const api = (root as any)._faqirToast;
      api.add({
        message: "Action",
        actionLabel: "Undo",
        onAction: () => { actionCalled = true; },
        duration: 0,
      });
      expect(root.querySelector("[data-part='action']")).not.toBeNull();
      expect(root.querySelector("[data-part='action']")!.textContent).toBe("Undo");
    });

    it("toast has correct ARIA attributes", () => {
      const api = (root as any)._faqirToast;
      api.add({ message: "Accessible", duration: 0 });
      const toast = root.querySelector("[data-part='toast']")!;
      expect(toast.getAttribute("role")).toBe("status");
      expect(toast.getAttribute("aria-live")).toBe("polite");
    });
  });

  describe("Combobox", () => {
    let root: HTMLElement;

    beforeEach(() => {
      document.body.innerHTML = `
        <div data-ui="combobox" data-state="closed">
          <input data-part="input" aria-expanded="false" />
          <div data-part="listbox" hidden>
            <div data-part="option">Apple</div>
            <div data-part="option">Banana</div>
            <div data-part="option">Cherry</div>
          </div>
          <div data-part="empty" hidden>No results</div>
        </div>
      `;
      Faqir.start();
      root = document.querySelector("[data-ui='combobox']")! as HTMLElement;
    });

    it("opens on input focus", () => {
      const input = root.querySelector("[data-part='input']")! as HTMLInputElement;
      input.dispatchEvent(new Event("focus"));
      expect(root.dataset.state).toBe("open");
    });

    it("filters options", () => {
      const api = (root as any)._faqirCombobox;
      api.open();
      const count = api.filter("ban");
      expect(count).toBe(1);
      const options = root.querySelectorAll("[data-part='option']");
      expect(options[0].hasAttribute("data-hidden")).toBe(true); // Apple
      expect(options[1].hasAttribute("data-hidden")).toBe(false); // Banana
      expect(options[2].hasAttribute("data-hidden")).toBe(true); // Cherry
    });

    it("getValue/setValue work", () => {
      const api = (root as any)._faqirCombobox;
      api.setValue("test");
      expect(api.getValue()).toBe("test");
      expect((root.querySelector("[data-part='input']") as HTMLInputElement).value).toBe("test");
    });

    it("close hides listbox", () => {
      const api = (root as any)._faqirCombobox;
      api.open();
      api.close();
      expect(root.dataset.state).toBe("closed");
      expect((root.querySelector("[data-part='listbox']") as HTMLElement).hidden).toBe(true);
    });
  });

  describe("Table", () => {
    let root: HTMLElement;

    beforeEach(() => {
      document.body.innerHTML = `
        <div data-ui="table">
          <table>
            <thead data-part="thead">
              <tr>
                <th data-part="th"><input type="checkbox" data-part="checkbox" /></th>
                <th data-part="th" data-sortable aria-sort="none">Name</th>
                <th data-part="th" data-sortable aria-sort="none">Age</th>
              </tr>
            </thead>
            <tbody data-part="tbody">
              <tr data-part="tr">
                <td data-part="td"><input type="checkbox" data-part="checkbox" /></td>
                <td data-part="td">Charlie</td>
                <td data-part="td">30</td>
              </tr>
              <tr data-part="tr">
                <td data-part="td"><input type="checkbox" data-part="checkbox" /></td>
                <td data-part="td">Alice</td>
                <td data-part="td">25</td>
              </tr>
              <tr data-part="tr">
                <td data-part="td"><input type="checkbox" data-part="checkbox" /></td>
                <td data-part="td">Bob</td>
                <td data-part="td">35</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
      Faqir.start();
      root = document.querySelector("[data-ui='table']")! as HTMLElement;
    });

    it("selects a row by index", () => {
      const api = (root as any)._faqirTable;
      api.selectRow(0);
      const rows = root.querySelectorAll("[data-part='tbody'] [data-part='tr']");
      expect(rows[0].hasAttribute("data-selected")).toBe(true);
    });

    it("selectAll selects all rows", () => {
      const api = (root as any)._faqirTable;
      api.selectAll();
      const rows = root.querySelectorAll("[data-part='tbody'] [data-part='tr']");
      rows.forEach((row) => {
        expect(row.hasAttribute("data-selected")).toBe(true);
      });
    });

    it("deselectAll clears selection", () => {
      const api = (root as any)._faqirTable;
      api.selectAll();
      api.deselectAll();
      const rows = root.querySelectorAll("[data-part='tbody'] [data-part='tr']");
      rows.forEach((row) => {
        expect(row.hasAttribute("data-selected")).toBe(false);
      });
    });

    it("getSelected returns selected indices", () => {
      const api = (root as any)._faqirTable;
      api.selectRow(0);
      api.selectRow(2);
      expect(api.getSelected()).toEqual([0, 2]);
    });

    it("sorts by column ascending", () => {
      const api = (root as any)._faqirTable;
      api.sort(1, "ascending"); // Sort by Name
      const rows = root.querySelectorAll("[data-part='tbody'] [data-part='tr']");
      const names = Array.from(rows).map((r) =>
        r.querySelectorAll("[data-part='td']")[1].textContent!.trim()
      );
      expect(names).toEqual(["Alice", "Bob", "Charlie"]);
    });

    it("sorts by column descending", () => {
      const api = (root as any)._faqirTable;
      api.sort(1, "descending");
      const rows = root.querySelectorAll("[data-part='tbody'] [data-part='tr']");
      const names = Array.from(rows).map((r) =>
        r.querySelectorAll("[data-part='td']")[1].textContent!.trim()
      );
      expect(names).toEqual(["Charlie", "Bob", "Alice"]);
    });

    it("sorts numerically", () => {
      const api = (root as any)._faqirTable;
      api.sort(2, "ascending"); // Sort by Age
      const rows = root.querySelectorAll("[data-part='tbody'] [data-part='tr']");
      const ages = Array.from(rows).map((r) =>
        r.querySelectorAll("[data-part='td']")[2].textContent!.trim()
      );
      expect(ages).toEqual(["25", "30", "35"]);
    });
  });

  describe("Popover", () => {
    let root: HTMLElement;

    beforeEach(() => {
      document.body.innerHTML = `
        <div data-ui="popover" data-state="closed">
          <button data-part="trigger" aria-expanded="false">Open</button>
          <div data-part="content" hidden>
            <button data-part="close">X</button>
            Popover content
          </div>
        </div>
      `;
      Faqir.start();
      root = document.querySelector("[data-ui='popover']")! as HTMLElement;
    });

    it("opens on trigger click", () => {
      root.querySelector("[data-part='trigger']")!.dispatchEvent(new Event("click"));
      expect(root.dataset.state).toBe("open");
      expect((root.querySelector("[data-part='content']") as HTMLElement).hidden).toBe(false);
    });

    it("closes on close button click", () => {
      (root as any)._faqirPopover.open();
      root.querySelector("[data-part='close']")!.dispatchEvent(new Event("click", { bubbles: true }));
      expect(root.dataset.state).toBe("closed");
    });

    it("closes on Escape", () => {
      (root as any)._faqirPopover.open();
      root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(root.dataset.state).toBe("closed");
    });

    it("toggle works", () => {
      const api = (root as any)._faqirPopover;
      api.toggle();
      expect(root.dataset.state).toBe("open");
      api.toggle();
      expect(root.dataset.state).toBe("closed");
    });
  });

  describe("Pagination", () => {
    let root: HTMLElement;

    beforeEach(() => {
      document.body.innerHTML = `
        <div data-ui="pagination">
          <button data-part="prev">Prev</button>
          <nav data-part="nav">
            <button data-part="page" data-page="1" data-state="active" aria-current="page">1</button>
            <button data-part="page" data-page="2">2</button>
            <button data-part="page" data-page="3">3</button>
          </nav>
          <button data-part="next">Next</button>
        </div>
      `;
      Faqir.start();
      root = document.querySelector("[data-ui='pagination']")! as HTMLElement;
    });

    it("starts on page 1", () => {
      expect((root as any)._faqirPagination.getPage()).toBe(1);
    });

    it("setPage changes active page", () => {
      const api = (root as any)._faqirPagination;
      api.setPage(2);
      expect(api.getPage()).toBe(2);
      const btns = root.querySelectorAll("[data-part='page']");
      expect(btns[1].getAttribute("data-state")).toBe("active");
      expect(btns[0].hasAttribute("data-state")).toBe(false);
    });

    it("prev/next buttons work", () => {
      const api = (root as any)._faqirPagination;

      root.querySelector("[data-part='next']")!.dispatchEvent(new Event("click"));
      expect(api.getPage()).toBe(2);

      root.querySelector("[data-part='prev']")!.dispatchEvent(new Event("click"));
      expect(api.getPage()).toBe(1);
    });

    it("clamps page to valid range", () => {
      const api = (root as any)._faqirPagination;
      api.setPage(100);
      expect(api.getPage()).toBe(3); // max is 3

      api.setPage(-1);
      expect(api.getPage()).toBe(1); // min is 1
    });

    it("disables prev on first page", () => {
      const prev = root.querySelector("[data-part='prev']")! as HTMLButtonElement;
      expect(prev.disabled).toBe(true);
    });

    it("disables next on last page", () => {
      (root as any)._faqirPagination.setPage(3);
      const next = root.querySelector("[data-part='next']")! as HTMLButtonElement;
      expect(next.disabled).toBe(true);
    });

    it("emits page-change event", () => {
      let detail: any = null;
      root.addEventListener("faqir:page-change", ((e: CustomEvent) => {
        detail = e.detail;
      }) as EventListener);

      (root as any)._faqirPagination.setPage(2);
      expect(detail).toEqual({ page: 2 });
    });
  });

  describe("Sheet", () => {
    let root: HTMLElement;

    beforeEach(() => {
      document.body.innerHTML = `
        <div data-ui="sheet" data-state="closed">
          <button data-part="trigger">Open</button>
          <div data-part="overlay" hidden></div>
          <div data-part="panel" hidden tabindex="-1">
            <button data-part="close">X</button>
          </div>
        </div>
      `;
      Faqir.start();
      root = document.querySelector("[data-ui='sheet']")! as HTMLElement;
    });

    it("opens via API", () => {
      (root as any)._faqirSheet.open();
      expect(root.dataset.state).toBe("open");
    });

    it("closes on Escape", () => {
      (root as any)._faqirSheet.open();
      root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(["closing", "closed"]).toContain(root.dataset.state);
    });

    it("toggle works", () => {
      const api = (root as any)._faqirSheet;
      api.toggle();
      expect(root.dataset.state).toBe("open");
      api.toggle();
      expect(["closing", "closed"]).toContain(root.dataset.state);
    });
  });

  describe("Select Custom", () => {
    let root: HTMLElement;

    beforeEach(() => {
      document.body.innerHTML = `
        <div data-ui="select-custom" data-state="closed">
          <button data-part="trigger" aria-expanded="false">
            <span data-part="value" data-placeholder>Select...</span>
          </button>
          <div data-part="listbox" hidden>
            <div data-part="option" data-value="a" aria-selected="false">Apple</div>
            <div data-part="option" data-value="b" aria-selected="false">Banana</div>
            <div data-part="option" data-value="c" aria-selected="false">Cherry</div>
          </div>
        </div>
      `;
      Faqir.start();
      root = document.querySelector("[data-ui='select-custom']")! as HTMLElement;
    });

    it("opens on trigger click", () => {
      root.querySelector("[data-part='trigger']")!.dispatchEvent(new Event("click"));
      expect(root.dataset.state).toBe("open");
    });

    it("selects an option by value", () => {
      const api = (root as any)._faqirSelectCustom;
      api.select("b");
      expect(api.getValue()).toBe("b");
      expect(root.querySelector("[data-part='value']")!.textContent).toBe("Banana");
    });

    it("closes after selection", () => {
      const api = (root as any)._faqirSelectCustom;
      api.open();
      api.select("a");
      expect(root.dataset.state).toBe("closed");
    });

    it("emits select-change event", () => {
      let detail: any = null;
      root.addEventListener("select-change", ((e: CustomEvent) => {
        detail = e.detail;
      }) as EventListener);

      (root as any)._faqirSelectCustom.select("c");
      expect(detail).toEqual({ value: "c", label: "Cherry" });
    });
  });

  describe("Date Picker", () => {
    let root: HTMLElement;

    beforeEach(() => {
      document.body.innerHTML = `
        <div data-ui="date-picker" data-state="closed">
          <button data-part="trigger">📅</button>
          <input data-part="input" aria-expanded="false" readonly />
          <div data-part="calendar" hidden>
            <div>
              <button data-part="nav-prev">&lt;</button>
              <span data-part="month-label"></span>
              <button data-part="nav-next">&gt;</button>
            </div>
            <table>
              <tbody data-part="grid-body"></tbody>
            </table>
          </div>
        </div>
      `;
      Faqir.start();
      root = document.querySelector("[data-ui='date-picker']")! as HTMLElement;
    });

    it("has full API", () => {
      const api = (root as any)._faqirDatePicker;
      expect(typeof api.open).toBe("function");
      expect(typeof api.close).toBe("function");
      expect(typeof api.getValue).toBe("function");
      expect(typeof api.setValue).toBe("function");
      expect(typeof api.navigate).toBe("function");
      expect(typeof api.selectDate).toBe("function");
      expect(typeof api.destroy).toBe("function");
    });

    it("opens calendar on trigger click", () => {
      root.querySelector("[data-part='trigger']")!.dispatchEvent(new Event("click"));
      expect(root.dataset.state).toBe("open");
      expect((root.querySelector("[data-part='calendar']") as HTMLElement).hidden).toBe(false);
    });

    it("setValue sets the date", () => {
      const api = (root as any)._faqirDatePicker;
      api.setValue("2025-06-15");
      expect(api.getValue()).toBe("2025-06-15");
      const input = root.querySelector("[data-part='input']") as HTMLInputElement;
      expect(input.value).toContain("June");
      expect(input.value).toContain("15");
      expect(input.value).toContain("2025");
    });

    it("builds calendar grid with day buttons", () => {
      const api = (root as any)._faqirDatePicker;
      api.open();
      const dayButtons = root.querySelectorAll("[data-part='day']");
      expect(dayButtons.length).toBeGreaterThan(0);
    });

    it("navigates months", () => {
      const api = (root as any)._faqirDatePicker;
      api.open();
      const monthLabel = root.querySelector("[data-part='month-label']")!;
      const initialText = monthLabel.textContent;

      root.querySelector("[data-part='nav-next']")!.dispatchEvent(new Event("click"));
      expect(monthLabel.textContent).not.toBe(initialText);
    });

    it("emits date-change event on selection", () => {
      let detail: any = null;
      root.addEventListener("faqir:date-change", ((e: CustomEvent) => {
        detail = e.detail;
      }) as EventListener);

      const api = (root as any)._faqirDatePicker;
      api.selectDate(new Date(2025, 5, 15));
      expect(detail).not.toBeNull();
      expect(detail.date).toBe("2025-06-15");
    });

    it("closes after date selection", () => {
      const api = (root as any)._faqirDatePicker;
      api.open();
      api.selectDate(new Date(2025, 0, 1));
      expect(root.dataset.state).toBe("closed");
    });
  });

  describe("Command Palette", () => {
    let root: HTMLElement;

    beforeEach(() => {
      document.body.innerHTML = `
        <div data-ui="command-palette" data-state="closed">
          <div data-part="overlay" hidden></div>
          <div data-part="panel" hidden tabindex="-1">
            <input data-part="search" />
            <div data-part="list">
              <div data-part="group">
                <div data-part="item"><span data-part="item-label">Open File</span></div>
                <div data-part="item"><span data-part="item-label">Save File</span></div>
              </div>
              <div data-part="group">
                <div data-part="item"><span data-part="item-label">Settings</span></div>
              </div>
            </div>
            <div data-part="empty" hidden>No results</div>
          </div>
        </div>
      `;
      Faqir.start();
      root = document.querySelector("[data-ui='command-palette']")! as HTMLElement;
    });

    it("opens and shows panel", () => {
      (root as any)._faqirCommandPalette.open();
      expect(root.dataset.state).toBe("open");
      expect((root.querySelector("[data-part='panel']") as HTMLElement).hidden).toBe(false);
    });

    it("closes on overlay click", () => {
      (root as any)._faqirCommandPalette.open();
      root.querySelector("[data-part='overlay']")!.dispatchEvent(new Event("click"));
      expect(root.dataset.state).toBe("closed");
    });

    it("filters items by search", () => {
      const api = (root as any)._faqirCommandPalette;
      api.open();
      const count = api.filter("save");
      expect(count).toBe(1);
    });

    it("hides groups with no visible items", () => {
      const api = (root as any)._faqirCommandPalette;
      api.open();
      api.filter("settings");
      const groups = root.querySelectorAll("[data-part='group']");
      // First group should be hidden (no match), second visible
      expect(groups[0].hasAttribute("data-hidden")).toBe(true);
      expect(groups[1].hasAttribute("data-hidden")).toBe(false);
    });

    it("has full API", () => {
      const api = (root as any)._faqirCommandPalette;
      expect(typeof api.open).toBe("function");
      expect(typeof api.close).toBe("function");
      expect(typeof api.filter).toBe("function");
      expect(typeof api.selectItem).toBe("function");
      expect(typeof api.registerCommand).toBe("function");
      expect(typeof api.destroy).toBe("function");
    });
  });
});

// ═══════════════════════════════════════════════════════
// Backwards Compatibility
// ═══════════════════════════════════════════════════════

describe("Backwards Compatibility", () => {
  it("existing HTML without l-* directives still works (controllers auto-init from data-ui)", async () => {
    document.body.innerHTML = `
      <div data-ui="accordion">
        <div data-part="item" data-state="collapsed">
          <button data-part="trigger">Section</button>
          <div data-part="content" hidden>Content</div>
        </div>
      </div>
    `;
    Faqir.start();
    await tick();

    const root = document.querySelector("[data-ui='accordion']")! as HTMLElement;
    expect((root as any)._faqirAccordion).toBeDefined();

    // Can interact purely through controller API without any directives
    (root as any)._faqirAccordion.expand(0);
    expect(root.querySelector("[data-part='item']")!.getAttribute("data-state")).toBe("expanded");
  });
});
