// High-level visual effects built on Particles + Debris.

import * as THREE from 'three';
import { Particles, Sprite } from './Particles';
import { Debris } from './Debris';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const jitter = (p: THREE.Vector3, r: number, ry = r) => V(p.x + rnd(-r, r), p.y + rnd(-ry, ry), p.z + rnd(-r, r));

export class Effects {
  readonly particles = new Particles();
  readonly debris = new Debris();
  readonly group = new THREE.Group();
  /** Global intensity (lowered on slow devices). */
  quality = 1;

  constructor() {
    this.group.add(this.particles.group, this.debris.group);
  }

  update(dt: number, time: number) {
    this.particles.update(dt, time);
    this.debris.update(dt);
  }

  private n(count: number) {
    return Math.max(1, Math.round(count * this.quality));
  }

  /** Rising steam wisps (hot food, boiling pot). */
  steam(pos: THREE.Vector3, strength = 1, spread = 0.04) {
    for (let i = 0; i < this.n(1 + strength); i++)
      this.particles.emit({
        pos: jitter(pos, spread, 0.005),
        vel: V(rnd(-0.02, 0.02), rnd(0.12, 0.22) * (0.7 + strength * 0.3), rnd(-0.02, 0.02)),
        drag: 0.6,
        life: rnd(1.1, 1.8),
        size: rnd(0.03, 0.05),
        sizeEnd: rnd(0.12, 0.18) * (0.7 + strength * 0.3),
        color: '#ffffff',
        alpha: 0.22 + 0.12 * strength,
        fadeIn: 0.25,
        sprite: Sprite.Soft,
        wiggle: 0.06,
        spin: rnd(-0.5, 0.5),
      });
  }

  /** Smoke from burning food: darker, puffier, slower. */
  smoke(pos: THREE.Vector3, darkness = 0.5, strength = 1) {
    const c = new THREE.Color().setRGB(0.55 - darkness * 0.4, 0.53 - darkness * 0.4, 0.52 - darkness * 0.4);
    for (let i = 0; i < this.n(1 + strength); i++)
      this.particles.emit({
        pos: jitter(pos, 0.04, 0.01),
        vel: V(rnd(-0.03, 0.03), rnd(0.1, 0.2), rnd(-0.03, 0.03)),
        acc: V(0, 0.03, 0),
        drag: 0.4,
        life: rnd(1.6, 2.6),
        size: rnd(0.04, 0.07),
        sizeEnd: rnd(0.2, 0.3),
        color: c,
        colorEnd: c.clone().lerp(new THREE.Color('#bdb5ae'), 0.5),
        alpha: 0.5 + darkness * 0.3,
        fadeIn: 0.15,
        sprite: Sprite.Puff,
        wiggle: 0.05,
        spin: rnd(-0.6, 0.6),
      });
  }

  /** Oil spits & sizzle sparkles in a pan. */
  sizzle(pos: THREE.Vector3, radius = 0.1, strength = 1) {
    for (let i = 0; i < this.n(2 * strength); i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
      const p = V(pos.x + Math.cos(a) * r, pos.y + 0.005, pos.z + Math.sin(a) * r);
      this.particles.emit(
        {
          pos: p,
          vel: V(rnd(-0.15, 0.15), rnd(0.3, 0.7), rnd(-0.15, 0.15)),
          acc: V(0, -3, 0),
          life: rnd(0.2, 0.4),
          size: rnd(0.006, 0.011),
          color: '#fff3c0',
          colorEnd: '#ffb040',
          alpha: 0.9,
          sprite: Sprite.Dot,
          fadeIn: 0,
        },
        true,
      );
    }
    if (Math.random() < 0.4 * strength)
      this.particles.emit({
        pos: jitter(pos, radius * 0.6, 0.004),
        vel: V(0, rnd(0.05, 0.12), 0),
        life: rnd(0.5, 0.9),
        size: 0.02,
        sizeEnd: 0.07,
        color: '#ffffff',
        alpha: 0.18,
        sprite: Sprite.Soft,
        wiggle: 0.04,
      });
  }

