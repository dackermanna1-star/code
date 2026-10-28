// Input: pointer lock, raw mouse deltas (DOM vs scene.onPointerObservable), keyboard (DOM vs
// scene.onKeyboardObservable), HTML overlay clicks, sandboxed-iframe pointer lock.
// Trusted input needs a Playwright driver (page.mouse / page.keyboard). Under the stock harness
// (no driver) the probe still resolves after ~2.5 s and reports what works WITHOUT a user gesture.
import { Engine, Scene, FreeCamera, Vector3, HemisphericLight, MeshBuilder, PointerEventTypes, KeyboardEventTypes } from "@babylonjs/core";

declare global {
  interface Window {
    __probeReady?: boolean;
    __driverDone?: boolean;
    __driverPresent?: boolean;
    __mark?: (s: string) => void;
    __state?: () => unknown;
    __tryLock?: (opts?: { unadjustedMovement?: boolean }) => Promise<unknown>;
  }
}

type Entry = Record<string, unknown>;

function tryLock(el: HTMLElement, opts?: { unadjustedMovement?: boolean }): Promise<Entry> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let done = false;
    const finish = (e: Entry) => {
      if (done) return;
      done = true;
      document.removeEventListener("pointerlockchange", onChange);
      document.removeEventListener("pointerlockerror", onError);
      resolve({ ...e, ms: Math.round(performance.now() - t0), locked: document.pointerLockElement === el });
    };
    const onChange = () => finish({ via: "pointerlockchange" });
    const onError = () => finish({ via: "pointerlockerror" });
    document.addEventListener("pointerlockchange", onChange);
    document.addEventListener("pointerlockerror", onError);
    try {
      // Chrome returns a Promise (and supports {unadjustedMovement}); older Safari/Firefox return undefined.
      const ret = (el.requestPointerLock as (o?: unknown) => Promise<void> | undefined)(opts);
      if (ret && typeof (ret as Promise<void>).then === "function") {
        (ret as Promise<void>).then(
          () => finish({ via: "promise-resolved" }),
          (err: DOMException) => finish({ via: "promise-rejected", name: err?.name, message: err?.message }),
        );
      }
    } catch (err) {
      finish({ via: "threw", name: (err as DOMException).name, message: (err as Error).message });
    }
    setTimeout(() => finish({ via: "timeout-800ms" }), 800);
  });
}

function makeIframe(label: string, sandbox: string, left: number): HTMLIFrameElement {
  const f = document.createElement("iframe");
  f.setAttribute("sandbox", sandbox);
  f.style.cssText = `position:fixed;left:${left}px;top:560px;width:220px;height:140px;border:2px solid #fff;z-index:20;background:#333`;
  f.srcdoc = `<!doctype html><body style="margin:0;background:#246"><canvas id=c style="width:100%;height:100%;display:block"></canvas><script>
    const c = document.getElementById('c');
    c.addEventListener('click', () => {
      const res = { label: ${JSON.stringify(label)}, events: [] };
      document.addEventListener('pointerlockchange', () => { res.events.push('change:' + (document.pointerLockElement === c)); parent.postMessage(res, '*'); });
      document.addEventListener('pointerlockerror', () => { res.events.push('error'); parent.postMessage(res, '*'); });
      try {
        const p = c.requestPointerLock();
        if (p && p.then) p.then(() => { res.events.push('resolved'); parent.postMessage(res, '*'); },
                                 (e) => { res.events.push('rejected:' + e.name + ':' + e.message); parent.postMessage(res, '*'); });
      } catch (e) { res.events.push('threw:' + e.name); parent.postMessage(res, '*'); }
    });
  </` + `script></body>`;
  document.body.appendChild(f);
  return f;
}

