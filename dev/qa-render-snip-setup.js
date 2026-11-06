const Q = window.__qa;
document.getElementById('ui').style.display = 'none';
const { createItem } = await import('/src/items/items.js');
Q.createItem = createItem;
// scene: {x, z, y?, yaw, pitch, h, day?, weather, flash?, wait?, item?}
Q.scene = async (s) => {
  const y = s.y ?? Q.ground(s.x, s.z);
  Q.tp(s.x + 0.5, y, s.z + 0.5, s.yaw ?? 0, s.pitch ?? -0.05, !!s.fly);
  if (s.day) Q.day(s.day, s.h ?? 12); else Q.time(s.h ?? 12);
  Q.weather(s.weather || 'clear');
  if (s.wet !== undefined) {
    const mu = await import('/src/render/materials.js');
    mu.globalUniforms.uWetness.value = s.wet;
  }
  const P = g.player;
  if (s.flash) {
    if (!P.inv.find('flashlight').length) P.inv.addItem(createItem('flashlight', { uses: 100 }));
    P.flashlightOn = true;
  } else P.flashlightOn = false;
  if (s.item !== undefined) {
    P.inv.hotbar[0] = s.item ? createItem(s.item, { ammo: 15 }) : null; P.inv.selected = 0; P.inv.changed();
  }
  g.chunks.budgetMs = 80;
  g.noSpawn = true;
  for (const z of g.zombies.zombies.slice()) if (Math.hypot(z.x - P.x, z.z - P.z) < 30 && !s.keepZombies) g.zombies.remove?.(z);
  await new Promise((r) => setTimeout(r, s.wait ?? 3000));
  g.chunks.budgetMs = 6;
  // exposure adapts over ~1 s
  return { y, pos: [P.x, P.y, P.z], q: g.chunks.queue.length, sky: g.world.skyAt(Math.floor(P.x), Math.floor(P.y + 1.6), Math.floor(P.z)), exposure: g.renderer.post.uExposure.value, fog: (await import('/src/render/materials.js')).globalUniforms.uFogDensity.value };
};
return Object.keys(Q);
