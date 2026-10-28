/**
 * Human-readable description of any target for the info panel. Values are
 * tagged with their provenance: catalogued (measured), procedural
 * (generated from physical models) or hypothetical.
 */
import type { Body } from '../astro/body';
import type { GalaxyParams } from '../astro/galaxy';
import type { Nebula } from '../astro/nebulae';
import type { SystemRef } from '../sim/cosmos';
import type { Target } from '../sim/targets';
import { orbitalPeriod } from '../astro/orbit';
import { spectralClass } from '../astro/stellar';
import { KNOWN_STARS } from '../astro/known/stars';
import {
  AU, EARTH_G, EARTH_MASS, EARTH_RADIUS, JUPITER_MASS, SOLAR_LUMINOSITY, SOLAR_MASS, SOLAR_RADIUS,
} from '../core/constants';
import { formatDistance, formatDuration, sci } from '../core/mathutil';

export interface InfoSection {
  title: string;
  rows: [string, string][];
  text?: string;
  locked?: boolean;
}

export interface Description {
  title: string;
  subtitle: string;
  provenance: 'catalogued' | 'procedural' | 'hypothetical' | 'mixed';
  provenanceNote: string;
  sections: InfoSection[];
  /** whether a scan would reveal more */
  needsScan: boolean;
  lifeKind?: string;
}

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
const K = (t: number) => `${t.toFixed(0)} K (${(t - 273.15).toFixed(0)} °C)`;

function massStr(m: number): string {
  if (m > 0.05 * SOLAR_MASS) return `${(m / SOLAR_MASS).toPrecision(3)} M☉`;
  if (m > 0.1 * JUPITER_MASS) return `${(m / JUPITER_MASS).toPrecision(3)} M♃ (${(m / EARTH_MASS).toPrecision(3)} M⊕)`;
  if (m > 1e-4 * EARTH_MASS) return `${(m / EARTH_MASS).toPrecision(3)} M⊕`;
  return `${sci(m)} kg`;
}

function radiusStr(r: number, star = false): string {
  if (star) return r > 0.01 * SOLAR_RADIUS ? `${(r / SOLAR_RADIUS).toPrecision(3)} R☉` : `${(r / 1e3).toPrecision(4)} km`;
  return `${(r / 1e3).toFixed(r < 1e5 ? 1 : 0)} km (${(r / EARTH_RADIUS).toPrecision(3)} R⊕)`;
}

function composition(c: Record<string, number>): string {
  return Object.entries(c)
    .filter(([, v]) => v > 1e-5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => `${k} ${v >= 0.01 ? (v * 100).toPrecision(3) + '%' : (v * 1e6).toPrecision(2) + ' ppm'}`)
    .join(', ');
}

function level(x: number, words = ['none', 'low', 'moderate', 'high', 'extreme']): string {
  if (x <= 0.02) return words[0];
  return words[Math.min(words.length - 1, 1 + Math.floor(x * (words.length - 1) * 0.999))];
}

export function describe(t: Target, distance: number, scanned: boolean): Description {
  if (t.kind === 'galaxy') return describeGalaxy(t.galaxy!, distance);
  if (t.kind === 'nebula') return describeNebula(t.nebula!, distance);
  if (t.kind === 'system') return describeSystemRef(t.system!, distance, scanned);
  const b = t.body!;
  return b.isStarLike ? describeStar(b, distance, scanned) : describePlanet(b, distance, scanned);
}

