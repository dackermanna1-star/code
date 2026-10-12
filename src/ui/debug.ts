// DebugTools: developer overlay (F3) and tool palette (F4) for validating the simulation in-game.
import { Game } from '../game/game';
import { MATERIALS, matId, KIND, Kind, BASE_TEMP } from '../world/materials';
import { RAY_SOLID, RAY_LIQUID } from '../world/world';
import { biomeAt, depthOf } from '../world/biomes';

export type DevTool = 'none' | 'dig' | 'material' | 'explode' | 'ignite' | 'heat' | 'freeze' | 'spawn';

export class DebugTools {
  readonly overlay: HTMLDivElement;
  readonly panel: HTMLDivElement;
  showOverlay = false;
  showPanel = false;
  tool: DevTool = 'none';
  brushMat = matId('water');
  brushRadius = 3;
  explodeRadius = 8;
  spawnType = 'hamis';
  godMode = false;
  enemyTypes: string[] = [];
  onSpawnEnemy: (type: string, x: number, y: number, z: number) => void = () => {};
  spellIds: string[] = [];
  giveSpell: (id: string) => void = () => {};
  giveWand: (tier: number) => void = () => {};
  givePotion: (mat: number) => void = () => {};
  teleportDepth: (layer: number) => void = () => {};
  extraStats: () => Record<string, string | number> = () => ({});
  private acc = 0;
  private reactionLog: string[] = [];

