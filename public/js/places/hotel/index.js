// "ESCAPE THE HAUNTED HOTEL" - one night in the Ravenhurst Hotel. You wake
// in Room 313 at 3:33 a.m.; the power is out, the front doors are chained
// and the Night Manager walks the halls. A first-person horror game: a
// flashlight, wardrobes to hide in, notes to read, three fuses to find and
// a long way down to the front doors. Single player.
// (A user-made place in the style of the horror games that came long after
// 2008; it uses its own lighting, sound and interface. The Ravenhurst, its
// story and its Night Manager are made up for this game.)
import * as THREE from 'three';
import { sounds } from '../../engine/Sound.js';
import { H } from './state.js';
import * as T from './textures.js';
import { materials } from './materials.js';
import { Kit } from './kit.js';
import { Lights } from './lights.js';
import { Interact } from './interact.js';
import { Nav } from './nav.js';
import { Inventory } from './items.js';
import { buildF3 } from './floor3.js';
import { buildStairwell } from './stairwell.js';
import { buildF1 } from './floor1.js';
import { buildLobby } from './lobby.js';
import { buildBasement } from './basement.js';
import { buildExterior } from './exterior.js';
import { Post } from './post.js';
import { Player } from './player.js';
import { UI } from './ui.js';
import { HotelAudio } from './audio.js';
import { Monster } from './monster.js';
import { Story } from './story.js';
import { Atmos } from './fx.js';

const THUMB = { cam: [0, 6.5, 57], look: [0, 15, 12] };

