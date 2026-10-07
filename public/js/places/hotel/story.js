// The night, in order: waking in 313 to the telephone, the first glimpse of
// him at the end of the corridor, the key box and the lift that comes up
// for you, the stairs, the lobby and the chained doors, the three fuses,
// the power coming back on (and how angry that makes him), the basement,
// the bolt cutters - and the run for the front doors. Also the small
// frights along the way, the objectives, checkpoints and the save.
import * as THREE from 'three';
import { H } from './state.js';
import { FL } from './shell.js';
import { LINES, OBJ } from './lore.js';
import { pickup, alreadyTaken } from './items.js';
import { Apparition, playerFloor } from './monster.js';
import { bake, boxGeo, cylGeo, M4 } from './kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SAVE = 'rbx2008:hotel';
const PI = Math.PI;

const CP = {
  start: { p: V(84.5, FL.F3, -2.5), yaw: 0.6 },
  staffKey: { p: V(18, FL.F3, -15), yaw: PI },
  stairs3: { p: V(-80, FL.F3, -1), yaw: PI / 2 },
  f1: { p: V(-67.5, FL.F1, 0), yaw: -PI / 2 },
  fuse: { p: V(-52, FL.F1, -9), yaw: 0 },
  power: { p: V(-52, FL.F1, -12), yaw: PI },
  cutters: { p: V(-51.5, FL.B, 12), yaw: PI },
};

export class Story {
  constructor(game) {
    this.game = game;
    this.flags = new Set();
    this.deaths = 0; this.time = 0; this.cp = 'start';
    this.triggers = [];
    this.fusesIn = 0;
    this.ended = false; this.finale = false; this.cutting = false;
    this.dread = 1;
    this.lastEncounter = 0;
    this.app = new Apparition();
    H.story = this;
  }
  has(f) { return this.flags.has(f); }
  set(f) { this.flags.add(f); }

  // --- saving -------------------------------------------------------------------------------------------------------------------------
  static saved() { try { const s = JSON.parse(localStorage.getItem(SAVE) || 'null'); return s && s.cp && s.cp !== 'start' && !s.done ? s : null; } catch { return null; } }
  save() {
    try {
      const P = H.player;
      localStorage.setItem(SAVE, JSON.stringify({ cp: this.cp, flags: [...this.flags], inv: H.inv.toJSON(), battery: P.battery, hasFlash: P.hasFlash, deaths: this.deaths, time: this.time, notes: H.notes.filter((n) => n.read).map((n) => n.id), fuses: this.fusesIn }));
    } catch { /* private mode */ }
  }
  clearSave() { try { localStorage.removeItem(SAVE); } catch { /* */ } }
  checkpoint(id) { this.cp = id; this.save(); }

