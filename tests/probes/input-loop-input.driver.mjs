// Usage: node tests/probes/input-loop-drive.mjs tests/probes/input-loop-input.probe.ts --driver tests/probes/input-loop-input.driver.mjs
// Driver for input-loop-input.probe.ts WITHOUT acquiring pointer lock in the main page (headless storm).
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();
const say = (s) => console.error(`[drv +${Date.now() - T0}ms] ${s}`);
const to = (p, what, ms = 15000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout: " + what)), ms))]);

export default async function drive(page) {
  await page.waitForFunction(() => window.__probeReady, null, { timeout: 60000 });
  await page.evaluate(() => ((window.__driverPresent = true), (window.__noLock = true)));
  const mark = (s) => (say("mark " + s), to(page.evaluate((s) => window.__mark(s), s), "mark " + s));
  const snap = (s) => to(page.evaluate((s) => window.__snap(s), s), "snap " + s);

  await snap("start");
  await mark("focus-click (no lock)");
  await to(page.mouse.click(640, 360), "click");
  await wait(200);
  await snap("after focus click");

  await mark("keys-canvas-focused");
  await to(page.keyboard.down("KeyW"), "W down");
  await wait(30);
  await to(page.keyboard.down("KeyW"), "W down again");
  await to(page.keyboard.up("KeyW"), "W up");
  await to(page.keyboard.press("KeyC"), "C");
  await to(page.keyboard.down("ControlLeft"), "ctrl down");
  await to(page.keyboard.press("KeyS"), "ctrl+S");
  await to(page.keyboard.up("ControlLeft"), "ctrl up");
  await to(page.keyboard.press("Space"), "space");
  await to(page.keyboard.press("Tab"), "tab (preventDefault in keydown)");
  await to(page.keyboard.press("Escape"), "escape");
  await wait(100);
  await snap("after keys (canvas focused)");

  await mark("keys-button-focused");
  await to(page.evaluate(() => document.querySelector("button").focus()), "focus button");
  await to(page.keyboard.press("KeyE"), "E with button focused");
  await wait(100);
  await snap("after E with overlay button focused");

  await mark("overlay-click");
  await to(page.mouse.click(160, 120), "overlay click");
  await wait(200);
  await snap("after overlay click");

  await mark("right-drag");
  await to(page.mouse.move(400, 300), "move to start");
  await wait(50);
  await snap("before drag (reset)");
  await to(page.mouse.down({ button: "right" }), "rdown");
  await to(page.mouse.move(480, 340, { steps: 8 }), "drag");
  await to(page.mouse.up({ button: "right" }), "rup");
  await wait(100);
  await snap("after right-drag (+80,+40)");

  await mark("left-drag");
  await to(page.mouse.down({ button: "left" }), "ldown");
  await to(page.mouse.move(420, 280, { steps: 5 }), "ldrag");
  await to(page.mouse.up({ button: "left" }), "lup");
  await wait(100);
  await snap("after left-drag (-60,-60)");

  await mark("wheel");
  await to(page.mouse.wheel(0, 120), "wheel");
  await wait(200);
  await snap("after wheel");

  await mark("iframes");
  await to(page.mouse.click(410, 630), "iframe without allow-pointer-lock");
  await wait(800);
  await snap("after sandbox-without click");
  // NOT clicked by default: the iframe WITH allow-pointer-lock acquires a real lock (verified once: promise
  // resolved + pointerlockchange), which triggers the headless event storm and can stall the page.
  // await to(page.mouse.click(870, 630), "iframe with allow-pointer-lock");
  await page.evaluate(() => (window.__driverDone = true)).catch(() => {});
}
