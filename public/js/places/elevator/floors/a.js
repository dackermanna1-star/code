// Floors: the beach, the floor is lava, the disco.
import * as THREE from 'three';
import { V, rnd, pick, clamp, ctex, liveTex, blocks, tiled, DOOR_Z, FACES, textTex } from '../kit.js';
import * as A from '../audio.js';
import { tex as dtex } from '../../disasters/effects.js';

const DEG = Math.PI / 180;
export function palm(F, x, z, h = 16, lean = 10) {
  const g = new THREE.Group();
  let y = 0, ox = 0;
  for (let i = 0; i < 6; i++) { const seg = blocks([[1.3 - i * 0.08, h / 6 + 0.3, 1.3 - i * 0.08, ox, y + h / 12, 0, 192, { rz: -lean * (i / 6) }]]); g.add(seg); y += h / 6; ox += Math.sin(lean * (i / 6) * DEG) * h / 6; }
  for (let i = 0; i < 7; i++) { const a = i / 7 * 360; const leaf = blocks([[1.6, 0.25, 7, 0, 0, 3.2, 37, { rx: 22 }]]); leaf.position.set(ox, y, 0); leaf.rotation.y = a * DEG; g.add(leaf); }
  g.add(blocks([[1, 1, 1, ox + 0.5, y - 0.6, 0.4, 192, { shape: 'ball' }], [1, 1, 1, ox - 0.4, y - 0.7, -0.3, 192, { shape: 'ball' }]]));
  g.position.set(x, 0, z); g.rotation.y = rnd(0, 6.28);
  F.add(g);
  F.box(x - 0.7, 0, z - 0.7, x + 0.7, 6, z + 0.7, 192, { transparency: 1 });
  return g;
}
/** Swimming in water whose surface is at level (for characters inside the region test). */
export function swim(F, level, inWater) {
  F.every(0, (dt) => {
    for (const ch of F.chars()) {
      const p = ch.rootPosition, feet = p.y - 3;
      if (!inWater(p) || feet > level - 2.4) { if (ch.swimming) { ch.swimming = false; ch.walkSpeed = 16; } continue; }
      ch.swimming = true; ch.walkSpeed = 11;
      const b = ch.body, want = level - 1.2;
      b.velocity.y += ((want - p.y) * 6 - b.velocity.y) * Math.min(1, dt * 5);
      if (ch.input.jump) b.velocity.y = Math.max(b.velocity.y, 13);
    }
  });
}

