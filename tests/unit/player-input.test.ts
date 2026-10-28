// Unit tests for src/player/input.ts with a minimal fake DOM (window/document/canvas are plain
// EventTargets; performance.now is a controllable clock). Run: node --test tests/unit/player-input.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------- fake DOM + clock
let clock = 1000;
Object.defineProperty(globalThis, "performance", { value: { now: () => clock }, configurable: true, writable: true });

type AnyRec = Record<string, unknown>;
const win = new EventTarget() as EventTarget & AnyRec;
const doc = new EventTarget() as EventTarget & AnyRec;
doc.pointerLockElement = null;
doc.visibilityState = "visible";
doc.exitPointerLock = () => {
  doc.pointerLockElement = null;
  doc.dispatchEvent(new Event("pointerlockchange"));
};
Object.defineProperty(globalThis, "window", { value: win, configurable: true, writable: true });
Object.defineProperty(globalThis, "document", { value: doc, configurable: true, writable: true });

type LockMode = "grant" | "security" | "notallowed" | "notsupported-then-grant";
let lockMode: LockMode = "grant";
function makeCanvas() {
  const c = new EventTarget() as EventTarget & AnyRec;
  c.tabIndex = -1;
  c.focus = () => {};
  c.requestPointerLock = (opts?: { unadjustedMovement?: boolean }) => {
    const fail = (name: string) => {
      const e = new Error(name) as Error & { name: string };
      e.name = name;
      return Promise.reject(e);
    };
    if (lockMode === "security") return fail("SecurityError");
    if (lockMode === "notallowed") return fail("NotAllowedError");
    if (lockMode === "notsupported-then-grant" && opts?.unadjustedMovement) return fail("NotSupportedError");
    doc.pointerLockElement = c;
    queueMicrotask(() => doc.dispatchEvent(new Event("pointerlockchange")));
    return Promise.resolve();
  };
  return c;
}

function key(type: "keydown" | "keyup", code: string, repeat = false) {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, { code, repeat, ctrlKey: false });
  win.dispatchEvent(e);
  return e;
}
function mouse(target: EventTarget, type: string, button: number, extra: AnyRec = {}) {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, { button, movementX: 0, movementY: 0, clientX: 0, clientY: 0, ...extra });
  target.dispatchEvent(e);
  return e;
}
function move(dx: number, dy: number) {
  const e = new Event("mousemove");
  Object.assign(e, { movementX: dx, movementY: dy });
  doc.dispatchEvent(e);
}
function wheel(target: EventTarget, deltaY: number, deltaMode = 0) {
  const e = new Event("wheel", { cancelable: true });
  Object.assign(e, { deltaY, deltaMode });
  target.dispatchEvent(e);
  return e;
}

const { Input } = await import("../../src/player/input.ts");
const { Settings } = await import("../../src/core/settings.ts");

function setup(opts: { fallback?: boolean } = {}) {
  doc.pointerLockElement = null;
  const canvas = makeCanvas();
  const settings = new Settings();
  settings.data.mouseSensitivity = 1;
  settings.data.invertY = false;
  const input = new Input(canvas as unknown as HTMLCanvasElement, settings);
  input.setEnabled(true);
  if (opts.fallback ?? true) input.setFallback(true);
  return { input, canvas, settings };
}

// ---------------------------------------------------------------- tests
test("keys are ignored until input is enabled and captured", () => {
  const { input } = setup({ fallback: false });
  key("keydown", "KeyW");
  input.update();
  assert.equal(input.move.y, 0, "not locked, no fallback → no capture");
  input.setFallback(true);
  key("keydown", "KeyW");
  input.update();
  assert.equal(input.move.y, 1);
  key("keyup", "KeyW");
  input.update();
  assert.equal(input.move.y, 0);
  input.dispose();
});

test("movement axes from WASD/arrows, opposite keys cancel", () => {
  const { input } = setup();
  key("keydown", "KeyD");
  key("keydown", "ArrowUp");
  input.update();
  assert.deepEqual({ ...input.move }, { x: 1, y: 1 });
  key("keydown", "KeyA");
  input.update();
  assert.equal(input.move.x, 0);
  input.releaseAll();
  input.dispose();
});

