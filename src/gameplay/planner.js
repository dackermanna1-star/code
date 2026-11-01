// Daily-life planner for NPCs. Chooses goals from the schedule, personality, needs and
// relationships, reserves furniture spots, and runs goal behaviour each tick. Guards hold posts,
// patrol and answer dispatches from the rules system; staff keep their stations.
import { ACTIVITIES } from './activities.js';
import { GUARD_POSTS, PATROLS } from '../world/layout.js';
import { yawTo, angleDiff } from '../core/mathutil.js';

const FREE_PLACES = [
  { room: 'gym', interest: 'fitness', acts: ['benchPress', 'squat', 'pullup', 'punchBag', 'treadmill', 'situps'] },
  { room: 'library', interest: 'reading', acts: ['read', 'chess', 'browse'] },
  { room: 'rec', interest: 'games', acts: ['watchTV', 'pool', 'cards', 'pingPong'] },
  { room: 'rec', interest: 'social', acts: ['cards', 'watchTV'] },
  { room: 'showers', interest: 'social', acts: ['shower'] },
  { room: 'blockA', interest: 'social', acts: ['hangout', 'phone'] },
  { room: 'blockB', interest: 'social', acts: ['hangout', 'phone'] },
  { room: 'hall', interest: 'mischief', acts: [] },
];
const YARD_ACTS = ['hoops', 'benchPress', 'pullup', 'hangout', 'rest'];
const JOB_ACTS = { laundry: ['laundry', 'fold'], kitchen: ['cook', 'prep', 'washDishes', 'serve'], workshop: ['stamp', 'tinker'], library: ['shelve', 'read'], janitor: [] };
const CHAT_LINES = [
  ['You hear the soup today was "beef"?', 'Quotation marks don\'t lie, man.'],
  ['My lawyer says six more weeks.', 'Your lawyer said that six weeks ago.'],
  ['Who keeps stealing the good mop?', 'The good mop chooses its own path.'],
  ['I\'m writing a novel about this place.', 'Make me taller in it.'],
  ['Heard the Warden collects snow globes.', 'That explains so much.'],
  ['Yard\'s open later. You lifting?', 'Every day. Iron is patient.'],
  ['Pudding cup for two ramen?', 'Pudding is priceless. Three.'],
  ['Dooley fell asleep at the desk again.', 'Man works harder at napping than at guarding.'],
  ['You see the new fish?', 'Keep an eye on that one.'],
  ['Kitchen Kings raised prices on hot sauce.', 'Inflation hits us all.'],
  ['I miss real coffee.', 'This IS real coffee. Legally.'],
  ['Laundry\'s got a rat named Gerald.', 'Gerald runs that room, honestly.'],
];

export class Planner {
  constructor(sim, rules = null) {
    this.sim = sim;
    this.rules = rules;
  }
  get clock() { return this.sim.clock; }

  // ------------------------------------------------------------------ thinking
  think(brain) {
    const c = brain.c, sim = this.sim;
    if (c.state === 'talk' || c.flags.escorted) return;
    const g = brain.goal;
    const period = this.clock.period.id;
    // Goals expire when their period ends or they finish.
    if (g && (g.period && g.period !== period && !g.keepAcrossPeriods)) this.endGoal(brain);
    if (brain.goal && brain.goal.done) this.endGoal(brain);
    if (brain.goal) return;
    if (c.kind === 'guard') return this._guardGoal(brain, period);
    if (c.kind === 'staff') return this._staffGoal(brain, period);
    this._inmateGoal(brain, period);
    void sim;
  }
  endGoal(brain) {
    const g = brain.goal;
    if (!g) return;
    if (g.spot && g.spot.reservedBy === brain.c) g.spot.reservedBy = null;
    if (brain.c.spot && brain.c.state === 'spot' && g.type === 'useSpot') brain.c.leaveSpot();
    if (g.partner && g.partner.flags.chatWith === brain.c) g.partner.flags.chatWith = null;
    brain.c.flags.chatWith = null;
    brain.goal = null;
  }
  _setGoal(brain, goal) {
    brain.goal = { t: 0, period: this.clock.period.id, ...goal };
    if (brain.snapNext) {
      brain.snapNext = false;
      const c = brain.c, g = brain.goal;
      if (g.spot) c.place(g.spot.ax, g.spot.az);
      else if (g.room) { const pt = this.sim.world.randomPointIn(g.room, brain.rng, c); if (pt) c.place(pt[0], pt[1]); }
      else if (g.x != null) c.place(g.x, g.z);
    }
    return brain.goal;
  }

