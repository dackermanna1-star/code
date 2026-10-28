/**
 * Meteors: interplanetary dust burning up in a planet's upper atmosphere.
 *
 * Every world with enough air has a sporadic background (≈6 per hour for a
 * dark-sky observer) plus annual showers, when the planet crosses a
 * comet's debris stream: activity is a Gaussian in the planet's solar
 * longitude, meteors arrive from the shower's radiant at its stream speed,
 * and the observed rate follows the radiant's altitude. Earth has its real
 * major showers (IMO data: peak solar longitude, ZHR, speed, radiant).
 *
 * Meteors appear where the air density reaches ≈5×10⁻⁷ kg/m³ (≈100 km on
 * Earth), with magnitudes drawn from a population index r = 2.5, a sin^1.5
 * light curve along a 30–40 km path, a short glowing wake, persistent trains
 * after fireballs, and colours by speed (fast: Mg/O green-white, slow: Na/Fe
 * yellow-orange). They are rendered through the same photometric point
 * pipeline as stars, so their brightness is consistent with the sky.
 */
import * as THREE from 'three';
import type { Body, StarSystem } from '../astro/body';
import { Rng, seedOf } from '../core/rng';
import { AMU, K_B } from '../core/constants';
import { radecToVec, eqToEcl, toYUp } from '../astro/known/coords';

export interface Shower {
  name: string;
  /** solar longitude of peak (rad) */
  peak: number;
  /** Gaussian width in solar longitude (rad) */
  width: number;
  zhr: number;
  speed: number;            // m/s
  radiant: THREE.Vector3;   // system frame, unit vector toward the radiant
}

const DEG = Math.PI / 180;
const radiantEcl = (ra: number, dec: number) => toYUp(eqToEcl(radecToVec(ra, dec)));

/** Earth's major annual showers (IMO working list, rounded). */
const EARTH_SHOWERS: Shower[] = [
  ['Quadrantids', 283.15, 0.4, 110, 41, 230, 49],
  ['Lyrids', 32.32, 0.8, 18, 49, 271, 34],
  ['η-Aquariids', 45.5, 3, 50, 66, 338, -1],
  ['Perseids', 140.0, 2, 100, 59, 48, 58],
  ['Orionids', 208, 3, 20, 66, 95, 16],
  ['Leonids', 235.27, 0.7, 15, 71, 152, 22],
  ['Geminids', 262.2, 1, 150, 35, 112, 33],
].map(([name, peak, w, zhr, v, ra, dec]) => ({
  name: name as string, peak: (peak as number) * DEG, width: (w as number) * DEG, zhr: zhr as number, speed: (v as number) * 1000, radiant: radiantEcl(ra as number, dec as number),
}));

const SPORADIC_HR = 6;
/** effective collecting area of the meteor layer for one observer (km²) */
const OBS_AREA = 37200;

/** Meteor layer altitude (m) for a body, or null without enough air. */
export function meteorAltitude(b: Body): number | null {
  const a = b.planet?.atmosphere;
  if (!a || a.pressure < 1e-3) return null;
  const T = Math.max(b.planet!.tempMean, 30);
  const rho0 = (a.pressure * 1e5 * a.meanMolecularMass * AMU) / (K_B * T);
  const H = a.scaleHeight || 8000;
  return H * Math.log(Math.max(rho0 / 5e-7, 2));
}

/** The annual showers of a body (deterministic; Earth: real ones). */
export function showersFor(b: Body): Shower[] {
  if (meteorAltitude(b) === null) return [];
  if (b.known && b.name === 'Earth') return EARTH_SHOWERS;
  const rng = new Rng(seedOf(b.planet!.surface?.seed ?? 1, 'showers'));
  const n = rng.int(1, 4);
  return Array.from({ length: n }, (_, i) => {
    const z = rng.range(-1, 1), t = rng.range(0, Math.PI * 2), r = Math.sqrt(1 - z * z);
    return {
      name: `${b.displayName} shower ${String.fromCharCode(945 + i)}`,
      peak: rng.range(0, Math.PI * 2), width: rng.range(0.4, 3) * DEG, zhr: rng.logUniform(5, 150), speed: rng.range(15, 70) * 1000,
      radiant: new THREE.Vector3(r * Math.cos(t), z, r * Math.sin(t)),
    };
  });
}

