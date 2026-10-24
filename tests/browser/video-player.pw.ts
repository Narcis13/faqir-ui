/**
 * video-player in a real engine, playing the reference page's own data: clip.
 *
 * happy-dom has no media pipeline — the Bun suite stubs the media element. This
 * plays the real twelve-second VP8 clip with its data:text/vtt captions track:
 * real decoding, real timeupdate, real cue changes, a real pointer on the
 * scrubber and a real keyboard, and the no-script fallback to native controls.
 *
 * Run: `npx playwright test --config=playwright.browser.config.ts video-player`
 */

import { test, expect, type Page } from "@playwright/test";
import { liveReferencePage } from "./harness";

const PAGE = liveReferencePage("registry/recipes/video-player/video-player.html");
const PLAYER = '[data-ui="video-player"][aria-label="A Day in the Valley"]';
const part = (name: string) => `${PLAYER} [data-part="${name}"]`;

const media = (page: Page) =>
  page.evaluate((sel) => {
    const v = document.querySelector(`${sel} video`) as HTMLVideoElement;
    return { t: v.currentTime, d: v.duration, paused: v.paused, muted: v.muted, volume: v.volume, rate: v.playbackRate, controls: v.controls };
  }, PLAYER);

async function ready(page: Page) {
  await page.waitForFunction((sel) => (document.querySelector(`${sel} video`) as HTMLVideoElement).readyState >= 1, PLAYER);
}

