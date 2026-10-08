// What's in your hands, and using it. Guns: a round in the chamber and a
// magazine (or a tube of shells, or a bolt rifle's five), the fire rate,
// aiming down the sights (a real scope for the M24 and the ACOG), recoil that
// climbs, spread that grows when you move, holding your breath, jams when a
// gun is worn out. Reloading swaps in your fullest magazine - or, with none,
// thumbs loose rounds in one at a time. Melee: quick swings and heavy ones
// you wind up, blocking, and your fists when you've nothing better. Anything
// else in your hands you use: eat it, drink it, bandage with it, switch it on.
import * as THREE from 'three';
import { O } from '../state.js';
import { def, makeItem, condOf } from './inventory.js';
import { ITEMS } from './items.js';
import { buildGun } from '../../warzone/guns.js';
import { ViewModel } from '../../warzone/viewmodel.js';
import { playShot, playMech } from '../../warzone/fx.js';
import { itemModel } from './loot.js';

const DEG = Math.PI / 180;
const FISTS = { dmg: 9, heavy: 18, reach: 3.4, speed: 2.4, cost: 8, kind: 'blunt' };

export class Hands {
  constructor(world) {
    this.world = world;
    // guns: the shooter's view model (its own scene, drawn on top of the world)
    world.overlays = O.post.overlays;
    this.vm = new ViewModel(world);
    this.vm.setAppearance({ colors: { rightArm: 125, leftArm: 125 }, shirt: { color: '#8a8a7a' } });
    // everything else: arms holding the thing, in the post's view-model scene
    this.held = new THREE.Group();
    this.armR = this._arm(); this.armL = this._arm();
    this.itemHolder = new THREE.Group();
    this.held.add(this.armR, this.armL, this.itemHolder);
    O.post.vmScene.add(this.held);
    this.hemi = new THREE.HemisphereLight(0xfff4e0, 0x6a5a48, 1.4); O.post.vmScene.add(this.hemi);
    this.sunL = new THREE.DirectionalLight(0xfff0d8, 1.8); this.sunL.position.set(0.6, 1, 0.4); O.post.vmScene.add(this.sunL);
    this.cur = null; // the item in hands
    this.mode = 'fists';
    this.aiming = false; this.aim = 0;
    this.kick = 0; this.kickV = 0; this.kickYaw = 0;
    this.cool = 0;
    this.busy = null; // a reload or other animation
    this.swing = null; // a melee swing: { t, dur, heavy, hit }
    this.charge = 0;
    this.blocking = false;
    this.breath = 0; this.breathLeft = 6;
    this.fireMode = 'auto';
    this.supp = 0;
    this.adsFov = 50; this.adsSens = 1;
    this.light = new THREE.SpotLight(0xfff2d8, 0, 110, 0.42, 0.55, 1.3);
    this.light.castShadow = true; this.light.shadow.mapSize.set(512, 512); this.light.shadow.bias = -0.0005; this.light.shadow.camera.near = 0.5;
    world.scene.add(this.light); world.scene.add(this.light.target);
    this.bobT = 0;
  }
  _arm() {
    const g = new THREE.Group();
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 1), new THREE.MeshStandardMaterial({ color: 0x8a8a7a, roughness: 0.8 }));
    sleeve.position.z = 0.5; g.add(sleeve);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.078, 0.07), new THREE.MeshStandardMaterial({ color: 0xe0b896, roughness: 0.75 }));
    hand.position.z = 0.035; g.add(hand);
    g.userData = { sleeve, hand };
    return g;
  }
  /** Sleeve colour from what you're wearing. */
  setSleeves(col) {
    for (const a of [this.armR, this.armL]) a.userData.sleeve.material.color.set(col);
    if (this.vm.arms) for (const a of this.vm.arms) { a.userData.arm.material.color.set(col); a.children[1].material.color.set(0xe0b896); }
  }

  get item() { return O.inv.slots.hands; }

  /** Something new came into your hands (or left them). */
  refresh() {
    const it = this.item;
    if (it ? it === this.cur && this.curUid === it.uid : !this.cur && this.mode === 'fists') return;
    this.cur = it; this.curUid = it?.uid;
    this.busy = null; this.swing = null; this.charge = 0; this.blocking = false; this.info = null; this.aimToggle = false;
    this.vm.setWeapon(null);
    this.itemHolder.clear();
    const d = it ? def(it) : null;
    if (d?.gun) {
      this.mode = 'gun';
      this._buildGun();
    } else if (d?.melee) { this.mode = 'melee'; this._holdModel(it); }
    else if (it) { this.mode = 'item'; this._holdModel(it); }
    else this.mode = 'fists';
    this.equipT = 0;
    O.audio?.equip(this.mode);
    O.hud?.changed();
  }
  _buildGun() {
    const it = this.cur, d = def(it);
    const atts = Object.values(it.attach || {}).filter(Boolean);
    const info = buildGun(d.gun, atts.filter((a) => d.attach.includes(a)));
    if (d.tint) info.group.traverse((o) => { if (o.isMesh && o.material?.metalness > 0.5) { o.material = o.material.clone(); o.material.color.setHex(d.tint); } });
    info.pistol = !!d.pistol;
    if (d.scope) info.scope = 'sniper';
    info.stats = { ...info.stats, bolt: d.bolt, suppressed: !!it.attach?.muzzle };
    this.vm.setWeapon(info);
    this.info = info;
    if (info.mag) info.mag.visible = !!it.mag || !!d.internal;
    this.adsFov = info.scope === 'sniper' ? 13 : info.scope === 'acog' ? 22 : atts.includes('reddot') || atts.includes('holo') ? 46 : d.pistol ? 58 : 52;
  }
  _holdModel(it) {
    const m = itemModel(it);
    m.scale.setScalar(0.33);
    const d = def(it);
    // hold it in the right hand, pointing up/forward
    if (d.melee) { m.rotation.set(0, Math.PI / 2, Math.PI / 2 - 0.25); m.position.set(0, 0, 0); }
    else { m.rotation.set(0.3, 0.4, 0); m.position.set(0, -0.02, 0); }
    m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    this.itemHolder.add(m);
  }

  // --- the hotbar and putting things away --------------------------------------------------------------------------------------
  /** Take an item into your hands (whatever was there goes back where this came from, or anywhere it fits). */
  take(it) {
    const inv = O.inv;
    if (!it || it === inv.slots.hands) return;
    if (this.busy || O.actions.cur) { O.actions.cancel(); this.busy = null; }
    const from = inv.locate(it);
    const old = inv.slots.hands;
    inv.detach(it);
    if (old) {
      inv.slots.hands = null;
      let ok = false;
      if (from?.slot && from.slot !== 'hands' && inv.slotFor(old) === from.slot && !inv.slots[from.slot]) { inv.slots[from.slot] = old; ok = true; }
      if (!ok && from?.grid && from.grid.space(old)) { const sp = from.grid.space(old); from.grid.put(old, sp[0], sp[1], sp[2]); ok = true; }
      if (!ok) ok = inv.add(old);
      if (!ok) { // no room: put the new one back and keep the old
        if (from?.slot) inv.slots[from.slot] = it; else if (from?.grid) { const sp = from.grid.space(it); if (sp) from.grid.put(it, sp[0], sp[1], sp[2]); else inv.add(it); }
        inv.slots.hands = old; O.hud?.note('No room to put away the ' + def(old).name); return;
      }
    }
    inv.slots.hands = it;
    inv.changed();
    this.refresh();
  }
  holster() {
    const inv = O.inv, old = inv.slots.hands;
    if (!old) return;
    inv.slots.hands = null;
    if (!inv.add(old)) { inv.slots.hands = old; O.hud?.note('No room to put it away'); return; }
    this.refresh();
  }

  // --- each frame ----------------------------------------------------------------------------------------------------------------
  update(dt, input) {
    const P = O.player, it = this.item;
    if (it !== this.cur || it?.uid !== this.curUid) this.refresh();
    const d = it ? def(it) : null;
    this.equipT = Math.min(1, (this.equipT ?? 1) + dt / 0.5);
    this.cool = Math.max(0, this.cool - dt);
    this.supp = Math.max(0, this.supp - dt * 0.5);
    // recoil settles back (most of the way)
    this.kickV += (-this.kick * 60 - this.kickV * 14) * dt;
    this.kick += this.kickV * dt;
    // hotbar and holster
    for (let i = 0; i < 9; i++) if (input.pressed.has('code:Digit' + (i + 1)) || input.pressed.has(String(i + 1))) { const h = O.inv.hot(i); if (h) { if (h === it) this.holster(); else this.take(h); } }
    if (input.pressed.has('h')) this.holster();
    if (input.pressed.has('b') && d?.auto) { this.fireMode = this.fireMode === 'auto' ? 'semi' : 'auto'; playMech('slide'); O.hud?.note(this.fireMode === 'auto' ? 'Full auto' : 'Single shot', 1.2); }
    if (input.pressed.has('l')) this.toggleLight();
    const canAct = P.alive && !P.ladder && !P.swimming && !O.actions.cur;
    // aiming
    // aim: hold the right button, or T to stay aimed (sprinting, or putting the gun away, ends it)
    if (input.pressed.has('t') && (this.mode === 'gun' || d?.zoom)) this.aimToggle = !this.aimToggle;
    if (P.mode === 'sprint' || !(this.mode === 'gun' || d?.zoom)) this.aimToggle = false;
    const wantAim = (input.buttons.has(2) || this.aimToggle) && canAct && P.mode !== 'sprint' && (this.mode === 'gun' || d?.zoom);
    this.aiming = wantAim && !this.busy;
    this.aim += ((this.aiming ? 1 : 0) - this.aim) * Math.min(1, dt * 12);
    if (d?.zoom && this.aiming) this.adsFov = 72 / d.zoom;
    // hold breath on a scope
    const scoped = this.aiming && (this.info?.scope === 'sniper' || this.info?.scope === 'acog' || d?.zoom);
    if (scoped && input.keys.has('shift') && this.breathLeft > 0) { this.breath = Math.min(1, this.breath + dt * 4); this.breathLeft -= dt; }
    else { this.breath = Math.max(0, this.breath - dt * 3); if (!input.keys.has('shift')) this.breathLeft = Math.min(6, this.breathLeft + dt * 0.8); }
    this.adsSens = this.aiming ? Math.min(1, this.adsFov / 60) * 0.9 + 0.1 : 1;
    if (this.mode === 'gun') this._gun(dt, input, canAct);
    else if (this.mode === 'melee' || this.mode === 'fists') this._melee(dt, input, canAct, d?.melee || FISTS);
    else if (this.mode === 'item' && canAct && input.clicked.has(0)) this.use(it);
    this._light(dt);
    this._viewmodel(dt);
  }

  // --- guns ------------------------------------------------------------------------------------------------------------------------
  _gun(dt, input, canAct) {
    const it = this.cur, d = def(it);
    const want = d.auto && this.fireMode === 'auto' ? input.buttons.has(0) : input.clicked.has(0);
    if (want && canAct && O.player.mode !== 'sprint' && this.equipT > 0.7) {
      if (this.busy?.kind === 'shell') this.busy.stop = true; // stop loading shells to shoot
      else if (!this.busy && this.cool <= 0) this._fire(it, d);
    }
    if (input.pressed.has('r') && canAct && !this.busy) this.reload();
    // busy: a reload or a pump/bolt cycle playing out
    if (this.busy) {
      this.busy.t += dt;
      const B = this.busy;
      if (B.kind === 'shell' && B.t >= B.dur) {
        // one shell in, then the next (until full, out, or you want to shoot)
        if (O.inv.takeRounds(d.cal, 1)) it.rounds++; playMech('shell');
        if (!B.stop && it.rounds < d.internal && O.inv.rounds(d.cal) > 0) { B.t = 0; this.vm.play('shell', B.dur); }
        else { this.busy = null; if (!it.chamber && it.rounds > 0) this._cycle(it, d); }
      } else if (B.t >= B.dur) { const f = B.done; this.busy = null; f?.(); }
    }
  }
  _fire(it, d) {
    if (it.cond <= 0.08) { O.hud?.note('This gun is ruined', 2); playMech('dry'); this.cool = 0.4; return; }
    if (it.jammed) { playMech('dry'); this.cool = 0.3; O.hud?.note('Jammed - press R to clear it', 2); return; }
    if (!it.chamber) { playMech('dry'); this.cool = 0.3; if (!this._dryNoted) { this._dryNoted = true; O.hud?.note(d.internal ? 'Empty - press R to load' : it.mag ? 'Empty - press R to reload' : 'No magazine', 2); } return; }
    this._dryNoted = false;
    it.chamber = false;
    const P = O.player, cam = O.world.camera;
    const sup = !!it.attach?.muzzle;
    // where it goes: from your eye, along your aim (plus the spread)
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const eye = P.eyePos;
    const moving = Math.min(1, P.moving);
    let spreadDeg = (this.aim > 0.5 ? d.spread[1] : d.spread[0]) * (it.attach?.side === 'laser' && this.aim < 0.5 ? 0.65 : 1);
    spreadDeg += moving * (this.aim > 0.5 ? 1.2 : 2.5) + (P.grounded ? 0 : 6) + (O.survival.sway * 0.8);
    spreadDeg *= P.stance === 'prone' ? 0.6 : P.stance === 'crouch' ? 0.8 : 1;
    const condMul = 1 + (1 - it.cond) * 0.6;
    O.combat.shoot(eye, dir, { dmg: d.dmg * (sup ? 0.92 : 1), vel: d.vel * 1.15, shooter: P, pellets: d.pellets, spread: (d.pellets ? d.spread[0] * 0.55 : spreadDeg) * condMul + (d.pellets ? 0 : 0), armorPierce: d.cal === '.308' || d.cal === '7.62x39' ? 0.35 : d.cal === '5.56x45' ? 0.25 : 0 });
    // recoil: the view climbs, the gun kicks
    const rec = d.recoil * (it.attach?.under === 'foregrip' ? 0.75 : 1) * (P.stance === 'prone' ? 0.55 : P.stance === 'crouch' ? 0.8 : 1);
    this.kickV += rec * 0.9;
    P.pitch += rec * 0.006 * (this.aim > 0.5 ? 1 : 1.3);
    P.yaw += (Math.random() - 0.5) * rec * 0.004;
    this.vm.fire(Math.min(1.5, rec * 0.5 + 0.3));
    playShot(d.sound, null, sup, true);
    const mz = this.vm.muzzleWorld(cam, 3.0);
    if (!sup) O.fx.muzzle(mz.x, mz.y, mz.z);
    O.combat.noise(P.pos.x, P.pos.y, P.pos.z, d.noise * (sup ? 0.25 : 1), P);
    this.cool = 60 / d.rpm;
    it.cond = Math.max(0, it.cond - 0.0009 * (d.dmg > 50 ? 2 : 1));
    if (it.attach?.muzzle) { /* the suppressor wears too */ }
    // a jam (worn guns jam)
    const jam = it.cond > 0.7 ? 0.002 : it.cond > 0.5 ? 0.01 : it.cond > 0.3 ? 0.03 : 0.07;
    if (Math.random() < jam) { it.jammed = true; O.hud?.note('Your gun jammed!', 2); O.audio?.jam(); }
    // the next round
    if (d.internal) { if (it.rounds > 0) this._cycle(it, d); }
    else if (it.mag && it.mag.n > 0 && !it.jammed) { it.mag.n--; it.chamber = true; }
    O.hud?.changed();
  }
  /** Work the pump or the bolt: the next round from the tube into the chamber. */
  _cycle(it, d) {
    const dur = d.bolt ? 1.05 : 0.6;
    this.busy = { kind: 'cycle', t: 0, dur, done: () => { if (it.rounds > 0) { it.rounds--; it.chamber = true; } O.hud?.changed(); } };
    this.vm.play(d.bolt ? 'bolt' : 'pump', dur);
  }
  reload() {
    const it = this.cur, d = def(it), inv = O.inv;
    if (it.jammed) {
      // clear the jam: rack it, the stuck round flies out
      this.busy = { kind: 'clear', t: 0, dur: 1.3, done: () => { it.jammed = false; if (d.internal) { if (it.rounds > 0) { it.rounds--; it.chamber = true; } } else if (it.mag?.n > 0) { it.mag.n--; it.chamber = true; } O.hud?.changed(); } };
      this.vm.play(d.internal ? (d.bolt ? 'bolt' : 'pump') : 'mag', 1.3);
      return;
    }
    if (d.internal) {
      if (!it.chamber && it.rounds > 0 && (it.rounds >= d.internal || inv.rounds(d.cal) <= 0)) { this._cycle(it, d); return; }
      if (it.rounds >= d.internal) return;
      if (inv.rounds(d.cal) <= 0) { O.hud?.note('No ' + d.cal + ' rounds', 2); return; }
      this.busy = { kind: 'shell', t: 0, dur: d.bolt ? 0.7 : 0.55 };
      this.vm.play('shell', this.busy.dur);
      return;
    }
    // a fuller magazine?
    const mags = inv.magsFor(d).filter((m) => m !== it.mag && m.n > 0);
    const best = mags[0];
    if (best && (!it.mag || best.n > it.mag.n)) {
      const dur = (d.pistol ? 1.6 : d.mag === 'boxM249' ? 4.5 : 2.3) * (it.chamber ? 1 : 1.12);
      this.busy = { kind: 'mag', t: 0, dur, done: () => {
        const old = it.mag;
        if (!inv.detach(best)) return; // (it went somewhere else meanwhile)
        it.mag = best;
        if (old) { if (!inv.add(old, { noWear: true })) O.loot.drop(old, O.player.pos.x, O.player.pos.y, O.player.pos.z); }
        if (!it.chamber && it.mag.n > 0) { it.mag.n--; it.chamber = true; }
        if (this.info?.mag) this.info.mag.visible = true;
        O.hud?.changed();
      } };
      this.vm.play('mag', dur);
      return;
    }
    // no spare magazine: thumb loose rounds into the one in the gun
    if (it.mag && it.mag.n < ITEMS[it.mag.id].cap && inv.rounds(d.cal) > 0) {
      const n = Math.min(ITEMS[it.mag.id].cap - it.mag.n, inv.rounds(d.cal));
      O.actions.start({ label: 'Loading rounds', time: Math.min(8, 0.35 * n), done: () => { if (!it.mag) return; const got = inv.takeRounds(d.cal, Math.min(n, ITEMS[it.mag.id].cap - it.mag.n)); it.mag.n += got; if (!it.chamber && it.mag.n > 0) { it.mag.n--; it.chamber = true; playMech('rack'); } O.hud?.changed(); }, tick: () => { if (Math.random() < 0.3) playMech('shell'); } });
      return;
    }
    if (!it.chamber && it.mag?.n > 0) { this.busy = { kind: 'rack', t: 0, dur: 0.8, done: () => { if (it.mag?.n > 0 && !it.chamber) { it.mag.n--; it.chamber = true; } } }; playMech('rack'); return; }
    O.hud?.note(it.mag ? 'No more ' + d.cal + ' rounds' : 'You have no magazine for this', 2);
  }
  suppress(k) { this.supp = Math.min(1, this.supp + k); }

  // --- melee -----------------------------------------------------------------------------------------------------------------------
  _melee(dt, input, canAct, w) {
    const P = O.player, S = O.survival;
    this.blocking = input.buttons.has(2) && canAct && !this.swing;
    if (this.swing) {
      const s = this.swing;
      s.t += dt;
      if (!s.hit && s.t >= s.dur * 0.42) {
        s.hit = true;
        const cam = O.world.camera, dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
        const res = O.combat.swing(P.eyePos.clone(), dir, { dmg: s.heavy ? w.heavy : w.dmg, reach: w.reach, shooter: P, kind: w.kind, stagger: s.heavy });
        if (res && this.cur && def(this.cur).melee) this.cur.cond = Math.max(0, this.cur.cond - (w.kind === 'chop' ? 0.006 : 0.004));
        if (res) O.combat.noise(P.pos.x, P.pos.y, P.pos.z, 10, P);
      }
      if (s.t >= s.dur) this.swing = null;
      return;
    }
    if (!canAct || P.mode === 'sprint') { this.charge = 0; return; }
    if (input.buttons.has(0)) {
      this.charge += dt;
    } else if (this.charge > 0) {
      const heavy = this.charge > 0.38 && P.stamina > w.cost * 0.5;
      if (heavy) P.stamina = Math.max(0, P.stamina - w.cost);
      else P.stamina = Math.max(0, P.stamina - 3);
      this.swing = { t: 0, dur: (heavy ? 1.45 : 1) / w.speed, heavy, hit: false };
      this.charge = 0;
      O.audio?.swish(heavy);
    }
    void S;
  }

  // --- using things -----------------------------------------------------------------------------------------------------------------
  /** Use an item (from your hands, or from the inventory). */
  use(it) {
    const d = def(it), S = O.survival, inv = O.inv;
    if (d.light) { this.toggleLight(it); return; }
    if (d.map) { O.ui?.openMap(); return; }
    if (d.food || d.drink) {
      if (d.refill && (it.n ?? 1) <= 0) { O.hud?.note('It’s empty. Fill it at a well or a pump.', 2); return; }
      O.actions.start({ label: d.drink ? 'Drinking' : 'Eating', time: d.drink ? 2.6 : 3.6, anim: 'eat', item: it, sound: d.drink ? 'drink' : 'eat', done: () => {
        const r = S.consume(it);
        if (r?.fail) { O.hud?.note(r.fail, 2); return; }
        if (d.refill || d.uses) { it.n = (it.n ?? 1) - 1; if (!d.refill && it.n <= 0) inv.detach(it); }
        else inv.detach(it);
        if (r?.part < 0.7 && d.can) O.hud?.note('You spilled some opening it', 2);
        this.refresh(); O.hud?.changed();
      } });
      return;
    }
    if (d.med) {
      if (d.med.purify) { const b = inv.find((x) => def(x).refill && x.dirty); if (b) { b.dirty = false; it.n--; if (it.n <= 0) inv.detach(it); O.hud?.note('The water is safe now', 2); } else O.hud?.note('No dirty water to purify', 2); return; }
      O.actions.start({ label: d.med.bandage ? 'Bandaging' : 'Using ' + d.name, time: d.useTime || 2, anim: d.med.bandage ? 'bandage' : 'eat', item: it, sound: d.med.bandage ? 'bandage' : 'pills', done: () => {
        const r = S.medicate(it);
        if (r?.fail) { O.hud?.note(r.fail, 2); return; }
        if (r?.msg) O.hud?.note(r.msg, 2.5);
        if (d.stack > 1) { it.n--; if (it.n <= 0) inv.detach(it); }
        else if (d.uses) { it.n--; if (it.n <= 0) inv.detach(it); }
        else inv.detach(it);
        this.refresh(); O.hud?.changed();
      } });
      return;
    }
    if (d.flare) { inv.detach(it); this.refresh(); O.world.flare?.(O.player); O.events?.flare(O.player.pos); return; }
    if (d.compass) { O.hud?.note('Your compass is at the top of the screen', 2); return; }
    if (d.wear) { const old = inv.wear(it); if (old) { if (!inv.add(old)) O.loot.drop(old, O.player.pos.x, O.player.pos.y, O.player.pos.z); } O.ui?.onWear?.(); this.refresh(); return; }
  }

  // --- the flashlight ------------------------------------------------------------------------------------------------------------------
  /** The light you have: a flashlight in your hands, or the head torch you're wearing. */
  lightSource() {
    const h = this.item, head = O.inv.slots.head;
    if (h && def(h).light && (h.on || !head?.on || !def(head).light)) return h;
    if (head && def(head).light) return head;
    return null;
  }
  toggleLight(it = this.lightSource()) {
    if (!it) { O.hud?.note('You have no light in your hands', 1.5); return; }
    if (!it.on && it.charge <= 0) {
      // swap in a battery if you have one
      const bat = O.inv.find((x) => def(x).battery === true);
      if (!bat) { O.hud?.note('The battery is dead', 2); playMech('dry'); return; }
      bat.n--; if (bat.n <= 0) O.inv.detach(bat); it.charge = 1; O.hud?.note('You put in a fresh battery', 2);
    }
    it.on = !it.on; O.audio?.click();
  }
  _light(dt) {
    const src = this.lightSource();
    const on = src && src.on && src.charge > 0 && O.player.alive;
    if (on) {
      src.charge = Math.max(0, src.charge - dt / 3600);
      if (src.charge <= 0) { src.on = false; O.hud?.note('Your light flickers out', 2); }
      const cam = O.world.camera;
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const side = def(src).wear ? new THREE.Vector3(0, 0.3, 0) : new THREE.Vector3(0.6, -0.5, 0).applyQuaternion(cam.quaternion);
      this.light.position.copy(cam.position).add(side);
      this.light.target.position.copy(cam.position).addScaledVector(f, 30);
      // a weak battery is a dim, flickering beam
      const flick = src.charge < 0.1 ? 0.5 + Math.random() * 0.5 : 1;
      this.light.intensity = 900 * flick * Math.min(1, 0.4 + src.charge * 2);
    } else this.light.intensity = 0;
  }

  // --- the view model ----------------------------------------------------------------------------------------------------------------
  _viewmodel(dt) {
    const P = O.player;
    const fp = !(P.third && !this.aiming) && P.alive;
    const isGun = this.mode === 'gun';
    // light the hands like the world around you
    const sky = O.sky;
    const k = sky ? Math.max(0.12, Math.min(1.2, (sky.hemi?.intensity ?? 1) * 0.55 + (sky.sun?.intensity ?? 1) * 0.12)) * (P.indoors ? 0.55 : 1) : 1;
    const lit = this.light.intensity > 0 ? 0.6 : 0;
    this.hemi.intensity = 1.4 * k + lit; this.sunL.intensity = 1.8 * k * (P.indoors ? 0.3 : 1) + lit;
    for (const l of this.vm.scene.children) if (l.isLight && l !== this.vm.flashLight) { l.userData.base ??= l.intensity; l.intensity = l.userData.base * k + lit; }
    this.vm.visible = fp && isGun;
    this.held.visible = fp && !isGun && !(this.mode === 'fists' && !this.swing && !this.blocking && !O.actions.cur);
    if (isGun) {
      this.vm.update(dt, { moving: P.moving, sprint: P.mode === 'sprint', ads: this.aiming, look: P.look, grounded: P.grounded });
      O.post.vmVisible = false;
      return;
    }
    O.post.vmVisible = this.held.visible;
    // held items and melee: sway, bob, swing arcs
    this.bobT += dt * (P.moving > 0.1 && P.grounded ? (P.mode === 'sprint' ? 13 : 9) : 0);
    const bob = Math.min(1, P.moving);
    const g = this.held;
    let x = 0.2, y = -0.24 + Math.sin(this.bobT * 2) * 0.008 * bob, z = -0.42, rx = 0, ry = 0, rz = 0;
    x += Math.sin(this.bobT) * 0.012 * bob;
    if (P.mode === 'sprint') { y -= 0.06; rx -= 0.25; ry += 0.35; }
    const eq = 1 - (this.equipT ?? 1); y -= eq * 0.3;
    const s = this.swing;
    if (s) {
      // a swing: up and back, then a fast arc down and across
      const t = s.t / s.dur;
      const wind = Math.min(1, t / 0.35), strike = Math.max(0, Math.min(1, (t - 0.35) / 0.3)), back = Math.max(0, (t - 0.65) / 0.35);
      const a = wind * (1 - strike) * (s.heavy ? 1.3 : 1);
      rx += a * 0.9 - strike * (1 - back) * 1.1; rz += a * 0.6 - strike * (1 - back) * 1.2; x += a * 0.06 - strike * (1 - back) * 0.22; y += a * 0.12 - strike * (1 - back) * 0.08;
    } else if (this.charge > 0) {
      const c = Math.min(1, this.charge / 0.38);
      rx += c * 1.1; rz += c * 0.7; x += c * 0.08; y += c * 0.14;
    } else if (this.blocking) { rz += 1.3; y += 0.1; x -= 0.1; }
    const A = O.actions.cur;
    if (A?.anim === 'eat') { const t = Math.min(1, A.t / Math.min(0.5, A.time * 0.3)); x -= t * 0.18; y += t * 0.1; z += t * 0.12; rx -= t * 0.6; }
    if (A?.anim === 'bandage') { y -= 0.05; x -= 0.12; rz += Math.sin(A.t * 9) * 0.3; }
    g.position.set(x, y, z);
    g.rotation.set(rx, ry + (P.look[0] ? -P.look[0] * 0.0004 : 0), rz);
    // the arms reach from off-screen shoulders to the item
    this.itemHolder.position.set(0, 0, 0);
    this._armTo(this.armR, new THREE.Vector3(0, -0.03, 0.03), new THREE.Vector3(0.05, -0.35, 0.35));
    const two = this.cur && def(this.cur).melee?.reach > 4.5;
    this._armTo(this.armL, two ? new THREE.Vector3(0, -0.14, 0.06) : new THREE.Vector3(-0.32, -0.12 + (this.blocking ? 0.12 : 0), -0.04), new THREE.Vector3(-0.5, -0.4, 0.3));
    this.armL.visible = two || this.mode === 'fists' || this.blocking || !!A;
    this.vm.visible = false;
  }
  _armTo(arm, handLocal, shoulderLocal) {
    // in the held group's space
    arm.position.copy(handLocal);
    const dir = shoulderLocal.clone().sub(handLocal), len = dir.length();
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
    arm.userData.sleeve.scale.z = len + 0.3; arm.userData.sleeve.position.z = (len + 0.3) / 2;
  }

  /** What the HUD shows about the weapon in your hands. */
  status() {
    const it = this.cur;
    if (!it) return null;
    const d = def(it);
    const out = { name: d.name, cond: condOf(it), mode: this.mode };
    if (d.gun) {
      out.ammo = d.internal ? it.rounds + (it.chamber ? 1 : 0) : (it.mag ? it.mag.n : 0) + (it.chamber ? 1 : 0);
      out.cap = d.internal || (it.mag ? ITEMS[it.mag.id].cap : 0);
      out.spare = d.internal ? O.inv.rounds(d.cal) : O.inv.magsFor(d).filter((m) => m !== it.mag && m.n > 0).length;
      out.spareKind = d.internal ? 'rounds' : 'mags';
      out.loose = O.inv.rounds(d.cal);
      out.fire = d.auto ? this.fireMode : d.pump ? 'pump' : d.bolt ? 'bolt' : 'semi';
      out.jammed = !!it.jammed; out.noMag = !d.internal && !it.mag;
    }
    if (d.light) out.light = { on: it.on, charge: it.charge };
    return out;
  }
}

/** Timed actions: bandaging, eating, loading rounds. One at a time; moving fast or getting hit stops it. */
export class Actions {
  constructor() { this.cur = null; }
  start(a) {
    if (this.cur) return false;
    this.cur = { ...a, t: 0 };
    if (a.sound) O.audio?.[a.sound]?.();
    return true;
  }
  cancel(why) { if (!this.cur) return; this.cur = null; if (why) O.hud?.note(why, 1.5); }
  update(dt) {
    const a = this.cur;
    if (!a) return;
    if (O.player.mode === 'sprint' || !O.player.alive) { this.cancel('Interrupted'); return; }
    if (a.item && !O.inv.locate(a.item)) { this.cancel(); return; }
    a.t += dt;
    a.tick?.(dt);
    if (a.t >= a.time) { this.cur = null; a.done?.(); }
  }
}

export { makeItem };
