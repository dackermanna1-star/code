// The spray can in the player's hand: input, aiming, strokes, undo, saving,
// the visible mist and the sound hooks. The paint itself lives in
// SprayCanvas; every change goes through the PaintLog so it can be replayed.
//
// Controls: E can in/out · LMB or Space spray (RT on a pad, analog) · RMB
// shake (LT) · wheel width, Shift+wheel flow · 1–4 caps · Tab menu · Z undo.
import * as THREE from 'three';
import { SprayCanvas, CAPS } from './SprayCanvas.js';
import { PaintLog, EV, newFrame, quantizeFrame, readFrame, loadPaint, savePaint } from './PaintLog.js';
import { SprayRaycaster } from './raycast.js';
import { SprayMist } from './SprayMist.js';

export const SPRAY_DEFAULTS = { color: '#d8262b', cap: 'standard', width: 1.0, flow: 0.8, finish: 'gloss', drips: true };
export const CAP_ORDER = ['skinny', 'standard', 'fat', 'calligraphy'];
const SETTINGS_KEY = 'alley-spray-settings-v1';
const AIM_RANGE = 2.6; // m from the eye: beyond this the paint never reaches a surface
const PAINT_RANGE = 1.8; // m from the nozzle

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    return s && typeof s === 'object' ? s : {};
  } catch {
    return {};
  }
}

export class SprayTool {
  constructor(engine) {
    this.engine = engine;
    this.settings = { ...SPRAY_DEFAULTS, ...loadSettings() };
    if (!CAP_ORDER.includes(this.settings.cap)) this.settings.cap = 'standard';
    this.canvas = new SprayCanvas(engine);
    this.log = new PaintLog();
    this.vm = null;
    this.menu = null;
    this.touch = null;
    this.equipped = false;
    this.equipT = 0;
    this.menuOpen = false;
    this.paused = false;
    this.stroke = false;
    this.strokeSettings = null;
    this.idleAcc = 0;
    this.spraying = false;
    this.shaking = false;
    this.btn = { mouse: false, space: false, touch: false, shake: false, pad: 0, padShake: false };
    this.fr = newFrame();
    this.hit = { point: new THREE.Vector3(), normal: new THREE.Vector3(), dist: 0, kind: '' };
    this.aimPoint = new THREE.Vector3();
    this.nozzle = new THREE.Vector3();
    this.nozzleDir = new THREE.Vector3(0, 0, -1);
    this.lin = new THREE.Color(this.settings.color);
    this.lookVel = { x: 0, y: 0 };
    this.prevYaw = null;
    this.prevPitch = null;
    this.vmState = {
      equipped: false, spraying: false, pressure: 0, shaking: false, walkPhase: 0, walkAmp: 0,
      lookVel: this.lookVel, aim: new THREE.Vector3(0, 0, -1), reach: 1, menuOpen: false, time: 0,
    };
    this.seedMist = 12345;
    this.rand = () => ((this.seedMist = (this.seedMist * 16807) % 2147483647) - 1) / 2147483646;
    this._f = new THREE.Vector3();
    this._r = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._m = new THREE.Matrix4();
  }

  async init() {
    const e = this.engine;
    this.ray = new SprayRaycaster(e.world);
    this.mist = new SprayMist(e);
    const saved = await loadPaint();
    if (saved?.data?.length) {
      this.log = PaintLog.deserialize(saved);
      if (this.log.n) {
        this.canvas.init();
        this.replay();
        this.canvas.dryAll();
      }
    }
    this.bindInput();
    return this;
  }

  // ───────────────────────── wiring ─────────────────────────

  attachViewmodel(vm) {
    this.vm = vm;
    this.engine.camera.add(vm.group);
    vm.setColor?.(this.lin);
    vm.setCap?.(this.settings.cap);
    vm.setFinish?.(this.finishParams());
    vm.onShakeClick?.((s) => this.engine.audio?.canRattle?.(s));
  }

  attachMenu(menu) {
    this.menu = menu;
  }

  attachTouch(touch) {
    this.touch = touch;
  }

  finishParams() {
    return this.settings.finish === 'chrome' ? { metal: 0.95, rough: 0.3 } : this.settings.finish === 'matte' ? { metal: 0, rough: 0.75 } : { metal: 0, rough: 0.4 };
  }

