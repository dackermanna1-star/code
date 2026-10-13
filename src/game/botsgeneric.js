// Bot knowledge and objectives for maps without hand-made bot data (original BSP maps
// such as cs_mansion). Everything is derived from the entities and the nav graph:
//   hostage maps - CTs go to the hostages, +use them and walk them back to the rescue
//     point, waiting for any that fall behind; Ts hold spots on the routes the CTs must
//     take to the hostages (found by pathing from the CT spawn), and chase down a
//     hostage that is being led away
//   bomb maps - the carrier takes the bomb to the nearest site and plants, the others
//     go with him; CTs split over the sites and go to defuse a planted bomb
//   anything else - hunt toward the enemy spawn
import { TEAM_T, TEAM_CT } from './player.js';

const EYE = 64;
const eyeAt = (p) => [p[0], p[1], p[2] + EYE];
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const avg = (list) => list.reduce((s, p) => [s[0] + p[0] / list.length, s[1] + p[1] / list.length, s[2] + p[2] / list.length], [0, 0, 0]);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** Fill a Knowledge object for a map without MAPDATA. */
export function initGenericKnowledge(K, game) {
  K.generic = true;
  const nav = game.nav;
  const feetOf = (o) => [o[0], o[1], o[2] - 36];
  const snapNode = (p) => nav.nearest(p, 200) || nav.nearestXY(p, 300, 140);
  const snapPt = (p) => { const n = snapNode(p); return n ? [n.x, n.y, n.z] : p.slice(); };
  K.ctSpawn = snapPt(avg(game.spawns.CT.map((s) => feetOf(s.origin))));
  K.tSpawn = snapPt(avg(game.spawns.T.map((s) => feetOf(s.origin))));
  K.routes = {}; K.holds = {}; K.rotate = { A: [], B: [] }; K.lurk = { A: [], B: [] }; K.control = [];
  K.postPlant = { A: [], B: [] }; K.fake = {}; K.retake = {}; K.fallback = { A: [], B: [] };
  // bomb sites
  K.sites = {};
  for (const z of game.bombTargets) {
    const c = snapPt([(z.mins[0] + z.maxs[0]) / 2, (z.mins[1] + z.maxs[1]) / 2, z.mins[2] + 1]);
    K.sites[z.name] = { name: z.name, center: c, plant: [c], flash: [c[0], c[1], c[2] + 150] };
    const spots = K.slots(c, 6).map((q) => ({ pos: q, watch: [eyeAt(K.tSpawn)], n: 'site ' + z.name }));
    K.postPlant[z.name] = spots;
  }
  // hostage routes: path from the CT spawn to each hostage; Ts hold along the last
  // stretch, looking back down the path
  K.hostageSpots = (game.hostages?.spots || []).map((s) => snapPt(s.origin));
  K.tHolds = [];
  K.roam = [];
  K.dangerForCT = [];
  const ctNode = snapNode([K.ctSpawn[0], K.ctSpawn[1], K.ctSpawn[2] + 36]);
  for (const hs of K.hostageSpots) {
    const hn = snapNode([hs[0], hs[1], hs[2] + 36]);
    const raw = ctNode && hn ? nav.findPath(ctNode, hn) : null;
    if (!raw || raw.length < 3) {
      for (const q of K.slots(hs, 3)) K.tHolds.push({ pos: q, watch: [eyeAt(K.ctSpawn)], n: 'hostage' });
      continue;
    }
    // walk back from the hostage, marking spots at increasing path distances
    const marks = [140, 380, 650, 1000];
    let acc = 0, mi = 0;
    for (let i = raw.length - 1; i > 0 && mi < marks.length; i--) {
      const a = raw[i], b = raw[i - 1];
      acc += Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      if (acc < marks[mi]) continue;
      // look toward where the CTs come from: a node ~300 units further down the path
      let j = i - 1, back = 0;
      while (j > 0 && back < 300) { back += Math.hypot(raw[j].x - raw[j - 1].x, raw[j].y - raw[j - 1].y); j--; }
      const w = raw[j];
      const spot = { pos: [b.x, b.y, b.z], watch: [eyeAt([w.x, w.y, w.z])], n: `hostage+${marks[mi]}` };
      if (mi === marks.length - 1) K.roam.push(spot); else K.tHolds.push(spot);
      K.dangerForCT.push(eyeAt(spot.pos));
      mi++;
    }
  }
  // de-duplicate holds that ended up on top of each other
  K.tHolds = K.tHolds.filter((h, i) => K.tHolds.findIndex((o) => dist2(o.pos, h.pos) < 64) === i);
  K.dangerForT = K.hostageSpots.map(eyeAt).concat(Object.values(K.sites).map((s) => eyeAt(s.center)));
  K.rescuePoints = (game.hostages?.rescuePoints || game.spawns.CT.map((s) => s.origin)).map((o) => snapPt(o));
}

