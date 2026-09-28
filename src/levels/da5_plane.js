// Dead Air 5 — "Evac 41": a four-engine military transport (original design in
// the spirit of a C-130). Built from primitives (MeshKit), nose toward local
// -Z, ground at y=0. Animated parts: four propellers (spin-up with blur
// discs), the rear cargo ramp (closed during the finale, lowered for
// boarding), beacons / nav / formation lights, landing lights and the hold's
// night-ops lighting. Static colliders make the hold and the lowered ramp
// walkable (the nav grid needs them); while the ramp is "closed" a dynamic
// blocker + KEEP CLEAR chain keep survivors off it. drive(keys) moves the
// whole aircraft for the escape cutscene.
import * as THREE from 'three';
import { MeshKit, trsM, panelTexture, decalTexture, decalMesh, glowSprite } from './da5_fx.js';
import { jetAudio } from './da_parts.js';
import { F_SOLID, F_SHOOT, F_SIGHT, F_DEFAULT } from '../world/collision.js';

const CY = 2.5, R = 2.2, FLOOR = 1.1;
const ZF = -8, ZA = 6;          // cylindrical section (fwd end, ramp hinge)
const RAMP_LEN = 4.4;
const RAMP_DOWN = Math.asin(FLOOR / RAMP_LEN);   // plate end touches the ground
const RAMP_UP = -0.335;                           // closed (tucked under the tail)
const WY = 4.85;                                  // wing root height
export const ENGINES = [-11.2, -5.6, 5.6, 11.2];
export const PLANE_DIM = { CY, R, FLOOR, ZF, ZA, RAMP_LEN };

