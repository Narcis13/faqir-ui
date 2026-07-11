import { describe, it, expect, beforeEach } from "bun:test";
import { createDatePicker } from "../../registry/recipes/date-picker/date-picker.js";

// Task 0.4-10 · date-picker behavior contract, guarded across the calendar
// extraction: the month grid now lives in the standalone `calendar` recipe and
// date-picker must behave exactly as before — same API, same events, same
// keyboard interactions. (0.4-22 extends these shared regression checks.)

// ── Setup ────────────────────────────────────────────────────────────────────

const CALENDAR_MARKUP = `
  <div data-part="header">
    <button data-part="nav-prev" type="button" aria-label="Previous month">&lsaquo;</button>
    <span data-part="month-label"></span>
    <button data-part="nav-next" type="button" aria-label="Next month">&rsaquo;</button>
  </div>
  <table data-part="grid" role="grid" aria-label="Calendar">
    <thead><tr><th>Su</th><th>Mo</th><th>Tu</th><th>We</th><th>Th</th><th>Fr</th><th>Sa</th></tr></thead>
    <tbody data-part="grid-body"></tbody>
  </table>`;

/** Canonical anatomy: the popup nests the standalone calendar recipe. */
function setup(calendarAttrs = "") {
  document.body.innerHTML = `
    <div data-ui="date-picker" data-state="closed" data-size="md">
      <div data-part="trigger">
        <input data-part="input" type="text" placeholder="Select a date" readonly
               aria-haspopup="dialog" aria-expanded="false" aria-label="Choose date">
        <span data-part="icon" aria-hidden="true">📅</span>
      </div>
      <div data-part="calendar" role="dialog" aria-label="Date picker" hidden>
        <div data-ui="calendar" ${calendarAttrs}>${CALENDAR_MARKUP}</div>
      </div>
    </div>`;
  const root = document.querySelector("[data-ui='date-picker']") as HTMLElement;
  const api = createDatePicker(root);
  const input = root.querySelector("[data-part='input']") as HTMLInputElement;
  const trigger = root.querySelector("[data-part='trigger']") as HTMLElement;
  const popup = root.querySelector("[data-part='calendar']") as HTMLElement;
  return { root, api, input, trigger, popup };
}

const day = (root: HTMLElement, iso: string) =>
  root.querySelector(`[data-date="${iso}"]`) as HTMLButtonElement | null;

function key(el: Element, k: string, opts: KeyboardEventInit = {}) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts }));
}

beforeEach(() => {
  document.body.innerHTML = "";
});

// ── Open / close ─────────────────────────────────────────────────────────────

describe("date-picker · open/close", () => {
  it("opens on trigger click and reflects state everywhere", () => {
    const { root, input, trigger, popup } = setup();
    trigger.dispatchEvent(new Event("click"));
    expect(root.dataset.state).toBe("open");
    expect(popup.hidden).toBe(false);
    expect(input.getAttribute("aria-expanded")).toBe("true");
  });

  it("second trigger click closes again", () => {
    const { root, trigger, input } = setup();
    trigger.dispatchEvent(new Event("click"));
    trigger.dispatchEvent(new Event("click"));
    expect(root.dataset.state).toBe("closed");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on Escape and returns focus to the input", () => {
    const { root, api, input } = setup();
    api.open();
    // Escape pressed inside the grid bubbles up to the date-picker root
    const anyDay = root.querySelector("[data-part='day']")!;
    key(anyDay, "Escape");
    expect(root.dataset.state).toBe("closed");
    expect(document.activeElement).toBe(input);
  });

  it("closes on outside pointerdown", () => {
    const { root, api } = setup();
    api.open();
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(root.dataset.state).toBe("closed");
  });

  it("open() focuses the selected day, or the first of the current month", () => {
    const { root, api } = setup();
    api.setValue("2026-03-10");
    api.open();
    expect((document.activeElement as HTMLElement).dataset.date).toBe("2026-03-10");
  });
});

// ── Selection ────────────────────────────────────────────────────────────────

