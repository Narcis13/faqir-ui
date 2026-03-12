// @ui:controller tooltip
// @ui:provides open close destroy

const KEY = "__loomTooltip";

export function createTooltip(root) {
  if (root[KEY]) {
    return root[KEY];
  }

  const trigger = root.querySelector("[data-part='trigger']");
  const content = root.querySelector("[data-part='content']");
  let closeTimer = 0;

  if (content) {
    content.id ||= (root.id ? root.id + "-content" : "loom-tooltip-content");
    content.setAttribute("role", content.getAttribute("role") ?? "tooltip");
  }

  if (trigger && content?.id) {
    trigger.setAttribute("aria-describedby", content.id);
  }

  function sync() {
    if (content) content.hidden = root.dataset.state !== "open";
  }

  function open() {
    clearTimeout(closeTimer);
    root.dataset.state = "open";
    sync();
    return api;
  }

  function close() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      root.dataset.state = "closed";
      sync();
    }, 40);
    return api;
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault?.();
      root.dataset.state = "closed";
      sync();
    }
  }

  trigger?.addEventListener("mouseenter", open);
  trigger?.addEventListener("mouseleave", close);
  trigger?.addEventListener("focus", open);
  trigger?.addEventListener("blur", close);
  trigger?.addEventListener("keydown", onKeyDown);
  content?.addEventListener("mouseenter", open);
  content?.addEventListener("mouseleave", close);

  sync();

  function destroy() {
    clearTimeout(closeTimer);
    trigger?.removeEventListener("mouseenter", open);
    trigger?.removeEventListener("mouseleave", close);
    trigger?.removeEventListener("focus", open);
    trigger?.removeEventListener("blur", close);
    trigger?.removeEventListener("keydown", onKeyDown);
    content?.removeEventListener("mouseenter", open);
    content?.removeEventListener("mouseleave", close);
    delete root[KEY];
  }

  const api = { open, close, destroy };
  root[KEY] = api;
  return api;
}

