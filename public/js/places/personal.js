// Members' personal places. Every account had one place, started from one of
// three templates (Happy Home in Robloxia, Starting BrickBattle Map, Empty
// Baseplate). In your own place the Tools and Insert menus work: Tools gives
// the build HopperBins (Grab, Clone, Delete), Insert adds free models you own.
// Leaving asks whether to save, with the dialog text of the 2008 client's
// /Upload.aspx page (docs/RESEARCH.md).
import * as THREE from 'three';
import { buildTheme } from './themes.js';
import { modelBricks } from './models.js';
import { spawnDecal } from './common.js';
import { BotBrain } from '../engine/Bots.js';
import { BUILD_TOOLS } from '../engine/BuildTools.js';
import { Sword, RocketLauncher, Superball, Slingshot, PaintballGun, Trowel, Timebomb } from '../engine/Tools.js';

let S = null;

function addSaved(world, b) {
  const part = world.add({
    name: b.m || 'Part', shape: b.sh || 'Block', size: b.s, position: b.p, quaternion: new THREE.Quaternion(...b.q),
    color: b.c, anchored: b.a !== false, transparency: b.t || 0,
  });
  if (part.name === 'SpawnLocation') { const tex = spawnDecal(); part.addDecal('Top', tex); part.decals = [{ face: 'Top', texture: tex }]; }
  return part;
}

function serialize(world) {
  const out = [];
  for (const p of world.parts) {
    if (p.destroyed || p.tags.has('temporary') || !p.body || p.body.collisionFilterGroup === 4) continue;
    if (!['Block', 'Ball', 'Cylinder'].includes(p.shape)) continue;
    const q = p.quaternion;
    out.push({ s: p.size.toArray().map((v) => +v.toFixed(3)), p: p.position.toArray().map((v) => +v.toFixed(3)), q: [q.x, q.y, q.z, q.w].map((v) => +v.toFixed(5)), c: p.color, sh: p.shape, a: p.anchored, t: p.transparency, m: p.name });
  }
  return out.slice(0, 5000);
}

export default {
  build(world, ctx = {}) {
    let view;
    if (Array.isArray(ctx.build) && ctx.build.length) {
      for (const b of ctx.build) addSaved(world, b);
      view = { cam: [40, 26, -50], look: [0, 4, 0] };
    } else {
      view = buildTheme(world, ctx.theme || 'happyhome', '');
    }
    S = { theme: ctx.theme, view };
    return { thumbnail: view };
  },

  setup(game, ctx) {
    const world = game.world;
    S.info = ctx.info;
    S.buildMode = !!ctx.buildMode;
    for (const p of world.parts) if (p.name === 'SpawnLocation') game.addSpawn(p);
    if (!game.spawnLocations.length) {
      // no spawn: start in the middle, above whatever is there
      const fake = { position: new THREE.Vector3(0, 0, 0), size: new THREE.Vector3(1, 1, 1), userData: {} };
      game.addSpawn(fake);
    }
    game.setStats(['KOs', 'Wipeouts']);
    if (S.theme === 'brickbattle' && !(ctx.build && ctx.build.length)) {
      game.starterPack = [(g) => new Sword(g), (g) => new RocketLauncher(g), (g) => new Superball(g), (g) => new Slingshot(g), (g) => new PaintballGun(g), (g) => new Trowel(g), (g) => new Timebomb(g)];
    }
    game.on('playerAdded', (p) => { if (p.isBot) p.brain = new BotBrain(game, p, { wanderRadius: 30 }); });

    if (S.buildMode) {
      game.on('menuTools', (anchor) => {
        game.gui.dropdown(anchor, Object.entries(BUILD_TOOLS).map(([label, Cls]) => ({
          label,
          action: () => {
            const me = game.localPlayer;
            if (!me?.character?.alive) return;
            let i = me.backpack.findIndex((t) => t instanceof Cls);
            if (i < 0) { game.giveTool(me, new Cls(game)); i = me.backpack.length - 1; }
            if (me.equipped !== i) game.equip(me, i);
          },
        })));
      });
      let owned = null;
      fetch('/Game/Models.ashx', { credentials: 'same-origin' }).then((r) => r.json()).then((j) => { owned = j.models || []; }).catch(() => { owned = []; });
      game.on('menuInsert', (anchor) => {
        const items = [
          { label: 'Brick', action: () => insert(game, [[[4, 1.2, 2], [0, 0.6, 0], 194]]) },
          { label: 'Plate', action: () => insert(game, [[[4, 0.4, 2], [0, 0.2, 0], 194]]) },
          { label: 'Ball', action: () => insert(game, [[[2, 2, 2], [0, 1, 0], 21, { shape: 'Ball' }]]) },
          ...(owned || []).map((m) => ({ label: m.name, action: () => insert(game, modelBricks(m.model)) })),
        ];
        game.gui.dropdown(anchor, items);
      });
    }
  },

  onExit(game, close) {
    if (!S.buildMode) { close(); return; }
    const gui = game.gui;
    gui.openDialog('Leaving your Place', `<p>You are about to leave your Place. Do you wish to save changes made to your Place before exiting?</p>
      <table class="rbx-savechoices">
        <tr><td><b>Save</b></td><td>Save changes to my Place to ROBLOX. You will leave your place after the save has completed.</td></tr>
        <tr><td><b>Don't Save</b></td><td>Leave my Place on ROBLOX unchanged. You will lose any changes you made during your visit.</td></tr>
        <tr><td><b>Cancel</b></td><td>Keep playing and exit later</td></tr>
      </table>`, [
      { label: 'Save', action: () => save(game, close) },
      { label: "Don't Save", action: close },
      { label: 'Cancel' },
    ]);
  },
};

function save(game, close) {
  const gui = game.gui;
  gui.setJoinStatus('Uploading. Please wait...');
  fetch('/Game/SavePlace.ashx', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placeId: S.info.place.id, build: serialize(game.world) }),
  }).then((r) => r.json()).then((j) => {
    if (!j.ok) throw new Error('save failed');
    gui.setJoinStatus('');
    close();
  }).catch(() => {
    gui.setJoinStatus('Upload Failed!');
    setTimeout(() => gui.setJoinStatus(''), 2500);
  });
}

/** Drop a model in front of the player (Insert menu). */
function insert(game, bricks) {
  const ch = game.localPlayer?.character;
  if (!ch || !bricks.length) return;
  const at = ch.rootPosition.clone().addScaledVector(ch.lookVector, 12);
  at.y = 0;
  const hit = game.world.raycast(at.clone().setY(200), at.clone().setY(-50));
  const base = hit ? hit.point.y : 0;
  for (const [size, pos, color, extra = {}] of bricks) {
    const props = { size, position: [at.x + pos[0], base + pos[1], at.z + pos[2]], color, shape: extra.shape === 'Spawn' ? 'Block' : extra.shape, transparency: extra.t };
    if (extra.rot) props.rotation = extra.rot;
    if (extra.shape === 'Spawn') props.name = 'SpawnLocation';
    const p = game.world.add(props);
    if (extra.shape === 'Spawn') { const tex = spawnDecal(); p.addDecal('Top', tex); p.decals = [{ face: 'Top', texture: tex }]; }
  }
}