describe("date-picker · selection", () => {
  it("day click updates input, closes, and emits faqir:date-change", () => {
    const { root, api, input } = setup();
    let detail: any = null;
    root.addEventListener("faqir:date-change", ((e: CustomEvent) => {
      detail = e.detail;
    }) as EventListener);

    api.setValue("2026-03-10");
    api.open();
    day(root, "2026-03-20")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(detail.date).toBe("2026-03-20");
    expect(detail.dateObj).toEqual(new Date("2026-03-20T00:00:00"));
    expect(input.value).toBe("March 20, 2026");
    expect(input.dataset.value).toBe("2026-03-20");
    expect(root.dataset.state).toBe("closed");
    expect(document.activeElement).toBe(input);
  });

  it("keyboard: arrows move the day focus, Enter selects and closes", () => {
    const { root, api, input } = setup();
    api.setValue("2026-03-10");
    api.open();

    key(document.activeElement!, "ArrowRight");
    expect((document.activeElement as HTMLElement).dataset.date).toBe("2026-03-11");
    key(document.activeElement!, "ArrowDown");
    expect((document.activeElement as HTMLElement).dataset.date).toBe("2026-03-18");

    key(document.activeElement!, "Enter");
    expect(api.getValue()).toBe("2026-03-18");
    expect(root.dataset.state).toBe("closed");
    expect(input.value).toBe("March 18, 2026");
  });

  it("selectDate API selects, closes and emits — same contract as before", () => {
    const { root, api, input } = setup();
    let detail: any = null;
    root.addEventListener("faqir:date-change", ((e: CustomEvent) => {
      detail = e.detail;
    }) as EventListener);

    api.open();
    api.selectDate(new Date(2025, 5, 15));
    expect(detail.date).toBe("2025-06-15");
    expect(input.value).toBe("June 15, 2025");
    expect(root.dataset.state).toBe("closed");
  });

  it("reopening shows the selection with aria-selected", () => {
    const { root, api } = setup();
    api.setValue("2026-03-10");
    api.open();
    expect(day(root, "2026-03-10")!.getAttribute("aria-selected")).toBe("true");
  });

  it("setValue/getValue round-trip without emitting date-change", () => {
    const { root, api, input } = setup();
    let fired = 0;
    root.addEventListener("faqir:date-change", () => fired++);
    api.setValue("2025-06-15");
    expect(api.getValue()).toBe("2025-06-15");
    expect(input.value).toBe("June 15, 2025");
    expect(fired).toBe(0);
  });

  it("setValue ignores invalid input", () => {
    const { api, input } = setup();
    api.setValue("not-a-date");
    expect(api.getValue()).toBeNull();
    expect(input.value).toBe("");
  });
});

// ── Month navigation & grid ──────────────────────────────────────────────────

describe("date-picker · month navigation & grid", () => {
  it("nav-prev / nav-next change the month label", () => {
    const { root, api } = setup();
    api.setValue("2026-03-10");
    api.open();
    const label = root.querySelector("[data-part='month-label']")!;

    root.querySelector("[data-part='nav-prev']")!.dispatchEvent(new Event("click"));
    expect(label.textContent).toBe("February 2026");
    root.querySelector("[data-part='nav-next']")!.dispatchEvent(new Event("click"));
    root.querySelector("[data-part='nav-next']")!.dispatchEvent(new Event("click"));
    expect(label.textContent).toBe("April 2026");
  });

  it("navigate(month, year) shows the requested month", () => {
    const { root, api } = setup();
    api.open();
    api.navigate(10, 2027);
    expect(root.querySelector("[data-part='month-label']")!.textContent).toBe("November 2027");
  });

  it("generates a correct calendar grid (complete weeks, unique days)", () => {
    const { root, api } = setup();
    api.setValue("2026-03-10");
    api.open();
    const days = root.querySelectorAll("[data-part='day']");
    expect(days.length % 7).toBe(0);
    expect(root.querySelectorAll(`[data-date="2026-03-15"]`).length).toBe(1);
  });

  it("today is highlighted in the current month", () => {
    const { root, api } = setup();
    api.open();
    expect(root.querySelector("[data-part='day'][data-today='true']")).not.toBeNull();
  });
});

