// Material library: PBR materials built from procedural textures. Every
// environment material uses vertex colours so merged geometry can carry
// per-object tint variation without extra draw calls.
//
// Level materials also get a small shader extension (one shared program):
//  - world-space macro variation (low-frequency brightness / hue / roughness)
//    that breaks up texture tiling on big walls and floors,
//  - a shared micro-detail texture (grain + normal + roughness) for close-ups,
//  - "paint" colour variants: the albedo alpha is a paint mask, so e.g. all
//    plaster / painted-metal colours share one generated texture set,
//  - world-space puddles on up-facing outdoor ground (flat, mirror-like).
import * as THREE from 'three';
import { getTexture, getDetailTexture } from './textures.js';

// name -> { tex: [kind, opts], scale: metres per texture tile, surf: impact surface type,
//           paint: colour for paint-masked shared textures, fx: macro preset }
const PL = { paint: true, seed: 21 };
const PM = { paint: true, seed: 211 };
const FB = { paint: true, seed: 191 };
const DEFS = {
  concrete: { tex: ['concrete', {}], scale: 3, surf: 'concrete', fx: 'concrete' },
  concreteDark: { tex: ['concrete', { color: 0x5e5c58, seed: 13, stain: 0.5, formwork: true, streaks: 0.8 }], scale: 3, surf: 'concrete', fx: 'concrete' },
  concreteFloor: { tex: ['concrete', { color: 0x7a776f, seed: 15, crackCount: 9, oil: 0.6, streaks: 0.15 }], scale: 4, surf: 'concrete', fx: 'floor' },
  plaster: { tex: ['plaster', PL], paint: 0xd8d2c4, scale: 2.5, surf: 'plaster', fx: 'wall' },
  plasterGreen: { tex: ['plaster', PL], paint: 0x9fae96, scale: 2.5, surf: 'plaster', fx: 'wall' },
  plasterBlue: { tex: ['plaster', PL], paint: 0x8e9eaa, scale: 2.5, surf: 'plaster', fx: 'wall' },
  plasterHosp: { tex: ['plaster', { paint: true, seed: 25, grime: 0.3, peel: 0.025, gloss: 0.62, stain: 0.12 }], paint: 0xc9d3cf, scale: 2.5, surf: 'plaster', fx: 'wall' },
  plasterDirty: { tex: ['plaster', { color: 0xa89c86, seed: 26, grime: 0.9, stain: 0.6, cracks: true, peel: 0.14 }], scale: 2.5, surf: 'plaster', fx: 'wall' },
  wallpaper: { tex: ['wallpaper', { pattern: 'damask', color: 0x8c7a5a, color2: 0x6a5838, accent: 0xa89060 }], scale: 2.4, surf: 'plaster', fx: 'wall' },
  wallpaperGreen: { tex: ['wallpaper', { pattern: 'stripe', color: 0x5f6e4c, color2: 0x46543a, accent: 0xa89a62, seed: 33, stripes: 14 }], scale: 2.4, surf: 'plaster', fx: 'wall' },
  wallpaperRose: { tex: ['wallpaper', { pattern: 'floral', color: 0x9a7a6a, color2: 0x8a4848, leaf: 0x5a6a48, accent: 0xc8a860, seed: 34, motifs: 5 }], scale: 2.4, surf: 'plaster', fx: 'wall' },
  brick: { tex: ['brick', { paint: true, seed: 41 }], paint: 0x7a3a2a, scale: 2.2, surf: 'brick', fx: 'brick' },
  brickDark: { tex: ['brick', { paint: true, seed: 41 }], paint: 0x4e2a22, scale: 2.2, surf: 'brick', fx: 'brick' },
  brickTan: { tex: ['brick', { color: 0x9a7a58, mortarColor: 0x7a746a, seed: 44, soot: 0.5, efflo: 0.3 }], scale: 2.2, surf: 'brick', fx: 'brick' },
  tileWhite: { tex: ['tiles', { cols: 10, rows: 20, color: 0xdcdad0, offset: 0.5, grout: 0.004, gloss: 0.12 }], scale: 2, surf: 'tile', fx: 'tile' },
  tileSubway: { tex: ['tiles', { cols: 13, rows: 26, color: 0xcfd2c8, offset: 0.5, grout: 0.0045, gloss: 0.12, stain: 0.6, groutColor: 0x6a675e }], scale: 2, surf: 'tile', fx: 'tile' },
  tileGreen: { tex: ['tiles', { cols: 13, rows: 26, color: 0x6e8a74, offset: 0.5, grout: 0.0045, gloss: 0.12, stain: 0.5, seed: 52 }], scale: 2, surf: 'tile', fx: 'tile' },
  tileChecker: { tex: ['tiles', { cols: 8, rows: 8, color: 0xd6d2c6, color2: 0x2a2a2c, checker: true, grout: 0.003, gloss: 0.3, seed: 53 }], scale: 2.4, surf: 'tile', fx: 'floor' },
  tileFloor: { tex: ['tiles', { cols: 6, rows: 6, color: 0x9a968a, grout: 0.005, gloss: 0.35, seed: 54, groutColor: 0x7a766c, film: 1.1, cushion: 0.035, tileVar: 0.2 }], scale: 2.4, surf: 'tile', fx: 'floor' },
  woodFloor: { tex: ['woodfloor', { paint: true, seed: 61 }], paint: 0x6b4a2e, scale: 3, surf: 'wood', fx: 'floor' },
  woodFloorDark: { tex: ['woodfloor', { paint: true, seed: 61 }], paint: 0x4a3020, scale: 3, surf: 'wood', fx: 'floor' },
  wood: { tex: ['wood', { paint: true, seed: 71 }], paint: 0x8a6a44, scale: 1.2, surf: 'wood', fx: 'prop' },
  woodDark: { tex: ['wood', { paint: true, seed: 71 }], paint: 0x4e3622, scale: 1.2, surf: 'wood', fx: 'prop' },
  woodPale: { tex: ['wood', { paint: true, seed: 71 }], paint: 0xb8a078, scale: 1.2, surf: 'wood', fx: 'prop' },
  carpet: { tex: ['carpet', { paint: true, seed: 81, pattern: 'fleck' }], paint: 0x5a3b3b, scale: 2, surf: 'carpet', fx: 'floor' },
  carpetBlue: { tex: ['carpet', { paint: true, seed: 83, pattern: 'geo' }], paint: 0x2e3a52, scale: 2, surf: 'carpet', fx: 'floor' },
  carpetGray: { tex: ['carpet', { paint: true, seed: 83, pattern: 'geo' }], paint: 0x4a4846, scale: 2, surf: 'carpet', fx: 'floor' },
  asphalt: { tex: ['asphalt', {}], scale: 6, surf: 'concrete', fx: 'ground' },
  sidewalk: { tex: ['sidewalk', {}], scale: 3, surf: 'concrete', fx: 'ground' },
  metal: { tex: ['metal', {}], scale: 2, surf: 'metal', fx: 'metal' },
  metalDark: { tex: ['metal', { color: 0x2e3234, seed: 113, rust: 0.4 }], scale: 2, surf: 'metal', fx: 'metal' },
  metalClean: { tex: ['metal', { color: 0x9aa2a6, seed: 114, rust: 0.05, rough: 0.3, metal: 0.9, scratches: 0.6 }], scale: 1.5, surf: 'metal', fx: 'metal' },
  rust: { tex: ['metal', { color: 0x6a4a36, seed: 115, rust: 1.4 }], scale: 2, surf: 'metal', fx: 'metal' },
  diamond: { tex: ['diamond', {}], scale: 1.5, surf: 'metal', fx: 'metal' },
  roof: { tex: ['rooftar', {}], scale: 4, surf: 'concrete', fx: 'ground' },
  ceiling: { tex: ['ceiling', {}], scale: 2.4, surf: 'plaster', fx: 'ceiling' },
  linoleum: { tex: ['linoleum', {}], scale: 3, surf: 'tile', fx: 'floor' },
  linoleumBlue: { tex: ['linoleum', { color: 0x8aa0a8, seed: 153, alt: true }], scale: 3, surf: 'tile', fx: 'floor' },
  sewer: { tex: ['sewer', {}], scale: 3, surf: 'brick', fx: 'brick' },
  dirt: { tex: ['dirt', {}], scale: 4, surf: 'dirt', fx: 'ground' },
  fabric: { tex: ['fabric', FB], paint: 0x6a6a70, scale: 1, surf: 'fabric', fx: 'prop' },
  fabricRed: { tex: ['fabric', FB], paint: 0x6a2a26, scale: 1, surf: 'fabric', fx: 'prop' },
  fabricGreen: { tex: ['fabric', FB], paint: 0x3a4a32, scale: 1, surf: 'fabric', fx: 'prop' },
  fabricBlue: { tex: ['fabric', FB], paint: 0x2c3a5a, scale: 1, surf: 'fabric', fx: 'prop' },
  marble: { tex: ['marble', {}], scale: 3, surf: 'tile', fx: 'floor' },
  paintedRed: { tex: ['paintedMetal', PM], paint: 0x8a2a20, scale: 2, surf: 'metal', fx: 'metal' },
  paintedYellow: { tex: ['paintedMetal', PM], paint: 0xb8942a, scale: 2, surf: 'metal', fx: 'metal' },
  paintedGreen: { tex: ['paintedMetal', PM], paint: 0x2e4a36, scale: 2, surf: 'metal', fx: 'metal' },
  paintedWhite: { tex: ['paintedMetal', PM], paint: 0xc8c8c0, scale: 2, surf: 'metal', fx: 'metal' },
  paintedBlue: { tex: ['paintedMetal', PM], paint: 0x2a4a7a, scale: 2, surf: 'metal', fx: 'metal' },
  rubber: { tex: ['rubber', {}], scale: 1, surf: 'rubber', fx: 'prop' },
};

