// Floors: the office fire drill, the sky islands, candy land, the construction site, the wild west.
import * as THREE from 'three';
import { V, rnd, pick, clamp, ctex, blocks, tiled, DOOR_Z, FACES, faceTex, textTex } from '../kit.js';
import * as A from '../audio.js';
import { GROUP } from '../../../engine/Part.js';
import { tex as dtex } from '../../disasters/effects.js';

const DRESS = (skin, top, legs) => ({ colors: { head: skin, torso: top, leftArm: skin, rightArm: skin, leftLeg: legs, rightLeg: legs } });
const SUIT = (top = 26) => ({ colors: { head: 24, torso: top, leftArm: top, rightArm: top, leftLeg: top, rightLeg: top } });
const flat = (p) => V(p.x, 0, p.z);

// --- the office fire drill ----------------------------------------------------------------------------------------------------------------------------------
export const office = {
  id: 'office', name: 'The Office', hint: 'Just another Monday. Is that smoke?', color: '#dadada', time: 34,
  look: { skyColor: 0x101010, amb: [0xf4f6f8, 0x8a8a90, 1.35], sun: [0xffffff, 0.35], fog: [0x101010, 300, 600] },
  bots: { venture: 0.6, spots: [[0, -20], [0, -40], [0, -60], [-10, -30], [10, -48], [20, -66], [-22, -68]], area: [-4, -70, 4, -16] },
  lines: ['an office', 'boring', 'FIRE', 'is this a drill', 'the printer is broken', 'where is the extinguisher', 'my stapler'],
  build(F) {
    const X0 = -30, X1 = 30, Z1 = -78, H = 12, S = F.state;
    F.room({ x0: X0, x1: X1, z1: Z1, h: H, floor: 135, wall: 1, ceiling: 1, frame: 199 });
    for (let x = -24; x <= 24; x += 12) for (let z = -18; z > Z1; z -= 10) F.box(x - 2.5, H - 0.12, z - 1.5, x + 2.5, H, z + 1.5, 1, { material: 'Neon', canCollide: false });
    // cubicles either side of the aisle
    S.workers = [];
    for (const s of [-1, 1]) for (const z of [-20, -34, -48]) {
      const x0 = s > 0 ? 6 : -22, x1 = x0 + 16, z0 = z - 6, z1 = z + 6;
      F.box(x0, 0, z0, x1, 5, z0 + 0.4, 194); F.box(x0, 0, z0, x0 + 0.4, 5, z1, 194); F.box(x1 - 0.4, 0, z0, x1, 5, z1, 194); F.box(x0 + 7.8, 0, z0, x0 + 8.2, 5, z1 - 3, 194);
      for (const dx of [2, 10]) {
        const cx = x0 + dx;
        F.box(cx - 1.5, 2.8, z0 + 0.4, cx + 4.2, 3.2, z0 + 3, 192); F.box(cx - 1.5, 0, z0 + 0.4, cx - 1.2, 2.8, z0 + 3, 192);
        F.add(blocks([[2.4, 1.8, 0.3, 0, 1.2, 0, 26], [2.1, 1.5, 0.05, 0, 1.2, 0.16, 102, { emissive: 0.8 }], [0.4, 0.4, 0.4, 0, 0.2, 0, 26]])).position.set(cx + 1.2, 3.2, z0 + 1.2);
        if (Math.random() < 0.5) { const w = F.puppet(DRESS(24, pick([23, 28, 1, 21, 104]), 26), { at: [cx + 1.2, 0.7, z0 + 4.4, 0] }); w.pose = (a, t) => { a.rh = a.lh = 1.57; a.rs = 1.2 + Math.sin(t * 11 + dx) * 0.1; a.ls = 1.2 - Math.sin(t * 11 + dx) * 0.1; }; S.workers.push(w); F.box(cx + 0.2, 0, z0 + 3.6, cx + 2.2, 2.2, z0 + 5.6, 26, { canCollide: false }); }
      }
    }
    // the break room (back left) - where it starts
    F.box(-30, 0, -64, -14, 5, -63.6, 1); F.box(-30, 0, Z1, -29, 9, -64, 1);
    F.box(-29, 0, Z1, -16, 3.6, -74, 194); F.box(-29.2, 3.6, Z1, -15.8, 4, -73.8, 199);
    S.micro = V(-24, 4.9, -75.5);
    F.add(blocks([[3, 1.8, 2, 0, 0, 0, 1], [1.8, 1.3, 0.1, -0.3, 0, -1.02, 26, { emissive: 0.4 }]])).position.set(-24, 4.9, -75.5);
    F.add(blocks([[2, 3, 2, 0, 0, 0, 26], [1, 0.8, 0.8, 0, -0.6, -1, 1]])).position.set(-19, 5.5, -75.5);
    F.box(-29, 0, -72, -26, 8, -69, 1);
    F.sign(-22, 8, Z1 + 0.2, 7, 2, 'PLEASE CLEAN\nTHE MICROWAVE', { bg: '#ffffff', fg: '#222', face: 'z', noBoard: true });
    // the boss's glass office (back right)
    F.box(14, 0, -62, 22, 10, -61.7, 42, { transparency: 0.6 }); F.box(26, 0, -62, 30, 10, -61.7, 42, { transparency: 0.6 }); F.box(13.7, 0, Z1, 14, 10, -61.7, 42, { transparency: 0.6 });
    F.box(16, 0, -74, 28, 3.4, -70, 192);
    S.boss = F.puppet(SUIT(26), { at: [22, 0, -76, Math.PI], faceTex: FACES.angry() });
    S.boss.pose = (a) => { a.rs = S.panic ? 2.6 : 0.2; a.ls = S.panic ? 2.6 : 0.2; };
    F.plane(textTex('SYNERGY', { bg: '#1a3a6a', fg: '#ffffff', w: 512, h: 160, border: '#ffd84a' }), 8, 2.5, [22, 7, Z1 + 0.1], [0, 0, 0]);
    F.plane(ctex('hang', 128, 160, (x, w, h) => { x.fillStyle = '#111'; x.fillRect(0, 0, w, h); x.fillStyle = '#8ab8e8'; x.fillRect(8, 8, w - 16, h - 46); x.fillStyle = '#8a6a3a'; x.fillRect(w / 2 - 2, 8, 4, 40); x.fillStyle = '#d8a050'; x.beginPath(); x.arc(w / 2, 62, 16, 0, 7); x.fill(); x.fillStyle = '#fff'; x.font = 'bold 13px Arial'; x.textAlign = 'center'; x.fillText('HANG IN THERE', w / 2, h - 18); }), 3.2, 4, [X1 - 0.1, 7, -30], [0, -90, 0]);
    // the printer, the water cooler, the extinguisher, the fire alarm
    F.box(2.5, 0, -27, 5.5, 3.2, -24, 1); F.add(blocks([[2.6, 0.2, 1.6, 0, 0, 0, 199]])).position.set(4, 3.3, -25.5);
    F.add(blocks([[2, 4, 2, 0, 2, 0, 1], [1.7, 2.4, 1.7, 0, 5.2, 0, 42, { shape: 'cyl', opacity: 0.55 }]])).position.set(-27, 0, -14);
    S.ext = F.add(blocks([[0.9, 2.4, 0.9, 0, 0, 0, 21, { shape: 'cyl' }], [0.4, 0.4, 0.4, 0, 1.4, 0, 26], [0.2, 0.2, 1, 0, 1.5, 0.5, 26]])); S.ext.position.set(X0 + 0.6, 3.5, -38);
    F.sign(X0 + 0.1, 5.6, -38, 2.4, 0.8, 'FIRE', { bg: '#c4281c', fg: '#ffffff', face: 'x', noBoard: true });
    F.pickup(S.ext, 2.8, (ch) => {
      F.bonus(ch, 'Fire Warden', 2); A.hiss(0.3); F.at(F.t + 1.5, () => A.stop('hiss'));
      for (const c of S.cells) if (c.fire && c.pos.distanceTo(ch.rootPosition) < 24) { c.fire.stop(); c.fire = null; c.out = true; F.burst(0xffffff, c.pos.clone().add(V(0, 2, 0)), 10, { speed: [2, 6], size: [1.5, 3], life: [0.8, 1.6], gravity: -0.05, grow: 1 }); }
    }, { offset: V(1, 0, 0) });
    S.strobe = F.light(V(0, 10, -40), 0xff2020, 0, 60);
    // the fire grid
    S.cells = [];
    for (let x = -27; x <= 27; x += 6) for (let z = -20; z >= -74; z -= 6) S.cells.push({ x, z, pos: V(x, 0, z), fire: null, out: false });
    S.spreadT = 0;
  },
  start(F) { A.fluorescent(0.05); F.sound(null, 'fluor'); F.state.printT = 4; },
  update(F, dt, t) {
    const S = F.state;
    // the printer spits out paper
    S.printT -= dt;
    if (S.printT <= 0) { S.printT = rnd(4, 7); A.ticket(); const p = F.add(blocks([[1.6, 0.04, 2.2, 0, 0, 0, 1]])); p.position.set(4, 3.4, -24.2); let vy = 0; F.every(0, (d) => { if (p.position.y > 0.05) { vy -= 8 * d; p.position.y = Math.max(0.05, p.position.y + vy * d); p.position.z += d * 2; p.rotation.y += d; } }); if (Math.random() < 0.4) F.say('Printer', 'PC LOAD LETTER', V(4, 4, -25.5)); }
    // the microwave catches fire
    if (!S.burning && t > 8) {
      S.burning = true; S.panic = true;
      const c0 = S.cells.reduce((a, c) => (c.pos.distanceTo(V(-24, 0, -74)) < a.pos.distanceTo(V(-24, 0, -74)) ? c : a));
      ignite(F, c0); A.explosion(S.micro, 0.4); F.shake(0.3);
      A.alarmBell(0.2); F.sound(null, 'alarm');
      F.say('Boss', 'This is just a drill! Everybody remain calm! Keep working!', S.boss);
      F.at(t + 2, () => { F.E.weather.set('rain', 0.6); A.rain(0.2); F.sound(null, 'rain'); });
    }
    if (S.burning) {
      S.strobe.set(Math.floor(t * 3) % 2 ? 80 : 0);
      S.spreadT -= dt;
      if (S.spreadT <= 0) {
        S.spreadT = 0.8;
        const lit = S.cells.filter((c) => c.fire);
        if (lit.length < 34) for (const c of lit) for (const n of S.cells) if (!n.fire && !n.out && Math.abs(n.x - c.x) + Math.abs(n.z - c.z) === 6 && Math.random() < 0.2) ignite(F, n);
      }
      for (const c of S.cells) if (c.fire) for (const ch of F.chars()) { const q = ch.rootPosition; if (Math.abs(q.x - c.x) < 3 && Math.abs(q.z - c.z) < 3 && q.y < 8) F.hurt(ch, 45 * dt, 'got fired. Literally'); }
      if ((S.bossT = (S.bossT ?? 5) - dt) <= 0) { S.bossT = rnd(5, 8); F.say('Boss', pick(['Has anyone seen my stapler?', 'Those TPS reports are still due!', 'Nobody leave until 5!', "It's FINE. It's FINE."]), S.boss); }
    }
  },
  closing(F) { F.say('Boss', 'OK. Maybe it is not a drill.', F.state.boss); },
  end(F) { F.E.weather.set(null); },
  botTick(F, bot) { if (F.state.burning && bot.mode === 'out') for (const c of F.state.cells) if (c.fire && c.pos.distanceTo(flat(bot.ch.rootPosition)) < 9) { bot.mode = 'return'; break; } },
};
function ignite(F, c) { c.fire = F.flame(c.pos.clone().add(V(0, 0.5, 0)), 4.5); A.crackle(0.25); F.sound(null, 'crackle'); }

