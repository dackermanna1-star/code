// Usage: node tests/probes/input-loop-drive.mjs tests/probes/input-loop-lockstorm.probe.ts --driver tests/probes/input-loop-lockstorm.driver.mjs
// Shows the headless-Chromium event storm after a real pointer lock (logs to stderr).
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();
const say = (s) => console.error(`[drv +${Date.now() - T0}ms] ${s}`);
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout: " + what)), ms))]);

export default async function drive(page) {
  await page.waitForFunction(() => window.__lockReady, null, { timeout: 60000 });
  const st = async (label) => {
    const t = Date.now();
    try {
      const s = await withTimeout(page.evaluate(() => window.__lockStats()), 8000, label);
      say(`${label} (evaluate took ${Date.now() - t} ms): ${JSON.stringify(s)}`);
    } catch (e) {
      say(`${label}: ${e.message}`);
    }
  };
  await st("before click");
  await wait(1000);
  await st("idle 1s unlocked");
  say("click");
  await withTimeout(page.mouse.click(640, 360), 8000, "click").catch((e) => say(e.message));
  await wait(1000);
  await st("1s after lock");
  await wait(1000);
  await st("2s after lock");
  // the page exits the lock itself 1.5 s after acquiring it and resolves 1 s later
  await wait(1500);
  await st("~1.5s after in-page exitPointerLock");
}
