import { stubOthers } from './ch3_stub.mjs';
// Chapter 3: gas station + tanker explosions, pump-station door release, lift recall.
export default async ({ page, shot, evalg, wait }) => {
  await stubOthers(page);
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=2');
  for (let i = 0; i < 200; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  console.log('gas', JSON.stringify(await evalg(() => {
    const g = window.game, L = g.level;
    g.cheats.god = true; g.director.enabled = false; window.session.menu.clear();
    g.player.teleport(40, 0.02, 50, 0);
    g.survivors.forEach((s) => { if (s !== g.player) s.teleport(38, 0.02, 50, 0); });
    g.advance(0.5);
    // a few commons standing at the pumps to be blown up
    const cs = [[66, 64], [66, 66], [74, 65], [58, 62]].map(([x, z]) => g.infected.spawnCommon(x, 0, z, {}));
    g.advance(0.2);
    const pm = L.gas.gs.pumps[0];
    const dir = { x: 1, y: 0, z: 0 };
    for (let i = 0; i < 3; i++) pm.target.onShot(pm.x, 1.2, pm.z, dir, g.player);
    const fuse = +pm.target.fuse.toFixed(2);
    g.advance(4);
    const out = { fuse, pumpsDead: L.gas.gs.pumps.filter((p) => p.target.dead).length + '/' + L.gas.gs.pumps.length, fires: g.combat.fires.length, gone: L.gas.gs.gone, killed: cs.filter((c) => c && c.dead).length + '/' + cs.length };
    // tanker: shoot it with a bullet ray through the normal combat path
    const t = g.props.props.find((p) => p.explosive === 'fuel' && !p.dead && p.pos.x > 84 && p.pos.x < 93);
    for (let i = 0; i < 6; i++) t.onShot(t.pos.x, t.pos.y, t.pos.z, dir, g.player);
    g.advance(3);
    out.tanker = L.gas.tk.gone; out.fires2 = g.combat.fires.length; out.lights = L.lights.length;
    return out;
  })));
  await evalg(() => { const g = window.game; g.hud.show(false); if (g.viewmodel) g.viewmodel.visible = false; for (const s of g.survivors) if (s !== g.player) s.model?.setHidden(true); g.player.teleport(50, 0.02, 50.5, -2.45); g.player.pitch = 0.1; g.advance(0.3); });
  await shot('ch3_gasfire');
  // traceBullet path: fire the player's gun at a fresh pump? (all dead) -> check a gascan chain instead
  console.log('door', JSON.stringify(await evalg(() => {
    const g = window.game, L = g.level;
    g.player.teleport(104, -3.77, 152.5, 0);
    g.advance(0.5);
    const door = L.doors.find((d) => Math.abs(d.cx - 106.2) < 0.01);
    const u = g.usables.find((u) => u.prompt === 'Pull emergency release');
    const before = { locked: door.locked, open: door.open };
    door.use(g.player); // locked: should bang, stay closed
    const stillClosed = !door.open;
    u.onUse(g.player);
    g.advance(6);
    return { before, stillClosed, after: { locked: door.locked, open: door.open, angle: +door.angle.toFixed(2) }, panic: g.director.panicState?.name ?? null };
  })));
  console.log('recall', JSON.stringify(await evalg(() => {
    const g = window.game, L = g.level, lift = L.lift;
    // force the lift to the top (as after the crescendo), then use the call box
    lift.state.phase = 'top'; lift.plat.offset.set(0, 8.6, 0); lift.plat.apply(); lift.call.enabled = true;
    g.player.teleport(110.8, 0.02, 90.4, 0);
    lift.call.onUse(g.player);
    g.advance(20);
    const down = { phase: lift.state.phase, dy: +lift.plat.offset.y.toFixed(2), ctrl: lift.ctrl.enabled, prompt: lift.ctrl.prompt };
    g.player.teleport(107.8, 0.45, 94, 0); g.advance(0.3);
    lift.ctrl.onUse(g.player);
    g.advance(27);
    return { down, up: { phase: lift.state.phase, dy: +lift.plat.offset.y.toFixed(2), playerY: +g.player.pos.y.toFixed(2) } };
  })));
};
