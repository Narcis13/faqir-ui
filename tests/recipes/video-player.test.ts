import { afterEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clock, createVideoPlayer, spoken } from "../../registry/recipes/video-player/video-player.js";

// happy-dom has no media pipeline, so every test drives a <video> whose media
// surface is stubbed on the instance: play()/pause(), the clock, volume, rate,
// buffered ranges and a captions track behave like a browser's and fire the
// same events. Mounted in a disposable container; never document.body itself.

const REF = join(import.meta.dir, "../../registry/recipes/video-player/video-player.html");
// The reference instance, with its (large) data: URIs swapped for stand-ins.
const MARKUP = (() => {
  const src = readFileSync(REF, "utf8").replace(/<!--[^]*?-->/g, "");
  const first = src.indexOf('<div data-ui="video-player"');
  const end = src.indexOf('<div data-ui="container"', first);
  return src
    .slice(first, end)
    .replace(/(src|poster)="data:[^"]*"/g, '$1="data:,"')
    .replace(/\s*<\/div>\s*$/, "");
})();

let box: HTMLElement | null = null;
const restore: Array<() => void> = [];
afterEach(() => {
  box?.remove();
  box = null;
  while (restore.length) restore.pop()!();
});

/** Define (or override) a property for the duration of one test. */
function stub(obj: any, key: string, value: unknown) {
  const own = Object.getOwnPropertyDescriptor(obj, key);
  Object.defineProperty(obj, key, { configurable: true, writable: true, value });
  restore.push(() => (own ? Object.defineProperty(obj, key, own) : delete obj[key]));
}

interface FakeTrack extends EventTarget {
  kind: string;
  mode: string;
  activeCues: Array<{ text: string }>;
}

function fakeMedia(video: HTMLVideoElement, duration = 12) {
  const fire = (type: string) => video.dispatchEvent(new Event(type));
  const s = {
    paused: true,
    ended: false,
    currentTime: 0,
    volume: 1,
    muted: false,
    playbackRate: 1,
    error: null as null | { code: number },
    ranges: [] as Array<[number, number]>,
    played: 0,
  };
  const prop = (key: keyof typeof s, event?: string, after?: () => void) =>
    Object.defineProperty(video, key, {
      configurable: true,
      get: () => s[key],
      set: (v) => {
        (s as any)[key] = v;
        after?.();
        if (event) fire(event);
      },
    });
  prop("paused");
  prop("ended");
  prop("error");
  prop("currentTime", "timeupdate", () => (s.ended = false));
  prop("volume", "volumechange");
  prop("muted", "volumechange");
  prop("playbackRate", "ratechange");
  Object.defineProperty(video, "duration", { configurable: true, get: () => duration });
  Object.defineProperty(video, "buffered", {
    configurable: true,
    get: () => ({ length: s.ranges.length, start: (i: number) => s.ranges[i][0], end: (i: number) => s.ranges[i][1] }),
  });
  (video as any).play = () => {
    s.played++;
    s.paused = false;
    s.ended = false;
    fire("play");
    fire("playing");
    return Promise.resolve();
  };
  (video as any).pause = () => {
    s.paused = true;
    fire("pause");
  };
  return { s, fire };
}

function fakeTrack(video: HTMLVideoElement): FakeTrack {
  const track = Object.assign(new EventTarget(), { kind: "captions", mode: "disabled", activeCues: [] as Array<{ text: string }> });
  const el = video.querySelector("track");
  if (el) Object.defineProperty(el, "track", { configurable: true, value: track });
  return track as FakeTrack;
}

function mount(opts: { track?: boolean; pip?: boolean; fullscreen?: boolean; markup?: string } = {}) {
  box = document.createElement("div");
  box.innerHTML = opts.markup ?? MARKUP;
  document.body.appendChild(box);
  const root = box.querySelector<HTMLElement>('[data-ui="video-player"]')!;
  const video = root.querySelector("video")!;
  if (opts.track === false) video.querySelector("track")?.remove();
  const media = fakeMedia(video);
  const track = opts.track === false ? null : fakeTrack(video);
  stub(document, "pictureInPictureEnabled", !!opts.pip);
  stub(document, "pictureInPictureElement", null);
  if (opts.pip) stub(video, "requestPictureInPicture", () => Promise.resolve());
  stub(document, "fullscreenEnabled", opts.fullscreen !== false);
  stub(document, "fullscreenElement", null);
  const fsCalls: Element[] = [];
  stub(root, "requestFullscreen", function (this: Element) {
    fsCalls.push(this);
    return Promise.resolve();
  });
  const api = createVideoPlayer(root)!;
  const part = (name: string) => root.querySelector<HTMLElement>(`[data-part="${name}"]`)!;
  return { root, video, api, part, track, fsCalls, ...media };
}