  // --- starting --------------------------------------------------------------------------------------------------------------------------
  begin(how) {
    const s = how === 'continue' ? Story.saved() : null;
    if (!s) this.clearSave();
    H.audio?.init(H.player.settings.volume);
    H.post.brightness = H.player.settings.brightness;
    if (s) this._load(s); else this._intro();
    this._setupWorld();
    this.objective();
  }
  _load(s) {
    for (const f of s.flags || []) this.flags.add(f);
    H.inv.load(s.inv);
    const P = H.player;
    P.hasFlash = !!s.hasFlash; P.battery = s.battery ?? 1;
    this.deaths = s.deaths || 0; this.time = s.time || 0; this.cp = s.cp;
    for (const n of H.notes) if ((s.notes || []).includes(n.id)) n.read = true;
    for (const id of ['flashlight', 'battery304', 'batteryStaff', 'batteryWork', 'fuse1', 'fuse2', 'fuse3', 'officeKey', 'boltCutters']) if (this.has('took:' + id)) alreadyTaken(id);
    if (this.has('took:staffKey')) { H.obj.keyBox.open(); }
    for (let i = 0; i < 3; i++) if (this.has('slot' + i)) this._placeFuse(i, true);
    if (this.has('power')) this._powerOn(true);
    if (this.has('stairs3')) { H.obj.dStairs3.locked = false; }
    if (this.has('officeOpen')) H.obj.dOffice.locked = false;
    this._silencePhone();
    H.post.fadeIn(1.5);
    this.respawn(true);
  }
  _setupWorld() {
    const O = H.obj;
    // the stairwell door: a staff key
    O.dStairs3.o.onUnlock = () => { this.set('stairs3'); this.objective(); };
    O.dOffice.o.onUnlock = () => { this.set('officeOpen'); };
    O.dStairsB.o.lockedMsg = () => (this.has('power') ? '' : 'The basement security door. The lock panel is dark - no power.');
    O.dStairsB.o.onTry = () => { if (!this.has('bTried')) { this.set('bTried'); this.objective(); } };
    O.front.o.onTry = () => { if (!this.has('frontTried')) { this.set('frontTried'); this.objective(); H.audio?.locked(O.front.center); } };
    O.dStairs3.o.onTry = () => { if (!this.has('stairsTried')) { this.set('stairsTried'); this.objective(); } };
    // the telephone
    if (!this.has('phone')) {
      this.phoneIt = H.interact.add({ pos: O.phone.clone(), r: 5, label: 'the telephone', verb: 'Answer', act: () => this._answerPhone() });
    }
    // the key box
    H.interact.add({ pos: O.keyBox.pos, r: 4.5, label: 'Key box', verb: 'Enter the code on the', can: () => !this.has('boxOpen'), act: () => H.ui.keypad((code) => { if (code === '0333') { this._openBox(); return true; } return false; }) });
    // the fuse box: three slots, then the lever
    O.fuseBox.slots.forEach((sl, i) => H.interact.add({ pos: sl.pos, r: 4.5, size: 0.4, label: () => `Fuse slot ${i + 1}`, verb: () => (H.inv.has('fuse') ? 'Put a fuse in' : 'Empty'), can: () => !this.has('slot' + i), act: () => { if (!H.inv.has('fuse')) { H.ui.toast('An empty socket. It needs a fuse.'); this._seenBox(); return; } H.inv.remove('fuse'); this._placeFuse(i); } }));
    H.interact.add({ pos: O.fuseBox.leverPos, r: 4.5, label: 'the main lever', verb: () => (this.fusesIn >= 3 ? 'Throw' : 'Try'), can: () => !this.has('power'), act: () => { if (this.fusesIn < 3) { H.ui.toast(`Nothing happens. ${3 - this.fusesIn} fuse${3 - this.fusesIn === 1 ? ' is' : 's are'} missing.`); H.audio?.locked(O.fuseBox.leverPos); this._seenBox(); return; } this._powerOn(); } });
    H.interact.add({ pos: O.fuseBox.pos, r: 5.5, label: 'Fuse box', verb: 'Look at the', can: () => !this.has('boxSeen'), act: () => this._seenBox() });
    // the bell on the desk, the lift buttons
    H.interact.add({ pos: O.bell.clone(), r: 4.5, size: 0.4, label: 'the bell', verb: 'Ring', act: () => this._bell() });
    // the chain on the front doors
    H.interact.add({ pos: O.chain.pos, r: 5, label: 'the chain', verb: 'Cut', hold: 2.2, can: () => H.inv.has('boltCutters') && !this.has('chainCut'), act: () => this._cutChain(), onHold: (p, dt) => { this.cutting = true; this._cutT = (this._cutT || 0) - dt; if (this._cutT <= 0) { this._cutT = 0.5; H.audio?.cutting(O.chain.pos); } } });
    // the radio and the ice machine, for fun
    H.interact.add({ pos: O.radio304, r: 4, size: 0.5, label: 'the radio', verb: 'Turn on', act: () => H.audio?.radio(O.radio304) });
    H.interact.add({ pos: O.iceMachine, r: 4.5, label: 'the ice machine', verb: 'Use', act: () => H.audio?.ice(O.iceMachine) });
    this._triggers();
  }

  // --- the intro ------------------------------------------------------------------------------------------------------------------------
  _intro() {
    const P = H.player, O = H.obj;
    P.mode = 'cut';
    const bed = H.start.bed.clone(), stand = CP.start.p.clone().setY(FL.F3 + 6.1);
    P.override = { pos: bed.clone(), look: bed.clone().add(V(0.4, 6, 1.2)), fov: 66 };
    H.post.fadeTo = 1; H.post.fade = 1;
    H.ui.subtitle('Room 313 &nbsp;·&nbsp; 3:33 a.m.', 4);
    this.after(1.2, () => H.post.fadeIn(3.5));
    this.after(1.8, () => { this.stopRing = H.audio?.phoneRing(O.phone); H.ui.subtitle('[The telephone is ringing]', 3); });
    this.after(3.0, () => this.lightning(0.9));
    let t = 0;
    const look0 = bed.clone().add(V(0.4, 6, 1.2)), look1 = O.phone.clone();
    const stop = H.world.onUpdate((dt) => {
      t += dt;
      if (t < 4.2) return;
      const k = Math.min(1, (t - 4.2) / 2.6), e = k * k * (3 - 2 * k);
      P.override.pos.lerpVectors(bed, stand, e);
      P.override.look = look0.clone().lerp(look1, Math.min(1, e * 1.3));
      if (k >= 1) {
        stop();
        P.override = null;
        P.teleport(CP.start.p, Math.atan2(-(O.phone.x - CP.start.p.x), -(O.phone.z - CP.start.p.z)));
        P.pitch = -0.25;
        P.mode = 'play';
        H.ui.hint('start');
        this.objective();
      }
    });
  }
  _answerPhone() {
    const O = H.obj;
    this.set('phone'); H.interact.remove(this.phoneIt);
    this.stopRing?.(); H.audio?.pickupPhone(O.phone);
    let i = 0;
    for (const [at, line] of LINES.phone) {
      this.after(at, () => { if (line.startsWith('(')) { H.ui.subtitle('[click]', 2); } else { H.ui.subtitle(line, 4.2, 'Front desk'); H.audio?.speak(line, { pitch: 0.3, rate: 0.75 }); } });
      i++;
    }
    // the television comes on by itself
    this.after(8.6, () => this._tvOn());
    this.after(13.2, () => { this.objective(); if (!H.player.hasFlash) H.ui.toast('There\'s a flashlight on the nightstand.'); });
  }
  _silencePhone() { this.stopRing?.(); this.set('phone'); }
  _tvOn() {
    const tv = H.obj.tv;
    if (this.tvOn) return;
    this.tvOn = true;
    tv.screen.material.color.setRGB(1.6, 1.6, 1.7);
    tv.fx.on = true;
    this.stopTv = H.audio?.tvStatic(tv.pos);
    H.ui.subtitle('[The television switches itself on]', 3);
    let t = 0, face = 0;
    this.tvTick = (dt) => {
      t += dt; this._tvAcc = (this._tvAcc || 0) + dt;
      face = t > 2.2 && t < 2.9 ? 1 : t > 6 && Math.sin(t * 3) > 0.97 ? 0.6 : 0;
      if (this._tvAcc > 0.06) { this._tvAcc = 0; tv.tex.userData.update(face); }
      if (face > 0.9 && !this._tvScare) { this._tvScare = true; H.audio?.stinger(0.5); }
    };
  }
  _tvOff() { const tv = H.obj.tv; if (!this.tvOn) return; this.tvOn = false; tv.screen.material.color.setRGB(0, 0, 0); tv.fx.on = false; this.stopTv?.(); this.tvTick = null; }

