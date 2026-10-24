// @ui:controller calendar
// @ui:provides getValue setValue clear navigate selectDate focusDate setMin setMax setDisabledDates setMonths isDisabled destroy

import { uid } from "../../core/utils.js";

const DAY_MS = 864e5;

// The words a day's name and the summary add to the locale-formatted dates.
// "today" and the day count come from Intl, so they follow the page language.
const RANGE_START = "range start";
const RANGE_END = "range end";
const IN_RANGE = "in range";
const UNAVAILABLE = "unavailable";
const PICK_END = "select an end date";

function parseISO(str) {
  if (!str) return null;
  const d = new Date(str + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Local midnight of `d`, moved `n` days. */
const addDays = (d, n = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Months since year 0: month views compare and shift without Date overflow. */
const monthIndex = (d) => d.getFullYear() * 12 + d.getMonth();

/** The nearest `lang` (else the browser's language): the locale of every label. */
function localeOf(el) {
  const lang = el.closest("[lang]")?.lang || navigator.language;
  try {
    new Intl.DateTimeFormat(lang);
    return lang;
  } catch {
    return "en-US";
  }
}

export function createCalendar(root) {
  // Prevent double-init
  if (root._faqirCalendar) return root._faqirCalendar;

  const part = (name) => root.querySelector(`[data-part='${name}']`);
  const navPrev = part("nav-prev");
  const navNext = part("nav-next");
  const monthLabel = part("month-label");
  const gridBody = part("grid-body");
  const summary = part("summary");

  // `grid-body` is the one part every render writes into: without it the first
  // `render()` throws on `gridBody.innerHTML`, taking the date-picker that
  // wraps it down with it. The optional parts (nav, month label) are already
  // guarded individually. [W3-2]
  if (!gridBody) {
    console.warn(
      "[Faqir] calendar needs [data-part='grid-body'] to render into. " +
        "Component left inert.",
      root
    );
    const inert = {
      getValue: () => null,
      setValue() {},
      clear() {},
      navigate() {},
      selectDate() {},
      focusDate() {},
      setMin() {},
      setMax() {},
      setDisabledDates() {},
      setMonths() {},
      isDisabled: () => false,
      destroy() {},
    };
    root._faqirCalendar = inert;
    return inert;
  }

  const presets = [...root.querySelectorAll("[data-part='preset']")];
  const locale = localeOf(root);
  const fmt = (opts) => new Intl.DateTimeFormat(locale, { calendar: "gregory", ...opts });
  const fullDate = fmt({ weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const monthYear = fmt({ month: "long", year: "numeric" });
  const shortDate = fmt({ month: "short", day: "numeric", year: "numeric" });
  const todayWord = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "day");
  const dayCount = new Intl.NumberFormat(locale, { style: "unit", unit: "day", unitDisplay: "long" });

  const today = addDays(new Date());
  const mode = root.dataset.mode === "range" ? "range" : "single";
  // Range length bounds, inclusive day counts (a 3-night stay is 4 days).
  const minRange = parseInt(root.dataset.minRange, 10) || 0;
  const maxRange = parseInt(root.dataset.maxRange, 10) || 0;

  let minDate = parseISO(root.dataset.min);
  let maxDate = parseISO(root.dataset.max);
  let disabledDates = parseDateList(root.dataset.disabledDates);

  let selectedDate = null;
  let rangeStart = null;
  let rangeEnd = null;
  if (root.dataset.value) {
    if (mode === "range") {
      const parts = root.dataset.value.split(",");
      rangeStart = parseISO(parts[0] && parts[0].trim());
      rangeEnd = parseISO(parts[1] && parts[1].trim());
      // As setValue(): an end before the start is no end.
      if (!rangeStart || (rangeEnd && rangeEnd < rangeStart)) rangeEnd = null;
    } else {
      selectedDate = parseISO(root.dataset.value);
    }
  }

  const initialView = selectedDate || rangeStart || today;
  let viewMonth = initialView.getMonth();
  let viewYear = initialView.getFullYear();
  let focusedDate = null;
  // The day a pending range would end on (pointer hover or keyboard focus), as a time.
  let previewAt = 0;

  // Multi-month: one grid body per visible month. The authored grid is the
  // first; data-months > 1 wraps it in a generated [data-part="months"] row of
  // [data-part="month"] panels, each a title plus a copy of the grid.
  const gridEl = gridBody.closest("[data-part='grid']") || gridBody;
  let bodies = [];
  let titles = [];
  let months = null;
  const idleSummary = summary ? summary.textContent : "";

  // Month changes are announced politely, the way the APG date picker does it.
  if (monthLabel && !monthLabel.hasAttribute("aria-live")) monthLabel.setAttribute("aria-live", "polite");

  function parseDateList(str) {
    const set = new Set();
    if (str) {
      for (const token of str.split(/[\s,]+/)) {
        if (parseISO(token)) set.add(token);
      }
    }
    return set;
  }

  /** Outside [min, max] or listed in data-disabled-dates. */
  function blocked(date) {
    return !!((minDate && date < minDate) || (maxDate && date > maxDate) || disabledDates.has(toISO(date)));
  }

  /**
   * [a, b] is a range that can be chosen: its inclusive day count respects
   * data-min-range / data-max-range, and no disabled date lies inside it —
   * a stay cannot cross a booked night.
   */
  function spanOk(a, b) {
    const n = Math.round((b - a) / DAY_MS) + 1;
    if (n < Math.max(minRange, 1) || (maxRange && n > maxRange)) return false;
    const lo = toISO(a);
    const hi = toISO(b);
    for (const iso of disabledDates) if (iso >= lo && iso <= hi) return false;
    return true;
  }

  /** While a range waits for its end: a later day that cannot end it. */
  const badEnd = (date) =>
    mode === "range" && rangeStart && !rangeEnd && date > rangeStart && !spanOk(rangeStart, date);

  function stateOf(date) {
    if (mode !== "range" || !rangeStart) return "";
    if (+date === +rangeStart) return "range-start";
    if (!rangeEnd) return "";
    if (+date === +rangeEnd) return "range-end";
    return date > rangeStart && date < rangeEnd ? "in-range" : "";
  }

  function clampToRange(date) {
    if (minDate && date < minDate) return new Date(minDate);
    if (maxDate && date > maxDate) return new Date(maxDate);
    return date;
  }

  function setView(index) {
    viewYear = Math.floor(index / 12);
    viewMonth = index - viewYear * 12;
  }

  const dayButton = (date) => root.querySelector(`[data-part='day'][data-date="${toISO(date)}"]`);

  function dayCell(date, outside) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-part", "day");
    // The button is the grid cell (its <td> is presentational), so
    // aria-selected sits on a role that allows it.
    btn.setAttribute("role", "gridcell");
    btn.dataset.date = toISO(date);
    btn.textContent = date.getDate();
    const words = [fullDate.format(date)];

    if (outside) btn.dataset.outside = "true";
    if (+date === +today) {
      btn.dataset.today = "true";
      words.push(todayWord);
    }

    const state = stateOf(date);
    if (state) {
      btn.dataset.state = state;
      btn.setAttribute("aria-selected", "true");
      words.push(state === "range-start" ? RANGE_START : state === "range-end" ? RANGE_END : IN_RANGE);
      if (state === "range-start" && rangeEnd && +rangeEnd === +date) words.push(RANGE_END);
    } else if (mode !== "range" && selectedDate && +date === +selectedDate) {
      btn.setAttribute("aria-selected", "true");
    }

    if (blocked(date) || badEnd(date)) {
      // aria-disabled (not the native attribute) keeps the cell reachable by
      // the roving tabindex while blocking selection
      btn.setAttribute("aria-disabled", "true");
      btn.dataset.disabled = "true";
      words.push(UNAVAILABLE);
    }

    btn.setAttribute("aria-label", words.join(", "));
    btn.tabIndex = focusedDate && +date === +focusedDate ? 0 : -1;
    return btn;
  }

  function fill(body, first, multi, title) {
    const y = first.getFullYear();
    const m = first.getMonth();
    if (title) title.textContent = monthYear.format(first);
    const lead = first.getDay(); // 0 = Sunday, the first column
    const cells = Math.ceil((lead + new Date(y, m + 1, 0).getDate()) / 7) * 7;

    body.innerHTML = "";
    let row = null;
    for (let i = 0; i < cells; i++) {
      if (i % 7 === 0) row = body.appendChild(document.createElement("tr"));
      const td = row.appendChild(document.createElement("td"));
      td.setAttribute("role", "presentation");
      const date = new Date(y, m, 1 - lead + i);
      const outside = date.getMonth() !== m;
      // Months side by side show each date once: their leading and trailing
      // cells stay empty.
      if (!(outside && multi)) td.appendChild(dayCell(date, outside));
    }
  }

  function render() {
    const n = bodies.length;
    const first = new Date(viewYear, viewMonth, 1);
    const label = n > 1
      ? monthYear.formatRange(first, new Date(viewYear, viewMonth + n - 1, 1))
      : monthYear.format(first);
    if (monthLabel && monthLabel.textContent !== label) monthLabel.textContent = label;

    // A whole adjacent month out of bounds means its nav button is a dead end
    if (navPrev) navPrev.disabled = !!(minDate && new Date(viewYear, viewMonth, 0) < minDate);
    if (navNext) navNext.disabled = !!(maxDate && new Date(viewYear, viewMonth + n, 1) > maxDate);

    bodies.forEach((body, i) => fill(body, new Date(viewYear, viewMonth + i, 1), n > 1, titles[i]));

    // Exactly one day in the tab order: the focused one when it is in view,
    // else the selection (or range start) when that is, else the 1st.
    if (!root.querySelector("[data-part='day'][tabindex='0']")) {
      const anchor = mode === "range" ? rangeStart : selectedDate;
      const btn = (anchor && dayButton(anchor)) || dayButton(first);
      if (btn) btn.tabIndex = 0;
    }

    paintPreview();
    syncPresets();
    syncSummary();
  }

  // ── Range preview ───────────────────────────────────────────────────────────

  /** Preview the span a pending range would have if it ended on `date`. */
  function preview(date) {
    const at = date && mode === "range" && rangeStart && !rangeEnd && date > rangeStart &&
      spanOk(rangeStart, date) && !blocked(date) ? +date : 0;
    if (at === previewAt) return;
    previewAt = at;
    paintPreview();
  }

  function paintPreview() {
    const end = rangeStart && !rangeEnd ? previewAt : 0;
    for (const btn of root.querySelectorAll("[data-part='day']")) {
      const state = btn.dataset.state;
      if (state && !state.startsWith("preview")) continue;
      const t = +parseISO(btn.dataset.date);
      if (end && t > rangeStart && t <= end) btn.dataset.state = t === end ? "preview-end" : "preview";
      else if (state) delete btn.dataset.state;
    }
  }

  // ── Presets ─────────────────────────────────────────────────────────────────

  /**
   * A preset's [start, end], clamped to [min, max]; null when it cannot be
   * picked here (empty after clamping, outside the range length bounds, or a
   * span in single mode). data-value: today, yesterday, tomorrow,
   * last-N-days, next-N-days, this|last|next-week|month|year; or explicit
   * data-start / data-end.
   */
  function presetRange(btn) {
    const v = btn.dataset.value || "";
    const y = today.getFullYear();
    const m = today.getMonth();
    let start = parseISO(btn.dataset.start);
    let end = parseISO(btn.dataset.end) || start;
    let match;
    if (v === "today") start = end = today;
    else if (v === "yesterday") start = end = addDays(today, -1);
    else if (v === "tomorrow") start = end = addDays(today, 1);
    else if ((match = /^(last|next)-(\d+)-days$/.exec(v))) {
      const n = +match[2];
      if (match[1] === "last") [start, end] = [addDays(today, 1 - n), today];
      else [start, end] = [today, addDays(today, n - 1)];
    } else if ((match = /^(this|last|next)-(week|month|year)$/.exec(v))) {
      const k = match[1] === "this" ? 0 : match[1] === "last" ? -1 : 1;
      if (match[2] === "week") {
        start = addDays(today, 7 * k - today.getDay());
        end = addDays(start, 6);
      } else if (match[2] === "month") {
        start = new Date(y, m + k, 1);
        end = new Date(y, m + k + 1, 0);
      } else {
        start = new Date(y + k, 0, 1);
        end = new Date(y + k, 11, 31);
      }
    }
    if (!start || !end) return null;
    if (minDate && start < minDate) start = minDate;
    if (maxDate && end > maxDate) end = maxDate;
    if (end < start || blocked(start) || blocked(end)) return null;
    if (mode === "range" ? !spanOk(start, end) : +start !== +end) return null;
    return [start, end];
  }

  function syncPresets() {
    for (const btn of presets) {
      const r = presetRange(btn);
      btn.disabled = !r;
      const on = !!r && (mode === "range"
        ? !!rangeEnd && +r[0] === +rangeStart && +r[1] === +rangeEnd
        : !!selectedDate && +r[0] === +selectedDate);
      btn.setAttribute("aria-pressed", on);
    }
  }

  function applyPreset(btn) {
    const r = presetRange(btn);
    if (!r) return;
    const [start, end] = r;
    const preset = btn.dataset.value || null;
    let detail;
    if (mode === "range") {
      rangeStart = start;
      rangeEnd = end;
      detail = { ...rangeDetail(), preset };
    } else {
      selectedDate = start;
      detail = { date: toISO(start), dateObj: new Date(start), preset };
    }
    // Show the end month, and as much before it as the view holds.
    setView(Math.max(monthIndex(start), monthIndex(end) - bodies.length + 1));
    commit(start, detail);
  }

  function syncSummary() {
    if (!summary) return;
    const from = mode === "range" ? rangeStart : selectedDate;
    const text = !from
      ? idleSummary
      : mode !== "range"
        ? fullDate.format(from)
        : !rangeEnd
          ? `${shortDate.format(from)} – ${PICK_END}`
          : `${shortDate.formatRange(from, rangeEnd)} · ${dayCount.format(Math.round((rangeEnd - from) / DAY_MS) + 1)}`;
    if (summary.textContent !== text) summary.textContent = text;
  }

  // ── Focus & selection ───────────────────────────────────────────────────────

  function focusDate(date) {
    const target = clampToRange(addDays(new Date(date)));
    focusedDate = target;

    const first = viewYear * 12 + viewMonth;
    const at = monthIndex(target);
    if (at < first || at >= first + bodies.length) {
      // Bring the month into view: as the first month going back, as the last
      // going forward, so focus moves seamlessly across a multi-month view.
      setView(at < first ? at : at - bodies.length + 1);
      render();
    } else {
      // Update roving tabindex in the current grid(s)
      root.querySelectorAll("[data-part='day']").forEach((btn) => {
        btn.tabIndex = -1;
      });
      const btn = dayButton(target);
      if (btn) btn.tabIndex = 0;
    }

    const btn = dayButton(target);
    if (btn) btn.focus();
    preview(target);
  }

  function moveFocus(days) {
    if (!focusedDate) return;
    focusDate(addDays(focusedDate, days));
  }

  /** Move focus ±N months (PageUp/Down), clamping the day to the target month's length. */
  function moveFocusMonths(months) {
    if (!focusedDate) return;
    const target = new Date(focusedDate.getFullYear(), focusedDate.getMonth() + months, 1);
    const daysInTarget = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(focusedDate.getDate(), daysInTarget));
    focusDate(target);
  }

  const rangeDetail = () => ({
    start: toISO(rangeStart),
    end: toISO(rangeEnd),
    startObj: new Date(rangeStart),
    endObj: new Date(rangeEnd),
  });

  // render() replaces the focused button — restore focus before emitting, so
  // change listeners (e.g. date-picker closing the popup) keep the final word
  // on where focus lands. Focus on a preset is left where it is.
  function commit(focusOn, detail) {
    const hadFocus = root.contains(document.activeElement);
    focusedDate = focusOn;
    previewAt = 0;
    render();
    if (hadFocus && !root.contains(document.activeElement)) {
      const btn = dayButton(focusOn);
      if (btn) btn.focus();
    }
    if (detail) {
      root.dispatchEvent(new CustomEvent("faqir:calendar-change", { detail, bubbles: true }));
    }
  }

  function selectDate(date) {
    const chosen = addDays(new Date(date));
    if (blocked(chosen)) return;

    let detail = null;
    if (mode === "range") {
      if (!rangeStart || rangeEnd || chosen < rangeStart) {
        // First click, restart after a complete range, or backwards pick
        rangeStart = chosen;
        rangeEnd = null;
      } else if (!spanOk(rangeStart, chosen)) {
        return; // shorter than data-min-range or longer than data-max-range
      } else {
        rangeEnd = chosen;
        detail = rangeDetail();
      }
    } else {
      selectedDate = chosen;
      detail = { date: toISO(chosen), dateObj: new Date(chosen) };
    }
    commit(chosen, detail);
  }

  function getValue() {
    if (mode === "range") {
      return {
        start: rangeStart ? toISO(rangeStart) : null,
        end: rangeEnd ? toISO(rangeEnd) : null,
      };
    }
    return selectedDate ? toISO(selectedDate) : null;
  }

  /** Silent set — updates selection and view without emitting a change event. */
  function setValue(value) {
    if (mode === "range") {
      const parts = String(value).split(",");
      const start = parseISO(parts[0] && parts[0].trim());
      const end = parseISO(parts[1] && parts[1].trim());
      if (!start) return;
      rangeStart = start;
      rangeEnd = end && end >= start ? end : null;
      setView(monthIndex(start));
    } else {
      const parsed = parseISO(value);
      if (!parsed) return;
      selectedDate = parsed;
      setView(monthIndex(parsed));
    }
    previewAt = 0;
    render();
  }

  function clear() {
    selectedDate = null;
    rangeStart = null;
    rangeEnd = null;
    previewAt = 0;
    render();
  }

  function navigate(month, year) {
    setView(year * 12 + month);
    focusedDate = new Date(viewYear, viewMonth, 1);
    render();

    const btn = dayButton(focusedDate);
    if (btn) btn.focus();
  }

  function setMin(value) {
    minDate = parseISO(value);
    render();
  }

  function setMax(value) {
    maxDate = parseISO(value);
    render();
  }

  function setDisabledDates(list) {
    disabledDates = parseDateList(Array.isArray(list) ? list.join(",") : list);
    render();
  }

  /** Show 1–3 consecutive months side by side; they wrap to a stack when the row is too narrow. */
  function setMonths(count) {
    const n = Math.min(3, Math.max(1, count | 0));
    if (n === bodies.length) return;
    if (months) {
      months.before(gridEl);
      gridEl.removeAttribute("aria-labelledby");
      months.remove();
      months = null;
    }
    bodies = [gridBody];
    titles = [];
    if (n > 1) {
      const div = (name) => {
        const el = document.createElement("div");
        el.dataset.part = name;
        return el;
      };
      months = div("months");
      gridEl.before(months);
      for (let i = 0; i < n; i++) {
        const title = div("month-title");
        title.id = uid("faqir-month");
        const grid = i ? gridEl.cloneNode(true) : gridEl;
        if (i) {
          grid.removeAttribute("id");
          bodies.push(grid.matches("[data-part='grid-body']") ? grid : grid.querySelector("[data-part='grid-body']"));
        }
        // Each month is its own APG grid, named by its own title.
        grid.setAttribute("aria-labelledby", title.id);
        months.appendChild(div("month")).append(title, grid);
        titles.push(title);
      }
    }
    render();
  }

  /** Whether a date (Date or YYYY-MM-DD) is outside min/max or listed as disabled. */
  function isDisabled(date) {
    const d = typeof date === "string" ? parseISO(date) : date && addDays(new Date(date));
    return !d || blocked(d);
  }

  /** Show an adjacent month without moving DOM focus (nav-button clicks). */
  function shiftView(delta) {
    setView(viewYear * 12 + viewMonth + delta);
    focusedDate = clampToRange(new Date(viewYear, viewMonth, 1));
    render();
  }

  function onPrevClick() {
    shiftView(-1);
  }

  function onNextClick() {
    shiftView(1);
  }

  function onClick(e) {
    const dayBtn = e.target.closest("[data-part='day']");
    if (dayBtn) {
      if (dayBtn.dataset.date && dayBtn.getAttribute("aria-disabled") !== "true") {
        selectDate(parseISO(dayBtn.dataset.date));
      }
      return;
    }
    const preset = e.target.closest("[data-part='preset']");
    if (preset && presets.includes(preset)) applyPreset(preset);
  }

  // Hovering a day previews the pending range up to it; the pointer leaving the
  // grids (or the calendar) clears it.
  function onPointerOver(e) {
    const dayBtn = e.target.closest("[data-part='day']");
    if (dayBtn) preview(parseISO(dayBtn.dataset.date));
    else if (!e.target.closest("[data-part='grid']")) preview(null);
  }

  function onPointerLeave() {
    preview(null);
  }

  function onKeyDown(e) {
    // Grid navigation only applies while a day cell has focus
    const dayBtn = e.target.closest ? e.target.closest("[data-part='day']") : null;
    if (!dayBtn) return;

    if (dayBtn.dataset.date && !(focusedDate && dayBtn.dataset.date === toISO(focusedDate))) {
      focusedDate = parseISO(dayBtn.dataset.date);
    }

    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        moveFocus(-1);
        break;
      case "ArrowRight":
        e.preventDefault();
        moveFocus(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveFocus(-7);
        break;
      case "ArrowDown":
        e.preventDefault();
        moveFocus(7);
        break;
      case "Home":
        e.preventDefault();
        if (focusedDate) moveFocus(-focusedDate.getDay());
        break;
      case "End":
        e.preventDefault();
        if (focusedDate) moveFocus(6 - focusedDate.getDay());
        break;
      case "PageUp":
        e.preventDefault();
        moveFocusMonths(e.shiftKey ? -12 : -1);
        break;
      case "PageDown":
        e.preventDefault();
        moveFocusMonths(e.shiftKey ? 12 : 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (focusedDate) selectDate(focusedDate);
        break;
    }
  }

  navPrev?.addEventListener("click", onPrevClick);
  navNext?.addEventListener("click", onNextClick);
  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeyDown);
  root.addEventListener("pointerover", onPointerOver);
  root.addEventListener("pointerleave", onPointerLeave);

  setMonths(parseInt(root.dataset.months, 10) || 1);

  function destroy() {
    navPrev?.removeEventListener("click", onPrevClick);
    navNext?.removeEventListener("click", onNextClick);
    root.removeEventListener("click", onClick);
    root.removeEventListener("keydown", onKeyDown);
    root.removeEventListener("pointerover", onPointerOver);
    root.removeEventListener("pointerleave", onPointerLeave);
    // Put the authored grid back where it was, without the generated months.
    setMonths(1);
    delete root._faqirCalendar;
  }

  const api = {
    getValue,
    setValue,
    clear,
    navigate,
    selectDate,
    focusDate,
    setMin,
    setMax,
    setDisabledDates,
    setMonths,
    isDisabled,
    destroy,
  };
  root._faqirCalendar = api;
  return api;
}
