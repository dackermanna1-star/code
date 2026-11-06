/* ==========================================================================
   SPLEEN: SEPSIS — input.js
   Unified input: keyboard + mouse, gamepad (standard mapping), touch sticks.
   Produces a per-frame snapshot the game reads; edges are consumed per frame.
   ========================================================================== */
"use strict";

const Input = (function () {
  const keys = Object.create(null);
  const pressedEdge = Object.create(null);   // key code -> true for one frame
  const mouse = { x: 0, y: 0, down: false, rdown: false, moved: false, inside: true };
  const touch = { active: false, move: null, aim: null, moveVec: { x: 0, y: 0 }, aimVec: { x: 0, y: 0 }, buttons: {} };
  let padIndex = -1, padPrev = [], padAxesPrevNav = { x: 0, y: 0 }, navRepeat = 0;

  const S = {
    device: 'kbm',             // 'kbm' | 'pad' | 'touch' (last used)
    move: { x: 0, y: 0 },      // -1..1, screen space (y down = south)
    aim: { x: 1, y: 0 },       // unit vector in world (sim) space
    aimActive: false,          // player is explicitly aiming (stick / arrows / mouse)
    firing: false,
    fireHeld: false,
    dash: false, ability: false, interact: false, pause: false, mute: false, tab: false,
    nav: { up: false, down: false, left: false, right: false, confirm: false, back: false, any: false },
    mouseWorld: null,          // {x,y} sim coords under mouse (set by game each frame)
    mouse,
    touch,
  };

  /* ---------------- keyboard ---------------- */
  const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
  window.addEventListener('keydown', (e) => {
    if (e.repeat) { if (GAME_KEYS.has(e.code)) e.preventDefault(); return; }
    keys[e.code] = true; pressedEdge[e.code] = true; S.device = 'kbm';
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (window.AUDIO) try { AUDIO.init(); } catch (err) { }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = mouse.rdown = false; });

  /* ---------------- mouse ---------------- */
  window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true; if (S.device !== 'kbm' && (Math.abs(e.movementX) + Math.abs(e.movementY)) > 2) S.device = 'kbm'; });
  window.addEventListener('mousedown', (e) => {
    if (e.target && e.target.closest && e.target.closest('.ui-interactive')) return;
    S.device = 'kbm';
    if (e.button === 0) mouse.down = true;
    if (e.button === 2) { mouse.rdown = true; pressedEdge['Mouse2'] = true; }
    if (window.AUDIO) try { AUDIO.init(); } catch (err) { }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; if (e.button === 2) mouse.rdown = false; });
  window.addEventListener('contextmenu', (e) => { e.preventDefault(); });

  /* ---------------- touch (virtual twin sticks) ---------------- */
  const STICK_R = 60;
  function touchStart(e) {
    if (e.target && e.target.closest && e.target.closest('.ui-interactive')) return;
    if (!S.touchEnabled) return;
    S.device = 'touch';
    if (window.AUDIO) try { AUDIO.init(); } catch (err) { }
    for (const t of e.changedTouches) {
      const left = t.clientX < window.innerWidth * 0.5;
      const st = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
      if (left && !touch.move) touch.move = st;
      else if (!left && !touch.aim) touch.aim = st;
    }
    e.preventDefault();
  }
  function touchMove(e) {
    for (const t of e.changedTouches) {
      for (const k of ['move', 'aim']) {
        const st = touch[k];
        if (st && st.id === t.identifier) {
          st.x = t.clientX; st.y = t.clientY;
          // floating stick: drag origin along if pulled past radius
          const dx = st.x - st.ox, dy = st.y - st.oy, d = Math.hypot(dx, dy);
          if (d > STICK_R * 1.4) { st.ox = st.x - dx / d * STICK_R * 1.4; st.oy = st.y - dy / d * STICK_R * 1.4; }
        }
      }
    }
    if (touch.move || touch.aim) e.preventDefault();
  }
  function touchEnd(e) {
    for (const t of e.changedTouches) {
      if (touch.move && touch.move.id === t.identifier) touch.move = null;
      if (touch.aim && touch.aim.id === t.identifier) touch.aim = null;
    }
  }
  window.addEventListener('touchstart', touchStart, { passive: false });
  window.addEventListener('touchmove', touchMove, { passive: false });
  window.addEventListener('touchend', touchEnd);
  window.addEventListener('touchcancel', touchEnd);
  S.touchEnabled = false;
  S.touchButton = function (name) { touch.buttons[name] = true; S.device = 'touch'; };

  /* ---------------- gamepad ---------------- */
  window.addEventListener('gamepadconnected', (e) => { padIndex = e.gamepad.index; });
  window.addEventListener('gamepaddisconnected', (e) => { if (padIndex === e.gamepad.index) padIndex = -1; });
  function getPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (padIndex >= 0 && pads[padIndex]) return pads[padIndex];
    for (const p of pads) if (p && p.connected) { padIndex = p.index; return p; }
    return null;
  }
  const dz = (v, d = 0.2) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));

  /* ---------------- per-frame update ---------------- */
  S.update = function (dt) {
    const k = keys;
    const edge = (code) => !!pressedEdge[code];
    // --- keyboard move
    let mx = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    let my = (k.KeyS ? 1 : 0) - (k.KeyW ? 1 : 0);
    // --- arrow keys aim + fire (keyboard-only twin stick)
    let ax = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0);
    let ay = (k.ArrowDown ? 1 : 0) - (k.ArrowUp ? 1 : 0);
    let firing = false, aimActive = false;
    if (ax || ay) { const l = Math.hypot(ax, ay); S.aim.x = ax / l; S.aim.y = ay / l; firing = true; aimActive = true; S.device = 'kbm'; S.arrowAim = true; }
    else S.arrowAim = false;
    if (!S.arrowAim && S.mouseWorld && S.playerPos && S.device === 'kbm') {
      const dx = S.mouseWorld.x - S.playerPos.x, dy = S.mouseWorld.y - S.playerPos.y, l = Math.hypot(dx, dy);
      if (l > 0.05) { S.aim.x = dx / l; S.aim.y = dy / l; aimActive = true; }
    }
    if (mouse.down) firing = true;
    let dash = edge('Space') || edge('ShiftLeft') || edge('ShiftRight') || edge('Mouse2');
    let ability = edge('KeyQ') || edge('KeyF');
    let interact = edge('KeyE') || edge('Enter');
    let pause = edge('Escape') || edge('KeyP');
    const nav = S.nav;
    nav.up = edge('ArrowUp') || edge('KeyW'); nav.down = edge('ArrowDown') || edge('KeyS');
    nav.left = edge('ArrowLeft') || edge('KeyA'); nav.right = edge('ArrowRight') || edge('KeyD');
    nav.confirm = edge('Enter') || edge('Space') || edge('KeyE'); nav.back = edge('Escape') || edge('Backspace');

    // --- gamepad
    const pad = getPad();
    if (pad) {
      const b = (i) => pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5);
      const be = (i) => b(i) && !padPrev[i];
      const lx = dz(pad.axes[0] || 0), ly = dz(pad.axes[1] || 0);
      const rx = dz(pad.axes[2] || 0, 0.25), ry = dz(pad.axes[3] || 0, 0.25);
      let anyPad = Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0.1;
      for (let i = 0; i < pad.buttons.length; i++) if (b(i)) anyPad = true;
      if (anyPad) S.device = 'pad';
      if (S.device === 'pad') {
        if (lx || ly) { mx = lx; my = ly; }
        const dpx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0), dpy = (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
        if (!lx && !ly && (dpx || dpy)) { mx = dpx; my = dpy; }
        const rl = Math.hypot(rx, ry);
        if (rl > 0.3) { S.aim.x = rx / rl; S.aim.y = ry / rl; aimActive = true; firing = true; }
        if (b(7)) firing = true;
        if (be(0) || be(4) || be(6)) dash = true;
        if (be(5) || be(2)) ability = true;
        if (be(3)) interact = true;
        if (be(9)) pause = true;
        // menu nav (stick with repeat + dpad)
        const sx = pad.axes[0] || 0, sy = pad.axes[1] || 0;
        navRepeat -= dt;
        const stickDir = Math.abs(sx) > 0.55 || Math.abs(sy) > 0.55;
        if (stickDir && (navRepeat <= 0 || (Math.abs(padAxesPrevNav.x) < 0.55 && Math.abs(padAxesPrevNav.y) < 0.55))) {
          if (Math.abs(sx) > Math.abs(sy)) { if (sx > 0) nav.right = true; else nav.left = true; }
          else { if (sy > 0) nav.down = true; else nav.up = true; }
          navRepeat = 0.22;
        }
        padAxesPrevNav.x = sx; padAxesPrevNav.y = sy;
        if (be(12)) nav.up = true; if (be(13)) nav.down = true; if (be(14)) nav.left = true; if (be(15)) nav.right = true;
        if (be(0)) nav.confirm = true; if (be(1)) nav.back = true;
        if (be(9)) nav.back = nav.back; // start handled as pause
      }
      padPrev = pad.buttons.map((x, i) => b(i));
    }

    // --- touch
    if (touch.move) {
      const dx = touch.move.x - touch.move.ox, dy = touch.move.y - touch.move.oy, d = Math.hypot(dx, dy);
      const m = Math.min(1, d / STICK_R);
      if (d > 6) { mx = dx / d * m; my = dy / d * m; }
      touch.moveVec.x = dx; touch.moveVec.y = dy;
    }
    if (touch.aim) {
      const dx = touch.aim.x - touch.aim.ox, dy = touch.aim.y - touch.aim.oy, d = Math.hypot(dx, dy);
      if (d > 12) { S.aim.x = dx / d; S.aim.y = dy / d; aimActive = true; firing = true; }
      touch.aimVec.x = dx; touch.aimVec.y = dy;
    }
    if (touch.buttons.dash) dash = true;
    if (touch.buttons.ability) ability = true;
    if (touch.buttons.interact) interact = true;
    if (touch.buttons.pause) pause = true;
    touch.buttons = {};

    // normalise move to unit circle
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    S.move.x = mx; S.move.y = my;
    S.firing = firing; S.aimActive = aimActive;
    S.dash = dash; S.ability = ability; S.interact = interact; S.pause = pause;
    S.mute = edge('KeyM'); S.tab = !!k.Tab;
    nav.any = nav.up || nav.down || nav.left || nav.right || nav.confirm || nav.back;
    S.anyKeyEdge = Object.keys(pressedEdge).length > 0;
  };
  /** clear one-frame edges (call at end of frame) */
  S.endFrame = function () { for (const k in pressedEdge) delete pressedEdge[k]; mouse.moved = false; };
  S.isDown = (code) => !!keys[code];
  return S;
})();
