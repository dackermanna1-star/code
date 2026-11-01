import { RNG } from '../core/math';
import { paintWall, piece, throwUp, tag, PALETTES } from '../world/graffiti';

/** ?viewer=graffiti[&seed=N]: a wall's worth of street art on brick red, plus a row of samples. */
export async function runGraffitiViewer(params: URLSearchParams) {
  await Promise.all([document.fonts.load("400 100px 'Anton'"), document.fonts.load("italic 800 60px 'Barlow Condensed'")]);
  const seed = Number(params.get('seed') ?? 5);
  const ppm = 110, w = 12, h = 4.6;
  const c = document.createElement('canvas');
  c.width = w * ppm;
  c.height = h * ppm + 260;
  const x = c.getContext('2d')!;
  x.fillStyle = '#5a3028';
  x.fillRect(0, 0, c.width, c.height);
  for (let yy = 0; yy < c.height; yy += 22) for (let xx = (yy / 22) % 2 ? -30 : 0; xx < c.width; xx += 60) {
    x.fillStyle = `rgb(${90 + Math.random() * 40},${40 + Math.random() * 20},${30 + Math.random() * 15})`;
    x.fillRect(xx + 2, yy + 2, 56, 18);
  }
  const r = new RNG(seed);
  paintWall(x, r, w, h, ppm, { pieces: 3 });
  x.translate(0, h * ppm);
  PALETTES.slice(0, 4).forEach((p, i) => piece(x, r, ['KAOS', 'RIOT', 'HAVOK', 'SLAM'][i], 160 + i * 330, 130, 120, p));
  throwUp(x, r, 'KX', 1250, 130, 90);
  for (let i = 0; i < 6; i++) tag(x, r, 20 + i * 220, 240, 40);
  document.body.style.margin = '0';
  document.body.append(c);
  (window as unknown as { __ready: boolean }).__ready = true;
}
