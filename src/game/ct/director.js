// Chinatown's zombie director (tools/ct/SPEC.md section 7): extra waves at
// the 9010 spawn markers when objectives make noise (the arch gate, the
// ladder release, the sewer exit, the crank), at the map's ambush lines
// (905/140..159), and without pause through the radio hold-out. Zombies only
// appear at markers the player can't see and that are more than 384 units
// away, and wave zombies alive at once are capped.
//
// Marker groups (the 9010's angle): a wave uses the markers of its group
// first, and any marker near the player when its group has none free.
//   0 any wave          4 sewer exit (905/132)
//   2 arch gate (904/3) 5 weld gate crank (904/8)
//   3 ladder (904/4)    6 radio hold-out and extraction
//   140..159 the ambush line with that tag (once each)
// All choices use w.rng, and the state is in the script's saved state.

import { MF, ONFLOORZ, SKILL, aproxDistance, pointToAngle } from '../defs.js';
import { MT } from '../tables.js';

export const DIRECTOR_GROUP = { ANY: 0, GATE: 2, LADDER: 3, SEWER: 4, CRANK: 5, HOLDOUT: 6 };
const WAVES = {
  gate: { group: DIRECTOR_GROUP.GATE, size: 6 },
  ladder: { group: DIRECTOR_GROUP.LADDER, size: 6 },
  sewer: { group: DIRECTOR_GROUP.SEWER, size: 5 },
  crank: { group: DIRECTOR_GROUP.CRANK, size: 8 },
  ambush: { group: 0, size: 4 },
  holdout: { group: DIRECTOR_GROUP.HOLDOUT, size: 2 },
};
// Wave size multiplier per skill (I'm too young to die .. Nightmare).
const SKILL_SCALE = [0.5, 0.75, 1, 1.35, 1.7];
const ALIVE_CAP = 40;
const MIN_DIST = 384;
const MAX_DIST = 2400;
const SPAWN_GAP = 3; // tics between two spawns of a wave
const HOLDOUT_GAP = 105; // tics between hold-out reinforcements
const SHAMBLERS = ['CT_ZCV1', 'CT_ZCV2', 'CT_ZCV3', 'CT_ZCV4'];

export class Director {
  constructor(script) {
    this.script = script;
    this.w = script.w;
    this.markerList = null;
  }

  static freshState() {
    return { alive: [], queue: [], fired: [], next: 0, spawned: 0 };
  }

  get d() { return this.script.s.dir; }

  // The spawn markers in THINGS order (they never move or die).
  markers() {
    if (!this.markerList) {
      this.markerList = [...this.w.mobjs].filter((m) => m.type === MT.CT_ZSPAWN).sort((a, b) => a.id - b.id);
    }
    return this.markerList;
  }

  scale() {
    const k = SKILL_SCALE[this.w.skill] ?? 1;
    return this.w.skill === SKILL.BABY ? Math.min(k, 0.5) : k;
  }

  // Queues a wave: kind is a WAVES key; group overrides its marker group.
  wave(kind, group = null) {
    const def = WAVES[kind];
    if (!def) return;
    const n = Math.max(1, Math.round(def.size * this.scale()));
    this.d.queue.push({ kind, group: group ?? def.group, n, tries: 0 });
  }

  // An ambush line (905/140..159): its group's markers, once.
  ambush(tag) {
    if (this.d.fired.includes(tag)) return;
    this.d.fired.push(tag);
    this.wave('ambush', tag);
  }

  aliveCount() {
    const d = this.d;
    d.alive = d.alive.filter((m) => m && !m.removed && m.health > 0);
    return d.alive.length;
  }

  tick(holdout) {
    const w = this.w;
    const d = this.d;
    // Hold-out reinforcements keep coming, but don't pile up behind the cap.
    if (holdout && w.leveltime % HOLDOUT_GAP === 0 && d.queue.reduce((n, j) => n + j.n, 0) < 8) this.wave('holdout');
    if (!d.queue.length || w.leveltime < d.next) return;
    d.next = w.leveltime + SPAWN_GAP;
    if (this.aliveCount() >= ALIVE_CAP) return;
    const job = d.queue[0];
    const marker = this.pickMarker(job.group);
    if (!marker) {
      // Nowhere out of sight right now: try again in a second, give up later.
      d.next = w.leveltime + 35;
      if (++job.tries > 20) d.queue.shift();
      return;
    }
    if (this.spawnAt(marker, job.kind)) job.n--;
    if (job.n <= 0) d.queue.shift();
  }

  // A free marker of `group` (else of any group) the player can't see,
  // between MIN_DIST and MAX_DIST away; one of the nearest few at random.
  pickMarker(group) {
    const w = this.w;
    const p = w.player && w.player.mo;
    if (!p) return null;
    const usable = (m) => {
      const dist = aproxDistance(m.x - p.x, m.y - p.y);
      if (dist <= MIN_DIST || dist > MAX_DIST) return false;
      return !w.checkSight(m, p);
    };
    const all = this.markers();
    let list = all.filter((m) => m.spawnpoint && m.spawnpoint.angle === group && usable(m));
    if (!list.length) list = all.filter((m) => usable(m));
    if (!list.length) return null;
    const dist = (m) => aproxDistance(m.x - p.x, m.y - p.y);
    list.sort((a, b) => dist(a) - dist(b) || a.id - b.id);
    const n = Math.min(4, list.length);
    return list[w.rng.P() % n];
  }

  // Zombie kind for a wave: runners get likelier as the night goes on.
  pickType(kind) {
    const w = this.w;
    const stage = Math.min(6, this.script.s.stage);
    const runner = kind === 'holdout' ? 46 : 13 + 5 * stage; // out of 256
    const kid = kind === 'holdout' ? 20 : 15;
    const r = w.rng.P();
    if (r < runner) return MT.CT_ZRUN;
    if (r < runner + kid) return MT.CT_ZKID;
    return MT[SHAMBLERS[w.rng.P() & 3]];
  }

  spawnAt(marker, kind) {
    const w = this.w;
    const type = this.pickType(kind);
    const mo = w.spawnMobj(marker.x, marker.y, ONFLOORZ, type);
    if (!w.checkPosition(mo, mo.x, mo.y)) {
      w.removeMobj(mo);
      return false;
    }
    const p = w.player.mo;
    mo.angle = pointToAngle(mo.x, mo.y, p.x, p.y);
    mo.saveInterp();
    if (mo.flags & MF.COUNTKILL) w.totalkills++;
    // They come for the player straight away.
    mo.target = p;
    w.setMobjState(mo, mo.info.seestate);
    this.d.alive.push(mo);
    this.d.spawned++;
    return true;
  }
}
