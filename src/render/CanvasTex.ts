import * as THREE from 'three';

export const FONT_DISPLAY = "'Fredoka Variable', 'Fredoka', 'Baloo 2', system-ui, sans-serif";
export const FONT_BODY = "'Nunito Variable', 'Nunito', system-ui, sans-serif";

export function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  opts: { srgb?: boolean; repeat?: boolean; mipmaps?: boolean } = {},
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = opts.mipmaps !== false;
  t.minFilter = opts.mipmaps === false ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
  return t;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw text that fits in `maxW` by shrinking the font size. */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  size: number,
  font = FONT_DISPLAY,
  weight = 700,
) {
  let s = size;
  ctx.font = `${weight} ${s}px ${font}`;
  while (ctx.measureText(text).width > maxW && s > 6) {
    s -= 1;
    ctx.font = `${weight} ${s}px ${font}`;
  }
  ctx.fillText(text, x, y);
}
