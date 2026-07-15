import { beforeEach, describe, expect, it } from "bun:test";

const Faqir = require("../../registry/core/faqir-core.js");

let pluginCalls = 0;
const originalPlugin = Faqir.plugin;
Faqir.plugin = function (fn: (api: typeof Faqir) => void) {
  pluginCalls++;
  return originalPlugin.call(Faqir, fn);
};
(globalThis as any).Faqir = Faqir;
const install = require("../../registry/core/plugins/faqir-persist.js");
Faqir.plugin = originalPlugin;

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function bootCount(namespace: string, initial: number) {
  document.body.innerHTML = `
    <div id="root" data-persist-namespace="${namespace}"
         l-data="{ count: ${initial} }" l-persist="count">
      <output id="value" l-text="count"></output>
      <button id="increment" @click="count++">+</button>
    </div>`;
  Faqir.start();
  await tick();
  return document.getElementById("root") as HTMLElement & { __faqirScope: { count: number } };
}

beforeEach(async () => {
  document.body.innerHTML = "";
  localStorage.clear();
  await tick();
});

describe("faqir-persist · registration", () => {
  it("self-registers l-persist and $persist through Faqir.plugin", () => {
    expect(pluginCalls).toBe(1);
    expect(typeof install).toBe("function");
  });
});

describe("faqir-persist · l-persist", () => {
  it("restores reactive state after a simulated reload", async () => {
    const first = await bootCount("reload", 1);
    document.getElementById("increment")!.click();
    await tick();

    expect(first.__faqirScope.count).toBe(2);
    expect(localStorage.getItem("faqir:reload:count")).toBe("2");

    Faqir.destroy(first);
    const second = await bootCount("reload", 0);
    expect(second.__faqirScope.count).toBe(2);
    expect(document.getElementById("value")!.textContent).toBe("2");
  });

  it("JSON-serializes nested reactive objects", async () => {
    document.body.innerHTML = `
      <div id="root" data-persist-namespace="json"
           l-data="{ draft: { name: 'Ada', tags: ['new'] } }" l-persist="draft">
        <button id="change" @click="draft.name = 'Grace'; draft.tags.push('saved')"></button>
      </div>`;
    Faqir.start();
    await tick();
    document.getElementById("change")!.click();
    await tick();

    expect(JSON.parse(localStorage.getItem("faqir:json:draft")!)).toEqual({
      name: "Grace",
      tags: ["new", "saved"],
    });
  });

  it("falls back to in-memory persistence when storage writes throw", async () => {
    const proto = Object.getPrototypeOf(localStorage);
    const setItem = proto.setItem;
    proto.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
    try {
      const first = await bootCount("private-mode", 4);
      document.getElementById("increment")!.click();
      await tick();
      expect(first.__faqirScope.count).toBe(5);

      Faqir.destroy(first);
      const second = await bootCount("private-mode", 0);
      expect(second.__faqirScope.count).toBe(5);
    } finally {
      proto.setItem = setItem;
    }
  });

  it("keeps identical state keys isolated by namespace", async () => {
    const alpha = await bootCount("alpha", 1);
    document.getElementById("increment")!.click();
    await tick();
    Faqir.destroy(alpha);

    const beta = await bootCount("beta", 10);
    document.getElementById("increment")!.click();
    await tick();

    expect(localStorage.getItem("faqir:alpha:count")).toBe("2");
    expect(localStorage.getItem("faqir:beta:count")).toBe("11");
  });

  it("disposes its reactive writer when the owning scope is destroyed", async () => {
    const root = await bootCount("destroy", 1);
    Faqir.destroy(root);
    root.__faqirScope.count = 9;
    await tick();
    expect(localStorage.getItem("faqir:destroy:count")).toBe("1");
  });
});

describe("faqir-persist · $persist", () => {
  it("reads and writes namespaced JSON values from expressions", async () => {
    document.body.innerHTML = `
      <div id="root" data-persist-namespace="magic" l-data="{ loaded: null }">
        <button id="save" @click="$persist('answer', { value: 42 })"></button>
        <button id="load" @click="loaded = $persist('answer')"></button>
        <output id="value" l-text="loaded && loaded.value"></output>
      </div>`;
    Faqir.start();
    await tick();

    document.getElementById("save")!.click();
    document.getElementById("load")!.click();
    await tick();

    expect(localStorage.getItem("faqir:magic:answer")).toBe('{"value":42}');
    expect(document.getElementById("value")!.textContent).toBe("42");
  });
});
