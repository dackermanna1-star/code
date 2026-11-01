// Relationships and reputation. Opinions are directional (-100..100), seeded from crews,
// blocks and cellmates, and moved by what characters do to each other and what they witness.
import { hashString } from '../core/random.js';
import { clamp } from '../core/mathutil.js';

export class Social {
  constructor(sim) {
    this.sim = sim;
    this.op = new Map();
    this.memory = new Map();   // id -> [{t, text}]
    this.followers = new Set();
    this.grudgeT = new Map();
    const ev = sim.events;
    ev.on('hit', (e) => this._onHit(e));
    ev.on('ko', (e) => this._onKO(e));
    ev.on('grab', (e) => e.att && this.adjust(e.vic, e.att, -6, 'grabbed me'));
  }
  key(a, b) { return `${a.id}|${b.id}`; }
  base(a, b) {
    const n = ((hashString(a.id + b.id) % 21) - 10);
    let v = n;
    if (a.def.crew && a.def.crew === b.def.crew) v += 35;
    else if (a.def.crew && b.def.crew) v -= 15;
    if (a.kind === 'inmate' && b.kind === 'guard') v -= 12;
    if (a.kind === 'guard' && b.kind === 'inmate') v -= 5;
    if (a.cell && a.cell === b.cell) v += 12;
    if (a.def.bully || b.def.bully) v -= 10;
    return clamp(v, -100, 100);
  }
  opinionOf(a, b) {
    if (!a || !b || a === b) return 0;
    const k = this.key(a, b);
    if (!this.op.has(k)) this.op.set(k, this.base(a, b));
    return this.op.get(k);
  }
  adjust(a, b, delta, reason) {
    if (!a || !b || a === b) return 0;
    const v = clamp(this.opinionOf(a, b) + delta, -100, 100);
    this.op.set(this.key(a, b), v);
    if (reason && (a.isPlayer || b.isPlayer)) this.remember(a, `${reason}`);
    this.sim.events.emit('opinion', { a, b, delta, value: v, reason });
    return v;
  }
  remember(c, text) {
    if (!this.memory.has(c.id)) this.memory.set(c.id, []);
    const m = this.memory.get(c.id); m.push({ t: this.sim.clock.total, text });
    if (m.length > 12) m.shift();
  }
  /** Characters who can see the point (x,z): within radius and line of sight. */
  witnesses(x, z, radius = 11, exclude = []) {
    const out = [];
    for (const c of this.sim.characters) {
      if (exclude.includes(c) || c.state === 'ko' || (c.spot && c.spot.activity === 'sleep' && c.spotPhase === 'use')) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d > radius) continue;
      if (d > 2 && !this.sim.world.nav.sightClear(c.x, c.z, x, z)) continue;
      out.push(c);
    }
    return out;
  }
  _onHit(e) {
    const { att, vic, result } = e;
    if (!att || !vic || att === vic || result === 'dodged') return;
    const heavy = e.atk && e.atk.heavy;
    this.adjust(vic, att, heavy ? -10 : -6, 'hit me');
    if (e.atk && e.atk.thrown) return;
    // First hit of an incident: witnesses react, crews back each other up.
    const now = this.sim.time;
    const incKey = `${att.id}>${vic.id}`;
    if (this._lastInc === incKey && now - this._lastIncT < 3) return;
    this._lastInc = incKey; this._lastIncT = now;
    for (const w of this.witnesses(vic.x, vic.z, 11, [att, vic])) {
      if (w.kind !== 'inmate') continue;
      const likesVic = this.opinionOf(w, vic), likesAtt = this.opinionOf(w, att);
      this.adjust(w, att, likesVic > 20 ? -8 : -2, null);
      const brain = this.sim.brainOf(w);
      if (!brain || brain.fight || w.busy && w.state !== 'free' && w.state !== 'spot') continue;
      const loyal = (w.def.traits?.loyalty ?? 0.5);
      const crewmate = w.def.crew && w.def.crew === vic.def.crew;
      const follower = vic.isPlayer && this.followers.has(w.id);
      if ((crewmate || follower || likesVic > 55) && likesAtt < 40 && Math.random() < 0.35 + loyal * 0.55) {
        if (w.state === 'spot') w.leaveSpot(true);
        brain.startFight(att, crewmate ? 'backup' : 'defend');
        w.say(pick(['Hey! Hands off!', 'You picked the wrong one!', 'I got you!', 'Not on my watch!']), 2.5, { mood: 'angry', expr: 'angry' });
      } else if (Math.random() < 0.25 && !w.speech) {
        w.say(pick(['FIGHT!', 'Ooooh!', 'Get him!', 'Somebody call a guard... or don\'t.', 'Hit him back!']), 2, { mood: 'happy' });
      }
    }
  }
  _onKO(e) {
    const { c, by } = e;
    if (!by || by === c) return;
    this.adjust(c, by, -25, 'knocked me out');
    const strength = (c.stats.str + c.stats.tgh) / 2;
    const gain = Math.round(2 + strength / 15 + (c.respect || 0) / 20);
    by.respect = clamp((by.respect || 0) + gain, 0, 100);
    c.respect = clamp((c.respect || 0) - 3, 0, 100);
    for (const w of this.witnesses(c.x, c.z, 12, [c, by])) if (w.kind === 'inmate') this.adjust(w, by, this.opinionOf(w, c) > 30 ? -10 : 2, null);
    this.sim.events.emit('respect', { c: by, gain });
  }
  /** Grudges: NPCs who strongly dislike someone may start trouble on sight. */
  update(dt) {
    this._t = (this._t || 0) + dt;
    if (this._t < 1.0) return;
    this._t = 0;
    const p = this.sim.player;
    if (!p || p.isDown) return;
    for (const c of this.sim.characters) {
      if (c === p || c.kind !== 'inmate' || c.busy && c.state !== 'free') continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > 7) continue;
      const op = this.opinionOf(c, p);
      const aggr = c.def.traits?.aggression ?? 0.4;
      const last = this.grudgeT.get(c.id) || -999;
      if (op < -55 && aggr > 0.45 && this.sim.time - last > 60 && Math.random() < 0.08 * aggr) {
        this.grudgeT.set(c.id, this.sim.time);
        const b = this.sim.brainOf(c);
        if (b && !b.fight) { c.say(pick(['You and me. Now.', 'Remember me?', 'Payback time.', 'I\'ve been looking for you.']), 2.5, { mood: 'angry', expr: 'angry' }); b.startFight(p, 'grudge'); }
      }
    }
    // Followers trail the player
    for (const id of this.followers) {
      const f = this.sim.byId.get(id), b = f && this.sim.brainOf(f);
      if (!b || b.fight || f.busy) continue;
      if (Math.hypot(f.x - p.x, f.z - p.z) > 3.5) b.goal = { type: 'follow', t: 0, period: '*' };
    }
  }
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];
