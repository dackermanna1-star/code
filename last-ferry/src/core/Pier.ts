// The pier fights back (DESIGN §4.3): the ferry horn, the cargo crane and the
// Captain's Favour cannon strike.
import { CRANE, TICK, TICK_RATE } from '../config/world';
import { CANNON, FAVOUR, FEEL, HORN } from '../config/rules';
import type { CraneView } from './api';
import type { CraneState, V3 } from './events';
import type { Player } from './Player';
import type { Projectile } from './Combat';
import type { World } from './World';
import type { Zombie } from './Zombie';

interface Strike {
  player: Player;
  targets: V3[];
  fired: number;
  nextAt: number;
  kills: Zombie[];
  shells: Projectile[];
}

export class Pier {
  hornReady = true;
  favour = 0;
  readonly crane: CraneView = { state: 'hanging', stateTime: 0, barricade: 0 };
  private cutBy: Player | null = null;
  private strike: Strike | null = null;

  constructor(private world: World) {}

  get favourReady(): boolean {
    return this.favour >= FAVOUR.max;
  }

  get craneReady(): boolean {
    return this.crane.state === 'hanging';
  }

  // ------------------------------------------------------------------ favour

  addFavour(n: number): void {
    const v = Math.min(FAVOUR.max, this.favour + n);
    if (v === this.favour) return;
    this.favour = v;
    this.world.events.emit('favour', { value: v, ready: v >= FAVOUR.max });
  }

  // ------------------------------------------------------------------ horn

  /** H: every zombie on screen staggers; crawlers are pushed back. Once per chapter. */
  blowHorn(player: Player | null): boolean {
    const w = this.world;
    if (!this.hornReady) return false;
    this.hornReady = false;
    if (player) player.stats.horns++;
    w.events.emit('horn', {});
    w.events.emit('shake', { amount: FEEL.hornShake });
    for (const zb of w.zombies) {
      if (!zb.alive || !zb.onScreen) continue;
      if (zb.crawling) {
        zb.x -= HORN.crawlerPush;
        continue;
      }
      zb.stagger(zb.isBoss ? HORN.bossStagger : HORN.stagger);
    }
    return true;
  }

  // ------------------------------------------------------------------ crane

  private setCrane(s: CraneState): void {
    this.crane.state = s;
    this.crane.stateTime = 0;
    this.world.events.emit('crane', { state: s, x: CRANE.hookX, z: CRANE.hookZ });
  }

  /** A shot hit the hook block: the pallet falls. */
  cutRope(by: Player | null): void {
    if (this.crane.state !== 'hanging') return;
    this.cutBy = by;
    if (by) by.stats.craneDrops++;
    this.setCrane('falling');
  }

  /** New chapter: a fresh pallet is hung. */
  rehang(): void {
    this.hornReady = true;
    if (this.crane.state !== 'hanging') {
      this.crane.barricade = 0;
      this.setCrane('hanging');
    }
  }

  /** Inside the crate barricade (counts as 4 bodies). */
  inBarricade(x: number, z: number): boolean {
    return this.crane.state === 'down' && Math.abs(x - CRANE.hookX) <= CRANE.radius && Math.abs(z - CRANE.hookZ) <= CRANE.radius;
  }

  private land(): void {
    const w = this.world;
    this.setCrane('down');
    this.crane.barricade = CRANE.barricadeSeconds;
    const cx = CRANE.hookX;
    const cz = CRANE.hookZ;
    const r = CRANE.radius;
    w.events.emit('explosion', { x: cx, y: 0.2, z: cz, radius: r, kind: 'crates' });
    w.events.emit('shake', { amount: FEEL.craneShake });
    for (const zb of w.zombies) {
      if (!zb.alive || Math.abs(zb.x - cx) > r || Math.abs(zb.z - cz) > r) continue;
      const dx = zb.x - cx;
      const dz = zb.z - cz;
      const l = Math.hypot(dx, dz) || 1;
      zb.damage({
        damage: zb.life + 500,
        part: 'body',
        point: { x: zb.x, y: zb.height * 0.7, z: zb.z },
        dirX: dx / l,
        dirZ: dz / l,
        source: 'crates',
        player: this.cutBy,
        weapon: null,
        gib: true,
      });
    }
    const crushed: Array<import('./Corpses').Corpse> = [];
    w.bodies.forEachIn(cx, cz, r, r, (c) => crushed.push(c));
    for (const c of crushed) w.bodies.remove(c, 'gib');
    const kills = w.resolveDeaths();
    if (this.cutBy) w.combat.reward(this.cutBy, kills);
  }