  /** Bubbles popping on a liquid surface (pot, fryer). */
  bubbles(pos: THREE.Vector3, radius: number, color = '#ffffff', strength = 1, big = false) {
    for (let i = 0; i < this.n(1 + strength * 2); i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
      this.particles.emit({
        pos: V(pos.x + Math.cos(a) * r, pos.y + 0.003, pos.z + Math.sin(a) * r),
        vel: V(0, rnd(0.01, 0.04), 0),
        life: rnd(0.25, 0.55),
        size: big ? rnd(0.012, 0.03) : rnd(0.008, 0.018),
        sizeEnd: big ? rnd(0.03, 0.05) : rnd(0.014, 0.026),
        color,
        alpha: 0.85,
        fadeIn: 0.2,
        sprite: Sprite.Bubble,
      });
    }
  }

  /** Juice / sauce droplets flying out (cutting, splashing). */
  splash(pos: THREE.Vector3, color: string, count = 8, floor = 0.92, power = 1) {
    for (let i = 0; i < this.n(count); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(0.3, 0.9) * power;
      this.debris.spawn({
        pos: jitter(pos, 0.01),
        vel: V(Math.cos(a) * sp, rnd(0.6, 1.4) * power, Math.sin(a) * sp),
        color,
        size: rnd(0.003, 0.006),
        floor,
        kind: 2,
        life: rnd(1.2, 2.2),
      });
    }
    for (let i = 0; i < this.n(count / 2); i++)
      this.particles.emit({
        pos: jitter(pos, 0.015),
        vel: V(rnd(-0.4, 0.4), rnd(0.3, 0.9), rnd(-0.4, 0.4)),
        acc: V(0, -4, 0),
        life: rnd(0.3, 0.5),
        size: rnd(0.008, 0.014),
        color,
        sprite: Sprite.Drop,
        fadeIn: 0,
      });
  }

  /** Crumbs / chunks hopping off (chopping, biting, crunching). */
  crumbs(pos: THREE.Vector3, color: string, count = 8, floor = 0.92, size = 0.005) {
    const c = new THREE.Color(color);
    for (let i = 0; i < this.n(count); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(0.15, 0.6);
      this.debris.spawn({
        pos: jitter(pos, 0.015),
        vel: V(Math.cos(a) * sp, rnd(0.5, 1.2), Math.sin(a) * sp),
        color: c.clone().offsetHSL(0, 0, rnd(-0.06, 0.06)),
        size: size * rnd(0.7, 1.3),
        floor,
        kind: 0,
      });
    }
  }

  /** Curly peel strips flying off a peeler. */
  peel(pos: THREE.Vector3, color: string, floor = 0.92, count = 3) {
    for (let i = 0; i < this.n(count); i++) {
      const a = Math.random() * Math.PI * 2;
      this.debris.spawn({
        pos: jitter(pos, 0.01),
        vel: V(Math.cos(a) * rnd(0.2, 0.5), rnd(0.6, 1.1), Math.sin(a) * rnd(0.2, 0.5)),
        color,
        size: rnd(0.008, 0.014),
        floor,
        kind: 1,
        life: rnd(1.6, 2.6),
      });
    }
  }

  /** Little stars of success. */
  sparkle(pos: THREE.Vector3, count = 10, color = '#fff6c8', spread = 0.08) {
    for (let i = 0; i < this.n(count); i++) {
      const dir = V(rnd(-1, 1), rnd(0, 1.2), rnd(-1, 1)).normalize();
      this.particles.emit(
        {
          pos: jitter(pos, spread * 0.3),
          vel: dir.multiplyScalar(rnd(0.15, 0.5)),
          drag: 2.5,
          life: rnd(0.5, 0.9),
          size: rnd(0.018, 0.04),
          sizeEnd: 0.005,
          color,
          sprite: Sprite.Star,
          spin: rnd(-4, 4),
          fadeIn: 0.05,
        },
        true,
      );
    }
  }

