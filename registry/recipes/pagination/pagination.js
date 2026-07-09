// @ui:controller pagination
// @ui:provides setPage getPage setTotal destroy

export function createPagination(root) {
  // Prevent double-init
  if (root._faqirPagination) return root._faqirPagination;

  const nav = root.querySelector("[data-part='nav']");
  const prevBtn = root.querySelector("[data-part='prev']");
  const nextBtn = root.querySelector("[data-part='next']");

  let currentPage = 1;
  let totalPages = 1;

  // Initialize from existing DOM
  const activeBtn = root.querySelector("[data-part='page'][data-state='active']");
  if (activeBtn) {
    currentPage = parseInt(activeBtn.dataset.page, 10) || 1;
  }

  const allPageBtns = root.querySelectorAll("[data-part='page']");
  if (allPageBtns.length > 0) {
    const lastBtn = allPageBtns[allPageBtns.length - 1];
    totalPages = parseInt(lastBtn.dataset.page, 10) || 1;
  }

  function getPageButtons() {
    return [...root.querySelectorAll("[data-part='page']")];
  }

  function updateActiveState() {
    getPageButtons().forEach((btn) => {
      const page = parseInt(btn.dataset.page, 10);
      if (page === currentPage) {
        btn.dataset.state = "active";
        btn.setAttribute("aria-current", "page");
      } else {
        delete btn.dataset.state;
        btn.removeAttribute("aria-current");
      }
    });

    // Update prev/next disabled state
    if (prevBtn) {
      prevBtn.disabled = currentPage <= 1;
    }
    if (nextBtn) {
      nextBtn.disabled = currentPage >= totalPages;
    }
  }

  function emitPageChange() {
    root.dispatchEvent(
      new CustomEvent("faqir:page-change", {
        detail: { page: currentPage },
        bubbles: true,
      })
    );
  }

  function setPage(n) {
    const page = Math.max(1, Math.min(n, totalPages));
    if (page === currentPage) return;
    currentPage = page;
    updateActiveState();
    emitPageChange();
  }

  function getPage() {
    return currentPage;
  }

  function setTotal(n) {
    totalPages = Math.max(1, n);
    if (currentPage > totalPages) {
      currentPage = totalPages;
    }
    updateActiveState();
  }

  // Event: click on page button
  function onNavClick(e) {
    const pageBtn = e.target.closest("[data-part='page']");
    if (pageBtn) {
      const page = parseInt(pageBtn.dataset.page, 10);
      if (!isNaN(page)) {
        setPage(page);
      }
      return;
    }
  }

  function onPrevClick() {
    if (currentPage > 1) {
      setPage(currentPage - 1);
    }
  }

  function onNextClick() {
    if (currentPage < totalPages) {
      setPage(currentPage + 1);
    }
  }

  nav?.addEventListener("click", onNavClick);
  prevBtn?.addEventListener("click", onPrevClick);
  nextBtn?.addEventListener("click", onNextClick);

  // Initialize disabled states
  updateActiveState();

  function destroy() {
    nav?.removeEventListener("click", onNavClick);
    prevBtn?.removeEventListener("click", onPrevClick);
    nextBtn?.removeEventListener("click", onNextClick);
    delete root._faqirPagination;
  }

  const api = { setPage, getPage, setTotal, destroy };
  root._faqirPagination = api;
  return api;
}
