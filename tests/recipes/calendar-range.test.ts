import { describe, it, expect, afterEach } from "bun:test";
import { createCalendar } from "../../registry/recipes/calendar/calendar.js";

// calendar 1.2 — range preview, multi-month views, presets, range length
// bounds, the gridcell/label contract and locale formatting. The pre-1.2
// contract stays pinned, unchanged, in calendar.test.ts.

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

let box: HTMLElement | null = null;

afterEach(() => {
  box?.remove();
  box = null;
});

/** Mount one calendar in a disposable container (never document.body itself). */
function setup(attrs = "", { before = "", after = "", lang = "", view = null as null | [number, number] } = {}) {
  box = document.createElement("div");
  if (lang) box.setAttribute("lang", lang);
  box.innerHTML = `<div data-ui="calendar" ${attrs}>${before}${GRID}${after}</div>`;
  document.body.appendChild(box);
  const root = box.querySelector("[data-ui='calendar']") as HTMLElement;
  const api = createCalendar(root);
  // In range mode data-value seeds the range itself, so pin the view instead.
  if (view) api.navigate(view[0], view[1]);
  const events: any[] = [];
  root.addEventListener("faqir:calendar-change", ((e: CustomEvent) => {
    events.push(e.detail);
  }) as EventListener);
  return { root, api, events };
}

const day = (root: HTMLElement, iso: string) =>
  root.querySelector(`[data-part='day'][data-date="${iso}"]`) as HTMLButtonElement | null;
const click = (el: Element | null) => el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
const hover = (el: Element | null) => el!.dispatchEvent(new Event("pointerover", { bubbles: true }));
const states = (root: HTMLElement, state: string) =>
  [...root.querySelectorAll(`[data-part='day'][data-state='${state}']`)].map((b) => (b as HTMLElement).dataset.date);
function key(el: Element, k: string, opts: KeyboardEventInit = {}) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts }));
}
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
const plus = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);

const MARCH = { view: [2, 2026] as [number, number] };
const PRESETS = (list: string) => `<div data-part="presets" role="group" aria-label="Quick ranges">${list}</div>`;
const preset = (attrs: string, label = "P") => `<button data-part="preset" type="button" ${attrs}>${label}</button>`;

// ── Hover / focus preview ────────────────────────────────────────────────────

