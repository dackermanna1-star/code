// The building hallway just outside the front door: deliveries land on the
// doormat, couriers ride the elevator, and you can step out to knock on the
// neighbor's door or call the elevator (you never actually have to take it).
import * as THREE from 'three';
import { G } from '../../game.js';
import { mat, MAT, box, rbox, cyl, sph, at, group, decal, FONT, lathe } from '../../items/kit.js';
import { fabric, tiles } from '../../core/textures.js';
import { allLayers } from '../../core/engine.js';
import { pick } from '../../core/utils.js';
import { makeInteractable } from '../interactable.js';
import { H } from '../apartment.js';

const ELEVATOR_LINES = [
  'The elevator\'s here. You look in. It looks back. You let the doors close.',
  'Ding! …Nah. Everything you need comes up to you anyway.',
  'You hold the door for nobody, then head back home.',
  'It smells like someone\'s takeout in there. Yours could be on the way too.',
  'Twenty-four floors of strangers. Hard pass.',
];
const KNOCK_LINES = [
  '(muffled) "Who is it?" …you panic and tiptoe away.',
  'Footsteps. A long pause. Nobody answers.',
  'The music next door gets a little quieter. Nice.',
  '"If you\'re the delivery guy, leave it on the mat!"',
  'A dog barks once, then thinks better of it.',
  'A note slides under the door: "hi neighbor :)"',
];

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
  makeInteractable(nd, 'Apartment 2404', () => [{ key: 'E', label: 'Knock', run: () => {
    const p = new THREE.Vector3(-0.6, 1.3, z1 - 0.1);
    G.audio.play('knock', { pos: p });
    const late = G.clock.hour >= 22 || G.clock.hour < 7;
    setTimeout(() => G.ui.toast(late ? '"It\'s late!" a sleepy voice grumbles through the door.' : pick(KNOCK_LINES), { icon: '🚪' }), 1400);
    const f = G.state.flags;
    if (!f.knockedAt || G.clock.total - f.knockedAt > 60) { G.needs.add({ fun: 2 }); f.knockedAt = G.clock.total; }
    G.events.emit('act', 'knockNeighbor');
  } }], { subtitle: 'Your neighbor. You\'ve never actually met.' });
  // neighbour's doormat & plant
  root.add(at(rbox(0.8, 0.015, 0.5, 0.005, mat('#3b3530', { rough: 1, map: fabric({ base: '#ffffff', seed: 52, knit: true }) }), { cast: false }), -0.6, 0.008, z1 - 0.35));
  const pot = lathe([[0, 0], [0.15, 0], [0.19, 0.38], [0.2, 0.4], [0, 0.4]], mat('#c9c3b8', { rough: 0.8 }), 24); at(pot, x0 + 0.35, 0, z1 - 0.35); root.add(pot);
  for (let i = 0; i < 9; i++) { const leaf = sph(0.13, mat('#3e6b3a', { rough: 0.8 }), 8, 6); leaf.scale.set(0.6, 1.4, 0.3); leaf.rotation.set(Math.random() - 0.5, i * 0.7, (Math.random() - 0.5) * 0.8); at(leaf, x0 + 0.35 + Math.cos(i) * 0.08, 0.6 + Math.random() * 0.25, z1 - 0.35 + Math.sin(i) * 0.08); root.add(leaf); }
  // elevator at the east end: doors slide into the wall to reveal a lit cab
  const ex = x1, zc = (z0 + z1) / 2 + 0.1, OW = 1.16, OH = 2.1;
  const steel = mat('#8a8f96', { rough: 0.25, metal: 0.9 });
  const doorM = mat('#b8bec6', { rough: 0.18, metal: 1 });
  const sA = zc - OW / 2 - 0.06, sB = zc + OW / 2 + 0.06;
  root.add(at(box(0.1, H, sA - z0, wallMat), ex + 0.05, H / 2, (z0 + sA) / 2));
  root.add(at(box(0.1, H, z1 - sB, wallMat), ex + 0.05, H / 2, (sB + z1) / 2));
  root.add(at(box(0.1, H - OH, sB - sA, wallMat), ex + 0.05, OH + (H - OH) / 2, zc));
  root.add(at(box(0.04, OH + 0.12, 0.08, steel), ex - 0.02, (OH + 0.12) / 2, zc - OW / 2 - 0.04));
  root.add(at(box(0.04, OH + 0.12, 0.08, steel), ex - 0.02, (OH + 0.12) / 2, zc + OW / 2 + 0.04));
  root.add(at(box(0.04, 0.12, OW + 0.16, steel), ex - 0.02, OH + 0.06, zc));
  const elevDoors = [-1, 1].map((s) => { const d = box(0.03, OH, OW / 2, doorM); at(d, ex + 0.05, OH / 2, zc + s * OW / 4); root.add(d); return d; });
  const cd = 1.4, cx = ex + 0.1 + cd / 2, cw = OW + 0.3;
  const cabWall = mat('#c9b48f', { rough: 0.35, metal: 0.4, emissive: '#5a4528', ei: 0.35 });
  const cabSide = mat('#9aa0a8', { rough: 0.2, metal: 1, emissive: '#3a3a3a', ei: 0.35 });
  root.add(group(
    at(box(cd, 0.04, cw, mat('#4a4038', { rough: 0.7, emissive: '#1a1612', ei: 0.4 }), { cast: false }), cx, -0.02, zc),
    at(box(cd, 0.04, cw, mat('#fff6e6', { emissive: '#fff1d6', ei: 1.4 }), { cast: false }), cx, 2.3, zc),
    at(box(0.04, 2.3, cw, cabWall), ex + 0.1 + cd, 1.15, zc),
    at(box(cd, 2.3, 0.04, cabSide), cx, 1.15, zc - cw / 2),
    at(box(cd, 2.3, 0.04, cabSide), cx, 1.15, zc + cw / 2),
    at(box(0.04, 0.04, OW, MAT.gold()), ex + 0.06 + cd, 0.95, zc),
  ));
  const elevLight = mat('#ffffff', { emissive: '#ffb34d', ei: 0.4 });
  root.add(at(box(0.02, 0.06, 0.2, elevLight, { cast: false }), ex - 0.05, OH + 0.3, zc));
  apt.elevatorLight = elevLight;
  // call button beside the doors
  const btnM = mat('#efe9dc', { emissive: '#ffb34d', ei: 0 });
  const btn = cyl(0.024, 0.024, 0.014, btnM, 16); btn.rotation.z = Math.PI / 2;
  const callPanel = group(at(rbox(0.02, 0.24, 0.11, 0.008, steel), 0, 0, 0), at(btn, -0.012, 0, 0));
  callPanel.position.set(ex - 0.01, 1.12, sA - 0.22);
  root.add(callPanel);
  const ding = new THREE.Vector3(ex - 0.2, 2.0, zc);
  const el = (apt.elevator = {
    open: 0, phase: 'idle', timer: 0, byPlayer: false,
    entry: new THREE.Vector3(ex - 0.4, 0, zc), cab: new THREE.Vector3(cx, 0, zc),
    // anyone (player or courier) can call it; it arrives, opens, waits, closes
    call(delay = 2.5, byPlayer = false) {
      el.byPlayer ||= byPlayer;
      if (el.phase === 'idle' || el.phase === 'closing') { el.timer = el.phase === 'closing' ? 0.15 : delay; el.phase = 'coming'; btnM.emissiveIntensity = 2.5; }
      else if (el.phase === 'open') el.timer = Math.max(el.timer, 4);
    },
    update(dt) {
      if (el.phase === 'coming' && (el.timer -= dt) <= 0) {
        el.phase = 'open'; el.timer = 6; elevLight.emissiveIntensity = 3;
        G.audio.play('ding', { pos: ding, volume: 0.6 });
        G.audio.play('whoosh', { pos: ding, volume: 0.25, pitch: 0.6, delay: 0.3 });
        if (el.byPlayer) setTimeout(() => G.ui.toast(pick(ELEVATOR_LINES), { icon: '🛗' }), 900);
        el.byPlayer = false;
      } else if (el.phase === 'open' && (el.timer -= dt) <= 0) {
        el.phase = 'closing'; btnM.emissiveIntensity = 0;
        G.audio.play('whoosh', { pos: ding, volume: 0.25, pitch: 0.5 });
      } else if (el.phase === 'closing' && el.open < 0.01) { el.phase = 'idle'; elevLight.emissiveIntensity = 0.4; }
      const target = el.phase === 'open' ? 1 : 0;
      el.open += (target - el.open) * (1 - Math.exp(-dt * 3.2));
      elevDoors.forEach((d, i) => { d.position.z = zc + (i ? 1 : -1) * (OW / 4 + el.open * OW / 2); });
    },
  });
  apt.updaters.push((dt) => el.update(dt));
  makeInteractable(callPanel, 'Elevator', () => [{ key: 'E', label: el.phase === 'idle' ? 'Call the elevator' : el.phase === 'open' ? 'Hold the doors' : 'On its way…', run: () => { G.audio.play('click', { pos: callPanel.position }); el.call(2.5, true); G.events.emit('act', 'elevator'); } }], { subtitle: '24th floor' });
  // sconces (always on, warm)
  for (const sx of [-2.6, 1.4]) {
    const sm = mat('#fff4e0', { emissive: '#ffd9a8', ei: 3 });
    root.add(at(cyl(0.07, 0.05, 0.18, sm, 16), sx, 2.0, z1 - 0.1));
    root.add(at(box(0.05, 0.08, 0.06, MAT.gold()), sx, 1.9, z1 - 0.03));
  }
  const l = new THREE.PointLight('#ffd7a3', 6, 7, 2); l.position.set(-0.6, 2.2, 6.4); allLayers(l); root.add(l);
  const l2 = new THREE.PointLight('#ffd7a3', 3.5, 5, 2); l2.position.set(2.2, 2.3, 6.4); allLayers(l2); root.add(l2);
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
