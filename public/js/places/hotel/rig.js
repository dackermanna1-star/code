// The Night Manager's body: very tall and thin in a rotting tailcoat, a
// stained white shirt and a red bow tie, arms that hang past his knees and
// end in long jointed fingers, black hair hanging lank round a porcelain
// mask with a painted grin - and a jaw behind the grin that opens. His eyes
// are pinpricks of light. Posed every frame by procedural animation: a
// limping walk, a twitching stand, sniffing, peering, the scream, and a
// gallop on all fours that's worse than all of them.
import * as THREE from 'three';
import { H } from './state.js';
import * as T from './textures.js';

const PI = Math.PI;
const G = () => new THREE.Group();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const _l = new THREE.Vector3(), _e = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3();

let MATS = null, MATS_M = null;
function mats() {
  if (MATS && MATS_M === H.M) return MATS;
  MATS_M = H.M;
  const env = H.M?.chrome?.envMap || null;
  // the shirt front's UVs are its shape's coordinates: fit the stained shirt to them
  const shirtMap = T.shirtBlood(); shirtMap.repeat.set(1 / 0.64, 1 / 1.62); shirtMap.offset.set(0.5, 0.2 / 1.62);
  MATS = {
    coat: new THREE.MeshStandardMaterial({ map: T.fabric('coat', '#141418', 61, { weave: true }), color: 0x6a6a72, roughness: 0.7, metalness: 0.05 }),
    shirt: new THREE.MeshStandardMaterial({ map: shirtMap, roughness: 0.8 }),
    tie: new THREE.MeshStandardMaterial({ color: 0x4a0508, roughness: 0.5 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xc4bdb0, roughness: 0.45 }),
    nail: new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: 0.3 }),
    // (the porcelain is old and greyed: pure white would burn out in the flashlight and hide the cracks)
    mask: new THREE.MeshStandardMaterial({ map: T.maskTexture(), color: 0xc8c0b4, roughness: 0.3, metalness: 0, envMap: env, envMapIntensity: 0.35 }),
    hairCap: new THREE.MeshStandardMaterial({ color: 0x070606, roughness: 0.6 }),
    hair: new THREE.MeshStandardMaterial({ color: 0x0b0908, roughness: 0.42, side: THREE.DoubleSide, alphaMap: T.hairStrands(), alphaTest: 0.4 }),
    teeth: new THREE.MeshStandardMaterial({ color: 0xc4b48c, roughness: 0.3 }),
    teethBad: new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.5 }),
    gum: new THREE.MeshStandardMaterial({ color: 0x3a0505, roughness: 0.22 }),
    void: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    eye: new THREE.MeshStandardMaterial({ map: T.eyeball(), roughness: 0.06, metalness: 0, emissive: 0xffffff, emissiveMap: T.eyeshine(), emissiveIntensity: 0.1, envMap: env, envMapIntensity: 0.8 }),
    shine: new THREE.SpriteMaterial({ map: T.glowDot(), color: 0xffd890, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }),
    brass: H.M?.brass || new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 0.9, roughness: 0.35 }),
    shoe: new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 0.25, metalness: 0.1 }),
  };
  return MATS;
}
function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
/** A limb segment: a tapered cylinder hanging down (-y) from its joint. */
const seg = (r0, r1, len, mat, parent, sx = 1, sz = 1) => { const g = new THREE.CylinderGeometry(r0, r1, len, 9).translate(0, -len / 2, 0); g.scale(sx, 1, sz); return mesh(g, mat, parent); };

/** The face: a curved shell with the porcelain mask texture, split along the mouth so the jaw can drop. */
function maskGeo(v0, v1, w = 1.28, h = 1.6) {
  const g = new THREE.PlaneGeometry(w, h * (v1 - v0) / 0.976, 14, 10);
  const P = g.attributes.position, U = g.attributes.uv;
  const yMid = -h / 2 + ((v0 + v1) / 2 - 0.012) / 0.976 * h;
  for (let i = 0; i < P.count; i++) {
    const u = U.getX(i), vv = U.getY(i);
    const x = P.getX(i), y = P.getY(i) + yMid;
    // bulge: a mask is curved round the face, the nose and brow stand out a little
    const z = -(x * x) * 0.62 - (y * y) * 0.2 + Math.exp(-(x * x) * 30 - (y + 0.05) * (y + 0.05) * 9) * 0.07;
    P.setXYZ(i, x, y, z);
    U.setXY(i, 0.11 + u * 0.78, v0 + vv * (v1 - v0));
  }
  g.computeVertexNormals();
  return g;
}

