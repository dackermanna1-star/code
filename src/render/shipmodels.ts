/**
 * Procedural spacecraft models (no external assets) + engine plumes and
 * re-entry plasma. Convention: nose −Z, up +Y, engines at +Z.
 */
import * as THREE from 'three';
import type { ShipClass } from '../sim/ship';
import { PRE_EXPOSURE_GLSL, PRE_EXPOSURE_TEX } from './exposure';

/** Make a built-in material write pre-exposed radiance (see exposure.ts). */
export function preExposed<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.tPreExposure = PRE_EXPOSURE_TEX;
    shader.fragmentShader = PRE_EXPOSURE_GLSL + shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      '#include <dithering_fragment>\n  gl_FragColor.rgb = min(gl_FragColor.rgb * uPreExposure, vec3(6e4));',
    );
  };
  return m;
}

function hull(color: number, rough = 0.45, metal = 0.6) {
  return preExposed(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
}
function emissive(color: number, intensity: number) {
  return preExposed(new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: 0.6 }));
}
const glass = () => preExposed(new THREE.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.08, metalness: 0.9 }));

function lathe(points: [number, number][], segs = 24, mat: THREE.Material) {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  g.rotateX(Math.PI / 2); // axis Y → Z
  return new THREE.Mesh(g, mat);
}

function wing(span: number, root: number, tip: number, sweep: number, thick: number, mat: THREE.Material, side: number) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(span * side, sweep);
  s.lineTo(span * side, sweep + tip);
  s.lineTo(0, root);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.3, bevelSize: thick * 0.3, bevelSegments: 1 });
  g.rotateX(Math.PI / 2);
  g.translate(0, thick / 2, 0);
  return new THREE.Mesh(g, mat);
}

export interface ShipModel {
  group: THREE.Group;
  engines: { pos: THREE.Vector3; radius: number }[];
  cockpit: THREE.Vector3;
  gear: THREE.Object3D[];
  length: number;
}

