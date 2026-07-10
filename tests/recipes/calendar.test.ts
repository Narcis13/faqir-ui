import { describe, it, expect, beforeEach } from "bun:test";
import { createCalendar } from "../../registry/recipes/calendar/calendar.js";

// Task 0.4-10 · standalone `calendar` recipe, extracted from date-picker.
// Covers the full keyboard grid (roving tabindex, arrows, Home/End week
// bounds, PageUp/Down month nav), selection events, min/max/disabled dates,
// and the range-selection groundwork (data-state on in-between cells).

// ── Setup ────────────────────────────────────────────────────────────────────

const MARKUP = `
  <div data-part="header">
    <button data-part="nav-prev" type="button" aria-label="Previous month">&lsaquo;</button>
    <span data-part="month-label"></span>
    <button data-part="nav-next" type="button" aria-label="Next month">&rsaquo;</button>
  </div>
  <table data-part="grid" role="grid" aria-label="Calendar">
    <thead><tr><th>Su</th><th>Mo</th><th>Tu</th><th>We</th><th>Th</th><th>Fr</th><th>Sa</th></tr></thead>
    <tbody data-part="grid-body"></tbody>
  </table>`;

function setup(attrs = "") {
  document.body.innerHTML = `<div data-ui="calendar" ${attrs}>${MARKUP}</div>`;
  const root = document.querySelector("[data-ui='calendar']") as HTMLElement;
  const api = createCalendar(root);
  const label = root.querySelector("[data-part='month-label']") as HTMLElement;
  const navPrev = root.querySelector("[data-part='nav-prev']") as HTMLButtonElement;
  const navNext = root.querySelector("[data-part='nav-next']") as HTMLButtonElement;
  return { root, api, label, navPrev, navNext };
}

const day = (root: HTMLElement, iso: string) =>
  root.querySelector(`[data-date="${iso}"]`) as HTMLButtonElement | null;

const rover = (root: HTMLElement) =>
  root.querySelectorAll("[data-part='day'][tabindex='0']");

function key(el: Element, k: string, opts: KeyboardEventInit = {}) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts }));
}

