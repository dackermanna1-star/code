// FX test scene for dev/entities-test.html (?scene=fx | fx2 | fxnight)
import * as THREE from 'three';
import { B } from '../src/world/blocks.js';
import { FX } from '../src/entities/fx/FX.js';
import { createZombieVisual } from '../src/entities/zombie/ZombieModel.js';
import { globalUniforms } from '../src/render/materials.js';

export function setupFX({ scene, world, camLook, updaters, params, log, camera }) {
  const SCENE = params.get('scene');
  const T_END = parseFloat(params.get('t') || '2');
  // seeded Math.random for reproducible screenshots
  let s = 12345;
  Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

  // walls of every material along z = 8 (faces toward -z ... we look from -z)
  const mats = [['stone', B.concrete], ['wood', B.planks_oak], ['metal', B.metal_wall], ['brick', B.brick_red], ['glass', B.glass]];
  mats.forEach(([, id], i) => world.fill(-10 + i * 4, 1, 8, -8 + i * 4, 4, 8, id));
  world.fill(-12, 1, 3, -12, 3, 9, B.concrete); // side wall
  world.fill(4, 0, -1, 7, 0, 2, B.water); // pond (top at y=1)
  world.fill(4, -1, -1, 7, -1, 2, B.sand);
  world.fill(-7, 0, -2, -4, 0, 1, B.sand);
  world.roofs.push([-3, 0, 2, 0, 4, 6]); // a dim "indoor" corner
  const fx = new FX(scene, world);
  window.__fx = fx;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const ev = []; // [time, fn]
  const at = (t, fn) => ev.push([t, fn]);

  if (SCENE === 'fx' || SCENE === 'fxnight') {
    // blood sprays in front of the walls (zombies shot), splats on walls, pools on the floor
    for (let k = 0; k < 5; k++) {
      at(0.05 + k * 0.08, () => fx.blood(V(-9 + k * 4, 2.2, 6.6), V(0, 0, 1), 2));
      at(0.1 + k * 0.08, () => fx.bloodSplat(V(-9.3 + k * 4, 2.3, 8), V(0, 0, -1), 1.2));
    }
    at(0.1, () => fx.bloodPool(V(-6, 1.0, 4.5), 1));
    at(0.1, () => fx.bloodPool(V(1.5, 1.0, 3.2), 0.9));
    at(0.3, () => fx.gore(V(-2.5, 1.8, 5.5), V(0.3, 0.2, 1), 1.5));
    at(0.2, () => fx.bloodSplat(V(-11, 2.0, 5.5), V(1, 0, 0), 1.4));
    // impacts on each material (bullet holes)
    mats.forEach(([m], i) => {
      for (let k = 0; k < 4; k++) at(0.6 + k * 0.1 + i * 0.03, () => fx.impact(V(-10 + i * 4 + 0.4 + k * 0.5, 1.6 + (k % 2) * 0.9, 8), V(0, 0, -1), m === 'brick' ? 'stone' : m));
    });
    for (let k = 0; k < 4; k++) at(T_END - 0.12 + k * 0.01, () => fx.impact(V(-6 + k * 0.6, 1, 2.5), V(0, 1, 0), ['dirt', 'grass', 'sand', 'gravel'][k]));
    at(T_END - 0.08, () => fx.impact(V(-2.5, 3.2, 8), V(0, 0, -1), 'metal'));
    // explosion mid-fireball, fire area + smoke column, burning barrel-ish fire
    at(T_END - 0.32, () => fx.explosion(V(8.5, 1, 4.5), 3.5));
    let fireH = null;
    at(0.0, () => { fireH = fx.fire(V(-4, 1, 1.5), { radius: 0.9, intensity: 1.1 }); });
    at(0.0, () => fx.smoke(V(11, 1, 9), { color: [0.75, 0.15, 0.1], rate: 12, size: 1.2, rise: 2.2 })); // red flare smoke
    at(0.0, () => fx.fire(V(-9.5, 1, 1), { radius: 0.35, intensity: 0.8 }));
    // splash, dust, block break, sparks, glass
    at(T_END - 0.18, () => fx.splash(V(5.5, 1.0, 0.5)));
    at(T_END - 0.3, () => fx.dust(V(0.5, 1, 0.5)));
    at(T_END - 0.25, () => fx.blockBreak(V(2.5, 1.5, 1.5), [0.6, 0.45, 0.3]));
    at(T_END - 0.06, () => fx.sparks(V(-1.5, 2.5, 7.95), V(0, 0, -1)));
    at(T_END - 0.3, () => fx.glass(V(8.5, 2.5, 7.6)));
    // gunfire: muzzle flash + tracers + shells
    for (let k = 0; k < 8; k++) at(0.4 + k * 0.2, () => fx.shell(V(1 + k * 0.05, 2.0, -2), V(1, 0.2, 0.2), k % 3 === 0 ? 'shotgun' : k % 3 === 1 ? 'rifle' : 'pistol'));
    at(T_END - 0.02, () => fx.muzzleFlash(V(0.6, 1.9, -2.5), V(0, 0, 1)));
    at(T_END - 0.025, () => fx.tracer(V(0.6, 1.9, -2.5), V(-1, 2.1, 8)));
    at(T_END - 0.04, () => fx.tracer(V(0.6, 1.9, -2.5), V(2.5, 2.8, 8)));
    // a zombie being shot for context
    const z = createZombieVisual({ variant: 'walker', outfit: 'office', seed: 3 });
    z.root.position.set(-1.0, 1, 6.6); z.root.rotation.y = Math.PI; scene.add(z.root); z.setLight(1, 0);
    at(0.9, () => { z.addWound('torso', z.getPartPosition('torso', V(0, 0, 0)).add(V(0, 0, -0.12))); z.flash(0xff2020, 0.7); z.hitReact('torso', V(0, 0, 1), 0.8); });
    updaters.push((dt) => z.update(dt, { state: 'stagger', speed: 0, aggro: 1 }));
    camLook(0.5, 3.2, -6.5, -0.5, 1.8, 6);
  } else if (SCENE === 'fx2') {
    // close look at the decals on the floor and the wall
    for (let k = 0; k < 10; k++) at(k * 0.05, () => fx.blood(V(-1 + (k % 5) * 0.5, 1.6, 6.5), V((k % 3 - 1) * 0.3, -0.2, 1), 1.6));
    at(0.1, () => fx.bloodPool(V(-0.5, 1, 4.8), 1.1));
    at(0.2, () => fx.gore(V(0.5, 1.4, 6), V(0, 0.3, 1), 1.2));
    at(0.2, () => fx.bloodSplat(V(-1.4, 2.4, 8), V(0, 0, -1), 1.2));
    for (let k = 0; k < 6; k++) at(0.3 + k * 0.05, () => fx.impact(V(-9.6 + k * 0.6, 1.5 + (k % 3) * 0.6, 8), V(0, 0, -1), 'stone'));
    for (let k = 0; k < 6; k++) at(0.3 + k * 0.05, () => fx.impact(V(-5.6 + k * 0.6, 1.5 + (k % 3) * 0.6, 8), V(0, 0, -1), 'wood'));
    for (let k = 0; k < 6; k++) at(0.3 + k * 0.05, () => fx.impact(V(-1.6 + k * 0.6, 1.5 + (k % 3) * 0.6, 8), V(0, 0, -1), 'metal'));
    for (let k = 0; k < 6; k++) at(0.3 + k * 0.05, () => fx.impact(V(6.4 + k * 0.6, 1.5 + (k % 3) * 0.6, 8), V(0, 0, -1), 'glass'));
    for (let k = 0; k < 6; k++) at(0.1 + k * 0.1, () => fx.shell(V(1.5, 2, 3), V(1, 0.3, -0.3), ['pistol', 'rifle', 'shotgun'][k % 3]));
    camLook(-1, 2.6, 1.5, -2.2, 1.4, 7);
  }
  ev.sort((a, b) => a[0] - b[0]);
  let t = 0, ei = 0, maxMs = 0, tot = 0, frames = 0;
  updaters.push((dt) => {
    t += dt;
    while (ei < ev.length && ev[ei][0] <= t) ev[ei++][1]();
    const t0 = performance.now();
    fx.update(dt, camera);
    const e = performance.now() - t0;
    maxMs = Math.max(maxMs, e); tot += e; frames++;
    // feed FX lights into the point-light uniforms (the real renderer decides how to merge them)
    globalUniforms.uPLCount.value = fx.writeLightsToUniforms(0, 8);
  });
  window.__fxReport = () => `fx.update avg ${(tot / frames).toFixed(3)}ms max ${maxMs.toFixed(2)}ms; cubes ${fx.cubes.n} lit ${fx.lit.n} add ${fx.add.n} decals ${fx.decals.count} lights ${fx.lights.length}`;
}
