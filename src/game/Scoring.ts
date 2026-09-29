import { BURNT_AT, DONENESS, INGREDIENTS, BunId, LayerId, isPatty } from '../food/Ingredients';
import type { OrderLayer } from './Order';

export interface BuiltLayer {
  id: LayerId;
  /** placement offset from the plate center (m) */
  dx: number;
  dz: number;
  cook?: { top: number; bottom: number };
}

export interface BuiltBurger {
  bun: BunId | null;
  bottom: { dx: number; dz: number } | null;
  top: { dx: number; dz: number; bun: BunId } | null;
  layers: BuiltLayer[];
}

export interface StationScore {
  score: number; // 0..100
  notes: string[];
}

export interface Rating {
  wait: StationScore;
  grill: StationScore;
  build: StationScore;
  total: number;
  stars: number;
  label: string;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Accuracy for one side of a patty against a target doneness level. */
export function sideAccuracy(cook: number, target: number): number {
  if (cook >= BURNT_AT) return 0;
  const d = Math.abs(cook - target);
  return clamp01(1 - Math.max(0, d - 0.045) / 0.25);
}

export function cookLabel(cook: number): string {
  if (cook >= BURNT_AT) return 'burnt';
  if (cook < 0.18) return 'raw';
  if (cook < 0.5) return 'rare';
  if (cook < 0.7) return 'medium';
  if (cook < 0.9) return 'well done';
  return 'overcooked';
}

export function scoreGrill(order: OrderLayer[], built: BuiltLayer[]): StationScore {
  const wanted = order.filter((l) => isPatty(l.id));
  const have = built.filter((l) => isPatty(l.id));
  const notes: string[] = [];
  if (!wanted.length) return { score: 100, notes };
  let total = 0;
  const used = new Set<number>();
  wanted.forEach((w, i) => {
    // match the i-th wanted patty with the next unused built patty (prefer same type)
    let idx = have.findIndex((h, k) => !used.has(k) && h.id === w.id);
    if (idx < 0) idx = have.findIndex((_, k) => !used.has(k));
    if (idx < 0) {
      notes.push(`Missing ${INGREDIENTS[w.id].name.toLowerCase()}`);
      return;
    }
    used.add(idx);
    const h = have[idx];
    if (h.id !== w.id) {
      notes.push(`Wrong patty: ${INGREDIENTS[h.id].name}`);
      total += 0.15;
      return;
    }
    const target = DONENESS[w.doneness ?? 'medium'].target;
    const top = h.cook?.top ?? 0;
    const bot = h.cook?.bottom ?? 0;
    const a = (sideAccuracy(top, target) + sideAccuracy(bot, target)) / 2;
    total += a;
    const label = wanted.length > 1 ? `Patty ${i + 1}` : 'Patty';
    const describe = (c: number) => {
      if (c >= BURNT_AT) return 'burnt';
      if (c < target - 0.09) return 'undercooked';
      if (c > target + 0.09) return 'overcooked';
      return null;
    };
    const dt = describe(top);
    const db = describe(bot);
    if (!dt && !db) notes.push(`${label}: perfect ${DONENESS[w.doneness ?? 'medium'].label.toLowerCase()}!`);
    else if (dt === db) notes.push(`${label}: ${dt} on both sides`);
    else {
      if (dt) notes.push(`${label}: one side ${dt}`);
      if (db) notes.push(`${label}: other side ${db}`);
    }
  });
  return { score: Math.round((total / wanted.length) * 100), notes };
}

/** Longest common subsequence length of two id arrays. */
export function lcs(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[m][n];
}

export function placementAccuracy(dx: number, dz: number): number {
  const d = Math.hypot(dx, dz);
  return clamp01(1 - Math.max(0, d - 0.007) / 0.038);
}

export function scoreBuild(orderBun: BunId, order: OrderLayer[], built: BuiltBurger): StationScore {
  const notes: string[] = [];
  const want = order.map((l) => l.id as string);
  const have = built.layers.map((l) => l.id as string);
  const common = lcs(want, have);
  const denom = Math.max(want.length, have.length, 1);
  let seq = common / denom;
  // missing / extra summaries
  const count = (arr: string[]) => arr.reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map<string, number>());
  const cw = count(want);
  const ch = count(have);
  for (const [id, n] of cw) {
    const got = ch.get(id) ?? 0;
    if (got < n) notes.push(`Missing ${INGREDIENTS[id as LayerId].name.toLowerCase()}`);
  }
  for (const [id, n] of ch) {
    const need = cw.get(id) ?? 0;
    if (n > need) notes.push(`Extra ${INGREDIENTS[id as LayerId].name.toLowerCase()}`);
  }
  if (common < Math.min(want.length, have.length) && notes.length === 0) notes.push('Layers out of order');
  let bunPenalty = 0;
  if (!built.bottom) {
    bunPenalty += 0.4;
    notes.push('No bottom bun?!');
  }
  if (!built.top) {
    bunPenalty += 0.3;
    notes.push('Forgot the top bun');
  }
  if (built.bun && built.bun !== orderBun) {
    bunPenalty += 0.15;
    notes.push(`Wrong bun: wanted ${INGREDIENTS[orderBun].name}`);
  }
  // placement
  const places: number[] = [];
  if (built.bottom) places.push(placementAccuracy(built.bottom.dx, built.bottom.dz));
  for (const l of built.layers) places.push(placementAccuracy(l.dx, l.dz));
  if (built.top) places.push(placementAccuracy(built.top.dx, built.top.dz));
  const place = places.length ? places.reduce((a, b) => a + b, 0) / places.length : 0;
  if (place < 0.75) notes.push('A bit sloppy — center your layers');
  else if (place > 0.95 && seq === 1) notes.push('Picture-perfect stack!');
  seq = clamp01(seq - bunPenalty);
  const score = Math.round(100 * clamp01(0.68 * seq + 0.32 * place * (seq > 0 ? 1 : 0)));
  return { score, notes };
}

/**
 * Waiting score: full marks during a grace period that scales with patience,
 * then a gentle decline.
 */
export function scoreWait(seconds: number, patience: number, comfortBonus = 0): StationScore {
  const grace = (60 + comfortBonus * 25) * patience;
  const span = 160 * patience * (1 + comfortBonus * 0.3);
  const s = clamp01(1 - Math.max(0, seconds - grace) / span);
  const notes: string[] = [];
  if (s >= 0.98) notes.push('Speedy service!');
  else if (s < 0.5) notes.push('That took forever...');
  else if (s < 0.8) notes.push('A little slow');
  return { score: Math.round(s * 100), notes };
}

export function combine(wait: StationScore, grill: StationScore, build: StationScore, pickiness = 1): Rating {
  const raw = (wait.score + grill.score * 1.1 + build.score * 1.1) / 3.2;
  // picky customers exaggerate flaws
  const total = Math.round(Math.max(0, Math.min(100, 100 - (100 - raw) * pickiness)));
  const stars = total >= 95 ? 5 : total >= 85 ? 4 : total >= 70 ? 3 : total >= 50 ? 2 : 1;
  const label = total >= 97 ? 'PERFECT!' : total >= 90 ? 'Awesome!' : total >= 80 ? 'Great!' : total >= 65 ? 'Good' : total >= 45 ? 'Okay...' : 'Yikes!';
  return { wait, grill, build, total, stars, label };
}

export function computeTip(total: number, layerCount: number, generosity: number, multiplier: number): number {
  const base = 1.0 + 0.32 * layerCount;
  const q = Math.pow(total / 100, 1.7);
  return Math.round(base * q * generosity * multiplier * 100) / 100;
}