test("pressed/released are edges consumed on read; key repeat is ignored; game keys preventDefault", () => {
  const { input } = setup();
  const e = key("keydown", "Space");
  assert.equal(e.defaultPrevented, true);
  assert.equal(input.down("jump"), true);
  assert.equal(input.pressed("jump"), true);
  assert.equal(input.pressed("jump"), false, "consumed");
  key("keydown", "Space", true); // auto-repeat
  assert.equal(input.pressed("jump"), false);
  key("keyup", "Space");
  assert.equal(input.down("jump"), false);
  assert.equal(input.released("jump"), true);
  assert.equal(input.released("jump"), false);
  input.dispose();
});

test("an action held by two keys stays down until both are released (one released edge)", () => {
  const { input } = setup();
  key("keydown", "KeyC");
  key("keydown", "ControlLeft");
  assert.equal(input.pressed("crouch"), true);
  key("keyup", "KeyC");
  assert.equal(input.down("crouch"), true);
  assert.equal(input.released("crouch"), false);
  key("keyup", "ControlLeft");
  assert.equal(input.down("crouch"), false);
  assert.equal(input.released("crouch"), true);
  input.dispose();
});

test("unconsumed edges expire after 250 ms (no stale actions after a pause)", () => {
  const { input } = setup();
  key("keydown", "KeyE");
  key("keyup", "KeyE");
  clock += 300;
  input.update();
  assert.equal(input.pressed("use"), false);
  assert.equal(input.released("use"), false);
  key("keydown", "KeyE");
  clock += 200;
  assert.equal(input.pressed("use"), true, "still fresh at 200 ms");
  key("keyup", "KeyE");
  input.dispose();
});

test("window blur releases everything (released edges, no stuck keys)", () => {
  const { input } = setup();
  key("keydown", "KeyW");
  key("keydown", "ShiftLeft");
  input.pressed("sprint");
  win.dispatchEvent(new Event("blur"));
  input.update();
  assert.equal(input.down("sprint"), false);
  assert.equal(input.released("sprint"), true);
  assert.equal(input.move.y, 0);
  input.dispose();
});

test("mouse buttons: left = fire, middle = alt, right = grab (pointer locked)", async () => {
  const { input, canvas } = setup({ fallback: false });
  await input.requestLock();
  assert.equal(input.locked, true);
  mouse(canvas, "mousedown", 2);
  assert.equal(input.pressed("grab"), true);
  mouse(win, "mouseup", 2);
  assert.equal(input.released("grab"), true);
  mouse(canvas, "mousedown", 1);
  assert.equal(input.down("alt"), true);
  mouse(win, "mouseup", 1);
  mouse(canvas, "mousedown", 0);
  assert.equal(input.down("fire"), true);
  mouse(win, "mouseup", 0);
  assert.equal(input.down("fire"), false);
  input.exitLock();
  input.dispose();
});

test("look: locked deltas scaled by sensitivity, invert Y, first move after lock and outliers skipped", async () => {
  const { input, settings } = setup({ fallback: false });
  await input.requestLock();
  move(500, 500); // first move after locking can be a spike → skipped
  move(10, -4);
  move(900, 0); // outlier → ignored
  settings.data.mouseSensitivity = 2;
  let l = input.consumeLook();
  assert.deepEqual({ ...l }, { dx: 20, dy: -8 });
  l = input.consumeLook();
  assert.deepEqual({ ...l }, { dx: 0, dy: 0 }, "consumed");
  settings.data.invertY = true;
  move(0, 5);
  l = input.consumeLook();
  assert.equal(l.dy, -10);
  input.exitLock();
  input.dispose();
});

