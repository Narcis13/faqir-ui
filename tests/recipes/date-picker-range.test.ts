import { describe, it, expect, afterEach } from "bun:test";
import { createDatePicker } from "../../registry/recipes/date-picker/date-picker.js";

// date-picker 2.2 — range mode, typed input read in the page locale, the clear
// button, the inline variant and form values. The pre-2.2 contract stays
// pinned, unchanged, in date-picker.test.ts.

const GRID = `
  <div data-part="header">
    <button data-part="nav-prev" type="button" aria-label="Previous month">&lsaquo;</button>
    <span data-part="month-label"></span>
    <button data-part="nav-next" type="button" aria-label="Next month">&rsaquo;</button>
  </div>
  <table data-part="grid" role="grid" aria-label="Calendar">
    <thead><tr><th>Su</th><th>Mo</th><th>Tu</th><th>We</th><th>Th</th><th>Fr</th><th>Sa</th></tr></thead>
    <tbody data-part="grid-body"></tbody>
  </table>`;

const CLEAR = `<button data-part="clear" type="button" aria-label="Clear" hidden>x</button>`;
const TRIGGER = `<button data-part="trigger" type="button" aria-label="Open calendar" tabindex="-1">c</button>`;

let box: HTMLElement | null = null;

afterEach(() => {
  box?.remove();
  box = null;
});

interface Opts {
  lang?: string;
  root?: string;
  calendar?: string;
  presets?: string;
  readonly?: boolean;
  form?: boolean;
  extra?: string;
}

function mount(html: string, lang = "", form = false) {
  box = document.createElement(form ? "form" : "div");
  if (lang) box.setAttribute("lang", lang);
  box.innerHTML = html;
  document.body.appendChild(box);
  const root = box.querySelector("[data-ui='date-picker']") as HTMLElement;
  const api = createDatePicker(root);
  const events: any[] = [];
  root.addEventListener("faqir:date-change", ((e: CustomEvent) => {
    events.push(e.detail);
  }) as EventListener);
  const q = (p: string) => root.querySelector(`[data-part='${p}']`) as HTMLInputElement;
  return { root, api, events, input: q("input"), inputEnd: q("input-end"), clear: q("clear"), popup: q("calendar"), q };
}

/** A typed (editable) single-date picker. */
function single({ lang = "", calendar = "", readonly = false, form = false, extra = "" }: Opts = {}) {
  return mount(
    `<div data-ui="date-picker" data-state="closed">
      <input data-part="value" type="hidden" name="when">
      <div data-part="field">
        <input data-part="input" type="text" role="combobox" aria-haspopup="dialog" aria-expanded="false" aria-label="Date" ${readonly ? "readonly" : ""}>
        ${CLEAR}${TRIGGER}
      </div>
      ${extra}
      <div data-part="calendar" role="dialog" aria-label="Choose" hidden>
        <div data-ui="calendar" ${calendar}>${GRID}</div>
      </div>
    </div>`,
    lang,
    form,
  );
}

/** A range picker: two fields, value + value-end, presets and two months. */
function range({ lang = "", calendar = "", presets = "", readonly = true, form = false }: Opts = {}) {
  const ro = readonly ? "readonly" : "";
  return mount(
    `<div data-ui="date-picker" data-state="closed" data-mode="range">
      <input data-part="value" type="hidden" name="from">
      <input data-part="value-end" type="hidden" name="to">
      <div data-part="field">
        <input data-part="input" type="text" role="combobox" aria-haspopup="dialog" aria-expanded="false" aria-label="Start" ${ro}>
        <span data-part="separator" aria-hidden="true">→</span>
        <input data-part="input-end" type="text" role="combobox" aria-haspopup="dialog" aria-expanded="false" aria-label="End" ${ro}>
        ${CLEAR}${TRIGGER}
      </div>
      <div data-part="calendar" role="dialog" aria-label="Choose a range" hidden>
        <div data-ui="calendar" data-months="2" ${calendar}>
          ${presets ? `<div data-part="presets" role="group" aria-label="Quick">${presets}</div>` : ""}
          ${GRID}
          <p data-part="summary" aria-live="polite">Pick</p>
        </div>
      </div>
    </div>`,
    lang,
    form,
  );
}

