// Effects for "Desert Strike": synthesized gun and reload sounds, tracers,
// muzzle flashes, impacts and bullet holes, and blood (spray, wounds on the
// body, splatter on walls and floors, pools under bodies) plus rag-doll
// corpses that stay on the ground for a while.
import * as THREE from 'three';
import { sounds } from '../../engine/Sound.js';
import { GROUP } from '../../engine/Part.js';

// --- sounds --------------------------------------------------------------------------------
// Each gun has a crack (bright noise burst), a body (low thump) and a tail
// (the shot echoing off the buildings).
const SHOT = {
  pistol: { crack: 2600, body: 140, len: 0.09, tail: 0.5, vol: 0.8 },
  magnum: { crack: 1800, body: 95, len: 0.13, tail: 0.9, vol: 1.0 },
  smg: { crack: 3000, body: 150, len: 0.06, tail: 0.4, vol: 0.65 },
  rifle: { crack: 3200, body: 110, len: 0.08, tail: 0.8, vol: 0.9 },
  ak: { crack: 2100, body: 85, len: 0.1, tail: 0.9, vol: 1.0 },
  shotgun: { crack: 1300, body: 65, len: 0.18, tail: 1.0, vol: 1.1 },
  sniper: { crack: 2400, body: 70, len: 0.16, tail: 1.6, vol: 1.2 },
};
export function playShot(kind, position, suppressed, isLocal) {
  const p = SHOT[kind] || SHOT.rifle;
  sounds.custom((c, out, t, K) => {
    if (suppressed) {
      const n = K.noise(c); const g = c.createGain(); K.env(g, t, 0.002, 0.7, 0.07);
      K.chain(n, K.filt(c, 'bandpass', 700, 0.8), g, out); n.start(t); n.stop(t + 0.12);
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 2400; const og = c.createGain(); K.env(og, t, 0.001, 0.08, 0.02);
      K.chain(o, K.filt(c, 'highpass', 1500), og, out); o.start(t); o.stop(t + 0.04);
      return;
    }
    // crack
    const n = K.noise(c); const g = c.createGain(); K.env(g, t, 0.001, 1.0, p.len);
    K.chain(n, K.filt(c, 'highpass', p.crack * 0.5), K.filt(c, 'peaking', p.crack, 1), g, out); n.start(t); n.stop(t + p.len + 0.05);
    // body
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(p.body * 1.8, t); o.frequency.exponentialRampToValueAtTime(p.body * 0.6, t + 0.12);
    const og = c.createGain(); K.env(og, t, 0.002, 1.1, 0.14); K.chain(o, og, out); o.start(t); o.stop(t + 0.2);
    const b = K.noise(c, 'brown'); const bg = c.createGain(); K.env(bg, t, 0.002, 1.2, p.len * 2);
    K.chain(b, K.filt(c, 'lowpass', 600), bg, out); b.start(t); b.stop(t + p.len * 2 + 0.05);
    // tail: echoes off the walls
    const e = K.noise(c, 'pink'); const eg = c.createGain(); K.env(eg, t + 0.02, 0.03, 0.18, p.tail);
    const d = c.createDelay(1); d.delayTime.value = 0.11; const fb = c.createGain(); fb.gain.value = 0.35;
    K.chain(e, K.filt(c, 'lowpass', 900), eg, d); d.connect(fb); fb.connect(d); d.connect(out);
    eg.connect(out); e.start(t + 0.02); e.stop(t + p.tail + 0.2);
  }, isLocal ? null : position, (isLocal ? 0.55 : 0.5) * p.vol * (suppressed ? 0.6 : 1));
}

