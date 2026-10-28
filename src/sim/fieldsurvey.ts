/**
 * Field instruments for an explorer on a surface: local measurements taken
 * from the same generator and physical parameters as the rendered world, so
 * what the instruments read is what the terrain, sky and biosphere show.
 */
import { Vector3 } from 'three';
import type { Body } from '../astro/body';
import type { World } from './world';
import { airColumn, crustRock, doseEnv, EARTH_DOSE, surfaceDose } from '../astro/radiation';

const fmt = (x: number, d = 1) => {
  const t = Math.abs(x) >= 1e4 || (Math.abs(x) < 1e-2 && x !== 0) ? x.toExponential(d) : x.toFixed(d);
  return /^-0(\.0*)?$/.test(t) ? t.slice(1) : t;
};

export interface FieldReadout {
  title: string;
  rows: [string, string][];
}

export function fieldSurvey(world: World, b: Body, posBody: Vector3): FieldReadout | null {
  const p = b.planet;
  const g = world.generator(b);
  if (!p || !g) return null;
  const dir = posBody.clone().normalize();
  const s = g.sample(dir.x, dir.y, dir.z, 0.5);
  const lat = Math.asin(Math.max(-1, Math.min(1, dir.y)));
  const lon = Math.atan2(dir.x, dir.z);
  const rows: [string, string][] = [];
  const deg = (r: number, pos: string, neg: string) => `${Math.abs((r * 180) / Math.PI).toFixed(3)}° ${r >= 0 ? pos : neg}`;
  rows.push(['Position', `${deg(lat, 'N', 'S')}, ${deg(lon, 'E', 'W')}`]);
  // the observer's altitude, and what lies under their feet
  const sea = g.liquidLevel();
  const alt = posBody.length() - b.radius;
  const seaDepth = sea > s.height ? sea - s.height : 0;
  const pool = s.water > s.height ? s.water - s.height : 0;
  const wet = seaDepth > 0 || pool > 0;
  rows.push(['Elevation', sea > -Infinity
    ? `${fmt(alt - sea, 0)} m relative to the ${p.liquid} level${seaDepth > 0 ? ` · floor ${fmt(seaDepth, 0)} m down` : ''}`
    : `${fmt(alt, 0)} m (datum: mean radius)`]);
  // gravity minus the centrifugal term of the planet's spin
  const r = posBody.length();
  const period = b.rotation.locked && b.orbit ? 2 * Math.PI * Math.sqrt(Math.abs(b.orbit.a) ** 3 / b.orbit.mu) : Math.abs(b.rotation.period);
  const omega = isFinite(period) && period > 0 ? (2 * Math.PI) / period : 0;
  const gLocal = b.mu / (r * r) - omega * omega * r * Math.cos(lat) ** 2;
  rows.push(['Gravity', `${gLocal.toFixed(3)} m/s² (${(gLocal / 9.80665).toFixed(3)} g)`]);
  // air
  const atm = p.atmosphere;
  const P = atm && atm.pressure > 1e-6 ? atm.pressure * Math.exp(-Math.max(alt, 0) / (atm.scaleHeight || 8000)) : 0;
  if (atm && P > 0) {
    const gases = Object.entries(atm.composition).sort((a, c) => c[1] - a[1]).slice(0, 3)
      .map(([k, v]) => `${k} ${v >= 0.01 ? (v * 100).toFixed(1) + '%' : (v * 1e6).toFixed(0) + ' ppm'}`).join(', ');
    rows.push(['Air', `${fmt(P, P < 0.01 ? 2 : 3)} bar · ${s.temp.toFixed(0)} K (${(s.temp - 273.15).toFixed(0)} °C)`]);
    rows.push(['Air composition', gases]);
  } else {
    rows.push(['Air', `vacuum · surface ${s.temp.toFixed(0)} K`]);
  }
  // ground
  const bed = s.rock > 0.6 ? (s.unit < 0.4 ? 'dark basaltic (mafic)' : s.unit > 0.6 ? 'bright feldspathic (anorthositic)' : 'mixed silicate') : 'sediment';
  let ground: string;
  if (seaDepth > 0) ground = `open ${p.liquid} sea, ${fmt(seaDepth, 0)} m deep over ${s.rock > 0.6 ? `${bed} rock` : 'sediment'}`;
  else if (pool > 0) ground = `${p.liquid} river or lake (${pool.toFixed(1)} m deep)`;
  else if (s.temp < 260 && s.moisture > 0.3 && p.composition.ice > 0.05) ground = 'water ice with dust';
  else if (s.rock > 0.6) ground = `bedrock: ${bed}`;
  else if (s.moisture < 0.2) ground = p.surface?.dunes && p.surface.dunes > 0.05 ? 'aeolian sand' : 'dry regolith';
  else ground = p.life.kind === 'simple' || p.life.kind === 'complex' ? 'soil with organic matter' : 'moist regolith';
  if (s.temp > 700) ground = `molten or glowing rock (${s.temp.toFixed(0)} K)`;
  rows.push(['Ground', ground]);
  const c = p.composition;
  rows.push(['Bulk composition', `iron ${(c.iron * 100).toFixed(0)}% · silicate ${(c.silicate * 100).toFixed(0)}% · ice ${(c.ice * 100).toFixed(0)}%${c.carbon > 0.02 ? ` · carbon ${(c.carbon * 100).toFixed(0)}%` : ''}`]);
  // magnetic field: dipole, 31 µT at Earth's equator
  const B = 31 * p.magneticField * Math.sqrt(1 + 3 * Math.sin(lat) ** 2);
  rows.push(['Magnetic field', p.magneticField < 0.005 ? 'no global field (weak crustal remnants only)' : `${fmt(B, 1)} µT (dipole)`]);
  // radiation: the same dose model as the planet's mean, at this latitude and air column
  const env = p.radiationEnv ?? doseEnv(1, 0.3);
  const rocky = crustRock(p.type, c);
  const dose = surfaceDose(env, airColumn(P, b.mu / (r * r)), p.magneticField, lat, wet ? 0 : rocky, P > 0.1 && !wet);
  const main = (['cosmic', 'solar', 'trapped', 'ground'] as const).reduce((a, k) => (dose[k] > dose[a] ? k : a), 'ground' as 'cosmic' | 'solar' | 'trapped' | 'ground');
  const src = { cosmic: 'galactic cosmic rays', solar: 'stellar particles', trapped: 'trapped belt particles', ground: 'natural radioactivity' }[main];
  const doseStr = dose.total >= 1e4 ? `${fmt(dose.total / 1e3 / 365, 2)} Sv/day` : `${fmt(dose.total, 1)} mSv/yr`;
  rows.push(['Radiation', `${doseStr} (${fmt(dose.total / EARTH_DOSE, 1)}× Earth) · mostly ${src}`]);
  // seismicity from tectonics, volcanism and tidal flexing, calibrated on Earth (≈80 M2+ a year within 100 km on average)
  const act = p.tectonics * 0.6 + p.volcanism * 0.9;
  const quakes = 80 * Math.pow(10, 5 * (act - 0.81));
  rows.push(['Seismic activity', `${quakes < 1 ? 'quiet' : quakes < 150 ? 'moderate' : 'strong'} · ≈${quakes < 1 ? fmt(quakes, 1) : quakes.toFixed(0)} quakes/yr above M2 within 100 km`]);
  // life detection
  const life = p.life;
  const veg = (() => {
    const ss = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    return ss(0.1, 0.42, s.moisture) * ss(252, 280, s.temp) * ss(335, 306, s.temp) * (1 - ss(0.5, 0.9, s.rock));
  })();
  let lifeStr: string;
  if (life.kind === 'none') lifeStr = life.fossil ? 'none living · fossil biosignatures in sediments' : 'no biosignatures';
  else if (life.kind === 'prebiotic') lifeStr = 'complex organic molecules; no metabolism detected';
  else if (life.kind === 'microbial') lifeStr = `microbial metabolism detected in ${wet ? 'the water' : 'soil samples'}`;
  else if (wet) lifeStr = life.kind === 'complex' ? 'aquatic organisms: plankton and larger swimmers' : 'plankton and microbial mats';
  else lifeStr = veg > 0.3 ? `photosynthetic organisms here (${life.pigment || 'pigmented'})` : 'none at this site; biosphere present elsewhere';
  if (life.kind !== 'none' && life.bioluminescence > 0.3) lifeStr += ' · bioluminescent';
  rows.push(['Life detection', lifeStr]);
  // subsurface
  const sub: string[] = [];
  if (p.type === 'icy' && p.anomalies.some((a) => /Subsurface ocean/.test(a))) sub.push(`liquid ocean under ≈${Math.max(2, (1 - p.tempMean / 273) * 40).toFixed(0)} km of ice`);
  else if (!wet && p.liquid === 'water' && s.moisture > 0.4) sub.push(`groundwater at ≈${Math.max(2, (1 - s.moisture) * 60).toFixed(0)} m`);
  if (seaDepth > 0) sub.push('sediments over oceanic crust');
  if (p.anomalies.some((a) => /lava-tube/.test(a))) sub.push('large voids (lava tubes)');
  if (!wet && s.temp < 273 && p.liquid === 'water') sub.push('permafrost');
  rows.push(['Subsurface', sub.length ? sub.join(' · ') : 'no anomalies']);
  return { title: `Field instruments · ${b.displayName}`, rows };
}
