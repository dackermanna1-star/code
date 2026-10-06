// Total Chaos: three disasters back to back. First a storm of giant poops
// (some fall straight out of the sky, some fly around on little wings and
// dive-bomb people), then killer clowns with knives come out of the ground
// and hunt everyone down, and finally a black hole is summoned that tears
// around the island at speed, dragging in and swallowing everything (clowns
// included). Every model, effect and sound here is made in code.
import * as THREE from 'three';
import { G } from './maps.js';
import { Character } from '../../engine/Character.js';
import { GROUP } from '../../engine/Part.js';
import { sounds } from '../../engine/Sound.js';
import { tex, groundMark } from './effects.js';
import { explosion } from './audio.js';
import { canvasTex, resources, groundAt, near, knock, blastPeople, wreck, chat, light, timed, streak, popAt, ring, bolt } from './vfx.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const PHASES = [
  { id: 'poop', at: 0, name: 'POOP STORM', icon: '💩', tip: 'Take cover!', bots: 'inside' },
  { id: 'clowns', at: 24, name: 'KILLER CLOWNS', icon: '🤡', tip: "They've got knives - run, or get up high!", bots: 'high' },
  { id: 'hole', at: 50, name: 'BLACK HOLE', icon: '🕳️', tip: 'Get as far away from it as you can!', bots: 'away' },
];
/** People (not clowns) on the island. */
const people = (D) => D.chars().filter((ch) => !ch.clown);