const key = (el: Element, k: string, init: KeyboardEventInit = {}) => {
  const ev = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(ev);
  return ev;
};
const click = (el: Element) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
const rect = (el: HTMLElement, width = 200) =>
  (el.getBoundingClientRect = () => ({ left: 0, top: 0, width, height: 16, right: width, bottom: 16, x: 0, y: 0, toJSON() {} }) as DOMRect);
const pointer = (el: Element, type: string, x: number) =>
  el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: 8, button: 0, pointerId: 1, bubbles: true, cancelable: true }));
const cssVar = (root: HTMLElement, name: string) => root.style.getPropertyValue(`--video-player-${name}`);

// ── pure helpers ─────────────────────────────────────────────────────────────

describe("video-player · time formatting", () => {
  it("clock() reads m:ss, and h:mm:ss past the hour", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(65.9)).toBe("1:05");
    expect(clock(600)).toBe("10:00");
    expect(clock(3725)).toBe("1:02:05");
    expect(clock(NaN)).toBe("0:00");
  });

  it("spoken() is what a screen reader should say", () => {
    expect(spoken(0)).toBe("0 seconds");
    expect(spoken(1)).toBe("1 second");
    expect(spoken(65)).toBe("1 minute 5 seconds");
    expect(spoken(180)).toBe("3 minutes");
    expect(spoken(3661)).toBe("1 hour 1 minute 1 second");
  });
});

// ── progressive enhancement ──────────────────────────────────────────────────

describe("video-player · native fallback", () => {
  it("takes over from the native controls on init", () => {
    expect(MARKUP).toContain("<video data-part=\"video\" controls");
    const { video, part } = mount();
    expect(video.hasAttribute("controls")).toBe(false);
    expect(part("controls").hidden).toBe(false);
    expect(part("big-play").hidden).toBe(false);
  });

  it("destroy() hands the video back to its native controls", () => {
    const { video, part, api, root } = mount();
    api.destroy();
    expect(video.hasAttribute("controls")).toBe(true);
    expect(part("controls").hidden).toBe(true);
    expect(part("big-play").hidden).toBe(true);
    expect((root as any)._faqirVideoPlayer).toBeUndefined();
  });
});

// ── playback state ───────────────────────────────────────────────────────────

describe("video-player · playback", () => {
  it("the play button and the big play button toggle, and labels follow", () => {
    const { root, part, s } = mount();
    expect(root.dataset.state).toBe("paused");
    click(part("big-play"));
    expect(s.paused).toBe(false);
    expect(root.dataset.state).toBe("playing");
    expect(part("play").getAttribute("aria-label")).toBe("Pause");
    click(part("play"));
    expect(root.dataset.state).toBe("paused");
    expect(part("play").getAttribute("aria-label")).toBe("Play");
  });

  it("the big play button hands its focus to the bar's play button as it hides", () => {
    const { part } = mount();
    part("big-play").focus();
    click(part("big-play"));
    expect(document.activeElement).toBe(part("play"));
  });

  it("a click on the picture plays and pauses", () => {
    const { root, video } = mount();
    click(video);
    expect(root.dataset.state).toBe("playing");
    click(video);
    expect(root.dataset.state).toBe("paused");
  });

  it("buffering, ended (Replay) and error states", () => {
    const { root, video, part, s, fire, api } = mount();
    const changes: string[] = [];
    root.addEventListener("faqir:change", (e) => changes.push((e as CustomEvent).detail.state));
    api.play();
    fire("waiting");
    expect(root.dataset.state).toBe("buffering");
    fire("playing");
    expect(root.dataset.state).toBe("playing");
    s.ended = true;
    s.paused = true;
    fire("ended");
    expect(root.dataset.state).toBe("ended");
    expect(part("play").getAttribute("aria-label")).toBe("Replay");
    click(part("big-play"));
    expect(root.dataset.state).toBe("playing");
    s.error = { code: 4 };
    fire("error");
    expect(root.dataset.state).toBe("error");
    expect(part("message").hidden).toBe(false);
    expect(changes).toEqual(["playing", "buffering", "playing", "ended", "playing", "error"]);
    expect(video).toBeDefined();
  });
});

// ── the scrubber ─────────────────────────────────────────────────────────────

