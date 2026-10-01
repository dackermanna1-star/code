import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { PaintMenu, TouchSprayControls } from './ui/PaintMenu.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
const params = {
  shot: q.has('shot'),
  cam: q.get('cam'), // "x,y,z,yawDeg,pitchDeg"
  t: num('t', 3.0),
  exposure: num('exp', undefined),
  dpr: num('dpr', 1.5),
  walk: num('walk', 0), // shot mode: seconds of simulated walking before the capture
  quality: q.get('q') ?? 'auto',
  fixedRes: q.has('fixedRes'),
  nopaint: q.has('nopaint'),
  noworkers: q.has('noworkers'),
  debug: q.has('debug'),
};

const canvas = document.getElementById('view');
const gate = document.getElementById('gate');

async function main() {
  const engine = new Engine(canvas, params);
  window.__engine = engine;
  const bar = document.querySelector('#load i');
  await engine.init((k) => {
    if (bar) bar.style.width = `${Math.round(k * 100)}%`;
  });
  engine.bakeShadows();

  // spray paint UI (the menu opens with Tab; touch devices get round buttons)
  const sp = engine.spray;
  const menu = new PaintMenu({
    settings: { ...sp.settings },
    onChange: (s) => sp.setSettings(s, 'menu'),
    onAction: (a) => (a === 'undo' ? sp.undo() : a === 'clear' ? sp.clearAll() : a === 'close' ? sp.closeMenu() : null),
  });
  sp.attachMenu(menu);
  let touchUI = null;
  if (!params.shot && matchMedia?.('(pointer: coarse)').matches) {
    touchUI = new TouchSprayControls({
      onToggleCan: () => sp.toggle(),
      onSprayStart: () => (sp.btn.touch = true),
      onSprayEnd: () => (sp.btn.touch = false),
      onMenu: () => sp.openMenu(),
      onPick: () => engine.carry?.usable() && engine.carry.interact(),
    });
    sp.attachTouch(touchUI);
  }

  if (params.shot) {
    gate.style.display = 'none';
    const c = (params.cam ?? '0,1.62,2,0,0').split(',').map(Number);
    if (params.walk) {
      const pl = engine.player;
      pl.pos.set(c[0], 0, c[2]);
      pl.yaw = pl.yawT = pl.feetYaw = THREE.MathUtils.degToRad(c[3] ?? 0);
      pl.pitch = pl.pitchT = THREE.MathUtils.degToRad(c[4] ?? 0);
      pl.enabled = true;
      pl.keys.add('KeyW');
      const steps = Math.round(params.walk * 30);
      for (let i = 0; i < steps; i++) {
        engine.player.update(1 / 30);
        engine.body.update(1 / 30, engine.player);
      }
      if (q.has('stop')) pl.keys.delete('KeyW');
      for (let i = 0; i < 2; i++) engine.step(1 / 60);
      if (q.has('tp')) {
        // third-person debug view of the body: "dx,dy,dz,yawDeg,pitchDeg" relative to the player
        const t = q.get('tp').split(',').map(Number);
        const cam = engine.camera;
        engine.player.update = () => {};
        cam.position.set(pl.pos.x + t[0], t[1], pl.pos.z + t[2]);
        cam.rotation.set(THREE.MathUtils.degToRad(t[4]), THREE.MathUtils.degToRad(t[3]), 0, 'YXZ');
        cam.updateMatrixWorld();
        engine.step(1 / 60);
      }
    } else {
      engine.body.group.visible = false;
      engine.camera.position.set(c[0], c[1], c[2]);
      engine.camera.rotation.set(THREE.MathUtils.degToRad(c[4] ?? 0), THREE.MathUtils.degToRad(c[3] ?? 0), 0, 'YXZ');
      engine.camera.updateMatrixWorld();
      // a couple of frames so shadow maps and mip chains settle
      for (let i = 0; i < (q.has("frames") ? +q.get("frames") : 8); i++) engine.step(1 / 60);
    }
    window.__shotReady = true;
    return;
  }

  // compile the heavy shaders and run a few frames behind the black gate
  try {
    await engine.renderer.compileAsync(engine.scene, engine.camera);
  } catch {
    /* compileAsync unsupported: shaders compile on first render */
  }
  engine.post.fade = 0;
  for (let i = 0; i < 2; i++) engine.step(1 / 60);
  // artifact viewers: keep the walker's place across a republish
  const hot = window.claude?.hot;
  try {
    hot?.snapshot?.(() => ({ x: engine.player.pos.x, z: engine.player.pos.z, yaw: engine.player.yaw, pitch: engine.player.pitch }));
  } catch {
    /* not in a viewer */
  }
  const restore = (d) => {
    if (d && Number.isFinite(d.x) && Number.isFinite(d.z)) {
      const pl = engine.player;
      pl.pos.x = d.x;
      pl.pos.z = d.z;
      pl.yaw = pl.yawT = pl.feetYaw = d.yaw ?? pl.yaw;
      pl.pitch = pl.pitchT = d.pitch ?? pl.pitch;
    }
  };
  if (hot?.ready) hot.ready(restore);
  else restore(hot?.data ?? {});

  gate.classList.add('ready');
  window.__readyMs = Math.round(performance.now());
  engine.player.update(0.016);
  engine.post.fade = 0;
  engine.start();

  let started = false;
  let hadLock = false;
  const view = canvas;
  const lock = () => {
    try {
      const r = view.requestPointerLock?.({ unadjustedMovement: true });
      if (r && r.catch) r.catch(() => view.requestPointerLock?.()?.catch?.(() => {}));
    } catch {
      /* no pointer lock (sandboxed iframe): drag-to-look fallback */
    }
  };
  gate.addEventListener('click', () => {
    gate.classList.add('hidden');
    gate.classList.remove('paused');
    lock();
    engine.player.enabled = true;
    touchUI?.show();
    if (!started) {
      started = true;
      engine.onStart?.();
      // slow fade in from black
      const t0 = performance.now();
      const fade = () => {
        const k = Math.min(1, (performance.now() - t0) / 4500);
        engine.post.fade = k * k * (3 - 2 * k);
        if (k < 1) requestAnimationFrame(fade);
      };
      fade();
    } else engine.onResume?.();
    engine.spray?.onResume();
  });
  const pause = () => {
    engine.player.enabled = false;
    gate.classList.remove('hidden');
    gate.classList.add('paused');
    engine.spray?.onPause();
    engine.onPause?.();
  };
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === view) {
      hadLock = true;
      return;
    }
    // the paint menu releases the mouse on purpose
    if (engine.spray?.menuOpen) {
      hadLock = false;
      return;
    }
    // only treat it as a pause if we actually had the lock (Esc pressed)
    if (started && hadLock) {
      hadLock = false;
      pause();
    }
  });
  // without pointer lock, Escape still pauses (unless it is closing the paint menu)
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && started && !hadLock && engine.player.enabled && !engine.spray?.menuOpen) pause();
  });
}

main().catch((e) => {
  console.error(e);
  window.__shotError = String(e && e.stack ? e.stack : e);
});