test.describe("video-player · live", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(PAGE, { waitUntil: "load" });
    await ready(page);
  });

  test("takes over from the native controls, and destroy() gives them back", async ({ page }) => {
    expect((await media(page)).controls).toBe(false);
    await expect(page.locator(part("controls"))).toBeVisible();
    await expect(page.locator(part("duration"))).toHaveText("0:12");
    await page.evaluate((sel) => (document.querySelector(sel) as any)._faqirVideoPlayer.destroy(), PLAYER);
    expect((await media(page)).controls).toBe(true);
    await expect(page.locator(part("controls"))).toBeHidden();
  });

  test("plays the data: clip for real, and pauses", async ({ page }) => {
    await page.evaluate((sel) => ((document.querySelector(`${sel} video`) as HTMLVideoElement).muted = true), PLAYER);
    await page.locator(part("big-play")).click();
    await expect(page.locator(PLAYER)).toHaveAttribute("data-state", "playing");
    await expect(page.locator(part("play"))).toHaveAccessibleName("Pause");
    await expect.poll(async () => (await media(page)).t, { timeout: 8000 }).toBeGreaterThan(1.2);
    const progress = await page.evaluate(
      (sel) => parseFloat((document.querySelector(sel) as HTMLElement).style.getPropertyValue("--video-player-progress")),
      PLAYER,
    );
    expect(progress).toBeGreaterThan(5);
    await page.keyboard.press("k");
    await expect(page.locator(PLAYER)).toHaveAttribute("data-state", "paused");
    expect((await media(page)).paused).toBe(true);
  });

  test("the scrubber: hover time at the pointer, click to seek, keyboard to step", async ({ page }) => {
    const box = (await page.locator(part("scrubber")).boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await expect(page.locator(part("tooltip"))).toBeVisible();
    await expect(page.locator(part("tooltip"))).toHaveText("0:06");
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
    await expect(page.locator(part("tooltip"))).toHaveText("0:03");

    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
    await expect.poll(async () => (await media(page)).t).toBeCloseTo(6, 0);
    const scrubber = page.getByRole("slider", { name: "Seek" });
    await expect(scrubber).toBeFocused();
    await expect(scrubber).toHaveAttribute("aria-valuetext", "6 seconds of 12 seconds");

    await page.keyboard.press("ArrowRight");
    await expect(scrubber).toHaveAttribute("aria-valuenow", "11");
    await page.keyboard.press("ArrowDown"); // the scrubber owns the arrows
    await expect(scrubber).toHaveAttribute("aria-valuenow", "6");
    expect((await media(page)).volume).toBe(1);
    await page.keyboard.press("Home");
    await expect(scrubber).toHaveAttribute("aria-valuetext", "0 seconds of 12 seconds");
    await page.mouse.move(0, 0);
    await expect(page.locator(part("tooltip"))).toBeHidden();
  });

  test("captions from the data:text/vtt track draw above the bar, and C toggles them", async ({ page }) => {
    const cue = page.locator(part("cue"));
    await page.evaluate((sel) => ((document.querySelector(`${sel} video`) as HTMLVideoElement).currentTime = 5), PLAYER);
    await expect(cue).toHaveText("The valley wakes; the clouds drift east.");
    const captions = page.getByRole("button", { name: "Captions" });
    await expect(captions).toHaveAttribute("aria-pressed", "true");
    // The browser paints none of its own: the track is "hidden", the cue is ours.
    expect(await page.evaluate((sel) => (document.querySelector(`${sel} video`) as HTMLVideoElement).textTracks[0].mode, PLAYER)).toBe("hidden");

    await page.locator(part("play")).focus();
    await page.keyboard.press("c");
    await expect(captions).toHaveAttribute("aria-pressed", "false");
    await expect(cue).toBeHidden();
    await expect(page.locator(part("status"))).toHaveText("Captions off");
    await captions.click();
    await expect(cue).toHaveText("The valley wakes; the clouds drift east.");
  });

  test("shortcuts: J/L, digits, End, M and < >, only while focus is in the player", async ({ page }) => {
    // Outside the player nothing happens.
    await page.keyboard.press("l");
    expect((await media(page)).t).toBe(0);

    await page.locator(part("play")).focus();
    await page.keyboard.press("l");
    await expect.poll(async () => (await media(page)).t).toBe(10);
    await page.keyboard.press("j");
    await expect.poll(async () => (await media(page)).t).toBe(0);
    await page.keyboard.press("5");
    await expect.poll(async () => (await media(page)).t).toBe(6);
    await page.keyboard.press("m");
    expect((await media(page)).muted).toBe(true);
    await expect(page.getByRole("button", { name: "Mute" })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press(">");
    expect((await media(page)).rate).toBe(1.25);
    await expect(page.locator(part("rate"))).toHaveText("1.25×");
    await page.keyboard.press("ArrowDown");
    expect((await media(page)).volume).toBeCloseTo(0.95);
    await page.keyboard.press("End");
    await expect(page.locator(PLAYER)).toHaveAttribute("data-state", "ended");
    await expect(page.locator(part("play"))).toHaveAccessibleName("Replay");
  });

  test("Space presses a focused button instead of toggling playback", async ({ page }) => {
    const mute = page.getByRole("button", { name: "Mute" });
    await mute.focus();
    await page.keyboard.press("Space");
    await expect(mute).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(PLAYER)).toHaveAttribute("data-state", "paused");
  });

  test("the volume slider follows a drag and owns its arrows", async ({ page }) => {
    const vol = page.getByRole("slider", { name: "Volume" });
    const box = (await vol.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    expect((await media(page)).volume).toBeCloseTo(0.4, 1);
    await expect(vol).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await media(page)).volume).toBeCloseTo(0.45, 1);
    expect((await media(page)).t).toBe(0);
  });

  test("the controls hide during idle playback and come back for pointer and keyboard", async ({ page }) => {
    await page.evaluate((sel) => ((document.querySelector(`${sel} video`) as HTMLVideoElement).muted = true), PLAYER);
    const box = (await page.locator(PLAYER).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 3); // the picture: play
    await expect(page.locator(PLAYER)).toHaveAttribute("data-state", "playing");
    await expect(page.locator(part("controls"))).toHaveAttribute("data-state", "hidden", { timeout: 6000 });
    await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 3);
    await expect(page.locator(part("controls"))).not.toHaveAttribute("data-state", "hidden");

    // Keyboard focus inside: the controls stay up.
    await page.keyboard.press("Tab");
    await page.waitForTimeout(3000);
    await expect(page.locator(part("controls"))).not.toHaveAttribute("data-state", "hidden");
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-part="controls"]')!).opacity)).toBe("1");
  });

  test("fullscreen is requested on the player root", async ({ page }) => {
    await page.getByRole("button", { name: "Full screen" }).click();
    await expect
      .poll(() => page.evaluate((sel) => document.fullscreenElement === document.querySelector(sel), PLAYER))
      .toBe(true);
    await expect(page.getByRole("button", { name: "Full screen" })).toHaveAttribute("aria-pressed", "true");
    await page.evaluate(() => document.exitFullscreen());
    await expect(page.getByRole("button", { name: "Full screen" })).toHaveAttribute("aria-pressed", "false");
  });

  test("an undecodable source lands in the error state with its message", async ({ page }) => {
    const broken = page.locator('[data-ui="video-player"][aria-label="Broken clip"]');
    await expect(broken).toHaveAttribute("data-state", "error");
    await expect(broken.locator('[data-part="message"]')).toBeVisible();
    await expect(broken.locator('[data-part="big-play"]')).toBeHidden();
  });
});

test("with no script the native controls run the video", async ({ page }) => {
  const noScript = PAGE.replace(/<script>[\s\S]*?<\/script>/g, "");
  await page.setContent(noScript, { waitUntil: "load" });
  expect((await media(page)).controls).toBe(true);
  await expect(page.locator(part("controls"))).toBeHidden();
  await expect(page.locator(part("big-play"))).toBeHidden();
});