const day = (root: HTMLElement, iso: string) =>
  root.querySelector(`[data-part='day'][data-date="${iso}"]`) as HTMLButtonElement | null;
const click = (el: Element | null) => el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
function key(el: Element, k: string, opts: KeyboardEventInit = {}) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts }));
}
/** Type into a field and commit it the way a blur does. */
function type(field: HTMLInputElement, text: string) {
  field.value = text;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hidden = (root: HTMLElement, p: string) => (root.querySelector(`[data-part='${p}']`) as HTMLInputElement).value;

// ── Range mode ───────────────────────────────────────────────────────────────

describe("date-picker · range mode", () => {
  it("two clicks fill start and end, submit ISO values, close and emit once", () => {
    const { root, api, events, input, inputEnd, popup } = range();
    api.setValue("2026-03-01,2026-03-02");
    api.open();
    click(day(root, "2026-03-05"));
    expect(root.dataset.state).toBe("open");
    expect(events.length).toBe(0);
    click(day(root, "2026-03-12"));

    expect(input.value).toBe("March 5, 2026");
    expect(inputEnd.value).toBe("March 12, 2026");
    expect(hidden(root, "value")).toBe("2026-03-05");
    expect(hidden(root, "value-end")).toBe("2026-03-12");
    expect(root.dataset.state).toBe("closed");
    expect(popup.hidden).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(events).toEqual([
      { start: "2026-03-05", end: "2026-03-12", startObj: new Date(2026, 2, 5), endObj: new Date(2026, 2, 12) },
    ]);
    expect(api.getValue()).toEqual({ start: "2026-03-05", end: "2026-03-12" });
  });

  it("the value parts fire input and change, so forms and l-model see both ends", () => {
    const { root, api } = range({ form: true });
    const seen: string[] = [];
    for (const p of ["value", "value-end"]) {
      for (const t of ["input", "change"]) root.querySelector(`[data-part='${p}']`)!.addEventListener(t, () => seen.push(`${p}:${t}`));
    }
    api.setValue("2026-03-05,2026-03-09");
    expect(seen).toEqual(["value:input", "value:change", "value-end:input", "value-end:change"]);
    const data = new FormData(box as HTMLFormElement);
    expect(data.get("from")).toBe("2026-03-05");
    expect(data.get("to")).toBe("2026-03-09");
  });

  it("setValue takes 'start,end' or { start, end }; an end before the start is dropped", () => {
    const { api, input, inputEnd } = range();
    api.setValue({ start: "2026-04-01", end: "2026-04-03" });
    expect(api.getValue()).toEqual({ start: "2026-04-01", end: "2026-04-03" });
    expect(inputEnd.value).toBe("April 3, 2026");
    api.setValue("2026-05-10,2026-05-01");
    expect(api.getValue()).toEqual({ start: "2026-05-10", end: null });
    expect(input.value).toBe("May 10, 2026");
    expect(inputEnd.value).toBe("");
  });

  it("a server-rendered start and end are the initial selection, silently", () => {
    box = document.createElement("div");
    box.innerHTML = `<div data-ui="date-picker" data-mode="range" data-state="closed">
      <input data-part="value" type="hidden" value="2026-06-01"><input data-part="value-end" type="hidden" value="2026-06-04">
      <div data-part="field"><input data-part="input" readonly><input data-part="input-end" readonly></div>
      <div data-part="calendar" hidden><div data-ui="calendar">${GRID}</div></div></div>`;
    document.body.appendChild(box);
    const root = box.firstElementChild as HTMLElement;
    const api = createDatePicker(root);
    expect(api.getValue()).toEqual({ start: "2026-06-01", end: "2026-06-04" });
    expect((root.querySelector("[data-part='input-end']") as HTMLInputElement).value).toBe("June 4, 2026");
  });

  it("data-mode on the picker puts the nested calendar in range mode", () => {
    const { root } = range();
    expect((root.querySelector("[data-ui='calendar']") as HTMLElement).dataset.mode).toBe("range");
  });

  it("a preset in the popup commits the range and closes", () => {
    const { root, api, events, input } = range({
      presets: `<button data-part="preset" type="button" data-start="2026-07-01" data-end="2026-07-07">Week</button>`,
    });
    api.open();
    click(root.querySelector("[data-part='preset']"));
    expect(events[0]).toMatchObject({ start: "2026-07-01", end: "2026-07-07", preset: null });
    expect(input.value).toBe("July 1, 2026");
    expect(root.dataset.state).toBe("closed");
  });

  it("two months when the viewport has room, one when it does not", () => {
    const { root, api } = range();
    api.open();
    expect(root.querySelectorAll("[data-part='grid']").length).toBe(2);
    api.close();

    const real = window.matchMedia;
    (window as any).matchMedia = (q: string) => ({ matches: false, media: q });
    try {
      api.open();
      expect(root.querySelectorAll("[data-part='grid']").length).toBe(1);
    } finally {
      (window as any).matchMedia = real;
    }
  });

  it("a read-only field opens the calendar on click, Enter, Space and ArrowDown", () => {
    const { root, api, inputEnd, input } = range();
    click(inputEnd);
    expect(root.dataset.state).toBe("open");
    api.close();
    for (const k of ["Enter", " ", "ArrowDown"]) {
      input.focus();
      key(input, k);
      expect(root.dataset.state, k).toBe("open");
      api.close();
    }
  });

  it("every combobox field names the popup it controls and tracks aria-expanded", () => {
    const { api, input, inputEnd, popup } = range();
    expect(popup.id).toBeTruthy();
    expect(input.getAttribute("aria-controls")).toBe(popup.id);
    expect(inputEnd.getAttribute("aria-controls")).toBe(popup.id);
    api.open();
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(inputEnd.getAttribute("aria-expanded")).toBe("true");
    api.close();
    expect(inputEnd.getAttribute("aria-expanded")).toBe("false");
  });

  it("a range shown in a single field reads as one range and is display-only", () => {
    box = document.createElement("div");
    box.innerHTML = `<div data-ui="date-picker" data-mode="range" data-state="closed">
      <div data-part="trigger"><input data-part="input" readonly aria-expanded="false"></div>
      <div data-part="calendar" hidden><div data-ui="calendar">${GRID}</div></div></div>`;
    document.body.appendChild(box);
    const root = box.firstElementChild as HTMLElement;
    const api = createDatePicker(root);
    api.setValue("2026-03-10,2026-03-15");
    expect((root.querySelector("[data-part='input']") as HTMLInputElement).value.replace(/\s/g, " ")).toBe("March 10 – 15, 2026");
  });
});

// ── Typed input, in the page locale ──────────────────────────────────────────

describe("date-picker · typed input", () => {
  const CASES: [string, string, string][] = [
    // locale, typed, expected ISO
    ["en-US", "3/14/2026", "2026-03-14"],
    ["en-US", "03/04/26", "2026-03-04"],
    ["en-US", "3-14-2026", "2026-03-14"],
    ["en-US", "3.14.2026", "2026-03-14"],
    ["en-US", "Mar 14, 2026", "2026-03-14"],
    ["en-US", "March 14 2026", "2026-03-14"],
    ["en-GB", "14/03/2026", "2026-03-14"],
    ["en-GB", "3/4/2026", "2026-04-03"],
    ["en-GB", "14 March 2026", "2026-03-14"],
    ["de-DE", "14.3.2026", "2026-03-14"],
    ["de-DE", "14.03.26", "2026-03-14"],
    ["de-DE", "14. März 2026", "2026-03-14"],
    ["ja-JP", "2026/3/14", "2026-03-14"],
    ["ja-JP", "26/3/14", "2026-03-14"],
    ["ja-JP", "2026年3月14日", "2026-03-14"],
    // ISO, always, whatever the locale
    ["en-US", "2026-03-14", "2026-03-14"],
    ["en-GB", "2026-03-14", "2026-03-14"],
    ["de-DE", "2026-03-14", "2026-03-14"],
    ["ja-JP", "2026-03-14", "2026-03-14"],
    // full-width digits
    ["ja-JP", "２０２６/３/１４", "2026-03-14"],
  ];

  for (const [lang, text, want] of CASES) {
    it(`${lang}: "${text}" → ${want}`, () => {
      const { root, api, input } = single({ lang });
      type(input, text);
      expect(api.getValue()).toBe(want);
      expect(hidden(root, "value")).toBe(want);
      expect(input.hasAttribute("aria-invalid")).toBe(false);
    });
  }

  it("reformats to the canonical display, in the page language", () => {
    const en = single({ lang: "en-US" });
    type(en.input, "3/14/2026");
    expect(en.input.value).toBe("March 14, 2026");
    box!.remove();
    const de = single({ lang: "de-DE" });
    type(de.input, "14.3.26");
    expect(de.input.value).toBe("14. März 2026");
  });

  it("Enter commits too (and lets the form submit)", () => {
    const { input, api } = single();
    input.value = "2026-05-02";
    const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    input.dispatchEvent(ev);
    expect(api.getValue()).toBe("2026-05-02");
    expect(input.value).toBe("May 2, 2026");
    expect(ev.defaultPrevented).toBe(false);
  });

  it("the canonical text re-commits as itself", () => {
    const { input, api, events } = single();
    type(input, "2026-05-02");
    type(input, "May 2, 2026");
    expect(api.getValue()).toBe("2026-05-02");
    expect(events.length).toBe(1);
    expect(events[0]).toEqual({ date: "2026-05-02", dateObj: new Date(2026, 4, 2) });
  });

  for (const bad of ["2/30/2026", "13/13/2026", "14/3/2026", "0/1/2026", "hello", "3/14", "3/14/202", "3/14/20266"]) {
    it(`"${bad}" is invalid: text kept, aria-invalid + data-state, no value`, () => {
      const { root, api, input, events } = single({ lang: "en-US" });
      api.setValue("2026-01-02");
      type(input, bad);
      expect(input.value).toBe(bad);
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(input.dataset.state).toBe("invalid");
      expect(api.getValue()).toBeNull();
      expect(hidden(root, "value")).toBe("");
      expect(events.length).toBe(0);
    });
  }

  it("a later valid entry clears the invalid state", () => {
    const { input, api } = single();
    type(input, "nope");
    type(input, "1/2/2026");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.dataset.state).toBeUndefined();
    expect(api.getValue()).toBe("2026-01-02");
  });

  it("checks min, max and disabled dates", () => {
    const { input, api } = single({ calendar: `data-min="2026-01-01" data-max="2026-12-31" data-disabled-dates="2026-12-25"` });
    for (const bad of ["12/31/2025", "1/1/2027", "12/25/2026"]) {
      type(input, bad);
      expect(input.getAttribute("aria-invalid"), bad).toBe("true");
    }
    type(input, "12/24/2026");
    expect(api.getValue()).toBe("2026-12-24");
  });

  it("an invalid entry shows the error part; a valid one hides it", () => {
    const { q, input } = single({ extra: `<p data-part="error" hidden>Bad date</p>` });
    const error = q("error");
    type(input, "31/31/2026");
    expect(error.hidden).toBe(false);
    type(input, "");
    expect(error.hidden).toBe(true);
  });

  it("emptying the field clears the value", () => {
    const { input, api, root } = single();
    type(input, "2026-03-03");
    type(input, "");
    expect(api.getValue()).toBeNull();
    expect(hidden(root, "value")).toBe("");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
  });

  it("an empty typed field shows the page's own pattern as its placeholder", () => {
    for (const [lang, pattern] of [
      ["en-US", "mm/dd/yyyy"],
      ["en-GB", "dd/mm/yyyy"],
      ["de-DE", "dd.mm.yyyy"],
      ["ja-JP", "yyyy/mm/dd"],
    ]) {
      const { input } = single({ lang });
      expect(input.placeholder, lang).toBe(pattern);
      box!.remove();
    }
    // …but never over one the author wrote, nor on a read-only field
    const ro = single({ readonly: true });
    expect(ro.input.placeholder).toBe("");
  });

  it("opening reads what was typed first, so the calendar shows it", () => {
    const { root, input, api } = single();
    input.value = "7/4/2026";
    input.focus();
    key(input, "ArrowDown");
    expect(root.dataset.state).toBe("open");
    expect(api.getValue()).toBe("2026-07-04");
    expect((document.activeElement as HTMLElement).dataset.date).toBe("2026-07-04");
  });

  it("a typed field does not open on Enter or Space (they type and commit)", () => {
    const { root, input } = single();
    key(input, " ");
    key(input, "Enter");
    expect(root.dataset.state).toBe("closed");
  });

  it("typed range: an end before the start is the end's error; a valid pair emits once", () => {
    const { input, inputEnd, api, events, root } = range({ readonly: false });
    type(input, "3/10/2026");
    expect(events.length).toBe(0);
    expect(api.getValue()).toEqual({ start: "2026-03-10", end: null });
    type(inputEnd, "3/5/2026");
    expect(inputEnd.getAttribute("aria-invalid")).toBe("true");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(hidden(root, "value-end")).toBe("");
    type(inputEnd, "3/15/2026");
    expect(inputEnd.hasAttribute("aria-invalid")).toBe(false);
    expect(api.getValue()).toEqual({ start: "2026-03-10", end: "2026-03-15" });
    expect(events).toEqual([
      { start: "2026-03-10", end: "2026-03-15", startObj: new Date(2026, 2, 10), endObj: new Date(2026, 2, 15) },
    ]);
  });

  it("typed range respects the calendar's range length bounds", () => {
    const { input, inputEnd } = range({ readonly: false, calendar: `data-min-range="3" data-max-range="7"` });
    type(input, "2026-03-10");
    type(inputEnd, "2026-03-11");
    expect(inputEnd.getAttribute("aria-invalid")).toBe("true");
    type(inputEnd, "2026-03-20");
    expect(inputEnd.getAttribute("aria-invalid")).toBe("true");
    type(inputEnd, "2026-03-16");
    expect(inputEnd.hasAttribute("aria-invalid")).toBe(false);
  });
});

