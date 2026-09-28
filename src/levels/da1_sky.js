// Dead Air 1 — the world beyond the roofs: a visual-only city ring, Metro
// International's control tower (the red beacon landmark), air traffic
// (approaching airliners, a holding stack, fighter jets), tracer fire and
// artillery flashes on the horizon, smoke plumes and a fire-lit overcast.
import * as THREE from 'three';
import { VisualBatch, SkyLights, skyAircraft, airportLandmark, smokePlumes, cloudDeck, airlinerModel, Flyer, jetAudio } from './da_parts.js';
import { makeRng } from '../core/math.js';

const rng = makeRng(9177);
export const TOWER = { x: 430, z: -130, h: 62 };
// viewpoints the landmark must stay visible from (eye positions along the route)
const VIEWS = [[16, 19.6, 30], [30, 19.6, 38], [52, 19.6, 32], [67, 12.5, 28], [72, 8.8, 26], [95.8, 8.9, 43]];

function segRect(ax, az, bx, bz, x0, z0, x1, z1) {
  // parametric overlap [t0, t1] of segment a->b with an AABB (Liang-Barsky)
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [t0, t1];
}
// Highest roof allowed for a block so it never hides the tower top from the views.
function maxHeight(x0, z0, x1, z1) {
  let h = 1e9;
  const T = [TOWER.x, TOWER.h * 0.72, TOWER.z];
  for (const V of VIEWS) {
    const o = segRect(V[0], V[2], T[0], T[2], x0 - 2, z0 - 2, x1 + 2, z1 + 2);
    if (!o) continue;
    const y = V[1] + (T[1] - V[1]) * o[0];
    h = Math.min(h, y - 3);
  }
  return h;
}

function cityBlock(B, x0, z0, x1, z1, h, o = {}) {
  const mat = rng.pick(['concreteDark', 'brickDark', 'concrete', 'brick']);
  const tint = rng.pick([0x6a6660, 0x5a5854, 0x7a7068, 0x4a4a50, 0x6a5a50]);
  B.box(x0, -1, z0, x1, h, z1, mat, { tint, ao: 0.5 });
  const lit = o.lit ?? 0.07, fire = o.fire ?? 0;
  const win = (fx, fy, fz, axis, s) => {
    const r = rng();
    if (r > lit + fire) return;
    const burning = r < fire;
    const m = burning ? 'emissiveWarm' : 'emissiveWindow';
    if (axis === 'x') B.box(fx - 0.6, fy, fz + s * 0.02, fx + 0.6, fy + 1.5, fz + s * 0.06, m);
    else B.box(fx + s * 0.02, fy, fz - 0.6, fx + s * 0.06, fy + 1.5, fz + 0.6, m);
  };
  const faces = o.faces ?? ['n', 's', 'e', 'w'];
  for (let y = 4; y < h - 2; y += 3.4) {
    if (faces.includes('n')) for (let x = x0 + 1.6; x < x1 - 1; x += 3) win(x, y, z0, 'x', -1);
    if (faces.includes('s')) for (let x = x0 + 1.6; x < x1 - 1; x += 3) win(x, y, z1, 'x', 1);
    if (faces.includes('w')) for (let z = z0 + 1.6; z < z1 - 1; z += 3) win(x0, y, z, 'z', -1);
    if (faces.includes('e')) for (let z = z0 + 1.6; z < z1 - 1; z += 3) win(x1, y, z, 'z', 1);
  }
  B.box(x0, h, z0, x1, h + 0.9, z0 + 0.35, mat, { tint });
  B.box(x0, h, z1 - 0.35, x1, h + 0.9, z1, mat, { tint });
  if (rng() < 0.6) { const cx = x0 + (x1 - x0) * (0.25 + rng() * 0.5), cz = z0 + (z1 - z0) * (0.25 + rng() * 0.5); B.box(cx - 2, h, cz - 1.5, cx + 2, h + 2.4, cz + 1.5, 'metalDark'); }
  if (rng() < 0.3) { const cx = x0 + (x1 - x0) * 0.7, cz = z0 + (z1 - z0) * 0.3; B.box(cx - 1.8, h + 3.5, cz - 1.8, cx + 1.8, h + 6.5, cz + 1.8, 'woodDark', { tint: 0x4a3a2a }); B.box(cx - 0.1, h, cz - 0.1, cx + 0.1, h + 3.5, cz + 0.1, 'metalDark'); }
  if (h > 45) B.box((x0 + x1) / 2 - 0.25, h + 0.9, (z0 + z1) / 2 - 0.25, (x0 + x1) / 2 + 0.25, h + 1.4, (z0 + z1) / 2 + 0.25, 'emissiveRed');
  if (o.roofFire) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (let i = 0; i < 6; i++) B.box(cx - 3 + rng() * 6, h, cz - 3 + rng() * 6, cx - 2 + rng() * 6, h + 0.6 + rng() * 2.6, cz - 2 + rng() * 6, 'emissiveWarm');
  }
}

