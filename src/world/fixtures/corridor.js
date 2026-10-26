// The building hallway just outside the front door. The player never steps
// out here, but deliveries land on the doormat and neighbors come and go.
import * as THREE from 'three';
import { G } from '../../game.js';
import { mat, MAT, box, rbox, cyl, sph, at, group, decal, FONT, lathe } from '../../items/kit.js';
import { fabric, tiles } from '../../core/textures.js';
import { allLayers } from '../../core/engine.js';
import { H } from '../apartment.js';

export function buildCorridor(apt) {
  const root = new THREE.Group(); root.name = 'corridor';
  const x0 = -4.2, x1 = 3.2, z0 = 5.3, z1 = 7.5;
  const W = x1 - x0, D = z1 - z0;
  // floor: patterned carpet runner over tile
  const tileTex = tiles({ base: '#d8d2c6', grout: '#b9b1a3', cols: 4, rows: 4, seed: 33 });
  const fm = mat('#ffffff', { map: tileTex.map, rough: 0.5 });
  const floor = box(W, 0.02, D, fm, { cast: false }); at(floor, (x0 + x1) / 2, -0.01, (z0 + z1) / 2); root.add(floor);
  apt.addSolid(floor, { surface: true, step: 'tile' });
  const runner = box(W - 0.4, 0.008, 1.2, mat('#6b2f2f', { rough: 1, map: fabric({ base: '#ffffff', seed: 51, scale: 3 }) }), { cast: false });
  at(runner, (x0 + x1) / 2, 0.004, (z0 + z1) / 2 + 0.1); root.add(runner);
  // walls
  const wallMat = apt.wallMats.corridor;
  const wainscot = mat('#3d4a52', { rough: 0.6 });
  root.add(at(box(W, H, 0.1, wallMat), (x0 + x1) / 2, H / 2, z1 + 0.05));
  root.add(at(box(0.1, H, D, wallMat), x0 - 0.05, H / 2, (z0 + z1) / 2));
  root.add(at(box(W, 1.0, 0.02, wainscot), (x0 + x1) / 2, 0.5, z1 - 0.01));
  root.add(at(box(W, 0.03, 0.04, mat('#e8e2d6', { rough: 0.5 })), (x0 + x1) / 2, 1.0, z1 - 0.02));
  const ceil = box(W, 0.1, D, mat('#efeae2', { rough: 0.9 })); at(ceil, (x0 + x1) / 2, H + 0.05, (z0 + z1) / 2); root.add(ceil);
  // neighbour's door across the hall
  const nd = group(
    at(rbox(1.0, 2.15, 0.05, 0.006, mat('#5a3a2a', { rough: 0.45, clearcoat: 0.3 })), 0, 1.075, 0),
    at(rbox(0.13, 0.018, 0.018, 0.008, MAT.gold()), 0.33, 1.0, -0.05),
    at(decal(0.12, 0.06, 'door-num-2404', (ctx, w, h) => { ctx.fillStyle = '#d4b06a'; ctx.font = `600 ${h * 0.8}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('2404', w / 2, h / 2); }, { tw: 128, th: 64 }), 0, 1.72, -0.03),
  );
  nd.children[2].rotation.y = Math.PI;
  nd.position.set(-0.6, 0, z1 - 0.03);
  root.add(nd);
  // neighbour's doormat & plant
  root.add(at(rbox(0.8, 0.015, 0.5, 0.005, mat('#3b3530', { rough: 1, map: fabric({ base: '#ffffff', seed: 52, knit: true }) }), { cast: false }), -0.6, 0.008, z1 - 0.35));
  const pot = lathe([[0, 0], [0.15, 0], [0.19, 0.38], [0.2, 0.4], [0, 0.4]], mat('#c9c3b8', { rough: 0.8 }), 24); at(pot, x0 + 0.35, 0, z1 - 0.35); root.add(pot);
  for (let i = 0; i < 9; i++) { const leaf = sph(0.13, mat('#3e6b3a', { rough: 0.8 }), 8, 6); leaf.scale.set(0.6, 1.4, 0.3); leaf.rotation.set(Math.random() - 0.5, i * 0.7, (Math.random() - 0.5) * 0.8); at(leaf, x0 + 0.35 + Math.cos(i) * 0.08, 0.6 + Math.random() * 0.25, z1 - 0.35 + Math.sin(i) * 0.08); root.add(leaf); }
  // elevator at the east end
  const ex = x1;
  const elev = group(
    at(box(0.06, 2.3, 1.4, mat('#8a8f96', { rough: 0.25, metal: 0.9 })), 0, 1.15, 0),
    at(box(0.07, 2.1, 0.58, mat('#b8bec6', { rough: 0.18, metal: 1 })), -0.01, 1.05, -0.3),
    at(box(0.07, 2.1, 0.58, mat('#b8bec6', { rough: 0.18, metal: 1 })), -0.01, 1.05, 0.3),
  );
  elev.position.set(ex - 0.03, 0, (z0 + z1) / 2 + 0.1);
  root.add(elev);
  const elevLight = mat('#ffffff', { emissive: '#ffb34d', ei: 0.4 });
  root.add(at(box(0.02, 0.06, 0.2, elevLight, { cast: false }), ex - 0.07, 2.42, (z0 + z1) / 2 + 0.1));
  apt.elevatorLight = elevLight;
  root.add(at(box(0.07, 2.6, 2.2, wallMat), ex + 0.05, 1.3, (z0 + z1) / 2));
  // sconces (always on, warm)
  for (const sx of [-2.6, 1.4]) {
    const sm = mat('#fff4e0', { emissive: '#ffd9a8', ei: 3 });
    root.add(at(cyl(0.07, 0.05, 0.18, sm, 16), sx, 2.0, z1 - 0.1));
    root.add(at(box(0.05, 0.08, 0.06, MAT.gold()), sx, 1.9, z1 - 0.03));
  }
  const l = new THREE.PointLight('#ffd7a3', 6, 7, 2); l.position.set(-0.6, 2.2, 6.4); allLayers(l); root.add(l);
  // our doormat: deliveries land here
  const mat0 = rbox(0.95, 0.018, 0.6, 0.006, mat('#2f2b27', { rough: 1, map: fabric({ base: '#ffffff', seed: 53, knit: true }) }), { cast: false });
  at(mat0, -0.6, 0.009, 5.72); root.add(mat0);
  const hello = decal(0.7, 0.35, 'mat-hello', (ctx, w, h) => { ctx.fillStyle = '#d9c9a8'; ctx.font = `800 ${h * 0.42}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('hi, go away', w / 2, h / 2); }, { tw: 256, th: 128 });
  hello.rotation.x = -Math.PI / 2; hello.rotation.z = Math.PI; at(hello, -0.6, 0.0185, 5.72); root.add(hello);
  apt.root.add(root);
  apt.corridor = root;
  // drop spots for packages (on and around the mat)
  apt.packageSpots = [
    new THREE.Vector3(-0.6, 0.02, 5.65), new THREE.Vector3(-0.95, 0.02, 5.8), new THREE.Vector3(-0.25, 0.02, 5.85),
    new THREE.Vector3(-0.6, 0.02, 6.1), new THREE.Vector3(-1.25, 0.02, 5.6), new THREE.Vector3(0.05, 0.02, 5.6),
    new THREE.Vector3(-1.0, 0.02, 6.25), new THREE.Vector3(-0.2, 0.02, 6.3),
  ];
  void G;
}