// ── Clear ────────────────────────────────────────────────────────────────────

describe("date-picker · clear button", () => {
  it("is hidden until there is a value, and shown while there is", () => {
    const { clear, api, input } = single();
    expect(clear.hidden).toBe(true);
    api.setValue("2026-03-03");
    expect(clear.hidden).toBe(false);
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(clear.hidden).toBe(true);
    input.value = "3";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(clear.hidden).toBe(false);
  });

  it("empties every field and value, emits null dates and returns focus to the input", () => {
    const { root, clear, api, input, inputEnd, events } = range();
    api.setValue("2026-03-05,2026-03-09");
    clear.focus();
    click(clear);
    expect(api.getValue()).toEqual({ start: null, end: null });
    expect(input.value).toBe("");
    expect(inputEnd.value).toBe("");
    expect(hidden(root, "value")).toBe("");
    expect(hidden(root, "value-end")).toBe("");
    expect(clear.hidden).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(events).toEqual([{ start: null, end: null, startObj: null, endObj: null }]);
  });

  it("inside the classic trigger it does not open the popup", () => {
    box = document.createElement("div");
    box.innerHTML = `<div data-ui="date-picker" data-state="closed">
      <div data-part="trigger"><input data-part="input" readonly aria-expanded="false">${CLEAR}</div>
      <div data-part="calendar" hidden><div data-ui="calendar">${GRID}</div></div></div>`;
    document.body.appendChild(box);
    const root = box.firstElementChild as HTMLElement;
    const api = createDatePicker(root);
    api.setValue("2026-03-03");
    const clear = root.querySelector("[data-part='clear']") as HTMLElement;
    clear.click();
    expect(root.dataset.state).toBe("closed");
    expect(api.getValue()).toBeNull();
  });
});

