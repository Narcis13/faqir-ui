// @ui:controller dropdown
// @ui:provides open close toggle destroy

import { onOutsideClick } from "../../core/events.js";

const KEY = "__loomDropdown";

export function createDropdown(root) {
  if (root[KEY]) {
    return root[KEY];
  }

  const trigger = root.querySelector("[data-part='trigger']");
  const menu = root.querySelector("[data-part='menu']");
  const items = [...root.querySelectorAll("[data-part='item']")];
  let stopOutsideClick = () => {};

  if (menu) {
    menu.setAttribute("role", menu.getAttribute("role") ?? "menu");
  }

  if (trigger) {
    trigger.setAttribute("aria-haspopup", "menu");

    if (menu?.id) {
      trigger.setAttribute("aria-controls", menu.id);
    }
  }

  function sync() {
    const isOpen = root.dataset.state === "open";

    if (menu) {
      menu.hidden = !isOpen;
    }

    if (trigger) {
      trigger.setAttribute("aria-expanded", String(isOpen));
    }
  }

  function focusItem(index) {
    if (items.length === 0) {
      return api;
    }

    const nextIndex = (index + items.length) % items.length;
    root.dataset.activeIndex = String(nextIndex);
    items[nextIndex].focus?.();

    return api;
  }

  function open(options = {}) {
    root.dataset.state = "open";
    sync();

    if (options.focus === "first") {
      focusItem(0);
    } else if (options.focus === "last") {
      focusItem(items.length - 1);
    }

    return api;
  }

  function close(options = {}) {
    root.dataset.state = "closed";
    sync();

    if (options.focusTrigger !== false) {
      trigger?.focus?.();
    }

    return api;
  }

  function toggle() {
    return root.dataset.state === "open" ? close() : open();
  }

  function move(step) {
    if (root.dataset.state !== "open") {
      open();
    }

    const activeElement = typeof document !== "undefined" ? document.activeElement : null;
    const currentIndex = items.indexOf(activeElement);
    return focusItem(currentIndex < 0 ? (step > 0 ? 0 : items.length - 1) : currentIndex + step);
  }

  function onTriggerClick() {
    toggle();
  }

  function onTriggerKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault?.();
      open({ focus: "first" });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault?.();
      open({ focus: "last" });
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault?.();
      close();
    }
  }

  function onMenuKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault?.();
      move(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault?.();
      move(-1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault?.();
      focusItem(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault?.();
      focusItem(items.length - 1);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault?.();
      close();
    }
  }

  function onItemClick() {
    close({ focusTrigger: false });
  }

  trigger?.addEventListener("click", onTriggerClick);
  trigger?.addEventListener("keydown", onTriggerKeyDown);
  menu?.addEventListener("keydown", onMenuKeyDown);

  for (const item of items) {
    item.addEventListener("click", onItemClick);
    item.addEventListener("keydown", onMenuKeyDown);
  }

  if (typeof document !== "undefined") {
    stopOutsideClick = onOutsideClick(document, root, () => {
      if (root.dataset.state === "open") {
        close({ focusTrigger: false });
      }
    });
  }

  sync();

  function destroy() {
    trigger?.removeEventListener("click", onTriggerClick);
    trigger?.removeEventListener("keydown", onTriggerKeyDown);
    menu?.removeEventListener("keydown", onMenuKeyDown);

    for (const item of items) {
      item.removeEventListener("click", onItemClick);
      item.removeEventListener("keydown", onMenuKeyDown);
    }

    stopOutsideClick();
    delete root[KEY];
  }

  const api = { open, close, toggle, destroy, focusItem };
  root[KEY] = api;
  return api;
}
