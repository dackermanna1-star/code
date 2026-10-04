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
import { ItemModels } from '../render/items/itemModels';
import { FirstPersonHand } from '../render/items/hand';
import { ENTITY_SHARED, setEntityLight } from '../render/entityMaterial';
import { installItemBehaviors } from '../game/items/behaviors';
import '../game/portal/portalItem';

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

/** 3D scene: a row of dropped item models (G-buffer, deferred lighting) + the first-person hand. */
async function sceneMode() {
  installItemBehaviors();
  const renderer = await setupRenderer();
  grid.style.display = 'none';
  const models = new ItemModels(renderer);
  const scene = new THREE.Scene();
  const names = (q.get('items') ?? 'diamond_sword,iron_pickaxe,golden_axe,apple,grass_block,potion,bow,shield,bread,oak_fence,diamond,torch').split(',');
  names.forEach((n, i) => {
    const s = mkStack(n);
    if (n === 'potion') s.data = { potion: 'healing' };
    const m = models.create(s, 'dropped');
    m.userData.stackVisualCount = q.get('stack') ? 3 : 1;
    const row = i % 6, col = Math.floor(i / 6);
    m.position.set((row - 2.5) * 0.62, -0.35 - col * 0.55, -2.4 - col * 0.3);
    m.rotation.y = num('spin', 0.5);
    m.traverse((o: any) => o.material?.uniforms?.u_light && setEntityLight(o.material, 15 << 12));
    scene.add(m);
  });
  const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 200);
  cam.position.set(0, 0, 0);
  cam.rotation.order = 'YXZ';
  cam.rotation.x = THREE.MathUtils.degToRad(num('pitch', -12));
  const time = num('time', 4000);
  const angle = (time / 24000) * Math.PI * 2;
  const sunDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), -0.35).normalize();
  // hand with a mocked player
  const hand = new FirstPersonHand(models);
  const held = q.get('held') ?? 'diamond_sword';
  const inv = { held: held === 'none' ? null : mkStack(held), offhand: q.get('off') ? mkStack(q.get('off')!) : null };
  const player: any = { inventory: inv, attackStrength: () => 1, swingProgress: -1, swingTicks: 0, effectLevel: () => 0, yaw: 0, pitch: cam.rotation.x, sprinting: false, onGround: true, bobPhase: 0, bobAmount: 0, usingItem: null, flying: false, dead: false, spectator: false, sleeping: false };
  if (q.has('disp')) hand.display = q.get('disp')!.split(',').map(Number);
  if (q.has('handpose')) hand.override = { pose: q.get('handpose')!, t: num('handt', 0.5) };
  for (let i = 0; i < 4; i++) hand.tick(player);
  const fakeGame: any = { player, cameraCtl: { camera: cam, perspective: 'first', viewBobbing: true }, renderer, realTime: 0, ui: null };
  const light = new THREE.Vector4(num('sky', 15) / 15, num('block', 0) / 15, num('block', 0) / 15 * 0.8, num('block', 0) / 15 * 0.5);
  const frames = num('frames', 6);
  for (let f = 0; f < frames; f++) {
    cam.updateMatrixWorld(true);
    ENTITY_SHARED.u_viewInvRot.value.setFromMatrix4(cam.matrixWorld);
    fakeGame.realTime = f / 30;
    const showHand = held !== 'skip' && hand.update(fakeGame, 1 / 30, light);
    renderer.render({
      camera: cam, time: f / 30, dt: 1 / 30,
      sky: { sunDir, moonDir: sunDir.clone().negate(), moonPhase: 0, time: f / 30, rain: 0, thunder: 0, dimension: 'overworld', cameraPosition: cam.position, renderDistance: 64 },
      underwater: false, waterFogColor: new THREE.Color(0.02, 0.08, 0.12), wind: 0, nightVision: 0, damage: 0,
      gbufferScenes: [scene], shadowScenes: [scene], hand: showHand ? hand.extras : undefined,
    });
    await new Promise((r) => requestAnimationFrame(r));
  }
}

async function main() {
  const mode = q.get('mode') ?? 'grid';
  if (mode === 'grid') await atlasGrid();
  if (mode === 'scene') await sceneMode();
  void THREE;
  (window as any).__shotReady = true;
}
main().catch((e) => {
  console.error(e);
  info.textContent = String(e?.stack ?? e);
  (window as any).__shotReady = true;
});
