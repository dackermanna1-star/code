import * as THREE from 'three';
import { blockDef } from '../../shared/world/blocks';
import { pieceGeometry, type Socket } from '../../shared/sim/buildgeom';
import { tryItemDef } from '../../shared/data/items';
import { buildHeld } from './helditems';
import { blockCube } from './blockitems';
import { instantiate, shade, template } from './voxelmodel';

/**
 * Visual effects: block selection outline + crack overlay, particles
 * (block debris, blood, sparks, smoke), tracers, muzzle flashes,
 * explosions, rain/snow, first-person view model and building ghost.
 */
interface Particle {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  color: THREE.Color;
  gravity: number;
}

const MAX_PARTICLES = 3000;

export class Effects {
  readonly group = new THREE.Group();
  private outline: THREE.LineSegments;
  private crack: THREE.Mesh;
  private particles: Particle[] = [];
  private pGeo: THREE.BufferGeometry;
  private pPoints: THREE.Points;
  private tracers: Array<{ line: THREE.Line; life: number }> = [];
  private flashes: Array<{ light: THREE.PointLight; life: number }> = [];
  private rain: THREE.LineSegments;
  private snow: THREE.Points;
  private ghost = new THREE.Group();
  private ghostMats = { ok: new THREE.MeshBasicMaterial({ color: 0x40d0ff, transparent: true, opacity: 0.35, depthWrite: false }), bad: new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.35, depthWrite: false }) };
  private ghostKey = '';

  constructor() {
    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    this.outline = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }));
    this.outline.visible = false;
    this.group.add(this.outline);
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.005, 1.005, 1.005), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
    this.crack.visible = false;
    this.group.add(this.crack);

    this.pGeo = new THREE.BufferGeometry();
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    this.pGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    this.pPoints = new THREE.Points(this.pGeo, new THREE.PointsMaterial({ size: 0.12, vertexColors: true, sizeAttenuation: true }));
    this.pPoints.frustumCulled = false;
    this.group.add(this.pPoints);

    // weather volumes around the camera
    const N = 1500;
    const rp = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 50, y = Math.random() * 40, z = (Math.random() - 0.5) * 50;
      rp.set([x, y, z, x, y - 0.7, z], i * 6);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9ab0d0, transparent: true, opacity: 0.45 }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.group.add(this.rain);
    const sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) sp.set([(Math.random() - 0.5) * 50, Math.random() * 40, (Math.random() - 0.5) * 50], i * 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.85 }));
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    this.group.add(this.snow);
    this.group.add(this.ghost);
  }

  setTarget(x: number, y: number, z: number, crack: number) {
    this.outline.visible = true;
    this.outline.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.crack.visible = crack > 0;
    this.crack.position.copy(this.outline.position);
    (this.crack.material as THREE.MeshBasicMaterial).opacity = crack * 0.5;
  }

  clearTarget() {
    this.outline.visible = false;
    this.crack.visible = false;
  }

  burst(x: number, y: number, z: number, color: number | THREE.Color, n: number, speed = 3, size = 0.12, gravity = 12, life = 0.8) {
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      this.particles.push({
        p: new THREE.Vector3(x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, z + (Math.random() - 0.5) * 0.6),
        v: new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed),
        life: life * (0.5 + Math.random() * 0.5), max: life, size, color: c.clone().multiplyScalar(0.8 + Math.random() * 0.4), gravity,
      });
    }
  }

  blockBurst(x: number, y: number, z: number, blockId: number, n = 14) {
    const d = blockDef(blockId);
    this.burst(x, y, z, d.mapColor, n, 3.5);
  }

  explosion(x: number, y: number, z: number, radius: number) {
    this.burst(x, y, z, 0xffa030, 80, radius * 4, 0.25, 2, 0.5);
    this.burst(x, y, z, 0x555555, 120, radius * 2, 0.35, -1, 2.5);
    this.flash(x, y, z, 0xffa040, 12, 0.35, radius * 6);
  }

  flash(x: number, y: number, z: number, color: number, intensity: number, life: number, dist = 8) {
    const l = new THREE.PointLight(color, intensity, dist);
    l.position.set(x, y, z);
    this.group.add(l);
    this.flashes.push({ light: l, life });
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xffe6a0) {
    const g = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }));
    this.group.add(line);
    this.tracers.push({ line, life: 0.08 });
  }

  /** Building plan ghost. */
  setGhost(socket: Socket | null, ok: boolean) {
    if (!socket) {
      this.ghost.visible = false;
      return;
    }
    const key = JSON.stringify(socket) + ok;
    this.ghost.visible = true;
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    this.ghost.clear();
    const geo = pieceGeometry(socket);
    const m = ok ? this.ghostMats.ok : this.ghostMats.bad;
    const bg = new THREE.BoxGeometry(1, 1, 1);
    for (const [x, y, z] of geo.cells) {
      const b = new THREE.Mesh(bg, m);
      b.position.set(x + 0.5, y + 0.5, z + 0.5);
      this.ghost.add(b);
    }
  }

  update(dt: number, cam: THREE.Vector3, rain: number, snow: boolean) {
    // particles
    const pos = this.pGeo.getAttribute('position') as THREE.BufferAttribute;
    const col = this.pGeo.getAttribute('color') as THREE.BufferAttribute;
    let n = 0;
    const alive: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.v.y -= p.gravity * dt;
      p.v.multiplyScalar(1 - 1.5 * dt);
      p.p.addScaledVector(p.v, dt);
      pos.setXYZ(n, p.p.x, p.p.y, p.p.z);
      col.setXYZ(n, p.color.r, p.color.g, p.color.b);
      n++;
      alive.push(p);
    }
    this.particles = alive;
    this.pGeo.setDrawRange(0, n);
    pos.needsUpdate = true;
    col.needsUpdate = true;
    for (const t of this.tracers) {
      t.life -= dt;
      if (t.life <= 0) {
        this.group.remove(t.line);
        t.line.geometry.dispose();
      }
    }
    this.tracers = this.tracers.filter((t) => t.life > 0);
    for (const f of this.flashes) {
      f.life -= dt;
      f.light.intensity *= 0.8;
      if (f.life <= 0) this.group.remove(f.light);
    }
    this.flashes = this.flashes.filter((f) => f.life > 0);
    // weather
    const showRain = rain > 0.3 && !snow, showSnow = rain > 0.3 && snow;
    this.rain.visible = showRain;
    this.snow.visible = showSnow;
    const vol = showRain ? this.rain : showSnow ? this.snow : null;
    if (vol) {
      vol.position.set(cam.x, cam.y - 15, cam.z);
      const a = vol.geometry.getAttribute('position') as THREE.BufferAttribute;
      const fall = (showRain ? 28 : 2.5) * dt;
      const step = showRain ? 2 : 1;
      for (let i = 0; i < a.count; i += step) {
        let y = a.getY(i) - fall;
        if (y < 0) y += 40;
        a.setY(i, y);
        if (showRain) a.setY(i + 1, y - 0.7);
        else a.setX(i, a.getX(i) + Math.sin(y + i) * 0.01);
      }
      a.needsUpdate = true;
      (vol.material as THREE.Material).opacity = Math.min(0.85, (rain - 0.3) * 1.5);
    }
  }
}