// ── Inline ───────────────────────────────────────────────────────────────────

describe("date-picker · inline variant", () => {
  function inline() {
    return mount(
      `<div data-ui="date-picker" data-state="closed" data-variant="inline">
        <input data-part="value" type="hidden" name="d">
        <div data-part="field"><input data-part="input" type="text" aria-label="Delivery">${CLEAR}</div>
        <div data-part="calendar" hidden><div data-ui="calendar">${GRID}</div></div>
      </div>`,
    );
  }

  it("shows the calendar from the start, with no popup wiring", () => {
    const { popup, input } = inline();
    expect(popup.hidden).toBe(false);
    expect(input.hasAttribute("aria-expanded")).toBe(false);
    expect(input.hasAttribute("aria-controls")).toBe(false);
  });

  it("picking a day fills the field and keeps the calendar shown and focused", () => {
    const { root, api, input, popup, events } = inline();
    api.setValue("2026-03-10");
    const target = day(root, "2026-03-12")!;
    target.focus();
    click(target);
    expect(input.value).toBe("March 12, 2026");
    expect(hidden(root, "value")).toBe("2026-03-12");
    expect(popup.hidden).toBe(false);
    expect((document.activeElement as HTMLElement).dataset.date).toBe("2026-03-12");
    expect(events[0].date).toBe("2026-03-12");
  });

  it("open()/close() only flip data-state; outside clicks and Escape leave it alone", () => {
    const { root, api, popup } = inline();
    api.open();
    expect(root.dataset.state).toBe("open");
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(root.dataset.state).toBe("open");
    api.close();
    expect(root.dataset.state).toBe("closed");
    expect(popup.hidden).toBe(false);
  });

  it("a typed date drives the inline calendar", () => {
    const { root, input } = inline();
    type(input, "2026-08-20");
    expect(day(root, "2026-08-20")!.getAttribute("aria-selected")).toBe("true");
  });
});