// Shader presets: amt = macro brightness variation, hue = warm/cool drift,
// detail = micro-detail strength, rough = macro roughness variation,
// wet = world-space puddles on up-facing faces, ds = detail repeats per tile.
const FX = {
  concrete: { amt: 0.32, hue: 0.05, detail: 0.55, rough: 0.35, wet: 0, ds: 9.3, st: 0.28 },
  floor: { amt: 0.26, hue: 0.04, detail: 0.45, rough: 0.45, wet: 0, ds: 9.3 },
  wall: { amt: 0.22, hue: 0.04, detail: 0.35, rough: 0.25, wet: 0, ds: 7.1, st: 0.1 },
  brick: { amt: 0.34, hue: 0.07, detail: 0.5, rough: 0.2, wet: 0, ds: 5.3, st: 0.3 },
  tile: { amt: 0.16, hue: 0.03, detail: 0.25, rough: 0.5, wet: 0, ds: 7.7 },
  ground: { amt: 0.36, hue: 0.05, detail: 0.6, rough: 0.35, wet: 1, ds: 11.3 },
  metal: { amt: 0.25, hue: 0.05, detail: 0.35, rough: 0.35, wet: 0, ds: 5.7, st: 0.15 },
  ceiling: { amt: 0.22, hue: 0.04, detail: 0.25, rough: 0.1, wet: 0, ds: 7.1 },
  prop: { amt: 0.14, hue: 0.03, detail: 0.3, rough: 0.2, wet: 0, ds: 3.9 },
};

