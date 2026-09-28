// Dead Air — Chapter 2: THE CRANE
// Harborview Hotel kitchen safe room -> kitchen (a burner still going, the
// walk-in cooler bursts open) -> service hall -> loading dock -> the alley ->
// the hotel's fire escape -> 3F room 301 -> corridor (ice machine, elevator
// lobby with a pried shaft, a collapsed section: detour through 310/312, a
// Witch in 304) -> stair to the roof (neon HARBORVIEW letters, a low airliner
// roars over toward Metro International) -> CRESCENDO: the crane remote at the
// loading bay; the site's tower crane swings a steel skip across the light
// well while hordes pour out of the stair bulkhead, the elevator machine room,
// up the fire escape and onto the far deck -> cross -> construction deck ->
// scaffold stair + plank bridge -> Kessler printing works roof -> Meridian
// tower: L3 offices -> stair B -> dark L2 (server room, last stand) -> lobby ->
// alarmed emergency exit -> Commerce Street (a Tank likes it here) ->
// Stor-Safe Self Storage -> safe room in unit C-17.
//
// Files: da2_layout.js (coordinates), da2_hotel.js, da2_craneEvent.js,
// da2_tower.js, da2_street.js, da2_parts.js (props, neon, roll-up door).
import * as THREE from 'three';
import { P } from './kit.js';
import { SkyLights, skyAircraft, airportLandmark, smokePlumes, cloudDeck, airlinerModel, Flyer } from './da_parts.js';
import { makeRng } from '../core/math.js';
import { buildHotel } from './da2_hotel.js';
import { buildCraneEvent } from './da2_craneEvent.js';
import { buildTower } from './da2_tower.js';
import { buildStreetAndStorage } from './da2_street.js';
import { VisualBatch, cityBlock } from './da2_parts.js';
import { installCuller } from './ch4_parts.js';
import { HG, H3, HR, LR, OL1, OL2, OT, STREET } from './da2_layout.js';

export const TOWER = { x: 330, z: 400, h: 64 };
// eye positions along the route from which the airport beacon should read
const VIEWS = [[4.5, 13.7, 10], [36, 13.7, 16], [36, 13.7, 34], [28, 13.7, 54], [40, 10.3, 70], [50, 10.3, 80]];

function segRect(ax, az, bx, bz, x0, z0, x1, z1) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [t0, t1];
}
function maxHeight(x0, z0, x1, z1) {
  let h = 1e9;
  for (const V of VIEWS) {
    const o = segRect(V[0], V[2], TOWER.x, TOWER.z, x0 - 2, z0 - 2, x1 + 2, z1 + 2);
    if (!o) continue;
    h = Math.min(h, V[1] + (TOWER.h * 0.72 - V[1]) * o[0] - 3);
  }
  return h;
}

function backdrop(L, game) {
  const rng = makeRng(2417);
  const B = new VisualBatch(L);
  // hand-placed neighbours around the playable area
  const near = [
    [-24, -30, -6, 24, 22, 'e'], [-6, -30, 20, -9.8, 18, 's'], [58, -30, 90, -9.8, 24, 's'], [60, -9.8, 84, 22, 20, 'w'],
    [-24, 24, -2, 60, 16, 'e'], [56.5, 24, 70, 54, 14, 'w'], [-24, 60, 13.6, 96, 18, 'e'], [92.4, 30, 120, 70, 26, 'w'],
    [118, 70, 150, 128, 20, 'w'], [100, 124, 130, 160, 12, 'n'], [28, 124, 53.7, 160, 10, 'n'], [53.7, 152.3, 100, 172, 12, 'n'],
  ];
  for (const [x0, z0, x1, z1, h, f] of near) cityBlock(B, x0, z0, x1, z1, Math.min(h, maxHeight(x0, z0, x1, z1)), { rng, faces: [f], lit: 0.1 });
  // Harbor Street (west of the hotel) receding into fog
  B.box(-24, -0.3, -30, -6, 0.02, 170, 'asphalt', { tint: 0x3a3a3c });
  // ring of city blocks
  const keep = [-30, -34, 124, 176];
  for (let x = -250; x < 400; x += 40) for (let z = -260; z < 440; z += 40) {
    const bx0 = x + 3 + rng() * 4, bz0 = z + 3 + rng() * 4, bx1 = x + 33 + rng() * 4, bz1 = z + 33 + rng() * 4;
    if (bx1 > keep[0] && bx0 < keep[2] && bz1 > keep[1] && bz0 < keep[3]) continue;
    const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
    const d = Math.hypot(cx - 50, cz - 70);
    if (d > 320) continue;
    if (Math.hypot(cx - TOWER.x, cz - TOWER.z) < 150) continue; // airport grounds
    const tall = rng() < 0.2;
    let h = 14 + rng() * (tall ? 70 : 30) + (cz < -40 ? 18 : 0); // downtown to the north
    h = Math.min(h, maxHeight(bx0, bz0, bx1, bz1));
    if (h < 8) continue;
    const faces = [];
    if (cz > keep[3]) faces.push('n'); if (cz < keep[1]) faces.push('s'); if (cx > keep[2]) faces.push('w'); if (cx < keep[0]) faces.push('e');
    cityBlock(B, bx0, bz0, bx1, bz1, h, { rng, faces, lit: 0.08, fire: rng() < 0.12 ? 0.05 : 0, roofFire: rng() < 0.09 });
  }
  // downtown spire (north) with its own beacon
  B.box(-10, -1, -170, 14, 124, -146, 'concreteDark', { tint: 0x44464e });
  B.box(-4, 124, -164, 8, 138, -152, 'concreteDark', { tint: 0x44464e });
  B.box(1.6, 138, -158.4, 2.4, 162, -157.6, 'metalDark');
  B.box(1.5, 162, -158.5, 2.5, 162.8, -157.5, 'emissiveRed');
  for (let y = 8; y < 120; y += 4) for (let k = -10; k <= 10; k += 3) if (rng() < 0.14) B.box(2 + k - 0.6, y, -145.97, 2 + k + 0.6, y + 2, -145.9, 'emissiveWindow', { tint: 0xffc890 });
  B.build(L);
}