  // --- story beats ------------------------------------------------------------------------------------------------------------------------
  event(name, arg) {
    const O = H.obj, P = H.player;
    switch (name) {
      case 'take:flashlight':
        P.hasFlash = true; P.setFlash(true); this.set('took:flashlight'); H.ui.hint('flash'); H.ui.inventory(H.inv); this.objective();
        this.after(14, () => H.ui.hint('run'));
        break;
      case 'take:staffKey': this.set('took:staffKey'); this.checkpoint('staffKey'); this._arrival(); break;
      case 'take:officeKey': this.set('took:officeKey'); this.objective(); break;
      case 'take:fuse1': case 'take:fuse2': case 'take:fuse3':
        this.set('took:' + name.slice(5)); this.cp = 'fuse'; this.save(); this.objective(); this._fuseScare(name.slice(5)); break;
      case 'take:boltCutters': this.set('took:boltCutters'); this.checkpoint('cutters'); this._finale(); break;
      case 'take:battery304': case 'take:batteryStaff': case 'take:batteryWork': this.set('took:' + name.slice(5)); if (P.battery < 0.3) H.ui.hint('battery'); break;
      case 'read:housekeeper': this.set('code'); this.objective(); break;
      case 'read:maintenance': this.set('log'); this.objective(); break;
      case 'read:workshop': this.set('cuttersHint'); this.objective(); break;
      case 'm:spot': this.lastEncounter = this.time; this.set('seen'); break;
      case 'm:chase': H.ui.hint('run'); break;
      case 'm:checking': H.ui.hint('hide'); break;
      case 'm:left': this.lastEncounter = this.time; this.mLeftAt = this.time; break;
      default: break;
    }
  }
  objective() {
    const f = (x) => this.has(x);
    let o;
    if (this.finale) o = this.has('chainCut') ? 'GET OUT' : OBJ.run;
    else if (!f('phone')) o = OBJ.phone;
    else if (!H.player.hasFlash) o = OBJ.flashlight;
    else if (!f('stairs3') && !f('inStairs')) {
      if (f('arrival') && H.monster?.active) o = H.player.mode === 'hide' ? 'Stay hidden until he goes. Then get to the stairwell at the west end' : OBJ.sneak;
      else if (f('took:staffKey')) o = OBJ.sneak;
      else if (f('code')) o = OBJ.keybox + ' - the code is "the time he always comes up"';
      else if (f('stairsTried')) o = OBJ.stairsLocked;
      else o = OBJ.leave;
    } else if (!f('reachedF1')) o = OBJ.down;
    else if (!f('frontTried')) o = OBJ.lobby;
    else if (!f('power')) {
      const n = this.fusesIn + H.inv.count('fuse');
      if (n >= 3) o = this.fusesIn >= 3 ? 'Throw the main lever on the fuse box' : OBJ.lever;
      else if (f('boxSeen') || f('log')) o = `Find the three fuses (${n}/3)${f('log') ? ' - the office, the cold store, the piano' : ' - the maintenance log may say where'}`;
      else if (f('bTried')) o = 'The basement door has no power. Find the electrical room, behind the lobby';
      else o = 'The front doors are chained. There must be tools in the basement - take the stairs down';
    } else if (!f('took:boltCutters')) o = f('cuttersHint') ? OBJ.boiler : OBJ.basement;
    else o = OBJ.run;
    if (o !== this._obj) { this._obj = o; H.ui.objective(o); }
  }
  _seenBox() { if (!this.has('boxSeen')) { this.set('boxSeen'); this.objective(); H.ui.toast('The main fuse box. All three fuses have been taken out.'); } }
  _openBox() {
    const O = H.obj;
    this.set('boxOpen');
    O.keyBox.open();
    H.audio?.unlock(O.keyBox.pos);
    pickup('staffKey', { pos: O.keyBox.keyPos.clone(), kind: 'key', ry: PI, r: 5 });
  }
  _placeFuse(i, silent = false) {
    const O = H.obj, sl = O.fuseBox.slots[i];
    this.set('slot' + i); this.set('boxSeen'); this.fusesIn++;
    const m = new THREE.Group();
    m.add(new THREE.Mesh(cylGeo(0.16, 0.16, 0.7, 10), H.M.glass), new THREE.Mesh(bake([[cylGeo(0.19, 0.19, 0.18, 10), M4(0, 0.36, 0)], [cylGeo(0.19, 0.19, 0.18, 10), M4(0, -0.36, 0)]]), H.M.brass));
    m.position.copy(sl.pos).add(V(0, 0, 0)); H.world.scene.add(m); H.fixColors?.(m);
    if (!silent) { H.audio?.unlock(sl.pos); this.save(); this.objective(); if (this.fusesIn === 3) H.ui.toast('All three fuses are in. Now the lever.'); }
  }
  _bell() {
    const O = H.obj;
    H.audio?.ding(O.bell);
    H.noise?.(O.bell, 26, 'bell');
    if (!this.has('bell')) {
      this.set('bell');
      // something answers: a lift opens on the ground floor, empty... or not
      this.after(2.5, () => { const e = H.elev[1][1]; H.audio?.ding(e.pos); e.setOpen(true); e.light.on = true; this.after(5, () => e.setOpen(false)); });
    }
  }

