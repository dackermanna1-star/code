// An automatic Bosun for the title-screen attract mode and balance sims.
// Like Seal Hunter's bot it lines up with the most urgent zombie (using the
// exact inverse of the view-consistent hit rule to pick the lane where the gun
// line crosses the chosen body part), fires when the line crosses something,
// and buys from a list. It also uses the Last Ferry verbs: kicks and stomps
// crawlers and downed bodies, blows the horn when something gets close to the
// gangway, lines up with the crane's hook to drop the pallet on a crowd (and
// keeps out of the hook's lane otherwise), sets crowds alight with the flare
// pistol and calls the cannon strike.
//
// `skill` (0..1) is a real difficulty knob, so balance sims mean something:
// it sets the lane-judgement error, the reaction time, how long it takes to
// notice a better gun is affordable, head or body aim, and how cleverly the
// pier's tricks are used.
import type { WeaponId } from '../config/ids';
import { laneFor, viewHeightAt } from '../config/view';
import { CRANE, ESCAPE_X, HUNTER, PLAYER_MAX_X, PLAYER_MAX_Z, PLAYER_MIN_X, PLAYER_MIN_Z, TICK_RATE } from '../config/world';
import { MUZZLE_Z, WEAPONS } from '../config/weapons';
import { CANNON } from '../config/rules';
import { PLATE_HELMET } from '../config/ids';
import { Pier } from './Pier';
import type { Player } from './Player';
import type { World } from './World';
import type { HitShape, Zombie } from './Zombie';

export interface BotOptions {
  /** 0..1: lower skill aims sloppier, reacts later, buys later and uses the pier's tricks less cleverly. */
  skill?: number;
  /** Weapons to buy, in order (default BOT_BUY_LIST). */
  buyList?: WeaponId[];
  /** Where it likes to stand (x). */
  homeX?: number;
  /** Use the ferry horn / crane / cannon / stomps / flare (balance sims can switch them off). */
  horn?: boolean;
  crane?: boolean;
  cannon?: boolean;
  stomp?: boolean;
  flare?: boolean;
}

export const BOT_BUY_LIST: WeaponId[] = ['nailgun', 'shotgun', 'flare', 'harpoon', 'outboard'];

export { laneFor };

/** What skill does (derived numbers, exposed for tests). */
export function botSkill(skill: number) {
  const k = 1 - Math.max(0, Math.min(1, skill));
  return {
    /** Reaction to a new target (s). */
    reaction: 0.1 + k * 5.0,
    /** Lane judgement error (± m of gun-line z) on a new target, and how much it wanders. */
    noise: k * 12,
    wander: k * 6,
    /** Ticks between target re-evaluations. */
    retarget: 8 + Math.round(k * 30),
    /** Seconds before it notices it can afford the next gun. */
    buyDelay: k * 40,
    /** Chance it aims a new target's head (the view-consistent trick) rather than where the body stands. */
    headAim: Math.max(0, Math.min(1, (skill - 0.6) / 0.4)),
    /** Below this it holds the trigger whenever anything is in front (spray), not only when the line crosses a target. */
    sprays: skill < 0.95,
    /** Blows the horn when something is this close to the gangway (m). */
    hornReach: 1.6 + 2 * (1 - k),
    /** Zombies under the pallet before it goes for the crane. */
    craneCrowd: skill >= 0.75 ? CRANE.crowd : CRANE.crowd + 1,
    /** Cluster weight it waits for before calling the deck gun. */
    cannonCluster: skill >= 0.85 ? 4 : 6,
  };
}

export class Bot {
  readonly skill: number;
  private readonly buyList: WeaponId[];
  private readonly homeX: number;
  private readonly opts: Required<Pick<BotOptions, 'horn' | 'crane' | 'cannon' | 'stomp' | 'flare'>>;
  private readonly k: ReturnType<typeof botSkill>;
  private target: Zombie | null = null;
  /** Aim at the current target's head (rolled per target). */
  private aimHead = true;
  private retargetIn = 0;
  private hesitate = 0;
  private noise = 0;
  /** Current plan. */
  mode: 'fight' | 'crane' | 'stomp' = 'fight';
  private stompTarget: { x: number; z: number } | null = null;
  private switchIn = 0;
  private cooling = false;
  /** Tick at which the next weapon on the list became affordable (-1 = not yet). */
  private affordableAt = -1;

  constructor(private player: Player, opts: BotOptions = {}) {
    this.skill = Math.max(0, Math.min(1, opts.skill ?? 0.85));
    this.k = botSkill(this.skill);
    this.buyList = opts.buyList ?? BOT_BUY_LIST;
    this.homeX = opts.homeX ?? 16.2;
    this.opts = { horn: opts.horn ?? true, crane: opts.crane ?? true, cannon: opts.cannon ?? true, stomp: opts.stomp ?? true, flare: opts.flare ?? true };
  }

