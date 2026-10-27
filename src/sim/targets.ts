/**
 * Unified selectable targets: bodies of the active system, star systems
 * (catalogued or procedural), and galaxies. Picking projects candidates to
 * the screen and prefers bright / large / near objects.
 */
import * as THREE from 'three';
import type { Body } from '../astro/body';
import type { GalaxyParams } from '../astro/galaxy';
import type { SystemRef, Cosmos } from './cosmos';
import type { SceneRenderer } from '../render/scenerenderer';
import type { Nebula } from '../astro/nebulae';
import { galaxyToUPos } from '../astro/galaxy';
import type { World } from './world';
import { UPos } from '../core/upos';
import { LY, SOLAR_LUMINOSITY, SOLAR_CONSTANT } from '../core/constants';

export interface Target {
  kind: 'body' | 'system' | 'galaxy' | 'nebula';
  id: string;
  name: string;
  body?: Body;
  system?: SystemRef;
  galaxy?: GalaxyParams;
  nebula?: Nebula;
  radius: number; // m
  position(out: UPos): UPos;
}

export function bodyTarget(b: Body): Target {
  return {
    kind: 'body', id: b.id, name: b.displayName, body: b, radius: b.radius || 1e6,
    position: (out) => b.system.bodyUPos(b, out),
  };
}

export function systemTarget(ref: SystemRef): Target {
  return { kind: 'system', id: ref.id, name: ref.name, system: ref, radius: 7e8, position: (out) => out.copy(ref.upos) };
}

export function galaxyTarget(g: GalaxyParams): Target {
  return { kind: 'galaxy', id: g.id, name: g.name, galaxy: g, radius: g.radius * LY, position: (out) => out.copy(g.upos) };
}

export function nebulaTarget(n: Nebula, g: GalaxyParams): Target {
  return {
    kind: 'nebula', id: n.id, name: n.name, nebula: n, galaxy: g, radius: n.radius * LY * Math.max(...n.axes),
    position: (out) => galaxyToUPos(g, n.center.x, n.center.y, n.center.z, out),
  };
}

/** Comfortable viewing distance for "go to". */
export function standoff(t: Target): number {
  if (t.kind === 'galaxy') return t.radius * 2.6;
  if (t.kind === 'nebula') return t.radius * 2.4;
  if (t.kind === 'system') return 3e11;
  const b = t.body!;
  if (b.isStarLike) return Math.max(b.radius * 6, 1e9);
  return b.radius * (b.planet?.type === 'gas-giant' ? 3.2 : 2.6);
}

const _v = new THREE.Vector3();
const _u = new UPos();

export function pick(world: World, cosmos: Cosmos, r: SceneRenderer, sx: number, sy: number, w: number, h: number): Target | null {
  const cam = r.camera;
  const camU = r.camUPos;
  let best: Target | null = null;
  let bestScore = Infinity;
  const consider = (rel: THREE.Vector3, angRadius: number, brightness: number, make: () => Target) => {
    const p = _v.copy(rel).project(cam);
    if (p.z > 1 || p.z < -1) return;
    const x = (p.x * 0.5 + 0.5) * w, y = (-p.y * 0.5 + 0.5) * h;
    const pix = (angRadius / r.ctx.pixelAngle) * (h / r.pipeline.height);
    const d = Math.hypot(x - sx, y - sy);
    const reach = Math.max(10, pix);
    if (d > reach + 4) return;
    // inside a resolved disc beats any point; otherwise prefer bright objects
    const score = pix > 6 && d < pix ? -1e6 + rel.length() * 1e-20 : d - Math.log10(Math.max(brightness, 1e-30)) * 1.5;
    if (score < bestScore) {
      bestScore = score;
      best = make();
    }
  };
  // bodies of the active system
  const sys = world.system;
  if (sys) {
    for (const b of sys.bodies) {
      if (b.kind === 'barycenter') continue;
      const rel = r.bodyRel.get(b.id);
      if (!rel) continue;
      const d = rel.length();
      const bright = b.isStarLike ? (b.star?.luminosity ?? 0) / (d * d) : (b.radius / d) ** 2 * 1e20;
      consider(rel, b.radius / d, bright, () => bodyTarget(b));
    }
  }
  // catalogued systems
  for (const k of cosmos.knownSystems) {
    if (k.id === cosmos.activeRef?.id) continue;
    const rel = k.upos.sub(camU, new THREE.Vector3());
    const d = rel.length();
    consider(rel, 0, ((k.lumV ?? 0) * SOLAR_LUMINOSITY) / (d * d) / SOLAR_CONSTANT, () => systemTarget(k));
  }
  // procedural field stars (current galaxy)
  const g = cosmos.current;
  if (g) {
    let bestStar: { s: ReturnType<typeof r.starField.nearest>; } | null = null;
    void bestStar;
    for (const st of r.starField.stars()) {
      if (st.lumV <= 0 && st.remnant !== 3) continue;
      const rel = new THREE.Vector3(st.x - cosmos.camG.x, st.y - cosmos.camG.y, st.z - cosmos.camG.z).multiplyScalar(LY).applyQuaternion(g.q);
      const d = rel.length();
      const flux = (st.lumV * SOLAR_LUMINOSITY) / (d * d) / SOLAR_CONSTANT;
      if (flux < 1e-15 && st.remnant !== 3) continue;
      consider(rel, 0, flux, () => systemTarget(cosmos.refFromStar(st)));
    }
  }
  // nebulae (resolved discs only)
  if (g) {
    for (const n of cosmos.nebulae) {
      const rel = new THREE.Vector3().copy(n.center).sub(cosmos.camG).multiplyScalar(LY).applyQuaternion(g.q);
      const d = rel.length();
      const R = n.radius * LY;
      if (d < R) continue;
      consider(rel, (R / d) * 0.7, (R / d) * 1e3, () => nebulaTarget(n, g));
    }
  }
  // galaxies
  for (const gal of cosmos.galaxies) {
    if (gal === cosmos.current) continue;
    const rel = gal.upos.sub(camU, new THREE.Vector3());
    const d = rel.length();
    consider(rel, (gal.radius * LY) / d, (gal.stellarMass / d / d) * 1e40, () => galaxyTarget(gal));
  }
  void _u;
  return best;
}
