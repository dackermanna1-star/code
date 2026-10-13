import { tryItemDef, type IconShape } from '../../shared/data/items';

/** Procedural 16x16 pixel-art item icons (drawn on canvas, cached as data URLs). */
const cache = new Map<string, string>();

type Draw = (px: (x: number, y: number, c: string) => void, c1: string, c2: string, dk: string) => void;

const line = (px: (x: number, y: number, c: string) => void, x0: number, y0: number, x1: number, y1: number, c: string) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) px(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
};
const rect = (px: (x: number, y: number, c: string) => void, x: number, y: number, w: number, h: number, c: string) => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c);
};

const SHAPES: Partial<Record<IconShape, Draw>> = {
  pile: (px, c1, c2) => { for (const [x, y, s] of [[3, 9, 4], [8, 8, 4], [5, 5, 4], [10, 11, 3], [2, 12, 3]]) rect(px, x, y, s, s - 1, (x + y) % 2 ? c1 : c2); },
  ore: (px, c1, c2) => { rect(px, 3, 4, 10, 9, '#6d6d6d'); rect(px, 4, 3, 8, 1, '#7d7d7d'); for (const [x, y] of [[5, 6], [9, 5], [7, 9], [10, 10], [4, 10]]) rect(px, x, y, 2, 2, (x % 3) ? c1 : c2); },
  ingot: (px, c1, c2) => { rect(px, 2, 7, 12, 5, c1); rect(px, 4, 5, 8, 2, c1); rect(px, 2, 11, 12, 1, c2); },
  log: (px, c1, c2) => { rect(px, 2, 5, 12, 6, c1); rect(px, 12, 5, 2, 6, c2); rect(px, 4, 7, 5, 1, c2); },
  cloth: (px, c1, c2) => { rect(px, 2, 4, 12, 8, c1); for (let i = 2; i < 14; i += 3) rect(px, i, 4, 1, 8, c2); },
  powder: (px, c1, c2) => { for (let y = 0; y < 6; y++) rect(px, 8 - y - 1, 6 + y, (y + 1) * 2, 1, y % 2 ? c1 : c2); },
  meat: (px, c1, c2) => { rect(px, 3, 5, 9, 7, c1); rect(px, 5, 4, 5, 1, c1); rect(px, 11, 9, 3, 2, c2); rect(px, 13, 8, 1, 4, c2); },
  berry: (px, c1, c2) => { for (const [x, y] of [[5, 7], [8, 6], [7, 9], [10, 9], [4, 10]]) rect(px, x, y, 2, 2, c1); rect(px, 7, 3, 2, 3, c2); },
  mushroom: (px, c1, c2) => { rect(px, 3, 4, 10, 4, c1); rect(px, 7, 8, 2, 5, c2); },
  bottle: (px, c1, c2) => { rect(px, 5, 4, 6, 10, c1); rect(px, 7, 2, 2, 2, c2); },
  axe: (px, c1, c2) => { line(px, 4, 13, 11, 3, c1); rect(px, 9, 2, 5, 4, c2); },
  pick: (px, c1, c2) => { line(px, 4, 13, 10, 4, c1); line(px, 4, 4, 13, 6, c2); line(px, 5, 3, 13, 5, c2); },
  hammer: (px, c1, c2) => { line(px, 4, 13, 10, 5, c1); rect(px, 8, 2, 6, 4, c2); },
  rock: (px, c1) => { rect(px, 4, 5, 8, 7, c1); rect(px, 5, 4, 5, 1, c1); rect(px, 5, 11, 6, 1, '#555'); },
  torch: (px, c1, c2) => { line(px, 6, 14, 9, 5, c1); rect(px, 8, 2, 3, 3, c2); px(9, 1, '#fff6a0'); },
  spear: (px, c1) => { line(px, 2, 14, 12, 4, c1); rect(px, 12, 2, 2, 2, '#aaa'); },
  blade: (px, c1, c2) => { line(px, 4, 12, 12, 3, c1); line(px, 5, 12, 13, 4, c1); rect(px, 2, 12, 3, 3, c2); },
  bow: (px, c1, c2) => { for (let y = 2; y < 14; y++) px(5 + Math.round(Math.abs(y - 8) * 0.6), y, c1); line(px, 9, 2, 9, 13, c2); },
  crossbow: (px, c1, c2) => { line(px, 2, 5, 14, 5, c1); rect(px, 7, 5, 2, 9, c2); },
  pistol: (px, c1, c2) => { rect(px, 2, 5, 11, 3, c1); rect(px, 3, 8, 3, 5, c2); },
  shotgun: (px, c1, c2) => { rect(px, 1, 6, 14, 2, c1); rect(px, 1, 8, 9, 1, c1); rect(px, 10, 8, 5, 4, c2); },
  rifle: (px, c1, c2) => { rect(px, 0, 6, 15, 2, c1); rect(px, 6, 8, 2, 4, c1); rect(px, 10, 7, 5, 4, c2); rect(px, 3, 8, 2, 3, c2); },
  arrow: (px, c1, c2) => { line(px, 2, 13, 12, 3, c1); rect(px, 12, 2, 2, 2, '#ccc'); px(2, 12, c2); px(3, 14, c2); },
  bullet: (px, c1, c2) => { for (const x of [3, 7, 11]) { rect(px, x, 6, 2, 7, c1); rect(px, x, 4, 2, 2, c2 || '#b07040'); } },
  shell: (px, c1, c2) => { for (const x of [4, 9]) { rect(px, x, 4, 3, 7, c1); rect(px, x, 11, 3, 2, c2); } },
  grenade: (px, c1) => { rect(px, 4, 5, 8, 9, c1); rect(px, 6, 2, 4, 3, '#555'); px(10, 2, '#d33'); },
  charge: (px, c1, c2) => { rect(px, 2, 5, 12, 8, c1); rect(px, 4, 7, 8, 4, c2); rect(px, 12, 3, 2, 2, '#d33'); },
  shirt: (px, c1) => { rect(px, 4, 3, 8, 11, c1); rect(px, 1, 3, 3, 5, c1); rect(px, 12, 3, 3, 5, c1); },
  pants: (px, c1) => { rect(px, 4, 2, 8, 4, c1); rect(px, 4, 6, 3, 8, c1); rect(px, 9, 6, 3, 8, c1); },
  boots: (px, c1) => { rect(px, 2, 6, 4, 6, c1); rect(px, 2, 12, 6, 2, c1); rect(px, 9, 6, 4, 6, c1); rect(px, 9, 12, 6, 2, c1); },
  gloves: (px, c1) => { rect(px, 2, 5, 5, 8, c1); rect(px, 9, 5, 5, 8, c1); },
  helmet: (px, c1) => { rect(px, 3, 4, 10, 7, c1); rect(px, 2, 10, 12, 2, c1); rect(px, 5, 7, 6, 2, '#222'); },
  vest: (px, c1, _c2, dk) => { rect(px, 3, 3, 10, 11, c1); rect(px, 6, 3, 4, 2, dk); rect(px, 7, 6, 2, 8, dk); },
  bandage: (px, c1, c2) => { rect(px, 3, 5, 10, 6, c1); rect(px, 7, 5, 2, 6, c2); rect(px, 5, 7, 6, 2, c2); },
  syringe: (px, c1, c2) => { line(px, 3, 12, 11, 4, c1); line(px, 4, 12, 10, 6, c2); px(12, 3, '#ccc'); },
  pills: (px, c1, c2) => { rect(px, 4, 3, 8, 11, c1); rect(px, 4, 3, 8, 3, c2); },
  block: (px, c1, _c2, dk) => { rect(px, 3, 3, 10, 10, c1); rect(px, 3, 12, 10, 1, dk); rect(px, 12, 3, 1, 10, dk); },
  plan: (px, c1, c2) => { rect(px, 2, 3, 12, 10, c1); for (let i = 4; i < 13; i += 3) line(px, i, 4, i, 11, c2); },
  door: (px, c1, _c2, dk) => { rect(px, 4, 1, 8, 14, c1); rect(px, 10, 8, 1, 1, '#222'); rect(px, 4, 1, 8, 1, dk); },
  lock: (px, c1, c2) => { rect(px, 4, 7, 8, 7, c1); rect(px, 5, 3, 1, 4, c1); rect(px, 10, 3, 1, 4, c1); rect(px, 5, 3, 6, 1, c1); rect(px, 6, 9, 4, 2, c2); },
  box: (px, c1, c2, dk) => { rect(px, 2, 4, 12, 9, c1); rect(px, 2, 4, 12, 2, dk); rect(px, 7, 7, 2, 2, c2 || '#555'); },
  bench: (px, c1, _c2, dk) => { rect(px, 1, 5, 14, 3, c1); rect(px, 2, 8, 2, 6, dk); rect(px, 12, 8, 2, 6, dk); },
  furnace: (px, c1) => { rect(px, 3, 3, 10, 11, c1); rect(px, 5, 8, 6, 4, '#2a1a10'); rect(px, 6, 10, 4, 1, '#ff8a20'); },
  fire: (px, c1) => { rect(px, 3, 12, 10, 2, '#5a3a20'); for (let y = 0; y < 8; y++) rect(px, 8 - Math.floor((8 - y) / 2), 4 + y, 8 - y + (8 - y) % 2, 1, y < 3 ? '#ffe070' : c1); },
  bag: (px, c1) => { rect(px, 2, 6, 12, 6, c1); rect(px, 2, 6, 4, 6, '#d0c8a0'); },
  totem: (px, c1, _c2, dk) => { rect(px, 5, 2, 6, 12, c1); rect(px, 6, 4, 1, 1, dk); rect(px, 9, 4, 1, 1, dk); rect(px, 6, 8, 4, 1, dk); },
  gear: (px, c1, c2) => { rect(px, 4, 4, 8, 8, c1); rect(px, 6, 6, 4, 4, c2 || '#333'); for (const [x, y] of [[7, 2], [7, 12], [2, 7], [12, 7]]) rect(px, x, y, 2, 2, c1); },
  pipe: (px, c1) => { rect(px, 2, 6, 12, 4, c1); rect(px, 2, 6, 12, 1, '#aaa'); },
  spring: (px, c1) => { for (let x = 2; x < 14; x += 2) line(px, x, 4, x + 1, 12, c1); },
  chip: (px, c1, c2) => { rect(px, 3, 3, 10, 10, c1); for (let i = 4; i < 13; i += 2) { px(i, 2, c2); px(i, 13, c2); } },
  can: (px, c1, c2) => { rect(px, 4, 3, 8, 11, c1); rect(px, 4, 6, 8, 4, c2); },
  rope: (px, c1) => { for (let i = 0; i < 4; i++) rect(px, 3 + i, 4 + i * 2, 8, 2, c1); },
  research: (px, c1) => { rect(px, 2, 6, 12, 3, c1); rect(px, 4, 3, 4, 3, '#cfe'); rect(px, 3, 9, 2, 5, '#333'); rect(px, 11, 9, 2, 5, '#333'); },
};

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const darken = (c: number, f: number) => {
  const r = Math.floor(((c >> 16) & 255) * f), g = Math.floor(((c >> 8) & 255) * f), b = Math.floor((c & 255) * f);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
};

export function iconURL(itemId: string): string {
  const hit = cache.get(itemId);
  if (hit) return hit;
  const d = tryItemDef(itemId);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 16;
  const g = cv.getContext('2d')!;
  const px = (x: number, y: number, c: string) => {
    if (x < 0 || y < 0 || x > 15 || y > 15) return;
    g.fillStyle = c;
    g.fillRect(x, y, 1, 1);
  };
  if (d) {
    const draw = SHAPES[d.icon.shape] ?? SHAPES.block!;
    draw(px, hex(d.icon.c1), hex(d.icon.c2 ?? d.icon.c1), darken(d.icon.c1, 0.6));
  } else rect(px, 4, 4, 8, 8, '#f0f');
  const url = cv.toDataURL();
  cache.set(itemId, url);
  return url;
}
