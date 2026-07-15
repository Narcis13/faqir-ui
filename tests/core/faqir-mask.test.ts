import { beforeEach, describe, expect, it } from "bun:test";

const Faqir = require("../../registry/core/faqir-core.js");

let pluginCalls = 0;
const originalPlugin = Faqir.plugin;
Faqir.plugin = function (fn: (api: typeof Faqir) => void) {
  pluginCalls++;
  return originalPlugin.call(Faqir, fn);
};
(globalThis as any).Faqir = Faqir;
const install = require("../../registry/core/plugins/faqir-mask.js") as {
  (api: typeof Faqir): void;
  maskEdit: (
    mask: string,
    priorValue: string,
    edit: {
      inputType?: string;
      data?: string | null;
      selectionStart?: number;
      selectionEnd?: number;
    },
  ) => { raw: string; value: string; caret: number };
};
Faqir.plugin = originalPlugin;

const { maskEdit } = install;

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function beforeInput(input: HTMLInputElement, inputType: string, data: string | null = null) {
  const event = new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    inputType,
    data,
  });
  input.dispatchEvent(event);
}

function paste(input: HTMLInputElement, text: string) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    configurable: true,
    value: { getData: () => text },
  });
  input.dispatchEvent(event);
}

async function boot(markup: string) {
  document.body.innerHTML = markup;
  Faqir.start();
  await tick();
  await tick();
  return document.getElementById("root") as HTMLElement & {
    __faqirScope: Record<string, any>;
  };
}

beforeEach(async () => {
  document.body.innerHTML = "";
  await tick();
});

describe("faqir-mask · registration", () => {
  it("self-registers l-mask through Faqir.plugin and exports the pure engine", () => {
    expect(pluginCalls).toBe(1);
    expect(typeof install).toBe("function");
    expect(typeof maskEdit).toBe("function");
  });
});

describe("faqir-mask · pure mask engine", () => {
  it("inserts literals as date groups fill and keeps the caret at the next slot", () => {
    const first = maskEdit("99/99/9999", "", {
      inputType: "insertText",
      data: "1",
      selectionStart: 0,
      selectionEnd: 0,
    });
    expect(first).toEqual({ raw: "1", value: "1", caret: 1 });

    const second = maskEdit("99/99/9999", first.value, {
      inputType: "insertText",
      data: "2",
      selectionStart: first.caret,
      selectionEnd: first.caret,
    });
    expect(second).toEqual({ raw: "12", value: "12/", caret: 3 });
  });

  it("implements every token: 9 digit, a letter, and * any character", () => {
    expect(maskEdit("99", "", {
      inputType: "insertFromPaste", data: "a1-2", selectionStart: 0, selectionEnd: 0,
    })).toEqual({ raw: "12", value: "12", caret: 2 });

    expect(maskEdit("aa", "", {
      inputType: "insertFromPaste", data: "1A-b", selectionStart: 0, selectionEnd: 0,
    })).toEqual({ raw: "Ab", value: "Ab", caret: 2 });

    expect(maskEdit("**", "", {
      inputType: "insertFromPaste", data: "? ", selectionStart: 0, selectionEnd: 0,
    })).toEqual({ raw: "? ", value: "? ", caret: 2 });
  });

  it("normalizes a formatted phone paste and caps it to the mask", () => {
    expect(maskEdit("(999) 999-9999", "", {
      inputType: "insertFromPaste",
      data: "+1 (555) 123-4567 ext 8",
      selectionStart: 0,
      selectionEnd: 0,
    })).toEqual({ raw: "1555123456", value: "(155) 512-3456", caret: 14 });
  });

  it("replaces a mid-string selection without moving the caret to the end", () => {
    expect(maskEdit("99/99/9999", "12/34/5678", {
      inputType: "insertFromPaste",
      data: "88",
      selectionStart: 3,
      selectionEnd: 5,
    })).toEqual({ raw: "12885678", value: "12/88/5678", caret: 6 });
  });

  it("handles backward deletion, forward deletion, and selected-range deletion", () => {
    expect(maskEdit("99/99/9999", "12/34/5678", {
      inputType: "deleteContentBackward",
      selectionStart: 4,
      selectionEnd: 4,
    })).toEqual({ raw: "1245678", value: "12/45/678", caret: 3 });

    expect(maskEdit("99/99/9999", "12/34/5678", {
      inputType: "deleteContentForward",
      selectionStart: 3,
      selectionEnd: 3,
    })).toEqual({ raw: "1245678", value: "12/45/678", caret: 3 });

    expect(maskEdit("99/99/9999", "12/34/5678", {
      inputType: "deleteByCut",
      selectionStart: 3,
      selectionEnd: 5,
    })).toEqual({ raw: "125678", value: "12/56/78", caret: 3 });
  });

  it("leaves boundary deletes stable and rejects a pattern with no tokens", () => {
    expect(maskEdit("99", "12", {
      inputType: "deleteContentBackward", selectionStart: 0, selectionEnd: 0,
    })).toEqual({ raw: "12", value: "12", caret: 0 });
    expect(maskEdit("99", "12", {
      inputType: "deleteContentForward", selectionStart: 2, selectionEnd: 2,
    })).toEqual({ raw: "12", value: "12", caret: 2 });
    expect(() => maskEdit("--", "", {})).toThrow("at least one 9, a, or * token");
  });
});

