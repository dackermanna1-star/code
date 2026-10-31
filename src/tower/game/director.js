// LAST LOOKOUT — the wave director: intro, spawning in groups from the valley's edges, bosses part
// way through, the wave cleared, the shop, the next one.
import { Vec3, clamp } from '../../physics/math.js';
import { WAVES, ENEMIES } from '../catalog.js';

export class Director {
  constructor(game) {
    this.game = game;
    this.wave = 0;
    this.phase = 'title'; // title | intro | fight | cleared | shop | over
    this.timer = 0;
    this.toSpawn = 0;
    this.spawned = 0;
    this.total = 0;
    this.bosses = [];
    this.spawnTimer = 0;
    this.killsThisWave = 0;
    this.queue = []; // spawns waiting (one per step: building a ragdoll takes a couple of ms)
  }

  get toKill() {
    return this.toSpawn + this.bosses.length + this.queue.length + this.game.horde.aliveCount;
  }

  startWave(n = this.wave + 1) {
    const game = this.game;
    this.wave = n;
    this.total = WAVES.count(n);
    this.toSpawn = this.total;
    this.spawned = 0;
    this.bosses = WAVES.bosses(n).slice();
    this.spawnTimer = 0;
    this.killsThisWave = 0;
    this.phase = 'intro';
    this.timer = 4;
    game.setTimeOfDay(WAVES.timeOfDay(n));
    game.rollWind(n);
    game.emit({ type: 'waveStart', n, bosses: this.bosses.map((b) => ENEMIES[b].name) });
  }

  step(dt) {
    const game = this.game;
    this.timer -= dt;
    if (this.queue.length) {
      const q = this.queue.shift();
      const z = this.spawnOne(q.kind, q.sp);
      if (q.boss) game.emit({ type: 'boss', zombie: z, name: ENEMIES[q.kind].name });
    }
    switch (this.phase) {
      case 'intro':
        if (this.timer <= 0) {
          this.phase = 'fight';
          game.emit({ type: 'fight', n: this.wave });
        }
        break;
      case 'fight': {
        const H = game.horde;
        this.spawnTimer -= dt;
        const alive = H.aliveCount;
        if (this.spawnTimer <= 0 && this.toSpawn > 0 && alive < WAVES.maxAlive(this.wave)) {
          const group = Math.min(this.toSpawn, 1 + Math.floor(game.rng() * Math.min(4, 1 + this.wave / 3)));
          this.spawnGroup(group);
          this.spawnTimer = WAVES.spawnInterval(this.wave) * (0.6 + game.rng() * 0.8) * group;
        }
        // the boss walks in once a third of the wave is out
        if (this.bosses.length && this.spawned >= this.total * 0.3) this.queue.push({ kind: this.bosses.shift(), sp: this.spawnPoint(), boss: true });
        if (this.toSpawn === 0 && !this.bosses.length && !this.queue.length && alive === 0) {
          this.phase = 'cleared';
          this.timer = 3.5;
          game.waveCleared(this.wave);
        }
        break;
      }
      case 'cleared':
        if (this.timer <= 0) {
          this.phase = 'shop';
          game.emit({ type: 'shop', n: this.wave });
        }
        break;
    }
  }

  pickKind() {
    const mix = WAVES.mix(this.wave);
    let sum = 0;
    for (const k in mix) sum += mix[k];
    let r = this.game.rng() * sum;
    for (const k in mix) {
      r -= mix[k];
      if (r <= 0) return k;
    }
    return 'walker';
  }

  /**
   * Where the next group comes from: mostly out of the woods at the valley's edge, but a third of
   * them closer in - out of the corn, from behind the farm buildings, across the fields (100-150 m)
   * - so a wave keeps coming at you instead of trickling in over minutes.
   */
  spawnPoint() {
    const game = this.game, rng = game.rng, L = game.layout;
    const S = L.spawns;
    const far = S[Math.floor(rng() * S.length)];
    if (this.wave < 2 || rng() > 0.35) return far;
    const corn = L.cover && L.cover.cornfield;
    for (let k = 0; k < 12; k++) {
      let x, z;
      if (corn && corn.length && rng() < 0.4) {
        const c = corn[Math.floor(rng() * corn.length)];
        x = c.minX + rng() * (c.maxX - c.minX);
        z = c.minZ + rng() * (c.maxZ - c.minZ);
      } else {
        const a = Math.atan2(far.pos[1], far.pos[0]) + (rng() - 0.5) * 0.8, r = 100 + rng() * 50;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
      }
      const d = Math.hypot(x, z);
      if (d > 85 && game.isWalkable(x, z) && isFinite(game.field.distanceAt(x, z))) return { id: 'near', pos: [x, z], dir: [-x / d, -z / d], label: 'near' };
    }
    return far;
  }

  spawnGroup(n) {
    const sp = this.spawnPoint();
    for (let i = 0; i < n; i++) {
      this.queue.push({ kind: this.pickKind(), sp });
      this.toSpawn--;
    }
  }

  spawnOne(kind, sp = this.spawnPoint()) {
    const game = this.game, rng = game.rng;
    const dx = sp.dir[0], dz = sp.dir[1];
    let x = sp.pos[0], z = sp.pos[1];
    for (let k = 0; k < 8; k++) {
      const side = (rng() - 0.5) * 14, back = -rng() * 8;
      const cx = sp.pos[0] + -dz * side + dx * back, cz = sp.pos[1] + dx * side + dz * back;
      if (game.isWalkable(cx, cz)) {
        x = cx;
        z = cz;
        break;
      }
    }
    this.spawned++;
    return game.horde.spawn(kind, new Vec3(x, 0, z), Math.atan2(dx, dz) + (rng() - 0.5) * 0.6);
  }

  save() {
    return { wave: this.wave };
  }
}

export { clamp };
