// The two floors every ride has: the lobby (where you get in) and the
// penthouse (where you get out, if you're still alive).
import * as THREE from 'three';
import { V, rnd, pick, ctex, textTex, blocks, FACES, DOOR_Z, tiled } from '../kit.js';
import * as A from '../audio.js';
import { tex as dtex } from '../../disasters/effects.js';

export function checker(key, a, b, n = 8) {
  return ctex('chk:' + key, 256, 256, (x, w) => { const s = w / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = (i + j) % 2 ? a : b; x.fillRect(i * s, j * s, s, s); } });
}
/** A city skyline painted on a canvas (for windows and backdrops). */
export function skyline(key, night = false) {
  return ctex('skyline:' + key + night, 1024, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    if (night) { g.addColorStop(0, '#060a1c'); g.addColorStop(1, '#2a2048'); } else { g.addColorStop(0, '#6aa8e8'); g.addColorStop(1, '#d8ecff'); }
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    let px = 0;
    while (px < w) {
      const bw = rnd(30, 80), bh = rnd(60, 220);
      x.fillStyle = night ? `rgb(${rnd(14, 28) | 0},${rnd(16, 30) | 0},${rnd(30, 50) | 0})` : `rgb(${rnd(110, 160) | 0},${rnd(120, 165) | 0},${rnd(140, 185) | 0})`;
      x.fillRect(px, h - bh, bw, bh);
      for (let yy = h - bh + 8; yy < h - 6; yy += 10) for (let xx = px + 5; xx < px + bw - 6; xx += 9) if (Math.random() < (night ? 0.35 : 0.5)) { x.fillStyle = night ? `rgba(255,${rnd(200, 240) | 0},${rnd(120, 180) | 0},0.9)` : 'rgba(200,225,255,0.55)'; x.fillRect(xx, yy, 4, 5); }
      px += bw + rnd(0, 6);
    }
  });
}
let sparkMats = null;
export function fireworkMats() {
  if (sparkMats) return sparkMats;
  sparkMats = [0xff4040, 0x40ff60, 0x4080ff, 0xffe040, 0xff60ff, 0x60ffff].map((c) => new THREE.SpriteMaterial({ map: dtex().soft, color: c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  return sparkMats;
}

// --- the lobby ------------------------------------------------------------------------------------------------------------------------------------------
export const LOBBY = {
  id: 'lobby', lobby: true, name: 'Lobby', hint: 'Get in the elevator before it leaves!', color: '#ffe8a0', time: 26,
  look: { sky: 'day', amb: [0xfff4e4, 0x8a7a6a, 1.45], sun: [0xfff4e0, 1.1] },
  spawns: [[-14, -36], [-6, -40], [6, -40], [14, -36], [0, -46], [-10, -48], [10, -48]],
  bots: { area: [-24, -54, 24, -18] },
  build(F) {
    const X0 = -30, X1 = 30, Z1 = -62, H = 22;
    F.room({ x0: X0, x1: X1, z1: Z1, h: H, floor: 208, wall: 5, ceiling: 1, frame: 192 });
    F.plane(tiled(checker('lobby', '#e8e4dc', '#30302e', 2), 15, 13), 60, 53, [0, 0.03, (DOOR_Z + Z1) / 2], [-90, 0, 0], { decal: true });
    // wainscot, skirting and crown moulding
    for (const [x0, x1, z0, z1] of [[X0, X0 + 0.3, Z1, DOOR_Z], [X1 - 0.3, X1, Z1, DOOR_Z], [X0, X1, Z1, Z1 + 0.3]]) { F.box(x0, 0, z0, x1, 5, z1, 192); F.box(x0, H - 1, z0, x1, H, z1, 1); }
    F.box(X0, 0, DOOR_Z - 1.3, -6.4, 5, DOOR_Z - 1, 192); F.box(6.4, 0, DOOR_Z - 1.3, X1, 5, DOOR_Z - 1, 192);
    // the great window at the far end, the city outside
    F.box(-22, 3, Z1 + 0.3, 22, 19, Z1 + 0.5, 26, { canCollide: false });
    F.plane(skyline('lobby'), 43, 15.5, [0, 11, Z1 + 0.55], [0, 0, 0]);
    for (let x = -22; x <= 22; x += 5.5) F.box(x - 0.3, 3, Z1 + 0.5, x + 0.3, 19, Z1 + 0.9, 199);
    F.box(-22, 10.7, Z1 + 0.5, 22, 11.3, Z1 + 0.9, 199);
    // the front desk and its receptionist, the bell
    F.box(-26, 0, -38, -19, 4.2, -24, 192, { top: 'Smooth' }); F.box(-26.4, 4.2, -38.4, -18.6, 4.8, -23.6, 21);
    const rec = F.puppet({ colors: { head: 24, torso: 26, leftArm: 26, rightArm: 26, leftLeg: 26, rightLeg: 26 } }, { at: [-28, 0, -31, -Math.PI / 2], faceTex: FACES.sleepy() });
    rec.pose = (a) => { a.rs = 0.3; a.ls = 0.3; };
    F.state.rec = rec;
    F.part({ size: [0.8, 0.4, 0.8], position: [-22, 5, -30], color: 24, shape: 'Cylinder', rotation: [0, 0, 90], reflectance: 0.6 });
    F.sign(-22.5, 10, -24, 7, 2.2, 'RECEPTION', { bg: '#1a1a1a', fg: '#ffd060', face: 'x' });
    // the directory by the elevator
    F.sign(-12, 8.5, DOOR_Z - 1.2, 9, 8, 'FLOOR DIRECTORY\nG ........ Lobby\n?? ........ Beach\n?? ........ Lava (sorry)\n?? ........ The Void\n?? ........ ???\nPH ........ Penthouse', { bg: '#20201c', fg: '#e8dcb0', face: '-z', size: 30 });
    F.sign(0, 13.2, DOOR_Z - 1.1, 12, 2.4, 'ELEVATOR', { bg: '#7a1414', fg: '#ffe8a0', face: '-z', border: '#d8b048' });
    F.sign(12, 8.5, DOOR_Z - 1.2, 7, 4, 'PLEASE MIND\nTHE DOORS', { bg: '#ffffff', fg: '#b01010', face: '-z', border: '#b01010' });
    // sofas, a rug, plants, a water cooler, magazines
    F.box(-10, 0.02, -44, 10, 0.1, -30, 154, { canCollide: false });
    for (const [x, z, ry] of [[-13, -37, -1], [13, -37, 1]]) { const s = ry; F.box(x - 2, 0, z - 5, x + 2, 2.4, z + 5, 21); F.box(x + s * 1.4 - 0.6, 2.4, z - 5, x + s * 1.4 + 0.6, 5, z + 5, 21); F.box(x - 2, 2.4, z - 5.6, x + 2, 4, z - 5, 21); F.box(x - 2, 2.4, z + 5, x + 2, 4, z + 5.6, 21); }
    F.box(-4, 0, -40, 4, 2, -34, 192); F.box(-3, 2, -38.5, -0.5, 2.15, -36.5, 1); F.box(0.5, 2, -38, 3, 2.15, -35.5, 102);
    for (const [x, z] of [[-27, -58], [27, -58], [-27, -14], [27, -14], [8, -58], [-8, -58]]) { F.box(x - 1.2, 0, z - 1.2, x + 1.2, 3, z + 1.2, 38); F.add(blocks([[3.6, 4, 3.6, 0, 5, 0, 28, { shape: 'ball' }], [2.4, 3, 2.4, 0.5, 7.2, 0.3, 37, { shape: 'ball' }]])).position.set(x, 0, z); }
    F.box(24, 0, -26, 26.5, 5.5, -23.5, 1); F.add(blocks([[2, 2.6, 2, 0, 0, 0, 43, { shape: 'cyl', opacity: 0.6 }]])).position.set(25.25, 7, -24.75);
    // chandeliers
    for (const z of [-26, -46]) { F.add(blocks([[0.2, 4, 0.2, 0, 2, 0, 24], [5, 0.4, 5, 0, 0, 0, 24, { shape: 'cyl' }], ...[0, 1, 2, 3, 4, 5].map((i) => [0.5, 0.8, 0.5, Math.cos(i) * 2.2, 0.6, Math.sin(i) * 2.2, 226, { emissive: 0.9 }])])).position.set(0, H - 4.5, z); F.light(V(0, H - 5, z), 0xffe0b0, 120, 60); }
    F.state.t = 0;
  },
  start(F) { A.roomTone(0.12); F.sound(null, 'room'); },
  update(F, dt) {
    F.state.t -= dt;
    if (F.state.t <= 0) {
      F.state.t = rnd(9, 15);
      F.say('Receptionist', pick(['Welcome. The elevator will be with you shortly.', 'Please mind the doors.', 'We are not responsible for anything that happens above the ground floor.', 'Have a nice ride.', 'Please keep your arms and legs inside the elevator.', 'No, there are no stairs.']), F.state.rec);
    }
  },
};

// --- the penthouse ---------------------------------------------------------------------------------------------------------------------------------------
export const PENTHOUSE = {
  id: 'penthouse', name: 'The Penthouse', hint: 'You made it to the top!', color: '#ffd84a', time: 24, music: 'party',
  look: { sky: 'night', amb: [0x8a90c8, 0x30283a, 1.15], sun: [0x8890ff, 0.5], fog: [0x0a0c1a, 220, 700] },
  bots: { venture: 1.2, spots: [[-10, -24], [10, -24], [0, -34], [-14, -38], [14, -38], [0, -20]] },
  lines: ['WE MADE IT', 'yay', 'gg', 'party!!', 'woooo', 'we survived', 'lets go again', 'top floor!!'],
  build(F) {
    // a rooftop: deck, railing, string lights, a trophy, a DJ booth, the city all round far below
    F.ground(-34, -54, 34, DOOR_Z + 0.5, 192, { thick: 2 });
    F.ground(-34, DOOR_Z, 34, 20, 199, { thick: 2 });
    for (let z = -53; z < -9; z += 2) F.box(-34, 0.01, z, 34, 0.05, z + 0.12, 25, { canCollide: false });
    for (const [x0, z0, x1, z1] of [[-34, -54, 34, -53.6], [-34, -54, -33.6, 20], [33.6, -54, 34, 20], [-34, 19.6, 34, 20]]) { F.box(x0, 0, z0, x1, 4, z1, 26, { transparency: 0.4 }); F.box(x0, 4, z0, x1, 4.4, z1, 199); }
    // the little machine-room housing the elevator comes up into
    F.doorWall(199, { x0: -12.4, x1: 12.4, h: 16, frameColor: 26 });
    F.box(-12.4, 0, DOOR_Z, -11.2, 16, 10.4, 199); F.box(11.2, 0, DOOR_Z, 12.4, 16, 10.4, 199); F.box(-12.4, 0, 9.2, 12.4, 16, 10.4, 199); F.box(-12.4, 15, DOOR_Z - 1, 12.4, 16.2, 10.4, 199);
    F.sign(0, 13.6, DOOR_Z - 1.15, 13, 3, 'PENTHOUSE', { bg: '#14101e', fg: '#ffd84a', face: '-z', glow: '#ffb020' });
    // the city below
    const city = F.add(new THREE.Group());
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2 + rnd(-0.03, 0.03), r = rnd(180, 420), h = rnd(40, 200), w = rnd(18, 40);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshPhongMaterial({ color: 0x141a2c, emissive: 0xffd890, emissiveMap: windowsTex(), emissiveIntensity: 0.6, map: windowsTex(), shininess: 5 }));
      m.position.set(Math.cos(a) * r, -260 + h / 2 + rnd(-30, 10), Math.sin(a) * r - 30); city.add(m);
    }
    // string lights
    for (const [x0, x1, z] of [[-33, 33, -24], [-33, 33, -40]]) for (let i = 0; i <= 22; i++) { const x = x0 + (x1 - x0) * i / 22, y = 9 - Math.sin(i / 22 * Math.PI) * 1.6; F.add(blocks([[0.5, 0.6, 0.5, 0, 0, 0, [24, 21, 23, 37][i % 4], { shape: 'ball', emissive: 1 }]], { shadow: false })).position.set(x, y, z); }
    for (const x of [-33, 33]) for (const z of [-24, -40]) F.box(x - 0.3, 0, z - 0.3, x + 0.3, 9.4, z + 0.3, 26);
    // the trophy on its plinth
    F.box(-2.5, 0, -40, 2.5, 4, -35, 1); F.box(-3, 4, -40.5, 3, 4.6, -34.5, 24, { reflectance: 0.5 });
    const trophy = F.add(blocks([[1.6, 0.6, 1.6, 0, 0.3, 0, 24, { shape: 'cyl' }], [0.5, 1.6, 0.5, 0, 1.4, 0, 24, { shape: 'cyl' }], [2.6, 2.4, 2.6, 0, 3.2, 0, 24, { shape: 'cyl' }], [1.6, 1.2, 0.3, -1.6, 3.4, 0, 24, { rz: 30 }], [1.6, 1.2, 0.3, 1.6, 3.4, 0, 24, { rz: -30 }]]));
    trophy.position.set(0, 4.6, -37.5); trophy.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.shininess = 90; m.material.specular = new THREE.Color(0xffeeaa); m.material.emissive = new THREE.Color(0x3a2a00); } });
    F.state.trophy = trophy;
    F.sign(0, 2.2, -34.85, 4.4, 1.6, 'YOU MADE IT', { bg: '#1a1408', fg: '#ffd84a', face: 'z', noBoard: true });
    F.light(V(0, 10, -37), 0xffd890, 80, 40);
    // the DJ
    F.box(-26, 0, -48, -16, 4, -44, 26); F.box(-26, 4, -48, -16, 4.3, -44, 21, { material: 'Neon' });
    const dj = F.puppet({ colors: { head: 24, torso: 26, leftArm: 24, rightArm: 24, leftLeg: 26, rightLeg: 26 }, hats: ['TBoneVisor'] }, { at: [-21, 0, -50, Math.PI] });
    dj.pose = (a, t) => { a.rs = 1.6 + Math.sin(t * 8) * 0.4; a.ls = 1.2 + Math.cos(t * 8) * 0.3; };
    F.light(V(-21, 8, -44), 0xff40c0, 60, 30); F.light(V(20, 8, -30), 0x40c0ff, 60, 40);
    F.state.fw = 1;
  },
  start(F) {
    const E = F.E, game = E.game;
    const alive = game.players.filter((p) => p.character?.alive);
    for (const p of alive) p.stats.Rides = (p.stats.Rides || 0) + 1;
    game.gui.onPlayersChanged();
    const me = game.localPlayer;
    const made = me?.character?.alive;
    A.fanfare(); A.cheer();
    if (made) game.systemChat(`${me.name} reached the top!`);
    const secs = Math.round(E.world.time - E.rideStart);
    E.ui.summary({
      title: made ? 'YOU MADE IT TO THE TOP!' : 'THE TOP FLOOR!',
      floors: E.log, secs: 12,
      body: `${made ? 'Ride complete! <b style="color:#ffd84a">+1 Ride</b>' : 'So close - you were respawned on the way up.'}<br>Floors this ride: ${E.log.length} · Time ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}<br><small>Made it: ${alive.map((p) => p.name).join(', ') || 'nobody'}</small>`,
    });
    // confetti cannons
    for (const x of [-30, 30]) F.burst('spark', V(x, 2, -20), 30, { speed: [10, 30], size: [0.3, 0.7], life: [1.5, 3], gravity: 0.6, dir: V(-Math.sign(x) * 0.5, 1, 0), cone: 0.6 });
  },
  update(F, dt) {
    F.state.trophy.rotation.y += dt * 1.2;
    F.state.fw -= dt;
    if (F.state.fw <= 0) {
      F.state.fw = rnd(0.6, 1.5);
      const p = V(rnd(-120, 120), rnd(60, 110), rnd(-220, -80));
      A.firework(p);
      F.E.world.delay(1, () => { const mats = fireworkMats(); F.fx.burst(pick(mats), p, 40, { speed: [12, 26], size: [1.2, 2.4], life: [1, 1.8], gravity: 0.25 }); });
    }
  },
};
let winTex = null;
function windowsTex() {
  if (winTex) return winTex;
  winTex = ctex('cityWindows', 64, 128, (x, w, h) => { x.fillStyle = '#000'; x.fillRect(0, 0, w, h); for (let yy = 4; yy < h; yy += 8) for (let xx = 3; xx < w; xx += 8) if (Math.random() < 0.4) { x.fillStyle = `rgba(255,${rnd(190, 240) | 0},${rnd(110, 170) | 0},1)`; x.fillRect(xx, yy, 4, 4); } });
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping; winTex.repeat.set(2, 4);
  return winTex;
}
void textTex;
