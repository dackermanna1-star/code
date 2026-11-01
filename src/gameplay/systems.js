// Installs the prison systems into a Simulation and implements the glue between them:
// needs, activities (training, jobs, meals, sleep), instant interactions, special
// interactables (fences, staff doors), KO recovery and time skips.
import { Social } from './social.js';
import { Rules } from './rules.js';
import { Economy, VENDING } from './economy.js';
import { Progression } from './progression.js';
import { Dialogue } from './dialogue.js';
import { Planner } from './planner.js';
import { ACTIVITIES, JOBS, trainGain } from './activities.js';
import { CONFIG } from '../config.js';
import { yawTo } from '../core/mathutil.js';
import { CLIPS } from '../characters/poses.js';

export function installSystems(sim, opts = {}) {
  sim.social = new Social(sim);
  sim.rules = new Rules(sim);
  sim.economy = new Economy(sim);
  sim.jobs = sim.economy;
  sim.progression = new Progression(sim, opts.sentence || {});
  sim.dialogue = new Dialogue(sim);
  sim.planner = new Planner(sim, sim.rules);
  sim.playerWitnessed = [];
  sim.systems.push(sim.social, sim.rules, sim.progression, { update: (dt) => sim.dialogue.update(dt) }, new Needs(sim), new SleepManager(sim));

  // ------------------------------------------------------------------ door access rules
  for (const door of sim.world.doors) {
    door.authorize = (agent) => {
      if (!agent) return false;
      if (agent.isStaff) return true;
      if (agent.flags && agent.flags.escort) return true; // being walked somewhere by a guard
      const clk = sim.clock, period = clk.period.id, job = agent.job ?? agent.def?.job;
      switch (door.access) {
        case 'office': return clk.minutes >= 8 * 60 && clk.minutes < 16 * 60;
        case 'kitchen': return job === 'kitchen' && ['work', 'breakfast', 'lunch', 'dinner'].includes(period);
        case 'workshop': return job === 'workshop' && period === 'work';
        // Anyone still out in the yard is let back in when it closes.
        case 'yard': { const r = sim.world.roomAt(agent.x, agent.z); return !!r && (r.id === 'yard' || r.id === 'noman'); }
        default: return false;
      }
    };
  }

  // ------------------------------------------------------------------ spot rules
  sim.canUseSpot = (c, spot) => {
    const clk = sim.clock;
    if (spot.staffOnly && !c.isStaff) return false;
    if (spot.activity === 'sleep' && spot.cell && c.cell && spot.cell !== c.cell && !c.flags.solitaryCell) { if (c.isPlayer) sim.events.emit('notYours', { c }); return false; }
    if (spot.activity === 'getFood' && !['breakfast', 'lunch', 'dinner'].includes(clk.period.id) && !c.isStaff) { if (c.isPlayer) sim.events.emit('notNow', { c, what: 'Meals are only served at breakfast, lunch and dinner.' }); return false; }
    return true;
  };
  sim.activityStart = (c, spot) => {
    const A = ACTIVITIES[spot.activity];
    c.activityT = 0; c.activityMinutes = 0;
    if (!A) return;
    if (A.instant) { instant(sim, c, spot); return; }
    if (A.clip) c.anim.play(A.clip, undefined, { loop: true, full: false });
    if (spot.activity === 'eat' && c.isPlayer && !(c.held && c.held.def.mealItem && c.held.filled)) c.anim.stop(0.2);
    if (c.isPlayer && A.label) sim.events.emit('activity', { c, label: A.label, spot });
  };
  sim.activityTick = (c, spot, dt) => {
    const A = ACTIVITIES[spot.activity];
    if (!A || A.instant) return;
    const mins = dt * sim.clock.scale * sim.clock.boost;
    c.activityMinutes += mins;
    if (A.perMin) applyEffects(sim, c, A.perMin, mins);
    if (A.energyPerMin) c.energy = Math.max(0, c.energy - A.energyPerMin * mins);
    // NPC virtual meals
    if (spot.activity === 'eat' && !c.isPlayer) c.hunger = Math.min(100, c.hunger + mins * 3);
    // Activities without rep events still progress (once every couple of seconds)
    c.activityT += dt;
    if (!hasRep(A) && c.activityT > 2.2) { c.activityT = 0; onRep(sim, c, spot); }
  };
  sim.onAnimEvent = (c, ev) => { if (ev === 'rep' && c.spot && c.spotPhase === 'use') onRep(sim, c, c.spot); };

  sim.teleportToSpot = (c, spot) => {
    if (!spot) return;
    if (c.spot) c.leaveSpot(true);
    c.place(spot.ax, spot.az, spot.yaw);
    if (c.state !== 'ko') c.setState('free');
    sim.events.emit('teleport', { c, x: spot.ax, z: spot.az });
  };
  /** Jump the clock forward; NPCs snap to where their routine would have taken them. */
  sim.timeSkip = (minutes) => {
    sim.clock.total += minutes;
    for (const c of sim.characters) {
      if (c.isPlayer) continue;
      const b = sim.brainOf(c);
      if (!b) continue;
      if (b.fight) b.endFight();
      sim.planner.endGoal(b);
      b.snapNext = true;
      c.hunger = Math.max(20, c.hunger - minutes * CONFIG.needs.hungerPerHour / 60 * 0.5);
      if (c.state === 'ko') { c.koUntil = Math.min(c.koUntil, sim.clock.total); }
    }
    sim.events.emit('timeSkip', { minutes });
  };
  // Special interactables: cuttable fences, staff doors (keycard)
  sim.specialInteractables = (p) => {
    const out = [];
    const tool = p.held && p.held.def.tool;
    if (tool === 'cut') for (const f of sim.world.fences) {
      if (!f.cut || f.cutState) continue;
      const x = (f.a[0] + f.b[0]) / 2, z = (f.a[1] + f.b[1]) / 2;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < 2.6) out.push({ kind: 'special', label: 'Cut through the fence', d, x, z, pri: 0.5, ref: f, action: (c) => cutFence(sim, c, f) });
    }
    const hasCard = p.held?.def.tool === 'staffAccess' || p.pockets.some((i) => i.def.tool === 'staffAccess');
    if (hasCard) for (const door of sim.world.doors) {
      if (door.style === 'cell' || door.scheduledOpen || door.isOpen) continue;
      const [x, z] = door.center();
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < 2.2) out.push({ kind: 'special', label: 'Swipe keycard', d, x, z, pri: 0.4, ref: door, action: () => { door.holdOpen = 6; door.target = 1; sim.events.emit('keycard', { c: p, door }); } });
    }
    return out;
  };
  // Player KO -> wake up in the infirmary
  sim.events.on('ko', (e) => {
    if (!e.c.isPlayer) return;
    e.c.flags.holdKO = true;
    setTimeoutSim(sim, 3.0, () => {
      sim.timeSkip(150);
      const beds = sim.world.spots.filter((s) => s.activity === 'heal' && !s.occupant);
      const bed = beds[0];
      const p = sim.player;
      p.flags.holdKO = false;
      p.hp = Math.max(p.hp, p.maxHp * 0.55);
      if (sim.rules.isWanted(p)) sim.rules.arrest(p, null, 'subdued');
      if (bed) { p.anim.setPosture(null); p.setState('free'); p.place(bed.ax, bed.az); }
      p.koUntil = 0; p.getUp();
      sim.events.emit('wokeInfirmary', { c: p });
    });
  });
  // What the player sees (for snitching)
  sim.events.on('hit', (e) => {
    const p = sim.player;
    if (!p || !e.att || e.att === p || e.vic === p || !e.att.kind || e.att.kind !== 'inmate') return;
    if (Math.hypot(e.att.x - p.x, e.att.z - p.z) < 12) sim.playerWitnessed.push({ c: e.att, crime: 'assault', t: sim.clock.total });
  });
  sim.timers = [];
  sim.systems.push({ update: (dt) => { for (const t of [...sim.timers]) { t.t -= dt; if (t.t <= 0) { sim.timers.splice(sim.timers.indexOf(t), 1); t.fn(); } } } });
  // Daily refresh: reset meal flags, respawn some items
  sim.events.on('clock', (ev) => {
    if (ev.type === 'period') for (const c of sim.characters) c.flags.ateThisMeal = null;
    if (ev.type === 'day') respawnItems(sim);
  });
}

