import * as THREE from 'three';

/** Banded light ramps for MeshToonMaterial: shadow, mid and lit. */
function ramp(levels: number[]) {
  const data = new Uint8Array(levels.length * 4);
  levels.forEach((v, i) => {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = Math.round(v * 255);
    data[i * 4 + 3] = 255;
  });
  const t = new THREE.DataTexture(data, levels.length, 1, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

export const RAMP_CHAR = ramp([0.3, 0.3, 0.3, 0.3, 0.62, 1, 1, 1]);
export const RAMP_WORLD = ramp([0.22, 0.22, 0.22, 0.45, 0.72, 1, 1, 1]);

export interface ToonOpts {
  ramp?: THREE.Texture;
  /** Back-light rim (0 = none). */
  rim?: number;
  rimColor?: THREE.ColorRepresentation;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  side?: THREE.Side;
  map?: THREE.Texture | null;
  vertexColors?: boolean;
  transparent?: boolean;
  opacity?: number;
  fog?: boolean;
  /** darken back faces (inside sleeves and hems), 0..1 */
  backShade?: number;
}

/** Cel-shaded material with an optional rim light. */
export function toon(color: THREE.ColorRepresentation, o: ToonOpts = {}) {
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: o.ramp ?? RAMP_CHAR,
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    side: o.side ?? THREE.FrontSide,
    map: o.map ?? null,
    vertexColors: o.vertexColors ?? false,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    fog: o.fog ?? true,
  });
  const rim = o.rim ?? 0;
  const backShade = o.backShade ?? 0;
  if (rim > 0 || backShade > 0) {
    const rimColor = new THREE.Color(o.rimColor ?? 0xdfe8ff);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uRim = { value: rim };
      sh.uniforms.uRimColor = { value: rimColor };
      sh.uniforms.uBack = { value: backShade };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uRim; uniform vec3 uRimColor; uniform float uBack;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb *= 1.0 - uBack;')
        .replace(
          '#include <opaque_fragment>',
          `{
            float ndv = clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
            float rimK = smoothstep(0.62, 0.78, 1.0 - ndv) * (gl_FrontFacing ? 1.0 : 0.0);
            outgoingLight += uRimColor * rimK * uRim * diffuseColor.rgb;
          }
          #include <opaque_fragment>`,
        );
    };
    m.customProgramCacheKey = () => 'toonrim';
  }
  return m;
}

const OUTLINE_VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
#include <morphtarget_pars_vertex>
#include <fog_pars_vertex>
attribute vec3 aOutline;
uniform float uWidth; uniform vec2 uRes; uniform float uNear;
void main(){
  vec3 objectNormal = aOutline;
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  vec3 transformed = vec3(position);
  #include <skinning_vertex>
  vec4 mv = vec4(transformed, 1.0);
  vec3 n = objectNormal;
  #ifdef USE_INSTANCING
    mv = instanceMatrix * mv;
    n = mat3(instanceMatrix) * n;
  #endif
  mv = modelViewMatrix * mv;
  vec4 clip = projectionMatrix * mv;
  vec3 vn = normalize(mat3(modelViewMatrix) * n);
  vec2 dir = normalize((projectionMatrix * vec4(vn, 0.0)).xy + vec2(1e-5));
  // a constant ink width on screen, thinning out with distance
  float w = uWidth * clamp(9.0 / max(clip.w, 0.01), 0.3, 1.0);
  clip.xy += dir * w * 2.0 / uRes * clip.w;
  gl_Position = clip;
  vec4 mvPosition = mv;
  #include <fog_vertex>
}`;

const OUTLINE_FRAG = /* glsl */ `
uniform vec3 uColor;
#include <fog_pars_fragment>
void main(){
  gl_FragColor = vec4(uColor, 1.0);
  #include <fog_fragment>
}`;

/** Shared screen size for outline widths (set on resize). */
export const OUTLINE_RES = new THREE.Vector2(1920, 1080);

export function outlineMaterial(widthPx = 2.2, color: THREE.ColorRepresentation = 0x0b0a10) {
  return new THREE.ShaderMaterial({
    vertexShader: OUTLINE_VERT,
    fragmentShader: OUTLINE_FRAG,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uWidth: { value: widthPx }, uRes: { value: OUTLINE_RES }, uColor: { value: new THREE.Color(color) }, uNear: { value: 0.1 } },
    ]),
    side: THREE.BackSide,
    fog: true,
  });
}

/** Per-vertex normals averaged over coincident positions, so hulls don't split at hard edges. */
export function addOutlineNormals(g: THREE.BufferGeometry) {
  if (g.getAttribute('aOutline')) return g;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  let nor = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!nor) {
    g.computeVertexNormals();
    nor = g.getAttribute('normal') as THREE.BufferAttribute;
  }
  const key = (i: number) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const acc = new Map<string, THREE.Vector3>();
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    let v = acc.get(k);
    if (!v) acc.set(k, (v = new THREE.Vector3()));
    v.x += nor.getX(i);
    v.y += nor.getY(i);
    v.z += nor.getZ(i);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = acc.get(key(i))!;
    const l = v.length() || 1;
    out[i * 3] = v.x / l;
    out[i * 3 + 1] = v.y / l;
    out[i * 3 + 2] = v.z / l;
  }
  g.setAttribute('aOutline', new THREE.BufferAttribute(out, 3));
  return g;
}

/** Adds an inverted-hull ink outline as a child sharing the mesh's geometry (and skeleton). */
export function addOutline(mesh: THREE.Mesh, mat: THREE.ShaderMaterial) {
  addOutlineNormals(mesh.geometry);
  let o: THREE.Mesh;
  if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
    const sm = mesh as THREE.SkinnedMesh;
    const so = new THREE.SkinnedMesh(sm.geometry, mat);
    so.bindMode = sm.bindMode;
    so.bind(sm.skeleton, sm.bindMatrix);
    so.frustumCulled = false;
    o = so;
    // identity child: same world matrix, so the attached bind inverse matches the source's
    sm.add(so);
  } else if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
    const im = mesh as THREE.InstancedMesh;
    const io = new THREE.InstancedMesh(im.geometry, mat, im.count);
    io.instanceMatrix = im.instanceMatrix;
    io.count = im.count;
    io.frustumCulled = im.frustumCulled;
    o = io;
    mesh.add(o);
  } else {
    o = new THREE.Mesh(mesh.geometry, mat);
    mesh.add(o);
  }
  o.castShadow = false;
  o.receiveShadow = false;
  o.renderOrder = mesh.renderOrder;
  o.userData.isOutline = true;
  return o;
}