  // ------------------------------------------------------------------ cannon

  /** F: the deck gun fires 3 shells at the densest cluster left of the hunter. */
  callCannon(player: Player): boolean {
    if (!this.favourReady || this.strike) return false;
    const targets = this.pickTargets(player);
    if (!targets.length) return false;
    this.favour = 0;
    this.world.events.emit('favour', { value: 0, ready: false });
    player.stats.cannonStrikes++;
    this.world.events.emit('cannonStrike', { targets });
    this.strike = { player, targets, fired: 0, nextAt: this.world.tick, kills: [], shells: [] };
    this.fireShells();
    return true;
  }

  /** Aim points for the strike (exposed for the bot and tests). */
  pickTargets(player: Player): V3[] {
    const w = this.world;
    const alive = w.zombies.filter((z) => z.alive && z.onScreen);
    let cands = alive.filter((z) => z.x < player.x - 1 && Math.abs(z.z - player.z) <= CANNON.laneBand);
    if (!cands.length) cands = alive.filter((z) => z.x < player.x);
    if (!cands.length) cands = alive;
    if (!cands.length) return [];
    const r = CANNON.radius;
    const weight = (z: Zombie) => (z.isBoss ? 3 : 1);
    const out: V3[] = [];
    let pool = cands;
    for (let k = 0; k < CANNON.shells; k++) {
      const lead = CANNON.flight + k * CANNON.interval;
      if (!pool.length) {
        const prev = out[out.length - 1];
        out.push({ x: prev.x + (k % 2 ? 1.6 : -1.6), y: 0, z: prev.z + (k % 2 ? 0.8 : -0.8) });
        continue;
      }
      let best = pool[0];
      let bs = -1;
      for (const c of pool) {
        let s = 0;
        for (const o of cands) if (Math.hypot(o.x - c.x, o.z - c.z) <= r) s += weight(o);
        // Prefer the cluster closer to the gangway on ties.
        s += c.x * 1e-3;
        if (s > bs) {
          bs = s;
          best = c;
        }
      }
      // Aim at the centre of the cluster, leading its walk.
      let sx = 0;
      let sz = 0;
      let sv = 0;
      let n = 0;
      for (const o of cands) {
        if (Math.hypot(o.x - best.x, o.z - best.z) <= r * 0.8) {
          sx += o.x;
          sz += o.z;
          sv += o.vx * o.slow;
          n++;
        }
      }
      const t: V3 = { x: sx / n + (sv / n) * lead, y: 0, z: sz / n };
      out.push(t);
      pool = pool.filter((o) => Math.hypot(o.x - t.x, o.z - t.z) > r * 0.75);
    }
    return out;
  }

  private fireShells(): void {
    const s = this.strike;
    if (!s) return;
    const w = this.world;
    while (s.fired < s.targets.length && w.tick >= s.nextAt) {
      w.combat.launchShell(s.player, s.targets[s.fired], s.kills);
      s.shells.push(w.combat.projectiles[w.combat.projectiles.length - 1]);
      s.fired++;
      s.nextAt = w.tick + Math.round(CANNON.interval * TICK_RATE);
    }
  }

  tick(): void {
    this.crane.stateTime += TICK;
    if (this.crane.state === 'falling' && this.crane.stateTime >= CRANE.dropTime - 1e-6) this.land();
    else if (this.crane.state === 'down') {
      this.crane.barricade = Math.max(0, this.crane.barricade - TICK);
      if (this.crane.barricade <= 0) this.setCrane('gone');
    }
    const s = this.strike;
    if (s) {
      this.fireShells();
      if (s.fired >= s.targets.length && s.shells.every((p) => p.done)) {
        this.strike = null;
        this.world.combat.reward(s.player, s.kills);
      }
    }
  }
}