const SURF_OF = {};
for (const k in DEFS) SURF_OF[k] = DEFS[k].surf;

// ------------------------------------------------------------------ shader --
const MACRO_KEY = 'lf-macro-v1';
const MACRO_VERT_PARS = /* glsl */`
varying vec3 vMacroPos;
varying vec3 vMacroNrm;
`;
const MACRO_VERT = /* glsl */`
	vMacroPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
	vMacroNrm = normalize( mat3( modelMatrix ) * objectNormal );
`;
const MACRO_FRAG_PARS = /* glsl */`
varying vec3 vMacroPos;
varying vec3 vMacroNrm;
uniform vec4 uMacro;   // amt, hue, detail, roughVar
uniform vec4 uMacro2;  // wet, detail scale, wall streaks, -
uniform vec3 uPaint;
uniform sampler2D tDetail;
float mHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float mNoise( vec2 p ) {
	vec2 i = floor( p ), f = fract( p );
	f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mHash( i ), mHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( mHash( i + vec2( 0.0, 1.0 ) ), mHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
`;
const MACRO_FRAG_MAP = /* glsl */`
	vec3 mAN = abs( vMacroNrm );
	vec2 mQ = mAN.y > 0.5 ? vMacroPos.xz : ( mAN.x > mAN.z ? vMacroPos.zy : vMacroPos.xy );
	float mLo = mNoise( mQ * 0.21 + 3.1 ) * 0.5 + mNoise( mQ * 0.63 + 7.7 ) * 0.25 + mNoise( mQ * 0.071 + 1.3 ) * 0.25;
	float mHue = ( mNoise( mQ * 0.13 + 11.0 ) - 0.5 ) * 2.0 * uMacro.y;
	#ifdef USE_MAP
		vec4 mDet = texture2D( tDetail, vMapUv * uMacro2.y );
	#else
		vec4 mDet = vec4( 0.5 );
	#endif
	#ifdef USE_MAP
		diffuseColor.rgb *= mix( vec3( 1.0 ), uPaint, sampledDiffuseColor.a );
		diffuseColor.a = opacity;
	#endif
	diffuseColor.rgb *= ( 1.0 - uMacro.x + uMacro.x * 1.55 * mLo ) * ( 1.0 + ( mDet.b - 0.5 ) * uMacro.z * 0.5 );
	diffuseColor.rgb *= vec3( 1.0 + mHue, 1.0 + mHue * 0.25, 1.0 - mHue );
	if ( uMacro2.z > 0.0 && mAN.y < 0.3 ) {
		// world-space rain / grime streaks running down walls
		float mH = mAN.x > mAN.z ? vMacroPos.z : vMacroPos.x;
		float mSt = mNoise( vec2( mH * 7.0, vMacroPos.y * 0.3 ) ) * 0.7 + mNoise( vec2( mH * 23.0, vMacroPos.y * 0.9 ) ) * 0.3;
		mSt = smoothstep( 0.55, 0.9, mSt ) * smoothstep( 0.35, 0.7, mNoise( vec2( mH * 0.5, vMacroPos.y * 0.12 ) + 3.0 ) );
		diffuseColor.rgb *= 1.0 - mSt * uMacro2.z;
	}
	float mWet = 0.0, mDamp = 0.0;
	if ( uMacro2.x > 0.0 && vMacroNrm.y > 0.7 ) {
		float pn = mNoise( vMacroPos.xz * 0.17 + 5.0 ) * 0.6 + mNoise( vMacroPos.xz * 0.55 + 9.0 ) * 0.3 + mNoise( vMacroPos.xz * 2.1 ) * 0.1;
		mWet = smoothstep( 0.63, 0.67, pn ) * uMacro2.x;
		mDamp = smoothstep( 0.52, 0.64, pn ) * uMacro2.x;
		diffuseColor.rgb *= 1.0 - mDamp * 0.22 - mWet * 0.3;
	}
`;
const MACRO_FRAG_ROUGH = /* glsl */`
	roughnessFactor = clamp( roughnessFactor * ( 1.0 + ( mLo - 0.5 ) * uMacro.w ) + ( mDet.a - 0.5 ) * 0.14 * uMacro.z, 0.04, 1.0 );
	roughnessFactor = mix( roughnessFactor, roughnessFactor * 0.7, mDamp );
	roughnessFactor = mix( roughnessFactor, 0.035, mWet );
`;
const MACRO_FRAG_NORMAL = /* glsl */`
	mapN.xy *= normalScale;
	mapN.xy += ( mDet.rg - 0.5 ) * uMacro.z * 0.35;
	mapN.xy *= 1.0 - mWet - mDamp * 0.35;
`;
// Screen-space specular anti-aliasing: widen roughness where the shading
// normal varies within a pixel (kills sparkle on bumpy, glossy surfaces).
const MACRO_FRAG_SAA = /* glsl */`
	{
		vec3 mNdx = dFdx( normal ), mNdy = dFdy( normal );
		float mVar = 0.25 * ( dot( mNdx, mNdx ) + dot( mNdy, mNdy ) );
		float mKr = min( 2.0 * mVar, 0.25 );
		roughnessFactor = sqrt( clamp( roughnessFactor * roughnessFactor + mKr, 0.0, 1.0 ) );
	}
`;
const NORMAL_MAPS_CHUNK = THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', MACRO_FRAG_NORMAL);
function macroCompile(shader) {
  const u = this.userData.macro;
  shader.uniforms.uMacro = { value: u.v1 };
  shader.uniforms.uMacro2 = { value: u.v2 };
  shader.uniforms.uPaint = { value: u.paint };
  shader.uniforms.tDetail = { value: getDetailTexture() };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + MACRO_VERT_PARS)
    .replace('#include <project_vertex>', '#include <project_vertex>\n' + MACRO_VERT);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + MACRO_FRAG_PARS)
    .replace('#include <map_fragment>', '#include <map_fragment>\n' + MACRO_FRAG_MAP)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + MACRO_FRAG_ROUGH)
    .replace('#include <normal_fragment_maps>', NORMAL_MAPS_CHUNK + MACRO_FRAG_SAA);
}
function macroKey() { return MACRO_KEY; }
function installMacro(m, d, gain = 1) {
  const fx = FX[d.fx] || FX.prop;
  const paint = new THREE.Color(1, 1, 1);
  if (d.paint != null) paint.set(d.paint).multiplyScalar(gain); // THREE.Color stores linear values
  m.userData.macro = {
    v1: new THREE.Vector4(fx.amt, fx.hue, fx.detail, fx.rough),
    v2: new THREE.Vector4(fx.wet, fx.ds, fx.st ?? 0, 0),
    paint,
  };
  m.onBeforeCompile = macroCompile;
  m.customProgramCacheKey = macroKey;
}

