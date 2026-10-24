// @ui:controller date-picker
// @ui:provides open close getValue setValue clear navigate selectDate destroy

import { onOutsideClick } from "../../core/events.js";
import { uid } from "../../core/utils.js";
import { createCalendar } from "../calendar/calendar.js";

// Arabic-Indic, extended Arabic-Indic and full-width digits: each one's low
// four bits are its value, so typed dates read the same in every script.
const DIGITS = /[٠-٩۰-۹０-９]/g;
const FIELD = { day: "dd", month: "mm", year: "yyyy" };
const DAY_MS = 864e5;

function parseISO(str) {
  if (!str) return null;
  const d = new Date(str + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function createDatePicker(root) {
  // Prevent double-init
  if (root._faqirDatePicker) return root._faqirDatePicker;

  const part = (name) => root.querySelector(`[data-part='${name}']`);
  const trigger = part("trigger");
  const input = part("input");
  const inputEnd = part("input-end");
  const popup = part("calendar");
  const clearBtn = part("clear");
  const error = part("error");
  // The submitted value. The visible input shows "October 15, 2026"; a form
  // must send 2026-10-15, so a picker inside one carries a hidden input with
  // the field's `name`, and this controller keeps it holding the ISO date.
  // Optional: without it the picker works as before, the ISO date on
  // `input.dataset.value`. A range carries a second one for its end.
  const valueInput = root.querySelector(":scope > [data-part='value']");
  const valueEnd = root.querySelector(":scope > [data-part='value-end']");

  // The month grid is the standalone `calendar` recipe. Canonical markup nests
  // [data-ui="calendar"] inside the popup; legacy flat markup (grid parts
  // directly inside the popup) still works — the popup itself then acts as the
  // calendar root.
  const calendarRoot = root.querySelector("[data-ui='calendar']") || popup;

  // `input` carries the value and the aria-expanded state, `popup` is what
  // opens; either one missing made every open()/close() throw. `trigger` is
  // optional — an input-only date picker opens from the field. [W3-2]
  if (!input || !popup) {
    console.warn(
      "[Faqir] date-picker needs [data-part='input'] and [data-part='calendar'] — " +
        `missing ${[!input && "input", !popup && "calendar"].filter(Boolean).join(" and ")}. ` +
        "Component left inert.",
      root
    );
    const inert = {
      open() {},
      close() {},
      getValue: () => null,
      setValue() {},
      clear() {},
      navigate() {},
      selectDate() {},
      destroy() {},
    };
    root._faqirDatePicker = inert;
    return inert;
  }

  // data-mode="range" on the picker is the calendar's mode too.
  const range = (root.dataset.mode || calendarRoot.dataset.mode) === "range";
  if (range) calendarRoot.dataset.mode = "range";
  // Inline: the calendar sits in the flow, always shown — there is no popup.
  const inline = root.dataset.variant === "inline";
  const calendar = createCalendar(calendarRoot);
  const wantMonths = parseInt(calendarRoot.dataset.months, 10) || 1;

  // The visible fields: the start (or only) date, then a range's end. A range
  // shown in one field is display-only; typing needs the two.
  const fields = range && inputEnd ? [input, inputEnd] : [input];
  const hiddens = [valueInput, valueEnd];
  const typed = fields.some((f) => !f.readOnly) && (!range || !!inputEnd);
  const combos = fields.filter((f) => f === input || f.getAttribute("role") === "combobox");

  const today = new Date();
  let outsideClickCleanup = null;

  // ── Locale: display, field order and month names, from the nearest lang ──
  let locale = root.closest("[lang]")?.lang || navigator.language;
  try {
    new Intl.DateTimeFormat(locale);
  } catch {
    locale = "en-US";
  }
  const fmt = (opts) => new Intl.DateTimeFormat(locale, { calendar: "gregory", ...opts });
  const longDate = fmt({ year: "numeric", month: "long", day: "numeric" });
  const shape = fmt({}).formatToParts(new Date(2026, 11, 31));
  const order = shape.map((p) => p.type).filter((t) => t in FIELD);
  const monthNames = [];
  // Stand-alone names ("март") and the form a full date uses ("17 марта"):
  // they differ in Slavic and Finnic languages, and the field must read back
  // the text it displays.
  for (const month of ["long", "short"]) {
    const alone = fmt({ month });
    const inDate = fmt({ day: "numeric", month });
    for (let m = 0; m < 12; m++) {
      const date = new Date(2026, m, 1);
      const part = inDate.formatToParts(date).find((p) => p.type === "month");
      for (const name of [alone.format(date), part && part.value]) {
        if (name) monthNames.push([name.toLowerCase().replace(/\.$/, ""), m + 1]);
      }
    }
  }
  // A typed field with no placeholder shows the page's own numeric pattern.
  if (typed) {
    for (const f of fields) if (!f.placeholder) f.placeholder = shape.map((p) => FIELD[p.type] || p.value).join("");
  }
  if (!inline) {
    if (!popup.id) popup.id = uid("faqir-date");
    for (const f of combos) f.setAttribute("aria-controls", popup.id);
  } else {
    popup.hidden = false;
  }

  function formatDisplay(date) {
    return longDate.format(date);
  }

  /**
   * A typed date, read in the page's own field order (`formatToParts`), with
   * ISO and any year-first entry always accepted: 1–2 digit day and month (or
   * a month name), 2 or 4 digit year, any separators. Null if it is not a real
   * date.
   */
  function parse(text) {
    const s = text.replace(DIGITS, (c) => c.charCodeAt(0) & 15).toLowerCase();
    const nums = s.match(/\d+/g) || [];
    let month = 0;
    for (const word of s.match(/[\p{L}\p{M}]+/gu) || []) {
      const hit = monthNames.find(([name]) => name === word) ||
        (word.length > 2 && monthNames.find(([name]) => name.startsWith(word)));
      if (hit) {
        month = hit[1];
        break;
      }
    }
    let slots = nums[0] && nums[0].length > 2 ? ["year", "month", "day"] : order;
    if (month) slots = slots.filter((f) => f !== "month");
    if (nums.length !== slots.length) return null;
    const v = { month };
    slots.forEach((f, i) => (v[f] = nums[i]));
    if (!/^\d{1,2}$/.test(v.day) || !/^\d{1,2}$/.test(v.month) || !/^(\d\d|\d{4})$/.test(v.year)) return null;
    let y = +v.year;
    // Two-digit years land within 20 years ahead, else the century before.
    if (v.year.length === 2) y += y + 2000 > today.getFullYear() + 20 ? 1900 : 2000;
    const d = new Date(y, v.month - 1, +v.day);
    return d.getFullYear() === y && d.getMonth() === v.month - 1 && d.getDate() === +v.day ? d : null;
  }

  /** "" for an empty field, a Date for a valid one, null for one that is not. */
  function read(field) {
    const text = field.value.trim();
    if (!text) return "";
    const current = parseISO(field.dataset.value);
    if (current && text === formatDisplay(current)) return current;
    const d = parse(text);
    return d && !calendar.isDisabled(d) ? d : null;
  }

  function spanOk(a, b) {
    const n = Math.round((b - a) / DAY_MS) + 1;
    const min = parseInt(calendarRoot.dataset.minRange, 10) || 1;
    const max = parseInt(calendarRoot.dataset.maxRange, 10) || 0;
    return b >= a && n >= min && (!max || n <= max);
  }

  // `date` null is no date. The submitted value is announced the way typing
  // into a field would be — `input` then `change`, bubbling — so l-model,
  // faqir-validate and faqir-rules all see the new answer; not when it did not
  // change, and not on the `silent` sync at start-up. `keep` leaves the text a
  // person typed in place (an invalid entry is never wiped).
  function put(i, date, silent, keep) {
    const field = fields[i];
    const hidden = hiddens[i];
    const iso = date ? toISO(date) : "";
    if (field) {
      if (!keep) field.value = date ? formatDisplay(date) : "";
      field.dataset.value = iso;
    }
    if (hidden && hidden.value !== iso) {
      hidden.value = iso;
      if (!silent) {
        for (const type of ["input", "change"]) hidden.dispatchEvent(new Event(type, { bubbles: true }));
      }
    }
  }

  /** Show [start, end] in the field(s) and the value part(s). */
  function sync(start, end, silent, keep = []) {
    put(0, start, silent, keep[0]);
    if (range) put(1, end, silent, keep[1]);
    // One display-only field shows the whole range ("March 10 – 15, 2026").
    if (range && fields.length === 1 && start) {
      input.value = end ? longDate.formatRange(start, end) : formatDisplay(start);
    }
    updateClear();
  }

  function updateClear() {
    if (clearBtn) clearBtn.hidden = !fields.some((f) => f.value);
  }

  function mark(field, bad) {
    if (bad) {
      field.setAttribute("aria-invalid", "true");
      field.dataset.state = "invalid";
    } else {
      field.removeAttribute("aria-invalid");
      delete field.dataset.state;
    }
    if (error) error.hidden = !fields.some((f) => f.dataset.state === "invalid");
  }

  function emit(detail) {
    root.dispatchEvent(new CustomEvent("faqir:date-change", { detail, bubbles: true }));
  }

  const detailOf = (start, end) =>
    range
      ? { start: start && toISO(start), end: end && toISO(end), startObj: start, endObj: end }
      : { date: start && toISO(start), dateObj: start };

  /**
   * Commit what was typed (blur, Enter, opening the calendar): valid fields
   * take the canonical display, an invalid one keeps its text and is marked
   * aria-invalid / data-state="invalid", and the value parts carry only the
   * valid dates. Emits faqir:date-change once the selection is complete and new.
   */
  function commitTyped() {
    if (!typed) return;
    const before = fields.map((f) => f.dataset.value).join();
    const vals = fields.map(read);
    const [start, end] = vals;
    // An end before the start, or a span outside the length bounds, is the end's fault.
    const badSpan = range && start && end && !spanOk(start, end);
    const bad = vals.map((v, i) => v === null || (i === 1 && !!badSpan));
    bad.forEach((b, i) => mark(fields[i], b));
    const s = start || null;
    const e = (!badSpan && end) || null;
    if (s) calendar.setValue(range ? toISO(s) + (e ? "," + toISO(e) : "") : toISO(s));
    else calendar.clear();
    sync(s, e, false, bad);
    if (fields.map((f) => f.dataset.value).join() !== before && s && (!range || e)) emit(detailOf(s, e));
  }

  function expand(on) {
    for (const f of combos) f.setAttribute("aria-expanded", on);
  }

  function open() {
    root.dataset.state = "open";
    commitTyped();
    if (!inline) {
      popup.hidden = false;
      expand(true);
      // Two months side by side when the viewport has room for them.
      if (wantMonths > 1) calendar.setMonths(window.matchMedia?.("(min-width: 48rem)").matches ? wantMonths : 1);
      if (outsideClickCleanup) outsideClickCleanup();
      outsideClickCleanup = onOutsideClick(root, close);
    }

    // Focus the selected day (a range's start), or the first of the current month
    const value = calendar.getValue();
    const at = parseISO(range ? value && value.start : value);
    calendar.focusDate(at || new Date(today.getFullYear(), today.getMonth(), 1));
  }

  function close() {
    root.dataset.state = "closed";
    if (inline) return;
    popup.hidden = true;
    expand(false);

    if (outsideClickCleanup) {
      outsideClickCleanup();
      outsideClickCleanup = null;
    }
  }

  function selectDate(date) {
    // Delegates to the calendar; input update, close and the faqir:date-change
    // re-emit all happen in onCalendarChange.
    calendar.selectDate(date);
  }

  function getValue() {
    return calendar.getValue();
  }

  /** YYYY-MM-DD, or for a range "start,end" / { start, end }; anything that is not a date is ignored. */
  function setValue(value) {
    show(value);
  }

  function show(value, silent) {
    const pair = value && typeof value === "object" ? [value.start, value.end] : String(value).split(",");
    const start = parseISO(pair[0] && pair[0].trim());
    if (!start) return;
    let end = range ? parseISO(pair[1] && pair[1].trim()) : null;
    if (end && end < start) end = null;
    calendar.setValue(range ? toISO(start) + (end ? "," + toISO(end) : "") : toISO(start));
    for (const f of fields) mark(f, false);
    sync(start, end, silent);
  }

  // No date: the calendar, the visible input(s) and the submitted value(s) all empty.
  function clear() {
    calendar.clear();
    for (const f of fields) mark(f, false);
    sync(null, null);
  }

  function navigate(month, year) {
    calendar.navigate(month, year);
  }

  // Event: calendar selection committed
  function onCalendarChange(e) {
    const d = e.detail;
    if (!d || !(range ? d.end : d.date)) return;
    for (const f of fields) mark(f, false);
    sync(range ? d.startObj : d.dateObj, range ? d.endObj : null);
    if (!inline) {
      close();
      input.focus();
    }
    emit({ ...d });
  }

  // Event: trigger/input click
  function onTriggerClick() {
    if (root.dataset.state === "open" && !inline) {
      close();
    } else {
      open();
    }
  }

  // A read-only field outside the trigger opens the calendar like the trigger.
  function onRootClick(e) {
    if (fields.includes(e.target) && e.target.readOnly && !trigger?.contains(e.target) && !inline) onTriggerClick();
  }

  // The clear button empties everything and hands focus back to the field.
  function onClear(e) {
    // Inside the trigger it must not toggle the popup as well.
    e.stopPropagation();
    const had = fields.some((f) => f.dataset.value);
    clear();
    input.focus();
    if (had) emit(detailOf(null, null));
  }

  function onRootKeyDown(e) {
    if (e.key === "Escape" && root.dataset.state === "open" && !inline) {
      e.preventDefault();
      // Closing the calendar popup is the whole action — a date picker inside a
      // dialog must not take the dialog down with it. [W3-2]
      e.stopPropagation();
      close();
      input.focus();
      return;
    }
    const field = e.target;
    if (!fields.includes(field)) return;
    // The APG combobox date picker: ArrowDown (Alt+ArrowDown) opens the grid; a
    // read-only field opens on Enter/Space too, a typed one commits on Enter.
    if (e.key === "ArrowDown" || (field.readOnly && (e.key === "Enter" || e.key === " "))) {
      e.preventDefault();
      open();
    } else if (e.key === "Enter") {
      commitTyped();
    }
  }

  // Start-up: a value the server rendered into the hidden input is the
  // selection — the calendar shows it and the visible input reads it as a
  // person would. Silent: nothing changed.
  const initialValue = [valueInput ? valueInput.value : "", valueEnd ? valueEnd.value : ""].join(",");
  if (initialValue !== ",") show(initialValue, true);
  else updateClear();

  // A form reset puts the visible input back to its default text but never
  // touches a hidden input, so the rendered value is restored here — after
  // the reset has run, since `reset` fires before it does.
  const form = valueInput && valueInput.form;
  let resetTimer;
  function onFormReset() {
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => (initialValue !== "," ? setValue(initialValue) : clear()));
  }

  trigger?.addEventListener("click", onTriggerClick);
  clearBtn?.addEventListener("click", onClear);
  for (const f of fields) {
    f.addEventListener("change", commitTyped);
    f.addEventListener("input", updateClear);
  }
  root.addEventListener("click", onRootClick);
  root.addEventListener("faqir:calendar-change", onCalendarChange);
  root.addEventListener("keydown", onRootKeyDown);
  form?.addEventListener("reset", onFormReset);

  function destroy() {
    // Leaving a destroyed overlay open leaves a dead one: nothing is listening
    // any more, so its close button, Escape and overlay click all do nothing.
    // `context-menu` is the model — it has always closed itself here. [W3-2]
    close();
    trigger?.removeEventListener("click", onTriggerClick);
    clearBtn?.removeEventListener("click", onClear);
    for (const f of fields) {
      f.removeEventListener("change", commitTyped);
      f.removeEventListener("input", updateClear);
    }
    root.removeEventListener("click", onRootClick);
    root.removeEventListener("faqir:calendar-change", onCalendarChange);
    root.removeEventListener("keydown", onRootKeyDown);
    form?.removeEventListener("reset", onFormReset);
    clearTimeout(resetTimer);
    if (outsideClickCleanup) outsideClickCleanup();
    calendar.destroy();
    delete root._faqirDatePicker;
  }

  const api = { open, close, getValue, setValue, clear, navigate, selectDate, destroy };
  root._faqirDatePicker = api;
  return api;
}