  _inmateGoal(brain, period) {
    const c = brain.c, rng = brain.rng, sim = this.sim;
    const tr = c.def.traits || {}, ints = c.def.interests || {};
    if (c.flags.solitaryUntil) return this._setGoal(brain, { type: 'idleIn', room: c.flags.solitaryCell, keepAcrossPeriods: true });
    if (period === 'lightsout' || period === 'lockup') return this._goBed(brain, period === 'lightsout');
    if (period === 'wake') {
      if (rng.chance(0.5)) { const s = this._findSpot(c, ['wash', 'toilet', 'write'], c.cell); if (s) return this._useSpot(brain, s, rng.range(2, 6)); }
      return this._setGoal(brain, { type: 'idleIn', room: c.cell, until: this.clock.total + rng.range(5, 15) });
    }
    if (period === 'breakfast' || period === 'lunch' || period === 'dinner') {
      if (c.hunger < 85 && !c.flags.ateThisMeal) {
        const seat = this._findSpot(c, ['eat'], 'mess');
        if (seat) { c.flags.ateThisMeal = period; return this._useSpot(brain, seat, rng.range(10, 18), { meal: true }); }
      }
      return this._setGoal(brain, { type: 'idleIn', room: rng.chance(0.6) ? 'mess' : 'hall', until: this.clock.total + rng.range(8, 20) });
    }
    if (c.flags.ateThisMeal && !['breakfast', 'lunch', 'dinner'].includes(period)) c.flags.ateThisMeal = null;
    if (period === 'work' && c.def.job && JOB_ACTS[c.def.job]) {
      const acts = JOB_ACTS[c.def.job];
      if (c.def.job === 'janitor') return this._setGoal(brain, { type: 'mopRound', room: rng.pick(['hall', 'mess', 'blockA', 'blockB']), until: this.clock.total + 40 });
      const s = this._findSpot(c, acts, null, true);
      if (s) return this._useSpot(brain, s, rng.range(30, 90), { job: c.def.job });
    }
    // Social urge: chat with a friend nearby
    if (rng.chance(0.25 + (tr.sociability || 0.5) * 0.25)) {
      const friend = this._pickChatPartner(c);
      if (friend) return this._startChat(brain, friend);
    }
    // Bullies hassle people
    if (c.def.bully && rng.chance(0.18)) {
      const mark = this._pickMark(c);
      if (mark) return this._setGoal(brain, { type: 'hassle', target: mark, until: this.clock.total + 30 });
    }
    if (period === 'yard' && rng.chance(0.75)) {
      const s = this._findSpot(c, YARD_ACTS, 'yard');
      if (s) return this._useSpot(brain, s, rng.range(10, 30));
      return this._setGoal(brain, { type: 'idleIn', room: 'yard', until: this.clock.total + rng.range(10, 30) });
    }
    // Free / rec / unemployed work time: weighted by interests
    const place = rng.weighted(FREE_PLACES, (p) => (ints[p.interest] || 0.4) + (p.room === 'blockA' && c.cell?.startsWith('A') ? 0.5 : 0) + (p.room === 'blockB' && c.cell?.startsWith('B') ? 0.5 : 0));
    if (place.acts.length && rng.chance(0.8)) {
      const s = this._findSpot(c, place.acts, place.room);
      if (s) return this._useSpot(brain, s, rng.range(...(ACTIVITIES[s.activity]?.minutes || [8, 20])));
    }
    return this._setGoal(brain, { type: 'idleIn', room: place.room, until: this.clock.total + rng.range(8, 25) });
  }
  _goBed(brain, sleep) {
    const c = brain.c;
    const bed = c.bed;
    if (bed && (!bed.occupant || bed.occupant === c)) return this._useSpot(brain, bed, sleep ? 600 : 90, { keepAcrossPeriods: true, bed: true, sleep });
    return this._setGoal(brain, { type: 'idleIn', room: c.cell || 'blockA', until: this.clock.total + 30 });
  }
  _guardGoal(brain, period) {
    const c = brain.c, rng = brain.rng;
    const post = c.def.post;
    if (c.flags.dispatch) return; // rules system controls
    if (post === 'tower') {
      const tower = this.sim.world.spots.find((s) => s.activity === 'towerWatch' && !s.occupant);
      if (tower) return this._useSpot(brain, tower, 240, { keepAcrossPeriods: true });
    }
    const meal = ['breakfast', 'lunch', 'dinner'].includes(period);
    let postKey = post;
    if (meal && (post === 'mess' || post === 'patrol')) postKey = 'mess';
    if ((period === 'yard' || period === 'free') && (post === 'yard')) postKey = 'yard';
    if (period === 'work' && post === 'gym') postKey = rng.chance(0.5) ? 'workshop' : 'laundry';
    if (post === 'patrol' || rng.chance(0.18)) {
      const route = period === 'yard' ? PATROLS.yardLoop : rng.pick([PATROLS.hallLoop, PATROLS.blockLoop, PATROLS.wingLoop]);
      return this._setGoal(brain, { type: 'patrol', route, idx: 0, until: this.clock.total + rng.range(20, 50) });
    }
    const P = GUARD_POSTS[postKey] || GUARD_POSTS.hallDesk;
    return this._setGoal(brain, { type: 'post', x: P.x, z: P.z, yaw: P.yaw, until: this.clock.total + rng.range(20, 60) });
  }
  _staffGoal(brain, period) {
    const c = brain.c;
    const act = c.def.role === 'warden' ? 'staffWarden' : 'staffNurse';
    const s = this.sim.world.spots.find((x) => x.activity === act);
    if (period === 'lightsout') return this._setGoal(brain, { type: 'idleIn', room: c.def.role === 'warden' ? 'warden' : 'infirmary', until: this.clock.total + 60 });
    if (s && (!s.occupant || s.occupant === c)) return this._useSpot(brain, s, 120, { keepAcrossPeriods: true });
    return this._setGoal(brain, { type: 'idleIn', room: c.def.role === 'warden' ? 'warden' : 'infirmary', until: this.clock.total + 30 });
  }