  /** Colourful celebratory burst (new recipe!). */
  celebrate(pos: THREE.Vector3) {
    const colors = ['#ff6b8b', '#ffd23f', '#5fd3ff', '#7ce08a', '#b9a6f2', '#ff9f43'];
    for (let i = 0; i < this.n(36); i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.emit({
        pos: jitter(pos, 0.03),
        vel: V(Math.cos(a) * rnd(0.3, 0.9), rnd(0.6, 1.4), Math.sin(a) * rnd(0.3, 0.9)),
        acc: V(0, -1.6, 0),
        drag: 1.2,
        life: rnd(1.0, 1.6),
        size: rnd(0.02, 0.035),
        color: colors[i % colors.length],
        sprite: i % 3 === 0 ? Sprite.Star : Sprite.Crumb,
        spin: rnd(-6, 6),
        fadeIn: 0,
      });
    }
    this.sparkle(pos, 16);
  }

  /** Puff of cloud (things appearing / disappearing / trash). */
  poof(pos: THREE.Vector3, color = '#ffffff', size = 1) {
    for (let i = 0; i < this.n(10); i++) {
      const a = (i / 10) * Math.PI * 2;
      this.particles.emit({
        pos: jitter(pos, 0.02 * size),
        vel: V(Math.cos(a) * 0.35 * size, rnd(0.05, 0.25), Math.sin(a) * 0.35 * size),
        drag: 4,
        life: rnd(0.5, 0.8),
        size: 0.05 * size,
        sizeEnd: 0.11 * size,
        color,
        alpha: 0.85,
        sprite: Sprite.Puff,
        fadeIn: 0,
        spin: rnd(-1, 1),
      });
    }
  }

  /** Flour / powder dust. */
  dust(pos: THREE.Vector3, color = '#fbf7ee', amount = 1) {
    for (let i = 0; i < this.n(6 * amount); i++)
      this.particles.emit({
        pos: jitter(pos, 0.04, 0.01),
        vel: V(rnd(-0.12, 0.12), rnd(0.03, 0.12), rnd(-0.12, 0.12)),
        drag: 2,
        life: rnd(0.8, 1.4),
        size: 0.03,
        sizeEnd: 0.09,
        color,
        alpha: 0.45,
        sprite: Sprite.Soft,
        fadeIn: 0.1,
      });
  }

  hearts(pos: THREE.Vector3, count = 5) {
    for (let i = 0; i < this.n(count); i++)
      this.particles.emit({
        pos: jitter(pos, 0.08, 0.03),
        vel: V(rnd(-0.08, 0.08), rnd(0.25, 0.45), rnd(-0.03, 0.03)),
        drag: 0.8,
        life: rnd(1.2, 1.8),
        size: rnd(0.04, 0.07),
        sizeEnd: rnd(0.06, 0.09),
        color: i % 2 ? '#ff5d8f' : '#ff86a8',
        sprite: Sprite.Heart,
        wiggle: 0.12,
        rot: rnd(-0.3, 0.3),
        fadeIn: 0.15,
      });
  }

  notes(pos: THREE.Vector3, count = 2) {
    const cols = ['#7b6cf6', '#ff7aa8', '#33b5a6'];
    for (let i = 0; i < count; i++)
      this.particles.emit({
        pos: jitter(pos, 0.05, 0.02),
        vel: V(rnd(-0.05, 0.08), rnd(0.15, 0.25), 0),
        life: rnd(1.2, 1.6),
        size: 0.05,
        color: cols[Math.floor(Math.random() * cols.length)],
        sprite: Sprite.Note,
        wiggle: 0.1,
        rot: rnd(-0.3, 0.3),
        fadeIn: 0.2,
      });
  }

  /** Fire breath (spicy!). dir = direction of the mouth. */
  fire(pos: THREE.Vector3, dir: THREE.Vector3, strength = 1) {
    for (let i = 0; i < this.n(4 * strength); i++) {
      const v = dir.clone().multiplyScalar(rnd(0.6, 1.1)).add(V(rnd(-0.12, 0.12), rnd(-0.05, 0.15), rnd(-0.12, 0.12)));
      this.particles.emit(
        {
          pos: jitter(pos, 0.01),
          vel: v,
          acc: V(0, 0.8, 0),
          drag: 1.5,
          life: rnd(0.35, 0.6),
          size: rnd(0.03, 0.05),
          sizeEnd: rnd(0.08, 0.12),
          color: '#fff1a0',
          colorEnd: '#ff3d1a',
          sprite: Sprite.Flame,
          rot: 0,
          fadeIn: 0,
        },
        true,
      );
    }
  }