export function buildSky(L, game, S) {
  // ------------------------------------------------ city ring (visual only)
  const B = new VisualBatch(L);
  const near = [-48, -34, 172, 116]; // hand-built area
  const fires = [];
  for (let x = -250; x < 380; x += 40) {
    for (let z = -260; z < 330; z += 40) {
      const bx0 = x + 3 + rng() * 4, bz0 = z + 3 + rng() * 4, bx1 = x + 33 + rng() * 4, bz1 = z + 33 + rng() * 4;
      if (bx1 > near[0] && bx0 < near[2] && bz1 > near[1] && bz0 < near[3]) continue;
      const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
      const d = Math.hypot(cx - 60, cz - 40);
      if (d > 290) continue;
      // the airport lies east beyond x ~ 330: keep that area to the landmark
      if (cx > 300 && cz < 60) continue;
      const tall = rng() < 0.2;
      let h = 14 + rng() * (tall ? 70 : 30) + (cz < -60 && cx < 200 ? 20 : 0); // downtown to the north
      h = Math.min(h, maxHeight(bx0, bz0, bx1, bz1));
      if (h < 8) continue;
      const faces = [];
      if (cz > 60) faces.push('n'); if (cz < 20) faces.push('s'); if (cx > 110) faces.push('w'); if (cx < 10) faces.push('e');
      const roofFire = rng() < 0.09;
      if (roofFire) fires.push([cx, h, cz]);
      cityBlock(B, bx0, bz0, bx1, bz1, h, { faces, lit: 0.08, fire: rng() < 0.12 ? 0.05 : 0, roofFire });
    }
  }
  // downtown landmarks: a spire tower and twin slabs (north-west)
  const sp = [-40, -150];
  B.box(sp[0] - 11, -1, sp[1] - 11, sp[0] + 11, 118, sp[1] + 11, 'concreteDark', { tint: 0x4a4c54 });
  B.box(sp[0] - 7, 118, sp[1] - 7, sp[0] + 7, 132, sp[1] + 7, 'concreteDark', { tint: 0x4a4c54 });
  B.box(sp[0] - 0.4, 132, sp[1] - 0.4, sp[0] + 0.4, 158, sp[1] + 0.4, 'metalDark');
  for (let y = 8; y < 116; y += 4) for (let k = -9; k <= 9; k += 3) if (rng() < 0.16) B.box(sp[0] + k - 0.6, y, sp[1] + 11.02, sp[0] + k + 0.6, y + 2, sp[1] + 11.08, 'emissiveWindow');
  B.box(sp[0] - 0.3, 158, sp[1] - 0.3, sp[0] + 0.3, 158.6, sp[1] + 0.3, 'emissiveRed');
  for (const [tx, tz] of [[80, -175], [112, -170]]) {
    B.box(tx - 8, -1, tz - 13, tx + 8, 92, tz + 13, 'concrete', { tint: 0x5a5a60 });
    for (let y = 6; y < 90; y += 3.6) for (let k = -6; k <= 6; k += 2.4) if (rng() < 0.12) B.box(tx + k - 0.5, y, tz + 13.02, tx + k + 0.5, y + 2, tz + 13.08, 'emissiveWindow');
    B.box(tx - 0.3, 92, tz - 0.3, tx + 0.3, 92.6, tz + 0.3, 'emissiveRed');
  }
  B.build(L);

  // ------------------------------------------------ sky lights, airport, traffic
  const sky = new SkyLights(L, game, 360);
  S.sky = sky;
  S.airport = airportLandmark(L, game, sky, TOWER.x, TOWER.z, { h: TOWER.h, runway: { x0: TOWER.x - 110, x1: TOWER.x + 150, z: TOWER.z + 90 }, terminal: [TOWER.x - 150, TOWER.z + 35, TOWER.x + 60, TOWER.z + 62] });
  // aircraft warning lights on the tall neighbours
  for (const [x, y, z] of [[sp[0], 158.8, sp[1]], [80, 92.8, -175], [112, 92.8, -170], [122, 46.8, 27]]) {
    const i = sky.add(x, y, z, [2.4, 0.15, 0.1], 5);
    sky.track({ ph: rng() * 2, update(t) { sky.size[i] = (t + this.ph) % 1.6 < 0.8 ? 5 : 1.5; } });
  }
  // holding stack: two airliners circling far out
  for (let k = 0; k < 2; k++) {
    const R = 190 + k * 70, cx = 230, cz = -330, alt = 230 + k * 40, w = 0.045 - k * 0.01, ph = k * 2.2;
    skyAircraft(sky, (t) => { const a = t * w + ph; return { x: cx + Math.cos(a) * R, y: alt + Math.sin(t * 0.1 + k) * 4, z: cz + Math.sin(a) * R }; }, { landing: false, scale: 0.8 });
  }
  // departures climbing out to the north-east every ~70 s
  skyAircraft(sky, (t) => {
    const c = t % 70; if (c > 48) return null;
    const k = c / 48;
    return { x: TOWER.x + 60 + k * 420, y: 8 + k * k * 340, z: TOWER.z + 60 - k * 520 };
  }, { landing: true, scale: 0.9, phase: 20 });
  // fighter pair streaking over the city
  const jetPath = (off) => (t) => {
    const c = (t + 38) % 58; if (c > 8) return null;
    const k = c / 8;
    return { x: -500 + k * 1100 + off, y: 150 + off * 0.2, z: 330 - k * 760 + off * 0.6 };
  };
  const jetA = skyAircraft(sky, jetPath(0), { kind: 'jet' });
  skyAircraft(sky, jetPath(-26), { kind: 'jet' });
  // jet roar follows the lead fighter while it's in the air
  let jetSnd = null;
  sky.track({ update(t, dt) {
    if (jetA.visible) {
      if (!jetSnd) jetSnd = jetAudio(game, { vol: 3.4, ref: 60, whine: 320, whineVol: 0.05, hiss: 0.5 });
      jetSnd?.set(jetA.pos, 1, jetA.vel);
    } else if (jetSnd) { jetSnd.stop(1.5); jetSnd = null; }
  } });
  // tracer fire & artillery flashes on the horizon
  const tracers = [];
  for (let i = 0; i < 18; i++) tracers.push({ id: sky.add(0, -1e3, 0, [3, 1.6, 0.3], 0), t: -1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
  const nests = [[-260, 0, -220], [320, 0, 260], [-300, 0, 180], [210, 0, -330]];
  const flash = sky.add(0, -1e3, 0, [3, 1.8, 0.8], 0);
  let burstT = 2, flashT = 6, fl = -1;
  sky.track({ update(t, dt) {
    burstT -= dt; flashT -= dt;
    if (burstT <= 0) {
      burstT = 2 + Math.random() * 6;
      const n = nests[Math.floor(Math.random() * nests.length)];
      const ang = Math.random() * 6.28;
      let k = 0;
      for (const tr of tracers) {
        if (tr.t >= 0 || k > 5) continue;
        k++;
        tr.t = -k * 0.12; tr.x = n[0]; tr.y = n[1] + 20; tr.z = n[2];
        tr.vx = Math.cos(ang) * 60 + (Math.random() - 0.5) * 20; tr.vy = 150 + Math.random() * 40; tr.vz = Math.sin(ang) * 60 + (Math.random() - 0.5) * 20;
      }
    }
    for (const tr of tracers) {
      if (tr.t < -0.9) continue;
      if (tr.t < 0) { tr.t += dt; if (tr.t >= 0) tr.t = 0.0001; else continue; }
      tr.t += dt;
      if (tr.t > 1.6) { tr.t = -1; sky.hide(tr.id); continue; }
      sky.set(tr.id, tr.x + tr.vx * tr.t, tr.y + tr.vy * tr.t, tr.z + tr.vz * tr.t, null, 3.2);
    }
    if (flashT <= 0) {
      flashT = 7 + Math.random() * 12;
      const a = Math.random() * 6.28, d = 380 + Math.random() * 80;
      sky.set(flash, 60 + Math.cos(a) * d, 4 + Math.random() * 10, 40 + Math.sin(a) * d, null, 70);
      fl = 0.35;
      const at = new THREE.Vector3(60 + Math.cos(a) * 120, 10, 40 + Math.sin(a) * 120);
      setTimeout(() => { try { game.audio.play('explosion', { pos: at, vol: 0.35, rate: 0.6 }); } catch (e) { /* ignore */ } }, 1100 + Math.random() * 800);
    }
    if (fl > 0) { fl -= dt; sky.size[flash] = fl > 0 ? 70 * (fl / 0.35) : 0; }
  } });
  // ------------------------------------------------ smoke columns + overcast
  const plumes = [[-80, 20, -120, 170, 20], [210, 25, 170, 140, 16], [150, 30, -60, 150, 14], [-170, 10, 120, 130, 16], [300, 0, -250, 200, 26], [60, 60, 190, 110, 12]];
  for (const f of fires.slice(0, 4)) plumes.push([f[0], f[1], f[2], 90, 9]);
  smokePlumes(L, game, plumes.map(([x, y, z, h, r]) => ({ x, y, z, h, r })), { per: 9, wind: [1, -0.35] });
  cloudDeck(L, game, { y: 185, r: 560, glow: 0x6a3e2a, dark: 0x1e181c });

  // ------------------------------------------------ airliners (scripted low pass + periodic approaches)
  const model = airlinerModel({ livery: 0x1a3a8a });
  const flyer = new Flyer(L, game, model, { sky, light: { color: 0xfff2dc, intensity: 45, range: 70 }, audio: { vol: 2.6, ref: 45 }, shake: 110 });
  S.flyer = flyer;
  S.lowPass = (onOver) => {
    let said = false;
    flyer.o.onUpdate = (t, d) => { if (!said && d < 75) { said = true; onOver?.(); } };
    flyer.fly([
      { x: -420, y: 110, z: 70, t: 0 }, { x: -160, y: 75, z: 44, t: 4.2 }, { x: 16, y: 52, z: 27, t: 7.0 }, { x: 170, y: 44, z: 6, t: 9.6 },
      { x: 330, y: 22, z: -40, t: 12.4 }, { x: TOWER.x - 120, y: 2, z: TOWER.z + 90, t: 16 },
    ], { onEnd: () => scheduleApproach(60 + Math.random() * 30) });
  };
  let approachTimer = null;
  const scheduleApproach = (sec) => {
    L.after(sec, () => {
      if (flyer.path) { scheduleApproach(20); return; }
      flyer.o.onUpdate = null;
      const zo = (Math.random() - 0.5) * 50;
      flyer.fly([
        { x: -520, y: 210, z: 40 + zo, t: 0 }, { x: -200, y: 150, z: 10 + zo, t: 6 }, { x: 60, y: 100, z: -12 + zo * 0.5, t: 11 },
        { x: 250, y: 55, z: -40, t: 15.5 }, { x: TOWER.x - 120, y: 2, z: TOWER.z + 90, t: 21 },
      ], { onEnd: () => scheduleApproach(70 + Math.random() * 40) });
    });
  };
  void approachTimer;
  return { sky, flyer };
}
