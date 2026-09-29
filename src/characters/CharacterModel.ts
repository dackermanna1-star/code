import * as THREE from 'three';
import { Geo } from '../world/Builder';
import { Appearance } from './Appearance';
import { Face } from './Face';
import { canvasTexture, FONT_DISPLAY } from '../render/CanvasTex';
import { Noise } from '../core/math';

const noise = new Noise(77);
const patternCache = new Map<string, THREE.Texture>();

function patternTexture(pattern: string, c1: string, c2: string, badge?: string): THREE.Texture | null {
  if (pattern === 'none' && !badge) return null;
  const key = `${pattern}_${c1}_${c2}_${badge ?? ''}`;
  const hit = patternCache.get(key);
  if (hit) return hit;
  const t = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = c2;
    switch (pattern) {
      case 'stripes':
        for (let x = 0; x < w; x += 32) ctx.fillRect(x, 0, 14, h);
        break;
      case 'hstripes':
        for (let y = 0; y < h; y += 28) ctx.fillRect(0, y, w, 12);
        break;
      case 'dots':
        for (let y = 0; y < h; y += 32)
          for (let x = (y / 32) % 2 ? 16 : 0; x < w; x += 32) {
            ctx.beginPath();
            ctx.arc(x + 8, y + 8, 6, 0, Math.PI * 2);
            ctx.fill();
          }
        break;
      case 'plaid':
        ctx.globalAlpha = 0.55;
        for (let x = 0; x < w; x += 64) ctx.fillRect(x, 0, 22, h);
        for (let y = 0; y < h; y += 64) ctx.fillRect(0, y, w, 22);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#ffffff';
        for (let x = 30; x < w; x += 64) ctx.fillRect(x, 0, 3, h);
        for (let y = 30; y < h; y += 64) ctx.fillRect(0, y, w, 3);
        break;
      case 'star':
      case 'logo': {
        // front print sits around u = 0.25 (lathe front)
        ctx.save();
        ctx.translate(w * 0.25, h * 0.62);
        ctx.scale(0.5, 1);
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 16 : 36;
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
    }
    if (badge) {
      ctx.save();
      ctx.translate(w * 0.25, h * 0.6);
      ctx.scale(0.45, 1);
      ctx.fillStyle = c2;
      ctx.font = `700 70px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badge, 0, 0);
      ctx.restore();
    }
  });
  patternCache.set(key, t);
  return t;
}

export interface Rig {
  root: THREE.Group;
  pelvis: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  handL: THREE.Group;
  handR: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  footL: THREE.Group;
  footR: THREE.Group;
  hatGroup: THREE.Group;
}

export interface BodyDims {
  hipY: number;
  thigh: number;
  shin: number;
  torso: number;
  upperArm: number;
  forearm: number;
  shoulderX: number;
  headR: number;
  seatDrop: number;
}

export class CharacterModel {
  readonly rig: Rig;
  readonly face: Face;
  readonly dims: BodyDims;
  readonly materials: THREE.Material[] = [];
  readonly holdL = new THREE.Group();
  frontZ: (y: number) => number = () => 0.1;
  readonly holdR = new THREE.Group();

  constructor(readonly app: Appearance) {
    const kid = !!app.kid;
    const hs = app.height * (kid ? 0.74 : 1);
    const ws = app.width;
    const headR = 0.178 * (kid ? 0.97 : 1);
    const dims: BodyDims = {
      thigh: 0.33 * hs,
      shin: 0.31 * hs,
      torso: 0.47 * hs * (kid ? 0.9 : 1),
      upperArm: 0.27 * hs,
      forearm: 0.25 * hs,
      shoulderX: 0.175 * ws * (kid ? 0.85 : 1),
      headR,
      hipY: 0,
      seatDrop: 0,
    };
    dims.hipY = dims.thigh + dims.shin + 0.06;
    this.dims = dims;

    // ---------------------------------------------------------------- materials
    const skinCol = new THREE.Color(app.skin);
    const skin = new THREE.MeshPhysicalMaterial({
      color: skinCol,
      roughness: 0.55,
      sheen: 0.5,
      sheenRoughness: 0.5,
      sheenColor: skinCol.clone().lerp(new THREE.Color(0xff8870), 0.35),
    });
    const hair = new THREE.MeshPhysicalMaterial({ color: app.hairColor, roughness: 0.5, sheen: 0.8, sheenRoughness: 0.35, sheenColor: new THREE.Color(app.hairColor).offsetHSL(0, 0, 0.25) });
    const topTex = patternTexture(app.pattern, app.topColor, app.topColor2, app.badge);
    const fabric = (color: string, map: THREE.Texture | null = null) =>
      new THREE.MeshPhysicalMaterial({ color: map ? 0xffffff : color, map, roughness: 0.78, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color(color).offsetHSL(0, -0.1, 0.2) });
    const top = fabric(app.topColor, topTex);
    const top2 = fabric(app.topColor2);
    const bottom = fabric(app.bottomColor);
    const shoe = new THREE.MeshPhysicalMaterial({ color: app.shoeColor, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.3 });
    const sole = new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.7 });
    const hatMat = new THREE.MeshPhysicalMaterial({ color: app.hatColor, roughness: 0.6, sheen: 0.5, sheenColor: new THREE.Color(app.hatColor).offsetHSL(0, 0, 0.2) });
    this.materials.push(skin, hair, top, top2, bottom, shoe, sole, hatMat);

    const sleeveLong = ['longsleeve', 'jacket', 'hoodie', 'suit', 'labcoat', 'sweater', 'uniform'].includes(app.top);
    const sleeveNone = app.top === 'tank' || app.top === 'dress';
    const armUpperMat = sleeveNone ? skin : app.top === 'jacket' || app.top === 'suit' || app.top === 'labcoat' ? top2 : top;
    const armLowerMat = sleeveLong ? armUpperMat : skin;

    // ---------------------------------------------------------------- rig
    const G = () => new THREE.Group();
    const rig: Rig = {
      root: G(), pelvis: G(), spine: G(), chest: G(), neck: G(), head: G(),
      shoulderL: G(), shoulderR: G(), elbowL: G(), elbowR: G(), handL: G(), handR: G(),
      hipL: G(), hipR: G(), kneeL: G(), kneeR: G(), footL: G(), footR: G(), hatGroup: G(),
    };
 this.rig = rig;
    for (const k of Object.keys(rig) as (keyof Rig)[]) rig[k].rotation.order = 'YXZ';
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    rig.root.add(rig.pelvis);
    rig.pelvis.position.y = dims.hipY;
    rig.pelvis.add(rig.spine);
    rig.spine.add(rig.chest);
    rig.chest.position.y = dims.torso * 0.45;

    // ---- torso (lathe)
    const tw = 0.165 * ws * (kid ? 0.85 : 1);
    const T = dims.torso;
    const belly = app.belly;
    const prof: [number, number][] = [
      [0.0, -0.05],
      [tw * 0.88, -0.045],
      [tw * 0.97, 0.0],
      [tw * (0.93 + belly * 0.12), T * 0.18],
      [tw * (0.88 + belly * 0.2), T * 0.38],
      [tw * (0.93 + belly * 0.1), T * 0.6],
      [tw * 1.0, T * 0.78],
      [tw * 0.95, T * 0.9],
      [tw * 0.7, T * 0.98],
      [0.07, T * 1.0],
      [0.0, T * 1.01],
    ];
    const torsoGeo = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 28);
    {
      const p = torsoGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i);
        let z = p.getZ(i);
        const y = p.getY(i);
        z *= 0.7;
        // belly forward
        const bf = belly * 0.07 * Math.exp(-(((y - T * 0.35) / (T * 0.22)) ** 2));
        if (z > 0) z += bf * (z / (tw * 0.7));
        // shoulders are wider than deep; chest slightly forward
        x *= 1.0 + 0.08 * THREE.MathUtils.smoothstep(y, T * 0.6, T * 0.85);
        p.setXYZ(i, x, y, z);
      }
      torsoGeo.computeVertexNormals();
    }
    const torsoMat = top;
    // front surface depth of the torso at height y (for placing details flush)
    this.frontZ = (y: number) => {
      for (let i = 0; i < prof.length - 1; i++) {
        const [r0, y0] = prof[i];
        const [r1, y1] = prof[i + 1];
        if (y >= y0 && y <= y1) {
          const r = r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-5, y1 - y0);
          const bf = belly * 0.07 * Math.exp(-(((y - T * 0.35) / (T * 0.22)) ** 2));
          return r * 0.7 + bf;
        }
      }
      return tw * 0.6;
    };
    const torso = mesh(torsoGeo, torsoMat, rig.spine, 0, 0, 0);
    torso.name = 'torso';

    // pants/hips section
    const hipsGeo = Geo.capsule(tw * 0.92, 0.04, 6, 20);
    const hipsMesh = mesh(hipsGeo, app.top === 'dress' ? top : bottom, rig.pelvis, 0, -0.03, 0);
    hipsMesh.scale.set(1.02, 1.0, 0.72);

    // ---- clothing details
    this.addTopDetails(app, rig, dims, tw, { skin, top, top2, bottom }, mesh);

    // ---- neck + head
    rig.chest.add(rig.neck);
    rig.neck.position.y = T * 0.55;
    mesh(Geo.cyl(0.056, 0.064, 0.08, 14), skin, rig.neck, 0, 0.0, 0);
    rig.neck.add(rig.head);
    rig.head.position.y = 0.035 + headR * 0.86;
    const headMesh = mesh(Geo.sphere(headR, 36, 28), skin, rig.head);
    headMesh.scale.set(1.0, 1.02, 0.97);
    // cheeks/jaw fullness
    const jaw = mesh(Geo.sphere(headR * 0.82, 24, 16), skin, rig.head, 0, -headR * 0.3, headR * 0.1);
    jaw.scale.set(1.0, 0.8, 0.95);
    // ears
    for (const s of [1, -1]) {
      const ear = mesh(Geo.sphere(1, 12, 10), skin, rig.head, s * headR * 0.97, -0.005, -0.005);
      ear.scale.set(0.018, 0.034, 0.026);
      if (app.earrings) {
        const er = mesh(Geo.sphere(0.009, 10, 8), new THREE.MeshStandardMaterial({ color: app.earrings, roughness: 0.2, metalness: 1 }), rig.head, s * headR * 0.99, -0.045, 0.004);
        void er;
      }
    }
    this.face = new Face(app, skin, hair, headR);
    rig.head.add(this.face.group);
    this.buildHair(app, rig.head, headR, hair, mesh);
    rig.head.add(rig.hatGroup);
    this.buildHat(app, rig.hatGroup, headR, hatMat, mesh);
    this.buildGlasses(app, rig.head, headR, mesh);
    this.buildFacialHair(app, rig.head, headR, hair, mesh);

    // ---- arms
    const armR = 0.045 * Math.sqrt(ws) * (kid ? 0.85 : 1);
    for (const side of [1, -1] as const) {
      const sh = side > 0 ? rig.shoulderL : rig.shoulderR;
      const el = side > 0 ? rig.elbowL : rig.elbowR;
      const hd = side > 0 ? rig.handL : rig.handR;
      rig.chest.add(sh);
      sh.position.set(side * (dims.shoulderX + armR * 0.35), T * 0.42, 0);
      mesh(Geo.sphere(armR * 1.04, 14, 10), armUpperMat, sh, 0, 0, 0);
      const ua = mesh(Geo.capsule(armR, dims.upperArm - armR * 2, 4, 12), armUpperMat, sh, 0, -dims.upperArm / 2, 0);
      void ua;
      sh.add(el);
      el.position.y = -dims.upperArm;
      mesh(Geo.capsule(armR * 0.9, dims.forearm - armR * 2, 4, 12), armLowerMat, el, 0, -dims.forearm / 2, 0);
      if (!sleeveLong && !sleeveNone) {
        // short sleeve cuff
        const cuff = mesh(Geo.cyl(armR * 1.22, armR * 1.25, 0.05, 14), armUpperMat, sh, 0, -dims.upperArm * 0.55, 0);
        void cuff;
      }
      if (sleeveLong) mesh(Geo.cyl(armR * 1.08, armR * 1.12, 0.03, 14), armUpperMat === top ? top2 : top, el, 0, -dims.forearm + 0.02, 0);
      el.add(hd);
      hd.position.y = -dims.forearm - 0.01;
      // mitten hand + thumb
      const palm = mesh(Geo.sphere(1, 14, 10), skin, hd, 0, -0.035, 0);
      palm.scale.set(0.035, 0.048, 0.03);
      const thumb = mesh(Geo.capsule(0.012, 0.022, 3, 8), skin, hd, side * -0.0, -0.025, 0.028);
      thumb.rotation.x = 0.9;
      const hold = side > 0 ? this.holdL : this.holdR;
      hold.position.set(0, -0.07, 0.035);
      hd.add(hold);
    }

    // ---- legs
    const legR = 0.064 * Math.sqrt(ws) * (kid ? 0.85 : 1);
    const pantsLong = app.bottom === 'pants';
    const skirt = app.bottom === 'skirt' || app.top === 'dress';
    for (const side of [1, -1] as const) {
      const hip = side > 0 ? rig.hipL : rig.hipR;
      const knee = side > 0 ? rig.kneeL : rig.kneeR;
      const foot = side > 0 ? rig.footL : rig.footR;
      rig.pelvis.add(hip);
      hip.position.set(side * tw * 0.52, -0.02, 0);
      mesh(Geo.capsule(legR, dims.thigh - legR * 1.2, 4, 12), skirt || app.bottom === 'shorts' ? (skirt ? skin : bottom) : bottom, hip, 0, -dims.thigh / 2, 0);
      if (app.bottom === 'shorts') {
        // shorts end mid-thigh: skin below
        mesh(Geo.capsule(legR * 0.9, dims.thigh * 0.4, 4, 12), skin, hip, 0, -dims.thigh * 0.72, 0);
      }
      hip.add(knee);
      knee.position.y = -dims.thigh;
      mesh(Geo.capsule(legR * 0.88, dims.shin - legR, 4, 12), pantsLong ? bottom : skin, knee, 0, -dims.shin / 2, 0);
      if (!pantsLong) {
        // socks
        mesh(Geo.cyl(legR * 0.92, legR * 0.92, 0.07, 12), sole, knee, 0, -dims.shin + 0.05, 0);
      }
      knee.add(foot);
      foot.position.y = -dims.shin;
      const s1 = mesh(Geo.rbox(0.1, 0.075, 0.2, 0.035), shoe, foot, 0, -0.035, 0.035);
      void s1;
      mesh(Geo.rbox(0.104, 0.022, 0.205, 0.01), sole, foot, 0, -0.064, 0.035);
    }
    if (skirt) {
      const skirtGeo = new THREE.LatheGeometry(
        [
          [0.0, 0],
          [tw * 0.95, 0.0],
          [tw * 1.05, -0.08],
          [tw * 1.35, -0.28 * hs],
          [tw * 1.42, -0.32 * hs],
          [0.0, -0.32 * hs],
        ].map(([x, y]) => new THREE.Vector2(x, y)),
        28,
      );
      const sm = mesh(skirtGeo, app.top === 'dress' ? top : bottom, rig.pelvis, 0, 0.0, 0);
      sm.scale.z = 0.8;
      sm.material = (sm.material as THREE.Material).clone();
      (sm.material as THREE.Material).side = THREE.DoubleSide;
    }

    // soft contact shadow blob under feet (helps grounding in AO-less settings)
    const blob = new THREE.Mesh(
      Geo.plane(1, 1),
      new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.45, color: 0x000000 }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.scale.set(0.55 * ws, 0.45, 1);
    blob.position.y = 0.003;
    blob.renderOrder = 1;
    rig.root.add(blob);
    rig.root.userData.blob = blob;
  }

  private addTopDetails(
    app: Appearance,
    rig: Rig,
    dims: BodyDims,
    tw: number,
    m: { skin: THREE.Material; top: THREE.Material; top2: THREE.Material; bottom: THREE.Material },
    mesh: (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x?: number, y?: number, z?: number) => THREE.Mesh,
  ) {
    const T = dims.torso;
    const fz = tw * 0.7; // approx front depth
    const F = (y: number, off = 0.004) => this.frontZ(y) + off;
    const collar = (mat: THREE.Material) => {
      const c = mesh(Geo.torus(0.062, 0.016, 8, 24), mat, rig.spine, 0, T * 0.98, 0.0);
      c.rotation.x = Math.PI / 2;
      c.scale.set(1.1, 0.95, 1);
    };
    switch (app.top) {
      case 'tee':
      case 'jersey':
      case 'sweater':
      case 'longsleeve':
        collar(app.top === 'sweater' ? m.top2 : m.top);
        break;
      case 'tank':
        break;
      case 'hoodie': {
        collar(m.top);
        const hood = mesh(Geo.torus(0.085, 0.035, 8, 20, Math.PI * 1.2), m.top, rig.spine, 0, T * 0.95, -0.05);
        hood.rotation.set(-Math.PI / 2 + 0.3, 0, Math.PI * -0.1 + Math.PI);
        for (const s of [1, -1]) {
          const str = mesh(Geo.cyl(0.004, 0.004, 0.12, 6), m.top2, rig.spine, s * 0.03, T * 0.83, F(T * 0.83));
          void str;
        }
        const pocket = mesh(Geo.rbox(tw * 1.1, T * 0.2, 0.02, 0.01), m.top2, rig.spine, 0, T * 0.25, F(T * 0.25, -0.004));
        void pocket;
        break;
      }
      case 'jacket':
      case 'suit':
      case 'labcoat': {
        // open jacket panels over an inner shirt (top2 is the jacket)
        for (const s of [1, -1]) {
          const panel = mesh(Geo.rbox(tw * 0.6, T * 0.98, 0.022, 0.01), m.top2, rig.spine, s * tw * 0.55, T * 0.49, F(T * 0.5, -0.012));
          panel.rotation.y = s * 0.32;
          const lapel = mesh(Geo.box(0.035, T * 0.32, 0.01), m.top2, rig.spine, s * 0.055, T * 0.8, F(T * 0.8, 0.002));
          lapel.rotation.z = s * 0.35;
        }
        const back = mesh(Geo.rbox(tw * 1.9, T * 0.98, 0.03, 0.012), m.top2, rig.spine, 0, T * 0.49, -fz * 0.92);
        void back;
        if (app.top === 'labcoat') mesh(Geo.box(0.05, 0.035, 0.005), new THREE.MeshStandardMaterial({ color: 0x3a6fd8 }), rig.spine, 0.1, T * 0.72, fz * 1.05);
        break;
      }
      case 'overalls': {
        collar(m.top);
        const bib = mesh(Geo.rbox(tw * 1.05, T * 0.36, 0.014, 0.006), m.bottom, rig.spine, 0, T * 0.32, F(T * 0.32, -0.002));
        bib.rotation.x = -0.06;
        for (const s of [1, -1]) {
          const strap = mesh(Geo.box(0.028, T * 0.5, 0.01), m.bottom, rig.spine, s * 0.075, T * 0.72, F(T * 0.72, -0.001));
          strap.rotation.x = -0.12;
          mesh(Geo.sphere(0.01, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: 1, roughness: 0.3 }), rig.spine, s * 0.075, T * 0.5, F(T * 0.5, 0.004));
        }
        break;
      }
      case 'uniform': {
        collar(m.top2);
        for (let i = 0; i < 4; i++) mesh(Geo.sphere(0.009, 8, 6), m.top2, rig.spine, 0, T * (0.2 + i * 0.18), F(T * (0.2 + i * 0.18)));
        mesh(Geo.rbox(0.06, 0.05, 0.012, 0.005), m.top2, rig.spine, 0.075, T * 0.7, F(T * 0.7, -0.002));
        break;
      }
      case 'dress':
        collar(m.top);
        break;
    }
    if (app.tie) {
      const tieMat = new THREE.MeshPhysicalMaterial({ color: app.tie, roughness: 0.45, sheen: 0.5 });
      const knot = mesh(Geo.sphere(0.018, 10, 8), tieMat, rig.spine, 0, T * 0.93, F(T * 0.93));
      void knot;
      const blade = mesh(Geo.rbox(0.04, T * 0.5, 0.01, 0.005), tieMat, rig.spine, 0, T * 0.66, F(T * 0.66, 0.002));
      blade.rotation.x = -0.1;
    }
    if (app.bowtie) {
      const bm = new THREE.MeshPhysicalMaterial({ color: app.bowtie, roughness: 0.4, sheen: 0.6 });
      for (const s of [1, -1]) {
        const w = mesh(Geo.cone(0.022, 0.045, 10), bm, rig.spine, s * 0.022, T * 0.95, F(T * 0.95, 0.01));
        w.rotation.z = s * Math.PI / 2;
      }
      mesh(Geo.sphere(0.011, 8, 6), bm, rig.spine, 0, T * 0.95, F(T * 0.95, 0.014));
    }
    if (app.necklace) {
      const n = mesh(Geo.torus(0.075, 0.005, 6, 28), new THREE.MeshStandardMaterial({ color: app.necklace, metalness: 1, roughness: 0.25 }), rig.spine, 0, T * 0.9, 0.025);
      n.rotation.x = Math.PI / 2 - 0.35;
    }
    // belt
    if (app.top !== 'dress' && app.top !== 'overalls' && app.top !== 'labcoat') {
      const belt = mesh(Geo.torus(tw * 0.93, 0.012, 6, 28), new THREE.MeshStandardMaterial({ color: 0x2a211c, roughness: 0.5 }), rig.pelvis, 0, 0.005, 0);
      belt.rotation.x = Math.PI / 2;
      belt.scale.set(1, 0.72, 1);
      void m.skin;
    }
  }

  private buildHair(app: Appearance, head: THREE.Group, R: number, mat: THREE.Material, mesh: (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x?: number, y?: number, z?: number) => THREE.Mesh) {
    const cap = (scale = 1.045, theta = 0.52, tilt = -0.35, y = 0.0) => {
      const g = new THREE.SphereGeometry(R, 32, 18, 0, Math.PI * 2, 0, Math.PI * theta);
      const m = mesh(g, mat, head, 0, y, -0.004);
      m.scale.setScalar(scale);
      m.rotation.x = tilt;
      return m;
    };
    const fringe = (w = 1) => {
      const f = mesh(Geo.capsule(0.03, R * 0.9 * w, 4, 10), mat, head, 0, R * 0.62, R * 0.62);
      f.rotation.z = Math.PI / 2;
      f.rotation.y = 0.0;
      f.scale.set(1, 1, 0.7);
      return f;
    };
    switch (app.hair) {
      case 'bald': {
        const ring = mesh(Geo.torus(R * 0.9, 0.028, 8, 24, Math.PI * 1.2), mat, head, 0, -0.01, -0.01);
        ring.rotation.set(Math.PI / 2, 0, Math.PI * 0.9 + Math.PI);
        break;
      }
      case 'buzz':
        cap(1.02, 0.5, -0.35);
        break;
      case 'short':
        cap(1.05, 0.52, -0.4);
        fringe(0.85);
        break;
      case 'sidepart': {
        cap(1.05, 0.52, -0.4);
        const sw = mesh(Geo.sphere(1, 16, 12), mat, head, -R * 0.25, R * 0.78, R * 0.4);
        sw.scale.set(R * 0.75, R * 0.28, R * 0.5);
        sw.rotation.z = 0.3;
        break;
      }
      case 'quiff': {
        cap(1.04, 0.5, -0.45);
        const q = mesh(Geo.torus(R * 0.35, 0.045, 8, 16, Math.PI), mat, head, 0, R * 0.82, R * 0.35);
        q.rotation.set(0, Math.PI / 2, 0);
        q.scale.set(1, 1.1, 1.5);
        break;
      }
      case 'spiky': {
        cap(1.04, 0.5, -0.4);
        for (let i = 0; i < 11; i++) {
          const a = (i / 11) * Math.PI * 2;
          const r = i === 0 ? 0 : R * 0.45;
          const c = mesh(Geo.cone(0.035, 0.11, 8), mat, head, Math.cos(a) * r, R * 0.9, Math.sin(a) * r * 0.9);
          c.rotation.set(Math.sin(a) * 0.6 - 0.25, 0, -Math.cos(a) * 0.6);
        }
        break;
      }
      case 'bob': {
        const c = cap(1.09, 0.7, -0.15, -0.01);
        c.scale.set(1.1, 1.08, 1.06);
        fringe(1.1);
        break;
      }
      case 'long': {
        cap(1.07, 0.6, -0.3);
        fringe(1.0);
        const back = mesh(Geo.capsule(R * 0.8, R * 1.2, 6, 16), mat, head, 0, -R * 0.55, -R * 0.45);
        back.scale.set(1.05, 1, 0.45);
        for (const s of [1, -1]) {
          const side = mesh(Geo.capsule(R * 0.25, R * 1.0, 4, 10), mat, head, s * R * 0.82, -R * 0.4, -R * 0.1);
          side.scale.set(0.8, 1, 0.9);
        }
        break;
      }
      case 'ponytail': {
        cap(1.05, 0.55, -0.35);
        fringe(0.9);
        const tie = mesh(Geo.torus(0.03, 0.01, 6, 14), new THREE.MeshStandardMaterial({ color: 0xe84a6f }), head, 0, R * 0.35, -R * 0.95);
        tie.rotation.x = 0.8;
        const tail = mesh(Geo.capsule(0.045, 0.18, 6, 12), mat, head, 0, R * 0.0, -R * 1.2);
        tail.rotation.x = 0.35;
        tail.userData.sway = true;
        break;
      }
      case 'bun': {
        cap(1.05, 0.55, -0.35);
        mesh(Geo.sphere(0.075, 18, 14), mat, head, 0, R * 1.0, -R * 0.35);
        break;
      }
      case 'pigtails': {
        cap(1.05, 0.55, -0.35);
        fringe(1.0);
        for (const s of [1, -1]) {
          const p = mesh(Geo.capsule(0.05, 0.12, 6, 12), mat, head, s * R * 1.08, -R * 0.25, -R * 0.2);
          p.rotation.z = s * 0.35;
          mesh(Geo.torus(0.028, 0.009, 6, 12), new THREE.MeshStandardMaterial({ color: 0x5ec8e5 }), head, s * R * 1.0, R * 0.05, -R * 0.2).rotation.z = s * 0.35 + Math.PI / 2;
        }
        break;
      }
      case 'afro': {
        const g = new THREE.IcosahedronGeometry(R * 1.45, 3);
        const p = g.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) {
          const v = new THREE.Vector3().fromBufferAttribute(p, i);
          const k = 1 + noise.noise3(v.x * 40, v.y * 40, v.z * 40) * 0.06;
          v.multiplyScalar(k);
          p.setXYZ(i, v.x, v.y, v.z);
        }
        g.computeVertexNormals();
        const a = mesh(g, mat, head, 0, R * 0.45, -R * 0.25);
        a.scale.set(1, 0.9, 0.95);
        break;
      }
      case 'curly': {
        cap(1.04, 0.52, -0.35);
        for (let i = 0; i < 26; i++) {
          const th = Math.random() * Math.PI * 2;
          const ph = Math.random() * Math.PI * 0.42;
          const r = R * 1.02;
          const x = Math.sin(ph) * Math.cos(th) * r;
          const z = Math.sin(ph) * Math.sin(th) * r - 0.02;
          const y = Math.cos(ph) * r - 0.01;
          if (z > R * 0.25 && y < R * 0.75) continue;
          mesh(Geo.sphere(0.042, 10, 8), mat, head, x, y, z);
        }
        break;
      }
      case 'mohawk': {
        cap(1.01, 0.5, -0.35);
        for (let i = 0; i < 7; i++) {
          const a = -0.2 + (i / 6) * (Math.PI * 0.75);
          const c = mesh(Geo.cone(0.03, 0.13, 8), mat, head, 0, Math.cos(a) * R * 1.0, Math.sin(-a + Math.PI / 2 - 0.2) * R * 0.2 - (i / 6) * R * 0.9 + R * 0.45);
          c.rotation.x = -a * 0.8;
        }
        break;
      }
    }
  }

  private buildHat(app: Appearance, g: THREE.Group, R: number, mat: THREE.Material, mesh: (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x?: number, y?: number, z?: number) => THREE.Mesh) {
    const white = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.8, sheen: 0.5 });
    switch (app.hat) {
      case 'none':
        return;
      case 'cap': {
        const d = mesh(new THREE.SphereGeometry(R * 1.07, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), mat, g, 0, R * 0.12, -0.005);
        d.scale.y = 0.92;
        const brim = mesh(Geo.cyl(R * 0.62, R * 0.62, 0.012, 24), mat, g, 0, R * 0.18, R * 0.92);
        brim.scale.set(1, 1, 0.75);
        brim.rotation.x = 0.12;
        mesh(Geo.sphere(0.014, 8, 6), mat, g, 0, R * 1.1, 0);
        break;
      }
      case 'visor': {
        const band = mesh(Geo.cyl(R * 1.02, R * 1.02, 0.04, 28, true), mat, g, 0, R * 0.45, 0);
        (band.material as THREE.Material).side = THREE.DoubleSide;
        const brim = mesh(Geo.cyl(R * 0.62, R * 0.62, 0.01, 24), mat, g, 0, R * 0.42, R * 0.92);
        brim.scale.set(1, 1, 0.75);
        break;
      }
      case 'beanie': {
        const d = mesh(new THREE.SphereGeometry(R * 1.08, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), mat, g, 0, R * 0.1, -0.005);
        d.scale.y = 1.12;
        const fold = mesh(Geo.torus(R * 1.02, 0.03, 8, 30), mat, g, 0, R * 0.12, 0);
        fold.rotation.x = Math.PI / 2;
        mesh(Geo.sphere(0.045, 12, 10), white, g, 0, R * 1.3, 0);
        break;
      }
      case 'cowboy': {
        const brim = mesh(Geo.cyl(R * 1.9, R * 1.9, 0.015, 32), mat, g, 0, R * 0.55, 0);
        brim.scale.set(1, 1, 0.9);
        const crown = mesh(Geo.cyl(R * 0.85, R * 0.95, R * 0.75, 24), mat, g, 0, R * 0.9, 0);
        crown.scale.set(1, 1, 0.85);
        mesh(Geo.torus(R * 0.93, 0.014, 6, 24), new THREE.MeshStandardMaterial({ color: 0x3a2518 }), g, 0, R * 0.62, 0).rotation.x = Math.PI / 2;
        for (const s of [1, -1]) {
          const curl = mesh(Geo.torus(R * 0.4, 0.012, 6, 16, Math.PI * 0.6), mat, g, s * R * 1.65, R * 0.62, 0);
          curl.rotation.set(0, Math.PI / 2, s * 0.5);
        }
        break;
      }
      case 'chef': {
        mesh(Geo.cyl(R * 0.98, R * 1.0, R * 0.5, 24), white, g, 0, R * 0.7, 0);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          mesh(Geo.sphere(R * 0.45, 12, 10), white, g, Math.cos(a) * R * 0.55, R * 1.2, Math.sin(a) * R * 0.55);
        }
        mesh(Geo.sphere(R * 0.55, 12, 10), white, g, 0, R * 1.3, 0);
        break;
      }
      case 'tophat': {
        mesh(Geo.cyl(R * 1.45, R * 1.45, 0.012, 28), mat, g, 0, R * 0.7, 0);
        mesh(Geo.cyl(R * 0.8, R * 0.8, R * 1.1, 24), mat, g, 0, R * 1.25, 0);
        mesh(Geo.cyl(R * 0.82, R * 0.82, 0.04, 24), new THREE.MeshStandardMaterial({ color: 0xb8322a }), g, 0, R * 0.82, 0);
        break;
      }
      case 'beret': {
        const b = mesh(Geo.sphere(R * 1.05, 24, 12), mat, g, R * 0.15, R * 0.75, 0);
        b.scale.set(1.05, 0.35, 1.05);
        b.rotation.z = -0.25;
        break;
      }
      case 'bucket': {
        mesh(Geo.cyl(R * 0.95, R * 1.05, R * 0.55, 24), mat, g, 0, R * 0.8, 0);
        mesh(Geo.cyl(R * 1.05, R * 1.5, R * 0.18, 28, true), mat, g, 0, R * 0.45, 0);
        break;
      }
      case 'hardhat': {
        const d = mesh(new THREE.SphereGeometry(R * 1.1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), mat, g, 0, R * 0.15, 0);
        d.scale.y = 0.95;
        mesh(Geo.cyl(R * 1.3, R * 1.3, 0.01, 28), mat, g, 0, R * 0.18, 0.02);
        mesh(Geo.box(0.02, 0.02, R * 2.1), mat, g, 0, R * 1.2, 0);
        break;
      }
      case 'headband': {
        const band = mesh(Geo.torus(R * 1.02, 0.018, 8, 30), mat, g, 0, R * 0.45, -0.02);
        band.rotation.x = Math.PI / 2 + 0.25;
        break;
      }
      case 'bow': {
        for (const s of [1, -1]) {
          const w = mesh(Geo.cone(0.045, 0.09, 12), mat, g, s * 0.045 + R * 0.35, R * 0.95, -0.02);
          w.rotation.z = s * Math.PI / 2;
        }
        mesh(Geo.sphere(0.022, 10, 8), mat, g, R * 0.35, R * 0.95, -0.02);
        break;
      }
      case 'crown': {
        const gold = new THREE.MeshStandardMaterial({ color: 0xf5c542, metalness: 1, roughness: 0.25 });
        mesh(Geo.cyl(R * 0.8, R * 0.75, R * 0.35, 24, true), gold, g, 0, R * 0.95, 0);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          mesh(Geo.cone(0.03, 0.08, 6), gold, g, Math.cos(a) * R * 0.78, R * 1.2, Math.sin(a) * R * 0.78);
          mesh(Geo.sphere(0.012, 8, 6), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xe23b3b : 0x3b7de2, roughness: 0.2 }), g, Math.cos(a) * R * 0.8, R * 0.95, Math.sin(a) * R * 0.8);
        }
        break;
      }
    }
  }

  private buildGlasses(app: Appearance, head: THREE.Group, R: number, mesh: (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x?: number, y?: number, z?: number) => THREE.Mesh) {
    if (app.glasses === 'none') return;
    const frame = new THREE.MeshStandardMaterial({ color: app.glassesColor ?? '#1b1b1b', roughness: 0.3, metalness: app.glasses === 'round' ? 0.8 : 0.2 });
    const z = Math.sqrt(R * R - 0.058 * 0.058) + 0.018;
    const lensMat =
      app.glasses === 'sunglasses'
        ? new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.05, metalness: 0.5, clearcoat: 1 })
        : new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.15, clearcoat: 1 });
    for (const s of [1, -1]) {
      const x = s * 0.058;
      if (app.glasses === 'square') {
        mesh(Geo.box(0.064, 0.008, 0.008), frame, head, x, 0.043, z);
        mesh(Geo.box(0.064, 0.008, 0.008), frame, head, x, -0.017, z);
        mesh(Geo.box(0.008, 0.06, 0.008), frame, head, x + 0.032, 0.013, z);
        mesh(Geo.box(0.008, 0.06, 0.008), frame, head, x - 0.032, 0.013, z);
        mesh(Geo.box(0.06, 0.056, 0.003), lensMat, head, x, 0.013, z);
      } else {
        const ring = mesh(Geo.torus(0.034, 0.005, 8, 24), frame, head, x, 0.012, z);
        if (app.glasses === 'cateye') ring.scale.set(1.15, 0.85, 1);
        const lens = mesh(Geo.cyl(0.033, 0.033, 0.003, 20), lensMat, head, x, 0.012, z);
        lens.rotation.x = Math.PI / 2;
        if (app.glasses === 'cateye') lens.scale.set(1.15, 1, 0.85);
      }
      // temple arm
      const arm = mesh(Geo.box(0.006, 0.006, R * 0.9), frame, head, s * R * 0.9, 0.02, z - R * 0.45);
      void arm;
    }
    mesh(Geo.box(0.03, 0.006, 0.006), frame, head, 0, 0.02, z + 0.003);
  }

  private buildFacialHair(app: Appearance, head: THREE.Group, R: number, mat: THREE.Material, mesh: (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x?: number, y?: number, z?: number) => THREE.Mesh) {
    const zAt = (x: number, y: number) => Math.sqrt(Math.max(0, R * R - x * x - y * y));
    if (app.facialHair === 'mustache' || app.facialHair === 'goatee' || app.facialHair === 'beard') {
      for (const s of [1, -1]) {
        const m = mesh(Geo.capsule(0.012, 0.03, 4, 8), mat, head, s * 0.02, -0.045, zAt(0.02, -0.045) + 0.004);
        m.rotation.z = Math.PI / 2 + s * 0.35;
      }
    }
    if (app.facialHair === 'goatee') {
      const gt = mesh(Geo.sphere(0.025, 12, 8), mat, head, 0, -0.118, zAt(0, -0.12) - 0.004);
      gt.scale.set(1, 1.3, 0.6);
    }
    if (app.facialHair === 'beard') {
      const b = mesh(new THREE.SphereGeometry(R * 1.02, 28, 16, Math.PI * 0.05, Math.PI * 0.9, Math.PI * 0.55, Math.PI * 0.4), mat, head, 0, -0.01, 0.0);
      b.rotation.y = 0;
      b.scale.set(1.02, 1.05, 1.06);
    }
    if (app.facialHair === 'stubble') {
      const sm = new THREE.MeshBasicMaterial({ color: 0x2a211c, transparent: true, opacity: 0.18, depthWrite: false });
      const b = mesh(new THREE.SphereGeometry(R * 1.005, 28, 16, Math.PI * 0.05, Math.PI * 0.9, Math.PI * 0.58, Math.PI * 0.35), sm, head, 0, -0.005, 0);
      b.castShadow = false;
    }
  }

  dispose() {
    for (const m of this.materials) m.dispose();
  }
}

let blobTex: THREE.Texture | null = null;
function blobTexture(): THREE.Texture {
  if (blobTex) return blobTex;
  blobTex = canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { srgb: false });
  return blobTex;
}