function orbitSection(b: Body): InfoSection {
  const rows: [string, string][] = [];
  const o = b.orbit;
  if (o && b.parent) {
    rows.push(['Orbits', b.parent.kind === 'barycenter' ? `${b.parent.name} (barycentre)` : b.parent.displayName]);
    rows.push(['Semi-major axis', o.a > 0.01 * AU ? `${(o.a / AU).toPrecision(4)} AU` : formatDistance(o.a)]);
    rows.push(['Eccentricity', o.e.toFixed(3)]);
    rows.push(['Inclination', `${((o.i * 180) / Math.PI).toFixed(2)}°`]);
    rows.push(['Orbital period', formatDuration(orbitalPeriod(o))]);
  }
  const r = b.rotation;
  rows.push(['Rotation', r.locked ? 'tidally locked' : isFinite(r.period) && r.period !== 0 ? `${formatDuration(Math.abs(r.period))}${r.period < 0 ? ' (retrograde)' : ''}` : '—']);
  rows.push(['Axial tilt', `${((r.tilt * 180) / Math.PI).toFixed(1)}°`]);
  return { title: 'Orbit & rotation', rows };
}

function describeStar(b: Body, distance: number, scanned: boolean): Description {
  const s = b.star!;
  const Lsun = s.luminosity / SOLAR_LUMINOSITY;
  const rows: [string, string][] = [
    ['Spectral type', s.spectralType],
    ['Stage', s.stage.replace(/-/g, ' ')],
    ['Mass', massStr(s.mass)],
    ['Radius', radiusStr(s.radius, true)],
    ['Luminosity', `${sci(Lsun)} L☉`],
    ['Surface temperature', `${s.temperature.toFixed(0)} K`],
    ['Distance', formatDistance(distance)],
  ];
  const sections: InfoSection[] = [{ title: 'Star', rows }];
  const deep: [string, string][] = [
    ['Age', `${(s.age / 1e9).toFixed(2)} Gyr`],
    ['Main-sequence lifetime', s.lifetime > 1e13 ? '> 10 000 Gyr' : `${(s.lifetime / 1e9).toPrecision(3)} Gyr`],
    ['Metallicity [Fe/H]', s.metallicity.toFixed(2)],
    ['Rotation', formatDuration(s.rotationPeriod)],
    ['Magnetic activity', level(s.activity)],
  ];
  if (s.magneticField) deep.push(['Magnetic field', `${sci(s.magneticField)} T`]);
  if (s.pulsarPeriod) deep.push(['Pulsar period', `${(s.pulsarPeriod * 1000).toPrecision(4)} ms`]);
  if (s.stage === 'main-sequence' || s.stage === 'subgiant') {
    const inner = Math.sqrt(Lsun / 1.1), outer = Math.sqrt(Lsun / 0.36);
    deep.push(['Habitable zone', `${inner.toPrecision(3)} – ${outer.toPrecision(3)} AU`]);
  }
  const known = b.known;
  sections.push({ title: 'Stellar physics', rows: deep, locked: !scanned && !known });
  sections.push(orbitSection(b));
  if (b.system.notes) sections.push({ title: 'Notes', rows: [], text: b.system.notes });
  return {
    title: b.displayName,
    subtitle: `${b.kind.replace('-', ' ')} · ${s.spectralType}`,
    provenance: known ? 'catalogued' : 'procedural',
    provenanceNote: known
      ? 'Catalogue values (rounded literature estimates). Surface detail is modelled.'
      : 'Generated from stellar-evolution relations (mass, age, metallicity).',
    sections,
    needsScan: !scanned && !known,
  };
}

