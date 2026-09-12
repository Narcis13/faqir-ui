// ═══════════════════════════════════════════════════════════════════════════
// `.faqir-dreams/queue.json` — what the shift is going to dream  [task 1.1N-01]
// ═══════════════════════════════════════════════════════════════════════════
//
// The queue is hand-edited by whoever is filling the shift, which sets what the
// validator has to be good at: reporting EVERY problem rather than the first
// (being told about one typo per run is how a five-typo edit takes five runs)
// and refusing an id that would be safe in JSON and unsafe as a branch name.
//
// The status machine is small enough to state in full, so it is asserted in
// full — every legal move and every illegal one — rather than sampled. Its one
// non-obvious rule is that `kept` and `discarded` are terminal: a brief worth
// another attempt is a NEW brief, because the ledger row for the first attempt
// has to keep meaning what it said.
//
// The twelve shipped briefs are checked here too. A queue seeded with briefs
// that aim at regions the 24 themes already occupy is a queue that generates
// discards all night, so the last describe measures each brief's hint against
// what actually ships rather than trusting the prose in it.

import { describe, expect, it, beforeAll, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadQueue, ROOT, type Queue, type QueueModule } from "./load";

let queueMod: QueueModule;
beforeAll(async () => {
  queueMod = await loadQueue();
});

const temps: string[] = [];
function tempQueue(queue: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "faqir-queue-"));
  temps.push(dir);
  const path = join(dir, "queue.json");
  writeFileSync(path, JSON.stringify(queue, null, 2) + "\n");
  return path;
}
afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

function brief(overrides: Record<string, unknown> = {}) {
  return {
    id: "arcade",
    kind: "theme",
    brief: "A cabinet in a dark room: magenta light, everything a lozenge.",
    added: "2026-09-12",
    status: "pending",
    ...overrides,
  };
}

const queueOf = (...briefs: ReturnType<typeof brief>[]): Queue =>
  ({ version: 1, briefs }) as unknown as Queue;