function press(root: HTMLElement, iso: string, k: string, opts: KeyboardEventInit = {}) {
  const btn = day(root, iso)!;
  btn.focus();
  key(btn, k, opts);
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

beforeEach(() => {
  document.body.innerHTML = "";
});

// ── Grid generation ──────────────────────────────────────────────────────────

describe("calendar · grid generation", () => {
  it("renders complete weeks (cell count is a multiple of 7)", () => {
    const { root } = setup(`data-value="2026-03-10"`);
    const days = root.querySelectorAll("[data-part='day']");
    expect(days.length % 7).toBe(0);
    expect(root.querySelectorAll("tbody tr").length).toBe(days.length / 7);
  });

  it("contains every day of the pinned month exactly once", () => {
    const { root } = setup(`data-value="2026-03-10"`);
    for (let d = 1; d <= 31; d++) {
      const isoDate = `2026-03-${String(d).padStart(2, "0")}`;
      expect(root.querySelectorAll(`[data-date="${isoDate}"]`).length).toBe(1);
    }
  });

  it("shows the month label", () => {
    const { label } = setup(`data-value="2026-03-10"`);
    expect(label.textContent).toBe("March 2026");
  });

  it("marks adjacent-month days with data-outside", () => {
    const { root } = setup(`data-value="2026-03-10"`);
    // 2026-03-01 is a Sunday → the trailing cells belong to April
    const outside = root.querySelectorAll("[data-part='day'][data-outside='true']");
    for (const btn of outside) {
      expect((btn as HTMLElement).dataset.date!.startsWith("2026-03")).toBe(false);
    }
  });

  it("marks today with data-today", () => {
    const { root } = setup();
    const todayBtn = day(root, iso(new Date()));
    expect(todayBtn).not.toBeNull();
    expect(todayBtn!.dataset.today).toBe("true");
  });

  it("day buttons carry a full-date aria-label", () => {
    const { root } = setup(`data-value="2026-03-10"`);
    expect(day(root, "2026-03-10")!.getAttribute("aria-label")).toBe("Tuesday, March 10, 2026");
  });
});

// ── Roving tabindex + selection ──────────────────────────────────────────────

describe("calendar · roving tabindex & selection", () => {
  it("exactly one day is in the tab order, the selected one", () => {
    const { root } = setup(`data-value="2026-03-10"`);
    const stops = rover(root);
    expect(stops.length).toBe(1);
    expect((stops[0] as HTMLElement).dataset.date).toBe("2026-03-10");
  });

  it("selected day has aria-selected", () => {
    const { root } = setup(`data-value="2026-03-10"`);
    expect(day(root, "2026-03-10")!.getAttribute("aria-selected")).toBe("true");
  });

  it("click selects a day and emits faqir:calendar-change", () => {
    const { root } = setup(`data-value="2026-03-10"`);
    let detail: any = null;
    root.addEventListener("faqir:calendar-change", ((e: CustomEvent) => {
      detail = e.detail;
    }) as EventListener);

    day(root, "2026-03-20")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(detail).toEqual({ date: "2026-03-20", dateObj: new Date("2026-03-20T00:00:00") });
    expect(day(root, "2026-03-20")!.getAttribute("aria-selected")).toBe("true");
    expect(day(root, "2026-03-10")!.getAttribute("aria-selected")).toBeNull();
  });

  it("Enter selects the focused day", () => {
    const { root } = setup(`data-value="2026-03-10"`);
    press(root, "2026-03-10", "Enter");
    expect(day(root, "2026-03-10")!.getAttribute("aria-selected")).toBe("true");
  });

  it("Space selects the focused day", () => {
    const { root, api } = setup(`data-value="2026-03-10"`);
    press(root, "2026-03-12", " ");
    expect(api.getValue()).toBe("2026-03-12");
  });

  it("selectDate API selects and emits", () => {
    const { root, api } = setup(`data-value="2026-03-10"`);
    let fired = 0;
    root.addEventListener("faqir:calendar-change", () => fired++);
    api.selectDate(new Date(2026, 2, 25));
    expect(api.getValue()).toBe("2026-03-25");
    expect(fired).toBe(1);
  });

  it("setValue is silent and moves the view", () => {
    const { root, api, label } = setup(`data-value="2026-03-10"`);
    let fired = 0;
    root.addEventListener("faqir:calendar-change", () => fired++);
    api.setValue("2026-06-15");
    expect(fired).toBe(0);
    expect(api.getValue()).toBe("2026-06-15");
    expect(label.textContent).toBe("June 2026");
    expect(day(root, "2026-06-15")!.getAttribute("aria-selected")).toBe("true");
  });

  it("getValue returns null with no selection; clear() unselects", () => {
    const { root, api } = setup();
    expect(api.getValue()).toBeNull();
    api.selectDate(new Date(2026, 2, 5));
    expect(api.getValue()).toBe("2026-03-05");
    api.clear();
    expect(api.getValue()).toBeNull();
    expect(root.querySelector("[aria-selected='true']")).toBeNull();
  });
});

// ── Keyboard navigation ──────────────────────────────────────────────────────

describe("calendar · keyboard navigation", () => {
  it("ArrowRight/Left move the rover by one day", () => {
    const { root } = setup(`data-value="2026-03-10"`);
    press(root, "2026-03-10", "ArrowRight");
    expect(rover(root).length).toBe(1);
    expect((rover(root)[0] as HTMLElement).dataset.date).toBe("2026-03-11");

    press(root, "2026-03-11", "ArrowLeft");
    expect((rover(root)[0] as HTMLElement).dataset.date).toBe("2026-03-10");
  });

  it("ArrowUp/Down move the rover by one week", () => {
    const { root } = setup(`data-value="2026-03-10"`);
    press(root, "2026-03-10", "ArrowDown");
    expect((rover(root)[0] as HTMLElement).dataset.date).toBe("2026-03-17");
    press(root, "2026-03-17", "ArrowUp");
    expect((rover(root)[0] as HTMLElement).dataset.date).toBe("2026-03-10");
  });

  it("arrow navigation crosses the month boundary and re-renders the view", () => {
    const { root, label } = setup(`data-value="2026-03-31"`);
    press(root, "2026-03-31", "ArrowRight");
    expect(label.textContent).toBe("April 2026");
    expect((rover(root)[0] as HTMLElement).dataset.date).toBe("2026-04-01");
  });

  it("Home jumps to the first day of the week (Sunday)", () => {
    // 2026-03-10 is a Tuesday → week starts Sunday 2026-03-08
    const { root } = setup(`data-value="2026-03-10"`);
    press(root, "2026-03-10", "Home");
    expect((rover(root)[0] as HTMLElement).dataset.date).toBe("2026-03-08");
  });

  it("End jumps to the last day of the week (Saturday)", () => {
    const { root } = setup(`data-value="2026-03-10"`);
    press(root, "2026-03-10", "End");
    expect((rover(root)[0] as HTMLElement).dataset.date).toBe("2026-03-14");
  });

  it("PageUp/PageDown move one month, keeping the day", () => {
    const { root, label } = setup(`data-value="2026-03-10"`);
    press(root, "2026-03-10", "PageUp");
    expect(label.textContent).toBe("February 2026");
    expect((rover(root)[0] as HTMLElement).dataset.date).toBe("2026-02-10");

    press(root, "2026-02-10", "PageDown");
    expect(label.textContent).toBe("March 2026");
    expect((rover(root)[0] as HTMLElement).dataset.date).toBe("2026-03-10");
  });

  it("PageUp clamps the day to the target month's length", () => {
    const { root, label } = setup(`data-value="2026-03-31"`);
    press(root, "2026-03-31", "PageUp");
    expect(label.textContent).toBe("February 2026");
    expect((rover(root)[0] as HTMLElement).dataset.date).toBe("2026-02-28");
  });

  it("Shift+PageUp/PageDown move one year", () => {
    const { root, label } = setup(`data-value="2026-03-10"`);
    press(root, "2026-03-10", "PageUp", { shiftKey: true });
    expect(label.textContent).toBe("March 2025");
    expect((rover(root)[0] as HTMLElement).dataset.date).toBe("2025-03-10");

    press(root, "2025-03-10", "PageDown", { shiftKey: true });
    expect(label.textContent).toBe("March 2026");
  });

  it("keys pressed outside day cells are ignored", () => {
    const { root, navPrev, label } = setup(`data-value="2026-03-10"`);
    key(navPrev, "ArrowRight");
    key(navPrev, "Enter");
    expect(label.textContent).toBe("March 2026");
    expect((rover(root)[0] as HTMLElement).dataset.date).toBe("2026-03-10");
  });
});

// ── Month navigation buttons ─────────────────────────────────────────────────

describe("calendar · month navigation", () => {
  it("nav-prev / nav-next shift the view month", () => {
    const { label, navPrev, navNext } = setup(`data-value="2026-03-10"`);
    navPrev.dispatchEvent(new Event("click"));
    expect(label.textContent).toBe("February 2026");
    navNext.dispatchEvent(new Event("click"));
    navNext.dispatchEvent(new Event("click"));
    expect(label.textContent).toBe("April 2026");
  });

  it("wraps across year boundaries", () => {
    const { label, navPrev } = setup(`data-value="2026-01-10"`);
    navPrev.dispatchEvent(new Event("click"));
    expect(label.textContent).toBe("December 2025");
  });

  it("navigate(month, year) shows the requested month and focuses day 1", () => {
    const { root, api, label } = setup(`data-value="2026-03-10"`);
    api.navigate(10, 2027);
    expect(label.textContent).toBe("November 2027");
    expect((rover(root)[0] as HTMLElement).dataset.date).toBe("2027-11-01");
  });
});

// ── Min / max / disabled dates ───────────────────────────────────────────────

describe("calendar · min/max & disabled dates", () => {
  const BOUNDED = `data-value="2026-03-10" data-min="2026-03-05" data-max="2026-03-25"`;

  it("days outside [min, max] are aria-disabled", () => {
    const { root } = setup(BOUNDED);
    expect(day(root, "2026-03-04")!.getAttribute("aria-disabled")).toBe("true");
    expect(day(root, "2026-03-05")!.getAttribute("aria-disabled")).toBeNull();
    expect(day(root, "2026-03-25")!.getAttribute("aria-disabled")).toBeNull();
    expect(day(root, "2026-03-26")!.getAttribute("aria-disabled")).toBe("true");
  });

  it("clicking a disabled day selects nothing and emits nothing", () => {
    const { root, api } = setup(BOUNDED);
    let fired = 0;
    root.addEventListener("faqir:calendar-change", () => fired++);
    day(root, "2026-03-26")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(fired).toBe(0);
    expect(api.getValue()).toBe("2026-03-10");
  });

  it("Enter on a disabled day selects nothing", () => {
    const { root, api } = setup(BOUNDED);
    // Walk the rover onto the disabled day is clamped, so target it directly
    press(root, "2026-03-26", "Enter");
    expect(api.getValue()).toBe("2026-03-10");
  });

  it("focus movement clamps to min and max", () => {
    const { root } = setup(BOUNDED);
    press(root, "2026-03-05", "ArrowLeft");
    expect((rover(root)[0] as HTMLElement).dataset.date).toBe("2026-03-05");

    press(root, "2026-03-25", "ArrowRight");
    expect((rover(root)[0] as HTMLElement).dataset.date).toBe("2026-03-25");

    press(root, "2026-03-25", "PageDown");
    expect((rover(root)[0] as HTMLElement).dataset.date).toBe("2026-03-25");
  });

  it("nav buttons are disabled when the adjacent month is fully out of range", () => {
    const { navPrev, navNext } = setup(BOUNDED);
    expect(navPrev.disabled).toBe(true);
    expect(navNext.disabled).toBe(true);
  });

  it("nav buttons stay enabled while the adjacent month is reachable", () => {
    const { navPrev, navNext } = setup(`data-value="2026-03-10" data-min="2026-02-20" data-max="2026-04-05"`);
    expect(navPrev.disabled).toBe(false);
    expect(navNext.disabled).toBe(false);
  });

  it("data-disabled-dates blocks individual days", () => {
    const { root, api } = setup(`data-value="2026-03-10" data-disabled-dates="2026-03-14, 2026-03-15"`);
    expect(day(root, "2026-03-14")!.getAttribute("aria-disabled")).toBe("true");
    expect(day(root, "2026-03-15")!.dataset.disabled).toBe("true");
    day(root, "2026-03-14")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(api.getValue()).toBe("2026-03-10");
  });

  it("setMin/setMax/setDisabledDates rebuild the grid", () => {
    const { root, api } = setup(`data-value="2026-03-10"`);
    expect(day(root, "2026-03-02")!.getAttribute("aria-disabled")).toBeNull();
    api.setMin("2026-03-05");
    expect(day(root, "2026-03-02")!.getAttribute("aria-disabled")).toBe("true");
    api.setMax("2026-03-20");
    expect(day(root, "2026-03-28")!.getAttribute("aria-disabled")).toBe("true");
    api.setDisabledDates(["2026-03-12"]);
    expect(day(root, "2026-03-12")!.getAttribute("aria-disabled")).toBe("true");
  });
});

// ── Range selection (groundwork) ─────────────────────────────────────────────

describe("calendar · range mode", () => {
  // In range mode data-value seeds the range itself, so pin the view month
  // with navigate() instead.
  function setupRange() {
    const s = setup(`data-mode="range"`);
    s.api.navigate(2, 2026);
    return s;
  }

  it("start then end stamps data-state on endpoints and in-between cells", () => {
    const { root } = setupRange();
    day(root, "2026-03-05")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(day(root, "2026-03-05")!.dataset.state).toBe("range-start");
    expect(day(root, "2026-03-05")!.getAttribute("aria-selected")).toBe("true");

    day(root, "2026-03-10")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(day(root, "2026-03-05")!.dataset.state).toBe("range-start");
    expect(day(root, "2026-03-10")!.dataset.state).toBe("range-end");
    expect(day(root, "2026-03-10")!.getAttribute("aria-selected")).toBe("true");
    for (const d of ["2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09"]) {
      expect(day(root, d)!.dataset.state).toBe("in-range");
    }
    expect(day(root, "2026-03-04")!.dataset.state).toBeUndefined();
    expect(day(root, "2026-03-11")!.dataset.state).toBeUndefined();
  });

  it("emits faqir:calendar-change once, when the range completes", () => {
    const { root } = setupRange();
    const events: any[] = [];
    root.addEventListener("faqir:calendar-change", ((e: CustomEvent) => {
      events.push(e.detail);
    }) as EventListener);

    day(root, "2026-03-05")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(events.length).toBe(0);
    day(root, "2026-03-10")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(events.length).toBe(1);
    expect(events[0].start).toBe("2026-03-05");
    expect(events[0].end).toBe("2026-03-10");
  });

  it("picking an earlier day than the pending start restarts the range", () => {
    const { root } = setupRange();
    day(root, "2026-03-10")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    day(root, "2026-03-05")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(day(root, "2026-03-05")!.dataset.state).toBe("range-start");
    expect(day(root, "2026-03-10")!.dataset.state).toBeUndefined();
    expect(root.querySelectorAll("[data-state='in-range']").length).toBe(0);
  });

  it("a new pick after a complete range starts fresh", () => {
    const { root, api } = setupRange();
    day(root, "2026-03-05")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    day(root, "2026-03-10")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    day(root, "2026-03-20")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(day(root, "2026-03-20")!.dataset.state).toBe("range-start");
    expect(root.querySelectorAll("[data-state='in-range']").length).toBe(0);
    expect(api.getValue()).toEqual({ start: "2026-03-20", end: null });
  });

  it("getValue/setValue round-trip a range", () => {
    const { api } = setup(`data-mode="range"`);
    api.setValue("2026-03-05,2026-03-10");
    expect(api.getValue()).toEqual({ start: "2026-03-05", end: "2026-03-10" });
  });

  it("keyboard selection drives the range too", () => {
    const { root, api } = setupRange();
    press(root, "2026-03-05", "Enter");
    press(root, "2026-03-08", "Enter");
    expect(api.getValue()).toEqual({ start: "2026-03-05", end: "2026-03-08" });
    expect(day(root, "2026-03-06")!.dataset.state).toBe("in-range");
  });
});

// ── Lifecycle ────────────────────────────────────────────────────────────────

describe("calendar · lifecycle", () => {
  it("double init returns the same API", () => {
    const { root, api } = setup();
    expect(createCalendar(root)).toBe(api);
  });

  it("destroy removes the handle and stops handling events", () => {
    const { root, api } = setup(`data-value="2026-03-10"`);
    api.destroy();
    expect((root as any)._faqirCalendar).toBeUndefined();

    let fired = 0;
    root.addEventListener("faqir:calendar-change", () => fired++);
    day(root, "2026-03-12")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(fired).toBe(0);
  });
});