/** Heliocentric→"solar" longitude of a body about its host (rad, ecliptic/system frame). */
export function solarLongitude(b: Body, host: Body): number {
  const d = b.posSys.clone().sub(host.posSys);
  // standard ecliptic longitude of the planet is atan2(y, x) with (x, y) = (X, −Z); the Sun appears opposite
  return (Math.atan2(-d.z, d.x) + Math.PI + 2 * Math.PI) % (2 * Math.PI);
}

/** Current zenithal hourly rate of each shower (plus the sporadic background). */
export function activeShowers(b: Body, host: Body): { shower: Shower | null; zhr: number }[] {
  const lam = solarLongitude(b, host);
  const out: { shower: Shower | null; zhr: number }[] = [{ shower: null, zhr: SPORADIC_HR }];
  for (const s of showersFor(b)) {
    let d = Math.abs(lam - s.peak) % (2 * Math.PI);
    if (d > Math.PI) d = 2 * Math.PI - d;
    const zhr = s.zhr * Math.exp(-0.5 * (d / s.width) ** 2);
    if (zhr > 0.5) out.push({ shower: s, zhr });
  }
  return out;
}

interface Meteor {
  start: THREE.Vector3;   // planet-fixed (m)
  dir: THREE.Vector3;     // unit, planet-fixed
  length: number;         // m
  speed: number;          // m/s
  t0: number;             // sim time of appearance
  mag: number;            // peak absolute magnitude (at 100 km)
  color: [number, number, number];
  train: number;          // persistent-train duration (s)
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();

/** Live meteors around the observer; emits point sources for the sky renderer. */
export class MeteorSky {
  private meteors: Meteor[] = [];
  private body: Body | null = null;
  private lastSlot = -1;
  /** for the HUD / notifications */
  current: { name: string; zhr: number }[] = [];
  /** rate multiplier (1 = natural; tests and "meteor storm" views) */
  boost = 1;

