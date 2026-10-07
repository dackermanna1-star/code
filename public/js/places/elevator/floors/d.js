// Floors: the robot factory, the library, the retro arcade, the dinosaur park, the big top.
import * as THREE from 'three';
import { V, rnd, pick, clamp, ctex, liveTex, blocks, tiled, DOOR_Z, FACES, faceTex, plastic } from '../kit.js';
import * as A from '../audio.js';

const ALL = (c) => ({ head: c, torso: c, leftArm: c, rightArm: c, leftLeg: c, rightLeg: c });
const DRESS = (skin, top, legs) => ({ colors: { head: skin, torso: top, leftArm: skin, rightArm: skin, leftLeg: legs, rightLeg: legs } });
const flat = (p) => V(p.x, 0, p.z);

// --- the robot factory ----------------------------------------------------------------------------------------------------------------------------------------
function beltTex() {
  return ctex('belt', 64, 64, (x, w, h) => { x.fillStyle = '#26262a'; x.fillRect(0, 0, w, h); x.fillStyle = '#3a3a40'; for (let i = 0; i < 4; i++) x.fillRect(0, i * 16, w, 6); x.fillStyle = '#c8a020'; x.fillRect(0, 0, 4, h); x.fillRect(w - 4, 0, 4, h); });
}
const ROBOT = { colors: { head: 199, torso: 194, leftArm: 199, rightArm: 199, leftLeg: 26, rightLeg: 26 } };
export const factory = {
  id: 'factory', name: 'Robot Factory', hint: "Mind the presses. Don't ride the belt into the shredder.", color: '#ffb02a', time: 34,
  look: { skyColor: 0x0a0a0c, amb: [0xe0e4f0, 0x404048, 1.15], sun: [0xfff0d8, 0.55], fog: [0x15151a, 120, 300] },
  bots: { venture: 0.6, spots: [[0, -22], [-5, -36], [5, -50], [0, -66], [-24, -30], [24, -44], [0, -74]], area: [-7, -72, 7, -16] },
  lines: ['robots!!', 'beep boop', 'dont touch the press', 'the shredder lol', 'i rode the belt', 'they are looking at me', 'MALFUNCTION'],
  build(F) {
    const X0 = -30, X1 = 30, Z1 = -84, H = 24, S = F.state;
    F.room({ x0: X0, x1: X1, z1: Z1, h: H, floor: 199, wall: 194, ceiling: 26, frame: 24 });
    for (const x of [-9, 9]) F.box(x - 0.5, 0.01, Z1, x + 0.5, 0.05, DOOR_Z - 2, 24, { canCollide: false });
    for (let z = -20; z > Z1; z -= 16) { F.box(X0, H - 3, z - 0.6, X1, H - 2, z + 0.6, 199); F.box(-12, H - 3.3, z - 0.4, 12, H - 3, z + 0.4, 1, { material: 'Neon', canCollide: false }); }
    S.lamps = [[-14, -30], [14, -50], [0, -72]].map(([x, z]) => F.light(V(x, 16, z), 0xfff0d8, 60, 40));
    // the belts: one brings robots toward the doors, the other takes them away to be shredded
    S.belts = [];
    for (const [x, dir] of [[-16, 1], [16, -1]]) {
      const p = F.part({ name: 'Conveyor', size: [7, 1.6, 58], position: [x, 0.8, -50], color: 26, top: 'Smooth' });
      p.surfaceVelocity = V(0, 0, 10 * dir);
      const pl = F.plane(tiled(beltTex(), 1, 14), 7, 58, [x, 1.62, -50], [-90, 0, 0]);
      S.belts.push({ p, pl, dir, x });
      for (let z = -77; z < -21; z += 8) F.box(x - 3.9, 0, z - 0.3, x - 3.5, 1.7, z + 0.3, 24);
      // robot torsos riding along
      for (let i = 0; i < 7; i++) { const r = F.add(blocks([[2, 2, 1, 0, 1, 0, 194], [1.2, 1.2, 1.2, 0, 2.6, 0, 199], [0.8, 0.2, 0.1, 0, 2.7, -0.62, 21, { emissive: 1 }]])); r.position.set(x, 1.6, -78 + i * 8.4); r.userData.belt = dir; S.belts[S.belts.length - 1].items ||= []; S.belts[S.belts.length - 1].items.push(r); }
    }
    // the crate at the end of the first belt
    F.box(-20.5, 0, -20.6, -11.5, 3, -20, 192); F.box(-20.5, 0, -14, -11.5, 3, -13.4, 192); F.box(-21.1, 0, -20.6, -20.5, 3, -13.4, 192); F.box(-11.5, 0, -20.6, -10.9, 3, -13.4, 192);
    for (let i = 0; i < 6; i++) F.add(blocks([[1.2, 1.2, 1.2, 0, 0, 0, 199]])).position.set(rnd(-19.5, -12.5), 1.8, rnd(-19.5, -14.5));
    // the shredder at the end of the second
    F.box(11, 0, -84, 21, 9, -79.5, 194); F.box(11, 0, -79.5, 12, 9, -78, 194); F.box(20, 0, -79.5, 21, 9, -78, 194); F.box(11, 5, -79.5, 21, 9, -78, 194);
    F.sign(16, 7, -77.9, 7, 1.8, '⚠ SHREDDER ⚠', { bg: '#f4cc20', fg: '#111', face: 'z', border: '#111', noBoard: true });
    S.rollers = [];
    for (const [y, z] of [[2.6, -78.8], [4.2, -79.6]]) { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 7.6, 12).rotateZ(Math.PI / 2), plastic(199))); for (let i = 0; i < 10; i++) { const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.6), plastic(194)); const a = i / 10 * Math.PI * 2; tooth.position.set(-3.4 + (i % 5) * 1.7, Math.cos(a) * 1, Math.sin(a) * 1); tooth.rotation.x = a; g.add(tooth); } g.position.set(16, y, z); F.add(g); S.rollers.push(g); }
    F.zone(12, -1, -82, 20, 5.5, -77.6, (ch) => { if (!ch.shredded) { ch.shredded = true; A.crunch(ch.rootPosition); A.crunch(ch.rootPosition); F.burst('spark', ch.rootPosition, 20, { speed: [6, 18], size: [0.2, 0.4], life: [0.2, 0.5] }); } F.kill(ch, 'went through the shredder'); });
    // the presses over the first belt
    S.presses = [];
    for (const [z, off] of [[-40, 0], [-60, 1.6]]) {
      for (const s of [-1, 1]) F.box(-16 + s * 4.6 - 0.6, 0, z - 0.6, -16 + s * 4.6 + 0.6, 16, z + 0.6, 24);
      F.box(-21.2, 16, z - 1.4, -10.8, 18, z + 1.4, 24);
      const head = F.add(blocks([[6.4, 2, 6.4, 0, 1, 0, 199], [1.4, 6, 1.4, 0, 5, 0, 194], [1, 0.4, 1, 2.6, 2.2, 2.6, 21, { name: 'lamp' }]]));
      head.position.set(-16, 11, z);
      S.presses.push({ head, z, off, y: 11, hit: false });
    }
    F.sign(-16, 20, -50, 10, 1.6, 'KEEP CLEAR OF PRESSES', { bg: '#c4281c', fg: '#ffffff', face: 'z' });
    // welding arms over the second belt
    S.arms = [];
    for (const z of [-34, -56]) { const g = new THREE.Group(); g.add(blocks([[2, 2, 2, 0, 0, 0, 24], [0.8, 6, 0.8, 0, 3, 0, 24], [0.6, 4, 0.6, 0, 6, -1.8, 24, { rx: 50 }], [0.4, 0.4, 0.8, 0, 7, -3.4, 199]])); g.position.set(21, 0, z); F.add(g); S.arms.push(g); }
    // quality control: stand on the pad, get stamped
    F.box(-2.5, 0, -79, 2.5, 0.3, -74, 24, { top: 'Smooth' });
    F.sign(0, 15, Z1 + 0.4, 12, 3, 'QUALITY CONTROL', { bg: '#1a1a1a', fg: '#7cf07c', face: 'z', glow: '#7cf07c' });
    for (const s of [-1, 1]) F.box(s * 3.4 - 0.4, 0, -77, s * 3.4 + 0.4, 14, -76, 199);
    F.box(-3.8, 14, -77.4, 3.8, 15, -75.6, 199);
    S.stamp = F.add(blocks([[4.4, 1.2, 4.4, 0, 0, 0, 21], [1, 4, 1, 0, 2.6, 0, 199]])); S.stamp.position.set(0, 12.4, -76.5);
    S.stampT = new Map();
    // the robots, marching round
    S.robots = [];
    const loop = [V(-6, 0, -24), V(-6, 0, -70), V(6, 0, -70), V(6, 0, -24)];
    for (let i = 0; i < 5; i++) {
      const r = F.puppet(ROBOT, { at: [0, 0, -24, 0], faceTex: FACES.robot(), speed: 7, hat: (h) => h.add(blocks([[0.2, 1, 0.2, 0, 1, 0, 199], [0.4, 0.4, 0.4, 0, 1.6, 0, 21, { shape: 'ball', emissive: 1 }]])) });
      const seg = i % 4, k = rnd(0, 1); r.place(...loop[seg].clone().lerp(loop[(seg + 1) % 4], k).toArray()); r.leg = (seg + 1) % 4; r.walkTo(loop[r.leg]);
      r.onArrive = () => { if (!S.mad) { r.leg = (r.leg + 1) % 4; r.walkTo(loop[r.leg]); } };
      r.pose = (a, t, moving) => { if (S.mad) { a.rs = a.ls = 1.6; return; } if (moving) { a.rs = a.ls = Math.sin(t * 6) * 0.3; } };
      S.robots.push(r);
    }
  },
  start(F) { A.machine(0.25); F.sound(null, 'machine'); },
  update(F, dt, t) {
    const S = F.state, k = S.mad ? 2 : 1;
    for (const b of S.belts) {
      b.pl.material.map.offset.y = (b.pl.material.map.offset.y + dt * b.dir * 10 * k / 4.14) % 1;
      b.p.surfaceVelocity.z = 10 * b.dir * k;
      for (const r of b.items) {
        r.position.z += dt * 10 * k * b.dir;
        if (b.dir > 0 && r.position.z > -21) { r.position.z -= 58; A.thud(V(b.x, 2, -20), 2); }
        if (b.dir < 0 && r.position.z < -78.5) { r.position.z += 58; A.crunch(V(16, 3, -79)); F.burst('spark', V(16, 3.5, -79), 8, { speed: [4, 12], size: [0.15, 0.3], life: [0.2, 0.4], dir: V(0, 1, 1), cone: 0.8 }); }
      }
    }
    for (const r of S.rollers) r.rotation.x -= dt * 6 * k;
    for (const [i, g] of S.arms.entries()) { g.rotation.y = Math.PI / 2 + Math.sin(t * 1.3 + i) * 0.6; if (Math.random() < dt * 5) F.burst('spark', g.localToWorld(V(0, 7, -3.4)), 5, { speed: [3, 10], size: [0.1, 0.25], life: [0.15, 0.4] }); }
    // the presses: up, a warning, BANG
    for (const p of S.presses) {
      const ph = ((t + p.off) % 3.2) / 3.2;
      let y;
      if (ph < 0.5) y = 11; else if (ph < 0.56) y = 11 - (ph - 0.5) / 0.06 * 9.4; else if (ph < 0.72) y = 1.6; else y = 1.6 + (ph - 0.72) / 0.28 * 9.4;
      if (y <= 1.6 && !p.hit) { p.hit = true; A.stomp(V(-16, 2, p.z)); F.shake(0.15); F.burst('dust', V(-16, 2, p.z), 6, { speed: [3, 8], size: [1, 2], life: [0.4, 0.8], gravity: 0.2 }); }
      if (ph < 0.5) p.hit = false;
      p.head.position.y = y;
      p.head.children[2].material = ph > 0.34 && ph < 0.56 && Math.floor(t * 10) % 2 ? plastic(21, { emissive: 1 }) : plastic(21);
      if (y < 7 && ph >= 0.5 && ph < 0.72) for (const ch of F.chars()) { const q = ch.rootPosition; if (Math.abs(q.x + 16) < 3.6 && Math.abs(q.z - p.z) < 3.6 && q.y - 3 < y + 0.2) F.kill(ch, 'was flattened by a hydraulic press'); }
    }
    // quality control
    if (S.stampAnim > 0) { S.stampAnim -= dt; S.stamp.position.y = 12.4 - Math.sin(Math.min(1, (0.6 - S.stampAnim) / 0.6) * Math.PI) * 6; }
    for (const ch of F.chars()) {
      const q = ch.rootPosition, on = Math.abs(q.x) < 2.5 && q.z < -74 && q.z > -79 && q.y < 4.5;
      const n = on ? (S.stampT.get(ch) || 0) + dt : 0; S.stampT.set(ch, on ? n : 0);
      if (on && n > 1 && ch.stamped !== F) {
        ch.stamped = F; S.stampAnim = 0.6; A.thud(V(0, 8, -76.5), 1.5);
        if (!S.approved) { S.approved = true; F.bonus(ch, 'Quality Approved', 2); if (ch.player?.isLocal) F.E.ui.flash('#7cf07c', 0.5); }
        else if (ch.player?.isLocal) { F.E.ui.toast('REJECTED. (Too squishy.)', '#ff5a5a', 'rgba(80,10,20,.9)'); A.errorSound(); }
      }
    }
    // malfunction: the robots come for you
    if (S.mad) {
      for (const r of S.robots) {
        const tgt = F.nearest(r.pos.clone().add(V(0, 3, 0)), { outside: true, max: 90 });
        if (tgt) { const g = flat(tgt.rootPosition); g.z = Math.min(g.z, -13); r.walkTo(g, 15); } else r.stop();
        for (const ch of F.chars({ outside: true })) if (r.touches(ch, 1.8)) { A.zap(ch.rootPosition); F.kill(ch, 'was disassembled by a robot'); }
      }
      S.alarmT = (S.alarmT || 0) - dt;
      if (S.alarmT <= 0) { S.alarmT = 0.5; S.red = !S.red; for (const l of S.lamps) if (l.l) { l.l.color.set(S.red ? 0xff2010 : 0x400000); } }
    }
  },
  closing(F) {
    const S = F.state; S.mad = true;
    A.alarmBell(0.25); F.sound(null, 'alarm');
    F.say('Intercom', 'WARNING. MALFUNCTION. ALL UNITS: REMOVE THE HUMANS.', V(0, 18, -40));
    for (const r of S.robots) { r.setFace(faceTex('robotMad', (x, s) => { x.fillStyle = '#ff0000'; x.shadowColor = '#ff0000'; x.shadowBlur = 16; x.fillRect(s * 0.3, s * 0.36, s * 0.14, s * 0.08); x.fillRect(s * 0.56, s * 0.36, s * 0.14, s * 0.08); x.fillStyle = '#222'; x.shadowBlur = 0; for (let i = 0; i < 5; i++) x.fillRect(s * (0.36 + i * 0.06), s * 0.6, s * 0.03, s * 0.06); })); }
    F.E.game.players.forEach((p) => { if (p.brain && Math.random() < 0.35) F.E.world.delay(rnd(0.4, 1.4), () => p.brain.say(pick(['RUN', 'the robots!!', 'uh oh', 'ROBOT UPRISING']))); });
  },
  botTick(F, bot) { if (F.state.mad && bot.mode === 'out') bot.mode = 'return'; },
};