export function buildShip(cls: ShipClass): ShipModel {
  const g = new THREE.Group();
  const engines: { pos: THREE.Vector3; radius: number }[] = [];
  const gear: THREE.Object3D[] = [];
  let cockpit = new THREE.Vector3(0, 1, -5);
  let length = 20;
  const white = hull(0xd8dce2, 0.38, 0.55), grey = hull(0x7a8088, 0.5, 0.7), dark = hull(0x30343a, 0.6, 0.6), accent = hull(0xc8642a, 0.5, 0.3);
  const nozzleMat = hull(0x4a4e55, 0.3, 0.95);
  const glow = emissive(0x9fd0ff, 0.05);
  if (cls === 'scout') {
    length = 22;
    const body = lathe([[0, -11], [0.9, -9], [1.8, -5], [2.2, 0], [2.0, 5], [1.5, 9], [1.2, 10.5], [0, 10.6]], 20, white);
    body.scale.set(1.25, 0.75, 1);
    g.add(body);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass());
    canopy.scale.set(1.1, 0.8, 2.6);
    canopy.position.set(0, 1.1, -5.5);
    g.add(canopy);
    for (const side of [-1, 1]) {
      const w = wing(7.5, 9, 3, 6, 0.35, grey, side);
      w.position.set(side * 1.8, -0.2, -1);
      g.add(w);
      const fin = wing(2.6, 4, 1.4, 2.2, 0.2, accent, side);
      fin.rotation.z = side * 1.2;
      fin.position.set(side * 1.2, 0.8, 5.5);
      g.add(fin);
      const nac = lathe([[0, -3], [0.75, -2.5], [0.85, 2.5], [0.7, 3.4]], 16, dark);
      nac.position.set(side * 2.6, -0.3, 7);
      g.add(nac);
      const noz = lathe([[0.55, 0], [0.75, 1.2]], 16, nozzleMat);
      noz.position.set(side * 2.6, -0.3, 10.3);
      g.add(noz);
      engines.push({ pos: new THREE.Vector3(side * 2.6, -0.3, 11.5), radius: 0.7 });
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), emissive(side < 0 ? 0xff3030 : 0x30ff60, 3));
      tip.position.set(side * 9.2, -0.2, 5.5);
      g.add(tip);
    }
    for (const [x, z] of [[0, -6], [-2.2, 4], [2.2, 4]]) {
      const leg = new THREE.Group();
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 6), grey);
      strut.position.y = -1.1;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.15, 10), dark);
      pad.position.y = -2.2;
      leg.add(strut, pad);
      leg.position.set(x, -0.4, z);
      gear.push(leg);
      g.add(leg);
    }
    cockpit = new THREE.Vector3(0, 1.25, -5.8);
  } else if (cls === 'lander') {
    length = 9;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 3.2, 8), white);
    body.rotation.x = 0;
    g.add(body);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.4, 1.2, 8), grey);
    top.position.y = 2.2;
    g.add(top);
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.1), glass());
    win.position.set(0, 0.9, -2.55);
    g.add(win);
    const noz = lathe([[0.4, 0], [1.1, 1.4]], 16, nozzleMat);
    noz.rotation.x = -Math.PI / 2; // nozzle downward (lander thrusts along +Y)
    noz.position.set(0, -1.6, 0);
    g.add(noz);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = new THREE.Group();
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.4, 6), grey);
      strut.rotation.z = 0.6;
      strut.position.set(1.2, -1.1, 0);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.15, 10), dark);
      pad.position.set(2.2, -2.5, 0);
      leg.add(strut, pad);
      leg.rotation.y = a;
      gear.push(leg);
      g.add(leg);
      const rcs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), accent);
      rcs.position.set(Math.cos(a) * 2.5, 1.2, Math.sin(a) * 2.5);
      g.add(rcs);
    }
    engines.push({ pos: new THREE.Vector3(0, -3.0, 0), radius: 1.0 });
    cockpit = new THREE.Vector3(0, 0.9, -1.8);
  } else if (cls === 'cruiser') {
    length = 96;
    const spine = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 70), grey);
    g.add(spine);
    const bridge = lathe([[0, -48], [3, -45], [5, -40], [5, -30], [3, -26]], 20, white);
    g.add(bridge);
    const win = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.9, 1.2, 24, 1, true, -0.6, 1.2), glass());
    win.rotation.x = Math.PI / 2;
    win.position.z = -42;
    g.add(win);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(12, 1.6, 12, 48), white);
    ring.position.z = -18;
    g.add(ring);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.6, 11, 0.6), grey);
      s.rotation.z = (i * Math.PI) / 2;
      s.position.z = -18;
      g.add(s);
    }
    for (let i = 0; i < 4; i++) {
      const tank = new THREE.Mesh(new THREE.SphereGeometry(4.2, 20, 14), accent);
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      tank.position.set(Math.cos(a) * 5.5, Math.sin(a) * 5.5, 8);
      g.add(tank);
    }
    for (const side of [-1, 1]) {
      const rad = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 18), emissive(0x401808, 0.6));
      rad.position.set(side * 9, 0, 22);
      g.add(rad);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const noz = lathe([[1.2, 0], [2.6, 5]], 20, nozzleMat);
      noz.position.set(Math.cos(a) * 2.6, Math.sin(a) * 2.6, 36);
      g.add(noz);
      engines.push({ pos: new THREE.Vector3(Math.cos(a) * 2.6, Math.sin(a) * 2.6, 41), radius: 2.4 });
    }
    cockpit = new THREE.Vector3(0, 2, -44);
  } else if (cls === 'heavy') {
    length = 210;
    const main = new THREE.Mesh(new THREE.BoxGeometry(26, 18, 150), grey);
    g.add(main);
    const prow = new THREE.Mesh(new THREE.CylinderGeometry(0, 15, 40, 4), white);
    prow.rotation.x = -Math.PI / 2;
    prow.rotation.y = Math.PI / 4;
    prow.position.z = -95;
    g.add(prow);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(10, 12, 18), white);
    tower.position.set(0, 14, -40);
    g.add(tower);
    const tw = new THREE.Mesh(new THREE.BoxGeometry(10.2, 2, 0.3), glow);
    tw.position.set(0, 16, -49.2);
    g.add(tw);
    for (let i = 0; i < 6; i++) for (const side of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 18), i % 2 ? accent : dark);
      c.position.set(side * 17, (i % 3) * 2 - 2, -30 + i * 20);
      g.add(c);
    }
    for (let i = 0; i < 4; i++) {
      const x = (i % 2 ? 1 : -1) * 7, y = i < 2 ? -4 : 4;
      const noz = lathe([[2.5, 0], [5.5, 10]], 20, nozzleMat);
      noz.position.set(x, y, 75);
      g.add(noz);
      engines.push({ pos: new THREE.Vector3(x, y, 85), radius: 5 });
    }
    cockpit = new THREE.Vector3(0, 16, -48);
  } else {
    length = 44;
    const body = lathe([[0, -22], [1.2, -18], [2.2, -8], [2.4, 6], [1.6, 16], [1.4, 20], [0, 20.2]], 20, white);
    g.add(body);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), glass());
    canopy.scale.set(1.2, 0.8, 3);
    canopy.position.set(0, 1.6, -12);
    g.add(canopy);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(14, 0.9, 12, 64), grey);
    ring.position.z = 2;
    g.add(ring);
    const ringGlow = new THREE.Mesh(new THREE.TorusGeometry(14, 0.35, 8, 64), emissive(0x5aa8ff, 4));
    ringGlow.position.z = 2;
    g.add(ringGlow);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 12, 0.8), grey);
      s.rotation.z = (i * Math.PI) / 2 + Math.PI / 4;
      s.position.z = 2;
      g.add(s);
    }
    const noz = lathe([[0.9, 0], [1.6, 2.4]], 16, nozzleMat);
    noz.position.z = 19.5;
    g.add(noz);
    engines.push({ pos: new THREE.Vector3(0, 0, 22), radius: 1.4 });
    cockpit = new THREE.Vector3(0, 1.7, -12.5);
  }
  g.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return { group: g, engines, cockpit, gear, length };
}

