// Floors: the haunted hallway, the giant kitchen, the moon, the gas leak, the cow field.
import * as THREE from 'three';
import { V, rnd, pick, ctex, liveTex, blocks, tiled, DOOR_Z, FACES, textTex, plastic } from '../kit.js';
import * as A from '../audio.js';
import { tex as dtex } from '../../disasters/effects.js';
import { checker } from './special.js';

const look = (o) => o;

// --- the long hallway ------------------------------------------------------------------------------------------------------------------------------------
function portraitTex(i) {
  return ctex('portrait' + i, 128, 160, (x, w, h) => {
    x.fillStyle = ['#2a1c14', '#1c2418', '#241a28'][i % 3]; x.fillRect(0, 0, w, h);
    x.fillStyle = '#c8b090'; x.beginPath(); x.ellipse(w / 2, h * 0.42, 30, 40, 0, 0, 7); x.fill();
    x.fillStyle = '#3a2a1c'; x.fillRect(w / 2 - 34, h * 0.68, 68, 60);
    x.fillStyle = '#111'; for (const s of [-1, 1]) { x.beginPath(); x.arc(w / 2 + s * 11, h * 0.4, 4, 0, 7); x.fill(); }
    x.strokeStyle = '#111'; x.lineWidth = 2; x.beginPath(); x.moveTo(w / 2 - 9, h * 0.53); x.lineTo(w / 2 + 9, h * 0.53); x.stroke();
    x.strokeStyle = '#8a6a2a'; x.lineWidth = 10; x.strokeRect(5, 5, w - 10, h - 10);
  });
}
export const hallway = {
  id: 'hallway', name: 'The Long Hallway', hint: 'Someone is standing at the end of it.', color: '#b8c8ff', time: 30, music: 'dread',
  look: look({ skyColor: 0x000000, amb: [0x6070a0, 0x101018, 0.32], sun: [0x8090c0, 0.15], fog: [0x020206, 30, 150] }),
  bots: { venture: 0.35, spots: [[0, -22], [0, -34], [-3, -46], [3, -58], [0, -70]] },
  lines: ['nope', 'this is creepy', 'who is that', 'i dont like this floor', 'is it moving', 'GET IN THE ELEVATOR', 'she moved'],
  build(F) {
    const L = -160, H = 14;
    F.ground(-8, L, 8, DOOR_Z + 0.5, 25);
    F.box(-8, 0, L, -7, H, DOOR_Z, 141); F.box(7, 0, L, 8, H, DOOR_Z, 141); F.box(-8, 0, L - 1, 8, H, L, 141);
    F.box(-8, H, L, 8, H + 1, DOOR_Z, 1);
    F.doorWall(141, { x0: -8, x1: 8, h: H, frameColor: 192 });
    F.box(-7, 0, L, -6.8, 4.5, DOOR_Z - 1, 192); F.box(6.8, 0, L, 7, 4.5, DOOR_Z - 1, 192);
    F.plane(tiled(ctex('runner', 64, 256, (x, w, h) => { x.fillStyle = '#5a0a0c'; x.fillRect(0, 0, w, h); x.strokeStyle = '#c8a040'; x.lineWidth = 3; x.strokeRect(6, -4, w - 12, h + 8); for (let y = 16; y < h; y += 32) { x.fillStyle = '#8a1a1a'; x.beginPath(); x.moveTo(w / 2, y - 10); x.lineTo(w / 2 + 12, y); x.lineTo(w / 2, y + 10); x.lineTo(w / 2 - 12, y); x.fill(); } }), 1, 18), 6, -L + DOOR_Z, [0, 0.03, (L + DOOR_Z) / 2], [-90, 0, 0], { decal: true });
    // rooms' doors with numbers, portraits, sconces
    F.state.sconce = plastic(226, { emissive: 1 });
    F.state.sconces = [];
    for (let i = 0, z = -20; z > L + 10; z -= 14, i++) {
      for (const s of [-1, 1]) {
        F.box(s * 6.8 - (s > 0 ? 0 : 0.2), 0, z - 2, s * 6.8 + (s > 0 ? 0.2 : 0), 8.5, z + 2, 192);
        F.box(s * 6.6, 3.8, z + 1.2, s * 6.5, 4.4, z + 1.6, 24, { canCollide: false });
        F.plane(textTex(String(400 + i * 2 + (s > 0 ? 1 : 0)), { fg: '#d8b860', w: 128, h: 64 }), 1.2, 0.6, [s * 6.55, 9.3, z], [0, s > 0 ? -90 : 90, 0], { transparent: true });
        if (i % 2 === 0) F.plane(portraitTex(i + (s > 0 ? 1 : 0)), 2.8, 3.5, [s * 6.95, 8.5, z - 7], [0, s > 0 ? -90 : 90, 0]);
        const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 0.9, 10), F.state.sconce); sc.position.set(s * 6.6, 10.5, z - 3.5); F.add(sc);
        F.state.sconces.push(sc);
      }
      F.state.doors = F.state.doors || []; F.state.doors.push(z);
    }
    F.state.lights = [-18, -40, -62, -90].map((z) => F.light(V(0, 11, z), 0xffc070, 40, 26));
    // the window at the end, moonlight
    F.box(-3, 4, L + 0.01, 3, 11, L + 0.2, 23, { material: 'Neon', canCollide: false });
    F.box(-0.15, 4, L + 0.2, 0.15, 11, L + 0.4, 26, { canCollide: false }); F.box(-3, 7.35, L + 0.2, 3, 7.65, L + 0.4, 26, { canCollide: false });
    // her
    const lady = F.puppet({ colors: { head: 1, torso: 1, leftArm: 1, rightArm: 1, leftLeg: 1, rightLeg: 1 } }, { scale: 1.25, faceTex: FACES.ghost(), at: [0, 0, L + 8, 0], hat: (head) => head.add(blocks([[1.4, 1.1, 1.3, 0, 0.35, 0.15, 26], [1.5, 2.6, 0.5, 0, -0.8, 0.55, 26]])) });
    lady.pose = (a, t, moving) => { if (!moving) { a.rs = a.ls = 0.05; a.rh = a.lh = 0; } else { a.rs = a.ls = 1.5; } };
    F.state.lady = lady; F.state.flickT = 5; F.state.dark = 0; F.state.step = 0;
    // a key halfway down (for the brave)
    F.state.key = F.add(blocks([[0.2, 0.2, 1.4, 0, 0, 0, 24], [0.6, 0.2, 0.6, 0, 0, -0.9, 24, { shape: 'cyl', rx: 0 }], [0.2, 0.2, 0.4, 0.2, 0, 0.5, 24]]));
    F.state.key.position.set(rnd(-4, 4), 0.4, -112);
  },
  start(F) { A.whispers(0.3); A.drone(0.18); F.sound(null, 'whisper'); F.sound(null, 'drone'); },
  update(F, dt, t) {
    const S = F.state, lady = S.lady;
    S.key.rotation.y += dt * 2;
    if (!S.keyTaken) for (const ch of F.chars()) if (ch.rootPosition.distanceTo(S.key.position) < 3.5) { S.keyTaken = true; S.key.visible = false; F.bonus(ch, 'Brave Soul', 3); A.sparkle(S.key.position); }
    // the lights die for a moment - and when they come back, she's closer
    S.flickT -= dt;
    if (S.flickT <= 0 && !S.rush) {
      S.flickT = rnd(3.5, 5.5); S.dark = 0.55 + rnd(0, 0.3);
      A.flicker(V(0, 10, -30)); A.powerDown();
      S.step++;
    }
    if (S.dark > 0) {
      S.dark -= dt;
      const on = S.dark <= 0;
      if (on) { const nz = Math.min(-30, lady.pos.z + rnd(14, 22)); lady.place(rnd(-2, 2), 0, nz, 0); if (S.step >= 2) A.stinger(); }
      for (const sc of S.sconces) sc.material = on ? S.sconce : plastic(26);
      for (const l of S.lights) l.set(on ? 40 : 0);
      F.E.world.ambient.intensity = on ? 0.32 : 0.05;
    } else if (!S.rush) for (const l of S.lights) l.set(Math.random() < 0.03 ? 10 : 40);
    // at the end she comes for the doors
    if (S.rush && lady.alive) {
      lady.walkTo(V(0, 0, -6), 34);
      for (const ch of F.chars({ outside: true })) if (lady.touches(ch, 2.6)) { A.scream(ch.rootPosition, 1.3); F.kill(ch, 'was taken by the Pale Lady'); }
      if (lady.pos.z > -16 && !S.screamed) { S.screamed = true; A.scream(lady.head, 0.8); A.bang(V(0, 5, -10)); F.shake(1); F.E.ui.flash('#ffffff', 0.6); }
    }
  },
  closing(F) { F.state.rush = true; F.state.dark = 0; for (const l of F.state.lights) l.set(10); A.stinger(); },
  end(F) { F.E.world.ambient.intensity = 0.32; },
};

