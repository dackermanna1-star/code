import * as THREE from 'three';

/**
 * Skinned render mesh for one ragdoll. Bones are driven directly by the rigid bodies (interpolated
 * between physics frames); the bind matrices map each segment's body frame into the sculpt pose
 * the mesh was polygonised in. Fractures add bones at run time (the distal fragment of a broken
 * bone gets its own body and the affected vertices are re-skinned to it).
 *
 * Skin shading: a physical material extended with
 *   - wound decals evaluated in sculpt space (entry/exit wounds, lacerations, bruises),
 *   - a per-vertex `blood` attribute fed by the skin blood-flow simulation (wet, dark red film).
 */

export const MAX_WOUNDS = 256;
const MAX_EXTRA_BONES = 12;

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);

export function segmentBindMatrix(shape, seg, out = new THREE.Matrix4()) {
  // body-local -> sculpt space: x_model = R (bindPos + x - pivot) + pivot
  const mp = shape.modelPose[seg.name];
  const R = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(mp.q.x, mp.q.y, mp.q.z, mp.q.w));
  const T1 = new THREE.Matrix4().makeTranslation(seg.bindPos.x - mp.pivot.x, seg.bindPos.y - mp.pivot.y, seg.bindPos.z - mp.pivot.z);
  const T2 = new THREE.Matrix4().makeTranslation(mp.pivot.x, mp.pivot.y, mp.pivot.z);
  return out.copy(T2).multiply(R).multiply(T1);
}

const SKIN_VERT_PARS = /* glsl */ `
attribute float blood;
varying float vBlood;
varying vec3 vModelPos;
`;