function setTimeoutSim(sim, seconds, fn) { sim.timers.push({ t: seconds, fn }); }
/** True when the activity's animation emits 'rep' events (otherwise reps run on a timer). */
function hasRep(A) {
  const clipRep = A.clip && CLIPS[A.clip] && CLIPS[A.clip].events.rep != null;
  const postureRep = A.posture && CLIPS[A.posture] && CLIPS[A.posture].events.rep != null;
  return !!(clipRep || postureRep);
}

function applyEffects(sim, c, fx, mult) {
  for (const [k, v] of Object.entries(fx)) {
    const amount = v * mult;
    if (k === 'energy') c.energy = Math.min(100, c.energy + amount);
    else if (k === 'hp') c.hp = Math.min(c.maxHp, c.hp + amount);
    else if (k === 'hunger') c.hunger = Math.min(100, c.hunger + amount);
    else if (k === 'morale') c.morale = Math.min(100, (c.morale ?? 60) + amount);
    else if (['str', 'agi', 'tgh', 'smt'].includes(k)) {
      const g = trainGain(c.stats[k], amount, c.energy);
      const before = Math.floor(c.stats[k]);
      c.stats[k] = Math.min(100, c.stats[k] + g);
      if (c.isPlayer && Math.floor(c.stats[k]) > before) sim.events.emit('statGain', { c, stat: k, value: Math.floor(c.stats[k]) });
    }
  }
}
function onRep(sim, c, spot) {
  const A = ACTIVITIES[spot.activity];
  if (!A) return;
  if (A.perRep) {
    if (spot.activity === 'eat') {
      if (c.isPlayer) { const t = c.held; if (t && t.def.mealItem && t.filled) { c.hunger = Math.min(100, c.hunger + 6); t.bites = (t.bites || 0) + 1; if (t.bites >= 6) { t.filled = false; sim.events.emit('mealDone', { c }); c.anim.stop(0.3); } } }
    } else applyEffects(sim, c, A.perRep, 1);
  }
  if (A.energyPerRep) c.energy = Math.max(0, c.energy - A.energyPerRep);
  if (A.job) {
    const onShift = sim.clock.period.id === 'work' || (A.job === 'kitchen' && ['breakfast', 'lunch', 'dinner'].includes(sim.clock.period.id));
    const myJob = c.isPlayer ? c.job : c.def.job;
    if (onShift && myJob === A.job) sim.economy.credit(c, A.job, 1);
    else if (c.isPlayer && !c.flags.toldNoPay) { c.flags.toldNoPay = true; sim.events.emit('notNow', { c, what: myJob === A.job ? 'You only get paid during work detail.' : `This isn't your job. Ask the Warden for a ${JOBS[A.job].name} assignment.` }); }
  }
}