  /** Steam jets from the ears (spicy / angry). */
  earSteam(pos: THREE.Vector3, dir: THREE.Vector3) {
    this.particles.emit({
      pos: pos.clone(),
      vel: dir.clone().multiplyScalar(rnd(0.35, 0.5)).add(V(0, 0.2, 0)),
      drag: 1.8,
      life: rnd(0.6, 0.9),
      size: 0.03,
      sizeEnd: 0.1,
      color: '#ffffff',
      alpha: 0.7,
      sprite: Sprite.Puff,
      fadeIn: 0,
    });
  }

  /** Cold mist & snowflakes (freezer, frozen food, brr). */
  frost(pos: THREE.Vector3, radius = 0.1, strength = 1) {
    for (let i = 0; i < this.n(2 * strength); i++)
      this.particles.emit({
        pos: jitter(pos, radius, 0.02),
        vel: V(rnd(-0.03, 0.03), rnd(-0.02, 0.05), rnd(-0.03, 0.03)),
        drag: 1,
        life: rnd(1.2, 2),
        size: rnd(0.05, 0.08),
        sizeEnd: rnd(0.14, 0.2),
        color: '#e8f6ff',
        alpha: 0.28,
        sprite: Sprite.Soft,
        fadeIn: 0.3,
        wiggle: 0.04,
      });
    if (Math.random() < 0.6 * strength)
      this.particles.emit(
        {
          pos: jitter(pos, radius, 0.03),
          vel: V(rnd(-0.03, 0.03), rnd(-0.06, 0.04), rnd(-0.03, 0.03)),
          life: rnd(1, 1.6),
          size: rnd(0.012, 0.022),
          color: '#d8f0ff',
          sprite: Sprite.Flake,
          spin: rnd(-2, 2),
          wiggle: 0.05,
        },
        true,
      );
  }

  sweat(pos: THREE.Vector3) {
    this.particles.emit({
      pos: pos.clone(),
      vel: V(rnd(-0.1, 0.1), rnd(0.15, 0.3), 0),
      acc: V(0, -2.5, 0),
      life: 0.7,
      size: 0.03,
      color: '#8fd3ff',
      sprite: Sprite.Sweat,
      fadeIn: 0,
      rot: 0,
    });
  }

  tears(pos: THREE.Vector3, side: number) {
    this.particles.emit({
      pos: pos.clone(),
      vel: V(side * rnd(0.25, 0.4), rnd(0.25, 0.4), rnd(0.05, 0.1)),
      acc: V(0, -3, 0),
      life: 0.6,
      size: 0.022,
      color: '#7cc8ff',
      sprite: Sprite.Drop,
      fadeIn: 0,
      rot: Math.PI,
    });
  }

  /** Dizzy swirl / confusion marks above the head. */
  swirl(pos: THREE.Vector3) {
    this.particles.emit({
      pos: pos.clone(),
      vel: V(0, 0.05, 0),
      life: 1.2,
      size: 0.08,
      color: '#8e7cf0',
      sprite: Sprite.Swirl,
      spin: 3,
      fadeIn: 0.2,
    });
  }

  /** Glints for frozen things. */
  glint(pos: THREE.Vector3, radius: number) {
    this.particles.emit(
      {
        pos: jitter(pos, radius, radius * 0.5),
        vel: V(0, 0.02, 0),
        life: 0.5,
        size: 0.025,
        sizeEnd: 0,
        color: '#e8f8ff',
        sprite: Sprite.Star,
        spin: 2,
        fadeIn: 0.3,
      },
      true,
    );
  }

  /** Pop for popcorn: a little white burst + a hop. */
  pop(pos: THREE.Vector3, color = '#fff8e0') {
    this.sparkle(pos, 3, '#fff0b0', 0.02);
    for (let i = 0; i < 3; i++)
      this.debris.spawn({ pos: pos.clone(), vel: V(rnd(-0.4, 0.4), rnd(0.8, 1.4), rnd(-0.4, 0.4)), color, size: 0.007, floor: pos.y - 0.02, kind: 0, life: 1 });
  }

  clear() {
    this.particles.clear();
    this.debris.clear();
  }
}