  /**
   * Advance and emit visible points. camBody: camera in the body's planet-fixed
   * frame; emit(relWorld, color, flux) adds a point (camera-relative, world
   * axes; flux in solar-constant units).
   */
  update(sys: StarSystem | null, b: Body | null, host: Body | null, camBody: THREE.Vector3, bodyToWorld: THREE.Quaternion, time: number,
    emit: (rel: THREE.Vector3, color: [number, number, number], flux: number) => void, pixelAngle = 1e-3) {
    const hM = b ? meteorAltitude(b) : null;
    if (!sys || !b || !host || hM === null || camBody.length() - b.radius > 3e6) {
      this.meteors.length = 0;
      this.current = [];
      this.body = null;
      return;
    }
    if (b !== this.body) {
      this.body = b;
      this.meteors.length = 0;
      this.lastSlot = Math.floor(time);
    }
    const R = b.radius;
    const act = activeShowers(b, host);
    this.current = act.filter((a) => a.shower).map((a) => ({ name: a.shower!.name, zhr: a.zhr }));
    // spawn: one-second slots, deterministic per body and slot
    const slot = Math.floor(time);
    if (slot - this.lastSlot > 30) this.lastSlot = slot - 1; // after a time jump, don't replay hours
    const up = camBody.clone().normalize();
    const disc = Math.min(450e3, Math.sqrt(2 * R * hM) * 1.5); // within the observer's sky
    const area = Math.PI * (disc / 1000) ** 2;
    const toBody = sys.bodyRotation(b, _q).invert(); // universe axes → planet-fixed
    for (let s = this.lastSlot + 1; s <= slot; s++) {
      const rng = new Rng(seedOf(b.planet!.surface?.seed ?? 7, 'meteor', s));
      for (const a of act) {
        // radiant in planet-fixed coordinates
        const rad = a.shower ? _w.copy(a.shower.radiant).applyQuaternion(sys.q).applyQuaternion(toBody) : null;
        const cosZ = rad ? rad.dot(up) : 0.5;
        if (cosZ <= 0.02) continue;
        const rate = (a.zhr / 3600) * (area / OBS_AREA) * cosZ * this.boost;
        const n = rng.poisson(Math.min(rate, 200));
        for (let k = 0; k < n; k++) {
          // entry point: random in the disc on the meteor layer
          const e = new THREE.Vector3(-up.z, 0, up.x);
          if (e.lengthSq() < 1e-8) e.set(1, 0, 0);
          e.normalize();
          const nn = new THREE.Vector3().crossVectors(up, e);
          const rr = disc * Math.sqrt(rng.next()), th = rng.range(0, Math.PI * 2);
          const p = up.clone().multiplyScalar(R).addScaledVector(e, rr * Math.cos(th)).addScaledVector(nn, rr * Math.sin(th)).normalize();
          let dir: THREE.Vector3;
          if (rad) dir = rad.clone().negate();
          else {
            // sporadic: random, inbound
            dir = new THREE.Vector3(rng.normal(0, 1), rng.normal(0, 1), rng.normal(0, 1)).normalize();
            if (dir.dot(p) > -0.15) dir.addScaledVector(p, -(dir.dot(p) + 0.4)).normalize();
          }
          const cz = Math.max(0.15, -dir.dot(p));
          const top = hM + rng.range(10e3, 25e3), bottom = hM - rng.range(5e3, 20e3);
          const length = Math.min(300e3, (top - bottom) / cz);
          const speed = a.shower ? a.shower.speed : rng.range(15e3, 60e3);
          const mag = 6.5 + Math.log(Math.max(rng.next(), 1e-9)) / Math.log(2.5);
          const fast = Math.min(1, Math.max(0, (speed - 25e3) / 40e3));
          this.meteors.push({
            start: p.multiplyScalar(R + top), dir, length, speed, t0: s + rng.next(), mag,
            color: [1 - 0.25 * fast, 0.82 + 0.15 * fast, 0.55 + 0.35 * fast],
            train: mag < -1 ? Math.min(8, -mag * 1.5) : 0,
          });
        }
      }
    }
    this.lastSlot = slot;
    // emit as the eye sees it: the head at its full brightness and, behind
    // it, the afterimage of the last ≈0.12 s fading along the path (points
    // spaced below a pixel), plus a glowing train after fireballs
    const keep: Meteor[] = [];
    const TAU = 0.12;
    let budget = 2000; // points per frame
    const put = (rel: THREE.Vector3, c: [number, number, number], f: number) => { if (budget-- > 0) emit(rel, c, f); };
    const fluxAt = (m: Meteor, tt: number, T: number) => {
      _v.copy(m.start).addScaledVector(m.dir, m.speed * tt);
      const d = _v.distanceTo(camBody);
      const lc = Math.pow(Math.sin(Math.PI * Math.min(Math.max(tt / T, 0), 1)), 1.5);
      return { d, f: lc * Math.pow(10, -0.4 * (m.mag + 5 * Math.log10(Math.max(d, 1e3) / 100e3) + 26.74)) };
    };
    for (const m of this.meteors) {
      const T = m.length / m.speed;
      const age = time - m.t0;
      if (age > T + m.train) continue;
      keep.push(m);
      if (age < 0) continue;
      if (age <= T + TAU) {
        const head = Math.min(age, T);
        const d0 = _v.copy(m.start).addScaledVector(m.dir, m.speed * head).distanceTo(camBody);
        const px = (m.speed * TAU) / Math.max(d0, 1e3) / pixelAngle;
        const n = Math.max(1, Math.min(48, Math.round(px / 1.2)));
        for (let i = 0; i < n; i++) {
          const tt = age - (i / n) * TAU;
          if (tt < 0 || tt > T) continue;
          const { f } = fluxAt(m, tt, T);
          if (f <= 0) continue;
          put(_v.sub(camBody).applyQuaternion(bodyToWorld), m.color, f * (i === 0 ? 1 : 0.55 * Math.exp((-3 * i) / n)));
        }
      }
      if (m.train > 0 && age > T * 0.5) {
        // persistent train: ionised trail glowing along the path for seconds
        const fade = Math.exp(-(age - T) / Math.max(m.train * 0.4, 0.1)) * 0.004;
        for (let i = 0; i <= 24; i++) {
          const tt = (i / 24) * Math.min(age, T);
          const { f } = fluxAt(m, T * 0.5, T);
          put(_v.copy(m.start).addScaledVector(m.dir, m.speed * tt).sub(camBody).applyQuaternion(bodyToWorld), [0.7, 1, 0.8], (f * fade) / 24);
        }
      }
    }
    this.meteors = keep;
  }
}
