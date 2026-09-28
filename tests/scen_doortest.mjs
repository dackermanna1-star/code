export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=0');
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  console.log(JSON.stringify(await evalg(() => {
    const g = window.game, L = g.level, p = g.player;
    g.director.enabled = false;
    const d = L.doors[0];
    const out = { door: [d.cx, d.cy, d.cz, d.axis, d.locked, d.open], usable: d.usable && [d.usable.pos.toArray(), d.usable.enabled, d.usable.prompt, d.usable.radius] };
    p.teleport(8.6, d.cy, 8.5, Math.PI / 2); // east of the door, facing -x
    p.pitch = -0.2;
    g.advance(0.3);
    const u = g.items.findUsable(p);
    out.found = u ? (u.usable ? 'usable:' + u.prompt : u.item ? 'item' : 'revive') : null;
    out.canUse = d.canUse(p);
    g.testCmd = { usePressed: true, once: true };
    g.advance(1.5);
    out.after = [d.open, d.angle.toFixed(2), d.collider.enabled];
    return out;
  })));
};
