// Dead Air — Chapter 3: THE CONSTRUCTION SITE
// Stor-Safe unit C-17 -> corridor -> drive-up yard -> alley -> Kessler Ave
// (a failed army checkpoint) -> the SKYLINE TOWER site: front yard, concrete
// frame, core stair, level 2, scaffold stair tower, rear yard -> CRESCENDO:
// the rear gate is plugged by a barricade rigged with red gas canisters:
// shoot one -> the pile goes up -> hordes -> Grid Road -> Substation 12
// (fenced alleys between humming, arcing transformer yards) -> Voltex
// Electric workshop -> Terminal Road -> Newburg Generating Station grounds ->
// airport plaza -> Park-Rite P3 garage (ramp, P1 car-alarm trap, stair A, P2)
// -> glass skybridge over Airport Drive -> conference-centre office safe room.
//
// Files: da3_layout.js (coordinates), da3_parts.js (props + FX helpers),
// da3_start.js, da3_site.js, da3_barricade.js, da3_substation.js, da3_airport.js.
import * as THREE from 'three';
import { SkyLights, skyAircraft, airportLandmark, smokePlumes, cloudDeck, VisualBatch } from './da_parts.js';
import { makeRng } from '../core/math.js';
import { cityBlock } from './da2_parts.js';
import { installCuller } from './ch4_parts.js';
import { autoClutter } from './clutter.js';
import { buildStart } from './da3_start.js';
import { buildSite } from './da3_site.js';
import { buildBarricade } from './da3_barricade.js';
import { buildSubstation } from './da3_substation.js';
import { buildAirport } from './da3_airport.js';
import { SY, KES, SITE, BLD, LV, GRID, SUB, WS, PS, GAR, SKY, END, TOWER } from './da3_layout.js';

// keep-out box for backdrop blocks (the playable strip)
const KEEP = [-40, -36, 345, 36];

function backdrop(L, game) {
  const rng = makeRng(3307);
  const B = new VisualBatch(L);
  // neighbours hugging the route (behind walls / fences)
  const near = [
    [-40, -60, 40, -12.5, 22, 's'], [-40, 10.5, 34, 60, 16, 'n'], [34, -60, 54, -34.5, 26, 's'], [34, 34.5, 54, 60, 14, 'n'],
    [54, -60, 148, -36, 18, 's'], [54, 40.5, 148, 60, 12, 'n'], [96.5, 30.5, 147.5, 40, 9, 'n'],
    [148, -60, 200, -36, 16, 's'], [148, 36, 200, 60, 12, 'n'], [200, -60, 232, -36, 20, 's'], [200, 36, 232, 60, 14, 'n'],
    [232, 36, 276, 60, 10, 'n'], [268, -60, 312, -36, 12, 's'], [276, 36, 312, 60, 12, 'n'],
  ];
  for (const [x0, z0, x1, z1, h, f] of near) cityBlock(B, x0, z0, x1, z1, h, { rng, faces: [f], lit: 0.1 });
  // ring of city blocks, lower toward the airport (east), downtown towers to the west
  for (let x = -260; x < 420; x += 40) for (let z = -300; z < 300; z += 40) {
    const bx0 = x + 3 + rng() * 4, bz0 = z + 3 + rng() * 4, bx1 = x + 33 + rng() * 4, bz1 = z + 33 + rng() * 4;
    if (bx1 > KEEP[0] - 22 && bx0 < KEEP[2] && bz1 > KEEP[1] - 26 && bz0 < KEEP[3] + 26) continue;
    const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
    if (cx > 330) continue;                                          // airport grounds
    if (Math.hypot(cx - 200, cz + 130) < 52 || Math.hypot(cx - 268, cz + 150) < 54) continue; // cooling towers
    if (Math.hypot(cx - 150, cz) > 360) continue;
    const west = cx < 60;
    const tall = rng() < (west ? 0.35 : 0.08);
    let h = 10 + rng() * (tall ? 70 : 22) + (west ? 14 : 0);
    if (cx > 200) h = Math.min(h, 16);
    const faces = [];
    if (cz > KEEP[3]) faces.push('n'); if (cz < KEEP[1]) faces.push('s'); if (cx > KEEP[2]) faces.push('w'); if (cx < KEEP[0]) faces.push('e');
    cityBlock(B, bx0, bz0, bx1, bz1, h, { rng, faces, lit: 0.07, fire: rng() < 0.12 ? 0.05 : 0, roofFire: rng() < 0.08 });
  }
  // the Harborview Hotel + Meridian tower back west (where the team came from)
  B.box(-120, -1, -40, -90, 62, -10, 'concreteDark', { tint: 0x44464e });
  for (let y = 6; y < 60; y += 3.4) for (let k = -38; k < -12; k += 3) if (rng() < 0.12) B.box(-89.97, y, k, -89.9, y + 1.6, k + 1.6, 'emissiveWindow', { tint: 0xffc890 });
  B.build(L);
}

