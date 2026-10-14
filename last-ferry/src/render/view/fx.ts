// Particle presets for Last Ferry (fire, smoke, gas, dust, splinters, flashes)
// on top of the shared Effects layers.
import type * as THREE from 'three';
import type { Effects } from '../Effects';
import { rand } from './ctx';

/** Atlas cells (see Effects' makeAtlas). */
export const F = { Dot: 0, Smoke: 1, Fire: 2, Spark: 3, Star: 4, Ring: 5, Mist: 6, Flake: 7 } as const;

type P3 = { x: number; y: number; z: number };

/** One tongue of flame rising from p. `k` scales size. */
export function flame(fx: Effects, x: number, y: number, z: number, k = 1, hot = false): void {
  fx.emit(true, x, y, z, {
    vel: [rand(-0.25, 0.25), rand(1.2, 2.6) * (0.7 + 0.3 * k), rand(-0.2, 0.2)],
    drag: 1.2,
    size: [rand(0.16, 0.3) * k, rand(0.04, 0.1) * k],
    life: rand(0.3, 0.55),
    color: hot ? 0xfff2c0 : 0xffd27a,
    color1: 0xd2300a,
    alpha: [0.95, 0],
    frame: F.Fire,
    vr: rand(-3, 3),
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

/** Fireball + smoke + embers with a colour scheme (cannon: orange; gas: sickly green-yellow). */
export function fireball(fx: Effects, p: P3, radius: number, scheme: 'fire' | 'gas'): void {
  const d = fx.density;
  const hot = scheme === 'gas' ? 0xf4ffa0 : 0xfff0a0;
  const mid = scheme === 'gas' ? 0x8ac020 : 0xc02a08;
  for (let i = 0; i < Math.round(18 * d); i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * radius * 0.35;
    fx.emit(true, p.x + Math.cos(a) * r, p.y + 0.2 + Math.random() * 0.8, p.z + Math.sin(a) * r * 0.7, {
      vel: [Math.cos(a) * 3.5 * Math.random(), 1.5 + Math.random() * 3.5, Math.sin(a) * 2.5 * Math.random()],
      drag: 2.6,
      size: [0.5 + Math.random() * 0.5, radius * (0.38 + Math.random() * 0.3)],
      life: 0.4 + Math.random() * 0.4,
      color: hot,
      color1: mid,
      alpha: [1, 0],
      frame: F.Fire,
      vr: (Math.random() - 0.5) * 3,
    });
  }
  fx.emit(true, p.x, p.y + 0.7, p.z, { size: [radius * 0.6, radius * 1.1], life: 0.14, color: 0xffffe8, alpha: [1, 0], frame: F.Dot });
  for (let i = 0; i < Math.round(14 * d); i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * radius * 0.35;
    fx.emit(false, p.x + Math.cos(a) * r, p.y + 0.5 + Math.random() * 1.2, p.z + Math.sin(a) * r * 0.7, {
      vel: [Math.cos(a) * 1.4, 1.4 + Math.random() * 2.2, Math.sin(a) * 1.0],
      drag: 1.1,
      size: [0.9, radius * (0.7 + Math.random() * 0.5)],
      life: 1.8 + Math.random() * 1.8,
      color: scheme === 'gas' ? 0x3a4220 : 0x2e2a28,
      color1: scheme === 'gas' ? 0x7a8a5a : 0x8e8a88,
      alpha: [0.8, 0],
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
      color: scheme === 'gas' ? 0xeaffa0 : 0xffe080,
      color1: scheme === 'gas' ? 0x6aa010 : 0xff5010,
      alpha: [1, 0.2],
      frame: F.Spark,
      streak: 1.5,
      ground: true,
    });
  }
}
