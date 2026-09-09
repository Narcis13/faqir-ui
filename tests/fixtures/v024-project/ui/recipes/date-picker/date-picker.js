// @ui:controller date-picker
// @ui:provides open close getValue setValue navigate selectDate destroy

import { onOutsideClick } from "../../core/events.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

export function createDatePicker(root) {
  // Prevent double-init
  if (root._loomDatePicker) return root._loomDatePicker;

  const trigger = root.querySelector("[data-part='trigger']");
  const input = root.querySelector("[data-part='input']");
  const calendar = root.querySelector("[data-part='calendar']");
  const navPrev = root.querySelector("[data-part='nav-prev']");
  const navNext = root.querySelector("[data-part='nav-next']");
  const monthLabel = root.querySelector("[data-part='month-label']");
  const gridBody = root.querySelector("[data-part='grid-body']");

  const today = new Date();
  let viewMonth = today.getMonth();
  let viewYear = today.getFullYear();
  let selectedDate = null;
  let focusedDate = null;
  let outsideClickCleanup = null;

  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function formatDisplay(date) {
    return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  function formatAriaLabel(date) {
    return `${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  function isSameDay(a, b) {
    if (!a || !b) return false;
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function isToday(date) {
    return isSameDay(date, today);
  }

  function buildCalendar() {
    // First day of the displayed month
    const firstDay = new Date(viewYear, viewMonth, 1);
    const startDow = firstDay.getDay(); // 0=Sun

    // Last day of the displayed month
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const totalDays = lastDay.getDate();

    // Previous month trailing days
    const prevMonthLast = new Date(viewYear, viewMonth, 0);
    const prevMonthDays = prevMonthLast.getDate();

    // Update label
    monthLabel.textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;

    // Clear existing
    gridBody.innerHTML = "";

    let dayCount = 1;
    let nextMonthDay = 1;
    const totalCells = Math.ceil((startDow + totalDays) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
      // Start a new row every 7 cells
      if (i % 7 === 0) {
        var row = document.createElement("tr");
        gridBody.appendChild(row);
      }

      const td = document.createElement("td");
      const btn = document.createElement("button");
      btn.setAttribute("data-part", "day");
      btn.type = "button";

      let date;
      let isOutside = false;

      if (i < startDow) {
        // Previous month
        const day = prevMonthDays - startDow + 1 + i;
        date = new Date(viewYear, viewMonth - 1, day);
        btn.textContent = day;
        isOutside = true;
      } else if (dayCount <= totalDays) {
        // Current month
        date = new Date(viewYear, viewMonth, dayCount);
        btn.textContent = dayCount;
        dayCount++;
      } else {
        // Next month
        date = new Date(viewYear, viewMonth + 1, nextMonthDay);
        btn.textContent = nextMonthDay;
        nextMonthDay++;
        isOutside = true;
      }

      btn.dataset.date = formatDate(date);
      btn.setAttribute("aria-label", formatAriaLabel(date));

      if (isOutside) {
        btn.dataset.outside = "true";
      }

      if (isToday(date)) {
        btn.dataset.today = "true";
      }

      if (isSameDay(date, selectedDate)) {
        btn.setAttribute("aria-selected", "true");
      }

      if (isSameDay(date, focusedDate)) {
        btn.tabIndex = 0;
      } else {
        btn.tabIndex = -1;
      }

      td.appendChild(btn);
      row.appendChild(td);
    }

    // If no focused date set, make the selected or first-of-month focusable
    if (!focusedDate) {
      const defaultFocusDate = selectedDate
        ? (selectedDate.getMonth() === viewMonth && selectedDate.getFullYear() === viewYear ? selectedDate : new Date(viewYear, viewMonth, 1))
        : new Date(viewYear, viewMonth, 1);
      const defaultBtn = gridBody.querySelector(
        `[data-date="${formatDate(defaultFocusDate)}"]`
      );
      if (defaultBtn) defaultBtn.tabIndex = 0;
    }
  }

  function open() {
    root.dataset.state = "open";
    calendar.hidden = false;
    input.setAttribute("aria-expanded", "true");

    // Set view to selected date month or current month
    if (selectedDate) {
      viewMonth = selectedDate.getMonth();
      viewYear = selectedDate.getFullYear();
    } else {
      viewMonth = today.getMonth();
      viewYear = today.getFullYear();
    }

    focusedDate = selectedDate || new Date(viewYear, viewMonth, 1);
    buildCalendar();

    // Focus the current/selected day
    const focusBtn = gridBody.querySelector(
      `[data-date="${formatDate(focusedDate)}"]`
    );
    if (focusBtn) focusBtn.focus();

    outsideClickCleanup = onOutsideClick(root, close);
  }

  function close() {
    root.dataset.state = "closed";
    calendar.hidden = true;
    input.setAttribute("aria-expanded", "false");
    focusedDate = null;

    if (outsideClickCleanup) {
      outsideClickCleanup();
      outsideClickCleanup = null;
    }
  }

  function selectDate(date) {
    selectedDate = new Date(date);
    input.value = formatDisplay(selectedDate);
    input.dataset.value = formatDate(selectedDate);
    buildCalendar();
    close();
    input.focus();

    root.dispatchEvent(
      new CustomEvent("loom:date-change", {
        detail: { date: formatDate(selectedDate), dateObj: selectedDate },
        bubbles: true,
      })
    );
  }

  function getValue() {
    return selectedDate ? formatDate(selectedDate) : null;
  }

  function setValue(dateStr) {
    const parsed = new Date(dateStr + "T00:00:00");
    if (!isNaN(parsed.getTime())) {
      selectedDate = parsed;
      input.value = formatDisplay(selectedDate);
      input.dataset.value = formatDate(selectedDate);
      viewMonth = selectedDate.getMonth();
      viewYear = selectedDate.getFullYear();
      if (root.dataset.state === "open") {
        buildCalendar();
      }
    }
  }

  function navigate(month, year) {
    viewMonth = month;
    viewYear = year;
    focusedDate = new Date(viewYear, viewMonth, 1);
    buildCalendar();

    const focusBtn = gridBody.querySelector(
      `[data-date="${formatDate(focusedDate)}"]`
    );
    if (focusBtn) focusBtn.focus();
  }

  function moveFocus(days) {
    if (!focusedDate) return;
    const newDate = new Date(focusedDate);
    newDate.setDate(newDate.getDate() + days);
    focusedDate = newDate;

    // Navigate month if needed
    if (newDate.getMonth() !== viewMonth || newDate.getFullYear() !== viewYear) {
      viewMonth = newDate.getMonth();
      viewYear = newDate.getFullYear();
      buildCalendar();
    } else {
      // Update tabindex in current grid
      gridBody.querySelectorAll("[data-part='day']").forEach((btn) => {
        btn.tabIndex = -1;
      });
      const targetBtn = gridBody.querySelector(
        `[data-date="${formatDate(newDate)}"]`
      );
      if (targetBtn) {
        targetBtn.tabIndex = 0;
        targetBtn.focus();
      }
    }

    const targetBtn = gridBody.querySelector(
      `[data-date="${formatDate(newDate)}"]`
    );
    if (targetBtn) targetBtn.focus();
  }

  // Event: trigger/input click
  function onTriggerClick() {
    if (root.dataset.state === "open") {
      close();
    } else {
      open();
    }
  }

  // Event: day click
  function onGridClick(e) {
    const dayBtn = e.target.closest("[data-part='day']");
    if (dayBtn && dayBtn.dataset.date) {
      const date = new Date(dayBtn.dataset.date + "T00:00:00");
      selectDate(date);
    }
  }

  // Event: nav prev
  function onPrevClick() {
    viewMonth--;
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYear--;
    }
    focusedDate = new Date(viewYear, viewMonth, 1);
    buildCalendar();
  }

  // Event: nav next
  function onNextClick() {
    viewMonth++;
    if (viewMonth > 11) {
      viewMonth = 0;
      viewYear++;
    }
    focusedDate = new Date(viewYear, viewMonth, 1);
    buildCalendar();
  }

  // Event: keyboard within calendar
  function onCalendarKeyDown(e) {
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
      case "Enter":
      case " ":
        e.preventDefault();
        if (focusedDate) {
          selectDate(focusedDate);
        }
        break;
      case "Escape":
        e.preventDefault();
        close();
        input.focus();
        break;
    }
  }

  // Event: escape on root
  function onRootKeyDown(e) {
    if (e.key === "Escape" && root.dataset.state === "open") {
      e.preventDefault();
      close();
      input.focus();
    }
  }

  trigger?.addEventListener("click", onTriggerClick);
  gridBody?.addEventListener("click", onGridClick);
  navPrev?.addEventListener("click", onPrevClick);
  navNext?.addEventListener("click", onNextClick);
  calendar?.addEventListener("keydown", onCalendarKeyDown);
  root.addEventListener("keydown", onRootKeyDown);

  function destroy() {
    trigger?.removeEventListener("click", onTriggerClick);
    gridBody?.removeEventListener("click", onGridClick);
    navPrev?.removeEventListener("click", onPrevClick);
    navNext?.removeEventListener("click", onNextClick);
    calendar?.removeEventListener("keydown", onCalendarKeyDown);
    root.removeEventListener("keydown", onRootKeyDown);
    if (outsideClickCleanup) outsideClickCleanup();
    delete root._loomDatePicker;
  }

  const api = { open, close, getValue, setValue, navigate, selectDate, destroy };
  root._loomDatePicker = api;
  return api;
}
