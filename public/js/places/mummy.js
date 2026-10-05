// "The Mummy". The title is on this recreation's Games page, but no 2007-2009
// ROBLOX place of that name could be identified (docs/RESEARCH.md, Games), so
// everything here is a reconstruction in the style of 2008 round-based games:
// a desert with a stepped brick pyramid, a tomb, obelisks and brick palm
// trees; one player is picked as the Mummy and every Explorer the Mummy
// touches turns into a mummy too. Explorers win by surviving the clock.
// Messages and Hints are used the way 2008 places used them (no GUIs).
import * as THREE from 'three';
import { BotBrain, pick } from '../engine/Bots.js';
import { sounds } from '../engine/Sound.js';
import { spawnLocation } from './common.js';

const SAND = 5, SAND2 = 226, STONE = 199, STONE2 = 194;
const ROUND = 120;
const PYR = { x: 0, z: -70, size: 84, layers: 10, step: 4 };
const CHAMBER = 24; // tomb room width (layers 0-2 are hollow)
const MUMMY_LOOK = { colors: { head: 1, torso: 1, leftArm: 1, rightArm: 1, leftLeg: 1, rightLeg: 1 }, face: 'Smile', hats: [], shirt: { style: 'wrap' }, pants: { style: 'wrap' }, tshirt: null };

let S = null;

function slab(world, x0, x1, y0, y1, z0, z1, color) {
  if (x1 - x0 < 0.01 || z1 - z0 < 0.01) return;
  world.brick([x1 - x0, y1 - y0, z1 - z0], [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], color);
}

function pyramid(world) {
  const { x: cx, z: cz, size, layers, step } = PYR;
  const half = CHAMBER / 2, door = 3;
  for (let i = 0; i < layers; i++) {
    const h = size / 2 - i * step;
    const y0 = i * step, y1 = y0 + step;
    const color = i % 2 ? SAND2 : SAND;
    if (i < 3) {
      // hollow ring around the tomb; the entrance corridor cuts the +Z side on the bottom two layers
      slab(world, cx - h, cx + h, y0, y1, cz - h, cz - half, color); // back
      slab(world, cx - h, cx - half, y0, y1, cz - half, cz + half, color); // left
      slab(world, cx + half, cx + h, y0, y1, cz - half, cz + half, color); // right
      if (i < 2) {
        slab(world, cx - h, cx - door, y0, y1, cz + half, cz + h, color);
        slab(world, cx + door, cx + h, y0, y1, cz + half, cz + h, color);
      } else {
        slab(world, cx - h, cx + h, y0, y1, cz + half, cz + h, color);
      }
    } else {
      slab(world, cx - h, cx + h, y0, y1, cz - h, cz + h, color);
    }
  }
  // capstone
  world.brick([4, 3, 4], [cx, layers * step + 1.5, cz], 24);
  // inside: a stone floor, torches and the sarcophagus
  world.brick([CHAMBER, 0.4, CHAMBER], [cx, 0.2, cz], STONE, { top: 'Smooth' });
  world.brick([6, 0.4, 2 * (size / 2 - half)], [cx, 0.2, cz + half + (size / 2 - half)], STONE, { top: 'Smooth' });
  world.brick([4, 2.4, 9], [cx, 1.6, cz - 6], 24);
  world.brick([4.4, 0.6, 9.4], [cx, 3.1, cz - 6], 105);
  world.brick([2, 0.4, 2], [cx, 3.6, cz - 9], 24, { top: 'Smooth' });
  for (const [x, z] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
    world.brick([1, 4, 1], [cx + x, 2.4, cz + z], 192);
    world.add({ shape: 'Ball', size: [1.2, 1.2, 1.2], position: [cx + x, 5, cz + z], color: 105, transparency: 0.2 });
  }
  return { tomb: new THREE.Vector3(cx, 0.4, cz + 4), door: new THREE.Vector3(cx, 0.4, cz + size / 2 + 4) };
}

function obelisk(world, x, z) {
  world.brick([5, 1.2, 5], [x, 0.6, z], STONE);
  world.brick([3, 18, 3], [x, 10.2, z], SAND2);
  world.brick([2, 1.6, 2], [x, 20, z], 24);
  world.brick([1, 1, 1], [x, 21.3, z], 24);
}