const SKIN_FRAG_PARS = /* glsl */ `
#define MAX_WOUNDS ${MAX_WOUNDS}
// wound table, one column per wound:
//   row 0: xyz sculpt-space centre, w radius (m)
//   row 1: x kind (0 entry, 1 exit, 2 laceration, 3 bruise, 4 abrasion), y age (s), z severity, w seed
//   row 2: xyz direction (sculpt space)
uniform sampler2D uWounds;
uniform int uWoundCount;
uniform float uPallor;                // 0..1 blood-loss pallor
uniform float uCyanosis;              // 0..1 lack of oxygen
varying float vBlood;
varying vec3 vModelPos;

float hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i + vec3(0, 0, 0)), hash31(i + vec3(1, 0, 0)), f.x),
                 mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x),
                 mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}

uniform vec4 uZombie;   // x on, y seed, z rot, w gore
uniform vec3 uShirt;
uniform vec3 uPants;
uniform vec3 uShoes;
uniform float uSleeves;

// The undead's look in sculpt space (feet at y = 0, facing +z, left = +x; shoulders at 1.43, hips
// at 0.93, elbows at 1.14 and |x| ~ 0.24 in the bind pose). Returns how much of the point is cloth.
float zombieShade(vec3 P, inout vec3 col) {
  float sd = uZombie.y * 17.0;
  float n1 = fbm(P * 9.0 + sd), n2 = vnoise(P * 35.0 + sd * 1.7), n3 = fbm(P * 3.0 - sd);
  float ax = abs(P.x);
  // skin: blotches of rot (purple-green), darker veins, a waxy sheen gone
  float rot = smoothstep(0.55, 0.75, n3 + 0.15 * n2) * uZombie.z;
  col = mix(col, vec3(0.31, 0.27, 0.33) * (0.7 + 0.3 * n2), rot * 0.75);
  float vein = 1.0 - smoothstep(0.0, 0.035, abs(vnoise(P * vec3(14.0, 22.0, 14.0) + sd) - 0.5));
  col *= 1.0 - 0.22 * vein * uZombie.z;
  // regions of the clothes
  bool armZone = ax > 0.2 && P.y > 0.85 && P.y < 1.47;
  float sleeveEnd = mix(1.47, 1.13, uSleeves); // short sleeves to the elbow
  bool sleeve = armZone && P.y > sleeveEnd;
  bool torso = !armZone && P.y > 0.95 && P.y < 1.44 + 0.03 * smoothstep(0.1, 0.0, ax);
  bool legs = P.y > 0.11 && P.y <= 0.99 && !armZone;
  bool feet = P.y <= 0.11;
  float c = 0.0;
  vec3 cc = col;
  if (torso || sleeve) { cc = uShirt; c = 1.0; }
  else if (legs) { cc = uPants; c = 1.0; }
  else if (feet) { cc = uShoes; c = 1.0; }
  if (c > 0.0 && !feet) {
    // torn: holes and ragged edges show the skin underneath; filth everywhere
    float tear = n1 + 0.2 * n2 - (torso ? 0.0 : 0.05);
    float hole = smoothstep(0.79, 0.82, tear);
    float edge = smoothstep(0.74, 0.79, tear) - hole;
    cc *= 0.55 + 0.6 * fbm(P * 14.0 + sd * 3.0);
    cc = mix(cc, cc * vec3(0.55, 0.45, 0.35), smoothstep(0.4, 0.8, n3) * 0.6);
    // weave
    cc *= 0.94 + 0.06 * sin(P.x * 900.0) * sin(P.y * 900.0);
    cc = mix(cc, cc * 0.35, edge);
    c *= 1.0 - hole;
  }
  col = mix(col, cc, c);
  // dried blood: round the mouth, down the chin and the shirt front
  float mouth = smoothstep(0.05, 0.0, length((P - vec3(0.0, 1.635, 0.105)) * vec3(1.0, 1.3, 1.5)));
  float drip = smoothstep(0.08, 0.0, ax) * step(P.z, 0.25) * step(0.0, P.z) * smoothstep(1.66, 1.3, P.y) * step(1.05, P.y)
    * smoothstep(0.45, 0.65, fbm(vec3(P.x * 20.0, P.y * 4.0, sd)));
  float gore = clamp(mouth * 0.9 + drip * 0.8 + smoothstep(0.72, 0.8, n3 + 0.2 * n2) * 0.6, 0.0, 1.0) * uZombie.w;
  col = mix(col, vec3(0.14, 0.02, 0.015) * (0.7 + 0.5 * n2), gore);
  // clouded eyes
  for (int i = 0; i < 2; i++) {
    vec3 E = vec3(i == 0 ? 0.031 : -0.031, 1.686, 0.087);
    float e = smoothstep(0.012, 0.006, length(P - E));
    col = mix(col, vec3(0.86, 0.85, 0.72), e);
  }
  return c * (1.0 - gore * 0.5);
}

// Accumulates wound appearance at this skin point.
// returns: rgb = colour to blend, a = blend amount; wet = wetness, depth = darkening of the hole
vec4 woundShade(vec3 P, out float wet, out float hole) {
  vec3 col = vec3(0.0);
  float amt = 0.0;
  wet = 0.0;
  hole = 0.0;
  for (int i = 0; i < MAX_WOUNDS; i++) {
    if (i >= uWoundCount) break;
    vec4 wp = texelFetch(uWounds, ivec2(i, 0), 0);
    vec3 d = P - wp.xyz;
    float r = wp.w;
    float dist = length(d);
    // cheap reject: every effect fades out within a few radii of the wound
    if (dist > r * 7.5) continue;
    vec4 wi = texelFetch(uWounds, ivec2(i, 1), 0);
    float kind = wi.x;
    float sev = wi.z;
    if (kind > 2.5 && dist > r * 1.6) continue;
    if (kind < 2.5) {
      // penetrating wound: irregular dark hole, raw tissue rim, abrasion collar, haemorrhage halo
      float n = fbm(P * 260.0 + wi.w * 13.0);
      float rr = r * (kind > 0.5 ? (0.75 + 0.6 * n) : (0.9 + 0.25 * n));
      if (kind > 1.5) {
        // laceration: stretched along the cut direction
        vec3 ax = normalize(texelFetch(uWounds, ivec2(i, 2), 0).xyz + 1e-5);
        float along = dot(d, ax);
        vec3 perp = d - ax * along;
        dist = length(perp + ax * along * 0.28);
        rr = r * (0.6 + 0.5 * n);
      }
      // hole, abrasion collar (entry) or torn everted tissue (exit), haemorrhage into the skin
      float core = 1.0 - smoothstep(rr * 0.45, rr * 0.95, dist);
      float rim = (1.0 - smoothstep(rr * 0.8, rr * (kind > 0.5 ? 1.9 : 1.45), dist)) * (1.0 - core);
      float halo = 1.0 - smoothstep(rr, rr * (3.5 + 3.0 * sev), dist);
      halo *= halo * 0.38;
      vec3 rimCol = kind > 0.5 ? mix(vec3(0.16, 0.012, 0.012), vec3(0.42, 0.13, 0.12), n) : vec3(0.14, 0.035, 0.03);
      vec3 c = vec3(0.3, 0.1, 0.11);
      float a = halo;
      c = mix(c, rimCol, rim);
      a = max(a, rim * 0.95);
      c = mix(c, vec3(0.018, 0.0015, 0.0015), core);
      a = max(a, core);
      col = mix(col, c, a);
      amt = max(amt, a);
      wet = max(wet, max(core, rim * 0.7));
      hole = max(hole, core);
    } else if (kind < 3.5) {
      // bruise / contusion: deepens over time from red to blue-purple
      float n = fbm(P * 70.0 + wi.w * 7.0);
      float age = wi.y;
      float grow = smoothstep(0.0, 8.0, age);
      float rr = r * (0.75 + 0.5 * n);
      float b = (1.0 - smoothstep(rr * 0.3, rr, dist)) * (0.35 + 0.65 * grow) * clamp(sev, 0.0, 1.0);
      vec3 c = mix(vec3(0.62, 0.16, 0.17), vec3(0.28, 0.12, 0.3), grow);
      col = mix(col, c, b * 0.8);
      amt = max(amt, b * 0.8);
    } else {
      // abrasion / scrape (road rash): raw red patch with fine grain
      float n = fbm(P * 400.0 + wi.w * 5.0);
      float b = (1.0 - smoothstep(r * 0.6, r, dist + (n - 0.5) * r * 0.5)) * clamp(sev, 0.0, 1.0);
      col = mix(col, vec3(0.55, 0.1, 0.08) * (0.7 + 0.5 * n), b);
      amt = max(amt, b * 0.85);
      wet = max(wet, b * 0.4);
    }
  }
  return vec4(col, amt);
}
`;