const CLICKS = {
  magOut: [[0, 2200, 0.05, 0.5], [0.05, 900, 0.08, 0.4]],
  magIn: [[0, 1600, 0.04, 0.6], [0.03, 3200, 0.03, 0.5]],
  rack: [[0, 1800, 0.05, 0.6], [0.12, 2600, 0.05, 0.7]],
  slide: [[0, 3000, 0.04, 0.6]],
  shell: [[0, 1400, 0.05, 0.5], [0.06, 2400, 0.03, 0.3]],
  pumpBack: [[0, 900, 0.07, 0.7]], pumpFwd: [[0, 1300, 0.07, 0.7]],
  dry: [[0, 4000, 0.02, 0.4]],
  boltUp: [[0, 2000, 0.04, 0.5]], boltBack: [[0, 1200, 0.07, 0.5]], boltFwd: [[0, 1500, 0.06, 0.6], [0.06, 2400, 0.03, 0.5]],
};
export function playMech(name, position = null, vol = 1) {
  const parts = CLICKS[name];
  if (!parts) return;
  sounds.custom((c, out, t, K) => {
    for (const [dt, f, len, v] of parts) {
      const n = K.noise(c); const g = c.createGain(); K.env(g, t + dt, 0.001, v, len);
      K.chain(n, K.filt(c, 'bandpass', f, 3), g, out); n.start(t + dt); n.stop(t + dt + len + 0.02);
    }
  }, position, vol);
}

export function playBrass(position) {
  sounds.custom((c, out, t) => {
    for (let i = 0; i < 3; i++) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 4200 + Math.random() * 2400;
      const g = c.createGain(); const tt = t + 0.25 + i * (0.07 + Math.random() * 0.05);
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.12 / (i + 1), tt + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.08);
      o.connect(g); g.connect(out); o.start(tt); o.stop(tt + 0.1);
    }
  }, position, 0.6);
}

export function playImpact(kind, position) {
  sounds.custom((c, out, t, K) => {
    const n = K.noise(c); const g = c.createGain();
    if (kind === 'flesh') {
      K.env(g, t, 0.002, 0.9, 0.09); K.chain(n, K.filt(c, 'lowpass', 500), g, out);
      const o = c.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.08);
      const og = c.createGain(); K.env(og, t, 0.002, 0.8, 0.08); o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.1);
    } else if (kind === 'metal') {
      K.env(g, t, 0.001, 0.5, 0.12); K.chain(n, K.filt(c, 'bandpass', 3500, 6), g, out);
    } else {
      K.env(g, t, 0.001, 0.5, 0.06); K.chain(n, K.filt(c, 'bandpass', 1100, 1.2), g, out);
    }
    n.start(t); n.stop(t + 0.2);
  }, position, 0.6);
}

export function playHitmarker(head) {
  sounds.custom((c, out, t) => {
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = head ? 1900 : 1300;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + (head ? 0.12 : 0.06));
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.15);
  }, null, 0.5);
}

export function playWhiz(position) {
  sounds.custom((c, out, t, K) => {
    const n = K.noise(c); const f = K.filt(c, 'bandpass', 3000, 4);
    f.frequency.setValueAtTime(4200, t); f.frequency.exponentialRampToValueAtTime(900, t + 0.16);
    const g = c.createGain(); K.env(g, t, 0.03, 0.5, 0.13); K.chain(n, f, g, out); n.start(t); n.stop(t + 0.2);
  }, position, 0.6);
}