// --- textures ------------------------------------------------------------------------------------------------------------
let TX = null;
function textures() {
  if (TX) return TX;
  TX = {};
  // a brown splat on the ground
  TX.splat = canvasTex(256, 256, (x, w) => {
    x.fillStyle = '#4a2a10';
    const blob = (cx, cy, r) => { x.beginPath(); for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2, rr = r * (0.75 + Math.random() * 0.35); x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.fill(); };
    blob(w / 2, w / 2, w * 0.3);
    for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, d = w * rnd(0.25, 0.45); blob(w / 2 + Math.cos(a) * d, w / 2 + Math.sin(a) * d, w * rnd(0.03, 0.08)); }
    x.fillStyle = 'rgba(120,70,30,0.6)'; blob(w * 0.45, w * 0.45, w * 0.12);
  });
  // the clowns' painted faces: diamond eyes, a red-pupilled stare and a grin full of teeth
  TX.clown = canvasTex(256, 256, (x, S) => {
    for (const s of [-1, 1]) {
      const cx = S * (0.5 + s * 0.1), cy = S * 0.4;
      x.fillStyle = '#2a6ae8'; x.beginPath(); x.moveTo(cx, cy - S * 0.13); x.lineTo(cx + S * 0.05, cy); x.lineTo(cx, cy + S * 0.13); x.lineTo(cx - S * 0.05, cy); x.fill();
      x.fillStyle = '#000'; x.beginPath(); x.ellipse(cx, cy, S * 0.03, S * 0.045, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#ff2020'; x.beginPath(); x.arc(cx, cy, S * 0.012, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(230,40,60,0.55)'; x.beginPath(); x.arc(S * (0.5 + s * 0.2), S * 0.58, S * 0.05, 0, Math.PI * 2); x.fill();
    }
    x.strokeStyle = '#000'; x.lineWidth = S * 0.02; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(S * (0.5 + s * 0.04), S * 0.3); x.lineTo(S * (0.5 + s * 0.16), S * 0.25); x.stroke(); }
    x.fillStyle = '#d01818'; x.beginPath(); x.arc(S * 0.5, S * 0.5, S * 0.24, Math.PI * 0.12, Math.PI * 0.88); x.arc(S * 0.5, S * 0.47, S * 0.24, Math.PI * 0.86, Math.PI * 0.14, true); x.closePath(); x.fill();
    x.fillStyle = '#200000'; x.beginPath(); x.arc(S * 0.5, S * 0.52, S * 0.19, Math.PI * 0.18, Math.PI * 0.82); x.arc(S * 0.5, S * 0.5, S * 0.19, Math.PI * 0.8, Math.PI * 0.2, true); x.closePath(); x.fill();
    x.fillStyle = '#f4f0e0'; for (let i = 0; i < 9; i++) { const a = Math.PI * (0.24 + i * 0.065); const px = S * 0.5 + Math.cos(a) * S * 0.185, py = S * 0.515 + Math.sin(a) * S * 0.17; x.beginPath(); x.moveTo(px - S * 0.012, py - S * 0.012); x.lineTo(px + S * 0.012, py - S * 0.012); x.lineTo(px, py + S * 0.03); x.fill(); }
  });
  TX.square = canvasTex(16, 16, (x) => { x.fillStyle = '#fff'; x.fillRect(2, 2, 12, 12); });
  // the black hole's glowing disk, seen from above: white-hot inside, red and violet further out, streaked into a spiral
  TX.disk = canvasTex(512, 512, (x, w) => {
    const c = w / 2;
    const g = x.createRadialGradient(c, c, w * 0.15, c, c, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.06, 'rgba(255,250,230,1)'); g.addColorStop(0.2, 'rgba(255,200,90,0.95)'); g.addColorStop(0.45, 'rgba(255,110,30,0.75)'); g.addColorStop(0.7, 'rgba(170,40,120,0.45)'); g.addColorStop(1, 'rgba(60,10,90,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, w);
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 220; i++) {
      const r0 = rnd(0.16, 0.48) * w, a0 = Math.random() * Math.PI * 2, len = rnd(0.4, 1.4);
      x.strokeStyle = `rgba(${pick(['255,230,180', '255,160,80', '255,120,200', '255,255,255'])},${rnd(0.05, 0.22)})`; x.lineWidth = rnd(1, 4);
      x.beginPath(); for (let k = 0; k <= 12; k++) { const a = a0 + (k / 12) * len, r = r0 * (1 - (k / 12) * 0.12); x.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); } x.stroke();
    }
    x.globalCompositeOperation = 'destination-out';
    const h = x.createRadialGradient(c, c, 0, c, c, w * 0.16); h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.95, 'rgba(0,0,0,1)'); h.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = h; x.fillRect(0, 0, w, w);
  });
  TX.photon = canvasTex(256, 256, (x, w) => { const c = w / 2; const g = x.createRadialGradient(c, c, w * 0.3, c, c, w / 2); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,220,170,0)'); g.addColorStop(0.68, 'rgba(255,230,190,1)'); g.addColorStop(0.8, 'rgba(255,140,60,0.35)'); g.addColorStop(1, 'rgba(255,100,40,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); });
  TX.dark = canvasTex(128, 128, (x, w) => { const c = w / 2; const g = x.createRadialGradient(c, c, 0, c, c, c); g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.45, 'rgba(10,0,20,0.6)'); g.addColorStop(1, 'rgba(10,0,20,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); });
  return TX;
}

// --- 1. the poop storm ------------------------------------------------------------------------------------------------
function poopMats() {
  return {
    poop: new THREE.MeshPhongMaterial({ color: 0x7a4620, shininess: 70, specular: 0x6a5040 }),
    white: new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 40 }),
    black: new THREE.MeshBasicMaterial({ color: 0x101010 }),
    wing: new THREE.MeshPhongMaterial({ color: 0xf4f4f8, side: THREE.DoubleSide }),
    cone: new THREE.ConeGeometry(1, 1, 14),
    smile: new THREE.TorusGeometry(0.34, 0.06, 6, 18, Math.PI),
    stink: new THREE.SpriteMaterial({ map: tex().puff, color: 0x8aa040, transparent: true, opacity: 0.5, depthWrite: false }),
    brown: new THREE.SpriteMaterial({ map: tex().soft, color: 0x4a2a10, transparent: true, depthWrite: false }),
  };
}
/** The poop, emoji style: three swirls, a curly tip, eyes and a big smile (and wings, if it flies). */
function poopModel(S, winged) {
  const M = S.pm, g = new THREE.Group();
  const add = (geo, mat, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m; };
  add(S.R.sphere, M.poop, 0, 0.36, 0, 1.15, 0.56, 1.15);
  add(S.R.sphere, M.poop, 0.04, 0.92, 0, 0.86, 0.46, 0.86);
  add(S.R.sphere, M.poop, -0.02, 1.38, 0, 0.56, 0.38, 0.56);
  const tip = add(M.cone, M.poop, 0.1, 1.86, 0, 0.3, 0.5, 0.3); tip.rotation.z = -0.5;
  for (const s of [-1, 1]) { add(S.R.sphere, M.white, s * 0.32, 0.98, -0.7, 0.2, 0.25, 0.12); add(S.R.sphere, M.black, s * 0.3, 0.98, -0.8, 0.09, 0.12, 0.05); }
  const smile = new THREE.Mesh(M.smile, M.black); smile.position.set(0, 0.62, -1.0); smile.rotation.z = Math.PI; g.add(smile);
  if (winged) {
    g.userData.wings = [-1, 1].map((s) => {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.8, 1.0, 0.2); g.add(pivot);
      for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(S.R.plane, M.wing); f.scale.set(1.5 - i * 0.25, 0.42, 1); f.position.set(s * (0.75 - i * 0.05), 0.1 - i * 0.3, 0); f.rotation.x = Math.PI / 2; f.rotation.z = s * 0.15 * i; pivot.add(f); }
      pivot.userData.s = s;
      return pivot;
    });
  }
  S.layer.add(g);
  return g;
}
function spawnPoop(D, S) {
  const folks = people(D);
  const target = folks.length && Math.random() < 0.35 ? pick(folks).rootPosition.clone().add(V(rnd(-6, 6), 0, rnd(-6, 6))) : V(rnd(-95, 95), 0, rnd(-95, 95));
  const flying = Math.random() < 0.3;
  const size = rnd(3, 5.5) * (flying ? 0.8 : 1);
  const g = poopModel(S, flying);
  g.scale.setScalar(size);
  const p = { g, size, flying, t: 0, spin: V(rnd(-2, 2), rnd(-2, 2), rnd(-2, 2)), target, ph: Math.random() * 6 };
  if (flying) {
    const a = Math.random() * Math.PI * 2;
    p.pos = V(Math.cos(a) * 150, rnd(45, 70), Math.sin(a) * 150);
    p.cruise = rnd(2, 3.5);
    p.wander = V(rnd(-60, 60), rnd(30, 50), rnd(-60, 60));
    SFX.flap(D, p.pos);
  } else {
    p.pos = target.clone().add(V(rnd(-35, 35), rnd(190, 230), rnd(-35, 35)));
    p.pos.z = Math.max(p.pos.z, target.z - 5, -120); // (clear of the sky lobby)
    p.vel = target.clone().sub(p.pos).normalize().multiplyScalar(rnd(105, 130));
    SFX.whistle(D, target);
  }
  g.position.copy(p.pos);
  S.poops.push(p);
}
function updatePoops(D, S, dt) {
  for (const p of [...S.poops]) {
    p.t += dt;
    if (p.flying && p.t < p.cruise) {
      // cruising about on little wings...
      const to = p.wander.clone().sub(p.pos); const d = to.length();
      if (d < 8) p.wander.set(rnd(-70, 70), rnd(30, 55), rnd(-70, 70));
      p.pos.addScaledVector(to.normalize(), 48 * dt); p.pos.y += Math.sin(p.t * 6 + p.ph) * dt * 6;
      p.g.rotation.set(0, Math.atan2(-to.x, -to.z), Math.sin(p.t * 3) * 0.2);
      for (const w of p.g.userData.wings) w.rotation.z = w.userData.s * Math.sin(p.t * 22) * 0.8;
      if (Math.random() < dt * 0.8) SFX.fart(D, p.pos, 0.5);
      p.g.position.copy(p.pos);
      continue;
    }
    if (p.flying && !p.vel) {
      // ...then the dive
      const folks = people(D);
      const t = folks.length && Math.random() < 0.75 ? pick(folks).rootPosition.clone() : p.target;
      p.vel = t.sub(p.pos).normalize().multiplyScalar(95);
      SFX.whistle(D, p.pos, 0.7);
    }
    const next = p.pos.clone().addScaledVector(p.vel, dt);
    const hit = D.world.raycast(p.pos, next, { mask: GROUP.WORLD | GROUP.DYNAMIC });
    if (p.flying) { for (const w of p.g.userData.wings) w.rotation.z = w.userData.s * -1.1; p.g.lookAt(next); p.g.rotateX(Math.PI / 2); }
    else { p.g.rotation.x += p.spin.x * dt; p.g.rotation.y += p.spin.y * dt; p.g.rotation.z += p.spin.z * dt; }
    if (Math.random() < dt * 14) D.fx.burst(S.pm.brown, p.pos, 1, { speed: [0, 2], size: [1, 2], life: [0.4, 0.8], gravity: -0.05, grow: 1.5 });
    if (hit || next.y < D.water.level || p.t > 12) {
      S.poops.splice(S.poops.indexOf(p), 1);
      splat(D, S, hit ? hit.point : next, p);
      continue;
    }
    p.pos.copy(next); p.g.position.copy(p.pos);
  }
}
function splat(D, S, at, p) {
  const r = p.size;
  if (at.y < D.water.level + 0.5) {
    S.layer.remove(p.g);
    D.fx.burst(D.fx.mats.dust, at.clone().setY(D.water.level), 16, { speed: [6, 20], size: [1, 2.5], life: [0.6, 1.2], gravity: 0.8 });
    SFX.splat(D, at, 0.7);
    return;
  }
  // flattened where it landed
  p.g.rotation.set(0, Math.random() * 6.28, 0);
  p.g.scale.set(r * 1.3, r * 0.45, r * 1.3);
  p.g.position.copy(at);
  if (p.g.userData.wings) for (const w of p.g.userData.wings) w.visible = false;
  S.piles.push({ g: p.g, t: 0, y: at.y });
  D.fx.burst(S.pm.brown, at.clone().add(V(0, 1, 0)), 22, { speed: [8, 26], size: [0.8, 2.2], life: [0.6, 1.3], gravity: 0.9 });
  ring(S, at.clone().add(V(0, 0.5, 0)), UP, 0x8a5a2a, r * 4, 0.45);
  if (S.marks.length < 60) S.marks.push(groundMark(D.world, textures().splat, at.x, groundAt(D, at.x, at.z), at.z, r * 3.4));
  // whoever it lands on
  for (const ch of D.chars()) {
    const d = ch.rootPosition.distanceTo(at);
    if (d < r * 0.75 + 1) D.kill(ch, at.clone(), 'poop');
    else if (d < r * 2.4) { D.hurt(ch, 55 * (1 - d / (r * 2.4)) + 5, 'poop'); if (ch.alive) knock(D, ch, at, 40, 30); }
  }
  wreck(D, at, r * 1.5, 40);
  // and the smell
  S.stink.push({ at: at.clone(), r: r * 2.2, t: 0, life: 7, s: [0, 1, 2, 3].map(() => { const sp = new THREE.Sprite(S.pm.stink); sp.position.copy(at).add(V(rnd(-r, r), rnd(1, r), rnd(-r, r))); sp.scale.setScalar(r * rnd(1.6, 2.6)); S.layer.add(sp); return sp; }) });
  SFX.splat(D, at, 1);
  if (Math.random() < 0.4) SFX.fart(D, at, 1);
  D.shake(0.5 * near(D, at, 120));
}
function updateStink(D, S, dt) {
  for (const s of [...S.stink]) {
    s.t += dt;
    for (const sp of s.s) { sp.position.y += dt * 1.5; sp.material.rotation += dt * 0.2; }
    for (const ch of D.chars()) if (!ch.clown && ch.rootPosition.distanceTo(s.at) < s.r && !ch._stunk) { ch._stunk = true; D.hurt(ch, 4 * dt, 'stink'); }
    if (s.t > s.life) { for (const sp of s.s) S.layer.remove(sp); S.stink.splice(S.stink.indexOf(s), 1); }
  }
  for (const ch of D.chars()) ch._stunk = false; // (one cloud at a time)
  for (const p of [...S.piles]) {
    p.t += dt;
    if (p.t > 9) { p.g.position.y = p.y - (p.t - 9) * 2; if (p.t > 12) { S.layer.remove(p.g); S.piles.splice(S.piles.indexOf(p), 1); } }
  }
}

