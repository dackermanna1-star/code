// Isolates headless-Chromium behaviour after pointer lock is acquired (DOM only, then with Babylon).
// Needs a trusted click (Playwright driver); without one it just reports NotAllowedError.
import { Engine, Scene, FreeCamera, Vector3 } from "@babylonjs/core";

declare global {
  interface Window {
    __lockReady?: boolean;
    __lockDone?: boolean;
    __lockStats?: () => unknown;
  }
}

export async function probe() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  canvas.tabIndex = 1;
  const useBabylon = new URLSearchParams(location.search).has("babylon");
  let engine: Engine | null = null;
  if (useBabylon) {
    engine = new Engine(canvas, false);
    const scene = new Scene(engine);
    new FreeCamera("c", new Vector3(0, 0, -5), scene);
    engine.runRenderLoop(() => scene.render());
  }
  const stats = { moves: 0, coalesced: 0, raw: 0, dx: 0, dy: 0, lockedAt: -1, lockResult: "" as string, frames: 0 };
  canvas.addEventListener("pointermove", (e) => {
    stats.moves++;
    stats.dx += e.movementX;
    stats.dy += e.movementY;
    // cheap: only count length (no allocation of arrays kept)
    stats.coalesced += e.getCoalescedEvents ? e.getCoalescedEvents().length : 0;
  });
  window.addEventListener("pointerrawupdate", () => stats.raw++);
  canvas.addEventListener("click", () => {
    const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    p?.then(
      () => ((stats.lockResult = "resolved"), (stats.lockedAt = performance.now())),
      (e: DOMException) => (stats.lockResult = "rejected " + e.name),
    );
  });
  const tick = () => {
    stats.frames++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__lockStats = () => ({ ...stats, locked: document.pointerLockElement === canvas, t: Math.round(performance.now()) });
  window.__lockReady = true;
  const t0 = performance.now();
  await new Promise<void>((res) => {
    const poll = () => (window.__lockDone || performance.now() - t0 > 20000 ? res() : setTimeout(poll, 50));
    poll();
  });
  engine?.dispose();
  return window.__lockStats();
}