function instant(sim, c, spot) {
  const a = spot.activity;
  const leave = () => setTimeoutSim(sim, 0.4, () => c.spot === spot && c.leaveSpot());
  if (a === 'getFood') {
    if (c.isPlayer) {
      if (c.held) c.dropHeld(1);
      const tray = sim.items.spawn('tray', c.x, 1, c.z, { filled: true });
      sim.giveItem(c, tray);
      sim.events.emit('gotMeal', { c });
    }
    leave(); return;
  }
  if (a === 'browse') {
    if (c.isPlayer) { const b = sim.items.spawn(Math.random() < 0.2 ? 'newspaper' : 'book', c.x, 1, c.z); sim.giveItem(c, b); }
    leave(); return;
  }
  if (a === 'raidFridge') {
    if (c.isPlayer) {
      const it = sim.items.spawn(Math.random() < 0.6 ? 'apple' : 'snack', c.x, 1, c.z); sim.giveItem(c, it);
      if (!(c.job === 'kitchen')) for (const g of sim.characters) if (g.kind === 'guard' && sim.rules._canSee(g, c, 12)) { sim.rules.report(c, 'theft', g); break; }
    }
    leave(); return;
  }
  if (a === 'vend') { if (c.isPlayer) sim.events.emit('openVending', { c, stock: VENDING[spot.furniture.stock || 'snacks'], spot }); leave(); return; }
  if (a === 'warden' || a === 'nurse' || a === 'askGuard' || a === 'jobBoard') {
    leave();
    if (!c.isPlayer) return;
    const role = a === 'warden' || a === 'jobBoard' ? 'warden' : a === 'nurse' ? 'nurse' : null;
    let npc = role ? sim.characters.find((x) => x.def.role === role) : null;
    if (a === 'askGuard') npc = sim.characters.filter((x) => x.kind === 'guard').sort((x, y) => Math.hypot(x.x - c.x, x.z - c.z) - Math.hypot(y.x - c.x, y.z - c.z))[0];
    if (a === 'jobBoard') { sim.events.emit('jobBoard', { c }); return; }
    if (npc && Math.hypot(npc.x - c.x, npc.z - c.z) < 6) setTimeoutSim(sim, 0.5, () => sim.startConversation(c, npc));
    else sim.events.emit('notNow', { c, what: 'Nobody is here right now.' });
    return;
  }
}

