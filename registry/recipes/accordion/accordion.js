// @ui:controller accordion
// @ui:provides toggle destroy

const KEY = "__loomAccordion";

export function createAccordion(root) {
  if (root[KEY]) {
    return root[KEY];
  }

  const items = [...root.querySelectorAll("[data-part='item']")];
  const triggers = [...root.querySelectorAll("[data-part='trigger']")];
  const mode = root.dataset.mode === "multiple" ? "multiple" : "single";

  items.forEach((item, index) => {
    const trigger = triggers[index];
    const panel = item.querySelector("[data-part='panel']");
    if (!trigger || !panel) {
      return;
    }
    panel.id ||= (root.id || "loom-accordion") + "-panel-" + String(index + 1);
    trigger.setAttribute("aria-controls", panel.id);
  });

  function syncItem(item, open) {
    const trigger = item.querySelector("[data-part='trigger']");
    const panel = item.querySelector("[data-part='panel']");
    item.dataset.state = open ? "open" : "closed";
    trigger?.setAttribute("aria-expanded", String(open));
    if (panel) panel.hidden = !open;
  }

  function toggle(index) {
    const item = items[index];
    if (!item) {
      return api;
    }
    const isOpen = item.dataset.state === "open";
    if (mode === "single") {
      items.forEach((entry, entryIndex) => syncItem(entry, entryIndex === index ? !isOpen : false));
    } else {
      syncItem(item, !isOpen);
    }
    return api;
  }

  function focusTrigger(index) {
    const next = triggers[(index + triggers.length) % triggers.length];
    next?.focus?.();
    return api;
  }

  const listeners = triggers.map((trigger, index) => {
    const onClick = () => toggle(index);
    const onKeyDown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault?.();
        toggle(index);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault?.();
        focusTrigger(index + 1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault?.();
        focusTrigger(index - 1);
      }
    };
    trigger.addEventListener("click", onClick);
    trigger.addEventListener("keydown", onKeyDown);
    return { trigger, onClick, onKeyDown };
  });

  items.forEach((item) => syncItem(item, item.dataset.state === "open"));

  function destroy() {
    listeners.forEach(({ trigger, onClick, onKeyDown }) => {
      trigger.removeEventListener("click", onClick);
      trigger.removeEventListener("keydown", onKeyDown);
    });
    delete root[KEY];
  }

  const api = { toggle, destroy };
  root[KEY] = api;
  return api;
}

