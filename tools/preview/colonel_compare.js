// Colonel portraits side by side with the cast (consistency check).
import { getPortrait, initPortraits } from '../../src/art/portraits.js';
const root = document.getElementById('root');
(async () => {
  try {
    await initPortraits();
    const c = document.createElement('canvas'); c.width = 6 * 100; c.height = 2 * 124;
    const x = c.getContext('2d'); x.fillStyle = '#20222c'; x.fillRect(0, 0, c.width, c.height);
    const set = [['tess', 'scared'], ['danny', 'nervous'], ['leah', 'deadpan'], ['marcus', 'worried'], ['colonel', 'serene'], ['colonel', 'looking']];
    for (const light of ['normal', 'fluor']) set.forEach(([ch, e], i) => x.drawImage(getPortrait(ch, e, { light }), i * 100 + 2, (light === 'fluor' ? 124 : 0) + 2));
    const out = document.createElement('canvas'); out.width = c.width * 2; out.height = c.height * 2;
    const o = out.getContext('2d'); o.imageSmoothingEnabled = false; o.drawImage(c, 0, 0, out.width, out.height);
    root.appendChild(out);
  } catch (e) { console.error(e.stack || e); }
  window.__ready = true;
})();
