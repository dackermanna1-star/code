// "The New Robloxian Obstical Course(Grand Opening)" by legobuild -- a real
// title on the 2008 Games page. Its contents were never archived, so this
// course is a reconstruction built only from obstacle types 2008 obbies could
// contain (docs/RESEARCH.md, "Obstacle courses"): lava kill bricks, stepping
// stones, narrow paths, fading platforms (Shedletsky's "Sweeper" cycle),
// a conveyor (an anchored part with Velocity), a spinning bar, a ladder of
// rungs (no trusses before 2009), beam walks, moving platforms, team-coloured
// SpawnLocations as checkpoints and a winners' room with tool givers.
import * as THREE from 'three';
import { BotBrain, pick } from '../engine/Bots.js';
import { Sword, RocketLauncher, PaintballGun } from '../engine/Tools.js';
import { sounds } from '../engine/Sound.js';
import { spawnLocation, makeLava, ladder, toolGiver, sign } from './common.js';

const LAVA = 21, STONE = 194, DARK = 199;
const TOP = 1.2; // course height above the lava field
const HIGH = 31.2; // tower tops

let S = null;

function plate(world, x0, x1, z0, z1, color = STONE, y = TOP) {
  return world.brick([x1 - x0, 1.2, z1 - z0], [(x0 + x1) / 2, y - 0.6, (z0 + z1) / 2], color);
}