describe("video-player · scrubber", () => {
  it("carries whole-second aria values and a spoken valuetext", () => {
    const m = mount();
    Object.defineProperty(m.video, "duration", { configurable: true, get: () => 185 });
    m.video.currentTime = 65;
    const sc = m.part("scrubber");
    expect(sc.getAttribute("role")).toBe("slider");
    expect(sc.getAttribute("aria-valuemax")).toBe("185");
    expect(sc.getAttribute("aria-valuenow")).toBe("65");
    expect(sc.getAttribute("aria-valuetext")).toBe("1 minute 5 seconds of 3 minutes 5 seconds");
    expect(m.part("elapsed").textContent).toBe("1:05");
    expect(m.part("duration").textContent).toBe("3:05");
    expect(cssVar(m.root, "progress")).toMatch(/^35\.1\d*%$/);
  });

  it("a press seeks to the pointer and a drag keeps seeking", () => {
    const { part, video } = mount();
    const sc = part("scrubber");
    rect(sc);
    pointer(sc, "pointerdown", 100);
    expect(video.currentTime).toBe(6);
    expect(sc.dataset.state).toBe("dragging");
    pointer(sc, "pointermove", 150);
    expect(video.currentTime).toBe(9);
    pointer(sc, "pointerup", 150);
    expect(sc.dataset.state).toBeUndefined();
  });

  it("hovering shows the time under the pointer", () => {
    const { part, root } = mount();
    const sc = part("scrubber");
    rect(sc);
    pointer(sc, "pointermove", 50);
    expect(part("tooltip").hidden).toBe(false);
    expect(part("tooltip").textContent).toBe("0:03");
    expect(cssVar(root, "hover")).toBe("25%");
    sc.dispatchEvent(new PointerEvent("pointerleave"));
    expect(part("tooltip").hidden).toBe(true);
  });

  it("paints the buffered range that covers the playhead", () => {
    const { s, fire, root, video } = mount();
    s.ranges = [[0, 3], [5, 9]];
    video.currentTime = 6;
    fire("progress");
    expect(cssVar(root, "buffered")).toBe("75%");
  });
});

// ── volume, rate, captions, PiP, fullscreen ──────────────────────────────────

describe("video-player · volume and mute", () => {
  it("the volume slider sets the volume by pointer; at zero it mutes", () => {
    const { part, video, root } = mount();
    const vol = part("volume");
    rect(vol, 100);
    pointer(vol, "pointerdown", 30);
    pointer(vol, "pointerup", 30);
    expect(video.volume).toBeCloseTo(0.3);
    expect(vol.getAttribute("aria-valuenow")).toBe("30");
    expect(vol.getAttribute("aria-valuetext")).toBe("30%");
    expect(cssVar(root, "volume")).toBe("30%");
    pointer(vol, "pointerdown", -20);
    expect(video.muted).toBe(true);
    expect(part("mute").getAttribute("aria-pressed")).toBe("true");
    expect(vol.getAttribute("aria-valuetext")).toBe("Muted");
  });

  it("the mute button toggles, and unmuting from zero restores a usable level", () => {
    const { part, video, api } = mount();
    click(part("mute"));
    expect(video.muted).toBe(true);
    click(part("mute"));
    expect(video.muted).toBe(false);
    api.setVolume(0);
    click(part("mute"));
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(0.5);
  });
});

describe("video-player · rate, captions, picture-in-picture, fullscreen", () => {
  it("the rate button cycles 1 → 1.25 → 1.5 → 2 → 0.5, labelled with its value", () => {
    const { part, video } = mount();
    const rate = part("rate");
    const seen = [];
    for (let i = 0; i < 5; i++) {
      click(rate);
      seen.push(video.playbackRate);
    }
    expect(seen).toEqual([1.25, 1.5, 2, 0.5, 0.75]);
    expect(rate.textContent).toBe("0.75×");
    expect(rate.getAttribute("aria-label")).toBe("Playback speed 0.75×");
  });

  it("captions start on for a default track and draw the active cue above the bar", () => {
    const { part, track } = mount();
    expect(track!.mode).toBe("hidden");
    expect(part("captions").getAttribute("aria-pressed")).toBe("true");
    track!.activeCues = [{ text: "First light <i>over</i> the ridge." }];
    track!.dispatchEvent(new Event("cuechange"));
    expect(part("cue").hidden).toBe(false);
    expect(part("cue").textContent).toBe("First light over the ridge.");
    click(part("captions"));
    expect(track!.mode).toBe("disabled");
    expect(part("captions").getAttribute("aria-pressed")).toBe("false");
    expect(part("cue").hidden).toBe(true);
  });

  it("the captions button is hidden when the video has no track", () => {
    const { part } = mount({ track: false });
    expect(part("captions").hidden).toBe(true);
  });

  it("picture-in-picture is hidden where unsupported and offered where it is", () => {
    expect(mount().part("pip").hidden).toBe(true);
    box!.remove();
    expect(mount({ pip: true }).part("pip").hidden).toBe(false);
  });

  it("fullscreen goes full screen on the player root", () => {
    const { part, root, fsCalls } = mount();
    expect(part("fullscreen").hidden).toBe(false);
    click(part("fullscreen"));
    expect(fsCalls).toEqual([root]);
    box!.remove();
    expect(mount({ fullscreen: false }).part("fullscreen").hidden).toBe(true);
  });
});

