// Held item view-model: positioning, sway, use animations and inspect mode.
import * as THREE from 'three';
import { G } from '../game.js';
import { LAYER_VIEWMODEL } from '../core/engine.js';
import { defBounds } from '../items/registry.js';
import { setLayers } from '../items/manager.js';
import { damp, clamp } from '../core/utils.js';
import { tween, Ease } from '../core/tween.js';
import { mat, MAT, rbox, cyl, sph, capsule, at, rot } from '../items/kit.js';
import { SKIN_TONES } from './avatar.js';

const BASE_POS = new THREE.Vector3(0.27, -0.25, -0.5);
const BASE_ROT = new THREE.Euler(0.08, -0.45, 0.04);
const INSPECT_POS = new THREE.Vector3(0, -0.02, -0.42);

// keyframed offsets: f(t) -> [px,py,pz, rx,ry,rz]
const ANIMS = {
  bite: { dur: 0.75, f: (t) => { const k = Math.sin(Math.min(1, t * 1.4) * Math.PI); return [-0.24 * k, 0.17 * k, 0.26 * k, -0.25 * k, 0.4 * k, 0]; } },
  sip: { dur: 1.1, f: (t) => { const k = Math.sin(Math.min(1, t * 1.15) * Math.PI); return [-0.24 * k, 0.16 * k, 0.24 * k, 1.0 * k, 0.4 * k, 0.2 * k]; } },
  spray: { dur: 0.6, f: (t) => { const k = Math.sin(t * Math.PI); return [-0.12 * k, 0.08 * k, -0.08 * k, 0, 0.35 * k, 0]; } },
  shake: { dur: 0.8, f: (t) => { const k = Math.sin(t * Math.PI); return [Math.sin(t * 40) * 0.04 * k, Math.cos(t * 40) * 0.03 * k, 0, 0, 0, Math.sin(t * 40) * 0.2 * k]; } },
  squeeze: { dur: 0.45, f: (t) => { const k = Math.sin(t * Math.PI); return [0, -0.02 * k, 0.03 * k, 0, 0, 0]; } },
  thrust: { dur: 0.45, f: (t) => { const k = Math.sin(t * Math.PI); return [-0.06 * k, 0.04 * k, -0.15 * k, -0.3 * k, 0, 0]; } },
  brush: { dur: 2.4, f: (t) => { const k = Math.min(1, Math.sin(t * Math.PI) * 3); return [-0.22 * k + Math.sin(t * 50) * 0.025 * k, 0.12 * k, 0.24 * k, 0, 1.3 * k, 0]; } },
  raise: { dur: 0.8, f: (t) => { const k = Math.sin(t * Math.PI); return [-0.22 * k, 0.12 * k, 0.1 * k, 0.2 * k, 0.45 * k, 0]; } },
  toss: { dur: 0.7, f: (t) => { const up = Math.sin(t * Math.PI); return [0, up * 0.25, 0, t * Math.PI * 4, 0, 0]; } },
  flick: { dur: 0.35, f: (t) => { const k = Math.sin(t * Math.PI); return [0, 0.02 * k, -0.04 * k, -0.6 * k, 0, 0]; } },
  wave: { dur: 1.0, f: (t) => { const k = Math.sin(t * Math.PI); return [-0.1 * k, 0.15 * k, 0, 0, 0, Math.sin(t * 18) * 0.35 * k]; } },
  read: { dur: 0.6, f: (t) => { const k = Math.min(1, t * 2); return [-0.27 * k, 0.17 * k, 0.12 * k, 0.5 * k, 0.45 * k, 0]; } },
};

export class Hand {
  constructor(camera) {
    this.camera = camera;
    this.anchor = new THREE.Group();
    this.anchor.position.copy(BASE_POS);
    this.anchor.rotation.copy(BASE_ROT);
    this.holder = new THREE.Group(); // scale/center normalization lives here
    this.anchor.add(this.holder);
    camera.add(this.anchor);
    this.held = null;
    this.inspecting = false;
    this.inspectRot = new THREE.Euler();
    this.inspectZoom = 0;
    this.anim = null;
    this.animOff = [0, 0, 0, 0, 0, 0];
    this.sway = new THREE.Vector2();
    this.busy = false;
    this.raiseT = 0; // 0..1 raise-in animation when taking an item
    this.hidden = false;
    this.arm = new THREE.Group();
    this.anchor.add(this.arm);
    this.buildArm();
    G.events?.on('outfitChanged', () => this.buildArm());
  }

