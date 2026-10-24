export default async function ({ page, shot }) {
  await page.waitForTimeout(3000);
  const views = [
    ['entrance', { x: 0, y: 0.15, z: 13.6 }, 0, -0.05],
    ['hall_from_door', { x: 0, y: 0, z: 10.5 }, 0, 0.12],
    ['bar', { x: -10, y: 0, z: 8.5 }, 0.55, 0.0],
    ['stage', { x: 0, y: 0, z: 3.5 }, 0, 0.08],
    ['pool', { x: 10.5, y: 0, z: 7.5 }, -0.6, -0.05],
    ['balcony_view', { x: -12.5, y: 4.2, z: 8 }, -2.3, -0.25],
    ['vip', { x: 8, y: 4.2, z: -7 }, 1.2, -0.05],
    ['kitchen', { x: -8.5, y: 0, z: -7.5 }, 1.0, -0.1],
  ];
  for (const [name, pos, yaw, pitch] of views) {
    await page.evaluate(([p, y, pi]) => {
      const g = window.__game;
      g.player.ctrl.teleport(p, y);
      g.player.ctrl.pitch = pi;
    }, [pos, yaw, pitch]);
    await page.waitForTimeout(700);
    await shot('lvl_' + name);
  }
  const info = await page.evaluate(() => ({ nav: window.__game.nav.count, navMs: window.__game.nav.buildMs.toFixed(0), props: window.__game.props.props.length, frameMs: window.__game.frameMs.toFixed(1) }));
  console.log(JSON.stringify(info));
}
