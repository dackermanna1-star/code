// Food materials.
//
// Model builders create *template* materials with `foodMat()`. When a food item is built,
// every template is cloned and patched (`bindFoodMaterial`) so it shares one set of per-item
// uniforms. The patch makes any food react to cooking without rebuilding geometry:
//   browning (fry/bake/toast), grill stripes, deep-fry crust, boiled paleness, burning with
//   noisy char + glowing embers, frost, sauce spread on top, all-over coating, hover glow,
// and real bite marks: fragments inside "bite spheres" are discarded and the hollow interior
// is painted with the flesh colour, so anything can be bitten.
//
// Positions used by the effects are in *item space* (the food item's root group, model units
// in metres), so patterns stay glued to the food while it is dragged around.

import * as THREE from 'three';

export interface FoodMatParams {
  color: string | number;
  map?: THREE.Texture | null;
  roughness?: number;
  metalness?: number;
  /** Uses MeshPhysicalMaterial when any of clearcoat / sheen / transmission / iridescence is set. */
  clearcoat?: number;
  clearcoatRoughness?: number;
  sheen?: number;
  sheenColor?: string | number;
  sheenRoughness?: number;
  bumpMap?: THREE.Texture | null;
  bumpScale?: number;
  normalMap?: THREE.Texture | null;
  roughnessMap?: THREE.Texture | null;
  emissive?: string | number;
  emissiveIntensity?: number;
  emissiveMap?: THREE.Texture | null;
  transparent?: boolean;
  opacity?: number;
  vertexColors?: boolean;
  flatShading?: boolean;
  /** Interior colour revealed by bites (defaults to `color`). */
  flesh?: string;
  /** Browning target colour (defaults to golden brown). */
  cookColor?: string;
  /** How strongly this surface browns/crusts when cooked, 0..1 (default 1). Leaves ~0.3, metal 0. */
  cookAmount?: number;
  /** Set false for non-food parts that should ignore cooking & bites tint (sticks, bowls). */
  food?: boolean;
  name?: string;
}

export interface FoodMatInfo {
  flesh: string;
  cookColor: string;
  cookAmount: number;
  food: boolean;
}

const DEFAULT_COOK = '#a86a2c';

/** Create a template food material. Cheap to call; cache templates per ingredient where convenient. */
export function foodMat(p: FoodMatParams): THREE.MeshStandardMaterial {
  const physical = p.clearcoat !== undefined || p.sheen !== undefined;
  const common: THREE.MeshStandardMaterialParameters = {
    color: new THREE.Color(p.color as THREE.ColorRepresentation),
    map: p.map ?? null,
    roughness: p.roughness ?? 0.6,
    metalness: p.metalness ?? 0,
    bumpMap: p.bumpMap ?? null,
    bumpScale: p.bumpScale ?? 1,
    normalMap: p.normalMap ?? null,
    roughnessMap: p.roughnessMap ?? null,
    emissive: new THREE.Color((p.emissive ?? 0x000000) as THREE.ColorRepresentation),
    emissiveIntensity: p.emissiveIntensity ?? 1,
    emissiveMap: p.emissiveMap ?? null,
    transparent: p.transparent ?? false,
    opacity: p.opacity ?? 1,
    vertexColors: p.vertexColors ?? false,
    flatShading: p.flatShading ?? false,
    side: THREE.DoubleSide,
  };
  let m: THREE.MeshStandardMaterial;
  if (physical) {
    const pm = new THREE.MeshPhysicalMaterial(common);
    if (p.clearcoat !== undefined) {
      pm.clearcoat = p.clearcoat;
      pm.clearcoatRoughness = p.clearcoatRoughness ?? 0.2;
    }
    if (p.sheen !== undefined) {
      pm.sheen = p.sheen;
      pm.sheenColor = new THREE.Color((p.sheenColor ?? 0xffffff) as THREE.ColorRepresentation);
      pm.sheenRoughness = p.sheenRoughness ?? 0.6;
    }
    m = pm;
  } else {
    m = new THREE.MeshStandardMaterial(common);
  }
  if (p.name) m.name = p.name;
  const info: FoodMatInfo = {
    flesh: p.flesh ?? '#' + new THREE.Color(p.color as THREE.ColorRepresentation).getHexString(),
    cookColor: p.cookColor ?? DEFAULT_COOK,
    cookAmount: p.cookAmount ?? 1,
    food: p.food ?? true,
  };
  m.userData.food = info;
  return m;
}