function skyAndTraffic(L, game) {
  const sky = new SkyLights(L, game, 420);
  const port = airportLandmark(L, game, sky, TOWER.x, TOWER.z, {
    h: TOWER.h, runway: { x0: TOWER.x - 60, x1: TOWER.x + 420, z: TOWER.z + 170 }, terminal: [436, -130, 560, -70],
  });
  for (let k = 0; k < 3; k++) {
    const R = 200 + k * 70, alt = 120 + k * 40, w = 0.03 - k * 0.006, ph = k * 2.1;
    skyAircraft(sky, (t) => { const a = t * w + ph; return { x: TOWER.x + 60 + Math.cos(a) * R, y: alt + Math.sin(t * 0.1 + k) * 4, z: TOWER.z + 40 + Math.sin(a) * R }; }, { scale: 0.8 });
  }
  for (const ph of [0, 70]) {
    skyAircraft(sky, (t) => {
      const k = ((t + ph) % 140) / 140;
      return { x: TOWER.x - 460 + k * 520, y: 180 - k * 170, z: TOWER.z + 170 - 60 + k * 60 };
    }, { landing: true });
  }
  const jetPath = (off) => (t) => { const k = ((t + off) % 55) / 55; return { x: -300 + k * 900, y: 160 + Math.sin(k * 6) * 10, z: -420 + k * 700 }; };
  skyAircraft(sky, jetPath(0), { kind: 'jet' });
  skyAircraft(sky, jetPath(-1.5), { kind: 'jet' });
  // tracer fire over the airport perimeter
  const tr = [];
  for (let i = 0; i < 8; i++) tr.push(sky.add(0, -1e3, 0, [3, 1.4, 0.4], 0));
  sky.track({ update(t) { for (let i = 0; i < tr.length; i++) { const k = (t * 0.9 + i * 0.13) % 3; if (k > 1) { sky.hide(tr[i]); continue; } const bx = TOWER.x - 40 + (i % 4) * 60, bz = TOWER.z + 90; sky.set(tr[i], bx + k * 40, 4 + k * 90, bz - k * 20, null, 3); } } });
  // red lights on the generating station stacks
  for (const [x, z, h] of [[244, -50, 92], [259, -52, 84]]) sky.add(x, h + 0.6, z, [2.6, 0.12, 0.08], 6);
  smokePlumes(L, game, [[-160, 0, 60, 170, 18], [120, 0, -160, 150, 16], [60, 0, 180, 140, 14], [-40, 0, -220, 160, 20], [300, 0, 160, 130, 16], [244, 92, -50, 80, 6], [259, 84, -52, 70, 5]].map(([x, y, z, h, r]) => ({ x, y, z, h, r })), { per: 9, wind: [1, -0.35] });
  cloudDeck(L, game, { y: 185, r: 600, glow: 0x6a3e2a, dark: 0x1e181c });
  return { sky, port };
}

const say = (game, lines) => game.voice.script(lines);

