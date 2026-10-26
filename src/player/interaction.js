// Aim-to-interact: raycasts from the crosshair, shows contextual prompts and
// routes keys to fixtures, items and the held item.
import * as THREE from 'three';
import { G } from '../game.js';
import { findInteractable } from '../core/utils.js';

const _ray = new THREE.Raycaster();
const REACH = 2.7;
const KEYMAP = { E: 'KeyE', F: 'KeyF', R: 'KeyR', X: 'KeyX', LMB: 'Mouse0', Q: 'KeyQ', V: 'KeyV', T: 'KeyT' };

export class Interaction {
  constructor() {
    this.focus = null;
    this.focusHit = null;
    this.actions = [];
    this.heldActions = [];
    this.holding = null; // {action, key, t}
    this.throwCharge = 0;
    this.charging = false;
    this._sig = '';
  }

  update(dt) {
    const inp = G.input;
    const blocked = G.ui.blocking || !inp.locked;
    if (G.placement.active) {
      this._setFocus(null);
      if (!blocked) G.placement.update(dt);
      G.ui.setPrompt(null, [], []);
      return;
    }
    if (blocked || G.player.mode === 'returning' || G.hand.inspecting) {
      this._setFocus(null);
      G.ui.setPrompt(null, [], this._heldActions());
      this.holding = null; G.ui.setHoldProgress(0);
      return;
    }
    // raycast
    _ray.setFromCamera(new THREE.Vector2(0, 0), G.camera);
    _ray.far = REACH;
    _ray.layers.set(0);
    const hits = _ray.intersectObjects([G.apartment.root, G.items.root], true);
    let found = null, hit = null;
    for (const h of hits) {
      if (!h.object.visible) continue;
      const it = findInteractable(h.object);
      if (it) { found = it; hit = h; }
      break; // first visible hit only (walls block)
    }
    if (G.player.occ && !G.player.occ.seat) found = null; // busy (showering etc.)
    this._setFocus(found, hit);
    this.actions = found ? (found.getActions() || []).filter(Boolean) : [];
    this.heldActions = this._heldActions();
    // resolve conflicts: focus actions win over held actions for the same key
    const focusKeys = new Set(this.actions.map((a) => a.key));
    const held = this.heldActions.filter((a) => !focusKeys.has(a.key) || a.key === 'LMB' || a.key === 'G');
    G.ui.setPrompt(found, this.actions, held);
    // key handling
    const all = [...this.actions, ...held.filter((a) => !focusKeys.has(a.key))];
    for (const a of all) {
      if (a.disabled) continue;
      const code = KEYMAP[a.key];
      if (!code) continue;
      if (a.hold) {
        if (inp.wasPressed(code)) this.holding = { a, code, t: 0 };
      } else if (inp.wasPressed(code)) {
        inp.consume(code);
        this._run(a);
        return;
      }
    }
    if (this.holding) {
      const h = this.holding;
      if (!inp.isDown(h.code) || !all.some((a) => a.label === h.a.label)) { this.holding = null; G.ui.setHoldProgress(0); }
      else {
        h.t += dt;
        G.ui.setHoldProgress(h.t / h.a.hold);
        if (h.t >= h.a.hold) { this.holding = null; G.ui.setHoldProgress(0); this._run(h.a); }
      }
    }
    // drop / throw held item
    if (G.hand.held && !G.hand.busy) {
      if (inp.wasPressed('KeyG')) { this.charging = true; this.throwCharge = 0; }
      if (this.charging) {
        this.throwCharge += dt;
        G.ui.setThrowCharge(Math.min(1, this.throwCharge / 1.0));
        if (!inp.isDown('KeyG')) { this.charging = false; G.ui.setThrowCharge(0); this.throwHeld(this.throwCharge); }
      }
    } else if (this.charging) { this.charging = false; G.ui.setThrowCharge(0); }
  }

  _run(a) {
    try { a.run(); } catch (e) { console.error('action failed', a.label, e); }
  }

  _setFocus(it, hit = null) {
    this.focusHit = hit;
    if (it === this.focus) return;
    this.focus = it;
    const target = it?.outlineTarget?.();
    G.engine.setOutline(target ? [target] : []);
  }

  _heldActions() {
    const inst = G.hand.held;
    if (!inst) return [];
    const acts = [];
    const beh = G.behaviors.heldActions(inst) || [];
    acts.push(...beh);
    const used = new Set(acts.map((a) => a.key));
    if (!used.has('F')) acts.push({ key: 'F', label: inst.def.place === 'wall' ? 'Hang on wall' : 'Place', run: () => G.placement.begin(inst, { from: 'hand' }) });
    acts.push({ key: 'G', label: 'Drop · hold to throw', run: () => {} , passive: true });
    if (!used.has('X')) acts.push({ key: 'X', label: 'Stash', run: () => G.items.toStorage(inst) });
    acts.push({ key: 'RMB', label: 'Inspect', passive: true, run: () => {} });
    return acts;
  }

  throwHeld(charge) {
    const inst = G.hand.held;
    if (!inst) return;
    const throwing = charge > 0.22;
    const start = G.hand.tipWorld(new THREE.Vector3(0, 0, 0));
    const fwd = G.camera.getWorldDirection(new THREE.Vector3());
    // don't start inside a wall: pull the spawn point back toward the camera if needed
    const camPos = G.camera.getWorldPosition(new THREE.Vector3());
    _ray.set(camPos, start.clone().sub(camPos).normalize());
    _ray.far = camPos.distanceTo(start) + 0.15;
    const blockers = _ray.intersectObjects(G.apartment.solids, false);
    if (blockers.length) start.copy(camPos).addScaledVector(fwd, Math.max(0.05, blockers[0].distance - 0.2));
    G.hand.release();
    const power = throwing ? 2.5 + Math.min(1, charge) * 7 : 0.8;
    const vel = fwd.clone().multiplyScalar(power);
    vel.y += throwing ? 1.2 : 0.4;
    const pv = G.player.vel; vel.x += pv.x * 0.5; vel.z += pv.z * 0.5;
    G.physics.launch(inst, start, vel);
    G.audio.play('whoosh', { pos: start, volume: throwing ? 0.8 : 0.3, pitch: throwing ? 1 : 1.4 });
    G.events.emit('act', throwing ? 'throw' : 'drop', { item: inst.def.id, power });
  }
}