// ── keyboard ─────────────────────────────────────────────────────────────────

describe("video-player · keyboard shortcuts", () => {
  it("Space and K play-pause; arrows, J/L, Home/End and digits seek", () => {
    const { root, video } = mount();
    video.currentTime = 6;
    expect(key(root, " ").defaultPrevented).toBe(true);
    expect(root.dataset.state).toBe("playing");
    key(root, "k");
    expect(root.dataset.state).toBe("paused");
    key(root, "K");
    expect(root.dataset.state).toBe("playing");
    key(root, "ArrowRight");
    expect(video.currentTime).toBe(11);
    key(root, "ArrowLeft");
    expect(video.currentTime).toBe(6);
    key(root, "j");
    expect(video.currentTime).toBe(0);
    key(root, "l");
    expect(video.currentTime).toBe(10);
    key(root, "End");
    expect(video.currentTime).toBe(12);
    key(root, "Home");
    expect(video.currentTime).toBe(0);
    key(root, "5");
    expect(video.currentTime).toBe(6);
  });

  it("ArrowUp/Down set the volume, M mutes, C toggles captions, < and > change speed, F fullscreens", () => {
    const { root, video, track, fsCalls } = mount();
    video.volume = 0.5;
    key(root, "ArrowUp");
    expect(video.volume).toBeCloseTo(0.55);
    key(root, "ArrowDown");
    key(root, "ArrowDown");
    expect(video.volume).toBeCloseTo(0.45);
    key(root, "m");
    expect(video.muted).toBe(true);
    key(root, "c");
    expect(track!.mode).toBe("disabled");
    key(root, ">");
    key(root, ">");
    expect(video.playbackRate).toBe(1.5);
    key(root, "<");
    expect(video.playbackRate).toBe(1.25);
    key(root, "f");
    expect(fsCalls).toEqual([root]);
  });

  it("a slider owns the arrows: the volume slider changes volume, the scrubber seeks on ↑/↓", () => {
    const { part, video } = mount();
    video.volume = 0.5;
    video.currentTime = 6;
    key(part("volume"), "ArrowRight");
    expect(video.volume).toBeCloseTo(0.55);
    expect(video.currentTime).toBe(6);
    key(part("volume"), "End");
    expect(video.volume).toBe(1);
    key(part("volume"), "Home");
    expect(video.muted).toBe(true);
    key(part("scrubber"), "ArrowUp");
    expect(video.currentTime).toBe(11);
    key(part("scrubber"), "PageDown");
    expect(video.currentTime).toBe(1);
  });

  it("Space on a button is left to the button", () => {
    const { part, root } = mount();
    const ev = key(part("mute"), " ");
    expect(ev.defaultPrevented).toBe(false);
    expect(root.dataset.state).toBe("paused");
  });

  it("modified keys and keys it does not own pass through", () => {
    const { root } = mount();
    expect(key(root, "k", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key(root, "x").defaultPrevented).toBe(false);
    expect(key(root, "Tab").defaultPrevented).toBe(false);
  });

  it("announces what a shortcut did through the status region", () => {
    const { root, part } = mount();
    key(root, "m");
    expect(part("status").textContent).toBe("Muted");
    key(root, ">");
    expect(part("status").textContent).toBe("Speed 1.25×");
    key(root, "c");
    expect(part("status").textContent).toBe("Captions off");
    key(root, "l");
    expect(part("status").textContent).toBe("0:10");
  });
});

// ── auto-hide ────────────────────────────────────────────────────────────────

describe("video-player · auto-hiding controls", () => {
  it("hides the controls after idle playback, but never under keyboard focus", async () => {
    const { part, root, api } = mount();
    api.play();
    root.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 2650));
    expect(part("controls").dataset.state).toBe("hidden");
    root.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    expect(part("controls").dataset.state).toBeUndefined();

    // Keyboard focus inside: the timer runs out and the controls stay.
    part("play").focus();
    key(part("play"), "Tab");
    await new Promise((r) => setTimeout(r, 2650));
    expect(part("controls").dataset.state).toBeUndefined();

    // Pausing always brings them back.
    root.dispatchEvent(new PointerEvent("pointerleave"));
    api.pause();
    expect(part("controls").dataset.state).toBeUndefined();
  }, 10_000);
});

// ── lifecycle ────────────────────────────────────────────────────────────────

describe("video-player · lifecycle", () => {
  it("prevents double initialization", () => {
    const { root, api } = mount();
    expect(createVideoPlayer(root)).toBe(api);
  });

  it("destroy removes every listener", () => {
    const { root, part, api, s } = mount();
    api.destroy();
    click(part("play"));
    key(root, "k");
    expect(s.played).toBe(0);
  });
});