  // A stylized hand + sleeve that cradles whatever you're holding.
  buildArm() {
    while (this.arm.children.length) this.arm.remove(this.arm.children[0]);
    const look = G.state?.flags?.avatar || { skin: 1 };
    const skin = mat(SKIN_TONES[(look.skin ?? 1) % SKIN_TONES.length], { rough: 0.6 });
    const topUid = G.state?.outfit?.top;
    const top = topUid && G.items?.get(topUid)?.def.use;
    const sleeveCol = top?.color || '#f2f2f2';
    const longSleeve = ['hoodie', 'sweater', 'jacket', 'coat', 'shirt', 'longsleeve', 'puffer'].includes(top?.style);
    const sleeve = top?.fabric === 'knit' ? MAT.knit(sleeveCol) : MAT.fabric(sleeveCol);
    const g = new THREE.Group();
    // palm under the object, fingers curling around the front, thumb on the side
    const palm = rbox(0.085, 0.03, 0.1, 0.014, skin); palm.rotation.set(0.15, 0.3, -0.25); at(palm, 0.035, -0.125, 0.02); g.add(palm);
    for (let i = 0; i < 4; i++) {
      const f = capsule(0.0095, 0.035, skin); f.rotation.set(Math.PI / 2 - 0.5, 0, 0.15);
      at(f, -0.005 + i * 0.022, -0.105 + i * 0.002, -0.035 - Math.abs(i - 1.5) * 0.004); g.add(f);
      const tip = capsule(0.0085, 0.018, skin); tip.rotation.set(0.25, 0, 0.1); at(tip, -0.004 + i * 0.022, -0.082, -0.058); g.add(tip);
    }
    const thumb = capsule(0.011, 0.04, skin); thumb.rotation.set(0.2, 0, -0.9); at(thumb, -0.035, -0.095, 0.035); g.add(thumb);
    const wrist = cyl(0.028, 0.03, 0.06, skin, 14); wrist.rotation.set(1.1, 0.3, -0.5); at(wrist, 0.075, -0.15, 0.08); g.add(wrist);
    const fore = cyl(longSleeve ? 0.045 : 0.034, longSleeve ? 0.05 : 0.038, 0.32, longSleeve ? sleeve : skin, 16); fore.rotation.set(1.15, 0.3, -0.55); at(fore, 0.16, -0.24, 0.2); g.add(fore);
    if (longSleeve) { const cuff = cyl(0.048, 0.048, 0.03, sleeve, 16); cuff.rotation.copy(fore.rotation); at(cuff, 0.095, -0.17, 0.105); g.add(cuff); }
    else { const s2 = cyl(0.055, 0.058, 0.12, sleeve, 16); s2.rotation.copy(fore.rotation); at(s2, 0.27, -0.36, 0.33); g.add(s2); }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } o.layers.set(LAYER_VIEWMODEL); });
    this.arm.add(g);
    this.arm.visible = !!this.held;
    void sph; void rot;
  }

  take(inst) {
    if (this.held) this.release(true);
    this.held = inst;
    G.items.setLoc(inst, 'hand');
    const o = inst.object;
    o.parent?.remove(o);
    this.holder.add(o);
    setLayers(o, LAYER_VIEWMODEL);
    o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.setScalar(1);
    if (inst.blob) inst.blob.visible = false;
    const b = defBounds(inst.def);
    const h = inst.def.hold || {};
    const k = h.scale ?? Math.min(1.4, 0.26 / Math.max(0.05, b.max));
    this.holder.scale.setScalar(k);
    this.holder.position.set(-b.center.x * k, -b.center.y * k, -b.center.z * k);
    this.holder.rotation.set(...(h.rot || [0, 0, 0]));
    if (h.pos) this.holder.position.add(new THREE.Vector3(...h.pos));
    this.raiseT = 0;
    this.arm.visible = true;
    // tuck the hand under the item regardless of its normalized size
    G.behaviors.onHold?.(inst);
    G.events.emit('held', inst);
  }

  // Remove the item from the hand without placing it anywhere (caller decides)
  release(silent = false) {
    const inst = this.held;
    if (!inst) return null;
    G.behaviors.onUnhold?.(inst);
    this.held = null;
    this.arm.visible = false;
    this.inspecting = false;
    this.busy = false;
    this.anim = null;
    if (inst.built) {
      const o = inst.object;
      this.holder.remove(o);
      setLayers(o, 0);
      if (inst.blob) inst.blob.visible = true;
    }
    G.events.emit('held', null);
    G.ui.hideInspect?.();
    return inst;
  }

  play(name, opts = {}) {
    const a = ANIMS[name];
    if (!a) return Promise.resolve();
    const dur = opts.duration || a.dur;
    return new Promise((res) => {
      this.anim = { f: a.f, t: 0, dur, res, onMid: opts.onMid, midDone: false, mid: opts.mid ?? 0.45 };
    });
  }

  // world position slightly in front of the held item (for particles)
  tipWorld(offset = new THREE.Vector3(0, 0.1, 0)) {
    if (!this.held?.built) return this.camera.getWorldPosition(new THREE.Vector3());
    const p = offset.clone();
    this.held.object.localToWorld(p);
    // the view-model is drawn with its own camera at the same transform, so this is valid in world space
    return p;
  }
  mouthWorld() {
    const p = new THREE.Vector3(0, -0.08, -0.18);
    return this.camera.localToWorld(p);
  }
  forwardWorld() { return this.camera.getWorldDirection(new THREE.Vector3()); }

  update(dt) {
    const inp = G.input;
    // sway from looking around
    const tx = clamp(-inp.dx * 0.0009, -0.06, 0.06), ty = clamp(inp.dy * 0.0009, -0.06, 0.06);
    this.sway.x = damp(this.sway.x, this.inspecting ? 0 : tx, 10, dt);
    this.sway.y = damp(this.sway.y, this.inspecting ? 0 : ty, 10, dt);
    // animation
    if (this.anim) {
      const a = this.anim;
      a.t += dt / a.dur;
      if (!a.midDone && a.t >= a.mid) { a.midDone = true; a.onMid?.(); }
      if (a.t >= 1) { this.anim = null; this.animOff = [0, 0, 0, 0, 0, 0]; a.res(); }
      else this.animOff = a.f(a.t);
    }
    // raise-in
    this.raiseT = Math.min(1, this.raiseT + dt * 3.5);
    const raise = 1 - Ease.outBack(this.raiseT);
    // inspect mode (hold right mouse)
    const wantInspect = !!this.held && inp.isDown('Mouse2') && inp.locked && !G.ui.blocking && !G.placement.active && !this.anim;
    if (wantInspect !== this.inspecting) {
      this.inspecting = wantInspect;
      if (wantInspect) { this.inspectRot.set(0, 0, 0); this.inspectZoom = 0; G.ui.showInspect?.(this.held); G.audio.play('paper', { volume: 0.3 }); }
      else G.ui.hideInspect?.();
    }
    const target = this.inspecting ? INSPECT_POS.clone().add(new THREE.Vector3(0, 0, this.inspectZoom)) : BASE_POS.clone();
    const bob = G.player._bobAmt || 0;
    const bt = G.player.bob;
    if (!this.inspecting) {
      target.x += Math.cos(bt) * 0.012 * bob + this.sway.x;
      target.y += Math.abs(Math.sin(bt)) * 0.012 * bob - this.sway.y - raise * 0.35;
      target.add(new THREE.Vector3(this.animOff[0], this.animOff[1], this.animOff[2]));
    }
    const k = 1 - Math.exp(-dt * 16);
    this.anchor.position.lerp(target, k);
    if (this.inspecting) {
      this.inspectRot.y += inp.dx * 0.008;
      this.inspectRot.x += inp.dy * 0.008;
      this.inspectZoom = clamp(this.inspectZoom + inp.wheel * 0.03, -0.15, 0.15);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.inspectRot.x, this.inspectRot.y, 0));
      this.anchor.quaternion.slerp(q, k);
    } else {
      const e = new THREE.Euler(BASE_ROT.x + this.animOff[3] + this.sway.y * 2, BASE_ROT.y + this.animOff[4] + this.sway.x * 2, BASE_ROT.z + this.animOff[5]);
      this.anchor.quaternion.slerp(new THREE.Quaternion().setFromEuler(e), k);
    }
    this.anchor.visible = !this.hidden;
    this.arm.visible = !!this.held && !this.inspecting;
  }
}