  // --- the first time he comes for you -------------------------------------------------------------------------------------------------
  _arrival() {
    const M = H.monster, O = H.obj;
    this.set('arrival');
    H.lights.boost = 1;
    // the lights on this floor stutter
    let t = 0;
    const stop = H.world.onUpdate((dt) => { t += dt; H.lights.boost = t < 2.4 ? (Math.random() < 0.35 ? 0.1 : 0.8) : 1; if (t > 2.4) stop(); });
    H.audio?.swell(6, 0.7);
    this.after(1, () => { H.ui.objective(OBJ.hide, 'NOW'); H.ui.subtitle('[Somewhere below, the lift starts to move]', 4); });
    M.arrive('F3', { car: 'e3e', ride: 7, from: 1, then: (m) => {
      m.script(['c3:6', 'c3:12', 'c3:18', 'lin:a', 2.2, (mm) => { H.audio?.sniff(mm.head); }, 'lin:b', 1.5, 'lin:w', (mm) => { const sp = O.linenCupboard; mm._beginCheck(sp); }], { watch: true, done: () => {} });
      // after checking the cupboard he goes to your room
      m.afterCheck = () => m.script(['lin:a', 'c3:18', 'c3:32', 'c3:48', 'c3:64', 'c3:70', (mm) => { O.d313.burst(); H.audio?.burst(O.d313.center); }, 'r313:door', 'r313:mid', 3, 'r313:bed', 2], { watch: true, done: () => { m.state = 'patrol'; } });
    } });
    this.objective();
  }