// --- the beach -----------------------------------------------------------------------------------------------------------------------------------------
export const beach = {
  id: 'beach', name: 'Sunny Beach', hint: 'Sun, sand and sea. What could go wrong?', color: '#ffe066', time: 32,
  look: { sky: 'day', amb: [0xeaf4ff, 0xd8c890, 1.5], sun: [0xfff6e0, 1.45], fog: [0xcfe6fb, 300, 1400] },
  bots: { venture: 0.9, spots: [[-14, -24], [12, -28], [0, -40], [-20, -46], [18, -50], [6, -62], [-8, -78], [10, -84], [24, -36]], area: [-30, -66, 30, -16] },
  lines: ['BEACH!!', 'swimming time', 'i love the beach', 'can we stay here', 'the water is so blue', 'kick the ball!!', 'sand castle', 'is there sharks'],
  build(F) {
    F.ground(-160, -70, 160, 40, 226, { thick: 2 });
    // the shore slopes down into the sea
    for (let i = 0; i < 6; i++) F.box(-160, -1 - i, -70 - i * 4, 160, -i, -74 - i * 4, 226);
    F.ground(-400, -500, 400, -94, 5, { y: -7, thick: 2 });
    const wt = tiled(dtex().water, 40, 20);
    const sea = F.plane(wt, 900, 420, [0, -0.6, -290], [-90, 0, 0], { transparent: true, opacity: 0.82, shininess: 90 });
    sea.material.color.set(0x5ab8e8); sea.renderOrder = 2; F.state.sea = sea;
    F.state.foam = F.plane(ctex('foam', 128, 32, (x, w, h) => { x.clearRect(0, 0, w, h); for (let i = 0; i < 60; i++) { x.fillStyle = 'rgba(255,255,255,0.7)'; x.beginPath(); x.arc(Math.random() * w, h / 2 + rnd(-6, 6), rnd(2, 6), 0, 7); x.fill(); } }), 320, 3, [0, -0.5, -72], [-90, 0, 0], { transparent: true });
    swim(F, -0.6, (p) => p.z < -71);
    // palms, umbrellas, towels, a sandcastle, a lifeguard tower
    for (const [x, z] of [[-30, -20], [-38, -44], [32, -24], [40, -50], [-56, -30], [58, -34], [-20, 10], [24, 14]]) palm(F, x, z, rnd(14, 20), rnd(6, 16));
    for (const [x, z, c1, c2] of [[-14, -30, 21, 1], [14, -36, 23, 1], [-4, -52, 24, 21], [22, -58, 37, 1]]) {
      F.box(x - 0.2, 0, z - 0.2, x + 0.2, 7, z + 0.2, 1);
      const u = F.add(blocks([[8, 2.2, 8, 0, 0, 0, c1, { shape: 'cone' }], [8.2, 0.3, 8.2, 0, -1.1, 0, c2, { shape: 'cyl' }]])); u.position.set(x, 8, z);
      F.box(x + 2, 0.02, z - 2, x + 5, 0.12, z + 3.5, pick([21, 23, 24, 107, 104]), { canCollide: false });
    }
    // the sandcastle
    for (const [x, z, w, h] of [[8, -46, 6, 2], [6, -44, 1.5, 3.5], [10, -44, 1.5, 3.5], [6, -48, 1.5, 3.5], [10, -48, 1.5, 3.5], [8, -46, 2.5, 4]]) F.box(x - w / 2, 0, z - w / 2, x + w / 2, h, z + w / 2, 5, { top: 'Studs' });
    // the lifeguard tower and the lifeguard
    F.box(-26, 0, -62, -25.4, 9, -61.4, 1); F.box(-20.6, 0, -62, -20, 9, -61.4, 1); F.box(-26, 0, -57.6, -25.4, 9, -57, 1); F.box(-20.6, 0, -57.6, -20, 9, -57, 1);
    F.box(-26.4, 9, -62.4, -19.6, 9.6, -56.6, 1); F.box(-26.4, 9.6, -62.4, -19.6, 11.6, -62, 21); F.box(-26, 14.6, -62.4, -20, 15, -56.6, 21);
    for (const [x, z] of [[-26.2, -62.2], [-19.8, -62.2], [-26.2, -56.8], [-19.8, -56.8]]) F.box(x - 0.15, 9.6, z - 0.15, x + 0.15, 14.6, z + 0.15, 1);
    F.box(-24.5, 0, -56.6, -21.5, 9, -55.2, 192, { tags: ['climbable'] });
    const guard = F.puppet({ colors: { head: 24, torso: 24, leftArm: 24, rightArm: 24, leftLeg: 21, rightLeg: 21 } }, { at: [-23, 9.6, -59, Math.PI * 0.95] });
    guard.pose = (a, t) => { a.rs = Math.sin(t * 0.7) > 0.7 ? 2.6 : 0.2; };
    F.state.guard = guard;
    F.sign(-23, 12.6, -62.15, 5, 1.6, 'LIFEGUARD', { bg: '#c4281c', fg: '#ffffff', face: 'z', noBoard: true });
    // a beach ball to kick about
    F.state.ball = F.part({ name: 'BeachBall', shape: 'Ball', size: [4, 4, 4], position: [4, 3, -24], color: 21, anchored: false, mass: 1.2 });
    F.state.ball.mesh.material = new THREE.MeshPhongMaterial({ map: ctex('beachball', 128, 64, (x, w, h) => { const cs = ['#e8302a', '#ffffff', '#2a62d8', '#ffffff', '#f4cc20', '#ffffff']; cs.forEach((c, i) => { x.fillStyle = c; x.fillRect(i * w / 6, 0, w / 6 + 1, h); }); }), shininess: 60 });
    // crabs scuttling
    F.state.crabs = [0, 1, 2].map(() => { const c = F.add(blocks([[1.8, 0.8, 1.2, 0, 0.5, 0, 21], [0.5, 0.5, 0.5, 1.1, 0.8, -0.5, 21, { shape: 'ball' }], [0.5, 0.5, 0.5, -1.1, 0.8, -0.5, 21, { shape: 'ball' }], [0.2, 0.4, 0.2, 0.4, 1.1, -0.5, 1], [0.2, 0.4, 0.2, -0.4, 1.1, -0.5, 1]])); c.position.set(rnd(-30, 30), 0, rnd(-66, -30)); c.userData.ph = rnd(0, 6); return c; });
    // a bottle in the shallows
    F.state.bottle = F.add(blocks([[0.6, 1.6, 0.6, 0, 0, 0, 37, { shape: 'cyl', opacity: 0.7 }], [0.3, 0.5, 0.3, 0, 1, 0, 37, { shape: 'cyl', opacity: 0.7 }], [0.4, 1, 0.1, 0, 0, 0, 5]]));
    F.state.bottle.position.set(rnd(-30, 30), -0.7, -76); F.state.bottle.rotation.z = 1.3;
    F.state.fin = null;
  },
  start(F) { A.sea(0.4); A.gulls(0.25); F.sound(null, 'sea'); F.sound(null, 'gulls'); },
  update(F, dt, t) {
    const S = F.state;
    S.sea.material.map.offset.x = (t * 0.01) % 1; S.sea.material.map.offset.y = (t * 0.006) % 1;
    S.foam.position.z = -72 + Math.sin(t * 0.8) * 1.2; S.foam.material.opacity = 0.6 + Math.sin(t * 0.8) * 0.3;
    for (const c of S.crabs) { c.position.x += Math.sin(t * 0.9 + c.userData.ph) * dt * 5; c.rotation.y = Math.sin(t * 8 + c.userData.ph) * 0.1; }
    S.bottle.position.y = -0.7 + Math.sin(t * 1.4) * 0.15;
    if (!S.bottleTaken) for (const ch of F.chars()) if (ch.rootPosition.distanceTo(S.bottle.position) < 3.5) {
      S.bottleTaken = true; S.bottle.visible = false; A.pop(S.bottle.position);
      F.bonus(ch, 'Message in a Bottle', 2);
      if (ch.player?.isLocal) F.E.ui.toast('The note inside says: "HELP. I AM STUCK IN AN ELEVATOR."', '#9ad8ff', 'rgba(16,50,80,.9)');
    }
    // the lifeguard blows his whistle at swimmers
    if (F.chars().some((ch) => ch.swimming) && (!S.wh || t - S.wh > 9)) { S.wh = t; A.whistle(S.guard.head); F.say('Lifeguard', pick(['No swimming past the flags!', 'Hey! Out of the water!', 'I am not getting wet for you people.']), S.guard); }
    // near the end: something with a fin
    if (t > F.E.cur.time - 9 && !S.fin) {
      S.fin = F.add(blocks([[0.5, 3, 3, 0, 1.2, 0, 199, { rx: -25 }], [3, 0.6, 5, 0, -0.3, 0.5, 199]])); S.fin.position.set(rnd(-40, 40), -0.6, -160);
      A.stinger();
      F.say('Lifeguard', 'SHAAARK!', S.guard);
    }
    if (S.fin) {
      const swimmers = F.chars().filter((ch) => ch.swimming);
      const tgt = swimmers.length ? swimmers[0].rootPosition : V(S.fin.position.x, 0, -120);
      const d = V(tgt.x - S.fin.position.x, 0, tgt.z - S.fin.position.z), L = d.length();
      if (L > 0.5) { S.fin.position.addScaledVector(d.normalize(), Math.min(L, dt * 26)); S.fin.rotation.y = Math.atan2(d.x, d.z); }
      for (const ch of swimmers) if (Math.hypot(ch.rootPosition.x - S.fin.position.x, ch.rootPosition.z - S.fin.position.z) < 3) { A.splash(ch.rootPosition, 1.4); F.kill(ch, 'was eaten by a shark'); }
    }
  },
};