export async function probe() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, false, {});
  const scene = new Scene(engine);
  const cam = new FreeCamera("cam", new Vector3(0, 1.6, -3), scene);
  cam.setTarget(new Vector3(0, 1, 0));
  new HemisphericLight("h", new Vector3(0, 1, 0), scene);
  MeshBuilder.CreateBox("box", { size: 1 }, scene).position.y = 1;

  const out: Entry = {};
  const log: Entry[] = [];
  let step = "init";
  const push = (e: Entry) => log.length < 400 && log.push({ step, ...e });
  window.__mark = (s: string) => {
    step = s;
  };

  out.api = {
    requestPointerLock: typeof canvas.requestPointerLock,
    exitPointerLock: typeof document.exitPointerLock,
    pointerLockElementInDocument: "pointerLockElement" in document,
    isSecureContext: window.isSecureContext,
    userActivationActive: (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive ?? null,
    canvasTabIndex: canvas.tabIndex,
    engineCanvasTabIndex: engine.canvasTabIndex,
    pointerrawupdateSupported: "onpointerrawupdate" in window,
    keyboardLockApi: typeof (navigator as Navigator & { keyboard?: { lock?: unknown } }).keyboard?.lock,
  };

  // ---- no user gesture ---------------------------------------------------------------------------
  out.noGesture_requestPointerLock = await tryLock(canvas);
  engine.enterPointerlock();
  await new Promise((r) => setTimeout(r, 300));
  out.noGesture_engineEnterPointerlock = { engineIsPointerLock: engine.isPointerLock, pointerLockElement: document.pointerLockElement?.id ?? null };

  // ---- listeners -----------------------------------------------------------------------------------
  const acc = { domMoves: 0, domDx: 0, domDy: 0, domButtons: 0, sceneMoves: 0, sceneDx: 0, sceneDy: 0, rawMoves: 0, rawDx: 0, rawDy: 0 };
  const resetAcc = () => Object.keys(acc).forEach((k) => ((acc as Record<string, number>)[k] = 0));
  document.addEventListener("pointerlockchange", () =>
    push({ ev: "pointerlockchange", lockedToCanvas: document.pointerLockElement === canvas, engineIsPointerLock: engine.isPointerLock }),
  );
  document.addEventListener("pointerlockerror", () => push({ ev: "pointerlockerror" }));
  canvas.addEventListener("pointermove", (e) => {
    acc.domMoves++;
    acc.domDx += e.movementX;
    acc.domDy += e.movementY;
    acc.domButtons |= e.buttons;
  });
  window.addEventListener("pointerrawupdate", (e) => {
    acc.rawMoves++;
    acc.rawDx += (e as PointerEvent).movementX;
    acc.rawDy += (e as PointerEvent).movementY;
  });
  scene.onPointerObservable.add((pi) => {
    if (pi.type === PointerEventTypes.POINTERMOVE) {
      acc.sceneMoves++;
      acc.sceneDx += (pi.event as PointerEvent).movementX ?? 0;
      acc.sceneDy += (pi.event as PointerEvent).movementY ?? 0;
    } else {
      push({ ev: "scene.onPointerObservable", type: pi.type, button: (pi.event as PointerEvent).button });
    }
  });
  canvas.addEventListener("pointerdown", (e) => push({ ev: "canvas pointerdown", button: e.button, isTrusted: e.isTrusted }));
  canvas.addEventListener("contextmenu", (e) => push({ ev: "canvas contextmenu", defaultPrevented: e.defaultPrevented }));
  window.addEventListener("keydown", (e) => {
    push({ ev: "window keydown", code: e.code, key: e.key, repeat: e.repeat, ctrl: e.ctrlKey, isTrusted: e.isTrusted, target: (e.target as HTMLElement)?.tagName });
    if (e.code === "Space" || e.code === "Tab" || (e.ctrlKey && e.code === "KeyS")) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => push({ ev: "window keyup", code: e.code, key: e.key }));
  scene.onKeyboardObservable.add((kb) => {
    push({ ev: "scene.onKeyboardObservable", type: kb.type === KeyboardEventTypes.KEYDOWN ? "down" : "up", code: kb.event.code, repeat: kb.event.repeat });
  });
  window.addEventListener("blur", () => push({ ev: "window blur" }));
  document.addEventListener("visibilitychange", () => push({ ev: "visibilitychange", state: document.visibilityState }));

  // click-to-lock (user gesture), first try raw input then fall back to plain request
  canvas.addEventListener("click", async () => {
    // Headless Chromium: acquiring a real lock floods the page with coalesced pointer events
    // (see input-loop-lockstorm.probe.ts), so drivers can disable it with window.__noLock = true.
    if (document.pointerLockElement === canvas || (window as unknown as { __noLock?: boolean }).__noLock) return;
    const raw = await tryLock(canvas, { unadjustedMovement: true });
    push({ ev: "click->requestPointerLock({unadjustedMovement:true})", ...raw });
    if (!raw.locked && raw.name === "NotSupportedError") push({ ev: "fallback plain", ...(await tryLock(canvas)) });
  });

  // HTML overlay: HUD with pointer-events:none and a clickable button (pointer-events:auto)
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:10;font:14px sans-serif;color:#fff";
  overlay.innerHTML = `<div style="position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;background:#fff;border-radius:50%"></div>`;
  const btn = document.createElement("button");
  btn.textContent = "Resume";
  btn.style.cssText = "position:absolute;left:100px;top:100px;width:120px;height:40px;pointer-events:auto";
  btn.addEventListener("click", (e) => push({ ev: "overlay button click", isTrusted: e.isTrusted }));
  btn.addEventListener("pointerdown", () => push({ ev: "overlay button pointerdown" }));
  overlay.appendChild(btn);
  document.body.appendChild(overlay);

  // sandboxed iframes (bottom of the viewport)
  const iframeResults: Entry[] = [];
  window.addEventListener("message", (e) => iframeResults.push(JSON.parse(JSON.stringify(e.data))));
  makeIframe("sandbox WITHOUT allow-pointer-lock", "allow-scripts", 300);
  makeIframe("sandbox WITH allow-pointer-lock", "allow-scripts allow-pointer-lock", 760);

  window.__state = () => ({
    step,
    lockedToCanvas: document.pointerLockElement === canvas,
    engineIsPointerLock: engine.isPointerLock,
    activeElement: document.activeElement?.tagName + (document.activeElement?.id ? "#" + document.activeElement.id : ""),
    ...acc,
  });
  const snapshots: Entry[] = [];
  const snap = (label: string) => snapshots.push({ label, ...(window.__state!() as Entry) });
  (window as unknown as { __snap: (l: string) => void }).__snap = (l: string) => {
    snap(l);
    resetAcc();
  };
  window.__tryLock = (opts) => tryLock(canvas, opts);

  engine.runRenderLoop(() => scene.render());
  window.__probeReady = true;
  const t0 = performance.now();
  await new Promise<void>((res) => {
    const poll = () => {
      const limit = window.__driverPresent ? 30000 : 2500;
      if (window.__driverDone || performance.now() - t0 > limit) res();
      else setTimeout(poll, 50);
    };
    poll();
  });
  engine.stopRenderLoop();
  out.driverPresent = !!window.__driverPresent;
  out.snapshots = snapshots;
  out.log = log;
  out.iframeResults = iframeResults;
  return out;
}