export default {
  id: 'construction',
  title: 'The Construction Site',
  def: {
    director: {
      wanderers: 22, mobInterval: [85, 135], mobSize: [12, 18], specials: ['hunter', 'smoker', 'boomer'], maxSpecials: 3, specialInterval: [22, 36],
      tank: 0.7, tankAt: 0.8, witches: 1, relax: [25, 40], outfit: 'worker',
    },
    navCell: 0.5,
  },
  build(L, game) {
    L.env = Object.assign(L.env, {
      fog: 0x1c1618, fogDensity: 0.0105, hemiSky: 0x4c465a, hemiGround: 0x2c1c14, hemiIntensity: 0.44, envIntensity: 0.12,
      moon: { dir: [-0.4, 1, 0.35], intensity: 0.3, color: 0xc09070 }, exposure: 1.16, reverb: 'outdoor', ambience: 'city',
      skyOpts: { hospitalAz: null, moon: false, fires: 20, zenith: '#060609', mid: '#18121a', glow: '#5a2e1e', ground: '#0c0a0a', rotation: 2.2 },
    });
    L.menuCam = { x: 124, y: LV.L2 + 1.7, z: -21, yaw: -2.3, pitch: 0.05 };
    const S = buildStart(L, game);
    const site = buildSite(L, game);
    const bar = buildBarricade(L, game);
    const sub = buildSubstation(L, game);
    const air = buildAirport(L, game);
    backdrop(L, game);
    // floor litter / grime along the whole route (runs after the nav grid exists)
    for (const [theme, box, density] of [['city', [-14, -36, 68, 36], 1.0], ['industrial', [68, -36, 148, 32], 1.1], ['city', [148, -36, 162, 36], 1.2], ['industrial', [162, -36, 268, 36], 0.9], ['city', [268, -36, 345, 36], 1.0]]) autoClutter(L, { theme, box, density, seed: 300 + box[0] });
    const SK = skyAndTraffic(L, game);
    L.flowEnd = [338.3, END.y, -1.0];
    L.killZone(-400, -60, -400, 900, -12, 600);
    L.da3Culler = installCuller(L, game, { band: 12, dist: 80 });
    L.da3 = { S, site, bar, sub, air, SK };

    // ------------------------------------------------------------ script
    const d = game.director;
    const once = (box, fn) => L.trigger(...box, fn);
    // Kessler Ave: the checkpoint that failed
    once([54, -1, -12, 68, 4, 12], () => {
      game.session.objective('Cut through the construction site');
      say(game, [
        { who: 'zoey', text: 'Army checkpoint. Or what\'s left of one.', d: 0.3 },
        { who: 'bill', text: '"Proceed to Metro International." Well. At least we\'re on the list.', d: 2.8 },
        { who: 'louis', text: 'Site gate\'s open across the street!', d: 6.2 },
      ]);
    });
    // the site
    once([70, -1, -8, 80, 4, 6], () => {
      say(game, [
        { who: 'francis', text: 'Construction site. I hate construction sites.', d: 0.3 },
        { who: 'zoey', text: 'Anything you don\'t hate?', d: 2.4 },
        { who: 'francis', text: 'Vests. I like vests.', d: 4.2 },
      ]);
      if (Math.random() < 0.6) d.spawnSpecial('smoker', { where: 'ahead' });
    });
    once([96.4, -1, -13, 104, 3, -8], () => {
      game.session.objective('Find a way through the tower');
      say(game, [{ who: 'bill', text: 'Ground floor\'s caved in. Up the core stairs.', d: 0.4 }]);
    });
    // level 2: the airport tower on the horizon
    once([112, LV.L2 - 0.5, -22, 124, LV.L2 + 3, -12.5], () => {
      say(game, [
        { who: 'louis', text: 'There — the red light! That\'s the airport tower!', d: 0.3 },
        { who: 'zoey', text: 'Looks so close from up here.', d: 3.0 },
        { who: 'bill', text: 'Everything does. Stairs, on the far side.', d: 5.2 },
      ]);
      L.after(3, () => d.spawnMob(10, { where: 'ahead', minD: 16, maxD: 40 }));
    });
    // substation
    once([162, -1, -6, 170, 4, 0], () => {
      game.session.objective('Get through Substation 12');
      L.after(4, () => say(game, [
        { who: 'louis', text: 'Stay off the fences, those yards are live!', d: 0 },
        { who: 'francis', text: 'I hate electricity.', d: 2.6 },
      ]));
    });
    once([176, -1, 8, 180, 4, 14], () => { if (Math.random() < 0.7) d.spawnSpecial(Math.random() < 0.5 ? 'hunter' : 'smoker', { where: 'ahead' }); });
    // workshop
    once([200, -1, 9, 206, 4, 15], () => {
      say(game, [{ who: 'zoey', text: 'Electrical shop. Grab what you can.', d: 0.3 }]);
      L.after(6, () => d.spawnMob(12, { where: 'ahead', minD: 14, maxD: 40 }));
    });
    // generating station
    once([232, -1, 9, 240, 4, 19], () => {
      game.session.objective('Cross the power station to the airport');
      say(game, [
        { who: 'bill', text: 'Power station. Army tried to hold it.', d: 0.4 },
        { who: 'louis', text: 'Keep the lights on for the airport... smart.', d: 2.8 },
        { who: 'francis', text: 'Didn\'t work.', d: 5.0 },
      ]);
    });
    // the garage
    once([268, -1, -6, 278, 4, 8], () => {
      game.session.objective('Take the parking garage to the skybridge');
      say(game, [
        { who: 'louis', text: 'Park-Rite! Skybridge goes straight into the terminal!', d: 0.3 },
        { who: 'bill', text: 'Parking garage means car alarms. Nobody touch anything.', d: 3.0 },
      ]);
    });
    once([300, GAR.D2 - 0.5, 10, 312, GAR.D2 + 3, 20], () => { if (Math.random() < 0.6) d.spawnSpecial('hunter', { where: 'ahead' }); });
    once([283, GAR.D3 - 0.5, -13, 292, GAR.D3 + 3, -6], () => {
      say(game, [{ who: 'zoey', text: 'Skybridge — end of the deck!', d: 0.3 }]);
    });
    // skybridge
    once([312, SKY.y - 0.5, SKY.z0, 318, SKY.y + 3, SKY.z1], () => {
      game.session.objective('Get to the safe room at the end of the skybridge');
      say(game, [
        { who: 'louis', text: 'Safe room! Right there!', d: 0.3 },
        { who: 'francis', text: 'I love safe rooms.', d: 2.4 },
      ]);
    });

    L.script = {
      start() {
        d.cfg.noSpawnBoxes = (d.cfg.noSpawnBoxes || []).concat(bar.noSpawn, [[END.x0 - 1, END.y - 1, END.z0, END.x1, END.y + 4, END.z1]]);
        L.after(1.2, () => game.session.objective('Get out of the storage building'));
      },
      update(dt) {},
    };
  },
  onStart(game) {
    game.voice.script([
      { who: 'louis', text: 'Okay. Storage unit. Good times.', d: 1.5 },
      { who: 'zoey', text: 'Somebody wrote the airport\'s past the construction site.', d: 4.2 },
      { who: 'bill', text: 'Then that\'s the way we go. Lock and load.', d: 7.8 },
    ]);
  },
};
