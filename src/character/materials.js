import * as THREE from 'three';

/**
 * Shader helpers shared by skin and fabrics.
 *
 * Skin uses a cheap but convincing subsurface approximation: per-channel wrap
 * lighting (red light bleeds further around the terminator than green/blue),
 * soft sheen for peach fuzz and a tiling micro-normal for pores.
 */

let _poreTex = null;
export function poreNormalTexture() {
  if (_poreTex) return _poreTex;
  const N = 256;
  const h = new Float32Array(N * N);
  // tileable value noise: sum of random dimples
  const rand = mulberry32(7);
  for (let k = 0; k < 2600; k++) {
    const cx = rand() * N, cy = rand() * N, r = 0.8 + rand() * 1.6, d = 0.4 + rand() * 0.6;
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      const px = (Math.floor(cx) + x + N) % N, py = (Math.floor(cy) + y + N) % N;
      const dx = px + 0.5 - cx, dy = py + 0.5 - cy;
      const dist = Math.hypot(((dx + N * 1.5) % N) - N / 2, ((dy + N * 1.5) % N) - N / 2);
      h[py * N + px] -= d * Math.exp(-(dist * dist) / (r * r));
    }
  }
  // fine grain
  for (let i = 0; i < N * N; i++) h[i] += (rand() - 0.5) * 0.25;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const hx = h[y * N + ((x + 1) % N)] - h[y * N + ((x - 1 + N) % N)];
    const hy = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x];
    const v = new THREE.Vector3(-hx * 0.9, -hy * 0.9, 1).normalize();
    const i = (y * N + x) * 4;
    data[i] = (v.x * 0.5 + 0.5) * 255; data[i + 1] = (v.y * 0.5 + 0.5) * 255; data[i + 2] = (v.z * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  _poreTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  _poreTex.wrapS = _poreTex.wrapT = THREE.RepeatWrapping;
  _poreTex.generateMipmaps = true;
  _poreTex.minFilter = THREE.LinearMipmapLinearFilter;
  _poreTex.magFilter = THREE.LinearFilter;
  _poreTex.needsUpdate = true;
  return _poreTex;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Patch a physical material so its diffuse term uses wrapped (subsurface-like) lighting. */
export function addWrapLighting(material, wrap = new THREE.Vector3(0.45, 0.24, 0.17), extraCode = null) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    shader.uniforms.uWrap = { value: wrap };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uWrap;')
      .replace('#include <lights_physical_pars_fragment>',
        THREE.ShaderChunk.lights_physical_pars_fragment.replace(
          'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
          `float ndlRaw = dot( geometryNormal, directLight.direction );
           vec3 wrapped = clamp( ( vec3( ndlRaw ) + uWrap ) / ( 1.0 + uWrap ), 0.0, 1.0 );
           wrapped *= wrapped * ( 1.0 + uWrap * 0.6 );
           reflectedLight.directDiffuse += wrapped * directLight.color * BRDF_Lambert( material.diffuseColor );`));
    if (extraCode) extraCode(shader);
  };
  material.customProgramCacheKey = () => 'wrap' + wrap.toArray().join(',') + (extraCode ? extraCode.toString().length : '');
  return material;
}

export function makeSkinMaterial(map) {
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const m = new THREE.MeshPhysicalMaterial({
    map,
    roughness: 0.52,
    metalness: 0,
    specularIntensity: 0.55,
    sheen: 0.35,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0xffd6c4),
    normalMap: poreNormalTexture(),
    normalScale: new THREE.Vector2(0.16, 0.16),
  });
  // pores tile much denser than the colour UVs
  m.normalMap = poreNormalTexture().clone();
  m.normalMap.repeat.set(26, 26);
  m.normalMap.needsUpdate = true;
  addWrapLighting(m);
  return m;
}
