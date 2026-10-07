// A life in South Karevia, from the title screen to the death screen. This
// starts every system, runs them each frame in order, handles what the keys
// do (F, Tab, M, Esc, stances), keeps the clock and the weather turning,
// saves your character every half minute (and when you leave), puts a new
// survivor on the coast with a shirt, a torch and a bandage, and when you die
// leaves your body lying where you fell - with everything you had on you.
import * as THREE from 'three';
import { O } from '../state.js';
import { Inventory, makeItem, def } from './inventory.js';
import { Survival } from './survival.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Crowd, paintPlayer } from './humanoid.js';
import { Combat } from './combat.js';
import { FX } from './fx.js';
import { Loot, serItem, deserItem } from './loot.js';
import { Zombies, Bodies } from './zombies.js';
import { Bandits } from './bandits.js';
import { Nav, tagLinks } from './nav.js';
import { Hands, Actions } from './weapons.js';
import { Audio } from './audio.js';
import { Events } from './events.js';
import { Gear } from './gear.js';
import { Hud } from '../ui/hud.js';
import { InventoryUI } from '../ui/inventory.js';
import { MapUI } from '../ui/map.js';
import { Menus } from '../ui/menus.js';
import { CSS } from '../ui/style.js';
import { PLACES, POIS, SPAWNS } from '../world/layout.js';
import { sounds } from '../../../engine/Sound.js';

const SAVE = 'outbreak.save.v1', SETTINGS = 'outbreak.settings.v1', WORLD = 'outbreak.world.v1';
const DEFAULTS = { sens: 1, fov: 72, invert: false, volume: 0.8, brightness: 1, quality: 'high', fps: false };
const WEATHERS = [['clear', 34], ['cloudy', 26], ['overcast', 14], ['rain', 12], ['storm', 6], ['fog', 8]];

export class Session {
  constructor(game) {
    this.game = game;
    this.state = 'loading';
    O.session = this;
    O.settings = { ...DEFAULTS, ...load(SETTINGS) };
  }