/** Round start: give Ts their spots (spread, a roamer or two). */
export function planGeneric(mgr) {
  const K = mgr.K();
  const ts = shuffle(mgr.alive(TEAM_T));
  const holds = shuffle(K.tHolds.slice());
  ts.forEach((b, i) => {
    b.gTask = null;
    if (K.roam.length && i < Math.max(1, Math.floor(ts.length / 4)) && Math.random() < 0.8) b.gTask = { kind: 'roam', spot: K.roam[i % K.roam.length] };
    else if (holds.length) b.gTask = { kind: 'hold', spot: holds[i % holds.length] };
  });
  const cts = mgr.alive(TEAM_CT);
  cts.forEach((b, i) => {
    const sites = Object.values(K.sites);
    b.gTask = sites.length ? { kind: 'site', site: sites[i % sites.length].name } : { kind: 'rescue' };
    b.hostTarget = null;
  });
}

/** The bot's objective on a generic map. */
export function genericObjective(bot, it) {
  const g = bot.game, H = g.hostages;
  if (H?.enabled && H.list.length) return bot.p.team === TEAM_CT ? ctHostage(bot, it) : tHostage(bot, it);
  if (g.bombTargets.length) return bot.p.team === TEAM_T ? tBomb(bot, it) : ctBomb(bot, it);
  return hunt(bot, it);
}

function hunt(bot, it) {
  const K = bot.K;
  const goal = bot.p.team === TEAM_T ? K.ctSpawn : K.tSpawn;
  it.move = goal;
  it.tol = 120;
  bot.watchDanger(it);
}

// ---------------------------------------------------------------- hostage maps
function ctHostage(bot, it) {
  const g = bot.game, H = g.hostages, p = bot.p, K = bot.K;
  const feet = p.feet();
  const mine = H.list.filter((h) => h.alive && !h.rescued && h.leader === p);
  if (mine.length) {
    // escort: wait for a hostage that falls behind, else head for the rescue point
    let lag = null, ld = 0;
    for (const h of mine) { const d = dist3(h.feet(), feet); if (d > ld) { ld = d; lag = h; } }
    if (ld > 360) {
      it.move = lag.feet(); it.tol = 90;
      bot.mode = 'escort';
      bot.watchDanger(it);
      return;
    }
    if (ld > 220) {
      it.look = eyeAt(lag.feet());
      bot.mode = 'escort-wait';
      return;
    }
    let rp = null, rd = Infinity;
    for (const q of K.rescuePoints) { const d = dist3(q, feet); if (d < rd) { rd = d; rp = q; } }
    if (rp) { it.move = rp; it.tol = 40; }
    bot.mode = 'escort';
    bot.watchDanger(it);
    return;
  }
  // claim a hostage nobody is leading (spread over the CT bots)
  let tgt = bot.hostTarget;
  if (tgt && (!tgt.alive || tgt.rescued || (tgt.leader && tgt.leader !== p))) tgt = bot.hostTarget = null;
  if (!tgt) {
    const free = H.list.filter((h) => h.alive && !h.rescued && !h.leader);
    if (free.length) {
      const claims = new Map();
      for (const b of bot.mgr.bots) if (b !== bot && b.p.alive && b.hostTarget) claims.set(b.hostTarget, (claims.get(b.hostTarget) || 0) + 1);
      free.sort((a, b) => (claims.get(a) || 0) - (claims.get(b) || 0) || dist3(a.feet(), feet) - dist3(b.feet(), feet));
      tgt = bot.hostTarget = free[0];
    }
  }
  if (tgt) {
    const hc = [tgt.pm.origin[0], tgt.pm.origin[1], tgt.pm.origin[2] + 10];
    const eye = p.eyePos();
    const d = dist3(eye, hc);
    if (d < 70 && bot.los(eye, hc)) {
      it.look = hc;
      it.stop = true;
      // press use once facing it (the press is an edge: release in between)
      bot.usePulse = !bot.usePulse;
      if (bot.usePulse) it.use = true;
      bot.mode = 'use-hostage';
      return;
    }
    it.move = tgt.feet();
    it.tol = 36;
    bot.mode = 'to-hostage';
    bot.watchDanger(it);
    return;
  }
  // every hostage is taken: cover the others / hunt Ts around the hostage area
  const led = H.list.find((h) => h.alive && !h.rescued && h.leader && h.leader !== p);
  if (led) {
    const lf = led.leader.feet();
    if (dist3(lf, feet) > 260) { it.move = lf; it.tol = 160; }
    bot.mode = 'cover';
    bot.watchDanger(it);
    return;
  }
  const spot = K.tHolds.length ? K.tHolds[bot.p.id % K.tHolds.length].pos : K.tSpawn;
  it.move = spot; it.tol = 100;
  bot.watchDanger(it);
}