  /** Seconds until this zombie reaches the gangway (or grabs us). */
  private eta(z: Zombie): number {
    const p = this.player;
    if (!z.alive) return Infinity;
    if (z.state === 'carried' && z.stretcher) return Infinity; // shoot the medics
    const v = Math.max(0.25, z.speed * (z.burning > 0 ? 1.1 : 1) * Math.max(0.3, z.slow));
    let t = (ESCAPE_X - (z.x + z.def.halfLength)) / v;
    // Something in our own lane meets us first, and gets shot on the way anyway.
    if (Math.abs(this.aimLane(z) - this.lineZ()) < 0.35 && z.x < p.x) t = Math.min(t, (p.x - z.x) / v + 0.5);
    if (z.x > p.x - 0.6) t -= 2; // already past the gun line: hurry
    if (z.isBoss) t -= 1.5;
    return t;
  }

  private lineZ(): number {
    return this.player.z + MUZZLE_Z[this.player.weapon.id];
  }

  /** Body part to aim at. */
  private aimShape(z: Zombie): HitShape {
    const shapes = z.shapes();
    const find = (part: string) => shapes.find((s) => s.part === part);
    let s: HitShape | undefined;
    if (z.kind === 'riot') s = (z.plates & PLATE_HELMET ? shapes.find((x) => x.plate === PLATE_HELMET) : find('head')) ?? find('legs');
    else if (z.kind === 'bigdave' || z.kind === 'bloater') s = find('body');
    else if (z.crawling) s = this.aimHead ? find('head') : find('body');
    else if (z.state === 'carried') s = find('body');
    else s = this.aimHead ? find('head') : find('body');
    if (!s) s = shapes.reduce((a, b) => (b.a * b.b > a.a * a.b ? b : a));
    return s;
  }

  private aimLane(z: Zombie): number {
    const s = this.aimShape(z);
    const y0 = this.player.y + HUNTER.muzzleHeight;
    // Lead lane changers a little.
    return laneFor(y0, s.cy, z.z + z.vz * 0.2);
  }

  /** Zombies the current gun line would cross (lane rule, no spread). */
  private lined(world: World): Zombie[] {
    const p = this.player;
    const y0 = p.y + HUNTER.muzzleHeight;
    const z0 = this.lineZ();
    const out: Zombie[] = [];
    for (const z of world.zombies) {
      if (!z.alive || z.x > p.x) continue;
      const sil = z.silhouetteAt(viewHeightAt(y0, z0, z.z));
      if (sil) out.push(z);
    }
    return out;
  }

  /** A crowd worth a flare: 3+ on the line bunched within 2.5 m, or a gas cloud on the line with company. */
  private flareWorthIt(world: World, lined: Zombie[]): boolean {
    const p = this.player;
    const near = lined.filter((z) => z.x < p.x - 3 && z.burning <= 0 && !z.isBoss).sort((a, b) => b.x - a.x);
    if (near.length >= 3 && near[0].x - near[2].x < 2.5) return true;
    for (const g of world.gas) {
      if (g.x > p.x - 4 || Math.abs(g.z - this.lineZ()) > g.radius * 0.6) continue;
      let n = 0;
      world.forEachZombieNear(g.x, g.z, g.radius + 1, (z) => {
        if (z.alive) n++;
      });
      if (n >= 2) return true;
    }
    return false;
  }

  /** The right tool: the outboard; the harpoon for kebabs and big ones; a flare into a crowd; the shotgun up close; nails otherwise. */
  private pickWeapon(world: World): WeaponId {
    const p = this.player;
    const t = this.target;
    const lined = this.lined(world);
    const flare = p.owned.get('flare');
    if (this.opts.flare && flare && flare.bullets > 0 && this.skill >= 0.5 && this.flareWorthIt(world, lined)) return 'flare';
    if (p.has('outboard')) return 'outboard';
    const harpoonReady = p.has('harpoon') && (p.weapon.id === 'harpoon' ? p.weapon.bullets > 0 || p.weapon.reloading : true);
    const runners = world.zombies.filter((z) => z.alive && z.kind === 'jogger' && !z.crawling && z.x > p.x - 22).length;
    if (harpoonReady && runners === 0) {
      const big = lined.some((z) => z.kind === 'riot' || z.kind === 'bigdave' || z.kind === 'bloater') || (t && (t.kind === 'riot' || t.kind === 'bigdave'));
      if (lined.length >= 3 || big) return 'harpoon';
      if (p.weapon.id === 'harpoon' && p.weapon.reloading && !(t && t.x > p.x - 8)) return 'harpoon';
    }
    if (p.has('shotgun') && (!p.has('nailgun') || (t && (t.kind === 'jogger' || t.x > p.x - 9)))) return 'shotgun';
    if (p.has('nailgun')) return 'nailgun';
    if (p.has('shotgun')) return 'shotgun';
    return 'revolver';
  }