// --- the library -----------------------------------------------------------------------------------------------------------------------------------------------------
function booksTex() {
  return ctex('books', 256, 256, (x, w, h) => {
    x.fillStyle = '#3a2412'; x.fillRect(0, 0, w, h);
    const cols = ['#7a1a1a', '#1a3a6a', '#2a5a2a', '#6a4a1a', '#4a1a4a', '#8a6a2a', '#1a1a1a', '#a85a1a', '#2a4a5a'];
    for (let row = 0; row < 4; row++) {
      const y1 = row * 64 + 60; let px = 2;
      x.fillStyle = '#5a3a1a'; x.fillRect(0, y1, w, 4);
      while (px < w - 4) { const bw = rnd(6, 14), bh = rnd(38, 54); x.fillStyle = pick(cols); x.fillRect(px, y1 - bh, bw - 1, bh); x.fillStyle = 'rgba(230,200,120,0.7)'; x.fillRect(px + 1, y1 - bh + 6, bw - 3, 2); x.fillRect(px + 1, y1 - 10, bw - 3, 2); px += bw; if (Math.random() < 0.05) px += 10; }
    }
  });
}
export const library = {
  id: 'library', name: 'The Library', hint: 'Shhh. No talking. No jumping. No fun.', color: '#d8b88a', time: 34,
  look: { skyColor: 0x100a06, amb: [0xffe8c8, 0x5a4030, 1.2], sun: [0xffe0b0, 0.45], fog: [0x1a120a, 90, 220] },
  bots: { venture: 0.55, spots: [[-10, -24], [10, -36], [-16, -48], [16, -60], [0, -48], [-4, -72]], area: [-24, -74, 24, -18] },
  lines: ['shh', 'shhh', '...', 'shh dont talk', 'shhhhh'],
  build(F) {
    const X0 = -30, X1 = 30, Z1 = -80, H = 24, S = F.state;
    F.room({ x0: X0, x1: X1, z1: Z1, h: H, floor: 154, wall: 192, ceiling: 192, frame: 24 });
    const bt = booksTex();
    // shelves: rows across the room, and along the walls
    for (const z of [-34, -46, -58, -70]) for (const [a, b] of [[-26, -5], [5, 26]]) {
      F.box(a, 0, z - 1.4, b, 17, z + 1.4, 192);
      for (const s of [-1, 1]) F.plane(tiled(bt, (b - a) / 8, 2), b - a - 0.4, 16, [(a + b) / 2, 8.4, z + s * 1.42], [0, s < 0 ? 180 : 0, 0]);
    }
    for (const s of [-1, 1]) { F.box(s * 29, 0, Z1, s * 30, 20, -14, 192); F.plane(tiled(bt, 8, 2.5), 64, 19, [s * 28.95, 9.8, -47], [0, -s * 90, 0]); }
    // the rolling ladder up to the top of a shelf - and the overdue book up there
    F.box(-15, 0, -56.4, -13, 17, -56, 192, { tags: ['climbable'], transparency: 1 });
    for (let y = 1; y < 17; y += 1.4) F.box(-15, y, -56.3, -13, y + 0.25, -56, 24, { canCollide: false });
    for (const x of [-15, -13]) F.box(x - 0.15, 0, -56.4, x + 0.15, 17.5, -56.1, 24, { canCollide: false });
    S.book = F.add(blocks([[1.6, 0.5, 2.2, 0, 0, 0, 21, { emissive: 0.5 }], [1.4, 0.4, 2.1, 0.12, 0, 0, 1]])); S.book.position.set(-14, 17.6, -58);
    S.bookLight = F.light(V(-14, 19, -58), 0xffe080, 24, 10);
    F.pickup(S.book, 3, (ch) => { S.bookLight.set(0); F.bonus(ch, 'Overdue Book', 3); F.say('Librarian', 'That book is forty-seven years overdue.', S.lib); }, { offset: V(0, 2, 0) });
    // the desk, the librarian, reading tables with green lamps, a clock
    F.box(10, 0, -20, 22, 4, -17, 192); F.box(9.8, 4, -20.2, 22.2, 4.3, -16.8, 24);
    F.add(blocks([[1, 0.2, 1, 0, 0, 0, 24], [0.7, 0.7, 0.1, 0, 0.5, 0, 24]])).position.set(12, 4.4, -18);
    S.lib = F.puppet(DRESS(24, 104, 26), { at: [16, 0, -21.5, Math.PI], faceTex: FACES.glasses(), hat: (h) => h.add(blocks([[1.3, 0.6, 1.3, 0, 0.6, 0.15, 25, { shape: 'ball' }], [0.7, 0.7, 0.7, 0, 0.8, 0.6, 25, { shape: 'ball' }]])) });
    S.lib.pose = (a, t) => { a.rs = S.shush > 0 ? 2.2 : 0.2; a.ls = 0.2; };
    for (const [x, z] of [[-14, -22], [-14, -28]]) {
      F.box(x - 6, 3.4, z - 2, x + 6, 3.8, z + 2, 192); for (const [dx, dz] of [[-5.5, -1.5], [5.5, -1.5], [-5.5, 1.5], [5.5, 1.5]]) F.box(x + dx - 0.2, 0, z + dz - 0.2, x + dx + 0.2, 3.4, z + dz + 0.2, 192);
      for (const dx of [-3, 3]) F.add(blocks([[0.6, 0.2, 0.6, 0, 0, 0, 24], [0.15, 1.4, 0.15, 0, 0.7, 0, 24], [1.6, 0.6, 0.8, 0, 1.5, 0, 28, { shape: 'cyl', emissive: 0.6 }]])).position.set(x + dx, 3.9, z);
    }
    F.light(V(-14, 6, -25), 0xffe8b0, 40, 22);
    F.add(blocks([[3, 14, 2, 0, 7, 0, 192], [2.2, 2.2, 0.2, 0, 11, -1.05, 1, { shape: 'cyl', rx: 90 }], [0.2, 4, 0.2, 0, 5, -1.1, 24]])).position.set(26, 0, -24);
    F.sign(0, 21, Z1 + 0.6, 14, 2.6, 'SILENCE PLEASE', { bg: '#2a1a0a', fg: '#e8c878', face: 'z', border: '#e8c878' });
    F.sign(X0 + 1.2, 13, -26, 6, 2, 'QUIET', { bg: '#2a1a0a', fg: '#e8c878', face: 'x' });
    S.strikes = new Map(); S.jumps = new Map(); S.falling = []; S.cool = new Map(); S.shush = 0;
  },
  start(F) {
    A.roomTone(0.2); F.sound(null, 'room');
    for (const ch of F.E.world.characters) F.state.jumps.set(ch, ch.jumpedAt);
    F.every(1, () => A.tone(1800, 0.03, { type: 'square', vol: 0.03, pos: V(26, 11, -24) }));
  },
  update(F, dt, t) {
    const S = F.state;
    S.shush -= dt;
    // the librarian hears everything
    for (const ch of F.chars({ outside: true })) {
      if (ch.jumpedAt && S.jumps.has(ch) && ch.jumpedAt !== S.jumps.get(ch)) noise(F, ch);
      S.jumps.set(ch, ch.jumpedAt);
    }
    // books falling on the noisy
    for (const b of [...S.falling]) {
      b.v += 120 * dt; b.m.position.y -= b.v * dt;
      if (b.ch.alive && b.m.position.y > b.ch.rootPosition.y + 6) { b.m.position.x += (b.ch.rootPosition.x - b.m.position.x) * Math.min(1, dt * 8); b.m.position.z += (b.ch.rootPosition.z - b.m.position.z) * Math.min(1, dt * 8); }
      for (const ch of F.chars()) if (Math.abs(ch.rootPosition.x - b.m.position.x) < 4 && Math.abs(ch.rootPosition.z - b.m.position.z) < 5 && b.m.position.y < ch.rootPosition.y + 3 && b.m.position.y > ch.rootPosition.y - 4) F.kill(ch, 'was shushed. Permanently.', b.m.position.clone());
      if (b.m.position.y < 1) { b.m.position.y = 1; A.thud(b.m.position, 0.6); F.shake(0.4); F.burst('dust', b.m.position.clone(), 12, { speed: [4, 12], size: [1, 2], life: [0.6, 1.2], gravity: 0.1 }); S.falling.splice(S.falling.indexOf(b), 1); }
    }
    // closing time: the lights go out, from the back
    if (S.flying) for (const f of S.flying) { f.m.position.addScaledVector(f.v, dt); f.m.rotation.x += dt * 6; f.m.rotation.z += dt * 4; f.v.y -= 10 * dt; }
  },
  chatted(F, p, text) { const ch = p.character; if (ch?.alive && F.outside(ch) && !/^\s*sh+\b/i.test(text)) noise(F, ch); },
  closing(F) {
    const S = F.state;
    F.say('Librarian', 'The library is now closed. Please return all books.', S.lib);
    A.powerDown(); F.E.env.apply({ skyColor: 0x050302, amb: [0xc0a080, 0x201008, 0.5], sun: [0xffe0b0, 0.1], fog: [0x050302, 40, 120] });
    S.flying = [];
    for (let i = 0; i < 14; i++) { const m = F.add(blocks([[1.4, 2, 0.4, 0, 0, 0, pick([21, 23, 28, 24, 104])]])); m.position.set(rnd(-24, 24), rnd(4, 14), pick([-34, -46, -58, -70]) + 1.6); S.flying.push({ m, v: V(rnd(-6, 6), rnd(2, 8), rnd(4, 14)) }); }
    A.whispers(0.15); F.sound(null, 'whisper');
  },
  botTick(F, bot) { if (F.state.strikes.get(bot.ch) && bot.jumpT < 20) bot.jumpT = 30; },
};
function noise(F, ch) {
  const S = F.state, t = F.t;
  if (t - (S.cool.get(ch) || -9) < 1.2) return;
  S.cool.set(ch, t);
  const n = (S.strikes.get(ch) || 0) + 1; S.strikes.set(ch, n);
  S.shush = 1.2; A.shh(S.lib.head);
  const who = ch.player?.name || ch.npc?.name || 'you';
  if (n === 1) F.say('Librarian', pick([`Shh!`, `Shhh! ${who}, this is a library.`, 'Shh. Please.']), S.lib);
  else if (n === 2) F.say('Librarian', `SHHHHH! Last warning, ${who}.`, S.lib);
  else if (n === 3) {
    F.say('Librarian', 'That. Is. IT.', S.lib);
    const m = F.add(blocks([[7, 1.8, 9, 0, 0, 0, 21], [6.6, 1.5, 8.8, 0.3, 0, 0, 1], [7, 0.1, 2, 0, 0.95, -2, 24]]));
    m.position.copy(ch.rootPosition).add(V(0, 40, 0)); m.rotation.y = rnd(0, 6);
    S.falling.push({ m, ch, v: 0 }); A.whoosh(m.position);
  }
  if (ch.player?.isLocal && n < 3) F.E.ui.toast(n === 1 ? 'Shh! The librarian heard you.' : 'Shh!! One more noise and...', '#e8c878', 'rgba(50,30,10,.92)');
}

