// Particle presets for Last Ferry (fire, smoke, gas, dust, splinters, flashes)
// on top of the shared Effects layers.
import type * as THREE from 'three';
import type { Effects } from '../Effects';
import { rand } from './ctx';

/** Atlas cells (see Effects' makeAtlas). */
export const F = { Dot: 0, Smoke: 1, Fire: 2, Spark: 3, Star: 4, Ring: 5, Mist: 6, Flake: 7, BrokenRing: 8, Shock: 9 } as const;

type P3 = { x: number; y: number; z: number };

/**
 * One tongue of flame rising from p (a narrow lick stretched along its upward
 * velocity, orange to deep red; `hot` = a brighter yellow core). `k` scales size.
 */
export function flame(fx: Effects, x: number, y: number, z: number, k = 1, hot = false): void {
  const up = rand(1.6, 3.0) * (0.7 + 0.3 * k);
  fx.emit(true, x, y, z, {
    vel: [rand(-0.25, 0.25), up, rand(-0.2, 0.2)],
    drag: 1.1,
    g: -1.5,
    size: [rand(0.13, 0.22) * k, rand(0.04, 0.08) * k],
    life: rand(0.22, 0.4),
    color: hot ? 0xffc860 : 0xffa838,
    color1: 0xa82808,
    alpha: [hot ? 0.8 : 0.9, 0],
    frame: F.Fire,
    streak: 4,
  });
}

/** Dark smoke rising (fires, burning bodies). */
export function smoke(fx: Effects, x: number, y: number, z: number, k = 1, color: THREE.ColorRepresentation = 0x2a2522, alpha = 0.45): void {
  fx.emit(false, x, y, z, {
    vel: [rand(-0.2, 0.3), rand(0.6, 1.3), rand(-0.2, 0.2)],
    drag: 0.7,
    size: [0.25 * k, rand(0.9, 1.5) * k],
    life: rand(1.4, 2.4),
    color,
    color1: 0x6a6460,
    alpha: [alpha, 0],
    frame: F.Smoke,
    vr: rand(-0.6, 0.6),
  });
}

/** A glowing ember drifting up. */
export function ember(fx: Effects, x: number, y: number, z: number, k = 1): void {
  fx.emit(true, x, y, z, {
    vel: [rand(-0.6, 0.6) * k, rand(1, 3) * k, rand(-0.5, 0.5) * k],
    g: -0.4,
    drag: 0.8,
    size: [0.035, 0.015],
    life: rand(0.6, 1.4),
    color: 0xffd080,
    color1: 0xff4a10,
    alpha: [1, 0],
    frame: F.Dot,
  });
}

/** Plank dust kicked up at deck level. */
export function dust(fx: Effects, x: number, z: number, n: number, size = 0.3, spread = 1, color: THREE.ColorRepresentation = 0x9a8c7c): void {
  n = Math.max(1, Math.round(n * fx.density));
  for (let i = 0; i < n; i++) {
    fx.emit(false, x + rand(-0.2, 0.2) * spread, 0.06, z + rand(-0.2, 0.2) * spread, {
      vel: [rand(-1.6, 1.6) * spread, rand(0.2, 1.1), rand(-1.2, 1.2) * spread],
      drag: 3,
      g: 0.4,
      size: [size * 0.5, size * 1.8],
      life: rand(0.5, 1.1),
      color,
      alpha: [0.45, 0],
      frame: F.Smoke,
      vr: rand(-1, 1),
    });
  }
}

/** Wooden splinters / crate bits flying out. */
export function splinters(fx: Effects, p: P3, n: number, speed = 6, color: THREE.ColorRepresentation = 0x7a5a38): void {
  n = Math.max(1, Math.round(n * fx.density));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * rand(0.3, 1);
    fx.emit(false, p.x, p.y, p.z, {
      vel: [Math.cos(a) * s, rand(2, 6) * (speed / 6), Math.sin(a) * s * 0.7],
      g: 18,
      drag: 0.6,
      size: [rand(0.04, 0.08), 0.04],
      life: rand(0.6, 1.2),
      color,
      color1: 0x3a2a1a,
      alpha: [1, 0.8],
      frame: F.Spark,
      streak: 0.6,
      ground: true,
    });
  }
}

/** Metal sparks (riot plates, ricochets, the crane's rope). */
export function metalHit(fx: Effects, p: P3, dirX: number, n = 10): void {
  fx.sparks(p, n, dirX, 7);
  fx.emit(true, p.x, p.y, p.z, { size: [0.3, 0.08], life: 0.07, color: 0xfff0d0, alpha: [1, 0], frame: F.Star });
}

/** A puff of the bloater's gas: murky yellow-green, darker toward the edges. */
export function gasPuff(fx: Effects, x: number, z: number, radius: number, strength = 1, night = 0): void {
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random());
  const d = r * radius * 0.85;
  const px = x + Math.cos(a) * d;
  const pz = z + Math.sin(a) * d * 0.85;
  const big = radius * rand(0.4, 0.75);
  const edge = r > 0.6;
  fx.emit(false, px, rand(0.2, 1.2), pz, {
    vel: [Math.cos(a) * rand(0, 0.25), rand(0.05, 0.3), Math.sin(a) * rand(0, 0.2)],
    drag: 0.4,
    size: [big * 0.75, big * 1.2],
    life: rand(1.8, 2.8),
    color: edge ? 0x6e8a2a : 0xa2c048,
    color1: 0x4a5a1e,
    alpha: [(edge ? 0.2 : 0.27) * strength, 0],
    frame: F.Smoke,
    vr: rand(-0.4, 0.4),
  });
  if (Math.random() < 0.45) {
    fx.emit(true, px, rand(0.2, 1.0), pz, {
      vel: [0, rand(0.05, 0.25), 0],
      drag: 0.5,
      size: [big * 0.6, big * 0.9],
      life: rand(1.0, 1.6),
      color: 0x7aa01c,
      alpha: [(0.035 + 0.075 * night) * strength, 0],
      frame: F.Mist,
      vr: rand(-0.3, 0.3),
    });
  }
}