describe("calendar · range preview", () => {
  it("after the start, hovering a later day previews the span with distinct states", () => {
    const { root } = setup(`data-mode="range"`, MARCH);
    click(day(root, "2026-03-05"));
    hover(day(root, "2026-03-09"));
    expect(day(root, "2026-03-05")!.dataset.state).toBe("range-start");
    expect(states(root, "preview")).toEqual(["2026-03-06", "2026-03-07", "2026-03-08"]);
    expect(states(root, "preview-end")).toEqual(["2026-03-09"]);
    // A preview is not a selection
    expect(day(root, "2026-03-07")!.getAttribute("aria-selected")).toBeNull();
    expect(states(root, "in-range")).toEqual([]);
  });

  it("moving the pointer updates the preview; leaving the calendar clears it", () => {
    const { root } = setup(`data-mode="range"`, MARCH);
    click(day(root, "2026-03-05"));
    hover(day(root, "2026-03-12"));
    hover(day(root, "2026-03-07"));
    expect(states(root, "preview")).toEqual(["2026-03-06"]);
    expect(states(root, "preview-end")).toEqual(["2026-03-07"]);
    root.dispatchEvent(new Event("pointerleave"));
    expect(states(root, "preview")).toEqual([]);
    expect(states(root, "preview-end")).toEqual([]);
    expect(day(root, "2026-03-05")!.dataset.state).toBe("range-start");
  });

  it("the pointer over the header (outside the grids) clears it too", () => {
    const { root } = setup(`data-mode="range"`, MARCH);
    click(day(root, "2026-03-05"));
    hover(day(root, "2026-03-09"));
    hover(root.querySelector("[data-part='header']"));
    expect(states(root, "preview")).toEqual([]);
  });

  it("no preview before the start, without a start, or after a complete range", () => {
    const { root } = setup(`data-mode="range"`, MARCH);
    hover(day(root, "2026-03-09"));
    expect(states(root, "preview-end")).toEqual([]);

    click(day(root, "2026-03-10"));
    hover(day(root, "2026-03-04"));
    expect(states(root, "preview-end")).toEqual([]);

    click(day(root, "2026-03-12"));
    hover(day(root, "2026-03-20"));
    expect(states(root, "preview-end")).toEqual([]);
    expect(states(root, "in-range")).toEqual(["2026-03-11"]);
  });

  it("single mode never previews", () => {
    const { root } = setup(`data-value="2026-03-01"`);
    click(day(root, "2026-03-05"));
    hover(day(root, "2026-03-09"));
    expect(root.querySelectorAll("[data-state]").length).toBe(0);
  });

  it("keyboard focus moving after the start previews the span", () => {
    const { root, api } = setup(`data-mode="range"`, MARCH);
    const start = day(root, "2026-03-05")!;
    start.focus();
    key(start, "Enter");
    key(document.activeElement!, "ArrowRight");
    key(document.activeElement!, "ArrowRight");
    key(document.activeElement!, "ArrowDown");
    expect(states(root, "preview-end")).toEqual(["2026-03-14"]);
    expect(states(root, "preview").length).toBe(8);
    key(document.activeElement!, "Enter");
    expect(api.getValue()).toEqual({ start: "2026-03-05", end: "2026-03-14" });
    expect(states(root, "preview")).toEqual([]);
    expect(states(root, "in-range").length).toBe(8);
  });

  it("selecting the end commits: every day of the range is aria-selected", () => {
    const { root, events } = setup(`data-mode="range"`, MARCH);
    click(day(root, "2026-03-05"));
    hover(day(root, "2026-03-08"));
    click(day(root, "2026-03-08"));
    for (const d of ["2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08"]) {
      expect(day(root, d)!.getAttribute("aria-selected")).toBe("true");
    }
    expect(events).toEqual([
      { start: "2026-03-05", end: "2026-03-08", startObj: new Date(2026, 2, 5), endObj: new Date(2026, 2, 8) },
    ]);
  });
});

// ── Multi-month view ─────────────────────────────────────────────────────────