  /** Make everything (once). */
  init() {
    const game = this.game, world = game.world;
    if (!document.getElementById('ob-css')) { const st = document.createElement('style'); st.id = 'ob-css'; st.textContent = CSS; document.head.appendChild(st); }
    game.gui.root.classList.add('ob-mode');
    const ui = document.createElement('div'); ui.className = 'ob'; game.gui.root.appendChild(ui);
    this.uiRoot = ui;
    O.input = new Input(game.canvas);
    O.fx = new FX(world);
    O.crowd = new Crowd(world, 110);
    O.combat = new Combat();
    O.loot = new Loot(world);
    O.bodies = new Bodies();
    O.zombies = new Zombies();
    O.bandits = new Bandits(world);
    tagLinks(O.kit.buildings);
    O.nav = new Nav(O.kit.buildings);
    O.actions = new Actions();
    O.audio = new Audio();
    O.stats = { zombies: 0, bandits: 0, time: 0, distance: 0 };
    O.events = new Events(world);
    O.gear = new Gear(world);
    // the static loot spots, and the ones that come with furniture
    for (const L of O.kit.loot) O.loot.addSpot(L);
    O.buildings.onFurnish = (B, out, loaded) => { for (const L of out.loot) loaded ? O.loot.addSpot(L) : O.loot.removeSpot(L); };
    for (const rec of O.buildings.furnished.values()) for (const L of rec.out?.loot || []) O.loot.addSpot(L);
    // the interface
    O.hud = new Hud(ui);
    O.invUI = new InventoryUI(ui);
    O.mapUI = new MapUI(ui);
    O.menus = new Menus(ui);
    O.ui = {
      get open() { return O.invUI.isOpen || O.mapUI.isOpen || !!O.menus.open; },
      close: () => { O.invUI.close(); O.mapUI.close(); this._uiChanged(); },
      openMap: () => { O.invUI.close(); O.mapUI.open(); this._uiChanged(); },
      onWear: () => this.dress(),
    };
    O.onDeath = (cause) => this.die(cause);
    // the player
    O.player = new Player(game);
    O.inv = new Inventory();
    O.survival = new Survival();
    O.weapons = new Hands(world);
    O.inv.onChange = () => { if (O.invUI.isOpen) O.invUI._dirty = true; O.hud?.changed(); };
    O.player.person = { x: 0, y: 0, z: 0, yaw: 0, outfit: 'player', pose: { arms: null }, owner: O.player, invisible: true };
    O.crowd.add(O.player.person);
    O.player.hit = (dmg, part, dir, by, o = {}) => {
      if (!O.survival.alive) return;
      const p = part === 'head' ? 'head' : part.startsWith('leg') ? 'leg' : part.startsWith('arm') ? 'arm' : 'torso';
      O.survival.hurt(dmg, { part: p, bleed: o.bullet ? 0.85 : 0.35, armorPierce: o.pierce, cause: by?.squad ? 'a bandit' : by?.walker !== undefined ? 'the infected' : 'something', blood: o.bullet ? dmg * 0.5 : dmg * 0.3 });
      O.actions.cancel();
      O.player.flinch = 1;
    };
    this.applySettings();
    // leaving or switching tabs: save
    this._onHide = () => { if (document.visibilityState === 'hidden') this.save(); };
    // the browser let go of the mouse (Esc does that before the page hears it): pause
    document.addEventListener('pointerlockchange', () => {
      if (!O.input.locked && this.state === 'play' && !O.ui.open && !O.input.forceLocked) { this.pause(); this._pausedAt = performance.now(); }
    });
    document.addEventListener('visibilitychange', this._onHide);
    window.addEventListener('beforeunload', () => this.save());
    this._prevPlace = null;
    this.saveT = 30;
    this.weatherT = 400 + Math.random() * 300;
    this.lightningT = 10;
    this.titleT = 0;
    this._rainInit(world);
    // the world: corpses you left behind in earlier lives
    const W = load(WORLD);
    if (W) { O.loot.load(W.loot, deserItem); for (const c of W.corpses || []) this._corpse(c); }
    this.title();
  }

