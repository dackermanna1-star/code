// Invented writer population: names, crews and personal handstyles. A pool is
// derived from a pool seed so the same writers recur across segments and props.

import { Rng } from '../core/rng.js';
import { pickTagColor, pickMarkerColor, pickThrowFill, pickOutline } from '../core/color.js';
import { glyphVariantCount } from '../font/font.js';

const CONS = [
  ['K', 10], ['R', 9], ['S', 9], ['Z', 6], ['X', 4], ['M', 6], ['T', 7], ['V', 5], ['N', 4], ['L', 3],
  ['D', 3], ['P', 2], ['B', 2], ['C', 2], ['G', 2], ['H', 1.5], ['J', 1], ['W', 1.5], ['F', 1], ['Y', 0.6], ['Q', 0.3],
];
const VOW = [['E', 9], ['A', 8], ['O', 9], ['I', 3.2], ['U', 2.4]];
const VV_OK = new Set(['EO', 'OE', 'AE', 'EA', 'IA', 'AU', 'OA', 'IO', 'EI']);
const PATTERNS = [
  ['CVCV', 6], ['CVCC', 5], ['CVC', 4], ['VCVC', 3], ['CVCVC', 3], ['CCVC', 2], ['VCC', 1.5],
  ['CVCCV', 2], ['CVVC', 1], ['VCCV', 2], ['CVCVCV', 0.6], ['CCVCC', 0.6], ['VCVCV', 0.6],
];
const GOOD_CLUSTERS = new Set(['KR', 'SK', 'ST', 'TR', 'ZK', 'KS', 'RK', 'RS', 'MS', 'NK', 'NT', 'RT', 'SM', 'VR', 'XT', 'KT', 'SR', 'RZ', 'LK', 'MK', 'NS', 'TS', 'RX', 'KZ', 'SN', 'DR', 'PR', 'GR', 'BR', 'KL', 'SL', 'TZ', 'MZ', 'RM', 'RN', 'RD', 'NZ', 'XS', 'SX', 'WK', 'VK']);

// Real writers/crews/brands/abbreviations and offensive strings we never emit.
const BLOCK = new Set((
  'REVOK SABER KAWS SEEN DONDI CASE PHASE ZEPHYR FUTURA CRASH DAZE QUIK SEN SKREW RIME ESPO OBEY NEKST SMASH COPE TWIST ' +
  'RETNA SANER RISK SHOE KASE LEE SEEN BLADE DURO MODE NOAH TAKI JULIO SNAKE STAY HIGH KEEP POSE KATSU SAMO BANKSY INVADER ' +
  'MSK AWR TKO KD UA TDS BTM LTS FX DTS CBS WCA TFP IBM USA NBA NFL KKK SS ISIS ACAB BLM NWA LAPD CIA FBI NSA FTP MS ' +
  'NAZI HOE FUK FUC FCK FAK SEX ASS TIT CUM NIG NIGA FAG POO PEE XXX KILL DIE GAY JEW COK COCK DIK DICK PUS PUSI ANUS ' +
  'SEMEN RAPE HITLER KIKE SPIC WOP GOOK COON SLUT WHORE TWAT CUNT PORN NUDE BOOB TITS DRUG METH CRAK CRACK ' +
  'NIKE ADIDAS SONY AUDI KIA AXE AVON EXXON OREO VISA IKEA ZARA LEGO SEGA FIAT SAAB OPEL MAZDA TOTO XBOX ROLEX ' +
  'MVSK CHAOS RISE DREAM SKAM KOZE SMOK TOXIC KRSONE KRS ' +
  'KENT CAMEL SALEM VOGUE NIVEA PEPSI COKE FANTA SPRITE LEVI LEVIS PUMA FILA VANS OREO TACO BIC ZIPPO MARS ' +
  'MONTANA KRYLON RUSTO MOLOTOW BELTON IRONLAK KOBRA FLAME LOOP MTN SNUS ARES ROLEX TESLA SKODA DACIA LADA ' +
  'BMW AUDI OPEL VOLVO MAZDA HONDA SEAT KIA TATA JEEP DODGE FORD MINI SMART LEXUS ACURA NOKIA ASUS ACER DELL ' +
  'SONOS BOSE AMEX SHELL ESSO TEXACO ARCO MOBIL CITGO SUNOCO OXXO AMAZON EBAY UBER LYFT XEROX KODAK CANON ' +
  'NIKON LEICA SANYO SHARP SEIKO CASIO TIMEX OMEGA RADO TISSOT DIOR GUCCI PRADA ZARA MANGO GAP OBEY SUPREME ' +
  'STUSSY VOLCOM HURLEY OAKLEY RAYBAN LACOSTE KAPPA UMBRO DIESEL REPLAY GUESS BENZ AXA ING UBS'
).split(/\s+/));