  // --- the second floor stairs, the lobby, the ground floor ------------------------------------------------------------------------------
  _fuseScare(id) {
    const M = H.monster, O = H.obj;
    if (id === 'fuse2') {
      // the cold store door slams behind you and its light dies
      this.after(0.4, () => { O.dFreezer.setOpen(false, true); O.freezerLight.broken = true; H.audio?.stinger(0.6); this.after(2.6, () => { O.freezerLight.broken = false; }); });
    }
    if (id === 'fuse3') {
      H.audio?.piano(O.piano.keys, [[33, 40, 45, 46, 52]], 0.1, 1.0);
      H.audio?.stinger(0.7);
      H.noise?.(O.piano.keys, 40, 'piano');
    }
    // he comes up to see who's moving things about
    const delay = id === 'fuse1' ? 3 : id === 'fuse2' ? 5 : 2;
    if (!M.active) this.after(delay, () => { if (!M.active && !this.finale) M.arrive('F1', { ride: 5, then: (m) => { if (id === 'fuse3') m.investigate(O.piano.keys, true); } }); });
    else if (id === 'fuse3') M.investigate(O.piano.keys, true);
  }
  _powerOn(silent = false) {
    const O = H.obj, M = H.monster;
    this.set('power');
    H.lights.power = true;
    O.bPanel.color.set(0x20ff40);
    H.obj.dStairsB.locked = false;
    O.fuseBox.lamp.color.set(0x30ff40);
    O.fuseBox.lever.rotation.x = 2.0;
    if (silent) return;
    this.checkpoint('power');
    // the lever goes down; the hotel wakes up, floor by floor
    let k = 0;
    const lv = H.world.onUpdate((dt) => { k += dt * 3; O.fuseBox.lever.rotation.x = -0.7 + Math.min(1, k) * 2.7; if (k >= 1) lv(); });
    H.lights.power = false;
    H.audio?.powerOn();
    H.player.shake(0.4);
    const fxs = H.lights.fixtures.filter((f) => f.circuit === 'main');
    for (const f of fxs) { f.dim = 0; }
    H.lights.power = true;
    let t = 0;
    const wake = H.world.onUpdate((dt) => {
      t += dt;
      for (const f of fxs) { const d = f.pos.distanceTo(O.fuseBox.pos); const at = d / 40; if (t > at) f.dim = Math.min(1, f.dim + dt * (Math.random() < 0.2 ? 0.2 : 3)); }
      if (t > 6) { for (const f of fxs) f.dim = 1; wake(); }
    });
    this.after(2.5, () => { H.audio?.paChime(); });
    for (const [at, line] of LINES.pa) this.after(4 + at, () => { H.ui.subtitle(line, 4.5, 'The tannoy'); H.audio?.speak(line, { pitch: 0.45, rate: 0.82, vol: 0.8 }); });
    this.after(4, () => { this.gramStop?.(); this.gramStop = H.audio?.gramophone(O.gramophone); });
    // then, from far above, the scream
    this.after(23, () => {
      H.audio?.scream(V(0, 30, 0), 1.3); H.audio?.stinger(0.9);
      H.ui.subtitle('[A scream, somewhere above. It doesn\'t sound human]', 4);
      M.rage = true;
      this.after(4, () => { if (!this.finale) { if (M.active) M.leave(); this.after(M.active ? 12 : 1, () => { if (!this.finale && !M.active) M.arrive('F1', { ride: 4 }); }); } });
    });
    this.objective();
  }
  _cutChain() {
    const O = H.obj;
    this.set('chainCut'); this.cutting = false;
    H.audio?.chainCut(O.chain.pos);
    // the chain drops
    const g = O.chain.g; let v = 0;
    const drop = H.world.onUpdate((dt) => { v += dt * 40; g.position.y = Math.max(0.3, g.position.y - v * dt); g.rotation.z += dt * 2; if (g.position.y <= 0.31) drop(); });
    O.front.locked = false; O.front.sealed = false;
    O.front.setOpen(true, true);
    H.player.shake(0.8);
    H.monster?.recoil();
    this.objective();
  }

  // --- the end: the run for the doors -----------------------------------------------------------------------------------------------------
  _finale() {
    const M = H.monster, O = H.obj, P = H.player;
    this.finale = true;
    P.adrenaline = true;
    this.objective();
    // the furnace roars up and he unfolds from behind it
    O.boiler.fx.power = 60; this.after(1.2, () => { O.boiler.fx.power = 22; });
    H.audio?.thunder(0.2);
    H.player.shake(0.7);
    if (M.active) M.despawn();
    this.after(1.4, () => {
      const n = H.nav.get('boi:h');
      M.node = n; M.pos.copy(n.p); M.yaw = 0; M.active = true; M.visibleBody = true; M.root.visible = true; M.finale = true; M.rage = true;
      M.state = 'spot'; M.st = 0.4; M.screamed = false;
      H.ui.subtitle('[IT TAKES THE STAIRS NOW]', 4);
    });
  }
  _ending() {
    if (this.ended) return;
    this.ended = true;
    const P = H.player, M = H.monster, O = H.obj;
    P.mode = 'cut';
    const eye = H.world.camera.position.clone();
    const door = V(0, FL.F1 + 5.5, 59);
    // he stops at the threshold: he can't leave the hotel
    M.despawn();
    this.app.show(V(0, FL.F1, 57.5), 0, { roll: 1.1, jaw: 0.6, hunch: 0.3, spread: 0.4 });
    H.audio?.scream(door, 0.8);
    let t = 0;
    P.override = { pos: eye.clone(), look: eye.clone().add(H.player.camDir.clone().multiplyScalar(5)), fov: 64 };
    const look0 = P.override.look.clone();
    const end = H.world.onUpdate((dt) => {
      t += dt;
      const k = Math.min(1, t / 1.2), e = k * k * (3 - 2 * k);
      P.override.look = look0.clone().lerp(door, e);
      // back away down the steps, then off the drive to the right, where 313's window can be seen past the east wing
      if (t > 1.2) P.override.pos.lerp(t < 5 ? V(0, 3.2, 84) : V(30, 8, 98), Math.min(1, dt * 0.35));
      if (t > 3.0 && !this._slam) { this._slam = true; this.app.hide(); O.front.setOpen(false, true); H.audio?.doorSlam(door); }
      // ...and up to the third floor, where a window has lit: room 313's (the camera closes in on it)
      if (t > 4.2) { const k2 = Math.min(1, (t - 4.2) / 3), e2 = k2 * k2 * (3 - 2 * k2); P.override.look = door.clone().lerp(V(86, 36.2, 11.7), e2); P.override.fov = 64 - 42 * e2; }
      if (t > 6.6 && !this._lit) { this._lit = true; O.window313Out.glow.material.opacity = 0.55; H.audio?.knock(V(86, 36, 12), 1, 0.3); }
      if (t > 7.8) O.window313Out.fig.material.opacity = Math.min(1, (t - 7.8) * 1.5);
      if (t > 10.5 && !this._fade) { this._fade = true; H.post.fadeOut(2); }
      if (t > 12.8) { end(); this._endScreen(); }
    });
  }
  _endScreen() {
    const P = H.player;
    P.mode = 'end';
    try { localStorage.setItem(SAVE, JSON.stringify({ done: true })); } catch { /* */ }
    const m = Math.floor(this.time / 60), s = Math.floor(this.time % 60);
    H.ui.ending({ time: `${m}:${String(s).padStart(2, '0')}`, deaths: this.deaths, notes: `${H.notes.filter((n) => n.read).length}/${H.notes.length}` }, () => this.game.emit('exit'), () => { this.clearSave(); location.reload(); });
  }

