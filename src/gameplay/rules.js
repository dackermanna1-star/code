// The rules of Gravelmouth and the people who enforce them. Guards watch (vision cone + line
// of sight), record violations, chase and arrest offenders, break up fights and dispense
// punishment: fines, extra days, confiscation or solitary confinement.
import { yawTo, angleDiff } from '../core/mathutil.js';

export const CRIMES = {
  assault: { name: 'Assault', severity: 2, heat: 30, days: 1, fine: 4 },
  assaultOfficer: { name: 'Assaulting an Officer', severity: 4, heat: 80, days: 3, fine: 10, solitary: 240 },
  contraband: { name: 'Contraband', severity: 2, heat: 20, days: 1, fine: 5, confiscate: true },
  trespass: { name: 'Trespassing', severity: 1, heat: 15, days: 0, fine: 3 },
  curfew: { name: 'Out After Lock-Up', severity: 1, heat: 15, days: 0, fine: 2, escortCell: true },
  theft: { name: 'Theft', severity: 1, heat: 12, days: 0, fine: 3 },
  vandalism: { name: 'Destroying Property', severity: 1, heat: 10, days: 0, fine: 3 },
  escape: { name: 'Escape Attempt', severity: 5, heat: 100, days: 7, fine: 0, solitary: 600 },
  bribery: { name: 'Attempted Bribery', severity: 2, heat: 25, days: 1, fine: 0 },
  resisting: { name: 'Resisting Arrest', severity: 3, heat: 50, days: 2, fine: 5, solitary: 180 },
};

export class Rules {
  constructor(sim) {
    this.sim = sim;
    this.record = new Map();     // id -> {heat, crimes:[], warrants: Set}
    this.scanT = 0;
    this.log = [];
    sim.events.on('itemBreak', (e) => { if (e.by && e.item.def.durability < 900) this._witnessed(e.by, 'vandalism', e.x, e.z); });
  }
  rec(c) { if (!this.record.has(c.id)) this.record.set(c.id, { heat: 0, crimes: [], warrants: new Set(), arrests: 0 }); return this.record.get(c.id); }
  heat(c) { return this.rec(c).heat; }
  isWanted(c) { return this.rec(c).warrants.size > 0; }

  /** Is this character allowed in this room right now? */
  allowedIn(c, room) {
    if (!room || c.isStaff) return true;
    const clk = this.sim.clock, period = clk.period.id, r = room.restricted;
    if (room.cell) {
      if (room.solitary) return c.flags.solitaryCell === room.id;
      if (!clk.cellsOpen) return room.id === c.cell;
      return true;
    }
    if (!clk.cellsOpen && !c.flags.solitaryCell && room.id !== c.cell) return room.id === 'infirmary' && c.flags.inInfirmary;
    if (!r) return true;
    if (r === 'staff' || r === 'always') return false;
    if (r === 'office') return clk.minutes >= 8 * 60 && clk.minutes < 16 * 60;
    const job = c.job ?? c.def.job;
    if (r === 'kitchen') return job === 'kitchen' && ['work', 'breakfast', 'lunch', 'dinner'].includes(period);
    if (r === 'workshop') return job === 'workshop' && period === 'work';
    if (r === 'yard') return clk.yardOpen || clk.minutes < 17 * 60 + 45 && clk.minutes >= 12 * 60 + 30;
    if (r === 'escape') return false;
    return true;
  }

