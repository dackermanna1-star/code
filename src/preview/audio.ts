// Audio test page: every sound as a button, plus simulated event sequences
// pushed through a real EventBus + AudioSystem.weaponTick, with live voice
// counts. Exposes window.__preview for automated checks.
import { AudioSystem, MAX_PER_NAME, MAX_VOICES } from '../audio/AudioSystem';
import { groupOf } from '../audio/soundMap';
import { WEAPONS, WEAPON_ORDER, type WeaponDef, type WeaponId } from '../config/weapons';
import type { EnemyType } from '../config/enemies';
import { EventBus, type DeathKind, type HitPart, type V3 } from '../core/Events';

const audio = new AudioSystem();
const bus = new EventBus();
const enemyX = new Map<number, number>();
const playerX = [8, 10];
// No debris physics here, so let the audio system time the shell landings.
audio.bindGameEvents(
  bus,
  (id) => enemyX.get(id),
  (pid) => playerX[pid] ?? 8,
  { shellEject: true },
);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const logEl = $('log');
const log = (msg: string, bad = false) => {
  const line = document.createElement('div');
  line.textContent = msg;
  if (bad) line.className = 'bad';
  logEl.prepend(line);
};
const errors: string[] = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const v3 = (x: number, y = 0.8, z = 0): V3 => ({ x, y, z });
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ------------------------------------------------------------ voice sampling

interface Peak {
  total: number;
  oneShots: number;
  loops: number;
  maxPerName: number;
  maxName: string;
  maxPerGroup: Record<string, number>;
}
let peak: Peak = newPeak();
function newPeak(): Peak {
  return { total: 0, oneShots: 0, loops: 0, maxPerName: 0, maxName: '', maxPerGroup: {} };
}
function sample(): void {
  const s = audio.voiceStats();
  peak.total = Math.max(peak.total, s.total);
  peak.oneShots = Math.max(peak.oneShots, s.total - s.loops);
  peak.loops = Math.max(peak.loops, s.loops);
  for (const [n, c] of Object.entries(s.byName)) {
    if (c > peak.maxPerName) {
      peak.maxPerName = c;
      peak.maxName = n;
    }
  }
  for (const [g, c] of Object.entries(s.byGroup)) peak.maxPerGroup[g] = Math.max(peak.maxPerGroup[g] ?? 0, c);
}

/** Run `fn` once per 20 ms logic tick. */
async function ticks(n: number, fn: (t: number) => void): Promise<void> {
  for (let t = 0; t < n; t++) {
    fn(t);
    sample();
    await sleep(20);
  }
}
async function wait(ms: number): Promise<void> {
  await ticks(Math.ceil(ms / 20), () => {});
}

// ------------------------------------------------------------ weapon simulation (weapons.py rules)

class SimWeapon {
  state: 'idle' | 'fire' | 'reload' = 'idle';
  ticks = 0;
  heat = 0;
  bullets: number;
  fireTicks: number;
  readonly def: WeaponDef;
  constructor(
    readonly id: WeaponId,
    readonly playerId = 0,
    bullets?: number,
  ) {
    this.def = WEAPONS[id];
    this.bullets = bullets ?? this.def.clip;
    this.fireTicks = this.def.fireTicks;
  }

  private get x(): number {
    return playerX[this.playerId] ?? 8;
  }

  private canFire(): boolean {
    if (this.state === 'reload') return false;
    if (this.state === 'fire' && this.ticks < this.fireTicks) return false;
    return this.bullets >= this.def.perShot;
  }

  private discharge(): void {
    const muzzle = v3(this.x - 0.6, 0.8, 0);
    const paths = Array.from({ length: this.def.pellets }, () => ({ from: muzzle, to: v3(-20, 0.8, rand(-2, 2)), ric: false }));
    bus.emit('shot', { playerId: this.playerId, weapon: this.id, muzzle, paths });
  }

  private eject(count = 1): void {
    bus.emit('shellEject', { playerId: this.playerId, weapon: this.id, count });
  }

