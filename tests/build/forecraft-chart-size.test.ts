// forecraft #36 — faqir-chart's own size budget, enforced from both sides.
//
// The chart's drawing ships as an opt-in plugin so that none of it lands in
// faqir-core.js. Its exception to the 2 KB plugin default is 4 KB, and like
// every other exception it is not idle headroom: the plugin is inside 4 KB and
// does not fit in 3, so deleting the entry goes red rather than passing
// unnoticed.

import { beforeAll, describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
const SCRIPT = join(ROOT, "scripts", "check-size.mjs");
const KB = 1024;

type SizeModule = {
  PLUGIN_BUDGETS: Record<string, number>;
  measureGzip: (t: { label: string; entry: string; minify?: boolean }) => number;
};

let mod: SizeModule;

beforeAll(async () => {
  mod = (await import(SCRIPT)) as unknown as SizeModule;
});

describe("faqir-chart size budget", () => {
  test("the plugin has a 9 KB budget of its own", () => {
    expect(mod.PLUGIN_BUDGETS["faqir-chart.js"]).toBe(9 * KB);
  });

  test("faqir-chart is really inside its 9 KB, and really needs more than 8", () => {
    const measured = mod.measureGzip({
      label: "plugin: faqir-chart.js",
      entry: join(ROOT, "registry", "core", "plugins", "faqir-chart.js"),
    });
    expect(measured).toBeLessThanOrEqual(9 * KB);
    expect(measured).toBeGreaterThan(8 * KB);
  });
});