// --- the sky islands -------------------------------------------------------------------------------------------------------------------------------------------
function island(F, x, y, z, r, o = {}) {
  F.add(blocks([[2 * r, 2, 2 * r, 0, -1, 0, 37, { shape: 'cyl' }], [2 * r * 0.98, r * 1.6, 2 * r * 0.98, 0, -2 - r * 0.8, 0, 192, { shape: 'cone', rx: 180 }], [r * 0.9, r * 0.8, r * 0.9, r * 0.2, -3 - r * 1.2, 0, 199, { shape: 'cone', rx: 180 }]])).position.set(x, y, z);
  for (const [a, b] of [[0.92, 0.4], [0.4, 0.92], [0.72, 0.72]]) F.box(x - r * a, y - 2, z - r * b, x + r * a, y, z + r * b, 37, { transparency: 1 });
  if (o.tree) { F.box(x - 0.8, y, z - 0.8, x + 0.8, y + 12, z + 0.8, 192); F.add(blocks([[9, 7, 9, 0, 0, 0, 28, { shape: 'ball' }], [6, 5, 6, 2, 2.5, 1, 37, { shape: 'ball' }]])).position.set(x, y + 13, z); }
}
function bridge(F, a, b, S) {
  const d = b.clone().sub(a), L = Math.hypot(d.x, d.z), n = Math.floor(L / 1.6), yaw = Math.atan2(d.x, d.z) * 180 / Math.PI;
  for (let i = 0; i <= n; i++) {
    const p = a.clone().lerp(b, i / n);
    const sag = Math.sin(i / n * Math.PI) * Math.min(2.4, L * 0.05);
    const pl = F.part({ name: 'Plank', size: [4, 0.4, 1.2], position: [p.x, p.y - 0.2 - sag, p.z], rotation: [0, yaw, 0], color: 192, top: 'Smooth' });
    S.planks.push(pl);
  }
  // the ropes
  for (const s of [-1, 1]) {
    const side = V(d.z, 0, -d.x).normalize().multiplyScalar(2.2 * s), pts = [];
    for (let i = 0; i <= 12; i++) { const p = a.clone().lerp(b, i / 12).add(side); p.y += 2.4 - Math.sin(i / 12 * Math.PI) * Math.min(2.4, L * 0.05); pts.push(p); }
    F.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.12, 4), new THREE.MeshPhongMaterial({ color: 0xc8a870 })));
  }
}
export const sky = {
  id: 'sky', name: 'Sky Islands', hint: "Islands in the clouds. Don't look down.", color: '#9ad8ff', time: 36,
  look: { sky: 'day', amb: [0xeaf4ff, 0xb8c8d8, 1.5], sun: [0xfff6e0, 1.4], fog: [0xd8ecff, 200, 900] },
  bots: { venture: 0.6, spots: [[-22, -44], [18, -50], [-4, -76], [2, -70], [-8, -80]], area: [-8, -82, 4, -68] },
  lines: ['so high up', 'dont fall', 'the bridge is wobbly', 'WIND', 'treasure!!', 'i can see my house', 'clouds'],
  build(F) {
    const S = F.state; S.planks = [];
    const I = [[0, 0, -19, 10.5, {}], [-24, 0, -46, 8, { tree: true }], [20, 2, -50, 7, {}], [-4, 0, -80, 11, { tree: true }], [26, 4, -104, 6, {}], [-22, 6, -118, 8, {}], [44, 8, -72, 3.4, {}]];
    for (const [x, y, z, r, o] of I) island(F, x, y, z, r, o);
    const top = (k) => V(I[k][0], I[k][1], I[k][2]);
    const edge = (k, j) => { const a = top(k), b = top(j), d = b.clone().sub(a).setY(0).normalize(); return [a.clone().addScaledVector(d, I[k][3] * 0.8), b.clone().addScaledVector(d, -I[j][3] * 0.8)]; };
    for (const [k, j] of [[0, 1], [0, 2], [1, 3], [2, 3], [3, 5]]) { const [a, b] = edge(k, j); bridge(F, a, b, S); }
    // stepping stones: to the far island, and to the tiny one with the feather
    for (const [a, b, n] of [[3, 4, 4], [2, 6, 3]]) { const [p, q] = edge(a, b); for (let i = 1; i <= n; i++) { const s = p.clone().lerp(q, i / (n + 1)); island(F, s.x, s.y, s.z, 1.8); } }
    // treasure
    S.chest = F.add(blocks([[3.4, 2, 2.4, 0, 1, 0, 192], [3.4, 1.2, 2.4, 0, 2.6, 0, 192, { shape: 'cyl', rz: 90 }], [3.5, 0.3, 0.3, 0, 1.6, -1.2, 24], [0.5, 0.6, 0.2, 0, 1.6, -1.3, 24]])); S.chest.position.set(-22, 6, -120);
    F.pickup(S.chest, 4, (ch) => { F.bonus(ch, 'Sky Treasure', 3); F.burst('spark', V(-22, 9, -120), 20, { speed: [3, 9], size: [0.3, 0.6], life: [0.6, 1.2] }); }, { offset: V(0, 2, 0), keep: true });
    S.feather = F.add(blocks([[0.3, 3, 1.2, 0, 0, 0, 24, { emissive: 0.5, rz: 20 }]])); S.feather.position.set(44, 10, -72); F.spin(S.feather, 1.5, 0.3);
    F.pickup(S.feather, 3, (ch) => F.bonus(ch, 'Golden Feather', 3));
    // clouds below and around, and birds
    for (let i = 0; i < 40; i++) { const c = F.add(blocks([[rnd(14, 30), rnd(5, 9), rnd(10, 20), 0, 0, 0, 1, { shape: 'ball', opacity: 0.92 }], [rnd(10, 18), rnd(4, 7), rnd(8, 14), rnd(-8, 8), rnd(1, 3), rnd(-4, 4), 1, { shape: 'ball', opacity: 0.92 }]], { shadow: false })); c.position.set(rnd(-220, 220), rnd(-60, -14) + (Math.random() < 0.25 ? rnd(40, 70) : 0), rnd(-300, 40)); c.userData.v = rnd(1, 3); }
    S.clouds = F.objects.slice(-40);
    S.birds = [];
    for (let i = 0; i < 5; i++) { const b = F.add(blocks([[2, 0.2, 0.6, -0.9, 0, 0, 26, { rz: 20 }], [2, 0.2, 0.6, 0.9, 0, 0, 26, { rz: -20 }]], { shadow: false })); b.userData.ph = rnd(0, 6); b.userData.r = rnd(40, 90); b.userData.y = rnd(20, 40); S.birds.push(b); }
    F.fallKill(-70, 'fell off the sky islands');
    S.gustT = 9; S.strikes = [];
  },
  start(F) { A.wind(0.25); F.sound(null, 'wind'); },
  update(F, dt, t) {
    const S = F.state;
    for (const c of S.clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 240) c.position.x -= 480; }
    for (const b of S.birds) { const a = t * 0.25 + b.userData.ph; b.position.set(Math.cos(a) * b.userData.r, b.userData.y, -60 + Math.sin(a) * b.userData.r); b.rotation.y = -a; b.children.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * Math.sin(t * 8 + b.userData.ph) * 0.4; }); }
    // gusts of wind push people along the bridges
    S.gustT -= dt;
    if (S.gustT <= 0 && !S.gust) { const a = rnd(0, 6.28); S.gust = { v: V(Math.cos(a), 0, Math.sin(a)).multiplyScalar(9), until: t + 2.5 }; A.volume('wind', 0.6); A.whoosh(V(0, 4, -50)); F.E.ui.toast('~~ A gust of wind! ~~', '#d8ecff', 'rgba(40,60,90,.85)'); }
    if (S.gust) {
      for (const p of S.planks) p.surfaceVelocity = S.gust.v;
      if (Math.random() < dt * 30) F.burst(0xffffff, V(rnd(-40, 40), rnd(0, 10), rnd(-120, -14)), 1, { speed: [20, 30], size: [0.2, 0.4], life: [0.5, 1], gravity: 0, dir: S.gust.v.clone().normalize(), cone: 0.1 });
      if (t > S.gust.until) { for (const p of S.planks) p.surfaceVelocity = null; S.gust = null; S.gustT = rnd(6, 9); A.volume('wind', 0.25); }
    }
    // the storm at the end: lightning
    for (const s of [...S.strikes]) {
      s.t -= dt;
      if (s.t > 0) { s.ring.material.opacity = 0.3 + Math.abs(Math.sin(s.t * 12)) * 0.4; continue; }
      if (!s.hit) {
        s.hit = true; A.thunder(s.p); F.E.ui.flash('#ffffff', 0.6); F.shake(0.4);
        const bolt = F.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 200, 6), new THREE.MeshBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0.9 }))); bolt.position.copy(s.p).add(V(0, 100, 0)); s.bolt = bolt;
        for (const ch of F.chars()) if (Math.hypot(ch.rootPosition.x - s.p.x, ch.rootPosition.z - s.p.z) < 4 && Math.abs(ch.rootPosition.y - s.p.y - 3) < 6) F.kill(ch, 'was struck by lightning', s.p);
      }
      if (s.t < -0.2) { F.E.world.scene.remove(s.bolt); F.E.world.scene.remove(s.ring); S.strikes.splice(S.strikes.indexOf(s), 1); }
    }
    if (S.storm && (S.boltT = (S.boltT || 0) - dt) <= 0) {
      S.boltT = rnd(0.5, 1);
      const tgt = pick(F.chars({ outside: true }));
      const p = tgt ? flat(tgt.rootPosition).add(V(rnd(-3, 3), tgt.rootPosition.y - 3, rnd(-3, 3))) : V(rnd(-30, 30), 0, rnd(-110, -30));
      const ring = F.add(new THREE.Mesh(new THREE.RingGeometry(2.6, 4, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe040, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }))); ring.position.copy(p).add(V(0, 0.1, 0));
      S.strikes.push({ p, ring, t: 1.2 });
    }
  },
  closing(F) {
    const S = F.state; S.storm = true;
    F.E.env.apply({ sky: 'storm', amb: [0x9aa4b0, 0x40464c, 1.1], sun: [0xc8d0d8, 0.5], fog: [0x40484e, 120, 500] });
    A.thunder(V(0, 40, -60)); F.E.weather.set('rain', 0.8);
  },
  end(F) { F.E.weather.set(null); },
  botTick(F, bot) { if (F.state.storm && bot.mode === 'out') bot.mode = 'return'; },
};

