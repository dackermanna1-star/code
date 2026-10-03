// Run JS (env JS) inside the started game after an optional view (env VIEW); prints the result.
export default async function (t) {
  await t.eval(() => window.game.ui.start());
  if (process.env.VIEW) {
    await t.eval((v) => window.game.goTo(v), process.env.VIEW);
    await t.page.waitForFunction(() => !window.game.camera.moving, null, { timeout: 120000 });
  }
  const res = await t.eval(async (src) => {
    const G = window.game;
    const THREE = await import('/node_modules/.vite/deps/three.js');
    return new Function('G', 'THREE', 'return (async () => {' + src + '})()')(G, THREE);
  }, process.env.JS);
  console.log(typeof res === 'string' ? res : JSON.stringify(res));
  if (process.env.SHOT) await t.shot(process.env.SHOT);
}