// --- textures ----------------------------------------------------------------------------------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const rnd = (a, b) => a + Math.random() * (b - a);
let TEX = null;
function textures() {
  if (TEX) return TEX;
  const blob = (x, cx, cy, r, color) => { x.fillStyle = color; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); };
  const splat = () => canvasTex(256, 256, (x, w) => {
    const c = w / 2;
    for (let i = 0; i < 9; i++) blob(x, c + rnd(-30, 30), c + rnd(-30, 30), rnd(18, 42), `rgba(${rnd(95, 125) | 0},${rnd(4, 12) | 0},${rnd(6, 14) | 0},0.92)`);
    // spatter dots and streaks flung out
    for (let i = 0; i < 70; i++) {
      const a = rnd(0, Math.PI * 2), d = rnd(40, 120), r = rnd(1.5, 7) * (1 - d / 140);
      blob(x, c + Math.cos(a) * d, c + Math.sin(a) * d, Math.max(1, r), `rgba(${rnd(90, 130) | 0},8,10,${rnd(0.6, 0.95)})`);
    }
    for (let i = 0; i < 8; i++) {
      const a = rnd(0, Math.PI * 2), len = rnd(40, 110);
      x.strokeStyle = 'rgba(105,8,10,0.85)'; x.lineWidth = rnd(2, 6); x.lineCap = 'round';
      x.beginPath(); x.moveTo(c, c); x.lineTo(c + Math.cos(a) * len, c + Math.sin(a) * len); x.stroke();
    }
    // darker, wetter middle
    const g = x.createRadialGradient(c, c, 0, c, c, 40); g.addColorStop(0, 'rgba(50,0,2,0.7)'); g.addColorStop(1, 'rgba(50,0,2,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, w);
  });
  const pool = canvasTex(256, 256, (x, w) => {
    const c = w / 2;
    // an irregular puddle made of overlapping lobes
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, d = rnd(30, 60);
      blob(x, c + Math.cos(a) * d * 0.9, c + Math.sin(a) * d * 0.7, rnd(34, 58), 'rgb(92,4,8)');
    }
    blob(x, c, c, 70, 'rgb(92,4,8)');
    const g = x.createRadialGradient(c, c, 10, c, c, 110); g.addColorStop(0, 'rgba(40,0,0,0.55)'); g.addColorStop(1, 'rgba(40,0,0,0)');
    x.globalCompositeOperation = 'source-atop'; x.fillStyle = g; x.fillRect(0, 0, w, w);
    x.fillStyle = 'rgba(255,255,255,0.12)'; x.beginPath(); x.ellipse(c - 25, c - 30, 26, 10, -0.5, 0, Math.PI * 2); x.fill();
  });
  const wound = canvasTex(64, 64, (x, w) => {
    const c = w / 2;
    for (let i = 0; i < 6; i++) blob(x, c + rnd(-6, 6), c + rnd(-6, 6), rnd(7, 12), 'rgba(120,10,12,0.9)');
    for (let i = 0; i < 12; i++) { const a = rnd(0, 6.28), d = rnd(10, 26); blob(x, c + Math.cos(a) * d, c + Math.sin(a) * d, rnd(1, 3), 'rgba(120,10,12,0.8)'); }
    blob(x, c, c, 5, 'rgb(35,0,0)'); blob(x, c, c, 2.5, 'rgb(10,0,0)');
    // a run of blood downwards
    x.strokeStyle = 'rgba(110,8,10,0.85)'; x.lineWidth = 4; x.lineCap = 'round'; x.beginPath(); x.moveTo(c, c); x.lineTo(c + rnd(-3, 3), c + rnd(16, 28)); x.stroke();
  });
  const hole = canvasTex(64, 64, (x, w) => {
    const c = w / 2;
    const g = x.createRadialGradient(c, c, 2, c, c, 30); g.addColorStop(0, 'rgba(20,16,12,1)'); g.addColorStop(0.25, 'rgba(40,32,24,0.9)'); g.addColorStop(0.5, 'rgba(90,80,64,0.35)'); g.addColorStop(1, 'rgba(90,80,64,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, w);
  });
  const soft = canvasTex(64, 64, (x, w) => {
    const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, w);
  });
  const flash = canvasTex(128, 128, (x, w) => {
    const c = w / 2;
    x.translate(c, c);
    for (let i = 0; i < 7; i++) {
      x.rotate(Math.PI * 2 / 7 + rnd(-0.2, 0.2));
      const g = x.createLinearGradient(0, 0, 60, 0); g.addColorStop(0, 'rgba(255,240,190,1)'); g.addColorStop(1, 'rgba(255,140,30,0)');
      x.fillStyle = g; x.beginPath(); x.moveTo(0, -6); x.lineTo(rnd(40, 62), 0); x.lineTo(0, 6); x.fill();
    }
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 30); g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(1, 'rgba(255,160,40,0)');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, 30, 0, Math.PI * 2); x.fill();
  });
  TEX = { splats: [splat(), splat(), splat()], pool, wound, hole, soft, flash };
  return TEX;
}