// --- 2. the killer clowns ------------------------------------------------------------------------------------------------
const SUITS = [21, 23, 24, 28, 104, 106, 1];
function makeClown(D, S, at) {
  const c1 = pick(SUITS), c2 = pick(SUITS.filter((c) => c !== c1)), c3 = pick(SUITS);
  const ch = new Character(D.world, { name: 'Killer Clown', appearance: { colors: { head: 1, torso: c1, leftArm: c2, rightArm: c1, leftLeg: c3, rightLeg: c2 }, face: 'Smile', hats: [], shirt: null, pants: null, tshirt: null } });
  ch.clown = true;
  const m = ch.model, M = S.cm;
  m.head.children[0].material = M.face;
  const add = (parent, geo, mat, x, y, z, s) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); if (Array.isArray(s)) o.scale.set(...s); else o.scale.setScalar(s); o.castShadow = true; parent.add(o); return o; };
  add(m.head, S.R.sphere, M.nose, 0, -0.02, -0.68, 0.2);
  const hair = pick([M.hairO, M.hairG, M.hairR, M.hairB]);
  for (const s of [-1, 1]) { add(m.head, S.R.sphere, hair, s * 0.62, 0.22, 0.1, [0.42, 0.48, 0.5]); add(m.head, S.R.sphere, hair, s * 0.5, 0.5, 0.28, 0.3); }
  if (Math.random() < 0.5) { const hat = add(m.head, M.cone, pick([M.hairR, M.hairB, M.hairG]), 0.05, 0.95, 0, [0.32, 0.75, 0.32]); hat.rotation.z = -0.25; add(m.head, S.R.sphere, M.white, 0.2, 1.32, 0, 0.12); }
  const ruff = add(m.root, M.ruff, M.white, 0, 1.02, 0, 1); ruff.rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) add(m.root, S.R.sphere, pick([M.hairR, M.hairB, M.hairG, M.black]), 0, 0.55 - i * 0.45, -0.52, [0.13, 0.13, 0.06]); // pom-pom buttons
  // the knife, held point-forward
  const grip = m.rightGrip;
  add(grip, M.box, M.black, 0, -0.1, 0, [0.22, 0.6, 0.28]);
  const blade = add(grip, M.blade, M.steel, 0, -1.05, 0, [0.06, 1.4, 0.32]); blade.rotation.y = Math.PI / 2;
  if (D.world.shadows) m.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  ch.spawn(at, Math.random() * 6.28);
  ch.baseSpeed = rnd(14.5, 17); // about as fast as you: you can outrun most of them ch.walkSpeed = ch.baseSpeed; ch.maxHealth = ch.health = 100;
  // arms: the knife held out in front, stabbing when close
  ch.pose = (c, des, Mv) => {
    const st = c.stabT > 0 ? Math.sin((0.3 - c.stabT) / 0.3 * Math.PI) : 0;
    des.rs = 1.45 + st * 0.5; Mv.rs = c.stabT > 0 ? 0.6 : 0.2;
    if (c.state === 'Running') des.ls = Math.sin(c.animClock * 9) * 0.8;
  };
  const c = { ch, t: 0, rise: 0.7, target: null, retarget: 0, cool: 0, stuck: 0, last: at.clone(), side: 0, laugh: rnd(2, 6) };
  S.clowns.push(c); S.allClowns.push(ch);
  // they come up out of the ground in a burst of confetti
  confetti(D, S, at.clone().add(V(0, 1, 0)), 40);
  SFX.honk(D, at);
  return c;
}
function confetti(D, S, at, n) {
  for (let i = 0; i < 4; i++) D.fx.burst(S.cm.confetti[i], at, Math.round(n / 4), { speed: [6, 22], size: [0.3, 0.6], life: [1, 2], gravity: 0.35, dir: UP, cone: 1.4 });
}
function updateClowns(D, S, dt) {
  S.threats = [];
  for (const c of [...S.clowns]) {
    const ch = c.ch;
    if (!ch.alive) { S.clowns.splice(S.clowns.indexOf(c), 1); continue; }
    c.t += dt;
    S.threats.push(ch.rootPosition);
    ch.stabT = Math.max(0, (ch.stabT || 0) - dt);
    if (c.t < c.rise) { ch.input.move.set(0, 0, 0); continue; }
    // pick the nearest victim every so often
    c.retarget -= dt;
    if (c.retarget <= 0 || !c.target?.alive) {
      c.retarget = rnd(0.4, 0.9);
      let best = null, bd = 160;
      for (const v of people(D)) { const d = v.rootPosition.distanceTo(ch.rootPosition) + (v === c.target ? -8 : 0); if (d < bd) { bd = d; best = v; } }
      c.target = best;
    }
    const p = ch.rootPosition;
    let dir;
    if (c.target) {
      const tp = c.target.rootPosition;
      dir = V(tp.x - p.x, 0, tp.z - p.z);
      const d = dir.length(), dy = tp.y - p.y;
      // close enough: stab
      c.cool -= dt;
      if (d < 4.2 && Math.abs(dy) < 4 && c.cool <= 0) {
        c.cool = rnd(0.8, 1.15); ch.stabT = 0.3;
        D.hurt(c.target, 24, 'clown');
        if (c.target.alive) knock(D, c.target, p, 18, 12);
        popAt(S, tp.clone().add(V(0, 0.5, 0)), 'flashR', 3, 0.15);
        SFX.stab(D, tp);
        if (Math.random() < 0.4) SFX.laugh(D, p);
      }
      if (d < 2.2) dir.set(0, 0, 0);
    } else dir = V(Math.sin(c.t * 0.3), 0, Math.cos(c.t * 0.3));
    // stuck behind something: jump, and try going round it
    if (dir.lengthSq() > 0.01) {
      dir.normalize();
      if (c.side) dir.addScaledVector(V(-dir.z, 0, dir.x), c.side * 1.2).normalize();
      ch.input.move.copy(dir);
      const feet = p.y - 3;
      const blocked = D.world.raycast(V(p.x, feet + 1.4, p.z), V(p.x + dir.x * 3, feet + 1.4, p.z + dir.z * 3), { mask: GROUP.WORLD | GROUP.DYNAMIC });
      ch.input.jump = !!blocked && ch.grounded;
    } else { ch.input.move.set(0, 0, 0); ch.input.jump = false; }
    if (c.t % 1.2 < dt) {
      const moved = hd(p, c.last); c.last.copy(p);
      if (c.target && moved < 3) { c.stuck++; if (c.stuck > 1) { c.side = Math.random() < 0.5 ? -1 : 1; c.stuck = 0; } } else if (moved > 6) c.side = 0;
    }
    c.laugh -= dt;
    if (c.laugh <= 0) { c.laugh = rnd(4, 9); if (near(D, p, 90) > 0) SFX.laugh(D, p); }
  }
}

