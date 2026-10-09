// The session: makes every system, runs them in a fixed order each frame and
// owns the game states (loading, title, play, paused, wasted, busted).
// Systems live in V (state.js) and find each other there. See ARCHITECTURE.md
// for each system's contract; this file is the only place that knows the order.
import * as THREE from 'three';
import { V, K } from './state.js';
import { Input } from '../outbreak/game/input.js';
import { sounds } from '../../engine/Sound.js';
import { debugWorld } from './world/debugview.js';
import { START } from './world/layout.js';
import { Sky } from './world/sky.js';
import { Water } from './world/water.js';
import { TerrainView } from './world/terrain.js';
import { Roads } from './world/roads.js';
import { City } from './world/city.js';
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
    V.city = new City(world, V.plan, V.ground, V.phys);
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

    V.ready.then(() => {
      for (const s of [V.vehicles, V.peds, V.player, V.missions]) s.ready?.();
      V.player.place?.(START.x, START.z, START.yaw);
      this.state = V.menus.title ? 'title' : 'play';
      V.menus.showTitle?.();
      V.post.fadeIn?.(1.5);
    });
    this.hooks();
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
      info: () => ({ build: V.buildMs, ground: V.ground.genMs, plan: V.plan.ms, nodes: V.plan.nodes.length, edges: V.plan.edges.length, blocks: V.plan.blocks.length, boxes: V.phys.count, decks: V.phys.decks.length, calls: V.post.info?.calls, tris: V.post.info?.tris, state: this.state }),
    };
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const inp = V.input;
    inp.frame?.();
    const live = this.state === 'play';
    const sdt = live ? dt : 0;
    if (live) V.time.hour = (V.time.hour + dt * V.time.scale) % 24;
    // gameplay (frozen while paused, on the title or dead)
    if (live || this.state === 'wasted' || this.state === 'busted') {
      V.player.update?.(sdt, inp);
      V.weapons.update?.(sdt, inp);
      V.vehicles.update?.(sdt);
      V.traffic.update?.(sdt);
      V.peds.update?.(sdt);
      V.police.update?.(sdt);
      V.missions.update?.(sdt);
      V.combat.update?.(sdt);
    }
    V.peds.lateUpdate?.(dt);
    V.fx.update?.(dt);
    // the camera, then everything that depends on where it is
    if (V.freeCam) this.freeCam(dt, inp); else V.cam.update?.(dt, inp);
    const cam = V.world.camera;
    V.sky.update?.(dt, V.time.hour, cam.position);
    V.sky.updateEnv?.(V.world.renderer, V.world.scene);
    V.water.update?.(dt, V.sky);
    V.terrain.update?.(cam);
    V.roads.update?.(dt, cam);
    V.city.update?.(dt, cam);
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