describe("the schema", () => {
  it("accepts a minimal valid queue, and an empty one", () => {
    expect(queueMod.validateQueue(queueOf(brief()))).toEqual([]);
    expect(queueMod.validateQueue({ version: 1, briefs: [] })).toEqual([]);
  });

  it("refuses anything that is not an object", () => {
    for (const value of [null, [], "queue", 7]) {
      expect(queueMod.validateQueue(value).length).toBeGreaterThan(0);
    }
  });

  it("pins the version, so a shape change cannot be read as the old shape", () => {
    const errors = queueMod.validateQueue({ version: 2, briefs: [] });
    expect(errors.map((e) => e.field)).toEqual(["version"]);
  });

  it("refuses an id that would be unsafe as a branch name or a filename", () => {
    for (const id of ["Arcade", "arcade theme", "../escape", "arcade/", "-arcade", ""]) {
      const errors = queueMod.validateQueue(queueOf(brief({ id })));
      expect(errors.some((e) => e.field === "briefs[0].id"), id).toBe(true);
    }
  });

  it("refuses a duplicate id, because ids address ledger rows", () => {
    const errors = queueMod.validateQueue(queueOf(brief(), brief()));
    expect(errors.some((e) => /duplicate id/.test(e.message))).toBe(true);
  });

  it("refuses a label where a brief belongs", () => {
    // The dream is written FROM this text. "dark theme" is not something an
    // agent can choose fourteen axes from.
    const errors = queueMod.validateQueue(queueOf(brief({ brief: "dark theme" })));
    expect(errors.some((e) => e.field === "briefs[0].brief")).toBe(true);
  });

  it("refuses a kind outside §10.3's six, and accepts all six", () => {
    expect(queueMod.validateQueue(queueOf(brief({ kind: "wallpaper" }))).length).toBe(1);
    for (const kind of queueMod.QUEUE_KINDS) {
      expect(queueMod.validateQueue(queueOf(brief({ kind }))), kind).toEqual([]);
    }
  });

  it("refuses a status outside the machine and a date that is not ISO", () => {
    expect(queueMod.validateQueue(queueOf(brief({ status: "maybe" }))).length).toBe(1);
    expect(queueMod.validateQueue(queueOf(brief({ added: "12 Sep 2026" }))).length).toBe(1);
  });

  it("accepts an axes_hint object and refuses a non-object one", () => {
    expect(queueMod.validateQueue(queueOf(brief({ axes_hint: { depth: "hard" } })))).toEqual([]);
    expect(queueMod.validateQueue(queueOf(brief({ axes_hint: "hard" }))).length).toBe(1);
  });

  it("reports every problem at once, not the first", () => {
    const errors = queueMod.validateQueue(queueOf(brief({ id: "BAD", kind: "x", brief: "no", added: "x", status: "x" })));
    expect(errors.map((e) => e.field).sort()).toEqual([
      "briefs[0].added",
      "briefs[0].brief",
      "briefs[0].id",
      "briefs[0].kind",
      "briefs[0].status",
    ]);
  });

  it("readQueue names the file and every problem in one throw", () => {
    const path = tempQueue(queueOf(brief({ id: "BAD", kind: "x" })));
    expect(() => queueMod.readQueue(path)).toThrow(/briefs\[0\]\.id[\s\S]*briefs\[0\]\.kind/);
  });

  it("writeQueue refuses to write an invalid queue", () => {
    const path = tempQueue(queueOf(brief()));
    const before = readFileSync(path, "utf8");
    expect(() => queueMod.writeQueue(path, queueOf(brief({ status: "maybe" })))).toThrow(/Refusing/);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("round-trips through write and read", () => {
    const path = tempQueue({ version: 1, briefs: [] });
    const original = queueOf(brief({ axes_hint: { depth: "hard" } }), brief({ id: "moss" }));
    queueMod.writeQueue(path, original);
    expect(queueMod.readQueue(path)).toEqual(original);
  });
});

describe("pick order", () => {
  it("takes the first pending brief in file order", () => {
    const queue = queueOf(
      brief({ id: "first", status: "kept" }),
      brief({ id: "second" }),
      brief({ id: "third" }),
    );
    expect(queueMod.pickNext(queue)?.id).toBe("second");
  });

  it("skips a brief of another kind when a kind is named", () => {
    const queue = queueOf(brief({ id: "gap", kind: "component" }), brief({ id: "arcade" }));
    expect(queueMod.pickNext(queue, "theme")?.id).toBe("arcade");
    expect(queueMod.pickNext(queue, "component")?.id).toBe("gap");
  });

  it("returns null on an exhausted queue — a quiet night is not an error", () => {
    expect(queueMod.pickNext(queueOf(brief({ status: "kept" })))).toBeNull();
    expect(queueMod.pickNext({ version: 1, briefs: [] } as unknown as Queue)).toBeNull();
  });

  it("never picks a brief a run is already holding", () => {
    expect(queueMod.pickNext(queueOf(brief({ status: "dreaming" })))).toBeNull();
  });

  it("findBrief addresses one by id", () => {
    const queue = queueOf(brief({ id: "arcade" }), brief({ id: "moss" }));
    expect(queueMod.findBrief(queue, "moss")?.id).toBe("moss");
    expect(queueMod.findBrief(queue, "nothing")).toBeNull();
  });
});

describe("status transitions", () => {
  it("allows exactly the moves the machine draws", () => {
    for (const [from, targets] of Object.entries(queueMod.QUEUE_TRANSITIONS)) {
      for (const to of queueMod.QUEUE_STATUSES) {
        const b = brief({ status: from });
        if (targets.includes(to)) {
          expect(() => queueMod.transition(b, to), `${from} → ${to}`).not.toThrow();
          expect(b.status).toBe(to);
        } else {
          expect(() => queueMod.transition(b, to), `${from} → ${to}`).toThrow();
          expect(b.status).toBe(from);
        }
      }
    }
  });

  it("says so when the refusal is because the status is terminal", () => {
    for (const terminal of queueMod.QUEUE_TERMINAL) {
      expect(() => queueMod.transition(brief({ status: terminal }), "pending")).toThrow(
        /terminal\. A brief worth another attempt is a new brief/,
      );
    }
  });

  it("refuses a status that is not a status at all", () => {
    expect(() => queueMod.transition(brief(), "asleep")).toThrow(/is not a dream status/);
  });

  it("releases what a crashed run left dreaming, and names what it released", () => {
    const queue = queueOf(
      brief({ id: "crashed", status: "dreaming" }),
      brief({ id: "done", status: "kept" }),
      brief({ id: "waiting" }),
    );
    expect(queueMod.releaseStale(queue)).toEqual(["crashed"]);
    expect(queue.briefs.map((b) => b.status)).toEqual(["pending", "kept", "pending"]);
    expect(queueMod.releaseStale(queue)).toEqual([]);
  });

  it("summarises the queue by status", () => {
    const queue = queueOf(brief({ id: "a" }), brief({ id: "b" }), brief({ id: "c", status: "kept" }));
    expect(queueMod.queueSummary(queue)).toEqual({ pending: 2, dreaming: 0, kept: 1, discarded: 0 });
  });
});

describe("the seeded queue", () => {
  const queue = () => queueMod.readQueue(join(ROOT, ".faqir-dreams", "queue.json"));

  it("validates, and holds the twelve briefs the task asked for", () => {
    const q = queue();
    expect(queueMod.validateQueue(q)).toEqual([]);
    expect(q.briefs.length).toBe(12);
    expect(q.briefs.every((b) => b.kind === "theme")).toBe(true);
    expect(q.briefs.every((b) => b.status === "pending")).toBe(true);
  });

  it("names no theme that already ships", () => {
    const shipped = new Set(
      readdirSync(join(ROOT, "registry", "themes"))
        .filter((f) => f.endsWith(".css"))
        .map((f) => f.replace(/\.css$/, "")),
    );
    for (const b of queue().briefs) {
      expect(shipped.has(b.id), `${b.id} already ships`).toBe(false);
    }
  });

  it("aims every brief at a region the 24 shipped themes leave empty", () => {
    // The queue's whole job. A brief whose hint matches a shipped theme on every
    // leaf it states is a brief the generator will refuse before it writes — a
    // guaranteed discard, and twelve of those is a wasted fortnight. So each
    // hint is measured against every shipped axis block: it has to differ from
    // ALL of them on at least three of the leaves it actually states.
    const manifests = readdirSync(join(ROOT, "registry", "themes"))
      .filter((f) => f.endsWith(".theme.json"))
      .map((f) => JSON.parse(readFileSync(join(ROOT, "registry", "themes", f), "utf8")))
      .filter((m) => m.axes);

    const leaves = (value: unknown, prefix = ""): [string, unknown][] =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
            leaves(v, prefix ? `${prefix}.${k}` : k),
          )
        : [[prefix, value]];
    const at = (axes: Record<string, unknown>, path: string) =>
      path.split(".").reduce<unknown>((cur, key) => (cur as Record<string, unknown>)?.[key], axes);

    for (const b of queue().briefs) {
      const stated = leaves(b.axes_hint ?? {}).filter(([path]) => path && path !== "accent" && path !== "document");
      expect(stated.length, `${b.id} states no axes`).toBeGreaterThanOrEqual(4);
      const closest = Math.min(
        ...manifests.map((m) => stated.filter(([path, value]) => at(m.axes, path) !== value).length),
      );
      expect(closest, `${b.id} differs from its nearest shipped theme on only ${closest} stated axes`).toBeGreaterThanOrEqual(3);
    }
  });

  it("never asks for a corner shape a zero radius cannot draw", () => {
    // Measured in 1.1A-16: at `border-radius: 0` a filled box is pixel-identical
    // under round, bevel, scoop and notch. A brief pairing `shape.corner` with
    // `shape.radius: "sharp"` is asking for an axis nothing draws.
    for (const b of queue().briefs) {
      const shape = (b.axes_hint?.shape ?? {}) as Record<string, string>;
      if (shape.corner && shape.corner !== "round") {
        expect(shape.radius, `${b.id} asks for a ${shape.corner} corner`).toBeDefined();
        expect(shape.radius, `${b.id} asks for a ${shape.corner} corner at radius ${shape.radius}`).not.toBe("sharp");
      }
    }
  });

  it("never asks for a double divider, which no shipped border width can draw", () => {
    // 1.1A-26: `separator` draws its rule as `var(--border-width) var(--divider-style)`,
    // so under anything below 3px a double rule paints as one solid line. The
    // gauntlet refuses it; a brief that asks for it is a scheduled discard.
    for (const b of queue().briefs) {
      const decoration = (b.axes_hint?.decoration ?? {}) as Record<string, string>;
      expect(decoration.divider, b.id).not.toBe("double");
    }
  });

  it("never asks for small-caps, which has no legal spelling yet", () => {
    // 1.1A-25: `--heading-transform` is consumed as `text-transform`, and
    // `small-caps` is a `font-variant-caps` value — the browser drops the
    // declaration and the heading renders unchanged. A silent no-op.
    for (const b of queue().briefs) {
      const voice = ((b.axes_hint?.type as Record<string, unknown>)?.voice ?? {}) as Record<string, string>;
      expect(voice.transform, b.id).not.toBe("small-caps");
    }
  });
});
