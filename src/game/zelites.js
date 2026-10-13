// Zombie survival elites (Milestone 3.4, owner: bosses): on odd waves from diff.boss.elitesFrom
// (never a boss wave, nor a Twin Elites wave), with the odds diff.boss.eliteChance, one named
// elite joins the wave a few seconds in, from one of its fronts:
//  - THE ALPHA HUNTER: a bigger, tougher hunter that comes with a pack of sprinters and
//    pounces again almost as soon as it's off you.
//  - THE JUGGERNAUT CHARGER: a charger that ploughs through the whole squad instead of stopping
//    at the first it hits - and that stays stunned a long while after it runs into a wall.
// Each has diff.boss.eliteHp x its kind's health, a banner and a howl when it shows up, a
// name plate over it (bossstage.js) and a bar under the boss bar (hudInfo().elites, which also
// lists the Twin Elites wave type's). One down drops a health vial (pickups.js 'health').
// They're specials with z.elite set (Specials.spawn(kind, { elite: ELITES row }) ->
// director.elite -> make); their tricks stay specials.js's, nudged each tick from here.
// Events: 'elite' { phase: 'spawn' | 'death', kind, zombie, name }.
import { rng } from './zrng.js';
import { THREAT_RGB } from './zthreats.js';

const rand = (a, b) => a + Math.random() * (b - a);

/** The named elites: their special kind, name (banner / bar), short (name plate), sub (banner line), colour, size, x claw damage, x speed. */
export const ELITES = {
  alpha: { id: 'alpha', kind: 'hunter', name: 'THE ALPHA HUNTER', short: 'Alpha Hunter', sub: 'It hunts with a pack - and pounces again and again', rgb: [255, 200, 70], scale: 1.22, dmg: 1.25, speed: 1.08, pack: 2, pounce: 1.4 },
  juggernaut: { id: 'juggernaut', kind: 'charger', name: 'THE JUGGERNAUT', short: 'Juggernaut', sub: 'It ploughs through all of you. Make it hit a wall.', rgb: [255, 110, 50], scale: 1.3, dmg: 1.3, speed: 1.04, charge: 4.5, stun: 3.2 },
};
const ORDER = ['alpha', 'juggernaut'];
const byAt = (a, b) => a.at - b.at;

export class ZElites {
  constructor(game, bosses) {
    this.game = game;
    this.bosses = bosses;
    this.list = []; // elites up (named and Twin Elites), soonest first
    this.packs = []; // [{ at, pos }] sprinters to bring in beside an Alpha Hunter
    this.rnd = Math.random;
    this.subscribed = false;
    Promise.resolve().then(() => this.subscribe()); // (built before game.zombies is set)
  }

  get Z() { return this.game.zombies; }

  subscribe() {
    const ev = this.game.zombies?.events;
    if (this.subscribed || !ev) return;
    this.subscribed = true;
    ev.on('run', (e) => { if (e.phase === 'start') { this.clear(); this.rnd = rng(this.Z.seed >>> 0, 'elites'); } });
    ev.on('wave', (e) => { if (e.phase === 'start') this.plan(e.wave, e.mod); });
    ev.on('special', (e) => { if (e.phase === 'death' && e.zombie?.elite) this.died(e.zombie); });
  }

  clear() { this.list.length = 0; this.packs.length = 0; }

  /** Wave n starts (its type mod): an odd wave from elitesFrom, at eliteChance, queues one named elite. */
  plan(n, mod) {
    const Z = this.Z, D = Z.diff.boss;
    if (!Z.enabled || n % 2 === 0 || n % 5 === 0 || mod === 'elites' || n < D.elitesFrom) return;
    if (this.rnd() >= D.eliteChance) return;
    const row = ELITES[ORDER[Math.floor(this.rnd() * ORDER.length)]];
    const open = Z.director.open;
    const front = open.length ? open[Math.floor(this.rnd() * open.length)].id : null;
    Z.director.queue(row.kind, { front, at: this.game.time + rand(8, 14), elite: row });
  }

  /** Specials.spawn -> director.elite with a named row: make z that elite. Returns true. */
  make(z, def, row) {
    const g = this.game, Z = this.Z, t = g.time;
    z.health = z.maxHealth = Math.round(z.maxHealth * Z.diff.boss.eliteHp);
    z.zDamage = Math.round(z.zDamage * row.dmg);
    z.zSpeed *= row.speed;
    z.name = row.short;
    z.eliteRow = row;
    z.model.object3D.scale.multiplyScalar(row.scale);
    this.list.push(z);
    if (row.pack) this.packs.push({ at: t + 0.8, pos: z.pm.origin.slice(), n: row.pack });
    g.sound?.play('elite_spawn', { pos: z.eyePos(), volume: 1 });
    g.announce?.(row.short);
    this.bosses.stage.show('elite', row.name, row.sub, row.rgb, 3, 'ELITE');
    Z.events.mode('elite', { phase: 'spawn', kind: z.special || def?.kind || row.kind, zombie: z, name: row.name });
    return true;
  }