  // --- dying and coming back -----------------------------------------------------------------------------------------------------------------
  died() {
    this.deaths++;
    this.cutting = false;
    const lines = [['FOUND YOU', 'The Night Manager will see you now.'], ['CHECKED OUT', '"You have overstayed, I\'m afraid."'], ['NO EARLY DEPARTURES', 'Every guest is welcome. No guest may leave.'], ['DO NOT DISTURB', 'He knew where you were all along.']];
    H.ui.death(lines[(this.deaths - 1) % lines.length], () => this.respawn());
    this.save();
  }
  respawn(fromLoad = false) {
    const P = H.player, M = H.monster;
    const c = CP[this.cp] || CP.start;
    M.despawn(); M.finale = false;
    this.app.hide();
    P.override = null;
    P.teleport(c.p, c.yaw);
    P.adrenaline = false;
    if (P.hasFlash && !fromLoad) P.setFlash(true, true);
    H.post.fadeIn(fromLoad ? 1.5 : 0.8);
    this.cutting = false;
    // put the night back the way it was at this checkpoint
    if (this.cp === 'staffKey') {
      for (const d of [H.obj.d313]) if (d.isOpen) d.setOpen(false, false);
      H.world.delay(1.5, () => this._arrival());
    } else if (this.cp === 'cutters') {
      this.finale = false;
      H.world.delay(0.8, () => this._finale());
    } else if (this.cp === 'fuse' || this.cp === 'power') {
      H.world.delay(this.cp === 'power' ? 6 : 10, () => { if (!M.active && !this.finale) M.arrive('F1', { ride: 4, far: true }); });
    }
    this.objective();
    P.lock();
  }

  // --- where you are ---------------------------------------------------------------------------------------------------------------------------
  area() {
    const p = H.player?.camPos; if (!p) return 'room';
    if (p.z > 60.6 || p.x > 93) return 'outside';
    if (H.stairBox?.containsPoint(p)) return 'stairs';
    if (p.y < -5) return 'basement';
    if (p.y < 14 && p.x > -22 && p.x < 22 && p.z > -14) return 'lobby';
    if (p.y < 22 && p.x < -22 && p.z > 28) return 'ball';
    if (p.y > 30 && p.x > -18 && p.x < 18 && p.z > 4 && p.z < 10) return 'lobby';
    if (Math.abs(p.z) < 4 && p.x > -72 && p.x < 72) return 'corridor';
    return 'room';
  }
  floor() { return H.player ? playerFloor(H.player.pos) : 'F3'; }
  nearWindow() {
    const p = H.player?.camPos; if (!p) return 0;
    let best = 99;
    for (const f of H.lights.fixtures) if (f.circuit === 'window') { const d = f.pos.distanceTo(p); if (d < best) best = d; }
    return Math.max(0, 1 - best / 14);
  }
  keepHunting() { return this.finale || (H.monster?.rage && this.time - this.lastEncounter < 25); }

