// @ui:controller tabs
// @ui:provides activate destroy

const KEY = "__loomTabs";

export function createTabs(root) {
  if (root[KEY]) {
    return root[KEY];
  }

  const tabs = [...root.querySelectorAll("[data-part='trigger']")];
  const panels = [...root.querySelectorAll("[data-part='panel']")];
  const orientation = root.dataset.orientation === "vertical" ? "vertical" : "horizontal";
  const baseId = root.id || "loom-tabs";
  let api;
  let activeIndex = tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");

  if (activeIndex < 0) {
    activeIndex = 0;
  }

  tabs.forEach((tab, index) => {
    const value = tab.dataset.value || `tab-${index + 1}`;
    const panel = panels[index];

    tab.id ||= `${baseId}-${value}-tab`;
    tab.setAttribute("role", "tab");

    if (panel) {
      panel.id ||= `${baseId}-${value}-panel`;
      panel.setAttribute("role", "tabpanel");
      tab.setAttribute("aria-controls", panel.id);
      panel.setAttribute("aria-labelledby", tab.id);
    }
  });

  function activate(index, options = {}) {
    if (tabs.length === 0) {
      return api;
    }

    activeIndex = (index + tabs.length) % tabs.length;
    root.dataset.state = "ready";
    root.dataset.value = tabs[activeIndex].dataset.value || String(activeIndex);

    tabs.forEach((tab, tabIndex) => {
      const selected = tabIndex === activeIndex;
      tab.dataset.state = selected ? "active" : "inactive";
      tab.setAttribute("aria-selected", String(selected));
      tab.setAttribute("tabindex", selected ? "0" : "-1");

      if (selected && options.focus) {
        tab.focus?.();
      }
    });

    panels.forEach((panel, panelIndex) => {
      const selected = panelIndex === activeIndex;
      panel.dataset.state = selected ? "active" : "inactive";
      panel.hidden = !selected;
    });

    return api;
  }

  function activateValue(value, options = {}) {
    const index = tabs.findIndex((tab) => tab.dataset.value === value);
    return activate(index >= 0 ? index : 0, options);
  }

  function onClick(index) {
    return () => {
      activate(index);
    };
  }

  function onKeyDown(index) {
    return (event) => {
      const keyMap = orientation === "vertical"
        ? { ArrowDown: 1, ArrowUp: -1 }
        : { ArrowRight: 1, ArrowLeft: -1 };

      if (event.key in keyMap) {
        event.preventDefault?.();
        activate(index + keyMap[event.key], { focus: true });
        return;
      }

      if (event.key === "Home") {
        event.preventDefault?.();
        activate(0, { focus: true });
        return;
      }

      if (event.key === "End") {
        event.preventDefault?.();
        activate(tabs.length - 1, { focus: true });
      }
    };
  }

  const listeners = tabs.map((tab, index) => {
    const handleClick = onClick(index);
    const handleKeyDown = onKeyDown(index);
    tab.addEventListener("click", handleClick);
    tab.addEventListener("keydown", handleKeyDown);
    return { tab, handleClick, handleKeyDown };
  });

  activate(activeIndex);

  function destroy() {
    for (const entry of listeners) {
      entry.tab.removeEventListener("click", entry.handleClick);
      entry.tab.removeEventListener("keydown", entry.handleKeyDown);
    }

    delete root[KEY];
  }

  api = {
    activate(valueOrIndex) {
      return typeof valueOrIndex === "string"
        ? activateValue(valueOrIndex)
        : activate(Number(valueOrIndex) || 0);
    },
    destroy,
  };

  root[KEY] = api;
  return api;
}
