// Gojo vs Sukuna: the strongest sorcerer of today against the King of Curses,
// fighting all over the island at blinding speed with everything they have:
// Blue, Red, Hollow Purple, Infinity and Unlimited Void against Cleave,
// Dismantle, Fuga and Malevolent Shrine. Everyone else just has to live
// through being near it. (A fan-made disaster: the two fighters are built
// from classic R6 parts, and every effect and sound is generated here.)
import * as THREE from 'three';
import { G } from './maps.js';
import { CharacterModel } from '../../engine/CharacterModel.js';
import { sounds } from '../../engine/Sound.js';
import { tex, groundMark } from './effects.js';
import { explosion } from './audio.js';
import { speak } from '../heist/audio.js';
import { baseTex, resources, groundAt, near, knock, blastPeople, wreck, chat, light, timed, basis, slash, streak, popAt, ring, bolt, orb } from './vfx.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SCALE = 1.7; // the two of them stand a head taller than everyone else
const LIM = 102; // and stay over the island
const H = 3 * SCALE; // from their feet to the middle of the torso

// --- textures -------------------------------------------------------------------------------------------------------
let TX = null;
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function textures() {
  if (TX) return TX;
  TX = {};
  // the inside of Unlimited Void: endless space, stars and streams of light
  TX.stars = canvasTex(1024, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#04020a'); g.addColorStop(0.5, '#140830'); g.addColorStop(1, '#04020a');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) {
      const cx = Math.random() * w, cy = h * (0.25 + Math.random() * 0.5), r = rnd(40, 160);
      const n = x.createRadialGradient(cx, cy, 0, cx, cy, r); const c = pick(['120,80,255', '60,120,255', '200,90,255', '255,255,255']);
      n.addColorStop(0, `rgba(${c},0.16)`); n.addColorStop(1, `rgba(${c},0)`); x.fillStyle = n; x.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    for (let i = 0; i < 90; i++) { const y = Math.random() * h, x0 = Math.random() * w; x.strokeStyle = `rgba(${pick(['180,210,255', '230,200,255', '255,255,255'])},${rnd(0.08, 0.35)})`; x.lineWidth = rnd(0.5, 2); x.beginPath(); x.moveTo(x0, y); x.lineTo(x0 + rnd(60, 300), y + rnd(-6, 6)); x.stroke(); }
    for (let i = 0; i < 1600; i++) { const s = Math.random(); x.fillStyle = `rgba(255,255,255,${0.25 + s * 0.75})`; const z = s > 0.985 ? 3 : s > 0.9 ? 2 : 1; x.fillRect(Math.random() * w, Math.random() * h, z, z); }
  });
  TX.stars.wrapS = THREE.RepeatWrapping;
  // a cut in the ground
  TX.scratch = canvasTex(256, 32, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(10,0,0,0.95)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'destination-in';
    const m = x.createLinearGradient(0, 0, w, 0); m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(0.15, 'rgba(0,0,0,1)'); m.addColorStop(0.85, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = m; x.fillRect(0, 0, w, h);
  });
  // faces (the same layout as the classic face: eyes at 40% of the way down)
  TX.gojoFace = canvasTex(256, 256, (x, S) => {
    x.strokeStyle = '#000'; x.lineWidth = S * 0.026; x.lineCap = 'round';
    x.beginPath(); x.moveTo(S * 0.41, S * 0.665); x.quadraticCurveTo(S * 0.53, S * 0.705, S * 0.63, S * 0.63); x.stroke(); // a smirk
  });
  TX.sukunaFace = canvasTex(256, 256, (x, S) => {
    const eye = (cx, cy, rx, ry, flip) => {
      x.fillStyle = '#fff'; x.beginPath(); x.moveTo(cx - rx, cy); x.quadraticCurveTo(cx, cy - ry * 2.1, cx + rx, cy + (flip ? -ry * 0.4 : ry * 0.4) * 0); x.quadraticCurveTo(cx, cy + ry * 1.3, cx - rx, cy); x.fill();
      x.fillStyle = '#c4161c'; x.beginPath(); x.arc(cx, cy - ry * 0.2, ry * 0.95, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#000'; x.fillRect(cx - ry * 0.12, cy - ry * 1.05, ry * 0.24, ry * 1.7);
    };
    eye(S * 0.405, S * 0.4, S * 0.06, S * 0.032); eye(S * 0.595, S * 0.4, S * 0.06, S * 0.032, true);
    eye(S * 0.36, S * 0.485, S * 0.038, S * 0.02); eye(S * 0.64, S * 0.485, S * 0.038, S * 0.02, true); // the second pair
    x.strokeStyle = '#000'; x.lineCap = 'round';
    x.lineWidth = S * 0.022; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(S * (0.5 + s * 0.04), S * 0.335); x.lineTo(S * (0.5 + s * 0.15), S * 0.3); x.stroke(); } // angry brows
    x.lineWidth = S * 0.02; for (const s of [-1, 1]) for (const y of [0.55, 0.585]) { x.beginPath(); x.moveTo(S * (0.5 + s * 0.2), S * y); x.lineTo(S * (0.5 + s * 0.29), S * (y - 0.012)); x.stroke(); } // the markings
    x.beginPath(); x.moveTo(S * 0.47, S * 0.26); x.lineTo(S * 0.5, S * 0.29); x.lineTo(S * 0.53, S * 0.26); x.stroke();
    // a wide grin full of teeth
    x.fillStyle = '#000'; x.beginPath(); x.arc(S * 0.5, S * 0.55, S * 0.2, Math.PI * 0.18, Math.PI * 0.82, false); x.arc(S * 0.5, S * 0.52, S * 0.2, Math.PI * 0.8, Math.PI * 0.2, true); x.closePath(); x.fill();
    x.fillStyle = '#fff'; for (let i = 0; i < 8; i++) { const a = Math.PI * (0.26 + i * 0.066); x.beginPath(); x.moveTo(S * 0.5 + Math.cos(a) * S * 0.195, S * 0.53 + Math.sin(a) * S * 0.19); x.lineTo(S * 0.5 + Math.cos(a + 0.03) * S * 0.16, S * 0.53 + Math.sin(a + 0.03) * S * 0.155); x.lineTo(S * 0.5 + Math.cos(a + 0.066) * S * 0.195, S * 0.53 + Math.sin(a + 0.066) * S * 0.19); x.fill(); }
  });
  return TX;
}

// --- shared meshes and materials for the effects (made at the start of a fight, freed at the end) ----------------------

// --- the two of them ---------------------------------------------------------------------------------------------------
const POSES = { // [right shoulder, left shoulder, right hip, left hip, right arm out, left arm out, lean]
  idle: [0.15, 0.15, 0, 0, 0.12, -0.12, 0],
  fight: [0.6, 1.0, 0.25, -0.2, 0.2, -0.2, -0.12],
  fly: [-0.7, -0.7, -0.35, -0.25, 0.18, -0.18, -1.0],
  punchR: [1.7, -0.4, 0.2, -0.3, 0, 0, -0.3],
  punchL: [-0.4, 1.7, -0.3, 0.2, 0, 0, -0.3],
  kick: [-0.3, 0.6, 1.7, -0.25, 0.3, -0.3, 0.25],
  cast: [1.6, 0.1, 0, 0, 0, 0, -0.05],
  both: [1.5, 1.5, 0, 0, -0.25, 0.25, -0.1],
  sign: [1.3, 1.3, 0, 0, -0.6, 0.6, 0],
  spread: [0.1, 0.1, 0.1, 0.1, 1.5, -1.5, 0.05],
  bow: [0.5, 1.6, 0.15, -0.1, -0.3, -0.05, 0],
  fall: [2.6, 2.4, 0.5, 0.3, 0.6, -0.6, 0],
};

function buildModel(who) {
  const T = textures(), gojo = who === 'gojo';
  const colors = gojo ? { head: 125, torso: 26, leftArm: 26, rightArm: 26, leftLeg: 26, rightLeg: 26 } : { head: 125, torso: 1, leftArm: 1, rightArm: 1, leftLeg: 26, rightLeg: 26 };
  const m = new CharacterModel({ colors, face: 'Smile', hats: [], shirt: null, pants: null, tshirt: null });
  const phong = (color, o = {}) => new THREE.MeshPhongMaterial({ color, shininess: 18, specular: 0x222222, ...o });
  const face = m.head.children[0];
  face.material = new THREE.MeshPhongMaterial({ map: gojo ? T.gojoFace : T.sukunaFace, transparent: true, depthWrite: false, shininess: 10 });
  const hairMat = phong(gojo ? 0xf4f6fa : 0xf2a2b6, { shininess: 30 });
  // spiky hair: a cap and a crown of spikes (Gojo's sweep up and back, Sukuna's stand up)
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.7, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
  cap.position.y = 0.16; cap.scale.set(1, 0.85, 1); m.head.add(cap);
  const cone = new THREE.ConeGeometry(0.22, 0.8, 5);
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
    const s = new THREE.Mesh(cone, hairMat);
    const back = dz > 0 ? 0.35 : 0;
    s.position.set(dx * 0.42, 0.58 + Math.random() * 0.1, dz * 0.42);
    const k = gojo ? 0.75 + back : 0.45;
    s.rotation.set(dz * k, 0, -dx * k);
    s.scale.setScalar(gojo ? 1 : 1.15);
    m.head.add(s);
  }
  for (const [x, k] of [[-0.25, 1], [0.05, 1.15], [0.3, 0.9]]) { const s = new THREE.Mesh(cone, hairMat); s.position.set(x, 0.45, -0.5); s.rotation.set(gojo ? -2.3 : -1.6, 0, x * 0.8); s.scale.set(1, k, 1); m.head.add(s); } // the fringe
  const skin = phong(0xeab892);
  const hand = new THREE.BoxGeometry(1.02, 0.42, 1.02);
  for (const arm of [m.rightArm, m.leftArm]) {
    const h = new THREE.Mesh(hand, skin); h.position.y = -0.8; arm.add(h);
    if (!gojo) for (const y of [-0.72, -0.9]) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.06, 1.04), phong(0x111111)); b.position.y = y; arm.add(b); } // the tattoos
  }
  if (gojo) {
    // the blindfold, and the high collar of the uniform with its spiral button
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.67, 0.67, 0.36, 28, 1, true), phong(0x0c0c10, { side: THREE.DoubleSide }));
    band.position.y = 0.1; m.head.add(band);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.5, 20, 1, true), phong(0x161c2a, { side: THREE.DoubleSide }));
    collar.position.y = 1.18; m.root.add(collar);
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 12), phong(0xd8b040, { shininess: 80 }));
    button.rotation.x = Math.PI / 2; button.position.set(0, 1.05, -0.72); m.root.add(button);
  } else {
    // the dark scarf and sash over the white kimono
    const scarf = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.78, 0.55, 20), phong(0x2a1a1a));
    scarf.position.y = 1.12; m.root.add(scarf);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.3, 0.14), phong(0x2a1a1a)); tail.position.set(0.35, 0.45, 0.58); tail.rotation.z = 0.15; m.root.add(tail);
    const sash = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.34, 1.06), phong(0x141414)); sash.position.y = -0.72; m.root.add(sash);
    const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.04), phong(0x1a1a1a)); lapel.position.set(0, 0.15, -0.51); lapel.rotation.z = 0.35; m.root.add(lapel);
  }
  m.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return m;
}