export class Rig {
  constructor(o = {}) {
    const m = mats();
    this.root = G(); this.root.name = 'NightManager';
    const R = this.root;
    this.hips = G(); this.hips.position.y = 5.2; R.add(this.hips);
    this.spine = G(); this.hips.add(this.spine);
    this.chest = G(); this.chest.position.y = 1.7; this.spine.add(this.chest);
    this.neck = G(); this.neck.position.set(0, 1.55, 0.05); this.chest.add(this.neck);
    this.head = G(); this.head.position.set(0, 0.75, 0.05); this.neck.add(this.head);
    this.jaw = G(); this.jaw.position.set(0, -0.12, -0.1); this.head.add(this.jaw);
    // waist and torso: the tailcoat
    mesh(new THREE.CylinderGeometry(0.62, 0.7, 1.1, 10).scale(1.15, 1, 0.75), m.coat, this.hips, 0, 0.1, 0);
    mesh(new THREE.CylinderGeometry(0.72, 0.6, 1.8, 10).translate(0, 0.9, 0).scale(1.1, 1, 0.68), m.coat, this.spine);
    mesh(new THREE.CylinderGeometry(0.98, 0.74, 1.65, 10).translate(0, 0.65, 0).scale(1.0, 1, 0.62), m.coat, this.chest);
    mesh(new THREE.SphereGeometry(0.62, 10, 6, 0, PI * 2, 0, PI / 2).scale(1.6, 0.5, 0.75), m.coat, this.chest, 0, 1.45, 0);
    // shirt front, bow tie, lapels, the badge
    const shirt = new THREE.Shape(); shirt.moveTo(-0.32, 1.42); shirt.lineTo(0.32, 1.42); shirt.lineTo(0.05, -0.2); shirt.lineTo(-0.05, -0.2);
    mesh(new THREE.ShapeGeometry(shirt), m.shirt, this.chest, 0, 0, 0.47);
    mesh(new THREE.ShapeGeometry(shirt).scale(0.9, 1.15, 1), m.shirt, this.spine, 0, 0.5, 0.5).visible = false;
    for (const s of [-1, 1]) { mesh(new THREE.ConeGeometry(0.16, 0.36, 4).rotateZ(s * PI / 2), m.tie, this.chest, s * 0.15, 1.38, 0.52); mesh(new THREE.BoxGeometry(0.3, 1.6, 0.06).rotateZ(s * -0.32), m.coat, this.chest, s * 0.3, 0.75, 0.5); }
    mesh(new THREE.SphereGeometry(0.06, 6, 4), m.tie, this.chest, 0, 1.38, 0.55);
    mesh(new THREE.BoxGeometry(0.38, 0.16, 0.04), m.brass, this.chest, -0.48, 0.95, 0.47);
    for (let i = 0; i < 3; i++) mesh(new THREE.SphereGeometry(0.05, 6, 4), m.brass, this.spine, 0.18, 0.4 + i * 0.45, 0.5);
    // the tails of the coat
    this.tails = [];
    for (const s of [-1, 1]) {
      const p = G(); p.position.set(s * 0.32, -0.05, -0.45); this.hips.add(p);
      mesh(new THREE.BoxGeometry(0.55, 3.4, 0.06).translate(0, -1.7, 0), m.coat, p);
      this.tails.push(p);
    }
    // neck, head: hair behind and round the mask
    mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.0, 8).translate(0, 0.45, 0), m.skin, this.neck);
    mesh(new THREE.SphereGeometry(0.68, 14, 10).scale(0.95, 1.15, 0.98), m.hairCap, this.head, 0, 0.12, -0.12);
    // lank black hair: hanks of greasy strands all round, hanging past his shoulders
    this.strands = [];
    const hr = T.rng(12);
    for (let i = 0; i < 18; i++) {
      const a = PI * 0.22 + (i / 17) * PI * 1.56, p = G();
      p.position.set(Math.cos(a) * 0.6, 0.6, Math.sin(a) * 0.55 - 0.12); p.rotation.y = -a + PI / 2;
      this.head.add(p);
      const len = 1.5 + hr() * 1.6;
      const h = mesh(new THREE.PlaneGeometry(0.42, len).translate(0, -len / 2, 0), m.hair, p); h.rotation.y = (i % 2 ? 0.4 : -0.4); h.castShadow = false;
      this.strands.push({ p, a, ph: hr() * 6 });
    }
    // hanks hanging down in front of the mask's edges, framing it
    for (const [x0, len, rz] of [[-0.64, 1.9, 0.1], [-0.55, 1.5, 0.06], [-0.48, 1.1, -0.02], [0.49, 1.3, -0.05], [0.57, 1.8, -0.12], [0.65, 1.6, -0.1]]) {
      const p = G(); p.position.set(x0, 0.82, 0.65 - x0 * x0 * 0.62); p.rotation.set(-0.1, 0, rz); this.head.add(p);
      const h = mesh(new THREE.PlaneGeometry(0.2, len).translate(0, -len / 2, 0), m.hair, p); h.rotation.y = x0 < 0 ? 0.35 : -0.35; h.castShadow = false;
      this.strands.push({ p, a: 0, ph: hr() * 6, front: true });
    }
    // the mask (upper face on the head, the chin on the jaw)
    mesh(maskGeo(0.305, 0.988), m.mask, this.head, 0, 0.12, 0.62).castShadow = false;
    const chin = mesh(maskGeo(0.012, 0.305), m.mask, this.jaw, 0, 0.24, 0.72); chin.castShadow = false;
    // behind the grin: a black mouth, gums and long teeth
    mesh(new THREE.SphereGeometry(0.42, 10, 8).scale(1.2, 0.8, 0.7), m.void, this.head, 0, -0.22, 0.24);
    // too many teeth, crooked, some of them rotten, some missing
    const tr = T.rng(5);
    for (let i = -6; i <= 6; i++) {
      const x = i * 0.065 + (tr() - 0.5) * 0.016, zc = 0.5 - x * x * 0.6;
      if (i !== -4 && i !== 3) { const u = mesh(new THREE.ConeGeometry(0.024 + tr() * 0.016, 0.13 + tr() * 0.16, 5).rotateX(PI), tr() < 0.25 ? m.teethBad : m.teeth, this.head, x, -0.27, zc); u.rotation.set((tr() - 0.5) * 0.35, 0, (tr() - 0.5) * 0.4); }
      if (i !== 5) { const d = mesh(new THREE.ConeGeometry(0.024 + tr() * 0.016, 0.11 + tr() * 0.14, 5), tr() < 0.25 ? m.teethBad : m.teeth, this.jaw, x, -0.2, zc + 0.08); d.rotation.set((tr() - 0.5) * 0.35, 0, (tr() - 0.5) * 0.4); }
    }
    mesh(new THREE.BoxGeometry(0.9, 0.06, 0.3), m.gum, this.head, 0, -0.18, 0.36);
    mesh(new THREE.BoxGeometry(0.85, 0.06, 0.3), m.gum, this.jaw, 0, -0.27, 0.44);
    // the eyes: real ones, wet and bloodshot, behind the mask's eyeholes - they follow you - and they shine in a torch beam
    this.eyes = []; this.shines = [];
    this.eyeMat = m.eye.clone(); this.shineMat = m.shine.clone();
    for (const s of [-1, 1]) {
      const e = G(); e.position.set(s * 0.3, 0.335, 0.497); this.head.add(e);
      mesh(new THREE.SphereGeometry(0.1, 16, 12), this.eyeMat, e).castShadow = false;
      this.eyes.push(e);
      const sp = new THREE.Sprite(this.shineMat); sp.position.set(s * 0.3, 0.335, 0.62); sp.scale.setScalar(0.34); this.head.add(sp); this.shines.push(sp);
    }
    // arms: shoulder, elbow, wrist; long fingers
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = G(); sh.position.set(s * 1.12, 1.3, 0); this.chest.add(sh);
      mesh(new THREE.SphereGeometry(0.34, 8, 6), m.coat, sh);
      seg(0.27, 0.2, 2.6, m.coat, sh);
      const el = G(); el.position.y = -2.6; sh.add(el);
      seg(0.21, 0.16, 2.45, m.coat, el);
      mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.18, 8), m.shirt, el, 0, -2.38, 0);
      const wr = G(); wr.position.y = -2.5; el.add(wr);
      mesh(new THREE.BoxGeometry(0.4, 0.62, 0.14).translate(0, -0.3, 0), m.skin, wr);
      const fingers = [];
      for (let f = 0; f < 5; f++) {
        const thumb = f === 4;
        let p = G();
        p.position.set(thumb ? s * -0.22 : -0.15 + f * 0.1, thumb ? -0.2 : -0.6, thumb ? 0.06 : 0);
        if (thumb) p.rotation.z = s * -0.6;
        wr.add(p);
        const joints = [];
        const lens = thumb ? [0.32, 0.28] : [0.48, 0.38, 0.32].map((l) => l * (f === 1 || f === 2 ? 1.12 : 1));
        lens.forEach((l, j) => {
          seg(0.045 - j * 0.008, 0.038 - j * 0.008, l, m.skin, p);
          if (j === lens.length - 1) mesh(new THREE.ConeGeometry(0.03, 0.12, 4).rotateX(PI).translate(0, -l - 0.04, 0), m.nail, p);
          joints.push(p);
          const nx = G(); nx.position.y = -l; p.add(nx); p = nx;
        });
        fingers.push({ joints, thumb });
      }
      this.arms.push({ s, sh, el, wr, fingers });
    }
    // legs
    this.legs = [];
    for (const s of [-1, 1]) {
      const hp = G(); hp.position.set(s * 0.5, -0.2, 0); this.hips.add(hp);
      seg(0.34, 0.25, 2.65, m.coat, hp);
      const kn = G(); kn.position.y = -2.65; hp.add(kn);
      seg(0.24, 0.17, 2.5, m.coat, kn);
      const an = G(); an.position.y = -2.5; kn.add(an);
      mesh(new THREE.BoxGeometry(0.42, 0.32, 1.25).translate(0, -0.12, 0.28), m.shoe, an);
      mesh(new THREE.ConeGeometry(0.2, 0.5, 4).rotateX(PI / 2).rotateZ(PI / 4).scale(1, 0.7, 1), m.shoe, an, 0, -0.15, 1.05);
      this.legs.push({ s, hp, kn, an });
    }
    // his keys, on a ring at his hip
    const kr = G(); kr.position.set(0.85, -0.3, 0.2); this.hips.add(kr);
    mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 14), m.brass, kr);
    for (let i = 0; i < 6; i++) { const k = mesh(new THREE.BoxGeometry(0.05, 0.42, 0.02).translate(0, -0.21, 0), m.brass, kr, Math.cos(i) * 0.15, -0.2, Math.sin(i) * 0.05); k.rotation.z = (i - 2.5) * 0.15; }
    this.keyring = kr;
    this.root.traverse((o) => { if (o.isMesh) o.frustumCulled = true; });
    // animation state
    this.t = Math.random() * 10; this.phase = 0; this.tw = { t: 0, roll: 0, yaw: 0, target: { roll: 0, yaw: 0 } };
    this.p = { gait: 'stand', speed: 0, hunch: 0.5, jaw: 0, reach: 0, spread: 0, crouch: 0, headYaw: 0, headPitch: 0, headRoll: 0.15, sniff: 0, lean: 0, shake: 0 };
    this.cur = { ...this.p, crawl: 0 };
    if (o.scale) this.root.scale.setScalar(o.scale);
  }

  /** Pose the body for this frame. p: what he's doing (smoothly blended). */
  update(dt, p) {
    Object.assign(this.p, p);
    const c = this.cur, q = this.p, k = Math.min(1, dt * 7);
    for (const key of ['speed', 'hunch', 'jaw', 'reach', 'spread', 'crouch', 'headYaw', 'headPitch', 'headRoll', 'sniff', 'lean', 'shake']) c[key] = lerp(c[key], q[key], key === 'jaw' || key === 'shake' ? Math.min(1, dt * 14) : k);
    c.crawl = lerp(c.crawl, q.gait === 'crawl' ? 1 : 0, Math.min(1, dt * 5));
    this.t += dt;
    const t = this.t, cr = c.crawl, up = 1 - cr;
    // the gait's phase moves with the distance walked
    const stride = q.gait === 'crawl' ? 7.5 : 5.2;
    this.phase += (q.moved || 0) / stride * PI * 2;
    const ph = this.phase, moving = Math.min(1, c.speed);
    // twitches: now and then the head snaps to a new angle
    const tw = this.tw; tw.t -= dt;
    if (tw.t <= 0) { tw.t = 0.6 + Math.random() * (q.gait === 'crawl' ? 0.8 : 2.6); tw.target = Math.random() < 0.55 ? { roll: (Math.random() - 0.5) * 1.1, yaw: (Math.random() - 0.5) * 0.7 } : { roll: 0, yaw: 0 }; }
    tw.roll = lerp(tw.roll, tw.target.roll, Math.min(1, dt * 22)); tw.yaw = lerp(tw.yaw, tw.target.yaw, Math.min(1, dt * 22));
    const sh = c.shake * (Math.random() - 0.5);

    // --- upright: the limping walk -------------------------------------------------------------------------------------------
    const L = this.legs[0], Rl = this.legs[1];
    const walkL = Math.sin(ph), walkR = Math.sin(ph + PI);
    const limp = Math.max(0, Math.sin(ph + PI * 0.5)); // weight on the bad (right) leg: he sags
    let hipY = 5.2 - c.crouch * 2.4 - moving * (Math.abs(Math.sin(ph)) * 0.18 + limp * 0.32) * up;
    const uprightHip = { L: walkL * 0.55 * moving, R: walkR * 0.28 * moving };
    const uprightKnee = { L: Math.max(0, Math.cos(ph)) * 0.95 * moving, R: Math.max(0, Math.cos(ph + PI)) * 0.4 * moving };
    // --- on all fours: a bounding gallop ---------------------------------------------------------------------------------------
    const g = ph, front = Math.sin(g), back = Math.sin(g + PI * 0.9);
    const crawlHip = -1.15 + back * 0.75, crawlKnee = 1.6 + Math.max(0, -back) * 0.6;
    hipY = lerp(hipY, 4.3 + Math.abs(Math.sin(g)) * 0.55, cr);
    this.hips.position.y = hipY;
    this.hips.position.z = cr * -1.2;
    this.hips.rotation.set(cr * 0.15, 0, (Math.sin(ph) * 0.07 - limp * 0.08) * moving * up + sh * 0.05);
    const crouchBend = c.crouch * 1.1;
    for (const [leg, side] of [[L, 'L'], [Rl, 'R']]) {
      const hipP = lerp(-uprightHip[side] - crouchBend, crawlHip + (side === 'R' ? 0.25 : 0), cr);
      const kneeP = lerp(uprightKnee[side] + crouchBend * 1.9, crawlKnee, cr);
      leg.hp.rotation.set(hipP, 0, leg.s * (0.05 + cr * 0.12));
      leg.kn.rotation.x = kneeP;
      leg.an.rotation.x = lerp(-kneeP * 0.35 + crouchBend * 0.2, -0.6, cr);
    }
    // the right foot drags along the floor
    Rl.an.rotation.x += moving * up * 0.25;
    // spine and chest: hunched forward; flat out when crawling
    const hunch = lerp(c.hunch + c.lean * 0.7 + c.crouch * 0.35, 1.32, cr);
    this.spine.rotation.set(hunch * 0.62 + c.sniff * Math.sin(t * 18) * 0.04, Math.sin(ph) * 0.08 * moving * up, Math.sin(ph) * 0.05 * moving * up);
    this.chest.rotation.set(hunch * 0.42, 0, 0);
    // the head: looking, tilting, twitching; it stays up to watch you while he runs
    const headUp = cr * -0.18;
    this.neck.rotation.set(-hunch * 0.55 + headUp * 0.6 + c.headPitch * 0.4, c.headYaw * 0.4, 0);
    this.head.rotation.set(-hunch * 0.45 + headUp * 0.5 + c.headPitch * 0.6 + c.sniff * Math.sin(t * 22) * 0.12 + sh * 0.3, c.headYaw * 0.6 + tw.yaw + sh * 0.4, c.headRoll + tw.roll * (1 - c.jaw * 0.5) + sh * 0.5);
    this.jaw.rotation.x = c.jaw * 1.05 + (c.jaw > 0.2 ? Math.sin(t * 40) * 0.05 * c.jaw : 0);
    // arms: hanging and swinging; reaching; spread for the scream; planted in front when crawling
    for (const a of this.arms) {
      const sgn = a.s;
      const swing = (sgn < 0 ? -Math.sin(ph - 0.7) : Math.sin(ph - 0.7)) * 0.28 * moving * up;
      const hangP = swing - c.reach * 1.45 - hunch * 0.3;
      const crawlP = -1.25 - hunch * 0.42 + front * 0.85 + (sgn > 0 ? 0.12 : 0);
      a.sh.rotation.set(lerp(hangP, crawlP, cr), lerp(sgn * -0.25 * c.spread, 0, cr), lerp(sgn * (0.08 + c.spread * 1.25 + c.reach * 0.05), sgn * 0.2, cr));
      a.el.rotation.x = lerp(-0.12 - c.reach * 0.25 + Math.sin(t * 1.3 + sgn) * 0.04, -0.15 + Math.max(0, -front) * 0.5, cr);
      a.wr.rotation.x = lerp(0.2 + Math.sin(t * 2.1 + sgn) * 0.08, 0.9, cr);
      // fingers curl and twitch
      a.fingers.forEach((f, i) => {
        const curl = (f.thumb ? 0.3 : 0.25) + Math.max(0, Math.sin(t * (2.3 + i * 0.7) + i * 1.7)) * 0.25 - c.reach * 0.2 - c.spread * 0.15 + cr * 0.2;
        f.joints.forEach((j, n) => { j.rotation.x = curl * (1 + n * 0.4); });
      });
    }
    // the coat tails and the hair swing behind him
    for (const tl of this.tails) tl.rotation.x = lerp(-0.08 - moving * 0.25 + Math.sin(ph * 2) * 0.06 * moving, -1.0 + Math.sin(g * 2) * 0.25, cr);
    for (const s of this.strands) { if (s.front) { s.p.rotation.x = -0.12 + Math.sin(t * 1.4 + s.ph) * 0.04 - cr * 0.3; continue; } s.p.rotation.x = 0.1 + Math.sin(t * 1.1 + s.ph) * 0.06 + moving * 0.25 + cr * 0.8; s.p.rotation.z = Math.sin(t * 1.1 + s.ph) * 0.05; }
    this.keyring.rotation.z = Math.sin(ph * 2) * 0.3 * moving;
    this.keyring.rotation.x = Math.sin(ph) * 0.2 * moving;
    if (q.look) this._eyes(q.look);
  }
  /** His eyes turn to find you, wherever his head is pointing; in your beam they shine like an animal's. */
  _eyes(look) {
    this.head.updateWorldMatrix(true, false);
    _l.copy(look); this.head.worldToLocal(_l);
    for (const e of this.eyes) {
      const dx = _l.x - e.position.x, dy = _l.y - e.position.y, dz = _l.z - e.position.z;
      e.rotation.set(clamp(Math.atan2(-dy, Math.hypot(dx, dz)), -0.45, 0.45), clamp(Math.atan2(dx, dz), -0.55, 0.55), 0);
    }
    const P = H.player;
    _e.setFromMatrixPosition(this.head.matrixWorld);
    _d.copy(look).sub(_e); const dist = _d.length(); _d.divideScalar(dist || 1);
    this.head.getWorldDirection(_f);
    let s = 0.16;
    if (P?.flashOn && P.camDir) s += smooth(0.9, 0.985, -_d.dot(P.camDir)) * clamp(1.5 - dist / 50, 0, 1) * 1.3;
    s *= smooth(0.1, 0.55, _f.dot(_d)) * clamp((dist - 1.6) / 6, 0.1, 1);
    this.shineMat.opacity = s;
    this.eyeMat.emissiveIntensity = 0.04 + s * 1.5;
  }
  /** World positions of his eyes and head. */
  headWorld(v = new THREE.Vector3()) { this.head.updateWorldMatrix(true, false); return v.setFromMatrixPosition(this.head.matrixWorld).add(new THREE.Vector3(0, 0.1, 0)); }
}