// --- candy land ----------------------------------------------------------------------------------------------------------------------------------------------------
function lollipop(F, x, z, h, c) {
  F.box(x - 0.4, 0, z - 0.4, x + 0.4, h, z + 0.4, 1);
  const tex = ctex('swirl' + c, 128, 128, (g, w) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, w); g.strokeStyle = c; g.lineWidth = 10; g.beginPath(); for (let a = 0; a < 26; a += 0.1) { const r = a * 2.4; g.lineTo(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r); } g.stroke(); });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 1, 28).rotateX(Math.PI / 2), [new THREE.MeshPhongMaterial({ color: c }), new THREE.MeshPhongMaterial({ map: tex, shininess: 80 }), new THREE.MeshPhongMaterial({ map: tex, shininess: 80 })]);
  disc.position.set(x, h + 3.6, z); disc.rotation.y = rnd(-0.4, 0.4); F.add(disc);
}
function gingerFace() { return faceTex('ginger', (x, S) => { x.fillStyle = '#ffffff'; for (const s of [-1, 1]) { x.beginPath(); x.arc(S * (0.5 + s * 0.1), S * 0.4, S * 0.04, 0, 7); x.fill(); } x.strokeStyle = '#ffffff'; x.lineWidth = S * 0.03; x.beginPath(); x.arc(S * 0.5, S * 0.5, S * 0.14, 0.3, Math.PI - 0.3); x.stroke(); }); }
export const candy = {
  id: 'candy', name: 'Candy Land', hint: 'Everything is edible. Catch the Gingerbread Man!', color: '#ff8ad8', time: 36, music: 'musicbox',
  look: { sky: 'pink', amb: [0xfff0f8, 0xe8a8c8, 1.45], sun: [0xfff4f8, 1.25], fog: [0xffd8ee, 150, 600] },
  bots: { venture: 0.9, spots: [[-14, -28], [14, -30], [-26, -50], [24, -56], [0, -44], [-6, -70], [30, -80]], area: [-30, -76, 30, -18] },
  lines: ['CANDY', 'i want to eat everything', 'the river is chocolate!!', 'catch him!', 'gumdrops', 'sugar rush', 'yum'],
  build(F) {
    const S = F.state;
    F.ground(-200, -85, 200, 40, 223, { top: 'Smooth' }); F.ground(-200, -260, 200, -107, 223, { top: 'Smooth' });
    F.box(-200, -3, -107, 200, -1.8, -85, 192);
    F.box(-200, -1.8, -85.6, 200, -1, -85, 223); F.box(-200, -1.8, -107, 200, -1, -106.4, 223);
    const fondant = ctex('sprinkles', 128, 128, (x, w) => { x.fillStyle = '#ffd0e4'; x.fillRect(0, 0, w, w); for (let i = 0; i < 70; i++) { x.fillStyle = pick(['#ff3a6a', '#3ac8ff', '#ffe03a', '#6aff6a', '#ffffff', '#c86aff']); x.save(); x.translate(rnd(0, w), rnd(0, w)); x.rotate(rnd(0, 3)); x.fillRect(-4, -1.2, 8, 2.4); x.restore(); } });
    F.plane(tiled(fondant, 40, 12.5), 400, 125, [0, 0.03, -22.5], [-90, 0, 0]); F.plane(tiled(fondant, 40, 15.3), 400, 153, [0, 0.03, -183.5], [-90, 0, 0]);
    // the chocolate river (wade through it - slowly)
    const choc = tiled(dtex().water, 10, 3);
    S.river = F.plane(choc, 400, 22, [0, -0.5, -96], [-90, 0, 0], { shininess: 60 }); S.river.material.color.set(0x5a2a10);
    F.every(0, () => { for (const ch of F.chars()) { const q = ch.rootPosition, inC = q.z < -85 && q.z > -107 && q.y < 2.5; if (inC && !ch.swimming) { ch.swimming = true; ch.walkSpeed = 7; } else if (!inC && ch.swimming) { ch.swimming = false; ch.walkSpeed = ch.npc ? 13 : 16; } } });
    // a candy-cane bridge over it
    F.box(-4, 0, -108, 4, 0.8, -84, 1, { top: 'Smooth' });
    for (const s of [-1, 1]) for (let z = -107; z <= -85; z += 2) F.add(blocks([[0.5, 3, 0.5, 0, 1.5, 0, z % 4 ? 21 : 1, { shape: 'cyl' }]])).position.set(s * 3.6, 0.8, z);
    // lollipops, candy canes, gumdrops (bouncy), cotton candy clouds
    for (const [x, z, c] of [[-20, -26, '#ff3a6a'], [24, -30, '#3ac8ff'], [-34, -60, '#c86aff'], [36, -66, '#ffb03a'], [-14, -130, '#3aff8a'], [20, -140, '#ff3a6a'], [-50, -30, '#ffe03a'], [52, -40, '#ff6ac8']]) lollipop(F, x, z, rnd(9, 14), c);
    for (const [x, z] of [[-8, -20], [8, -20], [-40, -44], [44, -50]]) { const g = F.add(blocks([[0.9, 12, 0.9, 0, 6, 0, 1, { shape: 'cyl' }], [0.95, 2, 0.95, 0, 3, 0, 21, { shape: 'cyl' }], [0.95, 2, 0.95, 0, 7, 0, 21, { shape: 'cyl' }], [0.95, 2, 0.95, 0, 11, 0, 21, { shape: 'cyl' }]])); g.position.set(x, 0, z); F.box(x - 0.45, 0, z - 0.45, x + 0.45, 12, z + 0.45, 1, { transparency: 1 }); }
    S.gums = [];
    for (const [x, z, c] of [[-16, -44, 21], [16, -48, 23], [-28, -72, 24], [26, -74, 104], [0, -62, 37]]) { F.add(blocks([[7, 5, 7, 0, 0, 0, c, { shape: 'ball', opacity: 0.85, emissive: 0.15 }]])).position.set(x, 1, z); F.box(x - 2.6, 0, z - 2.6, x + 2.6, 3.2, z + 2.6, c, { transparency: 1 }); S.gums.push(V(x, 0, z)); }
    for (let i = 0; i < 12; i++) F.add(blocks([[rnd(12, 22), rnd(6, 10), rnd(10, 16), 0, 0, 0, pick([223, 11, 1]), { shape: 'ball', opacity: 0.95 }]], { shadow: false })).position.set(rnd(-150, 150), rnd(40, 70), rnd(-250, -40));
    // the gingerbread house
    F.box(-46, 0, -76, -26, 10, -60, 192); F.box(-37.5, 0, -60.1, -34.5, 6, -59.9, 26, { canCollide: false });
    for (const s of [-1, 1]) { const r = F.add(blocks([[13, 1, 18, 0, 0, 0, 1]])); r.position.set(-36 + s * 5.2, 13.2, -68); r.rotation.z = s * -0.75; }
    for (let x = -45; x <= -27; x += 3) F.add(blocks([[1.2, 1.2, 1.2, 0, 0, 0, pick([21, 23, 24, 37]), { shape: 'ball' }]])).position.set(x, 10.2, -59.6);
    for (const [x, y] of [[-42, 5], [-30, 5]]) F.add(blocks([[3, 3, 0.2, 0, 0, 0, 1], [2.4, 2.4, 0.25, 0, 0, 0, 24, { emissive: 0.4 }]])).position.set(x, y, -59.9);
    // the giant cupcake on the far side of the river - climb its frosting for a prize
    F.add(blocks([[16, 10, 16, 0, 5, 0, 104, { shape: 'cyl' }], [17, 5, 17, 0, 12, 0, 1, { shape: 'ball' }], [12, 5, 12, 0, 15, 0, 1, { shape: 'ball' }], [7, 4, 7, 0, 18, 0, 1, { shape: 'ball' }], [2.4, 2.4, 2.4, 0, 21.2, 0, 21, { shape: 'ball', emissive: 0.3 }]])).position.set(10, 0, -134);
    F.box(2, 0, -142, 18, 10, -126, 104, { transparency: 1 });
    for (let k = 0; k < 4; k++) F.box(10 - 7 + k * 1.6, 10, -134 - 7 + k * 1.6, 10 + 7 - k * 1.6, 12 + k * 2.2, -134 + 7 - k * 1.6, 1, { transparency: 1 });
    for (let i = 0; i < 10; i++) F.box(8, 0, -126 + (9 - i) * 1.2, 12, i + 1, -126 + (10 - i) * 1.2, i % 2 ? 1 : 21, { top: 'Smooth' });
    S.cherry = V(10, 21.2, -134);
    F.pickup(S.cherry, 4, (ch) => F.bonus(ch, 'Sweet Tooth', 3), { keep: true });
    // the gingerbread man
    S.ginger = F.puppet({ colors: { head: 192, torso: 192, leftArm: 192, rightArm: 192, leftLeg: 192, rightLeg: 192 } }, { at: [-36, 0, -56, 0], faceTex: gingerFace(), speed: 17 });
    S.ginger.model.root.add(blocks([[0.4, 0.4, 0.1, 0, 0.4, -0.52, 21, { shape: 'ball' }], [0.4, 0.4, 0.1, 0, -0.3, -0.52, 23, { shape: 'ball' }]]));
    S.gingerT = 0;
    S.balls = [];
  },
  update(F, dt, t) {
    const S = F.state;
    S.river.material.map.offset.x = (t * 0.03) % 1;
    // gumdrops are bouncy
    for (const ch of F.chars()) for (const g of S.gums) { const q = ch.rootPosition; if (Math.hypot(q.x - g.x, q.z - g.z) < 2.8 && q.y > 5 && q.y < 7.5 && ch.body.velocity.y <= 1) { ch.body.velocity.y = 85; A.boing(q); } }
    // the gingerbread man runs from whoever's nearest
    const G = S.ginger;
    if (G.alive && !S.caught) {
      S.gingerT -= dt;
      const near = F.nearest(G.centre, { max: 26 });
      if (near) { const away = flat(G.pos).sub(flat(near.rootPosition)).setLength(16); const want = flat(G.pos).add(away); want.x = clamp(want.x, -60, 60); want.z = clamp(want.z, -82, -20); G.walkTo(want, 15.5); if (S.gingerT <= 0) { S.gingerT = rnd(4, 7); F.say('Gingerbread Man', pick(["Run, run, as fast as you can! You can't catch me!", 'Too slow!', 'Nyah nyah!', "I'm the Gingerbread Man!"]), G); } }
      else if (!G.walking) G.walkTo(V(rnd(-40, 40), 0, rnd(-80, -24)), 8);
      for (const ch of F.chars()) if (G.touches(ch, 2)) { S.caught = true; G.stop(); F.bonus(ch, 'Caught the Gingerbread Man', 3); F.say('Gingerbread Man', 'Oh, snap.', G); A.crunch(G.pos); F.at(t + 1, () => { G.alive = false; G.root.visible = false; F.burst(0xa86a3a, G.centre, 20, { speed: [4, 10], size: [0.4, 0.8], life: [0.5, 1] }); }); break; }
    }
    // the sugar rush: gumballs from the sky
    for (const b of [...S.balls]) {
      b.v.y -= 60 * dt; b.m.position.addScaledVector(b.v, dt);
      for (const ch of F.chars({ outside: true })) if (ch.rootPosition.distanceTo(b.m.position) < 3) { F.fling(ch, flat(ch.rootPosition).sub(flat(b.m.position)).setLength(30).add(V(0, 30, 0)), 0.8); A.boing(ch.rootPosition); }
      if (b.m.position.y < 1) { b.v.y = Math.abs(b.v.y) * 0.5; b.bounces = (b.bounces || 0) + 1; A.boing(b.m.position); if (b.bounces > 2) { F.E.world.scene.remove(b.m); S.balls.splice(S.balls.indexOf(b), 1); } }
    }
    if (S.rush && Math.random() < dt * 5) { const m = F.add(blocks([[2.4, 2.4, 2.4, 0, 0, 0, pick([21, 23, 24, 37, 104]), { shape: 'ball' }]])); m.position.set(rnd(-40, 40), 70, rnd(-80, -14)); S.balls.push({ m, v: V(rnd(-4, 4), -10, rnd(-4, 4)) }); }
  },
  closing(F) { F.state.rush = true; F.E.ui.toast('SUGAR RUSH! Gumballs incoming!', '#ff8ad8', 'rgba(90,20,60,.9)'); A.fanfare(); },
  botTick(F, bot) { const G = F.state.ginger; if (bot.mode === 'out' && G.alive && !F.state.caught && bot.bravery > 0.85 && Math.random() < 0.01) bot.plan.unshift(flat(G.pos)); },
};

