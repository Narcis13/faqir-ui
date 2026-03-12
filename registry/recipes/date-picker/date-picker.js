// @ui:controller date-picker
// @ui:provides open close select destroy

import { onOutsideClick } from "../../core/events.js";

const KEY = "__loomDatePicker";

export function createDatePicker(root) {
  if (root[KEY]) return root[KEY];
  const input = root.querySelector("[data-part='input']");
  const trigger = root.querySelector("[data-part='trigger']");
  const calendar = root.querySelector("[data-part='calendar']");
  const days = [...root.querySelectorAll("[data-part='day']")];
  let stopOutsideClick = () => {};
  function sync() {
    const isOpen = root.dataset.state === "open";
    if (calendar) calendar.hidden = !isOpen;
    trigger?.setAttribute("aria-expanded", String(isOpen));
  }
  function open() { root.dataset.state = "open"; sync(); return api; }
  function close() { root.dataset.state = "closed"; sync(); return api; }
  function select(day) {
    if (!day) return api;
    days.forEach((entry) => delete entry.dataset.state);
    day.dataset.state = "selected";
    if (input) input.value = day.dataset.date || day.textContent || "";
    close();
    return api;
  }
  trigger?.addEventListener("click", () => root.dataset.state === "open" ? close() : open());
  input?.addEventListener("focus", open);
  input?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") { event.preventDefault?.(); open(); return; }
    if (event.key === "Escape") { event.preventDefault?.(); close(); }
  });
  days.forEach((day) => day.addEventListener("click", () => select(day)));
  if (typeof document !== "undefined") stopOutsideClick = onOutsideClick(document, root, close);
  sync();
  function destroy() { stopOutsideClick(); delete root[KEY]; }
  const api = { open, close, select, destroy };
  root[KEY] = api;
  return api;
}