function cutFence(sim, c, f) {
  c.faceYaw = yawTo((f.a[0] + f.b[0]) / 2 - c.x, (f.a[1] + f.b[1]) / 2 - c.z);
  c.startAction({ type: 'cut', dur: 3.2, anim: 'work', moveMult: 0, cancelable: true, onEnd: () => { c.faceYaw = null; if (sim.world.cutFence(f.id)) sim.events.emit('fenceCut', { c, fence: f }); } });
}
function respawnItems(sim) {
  const present = new Map();
  for (const it of sim.items.items.values()) if (it.home) present.set(`${it.home.x},${it.home.z}`, true);
  for (const it of [...sim.items.items.values()]) if (!it.holder && !it.pocketOf && it.type === 'tray' && !it.home) sim.items.remove(it);
  void present;
}

class Needs {
  constructor(sim) { this.sim = sim; }
  update(dt) {
    const sim = this.sim, mins = dt * sim.clock.scale * sim.clock.boost;
    for (const c of sim.characters) {
      if (c.isStaff) continue;
      const sleeping = c.spot && c.spot.activity === 'sleep' && c.spotPhase === 'use';
      c.hunger = Math.max(0, c.hunger - CONFIG.needs.hungerPerHour / 60 * mins * (sleeping ? 0.5 : 1));
      if (!sleeping) c.energy = Math.max(0, c.energy - CONFIG.needs.energyPerHour / 60 * mins);
      if (c.hunger <= 0) c.hp = Math.max(1, c.hp - 0.15 * mins);
      if (c.isPlayer) {
        if (c.hunger < 20 && !c.flags.warnedHunger) { c.flags.warnedHunger = true; sim.events.emit('needWarn', { c, need: 'hunger' }); }
        if (c.hunger > 35) c.flags.warnedHunger = false;
        if (c.energy < 15 && !c.flags.warnedEnergy) { c.flags.warnedEnergy = true; sim.events.emit('needWarn', { c, need: 'energy' }); }
        if (c.energy > 30) c.flags.warnedEnergy = false;
      }
    }
  }
}
/** While the player sleeps in a bed, time runs much faster until morning or until they get up. */
class SleepManager {
  constructor(sim) { this.sim = sim; }
  update() {
    const p = this.sim.player, clk = this.sim.clock;
    const asleep = p && p.spot && p.spot.activity === 'sleep' && p.spotPhase === 'use';
    const night = clk.period.id === 'lightsout' || clk.period.id === 'lockup';
    if (asleep && (night || p.energy < 85)) {
      clk.boost = CONFIG.time.sleepMultiplier;
      if (!night && p.energy >= 99) p.leaveSpot();
      // Wake up at 06:00
      if (clk.minutes >= 6 * 60 && clk.minutes < 6 * 60 + 5 && this.wasNight) { p.leaveSpot(); this.sim.events.emit('wakeUp', { c: p }); }
    } else clk.boost = 1;
    this.wasNight = night || clk.minutes < 6 * 60;
  }
}