describe("faqir-mask · DOM and l-model bridge", () => {
  it("keeps the display masked while l-model receives the raw value", async () => {
    const root = await boot(`
      <div id="root" l-data="{ birthday: '' }">
        <input id="masked" l-mask="99/99/9999" l-model="birthday" />
        <output id="raw" l-text="birthday"></output>
      </div>`);
    const input = document.getElementById("masked") as HTMLInputElement;

    beforeInput(input, "insertText", "1");
    beforeInput(input, "insertText", "2");
    await tick();

    expect(input.value).toBe("12/");
    expect(root.__faqirScope.birthday).toBe("12");
    expect(document.getElementById("raw")!.textContent).toBe("12");
  });

  it("normalizes paste, emits raw+masked detail, and preserves a mid-edit caret", async () => {
    await boot(`
      <div id="root" l-data="{ date: '' }">
        <input id="masked" l-model="date" l-mask="99/99/9999" />
      </div>`);
    const input = document.getElementById("masked") as HTMLInputElement;
    const details: Array<{ raw: string; value: string; caret: number }> = [];
    input.addEventListener("faqir:mask", (event) => {
      details.push((event as CustomEvent).detail);
    });

    paste(input, "12-34-5678");
    input.setSelectionRange(3, 5);
    beforeInput(input, "insertText", "9");
    await tick();

    expect(input.value).toBe("12/95/678");
    expect(input.selectionStart).toBe(4);
    expect(input.selectionStart).toBeLessThan(input.value.length);
    expect(details.at(-1)).toEqual({ raw: "1295678", value: "12/95/678", caret: 4 });
  });

  it("reflects programmatic model changes back into the masked display", async () => {
    const root = await boot(`
      <div id="root" l-data="{ phone: '' }">
        <input id="masked" l-mask="(999) 999-9999" l-model="phone" />
      </div>`);
    const input = document.getElementById("masked") as HTMLInputElement;

    root.__faqirScope.phone = "5551234567";
    await tick();
    await tick();

    expect(root.__faqirScope.phone).toBe("5551234567");
    expect(input.value).toBe("(555) 123-4567");
    expect((input as any)._faqirMask.getRaw()).toBe("5551234567");
  });

  it("removes its listeners and private bridge on scope teardown", async () => {
    const root = await boot(`
      <div id="root" l-data="{ value: '' }">
        <input id="masked" l-mask="99" l-model="value" />
      </div>`);
    const input = document.getElementById("masked") as HTMLInputElement;
    Faqir.destroy(root);

    beforeInput(input, "insertText", "7");
    expect(root.__faqirScope.value).toBe("");
    expect((input as any)._faqirMask).toBeUndefined();
  });
});

describe("faqir-mask · input-otp integration", () => {
  it("enforces numeric OTP input through the mask path and updates segments", async () => {
    await boot(`
      <div id="root" l-data="{}">
        <div id="otp" data-ui="input-otp" data-length="4" data-mode="numeric">
          <input data-part="input" type="text" aria-label="Code" l-mask="9999" />
          <div data-part="segments" aria-hidden="true"></div>
        </div>
      </div>`);
    const root = document.getElementById("otp") as HTMLElement & {
      _faqirInputOTP: { getValue(): string };
    };
    const input = root.querySelector("[data-part='input']") as HTMLInputElement;

    beforeInput(input, "insertText", "a");
    beforeInput(input, "insertText", "4");
    beforeInput(input, "insertText", "2");
    await tick();

    expect((input as any)._faqirMask).toBeDefined();
    expect(root._faqirInputOTP.getValue()).toBe("42");
    expect(input.value).toBe("42");
    expect([...root.querySelectorAll("[data-part='segment']")].map((el) => el.textContent)).toEqual([
      "4", "2", "", "",
    ]);
  });
});