/** Per-item uniforms shared by all materials of one food item. */
export interface FoodUniforms {
  fdItemInv: { value: THREE.Matrix4 };
  fdCook: { value: number };
  fdGrill: { value: number };
  fdFry: { value: number };
  fdBoil: { value: number };
  fdBurn: { value: number };
  fdEmber: { value: number };
  fdFrost: { value: number };
  fdWet: { value: number };
  fdSeed: { value: number };
  fdBites: { value: THREE.Vector4[] };
  fdSpread: { value: number };
  fdSpreadColor: { value: THREE.Color };
  fdCoat: { value: number };
  fdCoatColor: { value: THREE.Color };
  fdHighlight: { value: number };
  fdHighlightColor: { value: THREE.Color };
  fdTint: { value: number };
  fdTintColor: { value: THREE.Color };
  /** Up to three clip planes in item space (xyz normal, w constant): fragments with dot(n,p)+w > 0 are cut away. */
  fdClipA: { value: THREE.Vector4 };
  fdClipB: { value: THREE.Vector4 };
  fdClipC: { value: THREE.Vector4 };
  fdClipOn: { value: number };
}

export const MAX_BITES = 6;

export function createFoodUniforms(seed = Math.random() * 100): FoodUniforms {
  return {
    fdItemInv: { value: new THREE.Matrix4() },
    fdCook: { value: 0 },
    fdGrill: { value: 0 },
    fdFry: { value: 0 },
    fdBoil: { value: 0 },
    fdBurn: { value: 0 },
    fdEmber: { value: 0 },
    fdFrost: { value: 0 },
    fdWet: { value: 0 },
    fdSeed: { value: seed },
    fdBites: { value: Array.from({ length: MAX_BITES }, () => new THREE.Vector4(0, 0, 0, 0)) },
    fdSpread: { value: 0 },
    fdSpreadColor: { value: new THREE.Color('#c8301e') },
    fdCoat: { value: 0 },
    fdCoatColor: { value: new THREE.Color('#4a2412') },
    fdHighlight: { value: 0 },
    fdHighlightColor: { value: new THREE.Color('#fff2c4') },
    fdTint: { value: 0 },
    fdTintColor: { value: new THREE.Color('#ffffff') },
    fdClipA: { value: new THREE.Vector4(0, 1, 0, -1e5) },
    fdClipB: { value: new THREE.Vector4(0, 1, 0, -1e5) },
    fdClipC: { value: new THREE.Vector4(0, 1, 0, -1e5) },
    fdClipOn: { value: 0 },
  };
}

/**
 * Uniforms for one *segment* of an item (e.g. one part of a burger). Item-wide uniforms
 * (transform, bites, highlight) are shared with `shared`; cooking & clipping are per segment.
 */
export function createSegmentUniforms(shared: FoodUniforms, seed: number): FoodUniforms {
  const u = createFoodUniforms(seed);
  u.fdItemInv = shared.fdItemInv;
  u.fdBites = shared.fdBites;
  u.fdHighlight = shared.fdHighlight;
  u.fdHighlightColor = shared.fdHighlightColor;
  return u;
}

const VERT_PARS = /* glsl */ `
uniform mat4 fdItemInv;
varying vec3 vFdPos;
varying vec3 vFdNormal;
`;

const VERT_MAIN = /* glsl */ `
	{
		vec4 fdW = modelMatrix * vec4( transformed, 1.0 );
		vFdPos = ( fdItemInv * fdW ).xyz;
		vFdNormal = normalize( mat3( fdItemInv ) * mat3( modelMatrix ) * objectNormal );
	}
`;

const FRAG_PARS = /* glsl */ `
uniform float fdCook;
uniform float fdGrill;
uniform float fdFry;
uniform float fdBoil;
uniform float fdBurn;
uniform float fdEmber;
uniform float fdFrost;
uniform float fdWet;
uniform float fdSeed;
uniform vec4 fdBites[ ${MAX_BITES} ];
uniform float fdSpread;
uniform vec3 fdSpreadColor;
uniform float fdCoat;
uniform vec3 fdCoatColor;
uniform float fdHighlight;
uniform vec3 fdHighlightColor;
uniform float fdTint;
uniform vec3 fdTintColor;
uniform vec4 fdClipA;
uniform vec4 fdClipB;
uniform vec4 fdClipC;
uniform float fdClipOn;
uniform vec3 fdFlesh;
uniform vec3 fdCookColor;
uniform float fdCookAmt;
uniform float fdIsFood;
varying vec3 vFdPos;
varying vec3 vFdNormal;

float fdHash( vec3 p ) {
	p = fract( p * 0.3183099 + 0.1 );
	p *= 17.0;
	return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float fdNoise( vec3 x ) {
	vec3 i = floor( x );
	vec3 f = fract( x );
	f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mix( fdHash( i + vec3( 0, 0, 0 ) ), fdHash( i + vec3( 1, 0, 0 ) ), f.x ),
	                 mix( fdHash( i + vec3( 0, 1, 0 ) ), fdHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
	            mix( mix( fdHash( i + vec3( 0, 0, 1 ) ), fdHash( i + vec3( 1, 0, 1 ) ), f.x ),
	                 mix( fdHash( i + vec3( 0, 1, 1 ) ), fdHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
float fdFbm( vec3 p ) {
	return fdNoise( p ) * 0.55 + fdNoise( p * 2.13 + 7.1 ) * 0.3 + fdNoise( p * 4.37 + 3.3 ) * 0.15;
}
`;