/**
 * Fireball + smoke + embers with a colour scheme (cannon: orange; gas: sickly
 * green-yellow). A short warm core over dark, rolling billows; the smoke that
 * stays behind is dark and thins out as it rises (no pale veil over the pile).
 */
export function fireball(fx: Effects, p: P3, radius: number, scheme: 'fire' | 'gas'): void {
  const d = fx.density;
  const gas = scheme === 'gas';
  const hot = gas ? 0xd8f080 : 0xffc060;
  const mid = gas ? 0x5a8010 : 0x8a2008;
  // Fire core (additive, kept under ~half the blast radius).
  for (let i = 0; i < Math.round(11 * d); i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * radius * 0.35;
    fx.emit(true, p.x + Math.cos(a) * r, p.y + 0.2 + Math.random() * 0.8, p.z + Math.sin(a) * r * 0.7, {
      vel: [Math.cos(a) * 3.5 * Math.random(), 1.5 + Math.random() * 3.5, Math.sin(a) * 2.5 * Math.random()],
      drag: 2.6,
      size: [0.4 + Math.random() * 0.4, radius * (0.26 + Math.random() * 0.2)],
      life: 0.35 + Math.random() * 0.35,
      color: hot,
      color1: mid,
      alpha: [0.9, 0],
      frame: F.Fire,
      vr: (Math.random() - 0.5) * 3,
    });
  }
  // A brief warm flash (not a white disc).
  fx.emit(true, p.x, p.y + 0.7, p.z, { size: [radius * 0.35, radius * 0.6], life: 0.07, color: gas ? 0xd8ff90 : 0xffc880, alpha: [0.6, 0], frame: F.Dot });
  // Rolling dark-orange billows (alpha-blended: they give the fire a body and a silhouette).
  for (let i = 0; i < Math.round(8 * d); i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * radius * 0.3;
    fx.emit(false, p.x + Math.cos(a) * r, p.y + 0.4 + Math.random() * 0.7, p.z + Math.sin(a) * r * 0.7, {
      vel: [Math.cos(a) * 2.2 * Math.random(), 1.8 + Math.random() * 2.4, Math.sin(a) * 1.6 * Math.random()],
      drag: 2.0,
      size: [radius * 0.22, radius * (0.45 + Math.random() * 0.25)],
      life: 0.6 + Math.random() * 0.45,
      color: gas ? 0x4a5a18 : 0x6a2a0e,
      color1: gas ? 0x1e2410 : 0x1c1614,
      alpha: [0.85, 0],
      frame: F.Smoke,
      vr: (Math.random() - 0.5) * 1.6,
    });
  }
  // Smoke that rises off the pile and thins (dark, never lighter than the planks).
  for (let i = 0; i < Math.round(10 * d); i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * radius * 0.35;
    fx.emit(false, p.x + Math.cos(a) * r, p.y + 0.6 + Math.random() * 1.2, p.z + Math.sin(a) * r * 0.7, {
      vel: [Math.cos(a) * 1.2, 2.0 + Math.random() * 2.2, Math.sin(a) * 0.9],
      drag: 0.9,
      size: [0.7, radius * (0.55 + Math.random() * 0.35)],
      life: 1.5 + Math.random() * 1.3,
      color: gas ? 0x2a3018 : 0x2a2624,
      color1: gas ? 0x4a5236 : 0x4a4644,
      alpha: [0.55, 0],
      frame: F.Smoke,
      vr: (Math.random() - 0.5) * 0.8,
    });
  }
  for (let i = 0; i < Math.round(30 * d); i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 5 + Math.random() * 11;
    fx.emit(true, p.x, p.y + 0.4, p.z, {
      vel: [Math.cos(a) * s, 3 + Math.random() * 8, Math.sin(a) * s * 0.7],
      g: 16,
      drag: 0.8,
      size: [0.05, 0.03],
      life: 0.5 + Math.random() * 0.7,
      color: gas ? 0xeaffa0 : 0xffd070,
      color1: gas ? 0x6aa010 : 0xff4a10,
      alpha: [1, 0.2],
      frame: F.Spark,
      streak: 1.5,
      ground: true,
    });
  }
}

/**
 * A shock of dust racing out over the planks from (x, z): low puffs thrown
 * radially (blasts, the crates landing, a stomp) plus a soft lumpy ring.
 */
export function shockDust(fx: Effects, x: number, z: number, radius: number, n: number, color: THREE.ColorRepresentation = 0x9a8c7a, alpha = 0.42): void {
  n = Math.max(4, Math.round(n * fx.density));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.15, 0.15);
    const sp = radius * rand(2.2, 3.4);
    fx.emit(false, x + Math.cos(a) * 0.3, rand(0.05, 0.2), z + Math.sin(a) * 0.25, {
      vel: [Math.cos(a) * sp, rand(0.1, 0.6), Math.sin(a) * sp * 0.75],
      drag: 3.2,
      g: 0.2,
      size: [0.2, rand(0.25, 0.4) * radius],
      life: rand(0.7, 1.2),
      color,
      alpha: [alpha, 0],
      frame: F.Smoke,
      vr: rand(-1, 1),
    });
  }
  fx.ring(x, 0.05, z, radius * 0.25, radius * 1.6, 0.55, color, 0.3, { blend: 'normal', frame: F.Shock });
}
