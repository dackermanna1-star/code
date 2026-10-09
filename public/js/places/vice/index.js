// "VICE CITY" - an open-world crime game in the style of the Grand Theft
// Auto games that came long after 2008, set in a made-up Miami: South Beach
// and Ocean Drive, Downtown and Brickell, Little Havana, the port, the
// causeways across the bay. Drive anything, fight anyone, run from the
// police, and work for the people who run this town.
// (A user-made place; it draws its own world and interface. Vice City, its
// streets, people and story are made up for this game. Models: Kenney, CC0.
// Photo textures: Poly Haven, CC0.)
import * as THREE from 'three';
import { V, K } from './state.js';
import { makePlan } from './world/plan.js';
import { Ground } from './world/ground.js';
import { VPhys } from './core/phys.js';
import { Events } from './core/events.js';
import { loadModels } from './assets/models.js';
import { Session } from './session.js';

export default {
  thumbnailImage: null,

  build(world, ctx = {}) {
    for (const k of Object.keys(V)) delete V[k];
    if (ctx.thumbnail) return { thumbnail: { cam: [2600, 300, 1900], look: [2500, 0, 1200] } };
    const t0 = performance.now();
    V.world = world;
    V.events = new Events();
    V.cfg = { debugWorld: true, quality: 'high' };
    V.plan = makePlan();
    V.ground = new Ground(V.plan).generate();
    V.phys = new VPhys(V.ground, V.plan);
    V.ready = loadModels();
    V.buildMs = Math.round(performance.now() - t0);
    const cam = world.camera; cam.near = 0.3; cam.far = 9000; cam.fov = 60; cam.updateProjectionMatrix();
    return { thumbnail: { cam: [2600, 300, 1900], look: [2500, 0, 1200] } };
  },

  setup(game, ctx = {}) {
    V.game = game;
    V.ctx = ctx;
    V.session = new Session(game, ctx);
    V.session.init();
  },

  update(game, dt) { V.session?.update(dt); },

  onExit(game, close) { V.session?.dispose(); close(); },
};