// --- the retro arcade --------------------------------------------------------------------------------------------------------------------------------------------
function screenGame(kind, x, w, h, t) {
  x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
  if (kind === 0) { // pong
    x.fillStyle = '#fff'; for (let y = 0; y < h; y += 10) x.fillRect(w / 2 - 1, y, 2, 5);
    const bx = w / 2 + Math.sin(t * 2.1) * (w / 2 - 14), by = h / 2 + Math.sin(t * 3.3) * (h / 2 - 8);
    x.fillRect(bx - 3, by - 3, 6, 6); x.fillRect(6, by - 14 + Math.sin(t * 5) * 4, 4, 28); x.fillRect(w - 10, by - 14 - Math.sin(t * 4) * 4, 4, 28);
    x.font = 'bold 16px monospace'; x.fillText(String(Math.floor(t / 3) % 10), w / 2 - 24, 18); x.fillText(String(Math.floor(t / 4) % 10), w / 2 + 14, 18);
  } else if (kind === 1) { // invaders
    const ox = Math.sin(t) * 14;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) { x.fillStyle = ['#ff4a4a', '#ffd84a', '#4aff8a', '#4ac8ff'][r]; const px = 16 + c * 16 + ox, py = 10 + r * 12 + (Math.floor(t * 2) % 2) * 2; x.fillRect(px, py, 10, 6); x.fillRect(px + 2, py + 6, 2, 2); x.fillRect(px + 6, py + 6, 2, 2); }
    x.fillStyle = '#4aff4a'; x.fillRect(w / 2 + Math.sin(t * 1.7) * 40 - 6, h - 12, 12, 6); x.fillRect(w / 2 + Math.sin(t * 1.7) * 40 - 1, h - 20 - ((t * 60) % 50), 2, 5);
  } else { // a maze game
    x.strokeStyle = '#2a4aff'; x.lineWidth = 3; x.strokeRect(6, 6, w - 12, h - 12); x.strokeRect(30, 26, w - 60, h - 52);
    x.fillStyle = '#ffd84a'; const a = t * 1.5, px = w / 2 + Math.cos(a) * (w / 2 - 18), py = h / 2 + Math.sin(a) * (h / 2 - 16);
    x.beginPath(); x.moveTo(px, py); x.arc(px, py, 7, a + 1.57 + 0.6 * Math.abs(Math.sin(t * 12)), a + 1.57 - 0.6 * Math.abs(Math.sin(t * 12)) + Math.PI * 2); x.fill();
    x.fillStyle = '#ff3a3a'; const g = a - 0.8; x.fillRect(w / 2 + Math.cos(g) * (w / 2 - 18) - 6, h / 2 + Math.sin(g) * (h / 2 - 16) - 6, 12, 12);
  }
}
function ghostModel(color) {
  const mat = new THREE.MeshPhongMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(0.35), shininess: 30 });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(3, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat));
  const body = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 3.4, 18, 1, true), mat); body.position.y = -1.7; g.add(body);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const c = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.4, 8).rotateX(Math.PI), mat); c.position.set(Math.cos(a) * 2.3, -4, Math.sin(a) * 2.3); g.add(c); }
  const eyes = blocks([[1.4, 1.8, 0.6, -1.1, 0.4, -2.6, 1, { shape: 'ball' }], [1.4, 1.8, 0.6, 1.1, 0.4, -2.6, 1, { shape: 'ball' }], [0.7, 0.7, 0.4, -1.1, 0.2, -2.9, 23, { shape: 'ball' }], [0.7, 0.7, 0.4, 1.1, 0.2, -2.9, 23, { shape: 'ball' }]]);
  g.add(eyes); g.userData.mat = mat; g.userData.color = color;
  return g;
}
export const arcade = {
  id: 'arcade', name: 'Retro Arcade', hint: 'Eat the dots. Avoid the ghosts. Big dots fight back.', color: '#ff4adc', time: 36, music: 'arcade',
  look: { skyColor: 0x05030a, amb: [0xa88aff, 0x1a0a2a, 0.9], sun: [0xc0a0ff, 0.3], fog: [0x0a0614, 100, 240] },
  bots: { venture: 0.8, spots: [[-12, -30], [12, -36], [-8, -50], [8, -62], [0, -44], [-20, -20], [22, -70]], area: [-16, -74, 16, -26] },
  lines: ['ARCADE', 'eat the dots', 'wakka wakka', 'GHOST', 'i got the big dot', 'high score!!', 'claw machine is rigged'],
  build(F) {
    const X0 = -34, X1 = 34, Z1 = -86, H = 20, S = F.state;
    F.room({ x0: X0, x1: X1, z1: Z1, h: H, floor: 26, wall: 26, ceiling: 26, frame: 104 });
    const carpet = ctex('arcadeCarpet', 128, 128, (x, w) => { x.fillStyle = '#0a0618'; x.fillRect(0, 0, w, w); const c = ['#ff2a8a', '#2affd0', '#ffd02a', '#8a2aff']; for (let i = 0; i < 26; i++) { x.strokeStyle = pick(c); x.lineWidth = 3; x.beginPath(); const px = rnd(0, w), py = rnd(0, w); if (Math.random() < 0.5) x.arc(px, py, rnd(4, 9), 0, 7); else { x.moveTo(px, py); x.lineTo(px + rnd(-14, 14), py + rnd(-14, 14)); } x.stroke(); } });
    F.plane(tiled(carpet, 14, 16), 68, 76, [0, 0.03, -48], [-90, 0, 0], { basic: true, transparent: false });
    for (const [y, c] of [[2, 104], [16, 21]]) for (const s of [-1, 1]) F.box(s * 33.8 - 0.2, y, Z1, s * 33.8 + 0.2, y + 0.4, DOOR_Z - 1, c, { material: 'Neon', canCollide: false });
    F.sign(0, 15, Z1 + 0.5, 22, 4, 'ARCADE', { bg: '#0a0618', fg: '#ff4adc', face: 'z', glow: '#ff4adc', noBoard: true, font: 'Impact, Arial Black' });
    // cabinets along the walls, with live screens
    S.screens = [0, 1, 2].map(() => liveTex(128, 96));
    const cab = (x, z, face, i) => {
      const yaw = { x: -90, '-x': 90, z: 180 }[face];
      const g = blocks([[4, 9, 3.6, 0, 4.5, 0, pick([21, 23, 26, 104, 28])], [4.2, 1.6, 3.8, 0, 9.4, 0, 26], [3.6, 0.3, 1.2, 0, 4, -2.2, 26]]);
      g.position.set(x, 0, z); g.rotation.y = (yaw || 0) * Math.PI / 180; F.add(g);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.4), new THREE.MeshBasicMaterial({ map: S.screens[i % 3].tex }));
      scr.position.set(0, 6.6, -1.82); g.add(scr);
      const mq = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 1.2), new THREE.MeshBasicMaterial({ color: pick([0xff4adc, 0x4affd8, 0xffd84a]) })); mq.position.set(0, 9.4, -1.92); g.add(mq);
      F.box(x - 2.2, 0, z - 2.2, x + 2.2, 9, z + 2.2, 26, { transparency: 1 });
    };
    let i = 0;
    for (let z = -16; z > -80; z -= 6) { cab(X0 + 2.4, z, 'x', i++); cab(X1 - 2.4, z, '-x', i++); }
    for (const x of [-26, -20, 20, 26]) cab(x, Z1 + 2.4, 'z', i++);
    // the ghost house at the back
    F.box(-8, 0, Z1, 8, 8, Z1 + 4, 104); F.box(-4, 0, Z1 + 3.9, 4, 6, Z1 + 4.1, 26, { canCollide: false });
    F.sign(0, 9.5, Z1 + 4.1, 10, 1.6, 'GHOST HOUSE', { bg: '#0a0618', fg: '#ff3a3a', face: 'z', glow: '#ff3a3a', noBoard: true });
    // the dots: a grid on the floor; four big ones in the corners
    const pos = [];
    for (let px = -16; px <= 16; px += 4) for (let pz = -26; pz >= -74; pz -= 4) pos.push([px, pz]);
    S.big = [[-16, -26], [16, -26], [-16, -74], [16, -74]];
    S.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }), pos.length);
    const m = new THREE.Matrix4();
    S.dotPos = pos.map(([x, z], k) => { const big = S.big.some(([a, b]) => a === x && b === z); m.makeScale(big ? 3 : 1, big ? 3 : 1, big ? 3 : 1).setPosition(x, 1.4, z); S.dots.setMatrixAt(k, m); return { x, z, big, eaten: false }; });
    F.add(S.dots); S.eatCount = new Map(); S.wakka = 0;
    // the claw machine
    F.box(-26, 0, -20, -20, 3, -14, 104); F.box(-26, 3, -20, -20, 10, -14, 42, { transparency: 0.7 }); F.box(-26.2, 10, -20.2, -19.8, 11, -13.8, 104);
    for (let k = 0; k < 9; k++) F.add(blocks([[1.4, 1.4, 1.4, 0, 0, 0, pick([21, 23, 24, 104, 28]), { shape: 'ball' }]])).position.set(rnd(-25.2, -20.8), 3.7 + rnd(0, 0.6), rnd(-19.2, -14.8));
    S.claw = F.add(blocks([[0.3, 3, 0.3, 0, 1.5, 0, 199], [1.6, 0.4, 0.3, 0, 0, 0, 199], [0.3, 1, 0.3, -0.7, -0.5, 0, 199], [0.3, 1, 0.3, 0.7, -0.5, 0, 199]])); S.claw.position.set(-23, 8, -17);
    F.sign(-23, 12, -13.75, 6, 1.4, 'CLAW-O-MATIC', { bg: '#ffd84a', fg: '#c4281c', face: 'z', noBoard: true });
    S.clawT = new Map();
    S.ghosts = [];
  },
  update(F, dt, t) {
    const S = F.state;
    if (Math.floor(t * 15) !== S.frame) { S.frame = Math.floor(t * 15); S.screens.forEach((s, k) => s.redraw((x, w, h) => screenGame(k, x, w, h, t + k * 3))); }
    // eating the dots
    const m = new THREE.Matrix4();
    for (const ch of F.chars({ outside: true })) {
      const p = ch.rootPosition; if (p.y > 6) continue;
      for (const [k, d] of S.dotPos.entries()) {
        if (d.eaten || Math.abs(p.x - d.x) > (d.big ? 2.2 : 1.6) || Math.abs(p.z - d.z) > (d.big ? 2.2 : 1.6)) continue;
        d.eaten = true; m.makeScale(0, 0, 0); S.dots.setMatrixAt(k, m); S.dots.instanceMatrix.needsUpdate = true;
        S.wakka = 1 - S.wakka; A.tone(S.wakka ? 300 : 520, 0.09, { type: 'triangle', to: S.wakka ? 520 : 300, vol: 0.12, pos: p });
        const n = (S.eatCount.get(ch) || 0) + 1; S.eatCount.set(ch, n);
        if (n === 25) F.bonus(ch, 'High Score', 2);
        if (d.big) { S.scared = 7; for (const g of S.ghosts) g.userData.mat.color.set(0x2a3aff); A.tone(200, 0.6, { type: 'square', to: 900, vol: 0.12 }); }
      }
    }
    // the ghosts
    if (!S.ghosts.length && t > 7) spawnGhost(F, 0xff2a2a);
    S.scared = Math.max(0, (S.scared || 0) - dt);
    for (const g of S.ghosts) {
      const u = g.userData;
      if (u.dead > 0) { u.dead -= dt; g.visible = false; if (u.dead <= 0) { g.visible = true; g.position.set(0, 4, Z_GHOST); u.mat.color.set(u.color); } continue; }
      if (!S.scared) u.mat.color.set(u.color); else u.mat.color.set(S.scared < 2 && Math.floor(t * 6) % 2 ? 0xffffff : 0x2a3aff);
      const tgt = F.nearest(g.position, { outside: true, max: 120 });
      let want = tgt ? flat(tgt.rootPosition) : V(0, 0, -60);
      if (S.scared && tgt) want = flat(g.position).add(flat(g.position).sub(flat(tgt.rootPosition)).setLength(10));
      want.x = clamp(want.x, -30, 30); want.z = clamp(want.z, Z_GHOST, -14);
      const d = want.sub(flat(g.position)), L = d.length(), sp = S.scared ? 7 : u.speed * (S.charge ? 1.35 : 1);
      if (L > 0.3) { g.position.addScaledVector(d.normalize(), Math.min(L, sp * dt)); g.rotation.y = Math.atan2(-d.x, -d.z); }
      g.position.y = 4.4 + Math.sin(t * 4 + u.ph) * 0.3;
      for (const ch of F.chars({ outside: true })) {
        if (Math.hypot(ch.rootPosition.x - g.position.x, ch.rootPosition.z - g.position.z) > 3.4 || ch.rootPosition.y > 9) continue;
        if (S.scared) { u.dead = 4; A.tone(1200, 0.4, { type: 'square', to: 200, vol: 0.12, pos: g.position }); if (!u.eatenBy) { u.eatenBy = ch; F.bonus(ch, 'Ghost Buster', 3); } }
        else F.kill(ch, 'was caught by a ghost');
      }
    }
    // the claw machine (stand at it and wait)
    if (!S.clawWon) for (const ch of F.chars()) {
      const near = Math.hypot(ch.rootPosition.x + 23, ch.rootPosition.z + 11.5) < 3;
      const k = near ? (S.clawT.get(ch) || 0) + dt : 0; S.clawT.set(ch, k);
      if (near) { S.claw.position.y = 8 - Math.sin(Math.min(1, k / 2.5) * Math.PI) * 3.5; }
      if (k > 2.5 && ch.clawTried !== F) { ch.clawTried = F; if (Math.random() < 0.45) { S.clawWon = true; F.bonus(ch, 'Claw Master', 2); } else { A.errorSound(); if (ch.player?.isLocal) F.E.ui.toast('So close! (It is always so close.)', '#ffd84a', 'rgba(70,52,10,.9)'); } }
    }
  },
  closing(F) {
    const S = F.state; S.charge = true;
    if (S.ghosts.length < 2) spawnGhost(F, 0xff8ad8);
    A.stinger();
  },
  botTick(F, bot) {
    const S = F.state; if (bot.mode !== 'out') return;
    for (const g of S.ghosts) if (!S.scared && g.visible && g.position.distanceTo(bot.ch.rootPosition) < 14) { bot.mode = 'return'; return; }
  },
};
const Z_GHOST = -80;
function spawnGhost(F, color) {
  const g = F.add(ghostModel(color)); g.position.set(0, 4, Z_GHOST);
  g.userData.speed = 11; g.userData.ph = rnd(0, 6); g.userData.dead = 0;
  F.state.ghosts.push(g); A.tone(220, 0.8, { type: 'square', to: 440, vol: 0.12 });
  F.E.game.players.forEach((p) => { if (p.brain && Math.random() < 0.3) F.E.world.delay(rnd(0.4, 1.2), () => p.brain.say(pick(['GHOST', 'run!!', 'get a big dot', 'its coming']))); });
}

