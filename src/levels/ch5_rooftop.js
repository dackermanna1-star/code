// Chapter 5 — ROOFTOP FINALE
// Top-floor safe room -> stairs to the roof of Mercy Hospital -> radio room.
// First radio call makes contact; second call starts the finale: escalating
// hordes climbing over the parapets and bursting out of a service bulkhead,
// special infected, two Tank encounters, then the rescue helicopter lands on
// the (partly wrecked) helipad for a last-second extraction.
import * as THREE from 'three';
import { room, ceilingLight, facade, sign, graffiti, safeRoom, supplies, fireSource, burningBarrel, physProp, usable, P, floorWithHoles, railSegment } from './kit.js';
import { Door } from '../world/dynamic.js';
import { F_SOLID, F_SHOOT, F_SIGHT } from '../world/collision.js';
import { DF } from '../render/decals.js';
import { Helicopter } from './helicopter.js';
import { MountedGun } from '../combat/mounted.js';
import { makeRng } from '../core/math.js';

const rng = makeRng(505);
const R = 32; // half size of the roof
const SR = -4.4; // safe room floor
const PAD = 2.4; // helipad height

export default {
  id: 'rooftop',
  title: 'Rooftop Finale',
  def: {
    director: { wanderers: 6, mobInterval: [200, 300], tank: 0, witches: 0, outfit: 'hospital', maxSpecials: 3, specialInterval: [18, 30], relax: [15, 25] },
  },
  build(L, game) {
    L.env = Object.assign(L.env, {
      fog: 0x14121a, fogDensity: 0.012, hemiSky: 0x4a5070, hemiGround: 0x2a1a14, hemiIntensity: 0.5, envIntensity: 0.14,
      moon: { dir: [0.3, 1, -0.5], intensity: 0.7, color: 0x9aa8d0 }, exposure: 1.15, reverb: 'outdoor', ambience: 'rooftop',
      skyOpts: { hospitalAz: null, moonAz: 0.7, fires: 16, rotation: 0.4 },
    });
    L.menuCam = { x: 10, y: 4, z: 20, yaw: 0.6, pitch: -0.08 };

    // ============================================================ building body
    // Solid body under the roof except the top-floor safe room + stair shaft.
    L.box(-R, -150, -R, R, -6.6, R, 'concrete', { visible: false });
    // exterior facade walls with windows (top 40 m visible; rest fades into fog)
    for (const [x0, z0, x1, z1, faces] of [[-R, -R - 0.4, R, -R, ['n']], [-R, R, R, R + 0.4, ['s']], [-R - 0.4, -R, -R, R, ['w']], [R, -R, R + 0.4, R, ['e']]]) {
      facade(L, x0, z0, x1, z1, -120, -1.4, { mat: 'concrete', faces, lit: 0.18, floorH: 4, parapet: false });
    }
    // top floor: filler around safe room & shaft (invisible solids)
    // (the service bulkhead stair shaft at x -27..-24, z -6..1 is carved out)
    L.box(-R + 0.1, -6.6, -R + 0.1, -27, -0.4, R - 0.1, 'concrete', { visible: false });
    L.box(-24, -6.6, -R + 0.1, 13.6, -0.4, R - 0.1, 'concrete', { visible: false });
    L.box(-27, -6.6, -R + 0.1, -24, -0.4, -6, 'concrete', { visible: false });
    L.box(-27, -6.6, 1, -24, -0.4, R - 0.1, 'concrete', { visible: false });
    L.box(-27, -6.6, -6, -24, -3.4, 1, 'concrete', { visible: false });
    L.box(22.4, -6.6, -R + 0.1, R - 0.1, -0.4, R - 0.1, 'concrete', { visible: false });
    L.box(13.6, -6.6, -R + 0.1, 22.4, -0.4, 6.8, 'concrete', { visible: false });
    L.box(13.6, -6.6, 22.4, 22.4, -0.4, R - 0.1, 'concrete', { visible: false });

    // ============================================================ start safe room (top floor)
    safeRoom(L, { x0: 14, z0: 14, x1: 22, z1: 22, y: SR, h: 3.2, doorWall: 'n', doorAt: 20.05, wall: 'plasterHosp', floor: 'linoleumBlue',
      graffiti: ['ROOF.\nCHOPPER.\nHOPE.', 'THEY CLIMB\nTHE WALLS', 'DONT LET\nTHEM BITE', 'SAVE A\nSEAT FOR ME'] });
    supplies(L, 21.2, SR, 18, -Math.PI / 2, ['medkit', 'medkit', 'medkit', 'medkit'], { w: 2.2 });
    supplies(L, 15, SR, 21.2, Math.PI, ['tier2', 'tier2', 'ammo'], { w: 2.0 });
    L.item('pills', 15, SR + 0.02, 15, { chance: 0.7 });
    P.bed(L, 16, SR, 18.5, Math.PI / 2, 0x8a9aa0, true);
    for (let i = 0; i < 4; i++) L.survivorStart.push({ x: 17 + (i % 2) * 1.5, y: SR, z: 16.5 + Math.floor(i / 2) * 1.5, yaw: 0 });
    L.flowStart = [19, SR, 17.5];
    // stair landing + flight up to the roof (z from 14 up to 7.4)
    L.floor(14, 7, 22, 14, SR, 'concreteFloor', 0.3);
    L.box(13.6, SR, 6.8, 14, 0, 14, 'concreteDark');
    L.box(22, SR, 6.8, 22.4, 0, 14, 'concreteDark');
    L.box(13.6, SR, 6.8, 22.4, 0, 7.2, 'concreteDark');
    L.stairs(18.2, 7.3, 21.9, 13.9, SR, 0, '-z', 'concrete', { thin: true });
    L.box(18, SR, 7.2, 18.2, 0.9, 14, 'metalDark', { flags: F_SOLID | F_SHOOT });
    ceilingLight(L, 16, -0.3, 10, { type: 'cage', intensity: 7, flicker: 0.5 });
    sign(L, 'ROOF ↑', 16.5, SR + 2.2, 13.9, Math.PI, 1.2, 0.35, { bg: '#1a1a1a', fg: '#fff' });
    L.reverb(14, SR, 7, 22, 0, 14, 'stairwell');

    // ============================================================ roof deck
    const shaft = [14, 7.2, 22, 14];
    floorWithHoles(L, -R, -R, R, R, 0, 0.4, 'roof', [shaft, [-26.7, -5.7, -24, 0.7]]);
    // parapet (0.6 thick, 1.1 tall) + coping
    for (const [x0, z0, x1, z1] of [[-R, -R, R, -R + 0.6], [-R, R - 0.6, R, R], [-R, -R + 0.6, -R + 0.6, R - 0.6], [R - 0.6, -R + 0.6, R, R - 0.6]]) {
      L.box(x0, 0, z0, x1, 1.1, z1, 'concreteDark');
      L.box(x0 - 0.05, 1.1, z0 - 0.05, x1 + 0.05, 1.18, z1 + 0.05, 'concrete', { collide: false });
    }
    // maintenance ledges outside the parapet (infected climb up from here)
    for (const [x0, z0, x1, z1] of [[-R - 2.6, -R - 2.6, R + 2.6, -R], [-R - 2.6, R, R + 2.6, R + 2.6], [-R - 2.6, -R, -R, R], [R, -R, R + 2.6, R]]) {
      L.box(x0, -1.4, z0, x1, -1.0, z1, 'metalDark');
    }
    for (const [x0, z0, x1, z1] of [[-R - 2.6, -R - 2.7, R + 2.6, -R - 2.6], [-R - 2.6, R + 2.6, R + 2.6, R + 2.7], [-R - 2.7, -R - 2.6, -R - 2.6, R + 2.6], [R + 2.6, -R - 2.6, R + 2.7, R + 2.6]]) {
      L.box(x0, -1.0, z0, x1, 0.1, z1, 'metalDark', { flags: F_SOLID }); // railing (low) keeps infected on the ledge
    }
    L.killZone(-400, -40, -400, 400, -12, 400);

    // ============================================================ radio room / roof access house
    const H = 3.4;
    room(L, { x0: 12, z0: 1, x1: 24, z1: 14, y: 0, h: H, floor: false, ceil: 'concreteDark', wall: 'brickDark', trimMat: 'concreteDark',
      walls: {
        n: { open: [{ at: 18, w: 2.4, h: 2.6 }, { at: 14, w: 1.2, window: true, sill: 1.0, h: 1.2, glass: false }, { at: 22, w: 1.2, window: true, sill: 1.0, h: 1.2, glass: false }] },
        w: { open: [{ at: 10.5, w: 1.4, h: 2.4 }, { at: 4, w: 1.4, window: true, sill: 1.0, h: 1.1, glass: false }] },
        e: { open: [{ at: 5, w: 1.4, window: true, sill: 1.0, h: 1.1, glass: false }] },
        s: {},
      }, light: { type: 'cage', intensity: 10, color: 0xffe2b0 }, reverb: 'room' });
    L.box(12, 0, 1, 24, 0.02, 14, 'concreteFloor', { collide: false });
    L.box(14, 0, 7, 18, 1.0, 7.2, 'metalDark', { flags: F_SOLID | F_SHOOT }); // rail around the stair hole
    L.box(13.9, 0, 7.2, 14.1, 1.0, 14, 'metalDark', { flags: F_SOLID | F_SHOOT });
    P.radioTable(L, 21, 0, 2.2, 0);
    const radioLight = L.light(21, 1.3, 2.6, 0x60ff80, 3, 3, { flicker: 0.2 });
    supplies(L, 13.4, 0, 4.2, Math.PI / 2, ['pipebomb', 'molotov', 'pipebomb', 'molotov'], { w: 2.4 });
    supplies(L, 23.2, 0, 10.5, -Math.PI / 2, ['autoShotgun', 'rifle', 'huntingRifle'], { w: 2.4 });
    L.item('ammo', 22.6, 0.02, 7.2, {});
    L.item('medkit', 15.5, 0.02, 2.2, { chance: 0.8 });
    L.item('pills', 16.2, 0.02, 2.2, { chance: 0.8 });
    P.sandbags(L, 18, 0, -0.6, 0, 5, 3);
    P.sandbags(L, 10.8, 0, 10.5, Math.PI / 2, 2.4, 3);
    graffiti(L, 'CALL THEM\nON CH 9', 12.12, 1.8, 7, Math.PI / 2, 1.6, 0.8, '#e0e0d0');
    sign(L, 'MERCY HOSPITAL\nROOF ACCESS', 18, 3.0, 0.88, 0, 2.6, 0.55, { bg: '#e8e4d8', fg: '#1a2a5a' });

    // ============================================================ helipad (partly destroyed)
    const pz0 = -30, pz1 = -9, px0 = -12, px1 = 12;
    L.box(px0, 0, pz0, px1, PAD, pz1, 'concrete', { ao: 0.9 });
    P.helipad(L, 0, PAD, -19.5, 9.5);
    // wrecked corner: rubble and fire
    P.debris(L, 10, PAD, -28, 1.8, 'concreteDark', 14);
    fireSource(L, 9.5, PAD, -27.5, 1.3);
    L.decal(9, PAD + 0.01, -27, 0, 1, 0, 5, DF.SCORCH);
    // stairs up to the pad (south side) and a ramp on the east
    L.stairs(-3, pz1, 3, pz1 + 4, 0, PAD, '-z', 'concrete');
    L.stairs(px1, -22, px1 + 4, -16, 0, PAD, '-x', 'concreteDark');
    for (const x of [-3.1, 3.1]) railSegment(L, x, 1.0, pz1 + 4, x, PAD + 1.0, pz1);
    // pad edge rails
    L.box(px0, PAD, pz0, px0 + 0.1, PAD + 1.0, pz1, 'metalDark', { flags: F_SOLID | F_SHOOT });
    L.box(px0, PAD, pz0, px1, PAD + 1.0, pz0 + 0.1, 'metalDark', { flags: F_SOLID | F_SHOOT });
    for (let x = -10; x <= 10; x += 5) { L.box(x - 0.15, PAD, pz1 - 0.3, x + 0.15, PAD + 0.2, pz1, 'emissiveRed', { collide: false }); }
    L.light(0, PAD + 2, -19.5, 0xffe0b0, 12, 16, { flicker: 0.1 });
    L.light(-11, PAD + 3, -10, 0xff5030, 6, 8, { flicker: 0.3 });

    // ============================================================ roof clutter & cover
    for (const [x, z, r] of [[-20, -18, 0], [-24, -8, 1.57], [26, -20, 0], [-6, 6, 1.57], [6, 20, 0], [-22, 24, 0]]) P.acUnit(L, x, 0, z, r);
    // cooling tower block with ladder-free top
    L.box(-29, 0, 14, -17, 4.2, 29, 'metal', { tint: 0x8a8e90 });
    for (let x = -28; x < -17; x += 2.2) L.box(x, 1, 13.95, x + 1.6, 3.8, 14, 'metalDark', { collide: false });
    P.waterTower(L, 25, 0, 24);
    P.antenna(L, -28, 0, -28, 14);
    P.antenna(L, 28, 0, -28, 10);
    // skylight strip (glass is solid) and exhaust stacks
    for (let z = 16; z < 28; z += 3) { L.box(-6, 0, z, -1, 0.6, z + 2, 'metalDark'); L.box(-5.8, 0.6, z + 0.2, -1.2, 0.64, z + 1.8, 'glassDirty', { collide: false }); }
    for (const [x, z] of [[4, -4], [-14, 2], [28, 4]]) {
      L.box(x - 0.5, 0, z - 0.5, x + 0.5, 3.2, z + 0.5, 'rust');
      L.dynamics.push({ update: (dt) => { if (Math.random() < dt * 3) game.fx.smokeColumn(x, 3.3, z, 0.35, [0.3, 0.3, 0.3]); } });
    }
    // military leftovers: tent + cots + crates + body bags
    L.box(-16, 0, -2, -8, 2.4, 3, 'fabric', { tint: 0x4a5a3a, collide: false });
    L.box(-16, 0, -2, -15.9, 2.4, 3, 'fabric', { tint: 0x4a5a3a });
    L.box(-8.1, 0, -2, -8, 2.4, 3, 'fabric', { tint: 0x4a5a3a });
    for (let i = 0; i < 3; i++) P.bodyBag(L, -14 + i * 2, 0.01, 0.5, 0.1);
    P.crate(L, -18, 0, 6, 0.2);
    P.crate(L, -18, 0.8, 6, 0.5, 0.8);
    P.crate(L, 8, 0, -4, 0.1);
    P.pallet(L, 10, 0, 16, 0.3, true);
    P.barricade(L, -2, 0, 12, 0.4);
    P.barricade(L, 2, 0, -6, -0.2);
    burningBarrel(L, -8, 0, 12);
    burningBarrel(L, 26, 0, -8);
    fireSource(L, -26, 0, -22, 1.2);
    L.light(-26, 1.2, -22, 0xff7020, 10, 10, { flicker: 0.5 });
    // explosives & props
    for (const [t, x, z] of [['propane', -10, 10], ['propane', 6, -6], ['propane', 24, 16], ['gascan', -12, -6], ['gascan', 14, -6], ['gascan', 0, 14], ['gascan', 20, 18], ['oxygen', -20, 10], ['oxygen', 26, 0]]) physProp(L, t, x, 0, z);
    L.item('ammo', -14, 0.02, 4.2, {});
    L.item('pipebomb', -12.5, 0.02, 4.4, { chance: 0.8 });
    L.item('molotov', 9, 0.82, 16.5, { chance: 0.8 });
    L.item('health', -17.4, 1.62, 6, { chance: 0.8 });
    L.item('m60', 0, PAD + 0.02, -12, { chance: 0.6 });
    L.item('grenadeLauncher', -8, PAD + 0.02, -28, { chance: 0.4 });
    // floodlights on stands (warm pools of light)
    for (const [x, z] of [[-24, 0], [0, 24], [26, 10], [-6, -6]]) {
      L.box(x - 0.05, 0, z - 0.05, x + 0.05, 3, z + 0.05, 'metalDark', { collide: false });
      L.box(x - 0.3, 3, z - 0.15, x + 0.3, 3.35, z + 0.15, 'emissiveWarm', { collide: false });
      L.light(x, 2.8, z, 0xfff0d0, 16, 16, { flicker: rng() < 0.3 ? 0.4 : 0 });
    }
    // service bulkhead (second stairwell) where infected burst out
    const bx0 = -27, bx1 = -20, bz0 = -6, bz1 = 1;
    L.box(bx0, 0, bz0, bx1, 3.2, bz0 + 0.3, 'brick');
    L.box(bx0, 0, bz1 - 0.3, bx1, 3.2, bz1, 'brick');
    L.box(bx0, 0, bz0, bx0 + 0.3, 3.2, bz1, 'brick');
    L.wallZ(bz0, bz1, bx1, 0, 3.2, 'brick', 0.3, [{ a: -3.2, b: -1.8, y0: 0, y1: 2.2 }]);
    L.box(bx0, 3.2, bz0, bx1, 3.5, bz1, 'roof');
    // stair shaft going down into the dark floor below (infected pour up from here)
    L.box(bx0 + 0.3, -3.4, bz0 + 0.3, bx0 + 3, -3.0, bz1 - 0.3, 'concreteDark');
    L.box(bx0, -3.4, bz0, bx0 + 0.3, 0, bz1, 'brick');
    L.box(bx0, -3.4, bz0, bx0 + 3, 0, bz0 + 0.3, 'brick');
    L.box(bx0, -3.4, bz1 - 0.3, bx0 + 3, 0, bz1, 'brick');
    L.box(bx0 + 3, -3.4, bz0 + 0.3, bx0 + 3.1, -0.4, bz1 - 0.3, 'concreteDark');
    L.stairs(bx0 + 0.3, bz0 + 0.3, bx0 + 3, bz1 - 0.3, -3.0, 0, '-z', 'concrete', { thin: true });
    L.box(bx0 + 3, -0.4, bz0 + 0.3, bx1 - 0.3, 0, bz1 - 0.3, 'concreteDark');
    new Door(L, bx1, 0, -2.5, 'z', { width: 1.2, material: 'paintedGreen', hp: 120 });
    sign(L, 'STAFF ONLY', bx1 + 0.17, 2.5, -2.5, -Math.PI / 2, 1.0, 0.25, { bg: '#e8e4d8', fg: '#8a1010' });

    // ============================================================ surrounding skyline
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + rng() * 0.2;
      const d = 90 + rng() * 80;
      const w = 20 + rng() * 25;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const top = -30 + rng() * 55;
      facade(L, x - w / 2, z - w / 2, x + w / 2, z + w / 2, -160, top, { mat: rng.pick(['concrete', 'concreteDark', 'brickDark', 'brick']), lit: 0.1 + rng() * 0.08, floorH: 3.6 });
      if (rng() < 0.4) L.light(x, top + 1, z, 0xff2010, 3, 8);
      if (rng() < 0.35) fireSource(L, x + w / 2 + 0.3, top - 10 - rng() * 30, z, 2.5, { hazard: false });
    }
    // distant military searchlight beams
    for (const [x, z] of [[-140, 60], [120, -140]]) {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 6, 220, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x8090a0, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      beam.position.set(x, -40, z);
      beam.geometry.translate(0, 110, 0);
      L.addObject(beam);
      L.dynamics.push({ t: rng() * 10, update(dt) { this.t += dt * 0.3; beam.rotation.set(0.5 + Math.sin(this.t) * 0.2, 0, Math.cos(this.t * 0.7) * 0.4); } });
    }

    // ============================================================ mounted miniguns
    const gun1 = new MountedGun(L, 18, 0, -1.9, 0, { arc: 1.2 });
    const gun2 = new MountedGun(L, -14.5, 0, 12, Math.PI / 2, { arc: 1.1 });
    // end volume: the helipad (for flow field / progress)
    L.flowEnd = [0, PAD, -19.5];

    // ============================================================ FINALE SCRIPT
    const heli = new Helicopter(game, { color: 0x4a5a48, stripe: 0xd8d8c8 });
    heli.attachLight(L.light(0, -50, 0, 0xfff0d8, 30, 26, { priority: 2 }));
    L.dynamics.push(heli);
    const F = { stage: 'pre', calls: 0, t: 0, spawnNodes: [], bulkNodes: [], waitingTank: false, boardZone: [-5, PAD - 0.5, -25, 5, PAD + 3, -14] };
    L.finale = F;
    const s = game.session;
    const say = (key) => game.voice.script(key);
    const radio = usable(L, 21, 1.1, 2.5, 'Use the radio', () => {
      F.calls++;
      game.audio.play('radioStatic', { vol: 0.8 });
      if (F.calls === 1) {
        say('radio1');
        radio.enabled = false;
        L.after(9, () => {
          radio.enabled = true;
          radio.prompt = 'Call the pilot (starts the finale)';
          s.objective('Prepare your defenses, then call the pilot again', 'Rescue');
        });
      } else if (F.calls === 2) {
        radio.enabled = false;
        radioLight.flicker = 0;
        startFinale();
      }
    }, { hold: 2, holdLabel: 'Using the radio', once: false, radius: 2.2, sound: 'radioBeep' });
    const gatherNodes = () => {
      const nav = L.nav;
      const add = (list, x, y, z) => { const n = nav.nearestNode(x, y, z, 1.2); if (n >= 0 && Math.abs(nav.nodeY[n] - y) < 0.6) list.push(n); };
      for (let t = -R + 2; t <= R - 2; t += 3) {
        add(F.spawnNodes, t, -1.0, -R - 1.3); add(F.spawnNodes, t, -1.0, R + 1.3);
        add(F.spawnNodes, -R - 1.3, -1.0, t); add(F.spawnNodes, R + 1.3, -1.0, t);
      }
      for (let x = bx0 + 3.5; x < bx1 - 0.5; x += 0.8) for (let z = bz0 + 1; z < bz1 - 0.5; z += 0.8) add(F.bulkNodes, x, 0, z);
      for (let x = bx0 + 0.8; x < bx0 + 2.6; x += 0.8) for (let z = bz0 + 1; z < bz1 - 0.5; z += 0.8) add(F.bulkNodes, x, -3.0 + (bz1 - 0.3 - z) / 6.4 * 3.0, z);
    };
    const allNodes = () => F.spawnNodes.concat(F.bulkNodes, F.bulkNodes);
    const tankAlive = () => game.infected.specials.some((sp) => sp.kind === 'tank' && !sp.dead);
    const spawnTank = () => {
      const nodes = rng() < 0.5 ? F.bulkNodes : F.spawnNodes;
      const n = nodes[Math.floor(rng() * nodes.length)];
      game.director.spawnSpecial('tank', { node: n });
      F.waitingTank = true;
    };
    function startFinale() {
      F.stage = 'wavesA';
      F.t = 0;
      const d = game.director;
      d.finaleMode = true;
      d.blockMobs = true;
      d.blockWanderers = true;
      d.cfg.maxSpecials = 3;
      game.audio.music.stinger('finaleStart');
      say('radio2');
      s.objective('Survive until the rescue arrives!', 'Finale');
      L.after(8, () => d.panic('finaleA', { waves: 3, size: [18, 26], interval: 20, nodes: allNodes(), stingEvery: true, force: true, onEnd: () => { F.stage = 'tank1'; F.t = 0; } }));
      L.after(40, () => say('pilotUpdate1'));
    }
    L.script = {
      start() {
        gatherNodes();
        L.after(1.5, () => s.objective('Get to the roof and find the radio'));
        L.trigger(12, 0, 1, 24, 3, 14, () => { s.objective('Use the radio to contact the pilot'); }, {});
      },
      update(dt) {
        F.t += dt;
        const d = game.director;
        switch (F.stage) {
          case 'tank1':
            if (F.t > 4 && !F.waitingTank) { spawnTank(); s.objective('TANK! Take it down!', 'Finale'); }
            if (F.waitingTank && !tankAlive() && F.t > 8) { F.waitingTank = false; F.stage = 'wavesB'; F.t = 0; say('pilotUpdate2'); }
            break;
          case 'wavesB':
            if (F.t > 5 && !d.panicState && !F.bStarted) {
              F.bStarted = true;
              d.panic('finaleB', { waves: 2, size: [24, 32], interval: 18, nodes: allNodes(), force: true, onEnd: () => { F.stage = 'tank2'; F.t = 0; } });
            }
            break;
          case 'tank2':
            if (F.t > 3 && !F.waitingTank) { spawnTank(); d.panic('finaleT2', { waves: 1, size: [16, 22], interval: 30, nodes: F.spawnNodes, force: true }); s.objective('Another Tank! Hold on!', 'Finale'); }
            if (F.waitingTank && !tankAlive() && F.t > 8) {
              F.waitingTank = false; F.stage = 'rescue'; F.t = 0;
              say('pilotUpdate3');
              L.after(6, () => say('pilotArrive'));
              // helicopter approach from the north-west
              heli.fly([
                { x: -180, y: 70, z: -160, t: 0 }, { x: -60, y: 35, z: -70, t: 9 }, { x: -6, y: 18, z: -22, t: 16 }, { x: 0, y: PAD + 0.2, z: -19.5, t: 22 },
              ], { onEnd: () => { F.landed = true; heli.hover(0, PAD + 0.2, -19.5, 0.3); s.objective('Get to the helicopter!', 'Rescue'); game.audio.music.stinger('rescueArrive'); } });
              heli.setSearchlight(true);
              d.panic('finaleEnd', { endless: true, size: [16, 24], interval: 14, nodes: allNodes(), force: true });
            }
            break;
          case 'rescue':
            if (F.landed && s.state === 'playing') {
              const alive = game.survivors.filter((x) => !x.dead);
              const standing = alive.filter((x) => !x.incapped);
              const inZone = (x) => x.pos.x > F.boardZone[0] && x.pos.x < F.boardZone[3] && x.pos.y > F.boardZone[1] && x.pos.y < F.boardZone[4] && x.pos.z > F.boardZone[2] && x.pos.z < F.boardZone[5];
              for (const x of standing) if (inZone(x) && x.model && !x.isHuman) x.model.setHidden(true);
              const humanIn = game.player.dead || (inZone(game.player) && !game.player.incapped);
              if (standing.length && standing.every(inZone) && humanIn) {
                F.stage = 'escape'; F.t = 0;
                for (const x of alive) if (x.incapped) x.die('left behind');
                escape();
              }
            }
            break;
          case 'escape':
            break;
        }
      },
    };
    function escape() {
      const d = game.director;
      d.stopPanic();
      d.enabled = false;
      game.voice.script('escape');
      game.audio.music.stinger('escape');
      for (const x of game.survivors) { x.model?.setHidden(true); x.cmd.fire = false; }
      game.cheats.godAll = true;
      s.state = 'cutscene';
      s.cinematic(true);
      game.net?.ev?.(['cam', 14, 7, -2, 0]); // co-op clients watch the lift-off too
      // camera: watch the chopper lift off
      heli.fly([
        { x: 0, y: PAD + 0.2, z: -19.5, t: 0 }, { x: 4, y: 12, z: -30, t: 5 }, { x: 60, y: 45, z: -120, t: 12 },
      ], {});
      const cam = game.renderer.camera;
      const t0 = game.time;
      game.hooks.cutscene = (dt) => {
        const p = heli.group.position;
        cam.position.set(14, 7, -2);
        cam.lookAt(p.x, p.y + 1, p.z);
        if (game.time - t0 > 9 && !F.ended) { F.ended = true; s.fade(0, 1, 1.5); setTimeout(() => { game.hooks.cutscene = null; s.cinematic(false); s.victory(); }, 1600); }
      };
      game.viewmodel.visible = false;
    }
  },
  onStart(game, session) {
    game.voice.script('ch5Start');
  },
};