function nameTag(text, color) {
  const t = canvasTex(512, 72, (x, w, h) => { x.font = 'bold 44px Arial Black, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 8; x.strokeStyle = '#000'; x.strokeText(text, w / 2, h / 2); x.fillStyle = color; x.fillText(text, w / 2, h / 2); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(15, 2.1, 1);
  return s;
}

class Fighter {
  constructor(D, S, who) {
    this.D = D; this.S = S; this.who = who; this.gojo = who === 'gojo';
    this.name = this.gojo ? 'Satoru Gojo' : 'Ryomen Sukuna';
    this.hp = 100;
    this.root = new THREE.Group(); this.tilt = new THREE.Group(); this.root.add(this.tilt);
    this.model = buildModel(who); this.model.root.scale.setScalar(SCALE); this.tilt.add(this.model.root);
    this.aura = new THREE.Sprite(S.R.mats[this.gojo ? 'auraB' : 'auraR']); this.aura.scale.setScalar(16); this.root.add(this.aura);
    this.tag = nameTag(this.gojo ? 'SATORU GOJO' : 'RYOMEN SUKUNA', this.gojo ? '#9ad8ff' : '#ff6a5a'); this.tag.position.y = 8; this.root.add(this.tag);
    if (this.gojo) { // Infinity: it shows only when something reaches it
      this.infMat = new THREE.MeshBasicMaterial({ color: 0xa8dcff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      this.inf = new THREE.Mesh(S.R.sphere, this.infMat); this.inf.scale.setScalar(5.6); this.root.add(this.inf);
    }
    D.world.scene.add(this.root);
    this.pos = V(); this.goal = null; this.speed = 0; this.vel = V(); this.trail = V();
    this.yaw = 0; this.pose = null; this.poseT = 0; this.strikePose = 'punchR';
    this.ang = [0, 0, 0, 0, 0, 0, 0]; this.infT = 0; this.ph = Math.random() * 6;
    this.hitT = new Map(); this.flung = false; this.frozen = false; this.gone = false;
  }

  /** Where a hand is in the world. */
  hand(right = true) { this.root.updateMatrixWorld(true); return (right ? this.model.rightArm : this.model.leftArm).localToWorld(V(0, -1.1, 0)); }
  front(d = 3) { return this.pos.clone().add(V(-Math.sin(this.yaw) * d, 0.6, -Math.cos(this.yaw) * d)); }
  /** Keep a spot over the island and above whatever is under it. */
  place(p, low = false) {
    const q = p.clone(); q.x = clamp(q.x, -LIM, LIM); q.z = clamp(q.z, -LIM, LIM);
    q.y = Math.max(q.y, (low ? Math.max(G, this.D.water.level) : groundAt(this.D, q.x, q.z)) + H);
    return q;
  }
  /** Fly to p (low: right down to the street, through any building in the way). */
  moveTo(p, speed, smash = true, low = false) { this.goal = this.place(p, low); this.speed = speed; this.smash = smash; return this.pos.distanceTo(this.goal) / speed; }
  /** Gojo's teleport: gone from here, there in the same instant. */
  blink(p) {
    const q = this.place(p);
    popAt(this.S, this.pos, 'flashB', 7); popAt(this.S, q, 'flashB', 9);
    ring(this.S, q, UP, 0x9ad8ff, 9, 0.35);
    this.pos.copy(q); this.goal = null; this.trail.copy(q); this.flung = false;
    SFX.zip(this.D, q);
  }
  /** Sent flying (straight through whatever is in the way). */
  fling(dir, dist) {
    const t = this.moveTo(this.pos.clone().addScaledVector(dir, dist), 140, true);
    this.flung = true;
    return t;
  }
  strike(big = false) { this.strikePose = pick(['punchR', 'punchL', 'punchR', 'kick']); this.poseT = big ? 0.3 : 0.13; }
  face(p) { this.lookAt = p ? p.clone() : null; }

  update(dt) {
    const D = this.D, now = D.world.time;
    if (this.gone) return;
    if (this.frozen) this.goal = null;
    if (this.goal) {
      const to = this.goal.clone().sub(this.pos), d = to.length(), step = this.speed * dt;
      const dir = d > 1e-6 ? to.multiplyScalar(1 / d) : V();
      if (d <= step) { this.pos.copy(this.goal); this.goal = null; if (this.flung) this.land(dir); }
      else this.pos.addScaledVector(dir, step);
      this.vel.copy(dir).multiplyScalar(this.speed);
      if (this.speed > 50 && this.smash) this.plow(dir, now);
    } else this.vel.set(0, 0, 0);
    // a streak of light behind them when they move fast
    const fast = this.vel.lengthSq() > 2500;
    if (fast && this.pos.distanceTo(this.trail) > 2.5) { streak(this.S, this.trail, this.pos, this.gojo ? 'streakB' : 'streakR', 1.6); this.trail.copy(this.pos); }
    else if (!fast) this.trail.copy(this.pos);
    // facing: the foe, or wherever they're flying
    const look = this.lookAt || this.foe.pos;
    const fd = (fast && !this.flung ? this.vel.clone() : look.clone().sub(this.pos)).setY(0);
    if (fd.lengthSq() > 0.01) this.yaw = lerpAngle(this.yaw, Math.atan2(-fd.x, -fd.z), Math.min(1, dt * 16));
    this.root.rotation.y = this.yaw;
    // the pose
    this.poseT -= dt;
    const name = this.flung ? 'fall' : this.poseT > 0 ? this.strikePose : this.pose || (fast ? 'fly' : this.foe.pos.distanceTo(this.pos) < 30 ? 'fight' : 'idle');
    const P = POSES[name], k = Math.min(1, dt * (this.poseT > 0 ? 30 : 12));
    for (let i = 0; i < 7; i++) this.ang[i] += (P[i] - this.ang[i]) * k;
    const m = this.model, a = this.ang;
    m.setAngles(a[0], a[1], a[2], a[3]);
    m.rightShoulder.rotation.z = a[4]; m.leftShoulder.rotation.z = a[5];
    if (this.flung) this.tilt.rotation.x += dt * 13; else this.tilt.rotation.x += (a[6] - wrap(this.tilt.rotation.x)) * Math.min(1, dt * 10);
    // hovering
    const bob = this.goal ? 0 : Math.sin(now * 2.4 + this.ph) * 0.35;
    this.root.position.copy(this.pos); this.root.position.y += bob;
    this.aura.material.opacity = (this.gojo ? 0.22 : 0.26) + Math.sin(now * 9 + this.ph) * 0.06;
    if (this.inf) { this.infT = Math.max(0, this.infT - dt * 2.5); this.infMat.opacity = this.infT * 0.32; this.inf.visible = this.infT > 0.01; this.inf.scale.setScalar(5.6 + Math.sin(now * 30) * 0.08); }
    this.hp = Math.min(100, this.hp + dt * 0.8); // reverse cursed technique
  }

  /** Flying through things: buildings break, people get hit. */
  plow(dir, now) {
    const D = this.D;
    for (const p of D.st.near(this.pos, 2.4 * SCALE)) D.collapse(p, dir.clone().multiplyScalar(rnd(35, 60)).add(V(rnd(-8, 8), rnd(4, 14), rnd(-8, 8))), 2);
    for (const ch of D.chars()) {
      if (ch.rootPosition.distanceTo(this.pos) > 3.4 * SCALE) continue;
      if ((this.hitT.get(ch) || 0) > now - 0.6) continue;
      this.hitT.set(ch, now);
      D.hurt(ch, 45, 'clash');
      if (ch.alive) knock(D, ch, this.pos, 70, 35);
    }
  }
  land(dir) {
    this.flung = false; this.tilt.rotation.x = 0;
    const D = this.D, g = groundAt(D, this.pos.x, this.pos.z);
    if (this.pos.y - H > g + 1.5) return; // stopped in mid-air
    const at = V(this.pos.x, g + 0.2, this.pos.z);
    ring(this.S, at, UP, 0xd8c8a8, 16, 0.6);
    D.fx.burst(D.fx.mats.dust, at.clone().add(V(0, 1, 0)), 22, { speed: [6, 20], size: [2.5, 5], life: [0.8, 1.8], gravity: 0.15, grow: 2 });
    D.mark(at, 'scorch', 12);
    wreck(D, at, 9, 40);
    blastPeople(D, at, 14, 30, 'clash', 40);
    D.shake(0.5 * near(D, at)); SFX.thud(D, at, 1.4);
    void dir;
  }
  dispose() { this.D.world.scene.remove(this.root); this.model.dispose(); this.tag.material.map.dispose(); this.tag.material.dispose(); this.infMat?.dispose(); }
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAngle = (a, b, k) => a + wrap(b - a) * k;

// --- helpers ------------------------------------------------------------------------------------------------------------
/** A spot for the fight: anywhere on the island, quite often right where people are. */
function spot(D, nearPeople = 0.4, up = [4, 24]) {
  const people = D.chars();
  let x, z;
  if (people.length && Math.random() < nearPeople) { const p = pick(people).rootPosition; x = p.x + rnd(-10, 10); z = p.z + rnd(-10, 10); }
  else { x = rnd(-90, 90); z = rnd(-90, 90); }
  x = clamp(x, -LIM, LIM); z = clamp(z, -LIM, LIM);
  return V(x, groundAt(D, x, z) + H + rnd(up[0], up[1]), z);
}
/**
 * Cut along a plane through P (normal n): everything within `thick` of it,
 * within halfLen along `along` and halfH along the plane's other axis, comes
 * apart (the two sides slide away from each other). People in it take dmg
 * (Infinity: killed).
 */
function cutPlane(D, P, n, along, halfLen, halfH, thick, dmg, cause) {
  const other = n.clone().cross(along).normalize();
  for (const p of D.st.near(P, Math.hypot(halfLen, halfH) + 4)) {
    const o = p.mesh.position.clone().sub(P);
    const s = Math.max(p.size.x, p.size.y, p.size.z) * 0.5;
    const dn = o.dot(n);
    if (Math.abs(dn) > thick + s * 0.6 || Math.abs(o.dot(along)) > halfLen + s || Math.abs(o.dot(other)) > halfH + s) continue;
    D.collapse(p, n.clone().multiplyScalar((Math.sign(dn) || 1) * rnd(5, 13)).add(V(0, rnd(1, 6), 0)), 2);
  }
  for (const ch of D.chars()) {
    const o = ch.rootPosition.clone().sub(P);
    if (Math.abs(o.dot(n)) < thick + 1.4 && Math.abs(o.dot(along)) < halfLen && Math.abs(o.dot(other)) < halfH + 2) {
      if (dmg === Infinity) D.kill(ch, ch.rootPosition.clone(), cause); else D.hurt(ch, dmg, cause);
    }
  }
}
/** Erase everything in a sphere (Hollow Purple). */
function erase(D, S, c, r) {
  for (const p of D.st.near(c, r)) {
    if (Math.random() < 0.1) D.fx.burst(D.fx.mats.dust, p.mesh.position, 1, { speed: [2, 6], size: [1.5, 3], life: [0.5, 1], gravity: -0.05, grow: 1.5 });
    D.collapse(p, null, 2); D.st.remove(p);
  }
  for (const d of [...D.st.debris]) if (!d.p.destroyed && d.p.mesh.position.distanceTo(c) < r + 1) D.st.remove(d.p);
  for (const ch of D.chars()) if (ch.rootPosition.distanceTo(c) < r + 1.8) D.kill(ch, c.clone(), 'purple');
  void S;
}

// --- effects ---------------------------------------------------------------------------------------------------------------

// --- blows ---------------------------------------------------------------------------------------------------------------
/** One blow landing: a flash, a shockwave, a thump; Black Flash crackles black and red and hits much harder. */
function impact(D, S, at, power = 1, black = false, victim = null) {
  const big = black ? 1.6 : 1;
  popAt(S, at, black ? 'flashR' : 'flashW', 7 * power * big, 0.18);
  ring(S, at, V(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)), black ? 0xff2a1a : 0xffffff, 9 * power * big, 0.32);
  D.fx.burst(D.fx.mats.dust, at, Math.round(4 * power), { speed: [6, 18], size: [1, 2.4], life: [0.4, 0.9], gravity: 0.05, grow: 1.6 });
  if (black) {
    for (let i = 0; i < 6; i++) bolt(S, at, at.clone().add(V(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(7, 15))), 'black', 0.35);
    light(D, at, 0xff2010, 80, 50, 0.15);
    SFX.blackFlash(D, at);
  } else { light(D, at, 0xffffff, 30 * power, 30, 0.06); SFX.punch(D, at, power); }
  const r = 7 * power * big;
  blastPeople(D, at, r + 4, 16 * power * big, 'clash', 40 * power * big);
  wreck(D, at, r * 0.7, 30 * power * big, 0.6);
  D.shake(0.3 * power * big * near(D, at, 120));
  if (victim) victim.hp = Math.max(10, victim.hp - power * big * rnd(1, 2.4));
}

// --- the moves -------------------------------------------------------------------------------------------------------------
/** They meet in the air and trade blows faster than the eye can follow; one of them gets sent through a building. */
function* clash(D, S) {
  const g = S.gojo, k = S.sukuna;
  const M = spot(D, 0.4, [2, 20]);
  const t = Math.max(g.moveTo(M.clone().add(V(-2.5, 0, 0)), 250), k.moveTo(M.clone().add(V(2.5, 0, 0)), 230));
  yield Math.min(1.1, t);
  const u = V(1, 0, 0).applyAxisAngle(UP, Math.random() * 6.28);
  const n = 7 + Math.floor(Math.random() * 9);
  for (let i = 0; i < n; i++) {
    M.add(V(rnd(-3, 3), rnd(-1.2, 1.8), rnd(-3, 3)));
    M.x = clamp(M.x, -LIM, LIM); M.z = clamp(M.z, -LIM, LIM); M.y = Math.max(M.y, groundAt(D, M.x, M.z) + H);
    u.applyAxisAngle(UP, rnd(-0.9, 0.9));
    g.moveTo(M.clone().addScaledVector(u, -2.6), 320); k.moveTo(M.clone().addScaledVector(u, 2.6), 320);
    const byG = Math.random() < 0.5;
    (byG ? g : k).strike();
    impact(D, S, M.clone(), rnd(0.7, 1.1), Math.random() < 0.1, byG ? k : g);
    yield rnd(0.08, 0.16);
  }
  const w = Math.random() < 0.5 ? g : k, l = w.foe;
  w.strike(true);
  const dir = l.pos.clone().sub(w.pos).setY(0).normalize().add(V(0, rnd(-0.35, 0.2), 0)).normalize();
  impact(D, S, M.clone(), 1.5, Math.random() < 0.35, l);
  yield Math.min(0.9, l.fling(dir, rnd(45, 75)));
  if (Math.random() < 0.3) chat(D, ['WHAT', 'theyre so fast', 'omg', 'RUN', 'nah id win', 'i cant even see them']);
}

/** A chase across the island: Gojo blinks away, Sukuna tears through everything after him. */
function* chase(D, S) {
  const g = S.gojo, k = S.sukuna;
  for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
    g.blink(spot(D, 0.45, [3, 22]));
    yield 0.12;
    const t = k.moveTo(g.pos.clone().add(V(rnd(-3, 3), 0, rnd(-3, 3))), 260);
    yield Math.min(0.8, t);
    k.strike(); impact(D, S, g.pos.clone(), 0.9, false, g);
    yield 0.15;
  }
}

/** Dismantle: a volley of invisible slashes that cut through anything (except Infinity). */
function* dismantle(D, S) {
  const g = S.gojo, k = S.sukuna;
  const away = k.pos.clone().sub(g.pos).setY(0); if (away.lengthSq() < 1) away.set(1, 0, 0);
  yield Math.min(0.7, k.moveTo(g.pos.clone().add(away.normalize().multiplyScalar(rnd(35, 60))).setY(g.pos.y + rnd(-4, 10)), 220));
  if (Math.random() < 0.5) say(D, S, 'sukuna', 'Dismantle.');
  const n = 4 + Math.floor(Math.random() * 5);
  for (let i = 0; i < n; i++) {
    k.strike(); k.face(g.pos);
    const from = k.hand(i % 2 === 0);
    const people = D.chars().filter((ch) => ch.rootPosition.distanceTo(k.pos) < 90);
    const aim = people.length && Math.random() < 0.3 ? pick(people).rootPosition.clone() : g.pos.clone().add(V(rnd(-14, 14), rnd(-6, 6), rnd(-14, 14)));
    blade(D, S, from, aim.sub(from).normalize(), rnd(12, 18));
    yield rnd(0.1, 0.18);
  }
  k.face(null);
  yield 0.4;
  if (Math.random() < 0.6) g.blink(spot(D, 0.3, [4, 20]));
}
/** One Dismantle slash flying out (it cuts what it passes through and stops at Gojo's Infinity). */
function blade(D, S, from, dir, width = 14, speed = 240, range = 180) {
  const roll = Math.random() * Math.PI * 2;
  const side = (Math.abs(dir.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)).cross(dir).normalize().applyAxisAngle(dir, roll); // across the blade
  const nrm = dir.clone().cross(side).normalize(); // the blade's flat side
  const glow = new THREE.Mesh(S.R.plane, S.R.mats.slashR), core = new THREE.Mesh(S.R.plane, S.R.mats.slashW);
  const q = basis(side, nrm);
  for (const m of [glow, core]) { m.quaternion.copy(q); S.layer.add(m); }
  glow.scale.set(width, 2.6, 1); core.scale.set(width, 0.6, 1);
  const p = from.clone(); let went = 0;
  const hit = new Set();
  SFX.slash(D, from, 0.8);
  const e = {
    update(dt) {
      if (S.stopped) return end();
      const step = speed * dt;
      p.addScaledVector(dir, step); went += step;
      glow.position.copy(p); core.position.copy(p);
      // cut what it passes
      for (const part of D.st.near(p, width / 2 + 3)) {
        const o = part.mesh.position.clone().sub(p), s = Math.max(part.size.x, part.size.y, part.size.z) * 0.5;
        const along = o.dot(dir);
        if (along > 1 + s || along < -step - s || Math.abs(o.dot(side)) > width / 2 || Math.abs(o.dot(nrm)) > 1 + s * 0.6) continue;
        D.collapse(part, nrm.clone().multiplyScalar((Math.sign(o.dot(nrm)) || 1) * rnd(4, 10)).addScaledVector(dir, 8), 2);
      }
      for (const ch of D.chars()) {
        if (hit.has(ch)) continue;
        const o = ch.rootPosition.clone().sub(p);
        if (Math.abs(o.dot(dir)) < step + 2 && Math.abs(o.dot(side)) < width / 2 && Math.abs(o.dot(nrm)) < 2.8) { hit.add(ch); D.hurt(ch, 70, 'dismantle'); if (ch.alive) knock(D, ch, p, 25, 15); }
      }
      // Infinity
      const g = S.gojo;
      if (!g.gone && p.distanceTo(g.pos) < 4.8) {
        g.infT = 1; popAt(S, p, 'flashB', 6, 0.2); D.fx.burst(D.fx.mats.spark, p, 10, { speed: [6, 18], size: [0.2, 0.5], life: [0.2, 0.5], gravity: 0.3 });
        SFX.ting(D, p);
        return end();
      }
      if (went > range || p.y < G - 1) {
        if (p.y < G + 3) groundCut(D, S, p, side);
        return end();
      }
      return true;
    },
  };
  const end = () => { S.layer.remove(glow, core); return false; };
  S.fx.push(e);
}
function groundCut(D, S, at, dir) {
  if (S.cuts.length > 70) return;
  const m = groundMark(D.world, textures().scratch, at.x, groundAt(D, at.x, at.z), at.z, 1, { rot: 0 });
  m.scale.set(rnd(10, 18), 1, rnd(0.8, 1.4));
  m.rotation.y = Math.atan2(-dir.z, dir.x);
  S.cuts.push(m);
}

/** Cleave: Sukuna goes for Gojo next to a building and cuts the whole building in two. */
function* cleave(D, S) {
  const g = S.gojo, k = S.sukuna;
  const parts = [...D.st.parts].filter((p) => p.anchored && !p.userData.fixed && !p.destroyed && p.mesh.position.y > G + 5);
  const target = parts.length ? pick(parts).mesh.position.clone() : spot(D, 0.5);
  g.blink(target.clone().add(V(rnd(-6, 6), rnd(2, 6), rnd(-6, 6))));
  yield 0.35;
  yield Math.min(0.6, k.moveTo(g.pos.clone().add(V(rnd(-5, 5), rnd(-1, 3), rnd(-5, 5))), 280));
  k.strike(true);
  if (Math.random() < 0.6) say(D, S, 'sukuna', 'Cleave.');
  const a = Math.random() * Math.PI * 2;
  const n = V(Math.cos(a), rnd(-0.35, 0.35), Math.sin(a)).normalize();
  const along = n.clone().cross(UP).normalize(), other = n.clone().cross(along).normalize();
  const tilt = rnd(-0.9, 0.9), line = along.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(other, Math.sin(tilt));
  const P = g.pos.clone();
  g.blink(P.clone().addScaledVector(n, rnd(10, 16)).add(V(0, 4, 0)));
  slash(S, P.clone().addScaledVector(line, -30), P.clone().addScaledVector(line, 30), n, 4.5, 0.5, 'slashR');
  slash(S, P.clone().addScaledVector(line, -26), P.clone().addScaledVector(line, 26), n, 1.6, 0.7, 'slashW');
  cutPlane(D, P, n, along, 22, 20, 1.3, Infinity, 'cleave');
  popAt(S, P, 'flashR', 22, 0.25);
  SFX.cleave(D, P); D.shake(0.6 * near(D, P));
  yield 0.8;
}

/** Lapse Blue: a point that drags everything into itself and crushes it. */
function* blue(D, S) {
  const g = S.gojo, k = S.sukuna;
  g.face(k.pos); g.pose = 'cast';
  if (Math.random() < 0.6) say(D, S, 'gojo', 'Cursed Technique Lapse: Blue.');
  yield 0.3;
  const crowd = D.chars();
  const P = (crowd.length && Math.random() < 0.35 ? pick(crowd).rootPosition.clone().add(V(rnd(-6, 6), rnd(3, 7), rnd(-6, 6))) : k.pos.clone().add(V(rnd(-8, 8), rnd(-2, 5), rnd(-8, 8))));
  P.y = Math.max(P.y, groundAt(D, P.x, P.z) + 4);
  const o = orb(S, 0x2a7aff, 0xd8ecff);
  SFX.blue(D, P);
  chat(D, ['im getting pulled in!!', 'BLUE', 'what is that', 'help'], 1);
  const life = 3.2, R = 18;
  timed(S, life, (kk, dt) => {
    o.set(Math.min(1, kk * 6) * (3 + Math.sin(kk * 40) * 0.25) * (kk > 0.92 ? (1 - kk) / 0.08 : 1)); o.spin(dt);
    o.group.position.copy(P);
    light(D, P, 0x3a8aff, 40, 60, 0.1);
    if (!dt) return;
    // energy streaming in
    if (Math.random() < dt * 40) { const s = P.clone().add(V(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(10, 18))); streak(S, s, s.clone().lerp(P, 0.35), 'streakB', 0.7, 0.2); }
    // buildings break up and fall in, loose things fly in, people are dragged in and crushed
    for (const p of D.st.near(P, R)) { const d = p.mesh.position.distanceTo(P); if (Math.random() < dt * 4 * (1 - d / R)) D.collapse(p, P.clone().sub(p.mesh.position).normalize().multiplyScalar(40), 2); }
    for (const p of D.world.dynamicParts) {
      if (!p.body) continue;
      const to = P.clone().sub(p.mesh.position), d = to.length();
      if (d > 45) continue;
      p.body.wakeUp();
      to.normalize(); const f = 260 * (1 - d / 45) * dt;
      p.body.velocity.x += to.x * f; p.body.velocity.y += to.y * f + 196 * dt * 0.8; p.body.velocity.z += to.z * f;
      if (d < 3 && p.structure) p.structure.remove(p);
    }
    for (const ch of D.chars()) {
      const to = P.clone().sub(ch.rootPosition), d = to.length();
      if (d > 36) continue;
      to.normalize(); const f = 170 * (1 - d / 36) * dt;
      ch.body.velocity.x += to.x * f; ch.body.velocity.y += to.y * f + 150 * dt * (1 - d / 36); ch.body.velocity.z += to.z * f;
      if (d < 18) { ch.platformStand = true; ch.inTornado = D.world.time; }
      if (d < 4.5) D.hurt(ch, 75 * dt, 'blue');
    }
    if (!k.goal && k.pos.distanceTo(P) > 3) k.pos.lerp(P, Math.min(1, dt * 1.2));
  }, () => {
    o.dispose();
    if (S.stopped) return;
    popAt(S, P, 'flashB', 26, 0.3); ring(S, P, UP, 0x5ab0ff, 22, 0.5);
    wreck(D, P, 8, 30);
    for (const d of [...D.st.debris]) if (!d.p.destroyed && d.p.mesh.position.distanceTo(P) < 7) D.st.remove(d.p);
    SFX.thud(D, P, 1.2);
  });
  yield 1.2;
  g.pose = null; g.face(null);
  yield 1.4;
}

/** Reversal Red: a point of repulsion fired at Sukuna, which blows everything apart. */
function* red(D, S) {
  const g = S.gojo, k = S.sukuna;
  if (g.pos.distanceTo(k.pos) < 20) g.blink(k.pos.clone().add(V(rnd(-1, 1), 0, rnd(-1, 1)).normalize().multiplyScalar(rnd(30, 45))).setY(k.pos.y + rnd(0, 8)));
  g.face(k.pos); g.pose = 'cast';
  if (Math.random() < 0.6) say(D, S, 'gojo', 'Reversed Cursed Technique: Red.');
  const o = orb(S, 0xff2010, 0xffe0d8);
  SFX.redCharge(D, g.pos);
  yield* charge(S, o, () => g.hand(true), 0.65, 1.4);
  const from = g.hand(true), to = k.pos.clone(), dir = to.clone().sub(from).normalize(), dist = from.distanceTo(to);
  const speed = 200;
  let went = 0;
  timed(S, dist / speed, (kk, dt) => {
    went += speed * dt; o.group.position.copy(from).addScaledVector(dir, went); o.spin(dt);
    if (Math.random() < 0.8) streak(S, o.group.position.clone().addScaledVector(dir, -3), o.group.position, 'streakR', 1.4, 0.18);
    light(D, o.group.position, 0xff3010, 40, 40, 0.1);
  }, () => {
    o.dispose();
    if (S.stopped) return;
    const at = from.clone().addScaledVector(dir, dist);
    popAt(S, at, 'flashR', 40, 0.35); popAt(S, at, 'flashW', 20, 0.2);
    ring(S, at, UP, 0xff4020, 34, 0.6); ring(S, at, dir, 0xffa080, 24, 0.45);
    D.explode(at, 9, 1.6);
    wreck(D, at, 18, 80);
    blastPeople(D, at, 32, 70, 'red', 90);
    for (const p of D.world.dynamicParts) { if (!p.body) continue; const d = p.mesh.position.distanceTo(at); if (d < 40) { const v = p.mesh.position.clone().sub(at).normalize().multiplyScalar(90 * (1 - d / 40)); p.body.wakeUp(); p.body.velocity.x += v.x; p.body.velocity.y += v.y + 20; p.body.velocity.z += v.z; } }
    explosion(null, 1.3); D.shake(0.9 * near(D, at, 200));
    light(D, at, 0xff3010, 120, 90, 0.25);
    k.hp = Math.max(12, k.hp - 12);
    k.fling(dir.clone().setY(Math.max(dir.y, -0.1)).normalize(), rnd(60, 85));
    chat(D, ['RED', 'BOOM', 'omg the building', 'we gotta go'], 1);
  });
  yield dist / speed + 0.3;
  g.pose = null; g.face(null);
  yield 0.6;
}
/** An orb growing at a hand. */
function* charge(S, o, at, time, r) {
  const steps = Math.ceil(time / 0.05);
  for (let i = 1; i <= steps; i++) { o.set(r * i / steps); o.group.position.copy(at()); o.spin(0.05); yield 0.05; }
}

/** Hollow Purple: Blue and Red brought together, fired straight through the island; everything it touches is erased. */
function* hollowPurple(D, S, power = 1) {
  const g = S.gojo, k = S.sukuna;
  // they square up at the same height, some way apart
  const kp = spot(D, 0.4, [6, 12]);
  yield Math.min(0.8, k.moveTo(kp, 220));
  const a = Math.random() * Math.PI * 2;
  let gp = k.pos.clone().add(V(Math.cos(a) * 70, 0, Math.sin(a) * 70));
  if (Math.abs(gp.x) > LIM || Math.abs(gp.z) > LIM) gp = k.pos.clone().add(V(-Math.cos(a) * 70, 0, -Math.sin(a) * 70));
  g.blink(gp); g.pos.y = Math.max(g.pos.y, k.pos.y);
  g.face(k.pos); g.pose = 'spread';
  say(D, S, 'gojo', power > 1 ? 'Hollow Purple... two hundred percent.' : 'Hollow Technique: Purple.');
  chat(D, ['HOLLOW PURPLE', 'get out of the way!!!', 'its gonna hit us', 'RUNNNN'], 2);
  const b = orb(S, 0x2a7aff, 0xd8ecff), r = orb(S, 0xff2010, 0xffe0d8);
  SFX.purpleCharge(D, g.pos, 2.6);
  // where it will go: a faint line along its path (and a moment to get out of it)
  const R = 9 * power;
  const dir = k.pos.clone().sub(g.pos).normalize(), F0 = g.pos.clone().addScaledVector(dir, 4);
  const tmat = new THREE.MeshBasicMaterial({ color: 0xa050ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const tele = new THREE.Mesh(S.R.tube, tmat); const L = 420;
  tele.position.copy(F0).addScaledVector(dir, L / 2); tele.quaternion.setFromUnitVectors(UP, dir); tele.scale.set(R, L, R); S.layer.add(tele);
  for (let i = 1; i <= 26; i++) { // Blue in the left hand, Red in the right
    b.set(1.6 * i / 26); r.set(1.6 * i / 26);
    b.group.position.copy(g.hand(false)); r.group.position.copy(g.hand(true)); b.spin(0.05); r.spin(0.05);
    tmat.opacity = 0.05 + 0.04 * Math.sin(i);
    light(D, g.pos, 0x8a50ff, 30, 50, 0.1);
    yield 0.05;
  }
  g.pose = 'both';
  const F = g.pos.clone().addScaledVector(dir, 4.5).add(V(0, 0.5, 0));
  const pu = orb(S, 0x9a3aff, 0xffffff);
  for (let i = 1; i <= 12; i++) { // they come together
    b.group.position.lerp(F, 0.3); r.group.position.lerp(F, 0.3); b.spin(0.05); r.spin(0.05);
    if (i > 6) { pu.set(R * 0.5 * (i - 6) / 6); pu.group.position.copy(F); pu.spin(0.05); }
    if (Math.random() < 0.6) bolt(S, F, F.clone().add(V(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(4, 9))), 'purple', 0.2);
    tmat.opacity = 0.1 + 0.06 * Math.sin(i * 2);
    yield 0.05;
  }
  b.dispose(); r.dispose();
  for (let i = 1; i <= 10; i++) { pu.set(R * (0.5 + 0.5 * i / 10)); pu.group.position.copy(F); pu.spin(0.05); if (Math.random() < 0.8) bolt(S, F, F.clone().add(V(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(R * rnd(1.1, 1.8))), 'purple', 0.15); tmat.opacity = 0.14; light(D, F, 0xa050ff, 80, 80, 0.1); yield 0.05; }
  // fire
  S.layer.remove(tele); tmat.dispose();
  SFX.purpleBoom(D, F);
  D.shake(1.2 * near(D, F, 250));
  const speed = 150;
  let went = 0, lastMark = 0, hitK = false;
  const trailMat = new THREE.MeshBasicMaterial({ color: 0x9a40ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const trail = new THREE.Mesh(S.R.tube, trailMat); S.layer.add(trail);
  timed(S, L / speed, (kk, dt) => {
    went += speed * dt;
    const c = F.clone().addScaledVector(dir, went);
    pu.group.position.copy(c); pu.spin(dt);
    trail.position.copy(F).addScaledVector(dir, went / 2); trail.quaternion.setFromUnitVectors(UP, dir); trail.scale.set(R * 0.75, Math.max(0.1, went), R * 0.75);
    light(D, c, 0xa050ff, 120, 120, 0.1);
    if (Math.random() < dt * 30) bolt(S, c, c.clone().add(V(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(R * rnd(1.1, 1.7))), 'purple', 0.15);
    if (!dt) return;
    erase(D, S, c, R);
    if (went - lastMark > 7 && c.y - R < G + 3 && Math.abs(c.x) < 125 && Math.abs(c.z) < 125) { lastMark = went; const m = D.mark(V(c.x, G + 0.1, c.z), 'scorch', R * 2.4); m.material.color.set(0xb080ff); }
    if (!hitK && !k.gone && c.distanceTo(k.pos) < R + 3) { hitK = true; k.hp = Math.max(8, k.hp - 38 * power); k.fling(dir.clone().setY(0.25).normalize(), 70); popAt(S, k.pos, 'flashP', 30, 0.3); }
  }, () => {
    pu.dispose();
    if (S.stopped) { S.layer.remove(trail); trailMat.dispose(); return; }
    timed(S, 1.2, (kk) => { trailMat.opacity = 0.45 * (1 - kk); }, () => { S.layer.remove(trail); trailMat.dispose(); });
  });
  g.pose = null;
  yield 1.6;
  g.face(null);
  chat(D, ['bro erased the whole street', 'WHAT WAS THAT', 'nah id win', 'my house is gone'], 1);
}

/** Unlimited Void: Gojo's domain. Everyone inside is frozen by infinite information while Gojo takes Sukuna apart. */
function* unlimitedVoid(D, S) {
  const g = S.gojo, k = S.sukuna;
  yield Math.min(0.8, k.moveTo(spot(D, 0.55, [2, 8]), 220));
  g.blink(k.pos.clone().add(V(rnd(-1, 1), 0, rnd(-1, 1)).normalize().multiplyScalar(8)));
  g.face(k.pos); g.pose = 'sign';
  say(D, S, 'gojo', 'Domain Expansion... Unlimited Void.');
  yield 1.4;
  const C = V(k.pos.x, Math.max(G, D.water.level), k.pos.z), R = 46;
  const mat = new THREE.MeshBasicMaterial({ map: textures().stars, side: THREE.DoubleSide, transparent: true, opacity: 0.97, fog: false });
  const dome = new THREE.Mesh(S.R.sphere, mat); dome.position.copy(C); S.layer.add(dome);
  const edgeMat = new THREE.MeshBasicMaterial({ map: baseTex().ring, color: 0xd8e8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const edge = new THREE.Mesh(S.R.ring, edgeMat); edge.position.copy(C).add(V(0, 0.4, 0)); S.layer.add(edge);
  SFX.void(D, 6.2);
  S.domain = { kind: 'void', C, R: 0 };
  chat(D, ['i cant move!!!', 'whats happening', 'its so dark', 'UNLIMITED VOID'], 2);
  for (let i = 1; i <= 20; i++) { const r = R * (1 - Math.pow(1 - i / 20, 3)); dome.scale.setScalar(r); edge.scale.setScalar(r); S.domain.R = r; mat.map.offset.x += 0.004; yield 0.05; }
  k.frozen = true; g.pose = null;
  for (let i = 0; i < 12; i++) {
    g.blink(k.pos.clone().add(V(rnd(-1, 1), rnd(-0.3, 0.6), rnd(-1, 1)).normalize().multiplyScalar(3)));
    g.face(k.pos); g.strike(i % 4 === 3);
    impact(D, S, k.pos.clone().add(V(rnd(-1, 1), rnd(0, 1.5), rnd(-1, 1))), 0.8, i % 4 === 3, k);
    for (let j = 0; j < 6; j++) { mat.map.offset.x += 0.006; yield 0.05; }
  }
  k.frozen = false;
  for (let i = 1; i <= 12; i++) { const r = R * (1 - i / 12); dome.scale.setScalar(Math.max(0.01, r)); edge.scale.setScalar(Math.max(0.01, r)); S.domain.R = r; yield 0.05; }
  S.layer.remove(dome, edge); mat.dispose(); edgeMat.dispose(); S.domain = null;
  g.strike(true); g.face(null);
  impact(D, S, k.pos.clone(), 1.6, true, k);
  k.hp = Math.max(10, k.hp - 15);
  yield Math.min(0.8, k.fling(k.pos.clone().sub(g.pos).setY(0.15).normalize(), 70));
}

/** Malevolent Shrine: Sukuna's domain. A shrine rises, the sky turns red, and everything nearby is sliced to pieces. */
function* malevolentShrine(D, S) {
  const g = S.gojo, k = S.sukuna;
  // somewhere with people around, of course
  const people = D.chars();
  let c = people.length ? people.reduce((a, ch) => a.add(ch.rootPosition), V()).multiplyScalar(1 / people.length) : V(rnd(-40, 40), 0, rnd(-40, 40));
  c = V(clamp(c.x + rnd(-15, 15), -80, 80), 0, clamp(c.z + rnd(-15, 15), -80, 80));
  yield Math.min(0.9, k.moveTo(V(c.x, G + H, c.z), 220, true, true));
  k.pose = 'sign'; k.face(g.pos);
  say(D, S, 'sukuna', 'Domain Expansion... Malevolent Shrine.');
  const C = V(k.pos.x, G, k.pos.z), R = 54;
  wreck(D, C, 12, 30); // room for the shrine
  const shrine = buildShrine(); S.layer.add(shrine);
  const back = V(Math.sin(k.yaw), 0, Math.cos(k.yaw));
  shrine.position.copy(C).addScaledVector(back, 12); shrine.rotation.y = k.yaw;
  SFX.shrine(D, 9);
  D.sky.set({ dome: 1, fog: 0x2a0404, near: 30, far: 380, amb: 0.55, sun: 0.35, tint: 0xff5040 });
  for (let i = 1; i <= 24; i++) { shrine.position.y = C.y - 30 * (1 - i / 24); D.shake(0.3 * near(D, C)); yield 0.05; }
  chat(D, ['RUN ITS THE SHRINE', 'ow ow ow', 'get out of the circle', 'MALEVOLENT SHRINE'], 2);
  k.pose = null;
  S.domain = { kind: 'shrine', C, R };
  const parts = [...D.st.parts].filter((p) => p.anchored && !p.userData.fixed && p.mesh.position.distanceTo(C) < R);
  let big = 0, sfx = 0;
  const life = 7;
  timed(S, life, (kk, dt) => {
    if (!dt) return;
    // slashes everywhere, all at once
    for (let i = 0; i < Math.ceil(dt * 70); i++) {
      const r = Math.random();
      let at;
      if (r < 0.35 && parts.length) { const p = pick(parts); at = p.mesh.position.clone(); }
      else if (r < 0.5 && people.length) { at = pick(people).rootPosition.clone(); }
      else { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * R; at = V(C.x + Math.cos(a) * d, C.y + rnd(0.5, 18), C.z + Math.sin(a) * d); }
      const dir = V(rnd(-1, 1), rnd(-0.6, 0.6), rnd(-1, 1)).normalize(), len = rnd(8, 22);
      slash(S, at.clone().addScaledVector(dir, -len / 2), at.clone().addScaledVector(dir, len / 2), D.world.camera.position.clone().sub(at).normalize().add(V(rnd(-0.4, 0.4), rnd(-0.4, 0.4), rnd(-0.4, 0.4))), rnd(0.9, 1.9), 0.18, Math.random() < 0.8 ? 'slashR' : 'slashW');
    }
    // everything in it is cut up
    for (let i = 0; i < Math.round(dt * 55) || (i === 0 && Math.random() < dt * 55); i++) {
      const p = pick(parts); if (!p || p.destroyed || !p.anchored) continue;
      D.collapse(p, V(rnd(-10, 10), rnd(2, 10), rnd(-10, 10)), 2);
    }
    if (Math.random() < dt * 5) { const a = Math.random() * Math.PI * 2, d = Math.random() * R; groundCut(D, S, V(C.x + Math.cos(a) * d, 0, C.z + Math.sin(a) * d), V(Math.cos(a * 3), 0, Math.sin(a * 3))); }
    // and everyone in it
    big -= dt;
    const inside = D.chars().filter((ch) => ch.rootPosition.distanceTo(C) < R);
    for (const ch of inside) D.hurt(ch, 8 * dt, 'shrine');
    if (big <= 0 && inside.length) { big = 0.38; const ch = pick(inside); D.hurt(ch, 18, 'shrine'); const p = ch.rootPosition; slash(S, p.clone().add(V(-3, 2, -2)), p.clone().add(V(3, -2, 2)), V(rnd(-1, 1), 0.3, rnd(-1, 1)), 1.2, 0.25); }
    // Gojo is in there too: Infinity holds
    if (g.pos.distanceTo(C) < R && Math.random() < dt * 12) { g.infT = 1; const p = g.pos.clone().add(V(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(4.6)); popAt(S, p, 'flashB', 2.5, 0.15); }
    sfx -= dt; if (sfx <= 0) { sfx = 0.07; SFX.slash(D, at3(C), rnd(0.3, 0.6)); }
    D.shake(0.2 * near(D, C, 140));
  });
  for (let i = 0; i < 14; i++) { if (Math.random() < 0.6) g.blink(V(C.x + rnd(-R, R) * 0.6, 0, C.z + rnd(-R, R) * 0.6).setY(groundAt(D, C.x, C.z) + H + rnd(2, 16))); g.face(k.pos); yield 0.5; }
  S.domain = null;
  for (let i = 1; i <= 20; i++) { shrine.position.y = C.y - 30 * (i / 20); yield 0.05; }
  S.layer.remove(shrine);
  shrine.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  D.sky.set(S.skyFight);
  k.face(null);
}
const at3 = (C) => C.clone().add(V(rnd(-20, 20), 4, rnd(-20, 20)));
function buildShrine() {
  const g = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
  const box = (w, h, d, x, y, z, mat, ry = 0, rz = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.set(0, ry, rz); m.castShadow = true; g.add(m); return m; };
  const stone = M(0x2a2424), wood = M(0x4a0c0c), dark = M(0x120c0c), bone = M(0xe8e0cc), mouth = M(0x300404);
  box(30, 3, 22, 0, 1.5, 0, stone); box(14, 1.5, 4, 0, 0.75, -12.5, stone);
  for (const [x, z] of [[-10, -7], [10, -7], [-10, 7], [10, 7]]) box(2.2, 17, 2.2, x, 11.5, z, wood);
  box(26, 1.6, 2.4, 0, 19, -7, wood); box(26, 1.6, 2.4, 0, 19, 7, wood);
  box(34, 1.6, 26, 0, 21, 0, dark);
  for (const s of [-1, 1]) for (const t of [-1, 1]) box(7, 1.2, 2, s * 17.5, 22.5, t * 12.5, dark, 0, s * 0.45);
  box(26, 1.5, 19, 0, 24.5, 0, dark); box(18, 1.5, 13, 0, 27.5, 0, dark); box(10, 1.5, 7, 0, 30, 0, dark);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8), bone); crown.position.set(0, 32.2, 0); g.add(crown);
  // the mouth between the front pillars, full of teeth
  box(17, 11, 1, 0, 9.5, -7.6, mouth);
  const cone = new THREE.ConeGeometry(0.7, 2.4, 5);
  for (let i = 0; i < 9; i++) { const x = -7 + i * 1.75; const t1 = new THREE.Mesh(cone, bone); t1.position.set(x, 13.6, -8.2); t1.rotation.x = Math.PI; g.add(t1); const t2 = new THREE.Mesh(cone, bone); t2.position.set(x + 0.8, 5.4, -8.2); g.add(t2); }
  // and piles of skulls
  const skull = new THREE.SphereGeometry(0.9, 10, 8), horn = new THREE.ConeGeometry(0.25, 1.4, 5);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2, x = Math.cos(a) * rnd(13, 16), z = Math.sin(a) * rnd(9, 12);
    const s = new THREE.Mesh(skull, bone); s.position.set(x, 3.6 + Math.random() * 0.6, z); g.add(s);
    if (i % 3 === 0) for (const d of [-1, 1]) { const h = new THREE.Mesh(horn, bone); h.position.set(x + d * 0.9, 4.2, z); h.rotation.z = -d * 0.9; g.add(h); }
  }
  return g;
}

/** Fuga: Sukuna draws a bow of fire and looses one arrow; where it lands, everything burns. */
function* fuga(D, S) {
  const g = S.gojo, k = S.sukuna;
  const T = spot(D, 0.6, [0, 0]); T.y -= H;
  g.blink(T.clone().add(V(0, H, 0)));
  const a = Math.random() * Math.PI * 2;
  const from = V(clamp(T.x + Math.cos(a) * 75, -LIM, LIM), 0, clamp(T.z + Math.sin(a) * 75, -LIM, LIM));
  from.y = groundAt(D, from.x, from.z) + H + 28;
  yield Math.min(0.9, k.moveTo(from, 220));
  k.face(T); k.pose = 'bow';
  say(D, S, 'sukuna', 'Fuga.');
  chat(D, ['FIRE ARROW', 'hes aiming at us', 'run run run', 'FUGA'], 2);
  SFX.fugaDraw(D, k.pos);
  // the bow and the arrow, burning in his hands
  const bowFire = [];
  for (let i = 0; i < 7; i++) { const t = (i / 6 - 0.5) * 2.2; bowFire.push(D.flames.add(() => (k.gone ? null : k.hand(false).add(V(0, Math.sin(t) * 3.2, 0)).addScaledVector(k.front(1).sub(k.pos).setY(0).normalize(), Math.cos(t) * 1.4 - 1.4)), 1.6)); }
  const arrowMat = new THREE.SpriteMaterial({ map: tex().flame, color: 0xffd080, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
  const arrow = new THREE.Sprite(arrowMat); arrow.scale.set(2.4, 9, 1); S.layer.add(arrow);
  for (let i = 0; i < 30; i++) {
    const h = k.hand(false); arrow.position.copy(h); arrowMat.rotation = Math.PI / 2;
    if (Math.random() < 0.5) D.fx.burst(D.fx.mats.spark, h, 2, { speed: [2, 8], size: [0.3, 0.7], life: [0.3, 0.6], gravity: -0.3 });
    light(D, h, 0xff8020, 50, 40, 0.1);
    yield 0.05;
  }
  for (const f of bowFire) f.stop();
  k.pose = null;
  // loose
  const start = k.hand(false), dir = T.clone().sub(start).normalize(), dist = start.distanceTo(T), speed = 170;
  let went = 0;
  const fire = D.flames.add(() => (went < dist ? arrow.position.clone() : null), 3);
  SFX.whoosh(D, start);
  timed(S, dist / speed, (kk, dt) => {
    went += speed * dt; arrow.position.copy(start).addScaledVector(dir, went);
    if (dt && Math.random() < 0.7) streak(S, arrow.position.clone().addScaledVector(dir, -5), arrow.position, 'streakR', 1.4, 0.3);
    if (dt && Math.random() < dt * 20) D.flames.puff(arrow.position.clone(), rnd(3, 6));
    light(D, arrow.position, 0xff8020, 60, 50, 0.1);
    if (went > dist - speed * 0.25 && !g.gone && g.pos.distanceTo(T) < 12) g.blink(spot(D, 0, [6, 20]));
  }, () => {
    fire.stop(); S.layer.remove(arrow); arrowMat.dispose();
    if (!S.stopped) fugaBlast(D, S, T);
  });
  yield dist / speed + 1.6;
  k.face(null);
}
function fugaBlast(D, S, at) {
  const fmat = new THREE.MeshBasicMaterial({ color: 0xff6a10, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const cmat = new THREE.MeshBasicMaterial({ color: 0xffe080, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const ball = new THREE.Mesh(S.R.sphere, fmat), core = new THREE.Mesh(S.R.sphere, cmat);
  ball.position.copy(at); core.position.copy(at); S.layer.add(ball, core);
  timed(S, 2, (k) => {
    const g = Math.min(1, k * 4);
    ball.scale.setScalar(28 * (0.2 + 0.8 * Math.sqrt(g))); core.scale.setScalar(16 * Math.sqrt(g) * (1 - k));
    fmat.opacity = 0.9 * (1 - k); cmat.opacity = 1 - k;
    light(D, at.clone().add(V(0, 8, 0)), 0xff7020, 150 * (1 - k), 140, 0.1);
  }, () => { S.layer.remove(ball, core); fmat.dispose(); cmat.dispose(); });
  ring(S, at.clone().add(V(0, 1, 0)), UP, 0xffa040, 60, 0.9);
  D.explode(at.clone().add(V(0, 2, 0)), 12, 2.4);
  wreck(D, at, 22, 70);
  blastPeople(D, at, 36, 95, 'fuga', 75);
  const burn = [...D.st.parts].filter((p) => p.anchored && !p.userData.fixed && !p.destroyed && p.mesh.position.distanceTo(at) < 32);
  for (let i = 0; i < 30 && burn.length; i++) D.ignite(burn.splice(Math.floor(Math.random() * burn.length), 1)[0]);
  for (let i = 0; i < 16; i++) D.flames.puff(at.clone().add(V(rnd(-14, 14), rnd(2, 20), rnd(-14, 14))), rnd(10, 22));
  D.fx.burst(D.fx.mats.spark, at.clone().add(V(0, 3, 0)), 28, { speed: [15, 50], size: [0.4, 1], life: [0.6, 1.4], gravity: 0.6 });
  D.mark(at, 'scorch', 58);
  explosion(null, 1.8); SFX.thud(D, at, 2);
  D.shake(1.3 * near(D, at, 260));
  chat(D, ['EVERYTHING IS ON FIRE', 'my house!!!', 'HOT HOT HOT', 'lol rip'], 2);
}

/** The end: one of them wins. */
function* finale(D, S) {
  const g = S.gojo, k = S.sukuna;
  yield* clash(D, S);
  const gojoWins = S.forceWinner ? S.forceWinner === 'gojo' : Math.random() < 0.5;
  (gojoWins ? g : k).hp = Math.max((gojoWins ? g : k).hp, rnd(30, 50)); // the winner digs deep (or heals: reverse cursed technique)
  if (gojoWins) {
    // Gojo: Hollow Purple at two hundred percent
    yield* hollowPurple(D, S, 1.6);
    S.winner = 'gojo';
    k.hp = 0; k.flung = true; k.goal = null;
    const fall = k.pos.clone().add(V(rnd(-1, 1) * 40, 60, rnd(-1, 1) * 40));
    k.moveTo(fall, 60, false);
    yield 1;
    popAt(S, k.pos, 'flashR', 18, 0.4); k.gone = true; k.root.visible = false;
    yield 0.6;
    say(D, S, 'gojo', 'Throughout heaven and earth, I alone am the honored one.');
  } else {
    // Sukuna: the World Cutting Slash
    yield Math.min(0.8, k.moveTo(g.pos.clone().add(V(rnd(-1, 1), 0, rnd(-1, 1)).normalize().multiplyScalar(30)), 200));
    k.face(g.pos);
    say(D, S, 'sukuna', 'Dismantle... the world itself.');
    for (const p of ['sign', 'both', 'sign', 'cast']) { k.pose = p; yield 0.35; }
    k.strike(true); k.pose = null;
    const P = g.pos.clone(), a = Math.random() * Math.PI * 2;
    const n = V(Math.cos(a), 0, Math.sin(a)), along = n.clone().cross(UP).normalize();
    const a0 = P.clone().addScaledVector(along, -420).add(V(0, 150, 0)), a1 = P.clone().addScaledVector(along, 420).add(V(0, -150, 0));
    slash(S, a0, a1, n, 16, 1.3, 'slashR'); slash(S, a0, a1, n, 6, 2.2, 'slashW');
    cutPlane(D, P, n, along.clone().add(V(0, 0.3, 0)).normalize(), 400, 200, 1.2, Infinity, 'worldslash');
    popAt(S, P, 'flashW', 60, 0.4);
    SFX.cleave(D, P, 2); explosion(null, 1.2);
    D.shake(1.4); D.sky.flash = 1;
    g.infT = 1;
    S.winner = 'sukuna';
    splitGojo(D, S, n);
    yield 2.2;
    say(D, S, 'sukuna', 'Stand proud, Satoru Gojo. You were strong.');
  }
  chat(D, S.winner === 'gojo' ? ['GOJO WON', 'nah he really won', 'gojo is the strongest', 'GG'] : ['SUKUNA WON', 'noooo gojo', 'he really cut the world', 'GG'], 3);
  S.hud.winner(S.winner === 'gojo' ? 'SATORU GOJO WINS' : 'RYOMEN SUKUNA WINS', S.winner === 'gojo' ? '#9ad8ff' : '#ff6a5a');
  yield 3;
  // the winner leaves
  const w = S.winner === 'gojo' ? g : k;
  w.face(null);
  w.moveTo(w.pos.clone().add(V(0, 160, 0)), 140, false);
  yield 1.2;
  popAt(S, w.pos, w.gojo ? 'flashB' : 'flashR', 20, 0.3); w.gone = true; w.root.visible = false;
}
/** The World Cutting Slash goes through Gojo too: his top half slides off. */
function splitGojo(D, S, n) {
  const g = S.gojo, m = g.model;
  g.gone = true; g.hp = 0;
  const top = new THREE.Group();
  m.root.add(top);
  for (const o of [m.torso, m.neck, m.rightShoulder, m.leftShoulder]) top.add(o);
  for (const o of [...m.root.children]) if (o !== top && !o.isGroup && o.isMesh) top.add(o); // collar, button
  const v = n.clone().multiplyScalar(4).add(V(0, 2, 0));
  let vy = 0;
  const ground = groundAt(D, g.pos.x, g.pos.z);
  timed(S, 2.2, (k, dt) => {
    if (!dt) return;
    vy -= 60 * dt;
    top.position.addScaledVector(v.clone().applyAxisAngle(UP, -g.yaw), dt / SCALE); top.rotation.z += dt * 1.6;
    g.root.position.y = Math.max(ground + 2, g.root.position.y + vy * dt);
  });
  popAt(S, g.pos, 'flashB', 10, 0.3);
}

/** The whole fight, start to finish (yields are pauses in seconds). */
function* fight(D, S) {
  const g = S.gojo, k = S.sukuna;
  // they arrive: Gojo drifts down out of the sky, Sukuna lands hard
  const a = Math.random() * Math.PI * 2;
  const pg = V(Math.cos(a) * 60, 0, Math.sin(a) * 60), pk = V(-Math.cos(a) * 60, 0, -Math.sin(a) * 60);
  g.pos.set(pg.x, 180, pg.z); k.pos.set(pk.x, 220, pk.z); g.trail.copy(g.pos); k.trail.copy(k.pos);
  g.moveTo(V(pg.x, groundAt(D, pg.x, pg.z) + H + 16, pg.z), 110, false);
  k.moveTo(V(pk.x, 0, pk.z), 190, true); k.flung = true;
  chat(D, ['wait is that gojo', 'SUKUNA??', 'no way', 'who are those guys', 'RUN'], 3);
  yield 1.3;
  say(D, S, 'gojo', "Nah, I'd win.");
  yield 2;
  say(D, S, 'sukuna', 'Then show me, Satoru Gojo.');
  yield 1.4;
  yield* skirmish(D, S, 17);
  yield* unlimitedVoid(D, S);
  yield* skirmish(D, S, 33);
  yield* malevolentShrine(D, S);
  yield* skirmish(D, S, 47);
  yield* fuga(D, S);
  yield* skirmish(D, S, 57);
  yield* hollowPurple(D, S, 1);
  yield* skirmish(D, S, 66);
  yield* finale(D, S);
}
function* skirmish(D, S, until) {
  const moves = [clash, clash, clash, chase, dismantle, dismantle, blue, red, cleave];
  let last = null;
  while (S.t < until - 1.5) {
    let m = pick(moves);
    if (m === last) m = pick(moves);
    last = m;
    S.cur = m.name;
    yield* m(D, S);
  }
}

function say(D, S, who, text) {
  S.hud.say(who, text);
  if (who === 'gojo') speak(text, { pitch: 1.05, rate: 1.02, voice: 0, interrupt: true });
  else speak(text, { pitch: 0.35, rate: 0.82, voice: 1, interrupt: true });
}

// --- the HUD: both fighters' health, what they say, and the Void's overload ---------------------------------------------
const CSS = `
.jjk{position:absolute;left:50%;top:94px;transform:translateX(-50%);display:flex;align-items:center;gap:14px;font-family:Arial,sans-serif;}
.jjk .fb{width:190px}
.jjk .fb b{display:block;font:bold 13px Arial;letter-spacing:1px;text-shadow:0 1px 2px #000;margin-bottom:2px;}
.jjk .fb.s b{text-align:right}
.jjk .fb i{display:block;height:13px;background:rgba(0,0,0,.65);border:1px solid rgba(255,255,255,.7);position:relative;overflow:hidden}
.jjk .fb i u{position:absolute;top:0;bottom:0;left:0;background:linear-gradient(#bfe6ff,#3a8ae8);transition:width .15s}
.jjk .fb.s i u{left:auto;right:0;background:linear-gradient(#ff9a8a,#c01818)}
.jjk>span{font:bold 24px 'Arial Black',Arial;color:#ffdd44;text-shadow:0 2px 3px #000}
.jjk-sub{position:absolute;left:50%;bottom:160px;transform:translateX(-50%);font:bold 22px Arial;text-shadow:0 2px 4px #000,0 0 3px #000;text-align:center;white-space:nowrap;opacity:0;transition:opacity .25s;color:#fff}
.jjk-sub em{font-style:normal}
.jjk-void{position:absolute;inset:0;opacity:0;transition:opacity .4s;background:radial-gradient(ellipse at center,rgba(255,255,255,.0) 20%,rgba(180,200,255,.35) 70%,rgba(255,255,255,.6));}
.jjk-void div{position:absolute;left:0;right:0;top:36%;text-align:center;font:bold 30px 'Arial Black',Arial;letter-spacing:6px;color:#fff;text-shadow:0 0 12px #8ab8ff,0 2px 3px #000}
.jjk-win{position:absolute;left:0;right:0;top:30%;text-align:center;font:bold 54px 'Arial Black',Arial;-webkit-text-stroke:2px #000;text-shadow:0 4px 0 #000;opacity:0;transition:opacity .5s}
`;
class Hud {
  constructor(root) {
    if (!document.getElementById('jjk-css')) { const st = document.createElement('style'); st.id = 'jjk-css'; st.textContent = CSS; document.head.appendChild(st); }
    this.el = document.createElement('div');
    this.el.innerHTML = `<div class="jjk"><div class="fb g"><b style="color:#9ad8ff">SATORU GOJO</b><i><u style="width:100%"></u></i></div><span>VS</span><div class="fb s"><b style="color:#ff6a5a">RYOMEN SUKUNA</b><i><u style="width:100%"></u></i></div></div>
      <div class="jjk-sub"></div><div class="jjk-void"><div>∞ UNLIMITED VOID ∞</div></div><div class="jjk-win"></div>`;
    root.appendChild(this.el);
    const q = (s) => this.el.querySelector(s);
    Object.assign(this, { hg: q('.fb.g u'), hs: q('.fb.s u'), sub: q('.jjk-sub'), voidEl: q('.jjk-void'), win: q('.jjk-win') });
  }
  hp(g, s) { this.hg.style.width = `${Math.max(0, g)}%`; this.hs.style.width = `${Math.max(0, s)}%`; }
  say(who, text) {
    const g = who === 'gojo';
    this.sub.innerHTML = `<em style="color:${g ? '#9ad8ff' : '#ff6a5a'}">${g ? 'Gojo' : 'Sukuna'}:</em> ${text}`;
    this.sub.style.opacity = 1;
    clearTimeout(this._t); this._t = setTimeout(() => { this.sub.style.opacity = 0; }, 2800);
  }
  void(on) { this.voidEl.style.opacity = on ? 1 : 0; }
  winner(text, color) { this.win.textContent = text; this.win.style.color = color; this.win.style.opacity = 1; }
  remove() { clearTimeout(this._t); this.el.remove(); }
}

// --- sounds -----------------------------------------------------------------------------------------------------------
const loud = (D, pos, v = 1, r = 420) => v * (pos ? clamp(1 - D.world.camera.position.distanceTo(pos) / r, 0.18, 1) : 1);
const loops = [];
const SFX = {
  punch(D, pos, p = 1) {
    sounds.custom((c, out, t, K) => {
      const o = c.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.2);
      const g = c.createGain(); K.env(g, t, 0.003, 1.5, 0.24); K.chain(o, g, out); o.start(t); o.stop(t + 0.3);
      const n = K.noise(c); const ng = c.createGain(); K.env(ng, t, 0.001, 0.9, 0.09); K.chain(n, K.filt(c, 'bandpass', 1600, 0.8), ng, out); n.start(t); n.stop(t + 0.12);
    }, null, loud(D, pos, 0.45 * p));
  },
  thud(D, pos, p = 1) {
    sounds.custom((c, out, t, K) => {
      const o = c.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.6);
      const g = c.createGain(); K.env(g, t, 0.005, 1.8, 0.7); K.chain(o, g, out); o.start(t); o.stop(t + 0.8);
      const n = K.noise(c, 'brown'); const ng = c.createGain(); K.env(ng, t, 0.005, 1.4, 0.9); K.chain(n, K.filt(c, 'lowpass', 600), ng, out); n.start(t); n.stop(t + 1);
    }, null, loud(D, pos, 0.5 * p));
  },
  blackFlash(D, pos) {
    SFX.punch(D, pos, 1.6);
    sounds.custom((c, out, t, K) => {
      for (let i = 0; i < 7; i++) { const tt = t + i * 0.025 + Math.random() * 0.02; const n = K.noise(c); const g = c.createGain(); K.env(g, tt, 0.001, 0.8, 0.05); K.chain(n, K.filt(c, 'highpass', 2500), g, out); n.start(tt); n.stop(tt + 0.08); }
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(60, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.5);
      const g = c.createGain(); K.env(g, t, 0.005, 0.7, 0.5); K.chain(o, K.filt(c, 'lowpass', 300), g, out); o.start(t); o.stop(t + 0.6);
    }, null, loud(D, pos, 0.6));
  },
  zip(D, pos) {
    sounds.custom((c, out, t, K) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(500, t); o.frequency.exponentialRampToValueAtTime(2600, t + 0.1);
      const g = c.createGain(); K.env(g, t, 0.005, 0.35, 0.12); K.chain(o, g, out); o.start(t); o.stop(t + 0.15);
    }, null, loud(D, pos, 0.4));
  },
  ting(D, pos) {
    sounds.custom((c, out, t, K) => { for (const f of [2600, 3900]) { const o = c.createOscillator(); o.frequency.value = f; const g = c.createGain(); K.env(g, t, 0.002, 0.25, 0.4); K.chain(o, g, out); o.start(t); o.stop(t + 0.45); } }, null, loud(D, pos, 0.35));
  },
  slash(D, pos, v = 1) {
    sounds.custom((c, out, t, K) => {
      const n = K.noise(c); const f = K.filt(c, 'bandpass', 5000, 2); f.frequency.setValueAtTime(7000, t); f.frequency.exponentialRampToValueAtTime(1200, t + 0.16);
      const g = c.createGain(); K.env(g, t, 0.003, 1, 0.16); K.chain(n, f, g, out); n.start(t); n.stop(t + 0.2);
      const o = c.createOscillator(); o.frequency.value = 3000 + Math.random() * 1500; const og = c.createGain(); K.env(og, t, 0.002, 0.08, 0.2); K.chain(o, og, out); o.start(t); o.stop(t + 0.22);
    }, null, loud(D, pos, 0.4 * v));
  },
  cleave(D, pos, v = 1) {
    SFX.slash(D, pos, 1.6 * v);
    sounds.custom((c, out, t, K) => {
      const n = K.noise(c, 'pink'); const f = K.filt(c, 'bandpass', 2000, 1); f.frequency.setValueAtTime(3500, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.5);
      const g = c.createGain(); K.env(g, t, 0.004, 1.4, 0.55); K.chain(n, f, g, out); n.start(t); n.stop(t + 0.6);
    }, null, loud(D, pos, 0.55 * v));
  },
  whoosh(D, pos) {
    sounds.custom((c, out, t, K) => { const n = K.noise(c, 'pink'); const g = c.createGain(); K.env(g, t, 0.1, 0.9, 0.6); const f = K.filt(c, 'bandpass', 600, 1.5); f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.5); K.chain(n, f, g, out); n.start(t); n.stop(t + 0.8); }, null, loud(D, pos, 0.5));
  },
  blue(D, pos) {
    sounds.custom((c, out, t, K) => {
      const o = c.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(55, t + 3.2);
      const l = c.createOscillator(); l.frequency.value = 7; const ld = c.createGain(); ld.gain.value = 18; l.connect(ld); ld.connect(o.frequency);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.3); g.gain.setValueAtTime(0.9, t + 2.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.3);
      K.chain(o, g, out);
      const n = K.noise(c, 'pink'); const f = K.filt(c, 'bandpass', 2000, 2); f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(200, t + 3.2);
      const ng = c.createGain(); ng.gain.value = 0.5; K.chain(n, f, ng, g);
      for (const x of [o, l, n]) { x.start(t); x.stop(t + 3.4); }
    }, null, loud(D, pos, 0.55));
  },
  redCharge(D, pos) {
    sounds.custom((c, out, t, K) => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(1100, t + 0.65); const g = c.createGain(); K.env(g, t, 0.05, 0.35, 0.65); K.chain(o, K.filt(c, 'lowpass', 1800), g, out); o.start(t); o.stop(t + 0.75); }, null, loud(D, pos, 0.5));
  },
  purpleCharge(D, pos, secs) {
    sounds.custom((c, out, t, K) => {
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.8, t + secs * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + secs + 0.1); g.connect(out);
      for (const d of [0, 7]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70 + d, t); o.frequency.exponentialRampToValueAtTime(420 + d * 3, t + secs); K.chain(o, K.filt(c, 'lowpass', 1400), g); o.start(t); o.stop(t + secs + 0.15); }
      const n = K.noise(c); const am = c.createGain(); am.gain.value = 0; const l = c.createOscillator(); l.type = 'square'; l.frequency.value = 17; const ld = c.createGain(); ld.gain.value = 0.3; l.connect(ld); ld.connect(am.gain);
      K.chain(n, K.filt(c, 'highpass', 3000), am, g); n.start(t); l.start(t); n.stop(t + secs + 0.1); l.stop(t + secs + 0.1);
    }, null, loud(D, pos, 0.6));
  },
  purpleBoom(D, pos) {
    explosion(null, 1.6);
    sounds.custom((c, out, t, K) => {
      const o = c.createOscillator(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(22, t + 2.4);
      const g = c.createGain(); K.env(g, t, 0.01, 2, 2.4); K.chain(o, g, out); o.start(t); o.stop(t + 2.6);
      const n = K.noise(c, 'pink'); const f = K.filt(c, 'bandpass', 900, 0.7); f.frequency.setValueAtTime(2500, t); f.frequency.exponentialRampToValueAtTime(200, t + 2.5);
      const ng = c.createGain(); K.env(ng, t, 0.02, 1.2, 2.5); K.chain(n, f, ng, out); n.start(t); n.stop(t + 2.7);
    }, null, 0.75);
  },
  void(D, secs) {
    sounds.custom((c, out, t, K) => {
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 1); g.gain.setValueAtTime(0.5, t + secs - 1); g.gain.exponentialRampToValueAtTime(0.0001, t + secs); g.connect(out);
      for (const f of [220, 277.2, 329.6, 440, 554.4, 880]) {
        const o = c.createOscillator(); o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.004);
        const am = c.createGain(); am.gain.value = 0.12; const l = c.createOscillator(); l.frequency.value = 3 + Math.random() * 4; const ld = c.createGain(); ld.gain.value = 0.08; l.connect(ld); ld.connect(am.gain);
        K.chain(o, am, g); o.start(t); l.start(t); o.stop(t + secs + 0.1); l.stop(t + secs + 0.1);
      }
    }, null, 0.7);
  },
  shrine(D, secs) {
    sounds.custom((c, out, t, K) => {
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 1.2); g.gain.setValueAtTime(0.7, t + secs - 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + secs); g.connect(out);
      for (const f of [41.2, 55, 61.7, 82.4]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; K.chain(o, K.filt(c, 'lowpass', 380), g); o.start(t); o.stop(t + secs + 0.1); }
    }, null, 0.7);
  },
  fugaDraw(D, pos) {
    sounds.custom((c, out, t, K) => {
      const n = K.noise(c, 'brown'); const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.2, t + 1.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
      K.chain(n, K.filt(c, 'lowpass', 900), g, out);
      const w = K.noise(c); const am = c.createGain(); am.gain.value = 0; const l = c.createOscillator(); l.type = 'square'; l.frequency.value = 11; const ld = c.createGain(); ld.gain.value = 0.2; l.connect(ld); ld.connect(am.gain);
      K.chain(w, K.filt(c, 'bandpass', 2400, 1.5), am, g);
      for (const x of [n, w, l]) { x.start(t); x.stop(t + 1.8); }
    }, null, loud(D, pos, 0.6));
  },
  stopAll() { for (const l of loops.splice(0)) l.stop(); },
};

// --- the disaster ---------------------------------------------------------------------------------------------------------
export const jjk = {
  id: 'jjk', name: 'Gojo vs Sukuna', icon: '⚔️', color: '#b070ff', duration: 80, bots: 'away',
  tip: 'The two strongest are fighting - stay out of their way!',
  moves: { clash, chase, dismantle, cleave, blue, red, hollowPurple, unlimitedVoid, malevolentShrine, fuga, finale }, // (for testing)
  start(D, S) {
    S.R = resources();
    S.fx = []; S.cuts = []; S.t = 0; S.wait = 0; S.domain = null; S.winner = null;
    S.layer = new THREE.Group(); D.world.scene.add(S.layer);
    S.D = D;
    S.gojo = new Fighter(D, S, 'gojo'); S.sukuna = new Fighter(D, S, 'sukuna');
    S.gojo.foe = S.sukuna; S.sukuna.foe = S.gojo;
    S.pos = V();
    S.hud = new Hud(D.guiRoot);
    S.skyFight = { dome: 0.55, fog: 0x4a4458, near: 140, far: 900, amb: 0.75, sun: 0.6, tint: 0xb8a8d8 };
    D.sky.set(S.skyFight);
    S.script = fight(D, S);
  },
  update(D, S, dt, t) {
    S.t = t;
    // the fight script: run it until it asks for a pause
    S.wait -= dt;
    let guard = 0;
    while (S.wait <= 0 && S.script && guard++ < 50) {
      const r = S.script.next();
      if (r.done) { S.script = null; break; }
      S.wait += r.value || 0;
    }
    S.gojo.update(dt); S.sukuna.update(dt);
    for (let i = S.fx.length - 1; i >= 0; i--) if (!S.fx[i].update(dt)) S.fx.splice(i, 1);
    // bots run from wherever the fight (or a domain) is
    if (S.domain) S.pos.copy(S.domain.C); else if (!S.gojo.gone || !S.sukuna.gone) S.pos.copy(S.gojo.gone ? S.sukuna.pos : S.sukuna.gone ? S.gojo.pos : S.gojo.pos.clone().add(S.sukuna.pos).multiplyScalar(0.5)).setY(0);
    // Unlimited Void: inside it, nobody can move
    let inVoid = false;
    if (S.domain?.kind === 'void') {
      for (const ch of D.chars()) {
        if (ch.rootPosition.distanceTo(S.domain.C) > S.domain.R) continue;
        ch.input.move.set(0, 0, 0); ch.input.jump = false;
        ch.body.velocity.x = 0; ch.body.velocity.z = 0; ch.body.velocity.y = Math.min(ch.body.velocity.y, 0);
        D.hurt(ch, 5 * dt, 'void');
        if (ch.player?.isLocal) inVoid = true;
      }
    }
    S.hud.void(inVoid);
    S.hud.hp(S.gojo.hp, S.sukuna.hp);
  },
  stop(D, S) {
    S.script = null; S.stopped = true;
    S.gojo.gone = S.sukuna.gone = true;
    for (const e of S.fx) e.update(1e3);
    S.fx = [];
    S.gojo.dispose(); S.sukuna.dispose();
    D.world.scene.remove(S.layer);
    for (const m of S.cuts) setTimeout(() => D.world.scene.remove(m), 3000);
    for (const g of ['plane', 'sphere', 'ring', 'torus', 'tube', 'seg']) S.R[g].dispose();
    for (const m of Object.values(S.R.mats)) m.dispose();
    S.hud.remove();
    SFX.stopAll();
    window.speechSynthesis?.cancel();
  },
};