// --- the effects manager -------------------------------------------------------------------------
export class Effects {
  constructor(world) {
    this.world = world;
    this.scene = world.scene;
    this.particles = [];
    this.decals = [];
    this.holes = [];
    this.corpses = [];
    this.timed = [];
    const T = textures();
    this.T = T;
    this.mats = {
      blood: new THREE.SpriteMaterial({ map: T.soft, color: 0x8c0a0c, transparent: true, depthWrite: false }),
      mist: new THREE.SpriteMaterial({ map: T.soft, color: 0x9a1212, transparent: true, opacity: 0.55, depthWrite: false }),
      dust: new THREE.SpriteMaterial({ map: T.soft, color: 0xc8b48c, transparent: true, opacity: 0.7, depthWrite: false }),
      spark: new THREE.SpriteMaterial({ map: T.soft, color: 0xffd080, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      flash: new THREE.SpriteMaterial({ map: T.flash, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      tracer: new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
    this.tracerGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 4, 1, true).rotateX(Math.PI / 2);
    // a couple of reusable lights for muzzle flashes (adding lights would recompile shaders)
    this.lights = [0, 1].map(() => { const l = new THREE.PointLight(0xffc070, 0, 18, 2); this.scene.add(l); return { l, t: 0 }; });
    this._li = 0;
    world.onUpdate((dt) => this.update(dt));
  }

  // --- generic sprite particles
  burst(mat, pos, n, { speed = [2, 8], size = [0.2, 0.5], life = [0.3, 0.8], gravity = 1, dir = null, cone = 1, grow = 0, fade = true } = {}) {
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 600) break;
      const s = new THREE.Sprite(mat.clone());
      s.position.copy(pos);
      const v = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize();
      if (dir) v.multiplyScalar(cone).add(dir).normalize();
      v.multiplyScalar(rnd(speed[0], speed[1]));
      const sz = rnd(size[0], size[1]);
      s.scale.setScalar(sz);
      this.scene.add(s);
      this.particles.push({ s, v, age: 0, life: rnd(life[0], life[1]), g: gravity, sz, grow, fade, o0: s.material.opacity });
    }
  }

  // --- decals stuck on surfaces
  decal(tex, point, normal, size, { color = 0xffffff, list = this.decals, max = 140, rough = 0.6, rot = Math.random() * Math.PI * 2, opacity = 1 } = {}) {
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: rough, metalness: 0, color, opacity });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    // floors get a little more lift: the visible road surface sits just above the ground
    m.position.copy(point).addScaledVector(normal, normal.y > 0.7 ? 0.09 : 0.025);
    m.lookAt(point.clone().add(normal));
    m.rotateZ(rot);
    m.scale.setScalar(size);
    m.receiveShadow = true;
    this.scene.add(m);
    list.push(m);
    while (list.length > max) { const o = list.shift(); this.scene.remove(o); o.material.dispose(); o.geometry.dispose(); }
    return m;
  }

  muzzleFlash(pos, dir, big = 1) {
    const s = new THREE.Sprite(this.mats.flash.clone());
    s.position.copy(pos).addScaledVector(dir, 0.3);
    s.material.rotation = Math.random() * Math.PI * 2;
    s.scale.setScalar(rnd(1.2, 1.8) * big);
    this.scene.add(s);
    this.particles.push({ s, v: new THREE.Vector3(), age: 0, life: 0.05, g: 0, sz: s.scale.x, grow: 0, fade: true, o0: 1 });
    const L = this.lights[this._li++ % this.lights.length];
    L.l.position.copy(pos); L.l.intensity = 25 * big; L.t = 0.05;
    this.burst(this.mats.dust, pos.clone().addScaledVector(dir, 0.6), 2, { speed: [1, 3], size: [0.5, 1], life: [0.3, 0.6], gravity: -0.05, dir, cone: 0.6, grow: 2 });
  }

  tracer(from, to) {
    const len = from.distanceTo(to);
    if (len < 4) return;
    const m = new THREE.Mesh(this.tracerGeo, this.mats.tracer);
    const dir = to.clone().sub(from).normalize();
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    const seg = Math.min(9, len * 0.4);
    m.scale.set(1, 1, seg);
    this.scene.add(m);
    this.timed.push({ m, from: from.clone(), dir, len, seg, d: 0, speed: 1100 });
  }

