// Crossroads by ROBLOX (place 1818, map by Shedletsky, created 4/30/2007).
// Verified (docs/RESEARCH.md, Games): ROBLOX's first multiplayer game; four
// square sections -- Thieves' Den, Lost Temple, Blackrock Castle and the
// Playground -- joined by bridges; a red bar rotating in circles in the Lost
// Temple; players get Sword, Paintball Gun, Bomb, Superball, Slingshot,
// Trowel and Rocket Launcher; the stock KOs/Wipeouts leaderboard.
// Reconstructed: the buildings inside each section and exact dimensions.
import * as THREE from 'three';
import { FighterBrain, pick } from '../engine/Bots.js';
import { Sword, RocketLauncher, Superball, Slingshot, PaintballGun, Trowel, Timebomb } from '../engine/Tools.js';
import { spawnLocation } from './common.js';

const D = 72, SZ = 56; // section distance from the centre, section size
let S = null;

function island(world, x, z, color) {
  world.brick([SZ, 4, SZ], [x, -2, z], color);
}

function bridges(world) {
  world.brick([20, 4, 20], [0, -2, 0], 194); // the crossroads
  for (const [x, z, sx, sz] of [[0, -(10 + (D - SZ / 2 - 10) / 2), 8, D - SZ / 2 - 10], [0, 10 + (D - SZ / 2 - 10) / 2, 8, D - SZ / 2 - 10], [-(10 + (D - SZ / 2 - 10) / 2), 0, D - SZ / 2 - 10, 8], [10 + (D - SZ / 2 - 10) / 2, 0, D - SZ / 2 - 10, 8]]) {
    world.brick([sx, 1.2, sz], [x, -0.6, z], 192);
    // rails
    if (sx === 8) for (const o of [-3.6, 3.6]) world.brick([0.8, 2, sz], [x + o, 1, z], 217);
    else for (const o of [-3.6, 3.6]) world.brick([sx, 2, 0.8], [x, 1, z + o], 217);
  }
}

function thievesDen(world, x, z) {
  island(world, x, z, 192);
  // a ramshackle hideout with a crawl-through tunnel and crates of loot
  world.brick([20, 10, 1.2], [x - 6, 5, z - 10], 217); world.brick([20, 10, 1.2], [x - 6, 5, z + 10], 217);
  world.brick([1.2, 10, 21.2], [x - 16, 5, z], 217);
  world.brick([1.2, 4, 21.2], [x + 4, 8, z], 217);
  world.brick([22, 1.2, 22], [x - 6, 10.6, z], 192);
  for (const [cx, cz, s] of [[x + 14, z - 16, 4], [x + 18, z - 12, 3], [x + 15, z + 18, 4], [x - 8, z - 2, 3], [x - 12, z + 4, 4]]) world.brick([s, s, s], [cx, s / 2, cz], 38);
  world.brick([4, 6, 4], [x + 20, 3, z + 4], 217);
  world.brick([4, 1.2, 12], [x + 20, 6.6, z + 4], 192);
}

function lostTemple(world, x, z) {
  island(world, x, z, 199);
  // a stepped stone temple with pillars
  for (let i = 0; i < 3; i++) world.brick([30 - i * 6, 1.2, 30 - i * 6], [x, 0.6 + i * 1.2, z - 6], i % 2 ? 194 : 199);
  for (const [px, pz] of [[-10, -16], [10, -16], [-10, 4], [10, 4]]) world.add({ shape: 'Cylinder', size: [12, 2.4, 2.4], position: [x + px, 6, z + pz], rotation: [0, 0, 90], color: 194 });
  world.brick([24, 1.6, 24], [x, 12.8, z - 6], 199);
  // the rotating red bar
  const hub = world.brick([3, 3, 3], [x, 1.5, z + 16], 199);
  const bar = world.add({ name: 'RedBar', size: [36, 1.6, 1.6], position: [x, 2.2, z + 16], color: 21 });
  return { bar, hub };
}