  // --- triggers: walk into a box and something happens ----------------------------------------------------------------------------------------
  trigger(min, max, fn, o = {}) { this.triggers.push({ box: new THREE.Box3(V(...min), V(...max)), fn, once: o.once !== false, look: o.look, inside: false, ...o }); }
  _triggers() {
    const O = H.obj, y3 = FL.F3, y1 = FL.F1;
    // the first look down the corridor: someone is standing at the far end
    this.trigger([60, y3 - 1, -3.5], [71, y3 + 8, 3.5], () => {
      if (this.has('phantom1')) return;
      this.set('phantom1');
      this.app.show(V(-62, y3, 0.5), PI / 2, { roll: 1.0, hunch: 0.2 });
      this.phantomT = 0; this.phantomOn = 'corridor';
    }, { once: true });
    // 302 knocks as you go by
    this.trigger([-68, y3 - 1, -1], [-58, y3 + 8, 3.5], () => { H.audio?.knock(O.d302.center.clone().setY(y3 + 4).setZ(5), 3, 1.3, 0.28); this._rattle(O.d302); H.ui.subtitle('[Knocking, from inside room 302]', 3); });
    this.trigger([-36, y3 - 1, -3.5], [-28, y3 + 8, 0], () => { H.audio?.whisper(O.d305.center.clone().setZ(-6), 0.6); H.audio?.mHum?.(O.d305.center.clone().setZ(-8)); H.ui.subtitle('[Someone humming, behind the door of 305]', 3); });
    this.trigger([60, y3 - 1, -3.5], [68, y3 + 8, 0], () => { this.after(4, () => H.audio?.breathOut(true)); }, { once: true, cond: () => this.has('phone') });
    // the ice machine
    this.trigger([-22, y3 - 1, -3.5], [-14, y3 + 8, 3.5], () => { H.audio?.ice(O.iceMachine); });
    // the children's room: the music box, the rocking horse
    this.trigger([41, y3 - 1, -26], [55, y3 + 8, -8], () => { H.audio?.musicBox(O.musicBox, [76, 74, 72, 74, 76, 76, 76, 0, 74, 74, 74, 0, 76, 79, 79, 0, 76, 74, 72, 74, 76, 76, 76, 76, 74, 74, 76, 74, 72], 0.42); this.horseT = 9; });
    // 308's bathroom
    this.trigger([20, y3 - 1, 19], [38, y3 + 8, 27], () => this._bathScare());
    // the stairwell
    this.trigger([-92, y3 - 1, -6], [-72.6, y3 + 10, 24], () => { this.set('inStairs'); if (this.cp === 'staffKey' || this.cp === 'start') this.checkpoint('stairs3'); this.objective(); const M = H.monster; if (M.active && M.state !== 'chase') this.after(20, () => { if (M.active && !this.finale && this.floor() !== 'F3') M.leave(); }); });
    this.trigger([-92, FL.F2 - 1, -6], [-72.6, FL.F2 + 6, 6], () => { this.after(0.6, () => { H.audio?.knock(O.f2Boards.pos, 6, 1.6, 0.18); H.player.shake(0.5); H.ui.subtitle('[Something hammers on the boarded door]', 3); }); });
    // the ground floor
    this.trigger([-72, y1 - 1, -4], [-60, y1 + 8, 4], () => { this.set('reachedF1'); if (this.cp !== 'power' && this.cp !== 'fuse') this.checkpoint('f1'); this.objective(); });
    this.trigger([-21, y1 - 1, -10], [-10, y1 + 10, 10], () => {
      // the lobby, the first time: the clock, and someone at the top of the broken stairs
      H.audio?.knock(H.obj.clock.pos, 1, 0.9, 0); H.audio?.swell(5, 0.5);
      if (!this.has('phantom2')) { this.set('phantom2'); this.app.show(V(0, 10.5, 18.2), PI, { roll: 0.7, hunch: 0.15 }); this.phantomT = 0; this.phantomOn = 'stairs'; }
    });
    this.trigger([-43, y1 - 1, 5], [-23, y1 + 8, 27], () => { this.gramStop?.(); this.gramStop = H.audio?.gramophone(O.gramophone); H.ui.subtitle('[The gramophone starts to play]', 3); this.after(40, () => { if (!this.has('power')) { this.gramStop?.(); this.gramStop = null; } }); });
    this.trigger([-62, y1 - 1, 30], [-24, y1 + 10, 58], () => { H.audio?.piano(O.piano.keys, [69, 72, 76, 0, 74, 71, 0, 69, 68], 0.55, 0.45); H.ui.subtitle('[The piano plays, very softly]', 3); });
    // the basement
    this.trigger([-72, FL.B - 1, -4], [-60, FL.B + 8, 4], () => { this.set('reachedB'); this.objective(); this.after(45, () => { const M = H.monster; if (!this.finale && !M.active) M.arrive('B', { ride: 6 }); }); });
    this.trigger([-72, FL.B - 1, -28], [-52, FL.B + 8, -5], () => { this.mannequins = true; });
    // out of the front doors
    this.trigger([-10, -4, 63], [10, 12, 76], () => { if (this.has('chainCut')) this._ending(); }, { once: false });
  }
  _rattle(door) {
    let t = 0;
    const L = door.leaves[0];
    const stop = H.world.onUpdate((dt) => { t += dt; L.inner.rotation.y = Math.sin(t * 60) * 0.01 * Math.max(0, 1 - t); if (t > 1) { L.inner.rotation.y = 0; stop(); } });
  }
  _bathScare() {
    const O = H.obj;
    if (this.has('bath')) return;
    this.set('bath');
    this.after(0.8, () => {
      H.audio?.bulbPop(O.bathBulb.pos); O.bathBulb.on = false;
      H.audio?.whisper(O.bath.center.clone().setY(FL.F3 + 4), 0.8);
      this.after(1.6, () => {
        O.curtainClosed.visible = false; O.curtainOpen.visible = true; O.tubFigure.visible = false; O.mirrorWriting.visible = true;
        O.bathBulb.on = true; O.bathBulb.flicker = 0.5;
        H.audio?.stinger(0.55);
      });
    });
  }

