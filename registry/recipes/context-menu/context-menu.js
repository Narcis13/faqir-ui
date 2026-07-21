// @ui:controller context-menu
// @ui:provides open close destroy

import { onOutsideClick } from "../../core/events.js";
import { createMenuNavigation } from "../../core/menu-navigation.js";

export function createContextMenu(root) {
  if (root._faqirContextMenu) return root._faqirContextMenu;

  const target = root.querySelector("[data-part='target']");
  const menu = root.querySelector("[data-part='menu']");

  let outsideClickCleanup = null;

  function clearOutsideClick() {
    if (!outsideClickCleanup) return;
    outsideClickCleanup();
    outsideClickCleanup = null;
  }

  function close(options = {}) {
    const { restoreFocus = true } = options;

    root.dataset.state = "closed";
    menu.hidden = true;
    target.setAttribute("aria-expanded", "false");
    clearOutsideClick();

    if (restoreFocus && target.isConnected) target.focus();
  }

  const navigation = createMenuNavigation(menu, {
    onEscape() {
      close({ restoreFocus: true });
    },
    onTab() {
      close({ restoreFocus: false });
    },
  });

  function open(x = 0, y = 0) {
    clearOutsideClick();

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.hidden = false;
    root.dataset.state = "open";
    target.setAttribute("aria-expanded", "true");

    navigation.focusFirst();

    outsideClickCleanup = onOutsideClick(menu, () => {
      close({ restoreFocus: false });
    });
  }

  function onContextMenu(event) {
    event.preventDefault();
    open(event.clientX, event.clientY);
  }

  function onTargetKeyDown(event) {
    const isContextMenuKey = event.key === "ContextMenu";
    const isShiftF10 = event.key === "F10" && event.shiftKey;
    if (!isContextMenuKey && !isShiftF10) return;

    event.preventDefault();
    const rect = target.getBoundingClientRect();
    open(rect.left, rect.bottom);
  }

  function onMenuClick(event) {
    const item = event.target.closest("[data-part='item']");
    if (!item || !menu.contains(item)) return;

    if (item.disabled || item.getAttribute("aria-disabled") === "true") {
      event.preventDefault();
      return;
    }

    close({ restoreFocus: true });
  }

  target?.addEventListener("contextmenu", onContextMenu);
  target?.addEventListener("keydown", onTargetKeyDown);
  menu?.addEventListener("click", onMenuClick);

  function destroy() {
    target?.removeEventListener("contextmenu", onContextMenu);
    target?.removeEventListener("keydown", onTargetKeyDown);
    menu?.removeEventListener("click", onMenuClick);
    navigation.destroy();
    clearOutsideClick();

    root.dataset.state = "closed";
    menu.hidden = true;
    target.setAttribute("aria-expanded", "false");
    delete root._faqirContextMenu;
  }

  const api = { open, close, destroy };
  root._faqirContextMenu = api;
  return api;
}