function blackrockCastle(world, x, z) {
  island(world, x, z, 199);
  const H = 12;
  world.brick([1.6, H, 34], [x - 17, H / 2, z], 26); world.brick([1.6, H, 34], [x + 17, H / 2, z], 26);
  world.brick([34, H, 1.6], [x, H / 2, z + 17], 26);
  world.brick([12, H, 1.6], [x - 11, H / 2, z - 17], 26); world.brick([12, H, 1.6], [x + 11, H / 2, z - 17], 26);
  world.brick([10, 3, 1.6], [x, H - 1.5, z - 17], 26);
  for (const tx of [-17, 17]) for (const tz of [-17, 17]) {
    world.brick([7, H + 6, 7], [x + tx, (H + 6) / 2, z + tz], 26);
    world.brick([8, 1.2, 8], [x + tx, H + 6.6, z + tz], 199);
  }
  world.brick([32, 1.2, 6], [x, H - 0.6, z + 13], 199); // battlement walk
  for (let i = 0; i < 6; i++) world.brick([6, 1.2, 2], [x - 6, 0.6 + i * 1.8, z + 2 + i * 1.8], 199); // stairs up to it
  world.brick([6, 6, 6], [x + 6, 3, z], 26);
}

function playground(world, x, z) {
  island(world, x, z, 37);
  world.brick([14, 0.8, 14], [x - 12, 0.4, z + 10], 5, { top: 'Smooth' }); // sandbox
  // slide
  world.brick([4, 10, 4], [x + 12, 5, z - 12], 23);
  world.brick([4, 1.2, 4], [x + 12, 10.6, z - 12], 24);
  for (let i = 0; i < 8; i++) world.brick([3, 1.2, 1], [x + 12, 1 + i * 1.25, z - 14.6 - 0.0], 21, { top: 'Smooth' });
  world.brick([4, 0.8, 14], [x + 12, 5.2, z - 2], 24, { rotation: [-38, 0, 0], top: 'Smooth' });
  // see-saw and jungle gym
  world.brick([2, 2, 2], [x - 12, 1, z - 12], 199);
  world.brick([14, 0.8, 2], [x - 12, 2.4, z - 12], 21, { rotation: [0, 0, 12] });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    world.brick([0.8, 8, 0.8], [x + 4 + i * 4, 4, z + 6 + j * 4], [21, 23, 24, 37][(i + j) % 4]);
  }
  world.brick([14, 0.8, 10], [x + 10, 8.4, z + 10], 24);
}

export default {
  build(world) {
    bridges(world);
    thievesDen(world, -D, 0);
    const temple = lostTemple(world, 0, -D);
    blackrockCastle(world, D, 0);
    playground(world, 0, D);
    const spawns = [[-D + 14, 12], [-D + 14, -14], [-10, -D + 18], [10, -D + 18], [D - 8, -8], [D + 8, -8], [-14, D - 14], [8, D - 20]].map(([x, z]) => spawnLocation(world, x, 0.01 + 1.2, z));
    S = { temple, spawns };
    return { thumbnail: { cam: [-30, 46, 62], look: [6, 0, -14] } };
  },

  setup(game) {
    const world = game.world;
    game.setStats(['KOs', 'Wipeouts']);
    for (const sp of S.spawns) game.addSpawn(sp);
    game.starterPack = [(g) => new Sword(g), (g) => new PaintballGun(g), (g) => new Timebomb(g), (g) => new Superball(g), (g) => new Slingshot(g), (g) => new Trowel(g), (g) => new RocketLauncher(g)];
    S.temple.bar.setKinematic();
    S.temple.bar.body.angularVelocity.set(0, 1.2, 0);
    const abyss = world.add({ size: [1000, 2, 1000], position: [0, -90, 0], transparency: 1, canCollide: false });
    abyss.onTouched((ch) => { if (ch.alive && ch.player) ch.breakJoints(); });
    game.on('playerAdded', (p) => { if (p.isBot) p.brain = new CrossroadsBrain(game, p); });
  },
};

class CrossroadsBrain extends FighterBrain {
  constructor(game, player) {
    super(game, player, { aggro: 55, wanderRadius: 40 });
    this.favourite = pick(['Sword', 'Sword', 'Rocket', 'Superball', 'Slingshot', 'PaintballGun']);
  }
  idleChat() { this.say(pick(['lol', 'gg', 'pwned', 'noob', 'brb', 'who wants to sword fight', 'meet at the castle', 'lol rockets'])); }
  think() {
    if (this.player.equipped < 0 || Math.random() < 0.02) this.equipFirst(Math.random() < 0.8 ? this.favourite : pick(['Sword', 'Rocket', 'Superball']));
    super.think();
    // stay on the map: aim for a point on one of the sections or the bridges
    if (this.target && !this.enemy) {
      const sec = pick([[-D, 0], [0, -D], [D, 0], [0, D], [0, 0]]);
      this.target.set(sec[0] + (Math.random() - 0.5) * 30, this.ch.rootPosition.y, sec[1] + (Math.random() - 0.5) * 30);
    }
  }
}