// --- the giant kitchen -----------------------------------------------------------------------------------------------------------------------------------
export const kitchen = {
  id: 'kitchen', name: 'Giant Kitchen', hint: "You're very small. Everything else is not.", color: '#ffb84a', time: 32,
  look: look({ sky: 'day', amb: [0xfff6e8, 0xb0a090, 1.4], sun: [0xfff8e8, 1.3], fog: [0xe8e0d0, 400, 1400] }),
  bots: { venture: 0.75, spots: [[-20, -26], [16, -30], [-30, -60], [30, -64], [0, -80], [-10, -100], [24, -96]] },
  lines: ['everything is huge', 'GIANT TOAST', 'im so small', 'is that cheese', 'dont touch the cheese', 'lol a banana'],
  build(F) {
    // the countertop (we're on it) - and a long way down to the floor
    F.ground(-90, -150, 90, 30, 1, { thick: 6 });
    F.plane(tiled(ctex('marble', 256, 256, (x, w, h) => { x.fillStyle = '#ecebe6'; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(120,120,130,0.35)'; for (let i = 0; i < 18; i++) { x.lineWidth = rnd(0.5, 2.5); x.beginPath(); let px = Math.random() * w, py = Math.random() * h; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += rnd(-40, 40); py += rnd(-40, 40); x.lineTo(px, py); } x.stroke(); } }), 6, 6), 180, 180, [0, 0.02, -60], [-90, 0, 0], { decal: true });
    F.box(-92, -6, -152, 92, 0.5, -150, 192); // the counter's edge strip
    F.ground(-400, -500, 400, 300, 1, { y: -160, thick: 2 });
    F.plane(tiled(checker('kfloor', '#f0ece4', '#c03028', 2), 20, 20), 800, 800, [0, -159.95, -100], [-90, 0, 0]);
    F.box(-90, -160, -151, 90, -6, -150, 192); // the cupboards below the counter
    for (let x = -88; x < 88; x += 30) F.box(x + 1, -100, -151.4, x + 28, -20, -151, 12);
    F.box(-400, -160, -420, 400, 200, -400, 103); // the far wall
    F.box(-60, 20, -399, 60, 120, -398, 23, { material: 'Neon', canCollide: false });
    F.fallKill(-60, 'fell off the counter');
    // the toaster
    F.box(-46, 0, -52, -16, 24, -30, 131, { reflectance: 0.6 });
    for (const x of [-38, -24]) F.box(x - 3.5, 23.9, -48, x + 3.5, 24.1, -34, 26, { canCollide: false });
    F.box(-17, 8, -44, -14, 11, -40, 26);
    F.state.toastT = 6; F.state.toasts = [];
    // a cereal box, the salt, a mug of coffee, a banana, sugar cubes, crumbs
    F.box(20, 0, -40, 40, 50, -30, 21); F.sign(30, 30, -29.8, 18, 14, 'CRUNCHY\nBRICKS', { bg: '#ffd84a', fg: '#c4281c', face: 'z', noBoard: true });
    F.add(blocks([[8, 22, 8, 0, 11, 0, 1, { shape: 'cyl' }], [8.4, 3, 8.4, 0, 23, 0, 131, { shape: 'cyl' }]])).position.set(52, 0, -26);
    F.box(48, 0, -30, 56, 22, -22, 1, { transparency: 1 });
    F.add(blocks([[18, 20, 18, 0, 10, 0, 1, { shape: 'cyl' }], [16, 0.5, 16, 0, 19, 0, 192, { shape: 'cyl' }], [3, 12, 8, 10, 10, 0, 1]])).position.set(-60, 0, -80);
    F.box(-69, 0, -89, -51, 20, -71, 1, { transparency: 1 });
    const banana = F.add(new THREE.Group()); for (let i = 0; i < 8; i++) { const a = (i - 3.5) * 0.18; banana.add(blocks([[6.5, 5, 5.5, Math.sin(a) * 30, -Math.cos(a) * 30 + 30 + 2.5, 0, 24, { rz: a * 57 }]])); } banana.position.set(30, 0, -90);
    F.box(14, 0, -93, 46, 5, -87, 24, { transparency: 1 });
    for (let i = 0; i < 6; i++) F.box(-10 + i * 7, 0, -120 + (i % 2) * 6, -4 + i * 7, 6, -114 + (i % 2) * 6, 1, { top: 'Studs' });
    for (let i = 0; i < 30; i++) { const x = rnd(-80, 80), z = rnd(-140, -14), s = rnd(0.5, 1.5); F.box(x, 0, z, x + s, s * 0.7, z + s, 12, { canCollide: false }); }
    // the mousetrap and its cheese
    F.box(-10, 0, -70, 10, 1.4, -56, 5);
    F.state.bar = F.add(blocks([[18, 0.6, 0.6, 0, 0, 0, 131]])); F.state.bar.position.set(0, 1.7, -69); F.state.barA = 0;
    F.state.cheese = F.add(blocks([[6, 4, 5, 0, 2, 0, 24], [1.2, 1.2, 0.2, -1.4, 2.4, 2.51, 180, { shape: 'cyl', rx: 90 }], [0.9, 0.9, 0.2, 1.6, 1.4, 2.51, 180, { shape: 'cyl', rx: 90 }]])); F.state.cheese.position.set(0, 1.4, -62);
  },
  update(F, dt, t) {
    const S = F.state;
    // toast!
    S.toastT -= dt;
    if (S.toastT <= 0) {
      S.toastT = rnd(7, 10);
      A.boing(V(-31, 24, -41)); A.thud(V(-31, 20, -41), 0.7);
      for (const x of [-38, -24]) {
        const p = F.part({ name: 'Toast', size: [6, 13, 1.6], position: [x, 20, -41], color: 12, anchored: false, mass: 3 });
        p.body.velocity.set(rnd(-8, 8), rnd(70, 90), rnd(10, 20)); p.body.angularVelocity.set(rnd(-3, 3), rnd(-2, 2), rnd(-3, 3));
        S.toasts.push(p);
      }
      F.say('Toaster', 'DING!', V(-31, 26, -41));
    }
    // the cheese: take it and run - the trap goes off
    if (!S.sprung) for (const ch of F.chars()) if (ch.rootPosition.distanceTo(S.cheese.position.clone().add(V(0, 3, 0))) < 4.5) {
      S.sprung = t + 0.55; S.taker = ch; S.cheese.visible = false; F.bonus(ch, 'Got the Cheese', 3);
      if (ch.player?.isLocal) F.E.ui.toast('RUN!', '#ff5a5a', 'rgba(80,10,20,.9)');
    }
    if (S.sprung && t > S.sprung && S.barA < Math.PI) {
      if (S.barA === 0) A.snap(V(0, 2, -62));
      S.barA = Math.min(Math.PI, S.barA + dt * 18);
      S.bar.position.set(0, 1.7 + Math.sin(S.barA) * 7, -69 + (1 - Math.cos(S.barA)) * 6.5);
      if (S.barA > 2.4) for (const ch of F.chars()) { const p = ch.rootPosition; if (Math.abs(p.x) < 10 && p.z > -64 && p.z < -55 && p.y < 7) F.kill(ch, 'was caught in a mousetrap'); }
    }
    // the cloth at the end: wipes the counter clean
    if (S.wipe) {
      S.wipeZ += dt * 34;
      S.cloth.position.z = S.wipeZ;
      for (const ch of F.chars({ outside: true })) { const p = ch.rootPosition; if (Math.abs(p.z - S.wipeZ) < 6 && p.y < 30) F.fling(ch, V(rnd(-40, 40), 30, 70), 2); }
      for (const tp of S.toasts) if (!tp.destroyed && Math.abs(tp.position.z - S.wipeZ) < 8) tp.body.velocity.z = 60;
    }
  },
  closing(F) {
    const S = F.state;
    S.wipe = true; S.wipeZ = -160;
    S.cloth = F.add(blocks([[160, 6, 14, 0, 3, 0, 23], [40, 10, 16, 0, 10, 0, 24]]));
    S.cloth.position.set(0, 0, S.wipeZ);
    A.whoosh(V(0, 5, -60)); F.say('???', 'What a mess...', V(0, 60, -120));
    F.shake(0.5);
  },
};

// --- the moon ------------------------------------------------------------------------------------------------------------------------------------------------
export const moon = {
  id: 'moon', name: 'Moon Base', hint: 'Low gravity. Jump!', color: '#c8d8ff', time: 34,
  look: look({ sky: 'space', amb: [0xb8c0d8, 0x303038, 0.9], sun: [0xffffff, 1.8], fog: [0x000000, 600, 2500] }),
  bots: { venture: 0.95, spots: [[-20, -30], [18, -36], [0, -55], [-34, -70], [30, -66], [8, -90], [-10, -24]] },
  lines: ['im on the moon', 'LOW GRAVITY', 'wheee', 'look how high i can jump', 'one small step lol', 'i can see my house'],
  build(F) {
    F.ground(-200, -260, 200, 40, 194, { top: 'Studs' });
    // craters and rocks
    const R = (a, b) => rnd(a, b);
    for (let i = 0; i < 14; i++) { const x = R(-140, 140), z = R(-220, -30), r = R(5, 14); if (Math.abs(x) < 20 && z > -50) continue; for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; F.box(x + Math.cos(a) * r - 1.6, 0, z + Math.sin(a) * r - 1.6, x + Math.cos(a) * r + 1.6, R(0.8, 2), z + Math.sin(a) * r + 1.6, 199); } F.box(x - r * 0.7, -0.02, z - r * 0.7, x + r * 0.7, 0.05, z + r * 0.7, 27, { canCollide: false }); }
    for (let i = 0; i < 30; i++) { const x = R(-160, 160), z = R(-240, 30), s = R(1, 5); if (Math.abs(x) < 14 && z > -20) continue; F.box(x, 0, z, x + s, s * 0.7, z + s * 0.9, pick([199, 194, 27])); }
    // the lander
    const gold = 24;
    F.box(-34, 4, -64, -24, 11, -54, gold, { reflectance: 0.4 }); F.box(-33, 11, -63, -25, 16, -55, 1);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { F.box(-29 + dx * 7 - 0.4, 0, -59 + dz * 7 - 0.4, -29 + dx * 7 + 0.4, 6, -59 + dz * 7 + 0.4, 131); F.box(-29 + dx * 7 - 1.5, 0, -59 + dz * 7 - 1.5, -29 + dx * 7 + 1.5, 0.4, -59 + dz * 7 + 1.5, 131); }
    F.box(-32, 0, -54, -26, 4, -53, 131, { tags: ['climbable'] });
    // a flag
    F.box(10, 0, -48, 10.4, 14, -47.6, 1); const flag = F.plane(textTex('ROBLOX\nMOON BASE', { bg: '#c4281c', fg: '#ffffff', w: 256, h: 160 }), 7, 4.4, [13.7, 11.6, -47.8], [0, 0, 0], { double: true }); void flag;
    // the base: a dome and modules, an antenna tower with platforms (for big jumps)
    F.add(new THREE.Mesh(new THREE.SphereGeometry(16, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0xc0e0ff, transparent: true, opacity: 0.35, shininess: 100, depthWrite: false }))).position.set(40, 0, -110);
    F.box(24, 0, -112, 56, 1, -108, 199); F.box(36, 1, -114, 44, 6, -106, 1); F.box(56, 0, -114, 76, 8, -106, 1); F.box(56, 8, -113, 76, 9, -107, 23);
    for (let i = 0; i < 5; i++) F.box(-62 + i * 2, 6 + i * 9, -100 - i * 3, -56 + i * 2, 7 + i * 9, -94 - i * 3, i % 2 ? 1 : 23);
    F.box(-50, 0, -116, -48, 54, -114, 131);
    F.state.beacon = F.add(blocks([[3, 3, 3, 0, 0, 0, 21, { shape: 'ball', emissive: 1 }]])); F.state.beacon.position.set(-49, 56, -115);
    F.box(-53, 51, -119, -45, 52, -111, 199);
    // a rover that drives in circles
    F.state.rover = F.mover({ size: [7, 2.5, 10], position: [20, 2.5, -80], color: 1 });
    F.state.roverTop = F.add(blocks([[0.3, 4, 0.3, 0, 3, 3, 199], [3, 0.3, 3, 0, 5, 3, 199, { shape: 'cyl' }], ...[[-4, -3.5], [4, -3.5], [-4, 3.5], [4, 3.5]].map(([x, z]) => [1.2, 3, 3, x, -0.8, z, 26, { shape: 'cyl', rz: 90 }])]));
    // an astronaut, waving
    const astro = F.puppet({ colors: { head: 1, torso: 1, leftArm: 1, rightArm: 1, leftLeg: 1, rightLeg: 1 } }, { at: [-14, 0, -40, 0.4], hat: (head) => head.add(blocks([[2.2, 2.2, 2.2, 0, 0.1, 0, 1, { shape: 'ball', opacity: 0.6 }], [1.6, 1.1, 0.4, 0, 0.05, -0.85, 24, { opacity: 0.9 }]])) });
    astro.pose = (a, t) => { a.rs = 2.8 + Math.sin(t * 6) * 0.3; };
    F.state.astro = astro;
    F.gravity(0.22);
    F.fallKill(-80, 'drifted off into space');
    F.state.meteors = [];
  },
  start(F) { A.hum('space', 0.08, [60, 90.5, 121], { type: 'sine', lp: 400, wobble: 0.3 }); F.sound(null, 'space'); F.state.radioT = 3; },
  update(F, dt, t) {
    const S = F.state;
    const a = t * 0.25, rp = V(20 + Math.cos(a) * 24, 2.5, -80 + Math.sin(a) * 24);
    S.rover.setPosition(rp.x, rp.y, rp.z); S.rover.setRotationDeg(0, -a * 57.3, 0);
    S.roverTop.position.copy(rp); S.roverTop.rotation.y = -a;
    S.beacon.material = (Math.floor(t * 2) % 2) ? plastic(21, { emissive: 1 }) : plastic(26);
    if (!S.beaconTaken) for (const ch of F.chars()) if (ch.rootPosition.distanceTo(S.beacon.position) < 5) { S.beaconTaken = true; F.bonus(ch, 'One Small Step', 3); A.sparkle(S.beacon.position); }
    S.radioT -= dt; if (S.radioT <= 0) { S.radioT = rnd(5, 9); A.tone(1200, 0.08, { type: 'sine', vol: 0.12 }); A.tone(1200, 0.08, { type: 'sine', vol: 0.12, delay: 0.15 }); if (Math.random() < 0.5) F.say('Astronaut', pick(['Houston, we have visitors.', 'Mind the gravity.', 'Is that... an elevator?', 'Beautiful view of Earth today.']), S.astro); }
    // meteors at the end
    for (const m of [...S.meteors]) {
      m.v.y -= 40 * dt; m.g.position.addScaledVector(m.v, dt);
      if (m.g.position.y <= 1) {
        S.meteors.splice(S.meteors.indexOf(m), 1); F.E.world.scene.remove(m.g);
        const p = m.g.position.clone(); A.explosion(p, 0.7); F.burst('dust', p, 14, { speed: [4, 14], size: [2, 4], life: [1, 2], gravity: 0.1, grow: 1.5 }); F.shake(0.4);
        for (const ch of F.chars()) { const d = ch.rootPosition.distanceTo(p); if (d < 6) F.kill(ch, 'was flattened by a meteor', p); else if (d < 14) F.fling(ch, ch.rootPosition.clone().sub(p).setY(0).normalize().multiplyScalar(40).add(V(0, 40, 0)), 1); }
      }
    }
    if (S.shower) { S.mt -= dt; if (S.mt <= 0) { S.mt = rnd(0.3, 0.7); const tgt = V(rnd(-50, 50), 0, rnd(-90, -16)); const g = F.add(blocks([[3, 3, 3, 0, 0, 0, 106, { shape: 'ball', emissive: 0.8 }]])); g.position.copy(tgt).add(V(rnd(-60, 60), 160, rnd(-60, 0))); const v = tgt.clone().sub(g.position).normalize().multiplyScalar(90); S.meteors.push({ g, v }); F.flame(() => (g.parent ? g.position.clone() : null), 3, 4); } }
  },
  closing(F) { F.state.shower = true; F.state.mt = 0; F.say('Astronaut', 'METEOR SHOWER! Everybody inside!', F.state.astro); A.stinger(); },
};

// --- the gas leak ------------------------------------------------------------------------------------------------------------------------------------------------
export const gas = {
  id: 'gas', name: 'Gas Leak', hint: 'Turn off the valve - or stay out of the green stuff.', color: '#7aff5a', time: 32,
  look: look({ skyColor: 0x000000, amb: [0xc8d8c0, 0x3a3a30, 0.95], sun: [0xe0ffe0, 0.6], fog: [0x1a2a14, 60, 200] }),
  bots: { venture: 0.55, spots: [[-12, -22], [12, -26], [0, -38], [-14, -48], [10, -55]] },
  lines: ['*cough*', 'it smells', 'is that gas', 'turn off the valve!!', 'my eyes', 'dont breathe'],
  build(F) {
    const X0 = -26, X1 = 26, Z1 = -76, H = 22;
    F.room({ x0: X0, x1: X1, z1: Z1, h: H, floor: 199, wall: 216, ceiling: 199, floorTop: 'Studs' });
    // hazard stripes, warning signs
    F.plane(tiled(ctex('hazard', 64, 64, (x, w) => { x.fillStyle = '#f4cc20'; x.fillRect(0, 0, w, w); x.fillStyle = '#1a1a1a'; for (let i = -w; i < w * 2; i += 22) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 11, 0); x.lineTo(i + 11 - w, w); x.lineTo(i - w, w); x.fill(); } }), 26, 1), 52, 2, [0, 0.03, Z1 + 12], [-90, 0, 0], { decal: true });
    F.sign(-14, 12, Z1 + 0.4, 10, 5, '⚠ DANGER ⚠\nTOXIC GAS', { bg: '#f4cc20', fg: '#111', face: 'z', border: '#111' });
    F.sign(X1 - 0.4, 8, -30, 8, 3.5, 'WEAR YOUR MASK', { bg: '#ffffff', fg: '#c4281c', face: '-x' });
    // pipes, the boiler, a catwalk
    const pipe = (x0, y0, z0, x1, y1, z1, r, c) => { const d = V(x1 - x0, y1 - y0, z1 - z0), L = d.length(); const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 12), plastic(c)); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); F.add(m); };
    for (const [y, c] of [[16, 199], [18, 21], [14, 23]]) { pipe(X0 + 1, y, Z1 + 1, X0 + 1, y, DOOR_Z - 1.5, 0.6, c); pipe(X1 - 1, y + 1, Z1 + 1, X1 - 1, y + 1, DOOR_Z - 1.5, 0.6, c); }
    for (let z = -20; z > Z1; z -= 12) pipe(X0 + 1, 0, z, X0 + 1, H, z, 0.5, 199);
    F.add(blocks([[16, 18, 16, 0, 9, 0, 216, { shape: 'cyl' }], [17, 1, 17, 0, 17.5, 0, 199, { shape: 'cyl' }], [17, 1, 17, 0, 4, 0, 199, { shape: 'cyl' }]])).position.set(14, 0, -56);
    F.box(6, 0, -64, 22, 18, -48, 216, { transparency: 1 });
    F.box(X0, 10, -44, -10, 10.6, -36, 199); for (const x of [-25, -11]) F.box(x - 0.2, 10.6, -44, x + 0.2, 13, -36, 24);
    F.box(-12, 0, -44, -10, 10, -42, 199, { tags: ['climbable'] });
    // the leaking valve: a big red wheel on a pipe at the far end
    pipe(0, 0, Z1 + 1.5, 0, 12, Z1 + 1.5, 1, 199);
    const wheel = F.add(new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.35, 8, 20), plastic(21))); wheel.position.set(0, 7, Z1 + 3.2); F.state.wheel = wheel;
    wheel.add(new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.3, 0.3), plastic(21)), new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.4, 0.3), plastic(21)));
    F.state.gasZ = Z1 + 2; F.state.leak = true; F.state.turn = new Map(); F.state.puffT = 0;
    F.state.gasMat = new THREE.SpriteMaterial({ map: dtex().puff, color: 0x7aff4a, transparent: true, opacity: 0.4, depthWrite: false });
    F.state.cloud = [];
    for (const [x, z] of [[-8, -30], [8, -42], [-16, -60]]) F.light(V(x, 18, z), 0xd8ffd0, 50, 40);
  },
  start(F) { A.hiss(0.25); A.machine(0.15); F.sound(null, 'hiss'); F.sound(null, 'machine'); },
  update(F, dt, t) {
    const S = F.state, end = F.E.cur.time;
    // the gas spreads toward the doors (unless the valve is shut)
    if (S.leak) S.gasZ = Math.min(-9.5, -74 + (t / Math.max(1, end)) * 66);
    else S.gasZ = Math.max(-76, S.gasZ - dt * 12);
    S.puffT -= dt;
    if (S.puffT <= 0 && (S.leak || S.gasZ > -74)) {
      S.puffT = 0.12;
      const z = rnd(-76, S.gasZ), s = new THREE.Sprite(S.gasMat.clone()); s.position.set(rnd(-24, 24), rnd(0.5, 9), z); s.scale.setScalar(rnd(6, 12)); F.add(s); S.cloud.push({ s, age: 0, life: rnd(3, 5) });
    }
    for (const c of [...S.cloud]) { c.age += dt; c.s.position.y += dt * 0.6; c.s.material.opacity = 0.4 * Math.sin(Math.min(1, c.age / c.life) * Math.PI); if (c.age > c.life || c.s.position.z < S.gasZ - 80 || c.s.position.z > S.gasZ + 2) { F.E.world.scene.remove(c.s); c.s.material.dispose(); S.cloud.splice(S.cloud.indexOf(c), 1); } }
    for (const ch of F.chars()) {
      const p = ch.rootPosition;
      if (p.z < S.gasZ && p.y < 14) { F.hurt(ch, 14 * dt, 'breathed in the gas'); ch.gasT = t; if (Math.random() < dt * 0.8) A.cough(p); }
    }
    // turning the valve: stand by the wheel for a moment
    if (S.leak) for (const ch of F.chars()) {
      const near = ch.rootPosition.distanceTo(V(0, 3, -73)) < 6;
      const k = near ? (S.turn.get(ch) || 0) + dt : 0; S.turn.set(ch, k);
      if (near) S.wheel.rotation.z += dt * 3;
      if (k > 1.6) { S.leak = false; A.stop('hiss'); A.clunk(V(0, 7, -73)); F.bonus(ch, 'Valve Hero', 3); F.say('Intercom', 'Leak sealed. Thank you for your service.', V(0, 18, -40)); }
    }
  },
  tint(F, ch) { return ch?.alive && ch.gasT && F.t - ch.gasT < 0.2 ? ['radial-gradient(ellipse at center, rgba(60,140,20,0.25) 30%, rgba(80,200,30,0.6))', 1] : null; },
  botTick(F, bot) { if (F.state.leak && bot.bravery > 0.8 && bot.mode === 'out' && !bot.valve) { bot.valve = true; bot.plan.unshift(V(0, 0, -71)); } },
};

