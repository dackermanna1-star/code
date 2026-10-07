// Floors: inside the computer, the pharaoh's tomb, the bowling lane, the hall of mirrors, the minefield,
// the museum at night, the pizza party.
import * as THREE from 'three';
import { V, rnd, pick, clamp, ctex, liveTex, blocks, tiled, DOOR_Z, FACES, faceTex, textTex, plastic, Puppet } from '../kit.js';
import * as A from '../audio.js';
import { GROUP } from '../../../engine/Part.js';
import { checker } from './special.js';

const DRESS = (skin, top, legs) => ({ colors: { head: skin, torso: top, leftArm: skin, rightArm: skin, leftLeg: legs, rightLeg: legs } });
const ALL = (c) => ({ colors: { head: c, torso: c, leftArm: c, rightArm: c, leftLeg: c, rightLeg: c } });
const flat = (p) => V(p.x, 0, p.z);

// --- inside the computer ----------------------------------------------------------------------------------------------------------------------------------
function pcbTex() {
  return ctex('pcb', 256, 256, (x, w) => {
    x.fillStyle = '#06301a'; x.fillRect(0, 0, w, w);
    x.strokeStyle = '#2ac86a'; x.lineWidth = 3;
    for (let i = 0; i < 26; i++) { let px = rnd(0, w), py = rnd(0, w); x.beginPath(); x.moveTo(px, py); for (let j = 0; j < 4; j++) { if (j % 2) px += rnd(-80, 80); else py += rnd(-80, 80); x.lineTo(px, py); } x.stroke(); x.fillStyle = '#e8c040'; x.beginPath(); x.arc(px, py, 5, 0, 7); x.fill(); }
    x.fillStyle = '#0a4a28'; for (let i = 0; i < 8; i++) x.fillRect(rnd(0, w), rnd(0, w), rnd(10, 30), rnd(10, 30));
  });
}
const LANES = [-32, -50, -68, -86];
export const computer = {
  id: 'computer', name: 'Inside the Computer', hint: 'Dodge the data. Stay out of the Recycle Bin.', color: '#4affd8', time: 34, music: 'cyber',
  look: { sky: 'cyber', amb: [0x9affe8, 0x0a2a2a, 1.15], sun: [0xa0fff0, 0.55], fog: [0x02100e, 90, 280] },
  bots: { venture: 0.6, spots: [[0, -20], [-14, -24], [14, -22], [-30, -40], [30, -58]], area: [-20, -26, 20, -14] },
  lines: ['we are in the computer', 'DATA', 'dodge the packets', 'is that a virus', 'dont go in the recycle bin', 'ctrl alt delete', '01001000 01001001'],
  build(F) {
    const S = F.state;
    F.ground(-90, -140, 90, DOOR_Z + 0.5, 28);
    F.plane(tiled(pcbTex(), 14, 10), 180, 131, [0, 0.03, -74.25], [-90, 0, 0], { emissive: 0.25 });
    // the data lanes, and the packets racing along them
    S.packets = [];
    for (const [i, z] of LANES.entries()) {
      for (const s of [-1, 1]) F.box(-90, 0.02, z + s * 4.2 - 0.25, 90, 0.12, z + s * 4.2 + 0.25, i % 2 ? 104 : 1019, { material: 'Neon', canCollide: false });
      const dir = i % 2 ? -1 : 1, speed = 38 + i * 6;
      for (let k = 0; k < 3; k++) {
        const m = F.add(blocks([[3.4, 3.4, 3.4, 0, 0, 0, i % 2 ? 104 : 42, { emissive: 0.8 }], [3.6, 0.3, 3.6, 0, 0, 0, 1, { emissive: 1 }]]));
        m.position.set(-90 + k * 60 + rnd(0, 20), 2, z); S.packets.push({ m, dir, speed, z });
      }
      F.sign(dir > 0 ? -60 : 60, 0.6, z - 5.6, 10, 1.4, dir > 0 ? 'DATA ▶▶▶' : '◀◀◀ DATA', { bg: '#02100e', fg: i % 2 ? '#c86aff' : '#4affd8', face: 'z', noBoard: true, glow: '#4affd8' });
    }
    // chips, RAM, capacitors
    F.box(-56, 0, -76, -30, 4, -50, 26); F.plane(textTex('CPU', { bg: '#1a1a1a', fg: '#c8c8c8', w: 256, h: 128 }), 14, 7, [-43, 4.05, -63], [-90, 0, 0]);
    for (let i = 0; i < 12; i++) for (const [dx, dz] of [[-13.6, 0], [13.6, 0]]) F.box(-43 + dx - 0.4, 0, -74 + i * 2.1 - 0.3, -43 + dx + 0.4, 1, -74 + i * 2.1 + 0.3, 24);
    for (let i = 0; i < 4; i++) { F.box(34 + i * 6, 0, -80, 36 + i * 6, 14, -48, 28); for (let j = 0; j < 4; j++) F.box(33.8 + i * 6, 3 + j * 3, -77 + j * 7, 36.2 + i * 6, 5 + j * 3, -73 + j * 7, 26); }
    for (const [x, z, c] of [[-30, -22, 23], [-38, -26, 21], [26, -24, 23], [-62, -100, 21], [62, -110, 23]]) F.add(blocks([[4, 7, 4, 0, 3.5, 0, c, { shape: 'cyl' }], [4.1, 0.4, 4.1, 0, 7, 0, 199, { shape: 'cyl' }]])).position.set(x, 0, z);
    for (const [x, z] of [[-30, -22], [-38, -26], [26, -24]]) F.box(x - 2, 0, z - 2, x + 2, 7, z + 2, 1, { transparency: 1 });
    // the golden byte on its pad at the far end, and the Recycle Bin
    F.box(-5, 0, -114, 5, 2, -104, 199, { material: 'Neon' });
    S.byte = F.add(blocks([[2.6, 2.6, 2.6, 0, 0, 0, 24, { emissive: 0.6 }]])); S.byte.position.set(0, 4.6, -109); F.spin(S.byte, 1.6, 0.4);
    F.pickup(S.byte, 3.2, (ch) => F.bonus(ch, 'Golden Byte', 3));
    F.add(blocks([[12, 12, 12, 0, 6, 0, 42, { shape: 'cyl', opacity: 0.45 }], [12.6, 1, 12.6, 0, 12.4, 0, 42, { shape: 'cyl', opacity: 0.6 }], [3, 6, 0.4, -2, 7, -6.1, 1], [3, 6, 0.4, 2, 7, -6.1, 1]])).position.set(36, 0, -110);
    F.sign(36, 15, -104, 12, 2, 'RECYCLE BIN', { bg: '#02100e', fg: '#4affd8', face: 'z', noBoard: true, glow: '#4affd8' });
    F.zone(31, -1, -115, 41, 12, -105, (ch) => { A.pop(ch.rootPosition); F.kill(ch, 'was deleted'); });
    S.virus = null;
  },
  update(F, dt, t) {
    const S = F.state;
    for (const p of S.packets) {
      p.m.position.x += p.dir * p.speed * (S.crash ? 0.25 : 1) * dt; if (p.m.position.x > 95) p.m.position.x -= 190; if (p.m.position.x < -95) p.m.position.x += 190;
      p.m.rotation.x += dt * 2 * p.dir;
      for (const ch of F.chars({ outside: true })) {
        const q = ch.rootPosition;
        if (Math.abs(q.x - p.m.position.x) < 2.8 && Math.abs(q.z - p.z) < 2.8 && q.y < 7 && !ch.platformStand) { F.fling(ch, V(p.dir * 50, 30, rnd(-10, 10)), 1); F.hurt(ch, 34, 'was hit by a data packet'); A.zap(q); }
      }
    }
    // the virus
    if (!S.virus && t > 9) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 0), new THREE.MeshPhongMaterial({ color: 0xff1a2a, emissive: 0x600008, flatShading: true })));
      for (let i = 0; i < 12; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2, 6), plastic(21, { emissive: 0.3 })); const d = new THREE.Vector3().randomDirection(); c.position.copy(d).multiplyScalar(2.6); c.quaternion.setFromUnitVectors(V(0, 1, 0), d); g.add(c); }
      g.add(blocks([[0.7, 0.7, 0.3, -0.7, 0.4, -2.2, 1, { shape: 'ball' }], [0.7, 0.7, 0.3, 0.7, 0.4, -2.2, 1, { shape: 'ball' }]]));
      g.position.set(0, 4, -120); F.add(g); S.virus = g;
      A.errorSound(); F.say('System', 'WARNING: virus detected.', V(0, 8, -110));
    }
    if (S.virus) {
      const g = S.virus, tgt = F.nearest(g.position, { outside: true, max: 110 });
      const want = tgt ? flat(tgt.rootPosition) : V(0, 0, -100); want.z = Math.min(want.z, -14);
      const d = want.sub(flat(g.position)), L = d.length();
      if (L > 0.3) g.position.addScaledVector(d.normalize(), Math.min(L, (S.crash ? 15 : 11.5) * dt));
      g.position.y = 4 + Math.sin(t * 5) * 0.5; g.rotation.y += dt * 3; g.rotation.x += dt;
      for (const ch of F.chars({ outside: true })) if (ch.rootPosition.distanceTo(g.position) < 4.2) { A.zap(ch.rootPosition); F.kill(ch, 'caught a virus'); }
    }
  },
  closing(F) {
    const S = F.state; S.crash = true; F.E.cur.songPaused = true; A.stopSong('floor'); A.powerDown();
    F.E.env.apply({ skyColor: 0x0a2aa8, amb: [0x8aa8ff, 0x0a1a5a, 1.1], sun: [0xa8c0ff, 0.4], fog: [0x0a2aa8, 90, 300] });
    F.plane(textTex(':(\nYour floor ran into a problem\nand needs to restart.', { bg: '#0a2aa8', fg: '#ffffff', w: 1024, h: 512, font: 'Segoe UI, Arial' }), 90, 45, [0, 30, -139], [0, 0, 0], { basic: true, transparent: false });
  },
  botTick(F, bot) { if (F.state.virus && bot.mode === 'out' && F.state.virus.position.distanceTo(bot.ch.rootPosition) < 24) bot.mode = 'return'; },
};

