// ═══════════════════════════════════════════════════════════════════════════
// pagination — controller contract  [task 0.4-20 · Controller tests C]
// ═══════════════════════════════════════════════════════════════════════════
//
// CONTRACT
//   • paginationWindow(current, total, {siblingCount, boundaryCount}) is a PURE
//     function returning the ordered list of items to render: page numbers
//     interleaved with the literal token "ellipsis". A gap of exactly one page
//     is never collapsed to an ellipsis (that single page is shown instead).
//     total <= 0 → []; current is clamped into [1, total].
//   • createPagination(root) drives a static or rendered nav:
//       - reads currentPage from [data-part='page'][data-state='active'] and
//         totalPages from the last page button on init;
//       - clicking a page button, or setPage(n)/prev/next, moves the active page
//         and emits a bubbling `faqir:page-change` CustomEvent { detail.page };
//       - moving to the SAME page is a no-op (no event);
//       - the active page carries data-state="active" + aria-current="page";
//         every other page button carries neither;
//       - prev is disabled iff current <= 1; next is disabled iff current >= total.
//   • render(current, total) rebuilds the numbered buttons + ellipsis spans from
//     paginationWindow (prev/next preserved) and is silent (no page-change).
//   • Double init returns the same api; destroy() unbinds every listener.

import { describe, it, expect, beforeEach } from "bun:test";
import {
  createPagination,
  paginationWindow,
} from "../../registry/recipes/pagination/pagination.js";

// A nav with a contiguous 1..n button run so prev/next/active all resolve to a
// real button (unlike the shipped html, which is sparse: 1 2 3 … 10).
function setupPages(activePage: number, total: number) {
  const buttons: string[] = [];
  for (let p = 1; p <= total; p++) {
    const active = p === activePage;
    buttons.push(
      `<button data-part="page" data-page="${p}"${
        active ? ' data-state="active" aria-current="page"' : ""
      }>${p}</button>`,
    );
  }
  document.body.innerHTML = `
    <div data-ui="pagination" data-size="md">
      <nav data-part="nav" role="navigation" aria-label="Pagination">
        <button data-part="prev" aria-label="Previous page">&laquo; Prev</button>
        ${buttons.join("\n        ")}
        <button data-part="next" aria-label="Next page">Next &raquo;</button>
      </nav>
    </div>`;
  const root = document.querySelector("[data-ui='pagination']") as HTMLElement;
  const api = createPagination(root);
  return { root, api };
}

function pageButtons(root: HTMLElement) {
  return [...root.querySelectorAll("[data-part='page']")] as HTMLButtonElement[];
}
function prev(root: HTMLElement) {
  return root.querySelector("[data-part='prev']") as HTMLButtonElement;
}
function next(root: HTMLElement) {
  return root.querySelector("[data-part='next']") as HTMLButtonElement;
}
function btn(root: HTMLElement, page: number) {
  return root.querySelector(`[data-part='page'][data-page='${page}']`) as HTMLButtonElement;
}