export class MaterialLib {
  constructor() {
    this.cache = new Map();
    this.anisotropy = 8;
  }
  surfOf(name) {
    return SURF_OF[name] || 'concrete';
  }
  scaleOf(name) {
    return DEFS[name]?.scale ?? 2;
  }
  has(name) {
    return !!DEFS[name] || this.cache.has(name);
  }
  get(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    const d = DEFS[name];
    let m;
    if (d) {
      const t = getTexture(d.tex[0], { ...d.tex[1], anisotropy: this.anisotropy });
      m = new THREE.MeshStandardMaterial({
        map: t.map,
        normalMap: t.normalMap,
        normalScale: new THREE.Vector2(1, 1),
        roughnessMap: t.ormMap,
        metalnessMap: t.ormMap,
        aoMap: t.ormMap,
        aoMapIntensity: 1,
        roughness: 1,
        metalness: 1,
        vertexColors: true,
      });
      m.name = name;
      installMacro(m, d, t.paintGain ?? 1);
    } else {
      m = this.special(name);
    }
    this.cache.set(name, m);
    return m;
  }
  // Non-textured / special materials.
  special(name) {
    let m;
    switch (name) {
      case 'glass': {
        const t = getTexture('glass', { dirt: 0.25, seed: 241, anisotropy: this.anisotropy });
        m = new THREE.MeshStandardMaterial({ color: 0xb4c6ca, map: t.map, roughnessMap: t.ormMap, roughness: 1, metalness: 0.1, transparent: true, opacity: 0.5, depthWrite: false, vertexColors: true });
        break;
      }
      case 'glassDirty': {
        const t = getTexture('glass', { dirt: 0.75, seed: 242, anisotropy: this.anisotropy });
        m = new THREE.MeshStandardMaterial({ color: 0x9aa89a, map: t.map, roughnessMap: t.ormMap, roughness: 1, metalness: 0.1, transparent: true, opacity: 0.62, depthWrite: false, vertexColors: true });
        break;
      }
      case 'emissiveWarm':
        m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd9a0, emissiveIntensity: 3.0, vertexColors: true });
        break;
      case 'emissiveCool':
        m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xd8f0ff, emissiveIntensity: 3.0, vertexColors: true });
        break;
      case 'emissiveRed':
        m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2010, emissiveIntensity: 4.0, vertexColors: true });
        break;
      case 'emissiveGreen':
        m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x30ff60, emissiveIntensity: 3.0, vertexColors: true });
        break;
      case 'emissiveWindow':
        m = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0xffc070, emissiveIntensity: 1.2, vertexColors: true });
        break;
      case 'plastic':
        m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.0, vertexColors: true });
        break;
      case 'plasticGloss':
        m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.0, vertexColors: true });
        break;
      case 'chrome':
        m = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.15, metalness: 1.0, vertexColors: true });
        break;
      case 'carPaint':
        m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.4, vertexColors: true });
        break;
      case 'blackMatte':
        m = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9, metalness: 0, vertexColors: true });
        break;
      case 'paper':
        m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, vertexColors: true, side: THREE.DoubleSide });
        break;
      case 'waterSurface':
        m = new THREE.MeshStandardMaterial({ color: 0x1a2016, roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.88, vertexColors: true });
        break;
      case 'foliage':
        m = new THREE.MeshStandardMaterial({ color: 0x2a3a1e, roughness: 0.9, vertexColors: true });
        break;
      case 'skybox':
        m = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, fog: false });
        break;
      default:
        m = new THREE.MeshStandardMaterial({ color: 0xff00ff, vertexColors: true });
        console.warn('Unknown material', name);
    }
    m.name = name;
    return m;
  }
}

export const materials = new MaterialLib();
export { DEFS as MATERIAL_DEFS };
