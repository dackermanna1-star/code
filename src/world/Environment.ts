import * as THREE from 'three';
import { ARENA } from './config';
import {
  GROUND_PPM,
  ROAD_TEX_LENGTH_M,
  ROAD_TEX_WIDTH_M,
  makeCanopyTexture,
  makeDetailNoise,
  makeGrassGroundTexture,
  makeMountainTexture,
  makeRoadTexture,
  makeTallGrassTexture,
  makeTreelineTexture,
  makeWoodTexture,
} from '../render/textures';
import { fbm2, mulberry32 } from '../core/math';
import type { AtmoState } from './Atmosphere';
import { GROUPS, Physics, RAPIER } from '../physics/Physics';

const DISTANT_VERT = /* glsl */ `
attribute float aH;
varying vec2 vUv; varying float vH; varying vec3 vN;
void main(){
  vUv = uv; vH = aH; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const DISTANT_FRAG = /* glsl */ `
uniform sampler2D map; uniform vec2 repeat; uniform vec3 color; uniform vec3 topColor; uniform vec3 hazeColor; uniform float haze;
uniform vec3 sunDir; uniform float alphaCut; uniform float useAlpha; uniform float lit; uniform float flash;
varying vec2 vUv; varying float vH; varying vec3 vN;
void main(){
  vec4 t = texture2D(map, vUv * repeat);
  if (useAlpha > 0.5 && t.a < alphaCut) discard;
  vec3 c = mix(color, topColor, clamp(vH, 0.0, 1.0));
  c *= 0.72 + 0.5 * t.r;
  float l = mix(1.0, 0.6 + 0.6 * max(dot(normalize(vN), normalize(sunDir)), 0.0), lit);
  c *= l;
  float hz = clamp(haze * (0.75 + 0.35 * (1.0 - vH)), 0.0, 1.0);
  c = mix(c, hazeColor, hz);
  c += hazeColor * flash * 0.6;
  gl_FragColor = vec4(c, 1.0);
}`;

function distantMaterial(map: THREE.Texture, repeat: [number, number], useAlpha: boolean, lit: number) {
  return new THREE.ShaderMaterial({
    vertexShader: DISTANT_VERT,
    fragmentShader: DISTANT_FRAG,
    uniforms: {
      map: { value: map },
      repeat: { value: new THREE.Vector2(repeat[0], repeat[1]) },
      color: { value: new THREE.Color() },
      topColor: { value: new THREE.Color() },
      hazeColor: { value: new THREE.Color() },
      haze: { value: 0.4 },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      alphaCut: { value: 0.5 },
      useAlpha: { value: useAlpha ? 1 : 0 },
      lit: { value: lit },
      flash: { value: 0 },
    },
    fog: false,
    side: THREE.DoubleSide,
  });
}

/** Ring of ridged mountains around the arena. */
function mountainRing(radius: number, minH: number, maxH: number, seed: number, segments = 360) {
  const rnd = mulberry32(seed);
  const off = rnd() * 100;
  const rows = 6;
  const positions: number[] = [];
  const uvs: number[] = [];
  const hs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const a = u * Math.PI * 2;
    // periodic noise sampled on a circle
    const cx = Math.cos(a) * 6 + off;
    const cz = Math.sin(a) * 6 + off;
    let n = fbm2(cx, cz, 5);
    const ridge = 1 - Math.abs(fbm2(cx * 2.1 + 30, cz * 2.1, 3) * 2 - 1);
    n = n * 0.7 + ridge * 0.35;
    const peak = minH + (maxH - minH) * Math.pow(Math.max(0, n - 0.18) / 0.82, 1.6);
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const y = -30 + (peak + 30) * t;
      // slopes rise away from the viewer
      const rr = radius * (1 + t * 0.12);
      positions.push(Math.sin(a) * rr, y, Math.cos(a) * rr);
      uvs.push(u * 40, y / 60);
      hs.push(t);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let r = 0; r < rows; r++) {
      const a0 = i * (rows + 1) + r;
      const b0 = (i + 1) * (rows + 1) + r;
      indices.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(hs, 1));
  g.setIndex(indices);
  g.computeVertexNormals();
  // computed normals face outward; flip them toward the viewer at the center
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

export class Environment {
  readonly group = new THREE.Group();
  private grassMat!: THREE.MeshLambertMaterial;
  private canopyMat!: THREE.MeshLambertMaterial;
  private groundMat!: THREE.MeshLambertMaterial;
  private roadMat!: THREE.MeshLambertMaterial;
  private mountainNear!: THREE.ShaderMaterial;
  private mountainFar!: THREE.ShaderMaterial;
  private treeline!: THREE.ShaderMaterial;
  private grassUniforms = { time: { value: 0 }, wind: { value: 1 } };
  readonly woodTex = makeWoodTexture();
  readonly detailTex = makeDetailNoise();

  constructor(private scene: THREE.Scene) {
    scene.add(this.group);
    this.buildGround();
    this.buildGrass();
    this.buildDistant();
    this.buildPoles();
    this.buildFence();
    this.buildTruck();
  }

  private buildGround() {
    const roadTex = makeRoadTexture();
    this.roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
    const len = 1400;
    const road = new THREE.PlaneGeometry(ROAD_TEX_WIDTH_M, len, 2, 70);
    road.rotateX(-Math.PI / 2);
    road.translate(0, 0, 300);
    const uv = road.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (len / ROAD_TEX_LENGTH_M));
    const roadMesh = new THREE.Mesh(road, this.roadMat);
    roadMesh.receiveShadow = true;
    roadMesh.renderOrder = -1;
    this.group.add(roadMesh);

    const grassTex = makeGrassGroundTexture();
    grassTex.repeat.set(1, 1);
    this.groundMat = new THREE.MeshLambertMaterial({ map: grassTex });
    const gsize = 1400;
    const ground = new THREE.PlaneGeometry(gsize, gsize, 40, 40);
    ground.rotateX(-Math.PI / 2);
    ground.translate(0, -0.02, 300);
    const guv = ground.getAttribute('uv') as THREE.BufferAttribute;
    const rep = gsize / (128 / GROUND_PPM);
    for (let i = 0; i < guv.count; i++) guv.setXY(i, guv.getX(i) * rep, guv.getY(i) * rep);
    const groundMesh = new THREE.Mesh(ground, this.groundMat);
    groundMesh.receiveShadow = true;
    // ground draws first so the (slightly raised) road always wins the depth test
    groundMesh.renderOrder = -2;
    this.group.add(groundMesh);
  }

  private buildGrass() {
    const tex = makeTallGrassTexture();
    this.grassMat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
    const uniforms = this.grassUniforms;
    this.grassMat.onBeforeCompile = (shader) => {
      shader.uniforms.time = uniforms.time;
      shader.uniforms.wind = uniforms.wind;
      // keep up-facing normals on both faces (no DoubleSide flip) for even field lighting
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n  normal = normalize(vNormal);',
      );
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float time; uniform float wind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vec3 ip = vec3(0.0);
          #endif
          float hw = uv.y * uv.y;
          float ph = ip.x * 0.37 + ip.z * 0.23;
          float sw = sin(time * 1.7 + ph) * 0.5 + sin(time * 2.9 + ph * 1.7) * 0.25 + sin(time * 0.6 + ip.z * 0.05) * 0.6;
          transformed.x += sw * 0.09 * hw * wind;
          transformed.z += cos(time * 1.3 + ph) * 0.05 * hw * wind;`,
        );
    };
    // clump: two crossed quads, normals pointing up for uniform field lighting
    const quad = (rot: number) => {
      const g = new THREE.PlaneGeometry(1.3, 1.25, 1, 1);
      g.translate(0, 0.625, 0);
      g.rotateY(rot);
      return g;
    };
    const g1 = quad(0);
    const g2 = quad(Math.PI / 2);
    const merged = new THREE.BufferGeometry();
    const pos = new Float32Array([...(g1.getAttribute('position').array as Float32Array), ...(g2.getAttribute('position').array as Float32Array)]);
    const uvs = new Float32Array([...(g1.getAttribute('uv').array as Float32Array), ...(g2.getAttribute('uv').array as Float32Array)]);
    const nrm = new Float32Array(pos.length);
    for (let i = 0; i < nrm.length; i += 3) nrm[i + 1] = 1;
    const idx1 = Array.from(g1.getIndex()!.array);
    const idx2 = Array.from(g2.getIndex()!.array).map((i) => i + 4);
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    merged.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    merged.setIndex([...idx1, ...idx2]);

    const rnd = mulberry32(777);
    const mats: THREE.Matrix4[] = [];
    const cols: THREE.Color[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const e = new THREE.Euler();
    const zMin = -70;
    const zMax = 260;
    const place = (x: number, z: number, hScale: number) => {
      e.set(0, rnd() * Math.PI, 0);
      q.setFromEuler(e);
      const w = 0.8 + rnd() * 0.5;
      s.set(w, hScale * (0.85 + rnd() * 0.35), w);
      p.set(x, 0, z);
      m.compose(p, q, s);
      mats.push(m.clone());
      const tone = 0.82 + rnd() * 0.28;
      cols.push(new THREE.Color(tone, tone * (0.97 + rnd() * 0.06), tone * (0.9 + rnd() * 0.1)));
    };
    for (const side of [-1, 1]) {
      // dense band near the road edge
      for (let z = zMin; z < zMax; z += 0.55) {
        for (let k = 0; k < 3; k++) {
          const x = side * (8.3 + rnd() * 4.5);
          place(x, z + rnd() * 0.5, 0.95 + rnd() * 0.15);
        }
      }
      // wider field, thinning out
      for (let i = 0; i < 16000; i++) {
        const t = Math.pow(rnd(), 1.6);
        const x = side * (12.5 + t * 34);
        const z = zMin + rnd() * (zMax - zMin);
        place(x, z, 1.0 + rnd() * 0.2);
      }
    }
    const inst = new THREE.InstancedMesh(merged, this.grassMat, mats.length);
    for (let i = 0; i < mats.length; i++) {
      inst.setMatrixAt(i, mats[i]);
      inst.setColorAt(i, cols[i]);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.receiveShadow = true;
    inst.castShadow = false;
    inst.frustumCulled = false;
    this.group.add(inst);

    // raised canopy planes beyond the instanced band (read as dense grass tops)
    const canopyTex = makeCanopyTexture();
    this.canopyMat = new THREE.MeshLambertMaterial({ map: canopyTex });
    const canopy = (x0: number, x1: number, z0: number, z1: number) => {
      const w = x1 - x0;
      const d = z1 - z0;
      const g = new THREE.PlaneGeometry(w, d, Math.max(1, Math.round(w / 40)), Math.max(1, Math.round(d / 40)));
      g.rotateX(-Math.PI / 2);
      g.translate((x0 + x1) / 2, 1.0, (z0 + z1) / 2);
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 12.8, (uv.getY(i) * d) / 12.8);
      const mesh = new THREE.Mesh(g, this.canopyMat);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    };
    canopy(44, 420, -420, 700);
    canopy(-420, -44, -420, 700);
    canopy(9.5, 44, zMax - 2, 700);
    canopy(-44, -9.5, zMax - 2, 700);
    canopy(9.5, 44, -420, zMin + 2);
    canopy(-44, -9.5, -420, zMin + 2);
  }

  private buildDistant() {
    const mtex = makeMountainTexture();
    this.mountainNear = distantMaterial(mtex, [1, 1], false, 1);
    this.mountainFar = distantMaterial(mtex, [1, 1], false, 1);
    const near = new THREE.Mesh(mountainRing(620, 18, 95, 11, 300), this.mountainNear);
    const far = new THREE.Mesh(mountainRing(860, 60, 260, 29, 360), this.mountainFar);
    near.position.z = 120;
    far.position.z = 120;
    near.renderOrder = -10;
    far.renderOrder = -11;
    this.group.add(far, near);

    const ttex = makeTreelineTexture();
    this.treeline = distantMaterial(ttex, [30, 1], true, 0);
    const tg = new THREE.CylinderGeometry(430, 430, 34, 256, 1, true);
    const tuv = tg.getAttribute('uv') as THREE.BufferAttribute;
    const th = new Float32Array(tuv.count);
    for (let i = 0; i < tuv.count; i++) th[i] = tuv.getY(i);
    tg.setAttribute('aH', new THREE.BufferAttribute(th, 1));
    const tl = new THREE.Mesh(tg, this.treeline);
    tl.position.set(0, 16, 120);
    this.group.add(tl);
  }

  private buildPoles() {
    const poleMat = new THREE.MeshLambertMaterial({ map: this.woodTex, color: 0x8a6a4a });
    const poleGeo = new THREE.BoxGeometry(0.26, 9, 0.26);
    poleGeo.translate(0, 4.5, 0);
    const barGeo = new THREE.BoxGeometry(2.2, 0.16, 0.16);
    barGeo.translate(0, 8.3, 0);
    const xs = 10.8;
    const zs: number[] = [];
    for (let z = -330; z < 900; z += 36) zs.push(z);
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, zs.length);
    const bars = new THREE.InstancedMesh(barGeo, poleMat, zs.length);
    const m = new THREE.Matrix4();
    zs.forEach((z, i) => {
      const tilt = (Math.sin(z * 0.13) * 0.03);
      m.makeRotationZ(tilt).setPosition(xs, 0, z);
      poles.setMatrixAt(i, m);
      bars.setMatrixAt(i, m);
    });
    poles.castShadow = true;
    poles.receiveShadow = true;
    bars.castShadow = true;
    this.group.add(poles, bars);
    // sagging wires
    const pts: number[] = [];
    for (let i = 0; i < zs.length - 1; i++) {
      for (const wx of [-0.95, 0, 0.95]) {
        const segs = 8;
        for (let s = 0; s < segs; s++) {
          const t0 = s / segs;
          const t1 = (s + 1) / segs;
          const y0 = 8.35 - Math.sin(t0 * Math.PI) * 0.9;
          const y1 = 8.35 - Math.sin(t1 * Math.PI) * 0.9;
          pts.push(xs + wx, y0, zs[i] + (zs[i + 1] - zs[i]) * t0, xs + wx, y1, zs[i] + (zs[i + 1] - zs[i]) * t1);
        }
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1a1a1a }));
    this.group.add(wires);
  }

  private buildFence() {
    const mat = new THREE.MeshLambertMaterial({ map: this.woodTex, color: 0x9a7a58 });
    const geo = new THREE.BoxGeometry(0.14, 1.5, 0.14);
    geo.translate(0, 0.75, 0);
    const zs: number[] = [];
    for (let z = ARENA.zMin; z <= ARENA.zMax; z += 3) zs.push(z);
    const inst = new THREE.InstancedMesh(geo, mat, zs.length * 2);
    const m = new THREE.Matrix4();
    let i = 0;
    for (const side of [-1, 1]) {
      for (const z of zs) {
        m.makeRotationZ((Math.sin(z * 1.7 + side) * 0.06)).setPosition(side * (ARENA.halfWidth + 0.3), 0, z);
        inst.setMatrixAt(i++, m);
      }
    }
    inst.castShadow = true;
    this.group.add(inst);
    const pts: number[] = [];
    for (const side of [-1, 1]) {
      for (const h of [0.55, 1.05, 1.38]) {
        pts.push(side * (ARENA.halfWidth + 0.3), h, ARENA.zMin, side * (ARENA.halfWidth + 0.3), h, ARENA.zMax);
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.group.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x3a3a36 })));
  }

  /** The survivor's pickup truck parked across the road behind the start. */
  private buildTruck() {
    const g = new THREE.Group();
    const body = new THREE.MeshLambertMaterial({ color: 0x7a2e24, map: this.detailTex });
    const dark = new THREE.MeshLambertMaterial({ color: 0x222326, map: this.detailTex });
    const glass = new THREE.MeshLambertMaterial({ color: 0x31414a, emissive: 0x0b1216 });
    const chrome = new THREE.MeshLambertMaterial({ color: 0xb8b8b0 });
    const rust = new THREE.MeshLambertMaterial({ color: 0x5a3a24, map: this.detailTex });
    const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    // chassis along X (truck sideways across the road)
    add(5.4, 0.55, 1.95, 0, 0.75, 0, body);
    add(1.9, 0.5, 1.9, 1.75, 1.25, 0, body); // hood
    add(1.6, 1.0, 1.9, 0.2, 1.5, 0, body); // cab
    add(1.2, 0.55, 1.92, 0.25, 1.75, 0, glass);
    add(2.4, 0.45, 0.12, -1.65, 1.25, 0.92, body); // bed walls
    add(2.4, 0.45, 0.12, -1.65, 1.25, -0.92, body);
    add(0.12, 0.45, 1.9, -2.83, 1.25, 0, body);
    add(2.4, 0.08, 1.8, -1.65, 1.05, 0, rust);
    add(0.2, 0.3, 2.0, 2.75, 0.75, 0, chrome); // bumper
    add(0.2, 0.3, 2.0, -2.75, 0.62, 0, chrome);
    for (const [x, z] of [[1.7, 0.95], [1.7, -0.95], [-1.7, 0.95], [-1.7, -0.95]]) {
      const w = add(0.8, 0.8, 0.32, x, 0.4, z, dark);
      w.rotation.set(0, 0, 0);
    }
    // supplies in the bed
    add(0.6, 0.45, 0.5, -1.2, 1.35, 0.4, new THREE.MeshLambertMaterial({ color: 0x4a5a32, map: this.detailTex }));
    add(0.5, 0.35, 0.4, -2.1, 1.3, -0.3, new THREE.MeshLambertMaterial({ color: 0x3c4a2a, map: this.detailTex }));
    add(0.35, 0.6, 0.35, -1.6, 1.4, -0.5, new THREE.MeshLambertMaterial({ color: 0xa02a1a, map: this.detailTex }));
    g.position.set(-1.2, 0, ARENA.zMin + 1.6);
    g.rotation.y = 0.12;
    this.group.add(g);
    this.truck = g;
  }
  truck!: THREE.Group;

  /** Static colliders: ground, arena bounds and the truck. */
  addColliders(physics: Physics) {
    const w = physics.world;
    const ground = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 60));
    w.createCollider(RAPIER.ColliderDesc.cuboid(400, 0.5, 400).setCollisionGroups(GROUPS.world).setFriction(0.9), ground);
    const bounds = w.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const zc = (ARENA.zMin + ARENA.zMax) / 2;
    const zh = (ARENA.zMax - ARENA.zMin) / 2 + 2;
    const wall = (hx: number, hy: number, hz: number, x: number, y: number, z: number) =>
      w.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setCollisionGroups(GROUPS.bounds).setFriction(0.1), bounds);
    wall(0.5, 6, zh, ARENA.halfWidth + 0.5, 5, zc);
    wall(0.5, 6, zh, -ARENA.halfWidth - 0.5, 5, zc);
    wall(ARENA.halfWidth + 1, 6, 0.5, 0, 5, ARENA.zMin - 0.5);
    wall(ARENA.halfWidth + 1, 6, 0.5, 0, 5, ARENA.zMax + 0.5);
    // truck
    const t = this.truck;
    const tb = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(t.position.x, 0, t.position.z).setRotation(new THREE.Quaternion().setFromEuler(t.rotation)));
    w.createCollider(RAPIER.ColliderDesc.cuboid(2.8, 0.9, 1.0).setTranslation(0, 0.9, 0).setCollisionGroups(GROUPS.world), tb);
  }

  update(dt: number, s: AtmoState, time: number) {
    this.grassUniforms.time.value = time;
    this.grassUniforms.wind.value = 1 + s.rain * 0.8 + s.storm * 1.2;
    this.grassMat.color.copy(s.grassTint);
    this.canopyMat.color.copy(s.grassTint).multiplyScalar(0.92);
    this.groundMat.color.copy(s.grassTint);
    const wet = s.rain;
    this.roadMat.color.setScalar(1 - wet * 0.25);

    const set = (m: THREE.ShaderMaterial, col: THREE.Color, top: THREE.Color, haze: number) => {
      (m.uniforms.color.value as THREE.Color).copy(col);
      (m.uniforms.topColor.value as THREE.Color).copy(top);
      (m.uniforms.hazeColor.value as THREE.Color).copy(s.fogColor);
      m.uniforms.haze.value = haze;
      (m.uniforms.sunDir.value as THREE.Vector3).copy(s.sunDir);
    };
    const nearTop = s.mountainNear.clone().lerp(s.mountainFar, 0.25).multiplyScalar(1.12);
    set(this.mountainNear, s.mountainNear, nearTop, Math.min(1, s.haze * 0.75 + s.fogDensity * 20));
    const farTop = s.mountainFar.clone().multiplyScalar(1.1);
    set(this.mountainFar, s.mountainFar, farTop, Math.min(1, s.haze * 1.0 + s.fogDensity * 30));
    set(this.treeline, s.treeColor, s.treeColor.clone().multiplyScalar(1.3), Math.min(1, s.haze * 0.3 + s.fogDensity * 10));
  }

  setLightningFlash(v: number) {
    this.mountainNear.uniforms.flash.value = v;
    this.mountainFar.uniforms.flash.value = v;
    this.treeline.uniforms.flash.value = v;
  }
}
