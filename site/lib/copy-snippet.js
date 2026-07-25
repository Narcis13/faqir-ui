/* Copy-for-agents wiring — task 0.7-15 (FAQIR-PLAN §13).
 *
 * One button, one job: put the standalone snippet shown on the page onto the
 * clipboard. The payload is the `textContent` of the <code> block the button
 * names, so what is copied is exactly what is displayed and exactly what
 * `snippets/<layer>/<name>.html.txt` contains — there is no second copy of it
 * in this file, and nothing is fetched.
 *
 * Progressive by construction: with no JavaScript, no clipboard permission, or
 * on `file://` (where `navigator.clipboard` is unavailable outside a secure
 * context), the snippet is still on the page to select and still linked as a
 * file. The failure path selects the text rather than pretending it worked.
 */
(function () {
  "use strict";

  function announce(button, message) {
    var status = document.getElementById(button.getAttribute("data-copy-status") || "");
    if (status) status.textContent = message;
  }

  /** Select the snippet so the reader can copy it by hand. */
  function selectSource(source) {
    var selection = window.getSelection && window.getSelection();
    if (!selection || !document.createRange) return false;
    var range = document.createRange();
    range.selectNodeContents(source);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function copy(button) {
    var source = document.getElementById(button.getAttribute("data-copy-snippet") || "");
    if (!source) return;
    var text = source.textContent || "";

    var fallback = function () {
      announce(
        button,
        selectSource(source)
          ? "Selected — press Ctrl/Cmd+C to copy."
          : "Copying is unavailable here — use the raw file link.",
      );
    };

    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      fallback();
      return;
    }
    navigator.clipboard.writeText(text).then(function () {
      announce(button, "Copied " + text.length + " characters — paste into an empty .html file.");
    }, fallback);
  }

  function start() {
    var buttons = document.querySelectorAll("[data-copy-snippet]");
    for (var i = 0; i < buttons.length; i++) {
      (function (button) {
        button.addEventListener("click", function () {
          copy(button);
        });
      })(buttons[i]);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
