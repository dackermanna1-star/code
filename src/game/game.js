// Game state machine, main loop, environment blending and rendering.
import { RES_W, RES_H, LEVEL_H, CHUNK, PLAYER_R, PLAYER_H } from '../config.js';
import { strHash } from '../core/rng.js';
import { drawText } from '../gfx/font.js';
import { SPAWN } from '../world/gen/yellow.js';

const DEFAULT_ENV = { fog: [0.34, 0.3, 0.155], fogNear: 5, fogFar: 34, hum: 0.6, hvac: 0.5, reverb: 'room', tone: 'yellow' };

export class Game {
  constructor(o) {
    Object.assign(this, o);
    this.ctx = this.uic.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.state = 'boot';
    this.time = 0;
    this.last = 0;
    this.lastRender = 0;
    this.flicker = new this.Flicker();
    this.env = { ...DEFAULT_ENV, fog: [...DEFAULT_ENV.fog] };
    this.settings = { fps30: false, fov: 56, sens: 1, invertY: false, jitter: 1, dither: true, volume: 0.8, wide: false };
    this.debug = false;
    this.params = new URLSearchParams(location.search);
  }

  start() {
    const p = this.params;
    const seed = p.has('seed') ? (Number(p.get('seed')) >>> 0 || strHash(p.get('seed'))) : 0x5eed0001;
    this.newGame(seed);
    if (p.has('x')) {
      const dim = Number(p.get('dim') || 0);
      this.spawnAt(dim, Number(p.get('x')), Number(p.get('y') || 0), Number(p.get('z')), Number(p.get('yaw') || 0));
      if (p.has('pitch')) { this.player.pitch = this.player.tpitch = Number(p.get('pitch')); }
    }
    this.state = 'play';
    this.input.onUnlock = () => {};
    window.addEventListener('keydown', (e) => { if (e.code === 'F3') { this.debug = !this.debug; e.preventDefault(); } });
    this.glc.parentElement.addEventListener('click', () => { if (this.state === 'play' && !this.input.locked) this.input.lock(); });
    requestAnimationFrame((t) => this.frame(t));
  }

  newGame(seed) {
    if (this.world) this.world.unloadAll();
    this.seed = seed;
    this.world = new this.World(seed, this.texIndex, this.renderer);
    if (this.params.has('force')) this.world.zones.forceType = this.params.get('force');
    if (this.params.has('piece')) this.world.zones.forcePiece = this.params.get('piece');
    this.player = new this.Player(this.world);
    this.spawnAt(0, SPAWN[0] + 0.5, 0, SPAWN[1] + 0.5, 0);
  }

