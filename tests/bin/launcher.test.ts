import { describe, expect, test } from "bun:test";
import { DIST_ENTRY, SRC_ENTRY, findBun, resolveLaunch } from "../../bin/launcher.mjs";

describe("launcher: findBun", () => {
  test("FAQIR_BUN override wins", () => {
    expect(findBun({ FAQIR_BUN: "/opt/bun/bin/bun" })).toBe("/opt/bun/bin/bun");
  });

  test("returns null when Bun is absent from PATH", () => {
    expect(findBun({ PATH: "/no/such/dir:/also/missing" })).toBeNull();
  });

  test("FAQIR_FORCE_NODE=1 simulates Bun being absent even if on PATH", () => {
    expect(findBun({ FAQIR_FORCE_NODE: "1", PATH: "/usr/bin:/bin" })).toBeNull();
  });
});

describe("launcher: resolveLaunch", () => {
  test("Bun absent + dist present → Node runs the compiled bundle", () => {
    const { runtime, entry } = resolveLaunch({ hasDist: true, bun: null });
    expect(runtime).toBe("node");
    expect(entry).toBe(DIST_ENTRY);
  });

  test("Bun present + dist present → Bun runs the compiled bundle", () => {
    const { runtime, entry } = resolveLaunch({ hasDist: true, bun: "/x/bun" });
    expect(runtime).toBe("/x/bun");
    expect(entry).toBe(DIST_ENTRY);
  });

  test("no dist + Bun present → Bun runs the TS source (dev flow)", () => {
    const { runtime, entry } = resolveLaunch({ hasDist: false, bun: "/x/bun" });
    expect(runtime).toBe("/x/bun");
    expect(entry).toBe(SRC_ENTRY);
  });

  test("no dist + no Bun → no runtime available", () => {
    expect(resolveLaunch({ hasDist: false, bun: null }).runtime).toBeNull();
  });
});