// --- the pharaoh's tomb --------------------------------------------------------------------------------------------------------------------------------------
function glyphTex() {
  return ctex('hiero', 256, 256, (x, w) => {
    x.fillStyle = '#c8a868'; x.fillRect(0, 0, w, w);
    x.fillStyle = '#6a4a20'; x.strokeStyle = '#6a4a20'; x.lineWidth = 3;
    for (let col = 0; col < 6; col++) { x.fillRect(col * 42 + 40, 0, 2, w); for (let row = 0; row < 7; row++) { const cx = col * 42 + 20, cy = row * 36 + 18; const k = (col * 7 + row) % 6; x.beginPath(); if (k === 0) { x.arc(cx, cy, 8, 0, 7); x.stroke(); x.fillRect(cx - 1, cy + 8, 2, 8); } else if (k === 1) { x.moveTo(cx - 10, cy + 8); x.lineTo(cx, cy - 10); x.lineTo(cx + 10, cy + 8); x.closePath(); x.stroke(); } else if (k === 2) { x.ellipse(cx, cy, 10, 5, 0, 0, 7); x.stroke(); x.beginPath(); x.arc(cx, cy, 2.5, 0, 7); x.fill(); } else if (k === 3) { x.moveTo(cx - 10, cy); for (let i = 0; i < 4; i++) x.lineTo(cx - 10 + i * 6 + 3, cy + (i % 2 ? -5 : 5)); x.stroke(); } else if (k === 4) { x.fillRect(cx - 8, cy - 2, 16, 4); x.fillRect(cx - 2, cy - 10, 4, 20); } else { x.arc(cx, cy - 4, 5, 0, 7); x.fill(); x.fillRect(cx - 7, cy + 2, 14, 8); } } }
  });
}
export const tomb = {
  id: 'tomb', name: "The Pharaoh's Tomb", hint: 'Mind the spikes. Do not wake the pharaoh.', color: '#e8c060', time: 36, music: 'dread',
  look: { skyColor: 0x0a0604, amb: [0xffd8a0, 0x3a2410, 0.75], sun: [0xffc880, 0.25], fog: [0x0a0604, 60, 170] },
  bots: { venture: 0.6, gaps: false, spots: [[-8, -20], [8, -30], [0, -36], [0, -44], [0, -88], [-14, -100], [14, -96]], area: [-12, -38, 12, -14] },
  lines: ['a tomb', 'mummy!!', 'dont touch the mask', 'the spikes', 'treasure', 'it moved', 'its getting sandy'],
  build(F) {
    const S = F.state, H = 16;
    F.ground(-26, -120, 26, DOOR_Z + 0.5, 226);
    F.box(-26, H, -120, 26, H + 1, DOOR_Z, 5);
    F.doorWall(5, { x0: -17, x1: 17, h: H, frameColor: 24 });
    const g = glyphTex();
    const wall = (x0, z0, x1, z1) => { F.box(x0, 0, z0, x1, H, z1, 5); };
    wall(-17, -40, -16, DOOR_Z); wall(16, -40, 17, DOOR_Z); wall(-17, -41, -6, -40); wall(6, -41, 17, -40);
    wall(-7, -80, -6, -40); wall(6, -80, 7, -40);
    wall(-25, -81, -6, -80); wall(6, -81, 25, -80); wall(-25, -120, -24, -80); wall(24, -120, 25, -80); wall(-25, -121, 25, -120);
    for (const [x, rot, z, L] of [[-15.95, 90, -25, 30], [15.95, -90, -25, 30], [-5.95, 90, -60, 38], [5.95, -90, -60, 38], [-23.95, 90, -100, 38], [23.95, -90, -100, 38]]) F.plane(tiled(g, L / 10, 1.4), L, 14, [x, 7.5, z], [0, rot, 0]);
    F.plane(tiled(g, 4.6, 1.4), 46, 14, [0, 7.5, -119.9], [0, 0, 0]);
    // torches
    for (const [x, z] of [[-15.4, -24], [15.4, -24], [-5.4, -60], [5.4, -60], [-23.4, -92], [23.4, -92]]) { F.box(x - 0.3 * Math.sign(x), 6, z - 0.3, x + 0.6 * Math.sign(x), 7.6, z + 0.3, 192, { canCollide: false }); F.flame(V(x, 8.2, z), 1.2); }
    for (const [x, z] of [[-12, -24], [12, -24], [0, -60], [-16, -96], [16, -100]]) F.light(V(x, 9, z), 0xff9a40, 55, 34);
    // spike traps in the corridor
    S.traps = [];
    const spikeGeo = new THREE.ConeGeometry(0.35, 2.4, 6);
    for (const [k, z0] of [-48, -57, -66].entries()) {
      F.box(-6, 0.02, z0 - 6, 6, 0.06, z0, 199, { canCollide: false });
      const grp = new THREE.Group();
      for (let x = -5.2; x <= 5.2; x += 1.3) for (let z = z0 - 5.4; z <= z0 - 0.6; z += 1.2) { const m = new THREE.Mesh(spikeGeo, plastic(199, { shininess: 80 })); m.position.set(x, 1.2, z); grp.add(m); }
      grp.position.y = -2.6; F.add(grp);
      S.traps.push({ grp, z0, off: k * 0.8, up: false });
    }
    // the burial chamber: pillars, treasure, the sarcophagus with the golden mask
    for (const [x, z] of [[-16, -88], [16, -88], [-16, -112], [16, -112]]) F.box(x - 1.4, 0, z - 1.4, x + 1.4, H, z + 1.4, 5);
    for (let i = 0; i < 26; i++) { const x = (Math.random() < 0.5 ? -1 : 1) * rnd(8, 22), z = rnd(-118, -84); F.add(blocks([[rnd(1, 2.5), rnd(0.6, 2), rnd(1, 2.5), 0, 0.5, 0, 24, { shininess: 90, emissive: 0.15 }]])).position.set(x, 0, z); }
    F.box(-3, 0, -106, 3, 3, -94, 192);
    S.lid = F.add(blocks([[6.2, 0.8, 12.2, 0, 0, 0, 24, { emissive: 0.1 }], [3, 0.3, 4, 0, 0.5, -3.5, 106]])); S.lid.position.set(0, 3.4, -100);
    S.mask = F.add(blocks([[2, 2.4, 0.6, 0, 0, 0, 24, { emissive: 0.4 }], [2.6, 1.2, 0.6, 0, -1.2, 0.1, 23], [0.4, 0.3, 0.2, -0.45, 0.3, -0.35, 26], [0.4, 0.3, 0.2, 0.45, 0.3, -0.35, 26]]));
    S.mask.position.set(0, 4.6, -97); S.mask.rotation.x = -1.2;
    F.pickup(S.mask, 3.4, (ch) => { F.bonus(ch, 'Golden Mask', 3); wake(F); }, { offset: V(0, 0, 0) });
    S.scarabs = [];
    for (let i = 0; i < 10; i++) { const b = F.add(blocks([[0.8, 0.4, 1.1, 0, 0.2, 0, 26, { shape: 'ball' }]], { shadow: false })); b.position.set(rnd(-20, 20), 0, rnd(-116, -84)); b.userData.a = rnd(0, 6); S.scarabs.push(b); }
    S.mummy = null;
  },
  start(F) { A.drone(0.12); F.sound(null, 'drone'); },
  update(F, dt, t) {
    const S = F.state;
    // the spikes: a rattle, then up they come
    for (const tr of S.traps) {
      const ph = ((t + tr.off) % 2.6) / 2.6, up = ph > 0.62 && ph < 0.9;
      if (ph > 0.5 && ph < 0.52 && !tr.warned) { tr.warned = true; A.crunch(V(0, 1, tr.z0 - 3)); }
      if (ph < 0.5) tr.warned = false;
      tr.grp.position.y += ((up ? 0 : -2.6) - tr.grp.position.y) * Math.min(1, dt * (up ? 30 : 6));
      if (up && !tr.up) A.snap(V(0, 1, tr.z0 - 3));
      tr.up = up;
      if (up) for (const ch of F.chars()) { const q = ch.rootPosition; if (q.z < tr.z0 && q.z > tr.z0 - 6 && Math.abs(q.x) < 6 && q.y < 5.2) F.kill(ch, 'was skewered by a spike trap'); }
    }
    for (const b of S.scarabs) { b.userData.a += rnd(-2, 2) * dt; b.position.x = clamp(b.position.x + Math.sin(b.userData.a) * dt * 4, -22, 22); b.position.z = clamp(b.position.z + Math.cos(b.userData.a) * dt * 4, -118, -82); b.rotation.y = b.userData.a + Math.PI; }
    if (!S.mummy && t > 15) wake(F);
    const M = S.mummy;
    if (M) {
      if (S.lidOff < 1) { S.lidOff = Math.min(1, S.lidOff + dt * 1.2); S.lid.position.x = S.lidOff * 4.6; S.lid.rotation.z = -S.lidOff * 0.5; S.lid.position.y = 3.4 - S.lidOff * 1.6; }
      if (M.rise < 1) { M.rise = Math.min(1, M.rise + dt * 0.6); M.pos.y = -1 + M.rise * 4; }
      else {
        const tgt = F.nearest(M.centre, { outside: true, max: 120 });
        if (tgt) {
          // (through the corridor, not the walls)
          const q = tgt.rootPosition; let goal = flat(q);
          if (M.pos.z < -80 && q.z > -80) goal = V(0, 0, -78); else if (M.pos.z < -40 && M.pos.z > -82 && q.z > -40) goal = V(0, 0, -38);
          goal.z = Math.min(goal.z, -14); M.walkTo(goal, S.fast ? 11 : 8);
        } else M.stop();
        if (M.walking && Math.abs(M.pos.z + 100) > 6) M.pos.y = Math.max(0, M.pos.y - dt * 6);
        for (const ch of F.chars({ outside: true })) if (M.touches(ch, 1.8)) F.kill(ch, 'was cursed by the mummy');
        if ((S.moanT = (S.moanT || 0) - dt) <= 0) { S.moanT = rnd(3, 5); A.roar(M.head, 0.5, 1.6); }
      }
    }
    if (S.sand && Math.random() < dt * 12) F.burst(0xd8b878, V(rnd(-14, 14), 15.5, rnd(-36, -12)), 3, { speed: [0, 1], size: [0.6, 1.2], life: [1, 1.6], gravity: 1.2 });
  },
  closing(F) { const S = F.state; S.sand = true; S.fast = true; F.shake(0.4); A.crumble(V(0, 14, -24)); F.say('???', '*the tomb begins to shake*', V(0, 10, -24)); if (!S.mummy) wake(F); },
  botTick(F, bot) {
    const S = F.state, p = bot.ch.rootPosition;
    // wait for the spikes to drop before crossing
    for (const tr of S.traps) if (p.z > tr.z0 && p.z < tr.z0 + 3 && bot.target && bot.target.z < tr.z0 - 6) { const ph = ((F.t + tr.off) % 2.6) / 2.6; if (ph > 0.45 && ph < 0.95) { bot.waitT = 0.3; bot.target = null; } }
    if (S.mummy && bot.mode === 'out' && S.mummy.pos.distanceTo(p) < 30) bot.mode = 'return';
  },
};
function wake(F) {
  const S = F.state; if (S.mummy) return;
  S.mummy = F.puppet({ colors: { head: 5, torso: 5, leftArm: 5, rightArm: 5, leftLeg: 5, rightLeg: 5 } }, { at: [0, -1, -100, Math.PI], faceTex: FACES.mummy(), speed: 8 });
  S.mummy.rise = 0; S.lidOff = 0;
  S.mummy.pose = (a, t, moving) => { a.rs = a.ls = 1.5 + Math.sin(t * 2) * 0.1; if (!moving) { a.rh = a.lh = 0; } };
  A.crumble(V(0, 4, -100)); A.stinger(); F.shake(0.5);
  F.E.game.players.forEach((p) => { if (p.brain && Math.random() < 0.4) F.E.world.delay(rnd(0.5, 1.5), () => p.brain.say(pick(['MUMMY', 'run!!', 'it woke up', 'who took the mask']))); });
}

