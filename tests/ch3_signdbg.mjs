import { stubOthers } from './ch3_stub.mjs';
export default async ({ page, shot, evalg, wait }) => {
  await stubOthers(page);
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=2');
  for (let i = 0; i < 200; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  console.log(JSON.stringify(await evalg(() => {
    const g = window.game, L = g.level;
    const out = [];
    L.root.traverse((o) => {
      if (o.isMesh && o.geometry?.type === 'PlaneGeometry') {
        const p = new o.constructor().position; o.getWorldPosition(p);
        if (Math.abs(p.z - 37.48) < 0.05 || Math.abs(p.z - 57.92) < 0.05 || (Math.abs(p.x - 6) < 0.1 && Math.abs(p.z - 9.02) < 0.05)) out.push({ p: [p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2)], vis: o.visible, ry: o.rotation.y.toFixed(2), em: o.material.emissiveIntensity, map: !!o.material.map, img: o.material.map?.image?.width, parentVis: o.parent?.visible, parent: o.parent === L.root ? 'root' : o.parent?.type });
      }
    });
    return out;
  })));
};