// ------------------------------------------------------------------ first person
type V3 = [number, number, number];
type SwingStyle = 'chop' | 'thrust' | 'punch' | 'throw';

/** First-person pose of an item: grip position in camera space, rest orientation, scale. */
interface Pose {
  hand: V3;
  rot: V3;
  scale: number;
  style: SwingStyle;
  /** Aim-down-sights grip position (y from the sight line; x defaults to centred) and orientation. */
  ads?: { z: number; x?: number; y?: number; rot?: V3 };
  /** Support-hand point in item space (two-handed items). */
  forend?: V3;
  /** The left hand holds the grip and the right hand the support point (bows). */
  leftGrip?: boolean;
  /** Where the support arm reaches back to while aiming (default: its off-screen shoulder). */
  supportTo?: V3;
  /** Muzzle flash on recoil. */
  flash?: boolean;
  /** Model offset from the grip (item space, before scaling) so the hand doesn't cover small items. */
  offset?: V3;
}

const POSES: Record<string, Pose> = {
  hand: { hand: [0.31, -0.2, -0.44], rot: [0, 0, 0], scale: 1, style: 'punch' },
  item: { hand: [0.28, -0.26, -0.5], rot: [0.45, -0.55, 0.05], scale: 0.85, style: 'punch', offset: [0, 0.075, -0.03] },
  block: { hand: [0.27, -0.25, -0.52], rot: [0.45, -0.78, 0], scale: 1, style: 'punch', offset: [0, 0.03, -0.02] },
  rock: { hand: [0.29, -0.27, -0.5], rot: [0.35, -0.5, 0.1], scale: 0.5, style: 'chop', offset: [0, 0.07, -0.03] },
  tool: { hand: [0.29, -0.3, -0.52], rot: [1.05, 0.15, Math.PI / 2 - 0.2], scale: 0.72, style: 'chop' },
  torch: { hand: [0.3, -0.31, -0.52], rot: [1.3, 0.1, 0.2], scale: 0.72, style: 'chop' },
  spear: { hand: [0.27, -0.3, -0.38], rot: [0.12, 0.1, 0.0], scale: 0.7, style: 'thrust' },
  pistol: { hand: [0.22, -0.2, -0.5], rot: [0.04, -0.06, 0.05], scale: 0.9, style: 'punch', ads: { z: -0.52 }, flash: true },
  long: { hand: [0.2, -0.2, -0.44], rot: [0.03, -0.03, 0.04], scale: 0.68, style: 'punch', ads: { z: -0.27 }, forend: [0, -0.005, -0.33], flash: true },
  shotgun: { hand: [0.2, -0.2, -0.44], rot: [0.03, -0.03, 0.04], scale: 0.68, style: 'punch', ads: { z: -0.29 }, forend: [0, -0.005, -0.27], flash: true },
  crossbow: { hand: [0.2, -0.23, -0.46], rot: [0.04, -0.02, 0.04], scale: 0.66, style: 'punch', ads: { z: -0.24 }, forend: [0, 0.03, -0.3] },
  bow: { hand: [-0.17, -0.15, -0.5], rot: [0.06, -0.12, -0.3], scale: 0.56, style: 'punch', ads: { z: -0.74, x: -0.1, y: -0.07, rot: [0.02, 0.08, -0.28] }, forend: [0.024, 0, 0.16], leftGrip: true, supportTo: [0.8, -0.7, 0.05] },
  throw: { hand: [0.28, -0.25, -0.48], rot: [0.3, -0.5, 0.1], scale: 0.72, style: 'throw', offset: [0, 0.07, -0.02] },
  plan: { hand: [0.24, -0.27, -0.46], rot: [-0.55, -0.3, -0.12], scale: 0.7, style: 'punch' },
  thin: { hand: [0.27, -0.25, -0.48], rot: [0.9, -0.2, 0.6], scale: 0.9, style: 'punch' },
};

