// Character shading patches for MeshStandardMaterial (onBeforeCompile):
//  - wrap / subsurface-style diffuse for skin (red light bleeds past the
//    terminator, softer falloff), a lighter wrap for cloth,
//  - optional skin mask from the ORM texture's blue channel,
//  - x-ray silhouettes that ignore self-occlusion (depth pulled towards the
//    camera so only real walls in front of the character reveal it).
import * as THREE from 'three';

// GLSL: diffuse irradiance with per-channel wrap. gSkin (0..1) is a global set
// by the material's fragment code before lighting.
const WRAP_GLOBALS = 'float gSkin = 0.0;\nfloat gClothWrap = 0.22;\n';
const WRAP_FN = /* glsl */`
vec3 charDiffuseIrr( const in vec3 N, const in vec3 L, const in vec3 lightColor ) {
  float nl = dot( N, L );
  vec3 w = mix( vec3( gClothWrap ), vec3( 0.7, 0.4, 0.32 ), gSkin );
  vec3 d = clamp( ( vec3( nl ) + w ) / ( 1.0 + w ), 0.0, 1.0 );
  // keep a little extra red scattering near the terminator on skin
  d += gSkin * vec3( 0.06, 0.012, 0.004 ) * clamp( 1.0 - abs( nl ) * 2.0, 0.0, 1.0 );
  return d * lightColor;
}
`;

export function patchLighting(shader) {
  let frag = shader.fragmentShader;
  const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
  const re = /reflectedLight\.directDiffuse \+= irradiance \* /;
  if (!re.test(chunk)) { console.warn('charshade: lighting chunk changed; skin wrap disabled'); return false; }
  const patched = WRAP_FN + chunk.replace(re, 'reflectedLight.directDiffuse += charDiffuseIrr( geometryNormal, directLight.direction, directLight.color ) * ');
  frag = frag.replace('#include <lights_physical_pars_fragment>', patched);
  frag = frag.replace('#include <common>', '#include <common>\n' + WRAP_GLOBALS);
  shader.fragmentShader = frag;
  return true;
}

// Standard character material: albedo + normal + ORM (R ao, G rough, B skin).
export function characterMaterial(tex, o = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: tex.albedo, normalMap: tex.normal, roughnessMap: tex.orm, aoMap: tex.orm, aoMapIntensity: o.ao ?? 1,
    roughness: 1, metalness: 0, side: o.side ?? THREE.FrontSide,
  });
  m.normalScale.set(o.normalScale ?? 1, o.normalScale ?? 1);
  if (o.alphaTest) m.alphaTest = o.alphaTest;
  if (o.emissiveMap) { m.emissiveMap = o.emissiveMap; m.emissive = new THREE.Color(o.emissive ?? 0xffffff); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
  m.onBeforeCompile = (sh) => {
    patchLighting(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      gSkin = texture2D( roughnessMap, vRoughnessMapUv ).b;
      gClothWrap = ${(o.clothWrap ?? 0.22).toFixed(3)};`);
  };
  m.customProgramCacheKey = () => 'charmat' + (o.clothWrap ?? 0.22);
  return m;
}

// X-ray silhouette material (renders where the character is hidden behind
// something at least `margin` metres in front of it).
export function xrayMaterial(color, margin = 0.45) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, depthFunc: THREE.GreaterDepth, fog: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.xrMargin = { value: margin };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float xrMargin;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 mvp2 = mvPosition; mvp2.z = min( mvp2.z + xrMargin, -0.05 ); // towards the camera
          vec4 cp2 = projectionMatrix * mvp2;
          gl_Position.z = cp2.z / cp2.w * gl_Position.w;
        }`);
  };
  m.customProgramCacheKey = () => 'xray-margin';
  return m;
}