// --- the construction site ----------------------------------------------------------------------------------------------------------------------------------------
export const girders = {
  id: 'girders', name: 'Construction Site', hint: 'Floor 400. Not finished yet. Hard hats required.', color: '#ff9a2a', time: 34,
  look: { sky: 'day', amb: [0xeaf4ff, 0x9aa0a8, 1.45], sun: [0xfff6e0, 1.4], fog: [0xc8dcf0, 250, 1300] },
  bots: { venture: 0.4, gaps: false, spots: [[0, -20], [-6, -22], [6, -22]], area: [-6, -24, 6, -14] },
  lines: ['so high', 'dont look down', 'my legs are shaking', 'the crane!!', 'hard hat', 'nope', 'is this safe'],
  build(F) {
    const S = F.state;
    // the landing (concrete), the elevator's frame, rebar
    F.ground(-10, -26, 10, DOOR_Z + 0.5, 194, { thick: 2 });
    F.doorWall(194, { x0: -10, x1: 10, h: 16, frameColor: 24 });
    for (let x = -9; x <= 9; x += 3) F.box(x - 0.15, 16, -9.6, x + 0.15, 19, -9.3, 192);
    F.sign(0, 13.5, -10.2, 7, 2, 'HARD HAT AREA', { bg: '#f4cc20', fg: '#111', face: '-z', border: '#111' });
    // the girders, out over nothing
    const G = (x0, z0, x1, z1, y = 0) => { const w = 1.6; if (x0 === x1) { F.box(x0 - w / 2, y - 1.4, Math.min(z0, z1), x0 + w / 2, y, Math.max(z0, z1), 21); F.box(x0 - 0.2, y - 3.6, Math.min(z0, z1), x0 + 0.2, y - 1.4, Math.max(z0, z1), 21); F.box(x0 - w / 2, y - 4, Math.min(z0, z1), x0 + w / 2, y - 3.6, Math.max(z0, z1), 21); } else { F.box(Math.min(x0, x1), y - 1.4, z0 - w / 2, Math.max(x0, x1), y, z0 + w / 2, 21); F.box(Math.min(x0, x1), y - 3.6, z0 - 0.2, Math.max(x0, x1), y - 1.4, z0 + 0.2, 21); F.box(Math.min(x0, x1), y - 4, z0 - w / 2, Math.max(x0, x1), y - 3.6, z0 + w / 2, 21); } };
    G(0, -26, 0, -70); G(-30, -46, 30, -46); G(-30, -70, 30, -70); G(-30, -46, -30, -96); G(30, -46, 30, -70); G(0, -70, 0, -96); G(-30, -96, 12, -96);
    for (const [x, z] of [[0, -46], [-30, -46], [30, -46], [0, -70], [-30, -70], [30, -70], [-30, -96], [0, -96]]) F.box(x - 1, -120, z - 1, x + 1, 0.01, z + 1, 21);
    // lunch on a beam
    S.lunch = [];
    for (const [i, x] of [-22, -18, -14, -10].entries()) { const w = F.puppet(DRESS(24, [23, 26, 192, 28][i], 102), { at: [x, -1.5, -45.2, Math.PI], hat: (h) => h.add(blocks([[1.5, 0.7, 1.5, 0, 0.75, 0, 24, { shape: 'ball' }], [1.9, 0.12, 1.9, 0, 0.5, 0, 24, { shape: 'cyl' }]])) }); w.pose = (a, t) => { a.rh = a.lh = 1.57; a.rs = 1.2 + (i % 2 ? Math.max(0, Math.sin(t * 2 + i)) * 0.8 : 0); a.ls = 0.4; }; S.lunch.push(w); }
    // the hard hat on the far beam, the crane
    S.hat = F.add(blocks([[1.5, 0.7, 1.5, 0, 0.35, 0, 24, { shape: 'ball' }], [1.9, 0.12, 1.9, 0, 0, 0, 24, { shape: 'cyl' }]])); S.hat.position.set(12, 0.4, -96); F.spin(S.hat, 1.2, 0.2);
    F.pickup(S.hat, 3, (ch) => { F.bonus(ch, 'Safety First', 3); F.say('Foreman', 'Good. Now put it ON.', S.lunch[0]); }, { offset: V(0, 2, 0) });
    F.box(46, -120, -84, 50, 60, -80, 24); for (let y = -110; y < 60; y += 6) F.box(45.8, y, -84.2, 50.2, y + 0.5, -79.8, 24, { canCollide: false });
    S.jib = new THREE.Group(); S.jib.position.set(48, 62, -82); F.add(S.jib);
    S.jib.add(blocks([[4, 3, 90, 0, 0, -22, 24], [4, 3, 20, 0, 0, 30, 24], [6, 6, 6, 0, -1, 38, 199], [5, 6, 5, 0, 4, 0, 24]]));
    S.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 4), new THREE.MeshPhongMaterial({ color: 0x222222 })); F.add(S.cable);
    S.load = F.mover({ name: 'Beam', size: [3, 3, 22], position: [48, 20, -140], color: 21 });
    S.craneA = Math.PI * 0.95;
    // the city, a long way down
    F.ground(-1200, -1500, 1200, 800, 194, { y: -400, thick: 4 });
    for (let i = 0; i < 60; i++) { const x = rnd(-600, 600), z = rnd(-900, 300); if (Math.abs(x) < 110 && z > -200 && z < 60) continue; const h = rnd(40, 230), w = rnd(30, 70); F.box(x - w / 2, -400, z - w / 2, x + w / 2, -400 + h, z + w / 2, pick([194, 199, 1, 26, 5])); }
    F.fallKill(-90, 'fell off the skyscraper');
  },
  start(F) { A.wind(0.35); F.sound(null, 'wind'); },
  update(F, dt, t) {
    const S = F.state;
    // the crane swings its beam round over the girders
    S.craneA += dt * (S.fast ? 0.55 : 0.28);
    const a = S.craneA, r = 70;
    S.jib.rotation.y = -a + Math.PI / 2;
    const hook = V(48 + Math.cos(a) * r * -1, 62, -82 + Math.sin(a) * r * -1);
    const lp = V(hook.x, 4.5, hook.z);
    S.load.setPosition(lp.x, lp.y, lp.z); S.load.setRotationDeg(0, -a * 57.3 + 90, 0);
    S.cable.position.set(hook.x, (hook.y + lp.y) / 2, hook.z); S.cable.scale.y = hook.y - lp.y;
    for (const ch of F.chars({ outside: true })) {
      const q = ch.rootPosition, d = q.clone().sub(lp); d.y = 0;
      const loc = d.clone().applyAxisAngle(V(0, 1, 0), a - Math.PI / 2);
      if (Math.abs(loc.z) < 12 && Math.abs(loc.x) < 2.8 && q.y > 1 && q.y < 9 && !ch.platformStand) { F.fling(ch, V(Math.sin(a) * 55, 30, -Math.cos(a) * 55), 2); A.clunk(q); }
    }
    if ((S.creakT = (S.creakT || 2) - dt) <= 0) { S.creakT = rnd(3, 6); A.tone(rnd(140, 220), 0.9, { type: 'sawtooth', to: rnd(100, 180), lp: 600, vol: 0.06 }); }
    if ((S.talkT = (S.talkT || 6) - dt) <= 0) { S.talkT = rnd(8, 12); F.say(pick(['Steve', 'Gus', 'Mike', 'Foreman']), pick(['Nice day for it.', 'Pass the mustard.', 'Watch the crane, kid.', 'Union says no hard hat, no beam.', "Don't look down. I never do."]), pick(S.lunch)); }
  },
  closing(F) { F.state.fast = true; F.say('Foreman', "Crane's running hot! Everybody off the steel!", F.state.lunch[0]); A.alarmButton(); },
};