  /** Buy the next gun on the list once it has been affordable for a (skill-dependent) while. */
  private shop(world: World): void {
    const p = this.player;
    for (const id of this.buyList) {
      if (p.has(id)) continue;
      if (p.money < WEAPONS[id].price) {
        this.affordableAt = -1;
        return;
      }
      if (this.affordableAt < 0) this.affordableAt = world.tick;
      if (world.tick - this.affordableAt >= this.k.buyDelay * TICK_RATE) {
        p.buy(id);
        this.affordableAt = -1;
        this.switchIn = 0;
      }
      return;
    }
  }

  think(world: World): void {
    const p = this.player;
    const inp = p.input;
    inp.left = inp.right = inp.up = inp.down = inp.fire = inp.jump = inp.horn = inp.cannon = false;
    if (!p.alive || (world.gameEnded && !(world.aftermath && world.phase === 'victory'))) return;
    const rng = world.rng;

    // --- shopping and the right gun (a spent flare is put away at once)
    this.shop(world);
    const spentFlare = p.weapon.id === 'flare' && p.weapon.bullets <= 0;
    if (--this.switchIn <= 0 || spentFlare) {
      const want = this.pickWeapon(world);
      if (want !== p.weapon.id) {
        p.switchTo(want);
        this.switchIn = want === 'flare' ? 20 : 60;
      }
    }

    // --- threats
    let urgent: Zombie | null = null;
    let ue = Infinity;
    let pastUs = 0;
    for (const z of world.zombies) {
      if (!z.alive) continue;
      const t = this.eta(z) + Math.abs(this.aimLane(z) - this.lineZ()) / 3.2;
      if (t < ue) {
        ue = t;
        urgent = z;
      }
      if (z.x > p.x - 0.3 && !z.crawling && z.state !== 'grab') pastUs++;
    }

    // --- target selection (hysteresis), reaction time
    if (--this.retargetIn <= 0 || !this.target?.alive) {
      const cur = this.target?.alive ? this.eta(this.target) : Infinity;
      if (urgent && (cur === Infinity || ue < cur - 1.2)) {
        if (urgent !== this.target) {
          // Human-ish: a reaction delay and a lane judgement that is a little off.
          this.hesitate = Math.round(this.k.reaction * TICK_RATE);
          this.noise = (rng.next() - 0.5) * 2 * this.k.noise;
          this.aimHead = rng.next() < this.k.headAim;
        }
        this.target = urgent;
      }
      this.retargetIn = this.k.retarget;
    }
    // The lane judgement wanders (and settles a little).
    if (world.tick % 40 === 0) this.noise = this.noise * 0.5 + (rng.next() - 0.5) * 2 * this.k.wander;
    const target = this.target;

    // --- the horn: something is about to board
    if (this.opts.horn && world.hornReady) {
      const close = world.zombies.some((z) => z.alive && !z.crawling && z.state !== 'stagger' && z.x + z.def.halfLength > ESCAPE_X - this.k.hornReach);
      // A wave of runners closing in: freeze them all.
      let wave = 0;
      for (const z of world.zombies) if (z.alive && z.kind === 'jogger' && !z.crawling && z.state !== 'stagger' && z.x > p.x - 14) wave++;
      if (close || pastUs >= 3 || wave >= 6 || (p.grabbers.size >= 2 && p.life < 55)) inp.horn = true;
    }

    // --- cannon strike
    if (this.opts.cannon && world.favourReady) {
      let n = 0;
      for (const z of world.zombies) if (z.alive && z.x < p.x - 1 && Math.abs(z.z - p.z) <= CANNON.laneBand + 0.5 && z.onScreen) n += z.isBoss ? 3 : 1;
      if (n >= this.k.cannonCluster || (ue < 5 && n >= 2) || p.life < 35) inp.cannon = true;
    }

    // --- plan: crane drop on a crowd, stomp a body about to rise, or fight
    this.mode = 'fight';
    if (this.opts.crane && world.craneReady && ue > 5 && world.pier.under >= this.k.craneCrowd) this.mode = 'crane';
    if (this.mode === 'fight' && this.opts.stomp && ue > 6 + (1 - this.skill) * 4) {
      let bestD = 2.6;
      this.stompTarget = null;
      for (const c of world.corpses) {
        if (!c.downed || c.risesAt === null || c.risesAt - world.tick > 50 * 6) continue;
        const d = Math.hypot(c.x - p.x, (c.z - p.z) * 1.4);
        if (d < bestD) {
          bestD = d;
          this.stompTarget = { x: c.x, z: c.z };
        }
      }
      if (this.stompTarget) this.mode = 'stomp';
    }
    if (p.grabbers.size >= 2 || (p.grabbers.size >= 1 && p.life < 40)) inp.jump = true;

    // --- where to stand
    const mz = MUZZLE_Z[p.weapon.id];
    const hookZ = Pier.hookLane(p.y + HUNTER.muzzleHeight) - mz;
    let wantX = this.homeX;
    let wantZ = p.z;
    if (this.mode === 'crane') {
      wantZ = hookZ;
    } else if (this.mode === 'stomp' && this.stompTarget) {
      wantX = this.stompTarget.x;
      wantZ = this.stompTarget.z;
      if (Math.abs(p.x - wantX) < 0.45 && Math.abs(p.z - wantZ) < 0.35 && p.onGround) inp.jump = true;
    } else if (target && target.crawling && (world.mopUp || target.x > p.x - 6)) {
      // Walk into crawlers to kick them (the gun line passes over them from afar).
      wantX = Math.min(PLAYER_MAX_X, target.x + 0.75);
      wantZ = target.z;
    } else if (target) {
      wantZ = this.aimLane(target) - mz + this.noise;
      // Keep the gun line ahead of it; get out in front of anything that slipped past.
      if (target.x > p.x - 1.5) wantX = Math.min(PLAYER_MAX_X, target.x + 2.6);
      else if (target.x > this.homeX - 3) wantX = Math.min(PLAYER_MAX_X, Math.max(this.homeX, target.x + 4));
    }
    // Keep out of the hook's lane unless dropping the pallet on purpose.
    if (this.mode !== 'crane' && world.craneReady && Math.abs(wantZ - hookZ) < CRANE.laneBand + 0.12) {
      wantZ = hookZ + (wantZ >= hookZ ? 1 : -1) * (CRANE.laneBand + 0.18);
    }
    // Get out of gas.
    const g = world.hazards.gasAt(p.x, p.z, 0.4);
    if (g) wantZ = p.z + (p.z >= g.z ? 1 : -1) * (g.radius + 1.0);
    wantX = Math.max(PLAYER_MIN_X, Math.min(PLAYER_MAX_X, wantX));
    wantZ = Math.max(PLAYER_MIN_Z, Math.min(PLAYER_MAX_Z, wantZ));

    if (p.x < wantX - 0.4) inp.right = true;
    else if (p.x > wantX + 0.4) inp.left = true;

    // --- fire: whatever the gun line crosses (or the hook, or a body to pin with nails)
    const line = world.combat.lineTrace(p);
    if (line.kind === 'zombie') inp.fire = true;
    else if (line.kind === 'hook') inp.fire = this.mode === 'crane';
    else if (this.k.sprays && line.kind === 'none' && p.weapon.id !== 'flare' && p.weapon.id !== 'harpoon') {
      // Less disciplined: keep the trigger down while anything is coming.
      inp.fire = world.zombies.some((z) => z.alive && z.onScreen && z.x < p.x);
    }
    else if (line.kind === 'corpse' && p.weapon.id === 'nailgun') {
      const c = line.id !== null ? world.corpseById(line.id) : undefined;
      if (c?.downed) inp.fire = true;
    }
    // Never cut the rope by accident (with a margin: it moves before the shot goes off).
    if (this.mode !== 'crane' && Math.abs(world.pier.hookOffset(p.muzzle())) <= CRANE.laneBand + 0.15) inp.fire = false;
    // Feather the outboard before it overheats and stalls.
    if (p.weapon.id === 'outboard') {
      if (p.weapon.heat > 0.88) this.cooling = true;
      else if (p.weapon.heat < 0.6) this.cooling = false;
      if (this.cooling) inp.fire = false;
    }

    if (this.hesitate > 0) {
      this.hesitate--;
      return;
    }
    const stop = Math.abs(p.vz) * 0.1;
    const tol = this.mode === 'crane' ? 0.05 : 0.1;
    if (wantZ > p.z + tol + stop) inp.down = true;
    else if (wantZ < p.z - tol - stop) inp.up = true;

    if (!inp.fire && line.kind === 'none' && ue > 3 && p.weapon.bullets < p.weapon.def.clip * 0.5) p.reload();
  }
}
