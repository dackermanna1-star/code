// A map's atmosphere outside the lightmap: scene fog (MAP.fog) and a colour grade (MAP.grade).
//
// Fog is three.js scene fog, so everything that includes the fog chunks takes it: the world
// (meshbuilder.js), player / zombie models (gslight.js), gibs and bodies (gore.js), blood
// (blood.js), fire and smoke (firefx.js), and every built-in material (sprites, decals,
// brass). The sky is a background, never fogged: sky.js fades its horizon into the fog colour
// instead. The view model has its own scene and stays clear.
//   fog: { color: [r, g, b], near, far }   linear, from near to far (units)
//   fog: { color: [r, g, b], density }      exponential squared (THREE.FogExp2)
//   fog: null                               none (de_dust2)
// Grade: a CSS filter on the game canvas (cheap, leaves the HUD alone), e.g.
//   grade: { exposure: 1.05, contrast: 1.08, saturate: 0.85, hue: -6, sepia: 0.1 }
import * as THREE from 'three';

// Additive glows (muzzle flashes, sparks, fire, tesla arcs) would turn into fog-coloured
// quads as the fog thickens: they fade toward black instead (adding nothing).
const ADDITIVE_FOG = /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor.rgb *= 1.0 - fogFactor;
#endif
`;

let patched = false;
function patchAdditive() {
  if (patched) return;
  patched = true;
  const M = THREE.Material.prototype;
  // (three's defaults are a no-op and onBeforeCompile.toString(); a material that sets its
  // own onBeforeCompile keeps it. Only installed once a map has fog: de_dust2 never runs this.)
  M.onBeforeCompile = function (shader) {
    if (this.blending === THREE.AdditiveBlending) shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', ADDITIVE_FOG);
  };
  M.customProgramCacheKey = function () {
    return this.onBeforeCompile.toString() + (this.blending === THREE.AdditiveBlending ? '|fog-additive' : '');
  };
}

/** Set (or clear) the scene's fog from a map's fog preset. Returns the THREE fog or null. */
export function applyMapFog(scene, fog) {
  if (!fog) { scene.fog = null; return null; }
  patchAdditive();
  const c = new THREE.Color(fog.color[0], fog.color[1], fog.color[2]);
  scene.fog = fog.density ? new THREE.FogExp2(c, fog.density) : new THREE.Fog(c, fog.near ?? 400, fog.far ?? 3000);
  return scene.fog;
}

/** A grade preset as a CSS filter string ('' for none). */
export function gradeFilter(grade) {
  if (!grade) return '';
  const f = [];
  if (grade.exposure != null && grade.exposure !== 1) f.push(`brightness(${grade.exposure})`);
  if (grade.contrast != null && grade.contrast !== 1) f.push(`contrast(${grade.contrast})`);
  if (grade.saturate != null && grade.saturate !== 1) f.push(`saturate(${grade.saturate})`);
  if (grade.hue) f.push(`hue-rotate(${grade.hue}deg)`);
  if (grade.sepia) f.push(`sepia(${grade.sepia})`);
  return f.join(' ');
}

/**
 * Grade the game canvas. The filter is kept in canvas.dataset.grade so other looks layered
 * on the canvas (the title screen's dusk, titlescene.js) can add to it and put it back.
 */
export function applyGrade(canvas, grade) {
  const f = gradeFilter(grade);
  canvas.dataset.grade = f;
  canvas.style.filter = f;
  return f;
}