// --- the floor is lava -------------------------------------------------------------------------------------------------------------------------------------
export const lava = {
  id: 'lava', name: 'The Floor Is Lava', hint: "Don't touch the floor. Seriously.", color: '#ff7a2a', time: 34,
  look: { skyColor: 0x1a0804, amb: [0xffc8a0, 0x6a2a10, 1.2], sun: [0xffa060, 0.9], fog: [0x2a0c04, 120, 300] },
  bots: { venture: 0.6, gaps: true, spots: [[0, -15.5], [0, -21.5], [-6.5, -27.5], [8, -28], [-5, -36], [8, -44], [0, -46.5], [0, -55.5]] },
  lines: ['THE FLOOR IS LAVA', 'dont touch the floor', 'jump jump jump', 'i can make it', 'ez', 'get the trophy'],
  build(F) {
    const X0 = -24, X1 = 24, Z1 = -60, H = 18;
    F.room({ x0: X0, x1: X1, z1: Z1, h: H, floor: 26, wall: 104, ceiling: 1 });
    // the lava: kills on touch, glows
    const lavaPart = F.part({ name: 'Lava', size: [X1 - X0, 1, DOOR_Z - Z1 - 2.6], position: [0, 0.1, (DOOR_Z - 2.6 + Z1) / 2], color: 106, material: 'Neon', top: 'Smooth' });
    F.deadly(lavaPart, 'fell into the lava');
    const lt = tiled(dtex().lava, 8, 8);
    F.state.lava = F.plane(lt, X1 - X0, DOOR_Z - Z1 - 2.6, [0, 0.62, (DOOR_Z - 2.6 + Z1) / 2], [-90, 0, 0], { basic: true, transparent: false });
    F.state.lava.material.color.set(0xffc080);
    for (const [x, z] of [[-12, -20], [12, -32], [-10, -48], [10, -52]]) F.light(V(x, 3, z), 0xff6a20, 90, 40);
    // wallpaper stripes, a skirting, windows with curtains, a painting
    for (let x = X0 + 2; x < X1; x += 4) { F.box(x, 0, Z1 + 0.02, x + 1.2, H, Z1 + 0.1, 22, { canCollide: false }); }
    for (const x of [-14, 14]) { F.box(x - 4, 7, Z1 + 0.1, x + 4, 14, Z1 + 0.2, 43, { canCollide: false, transparency: 0.3 }); F.box(x - 5, 6, Z1 + 0.2, x - 3.5, 15, Z1 + 0.6, 21); F.box(x + 3.5, 6, Z1 + 0.2, x + 5, 15, Z1 + 0.6, 21); }
    F.plane(textTex('LIVE\nLAUGH\nLAVA', { bg: '#f4e4c4', fg: '#7a3a1a', w: 256, h: 256, border: '#8a6a2a', font: 'Georgia' }), 5, 5, [X0 + 0.15, 10, -30], [0, 90, 0]);
    // the doormat, and the furniture to hop across
    F.box(-5.5, 0, DOOR_Z - 2.6, 5.5, 0.9, DOOR_Z, 154);
    const sofa = (x0, z0, x1, z1, c) => { F.box(x0, 0, z0, x1, 2.5, z1, c); F.box(x0, 2.5, z0, x1, 5, z0 + 1, c); F.box(x0 - 0.8, 0, z0, x0, 3.6, z1, c); F.box(x1, 0, z0, x1 + 0.8, 3.6, z1, c); };
    sofa(-7, -18, 7, -13.8, 23);
    F.box(-3, 0, -24, 3, 2, -19.6, 192); F.box(-1.5, 2, -22.5, 1.5, 2.4, -21, 1); // coffee table with a magazine
    F.box(-9, 0, -30, -4, 1.8, -25.4, 21); // ottoman
    sofa(5.6, -31, 10.6, -25.8, 28); // armchair
    // dining table and chairs
    F.box(-10, 3.6, -40, 0, 4.2, -33, 192); for (const [x, z] of [[-9.5, -39.5], [-0.5, -39.5], [-9.5, -33.5], [-0.5, -33.5]]) F.box(x - 0.3, 0, z - 0.3, x + 0.3, 3.6, z + 0.3, 192);
    for (const [x, z] of [[-12, -36.5], [2, -36.5]]) { F.box(x - 1, 2.2, z - 1, x + 1, 2.6, z + 1, 192); F.box(x - 0.2, 0, z - 0.2, x + 0.2, 2.2, z + 0.2, 192); }
    // the piano
    F.box(4, 0, -47, 13, 4.2, -42.5, 26); F.box(4, 4.2, -47, 13, 7, -46, 26); F.box(4.2, 4.2, -42.8, 12.8, 4.5, -42.3, 1);
    F.box(6, 2.4, -41.5, 11, 2.9, -40, 26);
    // the TV on its stand (a side route)
    F.box(-22, 0, -24, -17, 3, -20, 192); F.box(-21.5, 3, -22.6, -17.5, 6, -22, 26);
    F.box(-22, 0, -14, -18, 1.4, -10.4, 24);
    // the bookshelf at the back: a footstool, a ledge, a shelf, the top - and the trophy up there
    F.box(-2, 0, -48.5, 2, 2.2, -45, 21);
    F.box(-7, 0, Z1, 7, 9, Z1 + 2.5, 192);
    F.box(-7, 0, Z1 + 2.5, 7, 1.2, Z1 + 5, 192);
    F.box(-7, 4.5, Z1 + 2.5, 7, 5, Z1 + 4, 192);
    for (const y of [1.3, 5.1]) for (let i = 0; i < 18; i++) { const x = -6.6 + i * 0.73; F.box(x, y, Z1 + 2.3, x + 0.6, y + rnd(1.6, 3), Z1 + 2.52, pick([21, 23, 28, 24, 104, 1]), { canCollide: false }); }
    const trophy = F.add(blocks([[1, 0.4, 1, 0, 0.2, 0, 24, { shape: 'cyl' }], [0.4, 1, 0.4, 0, 0.9, 0, 24, { shape: 'cyl' }], [1.6, 1.4, 1.6, 0, 2, 0, 24, { shape: 'cyl' }]]));
    trophy.position.set(0, 9, Z1 + 1.25); F.state.trophy = trophy;
    F.state.bub = 0;
  },
  start(F) { A.lavaBubbles(0.35); F.sound(null, 'lava'); },
  update(F, dt, t) {
    const S = F.state;
    S.lava.material.map.offset.x = (t * 0.02) % 1; S.lava.material.map.offset.y = Math.sin(t * 0.3) * 0.05;
    S.trophy.rotation.y += dt;
    S.bub -= dt;
    if (S.bub <= 0) { S.bub = rnd(0.15, 0.5); F.burst('spark', V(rnd(-22, 22), 0.8, rnd(-58, -13)), 4, { speed: [2, 7], size: [0.3, 0.8], life: [0.4, 1], gravity: 1, dir: V(0, 1, 0), cone: 0.4 }); }
    if (!S.won) for (const ch of F.chars()) if (ch.rootPosition.distanceTo(S.trophy.position.clone().add(V(0, 2, 0))) < 3.5) { S.won = true; S.trophy.visible = false; F.bonus(ch, 'Lava Champion', 3); A.sparkle(S.trophy.position); }
  },
  tint(F, ch) { return ch?.alive && ch.rootPosition.y < 4.5 && ch.rootPosition.z < -11 ? ['radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(255,90,0,0.35))', 1] : null; },
};