// --- the dinosaur park -------------------------------------------------------------------------------------------------------------------------------------------
function trexModel() {
  const g = new THREE.Group();
  const body = blocks([[6, 7, 13, 0, 13, 0, 141, { rx: -12 }], [5, 3, 10, 0, 10, -0.5, 119, { rx: -12 }]]); g.add(body);
  const tail = new THREE.Group(); tail.position.set(0, 13.5, 6); tail.add(blocks([[4.4, 4.4, 6, 0, 0, 3, 141], [3, 3, 6, 0, -0.6, 8.4, 141], [1.8, 1.8, 6, 0, -1.2, 13.6, 141]])); g.add(tail); g.userData.tail = tail;
  const neck = blocks([[4, 5, 4, 0, 17, -6.5, 141, { rx: 25 }]]); g.add(neck);
  const head = new THREE.Group(); head.position.set(0, 19.5, -8.5);
  head.add(blocks([[5, 4, 8, 0, 0.6, -2.4, 141], [5.2, 0.6, 3, 0, 2.7, 0, 141], [0.7, 0.7, 0.3, 1.9, 1.6, -3, 24, { emissive: 0.8 }], [0.7, 0.7, 0.3, -1.9, 1.6, -3, 24, { emissive: 0.8 }], ...[-2, -0.7, 0.7, 2].map((x) => [0.35, 0.7, 0.35, x, -1.4, -6, 1])]));
  const jaw = new THREE.Group(); jaw.position.set(0, -1.4, 0); jaw.add(blocks([[4.6, 1.4, 7, 0, -0.6, -3, 119], ...[-1.8, -0.6, 0.6, 1.8].map((x) => [0.35, 0.6, 0.35, x, 0.3, -6, 1])])); head.add(jaw);
  g.add(head); g.userData.head = head; g.userData.jaw = jaw;
  g.add(blocks([[0.8, 2.6, 0.8, 2.6, 12, -5.4, 141, { rx: 40 }], [0.8, 2.6, 0.8, -2.6, 12, -5.4, 141, { rx: 40 }]]));
  g.userData.legs = [-1, 1].map((s) => { const L = new THREE.Group(); L.position.set(s * 3.4, 11, 1); L.add(blocks([[2.6, 7, 4, 0, -3, 0, 141], [1.8, 5, 1.8, 0, -8, 1, 141, { rx: -15 }], [2.6, 1, 4.2, 0, -10.5, -0.4, 141]])); g.add(L); return L; });
  return g;
}
export const dino = {
  id: 'dino', name: 'Dinosaur Park', hint: 'Welcome! The fences are perfectly safe.', color: '#9ae04a', time: 36,
  look: { sky: 'jungle', amb: [0xd8f0d0, 0x5a6a3a, 1.35], sun: [0xfff0d0, 1.3], fog: [0xa8c8a0, 110, 480] },
  bots: { venture: 0.75, spots: [[-12, -26], [14, -30], [-24, -46], [26, -52], [0, -40], [-40, -30], [40, -36]], area: [-30, -56, 30, -18] },
  lines: ['DINOSAURS', 'is that a t rex', 'the fence is down!!', 'RUN', 'it can smell us', 'i found an egg', 'clever girl'],
  build(F) {
    const S = F.state;
    F.ground(-240, -300, 240, 40, 28, { top: 'Studs' });
    F.box(-5, 0.02, -60, 5, 0.1, DOOR_Z, 226, { canCollide: false });
    // the gate and the electric fence round the paddock
    F.box(-26, 0, -66, -10, 22, -63, 192); F.box(10, 0, -66, 26, 22, -63, 192); F.box(-26, 22, -66, 26, 26, -63, 192);
    F.sign(0, 24, -62.9, 30, 3.6, 'DINOSAUR PARK', { bg: '#c84a1a', fg: '#ffe066', face: 'z', noBoard: true, font: 'Impact, Arial Black' });
    S.gates = [-1, 1].map((s) => F.part({ size: [10, 20, 1.2], position: [s * 5, 10, -64.5], color: 192, top: 'Smooth' }));
    S.posts = [];
    for (let x = -90; x <= 90; x += 10) if (Math.abs(x) > 26) { F.box(x - 0.6, 0, -65.2, x + 0.6, 20, -64, 199); S.posts.push(V(x, 20, -64.6)); }
    for (let z = -64; z >= -190; z -= 10) for (const s of [-1, 1]) F.box(s * 90 - 0.6, 0, z - 0.6, s * 90 + 0.6, 20, z + 0.6, 199);
    S.wires = [];
    for (const y of [5, 10, 15, 19]) {
      for (const s of [-1, 1]) { const w = F.part({ size: [64, 0.25, 0.25], position: [s * 58, y, -64.6], color: 24, material: 'Neon', canCollide: false }); S.wires.push(w); }
      for (const s of [-1, 1]) { const w = F.part({ size: [0.25, 0.25, 126], position: [s * 90, y, -127], color: 24, material: 'Neon', canCollide: false }); S.wires.push(w); }
    }
    F.box(-90, 0, -64.8, 90, 20, -64.4, 1, { transparency: 1 });
    F.sign(-40, 8, -63.9, 10, 3, 'DANGER\nHIGH VOLTAGE', { bg: '#f4cc20', fg: '#111', face: 'z', border: '#111' });
    // jungle, a jeep, the visitor stand, a volcano on the horizon
    for (let k = 0; k < 30; k++) { const x = rnd(-200, 200), z = rnd(-260, -20); if (Math.abs(x) < 30 && z > -70) continue; const h = rnd(18, 34); F.box(x - 1, 0, z - 1, x + 1, h, z + 1, 192); F.add(blocks([[rnd(8, 14), rnd(5, 8), rnd(8, 14), 0, h, 0, pick([28, 37, 141]), { shape: 'ball' }]])).position.set(x, 0, z); }
    for (let k = 0; k < 50; k++) { const x = rnd(-120, 120), z = rnd(-200, -14); if (Math.abs(x) < 8 && z > -62) continue; F.add(blocks([[rnd(3, 6), rnd(2, 4), rnd(3, 6), 0, 1, 0, pick([28, 37]), { shape: 'cone' }]])).position.set(x, 0, z); }
    F.add(blocks([[160, 70, 160, 0, 35, 0, 192, { shape: 'cone' }], [30, 4, 30, 0, 70, 0, 106, { shape: 'cyl', emissive: 0.8 }]])).position.set(-160, 0, -420);
    F.box(-30, 0, -40, -18, 4, -33, 37); F.box(-28, 4, -40, -20, 8, -36, 37); F.add(blocks([[3, 4, 4, 0, 0, 0, 26, { shape: 'cyl', rz: 90 }], [3, 4, 4, 0, 0, 7, 26, { shape: 'cyl', rz: 90 }]])).position.set(-31.6, 2, -39.4);
    F.box(-30.2, 4, -33.2, -17.8, 4.4, -32.8, 1, { transparency: 0.6 });
    F.box(16, 0, -26, 30, 3, -18, 192); F.box(16, 3, -26, 30, 3.4, -25.4, 24);
    // an egg in a nest (outside the fence - for now)
    F.add(blocks([[6, 1.6, 6, 0, 0.4, 0, 192, { shape: 'cyl' }]])).position.set(36, 0, -50);
    S.egg = F.add(blocks([[1.8, 2.4, 1.8, 0, 0, 0, 226, { shape: 'ball' }], [0.5, 0.5, 0.2, 0.5, 0.4, -0.86, 24, { shape: 'ball' }], [0.4, 0.4, 0.2, -0.4, -0.2, -0.86, 24, { shape: 'ball' }]])); S.egg.position.set(36, 2.2, -50);
    F.pickup(S.egg, 3.5, (ch) => { F.bonus(ch, 'Egg Hunter', 2); A.roar(V(0, 20, -120), 1.3, 1); }, { offset: V(0, 1, 0) });
    // a long-neck, eating leaves, harmless
    S.brachio = F.add(blocks([[8, 8, 16, 0, 12, 0, 104], [3, 3, 18, 0, 22, -14, 104, { rx: 50 }], [3, 3, 5, 0, 30, -21, 104], [3, 10, 3, -3, 4, -5, 104], [3, 10, 3, 3, 4, -5, 104], [3, 10, 3, -3, 4, 5, 104], [3, 10, 3, 3, 4, 5, 104], [2, 2, 14, 0, 10, 14, 104, { rx: -15 }]]));
    S.brachio.position.set(70, 0, -40); S.brachio.rotation.y = 0.6;
    // the T-rex, in its paddock
    S.rex = F.add(trexModel()); S.rex.position.set(0, 0, -120); S.rex.rotation.y = Math.PI;
    S.rexT = 0; S.rexWalk = 0; S.mode = 'pen'; S.penTgt = V(0, 0, -100);
  },
  start(F) { A.jungle(0.25); F.sound(null, 'jungle'); A.hum('fence', 0.05, [60, 120, 180], { type: 'sawtooth', lp: 900 }); F.sound(null, 'fence'); },
  update(F, dt, t) {
    const S = F.state, R = S.rex;
    S.brachio.children[2].position.y = 30 + Math.sin(t * 0.8) * 0.6;
    // power failure: the fence goes dark and the gate gives
    if (S.mode === 'pen' && t > 11) {
      S.mode = 'break'; S.breakT = 0;
      A.powerDown(); A.stop('fence'); for (const w of S.wires) w.setColor(26);
      F.say('Park PA', 'Attention: we are experiencing a minor power failure. Please remain in your vehicles.', V(0, 24, -62));
      F.E.game.players.forEach((p) => { if (p.brain && Math.random() < 0.4) F.E.world.delay(rnd(1, 3), () => p.brain.say(pick(['uh oh', 'the fence!!', 'the lights went out', 'RUN']))); });
    }
    let want = null, sp = 0;
    if (S.mode === 'pen') {
      if (flat(R.position).distanceTo(S.penTgt) < 3) S.penTgt = V(rnd(-70, 70), 0, rnd(-180, -76));
      want = S.penTgt; sp = 6;
    } else if (S.mode === 'break') {
      S.breakT += dt; want = V(0, 0, -72); sp = 12;
      if (flat(R.position).distanceTo(want) < 4 && !S.broke) {
        S.broke = true; S.mode = 'hunt'; A.roar(R.position.clone().setY(18), 0.7, 2.2); F.shake(0.8);
        for (const [i, g] of S.gates.entries()) { g.unanchor?.(); g.body.velocity.set((i ? 1 : -1) * 30, 18, 40); g.body.angularVelocity.set(rnd(-3, 3), rnd(-3, 3), rnd(-3, 3)); }
        A.crumble(V(0, 10, -64)); F.burst('dust', V(0, 6, -64), 24, { speed: [6, 18], size: [3, 6], life: [1, 2], gravity: 0.2, grow: 1 });
      }
    } else {
      const tgt = F.nearest(R.position, { outside: true, max: 140 });
      want = tgt ? flat(tgt.rootPosition) : V(0, 0, -90); sp = S.charge ? 19 : 14.5;
      want.z = Math.min(want.z, -24);
      if (tgt && tgt.rootPosition.distanceTo(R.position.clone().add(V(0, 3, 0))) < 26 && (S.roarT = (S.roarT || 0) - dt) <= 0) { S.roarT = rnd(4, 7); A.roar(R.position.clone().setY(18), 0.9, 1.4); }
    }
    if (want) {
      const d = want.clone().sub(flat(R.position)), L = d.length();
      if (L > 1) { R.position.addScaledVector(d.normalize(), Math.min(L, sp * dt)); let dy = Math.atan2(-d.x, -d.z) - R.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); R.rotation.y += dy * Math.min(1, dt * 3); S.rexWalk += dt * sp * 0.28; }
    }
    const [l1, l2] = R.userData.legs; l1.rotation.x = Math.sin(S.rexWalk) * 0.5; l2.rotation.x = -Math.sin(S.rexWalk) * 0.5;
    R.position.y = Math.abs(Math.cos(S.rexWalk)) * 0.6;
    R.userData.tail.rotation.y = Math.sin(t * 1.4) * 0.25;
    const near = S.mode === 'hunt' ? F.nearest(R.position, { outside: true, max: 22 }) : null;
    R.userData.jaw.rotation.x = near ? 0.5 + Math.sin(t * 9) * 0.2 : 0.08;
    R.userData.head.rotation.x = near ? -0.2 : Math.sin(t * 0.7) * 0.1;
    if (Math.floor(S.rexWalk / Math.PI) !== S.step) { S.step = Math.floor(S.rexWalk / Math.PI); A.stomp(R.position); if (S.mode !== 'pen') F.shake(0.2); }
    if (S.mode !== 'pen') {
      const mouth = R.localToWorld(V(0, 18, -12));
      for (const ch of F.chars({ outside: true })) { const q = ch.rootPosition; if (Math.hypot(q.x - mouth.x, q.z - mouth.z) < 5.5 || Math.hypot(q.x - R.position.x, q.z - R.position.z) < 5) { A.crunch(q); F.kill(ch, 'was eaten by a T-rex', mouth); } }
    }
  },
  closing(F) { F.state.charge = true; if (F.state.mode === 'pen') F.state.mode = 'break'; A.roar(F.state.rex.position.clone().setY(18), 0.75, 2); },
  botTick(F, bot) { const S = F.state; if (S.mode !== 'pen' && bot.mode === 'out' && S.rex.position.distanceTo(bot.ch.rootPosition) < 50) { bot.mode = 'return'; if (Math.random() < 0.3) bot.say(pick(['RUN', 'T REX', 'nope'])); } },
};

