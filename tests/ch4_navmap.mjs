import { boot, snap } from './ch4_util.mjs';
// ASCII nav map: '#' reachable-to-exit, 'o' node but disconnected, '.' no node.
// env: AREA='x0,z0,x1,z1,y'
export default async ({ page, evalg, wait }) => {
  await boot(page, evalg, wait);
  const [x0, z0, x1, z1, y] = (process.env.AREA || '14,0,46,16,8').split(',').map(Number);
  const r = await evalg(([x0, z0, x1, z1, y]) => {
    const nav = window.game.level.nav, f = nav.fields.toExit;
    const rows = [];
    for (let z = z0 + 0.25; z < z1; z += 0.5) {
      let row = (z.toFixed(2)).padStart(7) + ' ';
      for (let x = x0 + 0.25; x < x1; x += 0.5) {
        const c = nav.colIndex(x, z);
        let ch = '.';
        if (c >= 0) for (let m = nav.colStart[c]; m < nav.colStart[c + 1]; m++) if (Math.abs(nav.nodeY[m] - y) < 0.6) ch = f[m] < 1e8 ? '#' : 'o';
        row += ch;
      }
      rows.push(row);
    }
    return rows.join('\n');
  }, [x0, z0, x1, z1, y]);
  console.log('x from ' + x0 + ' step 0.5\n' + r);
};