function tHostage(bot, it) {
  const g = bot.game, H = g.hostages, p = bot.p;
  const feet = p.feet();
  // a hostage is being led away: the closest Ts go after it
  const led = H.list.filter((h) => h.alive && !h.rescued && h.leader);
  if (led.length) {
    let best = null, bd = Infinity;
    for (const h of led) { const d = dist3(h.feet(), feet); if (d < bd) { bd = d; best = h; } }
    const chasers = bot.mgr.alive(TEAM_T).sort((a, b) => dist3(a.p.feet(), best.feet()) - dist3(b.p.feet(), best.feet())).slice(0, 2);
    if (chasers.includes(bot) && bd < 2600) {
      it.move = best.leader?.alive ? best.leader.feet() : best.feet();
      it.tol = 100;
      bot.mode = 'intercept';
      bot.watchDanger(it);
      return;
    }
  }
  const t = bot.gTask;
  if (t?.spot) { bot.hold(it, t.spot, { quiet: true }); return; }
  // no spot: stay with the hostages
  const K = bot.K;
  const hs = K.hostageSpots[p.id % Math.max(1, K.hostageSpots.length)];
  if (hs) bot.hold(it, { pos: hs, watch: [eyeAt(K.ctSpawn)], n: 'hostage' }, { quiet: true });
}

// ---------------------------------------------------------------- bomb maps
function nearestSite(K, pos) {
  let best = null, bd = Infinity;
  for (const s of Object.values(K.sites)) { const d = dist3(s.center, pos); if (d < bd) { bd = d; best = s; } }
  return best;
}

function tBomb(bot, it) {
  const g = bot.game, R = g.rounds, p = bot.p, K = bot.K;
  const bomb = R.bomb && !R.bomb.exploded && !R.bomb.defused ? R.bomb : null;
  if (bomb) {
    const spot = bot.postSpot || (bot.postSpot = { pos: bot.K.slots(bot.K.snap(bomb.pos), 6)[p.id % 6] || bomb.pos, watch: [eyeAt(K.ctSpawn)], n: 'post' });
    bot.hold(it, spot, { quiet: true });
    return;
  }
  const dropped = g.dropped.find((d) => d.weapon?.id === 'c4');
  if (dropped && !R.bombCarrier) {
    const near = bot.mgr.alive(TEAM_T).sort((a, b) => dist3(a.p.pm.origin, dropped.pos) - dist3(b.p.pm.origin, dropped.pos))[0];
    if (near === bot) { it.move = dropped.pos.slice(); it.tol = 4; bot.watchDanger(it); return; }
  }
  const carrier = R.bombCarrier;
  const site = bot.gSite || (bot.gSite = nearestSite(K, carrier ? carrier.pm.origin : K.tSpawn)?.name);
  if (!site) return hunt(bot, it);
  if (p.weapons[5]) { bot.goSite(it, site); return; }
  bot.goSite(it, site);
}

function ctBomb(bot, it) {
  const g = bot.game, R = g.rounds, p = bot.p, K = bot.K;
  const bomb = R.bomb && !R.bomb.exploded && !R.bomb.defused ? R.bomb : null;
  if (bomb) {
    const d = dist3(p.pm.origin, bomb.pos);
    if (d < 60 && !(bot.target && bot.targetVisible)) {
      it.use = true; it.duck = true; it.stop = true;
      it.look = [bomb.pos[0], bomb.pos[1], bomb.pos[2]];
      bot.mode = 'defuse';
      return;
    }
    it.move = [bomb.pos[0], bomb.pos[1], bomb.pos[2]];
    it.tol = 30;
    bot.watchDanger(it);
    return;
  }
  const site = K.sites[bot.gTask?.site] || Object.values(K.sites)[0];
  if (!site) return hunt(bot, it);
  const spots = K.postPlant[site.name] || [];
  const spot = spots[p.id % Math.max(1, spots.length)] || { pos: site.center, watch: [eyeAt(K.tSpawn)], n: 'site' };
  bot.hold(it, { pos: spot.pos, watch: [eyeAt(K.tSpawn)], n: spot.n }, { quiet: true });
}
