import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { isInside } from "../../src/utils/paths";

const ROOT = join("/", "project");

describe("isInside — the one containment test for user-named paths", () => {
  it("holds the root itself and anything beneath it", () => {
    expect(isInside(ROOT, ".")).toBe(true);
    expect(isInside(ROOT, "ui/tokens")).toBe(true);
    expect(isInside(ROOT, join(ROOT, "out", "page.html"))).toBe(true);
    expect(isInside(ROOT, "a/../b")).toBe(true);
  });

  it("refuses a path that climbs out or lands elsewhere", () => {
    expect(isInside(ROOT, "..")).toBe(false);
    expect(isInside(ROOT, "../x")).toBe(false);
    expect(isInside(ROOT, "a/../../b")).toBe(false);
    expect(isInside(ROOT, join("/", "tmp", "x"))).toBe(false);
    expect(isInside(ROOT, join("/", "projectile"))).toBe(false);
  });

  it("does not mistake a child whose name begins with two dots for an escape", () => {
    expect(isInside(ROOT, "..foo")).toBe(true);
    expect(isInside(ROOT, "..foo/x.html")).toBe(true);
    expect(isInside(ROOT, "...")).toBe(true);
  });
});