  /** One logic tick; `held` = trigger down. */
  tick(held: boolean): void {
    // Player.tick handles the trigger before weapon_tick.
    if (held && this.canFire()) {
      this.state = 'fire';
      this.ticks = 0;
      if (this.id !== 'vintage') {
        this.bullets -= this.def.perShot;
        this.discharge();
        if (this.def.shell !== 'none' && this.id !== 'shotgun') this.eject();
      }
    }
    // weapon_tick
    if (this.state === 'fire') {
      if (this.id === 'shotgun' && this.ticks === 21) this.eject();
      if (this.id === 'vintage' && this.ticks === 35) {
        this.bullets -= 2;
        this.discharge();
        this.eject(2);
      }
      if (this.id === 'minigun' && (this.ticks % 3 === 2 || this.ticks === this.fireTicks - 1)) this.incHeat(1);
    } else if (this.id === 'minigun' && this.ticks % 5 === 4) {
      this.incHeat(-1);
    }
    this.ticks++;
    if (this.state === 'fire' && this.ticks >= this.fireTicks) {
      this.state = 'idle';
      this.ticks = 0;
      if (this.bullets <= 0) this.startReload();
    }
    if (this.state === 'reload' && this.ticks >= this.def.reloadTicks) {
      this.state = 'idle';
      this.ticks = 0;
      this.bullets = this.def.clip;
    }
    audio.weaponTick({
      playerId: this.playerId,
      id: this.id,
      state: this.state,
      ticks: this.ticks,
      fireTicks: this.fireTicks,
      reloadTicks: this.def.reloadTicks,
      firingHeld: held,
      x: this.x,
    });
  }

  startReload(): void {
    if (this.state !== 'idle' || this.bullets === this.def.clip) return;
    this.state = 'reload';
    this.ticks = 0;
    bus.emit('reloadStart', { playerId: this.playerId, weapon: this.id });
    if (this.id === 'magnum') this.eject(6);
  }

  private incHeat(d: number): void {
    this.heat = Math.max(0, Math.min(20, this.heat + d));
    this.fireTicks = 13 - Math.floor(this.heat / 2);
  }
}

// ------------------------------------------------------------ enemies

let nextId = 1000;
function spawn(type: EnemyType, x = -21, boss = false): number {
  const id = nextId++;
  enemyX.set(id, x);
  bus.emit('enemySpawn', { enemyId: id, type, boss });
  return id;
}
function hit(id: number, type: EnemyType, part: HitPart, damage: number, bullet = true): void {
  const x = enemyX.get(id) ?? -5;
  bus.emit('hit', { enemyId: id, type, point: v3(x + rand(-0.3, 0.3), 1, 0), dirX: -1, dirZ: 0, damage, part, bullet });
}
function die(id: number, type: EnemyType, kind: DeathKind, explosion?: V3): void {
  const x = enemyX.get(id) ?? -5;
  bus.emit('enemyDeath', { enemyId: id, type, kind, point: v3(x, 0.8, 0), dirX: -1, dirZ: 0, force: 100, explosion });
  enemyX.delete(id);
}

// ------------------------------------------------------------ sequences