  // --- states -------------------------------------------------------------------------------------------------------------------
  title() {
    this.state = 'title';
    O.input.ui = true; O.input.unlock();
    O.hour = 19.1; O.sky.setWeather('cloudy', true);
    O.weapons.vm.visible = false; O.weapons.held.visible = false; O.post.vmVisible = false; O.weapons.light.intensity = 0;
    O.events.silence();
    O.menus.showTitle(!!load(SAVE));
    O.post.fadeIn(2);
  }
  newGame() {
    localStorage.removeItem(SAVE);
    this._reset();
    // a new survivor: a shirt, trousers, a torch and a bandage
    const inv = O.inv;
    inv.slots.torso = makeItem('tshirt', { cond: 0.6 + Math.random() * 0.3 });
    inv.slots.legs = makeItem('jeans', { cond: 0.5 + Math.random() * 0.4 });
    inv.add(makeItem('flashlight', { charge: 0.55 }));
    inv.add(makeItem('bandage', { n: 1 }));
    // the hotbar: the torch and the bandage
    inv.all().forEach((it) => { const d = def(it); if (d.light) inv.setHot(0, it); if (d.med) inv.setHot(1, it); });
    let x, z, yaw;
    for (let tries = 0; tries < 20; tries++) {
      const s = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
      x = s[0] + (Math.random() - 0.5) * 120; z = s[1] + (Math.random() - 0.5) * 40; yaw = (Math.random() - 0.5) * 1.2; // facing inland
      const fx = x - Math.sin(yaw) * 6, fz = z - Math.cos(yaw) * 6;
      if (O.terrain.waterAt(x, z) > O.terrain.heightAt(x, z) - 0.5) continue;
      if (!(O.veg?.items || []).some((t) => (Math.abs(t.x - x) < 5 && Math.abs(t.z - z) < 5) || (Math.abs(t.x - fx) < 5 && Math.abs(t.z - fz) < 5))) break;
    }
    O.player.place(x, z, yaw);
    O.hour = 6.5 + Math.random() * 3.5;
    O.sky.setWeather(Math.random() < 0.6 ? 'clear' : 'cloudy', true);
    O.stats = { zombies: 0, bandits: 0, time: 0, distance: 0 };
    this._start();
    O.hud.note('You wake on the shore. Find food, water, and something to fight with.', 7);
    O.hud.note('Tab: inventory · F: interact · M: map', 7);
  }
  continueGame() {
    const S = load(SAVE);
    if (!S) return this.newGame();
    this._reset();
    O.inv = Inventory.load(S.inv);
    O.inv.onChange = () => { if (O.invUI) O.invUI._dirty = true; O.hud?.changed(); };
    O.survival.load(S.survival);
    O.player.place(S.pos[0], S.pos[2], S.yaw, S.pos[1]);
    O.player.stance = S.stance || 'stand';
    O.hour = S.hour ?? 10;
    O.sky.setWeather(S.weather || 'clear', true);
    O.stats = S.stats || O.stats;
    O.player.distance = S.stats?.distance || 0;
    this._start();
  }
  _reset() {
    O.actions.cancel();
    O.events.reset();
    O.zombies.clear(); O.bandits.clear();
    O.bodies.list = O.bodies.list.filter((b) => b.player);
    O.inv = new Inventory(); O.inv.onChange = () => { if (O.invUI) O.invUI._dirty = true; O.hud?.changed(); };
    O.survival = new Survival();
    O.player.alive = true; O.player.third = false; O.player.vel.set(0, 0, 0); O.player.stamina = 100; O.player.distance = 0; O.player.stance = 'stand';
    O.player.person.pose = { arms: null };
    O.weapons.cur = null; O.weapons.curUid = -1; O.weapons.refresh();
  }
  _start() {
    this.state = 'play';
    O.menus.hideAll();
    O.input.ui = false; O.input.lock();
    O.buildings.furnishNear(O.player.pos.x, O.player.pos.z);
    O.loot.update(0, O.player.pos);
    this.dress();
    O.weapons.refresh();
    O.post.fadeIn(1.5);
    this._prevPlace = null;
    this.save();
  }
  resume() { this.state = 'play'; O.menus.hideAll(); O.input.ui = false; O.input.lock(); }
  pause() { this.state = 'paused'; O.ui.close(); O.menus.showPause(); O.input.ui = true; O.input.unlock(); }
  quitToTitle() { if (O.survival.alive && this.state !== 'dead') this.save(); O.ui.close(); this.title(); }
  exit() { this.save(); this.game.emit('exit'); }

  /** You died: the body stays; the character is gone. */
  die(cause) {
    if (this.state === 'dead') return;
    this.state = 'dead';
    O.player.alive = false;
    O.actions.cancel();
    O.ui.close();
    // everything you had goes with your body
    const items = [];
    for (const s of ['hands', 'shoulder', 'melee', 'head', 'torso', 'vest', 'legs', 'back']) { const it = O.inv.slots[s]; if (it) items.push(it); }
    const body = this._corpse({ x: O.player.pos.x, y: O.player.pos.y, z: O.player.pos.z, yaw: O.player.yaw + Math.PI, items: items.map(serItem), t: Date.now() });
    O.playerBodyOwner = body.owner;
    localStorage.removeItem(SAVE);
    this.saveWorld();
    // fall over, see yourself lying there
    O.player.third = true;
    O.post.fadeOut(4);
    this.deadT = 0; this.deadCause = cause || 'unknown causes';
    O.audio?.hurt(30);
  }
  /** A body of yours from this or an earlier life. */
  _corpse(c) {
    const items = (c.items || []).map((o) => (o.uid ? o : deserItem(o))).filter(Boolean);
    // dressed in what they died in (a picture of their own; the newest three)
    this._pc = ((this._pc ?? -1) + 1) % 3;
    const slots = {}; for (const it of items) { const w = def(it).wear; if (w && !slots[w.slot]) slots[w.slot] = it; }
    paintPlayer(outfitOf(slots), 'pc' + this._pc);
    const person = { x: c.x, y: c.y, z: c.z, yaw: c.yaw || 0, outfit: 'pc' + this._pc, pose: { dead: 1, fallDir: 1, arms: null }, owner: { dead: true, deadT: 99 } };
    O.crowd.add(person);
    const body = O.bodies.add({ x: c.x, y: c.y, z: c.z, name: 'Your old body', items, person, owner: person.owner, player: true, t: 0, always: false, saved: c });
    // the newest three, no more
    const mine = O.bodies.list.filter((b) => b.player);
    if (mine.length > 3) { const old = mine[0]; O.crowd.remove(old.person); O.bodies.list.splice(O.bodies.list.indexOf(old), 1); }
    return body;
  }

