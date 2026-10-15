// Bridges as real 3D structures: deck slab with girders, concrete parapets with steel rails, piers down to the
// river/sea bed and abutments, merged into one mesh (+ one for steel). Each part has a Rapier collider.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Physics } from '../../core/Physics';
import { Layer } from '../../core/Physics';
import type { BridgeDef } from '../layout/types';
import type { World } from '../World';

/** Concrete/steel material with world-space triplanar noise variation (no UV stretching on long boxes). */
export function createStructureMaterial(noise: THREE.Texture, color: number, roughness: number, metalness = 0): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.tStructNoise = { value: noise };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSW;\nvarying vec3 vSN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\nvSN = normalize( mat3( modelMatrix ) * objectNormal );');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tStructNoise;\nvarying vec3 vSW;\nvarying vec3 vSN;')
      .replace(
        '#include <map_fragment>',
        `vec3 sw = pow( abs( vSN ), vec3( 4.0 ) ); sw /= dot( sw, vec3( 1.0 ) );
         vec4 sx = texture2D( tStructNoise, vSW.zy / 6.0 ), sy = texture2D( tStructNoise, vSW.xz / 6.0 ), sz = texture2D( tStructNoise, vSW.xy / 6.0 );
         vec4 sn = sx * sw.x + sy * sw.y + sz * sw.z;
         vec4 sf = texture2D( tStructNoise, vSW.xz / 0.7 + vSW.y * 0.3 );
         float stain = smoothstep( 0.55, 0.8, sn.g ) * 0.25 + smoothstep( 0.0, -4.0, vSW.y - 2.0 ) * 0.2;
         diffuseColor.rgb *= ( 0.82 + 0.3 * sn.r + 0.1 * ( sf.b - 0.5 ) ) * ( 1.0 - stain );`,
      );
  };
  m.customProgramCacheKey = () => `structure-${color}-${roughness}`;
  return m;
}

interface Part {
  geo: THREE.BufferGeometry;
  steel?: boolean;
}

export class Bridges {
  readonly group = new THREE.Group();

  constructor(world: World, physics: Physics | null, noise: THREE.Texture) {
    const concrete: THREE.BufferGeometry[] = [];
    const steel: THREE.BufferGeometry[] = [];
    for (const br of world.layout.bridges) {
      for (const p of this.buildBridge(world, br, physics)) (p.steel ? steel : concrete).push(p.geo);
    }
    this.group.name = 'bridges';
    if (concrete.length) {
      const m = new THREE.Mesh(mergeGeometries(concrete), createStructureMaterial(noise, 0x9a968c, 0.9));
      m.castShadow = m.receiveShadow = true;
      m.name = 'bridge-concrete';
      this.group.add(m);
    }
    if (steel.length) {
      const m = new THREE.Mesh(mergeGeometries(steel), createStructureMaterial(noise, 0x6f747a, 0.45, 0.85));
      m.castShadow = m.receiveShadow = true;
      m.name = 'bridge-steel';
      this.group.add(m);
    }
    for (const g of [...concrete, ...steel]) g.dispose();
  }

  private buildBridge(world: World, br: BridgeDef, physics: Physics | null): Part[] {
    const parts: Part[] = [];
    const dx = br.b.x - br.a.x, dz = br.b.z - br.a.z;
    const L = Math.hypot(dx, dz);
    const rot = Math.atan2(dx, dz); // local +Z along the bridge
    const cx = (br.a.x + br.b.x) / 2, cz = (br.a.z + br.b.z) / 2;
    const W = br.width;
    const top = br.deckY;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    const tx = dx / L, tz = dz / L;
    const box = (w: number, h: number, d: number, lx: number, ly: number, lz: number, steel = false, collide = true, kind: 'terrain' | 'building' = 'building') => {
      const g = new THREE.BoxGeometry(w, h, d);
      const wx = cx + lx * Math.cos(rot) + lz * Math.sin(rot);
      const wz = cz - lx * Math.sin(rot) + lz * Math.cos(rot);
      g.applyQuaternion(q);
      g.translate(wx, ly, wz);
      parts.push({ geo: g, steel });
      if (collide && physics) {
        physics.addStaticBox(
          new THREE.Vector3(wx, ly, wz),
          new THREE.Vector3(w / 2, h / 2, d / 2),
          rot,
          { kind, surface: kind === 'terrain' ? 'asphalt' : steel ? 'metal' : 'concrete', owner: br },
          kind === 'terrain' ? Layer.Terrain : Layer.Static,
        );
      }
    };
    const deckT = br.kind === 'channel' ? 1.3 : 1.0;
    // deck slab (walkable surface = top face at deckY) and girders
    box(W, deckT, L, 0, top - deckT / 2, 0, false, true, 'terrain');
    const girderH = br.kind === 'channel' ? 1.6 : 1.0;
    for (const s of [-1, 1]) box(1.0, girderH, L - 2, s * (W / 2 - 1.6), top - deckT - girderH / 2, 0, false, false);
    // parapets + steel hand rails on posts
    const pH = 0.95, pT = 0.35;
    for (const s of [-1, 1]) {
      box(pT, pH, L, s * (W / 2 + pT / 2), top + pH / 2, 0);
      box(0.08, 0.1, L, s * (W / 2 + pT / 2), top + pH + 0.28, 0, true, false);
      for (let z = -L / 2 + 1; z <= L / 2 - 1; z += 3) box(0.06, 0.28, 0.06, s * (W / 2 + pT / 2), top + pH + 0.14, z, true, false);
    }
    // piers where the ground is well below the deck
    const spacing = br.kind === 'channel' ? 31 : 24;
    const nSeg = Math.max(1, Math.round(L / spacing));
    for (let i = 1; i < nSeg; i++) {
      const lz = -L / 2 + (L * i) / nSeg;
      const px = cx + tx * lz, pz = cz + tz * lz;
      const ground = world.getHeight(px, pz);
      const bottom = ground - 1.5;
      const capY = top - deckT - girderH - 0.45;
      const h = capY - 0.45 - bottom;
      if (h < 1.5) continue;
      const pw = Math.min(W - 2, br.kind === 'channel' ? 7 : 5);
      box(pw, h, 1.8, 0, bottom + h / 2, lz);
      box(W - 0.6, 0.9, 2.4, 0, capY, lz, false, false); // pier cap
    }
    // abutments at both ends (walls down into the embankment)
    for (const s of [-1, 1]) {
      const lz = s * (L / 2 - 1);
      const px = cx + tx * lz, pz = cz + tz * lz;
      const ground = world.getHeight(px, pz);
      const h = Math.max(1, top - deckT - (ground - 2));
      box(W + 0.7, h, 2.2, 0, top - deckT - h / 2, lz);
    }
    return parts;
  }
}