/**
 * Skin material. opts.zombie = { shirt, pants, shoes ([r,g,b] 0..1), seed, sleeves (0 none .. 1
 * to the elbow), rot (0..1), gore (0..1) } dresses the body in torn, filthy clothes (by region of
 * the sculpt pose) over grey-green, blotched skin with dried blood round the mouth and clouded eyes.
 */
export function createSkinMaterial(opts = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(opts.color ?? 0xd2b8a3),
    roughness: 0.52,
    metalness: 0.0,
    sheen: 0.25,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(0xffd8c8),
    clearcoat: 0.01, // enables the clearcoat path, used for wet blood
    clearcoatRoughness: 0.12,
  });
  const woundTex = new THREE.DataTexture(new Float32Array(MAX_WOUNDS * 3 * 4), MAX_WOUNDS, 3, THREE.RGBAFormat, THREE.FloatType);
  woundTex.minFilter = THREE.NearestFilter;
  woundTex.magFilter = THREE.NearestFilter;
  woundTex.needsUpdate = true;
  const z = opts.zombie || null;
  const uniforms = {
    uWounds: { value: woundTex },
    uWoundCount: { value: 0 },
    uPallor: { value: 0 },
    uCyanosis: { value: 0 },
    uZombie: { value: new THREE.Vector4(z ? 1 : 0, z ? z.seed ?? 0 : 0, z ? z.rot ?? 0.6 : 0, z ? z.gore ?? 0.5 : 0) },
    uShirt: { value: new THREE.Vector3(...(z && z.shirt ? z.shirt : [0.5, 0.5, 0.5])) },
    uPants: { value: new THREE.Vector3(...(z && z.pants ? z.pants : [0.2, 0.22, 0.3])) },
    uShoes: { value: new THREE.Vector3(...(z && z.shoes ? z.shoes : [0.08, 0.07, 0.06])) },
    uSleeves: { value: z ? z.sleeves ?? 1 : 0 },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + SKIN_VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vBlood = blood;\n vModelPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SKIN_FRAG_PARS)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // subtle skin variation, pallor from blood loss and cyanosis from hypoxia
        float skinN = vnoise(vModelPos * 40.0);
        diffuseColor.rgb *= 0.95 + 0.1 * skinN;
        float cloth = 0.0;
        if (uZombie.x > 0.5) cloth = zombieShade(vModelPos, diffuseColor.rgb);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.76, 0.74) * dot(diffuseColor.rgb, vec3(0.33)) * 1.25, uPallor * 0.55);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.8, 1.05), uCyanosis * 0.6);
        float woundWet, woundHole;
        vec4 ws = woundShade(vModelPos, woundWet, woundHole);
        diffuseColor.rgb = mix(diffuseColor.rgb, ws.rgb, ws.a);
        // skin blood film from the flow simulation (fresh red -> dark where thick)
        float bl = clamp(vBlood, 0.0, 1.5);
        float bn = bl > 0.01 ? fbm(vModelPos * 160.0) : 0.5;
        float cover = smoothstep(0.05, 0.35, bl + (bn - 0.5) * 0.25);
        vec3 bloodCol = mix(vec3(0.2, 0.008, 0.007), vec3(0.065, 0.003, 0.0025), smoothstep(0.3, 1.2, bl));
        diffuseColor.rgb = mix(diffuseColor.rgb, bloodCol, cover);
        float skinWet = max(cover, woundWet * (1.0 - woundHole * 0.7));`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.95, cloth);
        roughnessFactor = mix(roughnessFactor, 0.3, skinWet);`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
        material.clearcoat = max(material.clearcoat, skinWet * 0.3);
        #endif`,
      );
  };
  // the injected code differs from a plain physical material
  mat.customProgramCacheKey = () => 'ragdoll-skin-v3';
  return mat;
}