// --- the wild west ---------------------------------------------------------------------------------------------------------------------------------------------------
export const west = {
  id: 'west', name: 'The Wild West', hint: "Howdy, partner. Don't be in the street at high noon.", color: '#e8b86a', time: 36, music: 'saloon',
  look: { sky: 'desert', amb: [0xfff0d8, 0xb89868, 1.45], sun: [0xfff0c8, 1.5], fog: [0xf0d8a8, 150, 700] },
  bots: { venture: 0.8, spots: [[0, -26], [-10, -38], [10, -44], [0, -60], [-12, -70], [12, -76]], area: [-10, -90, 10, -20] },
  lines: ['yeehaw', 'howdy', 'cowboys!!', 'its high noon', 'HIDE', 'tumbleweed lol', 'this town aint big enough'],
  build(F) {
    const S = F.state;
    F.ground(-240, -300, 240, 40, 5, { top: 'Smooth' });
    // the street: buildings either side
    const L = [[-40, -24, -28, 106, 'SALOON'], [-40, -48, -34, 192, 'SHERIFF'], [-40, -72, -30, 5, 'BANK'], [-40, -96, -28, 194, 'GENERAL STORE']];
    for (const [i, [x, z, xx, c, name]] of L.entries()) { void i; F.box(x, 0, z - 10, -16, 12, z + 10, c); F.sign(-15.9, 14, z, 14, 2.4, name, { bg: '#e8d0a0', fg: '#4a2a10', face: 'x', font: 'Georgia, serif' }); F.box(-16, 0, z - 9, -11, 0.5, z + 9, 192, { top: 'Smooth' }); F.box(-11.4, 0.5, z - 9, -11, 7.6, z - 8.6, 192); F.box(-11.4, 0.5, z + 8.6, -11, 7.6, z + 9, 192); F.box(-16, 7.6, z - 9, -11, 8, z + 9, 192); F.box(-16.1, 3, z - 6, -15.9, 6.5, z - 3, 26, { canCollide: false }); F.box(-16.1, 3, z + 3, -15.9, 6.5, z + 6, 26, { canCollide: false }); void xx; }
    for (const [z, c, name] of [[-24, 192, 'HOTEL'], [-48, 24, 'BARBER'], [-72, 28, 'POST OFFICE'], [-96, 106, 'UNDERTAKER']]) { F.box(16, 0, z - 10, 40, 12, z + 10, c); F.sign(15.9, 14, z, 14, 2.4, name, { bg: '#e8d0a0', fg: '#4a2a10', face: '-x', font: 'Georgia, serif' }); F.box(11, 0, z - 9, 16, 0.5, z + 9, 192, { top: 'Smooth' }); F.box(11, 7.6, z - 9, 16, 8, z + 9, 192); F.box(11, 0.5, z - 9, 11.4, 7.6, z - 8.6, 192); F.box(11, 0.5, z + 8.6, 11.4, 7.6, z + 9, 192); F.box(15.9, 3, z - 6, 16.1, 6.5, z - 3, 26, { canCollide: false }); F.box(15.9, 3, z + 3, 16.1, 6.5, z + 6, 26, { canCollide: false }); }
    F.box(-16.1, 0, -27, -15.9, 5.5, -21, 192, { canCollide: false, transparency: 0.2 });
    // cover in the street: barrels, a trough, a wagon
    for (const [x, z] of [[-8, -34], [7, -52], [-6, -66], [8, -84], [-9, -90]]) F.add(blocks([[2.2, 3, 2.2, 0, 1.5, 0, 192, { shape: 'cyl' }], [2.3, 0.2, 2.3, 0, 0.6, 0, 199, { shape: 'cyl' }], [2.3, 0.2, 2.3, 0, 2.4, 0, 199, { shape: 'cyl' }]])).position.set(x, 0, z);
    for (const [x, z] of [[-8, -34], [7, -52], [-6, -66], [8, -84], [-9, -90]]) F.box(x - 1.1, 0, z - 1.1, x + 1.1, 3, z + 1.1, 192, { transparency: 1 });
    F.box(4, 0, -44, 10, 2.4, -41, 192);
    F.box(-6, 1.2, -78, 2, 3.6, -72, 192); for (const x of [-6.4, 2.4]) F.add(blocks([[4.2, 0.6, 4.2, 0, 0, 0, 192, { shape: 'cyl', rz: 90 }], [4.2, 0.6, 4.2, 0, 0, 6.4, 192, { shape: 'cyl', rz: 90 }]])).position.set(x, 2.1, -78.2);
    // the water tower (the badge is up top), cacti, the piano player through the saloon window
    for (const [x, z] of [[24, -114], [32, -114], [24, -122], [32, -122]]) F.box(x - 0.5, 0, z - 0.5, x + 0.5, 18, z + 0.5, 192);
    F.add(blocks([[8, 8, 8, 0, 0, 0, 192, { shape: 'cyl' }], [9, 3.4, 9, 0, 5.7, 0, 26, { shape: 'cone' }]])).position.set(28, 22.6, -119); F.box(24.5, 18.6, -122.5, 31.5, 26.6, -115.5, 192, { transparency: 1 });
    F.box(23, 18, -123, 33, 18.6, -113, 192); F.box(22.4, 0, -113.6, 23.6, 18, -112.8, 192, { tags: ['climbable'] });
    S.badge = F.add(blocks([[1.6, 1.6, 0.3, 0, 0, 0, 24, { emissive: 0.5 }], [1.6, 1.6, 0.3, 0, 0, 0, 24, { emissive: 0.5, rz: 36 }]])); S.badge.position.set(28, 20.4, -113.9); F.spin(S.badge, 2);
    F.pickup(S.badge, 3, (ch) => { F.bonus(ch, "Sheriff's Badge", 3); F.say('Old Timer', "Well I'll be. We got ourselves a new sheriff.", S.piano); });
    for (let i = 0; i < 14; i++) { const x = (Math.random() < 0.5 ? -1 : 1) * rnd(46, 140), z = rnd(-200, -10); const h = rnd(6, 12); F.add(blocks([[1.6, h, 1.6, 0, h / 2, 0, 28, { shape: 'cyl' }], [1.2, 4, 1.2, 1.6, h * 0.5, 0, 28, { shape: 'cyl' }], [1.2, 3, 1.2, -1.6, h * 0.65, 0, 28, { shape: 'cyl' }], [1.2, 1.2, 1.2, 1.6, h * 0.5 - 2, 0, 28, { rz: 90, shape: 'cyl' }]])).position.set(x, 0, z); }
    for (let i = 0; i < 6; i++) F.add(blocks([[rnd(40, 90), rnd(30, 60), rnd(30, 60), 0, 0, 0, 106]], { shadow: false })).position.set(rnd(-400, 400), 0, rnd(-700, -400));
    S.piano = F.puppet(DRESS(24, 1, 26), { at: [-14.5, 0.5, -30, -Math.PI / 2], hat: (h) => h.add(blocks([[1.8, 0.2, 1.8, 0, 0.6, 0, 26, { shape: 'cyl' }], [1.1, 0.6, 1.1, 0, 0.9, 0, 26, { shape: 'cyl' }]])) });
    S.piano.pose = (a, t) => { a.rs = 1.3 + Math.sin(t * 9) * 0.25; a.ls = 1.3 + Math.cos(t * 8) * 0.25; };
    F.add(blocks([[5, 4, 2, 0, 2, 0, 192], [5, 0.3, 1, 0, 3.4, -1.3, 1]])).position.set(-12.5, 0.5, -30);
    F.box(-15, 0.5, -32.5, -10, 4.5, -27.5, 192, { transparency: 1 });
    // tumbleweeds
    S.weeds = [];
    for (let i = 0; i < 4; i++) { const w = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), new THREE.MeshPhongMaterial({ color: 0xa88a5a, wireframe: true })); w.position.set(rnd(-60, 60), 1.6, rnd(-100, -20)); F.add(w); S.weeds.push(w); }
    S.bandit = null; S.shots = [];
  },
  start(F) { A.wind(0.12); F.sound(null, 'wind'); },
  update(F, dt, t) {
    const S = F.state;
    for (const w of S.weeds) { w.position.x += dt * 9; w.position.y = 1.6 + Math.abs(Math.sin(t * 4 + w.position.z)) * 1.2; w.rotation.z -= dt * 5; if (w.position.x > 80) w.position.x = -80; }
    // high noon: the bell, then the bandit
    if (!S.noon && t > 12) {
      S.noon = true; for (let i = 0; i < 6; i++) F.E.world.delay(i * 0.35, () => A.deskBell(V(0, 20, -110)));
      F.E.ui.toast('☀ IT IS HIGH NOON ☀', '#ffd84a', 'rgba(80,50,10,.9)');
      F.at(t + 2.4, () => {
        S.bandit = F.puppet({ colors: { head: 24, torso: 26, leftArm: 26, rightArm: 26, leftLeg: 26, rightLeg: 26 } }, { at: [0, 0, -112, Math.PI], faceTex: FACES.angry(), hat: (h) => h.add(blocks([[2.4, 0.2, 2.4, 0, 0.6, 0, 26, { shape: 'cyl' }], [1.3, 1, 1.3, 0, 1.1, 0, 26, { shape: 'cyl' }], [1.2, 0.5, 0.3, 0, -0.3, -0.62, 21]])) });
        S.bandit.walkTo(V(0, 0, -100), 6); S.aimT = 1.5; A.whistle(V(0, 4, -100));
        F.say('Bandit', "This floor ain't big enough for the both of us!", S.bandit);
        F.E.game.players.forEach((p) => { if (p.brain && Math.random() < 0.4) F.E.world.delay(rnd(0.4, 1.5), () => p.brain.say(pick(['HIDE', 'its the bandit', 'get behind something', 'run!!']))); });
      });
    }
    const B = S.bandit;
    if (B) {
      B.pose = (a) => { a.rs = S.aiming ? 1.57 : 0.3; };
      S.aimT -= dt;
      if (!S.aiming && S.aimT <= 0) {
        // pick someone he can see
        const gun = B.pos.clone().add(V(0, 4.5, 0));
        const seen = F.chars({ outside: true }).filter((ch) => { const h = F.E.world.raycast(gun, ch.rootPosition, { mask: GROUP.WORLD }); return !h || h.distance > gun.distanceTo(ch.rootPosition) - 2; });
        if (seen.length) { S.aiming = pick(seen); S.aimFor = S.fast ? 0.7 : 1.1; B.face(S.aiming.rootPosition); if (S.aiming.player?.isLocal) F.E.ui.toast('The bandit is aiming at YOU! Take cover!', '#ff5a5a', 'rgba(80,10,20,.9)'); }
        else S.aimT = 0.4;
      }
      if (S.aiming) {
        S.aimFor -= dt; B.face(S.aiming.rootPosition);
        if (S.aimFor <= 0) {
          const ch = S.aiming, gun = B.pos.clone().add(V(0, 4.5, 0)).add(V(-Math.sin(B.yaw), 0, -Math.cos(B.yaw)).multiplyScalar(1.5));
          A.gunshot(gun); F.burst('spark', gun, 6, { speed: [4, 10], size: [0.3, 0.6], life: [0.05, 0.15] });
          const h = ch.alive ? F.E.world.raycast(gun, ch.rootPosition, { mask: GROUP.WORLD }) : null;
          if (ch.alive && (!h || h.distance > gun.distanceTo(ch.rootPosition) - 2)) F.kill(ch, 'was shot by a bandit at high noon');
          else { A.ricochet(ch.rootPosition); if (h) F.burst('dust', h.point, 6, { speed: [2, 6], size: [0.5, 1], life: [0.3, 0.6] }); }
          S.aiming = null; S.aimT = S.fast ? rnd(0.6, 1) : rnd(1.4, 2.2);
        }
      }
    }
  },
  closing(F) { F.state.fast = true; if (F.state.bandit) F.say('Bandit', 'DRAW!', F.state.bandit); },
  botTick(F, bot) { if (F.state.noon && bot.mode === 'out') bot.mode = 'return'; },
};
void tiled; void textTex;