const BAD_SUB = ['KKK', 'SS ', 'NIG', 'FAG', 'FUK', 'FCK', 'CUM', 'SEX', 'NAZ', 'ASS', 'TIT', 'DIK', 'COK', 'PUS', 'RAP', 'XXX', 'HOE', 'KIK', 'SPIC', 'JEW', 'CUN', 'TWA', 'WHO', 'SLU', 'POR'];

function isBad(name) {
  if (BLOCK.has(name)) return true;
  for (const b of BAD_SUB) if (name.includes(b.trim())) return true;
  return false;
}

const ONSETS = new Set(['KR', 'SK', 'ST', 'TR', 'SM', 'DR', 'PR', 'GR', 'BR', 'KL', 'SL', 'SP', 'SN', 'TZ', 'ZK']);
const SILLY = new Set(['MAMA', 'PAPA', 'TOTS', 'ITEM', 'MILE', 'ANTI', 'RAKE', 'MAM', 'POPO', 'DADA', 'NANA', 'BABE', 'BABA', 'MOMO', 'TATA', 'KAKA', 'CACA', 'PIPI', 'NONO', 'SEX', 'SEXY']);

export function makeName(rng, minLen = 3, maxLen = 6) {
  outer: for (let tries = 0; tries < 80; tries++) {
    const pat = rng.pickW(PATTERNS);
    let s = '';
    for (let i = 0; i < pat.length; i++) {
      const isC = pat[i] === 'C';
      let ch = rng.pickW(isC ? CONS : VOW);
      if (isC && i > 0 && pat[i - 1] === 'C') {
        // keep consonant clusters pronounceable-ish (onsets stricter than codas)
        const okSet = i === 1 ? ONSETS : GOOD_CLUSTERS;
        let ok = false;
        for (let k = 0; k < 10 && !ok; k++) {
          if (okSet.has(s[s.length - 1] + ch)) ok = true;
          else ch = rng.pickW(CONS);
        }
        if (!ok) continue outer;
      }
      s += ch;
    }
    if (/^(..)\1$/.test(s) || /(.)(.)\1\2/.test(s) || SILLY.has(s)) continue;
    if (rng.chance(0.08) && s.length <= 4) s += rng.pick(['ONE', 'ER', 'OS', 'K', 'S', 'Z']);
    if (s.length < minLen || s.length > maxLen) continue;
    if (/(.)\1\1/.test(s)) continue;
    if (/([AEIOU])\1/.test(s)) continue;
    let vvBad = false;
    for (let k = 0; k < s.length - 1; k++) {
      if ('AEIOU'.includes(s[k]) && 'AEIOU'.includes(s[k + 1]) && !VV_OK.has(s[k] + s[k + 1])) vvBad = true;
    }
    if (vvBad) continue;
    if ((s.match(/X/g) || []).length > 1 || (s.match(/[QJ]/g) || []).length > 1) continue;
    if (/^[AEIOU]{2}/.test(s)) continue;
    if (isBad(s)) continue;
    if (rng.chance(0.05)) s = s[0] + s.slice(1).replace(/O/, '0');
    return s;
  }
  return rng.pick(['KREZ', 'ZOVE', 'TESK', 'MORA', 'VEXA']);
}

function makeCrew(rng) {
  for (let t = 0; t < 40; t++) {
    const n = rng.pickW([[2, 3], [3, 6], [4, 1]]);
    let s = '';
    for (let i = 0; i < n; i++) s += rng.pickW([...CONS, ['A', 2], ['O', 1.5], ['E', 1]]);
    if (/(.)\1/.test(s) || isBad(s)) continue;
    return s;
  }
  return 'TZK';
}

const FAMILIES = [['caps', 34], ['flow', 22], ['wild', 18], ['round', 10], ['scrawl', 16]];