const SEQUENCES: Record<string, () => Promise<void>> = {
  'Minigun burst (4 s, max heat, wind-down)': async () => {
    const w = new SimWeapon('minigun');
    await ticks(200, () => w.tick(true));
    await ticks(120, () => w.tick(false));
  },
  'Minigun: belt runs dry → reload': async () => {
    const w = new SimWeapon('minigun', 0, 25);
    await ticks(140, () => w.tick(true));
    await ticks(100, () => w.tick(false));
  },
  'Shotgun: 2 shots + shell-by-shell reload': async () => {
    const w = new SimWeapon('shotgun', 0, 2);
    await ticks(90, () => w.tick(true));
    await ticks(150, () => w.tick(false));
  },
  'Vintage: hammers, delayed double shot, reload': async () => {
    const w = new SimWeapon('vintage');
    await ticks(120, (t) => w.tick(t < 2));
  },
  'AWP: shot + bolt/reload': async () => {
    const w = new SimWeapon('awp', 0, 1);
    await ticks(200, (t) => w.tick(t < 2));
  },
  'Every weapon: empty a clip + reload': async () => {
    for (const id of WEAPON_ORDER) {
      log(`  ${id}`);
      const def = WEAPONS[id];
      const w = new SimWeapon(id, 0, Math.min(def.clip, 3 * def.perShot));
      const n = 3 * def.fireTicks + def.reloadTicks + 20;
      await ticks(n, () => w.tick(true));
      bus.emit('weaponSwitch', { playerId: 0, weapon: id });
    }
  },
  'Grenade: throw, bounces, explosion with gibs': async () => {
    const ids = [spawn('seal', -6), spawn('seal', -5.5), spawn('penguin', -5), spawn('activist', -6.5), spawn('seal', -4.8), spawn('fatseal', -7)];
    const w = new SimWeapon('grenades');
    await ticks(10, (t) => w.tick(t === 0));
    const pos = v3(-5.5, 0, 0);
    await wait(300);
    bus.emit('grenadeBounce', { pos, strength: 1 });
    await wait(260);
    bus.emit('grenadeBounce', { pos, strength: 0.6 });
    await wait(160);
    bus.emit('grenadeBounce', { pos, strength: 0.3 });
    await wait(300);
    bus.emit('explosion', { pos, radius: 4.7, weapon: 'grenades' });
    for (const id of ids.slice(0, 4)) hit(id, 'seal', 'body', 250, false);
    die(ids[0], 'seal', 'gib', pos);
    die(ids[1], 'seal', 'gib', pos);
    die(ids[2], 'penguin', 'gib', pos);
    die(ids[3], 'activist', 'gib', pos);
    die(ids[4], 'seal', 'blast', pos);
    die(ids[5], 'fatseal', 'blast', pos);
    await ticks(60, () => w.tick(false));
    await wait(1500);
  },
  'Shotgun pellets: 3 blasts into a seal pack': async () => {
    const seals = [spawn('seal', -8), spawn('seal', -7), spawn('activist', -9)];
    const w = new SimWeapon('shotgun');
    await ticks(130, (t) => {
      w.tick(t % 42 === 0);
      if (t % 42 === 0) {
        for (let p = 0; p < 8; p++) {
          const id = seals[p % 3];
          hit(id, p % 3 === 2 ? 'activist' : 'seal', p === 0 ? 'head' : 'body', 40);
        }
      }
    });
    die(seals[0], 'seal', 'headshot');
    die(seals[1], 'seal', 'normal');
    die(seals[2], 'activist', 'headoff');
    await wait(1200);
  },
  'Seal deaths: normal, headshot, crawl, kick, stomp, gib': async () => {
    const kinds: DeathKind[] = ['normal', 'headshot', 'crawl', 'kick', 'stomp', 'gib'];
    for (const k of kinds) {
      const id = spawn('seal', rand(-12, 4));
      if (k === 'kick') bus.emit('playerKick', { playerId: 0, enemyId: id });
      if (k === 'stomp') bus.emit('playerJump', { playerId: 0 });
      log(`  seal ${k}`);
      die(id, 'seal', k);
      await wait(900);
    }
  },
  'Seal pain: big non-fatal hit (magnum)': async () => {
    bus.emit('levelStart', { num: 1 });
    const id = spawn('seal', -6);
    hit(id, 'seal', 'body', 30); // > half of 47 → cries
    await wait(700);
    hit(id, 'seal', 'body', 10);
    await wait(500);
  },
  'Penguin spawn (two quacks)': async () => {
    spawn('penguin', -21);
    await wait(900);
    spawn('penguin', -21);
    spawn('penguin', -21);
    await wait(900);
  },
  'Polar bear: spawn, pain, death': async () => {
    const id = spawn('bear', -21);
    await wait(1100);
    enemyX.set(id, -10);
    for (let i = 0; i < 3; i++) {
      hit(id, 'bear', 'body', 60);
      bus.emit('enemyPain', { enemyId: id, type: 'bear' });
      await wait(450);
    }
    die(id, 'bear', 'normal');
    await wait(1300);
  },
  'Activist: cub shot out (spout + panic)': async () => {
    const id = spawn('activist', -9);
    hit(id, 'activist', 'cub', 18);
    bus.emit('cubShotOut', { enemyId: id, point: v3(-8.7, 1.1, 0) });
    await wait(2200);
    hit(id, 'activist', 'body', 18);
    die(id, 'activist', 'normal');
    await wait(1200);
  },
  'Activist: cub + fatal shot same tick (no spout)': async () => {
    const id = spawn('activist', -9);
    bus.emit('cubShotOut', { enemyId: id, point: v3(-8.7, 1.1, 0) });
    hit(id, 'activist', 'head', 900);
    die(id, 'activist', 'headoff');
    await wait(1400);
  },
  'Turtle: ricochets, hide, death': async () => {
    const id = spawn('turtle', -8);
    for (let i = 0; i < 4; i++) {
      bus.emit('ricochet', { point: v3(-7.5, 1, 0), enemyId: id });
      await wait(220);
    }
    bus.emit('turtleHide', { enemyId: id });
    await wait(600);
    hit(id, 'turtle', 'head', 400);
    die(id, 'turtle', 'normal');
    await wait(800);
  },
  'Walrus: spawn, charge, rush, devour, death': async () => {
    const id = spawn('walrus', -21, true);
    await wait(1800);
    enemyX.set(id, -13);
    bus.emit('walrusCharge', { enemyId: id });
    await wait(1200);
    bus.emit('walrusRush', { enemyId: id });
    await wait(500);
    enemyX.set(id, playerX[0]);
    bus.emit('walrusDevour', { enemyId: id, playerId: 0 });
    bus.emit('playerDeath', { playerId: 0, by: 'walrus' });
    bus.emit('gameOver', { reason: 'dead' });
    await wait(1800);
    hit(id, 'walrus', 'body', 855);
    die(id, 'walrus', 'normal');
    await wait(1800);
  },
  'Player: jump, kick, hurt, nice shots, buy AWP, death': async () => {
    bus.emit('playerJump', { playerId: 0 });
    await wait(400);
    bus.emit('playerKick', { playerId: 0, enemyId: 1 });
    await wait(600);
    bus.emit('playerHurt', { playerId: 0, damage: 150 });
    await wait(700);
    for (const n of [1, 3, 8]) {
      bus.emit('niceShot', { playerId: 0, n });
      await wait(1300);
    }
    bus.emit('buy', { playerId: 0, weapon: 'awp' });
    bus.emit('weaponSwitch', { playerId: 0, weapon: 'awp' });
    await wait(1200);
    bus.emit('playerDeath', { playerId: 0, by: 'explosion' });
    await wait(1100);
  },
  'Level splash + menu sounds': async () => {
    bus.emit('levelSplash', { num: 2, name: 'Level 2' });
    await wait(400);
    for (let i = 0; i < 3; i++) {
      audio.play('ui/buttonmove');
      await wait(200);
    }
    audio.play('ui/change');
    await wait(600);
  },
  'Stress: 200 gibs at once (voice limit)': async () => {
    for (let i = 0; i < 200; i++) audio.playRandom('misc/gib', { x: rand(-20, 20) });
    sample();
    await wait(400);
  },
  'Stress: 400 random sounds in 1 s': async () => {
    const names = audio.soundNames.filter((n) => !n.startsWith('ui/'));
    await ticks(50, () => {
      for (let i = 0; i < 8; i++) audio.play(names[Math.floor(Math.random() * names.length)], { x: rand(-20, 20) });
    });
    await wait(500);
  },
  'Pause menu: suspend mid-burst, ui sound, resume': async () => {
    const w = new SimWeapon('mp5');
    await ticks(25, () => w.tick(true));
    audio.suspend();
    await ticks(10, () => audio.play('ui/buttonmove'));
    audio.play('weapons/2/fire1'); // ignored while paused
    await wait(400);
    audio.resume();
    await ticks(25, () => w.tick(true));
    await wait(400);
  },
};

