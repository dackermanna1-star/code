import { describe, expect, it } from 'vitest';
import { CUT_SEQUENCES, doneness, makeFood, type FoodState } from '../src/food/types';
import { getDef, hasDef, INGREDIENTS, SEASONINGS } from '../src/food/catalog';
import {
  addSeasoning,
  applyCold,
  applyHeat,
  applyRoom,
  blend,
  canCut,
  canPeel,
  combine,
  cut,
  enterStation,
  flatten,
  isContainerProduct,
  isLiquid,
  leaves,
  mash,
  mixBowl,
  panMerge,
  peel,
  potMerge,
  tintOf,
  TOOL_FORMS,
  type CookEvent,
  type HeatMethod,
} from '../src/food/process';

// ---------------------------------------------------------------------------------------------
// helpers

/** Run a heat method for `secs` in small steps (like a station would), collecting events. */
function cook(f: FoodState, method: HeatMethod, secs: number, dt = 0.05, heat = 1): CookEvent[] {
  const ev: CookEvent[] = [];
  for (let t = 0; t < secs - 1e-9; t += dt) ev.push(...applyHeat(f, method, dt, heat));
  return ev;
}

function chill(f: FoodState, secs: number, dt = 0.1): CookEvent[] {
  const ev: CookEvent[] = [];
  for (let t = 0; t < secs - 1e-9; t += dt) ev.push(...applyCold(f, dt));
  return ev;
}

/** Cook until a predicate holds (or give up). */
function cookUntil(f: FoodState, method: HeatMethod, pred: () => boolean, max = 60, dt = 0.05): CookEvent[] {
  const ev: CookEvent[] = [];
  for (let t = 0; t < max && !pred(); t += dt) ev.push(...applyHeat(f, method, dt));
  return ev;
}

const SPECIAL_FORMS: Record<string, string[]> = { egg: ['halved', 'sliced', 'diced'], baguette: ['halved'] };

