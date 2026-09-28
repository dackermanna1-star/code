import { quiet, grab } from './fxgrab.mjs';
// Prop gallery: builds props at runtime into ch1 (street / lobby) and takes
// close-up screenshots. QUALITY=medium node tests/play.mjs tests/scen_gallery.mjs
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=0', { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await quiet(evalg);
  const sets = {
    vehicles: { cam: [2, 0.2, 21.8, 2.5, -0.12], light: [8, 4, 27], items: [['car', 3, 0, 26.5, 0.3, {}], ['policeCar', 7.5, 0, 27, -0.2, {}], ['car', 12, 0, 26, 0.5, { burnt: true }], ['taxi', 0.5, 0, 31, 1.4, {}], ['van', 9, 0, 32.5, -1.5]] },
    big: { cam: [-6, 0.2, 21.6, 2.3, -0.02], light: [2, 5, 28], items: [['bus', -2, 0, 29, 1.45, {}], ['ambulance', 10, 0, 29.5, -1.2, { lights: true }], ['fuelTanker', 18, 0, 30, -1.6, {}]] },
    furniture: { cam: [10, 0, 18.8, 2.6, -0.3], light: [14, 2.6, 15], items: [['sofa', 13, 0, 13.5, 0, 0x4a3a2a], ['desk', 16.5, 0, 12.3, 0], ['officeChair', 16.3, 0, 13.2, 3], ['bed', 11, 0, 11.5, 0, 0x6a2a2a], ['bookshelf', 14, 0, 10.6, 0], ['fridge', 18, 0, 10.8, 0], ['corpse', 13.5, 0.01, 15.6, 1.2, 0x3a4a5a], ['trashBags', 17.5, 0, 15.5, 4], ['dumpster', 11, 0, 16, 1.2]] },
    street: { cam: [22, 0.15, 21.4, 2.9, -0.2], light: [25, 3, 24], items: [['hydrant', 23, 0.15, 22.4], ['mailbox', 24.5, 0.15, 22.2, 3.14], ['newsBox', 25.6, 0.15, 22.2, 3.14], ['trafficCone', 23.5, 0, 24.2], ['barricade', 26.5, 0, 25, 0.2], ['sandbags', 22, 0, 25.5, 0.1, 2.4, 3], ['barrel', 27.5, 0, 23.6, 0x2a4a2a, false], ['crate', 20.5, 0, 24, 0.3], ['pallet', 19.5, 0, 26, 0.2, true], ['phoneBooth', 28.5, 0.15, 22.2, 3.14], ['concreteBarrier', 25, 0, 27, 0.1, 2.5]] },
    deadair: { cam: [52, 0.2, 21.6, 2.6, -0.08], light: [56, 4, 26], items: [['semi', 54, 0, 30, 1.57, {}], ['scaffolding', 50, 0, 24.5, 0, 4, 1], ['cementMixer', 57, 0, 24.5, 0.8], ['portableToilet', 60, 0, 24, 0.3], ['checkInDesk', 46, 0, 27, 0.4, 1], ['luggageCart', 48, 0, 25, 0.8], ['baggageTug', 45, 0, 31, 1.2], ['floodLight', 62, 0, 28, 2.2, {}]] },
  };
  const which = (process.env.SETS || 'vehicles,big,furniture,street,deadair').split(',');
  await evalg(() => {
    const g = window.game;
    g.director.enabled = false; g.cheats.god = true; g.cheats.botsIdle = true;
    for (const c of g.infected.commons) c.hp = 0;
    g.survivors.forEach((q, i) => { if (q !== g.player) q.teleport(-20 - i, 0.15, 21.6, 0); });
    g.advance(7);
  });
  for (const name of which) {
    const set = sets[name];
    const r = await evalg(async (set) => {
      const g = window.game, THREE = await import('/node_modules/.vite/deps/three.js').catch(() => null);
      const P = await import('/src/levels/props.js');
      const { materials } = await import('/src/render/materials.js');
      const tmp = new (g.level.constructor)(g, {});
      for (const [fn, ...args] of set.items) P[fn](tmp, ...args);
      const grp = g.level.root;
      const made = [];
      for (const b of tmp.buckets.values()) {
        if (!b.vcount) continue;
        const MeshC = g.level.meshes[0].constructor;
        const mesh = new MeshC(b.toGeometry(), materials.get(b.mat));
        mesh.castShadow = !b.mat.startsWith('emissive'); mesh.receiveShadow = true;
        grp.add(mesh); made.push(mesh);
      }
      for (const L2 of tmp.lights) g.level.lights.push(L2);
      g.level.lights.push(g.level.light.call({ lights: [] }, set.light[0], set.light[1], set.light[2], 0xfff0dc, 22, 16, {}));
      window.__gal = made;
      const c = set.cam;
      g.player.teleport(c[0], c[1], c[2], c[3]); g.player.pitch = c[4];
      g.player.flashlight = true;
      g.advance(0.3);
      g.hud?.clearTransient?.(); if (g.hud?.title) { g.hud.title.style.opacity = 0; g.hud.titleT = 0; }
      document.querySelectorAll('.subline').forEach((e) => e.remove());
      return { meshes: made.length, THREE: !!THREE };
    }, set);
    console.log('SET', name, JSON.stringify(r));
    await wait(700);
    await grab(evalg, 'gallery_' + name);
    await evalg(() => { for (const m of window.__gal || []) m.parent?.remove(m); });
  }
};