let running: Promise<unknown> = Promise.resolve();
async function runSequence(name: string): Promise<Peak & { errors: string[]; ms: number }> {
  const fn = SEQUENCES[name];
  if (!fn) throw new Error(`no sequence ${name}`);
  const job = running.then(async () => {
    peak = newPeak();
    const t0 = performance.now();
    const errs0 = errors.length;
    log(`▶ ${name}`);
    try {
      await fn();
    } catch (err) {
      errors.push(String(err));
    }
    const res = { ...peak, errors: errors.slice(errs0), ms: Math.round(performance.now() - t0) };
    const grp = Object.entries(res.maxPerGroup)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g, c]) => `${g}:${c}`)
      .join(' ');
    log(
      `  peak voices ${res.total} (one-shots ${res.oneShots}, loops ${res.loops}), max/name ${res.maxPerName} ${res.maxName}, top groups ${grp}`,
      res.oneShots > MAX_VOICES || res.maxPerName > MAX_PER_NAME || res.errors.length > 0,
    );
    return res;
  });
  running = job.catch(() => {});
  return job;
}

// ------------------------------------------------------------ UI

const seqBox = $('seqs');
for (const name of Object.keys(SEQUENCES)) {
  const b = document.createElement('button');
  b.className = 'seq';
  b.textContent = name;
  b.onclick = () => {
    audio.unlock();
    void runSequence(name);
  };
  seqBox.append(b);
}

