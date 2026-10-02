/**
 * Items debug page: /debug/items.html
 *   ?mode=grid (default) | turntable | hand
 *   &filter=regex  &cat=food  &kind=sprite|block|model  &page=0&per=96  &ico=64  &bg=2b2d31
 *   &mats=full (use the full block material generator if present) &texsize=64
 *   &glint=1 (show enchanted variants)
 */
import * as THREE from 'three';
import { ITEMS, stack as mkStack, type ItemDef, type ItemStack } from '../game/items/index';
import { Renderer } from '../render/renderer';
import { generateStubMaterials, StubAtmosphere } from '../render/stubs';
import { ItemMaterials } from '../render/items/itemMaterials';
import { IconRenderer } from '../render/items/iconRenderer';
import { ItemIconAtlas } from '../render/items/iconAtlas';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const grid = document.getElementById('grid')!;
const info = document.getElementById('info')!;
const view = document.getElementById('view') as HTMLCanvasElement;
if (q.has('bg')) document.body.style.background = '#' + q.get('bg');
const ico = num('ico', 64);
document.documentElement.style.setProperty('--ico', `${ico}px`);
document.documentElement.style.setProperty('--cell', `${ico + 12}px`);

function selected(): ItemDef[] {
  let list = ITEMS.slice();
  if (q.has('filter')) {
    const re = new RegExp(q.get('filter')!);
    list = list.filter((d) => re.test(d.name));
  }
  if (q.has('cat')) list = list.filter((d) => d.category === q.get('cat'));
  if (q.has('kind')) list = list.filter((d) => d.visual.kind === q.get('kind'));
  const per = num('per', 96), page = num('page', 0);
  return list.slice(page * per, page * per + per);
}

function stackFor(d: ItemDef): ItemStack {
  const s = mkStack(d);
  if (d.name === 'potion' || d.name === 'splash_potion' || d.name === 'lingering_potion' || d.name === 'tipped_arrow') s.data = { potion: q.get('potion') ?? 'healing' };
  if (q.get('glint') === '1' && d.durability) s.ench = { unbreaking: 3 };
  return s;
}

async function setupRenderer() {
  view.style.display = 'block';
  const renderer = new Renderer(view, 'medium');
  renderer.resize(view.clientWidth || 640, view.clientHeight || 360);
  const optional = import.meta.glob(['../render/materials/generator.ts', '../render/sky/index.ts']);
  const load = async (k: string) => (optional[k] ? ((await optional[k]()) as any) : null);
  let mats;
  if (q.get('mats') === 'full') {
    const mod = await load('../render/materials/generator.ts');
    if (mod) mats = await mod.generateBlockMaterials(renderer.gl, num('texsize', 64));
  }
  mats ??= await generateStubMaterials(renderer.gl, 16);
  renderer.setMaterials(mats);
  let atmo: any = null;
  if (q.get('sky') === 'full') {
    const mod = await load('../render/sky/index.ts');
    if (mod) atmo = new mod.Atmosphere(renderer.gl, 'medium');
  }
  renderer.setAtmosphere(atmo ?? new StubAtmosphere(renderer.gl));
  return renderer;
}

async function atlasGrid() {
  const renderer = await setupRenderer();
  view.style.display = 'none';
  const mats = new ItemMaterials(renderer);
  const icons = new IconRenderer(renderer, mats);
  const atlas = new ItemIconAtlas(renderer, icons, num('size', 128));
  const list = selected();
  const t0 = performance.now();
  for (const d of list) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const box = document.createElement('div');
    box.className = 'ico';
    const s = stackFor(d);
    const url = atlas.url(s);
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      box.append(img);
    } else box.textContent = '?';
    const n = document.createElement('div');
    n.className = 'n';
    n.textContent = d.name;
    cell.append(box, n);
    grid.append(cell);
  }
  info.textContent = `${list.length} items in ${(performance.now() - t0).toFixed(0)} ms`;
  // let <img> decode
  await new Promise((r) => setTimeout(r, 300));
}

async function main() {
  const mode = q.get('mode') ?? 'grid';
  if (mode === 'grid') await atlasGrid();
  void THREE;
  (window as any).__shotReady = true;
}
main().catch((e) => {
  console.error(e);
  info.textContent = String(e?.stack ?? e);
  (window as any).__shotReady = true;
});