describe("calendar · multi-month view", () => {
  it("data-months=2 renders two consecutive, labelled grids with one nav pair", () => {
    const { root } = setup(`data-months="2" data-value="2026-03-10"`);
    const grids = root.querySelectorAll("[data-part='grid']");
    expect(grids.length).toBe(2);
    expect(root.querySelectorAll("[data-part='nav-prev']").length).toBe(1);
    const titles = [...root.querySelectorAll("[data-part='month-title']")].map((t) => t.textContent);
    expect(titles).toEqual(["March 2026", "April 2026"]);
    // Each grid is named by its own title
    grids.forEach((g, i) => {
      const id = g.getAttribute("aria-labelledby")!;
      expect(root.querySelector(`#${id}`)!.textContent).toBe(titles[i]);
      expect(g.getAttribute("role")).toBe("grid");
    });
    // The header announces the span
    expect(root.querySelector("[data-part='month-label']")!.textContent).toBe("March – April 2026");
    expect(root.querySelector("[data-part='month-label']")!.getAttribute("aria-live")).toBe("polite");
  });

  it("each date appears exactly once (no leading/trailing days)", () => {
    const { root } = setup(`data-months="2" data-value="2026-03-10"`);
    expect(root.querySelectorAll("[data-part='day'][data-outside]").length).toBe(0);
    expect(root.querySelectorAll("[data-part='day']").length).toBe(31 + 30);
    expect(root.querySelectorAll(`[data-date="2026-04-01"]`).length).toBe(1);
    // and exactly one day is in the tab order
    expect(root.querySelectorAll("[data-part='day'][tabindex='0']").length).toBe(1);
  });

  it("nav buttons move both months by one", () => {
    const { root } = setup(`data-months="2" data-value="2026-12-10"`);
    (root.querySelector("[data-part='nav-next']") as HTMLElement).dispatchEvent(new Event("click"));
    const titles = [...root.querySelectorAll("[data-part='month-title']")].map((t) => t.textContent);
    expect(titles).toEqual(["January 2027", "February 2027"]);
  });

  it("arrow focus crosses into the next visible month without moving the view", () => {
    const { root } = setup(`data-months="2" data-value="2026-03-31"`);
    const start = day(root, "2026-03-31")!;
    start.focus();
    key(start, "ArrowRight");
    expect((document.activeElement as HTMLElement).dataset.date).toBe("2026-04-01");
    expect(root.querySelector("[data-part='month-title']")!.textContent).toBe("March 2026");
  });

  it("…and shifts the view by one month at the outer edges", () => {
    const { root } = setup(`data-months="2" data-value="2026-03-01"`);
    const first = day(root, "2026-03-01")!;
    first.focus();
    key(first, "ArrowLeft");
    expect((document.activeElement as HTMLElement).dataset.date).toBe("2026-02-28");
    let titles = [...root.querySelectorAll("[data-part='month-title']")].map((t) => t.textContent);
    expect(titles).toEqual(["February 2026", "March 2026"]);

    const last = day(root, "2026-03-31")!;
    last.focus();
    key(last, "ArrowRight");
    expect((document.activeElement as HTMLElement).dataset.date).toBe("2026-04-01");
    titles = [...root.querySelectorAll("[data-part='month-title']")].map((t) => t.textContent);
    expect(titles).toEqual(["March 2026", "April 2026"]);

    key(document.activeElement!, "PageDown");
    expect((document.activeElement as HTMLElement).dataset.date).toBe("2026-05-01");
    titles = [...root.querySelectorAll("[data-part='month-title']")].map((t) => t.textContent);
    expect(titles).toEqual(["April 2026", "May 2026"]);
  });

  it("a range and its preview span the months", () => {
    const { root } = setup(`data-mode="range" data-months="2"`, MARCH);
    click(day(root, "2026-03-29"));
    hover(day(root, "2026-04-02"));
    expect(states(root, "preview")).toEqual(["2026-03-30", "2026-03-31", "2026-04-01"]);
    click(day(root, "2026-04-02"));
    expect(states(root, "in-range")).toEqual(["2026-03-30", "2026-03-31", "2026-04-01"]);
    expect(day(root, "2026-04-02")!.dataset.state).toBe("range-end");
  });

  it("setMonths changes the count at run time; destroy puts the authored grid back", () => {
    const { root, api } = setup(`data-value="2026-03-10"`);
    const table = root.querySelector("[data-part='grid']")!;
    expect(table.parentElement).toBe(root);
    api.setMonths(3);
    expect(root.querySelectorAll("[data-part='grid']").length).toBe(3);
    expect(table.parentElement!.dataset.part).toBe("month");
    api.setMonths(1);
    expect(root.querySelectorAll("[data-part='grid']").length).toBe(1);
    expect(root.querySelector("[data-part='months']")).toBeNull();
    expect(root.querySelectorAll("[data-outside='true']").length).toBeGreaterThan(0);
    api.setMonths(2);
    api.destroy();
    expect(root.querySelector("[data-part='months']")).toBeNull();
    expect(table.parentElement).toBe(root);
    expect(table.hasAttribute("aria-labelledby")).toBe(false);
  });

  it("clamps data-months to 1–3", () => {
    const { root } = setup(`data-months="7" data-value="2026-03-10"`);
    expect(root.querySelectorAll("[data-part='grid']").length).toBe(3);
  });
});

// ── Presets ──────────────────────────────────────────────────────────────────