// ring-strip loft: sections [{z, pts:[[x,y],...]}], faces skipped by skip(s, i)
function loftGeo(sections, closed = true, skip = null) {
  const pos = [];
  const n = sections[0].pts.length;
  for (let s = 0; s < sections.length - 1; s++) {
    const A = sections[s], B = sections[s + 1];
    const m = closed ? n : n - 1;
    for (let i = 0; i < m; i++) {
      if (skip && skip(s, i)) continue;
      const j = (i + 1) % n;
      const a0 = [A.pts[i][0], A.pts[i][1], A.z], a1 = [A.pts[j][0], A.pts[j][1], A.z];
      const b0 = [B.pts[i][0], B.pts[i][1], B.z], b1 = [B.pts[j][0], B.pts[j][1], B.z];
      pos.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
const ellipse = (yc, a, b, n = 28) => { const p = []; for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; p.push([Math.cos(t) * a, yc + Math.sin(t) * b]); } return p; };

export class TransportPlane {
  constructor(L, game, o = {}) {
    this.L = L; this.game = game;
    this.px = o.x; this.pz = o.z; this.yaw = o.yaw ?? Math.PI;
    this.sky = o.sky;
    const grp = new THREE.Group();
    this.group = grp;
    this.buildModel(o);
    grp.position.set(this.px, 0, this.pz);
    grp.rotation.y = this.yaw;
    grp.userData.noCull = true;
    L.addObject(grp);
    this.rpm = ENGINES.map(() => 0);
    this.rpmTarget = ENGINES.map(() => 0);
    this.ramp = RAMP_UP;
    this.rampTarget = RAMP_UP;
    this.rampSpeed = 0.22;
    this.t = 0;
    this.path = null;
    this.buildColliders();
    L.dynamics.push(this);
  }

  // local -> world (parked pose)
  w(lx, ly, lz) { const c = Math.cos(this.yaw), s = Math.sin(this.yaw); return [this.px + c * lx + s * lz, ly, this.pz - s * lx + c * lz]; }
  wbox(lx0, ly0, lz0, lx1, ly1, lz1, flags = F_DEFAULT, surf = 'metal') {
    const a = this.w(lx0, ly0, lz0), b = this.w(lx1, ly1, lz1);
    return this.L.col.addBox(Math.min(a[0], b[0]), ly0, Math.min(a[2], b[2]), Math.max(a[0], b[0]), ly1, Math.max(a[2], b[2]), surf, flags);
  }

  buildModel(o) {
    const g = this.group;
    const skinTex = panelTexture({ base: [168, 172, 166], seed: 4417, grime: 70 });
    const skin = new THREE.MeshStandardMaterial({ map: skinTex, vertexColors: true, roughness: 0.72, metalness: 0.3, side: THREE.DoubleSide });
    const dark = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.6, metalness: 0.45, side: THREE.DoubleSide });
    const inner = new THREE.MeshStandardMaterial({ map: panelTexture({ base: [150, 152, 140], seed: 77, grime: 25 }), vertexColors: true, roughness: 0.85, metalness: 0.1, side: THREE.DoubleSide });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.08, metalness: 0.85, emissive: 0x2a3a24, emissiveIntensity: 0.9 });
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.holdGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 0.01, 0.01) });
    this.holdWhite = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.1, 0.09) });
    this.landGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.25, 0.22) });
    const K = new MeshKit();
    const GREY = 0x8e948c, GREY2 = 0x7a8078, DARKG = 0x3a3e3c;
    // ---------------------------------------------------------- fuselage
    K.add(new THREE.CylinderGeometry(R, R, ZA - ZF, 32, 1, true), skin, trsM(0, CY, (ZF + ZA) / 2, Math.PI / 2, 0, 0), GREY);
    // nose (ellipsoid half) + radome
    K.add(new THREE.SphereGeometry(1, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), skin, trsM(0, CY, ZF, -Math.PI / 2, 0, 0, R, 4.4, R), GREY);
    K.sph(0, CY - 0.35, ZF - 3.95, 1.0, dark, 0x4a4e4c, [1.05, 0.95, 1.0], 16);
    // cockpit windows on the nose surface
    const NL = 4.4;
    const pane = (phi, th, w, h) => {
      const x = R * Math.cos(phi) * Math.sin(th), y = CY + R * Math.sin(phi), z = ZF - NL * Math.cos(phi) * Math.cos(th);
      const n = new THREE.Vector3(x / (R * R), (y - CY) / (R * R), (z - ZF) / (NL * NL)).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      // keep panes upright-ish: rotate around n so the pane's up points to world up
      const wantUp = new THREE.Vector3(0, 1, 0).sub(n.clone().multiplyScalar(n.y)).normalize();
      const ang = Math.atan2(new THREE.Vector3().crossVectors(up, wantUp).dot(n), up.dot(wantUp));
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(n, ang));
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z).addScaledVector(n, 0.015), q, new THREE.Vector3(w, h, 0.05));
      K.add(new THREE.BoxGeometry(1, 1, 1), glass, m, 0xffffff);
    };
    for (let k = -2; k <= 2; k++) pane(0.5, k * 0.36, 0.72, 0.55);
    for (const s of [-1, 1]) { pane(0.78, s * 0.3, 0.55, 0.32); pane(0.28, s * 1.05, 0.5, 0.45); }
    // chin windows
    for (const s of [-1, 1]) pane(-0.25, s * 0.32, 0.45, 0.35);
    // ---------------------------------------------------------- aft fuselage (upswept, ramp opening)
    const secs = [
      [ZA, 2.5, 2.2, 2.2], [7.5, 2.75, 2.12, 1.95], [9, 3.05, 1.98, 1.66], [10.3, 3.35, 1.8, 1.36],
      [11.6, 3.65, 1.52, 1.06], [12.8, 3.92, 1.18, 0.76], [13.9, 4.12, 0.78, 0.48], [14.8, 4.25, 0.3, 0.2],
    ].map(([z, yc, a, b]) => ({ z, pts: ellipse(yc, a, b, 28) }));
    // bottom arc (sin < -0.55) of the first 3 segments is the ramp opening
    K.add(loftGeo(secs, true, (s, i) => s < 3 && Math.sin(((i + 0.5) / 28) * Math.PI * 2) < -0.55), skin, new THREE.Matrix4(), GREY);
    K.sph(0, 4.25, 14.8, 0.3, skin, GREY, [1, 0.66, 0.6], 10);
    // belly rise into the ramp hinge
    K.box(0, FLOOR - 0.35, ZA - 0.35, 3.2, 0.7, 0.7, skin, GREY2, [0.5, 0, 0]);
    // ---------------------------------------------------------- sponsons + gear
    for (const s of [-1, 1]) {
      K.cylZ(s * 2.2, 1.15, 1.0, 0.85, 0.85, 6.4, skin, GREY2, 16);
      K.sph(s * 2.2, 1.15, -2.2, 0.85, skin, GREY2, [1, 1, 1.4], 14);
      K.sph(s * 2.2, 1.15, 4.2, 0.85, skin, GREY2, [1, 1, 1.6], 14);
      for (const wz of [-0.5, 1.7]) {
        K.add(new THREE.CylinderGeometry(0.62, 0.62, 0.42, 20), dark, trsM(s * 2.55, 0.62, wz, 0, 0, Math.PI / 2), 0x202020);
        K.add(new THREE.CylinderGeometry(0.34, 0.34, 0.44, 12), dark, trsM(s * 2.56, 0.62, wz, 0, 0, Math.PI / 2), 0x8a8a86);
      }
    }
    // nose gear
    K.cyl(0, 1.0, -10.1, 0.09, 0.09, 1.6, dark, 0x9a9a96);
    for (const s of [-1, 1]) K.add(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 16), dark, trsM(s * 0.26, 0.45, -10.1, 0, 0, Math.PI / 2), 0x1e1e1e);
    // doors / markings outlines
    for (const s of [-1, 1]) {
      K.box(s * 2.195, 2.25, -6.2, 0.03, 1.9, 0.95, dark, 0x55595a);  // crew door (s=-1) / emergency hatch
      K.box(s * 2.19, 2.2, 3.9, 0.03, 1.9, 0.9, dark, 0x55595a);      // paratroop doors
      for (let i = 0; i < 5; i++) K.cylZ(s * 2.14, 3.25, -4 + i * 1.6, 0.17, 0.17, 0.1, glass, 0xffffff, 12);
    }
    // antennas / blades
    K.box(0, 4.85, -4.5, 0.06, 0.5, 0.4, dark, 0x2a2a2a, [0.3, 0, 0]);
    K.box(0, 4.8, 3.0, 0.05, 0.35, 0.25, dark, 0x2a2a2a);
    K.box(0.6, 0.35, -2, 0.05, 0.3, 0.3, dark, 0x2a2a2a);
    // ---------------------------------------------------------- wings
    for (const s of [-1, 1]) {
      const r0 = [[0, WY - 0.2, -3.4], [0, WY + 0.35, -3.1], [0, WY + 0.3, 0.6], [0, WY - 0.15, 0.6]];
      const t0 = [[s * 20, WY + 0.2, -2.55], [s * 20, WY + 0.45, -2.4], [s * 20, WY + 0.4, -0.2], [s * 20, WY + 0.2, -0.2]];
      K.prism(r0.map((p) => [p[0], p[1], p[2]]), t0, skin, GREY);
      // de-icing boot (dark leading edge) and flap line
      K.prism([[s * 1.8, WY - 0.2, -3.42], [s * 1.8, WY + 0.36, -3.12], [s * 1.8, WY + 0.3, -2.9], [s * 1.8, WY - 0.18, -3.1]], [[s * 20, WY + 0.19, -2.57], [s * 20, WY + 0.46, -2.42], [s * 20, WY + 0.44, -2.25], [s * 20, WY + 0.2, -2.35]], dark, 0x2a2c2c);
      K.box(s * 9, WY + 0.12, -0.35, 15, 0.04, 0.05, dark, 0x3a3c3c);
      K.box(s * 20.02, WY + 0.32, -1.4, 0.1, 0.3, 2.2, skin, GREY2);
      // wing fuel tanks (external, between engines)
      K.cylZ(s * 8.4, WY - 0.6, -1.6, 0.42, 0.42, 5.2, skin, GREY2, 14);
      K.sph(s * 8.4, WY - 0.6, -4.2, 0.42, skin, GREY2, [1, 1, 2.2], 12);
      K.sph(s * 8.4, WY - 0.6, 1.0, 0.42, skin, GREY2, [1, 1, 1.4], 12);
    }
    // wing / fuselage fairing on top
    K.box(0, 4.75, -1.2, 4.2, 0.5, 4.4, skin, GREY2);
    // ---------------------------------------------------------- engines
    for (const ex of ENGINES) {
      const ey = 4.3;
      K.cylZ(ex, ey, -3.2, 0.62, 0.66, 5.6, skin, GREY, 18);
      K.cylZ(ex, ey, -6.1, 0.62, 0.5, 0.6, skin, GREY, 18);
      K.box(ex, ey - 0.62, -4.6, 0.55, 0.35, 1.6, skin, GREY2);          // intake scoop
      K.cylZ(ex, ey - 0.62, -5.42, 0.2, 0.2, 0.05, dark, 0x0a0a0a, 10);
      K.box(ex, 4.72, -3.0, 0.5, 0.4, 3.6, skin, GREY);                 // pylon
      K.cylZ(ex + 0.3 * Math.sign(ex), ey + 0.35, -0.2, 0.16, 0.2, 0.6, dark, 0x1a1a1a, 10); // exhaust
    }
    // ---------------------------------------------------------- tail
    K.prism([[-0.24, 4.35, 9.2], [-0.24, 4.35, 14.6], [0.24, 4.35, 14.6], [0.24, 4.35, 9.2]], [[-0.12, 11.6, 12.1], [-0.12, 11.6, 15.1], [0.12, 11.6, 15.1], [0.12, 11.6, 12.1]], skin, GREY);
    K.box(0, 7.9, 14.4, 0.3, 6.4, 0.06, dark, 0x3a3c3c, [0.38, 0, 0]); // rudder hinge line
    for (const s of [-1, 1]) {
      K.prism([[0, 4.3, 11.8], [0, 4.55, 12.0], [0, 4.5, 15.0], [0, 4.25, 15.0]], [[s * 8, 4.42, 13.5], [s * 8, 4.55, 13.6], [s * 8, 4.52, 15.1], [s * 8, 4.4, 15.1]], skin, GREY);
    }
    // ---------------------------------------------------------- hold interior
    const arc = [];
    for (let i = 0; i <= 16; i++) { const t = -0.72 + (i / 16) * (Math.PI + 1.44); arc.push([Math.cos(t) * 2.08, CY + Math.sin(t) * 2.08]); }
    // flatten the lower wall section to vertical panels
    const linPts = arc.map(([x, y]) => [Math.sign(x) * Math.min(Math.abs(x), 1.68 + (y - FLOOR) * 0.22), Math.max(y, FLOOR)]);
    K.add(loftGeo([{ z: ZF + 0.3, pts: linPts }, { z: ZA, pts: linPts }], false), inner, new THREE.Matrix4(), 0xb8b8ac);
    K.box(0, FLOOR - 0.04, (ZF + ZA) / 2 + 0.15, 3.3, 0.08, ZA - ZF - 0.3, dark, 0x3a3c3a);
    for (const s of [-1, 1]) {
      K.box(s * 0.85, FLOOR + 0.02, (ZF + ZA) / 2, 0.22, 0.05, ZA - ZF - 0.5, dark, 0x6a6c6a);
      for (let z = ZF + 0.6; z < ZA - 0.3; z += 0.55) K.cylZ(s * 0.85, FLOOR + 0.05, z, 0.04, 0.04, 0.02, dark, 0x9a9a96, 6);
      // troop seats (red webbing)
      K.box(s * 1.4, FLOOR + 0.45, -1.2, 0.46, 0.06, 9.4, dark, 0x7a1a14);
      K.box(s * 1.66, FLOOR + 0.95, -1.2, 0.04, 0.8, 9.4, dark, 0x8a2218);
      for (let z = -5.8; z <= 3.4; z += 0.55) K.box(s * 1.66, FLOOR + 0.95, z, 0.05, 0.84, 0.03, dark, 0x2a2a2a);
      // ribs
      for (let z = ZF + 1; z < ZA; z += 1.25) K.box(s * 1.72, 2.6, z, 0.08, 2.8, 0.1, inner, 0x9a9a90);
    }
    // cargo pallet with netting at the front of the hold
    K.box(0, FLOOR + 0.55, -7.0, 2.6, 1.1, 1.5, dark, 0x4a5a3a);
    K.box(0, FLOOR + 0.1, -7.0, 2.8, 0.2, 1.7, dark, 0x6a6a64);
    for (let i = 0; i < 6; i++) K.box(-1.2 + i * 0.48, FLOOR + 0.6, -6.24, 0.03, 1.2, 0.02, dark, 0x2a3a1a);
    for (let i = 0; i < 3; i++) K.box(0, FLOOR + 0.25 + i * 0.35, -6.24, 2.6, 0.03, 0.02, dark, 0x2a3a1a);
    // forward bulkhead with the flight-deck ladder opening
    K.box(0, CY + 0.2, ZF + 0.25, 3.6, 3.6, 0.1, inner, 0x9a9a90);
    K.box(1.0, FLOOR + 1.6, ZF + 0.32, 0.8, 1.9, 0.05, glow, new THREE.Color(0.55, 0.38, 0.12));
    for (let i = 0; i < 6; i++) K.box(1.0, FLOOR + 0.3 + i * 0.32, ZF + 0.45, 0.6, 0.04, 0.05, dark, 0x6a6a6a);
    const model = K.build({ shadows: true });
    g.add(model);
    // hold lights (runtime switchable materials)
    const HL = new MeshKit();
    for (const s of [-1, 1]) HL.box(s * 0.7, 4.28, -1, 0.07, 0.04, 12.5, this.holdGlow, 0xffffff);
    const holdLights = HL.build({ shadows: false });
    g.add(holdLights);
    const HW = new MeshKit();
    for (const z of [-5, -1, 3]) HW.box(0, 4.33, z, 0.5, 0.05, 0.3, this.holdWhite, 0xffffff);
    g.add(HW.build({ shadows: false }));
    // ---------------------------------------------------------- ramp (pivot at the hinge)
    const RK = new MeshKit();
    RK.box(0, -0.07, RAMP_LEN / 2, 3.3, 0.14, RAMP_LEN, skin, GREY2);
    RK.box(0, 0.005, RAMP_LEN / 2, 3.1, 0.02, RAMP_LEN - 0.1, dark, 0x4a4c4a);
    for (let i = 0; i < 8; i++) RK.box(0, 0.02, 0.3 + i * 0.52, 3.0, 0.025, 0.06, dark, 0x6a6a66);
    for (const s of [-1, 1]) {
      RK.box(s * 1.62, 0.25, RAMP_LEN / 2, 0.06, 0.5, RAMP_LEN, skin, GREY2);
      RK.box(s * 1.35, 0.02, RAMP_LEN - 0.25, 0.5, 0.03, 0.4, dark, 0xd8b020);
      RK.box(s * 1.35, 0.3, 0.6, 0.12, 0.12, 1.6, dark, 0x8a8a86, [0.6, 0, 0]);
    }
    RK.box(0, -0.2, RAMP_LEN - 0.02, 3.2, 0.3, 0.06, dark, 0x1a1a1a);
    this.rampPivot = new THREE.Group();
    this.rampPivot.position.set(0, FLOOR, ZA);
    this.rampPivot.add(RK.build({ shadows: true }));
    g.add(this.rampPivot);
    // ---------------------------------------------------------- props
    this.props = [];
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0.35 });
    const discTex = decalTexture(128, 128, (c, w) => {
      const gr = c.createRadialGradient(64, 64, 8, 64, 64, 64);
      gr.addColorStop(0, 'rgba(20,20,20,0.7)'); gr.addColorStop(0.85, 'rgba(30,30,30,0.35)'); gr.addColorStop(0.93, 'rgba(200,170,40,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr; c.fillRect(0, 0, w, w);
    });
    for (const ex of ENGINES) {
      const piv = new THREE.Group();
      piv.position.set(ex, 4.3, -6.55);
      const PK = new MeshKit();
      PK.cylZ(0, 0, -0.35, 0.42, 0.05, 0.9, bladeMat, 0x4a4c4c, 16);
      for (let b = 0; b < 4; b++) {
        const a = b * Math.PI / 2;
        const bl = new THREE.Matrix4().makeRotationZ(a).multiply(trsM(0, 1.1, 0, 0, 0.35, 0, 0.3, 1.9, 0.06));
        PK.add(new THREE.BoxGeometry(1, 1, 1), bladeMat, bl, 0x1e2020);
        const tip = new THREE.Matrix4().makeRotationZ(a).multiply(trsM(0, 2.08, 0, 0, 0.35, 0, 0.3, 0.22, 0.065));
        PK.add(new THREE.BoxGeometry(1, 1, 1), bladeMat, tip, 0xd8b020);
      }
      const blades = PK.build({ shadows: true });
      piv.add(blades);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(2.15, 40), new THREE.MeshBasicMaterial({ map: discTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      disc.visible = false;
      piv.add(disc);
      g.add(piv);
      this.props.push({ piv, blades, disc, ang: Math.random() * 6 });
    }
    // ---------------------------------------------------------- lights
    const G = (x, y, z, c, s, fog = false) => { const sp = glowSprite(c, s, { fog }); sp.position.set(x, y, z); g.add(sp); return sp; };
    this.navL = G(-20.1, WY + 0.3, -1.4, 0xff2010, 0.8); // left wing tip: red
    this.navR = G(20.1, WY + 0.3, -1.4, 0x20ff50, 0.8);
    this.tailW = G(0, 4.3, 15.15, 0xffffff, 1.0);
    this.beaconTop = G(0, 11.75, 13.4, 0xff2010, 2.2);
    this.beaconBot = G(0, 0.2, -3, 0xff2010, 1.6);
    this.strobes = [G(-20.2, WY + 0.35, -1.2, 0xffffff, 0.1), G(20.2, WY + 0.35, -1.2, 0xffffff, 0.1)];
    this.landing = [G(-3.2, 4.45, -3.5, 0xfff4dc, 0.1), G(3.2, 4.45, -3.5, 0xfff4dc, 0.1), G(0, 1.2, -10.6, 0xfff4dc, 0.1)];
    for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), this.landGlow); m.position.set(s * 3.2, 4.45, -3.45); g.add(m); }
    // formation ("slime") lights: green strips
    const FK = new MeshKit();
    const slime = new THREE.Color(0.35, 1.2, 0.55);
    for (const s of [-1, 1]) {
      FK.box(s * 2.215, CY + 1.45, -6.6, 0.02, 0.08, 1.4, glow, slime);
      FK.box(s * 2.215, CY + 1.25, 1.5, 0.02, 0.08, 1.4, glow, slime);
      FK.box(s * 0.26, 8.2, 13.3, 0.02, 1.2, 0.08, glow, slime);
      FK.box(s * 14, WY + 0.43, -1.2, 1.4, 0.02, 0.08, glow, slime);
    }
    g.add(FK.build({ shadows: false }));
    // ---------------------------------------------------------- markings
    const side = decalTexture(512, 128, (c, w, h) => {
      c.fillStyle = 'rgba(30,32,30,0.85)';
      c.font = 'bold 54px Arial Black, Impact, sans-serif'; c.textAlign = 'center';
      c.fillText('NEWBURG', w / 2, 58);
      c.font = 'bold 30px Arial, sans-serif';
      c.fillText('AIR NATIONAL GUARD', w / 2, 102);
    });
    for (const s of [-1, 1]) {
      const m = decalMesh(side, 4.6, 1.15);
      m.position.set(s * 2.225, CY + 0.55, -2.6);
      m.rotation.y = s * Math.PI / 2;
      g.add(m);
    }
    const tailTex = decalTexture(256, 256, (c, w, h) => {
      c.fillStyle = 'rgba(30,32,30,0.9)';
      c.font = 'bold 64px Arial Black, Impact, sans-serif'; c.textAlign = 'center';
      c.fillText('NB', w / 2, 70);
      c.font = 'bold 34px Arial, sans-serif';
      c.fillText('AF 84417', w / 2, 118);
      c.strokeStyle = 'rgba(30,32,30,0.9)'; c.lineWidth = 5;
      c.beginPath(); c.moveTo(w / 2 - 50, 150); c.lineTo(w / 2 + 50, 150); c.lineTo(w / 2, 225); c.closePath(); c.stroke();
      c.font = 'bold 22px Arial, sans-serif'; c.fillText('EVAC', w / 2, 184);
    });
    for (const s of [-1, 1]) {
      const m = decalMesh(tailTex, 2.4, 2.4);
      m.position.set(s * 0.21, 8.6, 13.7);
      m.rotation.y = s * Math.PI / 2;
      g.add(m);
    }
    const rescue = decalTexture(256, 64, (c, w) => { c.fillStyle = 'rgba(220,170,30,0.95)'; c.font = 'bold 34px Arial, sans-serif'; c.textAlign = 'center'; c.fillText('▼ RESCUE ▼', w / 2, 44); });
    for (const s of [-1, 1]) { const m = decalMesh(rescue, 1.2, 0.3); m.position.set(s * 2.225, 3.55, -6.2); m.rotation.y = s * Math.PI / 2; g.add(m); }
    // KEEP CLEAR chain barrier around the ramp footprint (removed when it lowers)
    const BK = new MeshKit();
    const posts = [[-2.1, 6.3], [-2.1, 11.2], [2.1, 11.2], [2.1, 6.3]];
    for (const [x, z] of posts) { BK.cyl(x, 0.5, z, 0.05, 0.05, 1.0, dark, 0xd8b020, [0, 0, 0], 8); BK.cyl(x, 0.03, z, 0.22, 0.22, 0.06, dark, 0x2a2a2a, [0, 0, 0], 10); }
    for (let i = 0; i < 3; i++) {
      const [ax, az] = posts[i], [bx, bz] = posts[i + 1];
      const n = 10;
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const sag = (t) => 0.85 - Math.sin(t * Math.PI) * 0.18;
        const p0 = new THREE.Vector3(ax + (bx - ax) * t0, sag(t0), az + (bz - az) * t0), p1 = new THREE.Vector3(ax + (bx - ax) * t1, sag(t1), az + (bz - az) * t1);
        const len = p0.distanceTo(p1);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
        BK.add(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), dark, new THREE.Matrix4().compose(p0.clone().add(p1).multiplyScalar(0.5), q, new THREE.Vector3(1, len, 1)), k % 2 ? 0xc02018 : 0xe8e8e0);
      }
    }
    this.keepClear = BK.build({ shadows: false });
    g.add(this.keepClear);
    const kc = decalTexture(256, 96, (c, w, h) => { c.fillStyle = '#d8b020'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = 'bold 40px Arial Black, Impact, sans-serif'; c.textAlign = 'center'; c.fillText('KEEP CLEAR', w / 2, 44); c.font = 'bold 24px Arial, sans-serif'; c.fillText('RAMP OPERATION', w / 2, 80); });
    const kcm = decalMesh(kc, 1.1, 0.42, { side: THREE.DoubleSide });
    kcm.position.set(0, 0.72, 11.22);
    this.keepClear.add(kcm);
  }

  buildColliders() {
    const SOL = F_DEFAULT, SH = F_SHOOT | F_SIGHT;
    // hold floor + belly, walls, ceiling
    this.wbox(-1.7, 0, ZF, 1.7, FLOOR, ZA, SOL);
    for (const s of [-1, 1]) this.wbox(s * 1.62, FLOOR, ZF, s * 2.35, 4.8, ZA, SOL);
    this.wbox(-2.35, 0, ZF, -1.7, FLOOR, ZA, SOL);
    this.wbox(1.7, 0, ZF, 2.35, FLOOR, ZA, SOL);
    this.wbox(-1.62, 4.25, ZF, 1.62, 4.8, ZA, SOL);
    // forward bulkhead / nose, cargo pallet
    this.wbox(-2.3, 0, ZF - 4.6, 2.3, 4.8, ZF + 0.3, SOL);
    this.wbox(-1.45, FLOOR, ZF + 0.3, 1.45, FLOOR + 1.1, -6.2, SOL);
    // sponsons + wheels
    for (const s of [-1, 1]) this.wbox(s * 2.35, 0, -3.1, s * 3.1, 2.0, 5.2, SOL);
    // aft: side cheeks of the ramp opening and the upswept tail above it
    for (const s of [-1, 1]) this.wbox(s * 1.66, 0, ZA, s * 2.25, 3.4, 10.3, SOL);
    this.wbox(-1.8, 3.3, ZA, 1.8, 4.8, 10.3, SOL);
    this.wbox(-1.8, 2.45, 10.3, 1.8, 4.6, 14.9, SOL);
    // lowered ramp steps (walkable; nav needs them even while "closed")
    const n = 8, end = ZA + Math.cos(RAMP_DOWN) * RAMP_LEN;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n;
      const za = ZA + (end - ZA) * (1 - t), zb = za + (end - ZA) / n;
      this.wbox(-1.6, 0, za, 1.6, FLOOR * t, zb, F_SOLID | F_SHOOT);
    }
    // wings, engines, fin: bullets only (well above heads)
    this.wbox(-20, WY - 0.25, -3.4, 20, WY + 0.45, 0.6, SH);
    for (const ex of ENGINES) this.wbox(ex - 0.65, 3.65, -6.9, ex + 0.65, 4.95, -0.4, SH);
    this.wbox(-0.25, 4.4, 9.4, 0.25, 11.6, 15.1, SH);
    // the closed-ramp blocker (dynamic; disabled when the ramp is down)
    const a = this.w(-2.2, 0, ZA - 0.1), b = this.w(2.2, 0, 11.4);
    this.blocker = this.L.col.addDynamic([Math.min(a[0], b[0]), 0, Math.min(a[2], b[2])], [Math.max(a[0], b[0]), 3.4, Math.max(a[2], b[2])], { flags: F_SOLID, surf: 'metal' });
    // world-space boarding zone (inside the hold, forward of the hinge)
    const c0 = this.w(-1.55, 0, -6.1), c1 = this.w(1.55, 0, ZA - 0.2);
    this.boardZone = [Math.min(c0[0], c1[0]), FLOOR - 0.4, Math.min(c0[2], c1[2]), Math.max(c0[0], c1[0]), 3.6, Math.max(c0[2], c1[2])];
    const hc = this.w(0, 0, -1);
    this.holdCentre = [hc[0], FLOOR, hc[2]];
    const rf = this.w(0, 0, 11.6);
    this.rampFoot = [rf[0], 0, rf[2]];
  }

  // ---------------------------------------------------------------- control
  setEngine(i, k) { this.rpmTarget[i] = k; }
  setEngines(k) { for (let i = 0; i < 4; i++) this.rpmTarget[i] = k; }
  lowerRamp(dur = 4) { this.rampTarget = RAMP_DOWN; this.rampSpeed = (RAMP_DOWN - RAMP_UP) / dur; this.keepClear.visible = false; this.blocker.enabled = false; }
  raiseRamp(dur = 4) { this.rampTarget = RAMP_UP; this.rampSpeed = (RAMP_DOWN - RAMP_UP) / dur; }
  setHoldLights(on) {
    this.holdGlow.color.setRGB(on ? 2.2 : 0.08, on ? 0.18 : 0.01, on ? 0.1 : 0.01);
    this.holdWhite.color.setRGB(on ? 1.6 : 0.1, on ? 1.55 : 0.1, on ? 1.4 : 0.09);
    if (on && !this.holdLight) {
      const c = this.holdCentre;
      this.holdLight = this.L.light(c[0], 3.6, c[2], 0xff3a20, 7, 9, { flicker: 0.05, priority: 1 });
      const f = this.w(0, 0, 8.5);
      this.rampLight = this.L.light(f[0], 2.4, f[2], 0xff5030, 6, 8, { priority: 1 });
    }
  }
  setLanding(on) {
    this.landingOn = on;
    this.landGlow.color.setRGB(on ? 3 : 0.25, on ? 2.9 : 0.25, on ? 2.6 : 0.22);
    for (const s of this.landing) s.scale.setScalar(on ? 3.2 : 0.1);
  }
  audio(on, vol = 1) {
    if (on && !this.snd) this.snd = jetAudio(this.game, { vol: 2.6, ref: 30, whine: 118, whineVol: 0.06, hiss: 0.18 });
    this.sndVol = vol;
    if (!on && this.snd) { this.snd.stop(2); this.snd = null; }
  }
  // keyframes [{x, z, y, t, yaw?}] in world space (cutscene)
  drive(keys) {
    this.keys = keys;
    this.path = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(k.x, k.y ?? 0, k.z)), false, 'centripetal');
    this.pt = 0;
    this.dur = keys[keys.length - 1].t;
    this.vel = new THREE.Vector3();
    this.group.rotation.order = 'YXZ';
  }
  u(t) {
    const K = this.keys;
    let i = 0;
    while (i < K.length - 2 && t > K[i + 1].t) i++;
    const k = Math.min(1, Math.max(0, (t - K[i].t) / Math.max(1e-3, K[i + 1].t - K[i].t)));
    const e = K[i].ease === 'in' ? k * k : K[i].ease === 'out' ? 1 - (1 - k) * (1 - k) : k;
    return (i + e) / (K.length - 1);
  }
  update(dt) {
    const g = this.game;
    this.t += dt;
    // props
    for (let i = 0; i < 4; i++) {
      const tgt = this.rpmTarget[i];
      this.rpm[i] += (tgt - this.rpm[i]) * Math.min(1, dt * (tgt > this.rpm[i] ? 0.45 : 0.3));
      const P = this.props[i], k = this.rpm[i];
      P.ang += k * dt * 34;
      P.piv.rotation.z = P.ang;
      P.blades.visible = k < 0.8;
      P.disc.visible = k > 0.25;
      P.disc.material.opacity = Math.min(0.5, Math.max(0, (k - 0.25) * 0.9));
    }
    // ramp
    if (this.ramp !== this.rampTarget) {
      const d = this.rampTarget - this.ramp, st = this.rampSpeed * dt;
      this.ramp = Math.abs(d) <= st ? this.rampTarget : this.ramp + Math.sign(d) * st;
      if (!this.rampSnd) this.rampSnd = g.audio.loop('liftMotor', { pos: new THREE.Vector3(...this.w(0, 1.5, 8)), vol: 1.1 });
      if (this.ramp === this.rampTarget && this.rampSnd) { this.rampSnd.stop(0.4); this.rampSnd = null; g.audio.play('metalImpact', { pos: new THREE.Vector3(...this.w(0, 0.5, 10)), vol: 1.2 }); }
    }
    this.rampPivot.rotation.x = this.ramp;
    // lights
    const T = g.time;
    const bk = (T % 1.3) < 0.14;
    this.beaconTop.scale.setScalar(bk ? 3.2 : 0.4);
    this.beaconBot.scale.setScalar(((T + 0.6) % 1.3) < 0.14 ? 2.4 : 0.3);
    const st = (T % 1.6);
    const sOn = st < 0.05 || (st > 0.16 && st < 0.2);
    for (const s of this.strobes) s.scale.setScalar(sOn ? 4 : 0.05);
    // path (cutscene)
    if (this.keys) {
      this.pt += dt;
      const u0 = this.u(this.pt), u1 = this.u(this.pt + 0.05);
      const p = this.path.getPoint(u0), q = this.path.getPoint(Math.min(1, u1 + 1e-4));
      this.vel.subVectors(q, p).divideScalar(0.05);
      const gp = this.group;
      gp.position.copy(p);
      const dx = q.x - p.x, dz = q.z - p.z, dy = q.y - p.y;
      const hl = Math.hypot(dx, dz);
      if (hl > 1e-4) {
        const yaw = Math.atan2(-dx, -dz);
        let dyaw = yaw - gp.rotation.y;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        gp.rotation.y += dyaw * Math.min(1, dt * 3);
        const pitch = Math.atan2(dy, hl);
        const kp = this.keys.find((k) => k.pitch != null && Math.abs(k.t - this.pt) < 3);
        gp.rotation.x += ((kp ? kp.pitch : pitch) - gp.rotation.x) * Math.min(1, dt * 1.5);
        gp.rotation.z += (Math.max(-0.35, Math.min(0.35, -dyaw * 2.5)) - gp.rotation.z) * Math.min(1, dt * 1.2);
      }
      if (this.pt >= this.dur) this.keys = null;
    }
    if (this.snd) {
      const k = Math.max(...this.rpm);
      this.snd.set(this.group.position, (this.sndVol ?? 1) * (0.2 + k * 0.9), this.vel || null);
    }
  }
}
