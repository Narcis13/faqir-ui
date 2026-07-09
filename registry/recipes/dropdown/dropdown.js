// @ui:controller dropdown
// @ui:provides open close toggle destroy

import { onOutsideClick } from "../../core/events.js";

export function createDropdown(root) {
  // Prevent double-init
  if (root._faqirDropdown) return root._faqirDropdown;

  const trigger = root.querySelector("[data-part='trigger']");
  const menu = root.querySelector("[data-part='menu']");
  const items = () =>
    [...root.querySelectorAll("[data-part='item']:not(:disabled)")];

  let outsideClickCleanup = null;

  function open() {
    root.dataset.state = "open";
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");

    // Focus first item
    const allItems = items();
    if (allItems.length > 0) allItems[0].focus();

    // Close on outside click
    outsideClickCleanup = onOutsideClick(root, close);
  }

  function close() {
    root.dataset.state = "closed";
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");

    if (outsideClickCleanup) {
      outsideClickCleanup();
      outsideClickCleanup = null;
    }

    trigger.focus();
  }

  function toggle() {
    root.dataset.state === "open" ? close() : open();
  }

  function focusItem(index) {
    const allItems = items();
    if (index < 0 || index >= allItems.length) return;
    allItems[index].focus();
  }

  function getFocusedIndex() {
    const allItems = items();
    return allItems.indexOf(document.activeElement);
  }

  function onTriggerClick() {
    toggle();
  }

  function onTriggerKeyDown(e) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      if (root.dataset.state !== "open") {
        e.preventDefault();
        open();
      }
    }
  }

  function onMenuKeyDown(e) {
    const allItems = items();
    const current = getFocusedIndex();

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusItem((current + 1) % allItems.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusItem((current - 1 + allItems.length) % allItems.length);
        break;
      case "Home":
        e.preventDefault();
        focusItem(0);
        break;
      case "End":
        e.preventDefault();
        focusItem(allItems.length - 1);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        close();
        break;
    }
  }

  function onItemClick() {
    close();
  }

  trigger?.addEventListener("click", onTriggerClick);
  trigger?.addEventListener("keydown", onTriggerKeyDown);
  menu?.addEventListener("keydown", onMenuKeyDown);

  // Delegate item clicks
  menu?.addEventListener("click", (e) => {
    const item = e.target.closest("[data-part='item']");
    if (item && !item.disabled) onItemClick();
  });

  function destroy() {
    trigger?.removeEventListener("click", onTriggerClick);
    trigger?.removeEventListener("keydown", onTriggerKeyDown);
    menu?.removeEventListener("keydown", onMenuKeyDown);
    if (outsideClickCleanup) outsideClickCleanup();
    delete root._faqirDropdown;
  }

  const api = { open, close, toggle, destroy };
  root._faqirDropdown = api;
  return api;
}