describe("calendar · presets", () => {
  it("a relative preset selects its range, marks itself pressed and emits with `preset`", () => {
    const { root, events } = setup(`data-mode="range" data-value="2020-01-01"`, {
      before: PRESETS(preset(`data-value="last-7-days" aria-pressed="false"`) + preset(`data-value="today"`)),
    });
    const [last7, todayBtn] = root.querySelectorAll("[data-part='preset']") as NodeListOf<HTMLButtonElement>;
    click(last7);
    expect(events.length).toBe(1);
    expect(events[0]).toMatchObject({ start: iso(plus(-6)), end: iso(today), preset: "last-7-days" });
    expect(last7.getAttribute("aria-pressed")).toBe("true");
    expect(todayBtn.getAttribute("aria-pressed")).toBe("false");
    // The view moved to the range
    expect(day(root, iso(today))!.dataset.state).toBe("range-end");

    click(todayBtn);
    expect(events[1]).toMatchObject({ start: iso(today), end: iso(today), preset: "today" });
    expect(todayBtn.getAttribute("aria-pressed")).toBe("true");
    expect(last7.getAttribute("aria-pressed")).toBe("false");
  });

  it("a manual selection equal to a preset presses it", () => {
    const { root } = setup(`data-mode="range"`, { before: PRESETS(preset(`data-value="yesterday"`)) });
    const btn = root.querySelector("[data-part='preset']")!;
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    click(day(root, iso(plus(-1))));
    click(day(root, iso(plus(-1))));
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("explicit data-start / data-end presets move the view to them", () => {
    const { root, api, events } = setup(`data-mode="range" data-value="2026-03-01,2026-03-02"`, {
      before: PRESETS(preset(`data-start="2027-01-10" data-end="2027-01-12"`, "Trip")),
    });
    click(root.querySelector("[data-part='preset']"));
    expect(api.getValue()).toEqual({ start: "2027-01-10", end: "2027-01-12" });
    expect(root.querySelector("[data-part='month-label']")!.textContent).toBe("January 2027");
    expect(events[0].preset).toBeNull();
  });

  it("the whole-period presets resolve weeks, months and years", () => {
    const { root, api } = setup(`data-mode="range"`, {
      before: PRESETS(
        preset(`data-value="last-month"`) + preset(`data-value="this-week"`) + preset(`data-value="next-year"`),
      ),
    });
    const [lastMonth, thisWeek, nextYear] = root.querySelectorAll("[data-part='preset']");
    click(lastMonth);
    const lm = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    expect(api.getValue()).toEqual({ start: iso(lm), end: iso(new Date(lm.getFullYear(), lm.getMonth() + 1, 0)) });
    click(thisWeek);
    expect(api.getValue()).toEqual({ start: iso(plus(-today.getDay())), end: iso(plus(6 - today.getDay())) });
    click(nextYear);
    expect(api.getValue()).toEqual({ start: `${today.getFullYear() + 1}-01-01`, end: `${today.getFullYear() + 1}-12-31` });
  });

  it("presets are clamped to min/max, and disabled when nothing is left or the length does not fit", () => {
    const max = iso(today);
    const { root, api } = setup(`data-mode="range" data-max="${max}" data-max-range="10"`, {
      before: PRESETS(
        preset(`data-value="this-month"`) +
          preset(`data-value="last-30-days"`) +
          preset(`data-value="next-7-days"`) +
          preset(`data-value="tomorrow"`),
      ),
    });
    const [thisMonth, last30, next7, tomorrow] = root.querySelectorAll("[data-part='preset']") as NodeListOf<HTMLButtonElement>;
    // last-30-days is longer than data-max-range
    expect(last30.disabled).toBe(true);
    // tomorrow is past data-max entirely; next-7-days clamps to today alone
    expect(tomorrow.disabled).toBe(true);
    expect(next7.disabled).toBe(false);
    // this-month runs from the 1st to today (clamped) — allowed while ≤ 10 days
    expect(thisMonth.disabled).toBe(today.getDate() > 10);
    click(next7);
    expect(api.getValue()).toEqual({ start: max, end: max });
  });

  it("single mode: one-day presets select a date, spans are disabled", () => {
    const { root, api, events } = setup(``, {
      before: PRESETS(preset(`data-value="today"`) + preset(`data-value="last-7-days"`)),
    });
    const [todayBtn, last7] = root.querySelectorAll("[data-part='preset']") as NodeListOf<HTMLButtonElement>;
    expect(last7.disabled).toBe(true);
    click(todayBtn);
    expect(api.getValue()).toBe(iso(today));
    expect(events[0]).toMatchObject({ date: iso(today), preset: "today" });
    expect(todayBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("focus stays on the preset that was clicked", () => {
    const { root } = setup(`data-mode="range"`, { before: PRESETS(preset(`data-value="last-7-days"`)) });
    const btn = root.querySelector("[data-part='preset']") as HTMLButtonElement;
    btn.focus();
    click(btn);
    expect(document.activeElement).toBe(btn);
  });
});

// ── Range length bounds ──────────────────────────────────────────────────────

describe("calendar · data-min-range / data-max-range", () => {
  it("while choosing the end, days that break the bounds are unavailable", () => {
    const { root, api } = setup(`data-mode="range" data-min-range="3" data-max-range="5"`, MARCH);
    click(day(root, "2026-03-10"));
    // 2 days (10–11) is too short, 6 days (10–15) too long
    for (const d of ["2026-03-11", "2026-03-15", "2026-03-20"]) {
      expect(day(root, d)!.getAttribute("aria-disabled"), d).toBe("true");
      expect(day(root, d)!.getAttribute("aria-label")).toContain("unavailable");
    }
    for (const d of ["2026-03-12", "2026-03-13", "2026-03-14"]) {
      expect(day(root, d)!.getAttribute("aria-disabled"), d).toBeNull();
    }
    // Earlier days stay available: they restart the range
    expect(day(root, "2026-03-04")!.getAttribute("aria-disabled")).toBeNull();
    // The start itself keeps its state and is not marked unavailable
    expect(day(root, "2026-03-10")!.getAttribute("aria-disabled")).toBeNull();

    click(day(root, "2026-03-11"));
    expect(api.getValue()).toEqual({ start: "2026-03-10", end: null });
    hover(day(root, "2026-03-15"));
    expect(states(root, "preview-end")).toEqual([]);
    click(day(root, "2026-03-10"));
    expect(api.getValue()).toEqual({ start: "2026-03-10", end: null });
    click(day(root, "2026-03-14"));
    expect(api.getValue()).toEqual({ start: "2026-03-10", end: "2026-03-14" });
    // Once complete, the bounds stop disabling days
    expect(day(root, "2026-03-20")!.getAttribute("aria-disabled")).toBeNull();
  });

  it("the keyboard is held to the same bounds", () => {
    const { root, api } = setup(`data-mode="range" data-min-range="3"`, MARCH);
    const start = day(root, "2026-03-10")!;
    start.focus();
    key(start, "Enter");
    key(document.activeElement!, "ArrowRight");
    key(document.activeElement!, "Enter");
    expect(api.getValue()).toEqual({ start: "2026-03-10", end: null });
    key(document.activeElement!, "ArrowRight");
    key(document.activeElement!, "Enter");
    expect(api.getValue()).toEqual({ start: "2026-03-10", end: "2026-03-12" });
  });
});

// ── Gridcell & labels ────────────────────────────────────────────────────────

describe("calendar · accessible names and roles", () => {
  it("day buttons are gridcells in presentational cells", () => {
    const { root } = setup(`data-value="2026-03-10"`);
    const btn = day(root, "2026-03-10")!;
    expect(btn.getAttribute("role")).toBe("gridcell");
    expect(btn.parentElement!.getAttribute("role")).toBe("presentation");
    expect(btn.getAttribute("aria-selected")).toBe("true");
  });

  it("names carry the range role of each day", () => {
    const { root } = setup(`data-mode="range" data-value="2026-03-05,2026-03-07"`);
    expect(day(root, "2026-03-05")!.getAttribute("aria-label")).toBe("Thursday, March 5, 2026, range start");
    expect(day(root, "2026-03-06")!.getAttribute("aria-label")).toBe("Friday, March 6, 2026, in range");
    expect(day(root, "2026-03-07")!.getAttribute("aria-label")).toBe("Saturday, March 7, 2026, range end");
  });

  it("a one-day range is both ends; today and unavailable days say so", () => {
    const { root } = setup(`data-mode="range" data-value="2026-03-05,2026-03-05" data-disabled-dates="2026-03-09"`);
    expect(day(root, "2026-03-05")!.getAttribute("aria-label")).toBe("Thursday, March 5, 2026, range start, range end");
    expect(day(root, "2026-03-09")!.getAttribute("aria-label")).toBe("Monday, March 9, 2026, unavailable");
    const t = setup();
    expect(day(t.root, iso(today))!.getAttribute("aria-label")).toMatch(/, today$/);
  });

  it("isDisabled answers for Dates and ISO strings", () => {
    const { api } = setup(`data-min="2026-03-05" data-disabled-dates="2026-03-10"`);
    expect(api.isDisabled("2026-03-04")).toBe(true);
    expect(api.isDisabled("2026-03-10")).toBe(true);
    expect(api.isDisabled(new Date(2026, 2, 11, 15, 30))).toBe(false);
    expect(api.isDisabled("nope")).toBe(true);
  });
});

// ── Summary ──────────────────────────────────────────────────────────────────

describe("calendar · summary", () => {
  const SUMMARY = `<p data-part="summary" aria-live="polite">No dates selected</p>`;

  it("reads the range back, and restores the authored text when cleared", () => {
    const { root, api } = setup(`data-mode="range" data-value="2026-03-01"`, { after: SUMMARY });
    const summary = root.querySelector("[data-part='summary']")!;
    expect(summary.textContent).toBe("Mar 1, 2026 – select an end date");
    api.clear();
    expect(summary.textContent).toBe("No dates selected");
    api.navigate(2, 2026);
    click(day(root, "2026-03-05"));
    expect(summary.textContent).toBe("Mar 5, 2026 – select an end date");
    click(day(root, "2026-03-10"));
    expect(summary.textContent!.replace(/\s/g, " ")).toBe("Mar 5 – 10, 2026 · 6 days");
  });

  it("single mode reads the full date", () => {
    const { root } = setup(`data-value="2026-03-10"`, { after: SUMMARY });
    expect(root.querySelector("[data-part='summary']")!.textContent).toBe("Tuesday, March 10, 2026");
  });
});

// ── Locale ───────────────────────────────────────────────────────────────────

describe("calendar · locale", () => {
  it("formats labels in the nearest lang", () => {
    const { root } = setup(`data-mode="range" data-months="2" data-value="2026-03-10,2026-03-12"`, { lang: "de-DE" });
    expect(root.querySelector("[data-part='month-title']")!.textContent).toBe("März 2026");
    expect(day(root, "2026-03-10")!.getAttribute("aria-label")).toBe("Dienstag, 10. März 2026, range start");
  });

  it("an invalid lang falls back to en-US", () => {
    const { root } = setup(`data-value="2026-03-10"`, { lang: "not a tag!" });
    expect(root.querySelector("[data-part='month-label']")!.textContent).toBe("March 2026");
  });
});

describe("calendar · review fixes", () => {
  it("never lets a range span a disabled date", () => {
    const { root, events } = setup('data-mode="range" data-disabled-dates="2026-03-11"', MARCH);
    click(day(root, "2026-03-09"));
    click(day(root, "2026-03-13"));
    expect(events.at(-1)?.end ?? null).toBeNull();
    click(day(root, "2026-03-10"));
    expect(events.at(-1).end).toBe("2026-03-10");
  });

  it("disables a preset that would start, end or run over a disabled date", () => {
    const t = iso(today);
    const { root } = setup(`data-mode="range" data-disabled-dates="${t}"`, {
      before: PRESETS('<button data-part="preset" type="button" data-value="today" aria-pressed="false">Today</button>'),
    });
    expect((root.querySelector("[data-part='preset']") as HTMLButtonElement).disabled).toBe(true);
  });

  it("drops the end of an authored range that runs backwards", () => {
    const { api } = setup('data-mode="range" data-value="2026-05-10,2026-05-01"');
    expect(api.getValue()).toEqual({ start: "2026-05-10", end: null });
  });
});