export class HumanMesh {
  /**
   * @param meshData output of buildBodyMesh
   * @param ragdoll the physics ragdoll
   * @param shape BodyShape used to build the mesh
   */
  constructor(meshData, ragdoll, shape, opts = {}) {
    this.rd = ragdoll;
    this.shape = shape;
    this.data = meshData;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(meshData.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(meshData.normals, 3));
    // skin indices are re-written when fractures add bones, keep a private copy
    this.skinIndex = new Uint16Array(meshData.skinIndex);
    this.skinWeight = new Float32Array(meshData.skinWeight);
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.skinWeight, 4));
    this.blood = new Float32Array(meshData.positions.length / 3);
    this.bloodAttr = new THREE.BufferAttribute(this.blood, 1);
    this.bloodAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('blood', this.bloodAttr);
    geo.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
    geo.computeBoundingSphere();
    this.geometry = geo;
    this.material = opts.material ?? createSkinMaterial(opts);

    // bones: one per segment + spares for fracture fragments
    this.bones = [];
    const inverses = [];
    for (const seg of ragdoll.segList) {
      const b = new THREE.Bone();
      b.name = seg.name;
      b.matrixAutoUpdate = false;
      b.matrixWorldAutoUpdate = false;
      this.bones.push(b);
      inverses.push(segmentBindMatrix(shape, seg).invert());
    }
    this.boneBodies = ragdoll.segList.map((s) => s.body);
    for (let i = 0; i < MAX_EXTRA_BONES; i++) {
      const b = new THREE.Bone();
      b.name = 'fragment' + i;
      b.matrixAutoUpdate = false;
      b.matrixWorldAutoUpdate = false;
      this.bones.push(b);
      inverses.push(new THREE.Matrix4());
      this.boneBodies.push(null);
    }
    this.skeleton = new THREE.Skeleton(this.bones, inverses);
    const mesh = new THREE.SkinnedMesh(geo, this.material);
    mesh.bind(this.skeleton, new THREE.Matrix4());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    this.mesh = mesh;
    this.usedExtra = 0;
    this.woundsVersion = -1;
    this.bloodDirty = false;
  }

  /** Update bone matrices from the physics bodies, interpolated by alpha in [0,1]. */
  update(alpha = 1) {
    for (let i = 0; i < this.bones.length; i++) {
      const body = this.boneBodies[i];
      if (!body) continue;
      const fp = body.framePos, p = body.pos;
      _p.set(fp.x + (p.x - fp.x) * alpha, fp.y + (p.y - fp.y) * alpha, fp.z + (p.z - fp.z) * alpha);
      const fr = body.frameRot, r = body.rot;
      _q.set(fr.x, fr.y, fr.z, fr.w);
      _q.slerp(new THREE.Quaternion(r.x, r.y, r.z, r.w), alpha);
      this.bones[i].matrixWorld.compose(_p, _q, _s);
    }
    if (this.bloodDirty) {
      this.bloodAttr.needsUpdate = true;
      this.bloodDirty = false;
    }
  }

  /**
   * A long bone broke: the segment body was re-centred (refresh its bind matrix) and the distal
   * fragment became its own body. Vertices of the segment beyond the fracture plane are re-skinned
   * to a new bone following the fragment, blended over `blend` metres for a soft kink.
   * planePoint / planeNormal are in bind-pose coordinates.
   */
  addFracture(seg, fragmentBody, planePoint, planeNormal, blend = 0.025) {
    const segIdx = this.rd.segList.indexOf(seg);
    this.skeleton.boneInverses[segIdx].copy(segmentBindMatrix(this.shape, seg)).invert();
    if (this.usedExtra >= MAX_EXTRA_BONES) return false;
    const bi = this.rd.segList.length + this.usedExtra++;
    this.boneBodies[bi] = fragmentBody;
    const fragSeg = { name: seg.name, bindPos: fragmentBody.userData.bindPos };
    this.skeleton.boneInverses[bi].copy(segmentBindMatrix(this.shape, fragSeg)).invert();
    const pos = this.data.surface;
    const shape = this.shape;
    const zero = { x: 0, y: 0, z: 0 };
    const tmp = new (planePoint.constructor)();
    const n = this.skinIndex.length / 4;
    for (let v = 0; v < n; v++) {
      let slot = -1;
      for (let k = 0; k < 4; k++) if (this.skinIndex[v * 4 + k] === segIdx && this.skinWeight[v * 4 + k] > 0) slot = k;
      if (slot < 0) continue;
      tmp.set(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
      shape.modelToLocal(seg.name, zero, tmp, tmp); // sculpt -> bind coordinates
      const d = (tmp.x - planePoint.x) * planeNormal.x + (tmp.y - planePoint.y) * planeNormal.y + (tmp.z - planePoint.z) * planeNormal.z;
      const t = Math.min(Math.max((d + blend) / (2 * blend), 0), 1);
      const s = t * t * (3 - 2 * t);
      if (s <= 0) continue;
      const wSeg = this.skinWeight[v * 4 + slot];
      if (s >= 1) {
        this.skinIndex[v * 4 + slot] = bi;
        continue;
      }
      // split the segment's weight between the two fragments, using a free (or the weakest) slot
      let free = -1;
      for (let k = 0; k < 4; k++) if (k !== slot && this.skinWeight[v * 4 + k] === 0) free = k;
      let w = wSeg;
      if (free < 0) {
        let mw = Infinity;
        for (let k = 0; k < 4; k++) if (k !== slot && this.skinWeight[v * 4 + k] < mw) { mw = this.skinWeight[v * 4 + k]; free = k; }
        w += mw;
      }
      this.skinIndex[v * 4 + free] = bi;
      this.skinWeight[v * 4 + free] = w * s;
      this.skinWeight[v * 4 + slot] = w * (1 - s);
    }
    this.geometry.attributes.skinIndex.needsUpdate = true;
    this.geometry.attributes.skinWeight.needsUpdate = true;
    return true;
  }

  /** Upload wound decals: list of {modelPos: Vec3, radius, kind, age, severity, seed, dir} */
  setWounds(list) {
    const u = this.material.userData.uniforms;
    const tex = u.uWounds.value;
    const a = tex.image.data;
    const n = Math.min(list.length, MAX_WOUNDS);
    // over capacity: keep the most recent
    const items = list.length > MAX_WOUNDS ? list.slice(-MAX_WOUNDS) : list;
    const W = MAX_WOUNDS * 4;
    for (let i = 0; i < n; i++) {
      const w = items[i];
      const o = i * 4;
      a[o] = w.modelPos.x;
      a[o + 1] = w.modelPos.y;
      a[o + 2] = w.modelPos.z;
      a[o + 3] = w.radius;
      a[W + o] = w.kind;
      a[W + o + 1] = w.age;
      a[W + o + 2] = w.severity;
      a[W + o + 3] = w.seed;
      if (w.dir) {
        a[2 * W + o] = w.dir.x;
        a[2 * W + o + 1] = w.dir.y;
        a[2 * W + o + 2] = w.dir.z;
      }
    }
    tex.needsUpdate = true;
    u.uWoundCount.value = n;
  }

  setPhysiology(pallor, cyanosis) {
    const u = this.material.userData.uniforms;
    u.uPallor.value = pallor;
    u.uCyanosis.value = cyanosis;
  }

  dispose() {
    this.material.userData.uniforms.uWounds.value.dispose();
    this.material.dispose();
    // the geometry's typed arrays are shared between people; only GPU buffers are released here
    this.geometry.dispose();
  }
}