// --- the bowling lane ---------------------------------------------------------------------------------------------------------------------------------------
function pinMesh() {
  const pts = [[0, 0], [1.05, 0.2], [1.35, 2], [1.45, 3.6], [1.2, 5.6], [0.62, 7.6], [0.55, 8.4], [0.78, 10], [0.72, 11.3], [0.3, 11.9], [0, 12]].map(([r, y]) => new THREE.Vector2(r, y - 6));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 16), new THREE.MeshPhongMaterial({ color: 0xfafafa, shininess: 70 })));
  for (const y of [1.9, 2.6]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.62, 0.35, 16), new THREE.MeshPhongMaterial({ color: 0xd8202a })); band.position.y = y; g.add(band); }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}
const PINS = [[0, -44], [-3.8, -37.5], [3.8, -37.5], [-7.6, -31], [0, -31], [7.6, -31], [-11.4, -24.5], [-3.8, -24.5], [3.8, -24.5], [11.4, -24.5]];
const hidden = new THREE.MeshBasicMaterial({ visible: false });
export const bowling = {
  id: 'bowling', name: 'Strike!', hint: "You're the size of a bowling pin. Guess what's coming.", color: '#ff6a3a', time: 36,
  look: { skyColor: 0x0a0814, amb: [0xf0e8ff, 0x3a3048, 1.2], sun: [0xfff0e0, 0.7], fog: [0x0a0814, 300, 700] },
  bots: { venture: 0.6, spots: [[-16, -22], [16, -22], [0, -28], [-6, -40], [8, -50]], area: [-16, -46, 16, -18] },
  lines: ['BOWLING', 'we are the pins', 'BALL', 'get out of the way', 'strike lol', 'that bowler is HUGE', 'spare!!'],
  build(F) {
    const S = F.state;
    F.ground(-20, -330, 20, DOOR_Z + 0.5, 192);
    const wood = ctex('lane', 128, 256, (x, w, h) => { for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#d8a868' : '#e4b878'; x.fillRect(i * w / 16, 0, w / 16, h); } x.fillStyle = 'rgba(120,70,20,0.15)'; for (let i = 0; i < 40; i++) x.fillRect(rnd(0, w), rnd(0, h), 1, rnd(10, 60)); });
    F.plane(tiled(wood, 3, 20), 40, 320, [0, 0.03, -170], [-90, 0, 0], { shininess: 90 });
    for (const z of [-90, -120]) for (let i = -3; i <= 3; i++) F.add(blocks([[1.2, 0.05, 2.4, 0, 0, 0, 21, { shape: 'cone', rx: -90 }]])).position.set(i * 4.4, 0.08, z + Math.abs(i) * 3);
    // gutters and walls
    for (const s of [-1, 1]) { F.box(s * 20, -3, -330, s * 26, -2.2, -14, 199); F.box(s * 26, 0, -330, s * 28, 12, DOOR_Z, 26); F.box(s * 20 - 0.01, -2, -330, s * 20 + 0.01, 0, -14, 192); }
    for (const s of [-1, 1]) F.box(s * 20 + (s > 0 ? 0 : -6), -3, -14, s * 20 + (s > 0 ? 6 : 0), 0, DOOR_Z + 0.5, 192);
    F.doorWall(26, { x0: -28, x1: 28, h: 30 });
    // the scoreboard over the doors
    S.board = liveTex(512, 160);
    F.plane(S.board.tex, 30, 9.4, [0, 21, -10.1], [0, 180, 0], { basic: true, transparent: false });
    drawBoard(S, 'BOWL!', '#ffd84a');
    // the pinsetter above the deck, and the pins
    S.setter = F.add(blocks([[30, 6, 28, 0, 0, 0, 26], [30.4, 0.6, 28.4, 0, -3, 0, 24]])); S.setter.position.set(0, 34, -34);
    S.pins = PINS.map(([x, z]) => {
      const p = F.part({ name: 'Pin', size: [2.6, 12, 2.6], position: [x, 6.05, z], anchored: false, mass: 3, color: 1 });
      p.mesh.material = hidden; p.mesh.add(pinMesh()); p.home = V(x, 6.05, z);
      return p;
    });
    // the bowler, far away, enormous
    S.bowler = new Puppet(F.world, DRESS(24, 23, 26), { scale: 9 }); S.bowler.place(0, 0, -310, Math.PI); F.puppets.push(S.bowler);
    S.bowler.pose = (a) => { a.rs = S.swing || 0; };
    F.light(V(0, 20, -30), 0xfff0e0, 60, 60);
    S.balls = 0; S.ball = null; S.nextBall = 7;
  },
  update(F, dt, t) {
    const S = F.state;
    // the bowler winds up... and lets go
    if (!S.ball && t > S.nextBall - 2.4 && t < S.nextBall) { S.swing = -1.2 + (t - (S.nextBall - 2.4)) / 2.4 * 0.6; if (!S.warned) { S.warned = true; F.E.ui.toast('🎳 BALL INCOMING! Get off the lane!', '#ff6a3a', 'rgba(80,20,10,.9)'); A.whistle(V(0, 10, -30)); } }
    if (!S.ball && t >= S.nextBall && !S.closed) {
      S.warned = false; S.swing = 2.4; S.balls++;
      const x = rnd(-5, 5);
      S.ball = { p: F.mover({ name: 'BowlingBall', shape: 'Ball', size: [14, 14, 14], position: [x, 7, -290], color: pick([104, 21, 23, 26]), top: 'Smooth' }), x, z: -290, curve: rnd(-0.04, 0.04), passed: [] };
      S.ball.p.mesh.material = new THREE.MeshPhongMaterial({ color: S.ball.p.mesh.material.color || 0x6a2aa8, shininess: 120, specular: 0xffffff });
      A.thud(V(0, 5, -290), 2); S.rumble = A.bed('rumble', 0, { kind: 'brown', f: 140 }); F.sound(null, 'rumble');
    }
    const B = S.ball;
    if (B) {
      const sp = 72;
      B.z += sp * dt; B.x += B.curve * sp * dt;
      B.p.setPosition(B.x, 7, B.z); B.p.body.velocity.set(B.curve * sp, 0, sp); B.p.setRotationDeg((B.z / 7) * 57.3, 0, 0);
      A.volume('rumble', clamp(1 - Math.abs(F.E.world.camera.position.z - B.z) / 200, 0.05, 0.9));
      F.shake(clamp(0.5 - Math.abs(F.E.world.camera.position.z - B.z) / 120, 0, 0.5));
      for (const ch of F.chars()) if (ch.rootPosition.distanceTo(B.p.position) < 8.2) F.kill(ch, 'got a STRIKE', B.p.position.clone());
      if (B.z > -46 && !B.hitPins) { B.hitPins = true; A.pins(V(0, 6, -34)); B.brave = F.chars({ outside: true }).filter((ch) => Math.abs(ch.rootPosition.x) < 15 && ch.rootPosition.z < -18 && ch.rootPosition.z > -48); }
      if (B.z > -19) {
        // into the pit it goes
        B.p.destroy(); S.ball = null; A.thud(V(0, 3, -18), 2); A.stop('rumble');
        const down = S.pins.filter((p) => V(0, 1, 0).applyQuaternion(p.mesh.quaternion).y < 0.85 || p.mesh.position.distanceTo(p.home) > 3).length;
        drawBoard(S, down >= 10 ? 'STRIKE!' : down > 0 ? `${down} PINS` : 'GUTTER BALL', down >= 10 ? '#ff4a4a' : '#ffd84a');
        if (down >= 10) A.cheer();
        for (const ch of B.brave || []) if (ch.alive) F.bonus(ch, 'Spare!', 2);
        S.nextBall = t + 9; S.resetAt = t + 3.5;
      }
    }
    // the pinsetter comes down and stands them back up
    if (S.resetAt && t > S.resetAt) {
      const k = t - S.resetAt;
      S.setter.position.y = 34 - Math.sin(Math.min(1, k / 2) * Math.PI) * 16;
      if (k > 1 && !S.didReset) { S.didReset = true; for (const p of S.pins) { p.body.position.set(p.home.x, p.home.y, p.home.z); p.body.quaternion.set(0, 0, 0, 1); p.body.velocity.set(0, 0, 0); p.body.angularVelocity.set(0, 0, 0); p.body.wakeUp?.(); } A.clunk(V(0, 20, -34)); }
      if (k > 2) { S.resetAt = 0; S.didReset = false; S.setter.position.y = 34; }
    }
  },
  closing(F) { F.state.closed = true; },
  botTick(F, bot) { const S = F.state; if (bot.mode === 'out' && (S.ball || F.t > S.nextBall - 3)) bot.mode = 'return'; },
};
function drawBoard(S, text, col) {
  S.board.redraw((x, w, h) => {
    x.fillStyle = '#0a0814'; x.fillRect(0, 0, w, h); x.strokeStyle = '#ffd84a'; x.lineWidth = 6; x.strokeRect(4, 4, w - 8, h - 8);
    x.fillStyle = col; x.shadowColor = col; x.shadowBlur = 18; x.font = 'bold 84px Impact, Arial Black'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 4);
  });
}

// --- the hall of mirrors ------------------------------------------------------------------------------------------------------------------------------------
const MZ = -50; // the mirror
const mz = (z) => 2 * MZ - z;
export const mirror = {
  id: 'mirror', name: 'Hall of Mirrors', hint: 'Look at yourself. Look closer. Something glitters in there...', color: '#d8a8ff', time: 34,
  look: { skyColor: 0x08040e, amb: [0xe0c8ff, 0x2a1a3a, 1.05], sun: [0xe8d8ff, 0.4], fog: [0x08040e, 80, 200] },
  bots: { venture: 0.7, spots: [[-12, -22], [12, -26], [0, -36], [-14, -44], [14, -46]], area: [-18, -46, 18, -14] },
  lines: ['mirrors!!', 'look at me', 'theres two of me', 'my reflection moved', 'is it looking at me', 'nope'],
  build(F) {
    const S = F.state, H = 18;
    // everything is built twice: the room, and the room in the mirror
    const both = (x0, y0, z0, x1, y1, z1, c, o) => { F.box(x0, y0, z0, x1, y1, z1, c, o); F.box(x0, y0, mz(z0), x1, y1, mz(z1), c, { ...o, canCollide: false }); };
    F.plane(tiled(checker('mirrorFloor', '#3a1a5a', '#e8d8ff'), 8, 9), 44, 82, [0, 0.03, MZ], [-90, 0, 0]);
    F.ground(-22, mz(DOOR_Z), 22, DOOR_Z + 0.5, 26);
    both(-23, 0, MZ, -22, H, DOOR_Z, 104); both(22, 0, MZ, 23, H, DOOR_Z, 104);
    F.box(-23, H, mz(DOOR_Z), 23, H + 1, DOOR_Z, 26);
    F.doorWall(104, { x0: -23, x1: 23, h: H, frameColor: 24 });
    F.box(-23, 0, mz(DOOR_Z) - 1, 23, H, mz(DOOR_Z), 104, { canCollide: false });
    F.box(-6, 11, mz(DOOR_Z) - 0.4, 6, 11.4, mz(DOOR_Z), 24, { canCollide: false });
    F.box(-6, 0, mz(DOOR_Z) - 0.3, 6, 11, mz(DOOR_Z), 199, { canCollide: false });
    // things in the room: columns, a vase, a chair, a clown painting
    for (const [x, z] of [[-14, -18], [14, -18], [-14, -40], [14, -40]]) both(x - 1.2, 0, z - 1.2, x + 1.2, H, z + 1.2, 1);
    both(-3, 0, -32, 3, 3.5, -27, 24);
    for (const zz of [-29.5, mz(-29.5)]) F.add(blocks([[3, 4, 3, 0, 2, 0, 23, { shape: 'ball' }], [1.4, 2, 1.4, 0, 4.6, 0, 23, { shape: 'cyl' }]])).position.set(0, 3.5, zz);
    for (const zz of [-22, mz(-22)]) { const ch = F.add(blocks([[3, 0.5, 3, 0, 2, 0, 21], [3, 3.4, 0.4, 0, 3.9, -1.3, 21], ...[[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]].map(([x, z]) => [0.3, 2, 0.3, x, 1, z, 26])])); ch.position.set(-18, 0, zz); if (zz < MZ) ch.rotation.y = Math.PI; }
    F.box(-19.5, 0, -23.5, -16.5, 2.4, -20.5, 21, { transparency: 1 });
    const clown = ctex('clownPaint', 128, 160, (x, w, h) => { x.fillStyle = '#2a1a3a'; x.fillRect(0, 0, w, h); x.fillStyle = '#ffffff'; x.beginPath(); x.arc(w / 2, h / 2, 40, 0, 7); x.fill(); x.fillStyle = '#e8202a'; x.beginPath(); x.arc(w / 2, h / 2 + 4, 9, 0, 7); x.fill(); x.fillStyle = '#111'; x.fillRect(w / 2 - 20, h / 2 - 16, 8, 10); x.fillRect(w / 2 + 12, h / 2 - 16, 8, 10); x.strokeStyle = '#e8202a'; x.lineWidth = 5; x.beginPath(); x.arc(w / 2, h / 2 + 12, 22, 0.2, Math.PI - 0.2); x.stroke(); x.strokeStyle = '#c8a040'; x.lineWidth = 10; x.strokeRect(5, 5, w - 10, h - 10); });
    F.plane(clown, 6, 7.5, [21.9, 9, -28], [0, -90, 0]); F.plane(clown, 6, 7.5, [21.9, 9, mz(-28)], [0, -90, 0]);
    // funhouse mirrors on the walls (wobbly)
    S.fun = [];
    const funTex = ctex('funmirror', 64, 128, (x, w, h) => { const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#d8e0ea'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#a8b4c4'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    for (const z of [-24, -36]) for (const s of [-1, 1]) { const m = F.plane(funTex, 5, 10, [s * 21.9, 7, z], [0, -s * 90, 0], { shininess: 120 }); S.fun.push(m); }
    // the mirror: a frame, glass you can almost see through (into the other room), and something glittering in there
    F.box(-22, 0, MZ - 0.3, 22, H, MZ + 0.3, 1, { transparency: 1 });
    for (const [x0, y0, x1, y1] of [[-22, 0, -20.6, H], [20.6, 0, 22, H], [-22, H - 1.4, 22, H], [-22, 0, 22, 0.8]]) F.box(x0, y0, MZ - 0.5, x1, y1, MZ + 0.5, 24, { canCollide: false });
    S.glass = F.plane(ctex('glass', 4, 4, (x) => { x.fillStyle = '#c8d8f0'; x.fillRect(0, 0, 4, 4); }), 41.2, H - 2.2, [0, H / 2 - 0.3, MZ + 0.05], [0, 0, 0], { transparent: true, opacity: 0.12, shininess: 150 });
    S.key = F.add(blocks([[0.5, 2.6, 0.3, 0, 0, 0, 24, { emissive: 0.7 }], [1.6, 1.6, 0.3, 0, 1.6, 0, 24, { emissive: 0.7, shape: 'cyl', rx: 90 }], [1, 0.4, 0.3, 0.5, -1, 0, 24, { emissive: 0.7 }]]));
    S.keyAt = V(15, 3, -20); S.key.position.set(S.keyAt.x, 3, mz(S.keyAt.z)); F.spin(S.key, 1.4, 0.3);
    S.keyLight = F.light(V(15, 5, mz(-20)), 0xffd860, 30, 14);
    S.refl = new Map();
  },
  start(F) { A.whispers(0.08); F.sound(null, 'whisper'); F.at(4, () => F.E.ui.toast('Something glitters in the mirror... but not in the room.', '#d8a8ff', 'rgba(40,20,60,.9)')); },
  update(F, dt, t) {
    const S = F.state;
    for (const [i, m] of S.fun.entries()) { m.scale.x = 1 + Math.sin(t * 1.3 + i) * 0.25; m.scale.y = 1 + Math.cos(t * 1.1 + i) * 0.15; }
    // the reflections
    for (const ch of F.chars()) {
      let r = S.refl.get(ch);
      const out = ch.rootPosition.z < DOOR_Z - 0.5;
      if (!r && out) {
        r = new Puppet(F.world, ch.appearance || DRESS(24, 23, 37), {}); F.puppets.push(r); S.refl.set(ch, r); r.ch = ch;
        if (ch.npc?.def.face) r.setFace(FACES[ch.npc.def.face]());
      }
      if (!r || S.loose) continue;
      r.root.visible = out;
      const q = ch.rootPosition;
      r.place(q.x, q.y - 3, mz(q.z), Math.PI - (ch.facing || 0));
      const an = ch.model.angles;
      r.pose = (a) => { a.rs = -an.ls; a.ls = an.rs; a.rh = -an.lh; a.lh = an.rh; };
    }
    // the key that's only in the mirror
    if (!S.gotKey) for (const ch of F.chars({ outside: true })) if (flat(ch.rootPosition).distanceTo(flat(S.keyAt)) < 2.6) { S.gotKey = true; S.key.visible = false; S.keyLight.set(0); F.bonus(ch, 'Through the Looking Glass', 3); A.sparkle(ch.rootPosition); break; }
    // and when the mirror breaks, they come out
    if (S.loose) for (const r of S.refl.values()) {
      if (!r.alive || !r.root.visible) continue;
      const ch = r.ch;
      if (ch.alive && F.outside(ch)) { const g = flat(ch.rootPosition); g.z = Math.min(g.z, -12); r.walkTo(g, 14.5); r.pos.y = 0; }
      else r.stop();
      r.pose = (a, tt, moving) => { if (moving) { a.rs = a.ls = 1.5; } };
      for (const c2 of F.chars({ outside: true })) if (r.touches(c2, 1.6)) F.kill(c2, c2 === ch ? 'was replaced by their reflection' : 'was grabbed by a reflection');
    }
  },
  closing(F) {
    const S = F.state; S.loose = true;
    A.glassBreak(V(0, 8, MZ)); A.crack(V(0, 8, MZ)); A.stinger(); F.shake(0.4);
    S.glass.material.opacity = 0.35; S.glass.material.color.set(0xffc8c8);
    for (let i = 0; i < 4; i++) F.plane(ctex('mcrack', 256, 256, (x, w) => { x.clearRect(0, 0, w, w); x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 3; for (let k = 0; k < 10; k++) { let px = w / 2, py = w / 2; const a = k / 10 * 6.28; x.beginPath(); x.moveTo(px, py); for (let j = 0; j < 6; j++) { px += Math.cos(a + rnd(-0.5, 0.5)) * 22; py += Math.sin(a + rnd(-0.5, 0.5)) * 22; x.lineTo(px, py); } x.stroke(); } }), 12, 12, [rnd(-14, 14), rnd(4, 12), MZ + 0.12], [0, 0, rnd(0, 360)], { transparent: true, basic: true });
    F.E.game.players.forEach((p) => { if (p.brain && Math.random() < 0.4) F.E.world.delay(rnd(0.4, 1.4), () => p.brain.say(pick(['THEY ARE COMING OUT', 'nope nope nope', 'my reflection!!', 'RUN']))); });
  },
  botTick(F, bot) { if (F.state.loose && bot.mode === 'out') bot.mode = 'return'; },
};

// --- the minefield ------------------------------------------------------------------------------------------------------------------------------------------------
export const minefield = {
  id: 'minefield', name: 'The Minefield', hint: 'Listen for the beeping. Capture the flag. Watch your step.', color: '#9ac85a', time: 36,
  look: { sky: 'overcast', amb: [0xe0e8e0, 0x6a7050, 1.35], sun: [0xf0f0e0, 1.0], fog: [0xb8c0b8, 90, 400] },
  bots: { venture: 0.45, spots: [[-10, -26], [10, -30], [0, -40], [-20, -56], [18, -64], [0, -80]], area: [-30, -100, 30, -22] },
  lines: ['a minefield??', 'dont step anywhere', 'is that beeping', 'BOOM', 'get the flag', 'nope', 'follow my footsteps'],
  build(F) {
    const S = F.state;
    F.ground(-200, -260, 200, 40, 28, { top: 'Studs' });
    F.box(-30, 0, -18, -4, 3, -15, 226, { top: 'Smooth' }); F.box(4, 0, -18, 30, 3, -15, 226, { top: 'Smooth' });
    for (let x = -29; x < 30; x += 2.6) if (Math.abs(x) > 4) F.add(blocks([[2.4, 1.1, 1.4, 0, 0, 0, 226, { shape: 'ball' }]])).position.set(x, 3.4, -16.5);
    for (const s of [-1, 1]) { for (let z = -14; z > -130; z -= 8) F.box(s * 44 - 0.3, 0, z - 0.3, s * 44 + 0.3, 5, z + 0.3, 192); for (const y of [1.6, 3.2, 4.6]) F.box(s * 44 - 0.08, y, -130, s * 44 + 0.08, y + 0.12, -14, 199, { canCollide: false }); }
    F.box(-44, 0, -130, 44, 5, -129.6, 199, { transparency: 1 });
    for (const [x, z] of [[-16, -16.6], [16, -16.6]]) F.sign(x, 6.4, z, 7, 3, '☠ DANGER ☠\nMINES', { bg: '#c4281c', fg: '#ffffff', face: 'z', border: '#ffffff' });
    // the hill with the flag
    for (let k = 0; k < 4; k++) F.box(-12 + k * 2.5, 0, -126 + k * 2.5, 12 - k * 2.5, 1.2 + k * 1.2, -106 - k * 2.5, 28, { top: 'Studs' });
    F.box(-0.25, 4.8, -116.25, 0.25, 18, -115.75, 199);
    S.flag = F.plane(ctex('flagE', 64, 40, (x, w, h) => { x.fillStyle = '#ffd84a'; x.fillRect(0, 0, w, h); x.fillStyle = '#c4281c'; x.beginPath(); x.moveTo(10, 8); x.lineTo(54, 20); x.lineTo(10, 32); x.fill(); }), 6, 3.8, [3, 16, -116], [0, 0, 0], { double: true });
    F.pickup(V(0, 7.8, -116), 3.4, (ch) => { F.bonus(ch, 'Captured the Flag', 3); A.fanfare(); S.flag.material.color.set(0x8aff8a); }, { keep: true });
    // craters from before
    const crater = ctex('crater', 64, 64, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(20,14,8,0.95)'); g.addColorStop(0.6, 'rgba(60,40,20,0.7)'); g.addColorStop(1, 'rgba(60,40,20,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); });
    S.crater = crater;
    for (let i = 0; i < 6; i++) F.plane(crater, rnd(5, 9), rnd(5, 9), [rnd(-36, 36), 0.06, rnd(-100, -30)], [-90, 0, rnd(0, 360)], { transparent: true });
    // the mines
    S.mines = [];
    for (let tries = 0; S.mines.length < 46 && tries < 2000; tries++) {
      const p = V(rnd(-40, 40), 0, rnd(-104, -22));
      if (S.mines.some((m) => m.p.distanceTo(p) < 5.5)) continue;
      const vis = Math.random() < 0.3;
      let m = null;
      if (vis) { m = F.add(blocks([[1.6, 0.4, 1.6, 0, 0.1, 0, 199, { shape: 'cyl' }], [0.4, 0.3, 0.4, 0, 0.35, 0, 21, { shape: 'cyl' }]])); m.position.copy(p); }
      S.mines.push({ p, m, live: true, armed: 0 });
    }
    S.beepT = 0;
  },
  start(F) { A.wind(0.15); F.sound(null, 'wind'); },
  update(F, dt, t) {
    const S = F.state;
    S.flag.rotation.y = Math.sin(t * 3) * 0.2;
    for (const m of S.mines) {
      if (!m.live) continue;
      if (!m.armed) for (const ch of F.chars({ outside: true })) { const q = ch.rootPosition; if (Math.hypot(q.x - m.p.x, q.z - m.p.z) < 1.7 && q.y < 4.5) { m.armed = t; A.tone(1800, 0.06, { type: 'square', vol: 0.3, pos: m.p }); A.snap(m.p); break; } }
      if (m.armed && t - m.armed > 0.42) boom(F, m);
    }
    // the mine detector: beeping faster the closer you are
    const me = F.E.game.localPlayer?.character;
    if (me?.alive && F.outside(me)) {
      let d = 99; for (const m of S.mines) if (m.live) d = Math.min(d, Math.hypot(me.rootPosition.x - m.p.x, me.rootPosition.z - m.p.z));
      S.beepT -= dt;
      if (d < 9 && S.beepT <= 0) { S.beepT = 0.08 + d / 9 * 0.7; A.tone(d < 3 ? 1400 : 900, 0.05, { type: 'sine', vol: 0.1 }); }
    }
  },
  closing(F) {
    const S = F.state;
    F.say('Sergeant', 'CLEARING THE FIELD! EVERYBODY BACK!', V(0, 6, -16));
    const live = S.mines.filter((m) => m.live).sort((a, b) => a.p.z - b.p.z);
    live.forEach((m, i) => F.at(F.t + 0.6 + i / live.length * 3.6, () => boom(F, m)));
  },
  botTick(F, bot) { if (F.state.mines.some((m) => !m.live) && bot.mode === 'out' && Math.random() < 0.02) bot.mode = 'return'; },
};
function boom(F, m) {
  if (!m.live) return; m.live = false;
  if (m.m) m.m.visible = false;
  const p = m.p.clone().add(V(0, 1, 0));
  A.explosion(p, 1); F.burst('dust', p, 26, { speed: [8, 26], size: [2, 5], life: [0.8, 2], gravity: 0.25, grow: 1.4 }); F.burst('spark', p, 14, { speed: [10, 30], size: [0.3, 0.6], life: [0.2, 0.5] });
  F.plane(F.state.crater, 8, 8, [m.p.x, 0.07, m.p.z], [-90, 0, rnd(0, 360)], { transparent: true });
  const camD = F.E.world.camera.position.distanceTo(p); F.shake(Math.max(0, 1 - camD / 80));
  for (const ch of F.chars()) { const d = ch.rootPosition.distanceTo(p); if (d < 5) F.kill(ch, 'stepped on a mine', p); else if (d < 13 && F.outside(ch)) F.fling(ch, flat(ch.rootPosition).sub(flat(p)).setLength(40).add(V(0, 40, 0)), 1); }
}

// --- the museum at night -------------------------------------------------------------------------------------------------------------------------------------------
function painting(key, draw) { return ctex('paint:' + key, 128, 160, (x, w, h) => { draw(x, w, h); x.strokeStyle = '#c8a040'; x.lineWidth = 12; x.strokeRect(6, 6, w - 12, h - 12); }); }
const PAINTINGS = [
  painting('lisa', (x, w, h) => { x.fillStyle = '#4a5a3a'; x.fillRect(0, 0, w, h); x.fillStyle = '#3a2a1a'; x.beginPath(); x.ellipse(w / 2, h * 0.5, 34, 50, 0, 0, 7); x.fill(); x.fillStyle = '#d8b088'; x.beginPath(); x.ellipse(w / 2, h * 0.4, 18, 24, 0, 0, 7); x.fill(); x.fillStyle = '#2a1a10'; x.fillRect(w / 2 - 34, h * 0.62, 68, 60); x.strokeStyle = '#6a3a2a'; x.lineWidth = 2; x.beginPath(); x.arc(w / 2, h * 0.43, 7, 0.3, Math.PI - 0.3); x.stroke(); }),
  painting('stars', (x, w, h) => { x.fillStyle = '#1a2a6a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#8ab8ff'; x.lineWidth = 4; for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(rnd(20, w - 20), rnd(20, h * 0.6), rnd(8, 20), 0, 5); x.stroke(); } x.fillStyle = '#ffe060'; for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(rnd(14, w - 14), rnd(14, h * 0.6), rnd(3, 7), 0, 7); x.fill(); } x.fillStyle = '#1a1a10'; x.beginPath(); x.moveTo(20, h); x.lineTo(30, h * 0.4); x.lineTo(40, h); x.fill(); }),
  painting('scream', (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#e8602a'); g.addColorStop(0.5, '#e8a03a'); g.addColorStop(1, '#2a4a6a'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = '#d8c8a0'; x.beginPath(); x.ellipse(w / 2, h * 0.55, 14, 22, 0, 0, 7); x.fill(); x.fillStyle = '#1a1a1a'; x.beginPath(); x.ellipse(w / 2, h * 0.62, 4, 7, 0, 0, 7); x.fill(); x.beginPath(); x.arc(w / 2 - 5, h * 0.5, 2.5, 0, 7); x.arc(w / 2 + 5, h * 0.5, 2.5, 0, 7); x.fill(); }),
];
export const museum = {
  id: 'museum', name: 'The Museum at Night', hint: "The statues only move when you're not looking.", color: '#e8e0c8', time: 36,
  look: { skyColor: 0x05060c, amb: [0xa8b8e0, 0x20222a, 0.75], sun: [0xb8c8f0, 0.35], fog: [0x05060c, 60, 180] },
  bots: { venture: 0.55, spots: [[-12, -22], [12, -28], [0, -44], [-16, -60], [16, -66], [0, -80]], area: [-20, -84, 20, -16] },
  lines: ['a museum', 'did that statue move', 'dont blink', 'its behind me isnt it', 'the diamond!!', 'statues are creepy', 'LOOK AT IT'],
  build(F) {
    const S = F.state, H = 22;
    F.room({ x0: -30, x1: 30, z1: -90, h: H, floor: 1, wall: 5, ceiling: 199, frame: 24 });
    F.plane(tiled(checker('marble', '#e8e4dc', '#b8b4ac'), 12, 16), 60, 81, [0, 0.03, -49.5], [-90, 0, 0], { shininess: 90 });
    for (const z of [-24, -44, -64, -84]) for (const x of [-26, 26]) F.box(x - 1.4, 0, z - 1.4, x + 1.4, H, z + 1.4, 1);
    F.box(-8, H - 0.2, -80, 8, H, -20, 42, { transparency: 0.5, canCollide: false }); // the skylight
    S.moon = F.light(V(0, H - 2, -50), 0x8aa8ff, 40, 60);
    for (const [i, [x, z]] of [[-29.8, -34], [-29.8, -56], [29.8, -40], [29.8, -72]].entries()) F.plane(PAINTINGS[i % 3], 7, 8.75, [x + (x < 0 ? 0.1 : -0.1), 10, z], [0, x < 0 ? 90 : -90, 0]);
    // the dinosaur skeleton
    const bone = 1;
    const dino = blocks([[1.2, 1.2, 26, 0, 14, 0, bone], [3.4, 3, 6, 0, 17, -15, bone], [2.6, 1, 5, 0, 15.3, -15.6, bone], [1, 1, 12, 0, 12, 18, bone, { rx: 15 }], ...[-8, -5, -2, 1, 4].map((z) => [7, 0.5, 0.5, 0, 12.5, z, bone, { rz: 90, shape: 'cyl' }]), [1, 12, 1, -2.4, 6, -4, bone], [1, 12, 1, 2.4, 6, -4, bone], [1, 12, 1, -2.4, 6, 6, bone], [1, 12, 1, 2.4, 6, 6, bone]]);
    dino.position.set(0, 1.2, -56); F.add(dino); F.box(-10, 0, -72, 10, 1.2, -40, 194);
    // the knight, the sarcophagus
    F.add(blocks([[2, 8, 3, 0, 4, 0, 24], [1.6, 1.6, 0.3, 0, 7, -1.6, 24, { emissive: 0.1 }]])).position.set(-20, 0, -78);
    // the statues
    S.statues = [];
    for (const [x, z, pose] of [[-18, -24, 0], [18, -30, 1], [-18, -48, 2], [18, -54, 0], [-16, -70, 1], [16, -82, 2]]) {
      F.box(x - 2, 0, z - 2, x + 2, 3, z + 2, 194);
      const s = F.puppet(ALL(1), { at: [x, 3, z, x < 0 ? -Math.PI / 2 : Math.PI / 2], faceTex: FACES.ghost(), speed: 24 });
      s.model.root.traverse((m) => { if (m.isMesh && m.material?.color) { m.material = m.material.clone(); m.material.color.set(0xe8e4dc); } });
      s.still = pose; s.home = V(x, 3, z);
      s.pose = (a, t, moving) => { if (moving) { a.rs = a.ls = 1.4; return; } if (s.still === 0) { a.rs = 2.6; a.ls = 0.2; } else if (s.still === 1) { a.rs = a.ls = 0.9; a.rh = 0.5; } else { a.rs = 3; a.ls = 3; } };
      S.statues.push(s);
    }
    // the diamond
    F.box(-2, 0, -88, 2, 4, -84, 194); F.box(-2.2, 4, -88.2, 2.2, 8, -83.8, 42, { transparency: 0.75 });
    S.gem = F.add(new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), new THREE.MeshPhongMaterial({ color: 0xc8f0ff, emissive: 0x2a5a8a, shininess: 150, specular: 0xffffff, transparent: true, opacity: 0.9 })));
    S.gem.position.set(0, 5.6, -86); F.spin(S.gem, 1.2);
    F.pickup(S.gem, 3.4, (ch) => { F.bonus(ch, 'Night at the Museum', 3); A.alarmBell(0.2); F.sound(null, 'alarm'); S.alarm = true; }, { offset: V(0, 0, 3) });
    S.guard = F.puppet(DRESS(24, 102, 26), { at: [8, 0, -18, Math.PI], hat: (h) => h.add(blocks([[1.5, 0.5, 1.5, 0, 0.7, 0, 26, { shape: 'cyl' }], [1.6, 0.12, 1.9, 0, 0.45, -0.3, 26]])) });
    S.guard.pose = (a) => { a.rs = 1.4; };
    S.guard.model.rightGrip?.add(blocks([[0.5, 0.5, 1.6, 0, 0, -0.6, 26, { shape: 'cyl', rx: 90 }]]));
    S.flicker = 0; S.nextFlick = 9;
  },
  start(F) { A.roomTone(0.12); F.sound(null, 'room'); F.at(2, () => F.say('Night Guard', "Whatever you do... don't take your eyes off them.", F.state.guard)); },
  update(F, dt, t) {
    const S = F.state, cam = F.E.world.camera;
    // the lights flicker - and in the dark, everything moves
    S.nextFlick -= dt;
    if (S.nextFlick <= 0) { S.flicker = rnd(0.35, 0.7); S.nextFlick = S.alarm || S.late ? rnd(2, 4) : rnd(5, 8); A.flicker(); F.E.env.apply({ skyColor: 0x000000, amb: [0x202430, 0x000000, 0.12], sun: [0x000000, 0], fog: [0x000000, 20, 90] }); S.moon.set(0); }
    if (S.flicker > 0) { S.flicker -= dt; if (S.flicker <= 0) { F.E.env.apply(museum.look); S.moon.set(40); } }
    if (S.alarm) S.moon.l?.color.set(Math.floor(t * 4) % 2 ? 0xff2020 : 0x8aa8ff);
    if (t < 7) return;
    cam.updateMatrixWorld(); const v = V();
    for (const s of S.statues) {
      // am I being watched?
      const c = s.centre; v.copy(c).project(cam);
      let seen = S.flicker <= 0 && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 && cam.position.distanceTo(c) < 140;
      if (seen) { const h = F.E.world.raycast(cam.position, c, { mask: GROUP.WORLD }); if (h && h.distance < cam.position.distanceTo(c) - 2.5) seen = false; }
      if (seen) { s.stop(); continue; }
      const tgt = F.nearest(s.centre, { outside: true, max: 90 });
      if (tgt) { const g = flat(tgt.rootPosition); g.z = Math.min(g.z, -12); s.walkTo(g, 24); s.pos.y = Math.max(0, s.pos.y - dt * 12); }
      for (const ch of F.chars({ outside: true })) if (s.touches(ch, 1.6)) { A.crunch(ch.rootPosition); F.kill(ch, 'was got by a statue'); }
    }
  },
  closing(F) { F.state.late = true; F.state.nextFlick = 0.5; F.say('Night Guard', 'The museum is closing. Do NOT blink.', F.state.guard); },
  botTick(F, bot) { if (F.state.late && bot.mode === 'out') bot.mode = 'return'; },
};

