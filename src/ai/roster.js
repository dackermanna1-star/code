// Procedural enemy generation: personality, fighting style, body, stats,
// colour and a readable colour name for the commentary feed.

import { clamp } from '../core/math.js';

const HUES = [
  [0, 'Red'], [12, 'Vermilion'], [24, 'Orange'], [36, 'Amber'], [48, 'Gold'], [58, 'Yellow'],
  [72, 'Chartreuse'], [95, 'Lime'], [125, 'Green'], [150, 'Jade'], [168, 'Teal'], [186, 'Cyan'],
  [200, 'Azure'], [218, 'Blue'], [240, 'Indigo'], [258, 'Violet'], [278, 'Purple'], [300, 'Magenta'],
  [322, 'Pink'], [340, 'Crimson'], [360, 'Red'],
];

export function colorName(h, s, l) {
  if (l < 34 && h >= 10 && h <= 45) return s < 45 ? 'Umber' : 'Brown';
  if (l < 36 && h > 45 && h < 75) return 'Olive';
  if (l < 30 && h >= 205 && h <= 245) return 'Navy';
  if (l < 30 && (h >= 335 || h < 10)) return 'Maroon';
  let name = 'Red';
  let best = 999;
  for (const [hh, n] of HUES) {
    const d = Math.abs(hh - h);
    if (d < best) {
      best = d;
      name = n;
    }
  }
  if (s < 30) return (l > 55 ? 'Ash ' : 'Slate ') + name;
  if (l < 33) return 'Dark ' + name;
  if (l > 63) return 'Pale ' + name;
  if (s < 48) return 'Dusty ' + name;
  return name;
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return '#' + to(f(0)) + to(f(8)) + to(f(4));
}

export function enemyColor(rng) {
  const h = rng.range(0, 360);
  const s = rng.range(46, 86);
  // keep clear of the white walls and of the hero's black
  const yellowish = h > 40 && h < 75;
  const l = rng.range(34, yellowish ? 50 : 55);
  return {
    color: hslToHex(h, s, l),
    colorFar: hslToHex(h, s * 0.95, l * 0.82),
    name: colorName(h, s, l),
    hsl: [h, s, l],
  };
}

const PERSONALITIES = {
  rusher: { w: 16, aggr: [0.8, 1], intel: [0.08, 0.3], courage: [0.75, 1], styles: ['wild', 'brawler'], tokens: false },
  brawler: { w: 20, aggr: [0.55, 0.85], intel: [0.25, 0.5], courage: [0.5, 0.85], styles: ['brawler', 'boxer', 'balanced'], tokens: true },
  flanker: { w: 11, aggr: [0.45, 0.75], intel: [0.55, 0.85], courage: [0.45, 0.8], styles: ['balanced', 'boxer', 'kicker'], tokens: true },
  hesitant: { w: 10, aggr: [0.12, 0.35], intel: [0.35, 0.65], courage: [0.1, 0.35], styles: ['boxer', 'balanced'], tokens: true },
  tactician: { w: 6, aggr: [0.4, 0.7], intel: [0.75, 0.97], courage: [0.55, 0.9], styles: ['balanced', 'kicker', 'boxer'], tokens: true },
  grappler: { w: 6, aggr: [0.5, 0.8], intel: [0.4, 0.7], courage: [0.6, 0.9], styles: ['grappler'], tokens: true },
  brute: { w: 6, aggr: [0.55, 0.85], intel: [0.2, 0.45], courage: [0.85, 1], styles: ['brawler', 'wild'], tokens: true },
  speedster: { w: 9, aggr: [0.55, 0.9], intel: [0.4, 0.7], courage: [0.4, 0.8], styles: ['kicker', 'boxer'], tokens: true },
  weapon: { w: 6, aggr: [0.5, 0.8], intel: [0.4, 0.7], courage: [0.5, 0.85], styles: ['balanced', 'brawler'], tokens: true },
  thrower: { w: 5, aggr: [0.35, 0.6], intel: [0.45, 0.75], courage: [0.3, 0.6], styles: ['boxer', 'balanced'], tokens: true },
  berserker: { w: 5, aggr: [0.9, 1], intel: [0.02, 0.2], courage: [0.9, 1], styles: ['wild'], tokens: false },
};

export const PERSONALITY_LABEL = {
  rusher: 'Rusher', brawler: 'Brawler', flanker: 'Flanker', hesitant: 'Hesitant', tactician: 'Tactician',
  grappler: 'Grappler', brute: 'Brute', speedster: 'Speedster', weapon: 'Armed', thrower: 'Thrower', berserker: 'Berserker',
};