  // ------------------------------------------------------------------ helpers
  _findSpot(c, acts, room, jobOK = false) {
    let best = null, bestD = Infinity;
    const list = room ? this.sim.world.spotsByRoom.get(room) || [] : this.sim.world.spots;
    for (const s of list) {
      if (!acts.includes(s.activity) || s.staffOnly) continue;
      if (s.occupant || (s.reservedBy && s.reservedBy !== c)) continue;
      if (s.cell && s.cell !== c.cell && s.activity !== 'eat') continue;
      if (s.job && !jobOK) continue;
      const d = Math.hypot(s.ax - c.x, s.az - c.z) + Math.random() * 6;
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }
  _useSpot(brain, spot, minutes, extra = {}) {
    spot.reservedBy = brain.c;
    return this._setGoal(brain, { type: 'useSpot', spot, minutes, ...extra });
  }
  _pickChatPartner(c) {
    const social = this.sim.social;
    let best = null, bestScore = 0;
    for (const o of this.sim.characters) {
      if (o === c || o.isPlayer || o.kind !== 'inmate' || o.busy || o.flags.chatWith) continue;
      const d = Math.hypot(o.x - c.x, o.z - c.z);
      if (d > 12) continue;
      const op = social ? social.opinionOf(c, o) : 0;
      const sc = op + (c.def.crew && c.def.crew === o.def.crew ? 40 : 0) - d * 2 + Math.random() * 20;
      if (sc > bestScore) { bestScore = sc; best = o; }
    }
    return best;
  }
  _pickMark(c) {
    let best = null, bestScore = -Infinity;
    for (const o of this.sim.characters) {
      if (o === c || o.kind !== 'inmate' || o.isDown || o.busy && !o.isPlayer) continue;
      const d = Math.hypot(o.x - c.x, o.z - c.z);
      if (d > 15) continue;
      const weak = (c.stats.str - o.stats.str) + (o.isPlayer ? 25 : 0) - (o.respect || 0) * 0.5 - d;
      if (weak > bestScore) { bestScore = weak; best = o; }
    }
    return bestScore > 0 ? best : null;
  }
  _startChat(brain, partner) {
    const pb = this.sim.brainOf(partner);
    if (!pb) return;
    this.endGoal(pb);
    const lines = brain.rng.pick(CHAT_LINES);
    brain.c.flags.chatWith = partner; partner.flags.chatWith = brain.c;
    this._setGoal(brain, { type: 'chat', partner, lead: true, lines, line: 0, nextLine: 0 });
    pb.goal = { t: 0, period: this.clock.period.id, type: 'chat', partner: brain.c, lead: false };
  }

  // ------------------------------------------------------------------ execution
  tick(brain, dt) {
    const g = brain.goal, c = brain.c, sim = this.sim;
    if (!g) { c.stop(); return; }
    g.t += dt;
    const now = this.clock.total;
    switch (g.type) {
      case 'useSpot': {
        const s = g.spot;
        if (c.spot === s) {
          if (c.spotPhase === 'use') {
            g.started = g.started ?? now;
            if (now - g.started > g.minutes && !g.sleep) { c.leaveSpot(); g.done = true; }
          }
          c.stop();
          return;
        }
        if (c.state === 'spot') { c.leaveSpot(); return; }
        if (s.occupant && s.occupant !== c) { g.done = true; return; }
        const r = brain.goTo(s.ax, s.az, { arrive: 0.3, run: this._late(g) });
        if (r === 'arrived' || Math.hypot(s.ax - c.x, s.az - c.z) < 0.45) {
          if (!sim.tryUseSpot(c, s)) g.done = true;
        } else if (r === 'failed') g.done = true;
        return;
      }
      case 'idleIn': {
        if (g.until && now > g.until) { g.done = true; return; }
        if (!g.to || (g.arrived && g.t > (g.wait || 0))) {
          const pt = sim.world.randomPointIn(g.room, brain.rng, c);
          g.to = pt; g.arrived = false; g.wait = g.t + brain.rng.range(4, 14);
          if (!pt) { g.done = true; return; }
        }
        if (!g.arrived) {
          const r = brain.goTo(g.to[0], g.to[1], { run: this._late(g) });
          if (r === 'arrived') g.arrived = true;
          else if (r === 'failed') g.to = null;
        } else { c.stop(); if (brain.rng.chance(0.004)) c.faceYaw = brain.rng.range(-3, 3); }
        return;
      }
      case 'chat': {
        const p = g.partner;
        if (!p || p.busy && p.state !== 'free' || p.flags.chatWith !== c || g.t > 40) { g.done = true; return; }
        const d = Math.hypot(p.x - c.x, p.z - c.z);
        if (d > 1.6) { if (g.lead) brain.goTo(p.x, p.z, { arrive: 1.2 }); else c.stop(); return; }
        c.stop(); c.faceYaw = yawTo(p.x - c.x, p.z - c.z);
        if (g.lead && sim.time > g.nextLine) {
          const [a, b] = g.lines;
          if (g.line === 0) { c.say(a, 3.5); c.anim.play('talk', 1.6); }
          else if (g.line === 1) { p.say(b, 3.5); p.anim.play('talk', 1.6); }
          else if (g.line === 2) { c.anim.play(brain.rng.chance(0.5) ? 'laugh' : 'shrug', 1.0); sim.social?.adjust(c, p, 3, 'chat'); sim.social?.adjust(p, c, 3, 'chat'); }
          else { g.done = true; c.faceYaw = null; const pb = sim.brainOf(p); if (pb && pb.goal && pb.goal.type === 'chat') pb.goal.done = true; }
          g.line++; g.nextLine = sim.time + 3.6;
        }
        return;
      }
      case 'hassle': {
        const t = g.target;
        if (!t || t.isDown || now > g.until) { g.done = true; return; }
        const d = Math.hypot(t.x - c.x, t.z - c.z);
        if (d > 1.8) { brain.goTo(t.x, t.z, { arrive: 1.5 }); return; }
        c.stop(); c.faceYaw = yawTo(t.x - c.x, t.z - c.z);
        if (!g.said) {
          g.said = true;
          c.say(brain.rng.pick(['Nice shoes. Shame if they got scuffed.', 'Toll\'s due. Five ramen.', 'You\'re in my light.', 'Lunch money. Now.']), 3.5, { mood: 'angry', expr: 'angry' });
          c.anim.play('threaten', 1.2);
          sim.events.emit('hassle', { c, target: t, demand: 5 });
          g.said = sim.time;
        } else if (sim.time - g.said > 6 && !t.isPlayer) {
          // NPC marks either pay up or swing
          if (brain.rng.chance((t.def.traits?.bravery ?? 0.5))) { const tb = sim.brainOf(t); tb?.startFight(c, 'standUp'); brain.startFight(t, 'bully'); }
          else { t.ramen = Math.max(0, t.ramen - 3); c.ramen += 3; t.say('Fine. Take it.', 2.5, { expr: 'sad' }); }
          g.done = true;
        } else if (sim.time - g.said > 14) g.done = true;
        return;
      }
      case 'post': {
        if (now > g.until) { g.done = true; return; }
        const r = brain.goTo(g.x, g.z, { arrive: 0.4 });
        if (r === 'arrived') { c.faceYaw = g.yaw + Math.sin(sim.time * 0.3 + c.x) * 0.8; c.stop(); }
        return;
      }
      case 'patrol': {
        if (now > g.until) { g.done = true; return; }
        const wp = g.route[g.idx % g.route.length];
        const r = brain.goTo(wp[0], wp[1], { arrive: 0.8 });
        if (r === 'arrived' || r === 'failed') { g.idx++; if (r === 'arrived') { g.pauseUntil = sim.time + brain.rng.range(1, 4); } }
        if (g.pauseUntil && sim.time < g.pauseUntil) c.stop();
        return;
      }
      case 'mopRound': {
        if (now > g.until) { g.done = true; return; }
        if (!g.to || g.arrived && g.t > g.wait) { g.to = sim.world.randomPointIn(g.room, brain.rng, c); g.arrived = false; g.wait = g.t + 8; }
        if (!g.arrived) { if (brain.goTo(g.to[0], g.to[1]) !== 'moving') { g.arrived = true; c.anim.play('mop', 6, { loop: false }); sim.jobs?.credit(c, 'janitor', 1); } }
        else c.stop();
        return;
      }
      default: brain._basicGoal(dt);
    }
  }
  _late(g) {
    const p = this.clock.period, m = this.clock.minutes < 360 ? this.clock.minutes + 1440 : this.clock.minutes;
    return m > p.end - 8 || p.id === 'lockup' || (g && g.meal && m < p.start + 20);
  }
}
export { angleDiff };