// --- the disco ---------------------------------------------------------------------------------------------------------------------------------------------
const DISCO_COLS = ['#ff2a6a', '#ffd02a', '#2affc0', '#2a8aff', '#c02aff', '#ff6a2a', '#5aff2a', '#ffffff'];
export const disco = {
  id: 'disco', name: 'Disco Fever', hint: 'Dance! But when the music stops - FREEZE.', color: '#ff5adc', time: 36, music: 'disco',
  look: { skyColor: 0x05020a, amb: [0x8a6aff, 0x200a30, 0.75], sun: [0xc0a0ff, 0.25], fog: [0x0a0414, 90, 220] },
  bots: { venture: 0.8, spots: [[-6, -26], [6, -26], [-6, -36], [6, -36], [0, -31], [-10, -31], [10, -31]], area: [-14, -42, 14, -20] },
  lines: ['DISCO', 'dance party!!', 'woooo', 'look at my moves', 'this song is fire', 'freeze!!', '*dances*'],
  build(F) {
    const X0 = -26, X1 = 26, Z1 = -56, H = 20;
    F.room({ x0: X0, x1: X1, z1: Z1, h: H, floor: 26, wall: 26, ceiling: 26, frame: 104 });
    // the dance floor: a glowing grid redrawn on the beat
    const lt = liveTex(256, 256); F.state.floorTex = lt;
    F.state.dance = F.plane(lt.tex, 32, 24, [0, 0.05, -31], [-90, 0, 0], { basic: true, transparent: false });
    F.box(-16.5, 0, -43.5, 16.5, 0.04, -18.5, 199, { canCollide: false });
    // neon strips on the walls
    for (const [y, c] of [[3, 21], [9, 23], [15, 104]]) { F.box(X0, y, Z1, X0 + 0.2, y + 0.4, DOOR_Z - 1, c, { material: 'Neon', canCollide: false }); F.box(X1 - 0.2, y, Z1, X1, y + 0.4, DOOR_Z - 1, c, { material: 'Neon', canCollide: false }); F.box(X0, y, Z1, X1, y + 0.4, Z1 + 0.2, c, { material: 'Neon', canCollide: false }); }
    // the DJ booth and speakers
    F.box(-8, 0, -54, 8, 4, -49, 26); F.box(-8.2, 4, -54.2, 8.2, 4.3, -48.8, 104, { material: 'Neon' });
    for (const x of [-4, 4]) F.add(blocks([[3, 0.4, 3, 0, 0, 0, 199, { shape: 'cyl' }], [2.6, 0.1, 2.6, 0, 0.25, 0, 26, { shape: 'cyl' }]])).position.set(x, 4.4, -51.5);
    F.state.speakers = [];
    for (const x of [-20, 20]) { F.box(x - 3, 0, -54, x + 3, 12, -49, 26); const cone = F.add(blocks([[3.6, 3.6, 0.6, 0, 0, 0, 199, { shape: 'cyl', rx: 90 }], [1.6, 1.6, 0.8, 0, 0, 0.2, 26, { shape: 'cyl', rx: 90 }]])); cone.position.set(x, 4, -48.9); const tw = F.add(blocks([[1.8, 1.8, 0.6, 0, 0, 0, 199, { shape: 'cyl', rx: 90 }]])); tw.position.set(x, 9, -48.9); F.state.speakers.push(cone, tw); }
    const dj = F.puppet({ colors: { head: 24, torso: 104, leftArm: 24, rightArm: 24, leftLeg: 26, rightLeg: 26 }, hats: ['TBoneVisor'] }, { at: [0, 0, -56, Math.PI] });
    dj.pose = (a, t) => { a.rs = 1.5 + Math.sin(t * 8.1) * 0.3; a.ls = 1.5 + (Math.sin(t * 2) > 0.6 ? 1.4 : 0); };
    // the mirror ball and its lights
    const mb = F.add(new THREE.Mesh(new THREE.SphereGeometry(2.2, 18, 12), new THREE.MeshPhongMaterial({ color: 0xdadde6, shininess: 120, specular: 0xffffff, flatShading: true, emissive: 0x30303a })));
    mb.position.set(0, H - 4, -31); F.state.ball = mb;
    F.box(-0.1, H - 2, -31.1, 0.1, H, -30.9, 199, { canCollide: false });
    F.state.lights = [0, 1, 2].map((i) => F.light(V(0, 8, -31), [0xff2a8a, 0x2affd0, 0x8a2aff][i], 120, 34));
    // lasers
    F.state.lasers = [];
    for (const x of [-18, 18]) { const g = new THREE.Group(); g.position.set(x, H - 1, -20); for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 40, 4).translate(0, -20, 0), new THREE.MeshBasicMaterial({ color: [0xff2020, 0x20ff40, 0x2060ff][i], blending: THREE.AdditiveBlending, transparent: true, opacity: 0.8, depthWrite: false })); m.rotation.z = (i - 1) * 0.35; g.add(m); } F.add(g); F.state.lasers.push(g); }
    // dancers
    F.state.dancers = [];
    const outfits = [[24, 21, 26], [24, 23, 1], [24, 104, 26], [24, 1, 21], [24, 24, 23]];
    for (const [i, [x, z]] of [[-10, -26], [11, -27], [-8, -38], [9, -39], [0, -42]].entries()) {
      const [h, t, l] = outfits[i];
      const d = F.puppet({ colors: { head: h, torso: t, leftArm: h, rightArm: h, leftLeg: l, rightLeg: l } }, { at: [x, 0, z, rnd(-3, 3)] });
      const style = i % 3;
      d.pose = (a, tt) => { const b = tt * 4.07; if (F.state.freeze) { a.rs = a.ls = 3; a.rh = a.lh = 0; return; } if (style === 0) { a.rs = Math.sin(b) > 0 ? 3 : 0.4; a.ls = Math.sin(b) > 0 ? 0.4 : 3; } else if (style === 1) { a.rs = 1.6 + Math.sin(b * 2) * 0.6; a.ls = 1.6 - Math.sin(b * 2) * 0.6; a.rh = Math.sin(b) * 0.4; a.lh = -Math.sin(b) * 0.4; } else { a.rs = a.ls = 2.4 + Math.sin(b * 2) * 0.5; } };
      F.state.dancers.push(d);
    }
    F.state.freeze = false; F.state.nextFreeze = rnd(7, 10); F.state.frozeOK = new Map();
  },
  start(F) {
    // people on the dance floor dance
    F.state.dancing = new Set();
    F.every(0, () => {
      for (const ch of F.chars()) {
        const p = ch.rootPosition, on = Math.abs(p.x) < 16 && p.z < -18.5 && p.z > -43.5;
        if (on && !ch.pose) { ch.pose = (c, des, M) => { if (F.state.freeze) return; const b = F.t * 4.07; if (c.input.move.lengthSq() > 0.01) return; des.rs = Math.sin(b) > 0 ? 3 : 0.5; des.ls = Math.sin(b) > 0 ? 0.5 : 3; M.rs = M.ls = 0.4; }; F.state.dancing.add(ch); }
        else if (!on && F.state.dancing.has(ch)) { ch.pose = null; F.state.dancing.delete(ch); }
      }
    });
  },
  update(F, dt, t) {
    const S = F.state, beat = Math.floor(t * 122 / 60);
    if (beat !== S.beat && !S.freeze) {
      S.beat = beat;
      S.floorTex.redraw((x, w, h) => { const n = 8; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = Math.random() < 0.55 ? DISCO_COLS[(i * 3 + j * 5 + beat) % DISCO_COLS.length] : '#140a1e'; x.fillRect(i * w / n + 2, j * h / n + 2, w / n - 4, h / n - 4); } });
      for (const s of S.speakers) s.scale.setScalar(1.12);
    }
    for (const s of S.speakers) s.scale.lerp(V(1, 1, 1), Math.min(1, dt * 8));
    S.ball.rotation.y += dt * 0.8;
    S.lights.forEach((l, i) => { if (l.l) { const a = t * (0.7 + i * 0.3) + i * 2.1; l.l.position.set(Math.cos(a) * 14, 4 + Math.sin(a * 1.3) * 2, -31 + Math.sin(a) * 10); l.set(S.freeze ? 20 : 120); } });
    for (const [i, g] of S.lasers.entries()) { g.rotation.x = Math.sin(t * 1.3 + i) * 0.6; g.rotation.z = Math.cos(t * 0.9 + i * 2) * 0.5; g.visible = !S.freeze; }
    // musical statues: the music stops - anyone moving on the dance floor gets thrown off it
    S.nextFreeze -= dt;
    if (!S.freeze && S.nextFreeze <= 0 && F.E.cur.time - t > 6) {
      S.freeze = true; S.freezeT = 2.6; A.stopSong('floor'); A.errorSound();
      F.say('DJ', 'FREEZE!!', S.dancers[0]);
      for (const ch of S.dancing) ch.input.move?.set?.(0, 0, 0);
    }
    if (S.freeze) {
      S.freezeT -= dt;
      if (S.freezeT < 2.2) for (const ch of [...S.dancing]) {
        if (!ch.alive) continue;
        const v = ch.body.velocity, moving = Math.hypot(v.x, v.z) > 2 || v.y > 5;
        if (moving && !ch.platformStand) { A.zap(ch.rootPosition); F.fling(ch, V(0, 40, 40), 1.4); S.frozeOK.set(ch, -99); if (ch.player?.isLocal) F.E.ui.toast('You moved! OUT!', '#ff5a5a', 'rgba(80,10,20,.9)'); }
      }
      // (the bots mostly hold still; some don't)
      for (const p of F.E.game.players) if (p.brain && S.dancing.has(p.character)) { if (!p.brain.wobbly) p.brain.wobbly = Math.random() < 0.25 ? 1 : -1; if (p.brain.wobbly < 0) { p.brain.target = null; p.character.input.move.set(0, 0, 0); } }
      if (S.freezeT <= 0) {
        S.freeze = false; S.nextFreeze = rnd(6, 9); A.playSong('floor', 'disco', 0.4);
        for (const ch of S.dancing) if (ch.alive && !ch.platformStand) { const n = (S.frozeOK.get(ch) || 0) + 1; S.frozeOK.set(ch, n); if (n === 2) F.bonus(ch, 'Statue Champion', 2); }
        for (const p of F.E.game.players) if (p.brain) p.brain.wobbly = 0;
      }
    }
  },
  end(F) { for (const ch of F.state.dancing || []) ch.pose = null; },
};
void clamp; void FACES; void DOOR_Z;