// --- the pizza party --------------------------------------------------------------------------------------------------------------------------------------------------
function bandFace(key, beak) { return faceTex('band' + key, (x, S) => { x.fillStyle = '#ffffff'; for (const s of [-1, 1]) { x.beginPath(); x.arc(S * (0.5 + s * 0.11), S * 0.4, S * 0.07, 0, 7); x.fill(); } x.fillStyle = '#1a1a1a'; for (const s of [-1, 1]) { x.beginPath(); x.arc(S * (0.5 + s * 0.11), S * 0.41, S * 0.035, 0, 7); x.fill(); } x.fillStyle = beak ? '#ff9a1a' : '#3a1a10'; x.beginPath(); if (beak) { x.moveTo(S * 0.4, S * 0.55); x.lineTo(S * 0.6, S * 0.55); x.lineTo(S * 0.5, S * 0.66); } else x.arc(S * 0.5, S * 0.56, S * 0.12, 0.1, Math.PI - 0.1); x.fill(); }); }
function evilFace(key) { return faceTex('evil' + key, (x, S) => { x.fillStyle = '#ff1a1a'; x.shadowColor = '#ff0000'; x.shadowBlur = 20; for (const s of [-1, 1]) { x.beginPath(); x.arc(S * (0.5 + s * 0.11), S * 0.41, S * 0.035, 0, 7); x.fill(); } x.shadowBlur = 0; x.fillStyle = '#1a1a1a'; x.beginPath(); x.arc(S * 0.5, S * 0.56, S * 0.13, 0.1, Math.PI - 0.1); x.fill(); x.fillStyle = '#ffffff'; for (let i = 0; i < 6; i++) x.fillRect(S * (0.39 + i * 0.038), S * 0.565, S * 0.02, S * 0.04); }); }
export const pizza = {
  id: 'pizza', name: 'Pizza Party', hint: "It's somebody's birthday! The band is playing. Have some pizza!", color: '#ffb02a', time: 36, music: 'birthday',
  look: { skyColor: 0x100804, amb: [0xfff0e0, 0x6a4a3a, 1.35], sun: [0xfff0e0, 0.4], fog: [0x100804, 200, 400] },
  bots: { venture: 0.85, spots: [[-14, -22], [14, -30], [-18, -46], [0, -40], [20, -36], [-10, -56]], area: [-24, -60, 24, -16] },
  lines: ['PIZZA', 'happy birthday!!', 'the ball pit', 'the band is kinda creepy', 'did the bear just look at me', 'cake!!', 'the lights went out'],
  build(F) {
    const S = F.state, H = 16;
    F.room({ x0: -32, x1: 32, z1: -80, h: H, floor: 1, wall: 24, ceiling: 26, frame: 21 });
    F.plane(tiled(checker('pizzaFloor', '#e8202a', '#f8f4ec'), 10, 11), 64, 71, [0, 0.03, -44.5], [-90, 0, 0]);
    const confetti = ctex('confettiWall', 128, 128, (x, w) => { x.fillStyle = '#ffd84a'; x.fillRect(0, 0, w, w); for (let i = 0; i < 40; i++) { x.fillStyle = pick(['#e8202a', '#2a6aff', '#2ac84a', '#c84aff']); x.beginPath(); x.arc(rnd(0, w), rnd(0, w), rnd(2, 5), 0, 7); x.fill(); } });
    for (const s of [-1, 1]) F.plane(tiled(confetti, 12, 2.6), 70, 13, [s * 31.9, 6.5, -44.5], [0, -s * 90, 0]);
    S.lamps = [F.light(V(-12, 13, -30), 0xfff0e0, 50, 40), F.light(V(12, 13, -50), 0xfff0e0, 50, 40)];
    // the stage, curtains, the band
    F.box(-20, 0, -80, 20, 3, -66, 192, { top: 'Smooth' });
    for (const s of [-1, 1]) F.box(s * 20 - 1, 0, -80, s * 20 + 1, H, -66, 104);
    F.box(-21, H - 3, -67, 21, H, -65, 104);
    F.sign(0, H - 1.5, -64.9, 18, 2.4, "★ PARTY TIME BAND ★", { bg: '#2a1a4a', fg: '#ffd84a', face: 'z', noBoard: true, glow: '#ffd84a' });
    const band = [
      { name: 'Bear', app: ALL(192), x: 0, hat: (h) => h.add(blocks([[0.7, 0.7, 0.3, -0.7, 0.75, 0, 192, { shape: 'ball' }], [0.7, 0.7, 0.3, 0.7, 0.75, 0, 192, { shape: 'ball' }], [1.2, 0.15, 1.2, 0, 0.62, 0, 26, { shape: 'cyl' }], [0.8, 1, 0.8, 0, 1.2, 0, 26, { shape: 'cyl' }]])), face: bandFace('bear') },
      { name: 'Bunny', app: ALL(104), x: -9, hat: (h) => h.add(blocks([[0.4, 2.2, 0.3, -0.35, 1.6, 0, 104], [0.4, 2.2, 0.3, 0.35, 1.6, 0, 104]])), face: bandFace('bunny') },
      { name: 'Chicken', app: ALL(24), x: 9, hat: (h) => h.add(blocks([[0.3, 0.6, 0.6, 0, 0.8, 0, 21]])), face: bandFace('chicken', true) },
    ];
    S.band = band.map((b, i) => { const p = F.puppet(b.app, { at: [b.x, 3, -73, Math.PI], faceTex: b.face, hat: b.hat, scale: 1.25, speed: 13 }); p.name = b.name; p.evil = evilFace(b.name); p.ph = i; p.pose = (a, t) => { const k = Math.floor(t * 2 + i) % 3; a.rs = [0.4, 1.8, 2.8][k]; a.ls = [2.2, 0.6, 1.2][(k + i) % 3]; }; return p; });
    F.add(blocks([[6, 3, 3, 0, 1.5, 0, 26], [5, 0.3, 1, 0, 3, -0.8, 1]])).position.set(-14, 3, -76);
    for (const x of [14]) F.add(blocks([[3, 2.4, 3, 0, 1.2, 0, 21, { shape: 'cyl' }], [2, 1.2, 2, 3, 0.6, 0, 23, { shape: 'cyl' }], [0.2, 4, 0.2, 2, 3, 2, 199]])).position.set(x, 3, -75);
    // party tables with hats and pizza; the birthday cake
    for (const [x, z] of [[-18, -28], [-18, -46], [0, -32], [0, -50], [16, -54]]) {
      F.box(x - 6, 3.2, z - 3, x + 6, 3.6, z + 3, 1); F.box(x - 0.6, 0, z - 0.6, x + 0.6, 3.2, z + 0.6, 199);
      for (let i = 0; i < 4; i++) F.add(blocks([[0.9, 1.6, 0.9, 0, 0.8, 0, pick([21, 23, 37, 104]), { shape: 'cone' }]])).position.set(x - 4.5 + i * 3, 3.6, z + (i % 2 ? 2 : -2));
    }
    S.slices = [];
    const pz = F.add(blocks([[6, 0.3, 6, 0, 0, 0, 24, { shape: 'cyl' }], [5.4, 0.32, 5.4, 0, 0.02, 0, 21, { shape: 'cyl' }], ...[[1, 1], [-1.4, 0.6], [0.4, -1.6], [-0.6, -0.4], [1.8, -0.8]].map(([x, z]) => [0.8, 0.12, 0.8, x, 0.2, z, 154, { shape: 'cyl' }])])); pz.position.set(0, 3.8, -32);
    F.pickup(V(0, 6, -32), 3.6, (ch) => F.bonus(ch, 'Pizza Time', 2), { keep: true });
    S.cake = F.add(blocks([[4, 2, 4, 0, 1, 0, 1, { shape: 'cyl' }], [3, 1.4, 3, 0, 2.6, 0, 223, { shape: 'cyl' }]])); S.cake.position.set(0, 3.6, -50);
    S.candles = [];
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28; F.add(blocks([[0.2, 1, 0.2, 0, 0.5, 0, pick([23, 21, 37])]])).position.set(Math.cos(a) * 1, 6.9, -50 + Math.sin(a) * 1); S.candles.push(F.flame(V(Math.cos(a) * 1, 7.9, -50 + Math.sin(a) * 1), 0.35)); }
    F.pickup(V(0, 7, -50), 3.6, (ch) => { F.bonus(ch, 'Made a Wish', 2); for (const c of S.candles) c.stop(); A.cheer(); F.say('Bear', 'HAPPY. BIRTHDAY.', S.band[0]); }, { keep: true });
    // the ball pit
    F.box(14, 0, -44, 30, 2.4, -43, 23); F.box(14, 0, -22, 30, 2.4, -21, 23); F.box(13, 0, -44, 14, 2.4, -21, 23);
    const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshPhongMaterial({ shininess: 80 }), 500);
    const m = new THREE.Matrix4(), cs = [0xe8202a, 0x2a6aff, 0x2ac84a, 0xffd84a, 0xc84aff].map((c) => new THREE.Color(c));
    for (let i = 0; i < 500; i++) { m.makeTranslation(rnd(14.6, 29.8), rnd(0.4, 2.2), rnd(-42.6, -22.4)); balls.setMatrixAt(i, m); balls.setColorAt(i, pick(cs)); }
    F.add(balls);
    F.every(0, () => { for (const ch of F.chars()) { const q = ch.rootPosition, inP = q.x > 14 && q.z > -43 && q.z < -22 && q.y < 6; if (inP && !ch.swimming) { ch.swimming = true; ch.walkSpeed = 9; } else if (!inP && ch.swimming) { ch.swimming = false; ch.walkSpeed = ch.npc ? 13 : 16; } } });
    F.sign(22, 6, -21.8, 8, 1.8, 'BALL PIT', { bg: '#2a6aff', fg: '#ffffff', face: 'z' });
  },
  update(F, dt, t) {
    const S = F.state;
    if (!S.dark) return;
    // they come off the stage - but only move in the dark
    S.flickT -= dt;
    if (S.flickT <= 0) { S.lightsOn = !S.lightsOn; S.flickT = S.lightsOn ? rnd(0.3, 0.6) : rnd(0.5, 0.9); for (const l of S.lamps) l.set(S.lightsOn ? 40 : 0); if (S.lightsOn) A.flicker(); }
    for (const b of S.band) {
      const tgt = F.nearest(b.centre, { outside: true, max: 120 });
      if (!S.lightsOn && tgt) { const g = flat(tgt.rootPosition); g.z = Math.min(g.z, -12); b.walkTo(g, 16); if (b.pos.y > 0) b.pos.y = Math.max(0, b.pos.y - dt * 8); } else b.stop();
      for (const ch of F.chars({ outside: true })) if (b.touches(ch, 1.6)) { A.scream(ch.rootPosition); F.kill(ch, `was hugged by ${b.name}`); }
    }
  },
  closing(F) {
    const S = F.state; S.dark = true; S.lightsOn = false; S.flickT = 0.6;
    F.E.cur.songPaused = true; A.stopSong('floor'); A.powerDown();
    F.E.env.apply({ skyColor: 0x000000, amb: [0x4a3a3a, 0x080404, 0.35], sun: [0x200000, 0.1], fog: [0x050202, 40, 140] });
    for (const l of S.lamps) l.set(0);
    for (const b of S.band) { b.setFace(b.evil); b.pose = (a, t, moving) => { if (moving) { a.rs = a.ls = 1.5; } else { a.rs = 1.5; a.ls = 0.2; } }; }
    A.playSong('floor', 'musicbox', 0.3);
    F.say('Bear', 'IT IS TIME. FOR. THE SURPRISE.', S.band[0]);
  },
  botTick(F, bot) { if (F.state.dark && bot.mode === 'out') bot.mode = 'return'; },
};
void DOOR_Z; void clamp; void liveTex;