export default {
  build(world, ctx = {}) {
    S = { lava: [], checkpoints: [], faders: [], movers: [], spinner: null, conveyor: null, givers: [], finish: null };
    // the floor is lava
    const lavaField = world.add({ name: 'Lava', size: [400, 1.2, 600], position: [0, -0.6, -200], color: LAVA, tags: ['deadly'] });
    S.lava.push(lavaField);

    // start
    plate(world, -15, 15, 0, 30);
    S.checkpoints.push({ stage: 1, spawns: [spawnLocation(world, -6, TOP + 1.2, 18), spawnLocation(world, 6, TOP + 1.2, 18)] });
    // signs on posts, facing the players at the start
    sign(world, 0, 10, 1, 18, 6, 'The New Robloxian\nObstical Course', { bg: '#0d69ac', fg: '#ffffff', face: 'Back' });
    for (const x of [-8.5, 8.5]) world.brick([0.8, 5.8, 0.8], [x, TOP + 2.9, 1], 192);
    sign(world, -11, 5.2, 8, 7, 3, 'GRAND OPENING!!', { bg: '#f5cd30', fg: '#c4281c', face: 'Back' });
    sign(world, 11, 5.2, 8, 7, 3, 'Dont touch the\nred bricks!', { bg: '#ffffff', fg: '#c4281c', face: 'Back' });
    for (const x of [-11, 11]) world.brick([0.6, 2.5, 0.6], [x, TOP + 1.25, 8], 192);

    // stage 1: stepping stones over lava
    [-4, -11, -18, -25, -32, -39].forEach((z, i) => world.brick([4, 1.2, 4], [(i % 2 ? 3 : -3), TOP - 0.6, z - 2], [STONE, 23, 24, 37][i % 4]));
    plate(world, -8, 8, -60, -44);
    S.checkpoints.push({ stage: 2, spawns: [spawnLocation(world, 0, TOP + 1.2, -55, { color: 23 })] });

    // stage 2: a narrow zig-zag path through the lava
    const path = [[0, -60, 0, -68], [0, -68, 8, -68], [8, -68, 8, -80], [8, -80, -8, -80], [-8, -80, -8, -92], [-8, -92, 0, -92], [0, -92, 0, -100]];
    for (const [x0, z0, x1, z1] of path) {
      const w = 2;
      plate(world, Math.min(x0, x1) - w / 2, Math.max(x0, x1) + w / 2, Math.min(z0, z1) - (z0 === z1 ? w / 2 : 0), Math.max(z0, z1) + (z0 === z1 ? w / 2 : 0), DARK);
    }
    plate(world, -8, 8, -116, -100);

    // stage 3: fading bricks, four groups cycling solid -> gone (the "Sweeper")
    for (let i = 0; i < 6; i++) {
      const p = world.brick([6, 1.2, 6], [(i % 2 ? 2 : -2), TOP - 0.6, -120.5 - i * 7], 104);
      S.faders.push({ part: p, group: i % 4 });
    }
    plate(world, -8, 8, -176, -160);
    S.checkpoints.push({ stage: 3, spawns: [spawnLocation(world, 0, TOP + 1.2, -171, { color: 24 })] });

    // stage 4: a conveyor pushing you toward the lava
    S.conveyor = world.brick([6, 1.2, 50], [0, TOP - 0.6, -201], DARK, { top: 'Smooth', name: 'Conveyor' });
    S.conveyor.surfaceVelocity = new THREE.Vector3(6, 0, 0);
    plate(world, -8, 8, -242, -226);

    // stage 5: a spinning red bar over a round platform -- jump it
    world.add({ shape: 'Cylinder', size: [1.2, 30, 30], position: [0, TOP - 0.6, -259], rotation: [0, 0, 90], color: STONE });
    S.spinner = world.add({ name: 'SpinBar', size: [28, 1.2, 1.2], position: [0, TOP + 1.0, -259], color: LAVA, top: 'Smooth', bottom: 'Smooth' });
    world.brick([2, 2, 2], [0, TOP + 1, -259], DARK);
    plate(world, -8, 8, -300, -276);
    S.checkpoints.push({ stage: 4, spawns: [spawnLocation(world, 0, TOP + 1.2, -284, { color: 37 })] });

    // stage 6: climb the tower on a ladder of rungs
    world.brick([12, HIGH - TOP, 12], [0, (HIGH + TOP) / 2, -306], DARK);
    ladder(world, 0, TOP, -299.6, HIGH - TOP, [0, 1], { color: 192 });

    // stage 7: walk the beams to the second tower
    world.brick([1.2, 1.2, 12], [0, HIGH - 0.6, -318], STONE);
    world.brick([10, 1.2, 1.2], [4.4, HIGH - 0.6, -324], STONE);
    world.brick([1.2, 1.2, 14], [9, HIGH - 0.6, -330.4], STONE);
    world.brick([10, 1.2, 1.2], [4.4, HIGH - 0.6, -337], STONE);
    world.brick([1.2, 1.2, 8], [0, HIGH - 0.6, -341], STONE);
    world.brick([12, HIGH - TOP, 12], [0, (HIGH + TOP) / 2, -350], DARK);
    S.checkpoints.push({ stage: 5, spawns: [spawnLocation(world, 0, HIGH + 1.2, -350, { color: 106 })] });

    // stage 8: platforms sliding side to side
    [-362, -370, -378].forEach((z, i) => {
      const p = world.brick([6, 1.2, 6], [0, HIGH - 0.6, z], [23, 24, 37][i]);
      S.movers.push({ part: p, z, phase: i * 2.1 });
    });

    // the winners' room
    plate(world, -12, 12, -404, -384, 24, HIGH);
    world.brick([24, 8, 1.2], [0, HIGH + 4, -404], 24);
    S.winSign = sign(world, 0, HIGH + 5.5, -403.2, 14, 4, 'YOU WIN!!!\nBeat it to be cool', { bg: '#ffffff', fg: '#0d69ac', face: 'Back' });
    S.finish = world.add({ size: [24, 4, 20], position: [0, HIGH + 2, -394], transparency: 1, canCollide: false });
    [[-7, 'Sword', 199], [0, 'Rocket', 141], [7, 'PaintballGun', 23]].forEach(([x, name, color]) => {
      const pad = world.brick([4, 1.2, 4], [x, HIGH + 0.6, -400], color, { name: name + 'Giver' });
      S.givers.push({ part: pad, name });
    });
    S.checkpoints.push({ stage: 6, spawns: [spawnLocation(world, 0, HIGH + 1.2, -390, { color: 24 })] });
    return { thumbnail: { cam: [26, 22, 36], look: [0, 2, -40] } };
  },

  setup(game) {
    const world = game.world;
    game.setStats([]);
    const colors = [1, 23, 24, 37, 106, 24];
    S.teams = S.checkpoints.map((c, i) => game.addTeam(i === S.checkpoints.length - 1 ? 'Winners' : `Stage ${c.stage}`, colors[i]));
    S.checkpoints.forEach((c, i) => {
      for (const sp of c.spawns) {
        game.addSpawn(sp, { team: S.teams[i] });
        // touching a checkpoint moves you onto its team, so you respawn there
        sp.onTouched((ch) => {
          const p = ch.player;
          if (!p || !ch.alive) return;
          const cur = S.teams.indexOf(p.team);
          if (i > cur) {
            game.setTeam(p, S.teams[i]);
            if (p.isLocal) sounds.play('ping', null, 0.6);
          }
        });
      }
    });
    for (const l of S.lava) makeLava(l);
    makeLava(S.spinner);
    S.spinner.setKinematic();
    S.spinner.body.angularVelocity.set(0, 1.6, 0);
    for (const m of S.movers) m.part.setKinematic();
    toolGiverPads(game);
    S.finish.onTouched((ch) => {
      if (!ch.alive || !ch.player || ch.wonObby) return;
      ch.wonObby = true;
      if (ch.player.isLocal) { game.showMessage('You win! Congratulations!', 3); sounds.play('victory', null, 0.7); }
      else game.chat(ch.player, pick(['i won!!', 'YAY i beat it', 'finally lol', 'that was easy']));
    });
    game.on('playerAdded', (p) => {
      game.setTeam(p, S.teams[0]);
      if (p.isBot) p.brain = new ObbyBrain(game, p);
    });
  },

  update(game, dt) {
    const t = game.world.time;
    // fading bricks: each group steps through 0.5 -> 0.2 -> solid -> gone
    const step = Math.floor(t / 1.6);
    for (const f of S.faders) {
      const level = (step + f.group) % 4;
      if (f.level === level) continue;
      f.level = level;
      f.part.setTransparency([0.5, 0.2, 0, 1][level]);
      f.part.setCanCollide(level !== 3);
    }
    // sliding platforms
    for (const m of S.movers) {
      const b = m.part.body;
      const x = Math.sin(t * 0.9 + m.phase) * 9;
      const vx = Math.cos(t * 0.9 + m.phase) * 9 * 0.9;
      b.position.x = x;
      b.velocity.set(vx, 0, 0);
    }
  },
};