// --- the big top -------------------------------------------------------------------------------------------------------------------------------------------------
function stripes(key, a, b, n) { return ctex(key, 256, 64, (x, w, h) => { for (let i = 0; i < n; i++) { x.fillStyle = i % 2 ? b : a; x.fillRect(i * w / n, 0, w / n + 1, h); } }); }
const CLOWN = () => faceTex('clown', (x, S) => {
  x.fillStyle = '#ffffff'; x.beginPath(); x.ellipse(S * 0.5, S * 0.52, S * 0.3, S * 0.3, 0, 0, 7); x.fill();
  x.fillStyle = '#1a1a1a'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(S * (0.5 + s * 0.1), S * 0.4, S * 0.03, S * 0.05, 0, 0, 7); x.fill(); }
  x.fillStyle = '#2a6aff'; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(S * (0.5 + s * 0.1), S * 0.3); x.lineTo(S * (0.5 + s * 0.13), S * 0.36); x.lineTo(S * (0.5 + s * 0.07), S * 0.36); x.fill(); }
  x.fillStyle = '#e8202a'; x.beginPath(); x.arc(S * 0.5, S * 0.5, S * 0.06, 0, 7); x.fill();
  x.beginPath(); x.arc(S * 0.5, S * 0.58, S * 0.16, 0.15, Math.PI - 0.15); x.lineTo(S * 0.36, S * 0.6); x.quadraticCurveTo(S * 0.5, S * 0.68, S * 0.64, S * 0.6); x.fill();
});
export const circus = {
  id: 'circus', name: 'The Big Top', hint: 'Step right up! Be the human cannonball!', color: '#ff5a5a', time: 36, music: 'circus',
  look: { skyColor: 0x1a0a06, amb: [0xffe8d0, 0x6a3a20, 1.25], sun: [0xffe8c0, 0.5], fog: [0x2a140a, 120, 260] },
  bots: { venture: 0.8, spots: [[-12, -36], [12, -40], [0, -56], [-20, -62], [22, -60], [-10, -72], [10, -76]], area: [-20, -78, 20, -30] },
  lines: ['CIRCUS', 'clowns!!', 'i hate clowns', 'the cannon!!', 'BOING', 'look at the tightrope', 'honk honk'],
  build(F) {
    const S = F.state, CZ = -56, R = 40;
    F.ground(-120, -160, 120, 30, 37, { top: 'Studs' });
    F.ground(-R, CZ - R, R, CZ + R, 5, { top: 'Smooth', y: 0.05, thick: 0.2 });
    // the tent: striped walls (with a way in from the doors) and a striped roof, poles, bunting
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 22, 48, 1, true, Math.PI * 0.1, Math.PI * 1.8), new THREE.MeshPhongMaterial({ map: tiled(stripes('tent', '#e8302a', '#f4f0e8', 8), 9, 1), side: THREE.DoubleSide }));
    wall.position.set(0, 11, CZ); F.add(wall);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(R + 2, 20, 48, 1, true), new THREE.MeshPhongMaterial({ map: tiled(stripes('tentRoof', '#e8302a', '#f4f0e8', 8), 12, 1), side: THREE.DoubleSide }));
    roof.position.set(0, 32, CZ); F.add(roof);
    for (let k = 0; k < 24; k++) { const a = (k + 0.5) / 24 * Math.PI * 2, x = Math.sin(a) * (R + 2.5), z = CZ + Math.cos(a) * (R + 2.5); if (z > CZ + R * 0.9) continue; F.box(x - 3, 0, z - 3, x + 3, 22, z + 3, 1, { transparency: 1 }); }
    for (const s of [-1, 1]) F.box(s * 10 - 0.6, 0, CZ - 0.6, s * 10 + 0.6, 40, CZ + 0.6, 24);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; const flag = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, R, 4).rotateX(Math.PI / 2).translate(0, 0, R / 2), plastic(24)); flag.position.set(0, 40, CZ); flag.rotation.set(-0.45, a, 0); F.add(flag); }
    // the ring
    for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; F.add(blocks([[3.6, 1.6, 1.2, 0, 0.8, 0, k % 2 ? 21 : 24]])).position.set(Math.sin(a) * 16, 0, CZ + Math.cos(a) * 16); F.state.ringA ||= 0; }
    F.add(blocks([[32, 0.1, 32, 0, 0.12, 0, 226, { shape: 'cyl' }]]));
    // bleachers
    for (const s of [-1, 1]) for (let r = 0; r < 4; r++) F.box(s * (24 + r * 2.4), 0, CZ - 14, s * (26.4 + r * 2.4), 1.6 + r * 1.6, CZ + 14, r % 2 ? 192 : 24);
    // the human cannon (left) and the safety net (right)
    S.cannon = F.add(blocks([[3.6, 12, 3.6, 0, 6, 0, 104, { shape: 'cyl' }], [4.2, 1, 4.2, 0, 12, 0, 24, { shape: 'cyl' }], [4.4, 0.6, 4.4, 0, 1, 0, 24, { shape: 'cyl' }]]));
    S.cannon.position.set(-20, 3, CZ - 24); S.cannon.rotation.z = -0.75;
    F.add(blocks([[3, 3, 6, 0, 1.5, 0, 21], [5, 5, 1, 0, 2.5, -3.5, 26, { shape: 'cyl', rz: 90 }], [5, 5, 1, 0, 2.5, 3.5, 26, { shape: 'cyl', rz: 90 }]])).position.set(-21, 0, CZ - 24);
    for (let i = 0; i < 9; i++) F.box(-8 - i * 0.9, 0, CZ - 25.5, -7.1 - i * 0.9, i + 1, CZ - 22.5, 24);
    F.box(-15.4, 0, CZ - 25.5, -13.4, 9, CZ - 22.5, 24);
    S.load = V(-13.4, 12, CZ - 24);
    F.sign(-8, 13, CZ - 22.4, 9, 2.2, 'HUMAN\nCANNONBALL', { bg: '#ffd84a', fg: '#c4281c', face: 'z', border: '#c4281c' });
    F.box(16, 0, CZ - 32, 30, 2.4, CZ - 16, 199);
    F.box(16.5, 2.4, CZ - 31.5, 29.5, 2.6, CZ - 16.5, 1, { canCollide: false });
    S.net = { x0: 15, x1: 31, z0: CZ - 33, z1: CZ - 15 };
    // trampolines round the ring
    S.tramps = [];
    for (const [x, z] of [[-24, CZ + 18], [24, CZ + 18], [0, CZ + 26]]) { F.box(x - 3, 0, z - 3, x + 3, 1.4, z + 3, 26); F.add(blocks([[6.2, 0.2, 6.2, 0, 1.45, 0, 23, { shape: 'cyl' }]])).position.set(x, 0, z); S.tramps.push(V(x, 0, z)); }
    // the high wire: ladders up two poles, a wire between them, a prize at the end
    for (const x of [-18, 18]) { F.box(x - 2, 20, CZ - 2, x + 2, 20.6, CZ + 2, 24); F.box(x - 1, 0, CZ + 2, x + 1, 20, CZ + 2.6, 199, { tags: ['climbable'] }); }
    F.box(-16, 20, CZ - 0.3, 16, 20.6, CZ + 0.3, 1);
    S.star = F.add(blocks([[2, 2, 0.6, 0, 0, 0, 24, { emissive: 0.6 }], [2, 2, 0.6, 0, 0, 0, 24, { emissive: 0.6, rz: 45 }]])); S.star.position.set(18, 22.8, CZ); F.spin(S.star, 2);
    F.pickup(S.star, 3, (ch) => F.bonus(ch, 'Tightrope Walker', 3));
    // the clown (juggling) and the clown car
    S.clown = F.puppet({ colors: { head: 1, torso: 104, leftArm: 23, rightArm: 21, leftLeg: 24, rightLeg: 37 } }, { at: [0, 0, CZ - 6, Math.PI], faceTex: CLOWN(), hat: (h) => h.add(blocks([[1.8, 1, 1.8, -0.9, 0.3, 0, 21, { shape: 'ball' }], [1.8, 1, 1.8, 0.9, 0.3, 0, 23, { shape: 'ball' }], [1.4, 1, 1.4, 0, 0.7, 0.2, 24, { shape: 'ball' }]])) });
    S.clown.pose = (a, t) => { a.rs = 1.4 + Math.sin(t * 8) * 0.3; a.ls = 1.4 - Math.sin(t * 8) * 0.3; };
    S.balls = [0, 1, 2].map((k) => { const b = F.add(blocks([[0.8, 0.8, 0.8, 0, 0, 0, [21, 23, 24][k], { shape: 'ball' }]])); return b; });
    S.car = F.add(blocks([[4.4, 2, 7, 0, 1.8, 0, 24], [3.8, 2, 3.4, 0, 3.6, 0.6, 104], [3.4, 1.6, 0.1, 0, 3.6, -1.15, 42, { opacity: 0.5 }], ...[[-2.2, -2.4], [2.2, -2.4], [-2.2, 2.4], [2.2, 2.4]].map(([x, z]) => [0.8, 1.8, 1.8, x, 0.9, z, 26, { shape: 'cyl', rz: 90 }]), [1, 1, 0.3, 0, 2.2, -3.6, 21, { shape: 'ball' }]]));
    S.carA = 0;
    S.confetti = 0;
  },
  update(F, dt, t) {
    const S = F.state, CZ = -56;
    // juggling
    const c = S.clown.pos;
    S.balls.forEach((b, k) => { const ph = t * 4 + k * 2.09; b.position.set(c.x + Math.cos(ph) * 1.4, 7.2 + Math.abs(Math.sin(ph)) * 3, c.z - 1.6); });
    S.jokeT = (S.jokeT ?? 4) - dt;
    if (S.jokeT <= 0) { S.jokeT = rnd(7, 11); A.partyHorn(S.clown.head); F.say('Clown', pick(['Why did the elevator go to school? To get to the next LEVEL! HONK!', 'Try the cannon! It is VERY safe!', 'I juggle, I honk, I do taxes.', 'Have you seen my car? It is very small.', 'HONK HONK!']), S.clown); }
    // the clown car drives round the ring (and knocks people over)
    S.carA += dt * (S.charge ? 0.9 : 0.45);
    const cp = V(Math.cos(S.carA) * 21, 0, CZ + Math.sin(S.carA) * 21);
    S.car.position.copy(cp); S.car.rotation.y = -S.carA;
    if ((S.honkT = (S.honkT || 0) - dt) <= 0) { S.honkT = rnd(2, 4); A.tone(380, 0.18, { type: 'square', lp: 1400, vol: 0.16, pos: cp }); A.tone(300, 0.22, { type: 'square', lp: 1400, vol: 0.16, delay: 0.2, pos: cp }); }
    for (const ch of F.chars()) if (Math.hypot(ch.rootPosition.x - cp.x, ch.rootPosition.z - cp.z) < 4 && ch.rootPosition.y < 7 && !ch.platformStand) { const away = flat(ch.rootPosition).sub(cp).normalize(); F.fling(ch, away.multiplyScalar(40).add(V(0, 35, 0)), 1); A.boing(ch.rootPosition); A.tone(380, 0.2, { type: 'square', lp: 1400, vol: 0.2, pos: cp }); }
    // trampolines
    for (const ch of F.chars()) for (const tp of S.tramps) { const q = ch.rootPosition; if (Math.hypot(q.x - tp.x, q.z - tp.z) < 3 && q.y < 5.2 && ch.body.velocity.y <= 1) { ch.body.velocity.y = 95; A.boing(q); } }
    // the cannon: climb in, wait, BOOM
    for (const ch of F.chars()) {
      if (ch.cannonT == null && ch.rootPosition.distanceTo(S.load) < 3) { ch.cannonT = F.t; ch.platformStand = true; ch.body.velocity.set(0, 0, 0); if (ch.player?.isLocal) F.E.ui.toast('3... 2... 1...', '#ffd84a', 'rgba(70,52,10,.9)'); A.tone(600, 0.1, { vol: 0.2, pos: S.load }); }
      if (ch.cannonT != null && ch.cannonT !== -1) {
        const k = F.t - ch.cannonT;
        if (k < 1.6) { ch.body.position.set(S.load.x - 2, S.load.y - 1, S.load.z); ch.body.velocity.set(0, 0, 0); }
        else {
          ch.cannonT = -1; A.cannon(S.load); F.shake(0.6); F.burst('dust', S.load.clone().add(V(2, 2, 0)), 16, { speed: [6, 16], size: [1.5, 3], life: [0.6, 1.2], gravity: -0.05, dir: V(1, 1, 0), cone: 0.5 });
          ch.platformStand = true; ch.flungUntil = F.E.world.time + 1.8; ch.body.velocity.set(60, 58, -3); ch.flyFrom = F.t;
          if (ch.player?.isLocal) F.E.ui.toast('WHEEEEEE!', '#ffd84a', 'rgba(70,52,10,.9)');
        }
      }
      if (ch.flyFrom != null && F.t - ch.flyFrom > 0.4 && ch.grounded) {
        const q = ch.rootPosition, inNet = q.x > S.net.x0 && q.x < S.net.x1 && q.z > S.net.z0 && q.z < S.net.z1;
        if (inNet) { F.bonus(ch, 'Human Cannonball', 3); A.boing(q); } else { A.thud(q); if (ch.player?.isLocal) F.E.ui.toast('Missed the net. Ouch.', '#ff9a5a', 'rgba(70,30,10,.9)'); F.hurt(ch, 30, 'missed the net'); }
        ch.flyFrom = null; ch.cannonT = null;
      }
    }
    if (S.confetti > 0) { S.confetti -= dt; if (Math.random() < dt * 20) F.burst(pick([0xff3a3a, 0xffd84a, 0x3aff8a, 0x3a8aff, 0xff4adc]), V(rnd(-30, 30), 30, CZ + rnd(-30, 30)), 4, { speed: [1, 3], size: [0.3, 0.5], life: [2, 3], gravity: 0.08 }); }
  },
  closing(F) {
    const S = F.state; S.charge = true; S.confetti = 5;
    F.say('Ringmaster', 'Ladies and gentlemen... that concludes our show! Please exit through the elevator!', S.clown);
    A.cheer(); A.fanfare();
  },
  botTick(F, bot) { if (bot.mode === 'out' && !bot.cannonTry && bot.bravery > 0.95 && Math.random() < 0.02) { bot.cannonTry = true; bot.plan.unshift(V(-12, 0, -80)); } },
};
void DOOR_Z; void clamp;