function describePlanet(b: Body, distance: number, scanned: boolean): Description {
  const p = b.planet;
  const sections: InfoSection[] = [];
  const known = b.known && !p?.classLabel.includes('hypothetical');
  const full = scanned || known;
  const basic: [string, string][] = [
    ['Distance', formatDistance(Math.max(distance - b.radius, 0))],
    ['Radius', radiusStr(b.radius)],
    ['Mass', massStr(b.mass)],
  ];
  if (p) {
    basic.push(['Surface gravity', `${p.gravity.toFixed(2)} m/s² (${(p.gravity / EARTH_G).toFixed(2)} g)`]);
    basic.push(['Equilibrium temp.', K(p.tempEq)]);
  }
  sections.push({ title: 'Overview', rows: basic });
  sections.push(orbitSection(b));
  if (p) {
    const phys: [string, string][] = [
      ['Density', `${(p.density / 1000).toFixed(2)} g/cm³`],
      ['Escape velocity', `${(p.escapeVelocity / 1000).toFixed(2)} km/s`],
      ['Bulk composition', `iron ${pct(p.composition.iron)}, rock ${pct(p.composition.silicate)}, ices ${pct(p.composition.ice)}${p.composition.gas > 0.01 ? `, H/He ${pct(p.composition.gas)}` : ''}${p.composition.carbon > 0.01 ? `, carbon ${pct(p.composition.carbon)}` : ''}`],
      ['Bond albedo', p.albedo.toFixed(2)],
      ['Mean surface temp.', K(p.tempMean)],
      ['Range', `${p.tempMin.toFixed(0)} – ${p.tempMax.toFixed(0)} K`],
      ['Magnetic field', p.magneticField > 0.01 ? `${p.magneticField.toPrecision(2)} × Earth` : 'none detected'],
      ['Surface radiation', `${p.radiation.toPrecision(2)} × Earth`],
    ];
    sections.push({ title: 'Physical properties', rows: phys, locked: !full });
    const atm = p.atmosphere;
    const atmRows: [string, string][] = atm
      ? [
          ['Surface pressure', atm.pressure >= 0.01 ? `${atm.pressure.toPrecision(3)} bar` : `${(atm.pressure * 1e5).toPrecision(3)} Pa`],
          ['Composition', composition(atm.composition)],
          ['Scale height', formatDistance(atm.scaleHeight)],
          ['Greenhouse warming', `${atm.greenhouseK.toFixed(0)} K`],
        ]
      : [['Atmosphere', 'none (exposed surface)']];
    if (atm?.hazes.length) atmRows.push(['Hazes / clouds', atm.hazes.join(', ')]);
    sections.push({ title: 'Atmosphere', rows: atmRows, locked: !full });
    if (p.type !== 'gas-giant' && p.type !== 'ice-giant') {
      const geo: [string, string][] = [
        ['Surface liquid', p.liquid === 'none' ? 'none' : `${p.liquid} — ${pct(p.liquidCoverage)} of surface`],
        ['Ice cover', pct(p.iceCoverage)],
        ['Plate tectonics', level(p.tectonics)],
        ['Volcanism', level(p.volcanism)],
        ['Surface age', `${p.surfaceAge.toPrecision(2)} Gyr`],
        ['Day/night', p.tidallyLocked ? 'permanent day side / night side' : 'normal'],
      ];
      sections.push({ title: 'Geology', rows: geo, locked: !full });
    }
    if (p.rings) sections.push({ title: 'Rings', rows: [['Extent', `${formatDistance(p.rings.inner)} – ${formatDistance(p.rings.outer)}`], ['Composition', p.rings.composition]], locked: !full });
    const life = p.life;
    const lifeRows: [string, string][] = [['Biosphere', life.kind === 'none' ? 'none detected' : life.kind]];
    if (life.kind !== 'none') {
      lifeRows.push(['Biochemistry', life.biochemistry]);
      if (life.pigment) lifeRows.push(['Dominant pigment', life.pigment]);
      lifeRows.push(['Coverage', pct(life.coverage)]);
      lifeRows.push(['Oxygenated', life.oxygenated ? 'yes' : 'no']);
      if (life.bioluminescence > 0.05) lifeRows.push(['Bioluminescence', level(life.bioluminescence)]);
    }
    if (life.fossil) lifeRows.push(['Fossil biosignatures', 'present']);
    sections.push({ title: 'Life', rows: lifeRows, text: life.notes || undefined, locked: !full });
    if (p.anomalies.length) sections.push({ title: 'Anomalies', rows: [], text: p.anomalies.join(' · '), locked: !full });
  }
  const hyp = !!p?.classLabel.includes('hypothetical');
  return {
    title: b.displayName,
    subtitle: p?.classLabel ?? b.kind,
    provenance: hyp ? 'hypothetical' : known ? 'mixed' : 'procedural',
    provenanceNote: hyp
      ? 'No confirmed planets: this world is procedural and hypothetical.'
      : known
        ? p?.knownSource ?? 'Catalogued orbit and bulk properties; surface appearance and fine detail are modelled.'
        : 'Generated from formation and physical models (composition, irradiation, atmosphere escape, climate).',
    sections,
    needsScan: !full,
    lifeKind: full ? p?.life.kind : undefined,
  };
}

