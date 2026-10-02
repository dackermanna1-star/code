// Finding level doors: keeps a list of the doors around the player (asked from the world, which
// generates zones as needed) and works out the nearest one for the phone. While the phone is
// out it beeps from the door's direction, faster as you get closer, with a double beep when you
// face it.
import { storyOf } from '../world/levels.js';
import { wrapAngle } from '../core/math.js';

const RANGE = 128;     // metres searched around the player
const REQUERY = 40;    // ask again after moving this far

export class LevelNav {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.doors = [];
    this.at = null;        // where the last answer was asked for
    this.pending = false;
    this.nearest = null;   // { x, y, z, dist, dy, rel }
    this.timer = 0;
    this.pingT = 0;
    this.facing = false;
    this.searching = true;
  }

  update(dt, phoneUp) {
    const g = this.game, p = g.player;
    const story = storyOf(p.y);
    this.timer -= dt;
    const a = this.at;
    const stale = !a || a.dim !== p.dim || a.story !== story || Math.hypot(p.x - a.x, p.z - a.z) > REQUERY || this.timer <= 0;
    if (stale && !this.pending && !g.pendingSpawn) {
      this.pending = true;
      this.timer = 30;
      const q = { dim: p.dim, story, x: p.x, z: p.z };
      if (!a || a.dim !== q.dim) this.searching = true;
      g.world.queryDoors(q.dim, q.story, q.x, q.z, RANGE).then((list) => {
        this.pending = false;
        if (!list || g.player.dim !== q.dim) return;
        this.at = q;
        this.doors = list.filter((d) => !d.arrival);
        this.searching = false;
      });
    }
    // nearest: the doors we were told about plus any in the loaded chunks around us
    let best = null, bd = Infinity;
    const take = (d) => {
      if (d.arrival) return;
      const dist = Math.hypot(d.x - p.x, d.z - p.z) + Math.abs(d.y - p.y) * 4;
      if (dist < bd) { bd = dist; best = d; }
    };
    for (const d of this.doors) take(d);
    for (const ch of g.world.chunksNear(p.dim, p.x, p.z, 24)) for (const d of ch.data.doors || []) take(d);
    if (best) {
      const dx = best.x - p.x, dz = best.z - p.z;
      const bearing = Math.atan2(dx, -dz);
      this.nearest = { x: best.x, y: best.y, z: best.z, dist: Math.hypot(dx, dz), dy: best.y - p.y, rel: wrapAngle(bearing - p.yaw) };
    } else this.nearest = null;
    this.beep(dt, phoneUp);
  }

  beep(dt, phoneUp) {
    const n = this.nearest;
    if (!phoneUp || !n) { this.pingT = 0.4; this.facing = false; return; }
    const g = this.game, p = g.player;
    const facing = Math.abs(n.rel) < 0.28 && n.dist > 1.5;
    if (facing && !this.facing) { this.say('phone_lock', n, 1); this.pingT = 0.6; }
    this.facing = facing;
    this.pingT -= dt;
    if (this.pingT > 0) return;
    this.pingT = Math.min(2.2, Math.max(0.3, 0.3 + n.dist / 55));
    this.say('phone_ping', n, facing ? 1.19 : 1);
    void p;
  }

  // a beep that comes from the door's direction, a few metres away
  say(name, n, rate) {
    const g = this.game, p = g.player;
    const k = 3 / Math.max(3, n.dist);
    g.audioCall('play', name, p.x + (n.x - p.x) * k, p.y + 1.4, p.z + (n.z - p.z) * k, { rate, vol: 0.9 });
  }
}