  impact(point, normal, part) {
    const metal = part && (part.userData.metal || part.name === 'Car');
    if (metal) this.burst(this.mats.spark, point, 6, { speed: [6, 16], size: [0.08, 0.15], life: [0.1, 0.25], gravity: 1, dir: normal, cone: 1.2 });
    this.burst(this.mats.dust, point, 5, { speed: [1, 5], size: [0.35, 0.8], life: [0.4, 0.9], gravity: 0.15, dir: normal, cone: 0.8, grow: 1.5 });
    this.decal(this.T.hole, point, normal, rnd(0.28, 0.38), { list: this.holes, max: 160, rough: 0.9 });
    playImpact(metal ? 'metal' : 'hard', point);
  }

  // --- blood ---------------------------------------------------------------------------------------
  /** A bullet hits a body part: spray, a wound on the part, and splatter on whatever is behind. */
  bloodHit(point, dir, limbMesh, localPoint, localNormal, heavy = false) {
    const back = dir.clone().negate();
    // exit spray and a fine mist, plus a little blow-back toward the shooter
    this.burst(this.mats.blood, point, heavy ? 34 : 20, { speed: [5, 16], size: [0.18, 0.42], life: [0.35, 0.8], gravity: 1, dir, cone: 0.55 });
    this.burst(this.mats.blood, point, heavy ? 10 : 6, { speed: [2, 6], size: [0.15, 0.3], life: [0.3, 0.6], gravity: 1, dir: back, cone: 0.8 });
    this.burst(this.mats.mist, point, heavy ? 8 : 4, { speed: [1, 4], size: [0.9, 1.6], life: [0.3, 0.6], gravity: 0.05, dir, cone: 0.8, grow: 2.2 });
    playImpact('flesh', point);
    // a wound decal on the body part itself (it stays on the body)
    if (limbMesh && localPoint) {
      const mat = new THREE.MeshStandardMaterial({ map: this.T.wound, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.3 });
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      // face the plane out of the body part, with the texture's drip running down it
      const z = localNormal.clone().normalize();
      const up = Math.abs(z.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
      const y = up.sub(z.clone().multiplyScalar(up.dot(z))).normalize();
      const x = new THREE.Vector3().crossVectors(y, z);
      w.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      w.rotateZ(rnd(-0.4, 0.4));
      w.position.copy(localPoint).addScaledVector(z, 0.012);
      w.scale.setScalar(heavy ? 0.75 : 0.55);
      limbMesh.add(w);
    }
    // splatter on the wall or ground behind the victim
    const hit = this.world.raycast(point.clone().addScaledVector(dir, 0.6), point.clone().addScaledVector(dir, heavy ? 9 : 6), { mask: GROUP.WORLD | GROUP.DYNAMIC });
    if (hit) this.decal(this.T.splats[(Math.random() * 3) | 0], hit.point, hit.normal, rnd(2.0, 3.4) * (heavy ? 1.4 : 1), { rough: 0.3 });
    // and drops on the ground below
    const down = this.world.raycast(point, point.clone().add(new THREE.Vector3(dir.x * 2, -12, dir.z * 2)), { mask: GROUP.WORLD });
    if (down) this.decal(this.T.splats[(Math.random() * 3) | 0], down.point, down.normal, rnd(0.9, 1.6), { rough: 0.3 });
  }

  /** A small drip under a wounded character. */
  drip(pos) {
    const down = this.world.raycast(pos, pos.clone().add(new THREE.Vector3(0, -8, 0)), { mask: GROUP.WORLD });
    if (down) this.decal(this.T.splats[(Math.random() * 3) | 0], down.point, down.normal, rnd(0.35, 0.6), { rough: 0.3, max: 160 });
  }

  /** Take over a dead character's rag doll so it stays (and bleeds) after respawn. */
  adoptCorpse(ch, hitLimbIndex, impulse) {
    const debris = ch.debris;
    if (!debris || !debris.length) return;
    ch.debris = [];
    const joints = ch.ragdollJoints || [];
    ch.ragdollJoints = [];
    if (impulse && debris[hitLimbIndex]) {
      const b = debris[hitLimbIndex].body;
      b.velocity.x += impulse.x; b.velocity.y += impulse.y; b.velocity.z += impulse.z;
      debris[0].body.velocity.x += impulse.x * 0.4; debris[0].body.velocity.z += impulse.z * 0.4;
    }
    const corpse = { debris, joints, age: 0, pool: null, poolSize: 0, wound: debris[hitLimbIndex] || debris[0] };
    this.corpses.push(corpse);
    while (this.corpses.length > (this.maxCorpses || 14)) this.removeCorpse(this.corpses[0]);
  }

  removeCorpse(c) {
    for (const d of c.debris) { this.scene.remove(d.mesh); this.world.physics.removeBody(d.body); }
    for (const j of c.joints) this.world.physics.removeConstraint(j);
    if (c.pool) { this.scene.remove(c.pool); c.pool.material.dispose(); }
    this.corpses = this.corpses.filter((x) => x !== c);
  }

  update(dt) {
    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) { this.scene.remove(p.s); p.s.material.dispose(); this.particles.splice(i, 1); continue; }
      p.v.y -= 196.2 * 0.25 * p.g * dt;
      p.s.position.addScaledVector(p.v, dt);
      if (p.grow) p.s.scale.setScalar(p.sz * (1 + p.grow * k));
      if (p.fade) p.s.material.opacity = p.o0 * (1 - k);
    }
    // tracers fly down the bullet's path
    for (let i = this.timed.length - 1; i >= 0; i--) {
      const t = this.timed[i];
      t.d += t.speed * dt;
      if (t.d - t.seg > t.len) { this.scene.remove(t.m); this.timed.splice(i, 1); continue; }
      const head = Math.min(t.d, t.len), tail = Math.max(0, t.d - t.seg);
      t.m.scale.z = Math.max(0.01, head - tail);
      t.m.position.copy(t.from).addScaledVector(t.dir, (head + tail) / 2);
    }
    for (const L of this.lights) { if (L.t > 0) { L.t -= dt; if (L.t <= 0) L.l.intensity = 0; } }
    // corpses: keep the meshes on their bodies, grow a pool of blood, clean up
    for (const c of [...this.corpses]) {
      c.age += dt;
      for (const d of c.debris) {
        const p = d.body.interpolatedPosition || d.body.position, q = d.body.interpolatedQuaternion || d.body.quaternion;
        d.mesh.position.set(p.x, p.y, p.z); d.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      }
      if (c.age < 4 && Math.random() < 0.5) {
        const wp = c.wound.body.position;
        this.burst(this.mats.blood, new THREE.Vector3(wp.x, wp.y + 0.3, wp.z), 1, { speed: [0.5, 2], size: [0.12, 0.22], life: [0.3, 0.6], gravity: 1 });
      }
      if (c.age > 0.8 && !c.pool) {
        const tp = c.debris[0].body.position;
        const hit = this.world.raycast(new THREE.Vector3(tp.x, tp.y + 1, tp.z), new THREE.Vector3(tp.x, tp.y - 6, tp.z), { mask: GROUP.WORLD });
        if (hit && hit.normal.y > 0.7) {
          c.pool = this.decal(this.T.pool, hit.point, hit.normal, 0.8, { list: [], max: 999, rough: 0.1 });
          c.poolMax = rnd(5.5, 7.5);
        } else c.pool = { material: { dispose() {} }, isFake: true };
      }
      if (c.pool && !c.pool.isFake && c.pool.scale.x < c.poolMax) c.pool.scale.setScalar(Math.min(c.poolMax, c.pool.scale.x + dt * 1.1 * (1 - c.pool.scale.x / c.poolMax + 0.08)));
      if (c.age > (this.corpseLife || 45)) this.removeCorpse(c);
    }
  }
}