function makeHand(rng, family, name) {
  const h = { family };
  const variants = {};
  for (const ch of new Set(name)) {
    const n = glyphVariantCount(ch);
    if (n <= 1) { variants[ch] = 0; continue; }
    // caps writers prefer construction forms, others prefer stylized forms
    const pBase = family === 'caps' ? 0.6 : family === 'round' ? 0.35 : 0.25;
    variants[ch] = rng.chance(pBase) ? 0 : rng.int(1, n - 1);
  }
  h.variants = variants;
  switch (family) {
    case 'caps':
      h.slant = rng.range(-0.04, 0.3); h.wf = rng.range(0.5, 0.8); h.track = rng.range(0.04, 0.2);
      h.round = rng.range(0, 0.35); h.wobble = rng.range(0.01, 0.022); h.connect = false;
      h.firstScale = rng.chance(0.45) ? rng.range(1.1, 1.45) : 1; h.lastScale = rng.chance(0.2) ? rng.range(1.05, 1.3) : 1;
      h.sizeJ = rng.range(0.02, 0.06); h.rotJ = rng.range(0.01, 0.04); h.bounce = rng.range(0, 0.03);
      h.underline = 0.15; h.hooks = 0.1; h.stemExt = 0.12; h.aspect = rng.range(1.0, 1.6);
      break;
    case 'flow':
      h.slant = rng.range(0.15, 0.45); h.wf = rng.range(0.55, 0.85); h.track = rng.range(-0.02, 0.1);
      h.round = rng.range(0.5, 1); h.wobble = rng.range(0.012, 0.026); h.connect = rng.chance(0.7);
      h.firstScale = rng.range(1.15, 1.6); h.lastScale = rng.range(0.9, 1.2);
      h.sizeJ = rng.range(0.04, 0.1); h.rotJ = rng.range(0.02, 0.06); h.bounce = rng.range(0.02, 0.06);
      h.underline = 0.6; h.hooks = 0.35; h.stemExt = 0.2; h.aspect = rng.range(0.9, 1.4);
      break;
    case 'wild':
      h.slant = rng.range(-0.12, 0.4); h.wf = rng.range(0.45, 0.75); h.track = rng.range(0.0, 0.14);
      h.round = rng.range(0, 0.25); h.wobble = rng.range(0.014, 0.03); h.connect = rng.chance(0.35);
      h.firstScale = rng.range(1.2, 1.8); h.lastScale = rng.range(0.9, 1.35);
      h.sizeJ = rng.range(0.05, 0.14); h.rotJ = rng.range(0.03, 0.1); h.bounce = rng.range(0.03, 0.08);
      h.underline = 0.45; h.hooks = 0.45; h.stemExt = 0.5; h.aspect = rng.range(1.1, 2.0);
      break;
    case 'round':
      h.slant = rng.range(-0.05, 0.25); h.wf = rng.range(0.75, 1.0); h.track = rng.range(-0.04, 0.08);
      h.round = rng.range(0.7, 1); h.wobble = rng.range(0.01, 0.022); h.connect = rng.chance(0.3);
      h.firstScale = rng.range(1, 1.25); h.lastScale = 1;
      h.sizeJ = rng.range(0.03, 0.08); h.rotJ = rng.range(0.02, 0.06); h.bounce = rng.range(0.02, 0.05);
      h.underline = 0.3; h.hooks = 0.2; h.stemExt = 0.1; h.aspect = rng.range(0.8, 1.2);
      break;
    default: // scrawl: fast toy-ish scribble tags
      h.slant = rng.range(0.1, 0.5); h.wf = rng.range(0.5, 0.9); h.track = rng.range(-0.02, 0.1);
      h.round = rng.range(0.3, 0.9); h.wobble = rng.range(0.025, 0.05); h.connect = rng.chance(0.5);
      h.firstScale = rng.range(1, 1.4); h.lastScale = rng.range(0.85, 1.1);
      h.sizeJ = rng.range(0.06, 0.15); h.rotJ = rng.range(0.04, 0.1); h.bounce = rng.range(0.04, 0.1);
      h.underline = 0.35; h.hooks = 0.3; h.stemExt = 0.15; h.aspect = rng.range(0.9, 1.5);
  }
  h.deco = rng.pickW([[null, 46], ['crown', 8], ['halo', 6], ['star', 8], ['arrow', 10], ['dots', 8], ['quote', 4], ['dash', 5], ['spark', 3], ['heart', 2]]);
  h.decoP = rng.range(0.3, 0.9);
  h.number = rng.chance(0.18) ? rng.pick(['1', '2', '3', '5', '7', '9', '23', '31', '76', '93', '107', '206']) : null;
  h.crewP = rng.range(0.05, 0.35);
  return h;
}

