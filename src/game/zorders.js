// Radio orders for the zombie survival squad (bots.js onRadio / Bot.objective / Bot.combat).
// The bots back the player up, so his orders are obeyed, in a fight too, until they run out;
// then they stick with him again (ZombieMode.allyObjective):
//  - Follow me / Regroup team / Stick together: every bot comes along
//  - Cover me: the nearest one stays right by you
//  - Hold this position: the ones close by stay where they stand and fight from there
//  - Team, fall back!: everybody breaks off and comes back to you, shooting on the way
// A new order replaces the one before it ("hold", then "follow me": they follow). Need
// backup / Taking fire keep the stock rule (the ones close by come over for a while).

// the radio menu's lines (radiomenu.js SAY, bots.js RADIO)
const FOLLOW = 'Follow me.', REGROUP = 'Regroup team.', TOGETHER = 'Stick together, team.', COVER = 'Cover me!';
const HOLD = 'Hold this position.', FALLBACK = 'Team, fall back!';
const AFFIRM = 'Affirmative.', NEGATIVE = 'Negative.';
/** How long an order lasts (s), and how close counts as "with him" / "at the spot" (units). */
export const ORDERS = { follow: 25, cover: 12, hold: 30, fallback: 15, holdRange: 900, coverRange: 1500, backAt: 110, fightLeash: 260, holdLeash: 90, holdGive: 250, clawed: 70 };

const flat = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * An order radioed by p (the human) to his bot teammates `mates` (alive, not p). Returns
 * true when it was one of the squad's orders (then nothing else reads it).
 */
export function zombieRadio(mgr, p, text, mates) {
  const t = mgr.time, o = p.pm.origin;
  let list;
  switch (text) {
    case FOLLOW: case REGROUP: case TOGETHER: list = mates.filter((b) => !b.p.downed); break;
    case COVER: {
      let best = null, bd = ORDERS.coverRange;
      for (const b of mates) { const d = flat(b.p.pm.origin, o); if (!b.p.downed && d < bd) { bd = d; best = b; } }
      list = best ? [best] : [];
      break;
    }
    case HOLD: list = mates.filter((b) => !b.p.downed && flat(b.p.pm.origin, o) < ORDERS.holdRange); break;
    case FALLBACK: list = mates.filter((b) => !b.p.downed); break;
    default: return false;
  }
  for (const b of list) {
    b.follow = b.holdHere = b.fallback = null;
    if (text === HOLD) b.holdHere = { pos: b.p.feet(), until: t + ORDERS.hold };
    else if (text === FALLBACK) b.fallback = { p, until: t + ORDERS.fallback };
    else b.follow = { p, until: t + (text === COVER ? ORDERS.cover : ORDERS.follow) };
  }
  // the nearest one answers (always: an order wants an answer, whatever the radio chatter)
  let near = null, nd = Infinity;
  for (const b of list) { const d = flat(b.p.pm.origin, o); if (d < nd) { nd = d; near = b; } }
  if (!near) near = mates[0];
  near?.queueRadio(list.length ? AFFIRM : NEGATIVE, 0.6 + Math.random() * 0.8, true);
  return true;
}

/**
 * Bot.objective, under "fall back": head back to whoever called it. False (and the order is
 * over) once there, or when it ran out: the bot sticks with him as usual from then on.
 */
export function zombieFallBack(bot, it) {
  const F = bot.fallback, q = F.p, p = bot.p;
  if (!q || q === p || !q.alive || bot.time >= F.until || flat(p.pm.origin, q.pm.origin) < ORDERS.backAt) { bot.fallback = null; return false; }
  it.move = q.feet();
  it.walk = false;
  return true;
}

/**
 * Bot.backOff: may a step back from a zombie go to `to`? Under orders, not away from the
 * human it is on its way to, nor much farther off a spot it holds.
 */
export function zombieMayStepTo(bot, to) {
  const t = bot.time, H = bot.holdHere, F = bot.fallback, L = bot.follow;
  const q = F && F.p && t < F.until ? F.p : L && t < L.until ? L.p : null;
  if (q && q.alive && q !== bot.p) {
    const o = bot.p.pm.origin, d = flat(o, q.pm.origin), e = bot.target;
    if (e && flat(e.pm.origin, o) < ORDERS.clawed) return true; // (one in its face: off it first)
    return d <= ORDERS.fightLeash || flat(to, q.pm.origin) <= d;
  }
  return !H || t >= H.until || flat(to, H.pos) <= ORDERS.holdGive;
}

/**
 * Bot.combat against a zombie: an order still holds while it shoots. Falling back /
 * following: towards the human (unless it is already stepping somewhere); holding: no
 * running off to cover far from the spot, and back to it when pushed off. True when it
 * moves for one (it.move set).
 */
export function zombieOrderInFight(bot, it) {
  const t = bot.time, p = bot.p, o = p.pm.origin;
  let to = null, r = 0;
  const F = bot.fallback, L = bot.follow, H = bot.holdHere;
  if (F && F.p && t < F.until && F.p.alive) { to = F.p; r = ORDERS.backAt; }
  else if (L && t < L.until && L.p.alive) { to = L.p; r = ORDERS.fightLeash; }
  else if (H && t < H.until) {
    if (it.move && flat(it.move, H.pos) <= ORDERS.holdGive) return false; // a step back close by
    it.move = null;
    if (flat(o, H.pos) <= ORDERS.holdLeash) return false;
    it.move = H.pos; it.tol = 24;
    return true;
  }
  if (it.move || !to || to === p || flat(o, to.pm.origin) <= r) return false;
  it.move = to.feet(); it.tol = 24;
  return true;
}