function describeSystemRef(r: SystemRef, distance: number, scanned: boolean): Description {
  const rows: [string, string][] = [['Distance', formatDistance(distance)]];
  let subtitle = 'star system';
  let note = '';
  if (r.rogue) {
    const me = r.rogue.mass / EARTH_MASS;
    subtitle = 'rogue planet (infrared detection)';
    rows.push(['Type', me > 60 ? 'free-floating gas giant' : me > 12 ? 'free-floating ice giant' : 'free-floating terrestrial world']);
    rows.push(['Mass (est.)', massStr(r.rogue.mass)]);
    rows.push(['Temperature (est.)', me > 60 ? '~80–120 K' : '~30–50 K']);
    rows.push(['Host star', 'none — ejected during planet formation']);
    return {
      title: r.name, subtitle, provenance: 'procedural',
      provenanceNote: 'Procedural free-floating planet, placed with the local stellar density (≈0.3 per star). Visible only in thermal infrared.',
      sections: [{ title: 'Rogue planet', rows }], needsScan: false,
    };
  }
  if (r.known) {
    const e = KNOWN_STARS.find((k) => r.id === `MW/known/${k.id}`);
    if (e) {
      subtitle = `${e.spec}${e.companion ? ' + ' + e.companion.spec : ''}`;
      rows.push(['Spectral type', e.spec], ['Mass', `${e.mass} M☉`], ['Luminosity', `${sci(e.lum)} L☉`], ['Temperature', `${e.temp} K`]);
      if (e.companion) rows.push(['Companion', `${e.companion.name} (${e.companion.spec})`]);
      rows.push(['Known planets', e.planets?.length ? e.planets.map((p) => p.name + (p.status === 'candidate' ? ' (candidate)' : '')).join(', ') : 'none confirmed']);
      note = e.note ?? '';
    } else if (r.name === 'Solar System') {
      subtitle = 'G2V · 8 planets';
      rows.push(['Spectral type', 'G2V'], ['Planets', '8 (+ dwarf planets)']);
    }
  } else if (r.star) {
    const s = r.star;
    const kind = s.remnant === 1 ? 'white dwarf' : s.remnant === 2 ? 'neutron star' : s.remnant === 3 ? 'black hole' : s.remnant === 4 ? 'brown dwarf' : 'star';
    const sc = spectralClass(s.temp);
    subtitle = s.remnant ? kind : `${sc.cls}${sc.sub} star`;
    rows.push(['Type', subtitle], ['Initial mass', `${s.mass.toPrecision(3)} M☉`], ['Luminosity', `${sci(s.lum)} L☉`], ['Temperature', `${s.temp.toFixed(0)} K`]);
    rows.push(['Age', `${s.age.toPrecision(3)} Gyr`]);
  }
  rows.push(['Planets', scanned ? 'see system once visited' : 'unknown — travel there to survey']);
  return {
    title: r.name,
    subtitle,
    provenance: r.known ? 'catalogued' : 'procedural',
    provenanceNote: r.known ? 'Catalogued star (approximate literature values).' : 'Procedural star drawn from the galaxy\'s stellar populations; its planets are generated when you arrive.',
    sections: [{ title: 'Star system', rows }, ...(note ? [{ title: 'Notes', rows: [] as [string, string][], text: note }] : [])],
    needsScan: false,
  };
}

