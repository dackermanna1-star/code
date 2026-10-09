// The session: makes every system, runs them in a fixed order each frame and
// owns the game states (loading, title, play, paused, wasted, busted).
// Systems live in V (state.js) and find each other there. See ARCHITECTURE.md
// for each system's contract; this file is the only place that knows the order.
import * as THREE from 'three';
import { V, K } from './state.js';
import { Input } from '../outbreak/game/input.js';
import { sounds } from '../../engine/Sound.js';
import { debugWorld } from './world/debugview.js';
import { START, PLACES } from './world/layout.js';
import { Sky } from './world/sky.js';
import { Water } from './world/water.js';
import { TerrainView } from './world/terrain.js';
import { Roads } from './world/roads.js';
import { City } from './world/city.js';
import { Props } from './world/props.js';
import { Post } from './render/post.js';
import { CameraRig } from './core/camera.js';
import { FX } from './combat/fx.js';
import { Combat } from './combat/combat.js';
import { Vehicles } from './vehicles/vehicles.js';
import { Traffic } from './vehicles/traffic.js';
import { Peds } from './peds/peds.js';
import { Player } from './player/player.js';
import { Weapons } from './combat/weapons.js';
import { Police } from './police/police.js';
import { Missions } from './missions/missions.js';
import { Audio } from './audio/audio.js';
import { Radio } from './audio/radio.js';
import { Hud } from './ui/hud.js';
import { Menus } from './ui/menus.js';

const _v = new THREE.Vector3();

export class Session {
  constructor(game, ctx) {
    this.game = game; this.ctx = ctx;
    this.state = 'loading';
    this.cleanups = [];
  }

  init() {
    const game = this.game, world = game.world;
    // the engine's own camera, keys, sounds, character and HUD don't apply here
    game.camera.update = () => {};
    game.camera.zoom = () => {}; game.camera.pan = () => {}; game.camera.tilt = () => {}; game.camera.rotate = () => {};
    game.updateLocalInput = () => {};
    game.equip = () => {};
    game.gui.focusChat = () => {};
    game.respawnTime = null; game.forceFieldTime = 0;
    game.setStats([]);
    world.shadows = false;
    const play = sounds.play.bind(sounds);
    sounds.play = (name, ...a) => { if (['step', 'jump', 'swoosh', 'landing', 'uuhhh', 'camclick', 'ping', 'click'].includes(name)) return; play(name, ...a); };
    this.cleanups.push(game.on?.('spawned', (p, ch) => { if (p.isLocal) { ch.root.visible = false; ch.freeze?.(true); } }));

    V.input = new Input(world.renderer.domElement);
    V.time = { hour: 18.2, scale: 1 / 60, day: 1 }; // one game hour per real minute
    V.appearance = this.ctx?.info?.player?.appearance || null;

    // the world
    V.sky = new Sky(world);
    V.post = new Post(world);
    V.terrain = new TerrainView(world, V.ground);
    V.water = new Water(world, V.ground);
    V.roads = new Roads(world, V.plan, V.ground, V.phys);
    V.props = new Props(world, V.plan, V.ground, V.phys);   // public spaces first; the city adds its own palms to it
    V.city = new City(world, V.plan, V.ground, V.phys);
    V.props.finish?.();
    if (V.cfg.debugWorld && !V.city.real) V.debug = debugWorld(world, V.plan, V.ground, V.phys);
    // the game
    V.cam = new CameraRig(world.camera);
    V.fx = new FX(world);
    V.combat = new Combat();
    V.vehicles = new Vehicles(world);
    V.traffic = new Traffic();
    V.peds = new Peds(world);
    V.player = new Player();
    V.weapons = new Weapons();
    V.police = new Police();
    V.missions = new Missions();
    V.audio = new Audio();
    V.radio = new Radio();
    V.hud = new Hud(game.gui.root);
    V.menus = new Menus(game.gui.root);

    world.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    game.resize(window.innerWidth, window.innerHeight);
    V.post.resize?.();
    const onResize = () => { V.post.resize?.(); V.hud?.resize?.(); };
    window.addEventListener('resize', onResize);
    this.cleanups.push(() => window.removeEventListener('resize', onResize));

    V.settings = this.load('vice.settings.v1') || {};
    V.timeScale = 1;
    V.ready.then(() => {
      for (const s of [V.vehicles, V.traffic, V.peds, V.player, V.weapons, V.police, V.missions]) s.ready?.();
      const save = this.load('vice.save.v1');
      const door = V.city.places?.safehouse?.door;
      V.start = door ? { x: door.x + Math.sin(door.heading) * 4, z: door.z + Math.cos(door.heading) * 4, heading: door.heading } : START;
      V.player.place?.(V.start.x, V.start.z, V.start.heading);
      V.hasSave = !!save;
      this.saved = save;
      this.state = V.menus.showTitle ? 'title' : 'play';
      V.menus.showTitle?.(!!save);
      V.post.fadeIn?.(1.5);
    });
    // the game's own events
    this.cleanups.push(V.events.on('player:wasted', (e) => this.wasted(e)));
    this.cleanups.push(V.events.on('player:busted', (e) => this.busted(e)));
    const onLock = () => { if (!V.input.locked && this.state === 'play' && !V.input.ui && performance.now() - (this.resumedAt || 0) > 300) this.pause(); };
    document.addEventListener('pointerlockchange', onLock);
    this.cleanups.push(() => document.removeEventListener('pointerlockchange', onLock));
    const onHide = () => { if (document.hidden) { if (this.state === 'play') this.pause(); this.save(); } };
    document.addEventListener('visibilitychange', onHide);
    this.cleanups.push(() => document.removeEventListener('visibilitychange', onHide));
    const onUnload = () => this.save();
    window.addEventListener('beforeunload', onUnload);
    this.cleanups.push(() => window.removeEventListener('beforeunload', onUnload));
    this.hooks();
  }