const PLUME_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vP;
varying vec3 vN;
varying vec3 vW;
void main() {
  vP = position;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;
const PLUME_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${PRE_EXPOSURE_GLSL}
uniform float uLevel;
uniform float uAir;   // 0 vacuum .. 1 dense air
uniform float uTime;
varying vec3 vP;
varying vec3 vN;
varying vec3 vW;
void main() {
  #include <logdepthbuf_fragment>
  float t = clamp(vP.y, 0.0, 1.0);          // 0 at nozzle → 1 at tail (cone along +Y in object space)
  vec3 V = normalize(-vW);
  float edge = pow(abs(dot(normalize(vN), V)), 1.5);
  // shock diamonds in air
  float diamonds = 1.0 + uAir * 0.5 * pow(0.5 + 0.5 * cos(t * 40.0 - uTime * 3.0), 4.0) * (1.0 - t);
  vec3 core = mix(vec3(0.6, 0.75, 1.0), vec3(1.0, 0.55, 0.25), smoothstep(0.05, 0.7, t) * uAir);
  float a = uLevel * edge * pow(1.0 - t, mix(3.0, 1.4, uAir)) * diamonds;
  gl_FragColor = vec4(core * a * mix(0.4, 3.0, uAir) * uPreExposure, 1.0);
}
`;

const PLASMA_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${PRE_EXPOSURE_GLSL}
uniform float uHeat;
uniform vec3 uFlow;   // airflow direction (world): plasma piles up on the windward side
uniform float uTime;
varying vec3 vP;
varying vec3 vN;
varying vec3 vW;
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vN);
  vec3 V = normalize(-vW);
  float rim = pow(1.0 - abs(dot(N, V)), 2.0);
  float windward = smoothstep(-0.2, 0.9, dot(N, -uFlow));
  float flicker = 0.8 + 0.2 * sin(uTime * 37.0 + vP.x * 3.0) * sin(uTime * 23.0 + vP.z * 2.0);
  vec3 col = mix(vec3(1.0, 0.35, 0.1), vec3(1.0, 0.75, 0.95), windward);
  gl_FragColor = vec4(col * uHeat * (0.3 + 2.5 * windward) * (0.4 + rim) * flicker * 0.6 * uPreExposure, 1.0);
}
`;

export class ShipRenderer {
  readonly root = new THREE.Group();
  readonly model: ShipModel;
  readonly plumes: THREE.Mesh[] = [];
  readonly plasma: THREE.Mesh;
  readonly sun1 = new THREE.DirectionalLight(0xffffff, 1);
  readonly sun2 = new THREE.DirectionalLight(0xffffff, 0);
  readonly hemi = new THREE.HemisphereLight(0x8899aa, 0x332211, 0);
  private plumeMat: THREE.ShaderMaterial;
  private plasmaMat: THREE.ShaderMaterial;

  constructor(readonly cls: ShipClass) {
    this.model = buildShip(cls);
    this.root.add(this.model.group);
    this.plumeMat = new THREE.ShaderMaterial({
      vertexShader: PLUME_VERT, fragmentShader: PLUME_FRAG,
      uniforms: { uLevel: { value: 0 }, uAir: { value: 0 }, uTime: { value: 0 }, tPreExposure: PRE_EXPOSURE_TEX },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    for (const e of this.model.engines) {
      // plume: nozzle-width at y=0, tapering toward the tail at y=1
      const cone = new THREE.CylinderGeometry(0.4, 1, 1, 20, 1, true);
      cone.translate(0, 0.5, 0);
      const m = new THREE.Mesh(cone, this.plumeMat);
      m.position.copy(e.pos);
      m.rotation.x = Math.PI / 2; // object +Y → ship +Z (exhaust direction)
      m.scale.set(e.radius, e.radius * 10, e.radius);
      m.renderOrder = 20;
      m.frustumCulled = false;
      if (this.cls === 'lander') {
        m.rotation.x = Math.PI; // lander exhaust points down (−Y)
      }
      this.plumes.push(m);
      this.model.group.add(m);
    }
    this.plasmaMat = new THREE.ShaderMaterial({
      vertexShader: PLUME_VERT, fragmentShader: PLASMA_FRAG,
      uniforms: { uHeat: { value: 0 }, uFlow: { value: new THREE.Vector3(0, 0, 1) }, uTime: { value: 0 }, tPreExposure: PRE_EXPOSURE_TEX },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.plasma = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), this.plasmaMat);
    this.plasma.scale.set(this.model.length * 0.42, this.model.length * 0.25, this.model.length * 0.65);
    this.plasma.renderOrder = 21;
    this.plasma.visible = false;
    this.model.group.add(this.plasma);
    this.root.add(this.sun1, this.sun2, this.hemi, this.sun1.target, this.sun2.target);
  }

  update(time: number, engineLevel: number, air: number, heat: number, flowWorld: THREE.Vector3, gearDown: boolean) {
    const u = this.plumeMat.uniforms;
    u.uLevel.value = engineLevel;
    u.uAir.value = Math.min(1, air);
    u.uTime.value = time % 1000;
    const len = 6 + 14 * Math.min(1, air) + 4 * engineLevel;
    for (let i = 0; i < this.plumes.length; i++) {
      const e = this.model.engines[i];
      this.plumes[i].visible = engineLevel > 0.01;
      this.plumes[i].scale.set(e.radius * (1 + (1 - Math.min(1, air)) * 1.5), e.radius * len * (0.4 + engineLevel), e.radius * (1 + (1 - Math.min(1, air)) * 1.5));
    }
    this.plasma.visible = heat > 0.02;
    this.plasmaMat.uniforms.uHeat.value = heat;
    this.plasmaMat.uniforms.uTime.value = time % 1000;
    this.plasmaMat.uniforms.uFlow.value.copy(flowWorld);
    for (const g of this.model.gear) g.visible = gearDown;
  }

  /** Light the ship from the system's stars. dir* point toward the stars; E* are illuminances. */
  setLighting(dir1: THREE.Vector3, E1: THREE.Vector3, dir2: THREE.Vector3 | null, E2: THREE.Vector3 | null, sky: THREE.Color, ground: THREE.Color) {
    const set = (l: THREE.DirectionalLight, d: THREE.Vector3, E: THREE.Vector3) => {
      const I = Math.max(E.x, E.y, E.z, 1e-12);
      l.color.setRGB(E.x / I, E.y / I, E.z / I);
      l.intensity = I;
      l.position.copy(d).multiplyScalar(1000);
      l.target.position.set(0, 0, 0);
      l.updateMatrixWorld();
      l.target.updateMatrixWorld();
    };
    set(this.sun1, dir1, E1);
    if (dir2 && E2) set(this.sun2, dir2, E2);
    else this.sun2.intensity = 0;
    const I = Math.max(sky.r, sky.g, sky.b, ground.r, ground.g, ground.b, 1e-12);
    this.hemi.color.copy(sky).multiplyScalar(1 / I);
    this.hemi.groundColor.copy(ground).multiplyScalar(1 / I);
    this.hemi.intensity = I;
  }
}
