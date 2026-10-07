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
import { planStreets, planSites } from './world/settlements.js';
import { Buildings } from './world/buildings.js';
import { Kit } from './build/kit.js';
import { TEMPLATES } from './build/index.js';
import { placeProps } from './build/placeProps.js';
import { Phys } from './physics.js';
import { photoTextures } from './textures.js';
import { Post } from './post.js';
import { THUMB } from './thumb.js';
import { Session } from './game/session.js';
import { makeItem } from './game/inventory.js';
import { sounds } from '../../engine/Sound.js';

export default {
  thumbnailImage: THUMB,
  build(world, ctx = {}) {
    for (const k of Object.keys(O)) delete O[k];
    O.world = world; O.thumb = !!ctx.thumbnail;
    const t0 = performance.now();
    O.photos = photoTextures(world.renderer);
    O.terrain = new Terrain(47).generate({ streets: planStreets });
    // where every building goes (this levels the ground under them, so it comes before the land is drawn)
    O.plan = planSites(O.terrain);
    O.terrainView = new TerrainView(world, O.terrain, O.photos);
    O.phys = new Phys(O.terrain);
    const K = new Kit(O.phys);
    K.lazy = true; // furniture is built only near you
    for (const s of O.plan.sites) { K.begin(s); TEMPLATES[s.tpl].build(K, s); K.end(); }
    const extra = placeProps(K, O.terrain, O.plan);
    O.camps = extra.camps;
    O.kit = K;
    // holes in the land (bunkers): cut away inside the blockhouse, ignored underneath by anyone down there
    O.terrain.holes = [];
    for (const B of K.buildings) for (const [h, render] of [[B.hole, true], [B.under, false]]) {
      if (!h) continue;
      const c = Math.cos(B.yaw), sn = Math.sin(B.yaw);
      O.terrain.holes.push({ x: B.x + h.lx * c + h.lz * sn, z: B.z - h.lx * sn + h.lz * c, hx: h.hx, hz: h.hz, yaw: B.yaw, c: Math.cos(B.yaw), s: Math.sin(B.yaw), render });
    }
    O.terrainView.setHoles(O.terrain.holes);
    O.buildings = new Buildings(world, K, O.photos, O.phys);
    O.roads = new Roads(world, O.terrain, O.photos);
    O.sky = new Sky(world);
    O.water = new Water(world, O.terrain);
    O.veg = new Vegetation(world, O.terrain, O.phys, { extra: extra.trees });
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
    O.post = new Post(world);
    world.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    game.resize(window.innerWidth, window.innerHeight);
    O.post.resize();
    window.addEventListener('resize', () => { O.post.resize(); O.mapUI?.draw(); });
    const sun = world.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -140; sc.right = 140; sc.top = 140; sc.bottom = -140; sc.near = 10; sc.far = 1400; sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
    world.scene.add(sun.target);
    // the engine's own camera, keys, sounds and character don't apply here
    game.camera.update = () => {};
    game.camera.zoom = () => {}; game.camera.pan = () => {}; game.camera.tilt = () => {};
    game.updateLocalInput = () => {};
    game.equip = () => {};
    game.gui.focusChat = () => {};
    game.respawnTime = null; game.forceFieldTime = 0;
    game.setStats([]);
    const play = sounds.play.bind(sounds);
    sounds.play = (name, ...a) => { if (['step', 'jump', 'swoosh', 'landing', 'uuhhh', 'camclick', 'ping', 'click'].includes(name)) return; play(name, ...a); };
    game.on('spawned', (p, ch) => { if (p.isLocal) { ch.root.visible = false; ch.freeze?.(true); } });
    O.session = new Session(game);
    O.session.init();
    // hooks for tests: a free camera, teleporting, the time and the weather
    window.__ob = {
      O, THREE,
      cam: (x, y, z, yaw = 0, pitch = 0) => { O.freeCam = { pos: new THREE.Vector3(x, y, z), yaw, pitch }; },
      look: (x, y, z, tx, ty, tz) => { const d = new THREE.Vector3(tx - x, ty - y, tz - z); O.freeCam = { pos: new THREE.Vector3(x, y, z), yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) }; },
      free: () => { O.freeCam = null; },
      tp: (x, z, yaw = 0) => { O.player.place(x, z, yaw); O.buildings.furnishNear(x, z); },
      give: (id, o) => { const it = makeItem(id, o); if (!O.inv.add(it)) O.loot.drop(it, O.player.pos.x, O.player.pos.y, O.player.pos.z); O.hud.changed(); return it; },
      hold: (id, o) => { const it = makeItem(id, o); O.inv.slots.hands = it; O.inv.changed(); O.weapons.refresh(); return it; },
      zombie: (d = 25, a = 0) => { const P = O.player, x = P.pos.x - Math.sin(P.yaw + a) * d, z = P.pos.z - Math.cos(P.yaw + a) * d; return O.zombies.add(x, O.phys.groundAt(x, P.pos.y + 4, z, 0.6, 10), z); },
      face: (x, z) => { const P = O.player; P.yaw = Math.atan2(-(x - P.pos.x), -(z - P.pos.z)); },
      time: (h) => { O.hour = h; },
      weather: (w) => O.sky.setWeather(w, true),
      info: () => ({ build: Math.round(O.buildMs), gen: O.terrain.genMs, sites: O.plan.sites.length, bverts: O.buildings.verts, binner: O.buildings.innerVerts, doors: O.kit.doors.length, tiles: O.terrainView.tiles, calls: O.post.info?.calls, tris: O.post.info?.tris, trees: O.veg.items.length, near: O.veg.nearCount, far: O.veg.farCount, boxes: O.phys.count, state: O.session.state, zombies: O.zombies.active, bandits: O.bandits.list.filter((m) => !m.dead).length, items: O.loot.items.length }),
    };
  },

  update(game, dt) {
    if (!O.session) return;
    O.session.update(dt);
  },

  onExit(game, close) { O.session?.save(); O.input?.unlock(); game.gui.root.classList.remove('ob-mode'); close(); },
};
