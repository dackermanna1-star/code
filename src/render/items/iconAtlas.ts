/**
 * ItemIconAtlas: inventory icons for every item stack, as cached data URLs.
 *
 *  - block items: isometric 3D render of the real block (terrain texture arrays, studio light)
 *    or a flat texture card for plants / rails / torches (IconRenderer, WebGL readback)
 *  - everything else: procedurally painted sprites (paint/*)
 *  - enchanted stacks: wrapped in an SVG with Minecraft's animated purple glint
 *
 * Install with `setItemIconProvider((s) => atlas.url(s))`.
 */
import type { ItemDef, ItemStack } from '../../game/items/registry';
import { hasGlint } from '../../game/items/items';
import { BLOCK_BY_NAME } from '../../world/blocks/registry';
import type { Renderer } from '../renderer';
import { sprite, spriteKey } from './paint/index';
import { makeCanvas, ctx2d, type AnyCanvas } from './paint/kit';
import type { IconRenderer } from './iconRenderer';

let encoder: HTMLCanvasElement | null = null;
/** Synchronously encode any canvas as a PNG data URL. */
export function canvasToDataURL(c: AnyCanvas): string {
  if (typeof HTMLCanvasElement !== 'undefined' && c instanceof HTMLCanvasElement) return c.toDataURL('image/png');
  encoder ??= document.createElement('canvas');
  encoder.width = c.width;
  encoder.height = c.height;
  const g = encoder.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.drawImage(c as any, 0, 0);
  return encoder.toDataURL('image/png');
}

/** SVG wrapper adding Minecraft's scrolling enchantment glint to an icon. */
export function glintURL(pngURL: string, size: number): string {
  const s = size;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
    `<defs><image id="i" width="${s}" height="${s}" href="${pngURL}" xlink:href="${pngURL}"/>` +
    `<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${s}" height="${s}" style="mask-type:alpha"><use href="#i" xlink:href="#i"/></mask>` +
    `<linearGradient id="a" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${s * 0.7}" y2="${s * 0.25}" spreadMethod="repeat">` +
    `<stop offset="0" stop-color="#7a3cff" stop-opacity="0"/><stop offset="0.42" stop-color="#9a5cff" stop-opacity="0.05"/>` +
    `<stop offset="0.5" stop-color="#d0a8ff" stop-opacity="0.7"/><stop offset="0.58" stop-color="#9a5cff" stop-opacity="0.05"/><stop offset="1" stop-color="#7a3cff" stop-opacity="0"/>` +
    `<animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="${s * 0.7} ${s * 0.25}" dur="2.6s" repeatCount="indefinite"/></linearGradient>` +
    `<linearGradient id="b" gradientUnits="userSpaceOnUse" x1="0" y1="${s}" x2="${s * 0.3}" y2="${s * 0.35}" spreadMethod="repeat">` +
    `<stop offset="0" stop-color="#8a50ff" stop-opacity="0"/><stop offset="0.45" stop-color="#b080ff" stop-opacity="0.04"/>` +
    `<stop offset="0.5" stop-color="#c8a0ff" stop-opacity="0.5"/><stop offset="0.55" stop-color="#b080ff" stop-opacity="0.04"/><stop offset="1" stop-color="#8a50ff" stop-opacity="0"/>` +
    `<animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="${s * 0.3} ${-s * 0.65}" dur="4.1s" repeatCount="indefinite"/></linearGradient></defs>` +
    `<use href="#i" xlink:href="#i"/>` +
    `<g mask="url(#m)"><rect width="${s}" height="${s}" fill="#8040ff" opacity="0.16"/>` +
    `<rect width="${s}" height="${s}" fill="url(#a)" style="mix-blend-mode:screen"/><rect width="${s}" height="${s}" fill="url(#b)" style="mix-blend-mode:screen"/></g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export class ItemIconAtlas {
  readonly size: number;
  private urls = new Map<string, string | null>();
  private canvases = new Map<string, AnyCanvas | null>();
  private matsVersion: unknown = null;
  /** Optional hook returning extra variant data (compass angle, clock time) for a stack. */
  dynamicData: ((stack: ItemStack) => Record<string, any> | undefined) | null = null;

  constructor(readonly renderer: Renderer | null, readonly icons: IconRenderer | null, size = 128) {
    this.size = size;
  }

  private checkMaterials() {
    const tex = this.renderer?.terrainUniforms.u_albedo.value ?? null;
    if (tex !== this.matsVersion) {
      this.matsVersion = tex;
      // block icons depend on the installed block materials
      for (const k of [...this.canvases.keys()]) if (k.startsWith('block:')) { this.canvases.delete(k); this.urls.delete(k); this.urls.delete(k + '+g'); }
    }
  }

  private dataOf(stack: ItemStack): Record<string, any> | undefined {
    const dyn = this.dynamicData?.(stack);
    return dyn ? { ...(stack.data ?? {}), ...dyn } : stack.data;
  }

  /** Icon canvas for an item (+ data variant). */
  canvas(def: ItemDef, data?: Record<string, any>): AnyCanvas | null {
    this.checkMaterials();
    const blockDef = def.visual.kind === 'block' && def.block ? BLOCK_BY_NAME.get(def.block) : undefined;
    const key = blockDef ? `block:${def.name}` : `sprite:${spriteKey(def, data)}`;
    if (this.canvases.has(key)) return this.canvases.get(key)!;
    let c: AnyCanvas | null = null;
    if (blockDef) c = this.icons?.renderBlock(blockDef, this.size) ?? null;
    if (!c) c = sprite(def, data, this.size)?.canvas ?? null;
    this.canvases.set(key, c);
    return c;
  }

  /** Data URL for a stack's icon (cached; enchanted stacks get the animated glint). */
  url(stack: ItemStack): string | null {
    if (!stack?.item) return null;
    const def = stack.item;
    const data = this.dataOf(stack);
    this.checkMaterials();
    const blockDef = def.visual.kind === 'block' && def.block ? BLOCK_BY_NAME.get(def.block) : undefined;
    const base = blockDef ? `block:${def.name}` : `sprite:${spriteKey(def, data)}`;
    const glint = hasGlint(stack);
    const key = glint ? base + '+g' : base;
    if (this.urls.has(key)) return this.urls.get(key)!;
    const c = this.canvas(def, data);
    let url: string | null = null;
    if (c) {
      const png = this.urls.get(base) ?? canvasToDataURL(c);
      this.urls.set(base, png);
      url = glint ? glintURL(png, this.size) : png;
    }
    this.urls.set(key, url);
    return url;
  }

  /** Generate icons ahead of time, spending at most `budgetMs` (returns remaining count). */
  prewarm(defs: ItemDef[], budgetMs = 4): number {
    const t0 = performance.now();
    let i = 0;
    for (; i < defs.length; i++) {
      if (performance.now() - t0 > budgetMs) break;
      const d = defs[i];
      this.url({ item: d, count: 1, damage: 0 });
    }
    defs.splice(0, i);
    return defs.length;
  }

  /** Copy of an icon on a fresh canvas (for debug pages). */
  copyCanvas(def: ItemDef, data?: Record<string, any>): AnyCanvas | null {
    const c = this.canvas(def, data);
    if (!c) return null;
    const out = makeCanvas(c.width, c.height);
    ctx2d(out).drawImage(c as any, 0, 0);
    return out;
  }
}