function skyAndTraffic(L, game) {
  const sky = new SkyLights(L, game, 380);
  const port = airportLandmark(L, game, sky, TOWER.x, TOWER.z, { h: TOWER.h, runway: { x0: TOWER.x - 180, x1: TOWER.x + 160, z: TOWER.z + 95 }, terminal: [TOWER.x - 150, TOWER.z + 32, TOWER.x + 70, TOWER.z + 60] });
  // holding stack over the airport + two arrivals on approach + a fighter pair
  for (let k = 0; k < 3; k++) {
    const R = 190 + k * 70, alt = 120 + k * 40, w = 0.03 - k * 0.006, ph = k * 2.1;
    skyAircraft(sky, (t) => { const a = t * w + ph; return { x: TOWER.x + Math.cos(a) * R, y: alt + Math.sin(t * 0.1 + k) * 4, z: TOWER.z - 60 + Math.sin(a) * R }; }, { scale: 0.8 });
  }
  for (const ph of [0, 70]) {
    skyAircraft(sky, (t) => {
      const k = ((t + ph) % 140) / 140;
      return { x: TOWER.x - 520 + k * 560, y: 190 - k * 170, z: TOWER.z + 95 - 40 + k * 40 };
    }, { landing: true });
  }
  const jetPath = (off) => (t) => { const k = ((t + off) % 60) / 60; return { x: -300 + k * 800, y: 150 + Math.sin(k * 6) * 10, z: 520 - k * 700 }; };
  skyAircraft(sky, jetPath(0), { kind: 'jet' });
  skyAircraft(sky, jetPath(-1.5), { kind: 'jet' });
  // tracer fire over the airport perimeter
  const tr = [];
  for (let i = 0; i < 8; i++) tr.push(sky.add(0, -1e3, 0, [3, 1.4, 0.4], 0));
  sky.track({ update(t) { for (let i = 0; i < tr.length; i++) { const k = (t * 0.9 + i * 0.13) % 3; if (k > 1) { sky.hide(tr[i]); continue; } const bx = TOWER.x - 150 + (i % 4) * 60, bz = TOWER.z - 80; sky.set(tr[i], bx + k * 40, 4 + k * 90, bz - k * 20, null, 3); } } });
  // smoke columns + fire-lit overcast
  smokePlumes(L, game, [[-140, 0, 40, 170, 18], [190, 0, -70, 150, 16], [120, 0, 250, 140, 14], [-60, 0, 260, 160, 20], [260, 0, 330, 130, 16], [40, 20, -120, 150, 15]].map(([x, y, z, h, r]) => ({ x, y, z, h, r })), { per: 9, wind: [1, -0.35] });
  cloudDeck(L, game, { y: 185, r: 560, glow: 0x6a3e2a, dark: 0x1e181c });
  // a low airliner roaring over toward Metro International (fired from the script)
  const model = airlinerModel({ livery: 0x1a3a8a });
  const flyer = new Flyer(L, game, model, { sky, light: { color: 0xfff2dc, intensity: 45, range: 70 }, audio: { vol: 2.6, ref: 45 }, shake: 110 });
  return { sky, port, flyer };
}

const say = (game, lines) => game.voice.script(lines);
const alive = (game, id) => game.survivors.find((s) => s.char.id === id && !s.dead);