const FRAG_BITES = /* glsl */ `
	if ( fdClipOn > 0.5 ) {
		if ( dot( fdClipA.xyz, vFdPos ) + fdClipA.w > 0.0 || dot( fdClipB.xyz, vFdPos ) + fdClipB.w > 0.0 || dot( fdClipC.xyz, vFdPos ) + fdClipC.w > 0.0 ) discard;
	}
	for ( int fdI = 0; fdI < ${MAX_BITES}; fdI ++ ) {
		vec4 fdB = fdBites[ fdI ];
		if ( fdB.w > 0.0 ) {
			vec3 fdD = vFdPos - fdB.xyz;
			float fdAng = atan( fdD.z, fdD.x ) * 6.0 + atan( fdD.y, length( fdD.xz ) ) * 4.0;
			float fdR = fdB.w * ( 1.0 + 0.09 * sin( fdAng ) );
			if ( dot( fdD, fdD ) < fdR * fdR ) discard;
		}
	}
`;

// Runs right after the base colour (map + vertex colours) is known.
const FRAG_COLOR = /* glsl */ `
	float fdN = 0.0;
	float fdN2 = 0.0;
	float fdBurnMask = 0.0;
	float fdFryMask = 0.0;
	float fdSpreadMask = 0.0;
	{
		vec3 fdP = vFdPos + vec3( fdSeed * 0.731, fdSeed * 0.317, fdSeed * 0.513 );
		fdN = fdFbm( fdP * 38.0 );
		fdN2 = fdNoise( fdP * 170.0 );
		vec3 fdBase = diffuseColor.rgb;
		if ( ! gl_FrontFacing ) fdBase = fdFlesh;
		float fdAmt = fdCookAmt * fdIsFood;

		// tint (products: chocolate cake, pink smoothie...)
		fdBase = mix( fdBase, fdBase * fdTintColor * 1.15, fdTint * fdIsFood );

		// boiled: paler, a touch desaturated
		float fdLum = dot( fdBase, vec3( 0.299, 0.587, 0.114 ) );
		fdBase = mix( fdBase, mix( fdBase, vec3( fdLum ), 0.3 ) * 1.06 + 0.02, clamp( fdBoil, 0.0, 1.0 ) * 0.55 * fdIsFood );

		// browning (pan, oven, toaster)
		float fdBrown = clamp( fdCook * fdAmt * ( 0.7 + 0.6 * fdN ), 0.0, 1.0 );
		fdBase = mix( fdBase, fdCookColor * ( 0.85 + 0.3 * fdN2 ), fdBrown * 0.92 );

		// deep-fry crust: golden, bumpy, speckled
		fdFryMask = clamp( fdFry * fdAmt * 1.2, 0.0, 1.0 );
		vec3 fdCrust = mix( vec3( 0.93, 0.63, 0.22 ), vec3( 0.72, 0.40, 0.12 ), fdN );
		fdCrust *= 0.82 + 0.36 * fdN2;
		fdBase = mix( fdBase, fdCrust, fdFryMask * 0.93 );

		// grill stripes on top/bottom faces
		float fdFacing = smoothstep( 0.25, 0.75, abs( vFdNormal.y ) );
		float fdS = sin( ( vFdPos.x * 0.82 + vFdPos.z * 0.57 ) * 230.0 );
		float fdStripe = smoothstep( 0.45, 0.85, fdS ) * fdFacing;
		fdBase = mix( fdBase, vec3( 0.20, 0.11, 0.06 ) * ( 0.8 + 0.4 * fdN2 ), fdStripe * clamp( fdGrill * fdAmt, 0.0, 1.0 ) * 0.9 );
		// a little general browning from the grill too
		fdBase = mix( fdBase, fdCookColor, clamp( fdGrill * fdAmt * 0.35, 0.0, 0.35 ) );

		// all-over coating (dipped in chocolate, soy glaze...)
		fdBase = mix( fdBase, fdCoatColor * ( 0.9 + 0.2 * fdN ), clamp( fdCoat, 0.0, 1.0 ) * fdIsFood * ( 0.75 + 0.25 * fdN ) );

		// spread on upward faces (tomato sauce, jam, peanut butter)
		float fdUp = smoothstep( 0.15, 0.6, vFdNormal.y );
		fdSpreadMask = fdUp * smoothstep( 0.42, 0.5, fdSpread * ( 0.55 + 0.7 * fdFbm( vFdPos * 22.0 + 3.0 ) ) ) * fdIsFood;
		fdBase = mix( fdBase, fdSpreadColor * ( 0.92 + 0.16 * fdN2 ), fdSpreadMask );

		// burning: noisy char creeping in
		float fdB = clamp( fdBurn, 0.0, 1.0 );
		fdBurnMask = smoothstep( 0.0, 0.55, fdB * 1.25 + ( fdN - 0.5 ) * 0.7 + ( fdN2 - 0.5 ) * 0.15 ) * smoothstep( 0.0, 0.18, fdB ) * fdIsFood;
		vec3 fdChar = vec3( 0.075, 0.058, 0.048 ) + vec3( 0.06, 0.045, 0.03 ) * fdN2;
		fdBase = mix( fdBase, fdChar, fdBurnMask );

		// frost
		float fdFr = clamp( fdFrost, 0.0, 1.0 ) * ( 0.55 + 0.45 * fdN2 );
		fdBase = mix( fdBase, vec3( 0.84, 0.93, 1.0 ), fdFr * 0.55 );

		diffuseColor.rgb = fdBase;
	}
`;