  /** Apply a settings change (from the menu, wheel or keys). */
  setSettings(next, from = 'tool') {
    const prevCap = this.settings.cap;
    Object.assign(this.settings, next);
    this.settings.width = clamp(+this.settings.width || 1, 0.3, 3);
    this.settings.flow = clamp(+this.settings.flow || 0.8, 0.1, 1);
    this.lin.set(this.settings.color);
    this.vm?.setColor?.(this.lin);
    this.vm?.setCap?.(this.settings.cap);
    this.vm?.setFinish?.(this.finishParams());
    if (prevCap !== this.settings.cap) this.engine.audio?.capChange?.();
    if (from !== 'menu') this.menu?.setSettings?.(this.settings);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* storage unavailable */
    }
  }

  // ───────────────────────── input ─────────────────────────

  bindInput() {
    const el = this.engine.canvas;
    const active = () => this.engine.player?.enabled && !this.paused;
    addEventListener('keydown', (e) => {
      if (this.menuOpen || !active()) return;
      if (e.repeat && e.code !== 'Space') return;
      switch (e.code) {
        case 'KeyE':
          this.toggle();
          break;
        case 'Tab':
          e.preventDefault();
          if (!this.equipped) this.toggle(true);
          this.openMenu();
          break;
        case 'KeyZ':
          this.undo();
          break;
        case 'Space':
          e.preventDefault();
          this.btn.space = true;
          break;
        case 'Digit1':
        case 'Digit2':
        case 'Digit3':
        case 'Digit4':
          if (this.equipped) this.setSettings({ cap: CAP_ORDER[+e.code.slice(5) - 1] });
          break;
        default:
      }
    });
    addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.btn.space = false;
    });
    el.addEventListener('mousedown', (e) => {
      if (!active() || this.menuOpen) return;
      if (this.relockOnClick && document.pointerLockElement !== el) {
        this.relockOnClick = false;
        this.relock();
        return;
      }
      if (e.button === 0 && document.pointerLockElement === el) this.btn.mouse = true;
      if (e.button === 2) this.btn.shake = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.btn.mouse = false;
      if (e.button === 2) this.btn.shake = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => {
      if (!this.equipped || this.menuOpen || !active()) return;
      const k = Math.exp(-Math.sign(e.deltaY) * 0.09);
      if (e.shiftKey) this.setSettings({ flow: this.settings.flow * k });
      else this.setSettings({ width: this.settings.width * k });
      this.menu?.showIndicator?.(this.settings);
    }, { passive: true });
    addEventListener('blur', () => {
      this.btn.mouse = this.btn.space = this.btn.shake = this.btn.touch = false;
    });
  }

  pollPad() {
    this.btn.pad = 0;
    this.btn.padShake = false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const rt = p.buttons[7], lt = p.buttons[6], y = p.buttons[3];
      if (rt) this.btn.pad = Math.max(this.btn.pad, rt.value ?? (rt.pressed ? 1 : 0));
      if (lt && (lt.value ?? 0) > 0.4) this.btn.padShake = true;
      const yDown = !!y?.pressed;
      if (yDown && !this.padY) this.toggle();
      this.padY = yDown;
      const dUp = !!p.buttons[12]?.pressed, dDown = !!p.buttons[13]?.pressed;
      if ((dUp || dDown) && this.equipped) {
        this.setSettings({ width: this.settings.width * (dUp ? 1.015 : 1 / 1.015) });
        this.menu?.showIndicator?.(this.settings);
      }
    }
  }

  relock() {
    const el = this.engine.canvas;
    try {
      const r = el.requestPointerLock?.({ unadjustedMovement: true });
      if (r && r.catch) r.catch(() => el.requestPointerLock?.()?.catch?.(() => (this.relockOnClick = true)));
    } catch {
      this.relockOnClick = true;
    }
  }

  toggle(force) {
    const on = force ?? !this.equipped;
    if (on === this.equipped) return;
    if (on) this.engine.carry?.cancel?.();
    this.equipped = on;
    this.equipT = 0;
    if (on) {
      this.canvas.init();
      this.engine.audio?.canEquip?.();
    } else {
      this.engine.audio?.canHolster?.();
      this.stopSpray();
    }
    this.touch?.setEquipped?.(on);
  }

  openMenu() {
    if (!this.menu || this.menuOpen) return;
    this.menuOpen = true;
    this.btn.mouse = this.btn.space = this.btn.shake = this.btn.touch = false;
    this.engine.player.inputLocked = true;
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.menu.setStats?.({ coverage: this.canvas.coverage, strokes: this.log.strokes });
    this.menu.setSettings?.(this.settings);
    this.menu.open();
    this.engine.audio?.menuOpen?.(true);
  }

  /** Called by the menu's close action (Tab / Esc / Enter / close button). */
  closeMenu() {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    if (this.menu?.isOpen) this.menu.close();
    this.engine.player.inputLocked = false;
    this.engine.audio?.menuOpen?.(false);
    if (!this.paused) this.relock();
  }

  onPause() {
    this.paused = true;
    this.btn.mouse = this.btn.space = this.btn.shake = this.btn.touch = false;
    if (this.menuOpen) {
      this.menuOpen = false;
      this.menu?.close?.();
      this.engine.player.inputLocked = false;
    }
    this.stopSpray();
  }

  onResume() {
    this.paused = false;
  }

  // ───────────────────────── paint processing ─────────────────────────

  /** Settings as recorded with a stroke (plain data), and their processing form. */
  snapshot() {
    const s = this.settings;
    return { color: s.color, cap: s.cap, width: Math.fround(s.width), flow: Math.fround(s.flow), finish: s.finish, drips: !!s.drips };
  }
  norm(s) {
    const c = new THREE.Color(s.color);
    return { ...s, lin: [Math.fround(c.r), Math.fround(c.g), Math.fround(c.b)] };
  }

  flushIdle() {
    if (this.idleAcc <= 0) return;
    const q = Math.fround(this.idleAcc);
    this.idleAcc = 0;
    this.canvas.processIdle(q);
    this.log.idle(q);
  }

  /** One live frame of paint simulation (spray frame or null). */
  process(dt, fr) {
    const c = this.canvas;
    if (fr) {
      this.flushIdle();
      if (!this.stroke) {
        const snap = this.snapshot();
        this.log.begin(snap);
        this.strokeSettings = this.norm(snap);
        this.stroke = true;
      }
      quantizeFrame(fr);
      c.processSpray(fr, this.strokeSettings);
      c.processTick(fr.dt);
      this.log.spray(fr);
      return;
    }
    if (this.stroke) this.endStroke();
    if (c.active) {
      this.flushIdle();
      const q = Math.fround(dt);
      c.processTick(q);
      this.log.tick(q);
    } else if (c.wet) this.idleAcc += dt;
  }

  endStroke() {
    if (!this.stroke) return;
    this.canvas.endStroke();
    this.log.end();
    this.stroke = false;
    this.scheduleSave();
  }

  /** Rebuild the paint from the log (load, undo). */
  replay() {
    const c = this.canvas;
    const fr = newFrame();
    let cur = null;
    this.log.forEach((t, o, D) => {
      if (t === EV.BEGIN) cur = this.norm(this.log.settings[D[o + 1]] ?? this.snapshot());
      else if (t === EV.SPRAY && cur) {
        readFrame(D, o, fr);
        c.processSpray(fr, cur);
        c.processTick(fr.dt);
      } else if (t === EV.END) c.endStroke();
      else if (t === EV.TICK) c.processTick(D[o + 1]);
      else if (t === EV.IDLE) c.processIdle(D[o + 1]);
    });
    c.flush();
    c.updateMips();
  }

  undo() {
    this.stopSpray();
    this.idleAcc = 0;
    if (!this.log.undoLast()) return;
    this.canvas.init();
    this.canvas.clearAll();
    if (this.log.n) this.replay();
    this.canvas.dryAll();
    this.menu?.setStats?.({ coverage: this.canvas.coverage, strokes: this.log.strokes });
    this.scheduleSave();
  }

  clearAll() {
    this.stopSpray();
    this.idleAcc = 0;
    this.log.clear();
    this.canvas.clearAll();
    this.menu?.setStats?.({ coverage: 0, strokes: 0 });
    this.scheduleSave(0);
  }

  scheduleSave(delay = 1500) {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      if (this.stroke) return this.scheduleSave(delay);
      savePaint(this.log.serialize());
    }, delay);
  }

  stopSpray() {
    if (this.spraying) this.engine.audio?.sprayStop?.();
    this.spraying = false;
    this.endStroke();
  }

  // ───────────────────────── per frame ─────────────────────────

  update(dt) {
    const e = this.engine;
    const cam = e.camera;
    const pl = e.player;
    this.pollPad();
    if (this.equipped) this.equipT += dt;

    // camera angular velocity (for the viewmodel's sway)
    if (pl && this.prevYaw !== null && dt > 0) {
      let dy = pl.yaw - this.prevYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const k = 1 - Math.exp(-dt / 0.05);
      this.lookVel.x += (dy / dt - this.lookVel.x) * k;
      this.lookVel.y += ((pl.pitch - this.prevPitch) / dt - this.lookVel.y) * k;
    }
    if (pl) {
      this.prevYaw = pl.yaw;
      this.prevPitch = pl.pitch;
    }

    // litter in the hand (picked up, being thrown) borrows the arm
    const carry = e.carry;
    const cItem = carry?.item ?? null;
    const carrying = !!cItem;

    // what the view centre is pointing at (in third person the camera sits back
    // over her shoulder, so the view reaches that much further)
    const third = pl?.view === 'third' && !!e.body?.nozzle;
    const extra = third ? (pl.camReach ?? 0) : 0;
    const fwd = cam.getWorldDirection(this._f);
    const hit = (this.equipped || carrying) && this.ray ? this.ray.cast(cam.position, fwd, AIM_RANGE + extra, this.hit) : null;
    this.aimHit = !!hit;
    this.aimPoint.copy(cam.position).addScaledVector(fwd, hit ? hit.dist : 3 + extra);

    const raised = this.equipped && this.equipT > 0.38;
    this.shaking = raised && !this.menuOpen && (this.btn.shake || this.btn.padShake);
    const trigger = Math.max(this.btn.mouse || this.btn.space || this.btn.touch ? 1 : 0, this.btn.pad > 0.08 ? Math.min(1, this.btn.pad * 1.15) : 0);
    const want = raised && !this.menuOpen && !this.paused && !this.shaking && trigger > 0;
    // valve opens over ~70 ms
    this.pressure = want ? Math.min(trigger, (this.pressure ?? 0) + dt / 0.07) : 0;

    // viewmodel (its nozzle is where the paint comes from)
    if (this.vm) {
      const s = this.vmState;
      s.equipped = this.equipped || !!carry?.vmEquipped;
      s.item = carrying ? cItem : 'can';
      s.charge = carry?.charge ?? 0;
      s.throwK = carry?.throwK ?? 0;
      s.spraying = want;
      s.pressure = this.pressure;
      s.shaking = this.shaking;
      s.walkPhase = pl?.phase ?? 0;
      s.walkAmp = clamp((pl?.speed ?? 0) / 1.2, 0, 1);
      s.menuOpen = this.menuOpen;
      s.time = e.time;
      // keep the can off the wall: pull back when the surface is close
      s.reach = hit ? clamp((hit.dist - 0.16) / 0.32, 0, 1) : 1;
      // spray axis in camera space: from the nozzle toward the aim point
      this._m.copy(cam.matrixWorldInverse);
      s.aim.copy(this.aimPoint).sub(this.nozzle).transformDirection(this._m);
      if (!isFinite(s.aim.x) || s.aim.lengthSq() < 1e-6) s.aim.set(0, 0, -1);
      this.vm.update(dt, s);
      this.vm.nozzle(this.nozzle, this.nozzleDir);
      if (e.body) e.body.rightArmHidden = (this.equipped || carrying) && this.vm.visible !== false;
    } else {
      this.nozzle.set(0.12, -0.09, -0.36).applyMatrix4(cam.matrixWorld);
      if (e.body) e.body.rightArmHidden = false;
    }
    // third person: no viewmodel; the paint comes from the can in her hand
    if (third) {
      if (this.vm) this.vm.group.visible = false;
      e.body.nozzle(this.nozzle, this.nozzleDir);
    }
    // she faces where you aim while the can is out; the camera closes in while spraying
    if (pl) {
      const busy = carry && (carry.state === 'charge' || carry.state === 'throw');
      pl.aiming = (this.equipped && !carrying) || busy;
      pl.aimZoom = (want && !carrying) || (busy && carry.state === 'charge');
    }

    // paint
    const dir = this._t.subVectors(this.aimPoint, this.nozzle);
    const nozDist = dir.length();
    dir.divideScalar(Math.max(nozDist, 1e-4));
    const canPaint = want && hit && nozDist < PAINT_RANGE && this.pressure > 0.05;
    let frame = null;
    if (canPaint) {
      frame = this.fr;
      frame.hit.copy(hit.point);
      frame.normal.copy(hit.normal);
      frame.nozzle.copy(this.nozzle);
      frame.right.set(1, 0, 0).transformDirection(cam.matrixWorld);
      frame.pressure = this.pressure;
      frame.dt = dt;
    }
    if (this.canvas.ready || frame) {
      if (frame) this.canvas.init();
      this.process(dt, frame);
    }

    // mist + sound
    if (want) {
      const cap = CAPS[this.settings.cap] ?? CAPS.standard;
      const reach = hit ? Math.max(0.03, nozDist) : 1.4;
      const sigma = (cap.s0 + reach * cap.k) * this.settings.width;
      const lin = [this.lin.r, this.lin.g, this.lin.b];
      this.mist?.spray(dt, this.nozzle, dir, hit ? nozDist : Infinity, hit ? hit.normal : fwd, sigma, this.settings.flow * this.pressure, lin, this.rand);
      const a = e.audio;
      if (!this.spraying) a?.sprayStart?.({ cap: this.settings.cap });
      a?.sprayUpdate?.({ flow: this.settings.flow * this.pressure, cap: this.settings.cap, distance: hit ? nozDist : Infinity, position: { x: this.nozzle.x, y: this.nozzle.y, z: this.nozzle.z } });
      this.spraying = true;
    } else if (this.spraying) {
      this.spraying = false;
      e.audio?.sprayStop?.();
    }
    this.canvas.update(dt);
    this.mist?.update();
  }
}