const panX = $<HTMLInputElement>('panx');
panX.oninput = () => ($('panxv').textContent = panX.value);
const soundsBox = $('sounds');
const byDir = new Map<string, string[]>();
for (const n of audio.soundNames) {
  const dir = n.includes('/') ? n.slice(0, n.lastIndexOf('/')) : '(root)';
  byDir.set(dir, [...(byDir.get(dir) ?? []), n]);
}
for (const [dir, names] of byDir) {
  const h = document.createElement('h3');
  h.textContent = dir;
  const g = document.createElement('div');
  g.className = 'grid';
  for (const n of names) {
    const b = document.createElement('button');
    b.textContent = n.slice(n.lastIndexOf('/') + 1);
    b.title = `${n} (group ${groupOf(n)})`;
    b.dataset.sound = n;
    b.onclick = () => {
      audio.unlock();
      audio.play(n, { x: Number(panX.value), rate: 1 });
    };
    g.append(b);
  }
  soundsBox.append(h, g);
}

$('unlock').onclick = () => audio.unlock();
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
const master = $<HTMLInputElement>('master');
const sfx = $<HTMLInputElement>('sfx');
const amb = $<HTMLInputElement>('amb');
const applyVol = () => audio.setVolumes(Number(master.value), Number(sfx.value), true);
master.oninput = sfx.oninput = applyVol;
amb.onchange = () => (amb.checked ? audio.startAmbience() : audio.stopAmbience());
const pause = $<HTMLInputElement>('pause');
pause.onchange = () => (pause.checked ? audio.suspend() : audio.resume());

const meter = $('meter');
const cells: HTMLElement[] = [];
for (let i = 0; i < MAX_VOICES; i++) cells.push(meter.appendChild(document.createElement('i')));
const voicesEl = $('voices');
function frame(): void {
  const s = audio.voiceStats();
  const one = s.total - s.loops;
  for (let i = 0; i < cells.length; i++) cells[i].className = i < one ? 'on' : i < one + s.loops ? 'loop' : '';
  const st = audio.stats;
  voicesEl.innerHTML = `voices <b>${s.total}</b> (loops ${s.loops}) · peak <b>${st.peakVoices}</b> · played ${st.played} · stolen ${st.stolen} · dropped ${st.dropped} · ctx ${(audio.ctx as AudioContext | null)?.state ?? 'none'}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const status = $('status');
const loaded = audio.load((d, t) => (status.textContent = `loading ${d}/${t}…`)).then(() => {
  const f = audio.failedSounds;
  status.innerHTML = `loaded <b>${audio.loadedCount}</b>/${audio.totalCount} sounds${f.length ? ` · <span class="bad">failed: ${f.join(', ')}</span>` : ''}`;
});

declare global {
  interface Window {
    __preview: {
      audio: AudioSystem;
      bus: EventBus;
      loaded: Promise<void>;
      sequences: string[];
      runSequence: typeof runSequence;
      errors: string[];
      AudioSystem: typeof AudioSystem;
    };
  }
}
window.__preview = { audio, bus, loaded, sequences: Object.keys(SEQUENCES), runSequence, errors, AudioSystem };