// ── Lifecycle ────────────────────────────────────────────────────────────────

describe("date-picker · lifecycle (2.2 listeners)", () => {
  it("destroy removes the typed, clear and field listeners", () => {
    const { api, input, clear, root } = single();
    api.destroy();
    type(input, "2026-03-03");
    expect(input.value).toBe("2026-03-03");
    expect(hidden(root, "value")).toBe("");
    clear.hidden = false;
    click(clear);
    expect(input.value).toBe("2026-03-03");
  });

  it("form reset restores a rendered range", async () => {
    box = document.createElement("form");
    box.innerHTML = `<div data-ui="date-picker" data-mode="range" data-state="closed">
      <input data-part="value" type="hidden" value="2026-06-01"><input data-part="value-end" type="hidden" value="2026-06-04">
      <div data-part="field"><input data-part="input" readonly><input data-part="input-end" readonly></div>
      <div data-part="calendar" hidden><div data-ui="calendar">${GRID}</div></div></div>`;
    document.body.appendChild(box);
    const root = box.firstElementChild as HTMLElement;
    const api = createDatePicker(root);
    api.setValue("2026-07-01,2026-07-02");
    (box as HTMLFormElement).reset();
    await new Promise((r) => setTimeout(r, 5));
    expect(api.getValue()).toEqual({ start: "2026-06-01", end: "2026-06-04" });
    expect(iso(new Date(2026, 5, 4))).toBe(hidden(root, "value-end"));
  });
});