  update(dt) {
    for (const r of this.record.values()) r.heat = Math.max(0, r.heat - dt * 0.05);
    this.scanT -= dt;
    if (this.scanT > 0) return;
    this.scanT = 0.3;
    const guards = this.sim.characters.filter((c) => c.kind === 'guard' && c.state !== 'ko' && !c.isDown);
    for (const g of guards) this._scan(g);
    this._tickDispatch(dt * 0 + 0.3);
  }
  _canSee(g, o, range = 15) {
    const d = Math.hypot(o.x - g.x, o.z - g.z);
    if (d > (g.def.role === 'tower' ? 45 : range)) return false;
    if (d > 2.2 && Math.abs(angleDiff(g.yaw, yawTo(o.x - g.x, o.z - g.z))) > 1.05) return false;
    if (g.def.role === 'tower') return true;
    return this.sim.world.nav.sightClear(g.x, g.z, o.x, o.z);
  }
  _scan(g) {
    for (const o of this.sim.characters) {
      if (o === g || o.kind !== 'inmate' || o.state === 'ko') continue;
      if (!this._canSee(g, o)) continue;
      // Fighting: the aggressor (or both) are guilty of assault.
      if (o.act && o.act.type === 'attack' && o.act.target && o.act.target !== o) this.report(o, o.act.target.kind === 'guard' ? 'assaultOfficer' : 'assault', g);
      else if (o.state === 'grapple') this.report(o, 'assault', g);
      if (o.held && o.held.def.contraband) this.report(o, 'contraband', g);
      const room = this.sim.world.roomAt(o.x, o.z);
      if (room && !this.allowedIn(o, room)) this.report(o, room.restricted === 'escape' || room.id === 'noman' ? 'escape' : !this.sim.clock.cellsOpen ? 'curfew' : 'trespass', g);
    }
  }
  _witnessed(c, crime, x, z) {
    for (const g of this.sim.characters) if (g.kind === 'guard' && this._canSee(g, c, 14)) { this.report(c, crime, g); return; }
  }
  report(c, crime, witness) {
    const r = this.rec(c);
    const def = CRIMES[crime];
    if (r.warrants.has(crime) && this.sim.time - (r.lastSeen || 0) < 5) { r.lastSeen = this.sim.time; return; }
    r.warrants.add(crime); r.lastSeen = this.sim.time;
    r.heat = Math.min(100, r.heat + def.heat);
    r.crimes.push({ crime, t: this.sim.clock.total, by: witness ? witness.id : null });
    this.log.push({ who: c.id, crime, t: this.sim.clock.total });
    this.sim.events.emit('crime', { c, crime, def, witness });
    this._dispatch(c, witness);
  }
  _dispatch(c, witness) {
    // The witness (or the nearest free guard) comes for the offender.
    let g = witness;
    if (!g || g.flags.dispatch || g.isDown) {
      let best = null, bd = Infinity;
      for (const o of this.sim.characters) if (o.kind === 'guard' && !o.flags.dispatch && !o.isDown && o.def.role !== 'tower') { const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < bd) { bd = d; best = o; } }
      g = best;
    }
    if (!g || g.def.role === 'tower') { if (g) g.say('Officer down in the yard! I mean, inmate! Inmate in the yard!', 3); return; }
    if (g.flags.dispatch && g.flags.dispatch.target === c) return;
    const b = this.sim.brainOf(g);
    if (!b) return;
    b.endFight?.();
    this.sim.planner?.endGoal(b);
    g.flags.dispatch = { target: c, t: 0, shouted: false };
    g.say(pick(['Hey! You! Stop right there!', 'Freeze, inmate!', 'That\'s enough!', 'Break it up!']), 2.5, { mood: 'angry', expr: 'angry' });
  }
  _tickDispatch(dt) {
    for (const g of this.sim.characters) {
      const d = g.flags.dispatch;
      if (!d) continue;
      const t = d.target, b = this.sim.brainOf(g);
      d.t += dt;
      if (!t || !this.isWanted(t) || d.t > 90 || g.isDown || g.state === 'ko') { g.flags.dispatch = null; if (b) b.endFight(); continue; }
      if (t.state === 'ko' || t.state === 'down') {
        // Offender is down: cuff them.
        if (Math.hypot(t.x - g.x, t.z - g.z) < 2) this.arrest(t, g, 'subdued');
        continue;
      }
      if (b && b.fight && b.fight.target === t) continue; // already fighting (resisting)
    }
  }
  /** Called every tick for dispatched guards by the planner hook. */
  tickGuard(brain, dt) {
    const g = brain.c, d = g.flags.dispatch;
    if (!d) return false;
    const t = d.target;
    if (!t) return false;
    const dist = Math.hypot(t.x - g.x, t.z - g.z);
    if (brain.fight) return false; // combat micro takes over
    if (dist > 1.7) { brain.goTo(t.x, t.z, { run: true, arrive: 1.4 }); return true; }
    g.stop(); g.faceYaw = yawTo(t.x - g.x, t.z - g.z);
    // Separate fighters
    if (t.act && t.act.type === 'attack') { brain.startFight(t, 'subdue'); return true; }
    if (t.isPlayer) { if (!d.confronted) { d.confronted = true; this.sim.events.emit('arrestConfront', { guard: g, c: t }); } }
    else if (!d.confronted) {
      d.confronted = true;
      const brave = t.def.traits?.bravery ?? 0.5, aggr = t.def.traits?.aggression ?? 0.5;
      if (Math.random() < aggr * brave * 0.5) { this.sim.brainOf(t)?.startFight(g, 'resist'); brain.startFight(t, 'subdue'); this.report(t, 'resisting', g); }
      else this.arrest(t, g, 'comply');
    }
    return true;
  }
  /** Apply punishment and clear warrants. */
  arrest(c, guard, how) {
    const r = this.rec(c);
    const crimes = [...r.warrants].map((k) => CRIMES[k]);
    if (!crimes.length) return null;
    let days = 0, fine = 0, solitary = 0, confiscate = false, escortCell = false;
    for (const k of crimes) { days += k.days; fine += k.fine; solitary = Math.max(solitary, k.solitary || 0); confiscate = confiscate || !!k.confiscate; escortCell = escortCell || !!k.escortCell; }
    if (how === 'resisted' || how === 'subdued' && r.warrants.has('resisting')) { days += 1; solitary = Math.max(solitary, 120); }
    if (r.arrests >= 2) days += 1;
    r.arrests++;
    const result = { crimes: [...r.warrants], days, fine: Math.min(fine, c.ramen), solitary, confiscated: [] };
    c.ramen -= result.fine;
    if (confiscate || true) {
      if (c.held && c.held.def.contraband) { result.confiscated.push(c.held.def.name); const it = c.held; c.held = null; this.sim.items.remove(it); }
      for (const it of [...c.pockets]) if (it.def.contraband) { result.confiscated.push(it.def.name); c.pockets.splice(c.pockets.indexOf(it), 1); this.sim.items.remove(it); }
    }
    r.warrants.clear(); r.heat = Math.max(0, r.heat - 30);
    if (guard) { guard.flags.dispatch = null; this.sim.brainOf(guard)?.endFight(); }
    this.sim.events.emit('punished', { c, guard, result, how });
    if (solitary > 0) this.sendToSolitary(c, solitary);
    else if (escortCell && c.cell) this.sim.teleportToSpot?.(c, c.bed);
    return result;
  }
  sendToSolitary(c, minutes) {
    const cells = this.sim.world.rooms.filter((r) => r.solitary);
    const used = new Set(this.sim.characters.filter((x) => x.flags.solitaryCell).map((x) => x.flags.solitaryCell));
    const room = cells.find((r) => !used.has(r.id)) || cells[0];
    c.flags.solitaryCell = room.id;
    c.flags.solitaryUntil = this.sim.clock.total + minutes;
    const door = this.sim.world.doorById.get(room.doorId);
    if (door) { door.locked = true; door.amount = 0; }
    if (c.spot) c.leaveSpot(true);
    if (c.grapple) c.endGrapple('broken');
    const cot = this.sim.world.spots.find((s) => s.cell === room.id && s.activity === 'sleep');
    c.place(cot ? cot.ax : (room.rect[0] + room.rect[2]) / 2, cot ? cot.az : room.rect[1] + 2);
    if (c.state !== 'ko') c.setState('free');
    this.sim.events.emit('solitary', { c, room, minutes });
  }
  lateUpdate() {
    const now = this.sim.clock.total;
    for (const c of this.sim.characters) {
      if (c.flags.solitaryUntil && now >= c.flags.solitaryUntil) {
        const room = this.sim.world.roomById.get(c.flags.solitaryCell);
        const door = room && this.sim.world.doorById.get(room.doorId);
        if (door) door.locked = false;
        c.flags.solitaryCell = null; c.flags.solitaryUntil = 0;
        this.sim.teleportToSpot?.(c, c.bed);
        this.sim.events.emit('released', { c });
      }
    }
  }
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];
