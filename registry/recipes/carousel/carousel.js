// @ui:controller carousel
// @ui:provides next prev goTo getIndex getCount destroy

import { ownParts } from "../../core/dom.js";

/**
 * carousel — a CSS scroll-snap strip with a deliberately tiny enhancement layer.
 *
 * CSS owns the sliding: `[data-part="viewport"]` scrolls on the inline axis with
 * `scroll-snap-type: inline mandatory`, and each `[data-part="slide"]` is a snap
 * target. That means the component is fully usable with this file absent —
 * swipe, wheel and (the viewport is `tabindex="0"`) the arrow keys all work.
 *
 * So the controller owns ONLY what CSS cannot:
 *
 *   • prev/next buttons and dots — inert markup that ships `hidden` and is
 *     un-hidden here, so a reader without JS never sees a dead control;
 *   • current-slide tracking by scroll math (no IntersectionObserver: one
 *     rAF-throttled `getBoundingClientRect` pass answers "which snap point are
 *     we on?" exactly, and works identically for programmatic and user scrolls);
 *   • the boundary contract — "stop" by default (the end button is `disabled`),
 *     "loop" when the root carries `data-loop`;
 *   • the `[data-part="status"]` live region ("Slide 2 of 3");
 *   • reduced motion — an explicit `behavior: "instant"` (which beats the CSS
 *     `scroll-behavior: smooth`) rather than an animated scroll.
 *
 * Scrolling always goes through the PHYSICAL delta `slide.left - viewport.left`
 * added to `scrollLeft`, which is correct in both LTR and RTL (where `scrollLeft`
 * runs negative). Only the "which slide is current?" comparison is
 * direction-aware, since the snap edge is `inline-start`.
 */
export function createCarousel(root) {
  // Prevent double-init.
  if (root._faqirCarousel) return root._faqirCarousel;

  const viewport = root.querySelector("[data-part='viewport']");
  if (!viewport) return null;

  const loop = root.hasAttribute("data-loop");
  // A carousel nested in a slide brings its own slides, buttons and dots:
  // slides are the viewport's children, the rest go through the owner guard.
  const slides = () => [...viewport.querySelectorAll(":scope > [data-part='slide']")];
  const dots = () => ownParts(root, "dot");
  const [prevBtn] = ownParts(root, "prev");
  const [nextBtn] = ownParts(root, "next");
  const [status] = ownParts(root, "status");
  const enhanced = [...ownParts(root, "controls"), ...ownParts(root, "dots")];

  let index = 0;

  // ── environment probes (read live, so preference changes are honored) ───────
  const reducedMotion = () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    !!window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const isRtl = () => {
    const cs = typeof getComputedStyle === "function" ? getComputedStyle(root) : null;
    return (cs && cs.direction) === "rtl";
  };

  const rectOf = (el) =>
    el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 0, right: 0 };

  /**
   * Per-slide geometry, measured against the viewport:
   *   `delta` — physical px to add to `scrollLeft` to bring the slide into view.
   *   `edge`  — signed distance on the snap (inline-start) edge; the slide whose
   *             |edge| is smallest is the current one.
   */
  function metrics() {
    const v = rectOf(viewport);
    const rtl = isRtl();
    return slides().map((s) => {
      const r = rectOf(s);
      return { delta: r.left - v.left, edge: rtl ? r.right - v.right : r.left - v.left };
    });
  }

  function nearestIndex() {
    let best = 0;
    let bestDistance = Infinity;
    metrics().forEach((m, i) => {
      const d = Math.abs(m.edge);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    return best;
  }

  /** Apply the boundary contract: wrap when `data-loop`, otherwise clamp. */
  function resolve(i, count) {
    if (!count) return 0;
    return loop ? ((i % count) + count) % count : Math.min(Math.max(i, 0), count - 1);
  }

  // ── reflection ──────────────────────────────────────────────────────────────
  function sync() {
    const count = slides().length;
    dots().forEach((d, i) => {
      const on = i === index;
      d.dataset.state = on ? "active" : "inactive";
      if (on) d.setAttribute("aria-current", "true");
      else d.removeAttribute("aria-current");
    });
    if (prevBtn) prevBtn.disabled = !loop && index <= 0;
    if (nextBtn) nextBtn.disabled = !loop && index >= count - 1;
    if (status) status.textContent = count ? `Slide ${index + 1} of ${count}` : "";
  }

  function setIndex(i) {
    if (i === index) return;
    index = i;
    sync();
    root.dispatchEvent(
      new CustomEvent("faqir:change", {
        bubbles: true,
        detail: { index, count: slides().length },
      }),
    );
  }

  // ── navigation ──────────────────────────────────────────────────────────────
  function goTo(i) {
    const list = slides();
    if (!list.length) return;
    const target = resolve(i, list.length);
    const m = metrics()[target];
    const left = (viewport.scrollLeft || 0) + (m ? m.delta : 0);
    const behavior = reducedMotion() ? "instant" : "smooth";
    if (typeof viewport.scrollTo === "function") viewport.scrollTo({ left, behavior });
    else viewport.scrollLeft = left;
    setIndex(target);
  }

  const next = () => goTo(index + 1);
  const prev = () => goTo(index - 1);

  // ── events ──────────────────────────────────────────────────────────────────
  function onClick(e) {
    // Matched by identity, so a nested carousel's buttons are not these. A
    // missing button is `undefined`, never equal to a `null` miss here.
    const btn = e.target.closest("[data-part]");
    const dot = dots().indexOf(btn);
    if (btn === nextBtn) next();
    else if (btn === prevBtn) prev();
    else if (dot >= 0) goTo(dot);
  }

  // One rAF-throttled measurement per scroll burst keeps tracking cheap.
  const schedule =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (fn) => setTimeout(fn, 16);
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    schedule(() => {
      ticking = false;
      setIndex(nearestIndex());
    });
  }

  // Enhance: the JS-only controls become visible now that JS is here.
  enhanced.forEach((el) => {
    el.hidden = false;
  });

  root.addEventListener("click", onClick);
  viewport.addEventListener("scroll", onScroll);
  sync();

  function destroy() {
    root.removeEventListener("click", onClick);
    viewport.removeEventListener("scroll", onScroll);
    // Back to the no-JS baseline: the inert controls hide again.
    enhanced.forEach((el) => {
      el.hidden = true;
    });
    delete root._faqirCarousel;
  }

  const api = { goTo, next, prev, getIndex: () => index, getCount: () => slides().length, destroy };
  root._faqirCarousel = api;
  return api;
}