export default {
  build(world, ctx = {}) {
    for (const k of Object.keys(H)) delete H[k];
    world.useStaticGrid(24);
    Object.assign(H, { world, T, obj: {}, elev: {}, elevators: [], doors: [], spots: [], notes: [], pickups: new Map(), thumb: !!ctx.thumbnail });
    H.M = materials(world.renderer);
    H.kit = new Kit(world, { cell: 44 });
    H.lights = new Lights(world, { pool: 8 });
    H.interact = new Interact(world);
    H.nav = new Nav(world);
    H.inv = new Inventory();
    buildF3(); buildStairwell(); buildF1(); buildLobby(); buildBasement(); buildExterior();
    const nav = H.nav, O = H.obj;
    nav.link('c3:-70', 'sD:30', { door: O.dStairs3, stairs: true });
    nav.link('c1:-70', 'sD:0', { door: O.dStairs1, stairs: true });
    nav.link('cB:-70', 'sD:-15', { door: O.dStairsB, stairs: true });
    H.kit.flush();
    H.lights.finalize();
    if (!ctx.thumbnail) nav.autoLink(17);
    // the look: black, no sun, just a breath of moonlight
    world.setSkyColor(0x000000);
    world.scene.fog = new THREE.Fog(0x000000, 60, 230);
    H.lights.setFog(60, 230);
    world.ambient.color.set(0x8494b8); world.ambient.groundColor.set(0x1a1410); world.ambient.intensity = 0.05;
    world.sun.intensity = 0; world.fill.intensity = 0; world.sun.castShadow = false;
    world.scene.remove(world.sun); world.scene.remove(world.fill);
    const cam = world.camera; cam.near = 0.05; cam.far = 700; cam.fov = 70; cam.updateProjectionMatrix();
    if (ctx.thumbnail) {
      // for the place's picture: the lobby with the lights on
      H.lights.power = true; world.ambient.intensity = 0.6;
      H.lights.update(0.016, new THREE.Vector3(...THUMB.cam));
    }
    return { thumbnail: THUMB };
  },

  setup(game, ctx = {}) {
    const world = game.world;
    world.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    game.resize(window.innerWidth, window.innerHeight);
    H.game = game;
    H.post = new Post(world);
    H.post.resize();
    window.addEventListener('resize', () => H.post.resize());
    H.ui = new UI(game);
    H.audio = new HotelAudio();
    H.player = new Player(game);
    H.monster = new Monster();
    H.story = new Story(game);
    H.atmos = new Atmos(world);
    H.playerName = ctx.info?.player?.name || 'Guest';
    // the engine's own bits we don't want here
    const play = sounds.play.bind(sounds);
    sounds.play = (name, ...a) => { if (['step', 'jump', 'swoosh', 'landing', 'uuhhh', 'camclick', 'ping'].includes(name)) return; play(name, ...a); };
    game.camera.update = () => {};
    game.camera.zoom = () => {}; game.camera.pan = () => {}; game.camera.tilt = () => {};
    game.updateLocalInput = () => H.player.updateInput(game._dt || 1 / 60);
    game.gui.focusChat = () => {};
    game.respawnTime = null; game.forceFieldTime = 0;
    game.setStats([]);
    game.on('playerAdded', (p) => { if (p.isLocal) { p.spawnOverride = { position: H.start.stand.clone(), yaw: 0 }; H.playerName = p.name; } });
    game.on('spawned', (p, ch) => { if (p.isLocal) { ch.root.visible = false; if (H.player.mode === 'intro') ch.freeze(true); } });
    // paused (or on the title screen): draw, but don't move anything
    const tick = game.tick.bind(game);
    game.tick = (dt) => {
      if (H.paused || H.ui.titleOpen || H.ui.deadOpen || H.ui.endOpen) {
        if (H.ui.titleOpen) { H.lights.update(dt, world.camera.position); H.post.update(dt, {}); H.atmos.update(dt); }
        world.render();
        return;
      }
      tick(dt);
    };
    // behind the title: the lobby in the dark
    world.camera.position.set(0, 6.5, 55); world.camera.lookAt(0, 16, 14);
    H.post.fade = 0.45; H.post.fadeTo = 0.45;
    H.player.mode = 'intro';
    H.ui.title(!!Story.saved(), (how) => {
      sounds.unlock();
      H.player.lock();
      H.post.fade = 1; H.post.fadeTo = 1;
      const go = () => {
        const ch = game.localPlayer?.character;
        if (!ch) { setTimeout(go, 100); return; }
        ch.freeze(false);
        H.story.begin(how);
      };
      go();
    });
    // for testing from the console
    window.__hotel = {
      H,
      tp: (x, y, z, yaw = 0) => H.player.teleport(new THREE.Vector3(x, y, z), yaw),
      give: (id, n = 1) => H.inv.add(id, n),
      flag: (f) => { H.story.set(f); H.story.objective(); },
      event: (e) => H.story.event(e),
      arrive: (f = 'F3', o = {}) => H.monster.arrive(f, o),
      stats: () => ({ tris: H.kit.stats.tris, batches: H.kit.stats.batches, colliders: H.kit.colliders.length, fixtures: H.lights.fixtures.length, nodes: H.nav.nodes.length, links: H.nav.nodes.reduce((s, n) => s + n.links.length, 0) / 2, calls: world.renderer.info.render.calls, frameTris: world.renderer.info.render.triangles }),
    };
  },

  update(game, dt) {
    if (!H.player) return;
    const world = game.world, cam = world.camera;
    H.player.update(dt);
    H.monster.update(dt);
    H.story.update(dt);
    for (const d of H.doors) d.update(dt);
    for (const s of H.spots) s.update(dt);
    for (const list of Object.values(H.elev)) for (const e of list) e.update(dt);
    H.obj.keyBox.update(dt);
    H.lights.update(dt, cam.position);
    const P = H.player;
    H.post.update(dt, { fear: P.fear * (P.mode === 'hide' ? 1.2 : 1), breath: P.holding ? 1 - P.breath : 0, blur: P.mode === 'dead' ? 2 : 0 });
    H.audio.update(dt, cam);
    H.ui.update(dt);
    H.atmos.update(dt);
  },

  onExit(game, close) { H.audio?.stopSpeech(); close(); },
};
