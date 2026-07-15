import { afterEach, beforeEach, describe, expect, it } from "bun:test";

const Faqir = require("../../registry/core/faqir-core.js");

let pluginCalls = 0;
const originalPlugin = Faqir.plugin;
Faqir.plugin = function (fn: (api: typeof Faqir) => void) {
  pluginCalls++;
  return originalPlugin.call(Faqir, fn);
};
(globalThis as any).Faqir = Faqir;
const install = require("../../registry/core/plugins/faqir-intersect.js");
Faqir.plugin = originalPlugin;

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly callback: IntersectionObserverCallback;
  observed: Element[] = [];
  disconnectCalls = 0;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  observe(element: Element) {
    this.observed.push(element);
  }

  disconnect() {
    this.disconnectCalls++;
  }

  emit(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting, target: this.observed[0] } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function observerFor(target: Element): MockIntersectionObserver {
  return MockIntersectionObserver.instances.filter((item) => item.observed[0] === target).at(-1)!;
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function boot(markup: string) {
  document.body.innerHTML = markup;
  Faqir.start();
  await tick();
  return document.getElementById("root") as HTMLElement & {
    __faqirScope: Record<string, any>;
  };
}

beforeEach(async () => {
  document.body.innerHTML = "";
  MockIntersectionObserver.instances = [];
  (globalThis as any).IntersectionObserver = MockIntersectionObserver;
  (window as any).IntersectionObserver = MockIntersectionObserver;
  await tick();
});

afterEach(() => {
  delete (globalThis as any).IntersectionObserver;
  delete (window as any).IntersectionObserver;
});

describe("faqir-intersect · registration", () => {
  it("self-registers via Faqir.plugin", () => {
    expect(pluginCalls).toBe(1);
    expect(typeof install).toBe("function");
  });
});

describe("faqir-intersect · l-intersect", () => {
  it("runs enter and leave expressions with the active entry", async () => {
    const root = await boot(`
      <div id="root" l-data="{ entered: 0, left: 0, targetOk: false }">
        <section id="target"
          l-intersect="entered++; targetOk = $intersection.target.id === 'target'"
          l-intersect.leave="left++"></section>
      </div>`);

    const target = document.getElementById("target")!;
    const observers = MockIntersectionObserver.instances
      .filter((item) => item.observed[0] === target)
      .slice(-2);
    expect(observers).toHaveLength(2);
    for (const observer of observers) observer.emit(true);
    expect(root.__faqirScope.entered).toBe(1);
    expect(root.__faqirScope.left).toBe(0);
    expect(root.__faqirScope.targetOk).toBe(true);

    for (const observer of observers) observer.emit(false);
    expect(root.__faqirScope.entered).toBe(1);
    expect(root.__faqirScope.left).toBe(1);
  });

  it(".once disconnects after the first enter and never evaluates again", async () => {
    const root = await boot(`
      <div id="root" l-data="{ entered: 0 }">
        <section id="target" l-intersect.once="entered++"></section>
      </div>`);
    const target = document.getElementById("target");
    const observer = observerFor(target!);

    observer.emit(false);
    observer.emit(true);
    observer.emit(true);

    expect(root.__faqirScope.entered).toBe(1);
    expect(observer.disconnectCalls).toBe(1);
  });

  it("disconnects the observer on scope teardown", async () => {
    const root = await boot(`
      <div id="root" l-data="{ entered: 0 }">
        <section id="target" l-intersect="entered++"></section>
      </div>`);
    const target = document.getElementById("target");
    const observer = observerFor(target!);

    Faqir.destroy(root);
    observer.emit(true);

    expect(observer.disconnectCalls).toBe(1);
    expect(root.__faqirScope.entered).toBe(0);
  });

  it("also works when declared on the l-data scope root", async () => {
    const root = await boot(`
      <section id="root" l-data="{ entered: 0 }" l-intersect="entered++"></section>`);
    observerFor(root).emit(true);
    expect(root.__faqirScope.entered).toBe(1);
  });
});
