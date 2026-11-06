// Distance of the right hand from the eye at full ADS per gun model (viewmodel bench).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  await p.goto('http://localhost:5301/dev/viewmodel-test.html?auto=1');
  await p.waitForFunction(() => window.vmTest && window.vmTest.ready);
  const r = await p.evaluate(async () => {
    const { Viewmodel } = await import('/src/player/Viewmodel.js');
    const out = {};
    for (const m of ['pistol', 'revolver', 'shotgun_pump', 'shotgun_double', 'shotgun_sawed', 'rifle_hunting', 'rifle_ar', 'rifle_ak', 'rifle_22', 'smg', 'crossbow', 'bow']) {
      const vm = new Viewmodel();
      vm.setItem({ id: 'vmt_' + m, count: 1, ammo: 5 });
      for (let i = 0; i < 120; i++) vm.update(1 / 60, { aiming: true, light: { sky: 1, block: 0 } });
      out[m] = { d: +vm._handR.length().toFixed(3), hand: vm._handR.toArray().map((v) => +v.toFixed(3)), armVis: vm.arms.R.root.visible };
      vm.dispose();
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 0));
  await b.close();
})();
