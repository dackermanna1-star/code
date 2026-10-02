// Keyboard / mouse / gamepad / touch input, normalised into a per-frame state.
export class Input {
  constructor(target) {
    this.target = target;
    this.keys = new Set();
    this.pressed = new Set();   // keys pressed since last frame
    this.mdx = 0; this.mdy = 0;
    this.locked = false;
    this.clicked = false;
    this.mouse = { x: 0, y: 0, moved: false };
    this.touch = { active: false, moveId: null, lookId: null, mx: 0, my: 0, ox: 0, oy: 0, ldx: 0, ldy: 0, buttons: new Set(), pressed: new Set() };
    this.padPrev = [];
    this.usingPad = false;
    this.isTouch = false;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this.usingPad = false;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.target;
      if (!this.locked && this.onUnlock) this.onUnlock();
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) { this.mdx += e.movementX; this.mdy += e.movementY; }
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.moved = true;
    });
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.clicked = true;
      this.usingPad = false;
    });
  }

  lock() {
    if (this.isTouch) return;
    try {
      const p = this.target.requestPointerLock && this.target.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignore */ }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }

  // Builds the frame state; call once per frame.
  poll() {
    const s = {
      mx: 0, mz: 0, turn: 0, lookX: 0, lookY: 0, run: false, crouchHold: false,
      crouchToggle: false, use: false, climb: false, pause: false, phone: false,
      menuUp: false, menuDown: false, menuLeft: false, menuRight: false, menuOk: false, menuBack: false,
      click: this.clicked,
    };
    if (this.down('KeyW')) s.mz += 1;
    if (this.down('KeyS', 'ArrowDown')) s.mz -= 1;
    if (this.down('KeyA')) s.mx -= 1;
    if (this.down('KeyD')) s.mx += 1;
    if (this.down('ArrowLeft')) s.turn -= 1;
    if (this.down('ArrowRight')) s.turn += 1;
    s.run = this.down('ShiftLeft', 'ShiftRight');
    s.crouchHold = this.down('ControlLeft', 'ControlRight');
    s.crouchToggle = this.hit('KeyC');
    s.use = this.hit('KeyE', 'KeyF', 'Enter') || (this.locked && this.clicked);
    s.climb = this.hit('Space');
    s.pause = this.hit('Escape', 'KeyP', 'Tab');
    s.phone = this.hit('ArrowUp', 'KeyQ');
    s.menuUp = this.hit('ArrowUp', 'KeyW');
    s.menuDown = this.hit('ArrowDown', 'KeyS');
    s.menuLeft = this.hit('ArrowLeft', 'KeyA');
    s.menuRight = this.hit('ArrowRight', 'KeyD');
    s.menuOk = this.hit('Enter', 'Space', 'KeyE', 'NumpadEnter');
    s.menuBack = this.hit('Escape', 'Backspace');
    s.lookX = this.mdx; s.lookY = this.mdy;
    this.mdx = 0; this.mdy = 0;
    this.pollPad(s);
    this.pollTouch(s);
    this.pressed.clear();
    this.clicked = false;
    return s;
  }

  pollPad(s) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && [...pads].find((g) => g && g.connected);
    if (!p) return;
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    const hit = (i) => b(i) && !this.padPrev[i];
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    const lx = dz(p.axes[0] || 0), ly = dz(p.axes[1] || 0), rx = dz(p.axes[2] || 0), ry = dz(p.axes[3] || 0);
    if (lx || ly || rx || ry || p.buttons.some((x) => x.pressed)) this.usingPad = true;
    s.mx += lx; s.mz -= ly;
    s.padLookX = rx; s.padLookY = ry;
    if (b(12)) s.mz += 1;
    if (b(13)) s.mz -= 1;
    if (b(14)) s.turn -= 1;
    if (b(15)) s.turn += 1;
    s.run = s.run || b(7) || b(10) || b(4);
    s.crouchToggle = s.crouchToggle || hit(1);
    s.use = s.use || hit(0);
    s.climb = s.climb || hit(2);
    s.pause = s.pause || hit(9);
    s.phone = s.phone || hit(3) || hit(8);
    s.menuUp = s.menuUp || hit(12) || (ly < -0.6 && !this.padStick);
    s.menuDown = s.menuDown || hit(13) || (ly > 0.6 && !this.padStick);
    s.menuLeft = s.menuLeft || hit(14);
    s.menuRight = s.menuRight || hit(15);
    s.menuOk = s.menuOk || hit(0) || hit(9);
    s.menuBack = s.menuBack || hit(1);
    this.padStick = Math.abs(ly) > 0.6;
    this.padPrev = p.buttons.map((x) => x.pressed);
  }

  // ---- touch: left half = move stick, right half = look; buttons are DOM elements
  attachTouch(root) {
    this.isTouch = true;
    const el = root;
    const area = (t) => (t.clientX < window.innerWidth * 0.45 ? 'move' : 'look');
    el.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.target.closest && t.target.closest('.tbtn')) continue;
        const a = area(t);
        if (a === 'move' && this.touch.moveId === null) {
          this.touch.moveId = t.identifier; this.touch.ox = t.clientX; this.touch.oy = t.clientY; this.touch.mx = 0; this.touch.my = 0;
        } else if (a === 'look' && this.touch.lookId === null) {
          this.touch.lookId = t.identifier; this.touch.lx = t.clientX; this.touch.ly = t.clientY; this.touch.lt = performance.now(); this.touch.lmoved = 0;
        }
      }
      this.touch.active = true;
      e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touch.moveId) {
          const R = 60;
          let dx = (t.clientX - this.touch.ox) / R, dy = (t.clientY - this.touch.oy) / R;
          const l = Math.hypot(dx, dy);
          if (l > 1) { dx /= l; dy /= l; }
          this.touch.mx = dx; this.touch.my = dy;
        } else if (t.identifier === this.touch.lookId) {
          const dx = t.clientX - this.touch.lx, dy = t.clientY - this.touch.ly;
          this.touch.ldx += dx; this.touch.ldy += dy;
          this.touch.lmoved += Math.abs(dx) + Math.abs(dy);
          this.touch.lx = t.clientX; this.touch.ly = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touch.moveId) { this.touch.moveId = null; this.touch.mx = 0; this.touch.my = 0; }
        if (t.identifier === this.touch.lookId) {
          if (this.touch.lmoved < 10 && performance.now() - this.touch.lt < 300) this.touch.pressed.add('tap');
          this.touch.lookId = null;
        }
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }

  touchButton(name, down) {
    if (down) { this.touch.buttons.add(name); this.touch.pressed.add(name); } else this.touch.buttons.delete(name);
  }

  pollTouch(s) {
    if (!this.isTouch) return;
    const T = this.touch;
    s.mx += T.mx; s.mz -= T.my;
    s.lookX += T.ldx * 2.2; s.lookY += T.ldy * 2.2;
    T.ldx = 0; T.ldy = 0;
    if (T.buttons.has('run')) s.run = true;
    if (T.pressed.has('crouch')) s.crouchToggle = true;
    if (T.pressed.has('use') || T.pressed.has('tap')) { s.use = true; s.menuOk = true; }
    if (T.pressed.has('climb')) s.climb = true;
    if (T.pressed.has('menu')) s.pause = true;
    if (T.pressed.has('phone')) s.phone = true;
    if (T.pressed.has('up')) s.menuUp = true;
    if (T.pressed.has('down')) s.menuDown = true;
    if (T.pressed.has('back')) s.menuBack = true;
    T.pressed.clear();
  }
}