  // --- saving -------------------------------------------------------------------------------------------------------------------
  save() {
    if (this.state !== 'play' && this.state !== 'paused') return;
    if (!O.survival.alive) return;
    const P = O.player;
    store(SAVE, { v: 1, pos: [+P.pos.x.toFixed(2), +P.pos.y.toFixed(2), +P.pos.z.toFixed(2)], yaw: P.yaw, stance: P.stance, survival: O.survival.save(), inv: O.inv.save(), hour: O.hour, weather: O.sky.weather, stats: { ...O.stats, distance: P.distance } });
    this.saveWorld();
  }
  saveWorld() {
    const corpses = O.bodies.list.filter((b) => b.player).map((b) => ({ x: b.x, y: b.y, z: b.z, yaw: b.person.yaw, items: b.items.map(serItem) }));
    store(WORLD, { loot: O.loot.save(), corpses });
  }
  saveSettings() { store(SETTINGS, O.settings); }
  applySettings() {
    const S = O.settings, world = this.game.world;
    sounds.setMuted(S.volume <= 0.001);
    sounds.setVolume?.(S.volume);
    O.post.brightness = S.brightness;
    const q = S.quality;
    world.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'high' ? 1.25 : q === 'medium' ? 1 : 0.8));
    O.post.resize();
    const sm = q === 'low' ? 1024 : 2048;
    if (world.sun.shadow.mapSize.x !== sm) { world.sun.shadow.mapSize.set(sm, sm); world.sun.shadow.map?.dispose(); world.sun.shadow.map = null; }
    if (O.buildings) { O.buildings.innerRange = q === 'low' ? 140 : 190; O.buildings.detailRange = q === 'low' ? 300 : q === 'medium' ? 420 : 520; }
    if (O.grass) O.grass.uni.gRadius.value = q === 'low' ? 40 : q === 'medium' ? 55 : 68;
    O.hud && O.hud.fps.classList.toggle('hide', !S.fps);
  }

  /** Paint your clothes onto your figure and sleeves. */
  dress() {
    const inv = O.inv, torso = inv.slots.torso;
    paintPlayer(outfitOf(inv.slots));
    O.weapons.setSleeves(torso && /coat|jacket|hoodie|flannel|track/i.test(torso.id) ? (torso.tint || def(torso).color) : '#e0b896');
    O.hud?.changed();
  }
  /** A piece of clothing (or a bag) picked up but not worn: what's in its pockets comes out into yours (or onto the ground). */
  spill(it) {
    if (!it?.grid?.items.length) return;
    const inv = O.inv, d = def(it);
    if (d.wear && inv.slots[d.wear.slot] === it) return;
    if (!inv.locate(it)) return;
    const P = O.player;
    for (const c of it.grid.items.slice()) { it.grid.take(c); if (!inv.add(c)) O.loot.drop(c, P.pos.x, P.pos.y, P.pos.z); }
    O.hud?.note('You empty the ' + d.name.toLowerCase(), 2);
    inv.changed();
  }

  // --- each frame ---------------------------------------------------------------------------------------------------------------
  update(dt) {
    dt = Math.min(dt, 0.05);
    const I = O.input;
    I.frame();
    const world = this.game.world, cam = world.camera;
    this._fps(dt);
    if (this.state === 'title' || this.state === 'loading') {
      // the title: the camera drifts along the coast at dusk
      this.titleT += dt;
      const a = this.titleT * 0.025;
      const cx = 1560, cz = 2030;
      cam.position.set(cx + Math.cos(a) * 520, 120 + Math.sin(a * 0.7) * 20, cz + Math.sin(a) * 300 + 160);
      cam.lookAt(cx, 30, cz - 60);
      cam.updateMatrixWorld();
      O.hour = 19.05;
      this._world(dt, false);
      return;
    }
    // keys that always work
    if (I.pressed.has('escape')) {
      if (O.invUI.isOpen || O.mapUI.isOpen) O.ui.close();
      else if (this.state === 'play') this.pause();
      else if (this.state === 'paused' && performance.now() - (this._pausedAt || 0) > 300) { this.saveSettings(); this.resume(); }
    }
    if (this.state === 'play') {
      if (I.pressed.has('tab') || I.pressed.has('i')) { if (O.invUI.isOpen) O.ui.close(); else { O.mapUI.close(); O.invUI.open(); this._uiChanged(); } }
      if (I.pressed.has('m')) { if (O.mapUI.isOpen) O.ui.close(); else O.ui.openMap(); }
      // the pointer: back to the game when no screen is open
      I.ui = O.ui.open;
      if (!I.ui && !I.locked && I.clicked.size) I.lock();
    }
    const playing = this.state === 'play' && !O.ui.open;
    const P = O.player;
    if (this.state === 'play' || this.state === 'dead') {
      if (playing) {
        if (I.pressed.has('c')) P.setStance(P.stance === 'crouch' ? 'stand' : 'crouch');
        if (I.pressed.has('z')) P.setStance(P.stance === 'prone' ? 'stand' : 'prone');
        if (I.pressed.has('f')) this.interact();
      }
      const inp = playing ? I : { keys: new Set(), pressed: new Set(), buttons: new Set(), clicked: new Set(), mx: 0, my: 0 };
      if (P.alive) P.update(dt, inp); else this._deadCam(dt);
      // a few seconds after you die: the screen that says so
      if (this.state === 'dead' && this.deadT >= 0 && (this.deadT += dt) > 3.5) {
        this.deadT = -1;
        O.input.ui = true; O.input.unlock();
        O.menus.showDead(this.deadCause, { ...O.stats, distance: O.player.distance });
        O.post.fadeIn(1);
      }
      O.weapons.update(dt, inp);
      O.actions.update(dt);
      O.survival.update(dt, { moving: P.moving > 0.2, sprinting: P.mode === 'sprint', indoors: P.indoors, hour: O.hour, weather: O.sky.w, exhausted: P.stamina < 15 });
      if (this.state === 'play') { O.stats.time += dt; }
      this._place();
      // your figure (seen in third person and in shadows)
      const pp = P.person;
      pp.x = P.pos.x; pp.y = P.pos.y; pp.z = P.pos.z; pp.yaw = P.yaw + Math.PI;
      pp.invisible = P.camDist < 2; // (aiming in third person goes to your eyes)
      pp.hidden = !P.alive; // (your corpse takes over)
      const ps = pp.pose;
      ps.walk = (ps.walk || 0) + dt * Math.hypot(P.vel.x, P.vel.z) * 0.6; ps.stride = Math.min(1, Math.hypot(P.vel.x, P.vel.z) / 12);
      ps.crouch = P.stance === 'crouch' ? 1 : 0; ps.prone = P.stance === 'prone' ? 1 : 0;
      ps.arms = O.weapons.mode === 'gun' ? (def(O.inv.slots.hands).pistol ? 'pistol' : 'aim') : O.weapons.mode === 'melee' ? 'melee' : O.weapons.mode === 'item' ? 'hands' : null;
      ps.attack = O.weapons.swing ? O.weapons.swing.t / O.weapons.swing.dur : 0;
      ps.look = -P.pitch * 0.8;
      if (!P.alive) { ps.dead = Math.min(1, (ps.dead || 0) + dt * 2); ps.stride = 0; }
      // the inventory screen follows what's going on
      if (O.invUI.isOpen && (O.invUI._dirty || (this._invT = (this._invT ?? 0) - dt) <= 0)) { O.invUI._dirty = false; this._invT = 0.5; if (!O.invUI.drag && !O.invUI.menu) O.invUI.render(); }
      if (O.mapUI.isOpen) O.mapUI.draw();
      // saving
      this.saveT -= dt;
      if (this.saveT <= 0 && this.state === 'play') { this.saveT = 30; this.save(); }
    }
    // (tests: a camera of their own)
    if (O.freeCam) { const f = O.freeCam; cam.position.copy(f.pos); cam.quaternion.setFromEuler(new THREE.Euler(f.pitch, f.yaw, 0, 'YXZ')); cam.updateMatrixWorld(); }
    this._world(dt, true);
  }

  /** The world going on: time, weather, the infected, bandits, bullets, loot, sound, drawing. */
  _world(dt, live) {
    const world = this.game.world, cam = world.camera;
    // the clock: days are long, nights pass a little quicker
    if (live && this.state !== 'paused') {
      const night = O.hour < 5.5 || O.hour > 20.5;
      O.hour = (O.hour + dt * (night ? 0.016 : 0.0105)) % 24;
      this._weather(dt);
    }
    O.sky.update(dt, O.hour, cam.position);
    O.sky.updateEnv(world.renderer, world.scene);
    if (!live || this.state === 'paused') O.events.silence();
    O.water.update(dt, O.sky);
    O.terrainView.update(cam);
    O.veg.update(dt, cam, O.sky);
    O.grass.update(dt, cam, O.sky);
    O.buildings.update(dt, cam, O.sky);
    O.roads.setWet?.(O.sky.state?.rain || 0);
    if (live && this.state !== 'paused') {
      O.loot.update(dt, O.player.pos);
      O.zombies.update(dt);
      O.bandits.update(dt);
      O.combat.update(dt);
      O.bodies.update(dt);
      O.events.update(dt);
    }
    O.fx.update(dt);
    O.crowd.update(cam.position);
    O.gear.update(O.player?.person, O.inv, live && O.player?.alive && O.player.camDist >= 2);
    this._rain(dt);
    O.audio.update(dt);
    O.hud.update(dt);
    // how it looks: eyes adjusting indoors, colour draining with blood loss, blur when you're about to pass out
    const S = O.survival, P = O.player;
    const indoor = live && P?.indoors && P.alive;
    O.exposure = (O.exposure ?? 1) + ((indoor ? 1.6 : 1.0) - (O.exposure ?? 1)) * Math.min(1, dt * 1.2);
    const blood = S ? S.blood / 100 : 1;
    const scope = O.weapons?.aiming && O.weapons.aim > 0.9 && O.weapons.info?.scope && (O.weapons.info.scope === 'sniper' || O.weapons.info.scope === 'acog') ? 1 : 0;
    O.post.update(dt, {
      exposure: O.exposure * (live ? 1 : 1.05),
      desat: live ? Math.min(0.92, Math.max(0, (0.85 - blood) * 1.6) + (S?.health < 25 ? 0.2 : 0)) : 0,
      blur: live ? Math.min(0.8, Math.max(0, (0.35 - Math.max(0, blood)) * 2.2) + (O.weapons?.supp || 0) * 0.15) : 0,
      vignette: live ? Math.max(0, (0.6 - blood)) * 0.8 + (O.weapons?.supp || 0) * 0.3 + (scope ? 0 : 0) : 0.25,
      scope,
    });
    // what you hear: from your eyes
    sounds.setListener(cam.position);
  }

  _weather(dt) {
    this.weatherT -= dt;
    if (this.weatherT <= 0) {
      this.weatherT = 480 + Math.random() * 520;
      let t = 0; for (const [, w] of WEATHERS) t += w;
      let r = Math.random() * t, pick = 'clear';
      for (const [k, w] of WEATHERS) { r -= w; if (r <= 0) { pick = k; break; } }
      O.sky.setWeather(pick);
    }
    // lightning in a storm
    if ((O.sky.w.rain || 0) > 0.7) {
      this.lightningT -= dt;
      if (this.lightningT <= 0) { this.lightningT = 8 + Math.random() * 20; O.post.hit(0.35, 0xc8d8ff); O.audio.thunder(300 + Math.random() * 1500); }
    }
  }

  /** Entering a town: its name, big. */
  _place() {
    const P = O.player;
    let cur = null;
    for (const p of PLACES) if (Math.hypot(P.pos.x - p.x, P.pos.z - p.z) < p.r * 0.9) cur = p;
    if (!cur) for (const q of POIS) if (q.kind !== 'gas' && Math.hypot(P.pos.x - q.x, P.pos.z - q.z) < 70) cur = q;
    if (cur !== this._prevPlace) {
      if (cur && this.state === 'play') O.hud.location(cur.name, { city: 'City', town: 'Town', village: 'Village', military: 'Military base', airfield: 'Airfield', castle: 'Ruins', lighthouse: 'Lighthouse', radio: 'Radio station', farm: 'Farm', camp: 'Bandit territory' }[cur.kind] || '');
      this._prevPlace = cur;
    }
  }

  _deadCam(dt) {
    const cam = this.game.world.camera, P = O.player;
    this._deadA = (this._deadA ?? P.yaw) + dt * 0.12;
    const tx = P.pos.x, ty = P.pos.y + 1, tz = P.pos.z;
    cam.position.lerp(new THREE.Vector3(tx + Math.sin(this._deadA) * 9, ty + 7, tz + Math.cos(this._deadA) * 9), Math.min(1, dt * 1.5));
    cam.lookAt(tx, ty, tz); cam.updateMatrixWorld();
  }

  /** F: whatever you're looking at. */
  interact() {
    const P = O.player, f = P.focus;
    if (!f) {
      // water at your feet or just ahead?
      const wl = O.terrain.waterAt(P.pos.x, P.pos.z);
      if (wl > P.pos.y - 1.5) this._water(true);
      return;
    }
    if (f.kind === 'door') {
      const d = f.door;
      if (d.broken) return;
      O.buildings.setDoor(d);
      O.audio.door(d, d.target > 0.5);
      O.combat.noise(d.x, d.y, d.z, 10, P);
    } else if (f.kind === 'item') {
      const w = f.item, it = w.it, inv = O.inv;
      if (inv.canAdd(it)) {
        O.loot.take(w);
        const all = inv.add(it);
        if (!all) { if (!inv.slots.hands) { inv.slots.hands = it; inv.changed(); O.weapons.refresh(); } else O.loot.drop(it, P.pos.x, P.pos.y, P.pos.z); }
        this.spill(it);
        O.audio.pickup(); O.hud.note(def(it).name, 1.6); this._autoHot(it);
        if (def(it).wear && Object.values(inv.slots).includes(it)) this.dress();
      }
      else if (!inv.slots.hands) { O.loot.take(w); inv.slots.hands = it; inv.changed(); O.weapons.refresh(); O.audio.pickup(); }
      else O.hud.note('No room. Open your inventory (Tab) to make space.', 2.5);
    } else if (f.kind === 'body') {
      O.mapUI.close(); O.invUI.open(); this._uiChanged();
    } else if (f.kind === 'well') this._water(false);
    else if (f.kind === 'ladder') P.grab(f.ladder, true);
  }
  _water(dirty) {
    const S = O.survival, inv = O.inv;
    // fill the first empty bottle, or drink
    const bottle = inv.all().find((it) => def(it).refill && it.n < def(it).uses);
    if (bottle) { bottle.n = def(bottle).uses; bottle.dirty = dirty; O.hud.note(`You fill the ${def(bottle).name.toLowerCase()}${dirty ? ' (purify it first!)' : ''}`, 2.5); O.audio.drink(); inv.changed(); return; }
    O.actions.start({ label: 'Drinking', time: 2.5, sound: 'drink', done: () => { S.water = Math.min(100, S.water + 25); if (dirty && Math.random() < 0.35) S.poison(0.5); } });
  }
  _autoHot(it) {
    const d = def(it), inv = O.inv;
    if (!(d.gun || d.melee || d.light || d.med || d.zoom)) return;
    if (inv.hotbar.includes(it.uid)) return;
    const free = inv.hotbar.findIndex((u) => !u || !inv.byUid(u));
    if (free >= 0) inv.setHot(free, it);
  }
  _uiChanged() { O.input.ui = O.ui.open; if (O.input.ui) O.input.unlock(); else if (this.state === 'play') O.input.lock(); O.hud.changed(); }

  // --- rain -------------------------------------------------------------------------------------------------------------------------
  _rainInit(world) {
    const n = 2600, pos = new Float32Array(n * 6);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rainLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab4c0, transparent: true, opacity: 0.35, depthWrite: false }));
    this.rainLines.frustumCulled = false;
    world.scene.add(this.rainLines);
    this.rainDrops = Array.from({ length: n }, () => ({ x: (Math.random() - 0.5) * 80, y: Math.random() * 50, z: (Math.random() - 0.5) * 80 }));
  }
  _rain(dt) {
    const k = O.sky.w.rain || 0, cam = this.game.world.camera.position;
    const show = k > 0.05 && !(O.player?.indoors && this.state === 'play');
    this.rainLines.visible = show;
    if (!show) return;
    const pos = this.rainLines.geometry.attributes.position.array, n = Math.floor(this.rainDrops.length * Math.min(1, k * 1.2));
    const wind = (O.sky.w.wind || 0.3) * 6;
    for (let i = 0; i < this.rainDrops.length; i++) {
      const d = this.rainDrops[i];
      d.y -= dt * 75; d.x += dt * wind;
      if (d.y < -10) { d.y = 40 + Math.random() * 10; d.x = (Math.random() - 0.5) * 80; d.z = (Math.random() - 0.5) * 80; }
      const o = i * 6;
      if (i >= n) { pos[o] = pos[o + 3] = 0; pos[o + 1] = pos[o + 4] = -1e4; pos[o + 2] = pos[o + 5] = 0; continue; }
      const x = cam.x + d.x, y = cam.y + d.y, z = cam.z + d.z;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; pos[o + 3] = x + wind * 0.02; pos[o + 4] = y + 1.8; pos[o + 5] = z;
    }
    this.rainLines.geometry.attributes.position.needsUpdate = true;
  }
  _fps(dt) {
    if (!O.settings.fps || !O.hud) return;
    this._fc = (this._fc || 0) + 1; this._ft = (this._ft || 0) + dt;
    if (this._ft > 0.5) { O.hud.fps.textContent = Math.round(this._fc / this._ft) + ' fps · ' + (O.post.info?.calls ?? 0) + ' calls'; this._fc = 0; this._ft = 0; }
  }
}

/** How someone looks in these clothes (slots: { torso, legs, vest, back, head }). */
function outfitOf(slots) {
  const col = (s, f) => { const it = slots[s]; return it ? (it.tint || def(it).color) : f; };
  const torso = slots.torso, legs = slots.legs, vest = slots.vest, back = slots.back;
  return { shirt: col('torso', '#d8c8a8'), pants: col('legs', '#8a6a5a'), sleeves: torso && /coat|jacket|hoodie|flannel|track/i.test(torso.id) ? 'long' : 'short', pattern: torso && def(torso).camo ? 'camo' : vest ? 'vest' : torso?.id === 'policeJacket' ? 'police' : torso?.id === 'tracktop' ? 'tracksuit' : null, vestCol: vest ? def(vest).color : null, pantsPattern: legs && def(legs).camo ? 'camo' : null, pack: back ? (back.tint || def(back).color) : null, face: 'human' };
}
function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }
function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('outbreak: could not save', e); } }
