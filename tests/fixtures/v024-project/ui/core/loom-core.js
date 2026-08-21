// The v0.2.4 reactive engine, as `loom init` installed it.
//
// This fixture ships a stand-in rather than the 114 KB original: what the
// migration moves is the file name and the global it publishes, and a project
// whose page loads `loom-core.js` and reads `window.Loom` is exactly as stuck
// with two bytes as with a hundred thousand. `faqir init --force` writes the
// real `faqir-core.js` beside it; deleting this file is a documented step.
(function (global) {
  const Loom = { version: "0.2.4" };
  if (typeof globalThis !== "undefined") globalThis.Loom = Loom;
  return Loom;
})(typeof globalThis !== "undefined" ? globalThis : self);