describe("paginationWindow (ellipsis window math)", () => {
  // ≥ 5 distinct shapes: few / many-start / many-middle / many-end / edges.
  it("shape 1 — single page", () => {
    expect(paginationWindow(1, 1)).toEqual([1]);
  });

  it("shape 2 — few pages: every page shown, no ellipsis", () => {
    expect(paginationWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginationWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("shape 3 — many, current at start: trailing ellipsis only", () => {
    expect(paginationWindow(1, 10)).toEqual([1, 2, 3, 4, 5, "ellipsis", 10]);
    expect(paginationWindow(2, 10)).toEqual([1, 2, 3, 4, 5, "ellipsis", 10]);
  });

  it("shape 4 — many, current in middle: ellipsis on both sides", () => {
    expect(paginationWindow(6, 10)).toEqual([1, "ellipsis", 5, 6, 7, "ellipsis", 10]);
  });

  it("shape 5 — many, current at end: leading ellipsis only", () => {
    expect(paginationWindow(10, 10)).toEqual([1, "ellipsis", 6, 7, 8, 9, 10]);
  });

  it("shape 6 — a one-page gap shows the page number, not an ellipsis", () => {
    // Between boundary page 1 and the sibling run [3,4,5] only page 2 is hidden;
    // a single hidden page is rendered as its number, while the 2-page gap on the
    // right (6,7) DOES collapse to a single "ellipsis".
    const win = paginationWindow(1, 8);
    expect(win).toEqual([1, 2, 3, 4, 5, "ellipsis", 8]);
    expect(win[1]).toBe(2); // page 2 shown in place of a would-be ellipsis
    expect(win.filter((x) => x === "ellipsis")).toHaveLength(1);
  });

  it("edges — total <= 0 yields an empty window", () => {
    expect(paginationWindow(1, 0)).toEqual([]);
    expect(paginationWindow(5, 0)).toEqual([]);
    expect(paginationWindow(1, -4)).toEqual([]);
  });

  it("edges — current is clamped into [1, total]", () => {
    expect(paginationWindow(0, 10)).toEqual(paginationWindow(1, 10));
    expect(paginationWindow(-3, 10)).toEqual(paginationWindow(1, 10));
    expect(paginationWindow(999, 10)).toEqual(paginationWindow(10, 10));
  });

  it("edges — two pages", () => {
    expect(paginationWindow(1, 2)).toEqual([1, 2]);
    expect(paginationWindow(2, 2)).toEqual([1, 2]);
  });

  it("respects siblingCount (wider window around current)", () => {
    expect(paginationWindow(5, 10, { siblingCount: 2 })).toEqual([
      1, 2, 3, 4, 5, 6, 7, "ellipsis", 10,
    ]);
  });

  it("respects boundaryCount (more pinned end pages)", () => {
    expect(paginationWindow(6, 12, { boundaryCount: 2 })).toEqual([
      1, 2, "ellipsis", 5, 6, 7, "ellipsis", 11, 12,
    ]);
  });

  it("first and last page are always present for large totals", () => {
    for (const current of [1, 25, 50, 99, 100]) {
      const win = paginationWindow(current, 100);
      expect(win[0]).toBe(1);
      expect(win[win.length - 1]).toBe(100);
      // current itself is always visible
      expect(win).toContain(Math.min(Math.max(current, 1), 100));
    }
  });

  it("never emits two ellipses in a row and stays monotonic", () => {
    for (let total = 1; total <= 40; total++) {
      for (let current = 1; current <= total; current++) {
        const win = paginationWindow(current, total);
        let lastNum = 0;
        let prevWasEllipsis = false;
        for (const item of win) {
          if (item === "ellipsis") {
            expect(prevWasEllipsis).toBe(false); // no "… …"
            prevWasEllipsis = true;
          } else {
            expect(item).toBeGreaterThan(lastNum); // strictly increasing
            lastNum = item as number;
            prevWasEllipsis = false;
          }
        }
      }
    }
  });
});

describe("pagination controller", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("reads current page + total from the initial DOM", () => {
    const { api } = setupPages(3, 8);
    expect(api.getPage()).toBe(3);
  });

  it("clicking a page button activates it", () => {
    const { root, api } = setupPages(1, 5);
    btn(root, 4).click();
    expect(api.getPage()).toBe(4);
    expect(btn(root, 4).dataset.state).toBe("active");
  });

  it("active page has aria-current=page; others do not", () => {
    const { root } = setupPages(1, 5);
    btn(root, 3).click();
    expect(btn(root, 3).getAttribute("aria-current")).toBe("page");
    for (const p of [1, 2, 4, 5]) {
      expect(btn(root, p).hasAttribute("aria-current")).toBe(false);
      expect(btn(root, p).dataset.state).toBeUndefined();
    }
  });

  it("emits a bubbling faqir:page-change with the new page on click", () => {
    const { root } = setupPages(1, 5);
    const seen: number[] = [];
    // listen on document to prove the event bubbles out of the root
    document.addEventListener(
      "faqir:page-change",
      (e) => seen.push((e as CustomEvent).detail.page),
      { once: true },
    );
    btn(root, 2).click();
    expect(seen).toEqual([2]);
  });

  it("setPage emits page-change and moves the active state", () => {
    const { root, api } = setupPages(1, 5);
    let events = 0;
    let last = -1;
    root.addEventListener("faqir:page-change", (e) => {
      events++;
      last = (e as CustomEvent).detail.page;
    });
    api.setPage(4);
    expect(events).toBe(1);
    expect(last).toBe(4);
    expect(btn(root, 4).getAttribute("aria-current")).toBe("page");
  });

  it("moving to the SAME page is a no-op (no event)", () => {
    const { root, api } = setupPages(3, 5);
    let events = 0;
    root.addEventListener("faqir:page-change", () => events++);
    api.setPage(3);
    expect(events).toBe(0);
    expect(api.getPage()).toBe(3);
  });

  it("setPage clamps below 1 and above total", () => {
    const { root, api } = setupPages(3, 5);
    api.setPage(-2);
    expect(api.getPage()).toBe(1);
    api.setPage(99);
    expect(api.getPage()).toBe(5);
    expect(btn(root, 5).getAttribute("aria-current")).toBe("page");
  });

  it("prev is disabled on the first page, next on the last page", () => {
    const first = setupPages(1, 5);
    expect(prev(first.root).disabled).toBe(true);
    expect(next(first.root).disabled).toBe(false);

    document.body.innerHTML = "";
    const last = setupPages(5, 5);
    expect(prev(last.root).disabled).toBe(false);
    expect(next(last.root).disabled).toBe(true);

    document.body.innerHTML = "";
    const middle = setupPages(3, 5);
    expect(prev(middle.root).disabled).toBe(false);
    expect(next(middle.root).disabled).toBe(false);
  });

  it("boundary disabled state updates as the page changes", () => {
    const { root, api } = setupPages(3, 5);
    api.setPage(1);
    expect(prev(root).disabled).toBe(true);
    api.setPage(5);
    expect(prev(root).disabled).toBe(false);
    expect(next(root).disabled).toBe(true);
  });

  it("prev/next buttons navigate one page", () => {
    const { root, api } = setupPages(3, 5);
    next(root).click();
    expect(api.getPage()).toBe(4);
    prev(root).click();
    expect(api.getPage()).toBe(3);
  });

  it("clicking a disabled next at the last page does not advance", () => {
    const { root, api } = setupPages(5, 5);
    next(root).click();
    expect(api.getPage()).toBe(5);
  });

  it("setTotal clamps a current page that now exceeds the total", () => {
    const { api } = setupPages(5, 5);
    api.setTotal(3);
    expect(api.getPage()).toBe(3);
  });

  describe("render() — dynamic buttons from the windowing math", () => {
    it("rebuilds numbered buttons + ellipsis spans for the window", () => {
      const { root, api } = setupPages(1, 3);
      api.render(6, 10);
      const pages = pageButtons(root).map((b) => b.dataset.page);
      // window(6,10) = [1, …, 5, 6, 7, …, 10]
      expect(pages).toEqual(["1", "5", "6", "7", "10"]);
      expect(root.querySelectorAll("[data-part='ellipsis']").length).toBe(2);
    });

    it("marks the current page active with aria-current after render", () => {
      const { root, api } = setupPages(1, 3);
      api.render(6, 10);
      expect(btn(root, 6).getAttribute("aria-current")).toBe("page");
      expect(btn(root, 6).dataset.state).toBe("active");
      expect(api.getPage()).toBe(6);
    });

    it("keeps prev/next and wires their disabled state to the rendered page", () => {
      const { root, api } = setupPages(1, 3);
      api.render(1, 10);
      expect(prev(root).disabled).toBe(true);
      expect(next(root).disabled).toBe(false);
      api.render(10, 10);
      expect(prev(root).disabled).toBe(false);
      expect(next(root).disabled).toBe(true);
    });

    it("render() itself emits no page-change, but rendered buttons still click", () => {
      const { root, api } = setupPages(1, 3);
      let events = 0;
      let last = -1;
      root.addEventListener("faqir:page-change", (e) => {
        events++;
        last = (e as CustomEvent).detail.page;
      });
      api.render(6, 10);
      expect(events).toBe(0); // render is silent
      btn(root, 7).click(); // a freshly-created button, via delegated handler
      expect(events).toBe(1);
      expect(last).toBe(7);
    });

    it("ellipsis spans are inert (not page buttons)", () => {
      const { root, api } = setupPages(1, 3);
      api.render(6, 10);
      const ell = root.querySelector("[data-part='ellipsis']") as HTMLElement;
      expect(ell.tagName).toBe("SPAN");
      expect(ell.textContent).toBe("…");
    });
  });

  it("nav exposes the pagination a11y contract", () => {
    const { root } = setupPages(1, 5);
    const nav = root.querySelector("[data-part='nav']")!;
    expect(nav.getAttribute("role")).toBe("navigation");
    expect(nav.getAttribute("aria-label")).toBe("Pagination");
    expect(prev(root).getAttribute("aria-label")).toBe("Previous page");
    expect(next(root).getAttribute("aria-label")).toBe("Next page");
  });

  it("prevents double initialization", () => {
    const { root, api } = setupPages(1, 5);
    const again = createPagination(root);
    expect(again).toBe(api);
  });

  it("destroy unbinds the click listeners", () => {
    const { root, api } = setupPages(1, 5);
    api.destroy();
    btn(root, 3).click();
    // no controller left to move the active page
    expect(btn(root, 3).dataset.state).toBeUndefined();
    expect((root as any)._faqirPagination).toBeUndefined();
  });
});