// --- 3. the black hole ----------------------------------------------------------------------------------------------------
function buildHole(S) {
  const T = textures(), g = new THREE.Group();
  const core = new THREE.Mesh(S.R.sphere, new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
  const diskMat = new THREE.MeshBasicMaterial({ map: T.disk, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const disk = new THREE.Mesh(new THREE.RingGeometry(1.05, 4.6, 96, 1), diskMat);
  const tilt = new THREE.Group(); tilt.add(disk); disk.rotation.x = -Math.PI / 2;
  const photon = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.photon, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex().soft, color: 0x8a40ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  const dark = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dark, transparent: true, depthWrite: false, fog: false }));
  g.add(dark, halo, tilt, photon, core);
  S.layer.add(g);
  const h = {
    g, core, disk, tilt, photon, halo, dark, r: 0,
    set(r) { h.r = r; core.scale.setScalar(r); disk.scale.setScalar(r); photon.scale.setScalar(r * 2.9); halo.scale.setScalar(r * 9); dark.scale.setScalar(r * 6); g.visible = r > 0.02; },
    dispose() { S.layer.remove(g); core.material.dispose(); diskMat.dispose(); disk.geometry.dispose(); photon.material.dispose(); halo.material.dispose(); dark.material.dispose(); },
  };
  h.set(0);
  return h;
}
function summonHole(D, S) {
  const H = S.hole = { pos: V(rnd(-50, 50), 150, rnd(-50, 50)), vel: V(), goal: null, retarget: 0, eaten: 0, r: 0, state: 'summon', t: 0, model: buildHole(S) };
  H.model.g.position.copy(H.pos);
  D.sky.set({ dome: 1, fog: 0x0c0818, near: 60, far: 650, amb: 0.42, sun: 0.25, tint: 0x6a5a90 });
  SFX.summon(D);
  S.drone = SFX.drone();
  chat(D, ['BLACK HOLE', 'WHAT IS THAT', 'its pulling everything in', 'we are so dead', 'RUN FROM THE HOLE'], 3);
}
function updateHole(D, S, dt) {
  const H = S.hole;
  if (!H) return;
  H.t += dt;
  const M = H.model;
  // summoned: a rift in the sky that opens up, then drops down to the ground and starts to roam
  if (H.state === 'summon') {
    const k = Math.min(1, H.t / 2.4);
    H.r = 3 * k;
    if (Math.random() < dt * 14) bolt(S, H.pos, H.pos.clone().add(V(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(8, 22))), 'purple', 0.25);
    D.shake(0.3);
    if (H.t > 2.4) {
      const ground = G + 9;
      H.pos.y += (ground - H.pos.y) * Math.min(1, dt * 3);
      if (H.pos.y < ground + 2) { H.state = 'roam'; ring(S, V(H.pos.x, G + 0.5, H.pos.z), UP, 0xa060ff, 50, 0.8); SFX.boom(D, H.pos); D.shake(1); }
    }
  } else if (H.state === 'roam') {
    H.r = Math.min(10, 3.5 + H.eaten * 0.012);
    // it hunts: off after crowds of people, or anywhere, fast and never in a straight line for long
    H.retarget -= dt;
    if (H.retarget <= 0 || !H.goal || hd(H.goal, H.pos) < 8) {
      H.retarget = rnd(1.4, 2.8);
      const folks = people(D);
      H.goal = folks.length && Math.random() < 0.42 ? pick(folks).rootPosition.clone() : V(rnd(-95, 95), 0, rnd(-95, 95)); // (where they were: dodge!)
      H.goal.x = clamp(H.goal.x, -105, 105); H.goal.z = clamp(H.goal.z, -105, 105);
      H.speed = rnd(26, 40);
    }
    const want = V(H.goal.x - H.pos.x, 0, H.goal.z - H.pos.z).normalize().multiplyScalar(H.speed);
    H.vel.lerp(want, Math.min(1, dt * 1.6));
    H.pos.addScaledVector(H.vel, dt);
    H.pos.y += ((G + H.r + 5) - H.pos.y) * Math.min(1, dt * 2);
  } else if (H.state === 'collapse') {
    H.r = Math.max(0, H.r - dt * 14);
    if (H.r <= 0.05) {
      // it goes out with a bang
      const at = H.pos.clone();
      popAt(S, at, 'flashW', 80, 0.5); ring(S, at, UP, 0xc080ff, 90, 1); ring(S, at, V(0.3, 1, 0.2), 0xffffff, 60, 0.7);
      blastPeople(D, at, 45, 40, 'hole', 90); wreck(D, at, 20, 80);
      explosion(null, 1.8); D.shake(1.4 * near(D, at, 300)); D.sky.flash = 1;
      M.dispose(); S.hole = null; S.drone?.stop(); S.drone = null;
      return;
    }
  }
  M.set(H.r); M.g.position.copy(H.pos);
  M.disk.rotation.z += dt * 2.6;
  M.tilt.rotation.set(0.35 + Math.sin(H.t * 0.7) * 0.15, H.t * 0.3, Math.cos(H.t * 0.5) * 0.12);
  M.halo.material.opacity = 0.3 + Math.sin(H.t * 7) * 0.08;
  light(D, H.pos, 0xb060ff, 40, 80, 0.1);
  if (H.state !== 'roam') return;
  const P = H.pos, r = H.r, now = D.world.time;
  // matter spiralling in
  if (Math.random() < dt * 40) { const a = Math.random() * Math.PI * 2, d = r * rnd(3, 6), s = P.clone().add(V(Math.cos(a) * d, rnd(-r, r) * 0.5, Math.sin(a) * d)); streak(S, s, s.clone().lerp(P, 0.4).add(V(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(d * 0.4)), pick(['streakP', 'streakR', 'streakB']), 0.8, 0.25); }
  if (Math.random() < dt * 3) bolt(S, P, P.clone().add(V(rnd(-1, 1), rnd(-0.5, 0.8), rnd(-1, 1)).normalize().multiplyScalar(r * rnd(2, 4))), 'purple', 0.2);
  // buildings are torn apart and dragged in
  for (const p of D.st.near(P, r + 16)) { const d = p.mesh.position.distanceTo(P); if (Math.random() < dt * 7 * (1 - d / (r + 16) + 0.2)) D.collapse(p, P.clone().sub(p.mesh.position).normalize().multiplyScalar(45), 2); }
  // loose things fall in, and are gone
  for (const p of D.world.dynamicParts) {
    if (!p.body) continue;
    const to = P.clone().sub(p.mesh.position), d = to.length();
    if (d > 70) continue;
    if (d < r + 1.5) { if (p.structure) { p.structure.remove(p); H.eaten++; } continue; }
    p.body.wakeUp();
    const f = Math.min(400, 9000 / (d * d)) * dt; to.normalize();
    p.body.velocity.x += to.x * f + to.z * f * 0.5; p.body.velocity.y += to.y * f + 196 * dt * 0.7; p.body.velocity.z += to.z * f - to.x * f * 0.5;
  }
  // and so do people
  for (const ch of D.chars()) {
    const to = P.clone().sub(ch.rootPosition), d = to.length();
    if (d < r + 1.8) {
      streak(S, ch.rootPosition.clone(), P.clone(), 'streakP', 1.2, 0.4);
      D.kill(ch, P.clone(), 'hole'); H.eaten += 20;
      for (const dbr of ch.debris || []) { D.world.scene.remove(dbr.mesh); D.world.physics.removeBody(dbr.body); }
      if (ch.debris) ch.debris.length = 0;
      continue;
    }
    if (d > 75) continue;
    to.normalize();
    if (d < r + 17) {
      // caught: lifted off your feet and spun in
      ch.platformStand = true; ch.inTornado = now;
      const f = (90 + 1500 / d) * dt;
      ch.body.velocity.x += to.x * f + to.z * f * 0.6; ch.body.velocity.y += to.y * f + 150 * dt; ch.body.velocity.z += to.z * f - to.x * f * 0.6;
    } else {
      // further off it drags at you: run!
      const drag = (8 * (1 - (d - r - 17) / (75 - r - 17)) + 2) * dt;
      ch.body.position.x += to.x * drag; ch.body.position.z += to.z * drag;
    }
  }
  D.shake(0.5 * near(D, P, 90));
  if (S.drone) S.drone.setVolume(0.15 + 0.6 * near(D, P, 220));
}

// --- sounds -----------------------------------------------------------------------------------------------------------------
const loud = (D, pos, v = 1, r = 300) => v * (pos ? clamp(1 - D.world.camera.position.distanceTo(pos) / r, 0.1, 1) : 1);
const SFX = {
  whistle(D, pos, v = 1) {
    sounds.custom((c, out, t, K) => { const o = c.createOscillator(); o.frequency.setValueAtTime(1800, t); o.frequency.exponentialRampToValueAtTime(500, t + 1.6); const g = c.createGain(); K.env(g, t, 0.1, 0.3, 1.6); K.chain(o, g, out); o.start(t); o.stop(t + 1.8); }, null, loud(D, pos, 0.35 * v));
  },
  splat(D, pos, v = 1) {
    sounds.custom((c, out, t, K) => {
      const n = K.noise(c, 'brown'); const f = K.filt(c, 'lowpass', 900); f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(150, t + 0.4);
      const g = c.createGain(); K.env(g, t, 0.005, 2, 0.45); K.chain(n, f, g, out); n.start(t); n.stop(t + 0.5);
      const o = c.createOscillator(); o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.3); const og = c.createGain(); K.env(og, t, 0.005, 1.2, 0.3); K.chain(o, og, out); o.start(t); o.stop(t + 0.35);
    }, null, loud(D, pos, 0.55 * v));
  },
  fart(D, pos, v = 1) {
    sounds.custom((c, out, t, K) => {
      const len = rnd(0.4, 0.9);
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(rnd(70, 110), t); o.frequency.linearRampToValueAtTime(rnd(45, 70), t + len);
      const am = c.createGain(); am.gain.value = 0.6; const l = c.createOscillator(); l.type = 'square'; l.frequency.value = rnd(18, 30); const ld = c.createGain(); ld.gain.value = 0.4; l.connect(ld); ld.connect(am.gain);
      const g = c.createGain(); K.env(g, t, 0.03, 1, len);
      K.chain(o, K.filt(c, 'lowpass', 500), am, g, out); o.start(t); l.start(t); o.stop(t + len + 0.1); l.stop(t + len + 0.1);
    }, null, loud(D, pos, 0.4 * v));
  },
  flap(D, pos) {
    sounds.custom((c, out, t, K) => { for (let i = 0; i < 4; i++) { const tt = t + i * 0.09; const n = K.noise(c, 'pink'); const g = c.createGain(); K.env(g, tt, 0.01, 0.6, 0.06); K.chain(n, K.filt(c, 'bandpass', 700, 1), g, out); n.start(tt); n.stop(tt + 0.08); } }, null, loud(D, pos, 0.4));
  },
  honk(D, pos) {
    sounds.custom((c, out, t, K) => { for (const [f, d] of [[300, 0], [300, 0.22]]) { for (const det of [0, 7]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(f + det, t + d); o.frequency.linearRampToValueAtTime(f * 0.85 + det, t + d + 0.18); const g = c.createGain(); K.env(g, t + d, 0.01, 0.3, 0.18); K.chain(o, K.filt(c, 'lowpass', 1400), g, out); o.start(t + d); o.stop(t + d + 0.22); } } }, null, loud(D, pos, 0.5));
  },
  /** A creepy laugh: "ha ha ha ha", falling in pitch. */
  laugh(D, pos) {
    sounds.custom((c, out, t, K) => {
      const n = 4 + Math.floor(Math.random() * 3), f0 = rnd(150, 230);
      for (let i = 0; i < n; i++) {
        const tt = t + i * 0.17, f = f0 * (1 - i * 0.05);
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 1.15, tt); o.frequency.exponentialRampToValueAtTime(f, tt + 0.12);
        const g = c.createGain(); K.env(g, tt, 0.01, 0.7, 0.13);
        const sum = c.createGain(); sum.gain.value = 1;
        for (const [ff, q, a] of [[800, 6, 1], [1250, 7, 0.6], [2600, 8, 0.25]]) { const bp = K.filt(c, 'bandpass', ff, q); const ag = c.createGain(); ag.gain.value = a; o.connect(bp); bp.connect(ag); ag.connect(sum); }
        const h = K.noise(c); const hg = c.createGain(); K.env(hg, tt, 0.005, 0.15, 0.05); K.chain(h, K.filt(c, 'highpass', 1500), hg, out); h.start(tt); h.stop(tt + 0.06);
        K.chain(sum, g, out); o.start(tt); o.stop(tt + 0.16);
      }
    }, null, loud(D, pos, 0.45, 120));
  },
  stab(D, pos) {
    sounds.custom((c, out, t, K) => { const n = K.noise(c); const f = K.filt(c, 'bandpass', 3000, 2); f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(1500, t + 0.1); const g = c.createGain(); K.env(g, t, 0.003, 0.8, 0.1); K.chain(n, f, g, out); n.start(t); n.stop(t + 0.12); const o = c.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.12); const og = c.createGain(); K.env(og, t, 0.003, 0.8, 0.12); K.chain(o, og, out); o.start(t); o.stop(t + 0.15); }, null, loud(D, pos, 0.5, 150));
  },
  /** A wobbly circus tune on a detuned organ: the clowns are coming. */
  circus(secs = 24) {
    sounds.custom((c, out, t, K) => {
      const notes = [67, 66, 67, 63, 64, 60, 62, 59, 60, 55, 57, 55, 67, 66, 67, 63, 64, 67, 72, 71, 69, 67, 66, 67];
      const beat = 0.22, g = c.createGain(); g.gain.value = 0.18; g.connect(out);
      const wob = c.createOscillator(); wob.frequency.value = 5.5; const wd = c.createGain(); wd.gain.value = 9; wob.connect(wd); wob.start(t); wob.stop(t + secs);
      for (let k = 0, tt = t; tt < t + secs - 0.3; k++, tt += beat) {
        const n = notes[k % notes.length], f = 440 * Math.pow(2, (n - 69) / 12) * (1 - Math.min(0.08, (tt - t) / secs * 0.08)); // it goes flat as it plays
        for (const det of [0, 6]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f + det; wd.connect(o.detune); const e = c.createGain(); K.env(e, tt, 0.01, 0.5, beat * 0.9); K.chain(o, K.filt(c, 'lowpass', 1800), e, g); o.start(tt); o.stop(tt + beat); }
        if (k % 3 === 0) { const b = c.createOscillator(); b.type = 'triangle'; b.frequency.value = f / 4; const e = c.createGain(); K.env(e, tt, 0.01, 0.8, beat * 1.5); K.chain(b, e, g); b.start(tt); b.stop(tt + beat * 1.6); }
      }
    }, null, 0.6);
  },
  summon(D) {
    sounds.custom((c, out, t, K) => {
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 2.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5); g.connect(out);
      for (const d of [0, 3, 7]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(30 + d, t); o.frequency.exponentialRampToValueAtTime(110 + d * 2, t + 2.4); o.frequency.exponentialRampToValueAtTime(25, t + 3.4); K.chain(o, K.filt(c, 'lowpass', 600), g); o.start(t); o.stop(t + 3.5); }
      const n = K.noise(c, 'pink'); const f = K.filt(c, 'bandpass', 400, 1); f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(3000, t + 2.4); const ng = c.createGain(); ng.gain.value = 0.6; K.chain(n, f, ng, g); n.start(t); n.stop(t + 3.5);
    }, null, 0.8);
  },
  boom(D, pos) { explosion(null, 1.4); void pos; },
  /** The black hole's endless roar (a loop whose volume follows how close it is). */
  drone() {
    return sounds.customLoop((c, out, t, K) => {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 34;
      const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 34.7;
      const am = c.createGain(); am.gain.value = 0.7; const l = c.createOscillator(); l.frequency.value = 1.6; const ld = c.createGain(); ld.gain.value = 0.3; l.connect(ld); ld.connect(am.gain);
      K.chain(o, K.filt(c, 'lowpass', 180), am, out); o2.connect(am);
      const n = K.noise(c, 'brown', true); const ng = c.createGain(); ng.gain.value = 0.9; K.chain(n, K.filt(c, 'lowpass', 300), ng, out);
      const w = K.noise(c, 'pink', true); const f = K.filt(c, 'bandpass', 900, 1.2); const wl = c.createOscillator(); wl.frequency.value = 0.4; const wd = c.createGain(); wd.gain.value = 500; wl.connect(wd); wd.connect(f.frequency); const wg = c.createGain(); wg.gain.value = 0.25; K.chain(w, f, wg, out);
      for (const x of [o, o2, l, n, w, wl]) x.start(t);
      return { stop: (s) => { for (const x of [o, o2, l, n, w, wl]) x.stop(s); } };
    }, 0.2);
  },
};

