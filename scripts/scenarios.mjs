// Scenarios for scripts/smoke.mjs. Each receives { page, shot, wait, run }.
async function teleport(run, wait, x, y, z, yaw = 0, pitch = 0) {
  await run(([x, y, z, yaw, pitch]) => {
    const p = window.game.player;
    p.body.x = x; p.body.y = y; p.body.z = z; p.body.vx = p.body.vy = p.body.vz = 0;
    p.eyeY = y + p.eyeHeight();
    p.yaw = yaw; p.pitch = pitch;
    window.game.streamer.update(x, y, z);
  }, [x, y, z, yaw, pitch]);
  // wait for chunks to stream in and mesh
  for (let i = 0; i < 40; i++) {
    await wait(500);
    const s = await run(() => ({ inflight: window.game.streamer.stats.inflight, dirty: window.game.world.meshDirty.size }));
    if (s.inflight === 0 && s.dirty < 40 && i > 3) break;
  }
}

export { teleport };
export default {
  async mines({ shot, wait, run }) {
    await run(() => { window.game.player.noclip = true; });
    const pts = await run(() => window.game.streamer.gen.routePoints[0]);
    const p = pts[Math.floor(pts.length * 0.3)];
    await teleport(run, wait, p.x, p.y - 3, p.z, 0.4, -0.15);
    await shot('a');
    await run(() => { window.game.player.yaw += 2.2; });
    await wait(800);
    await shot('b');
    const q = pts[Math.floor(pts.length * 0.6)];
    await teleport(run, wait, q.x, q.y - 3, q.z, 1.4, -0.3);
    await shot('c');
    const hm = 1920 - 256 - 64 + 18;
    await teleport(run, wait, 110, hm + 2, 128, -Math.PI / 2 - 0.2, -0.05);
    await shot('hm');
  },
  async boot({ shot, wait }) {
    await wait(3000);
    await shot('spawn');
  },
  async tour({ shot, wait, run }) {
    await run(() => { window.game.player.noclip = true; });
    const pts = await run(() => window.game.streamer.gen.routePoints.map((r) => [r[0], r[Math.floor(r.length * 0.35)], r[Math.floor(r.length * 0.7)]]));
    // mines entrance
    await teleport(run, wait, 128.5, 1950, 70, Math.PI, -0.15);
    await shot('entrance');
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i][1];
      await teleport(run, wait, p.x, p.y - 4, p.z, i * 1.3, -0.1);
      await shot(`layer${i}`);
    }
    // holy mountain 1 room
    const hm = await run(() => { const b = window.game.streamer.gen; return 1920 - 256 - 64 + 18; });
    await teleport(run, wait, 112, hm + 2, 128, -Math.PI / 2 - 0.3, -0.1);
    await shot('holymountain');
  },
};
export const extra = {};