  constructor(private game: Game, root: HTMLElement) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'debug-overlay';
    this.overlay.style.display = 'none';
    root.appendChild(this.overlay);
    this.panel = document.createElement('div');
    this.panel.className = 'debug-panel noita-panel';
    this.panel.style.display = 'none';
    root.appendChild(this.panel);
    game.sim.events.reaction = (x, y, z, type) => {
      if (this.reactionLog.length > 6) this.reactionLog.shift();
      this.reactionLog.push(`${type} @${x},${y},${z}`);
    };
    this.buildPanel();
  }

  buildPanel(): void {
    const mats = MATERIALS.map((m, i) => `<option value="${i}" ${i === this.brushMat ? 'selected' : ''}>${m.display}</option>`).join('');
    const tools: DevTool[] = ['none', 'dig', 'material', 'explode', 'ignite', 'heat', 'freeze', 'spawn'];
    this.panel.innerHTML = `
      <div class="title">Developer tools (F4)</div>
      <div class="row">Tool (LMB): ${tools.map((t) => `<button data-tool="${t}" class="${t === this.tool ? 'sel' : ''}">${t}</button>`).join('')}</div>
      <div class="row">Material <select id="dbg-mat">${mats}</select> radius <input id="dbg-rad" type="number" min="1" max="12" value="${this.brushRadius}" style="width:3em"></div>
      <div class="row">Explosion radius <input id="dbg-exr" type="number" min="1" max="30" value="${this.explodeRadius}" style="width:3em"></div>
      <div class="row">Enemy <select id="dbg-enemy">${this.enemyTypes.map((e) => `<option ${e === this.spawnType ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
      <div class="row">Give spell <select id="dbg-spell">${this.spellIds.map((id) => `<option>${id}</option>`).join('')}</select><button id="dbg-give">give</button></div>
      <div class="row"><button id="dbg-wand1">random wand T1</button><button id="dbg-wand4">T4</button><button id="dbg-wand6">T6</button><button id="dbg-potion">flask of brush material</button></div>
      <div class="row">Go to: ${[0, 1, 2, 3, 4, 5].map((i) => `<button data-layer="${i}">L${i + 1}</button>`).join('')}<button data-layer="-1">HM1</button></div>
      <div class="row"><label><input type="checkbox" id="dbg-noclip" ${this.game.player.noclip ? 'checked' : ''}> noclip</label>
      <label><input type="checkbox" id="dbg-god" ${this.godMode ? 'checked' : ''}> god mode</label></div>
      <div class="row small">Seed ${this.game.opts.seed}. Tools apply where the crosshair points.</div>`;
    this.panel.querySelectorAll('button[data-tool]').forEach((b) =>
      b.addEventListener('click', () => {
        this.tool = (b as HTMLElement).dataset.tool as DevTool;
        this.buildPanel();
      }),
    );
    (this.panel.querySelector('#dbg-mat') as HTMLSelectElement).onchange = (e) => (this.brushMat = parseInt((e.target as HTMLSelectElement).value));
    (this.panel.querySelector('#dbg-rad') as HTMLInputElement).onchange = (e) => (this.brushRadius = parseFloat((e.target as HTMLInputElement).value));
    (this.panel.querySelector('#dbg-exr') as HTMLInputElement).onchange = (e) => (this.explodeRadius = parseFloat((e.target as HTMLInputElement).value));
    const sp = this.panel.querySelector('#dbg-spell') as HTMLSelectElement;
    (this.panel.querySelector('#dbg-give') as HTMLButtonElement).onclick = () => this.giveSpell(sp.value);
    (this.panel.querySelector('#dbg-wand1') as HTMLButtonElement).onclick = () => this.giveWand(1);
    (this.panel.querySelector('#dbg-wand4') as HTMLButtonElement).onclick = () => this.giveWand(4);
    (this.panel.querySelector('#dbg-wand6') as HTMLButtonElement).onclick = () => this.giveWand(6);
    (this.panel.querySelector('#dbg-potion') as HTMLButtonElement).onclick = () => this.givePotion(this.brushMat);
    this.panel.querySelectorAll('button[data-layer]').forEach((b) => b.addEventListener('click', () => this.teleportDepth(parseInt((b as HTMLElement).dataset.layer!)))); 
    const en = this.panel.querySelector('#dbg-enemy') as HTMLSelectElement;
    en.onchange = () => (this.spawnType = en.value);
    (this.panel.querySelector('#dbg-noclip') as HTMLInputElement).onchange = (e) => (this.game.player.noclip = (e.target as HTMLInputElement).checked);
    (this.panel.querySelector('#dbg-god') as HTMLInputElement).onchange = (e) => (this.godMode = (e.target as HTMLInputElement).checked);
  }

  togglePanel(): void {
    this.showPanel = !this.showPanel;
    this.panel.style.display = this.showPanel ? 'block' : 'none';
    if (this.showPanel) this.buildPanel();
  }

  toggleOverlay(): void {
    this.showOverlay = !this.showOverlay;
    this.overlay.style.display = this.showOverlay ? 'block' : 'none';
  }

  /** Apply the active tool at the crosshair. Returns true if the click was consumed. */
  applyTool(held: boolean, clicked: boolean): boolean {
    if (this.tool === 'none') return false;
    const g = this.game;
    const cam = g.camera.position;
    const d = g.lookDir();
    const hit = g.world.raycast(cam.x, cam.y, cam.z, d.x, d.y, d.z, 160, RAY_SOLID | RAY_LIQUID);
    const px = hit.hit ? hit.x + 0.5 + hit.nx * (this.tool === 'material' ? this.brushRadius : 0) : cam.x + d.x * 20;
    const py = hit.hit ? hit.y + 0.5 + hit.ny * (this.tool === 'material' ? this.brushRadius : 0) : cam.y + d.y * 20;
    const pz = hit.hit ? hit.z + 0.5 + hit.nz * (this.tool === 'material' ? this.brushRadius : 0) : cam.z + d.z * 20;
    switch (this.tool) {
      case 'dig':
        if (held && hit.hit) g.destruction.dig(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, this.brushRadius, 14);
        return true;
      case 'material':
        if (held) g.destruction.fill(px, py, pz, this.brushRadius, this.brushMat);
        return true;
      case 'explode':
        if (clicked) {
          g.destruction.explode(px, py, pz, { radius: this.explodeRadius, durability: 11, rayEnergy: this.explodeRadius * 150, fire: false });
          g.flash = 0.6;
          g.shake = 2;
        }
        return true;
      case 'ignite':
        if (held && hit.hit) {
          for (let i = 0; i < 6; i++) g.sim.ignite(hit.x + Math.round(Math.random() * 4 - 2), hit.y + Math.round(Math.random() * 4 - 2), hit.z + Math.round(Math.random() * 4 - 2), true);
          g.destruction.fill(hit.x + 0.5 + hit.nx, hit.y + 0.5 + hit.ny, hit.z + 0.5 + hit.nz, 1.2, matId('fire'));
        }
        return true;
      case 'heat':
      case 'freeze':
        if (held && hit.hit) {
          const dT = this.tool === 'heat' ? 120 : -120;
          for (let i = 0; i < 40; i++) g.sim.heat(hit.x + Math.round(Math.random() * 6 - 3), hit.y + Math.round(Math.random() * 6 - 3), hit.z + Math.round(Math.random() * 6 - 3), dT);
        }
        return true;
      case 'spawn':
        if (clicked && hit.hit) this.onSpawnEnemy(this.spawnType, hit.x + 0.5 + hit.nx * 2, hit.y + 1 + Math.max(0, hit.ny) * 1, hit.z + 0.5 + hit.nz * 2);
        return true;
    }
    return false;
  }

  update(dt: number): void {
    this.acc += dt;
    if (!this.showOverlay || this.acc < 0.25) return;
    this.acc = 0;
    const g = this.game;
    const s = g.sim.stats;
    const p = g.player.body;
    const cam = g.camera.position;
    const d = g.lookDir();
    const hit = g.world.raycast(cam.x, cam.y, cam.z, d.x, d.y, d.z, 200, RAY_SOLID | RAY_LIQUID);
    let insp = 'nothing';
    if (hit.hit) {
      const m = MATERIALS[hit.mat];
      const T = BASE_TEMP[hit.mat] + g.world.getTemp(hit.x, hit.y, hit.z);
      const aux = g.world.getAux(hit.x, hit.y, hit.z);
      insp = `${m?.display ?? 'unloaded'} [${hit.x},${hit.y},${hit.z}] T=${T.toFixed(0)}°C dur=${m?.durability ?? '-'} hard=${m?.hardness ?? '-'}${aux & 0x80 && KIND[hit.mat] !== Kind.GAS ? ' BURNING' : ''} dist=${hit.dist.toFixed(1)}`;
    }
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const b = biomeAt(p.y);
    const extra = this.extraStats();
    const lines = [
      `FPS ${g.fps.toFixed(0)}  frame ${g.frameMs.toFixed(1)} ms  sim ${s.tickMs.toFixed(2)} ms/tick`,
      `sim: active chunks ${s.activeChunks}  visited ${s.cellsVisited}  moved ${s.cellsMoved}  reactions ${s.reactions}  ignitions ${s.ignitions}  deferred ${s.deferredChunks}`,
      `world: loaded ${g.world.loadedCount}  meshes ${g.chunks.stats.meshes}  tris ${(g.chunks.stats.triangles / 1000).toFixed(0)}k  rebuilt ${g.chunks.stats.rebuilt} (${g.chunks.stats.lastRebuildMs.toFixed(1)} ms)  dirty ${g.world.meshDirty.size}  gen ${g.streamer.stats.generated} inflight ${g.streamer.stats.inflight} retained ${g.streamer.stats.retained}`,
      `particles ${g.particles.count} (material ${g.particles.materialCount})  lights ${g.lights.count}  draw calls ${g.renderer.info.render.calls}`,
      ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`),
      `pos ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}  depth ${depthOf(p.y).toFixed(0)}  biome ${b?.display ?? 'Surface'}  ground ${p.onGround}  liquid ${(p.liquid * 100).toFixed(0)}%`,
      `inspect: ${insp}`,
      `reactions: ${this.reactionLog.join(' | ')}`,
      mem ? `heap ${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB` : '',
      `tool: ${this.tool} (F4)`,
    ];
    this.overlay.textContent = lines.filter(Boolean).join('\n');
  }
}
