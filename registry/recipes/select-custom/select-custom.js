// @ui:controller select-custom
// @ui:provides open close toggle select getValue destroy

import { onOutsideClick } from "../../core/events.js";

export function createSelectCustom(root) {
  // Prevent double-init
  if (root._faqirSelectCustom) return root._faqirSelectCustom;

  const trigger = root.querySelector("[data-part='trigger']");
  const valueEl = root.querySelector("[data-part='value']");
  const listbox = root.querySelector("[data-part='listbox']");
  const searchInput = root.querySelector("[data-part='search']");
  const emptyEl = root.querySelector("[data-part='empty']");
  const options = () =>
    [...root.querySelectorAll("[data-part='option']")];

  let highlightedIndex = -1;
  let outsideClickCleanup = null;
  let selectedValue = "";
  const placeholderText = valueEl?.textContent || "";

  function open() {
    root.dataset.state = "open";
    listbox.hidden = false;
    trigger.setAttribute("aria-expanded", "true");

    // Reset search if present
    if (searchInput) {
      searchInput.value = "";
      filterOptions("");
      searchInput.focus();
    }

    clearHighlight();
    outsideClickCleanup = onOutsideClick(root, close);
  }

  function close() {
    root.dataset.state = "closed";
    listbox.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    clearHighlight();

    if (outsideClickCleanup) {
      outsideClickCleanup();
      outsideClickCleanup = null;
    }

    trigger.focus();
  }

  function toggle() {
    root.dataset.state === "open" ? close() : open();
  }

  function clearHighlight() {
    options().forEach((opt) => {
      opt.removeAttribute("data-highlighted");
    });
    highlightedIndex = -1;
  }

  function visibleOptions() {
    return options().filter((opt) => !opt.hasAttribute("data-hidden"));
  }

  function highlightOption(index) {
    const visible = visibleOptions();
    if (visible.length === 0) return;

    // Clamp index
    if (index < 0) index = visible.length - 1;
    if (index >= visible.length) index = 0;

    // Clear previous
    options().forEach((opt) => opt.removeAttribute("data-highlighted"));

    visible[index].setAttribute("data-highlighted", "");
    visible[index].scrollIntoView({ block: "nearest" });
    highlightedIndex = index;
  }

  function filterOptions(query) {
    const allOptions = options();
    const lowerQuery = query.toLowerCase();
    let visibleCount = 0;

    allOptions.forEach((opt) => {
      const text = opt.textContent.toLowerCase();
      if (text.includes(lowerQuery)) {
        opt.removeAttribute("data-hidden");
        visibleCount++;
      } else {
        opt.setAttribute("data-hidden", "");
      }
    });

    // Show/hide empty state
    if (emptyEl) {
      emptyEl.hidden = visibleCount > 0;
    }

    clearHighlight();
    return visibleCount;
  }

  function select(value) {
    const allOptions = options();
    let targetOption = null;

    // Find option by data-value attribute
    allOptions.forEach((opt) => {
      if (opt.dataset.value === value) {
        targetOption = opt;
      }
    });

    if (!targetOption) {
      // Fallback: find by text content
      allOptions.forEach((opt) => {
        if (opt.textContent.trim() === value) {
          targetOption = opt;
        }
      });
    }

    if (!targetOption) return;

    // Deselect all
    allOptions.forEach((opt) => opt.setAttribute("aria-selected", "false"));

    // Select target
    targetOption.setAttribute("aria-selected", "true");
    selectedValue = targetOption.dataset.value || targetOption.textContent.trim();

    // Update displayed value
    if (valueEl) {
      valueEl.textContent = targetOption.textContent.trim();
      valueEl.removeAttribute("data-placeholder");
    }

    // Dispatch change event
    const event = new CustomEvent("select-change", {
      bubbles: true,
      detail: {
        value: selectedValue,
        label: targetOption.textContent.trim()
      }
    });
    root.dispatchEvent(event);

    close();
  }

  function getValue() {
    return selectedValue;
  }

  // ── Event Handlers ──

  function onTriggerClick() {
    toggle();
  }

  function onTriggerKeyDown(e) {
    switch (e.key) {
      case "ArrowDown":
      case "Enter":
      case " ":
        e.preventDefault();
        if (root.dataset.state !== "open") {
          open();
        }
        break;
      case "Escape":
        if (root.dataset.state === "open") {
          e.preventDefault();
          close();
        }
        break;
    }
  }

  function onListboxKeyDown(e) {
    const visible = visibleOptions();

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        highlightOption(highlightedIndex + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        highlightOption(highlightedIndex - 1);
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < visible.length) {
          const opt = visible[highlightedIndex];
          select(opt.dataset.value || opt.textContent.trim());
        }
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Home":
        if (visible.length > 0) {
          e.preventDefault();
          highlightOption(0);
        }
        break;
      case "End":
        if (visible.length > 0) {
          e.preventDefault();
          highlightOption(visible.length - 1);
        }
        break;
    }
  }

  function onOptionClick(e) {
    const opt = e.target.closest("[data-part='option']");
    if (!opt) return;
    select(opt.dataset.value || opt.textContent.trim());
  }

  function onSearchInput() {
    if (searchInput) {
      filterOptions(searchInput.value);
    }
  }

  trigger?.addEventListener("click", onTriggerClick);
  trigger?.addEventListener("keydown", onTriggerKeyDown);
  listbox?.addEventListener("keydown", onListboxKeyDown);
  listbox?.addEventListener("click", onOptionClick);
  searchInput?.addEventListener("input", onSearchInput);

  function destroy() {
    trigger?.removeEventListener("click", onTriggerClick);
    trigger?.removeEventListener("keydown", onTriggerKeyDown);
    listbox?.removeEventListener("keydown", onListboxKeyDown);
    listbox?.removeEventListener("click", onOptionClick);
    searchInput?.removeEventListener("input", onSearchInput);
    if (outsideClickCleanup) outsideClickCleanup();
    delete root._faqirSelectCustom;
  }

  const api = { open, close, toggle, select, getValue, destroy };
  root._faqirSelectCustom = api;
  return api;
}