function toolGiverPads(game) {
  const make = { Sword: (g) => new Sword(g), Rocket: (g) => new RocketLauncher(g), PaintballGun: (g) => new PaintballGun(g) };
  for (const g of S.givers) toolGiver(game, g.part, make[g.name]);
}

// Simulated players run the course stage by stage, and fail now and then.
const ROUTE = [
  { p: [0, 2] }, { p: [-3, -6] }, { p: [3, -13] }, { p: [-3, -20] }, { p: [3, -27] }, { p: [-3, -34] }, { p: [3, -41] }, { p: [0, -52] },
  { p: [0, -68] }, { p: [8, -68] }, { p: [8, -80] }, { p: [-8, -80] }, { p: [-8, -92] }, { p: [0, -92] }, { p: [0, -108] },
  { p: [-2, -120.5], fader: 0 }, { p: [2, -127.5], fader: 1 }, { p: [-2, -134.5], fader: 2 }, { p: [2, -141.5], fader: 3 }, { p: [-2, -148.5], fader: 4 }, { p: [2, -155.5], fader: 5 }, { p: [0, -168] },
  { p: [-2.5, -190] }, { p: [-2.5, -210] }, { p: [-2, -230] }, { p: [0, -246] }, { p: [0, -272] }, { p: [0, -284] },
  { p: [0, -298], climb: true }, { p: [0, -306] }, { p: [0, -324] }, { p: [9, -324] }, { p: [9, -337] }, { p: [0, -337] }, { p: [0, -350] },
  { p: [0, -362], mover: 0 }, { p: [0, -370], mover: 1 }, { p: [0, -378], mover: 2 }, { p: [0, -392] },
];

class ObbyBrain extends BotBrain {
  constructor(game, player) {
    super(game, player, { chattiness: 0.8 });
    this.allowGapJumps = true;
    this.step = -1;
    this.arriveRadius = 1.2;
    this.skill = 0.82 + Math.random() * 0.16;
    this.waitTimer = 0;
  }
  idleChat() { if (Math.random() < 0.6) this.say(pick(['this obby is hard', 'what stage r u on', 'i keep dying on the spinner', 'cool obby', 'lol', 'wait for me', 'how do u get past the conveyor'])); }
  think() {
    const ch = this.ch;
    const p = ch.rootPosition;
    if (this.step < 0 || this.lostTrack) {
      let best = 0, bd = Infinity;
      ROUTE.forEach((r, i) => { const d = Math.hypot(p.x - r.p[0], p.z - r.p[1]) + Math.abs((r.high ? HIGH : TOP) - (p.y - 3)) * 0.2; if (d < bd) { bd = d; best = i; } });
      this.step = best;
      this.lostTrack = false;
    }
    const r = ROUTE[this.step];
    if (this.reached() && this.step < ROUTE.length - 1) {
      const next = ROUTE[this.step + 1];
      // wait for the next fading brick to be solid
      if (next.fader != null) {
        const f = S.faders[next.fader];
        if (f.level !== 0 && f.level !== 1) { this.target = null; return; }
      }
      if (next.mover != null) {
        const m = S.movers[next.mover];
        if (Math.abs(m.part.position.x - p.x) > 2) { this.target = null; return; }
      }
      // sometimes they just mess up the jump
      if (Math.random() > this.skill) this.wobble = 0.5;
      this.step++;
    }
    const q = ROUTE[this.step];
    let tx = q.p[0];
    if (q.mover != null) tx = S.movers[q.mover].part.position.x;
    this.target = new THREE.Vector3(tx, p.y, q.p[1]);
  }
  update(dt) {
    super.update(dt);
    const ch = this.ch;
    if (!ch || !ch.alive) { this.step = -1; return; }
    // the spinning bar: hop when it comes round
    if (Math.abs(ch.rootPosition.z + 259) < 14 && ch.grounded && Math.random() < 0.08) ch.input.jump = true;
    if (this.wobble > 0) {
      this.wobble -= dt;
      ch.input.move.x += (Math.random() - 0.5) * 1.6;
    }
  }
}