export function makeWriter(rng, crews) {
  const name = makeName(rng);
  const family = rng.pickW(FAMILIES);
  const w = {
    name,
    crew: crews.length && rng.chance(0.65) ? rng.pick(crews) : null,
    fame: Math.pow(rng.next(), 2.2),
    hand: makeHand(rng, family, name),
    tool: rng.pickW([['spray', 58], ['marker', 24], ['mop', 10], ['fat', 8]]),
    color: pickTagColor(rng),
    altColor: rng.chance(0.4) ? pickTagColor(rng) : null,
    markerColor: pickMarkerColor(rng),
    lineW: rng.range(0.012, 0.028),
    sticker: rng.chance(0.35),
  };
  if (rng.chance(0.55)) {
    const fill = pickThrowFill(rng);
    let text = name.replace(/[^A-Z0-9]/g, '');
    if (text.length > 4 || rng.chance(0.35)) {
      const n = rng.int(2, Math.min(4, text.length));
      text = text.slice(0, n);
    }
    w.throw = {
      text,
      fill,
      outline: pickOutline(rng, fill),
      fat: rng.range(0.32, 0.44),
      overlap: rng.range(0.06, 0.26),
      wf: rng.range(0.95, 1.3),
      rot: rng.range(0.02, 0.1),
      shadow: rng.chance(0.22),
      second: rng.chance(0.18),
      shine: rng.chance(0.6),
      hollow: rng.chance(0.14),
      dir: rng.chance(0.75) ? 1 : -1,
      variants: {},
    };
    // some writers bubble their stylized letterforms (flat-top A, epsilon E, rounded M...)
    const fatOK = { A: [1], B: [1], C: [2], D: [1], E: [1, 3], G: [2], K: [1, 2], M: [1, 3], N: [1], O: [3], R: [1, 2], T: [1], U: [1], W: [1], Y: [1], Z: [1] };
    const pv = rng.chance(0.45) ? rng.range(0.3, 0.8) : 0;
    for (const ch of new Set(w.throw.text)) {
      if (fatOK[ch] && rng.chance(pv)) w.throw.variants[ch] = rng.pick(fatOK[ch]);
    }
  }
  if (rng.chance(0.18)) w.pieceStyle = rng.pickW([['block', 5], ['semi', 4], ['soft', 2]]);
  return w;
}

const poolCache = new Map();

/** Writer pool shared across an alley. */
export function getWriterPool(poolSeed = 'alley', size = 56) {
  const key = poolSeed + '|' + size;
  let pool = poolCache.get(key);
  if (pool) return pool;
  const rng = new Rng('writers:' + poolSeed);
  const crews = [];
  for (let i = 0; i < 7; i++) crews.push(makeCrew(rng));
  const writers = [];
  const used = new Set();
  for (let i = 0; i < size; i++) {
    const w = makeWriter(rng, crews);
    if (used.has(w.name)) continue;
    used.add(w.name);
    writers.push(w);
  }
  // a few "kings" that are everywhere
  writers.sort((a, b) => b.fame - a.fame);
  for (let i = 0; i < Math.min(5, writers.length); i++) writers[i].fame = 0.85 + 0.15 * rng.next();
  pool = { writers, crews };
  poolCache.set(key, pool);
  return pool;
}

/** Choose the writers active on one surface, weighted by fame. */
export function pickLocalWriters(pool, rng, count) {
  const out = [];
  const ws = pool.writers.slice();
  for (let i = 0; i < count && ws.length; i++) {
    const w = rng.pickW(ws.map((x) => [x, 0.08 + x.fame]));
    out.push(w);
    ws.splice(ws.indexOf(w), 1);
  }
  return out;
}

export function pickWriter(local, rng) {
  return rng.pickW(local.map((x) => [x, 0.12 + x.fame * 1.4]));
}
