// "THE OUTBREAK" - South Karevia, three weeks after the dead got up. A
// single-player survival game in the style of DayZ: a big open map with a
// port city, towns, villages, farms, a military base and an airfield; loot,
// hunger, thirst and wounds; melee and guns; the infected and bandits.
// When you die you lose everything.
// (A user-made place in the style of the survival games that came long after
// 2008; it draws its own world and interface. South Karevia and everything
// in it is made up for this game. Photo textures: CC0, Poly Haven.)
import * as THREE from 'three';
import { O } from './state.js';
import { Terrain } from './world/terrain.js';
import { TerrainView } from './world/terrainView.js';
import { Sky } from './world/sky.js';
import { Water } from './world/water.js';
import { Roads } from './world/roads.js';
import { Vegetation } from './world/vegetation.js';
import { Grass } from './world/grass.js';
import { Phys } from './physics.js';
import { photoTextures } from './textures.js';
import { Post } from './post.js';

const UI_CSS = `.rbx-gui.ob-mode > :not(.ob){display:none!important}`;

export default {
  build(world, ctx = {}) {
    for (const k of Object.keys(O)) delete O[k];
    O.world = world; O.thumb = !!ctx.thumbnail;
    const t0 = performance.now();
    O.photos = photoTextures(world.renderer);
    O.terrain = new Terrain(47).generate();
    O.terrainView = new TerrainView(world, O.terrain, O.photos);
    O.phys = new Phys(O.terrain);
    O.roads = new Roads(world, O.terrain, O.photos);
    O.sky = new Sky(world);
    O.water = new Water(world, O.terrain);
    O.veg = new Vegetation(world, O.terrain, O.phys);
    O.grass = new Grass(world, O.terrain, O.terrainView);
    O.buildMs = performance.now() - t0;
    const cam = world.camera; cam.near = 0.12; cam.far = 7000; cam.fov = 72; cam.updateProjectionMatrix();
    O.hour = 9.5;
    O.sky.update(0, O.hour, cam.position);
    return { thumbnail: { cam: [1300, 160, 2300], look: [1560, 40, 1780] } };
  },

  setup(game) {
    const world = game.world;
    O.game = game;
    if (!document.getElementById('ob-css')) { const st = document.createElement('style'); st.id = 'ob-css'; st.textContent = UI_CSS; document.head.appendChild(st); }
    game.gui.root.classList.add('ob-mode');
    const ui = document.createElement('div'); ui.className = 'ob'; game.gui.root.appendChild(ui); O.uiRoot = ui;
    O.post = new Post(world);
    world.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    game.resize(window.innerWidth, window.innerHeight);
    O.post.resize();
    window.addEventListener('resize', () => O.post.resize());
    O.post.fadeIn(1.5);
    const sun = world.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -140; sc.right = 140; sc.top = 140; sc.bottom = -140; sc.near = 10; sc.far = 1400; sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
    world.scene.add(sun.target);
    // the engine's own camera and input don't apply here
    game.camera.update = () => {};
    game.camera.zoom = () => {}; game.camera.pan = () => {}; game.camera.tilt = () => {};
    game.updateLocalInput = () => {};
    game.respawnTime = null;
    game.setStats([]);
    game.on('spawned', (p, ch) => { if (p.isLocal) { ch.root.visible = false; ch.freeze?.(true); } });
    // a free camera for now
    O.fly = { pos: new THREE.Vector3(-1900, 60, 2250), yaw: 0.6, pitch: -0.08 };
    const cv = game.canvas;
    cv.addEventListener('mousedown', () => cv.requestPointerLock?.());
    window.addEventListener('mousemove', (e) => { if (document.pointerLockElement !== cv) return; O.fly.yaw -= e.movementX * 0.002; O.fly.pitch = Math.max(-1.5, Math.min(1.5, O.fly.pitch - e.movementY * 0.002)); });
    window.__ob = {
      O, THREE,
      cam: (x, y, z, yaw = 0, pitch = 0) => { O.fly.pos.set(x, y, z); O.fly.yaw = yaw; O.fly.pitch = pitch; },
      look: (x, y, z, tx, ty, tz) => { O.fly.pos.set(x, y, z); const d = new THREE.Vector3(tx - x, ty - y, tz - z); O.fly.yaw = Math.atan2(-d.x, -d.z); O.fly.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); },
      time: (h) => { O.hour = h; },
      weather: (w) => O.sky.setWeather(w, true),
      info: () => ({ build: Math.round(O.buildMs), gen: O.terrain.genMs, tiles: O.terrainView.tiles, calls: O.post.info?.calls, tris: O.post.info?.tris, trees: O.veg.items.length, near: O.veg.nearCount, far: O.veg.farCount, boxes: O.phys.count }),
    };
  },

  update(game, dt) {
    if (!O.post) return;
    const world = game.world, cam = world.camera, f = O.fly, k = game.keys;
    const sp = (k.has('shift') ? 400 : 80) * dt;
    const fw = new THREE.Vector3(-Math.sin(f.yaw) * Math.cos(f.pitch), Math.sin(f.pitch), -Math.cos(f.yaw) * Math.cos(f.pitch));
    const rt = new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
    if (k.has('w')) f.pos.addScaledVector(fw, sp);
    if (k.has('s')) f.pos.addScaledVector(fw, -sp);
    if (k.has('d')) f.pos.addScaledVector(rt, sp);
    if (k.has('a')) f.pos.addScaledVector(rt, -sp);
    if (k.has('e')) f.pos.y += sp;
    if (k.has('q')) f.pos.y -= sp;
    f.pos.y = Math.max(f.pos.y, O.terrain.heightAt(f.pos.x, f.pos.z) + 2);
    cam.position.copy(f.pos);
    cam.quaternion.setFromEuler(new THREE.Euler(f.pitch, f.yaw, 0, 'YXZ'));
    cam.updateMatrixWorld();
    O.sky.update(dt, O.hour, cam.position);
    O.sky.updateEnv(world.renderer, world.scene);
    O.water.update(dt, O.sky);
    O.terrainView.update(cam);
    O.veg.update(dt, cam, O.sky);
    O.grass.update(dt, cam, O.sky);
    O.post.update(dt, { exposure: 1.0 });
  },

  onExit(game, close) { game.gui.root.classList.remove('ob-mode'); close(); },
};