/** Item shapes whose placeable block is a textured cube (shown with the world's block textures). */
const CUBE_SHAPES = new Set(['block', 'box', 'bench', 'furnace', 'totem', 'research']);

function poseFor(shape: string): Pose {
  switch (shape) {
    case '': return POSES.hand;
    case 'block': return POSES.block;
    case 'rock': return POSES.rock;
    case 'axe': case 'pick': case 'hammer': case 'blade': return POSES.tool;
    case 'torch': return POSES.torch;
    case 'spear': return POSES.spear;
    case 'pistol': return POSES.pistol;
    case 'rifle': return POSES.long;
    case 'shotgun': return POSES.shotgun;
    case 'crossbow': return POSES.crossbow;
    case 'bow': return POSES.bow;
    case 'grenade': case 'charge': return POSES.throw;
    case 'plan': return POSES.plan;
    case 'syringe': case 'arrow': return POSES.thin;
    default: return POSES.item;
  }
}

/** Small procedural glow / star textures (no external assets). */
function radialTexture(spikes: number): THREE.DataTexture {
  const N = 32, d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (x + 0.5) / N - 0.5, dy = (y + 0.5) / N - 0.5;
    const r = Math.hypot(dx, dy) * 2;
    let a = Math.max(0, 1 - r);
    if (spikes) a = Math.max(a * a, Math.max(0, 1 - r * 1.1) * Math.pow(Math.abs(Math.cos(Math.atan2(dy, dx) * spikes * 0.5)), 6));
    else a = a * a;
    const i = (y * N + x) * 4;
    d[i] = 255; d[i + 1] = 235; d[i + 2] = 190; d[i + 3] = Math.min(255, a * 255);
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** First-person arms + held item, rendered in its own scene on top. */
export class ViewModel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  private root = new THREE.Group();
  /** Item transform (grip at origin). */
  private item = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private armR = new THREE.Group();
  private armL = new THREE.Group();
  /** Off-screen points the forearms reach back towards (camera space). */
  private shoulderR = new THREE.Vector3(0.7, -1.0, -0.05);
  private shoulderL = new THREE.Vector3(-0.55, -1.0, -0.05);
  private heldId = '';
  private pose: Pose = POSES.hand;
  private skin = 0xe0b48c;
  private swingT = 1;
  private recoil = 0;
  private bob = 0;
  private moveK = 0;
  private aimK = 0;
  private equip = 1;
  private time = 0;
  private flashT = 0;
  private flames: THREE.Object3D[] = [];
  private muzzle: THREE.Object3D | null = null;
  private forend = new THREE.Object3D();
  private flash: THREE.Mesh;
  private halo: THREE.Sprite;
  private light: THREE.DirectionalLight;
  private amb: THREE.AmbientLight;
  private glowLight = new THREE.PointLight(0xffa850, 0, 1.6, 1);
  private restQ = new THREE.Quaternion();
  private adsQ = new THREE.Quaternion();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private sightY = 0;

  constructor() {
    this.root.add(this.item, this.armR, this.armL);
    this.scene.add(this.root);
    this.setSkin(this.skin);
    this.light = new THREE.DirectionalLight(0xffffff, 1.2);
    this.light.position.set(1, 2, 1.2);
    this.amb = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(this.light, this.amb, this.glowLight);
    const fm = new THREE.MeshBasicMaterial({ map: radialTexture(6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffd080 });
    const fg = new THREE.PlaneGeometry(1, 1);
    this.flash = new THREE.Mesh(fg, fm);
    const side = new THREE.Mesh(fg, fm);
    side.rotation.y = Math.PI / 2;
    side.scale.set(1.4, 0.5, 1);
    this.flash.add(side);
    this.flash.visible = false;
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(0), color: 0xff9a40, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
    this.halo.scale.setScalar(0.32);
  }

  setHeld(id: string) {
    if (id === this.heldId) return;
    this.heldId = id;
    if (this.model) this.item.remove(this.model);
    this.model = null;
    this.flames = [];
    this.muzzle = null;
    this.flash.removeFromParent();
    this.halo.removeFromParent();
    this.forend.removeFromParent();
    const d = id ? tryItemDef(id) : undefined;
    const shape = d?.icon.shape ?? '';
    // placeable cube blocks (and cube deployables) are shown with their world textures
    let cube: THREE.Mesh | null = null;
    if (d?.placeBlock && CUBE_SHAPES.has(shape)) cube = blockCube(d.placeBlock);
    this.pose = cube ? POSES.block : poseFor(shape);
    if (cube) {
      cube.scale.setScalar(shape === 'block' ? 0.13 : 0.12);
      cube.position.y = 0.045;
      this.model = cube;
    } else if (d) {
      const m = buildHeld(d.icon.shape, d.icon.c1, d.icon.c2 ?? d.icon.c1);
      this.flames = m.userData.flames ?? [];
      this.muzzle = m.userData.muzzle ?? null;
      this.sightY = m.userData.sightY ?? 0;
      this.model = m;
    }
    if (this.model) {
      this.model.scale.multiplyScalar(this.pose.scale);
      const o = this.pose.offset;
      if (o) this.model.position.add(this.v.set(o[0], o[1], o[2]).multiplyScalar(this.pose.scale));
      this.item.add(this.model);
    }
    if (this.pose.flash && this.muzzle) this.muzzle.add(this.flash);
    if (this.flames.length) this.flames[0].add(this.halo);
    if (this.pose.forend && this.model) {
      this.forend.position.set(this.pose.forend[0], this.pose.forend[1], this.pose.forend[2]);
      this.model.add(this.forend);
    }
    this.e.set(this.pose.rot[0], this.pose.rot[1], this.pose.rot[2]);
    this.restQ.setFromEuler(this.e);
    const ar = this.pose.ads?.rot ?? [0, 0, 0];
    this.e.set(ar[0], ar[1], ar[2]);
    this.adsQ.setFromEuler(this.e);
    this.armR.visible = true;
    this.armL.visible = true;
    this.equip = 0;
    this.swingT = 1;
  }

  setSkin(color: number) {
    this.skin = color;
    const t = template(`fparm:${color.toString(16)}`, (m) => {
      // forearm reaching back from the grip (z = 0) towards the elbow; knuckles + wrist crease near the hand
      m.part('arm').box([0.082, 0.082, 0.6], [0, 0, 0.3], color, {
        d: 26,
        n: 0.04,
        f: {
          top: (p) => { for (let x = 0; x < p.w; x += 2) p.px(x, 0, shade(color, 0.82), 0); p.rows(3, 1, shade(color, 0.9)); },
          side: (p) => { p.cols(0, 1, shade(color, 0.85)); p.cols(3, 1, shade(color, 0.9)); },
          bottom: (p) => p.cols(3, 1, shade(color, 0.9)),
          front: (p) => p.border(0.85),
        },
      });
    }, 26);
    for (const arm of [this.armR, this.armL]) {
      arm.clear();
      arm.add(instantiate(t).root);
    }
  }

  doSwing() {
    this.swingT = 0;
  }

  doRecoil(amount = 1) {
    this.recoil = Math.min(1.6, this.recoil + amount);
    this.flashT = 0.06;
    this.flash.rotation.z = Math.random() * Math.PI;
  }

  update(dt: number, moving: number, brightness: number, aspect: number, aiming: boolean) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    const P = this.pose;
    this.time += dt;
    this.moveK += (moving - this.moveK) * Math.min(1, dt * 10);
    this.bob += dt * this.moveK * 8.6;
    this.aimK += ((aiming && P.ads ? 1 : 0) - this.aimK) * Math.min(1, dt * 14);
    this.equip = Math.min(1, this.equip + dt / 0.3);
    this.recoil *= Math.exp(-dt * 11);
    if (this.swingT < 1) this.swingT = Math.min(1, this.swingT + dt / (P.style === 'throw' ? 0.42 : P.style === 'thrust' ? 0.36 : 0.3));
    const aim = this.aimK, free = 1 - aim * 0.85, mk = this.moveK;
    // grip position: hip pose blended into aim-down-sights (sights on the crosshair)
    const s = this.model ? P.scale : 1;
    let hx = P.hand[0], hy = P.hand[1], hz = P.hand[2];
    if (P.ads) {
      hx += ((P.ads.x ?? 0) - hx) * aim;
      hy += ((P.ads.y ?? -this.sightY * s) - hy) * aim;
      hz += (P.ads.z - hz) * aim;
    }
    // idle sway + walk bob (figure-eight), damped while aiming
    hx += (Math.sin(this.bob) * 0.016 * mk + Math.sin(this.time * 1.1) * 0.003) * free;
    hy += (-Math.abs(Math.cos(this.bob)) * 0.014 * mk + Math.sin(this.time * 1.7) * 0.004) * free;
    // equip: raise from below
    const eq = 1 - this.equip;
    hy -= eq * eq * 0.45;
    // swing
    let rx = 0, ry = 0, rz = 0;
    const t = this.swingT;
    if (t < 1) {
      const s1 = Math.sin(Math.sqrt(t) * Math.PI), s2 = Math.sin(t * t * Math.PI), s3 = Math.sin(t * Math.PI);
      switch (P.style) {
        case 'chop':
          hx -= 0.2 * s1; hy += 0.07 * Math.sin(Math.sqrt(t) * Math.PI * 2); hz -= 0.12 * s3;
          rx -= 1.25 * s1; ry -= 0.35 * s2; rz += 0.25 * s1;
          break;
        case 'thrust':
          hz -= 0.32 * s2; hx -= 0.06 * s2; hy += 0.03 * s2;
          rx -= 0.08 * s2;
          break;
        case 'throw': {
          const back = Math.sin(Math.min(1, t * 2.2) * Math.PI) * (t < 0.45 ? 1 : 0);
          hz += 0.12 * back - 0.25 * Math.max(0, s2 - back); hy += 0.12 * back + 0.05 * s2; hx -= 0.12 * s2;
          rx += 0.6 * back - 1.1 * s2;
          break;
        }
        default:
          hx -= 0.16 * s1; hy += 0.06 * Math.sin(Math.sqrt(t) * Math.PI * 2); hz -= 0.14 * s3;
          rx -= 0.45 * s1; ry -= 0.25 * s2;
      }
    }
    // recoil: kick back + muzzle climb (less when aiming)
    const rk = this.recoil * (1 - aim * 0.45);
    hz += rk * 0.055;
    hy += rk * 0.012;
    rx += rk * 0.16;
    rz += Math.sin(this.bob) * 0.025 * mk * free;
    this.item.position.set(hx, hy, hz);
    // rest orientation (hip) -> straight ahead when aiming
    this.q.copy(this.adsQ).slerp(this.restQ, 1 - aim);
    this.e.set(rx, ry, rz);
    this.item.quaternion.setFromEuler(this.e).multiply(this.q);
    // arms: one hand closes on the grip, the other on the support point; both reach back to off-screen shoulders
    const left = !!P.leftGrip;
    const grip = left ? this.armL : this.armR, support = left ? this.armR : this.armL;
    grip.position.copy(this.item.position);
    grip.lookAt(left ? this.shoulderL : this.shoulderR);
    support.visible = !!P.forend && !!this.model;
    if (support.visible) {
      this.item.updateMatrixWorld(true);
      this.forend.getWorldPosition(this.v);
      support.position.copy(this.v);
      const sh = left ? this.shoulderR : this.shoulderL;
      if (P.supportTo) this.v2.set(P.supportTo[0], P.supportTo[1], P.supportTo[2]).lerp(sh, 1 - aim);
      else this.v2.copy(sh);
      support.lookAt(this.v2);
    }
    // flames, muzzle flash, lights
    let glow = 0;
    for (const f of this.flames) {
      const k = 1 + Math.sin(this.time * 23 + f.id) * 0.07 + Math.sin(this.time * 37.7) * 0.05;
      f.scale.set(k, k, 1 + (k - 1) * 2.5);
      glow = 1;
    }
    if (glow) this.halo.material.opacity = 0.45 + Math.sin(this.time * 19) * 0.08;
    // the flash shows for at least one frame, however low the frame rate
    this.flash.visible = this.flashT > 0 && !!this.flash.parent;
    this.flashT -= dt;
    const flashing = this.flash.visible ? 1 : 0;
    if (this.flash.visible) this.flash.scale.setScalar(0.18 + Math.random() * 0.06);
    const flick = 1 + Math.sin(this.time * 17) * 0.08 + Math.sin(this.time * 29) * 0.06;
    this.glowLight.intensity = glow * 1.1 * flick + flashing * 3;
    this.glowLight.color.setHex(flashing ? 0xffd090 : 0xffa850);
    if (glow && this.flames[0]) this.flames[0].getWorldPosition(this.glowLight.position);
    else if (flashing && this.muzzle) this.muzzle.getWorldPosition(this.glowLight.position);
    this.light.intensity = 0.4 + brightness * 0.9;
    this.amb.intensity = 0.25 + brightness * 0.45;
  }
}