/** The rendering contract: catalogue id (or a well-formed assembly) and a valid form. */
function renderableProblems(f: FoodState, path = 'root', depth = 0): string[] {
  const out: string[] = [];
  if (!f || typeof f !== 'object') return [`${path}: not an object`];
  if (depth > 14) return [`${path}: too deep`];
  if (!Number.isFinite(f.seed)) out.push(`${path}: bad seed`);
  if (!f.cook) out.push(`${path}: no cook`);
  else for (const [k, v] of Object.entries(f.cook)) if (!Number.isFinite(v)) out.push(`${path}: cook.${k}=${v}`);
  for (const [k, v] of Object.entries(f.season ?? {})) if (!Number.isFinite(v)) out.push(`${path}: season.${k}=${v}`);
  if (f.id === 'assembly') {
    if (!f.parts?.length) out.push(`${path}: assembly without parts`);
    if (!['stack', 'topped', 'pile'].includes(f.layout ?? '')) out.push(`${path}: bad layout ${f.layout}`);
    if (!['whole', 'halved', 'sliced'].includes(f.form)) out.push(`${path}: bad assembly form ${f.form}`);
    const seeds = new Set<number>();
    const walk = (s: FoodState) => {
      if (seeds.has(s.seed)) out.push(`${path}: duplicate seed ${s.seed}`);
      seeds.add(s.seed);
      for (const p of s.parts ?? []) walk(p);
    };
    walk(f);
    (f.parts ?? []).forEach((p, i) => out.push(...renderableProblems(p, `${path}.parts[${i}]`, depth + 1)));
  } else {
    if (!hasDef(f.id)) out.push(`${path}: unknown id ${f.id}`);
    else {
      const d = getDef(f.id);
      const ok = CUT_SEQUENCES[d.cut].includes(f.form) || TOOL_FORMS.includes(f.form) || (SPECIAL_FORMS[f.id] ?? []).includes(f.form);
      if (!ok) out.push(`${path}: form ${f.form} invalid for ${f.id} (${d.cut})`);
      if (d.category === 'product' && f.tint !== undefined && !/^#[0-9a-f]{6}$/i.test(f.tint)) out.push(`${path}: bad tint ${f.tint}`);
    }
  }
  (f.from ?? []).forEach((p, i) => {
    if (!p || (p.id !== 'assembly' && !hasDef(p.id))) out.push(`${path}.from[${i}]: bad`);
  });
  return out;
}

function expectRenderable(f: FoodState) {
  expect(renderableProblems(f)).toEqual([]);
}

const F = (id: string, form: FoodState['form'] = 'whole') => makeFood(id, form);

// ---------------------------------------------------------------------------------------------

describe('heat', () => {
  it('cooks by method with form factors, reports done once, burns later (not when boiling)', () => {
    const steak = F('steak');
    const ev = cook(steak, 'grill', 10.2);
    expect(steak.cook.grill).toBeGreaterThan(0.99);
    expect(ev.filter((e) => e.kind === 'done')).toHaveLength(1);
    expect(steak.cook.burn).toBe(0);
    const ev2 = cook(steak, 'grill', 25);
    expect(ev2.filter((e) => e.kind === 'burning')).toHaveLength(1);
    expect(ev2.filter((e) => e.kind === 'burnt')).toHaveLength(1);
    expect(steak.cook.burn).toBeGreaterThan(0.8);
    expect(steak.cook.temp).toBeGreaterThan(0.9);

    // diced cooks faster than whole
    const a = F('potato'), b = F('potato', 'diced');
    cook(a, 'fry', 2);
    cook(b, 'fry', 2);
    expect(b.cook.fry / a.cook.fry).toBeCloseTo(2.2, 1);

    // boiling never burns
    const egg = F('egg');
    cook(egg, 'boil', 120, 0.5);
    expect(egg.cook.burn).toBe(0);
    expect(doneness(egg.cook)).toBeGreaterThan(1);
  });

  it('melts melty things and reports it once', () => {
    const cheese = F('cheese');
    const ev = cook(cheese, 'fry', 5);
    expect(cheese.cook.melt).toBe(1);
    expect(ev.filter((e) => e.kind === 'melted')).toHaveLength(1);
  });

  it('batter -> pan -> pancake', () => {
    const batter = mixBowl([F('flour'), F('egg'), F('milk')]);
    expect(batter.id).toBe('batter');
    const inPan = enterStation(batter, 'pan');
    expect(inPan.form).toBe('flat');
    expect(inPan).not.toBe(batter);
    const ev = cookUntil(inPan, 'fry', () => inPan.id === 'pancake');
    expect(inPan.id).toBe('pancake');
    expect(inPan.form).toBe('whole');
    expect(ev.find((e) => e.kind === 'transform')).toMatchObject({ rebuild: true, label: 'Pancake!' });
    expect(inPan.from?.[0].id).toBe('batter');
    expect(inPan.tint).toMatch(/^#[0-9a-f]{6}$/);
    expectRenderable(inPan);
  });

  it('egg -> pan -> fried egg; beaten egg -> scrambled', () => {
    const egg = enterStation(F('egg'), 'pan');
    expect(egg.form).toBe('cracked');
    cookUntil(egg, 'fry', () => egg.id === 'fried-egg');
    expect(egg.id).toBe('fried-egg');
    expectRenderable(egg);

    const beaten = enterStation(mixBowl([F('egg'), F('egg')]), 'pan');
    expect(beaten.id).toBe('beaten-egg');
    cookUntil(beaten, 'fry', () => beaten.id === 'scrambled-eggs');
    expect(beaten.id).toBe('scrambled-eggs');
    expectRenderable(beaten);
  });

  it('microwave: corn pops, eggs explode, marshmallows puff', () => {
    const corn = F('corn');
    const ev = cook(corn, 'micro', 6, 0.05, 1.1);
    expect(corn.id).toBe('popcorn');
    expect(ev.find((e) => e.kind === 'popped')).toMatchObject({ rebuild: true, label: 'Popcorn!' });
    expectRenderable(corn);

    const egg = F('egg');
    const ev2 = cook(egg, 'micro', 6);
    expect(ev2.find((e) => e.kind === 'exploded')).toMatchObject({ rebuild: true, label: 'Pop!' });
    expect(egg.id).toBe('scrambled-eggs');

    const mm = F('marshmallow');
    cook(mm, 'micro', 3);
    expect(mm.form).toBe('popped');
    expectRenderable(mm);
  });

  it('oven & fryer transformations', () => {
    const loaf = F('dough');
    cook(loaf, 'bake', 8);
    expect(loaf.id).toBe('bread');
    expect(loaf.from?.[0].id).toBe('dough');

    const balls = F('dough', 'pieces');
    cook(balls, 'bake', 4);
    expect(balls.id).toBe('cookie');
    expect(balls.form).toBe('pieces');

    const cd = mixBowl([F('flour'), F('butter'), F('egg'), F('chocolate')]);
    expect(cd.id).toBe('cookie-dough');
    cook(cd, 'bake', 6);
    expect(cd.id).toBe('cookie');
    expectRenderable(cd);

    const batter = mixBowl([F('flour'), F('egg'), F('milk'), F('chocolate')]);
    cook(batter, 'bake', 6);
    expect(batter.id).toBe('cake');
    expect(batter.tint).toMatch(/^#[0-9a-f]{6}$/);

    const flat = flatten(F('dough'))!;
    cook(flat, 'bake', 4);
    expect(flat.id).toBe('flatbread');

    const donut = F('dough');
    cook(donut, 'deepfry', 6);
    expect(donut.id).toBe('donut');
    expectRenderable(donut);
  });

  it('assemblies cook every part at the slowest pace; a pizza base stays dough', () => {
    let pizza = flatten(F('dough'))!;
    addSeasoning(pizza, 'tomato-sauce', 1);
    pizza = combine(pizza, F('cheese', 'sliced'));
    pizza = combine(pizza, cut(F('sausage'))!);
    expect(pizza.id).toBe('assembly');
    expect(pizza.layout).toBe('topped');
    const ev = cook(pizza, 'bake', 6);
    expect(pizza.parts![0].id).toBe('dough');
    expect(pizza.parts![0].form).toBe('flat');
    expect(pizza.parts![0].cook.bake).toBeGreaterThan(1);
    // cheese melted but did not burn before the crust was baked
    expect(pizza.parts![1].cook.melt).toBe(1);
    expect(pizza.parts![1].cook.burn).toBe(0);
    expect(ev.filter((e) => e.kind === 'done')).toHaveLength(1);
    expect(ev.filter((e) => e.kind === 'melted')).toHaveLength(1);
    expect(doneness(pizza.cook)).toBeGreaterThan(1);
    expectRenderable(pizza);
  });

  it('ignores bad inputs', () => {
    const f = F('apple');
    expect(applyHeat(f, 'fry', NaN)).toEqual([]);
    expect(applyHeat(f, 'fry', -1)).toEqual([]);
    expect(applyHeat(f, 'nope' as HeatMethod, 1)).toEqual([]);
    expect(applyHeat(f, 'fry', 1, 0)).toEqual([]);
    expect(f.cook.fry).toBe(0);
  });
});

describe('cold & room', () => {
  it('freezer: smoothie -> ice pop, sweet cream -> ice cream, others just freeze', () => {
    const smoothie = blend([F('strawberry'), F('banana'), F('milk')]);
    expect(smoothie.id).toBe('drink');
    const ev = chill(smoothie, 12);
    expect(smoothie.id).toBe('icepop');
    expect(ev.filter((e) => e.kind === 'transform')).toHaveLength(1);
    expect(ev[0]).toMatchObject({ rebuild: true, label: 'Ice Pop!' });
    expect(smoothie.from?.map((x) => x.id)).toEqual(['strawberry', 'banana', 'milk']);
    expectRenderable(smoothie);

    const cream = mixBowl([F('milk'), F('strawberry', 'diced')]);
    expect(cream.id).toBe('sweet-cream');
    chill(cream, 12);
    expect(cream.id).toBe('scoops');

    const apple = F('apple');
    const ev2 = chill(apple, 12);
    expect(apple.cook.freeze).toBe(1);
    expect(apple.cook.temp).toBeLessThan(-0.9);
    expect(ev2.filter((e) => e.kind === 'frozen')).toHaveLength(1);
  });

  it('room: hot food cools, frozen food thaws, ice cream melts slowly', () => {
    const steak = F('steak');
    cook(steak, 'grill', 5);
    expect(steak.cook.temp).toBeGreaterThan(0.9);
    for (let i = 0; i < 120; i++) applyRoom(steak, 0.25);
    expect(steak.cook.temp).toBe(0);
    // stable: nothing changes any more
    const before = JSON.stringify(steak.cook);
    applyRoom(steak, 0.25);
    expect(JSON.stringify(steak.cook)).toBe(before);

    const pea = F('peas');
    chill(pea, 12);
    for (let i = 0; i < 280; i++) applyRoom(pea, 0.25);
    expect(pea.cook.freeze).toBe(0);

    const ice = F('ice-cream');
    const ev: CookEvent[] = [];
    for (let i = 0; i < 4 * 200; i++) ev.push(...applyRoom(ice, 0.25));
    expect(ice.id).toBe('sweet-cream');
    expect(ev.filter((e) => e.kind === 'melted')).toHaveLength(1);
    expectRenderable(ice);
  });
});

describe('board tools', () => {
  it('walks cut sequences and returns new objects', () => {
    const t = F('tomato');
    const h = cut(t)!;
    expect(h.form).toBe('halved');
    expect(t.form).toBe('whole');
    expect(cut(h)!.form).toBe('sliced');
    expect(cut(cut(cut(cut(h)!)!)!)).toBeNull();
    expect(canCut(F('milk'))).toBe(false);
    // potato sticks
    let p = F('potato');
    for (let i = 0; i < 3; i++) p = cut(p)!;
    expect(p.form).toBe('sticks');
  });

  it('eggs crack raw, slice when boiled', () => {
    expect(cut(F('egg'))!.form).toBe('cracked');
    const boiled = F('egg');
    cook(boiled, 'boil', 6);
    expect(cut(boiled)!.form).toBe('halved');
    expect(cut(cut(boiled)!)!.form).toBe('sliced');
  });

  it('assemblies: whole -> halved -> sliced; piles cannot be cut', () => {
    const sandwich = combine(cut(F('bread'))!, F('cheese', 'sliced'));
    expect(sandwich.layout).toBe('stack');
    expect(cut(sandwich)!.form).toBe('halved');
    expect(cut(cut(sandwich)!)!.form).toBe('sliced');
    expect(cut(cut(cut(sandwich)!)!)).toBeNull();
    expect(cut(combine(F('apple'), F('steak')))).toBeNull();
  });

  it('peel, flatten, mash', () => {
    expect(canPeel(F('potato'))).toBe(true);
    const pp = peel(F('potato'))!;
    expect(pp.peeled).toBe(true);
    expect(peel(pp)).toBeNull();
    expect(canPeel(F('tomato'))).toBe(false);

    expect(flatten(F('dough'))!.form).toBe('flat');
    expect(flatten(F('cookie-dough', 'pieces'))!.form).toBe('flat');
    expect(flatten(F('apple'))!.form).toBe('flat');
    expect(flatten(flatten(F('apple'))!)).toBeNull();
    expect(flatten(F('milk'))).toBeNull();

    expect(mash(F('banana'))!.form).toBe('mashed');
    expect(mash(F('milk'))).toBeNull();
    expect(mash(combine(F('apple'), F('pear')))).toBeNull();
    expect(mash(mash(F('banana'))!)).toBeNull();
  });
});

describe('combine', () => {
  it('builds burgers in any order', () => {
    const patty = F('patty');
    cook(patty, 'grill', 9);
    const bun = cut(F('bun'))!;
    let burger = combine(bun, patty);
    burger = combine(burger, F('cheese', 'sliced'));
    burger = combine(burger, F('lettuce', 'leaves'));
    expect(burger.layout).toBe('stack');
    expect(burger.parts!.map((p) => p.id)).toEqual(['bun', 'patty', 'cheese', 'lettuce']);
    expect(burger.parts![0].form).toBe('halved');
    expectRenderable(burger);

    // patty first, bun dropped on top; whole bun is split automatically
    const b2 = combine(patty, F('bun'));
    expect(b2.layout).toBe('stack');
    expect(b2.parts![0]).toMatchObject({ id: 'bun', form: 'halved' });
    // a heap of burger bits + bun -> burger
    const heap = combine(F('cheese', 'sliced'), F('tomato', 'sliced'));
    expect(heap.layout).toBe('pile');
    const b3 = combine(heap, cut(F('bun'))!);
    expect(b3.layout).toBe('stack');
    expect(b3.parts![0].id).toBe('bun');
    expectRenderable(b3);
  });

  it('tops flat bases, stacks discs, piles the rest, never mutates inputs', () => {
    const base = flatten(F('dough'))!;
    const tomato = F('tomato', 'diced');
    const pizza = combine(base, tomato);
    expect(pizza.layout).toBe('topped');
    expect(base.form).toBe('flat');
    expect(tomato.form).toBe('diced');
    expect(combine(F('pancake'), F('pancake')).layout).toBe('stack');
    expect(combine(F('pancake'), F('blueberry')).layout).toBe('topped');
    expect(combine(F('steak'), F('apple')).layout).toBe('pile');
    const more = combine(pizza, F('basil', 'leaves'));
    expect(more.parts).toHaveLength(3);
    expect(pizza.parts).toHaveLength(2);
    // whipped cream becomes a topping, batter coats
    const pc = combine(F('pancake'), mixBowl([F('cream')]));
    expect(pc.id).toBe('pancake');
    expect(pc.season.whip).toBeGreaterThan(0);
    const coated = combine(cut(F('bread'))!, mixBowl([F('egg')]));
    expect(coated.parts![1]).toMatchObject({ id: 'beaten-egg', form: 'flat' });
    expectRenderable(coated);
  });

  it('is forgiving with anything', () => {
    const ids = INGREDIENTS.map((d) => d.id);
    for (let i = 0; i < 200; i++) {
      const a = F(ids[(i * 7) % ids.length]);
      const b = F(ids[(i * 13 + 5) % ids.length]);
      const c = combine(combine(a, b), F(ids[(i * 3 + 1) % ids.length]));
      expectRenderable(c);
    }
  });
});

describe('bowl, blender, pot, pan', () => {
  it('mixBowl recipes', () => {
    expect(mixBowl([F('flour'), F('egg'), F('milk'), F('butter')]).id).toBe('batter');
    expect(mixBowl([F('flour'), F('egg')]).id).toBe('dough');
    expect(mixBowl([F('flour'), F('butter')]).id).toBe('dough');
    const sweetFlour = F('flour');
    addSeasoning(sweetFlour, 'sugar', 1);
    expect(mixBowl([sweetFlour, F('butter'), F('egg')]).id).toBe('cookie-dough');
    expect(mixBowl([F('egg'), F('egg'), F('milk'), F('cheese', 'diced')]).id).toBe('beaten-egg');
    expect(mixBowl([F('cream')]).id).toBe('whipped-cream');
    const sc = F('cream');
    addSeasoning(sc, 'sugar', 1);
    expect(mixBowl([sc]).id).toBe('whipped-cream');
    expect(mixBowl([F('cream'), F('strawberry', 'sliced')]).id).toBe('sweet-cream');
    expect(mixBowl([F('milk'), F('chocolate')]).id).toBe('sweet-cream');
    const pot = F('potato');
    cook(pot, 'boil', 10);
    const mashed = mixBowl([pot, F('butter'), F('milk')]);
    expect(mashed).toMatchObject({ id: 'potato', form: 'mashed' });
    expect(mashed.from?.map((x) => x.id)).toEqual(['butter', 'milk']);
    expect(mixBowl([F('avocado'), F('lemon'), F('onion', 'diced')]).id).toBe('mixture');
    const salad = mixBowl([F('lettuce', 'leaves'), F('tomato', 'diced'), F('cucumber', 'sliced')]);
    expect(salad).toMatchObject({ id: 'assembly', layout: 'pile' });
    expect(mixBowl([F('steak'), F('chocolate')]).id).toBe('mixture');
    // re-mixing a finished thing changes nothing; a salad takes in new chopped things
    expect(mixBowl([F('dough')]).id).toBe('dough');
    expect(mixBowl([mixBowl([F('flour'), F('egg'), F('milk')])]).id).toBe('batter');
    const bigger = mixBowl([salad, F('carrot', 'sliced')]);
    expect(bigger.layout).toBe('pile');
    expect(bigger.parts).toHaveLength(4);
    expect(mixBowl([F('apple')]).id).toBe('mixture');
    for (const m of [mashed, salad]) expectRenderable(m);
  });

  it('blend: fruit -> drink, veg -> soup, meat -> mixture, ice cream + milk -> drink', () => {
    expect(blend([F('strawberry'), F('banana'), F('milk')]).id).toBe('drink');
    expect(blend([F('tomato'), F('cucumber'), F('onion')]).id).toBe('soup');
    expect(blend([F('steak'), F('bread')]).id).toBe('mixture');
    const shake = blend([F('ice-cream'), F('milk')]);
    expect(shake.id).toBe('drink');
    expect(shake.cook.temp).toBeLessThan(0);
    // strong colours dominate
    const choc = blend([F('milk'), F('milk'), F('chocolate')]);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(choc.tint!.slice(i, i + 2), 16));
    expect(r + g + b).toBeLessThan(400);
    expect(tintOf([])).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('potMerge: soup from different boiled things; staples stay separate; hot chocolate', () => {
    const tomato = F('tomato', 'diced'), onion = F('onion', 'diced');
    expect(potMerge([tomato, onion])).toBeNull(); // not boiled yet
    cook(tomato, 'boil', 4);
    cook(onion, 'boil', 4);
    const soup = potMerge([tomato, onion])!;
    expect(soup.id).toBe('soup');
    expect(soup.cook.temp).toBeGreaterThan(0.5);
    expect(soup.from?.map((x) => x.id)).toEqual(['tomato', 'onion']);
    expect(potMerge([soup])).toBeNull();
    const carrot = F('carrot', 'sliced');
    cook(carrot, 'boil', 4);
    const bigger = potMerge([soup, carrot])!;
    expect(bigger.id).toBe('soup');
    expect(bigger.from?.map((x) => x.id)).toEqual(['tomato', 'onion', 'carrot']);

    const pasta = F('spaghetti'), egg = F('egg'), potato = F('potato');
    for (const x of [pasta, egg, potato]) cook(x, 'boil', 12);
    expect(potMerge([pasta, egg, potato])).toBeNull();
    expect(potMerge([pasta, F('spaghetti')])).toBeNull();

    const milk = F('milk'), choc = F('chocolate');
    cook(milk, 'boil', 4);
    cook(choc, 'boil', 4);
    const cocoa = potMerge([milk, choc])!;
    expect(cocoa.id).toBe('drink');
    expect(cocoa.cook.temp).toBeGreaterThan(0.5);
    expectRenderable(bigger);
    expectRenderable(cocoa);
  });

  it('panMerge: omelet, stir-fry, fried rice; null otherwise', () => {
    const beaten = enterStation(mixBowl([F('egg'), F('egg')]), 'pan');
    const ham = F('ham', 'diced');
    cook(beaten, 'fry', 0.3);
    const om = panMerge([beaten, ham])!;
    expect(om.id).toBe('omelet');
    expect(om.from?.map((x) => x.id)).toEqual(['beaten-egg', 'ham']);
    expectRenderable(om);

    const pepper = F('bell-pepper', 'sliced'), onion = F('onion', 'sliced'), chicken = F('chicken', 'strips');
    expect(panMerge([pepper, onion, chicken])).toBeNull();
    for (const x of [pepper, onion, chicken]) cook(x, 'fry', 5);
    const sf = panMerge([pepper, onion, chicken])!;
    expect(sf).toMatchObject({ id: 'assembly', layout: 'pile' });
    expect(sf.parts).toHaveLength(3);
    const carrot = F('carrot', 'sliced');
    cook(carrot, 'fry', 3);
    expect(panMerge([sf, carrot])!.parts).toHaveLength(4);

    const rice = F('rice');
    cook(rice, 'boil', 9);
    cook(rice, 'fry', 3);
    const peas = F('peas');
    cook(peas, 'fry', 3);
    const fr = panMerge([rice, enterStation(F('egg'), 'pan'), peas])!;
    expect(fr.layout).toBe('pile');
    expect(fr.parts!.map((p) => p.id)).toEqual(['rice', 'scrambled-eggs', 'peas']);
    expectRenderable(fr);

    expect(panMerge([F('pancake'), F('banana', 'sliced')])).toBeNull();
    expect(panMerge([F('steak'), F('steak')])).toBeNull();
  });
});

describe('queries', () => {
  it('liquids & containers', () => {
    expect(isLiquid(F('milk'))).toBe(true);
    expect(isLiquid(F('apple'))).toBe(false);
    const frozenMilk = F('milk');
    frozenMilk.cook.freeze = 1;
    expect(isLiquid(frozenMilk)).toBe(false);
    for (const id of ['drink', 'soup', 'batter', 'beaten-egg', 'sweet-cream', 'whipped-cream', 'mixture', 'scoops']) expect(isContainerProduct(F(id))).toBe(true);
    expect(isContainerProduct(F('pancake'))).toBe(false);
  });

  it('seasoning & leaves', () => {
    const f = F('apple');
    addSeasoning(f, 'cinnamon', 0.5);
    addSeasoning(f, 'cinnamon', 0.5);
    addSeasoning(f, 'not-a-thing', 1);
    addSeasoning(f, 'salt', NaN);
    expect(f.season).toEqual({ cinnamon: 1 });
    const pancake = mixBowl([F('flour'), F('egg'), F('milk')]);
    expect(leaves(pancake).map((l) => l.id).sort()).toEqual(['egg', 'flour', 'milk']);
    const plate = combine(combine(F('steak'), F('potato')), pancake);
    expect(leaves(plate).map((l) => l.id)).toEqual(['steak', 'potato', 'flour', 'egg', 'milk']);
  });

  it('all seasonings are accepted', () => {
    const f = F('bread', 'sliced');
    for (const s of SEASONINGS) addSeasoning(f, s.id, 1);
    expect(Object.keys(f.season)).toHaveLength(SEASONINGS.length);
  });
});