test("fallback drag-to-look: drag looks without firing, a click fires, a still hold charges", () => {
  const { input, canvas } = setup();
  // drag
  mouse(canvas, "mousedown", 0, { clientX: 10, clientY: 10 });
  move(3, 0); // first move after the press is skipped (possible warp)
  move(4, 2);
  move(5, 1);
  input.update();
  mouse(win, "mouseup", 0);
  assert.equal(input.pressed("fire"), false, "a drag is not a shot");
  const l = input.consumeLook();
  assert.deepEqual({ ...l }, { dx: 9, dy: 3 });
  // click
  mouse(canvas, "mousedown", 0);
  clock += 80;
  input.update();
  mouse(win, "mouseup", 0);
  assert.equal(input.pressed("fire"), true);
  assert.equal(input.released("fire"), true);
  // hold still → becomes a held fire (charge)
  mouse(canvas, "mousedown", 0);
  clock += 260;
  input.update();
  assert.equal(input.down("fire"), true);
  assert.equal(input.pressed("fire"), true);
  mouse(win, "mouseup", 0);
  assert.equal(input.down("fire"), false);
  assert.equal(input.released("fire"), true);
  input.dispose();
});

test("wheel: notches, positive = forward, deltaMode lines, page zoom prevented", () => {
  const { input, canvas } = setup();
  const e = wheel(canvas, -100);
  assert.equal(e.defaultPrevented, true);
  assert.equal(input.consumeWheel(), 1);
  wheel(canvas, 3, 1); // 3 lines down ≈ 1 notch back
  assert.ok(Math.abs(input.consumeWheel() + 0.99) < 1e-9);
  assert.equal(input.consumeWheel(), 0);
  input.dispose();
});

test("pointer lock: unadjustedMovement NotSupportedError → plain retry succeeds", async () => {
  lockMode = "notsupported-then-grant";
  const { input } = setup({ fallback: false });
  const ok = await input.requestLock();
  assert.equal(ok, true);
  assert.equal(input.locked, true);
  assert.equal(input.fallback, false);
  input.exitLock();
  input.dispose();
  lockMode = "grant";
});

test("pointer lock: SecurityError (sandboxed iframe) → drag-to-look fallback", async () => {
  lockMode = "security";
  const { input } = setup({ fallback: false });
  const events: Array<{ locked: boolean; fallback: boolean }> = [];
  input.onLockChange((locked, info) => events.push({ locked, fallback: info.fallback }));
  const ok = await input.requestLock();
  assert.equal(ok, true, "playable via fallback");
  assert.equal(input.fallback, true);
  assert.ok(events.some((e) => e.fallback));
  input.dispose();
  lockMode = "grant";
});

test("pointer lock: NotAllowedError (no gesture / too soon after Esc) → retry later, no fallback", async () => {
  lockMode = "notallowed";
  const { input } = setup({ fallback: false });
  for (let i = 0; i < 3; i++) assert.equal(await input.requestLock(), false);
  assert.equal(input.fallback, false);
  input.dispose();
  lockMode = "grant";
});

test("losing the lock (Escape) latches a pause press and releases held keys", async () => {
  const { input } = setup({ fallback: false });
  const seen: Array<{ locked: boolean; requested: boolean }> = [];
  input.onLockChange((locked, info) => seen.push({ locked, requested: info.requested }));
  await input.requestLock();
  key("keydown", "KeyW");
  input.update();
  assert.equal(input.move.y, 1);
  // the browser exits the lock (user pressed Escape)
  doc.pointerLockElement = null;
  doc.dispatchEvent(new Event("pointerlockchange"));
  input.update();
  assert.equal(input.move.y, 0);
  assert.equal(input.pressed("pause"), true);
  assert.deepEqual(seen[seen.length - 1], { locked: false, requested: false });
  // our own exitLock() is not a pause
  await input.requestLock();
  input.exitLock();
  assert.equal(input.pressed("pause"), false);
  input.dispose();
});

test("setEnabled(false) releases and clears; virtual hold/tap for tests", () => {
  const { input } = setup();
  key("keydown", "KeyF");
  input.setEnabled(false);
  assert.equal(input.down("kick"), false);
  assert.equal(input.pressed("kick"), false);
  key("keydown", "KeyG");
  assert.equal(input.down("stomp"), false, "disabled → ignored");
  input.setEnabled(true);
  input.hold("alt", 0.5);
  assert.equal(input.down("alt"), true);
  assert.equal(input.pressed("alt"), true);
  clock += 600;
  input.update();
  assert.equal(input.down("alt"), false);
  assert.equal(input.released("alt"), true);
  input.tap("use");
  assert.equal(input.pressed("use"), true);
  assert.equal(input.released("use"), true);
  input.dispose();
});