// --- the HUD: which stage it is ----------------------------------------------------------------------------------------------
const CSS = `
.chaos-ph{position:absolute;left:50%;top:94px;transform:translateX(-50%);display:flex;gap:6px;font:bold 12px Arial,sans-serif;}
.chaos-ph span{padding:4px 10px;border-radius:12px;background:rgba(20,20,24,.6);border:1px solid rgba(255,255,255,.25);color:#999;text-shadow:0 1px 1px #000;white-space:nowrap}
.chaos-ph span.on{color:#fff;background:rgba(200,60,20,.8);border-color:#ffdd44}
.chaos-ph span.done{text-decoration:line-through}
.chaos-big{position:absolute;left:0;right:0;top:26%;text-align:center;opacity:0;transition:opacity .4s;pointer-events:none}
.chaos-big .i{font-size:64px;line-height:1}
.chaos-big .n{font:bold 52px 'Arial Black',Arial;color:#ffdd44;-webkit-text-stroke:2px #000;text-shadow:0 4px 0 #000}
.chaos-big .s{font:bold 15px Arial;letter-spacing:4px;color:#fff;text-shadow:0 2px 2px #000}
.chaos-big .tip{font:bold 20px Arial;color:#fff;text-shadow:0 2px 3px #000;margin-top:4px}
`;
class Hud {
  constructor(root) {
    if (!document.getElementById('chaos-css')) { const st = document.createElement('style'); st.id = 'chaos-css'; st.textContent = CSS; document.head.appendChild(st); }
    this.el = document.createElement('div');
    this.el.innerHTML = `<div class="chaos-ph">${PHASES.map((p) => `<span>${p.icon} ${p.name}</span>`).join('<span style="border:0;background:none;padding:4px 0">&#9654;</span>')}</div><div class="chaos-big"><div class="s"></div><div class="i"></div><div class="n"></div><div class="tip"></div></div>`;
    root.appendChild(this.el);
    this.chips = [...this.el.querySelectorAll('.chaos-ph span')].filter((s, i) => i % 2 === 0);
    this.big = this.el.querySelector('.chaos-big');
  }
  phase(i) {
    this.chips.forEach((c, k) => { c.className = k === i ? 'on' : k < i ? 'done' : ''; });
    const p = PHASES[i];
    this.big.querySelector('.s').textContent = `STAGE ${i + 1} OF 3`;
    this.big.querySelector('.i').textContent = p.icon; this.big.querySelector('.n').textContent = p.name; this.big.querySelector('.tip').textContent = p.tip;
    this.big.style.opacity = 1;
    clearTimeout(this._t); this._t = setTimeout(() => { this.big.style.opacity = 0; }, 3200);
  }
  remove() { clearTimeout(this._t); this.el.remove(); }
}