  // ---- game states ----
  /** From the title screen: a new game, or carry on from the save. */
  start(continueSave = true) {
    const s = continueSave ? this.saved : null;
    if (s) this.restore(s); else { try { localStorage.removeItem('vice.save.v1'); } catch (e) { /* storage blocked */ } V.missions.reset?.(); }
    this.state = 'play';
    this.resumedAt = performance.now();
    V.menus.hideAll?.();
    V.input.lock();
    V.events.emit('game:start', { fresh: !s });
  }
  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    V.input.unlock();
    V.menus.openPause?.();
    V.audio?.pause?.(true);
  }
  resume() {
    if (this.state !== 'paused') return;
    this.state = 'play';
    this.resumedAt = performance.now();
    V.menus.hideAll?.();
    V.input.lock();
    V.audio?.pause?.(false);
  }
  /** Dead: slow motion, the grade drains, WASTED, then the hospital. */
  wasted() {
    if (this.state === 'wasted') return;
    this.state = 'wasted'; this.stateT = 0;
    V.hud.big?.('wasted');
    V.postFx = { ...(V.postFx || {}), wasted: 1 };
    V.missions.fail?.('You died.');
    this.after(5.5, () => this.respawn('hospital', 'Wasted'));
  }
  busted() {
    if (this.state === 'busted' || this.state === 'wasted') return;
    this.state = 'busted'; this.stateT = 0;
    V.hud.big?.('busted');
    V.postFx = { ...(V.postFx || {}), wasted: 0.6 };
    V.missions.fail?.('You were busted.');
    this.after(4.5, () => this.respawn('police', 'Busted'));
  }
  /** Back on your feet at the nearest hospital or police station, a little poorer. */
  respawn(kind, why) {
    V.post.fadeOut?.(0.6);
    this.after(0.8, () => {
      const P = V.player;
      const at = this.nearestPlace(kind, P.pos.x, P.pos.z);
      const door = V.city.places?.[at.id]?.door;
      const fee = kind === 'hospital' ? Math.min(P.money, 500) : Math.min(P.money, 750);
      P.money -= fee;
      P.hp = P.maxHp; P.armor = 0; P.dead = false;
      if (kind === 'police') V.weapons.clear?.();
      P.place(door ? door.x : at.x + 30, door ? door.z : at.z, door ? door.heading : 0);
      V.police.clear?.();
      V.postFx = { ...(V.postFx || {}), wasted: 0 };
      V.time.hour = (V.time.hour + 3) % 24;
      this.state = 'play';
      V.hud.hideBig?.();
      V.hud.notify?.(`${why}. ${kind === 'hospital' ? 'Hospital' : 'Legal'} fees: $${fee}`);
      V.post.fadeIn?.(1.2);
      V.events.emit('player:respawn', { kind });
      this.save();
    });
  }
  nearestPlace(kind, x, z) {
    let best = null, bd = Infinity;
    for (const p of PLACES) if (p.kind === kind) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
    return best || PLACES[0];
  }
  /** Run fn after `secs` of real time (independent of slow motion and pause). */
  after(secs, fn) { (this.timers ||= []).push({ t: secs, fn }); }

  // ---- saving ----
  load(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }
  store(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  save() {
    if (!V.player || this.state === 'loading' || this.state === 'title') return;
    const P = V.player;
    const data = {
      v: 1, money: P.money, hp: P.hp, armor: P.armor, hour: V.time.hour,
      pos: P.dead ? null : [P.pos.x, P.pos.z, P.heading],
      weapons: V.weapons.save?.() || null, missions: V.missions.save?.() || null, stats: V.stats || null,
    };
    this.store('vice.save.v1', data);
    V.hasSave = true; this.saved = data;
  }
  restore(s) {
    const P = V.player;
    P.money = s.money ?? P.money; P.hp = s.hp || P.maxHp; P.armor = s.armor || 0;
    if (s.hour != null) V.time.hour = s.hour;
    if (s.pos) P.place(s.pos[0], s.pos[1], s.pos[2]);
    if (s.weapons) V.weapons.load?.(s.weapons);
    if (s.missions) V.missions.load?.(s.missions);
    if (s.stats) V.stats = s.stats;
  }

  /** Test and debug hooks: window.__vc */
  hooks() {
    window.__vc = {
      V, K, THREE,
      // a free camera (for screenshots and tests); free() hands it back
      cam: (x, y, z, yaw = 0, pitch = 0) => { V.freeCam = { pos: new THREE.Vector3(x, y, z), yaw, pitch }; },
      look: (x, y, z, tx, ty, tz) => { const d = new THREE.Vector3(tx - x, ty - y, tz - z); V.freeCam = { pos: new THREE.Vector3(x, y, z), yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) }; },
      free: () => { V.freeCam = null; },
      fly: (on = true) => { V.flyCam = on; if (on && !V.freeCam) { const c = V.world.camera; V.freeCam = { pos: c.position.clone(), yaw: 0, pitch: 0 }; } },
      tp: (x, z, yaw = 0) => V.player.place?.(x, z, yaw),
      time: (h) => { V.time.hour = h; },
      play: () => { this.state = 'play'; V.menus.hideAll?.(); },
      session: this,
      save: () => this.save(),
      god: (on = true) => { (V.cheats ||= {}).god = on; },
      money: (n) => { V.player.money += n; },
      info: () => ({ build: V.buildMs, ground: V.ground.genMs, plan: V.plan.ms, nodes: V.plan.nodes.length, edges: V.plan.edges.length, blocks: V.plan.blocks.length, boxes: V.phys.count, decks: V.phys.decks.length, calls: V.post.info?.calls, tris: V.post.info?.tris, state: this.state }),
    };
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const inp = V.input;
    inp.frame?.();
    // real-time timers (state changes)
    if (this.timers?.length) for (const t of [...this.timers]) { t.t -= dt; if (t.t <= 0) { this.timers.splice(this.timers.indexOf(t), 1); t.fn(); } }
    // slow motion when you die
    const slow = this.state === 'wasted' ? 0.3 : this.state === 'busted' ? 0.5 : 1;
    V.timeScale += (slow - V.timeScale) * Math.min(1, dt * 3);
    const live = this.state === 'play';
    const dying = this.state === 'wasted' || this.state === 'busted';
    const sdt = live || dying ? dt * V.timeScale : 0;
    if (live) V.time.hour = (V.time.hour + dt * V.time.scale) % 24;
    if (live && (inp.pressed.has('escape') || inp.pressed.has('code:KeyP'))) this.pause();
    // autosave
    if (live && (this.saveT = (this.saveT || 0) + dt) > 30) { this.saveT = 0; this.save(); }
    // gameplay (frozen while paused, on the title or dead)
    if (live || dying) {
      V.player.update?.(sdt, inp);
      V.weapons.update?.(sdt, inp);
      V.vehicles.update?.(sdt);
      V.traffic.update?.(sdt);
      V.peds.update?.(sdt);
      V.police.update?.(sdt);
      V.missions.update?.(sdt);
      V.combat.update?.(sdt);
    }
    V.peds.lateUpdate?.(live || dying ? sdt : 0);
    V.fx.update?.(sdt);
    // the camera, then everything that depends on where it is
    if (V.freeCam) this.freeCam(dt, inp); else V.cam.update?.(dt, inp);
    const cam = V.world.camera;
    V.sky.update?.(dt, V.time.hour, cam.position);
    V.sky.updateEnv?.(V.world.renderer, V.world.scene);
    V.water.update?.(dt, V.sky);
    V.terrain.update?.(cam);
    V.roads.update?.(dt, cam);
    V.city.update?.(dt, cam);
    V.props.update?.(dt, cam);
    V.audio.update?.(dt);
    V.radio.update?.(dt);
    V.hud.update?.(dt);
    V.menus.update?.(dt);
    V.post.update?.(dt, V.postFx || {});
  }

  /** Debug fly camera: WASD + mouse, Shift fast, Q/E down/up. */
  freeCam(dt, inp) {
    const f = V.freeCam, cam = V.world.camera;
    if (V.flyCam) {
      f.yaw -= (inp.mx || 0) * 0.0025; f.pitch = Math.max(-1.5, Math.min(1.5, f.pitch - (inp.my || 0) * 0.0025));
      const sp = (inp.keys?.has('shift') ? 600 : 120) * dt;
      const fw = _v.set(-Math.sin(f.yaw) * Math.cos(f.pitch), Math.sin(f.pitch), -Math.cos(f.yaw) * Math.cos(f.pitch));
      const k = (c) => inp.keys?.has(c);
      if (k('w')) f.pos.addScaledVector(fw, sp);
      if (k('s')) f.pos.addScaledVector(fw, -sp);
      if (k('a')) { f.pos.x -= Math.cos(f.yaw) * sp; f.pos.z += Math.sin(f.yaw) * sp; }
      if (k('d')) { f.pos.x += Math.cos(f.yaw) * sp; f.pos.z -= Math.sin(f.yaw) * sp; }
      if (k('e')) f.pos.y += sp; if (k('q')) f.pos.y -= sp;
    }
    cam.position.copy(f.pos);
    cam.rotation.set(f.pitch, f.yaw, 0, 'YXZ');
    cam.updateMatrixWorld();
  }

  dispose() {
    for (const c of this.cleanups) try { c?.(); } catch (e) { /* ignore */ }
    V.input?.unlock?.(); V.input?.dispose?.();
    for (const s of ['hud', 'menus', 'audio', 'radio', 'missions']) try { V[s]?.dispose?.(); } catch (e) { /* ignore */ }
  }
}