  /** A Twin Elite (director.js's wave type): only listed for the bar. */
  track(z) { if (!this.list.includes(z)) this.list.push(z); }

  died(z) {
    const g = this.game, Z = this.Z, i = this.list.indexOf(z);
    if (i >= 0) this.list.splice(i, 1);
    const row = z.eliteRow;
    z.eliteRow = null;
    if (!row) return;
    const o = z.pm.origin;
    Z.pickups?.spawn('health', [o[0], o[1], o[2] + 10], { amount: 25, vel: [rand(-40, 40), rand(-40, 40), 200] });
    g.sound?.play('elite_down', { volume: 0.8 });
    Z.events.mode('elite', { phase: 'death', kind: z.special, zombie: z, name: row.name });
  }

  /** Every tick (bosses.think): the packs come in; the elites' tricks get their edge. */
  tick(t) {
    const Z = this.Z, D = Z.director;
    // a named elite due in a calm waits it out (the calm is the squad's breathing room)
    if (D.phase === 'calm' && D.pending.length) {
      let moved = false;
      for (const q of D.pending) if (q.elite?.id && ELITES[q.elite.id] && q.at <= t + 0.02) { q.at = t + 1; moved = true; }
      if (moved) D.pending.sort(byAt);
    }
    for (let i = this.packs.length - 1; i >= 0; i--) {
      const P = this.packs[i];
      if (t < P.at) continue;
      this.packs.splice(i, 1);
      if (Z.state === 'wave') Z.specials.spawn('sprinter', { near: P.pos, extra: true, max: P.n });
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const z = this.list[i];
      if (!z.alive || !z.elite) { this.list.splice(i, 1); z.eliteRow = null; continue; } // (killed: died() saw it first; taken off the map: no drop)
      const R = z.eliteRow, S = z.sp;
      if (!R || !S) continue;
      if (R.id === 'alpha') {
        // off you, and coming again: the pounce recharges fast
        if (S.state === 'recover' && S.cd.pounce > t + R.pounce) S.cd.pounce = t + R.pounce;
      } else if (R.id === 'juggernaut') this.plough(z, R, S, t);
    }
  }

  /**
   * The Juggernaut's charge: it bowls over everyone in its way itself (ahead of specials.js, which
   * stops at the first it meets) and keeps going; into a wall it stays stunned R.stun s.
   */
  plough(z, R, S, t) {
    const g = this.game;
    if (S.state === 'charge') {
      z.eliteCharging = true;
      const o = z.pm.origin, y = S.yaw * Math.PI / 180, cy = Math.cos(y), sy = Math.sin(y);
      for (const h of this.Z.humans()) {
        if (S.hitList?.has(h)) continue;
        const ho = h.pm.origin;
        if (Math.hypot(ho[0] - o[0], ho[1] - o[1]) > 52 || Math.abs(ho[2] - o[2]) > 64) continue;
        S.hitList.add(h);
        const side = (ho[0] - o[0]) * -sy + (ho[1] - o[1]) * cy >= 0 ? 1 : -1; // (thrown off to the side it was on)
        g.damagePlayer(h, z, Math.min(40, Math.round(18 + 1.6 * this.Z.wave)), 2, 'zombie', [cy, sy, 0.3], [ho[0], ho[1], ho[2] + 10]);
        h.pm.velocity[0] = cy * 380 - sy * side * 420; h.pm.velocity[1] = sy * 380 + cy * side * 420; h.pm.velocity[2] = 300;
        h.pm.onground = false;
        g.sound?.play('charge_hit', { pos: ho, volume: 1 });
        g.shakeAt?.(ho, 12, 600);
      }
      return;
    }
    if (z.eliteCharging) {
      z.eliteCharging = false;
      if (S.state === 'recover' && S.until - t > 1.2) { S.until = t + R.stun; z.eliteStun = S.until; } // (it ran into a wall)
    }
    if (S.state === 'chase' && S.cd.charge > t + R.charge) S.cd.charge = t + R.charge;
  }

  /** The HUD's elite bars: fills out (reused entries) with the elites up; returns how many. */
  info(out) {
    const t = this.game.time;
    let n = 0;
    for (const z of this.list) {
      if (!z.alive) continue;
      const e = out[n] || (out[n] = { name: '', hp: 0, hpMax: 1, rgb: null, status: '' });
      e.name = z.eliteRow ? z.eliteRow.name : `ELITE ${String(z.name || '').replace(/^Elite /, '').toUpperCase()}`;
      e.hp = Math.max(0, z.health); e.hpMax = z.maxHealth;
      e.rgb = z.eliteRow ? z.eliteRow.rgb : THREAT_RGB[z.special] || [255, 160, 60];
      e.status = z.eliteStun > t ? 'STUNNED' : z.sp?.state === 'pin' ? 'PINNING' : '';
      n++;
    }
    out.length = n;
    return n;
  }
}