// --- the disaster ---------------------------------------------------------------------------------------------------------
export const chaos = {
  id: 'chaos', name: 'Total Chaos', icon: '💩', color: '#d08a3a', duration: 80, bots: 'inside',
  tip: 'Poop storm, then killer clowns, then a black hole!',
  start(D, S) {
    S.R = resources(); S.fx = []; S.layer = new THREE.Group(); D.world.scene.add(S.layer); S.D = D;
    S.pm = poopMats();
    const phong = (color, o = {}) => new THREE.MeshPhongMaterial({ color, shininess: 30, ...o });
    S.cm = {
      face: new THREE.MeshPhongMaterial({ map: textures().clown, transparent: true, depthWrite: false, shininess: 10 }),
      nose: phong(0xe01010, { shininess: 90 }), white: phong(0xf8f8f8), black: phong(0x111111),
      hairO: phong(0xff8a10), hairG: phong(0x30c040), hairR: phong(0xe02020), hairB: phong(0x2a6ae8),
      steel: phong(0xd8dde4, { shininess: 120, specular: 0xffffff }),
      ruff: new THREE.TorusGeometry(0.72, 0.22, 8, 18), cone: new THREE.ConeGeometry(1, 1, 12), box: new THREE.BoxGeometry(1, 1, 1),
      blade: new THREE.ConeGeometry(1, 1, 4),
      confetti: [0xff3030, 0xffd020, 0x30a0ff, 0x40e060].map((color) => new THREE.SpriteMaterial({ map: textures().square, color, transparent: true, depthWrite: false })),
    };
    S.poops = []; S.piles = []; S.stink = []; S.marks = []; S.clowns = []; S.allClowns = []; S.threats = []; S.hole = null; S.pos = null;
    S.phase = -1; S.next = 1.2; S.clownT = 0;
    S.hud = new Hud(D.guiRoot);
    D.sky.set({ dome: 0.45, fog: 0x8a7a5a, near: 150, far: 1000, amb: 0.8, sun: 0.65, tint: 0xc8b088 });
  },
  update(D, S, dt, t) {
    // the stages
    const ph = PHASES.reduce((k, p, i) => (t >= p.at ? i : k), 0);
    if (ph !== S.phase) {
      S.phase = ph;
      S.hud.phase(ph);
      D.replan?.(PHASES[ph].bots);
      if (PHASES[ph].id === 'clowns') {
        SFX.circus(24);
        D.sky.set({ dome: 0.7, fog: 0x3a2a3a, near: 100, far: 800, amb: 0.6, sun: 0.4, tint: 0xb090b0 });
        chat(D, ['CLOWNS', 'RUN THE CLOWNS', 'i hate clowns', 'hes got a knife!!', 'nope nope nope'], 3);
        S.clownT = 0; // the first wave straight away
      }
      if (PHASES[ph].id === 'hole') summonHole(D, S);
      if (PHASES[ph].id === 'poop') chat(D, ['is that... poop', 'ITS RAINING POOP', 'ew ew ew', 'gross!!!', 'take cover lol'], 3);
    }
    const stage = PHASES[ph].id;
    // poop: faster and faster
    if (stage === 'poop') {
      S.next -= dt;
      if (S.next <= 0) { S.next = Math.max(0.6, 1.4 - t * 0.035) * rnd(0.6, 1.3); spawnPoop(D, S); }
    }
    updatePoops(D, S, dt);
    updateStink(D, S, dt);
    // clowns: a wave to start, then more and more
    if (stage === 'clowns') {
      S.clownT -= dt;
      if (S.clownT <= 0 && S.clowns.length < 12) {
        const first = S.clowns.length === 0;
        S.clownT = first ? 3 : rnd(2.2, 3.4);
        for (let i = 0; i < (first ? 5 : 1); i++) {
          const folks = people(D);
          const home = folks.length ? pick(folks).rootPosition : V(0, 0, 0);
          const a = Math.random() * Math.PI * 2, d = rnd(30, 50);
          const x = clamp(home.x + Math.cos(a) * d, -105, 105), z = clamp(home.z + Math.sin(a) * d, -105, 105);
          makeClown(D, S, V(x, groundAt(D, x, z), z));
        }
      }
    }
    updateClowns(D, S, dt);
    // the black hole
    if (S.hole && S.hole.state === 'roam' && t > this.duration - 4) S.hole.state = 'collapse';
    updateHole(D, S, dt);
    S.pos = S.hole ? S.hole.pos.clone().setY(0) : null;
    for (let i = S.fx.length - 1; i >= 0; i--) if (!S.fx[i].update(dt)) S.fx.splice(i, 1);
  },
  stop(D, S) {
    S.stopped = true;
    for (const ch of S.allClowns) ch.destroy(); // (dead ones too: their pieces)
    S.clowns = []; S.threats = [];
    S.hole?.model.dispose(); S.hole = null;
    S.drone?.stop(); S.drone = null;
    for (const e of S.fx) e.update(1e3);
    S.fx = [];
    D.world.scene.remove(S.layer);
    for (const m of S.marks) setTimeout(() => D.world.scene.remove(m), 3000);
    for (const g of ['plane', 'sphere', 'ring', 'torus', 'tube', 'seg']) S.R[g].dispose();
    for (const m of Object.values(S.R.mats)) m.dispose();
    for (const m of Object.values(S.pm)) m.dispose?.();
    for (const m of Object.values(S.cm)) if (Array.isArray(m)) m.forEach((x) => x.dispose()); else m.dispose?.();
    S.hud.remove();
  },
};