function palm(world, x, z, lean = 0) {
  for (let i = 0; i < 7; i++) world.brick([1.6, 2, 1.6], [x + lean * i * 0.35, 1 + i * 2, z], i % 2 ? 192 : 38, { top: 'Smooth', bottom: 'Smooth' });
  const tx = x + lean * 7 * 0.35, ty = 14.5;
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3;
    world.brick([7, 0.4, 1.6], [tx + Math.cos(a) * 3.2, ty - 0.6, z + Math.sin(a) * 3.2], 28, { rotation: [0, -a * 180 / Math.PI, -14] });
  }
  world.brick([2, 1, 2], [tx, ty, z], 37);
}

function temple(world, x, z) {
  world.brick([30, 1.2, 20], [x, 0.6, z], STONE2);
  for (let i = 0; i < 6; i++) for (const zz of [-8, 8]) world.add({ shape: 'Cylinder', size: [12, 2, 2], position: [x - 12.5 + i * 5, 7.2, z + zz], rotation: [0, 0, 90], color: STONE2 });
  world.brick([32, 1.6, 22], [x, 14, z], STONE);
  world.brick([26, 1.6, 16], [x, 15.6, z], STONE2);
}

export default {
  build(world, ctx = {}) {
    world.brick([512, 1.2, 512], [0, -0.6, 0], SAND);
    const pyr = pyramid(world);
    obelisk(world, -10, PYR.z + PYR.size / 2 + 14);
    obelisk(world, 10, PYR.z + PYR.size / 2 + 14);
    for (const [x, z, l] of [[-60, 10, 1], [-48, 40, -1], [55, 25, 1], [70, -20, -1], [-80, -60, 1], [86, -90, 1], [-30, 80, 1], [40, 90, -1]]) palm(world, x, z, l);
    temple(world, -90, 60);
    temple(world, 95, 70);
    // dunes and ruins
    for (const [x, z, w, h] of [[30, 50, 20, 2], [-20, 110, 26, 3], [100, -10, 18, 2.4], [-110, -10, 22, 2], [0, 140, 30, 2.4]]) {
      world.brick([w, h, w * 0.6], [x, h / 2, z], SAND2, { top: 'Smooth' });
    }
    for (const [x, z] of [[60, 120], [-70, 120], [120, 40]]) {
      world.brick([2, 6, 2], [x, 3, z], STONE2); world.brick([2, 3, 2], [x + 6, 1.5, z], STONE2); world.brick([10, 1.2, 2], [x + 3, 6.6, z], STONE2);
    }
    const explorerSpawns = [[-16, 70], [0, 76], [16, 70], [-8, 90], [8, 90]].map(([x, z]) => spawnLocation(world, x, 1.21, z, { color: 23, yaw: 0 }));
    const tombSpawn = spawnLocation(world, PYR.x, 1.21, PYR.z + 4, { color: 1, yaw: Math.PI });
    S = { pyr, explorerSpawns, tombSpawn, phase: 'wait', timer: 5, teams: null };
    return { thumbnail: { cam: [60, 30, 90], look: [0, 12, -40] } };
  },

  setup(game) {
    game.setStats(['Survivals', 'Infections']);
    const explorers = game.addTeam('Explorers', 23);
    const mummies = game.addTeam('Mummy', 1);
    S.teams = { explorers, mummies };
    for (const sp of S.explorerSpawns) game.addSpawn(sp, { team: explorers });
    game.addSpawn(S.tombSpawn, { team: mummies });
    game.on('playerAdded', (p) => {
      // joiners mid-round become explorers (or wait for the next round)
      game.setTeam(p, explorers);
      if (p.isBot) p.brain = new MummyBrain(game, p);
    });
    game.setHint('Waiting for players...');
  },

  update(game, dt) {
    if (!S.teams) return;
    const { explorers, mummies } = S.teams;
    S.timer -= dt;
    if (S.phase === 'wait') {
      if (game.players.length >= 2 && S.timer <= 0) {
        S.phase = 'choosing';
        S.timer = 3;
        game.showMessage('Choosing the Mummy...', 3);
      } else if (S.timer <= 0) S.timer = 2;
      return;
    }
    if (S.phase === 'choosing') {
      if (S.timer > 0) return;
      const mummy = pick(game.players);
      for (const p of game.players) {
        const isM = p === mummy;
        p.appearanceOverride = isM ? MUMMY_LOOK : null;
        game.setTeam(p, isM ? mummies : explorers);
        game.spawnPlayer(p);
      }
      game.showMessage(`${mummy.name} is the Mummy! Run!`, 3);
      sounds.play('groan', null, 0.8);
      S.phase = 'round';
      S.timer = ROUND;
      return;
    }
    if (S.phase === 'round') {
      // the mummy's touch
      const ms = game.players.filter((p) => p.team === mummies && p.character?.alive);
      const ex = game.players.filter((p) => p.team === explorers && p.character?.alive);
      for (const m of ms) {
        const mp = m.character.rootPosition;
        for (const e of ex) {
          const c = e.character;
          if (!c?.alive || e.team !== explorers) continue;
          if (c.rootPosition.distanceTo(mp) < 3.4) infect(game, e, m);
        }
      }
      const left = game.players.filter((p) => p.team === explorers);
      game.setHint(`Time left: ${Math.max(0, Math.ceil(S.timer))}      Explorers left: ${left.length}`);
      if (!left.length) {
        game.showMessage('The Mummy has claimed everyone!', 4);
        sounds.play('groan', null, 0.8);
        endRound(game);
      } else if (S.timer <= 0) {
        for (const p of left) p.stats.Survivals++;
        game.showMessage(`The explorers survived! (${left.map((p) => p.name).join(', ')})`, 4);
        sounds.play('victory', null, 0.7);
        endRound(game);
      }
    }
  },
};