  // direction with the longest unobstructed view at eye height
  bestYaw() {
    const p = this.player, tmp = [];
    let best = 0, bestD = -1;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const fx = Math.sin(a), fz = -Math.cos(a);
      let d = 0;
      for (; d < 40; d += 0.5) {
        const x = p.x + fx * d, z = p.z + fz * d, y = p.y + 1.4;
        this.world.queryBoxes(p.dim, x - 0.1, y - 0.1, z - 0.1, x + 0.1, y + 0.1, z + 0.1, tmp);
        if (tmp.length) break;
      }
      if (d > bestD) { bestD = d; best = a; }
    }
    return best;
  }

  // Load the area and place the player on a free floor spot near (x, z).
  spawnAt(dim, x, y, z, yaw) {
    const w = this.world;
    this.player.dim = dim;
    w.update(dim, x, y, z, 0, 40);
    const level = Math.floor((y + 0.05) / LEVEL_H);
    const tmp = [];
    for (let r = 0; r < 12; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = Math.floor(x) + dx + 0.5, cz = Math.floor(z) + dz + 0.5;
        const y0 = level * LEVEL_H;
        w.queryBoxes(dim, cx - PLAYER_R, y0 - 3, cz - PLAYER_R, cx + PLAYER_R, y0 + 4, cz + PLAYER_R, tmp);
        // find highest floor top <= y0 + 1.5 with free headroom above it
        let best = null;
        for (let k = 0; k < tmp.length; k += 7) {
          const top = tmp[k + 4];
          if (top > y0 + 1.5 || top < y0 - 3) continue;
          if (best === null || top > best) {
            let blocked = false;
            for (let j = 0; j < tmp.length; j += 7) {
              if (tmp[j + 1] < top + PLAYER_H && tmp[j + 4] > top + 0.01) { blocked = true; break; }
            }
            if (!blocked) best = top;
          }
        }
        if (best !== null) {
          this.player.setPos(cx, best + 0.001, cz, yaw);
          return true;
        }
      }
    }
    this.player.setPos(x, y, z, yaw);
    return false;
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const tsec = now / 1000;
    if (!this.last) this.last = tsec;
    if (this.settings.fps30 && now - this.lastRender < 1000 / 30 - 3) return;
    this.lastRender = now;
    const dt = Math.min(0.1, tsec - this.last);
    this.last = tsec;
    this.time += dt;
    const inp = this.input.poll();
    if (this.state === 'play') this.updatePlay(dt, inp);
    this.render(dt);
  }

  updatePlay(dt, inp) {
    const p = this.player;
    p.sens = 0.0023 * this.settings.sens;
    p.update(dt, inp);
    this.world.update(p.dim, p.x, p.y, p.z, 5);
    this.updateEnv(dt);
  }

  updateEnv(dt) {
    const p = this.player;
    const zone = this.world.zoneInfoAt(p.dim, p.x, p.y + 0.5, p.z);
    const target = (zone && zone.params && zone.params.env) || DEFAULT_ENV;
    this.zone = zone;
    const k = 1 - Math.exp(-dt * 0.9);
    for (let i = 0; i < 3; i++) this.env.fog[i] += (target.fog[i] - this.env.fog[i]) * k;
    this.env.fogNear += (target.fogNear - this.env.fogNear) * k;
    this.env.fogFar += (target.fogFar - this.env.fogFar) * k;
    this.env.hum = target.hum; this.env.hvac = target.hvac; this.env.reverb = target.reverb;
  }

  render() {
    const r = this.renderer;
    this.flicker.update(this.time);
    const cam = this.player.camera(this.time);
    cam.fov = (this.settings.fov * Math.PI) / 180;
    r.snapScale = this.settings.jitter;
    r.dither = this.settings.dither;
    r.begin(cam, { fogColor: this.env.fog, fogNear: this.env.fogNear, fogFar: this.env.fogFar, time: this.time, flick: this.flicker.v, bright: 1 });
    this.world.time = this.time;
    const n = this.world.draw(r, cam.dim, cam, this.env.fogFar, this.env.fogFar * 0.8);
    r.end();
    this.drawUI(n);
  }

  drawUI(n) {
    const c = this.ctx;
    c.clearRect(0, 0, RES_W, RES_H);
    if (this.debug) {
      const p = this.player, w = this.world;
      const lines = [
        `pos ${p.x.toFixed(1)} ${p.y.toFixed(2)} ${p.z.toFixed(1)} L${p.level()} d${p.dim}`,
        `zone ${this.zone ? this.zone.type + ':' + (this.zone.params.variant || '') : '-'}`,
        `chunks ${w.chunks.size} tris ${Math.round(r_tris(this))} draws ${this.renderer.stats.draws}`,
        `build ${w.stats.built} ${(w.stats.buildMs / Math.max(1, w.stats.built)).toFixed(1)}ms gen ${w.stats.genMs.toFixed(0)}ms`,
      ];
      lines.forEach((l, i) => drawText(c, l, 2, 2 + i * 9, '#ff0', 1, '#000'));
    }
    void n;
  }
}

function r_tris(g) { return g.renderer.stats.tris; }
void CHUNK;