function describeGalaxy(g: GalaxyParams, distance: number): Description {
  const rows: [string, string][] = [
    ['Type', `${g.hubble} (${g.type})`],
    ['Distance', formatDistance(distance)],
    ['Diameter', `${((g.radius * 2) / 1000).toPrecision(3)} kly`],
    ['Stellar mass', `${sci(g.stellarMass)} M☉`],
    ['Central black hole', `${sci(g.bhMass)} M☉`],
    ['Star formation', level(g.starFormation, ['quenched', 'low', 'moderate', 'high', 'starburst'])],
    ['Nuclear activity', level(g.agn, ['quiet', 'low', 'active', 'Seyfert-like', 'quasar-like'])],
    ['Mean age', `${g.ageGyr.toPrecision(3)} Gyr`],
    ['Metallicity [Fe/H]', g.metallicity.toFixed(2)],
  ];
  if (g.arms > 0) rows.push(['Spiral arms', `${g.arms} (pitch ${((g.pitch * 180) / Math.PI).toFixed(0)}°)`]);
  if (g.barLength > 0) rows.push(['Bar', `${(g.barLength / 1000).toPrecision(3)} kly`]);
  return {
    title: g.name,
    subtitle: `galaxy · ${g.hubble}`,
    provenance: g.known ? 'catalogued' : 'procedural',
    provenanceNote: g.known
      ? 'Position, size and type from catalogues; individual stars are procedural.'
      : 'Procedural galaxy placed by the cosmic-web density field.',
    sections: [{ title: 'Galaxy', rows }, ...(g.description ? [{ title: 'Notes', rows: [] as [string, string][], text: g.description }] : [])],
    needsScan: false,
  };
}


const NEBULA_INFO: Record<Nebula['type'], { kind: string; spectrum: string; origin: string }> = {
  emission: { kind: 'Emission nebula (H II region)', spectrum: 'Hα 656 nm (red), [O III] 501 nm (teal), Hβ 486 nm', origin: 'Hydrogen ionised by hot young O/B stars that formed inside it; dust lanes and pillars are being eroded by their radiation.' },
  planetary: { kind: 'Planetary nebula', spectrum: '[O III] in the inner shell, Hα and [N II] at the rim', origin: 'Outer layers shed by a dying Sun-like star; its hot white-dwarf core ionises the expanding shell for a few tens of thousands of years.' },
  'supernova-remnant': { kind: 'Supernova remnant', spectrum: 'Hα and [O III] filaments, synchrotron continuum', origin: 'Debris of an exploded massive star sweeping up interstellar gas at thousands of km/s.' },
  reflection: { kind: 'Reflection nebula', spectrum: 'Scattered starlight (blue: shorter wavelengths scatter more)', origin: 'Interstellar dust reflecting the light of nearby bright stars.' },
  dark: { kind: 'Dark nebula', spectrum: 'Absorbs and reddens background light', origin: 'Cold, dense dust and molecular gas — the raw material of future stars.' },
};

function describeNebula(n: Nebula, distance: number): Description {
  const info = NEBULA_INFO[n.type];
  const rows: [string, string][] = [
    ['Type', info.kind],
    ['Diameter', `${(n.radius * 2).toPrecision(3)} ly`],
    ['Distance', formatDistance(distance)],
    ['Spectrum', info.spectrum],
  ];
  return {
    title: n.name,
    subtitle: info.kind.toLowerCase(),
    provenance: n.known ? 'catalogued' : 'procedural',
    provenanceNote: n.known
      ? 'Position, size and type from catalogues; internal structure is procedural.'
      : 'Procedural nebula placed by the galaxy\'s star-formation and stellar-population model.',
    sections: [{ title: 'Nebula', rows }, { title: 'Origin', rows: [], text: info.origin + (n.note ? ' ' + n.note : '') }],
    needsScan: false,
  };
}