// ── ARIA contract ────────────────────────────────────────────────────────────

describe("date-picker · aria contract", () => {
  it("input has aria-haspopup and live aria-expanded", () => {
    const { api, input } = setup();
    expect(input.getAttribute("aria-haspopup")).toBe("dialog");
    api.open();
    expect(input.getAttribute("aria-expanded")).toBe("true");
    api.close();
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("grid keeps role=grid and day buttons carry full-date aria-labels", () => {
    const { root, api } = setup();
    api.setValue("2026-03-10");
    api.open();
    expect(root.querySelector("[data-part='grid']")!.getAttribute("role")).toBe("grid");
    expect(day(root, "2026-03-10")!.getAttribute("aria-label")).toBe("Tuesday, March 10, 2026");
  });
});

// ── Calendar-recipe integration ──────────────────────────────────────────────

describe("date-picker · calendar recipe integration", () => {
  it("delegates the grid to the nested calendar recipe (single controller, no duplicate logic)", () => {
    const { root } = setup();
    const nested = root.querySelector("[data-ui='calendar']") as any;
    expect(nested._faqirCalendar).toBeDefined();
    // The date-picker root itself holds no grid parts outside the calendar
    for (const btn of root.querySelectorAll("[data-part='day']")) {
      expect(btn.closest("[data-ui='calendar']")).toBe(nested);
    }
  });

  it("min/max on the nested calendar are enforced through the picker", () => {
    const { root, api } = setup(`data-min="2026-03-05" data-max="2026-03-25"`);
    api.setValue("2026-03-10");
    api.open();

    const blocked = day(root, "2026-03-26")!;
    expect(blocked.getAttribute("aria-disabled")).toBe("true");
    blocked.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(api.getValue()).toBe("2026-03-10");
    expect(root.dataset.state).toBe("open");
  });

  it("legacy flat markup (grid parts directly in the popup) still works", () => {
    document.body.innerHTML = `
      <div data-ui="date-picker" data-state="closed">
        <button data-part="trigger">📅</button>
        <input data-part="input" aria-expanded="false" readonly />
        <div data-part="calendar" hidden>
          ${CALENDAR_MARKUP}
        </div>
      </div>`;
    const root = document.querySelector("[data-ui='date-picker']") as HTMLElement;
    const api = createDatePicker(root);
    const input = root.querySelector("[data-part='input']") as HTMLInputElement;

    let detail: any = null;
    root.addEventListener("faqir:date-change", ((e: CustomEvent) => {
      detail = e.detail;
    }) as EventListener);

    api.open();
    expect(root.querySelectorAll("[data-part='day']").length).toBeGreaterThan(0);
    api.selectDate(new Date(2026, 2, 10));
    expect(detail.date).toBe("2026-03-10");
    expect(input.value).toBe("March 10, 2026");
    expect(root.dataset.state).toBe("closed");
  });
});

// ── Input parsing & formatting round-trip (0.4-22) ────────────────────────────

describe("date-picker · input parsing & formatting round-trip", () => {
  it("setValue parses ISO and formats the display, with dataset.value round-tripping", () => {
    const { api, input } = setup();
    api.setValue("2026-07-04");
    expect(input.value).toBe("July 4, 2026");
    expect(input.dataset.value).toBe("2026-07-04");
    expect(api.getValue()).toBe("2026-07-04");

    // Feeding the stored ISO back in reproduces the identical display.
    api.setValue(input.dataset.value!);
    expect(input.value).toBe("July 4, 2026");
    expect(api.getValue()).toBe("2026-07-04");
  });

  it("a grid selection formats the display and stores ISO in dataset.value", () => {
    const { root, api, input } = setup();
    api.setValue("2026-03-10");
    api.open();
    day(root, "2026-03-20")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(input.value).toBe("March 20, 2026");
    expect(input.dataset.value).toBe("2026-03-20");
  });

  it("invalid input strings are rejected, leaving the current value intact", () => {
    const { api, input } = setup();
    api.setValue("2026-03-10");
    for (const bad of ["not-a-date", "2026-13-01", "2026-00-10", ""]) {
      api.setValue(bad);
      expect(api.getValue()).toBe("2026-03-10");
      expect(input.value).toBe("March 10, 2026");
    }
  });
});

// ── Min / max enforcement (0.4-22) ────────────────────────────────────────────

describe("date-picker · min/max enforcement", () => {
  it("days beyond min/max are disabled and refuse selection (click)", () => {
    const { root, api } = setup(`data-min="2026-03-05" data-max="2026-03-25"`);
    api.setValue("2026-03-10");
    api.open();

    const before = day(root, "2026-03-04")!;
    const after = day(root, "2026-03-26")!;
    expect(before.getAttribute("aria-disabled")).toBe("true");
    expect(after.getAttribute("aria-disabled")).toBe("true");

    before.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    after.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(api.getValue()).toBe("2026-03-10");
    expect(root.dataset.state).toBe("open");
  });

  it("a keyboard Enter on a disabled day does not select and keeps the popup open", () => {
    const { root, api } = setup(`data-disabled-dates="2026-03-12"`);
    api.setValue("2026-03-10");
    api.open();

    const blocked = day(root, "2026-03-12")!;
    expect(blocked.getAttribute("aria-disabled")).toBe("true");
    blocked.focus();
    key(blocked, "Enter");
    expect(api.getValue()).toBe("2026-03-10");
    expect(root.dataset.state).toBe("open");
  });

  it("nav buttons disable at the min/max month boundaries", () => {
    const { root, api } = setup(`data-min="2026-03-05" data-max="2026-03-25"`);
    api.setValue("2026-03-10");
    api.open();
    const navPrev = root.querySelector("[data-part='nav-prev']") as HTMLButtonElement;
    const navNext = root.querySelector("[data-part='nav-next']") as HTMLButtonElement;
    // The whole previous/next month lies outside [min,max], so both are dead ends.
    expect(navPrev.disabled).toBe(true);
    expect(navNext.disabled).toBe(true);
  });
});

// ── Keyboard entry vs grid selection agreement (0.4-22) ────────────────────────

describe("date-picker · keyboard entry vs grid selection agreement", () => {
  type Outcome = { value: string | null; display: string; date: string; state: string };

  function pick(act: (root: HTMLElement, input: HTMLInputElement) => void): Outcome {
    const { root, api, input } = setup();
    api.setValue("2026-03-10");
    api.open();
    let detail: any = null;
    root.addEventListener("faqir:date-change", ((e: CustomEvent) => {
      detail = e.detail;
    }) as EventListener);
    act(root, input);
    return { value: api.getValue(), display: input.value, date: detail?.date, state: root.dataset.state! };
  }

  it("selecting a day by keyboard yields the identical outcome to clicking it", () => {
    // Target 2026-03-11: one cell right of the 2026-03-10 focus anchor.
    const byClick = pick((root) =>
      day(root, "2026-03-11")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    );
    const byKeyboard = pick(() => {
      key(document.activeElement!, "ArrowRight");
      key(document.activeElement!, "Enter");
    });

    expect(byKeyboard).toEqual(byClick);
    expect(byKeyboard).toEqual({
      value: "2026-03-11",
      display: "March 11, 2026",
      date: "2026-03-11",
      state: "closed",
    });
  });
});

// ── Lifecycle ────────────────────────────────────────────────────────────────

describe("date-picker · lifecycle", () => {
  it("double init returns the same API", () => {
    const { root, api } = setup();
    expect(createDatePicker(root)).toBe(api);
  });

  it("destroy tears down the picker and its calendar", () => {
    const { root, api, trigger } = setup();
    api.destroy();
    expect((root as any)._faqirDatePicker).toBeUndefined();
    expect((root.querySelector("[data-ui='calendar']") as any)._faqirCalendar).toBeUndefined();

    trigger.dispatchEvent(new Event("click"));
    expect(root.dataset.state).toBe("closed");
  });
});