const FRAG_ROUGH = /* glsl */ `
	roughnessFactor = mix( roughnessFactor, 0.32, clamp( fdBoil * 0.5 + fdWet, 0.0, 1.0 ) * fdIsFood );
	roughnessFactor = mix( roughnessFactor, 0.42, fdFryMask * 0.7 );
	roughnessFactor = mix( roughnessFactor, 0.28, fdSpreadMask * 0.85 );
	roughnessFactor = mix( roughnessFactor, 0.3, clamp( fdCoat, 0.0, 1.0 ) * fdIsFood * 0.8 );
	roughnessFactor = mix( roughnessFactor, 0.22, clamp( fdFrost, 0.0, 1.0 ) * 0.6 );
	roughnessFactor = mix( roughnessFactor, 0.97, fdBurnMask );
`;

const FRAG_EMISSIVE = /* glsl */ `
	{
		float fdFres = pow( 1.0 - clamp( abs( dot( normalize( vViewPosition ), normal ) ), 0.0, 1.0 ), 2.2 );
		// frost rim + glints
		float fdGlint = step( 0.985, fdHash( floor( vFdPos * 420.0 ) ) );
		totalEmissiveRadiance += vec3( 0.55, 0.75, 1.0 ) * clamp( fdFrost, 0.0, 1.0 ) * ( fdFres * 0.45 + fdGlint * 0.6 );
		// embers in the char while it is still hot
		float fdEm = smoothstep( 0.72, 0.95, fdN2 ) * fdBurnMask * fdEmber;
		totalEmissiveRadiance += vec3( 1.0, 0.33, 0.06 ) * fdEm * ( 0.9 + 0.5 * sin( fdSeed + vFdPos.x * 40.0 ) );
		// hover / target highlight
		totalEmissiveRadiance += fdHighlightColor * fdHighlight * ( 0.12 + 0.6 * fdFres );
	}
`;

const PATCH_KEY = 'munchlab-food-v4';

function hexColor(h: string): THREE.Color {
  return new THREE.Color(h);
}

/**
 * Clone a template material and patch it to use the given per-item uniforms.
 * Non-standard materials (e.g. MeshBasicMaterial for a glow) are cloned without patching.
 */
export function bindFoodMaterial<T extends THREE.Material>(template: T, u: FoodUniforms): T {
  const m = template.clone() as T;
  if (!(m instanceof THREE.MeshStandardMaterial)) return m;
  const info: FoodMatInfo = (template.userData.food as FoodMatInfo) ?? {
    flesh: '#' + (m.color?.getHexString?.() ?? 'ffffff'),
    cookColor: DEFAULT_COOK,
    cookAmount: 0,
    food: false,
  };
  const perMat = {
    fdFlesh: { value: hexColor(info.flesh) },
    fdCookColor: { value: hexColor(info.cookColor) },
    fdCookAmt: { value: info.cookAmount },
    fdIsFood: { value: info.food ? 1 : 0 },
  };
  m.userData.foodUniforms = u;
  m.userData.foodMatUniforms = perMat;
  m.side = THREE.DoubleSide;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u, perMat);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + FRAG_BITES)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGH)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMISSIVE);
  };
  m.customProgramCacheKey = () => PATCH_KEY;
  return m;
}

/**
 * Walk an object and bind all its materials to the given uniforms (cloning each template once).
 * Returns the list of patched materials so callers can dispose them later.
 */
export function bindFoodObject(root: THREE.Object3D, u: FoodUniforms): THREE.Material[] {
  const cache = new Map<THREE.Material, THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (mat: THREE.Material) => {
      let b = cache.get(mat);
      if (!b) {
        b = bindFoodMaterial(mat, u);
        cache.set(mat, b);
      }
      return b;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
  return [...cache.values()];
}
