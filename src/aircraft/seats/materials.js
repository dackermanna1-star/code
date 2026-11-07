// =============================================================================
// Shared seat materials (one per material key used by the PartBuilder groups).
// Every material uses vertex colours (baked AO / wear) and works with the
// per-instance colour (subtle seat-to-seat variation).
// The placard material reads two per-instance label rects (aLabelA / aLabelB)
// for quads flagged with labelMask 1 / 2 (seat-row labels, exit-row placard).
// =============================================================================
import * as THREE from 'three';

const T = 'assets/textures';

export function createMaterials(app, tex) {
  const A = app.assets;
  const detail = app.quality?.detail ?? 1;
  const physical = detail >= 1;
  const Phys = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const fab = A.pbr(`${T}/seats-fabric`, { repeat: [1 / 0.22, 1 / 0.22] });
  const lea = A.pbr(`${T}/seats-leather`, { repeat: [1 / 0.45, 1 / 0.45] });
  const plN = A.texture(`${T}/seats-plastic/normal.jpg`, { repeat: [1 / 0.09, 1 / 0.09] });
  const plR = A.texture(`${T}/seats-plastic/roughness.jpg`, { repeat: [1 / 0.09, 1 / 0.09] });
  const twN = A.texture(`${T}/seats-twill/normal.jpg`, { repeat: [1 / 0.12, 1 / 0.12] });
  const twNc = A.texture(`${T}/seats-twill/normal.jpg`, { repeat: [3.5, 3.5] });

  const M = {};
  const sheen = (p) => (physical ? { sheen: p.sheen, sheenRoughness: p.sheenRoughness, sheenColor: new THREE.Color(p.sheenColor) } : {});
  M.fabric = new Phys({
    name: 'seat-fabric', color: 0xffffff, map: fab.map, normalMap: fab.normalMap, roughnessMap: fab.roughnessMap,
    normalScale: new THREE.Vector2(0.9, 0.9), roughness: 1.0, metalness: 0, vertexColors: true,
    ...sheen({ sheen: 0.55, sheenRoughness: 0.65, sheenColor: '#6f7f9e' }),
  });
  M.leather = new Phys({
    name: 'seat-leather', color: 0xffffff, map: lea.map, normalMap: lea.normalMap, roughnessMap: lea.roughnessMap,
    normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.95, metalness: 0, vertexColors: true,
    ...(physical ? { clearcoat: 0.12, clearcoatRoughness: 0.55, sheen: 0.2, sheenRoughness: 0.5, sheenColor: new THREE.Color('#55607a') } : {}),
  });
  M.shell = new THREE.MeshStandardMaterial({
    name: 'seat-shell', color: new THREE.Color('#3f434a'), roughness: 0.62, roughnessMap: plR, normalMap: plN,
    normalScale: new THREE.Vector2(0.22, 0.22), metalness: 0, vertexColors: true,
  });
  M.black = new THREE.MeshStandardMaterial({ name: 'seat-black', color: new THREE.Color('#141518'), roughness: 0.32, metalness: 0, vertexColors: true });
  M.glass = new THREE.MeshStandardMaterial({ name: 'seat-screen-glass', color: new THREE.Color('#050608'), roughness: 0.08, metalness: 0, vertexColors: true });
  M.metal = new THREE.MeshStandardMaterial({ name: 'seat-metal', color: new THREE.Color('#c3c7cd'), roughness: 0.3, metalness: 1.0, vertexColors: true });
  M.cloth = new Phys({
    name: 'seat-cover', map: tex.coverE, normalMap: twNc, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.92,
    vertexColors: true, side: THREE.DoubleSide, ...sheen({ sheen: 0.4, sheenRoughness: 0.7, sheenColor: '#ffffff' }),
  });
  M.clothB = M.cloth.clone();
  M.clothB.map = tex.coverB;
  M.clothB.name = 'seat-cover-business';
  M.lit = new THREE.MeshStandardMaterial({ name: 'seat-literature', map: tex.lit.texture, roughness: 0.62, vertexColors: true });
  M.placard = new THREE.MeshStandardMaterial({ name: 'seat-placard', map: tex.plac.texture, roughness: 0.5, alphaTest: 0.5, vertexColors: true });
  M.placard.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float labelMask;\nattribute vec4 aLabelA;\nattribute vec4 aLabelB;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nif (labelMask > 0.5) { vec4 lr = labelMask > 1.5 ? aLabelB : aLabelA; vMapUv = lr.xy + uv * lr.zw; }\n#endif');
  };
  M.placard.customProgramCacheKey = () => 'seat-placard-labels';
  M.tray = new THREE.MeshStandardMaterial({ name: 'seat-tray', map: tex.tray, roughness: 0.48, normalMap: A.texture(`${T}/seats-plastic/normal.jpg`, { repeat: [4, 4] }), normalScale: new THREE.Vector2(0.12, 0.12), vertexColors: true });
  M.webbing = new THREE.MeshStandardMaterial({ name: 'seat-belt-webbing', map: tex.webbing, color: new THREE.Color('#858d9b'), roughness: 0.72, vertexColors: true });
  M.pillow = new Phys({ name: 'seat-pillow', color: new THREE.Color('#e8e6df'), normalMap: twN, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.95, vertexColors: true, ...sheen({ sheen: 0.5, sheenRoughness: 0.6, sheenColor: '#ffffff' }) });
  M.blanket = new Phys({ name: 'seat-blanket', color: new THREE.Color('#1b2436'), normalMap: twN, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 1.0, vertexColors: true, ...sheen({ sheen: 0.45, sheenRoughness: 0.6, sheenColor: '#4a5670' }) });
  M.paper = new THREE.MeshStandardMaterial({ name: 'seat-paper', map: tex.paper.texture, roughness: 0.85, vertexColors: true });
  M.bottle = new THREE.MeshStandardMaterial({ name: 'seat-bottle', color: new THREE.Color('#dfeef6'), roughness: 0.08, metalness: 0, transparent: true, opacity: 0.38, depthWrite: false, vertexColors: true });
  M.cap = new THREE.MeshStandardMaterial({ name: 'seat-bottle-cap', color: new THREE.Color('#2a6fb0'), roughness: 0.4, vertexColors: true });
  return M;
}

/** Material array for a PartBuilder result; overrides: {key: material}. */
export function materialsFor(M, keys, overrides = {}) {
  return keys.map((k) => overrides[k] || M[k] || M.shell);
}