// --- the cow field --------------------------------------------------------------------------------------------------------------------------------------------
function cowModel(gold) {
  const c = gold ? 24 : 1, spot = gold ? 24 : 26;
  const g = blocks([[4, 3.2, 7, 0, 4.2, 0, c], [1, 3, 1, -1.4, 1.5, -2.6, c], [1, 3, 1, 1.4, 1.5, -2.6, c], [1, 3, 1, -1.4, 1.5, 2.6, c], [1, 3, 1, 1.4, 1.5, 2.6, c],
    [2.6, 2.6, 2.8, 0, 5.4, -4.6, c, { name: 'head' }], [2.2, 1.2, 0.6, 0, 4.6, -6.1, 223], [0.3, 0.9, 0.3, -1, 7, -4.6, 1], [0.3, 0.9, 0.3, 1, 7, -4.6, 1],
    [1.8, 1.4, 0.05, 2.01, 4.6, 0.8, spot, { ry: 90 }], [1.6, 1.8, 0.05, -2.01, 4.2, -1.2, spot, { ry: 90 }], [2, 0.05, 1.6, 0.5, 5.81, 1.6, spot], [0.8, 0.6, 1.2, 0, 2.3, 1.6, 223], [0.2, 2, 0.2, 0, 4, 3.6, c, { rx: 20 }]]);
  return g;
}
export const farm = {
  id: 'farm', name: 'Cow Field', hint: 'Just a nice, normal field. With cows.', color: '#8ae06a', time: 34,
  look: look({ sky: 'day', amb: [0xeaf4ff, 0x8aa060, 1.45], sun: [0xfff4d8, 1.4], fog: [0xd8ecff, 300, 1300] }),
  bots: { venture: 0.85, spots: [[-20, -30], [20, -34], [0, -50], [-34, -60], [30, -70], [-6, -80], [14, -24]] },
  lines: ['COWS', 'moo', 'i love cows', 'can i ride a cow', 'whats that in the sky', 'UFO!!!', 'they took the cow'],
  build(F) {
    F.ground(-220, -260, 220, 60, 37, { top: 'Studs' });
    // fences, the barn, haystacks, the windmill, a tractor, corn, a pond
    for (let x = -120; x <= 120; x += 8) { F.box(x - 0.3, 0, -150.3, x + 0.3, 4, -149.7, 192); }
    F.box(-120, 2.4, -150.2, 120, 2.9, -149.8, 192); F.box(-120, 3.6, -150.2, 120, 4.1, -149.8, 192);
    F.box(40, 0, -110, 76, 20, -80, 21); F.box(38, 20, -112, 78, 22, -78, 26);
    F.add(blocks([[40, 14, 1, 0, 0, 0, 21, { rx: 0 }]])).position.set(58, 27, -95);
    for (const s of [-1, 1]) { const r = F.add(blocks([[24, 1.2, 34, 0, 0, 0, 26]])); r.position.set(58 + s * 9.5, 26, -95); r.rotation.z = s * -0.75; }
    F.box(52, 0, -79.8, 64, 13, -79.6, 1); F.box(52.5, 0, -79.6, 63.5, 12.5, -79.4, 192);
    for (const [x, z] of [[-40, -70], [-46, -64], [-36, -58], [30, -40]]) F.box(x - 3, 0, z - 2, x + 3, 4, z + 2, 226, { top: 'Studs' });
    F.box(-80, 0, -110, -74, 40, -104, 1);
    F.state.blades = F.add(new THREE.Group()); F.state.blades.position.set(-77, 36, -103.5);
    for (let i = 0; i < 4; i++) { const b = blocks([[2.5, 16, 0.4, 0, 9, 0, 1]]); b.rotation.z = i * Math.PI / 2; F.state.blades.add(b); }
    F.box(-60, 0, -40, -50, 5, -32, 28); F.box(-58, 5, -40, -52, 10, -36, 28); F.add(blocks([[3, 7, 7, 0, 0, 0, 26, { shape: 'cyl', rz: 90 }]])).position.set(-62.5, 3.5, -38);
    for (let r = 0; r < 6; r++) for (let i = 0; i < 12; i++) F.box(80 + r * 4, 0, -60 - i * 4, 81 + r * 4, rnd(6, 9), -59 - i * 4, 119);
    F.box(-30, -0.5, -130, 0, 0.05, -110, 102, { canCollide: false, transparency: 0.2 });
    const scare = F.puppet({ colors: { head: 226, torso: 192, leftArm: 192, rightArm: 192, leftLeg: 23, rightLeg: 23 } }, { at: [16, 0, -66, 0.3], faceTex: FACES.grin() }); scare.pose = (a) => { a.rs = a.ls = 1.57; a.rh = a.lh = 0; };
    // the cows
    F.state.cows = [];
    for (let i = 0; i < 9; i++) { const g = cowModel(i === 0); g.position.set(rnd(-60, 60), 0, rnd(-140, -26)); g.rotation.y = rnd(0, 6.28); F.add(g); F.state.cows.push({ g, gold: i === 0, tgt: null, t: rnd(0, 5), alive: true }); }
    F.state.mooT = 2;
  },
  start(F) { A.gulls(0.08); F.sound(null, 'gulls'); },
  update(F, dt, t) {
    const S = F.state;
    S.blades.rotation.z += dt * 1.2;
    for (const c of S.cows) {
      if (!c.alive || c.beam) continue;
      c.t -= dt;
      if (c.t <= 0) { c.t = rnd(3, 7); c.tgt = Math.random() < 0.6 ? V(c.g.position.x + rnd(-14, 14), 0, Math.min(-22, Math.max(-145, c.g.position.z + rnd(-14, 14)))) : null; }
      if (c.tgt) { const d = c.tgt.clone().sub(c.g.position).setY(0); if (d.length() > 0.5) { c.g.position.addScaledVector(d.normalize(), dt * 3); c.g.rotation.y = Math.atan2(-d.x, -d.z); } }
      const head = c.g.getObjectByName('head'); if (head) head.position.y = 5.4 - (c.tgt ? 0 : 1.2 + Math.sin(t * 2 + c.t) * 0.3);
    }
    if (!S.goldTaken) { const gc = S.cows[0]; for (const ch of F.chars()) if (gc.alive && ch.rootPosition.distanceTo(gc.g.position.clone().add(V(0, 3, 0))) < 5.5) { S.goldTaken = true; F.bonus(ch, 'Golden Cow', 2); A.moo(gc.g.position); } }
    S.mooT -= dt; if (S.mooT <= 0) { S.mooT = rnd(2, 5); const c = pick(S.cows.filter((q) => q.alive)); if (c) A.moo(c.g.position); }
    // the UFO
    if (!S.ufo && t > 9) {
      const u = new THREE.Group();
      u.add(new THREE.Mesh(new THREE.SphereGeometry(14, 28, 10).scale(1, 0.22, 1), new THREE.MeshPhongMaterial({ color: 0xa8b0bc, shininess: 120, specular: 0xffffff })));
      u.add(new THREE.Mesh(new THREE.SphereGeometry(5, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0x88ffcc, transparent: true, opacity: 0.6, emissive: 0x22aa66 })));
      S.ufoLights = [];
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const l = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffff60 })); l.position.set(Math.cos(a) * 12.5, -0.8, Math.sin(a) * 12.5); u.add(l); S.ufoLights.push(l); }
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 9, 60, 20, 1, true).translate(0, -30, 0), new THREE.MeshBasicMaterial({ color: 0x9affd0, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      u.add(beam); beam.visible = false; S.beam = beam;
      u.position.set(-200, 120, -260); F.add(u); S.ufo = u; S.ufoPhase = 'come'; S.take = 0;
      A.ufoHum(0.3); F.sound(null, 'ufo');
      F.E.game.players.forEach((p) => { if (p.brain && Math.random() < 0.4) F.E.world.delay(rnd(0.5, 2), () => p.brain.say(pick(['UFO!!!', 'whats that', 'ALIENS', 'omg look up']))); });
    }
    if (S.ufo) {
      const u = S.ufo;
      u.rotation.y += dt * 1.5; S.ufoLights.forEach((l, i) => l.material.color.set((Math.floor(t * 6) + i) % 2 ? 0xffff60 : 0xff3060));
      if (S.ufoPhase === 'come' || S.ufoPhase === 'hunt') {
        if (!S.victim || !S.victim.alive) { const cows = S.cows.filter((c) => c.alive && !c.beam); S.victim = cows.length && Math.random() < 0.75 ? pick(cows) : null; if (!S.victim) S.victim = { chase: true, alive: true }; }
        const tp = S.victim.chase ? (F.nearest(u.position, { outside: true })?.rootPosition || V(0, 0, -60)) : S.victim.g.position;
        const want = V(tp.x, 38, tp.z), d = want.clone().sub(u.position);
        u.position.addScaledVector(d, Math.min(1, dt * (S.ufoPhase === 'come' ? 0.6 : 1.1)));
        if (d.length() < 3) { S.ufoPhase = 'beam'; S.beamT = 0; S.beam.visible = true; A.zap(u.position); }
      } else if (S.ufoPhase === 'beam') {
        S.beamT += dt;
        // everything in the beam floats up
        const v = S.victim;
        if (v.g) { v.beam = true; v.g.position.lerp(V(u.position.x, u.position.y - 4, u.position.z), Math.min(1, dt * 0.9)); v.g.rotation.y += dt * 3; if (v.g.position.y > u.position.y - 6) { v.alive = false; v.g.visible = false; A.moo(u.position); } }
        for (const ch of F.chars({ outside: true })) {
          const p = ch.rootPosition;
          if (Math.hypot(p.x - u.position.x, p.z - u.position.z) < 5 + (u.position.y - p.y) * 0.1) {
            ch.platformStand = true; ch.flungUntil = F.E.world.time + 0.6; ch.body.velocity.set((u.position.x - p.x) * 2, 14, (u.position.z - p.z) * 2);
            if (p.y > u.position.y - 6) F.kill(ch, 'was abducted by aliens');
          }
        }
        if (S.beamT > 4.5) { S.beam.visible = false; S.ufoPhase = 'hunt'; S.victim = null; }
      } else if (S.ufoPhase === 'leave') { u.position.add(V(dt * 140, dt * 60, -dt * 80)); S.beam.visible = false; }
    }
  },
  closing(F) { if (F.state.ufo) { F.state.ufoPhase = 'leave'; A.zap(F.state.ufo.position); } },
};
void liveTex; void DOOR_Z;
