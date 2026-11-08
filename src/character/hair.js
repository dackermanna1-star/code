import * as THREE from 'three';

export const HAIR_COLORS = {
  ginger: { label: 'Ginger', color: '#b4532a' },
  copper: { label: 'Copper', color: '#9c3f1c' },
  strawberry: { label: 'Strawberry blonde', color: '#c98a5c' },
  auburn: { label: 'Auburn', color: '#6e2b18' },
  titian: { label: 'Bright red', color: '#a8301a' },
};

/**
 * Hair cards: alpha-to-coverage cutout (no sorting artefacts, soft edges with
 * MSAA), a tinted luminance texture, and a Kajiya-Kay-like dual highlight
 * approximated with sheen + low roughness.
 */
export function makeHairMaterial(map, color = HAIR_COLORS.ginger.color) {
  const m = new THREE.MeshPhysicalMaterial({
    map,
    color: new THREE.Color(color),
    roughness: 0.42,
    metalness: 0,
    specularIntensity: 0.6,
    sheen: 0.7,
    sheenRoughness: 0.35,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffe0c0), 0.5),
    side: THREE.DoubleSide,
    alphaTest: 0.35,
    alphaToCoverage: true,
    transparent: false,
    anisotropy: 0.75,
    anisotropyRotation: Math.PI / 2,
  });
  m.onBeforeCompile = (s) => {
    // lift luminance texture so tint reads as true colour; keep strand contrast
    s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        float strand = sampledDiffuseColor.r;
        diffuseColor.rgb *= mix( 0.55, 1.35, strand );
        diffuseColor.a *= sampledDiffuseColor.a;
      #endif`);
  };
  return m;
}