export default {
  id: 'crane',
  title: 'The Crane',
  def: {
    director: {
      wanderers: 20, mobInterval: [80, 130], mobSize: [12, 18], specials: ['hunter', 'smoker', 'boomer'], maxSpecials: 3, specialInterval: [22, 36],
      tank: 0.75, tankAt: 0.8, witches: 1, relax: [25, 40], outfit: 'civilian',
    },
    navCell: 0.5,
  },
  build(L, game) {
    L.env = Object.assign(L.env, {
      fog: 0x1c1618, fogDensity: 0.0105, hemiSky: 0x4c465a, hemiGround: 0x2c1c14, hemiIntensity: 0.44, envIntensity: 0.12,
      moon: { dir: [-0.4, 1, 0.35], intensity: 0.3, color: 0xc09070 }, exposure: 1.16, reverb: 'outdoor', ambience: 'city',
      skyOpts: { hospitalAz: null, moon: false, fires: 20, zenith: '#060609', mid: '#18121a', glow: '#5a2e1e', ground: '#0c0a0a', rotation: 2.2 },
    });
    L.menuCam = { x: 26, y: HR + 2.2, z: 12.5, yaw: 2.75, pitch: 0.12 };
    const H = buildHotel(L, game);
    const ev = buildCraneEvent(L, game);
    const T = buildTower(L, game);
    const S = buildStreetAndStorage(L, game);
    backdrop(L, game);
    const SK = skyAndTraffic(L, game);
    L.killZone(-400, -60, -400, 600, -12, 600);
    L.da2Culler = installCuller(L, game, { band: 12, dist: 75 });
    L.da2 = { H, ev, T, S, SK };

    // ------------------------------------------------------------ script
    const d = game.director;
    // the walk-in cooler: cooks still in there
    L.trigger(36, HG - 0.5, 0.2, 42.9, HG + 3, 8, () => {
      const inf = game.infected;
      for (const [x, z] of [[46.2, 2.2], [48.4, 3.8], [50.2, 2.6]]) inf.spawnCommon(x, HG, z, { chase: true });
      game.audio.play('doorBang', { pos: new THREE.Vector3(43, HG + 1, 3), vol: 1 });
      L.after(0.8, () => say(game, [{ who: 'zoey', text: 'Something\'s in the freezer!', d: 0 }]));
    });
    // dock: the alley is loud
    L.trigger(0.2, HG - 0.5, 0.2, 14, HG + 3, 5, () => {
      say(game, [{ who: 'bill', text: 'Alley\'s full of junk. Watch that car — don\'t touch it.', d: 0.3 }, { who: 'louis', text: 'Fire escape at the far end. We go up!', d: 3.2 }]);
      game.session.objective('Climb the fire escape at the end of the alley');
    });
    L.trigger(33, -0.5, -9, 44, 3, -0.2, () => {
      if (Math.random() < 0.7) d.spawnSpecial('smoker', { where: 'ahead' });
    });
    // 3F: the collapse
    L.trigger(24, H3 - 0.5, 8.2, 30, H3 + 3, 10.6, () => {
      game.session.objective('Find a way around the collapse');
      say(game, [{ who: 'francis', text: 'Ceiling came down. Of course it did.', d: 0.2 }, { who: 'zoey', text: 'Somebody knocked a hole through 310 — this way.', d: 2.6 }]);
    });
    L.trigger(10, H3 - 0.5, 8.2, 16, H3 + 3, 10.6, () => {
      game.session.objective('Take the stairs to the roof');
      L.after(2, () => d.spawnMob(12, { where: 'ahead', minD: 18, maxD: 45 }));
    });
    // roof: the airliner
    L.trigger(2, HR - 0.5, 8.3, 10, HR + 3, 13, () => {
      SK.flyer.fly([
        { x: -260, y: 120, z: -120, t: 0 }, { x: -60, y: 70, z: 20, t: 5.5 }, { x: 40, y: 58, z: 70, t: 8.5 }, { x: 180, y: 70, z: 200, t: 13 }, { x: TOWER.x - 140, y: 30, z: TOWER.z + 60, t: 21 }, { x: TOWER.x + 60, y: 3, z: TOWER.z + 95, t: 27 },
      ]);
      L.after(4.5, () => say(game, [{ who: 'louis', text: 'Plane! A PLANE! They\'re still flying!', d: 0 }, { who: 'bill', text: 'Heading for Metro International. That red light — that\'s the airport tower.', d: 2.8 }, { who: 'zoey', text: 'Then that\'s where we\'re going.', d: 6.4 }]));
    });
    // printing works + office tower beats
    L.trigger(19.6, LR - 0.5, 58, 22, LR + 3, 61, () => {
      say(game, [{ who: 'zoey', text: 'Planks. Great. Just like the movies.', d: 0 }]);
      if (Math.random() < 0.6) d.spawnSpecial(Math.random() < 0.5 ? 'hunter' : 'smoker', { where: 'ahead' });
    });
    L.trigger(58.5, OL2 + 3.5, 64, 70, OL2 + 6, 73, () => {
      game.session.objective('Find a way down to the street');
      say(game, [{ who: 'louis', text: 'Meridian Trust. I interviewed here once.', d: 0.5 }, { who: 'francis', text: 'Bet they didn\'t hire you.', d: 2.6 }]);
    });
    L.trigger(81, OL2 - 0.5, 63.6, 91.7, OL2 + 3, 67, () => {
      say(game, [{ who: 'bill', text: 'Power\'s out down here. Lights on, stay tight.', d: 0.2 }]);
    });
    // lobby: the doors are chained -> the alarmed emergency exit
    const exitPos = new THREE.Vector3(85, OL1 + 1.5, OT.z1);
    let alarm = null;
    const alarmLights = [L.light(85, OL1 + 3.4, OT.z1 - 1.5, 0xff2010, 0, 14, { on: false, priority: 1 }), L.light(85, 3.2, OT.z1 + 2.5, 0xff2010, 0, 12, { on: false, priority: 1 })];
    L.trigger(60, OL1 - 0.5, 84, 72, OL1 + 3, 96, () => {
      game.session.objective('Get out through the emergency exit');
      say(game, [{ who: 'francis', text: 'Front doors are chained.', d: 0.2 }, { who: 'zoey', text: '"Alarm will sound." Of course it will.', d: 2.0 }]);
    });
    T.exit.onOpen = () => {
      if (alarm) return;
      alarm = game.audio.loop('alarm', { pos: exitPos, vol: 1.2 });
      for (const l of alarmLights) l.on = true;
      game.session.objective('Run for the Stor-Safe across the street!');
      say(game, [{ who: 'louis', text: 'Aaand there\'s the alarm!', d: 0.3 }, { who: 'bill', text: 'Across the street — the storage place! Move!', d: 1.8 }]);
      const nav = game.level.nav;
      const pick = (pts) => pts.map(([x, y, z]) => nav.nearestNode(x, y, z, 3)).filter((n) => n >= 0);
      const sets = [pick([[44, 0, 104], [104, 0, 104]]), pick([[104, 0, 100], [66, OL1, 88], [44, 0, 108]]), pick([[44, 0, 100], [104, 0, 108], [80, OL2, 90]])];
      d.panic('alarm', {
        waves: 3, size: [12, 16], interval: 13, nodes: sets[0].length ? sets[0] : undefined, force: true,
        onWave: (i) => { const p = d.panicState; if (p && p.name === 'alarm' && sets[i]?.length) p.nodes = sets[i]; },
        onEnd: () => { alarm?.stop(2); alarm = null; for (const l of alarmLights) l.on = false; },
      });
    };
    L.trigger(58, -0.5, 120.2, 68, 3, 127, () => {
      if (alarm) { alarm.stop(3); alarm = null; for (const l of alarmLights) l.on = false; }
      say(game, [{ who: 'zoey', text: 'Storage units. Everybody hides stuff here — maybe even people.', d: 0.4 }]);
      game.session.objective('Find the safe unit');
    });

    let t = 0;
    L.script = {
      start() {
        ev.disableNavBridge();
        // no guide arrow floating over the empty light well before the skip lands
        const am = L._arrowMesh;
        if (am) {
          const pa = am.geometry.attributes.position;
          for (let q = 0; q + 3 < pa.count; q += 4) {
            let cx = 0, cz = 0;
            for (let k = 0; k < 4; k++) { cx += pa.getX(q + k) / 4; cz += pa.getZ(q + k) / 4; }
            if (cx > 33.5 && cx < 38.5 && cz > 17.5 && cz < 27.5) for (let k = 1; k < 4; k++) pa.setXYZ(q + k, pa.getX(q), pa.getY(q), pa.getZ(q));
          }
          pa.needsUpdate = true;
        }
        d.cfg.noSpawnBoxes = (d.cfg.noSpawnBoxes || []).concat(ev.noSpawn);
        L.after(1.2, () => game.session.objective('Get out of the hotel'));
      },
      clientStart() { ev.disableNavBridge(); },
      update(dt) {
        t += dt;
        if (alarm) { const k = Math.max(0, Math.sin(t * 7)); for (const l of alarmLights) l.intensity = 12 * k * k; }
      },
    };
  },
  onStart(game) {
    game.voice.script([
      { who: 'bill', text: 'Kitchen\'s quiet. Too quiet. Grab what you need.', d: 1.5 },
      { who: 'zoey', text: 'Somebody wrote "crane on the site next door still runs."', d: 5.0 },
      { who: 'louis', text: 'A crane? That\'s one way across the rooftops.', d: 8.6 },
      { who: 'francis', text: 'Nobody touches anything loud.', d: 11.8 },
    ]);
  },
};