// level: escalation multiplier (1 at start, grows over time).
export function makeEnemySpec(rng, settings, level, id) {
  const S = settings;
  const rnd = clamp(S.randomness, 0, 2);
  const lateBias = clamp((level - 1) / 1.5, 0, 1);
  const weights = Object.entries(PERSONALITIES).map(([k, p]) => {
    let w = p.w;
    if (k === 'tactician' || k === 'grappler' || k === 'brute' || k === 'weapon') w *= 1 + lateBias * 1.2;
    if (k === 'hesitant') w *= 1 - lateBias * 0.4;
    return [k, w];
  });
  const personality = rng.weighted(weights);
  const P = PERSONALITIES[personality];
  const v = (a, b) => {
    const mid = (a + b) / 2;
    const half = ((b - a) / 2) * rnd;
    return mid + rng.range(-half, half);
  };
  let scale = v(0.9, 1.1);
  if (personality === 'brute') scale = v(1.2, 1.38);
  else if (personality === 'speedster') scale = v(0.8, 0.9);
  else if (rng.chance(0.08 * rnd)) scale = v(1.1, 1.25);
  scale = clamp(scale, 0.74, 1.45);

  const str = S.enemyStrength;
  const intelS = S.enemyIntelligence;
  const aggrS = S.enemyAggression;
  const lv = Math.pow(level, 0.45);
  let hp = (30 + 22 * scale * scale) * Math.sqrt(str) * lv * v(0.85, 1.15);
  let strength = v(0.7, 0.88) * str * Math.pow(level, 0.25) * (0.85 + scale * 0.15);
  let runSpeed = v(255, 325);
  let agility = v(0.75, 1.0);
  let moveSpeed = v(0.78, 0.96);
  let toughness = v(0.85, 1.1);
  let reaction = v(0.34, 0.62);
  if (personality === 'brute') {
    hp *= 1.75;
    strength *= 1.35;
    runSpeed = v(205, 245);
    agility = v(0.6, 0.75);
    moveSpeed = v(0.72, 0.84);
    toughness = v(1.35, 1.6);
  } else if (personality === 'speedster') {
    hp *= 0.75;
    strength *= 0.78;
    runSpeed = v(335, 385);
    agility = v(1.15, 1.35);
    moveSpeed = v(0.95, 1.06);
    toughness = v(0.7, 0.85);
    reaction *= 0.85;
  } else if (personality === 'berserker') {
    runSpeed *= 1.1;
    strength *= 1.12;
    moveSpeed *= 1.05;
  } else if (personality === 'tactician') {
    moveSpeed *= 1.06;
    reaction *= 0.85;
  }
  const intelligence = clamp(v(P.intel[0], P.intel[1]) * intelS * (0.9 + lateBias * 0.15), 0, 1);
  const aggression = clamp(v(P.aggr[0], P.aggr[1]) * aggrS, 0, 1);
  const skill = clamp(0.2 + intelligence * 0.45 + rng.range(-0.1, 0.15) * rnd + lateBias * 0.08, 0.05, 0.92);
  reaction = clamp(reaction / Math.max(0.4, intelS) * (1.1 - intelligence * 0.3), 0.16, 0.95);
  const col = enemyColor(rng);
  return {
    id,
    hero: false,
    name: col.name,
    color: col.color,
    colorFar: col.colorFar,
    hsl: col.hsl,
    scale,
    hp: Math.round(hp),
    strength,
    runSpeed: runSpeed * (0.95 + scale * 0.05),
    walkSpeed: runSpeed * 0.42,
    agility,
    skill,
    reaction,
    intelligence,
    aggression,
    toughness,
    moveSpeed,
    jumpSpeed: 640 + agility * 80,
    personality,
    courage: v(P.courage[0], P.courage[1]),
    style: rng.pick(P.styles),
    usesTokens: P.tokens,
    ammo: personality === 'thrower' ? rng.int(3, 5) : 0,
  };
}

export function makeHeroSpec(settings) {
  const S = settings;
  return {
    id: 0,
    hero: true,
    name: 'Onyx',
    color: '#0e0e10',
    colorFar: '#2a2a2e',
    scale: 1.04,
    hp: Math.round(300 * S.heroEndurance),
    stamina: 100 * (0.8 + 0.2 * S.heroEndurance),
    strength: 1.16 + 0.12 * (S.heroSkill - 1),
    runSpeed: 385 * S.heroSpeed,
    walkSpeed: 150 * S.heroSpeed,
    agility: 1.3 * Math.sqrt(S.heroSpeed),
    skill: clamp(0.88 + (S.heroSkill - 1) * 0.12, 0.3, 1),
    reaction: clamp(0.13 / S.heroReaction, 0.06, 0.5),
    intelligence: 1,
    aggression: 0.6,
    toughness: 1.15,
    moveSpeed: 1.14 * (0.9 + 0.1 * S.heroSpeed),
    jumpSpeed: 760,
    personality: 'hero',
  };
}