  // --- each frame ---------------------------------------------------------------------------------------------------------------------------------
  update(dt) {
    const P = H.player, M = H.monster, O = H.obj;
    if (P.mode === 'play' || P.mode === 'hide') this.time += dt;
    // triggers
    const pp = P.pos;
    for (const tr of this.triggers) {
      const inside = tr.box.containsPoint(pp);
      if (inside && !tr.inside && (!tr.cond || tr.cond())) { tr.fn(); if (tr.once) tr.done = true; }
      tr.inside = inside;
    }
    this.triggers = this.triggers.filter((t) => !t.done);
    // the apparitions: gone as soon as you look at them long enough (or the lights go)
    if (this.phantomOn) {
      this.phantomT += dt;
      const a = this.app.rig.root.position;
      const toA = a.clone().setY(a.y + 7).sub(P.camPos).normalize();
      const looking = toA.dot(P.camDir) > 0.93;
      this.phantomLook = (this.phantomLook || 0) + (looking ? dt : 0);
      if (this.phantomLook > 0.9 || this.phantomT > 9) {
        // the nearest lights go out for a moment, and he's gone
        const near = H.lights.fixtures.filter((f) => f.pos.distanceTo(a) < 18);
        for (const f of near) f.broken = true;
        H.audio?.bulbPop(a.clone().setY(a.y + 8)); H.audio?.swell(3, 0.45);
        this.after(0.35, () => this.app.hide());
        this.after(1.4, () => { for (const f of near) f.broken = false; });
        this.phantomOn = null; this.phantomLook = 0;
      }
      this.app.update(dt);
    }
    this.tvTick?.(dt);
    if (this.tvOn && P.pos.distanceTo(O.tv.pos) > 40) this._tvOff();
    // the rocking horse rocks itself
    if (this.horseT > 0) { this.horseT -= dt; O.horse.rotation.z = Math.sin(this.time * 3.2) * 0.12 * Math.min(1, this.horseT / 3); }
    // the sheets in the laundry move as if something passed through them
    for (const s of O.sheets || []) {
      const md = M.active ? M.pos.distanceTo(s.m.position) : 99;
      const k = 0.04 + (md < 6 ? (6 - md) * 0.06 : 0);
      s.m.rotation.x = Math.sin(this.time * 1.1 + s.ph) * k;
      s.m.rotation.z = Math.sin(this.time * 0.7 + s.ph * 2) * k * 0.4;
    }
    // the clock goes again once the power's back on
    if (this.has('power')) O.clock.pendulum.rotation.z = Math.sin(this.time * 2.4) * 0.12;
    // the mannequins in storage turn to face you when you're not looking
    if (this.mannequins) {
      for (const m of O.mannequins) {
        const to = P.camPos.clone().sub(m.position);
        const looking = to.clone().negate().normalize().dot(P.camDir) > 0.6;
        if (!looking) { const want = Math.atan2(to.x, to.z); m.rotation.y += Math.atan2(Math.sin(want - m.rotation.y), Math.cos(want - m.rotation.y)) * Math.min(1, dt * 2); }
      }
    }
    // the director: if nothing's happened for a while on the ground floor, he comes looking
    if (this.has('reachedF1') && !this.finale && !M.active && this.time - this.lastEncounter > (this.has('power') ? 45 : 110) && this.time - (this.mLeftAt || 0) > 40 && this.floor() === 'F1') {
      this.lastEncounter = this.time;
      M.arrive('F1', { ride: 5, far: true });
    }
    // while he's on your floor, things get worse
    const near = M.active ? Math.max(0, 1 - M.pos.distanceTo(pp) / 26) : 0;
    P.fear += ((M.state === 'chase' ? 1 : near) - P.fear) * Math.min(1, dt * 1.5);
    this.dread = this.area() === 'stairs' ? 0.6 : this.area() === 'basement' ? 1.4 : 1;
    // let go of the cutters and he stops holding back
    if (this.cutting && !P.holdIt) this.cutting = false;
    // the porch: going out of the doors
    if (this.finale && this.has('chainCut') && pp.z > 62.5 && !this.ended) this._ending();
    // the storm
    this._storm(dt);
    if (this._obj && H.player.mode === 'hide' && M.active) this.objective();
  }
  _storm(dt) {
    this.stormT = (this.stormT ?? 8) - dt;
    if (this.stormT <= 0) { this.stormT = 14 + Math.random() * 26; this.lightning(Math.random()); }
    const L = H.lights;
    if (this.flash) {
      this.flash.t += dt;
      const t = this.flash.t, seq = this.flash.seq;
      let v = 0; for (const [at, d, a] of seq) if (t > at && t < at + d) v = Math.max(v, a * (1 - (t - at) / d));
      L.lightning = v;
      const out = this.area() === 'outside';
      H.world.ambient.intensity = 0.12 + (out ? 0.16 : 0) + v * (out ? 2.6 : 0.1);
      if (H.moon) H.moon.intensity = out ? 0.45 + v * 4 : 0;
      if (t > 1.5) { this.flash = null; L.lightning = 0; }
    } else { const out = this.area() === 'outside'; H.world.ambient.intensity = out ? 0.28 : 0.12; if (H.moon) H.moon.intensity = out ? 0.45 : 0; }
  }
  lightning(dist = 0.5) {
    this.flash = { t: 0, seq: [[0, 0.08, 1], [0.12, 0.05, 0.5], [0.22, 0.25, 0.9]] };
    H.audio?.thunder(dist);
  }
  after(s, fn) { return H.world.delay(s, fn); }
}

void boxGeo;