function infect(game, victim, by) {
  const pos = victim.character.rootPosition.clone();
  by.stats.Infections++;
  victim.appearanceOverride = MUMMY_LOOK;
  game.setTeam(victim, S.teams.mummies);
  victim.spawnOverride = { position: pos.setY(pos.y - 3), yaw: victim.character.facing };
  const ch = game.spawnPlayer(victim);
  victim.spawnOverride = null;
  ch.removeForceField();
  sounds.play('groan', pos, 0.6);
  game.systemChat(`${victim.name} was turned into a mummy by ${by.name}!`);
  game.gui?.onPlayersChanged();
}

function endRound(game) {
  S.phase = 'wait';
  S.timer = 6;
  game.gui?.onPlayersChanged();
  game.world.delay(4, () => {
    for (const p of game.players) {
      p.appearanceOverride = null;
      game.setTeam(p, S.teams.explorers);
      game.spawnPlayer(p);
    }
    game.setHint('Waiting for the next round...');
  });
}

// Simulated players: mummies chase the nearest explorer, explorers run away
// from the nearest mummy (and are not always smart about it).
class MummyBrain extends BotBrain {
  constructor(game, player) {
    super(game, player, { chattiness: 0.7, wanderRadius: 50 });
    this.allowGapJumps = true;
    this.panic = 0.6 + Math.random() * 0.4;
  }
  idleChat() {
    const m = this.player.team === S.teams?.mummies;
    this.say(m ? pick(['braaains', 'im gonna get u', 'come here', 'mummy power!']) : pick(['RUN!!!', 'hide in the temple', 'the mummy is coming', 'dont let him get u', 'lol']));
  }
  think() {
    const ch = this.ch;
    const p = ch.rootPosition;
    const mummies = S.teams?.mummies;
    if (!mummies || S.phase !== 'round') { super.think(); return; }
    const inTomb = Math.abs(p.x - PYR.x) < CHAMBER / 2 + 1 && Math.abs(p.z - PYR.z) < PYR.size / 2 && p.y < 9;
    if (this.player.team === mummies) {
      let best = null, bd = Infinity;
      for (const o of this.game.players) {
        if (o.team === mummies || !o.character?.alive) continue;
        const d = o.character.rootPosition.distanceTo(p);
        if (d < bd) { bd = d; best = o; }
      }
      if (!best) { this.target = null; return; }
      this.arriveRadius = 0.5;
      this.target = best.character.rootPosition.clone();
      // leave the tomb by the corridor first
      if (inTomb && Math.abs(this.target.z - PYR.z) > CHAMBER / 2) this.target = S.pyr.door.clone();
      return;
    }
    // explorer: flee the closest mummy
    let near = null, nd = 45;
    for (const o of this.game.players) {
      if (o.team !== mummies || !o.character?.alive) continue;
      const d = o.character.rootPosition.distanceTo(p);
      if (d < nd) { nd = d; near = o; }
    }
    if (near && Math.random() < this.panic) {
      const away = p.clone().sub(near.character.rootPosition).setY(0).normalize();
      const side = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar((Math.random() - 0.5) * 1.2);
      this.target = p.clone().addScaledVector(away.add(side).normalize(), 25);
      this.target.x = Math.max(-200, Math.min(200, this.target.x));
      this.target.z = Math.max(-200, Math.min(200, this.target.z));
    } else if (!this.target || this.reached()) {
      super.think();
    }
  }
}
