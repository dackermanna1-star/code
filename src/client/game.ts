import * as THREE from 'three';
import { CHUNK_SIZE, REACH } from '../shared/constants';
import type { WorldConfig } from '../shared/config';
import { tryItemDef, type ItemDef } from '../shared/data/items';
import { BUILD_PIECES, PIECES, TIERS, pieceCost, type PieceType } from '../shared/data/building';
import { dirFromAngles } from '../shared/math';
import { decodeChunkHeader, type InvMsg, type S2C, type VitalsMsg } from '../shared/net/protocol';
import type { ClientRules } from '../shared/config';
import { Chunk, chunkKey, rleDecode, VoxelWorld } from '../shared/world/chunk';
import { B, blockDef, LIQUID } from '../shared/world/blocks';
import { raycastVoxels } from '../shared/world/raycast';
import { Biome } from '../shared/world/biomes';
import { WorldGenerator } from '../shared/world/worldgen';
import { clockString, dayPhase } from '../shared/sim/time';
import type { Socket } from '../shared/sim/buildgeom';
import { Audio } from './audio';
import { Input } from './input';
import { LocalPlayer } from './localplayer';
import { ChunkRenderer } from './render/chunks';
import { makeChunkMaterials, makeChunkUniforms, makeTileTexture } from './render/chunkmaterial';
import { Effects, ViewModel } from './render/effects';
import { EntityRenderer } from './render/entities';
import { Sky } from './render/sky';
import { buildTiles } from './render/textures';
import { keyLabel, type Settings } from './settings';
import { LocalSim } from './sim';
import { Hud } from './ui/hud';
import { InventoryUI } from './ui/inventory';
import { MapUI, type MapMarker } from './ui/map';
import { renderHelp, show } from './ui/menus';

type Mode = 'loading' | 'play' | 'inventory' | 'map' | 'chat' | 'pause' | 'dead' | 'keypad' | 'help' | 'settings';

const $ = (id: string) => document.getElementById(id)!;

/**
 * Client: rendering, input, prediction, audio and UI. Talks to the
 * simulation exclusively through the LocalSim protocol bridge.
 */
export class ClientGame {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly world = new VoxelWorld(1);
  readonly sim: LocalSim;
  readonly local = new LocalPlayer();
  readonly input: Input;
  readonly audio: Audio;
  readonly hud = new Hud();
  readonly invUI: InventoryUI;
  readonly map = new MapUI();
  private sky = new Sky();
  private chunks: ChunkRenderer;
  private ents = new EntityRenderer();
  private fx = new Effects();
  private vm = new ViewModel();
  private uniforms;
  private materials;
  private sun = new THREE.DirectionalLight(0xffffff, 1);
  private ambient = new THREE.AmbientLight(0xffffff, 0.5);
  private torchLight = new THREE.PointLight(0xffb060, 0, 14);
  private gen: WorldGenerator | null = null;
  mode: Mode = 'loading';
  private running = true;
  private last = performance.now();
  private rules: ClientRules = { dayLengthMin: 40, nightFraction: 0.3, viewDistance: 7, cheats: false };
  private time = 0;
  private weather = 0;
  private inv: InvMsg | null = null;
  private vitals: VitalsMsg | null = null;
  private pois: Array<{ name: string; x: number; z: number; tier: string }> = [];
  private deathPos: [number, number, number] | null = null;
  private bags: MapMarker[] = [];
  private lastSwing = 0;
  private lastFire = 0;
  private reloadUntil = 0;
  private useUntil = 0;
  private useTotal = 0;
  private pieceIdx = 0;
  private stairRot = 0;
  /** Target tier for hammer upgrades (1 wood .. 4 armored), cycled with the rotate key. */
  private hammerTier = 1;
  private ghost: { socket: Socket | null; ok: boolean; reason?: string } = { socket: null, ok: false };
  private lastPreview = 0;
  private lastInspect = 0;
  private cracks = new Map<string, { frac: number; t: number }>();
  private stepDist = 0;
  private entSteps = new Map<number, { x: number; z: number; d: number }>();
  private shake = 0;
  private aiming = false;
  private frames = 0;
  private fpsTime = 0;
  private fps = 0;
  private spawned = false;
  private lastSnapAck = 0;
  private benchCheck = 0;
  private worldTris = 0;
  private expectLoot = 0;
  private worldCalls = 0;
  onSpawned: () => void = () => undefined;
  /** The world's rules changed (e.g. cheats allowed from the pause menu). */
  onRules: (r: ClientRules) => void = () => undefined;
  onQuit: () => void = () => undefined;

  constructor(private canvas: HTMLCanvasElement, private settings: Settings, workerBase: string) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio * settings.pixelRatio));
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.08, 1000);
    this.camera.rotation.order = 'YXZ';
    const atlas = buildTiles();
    const tex = makeTileTexture(atlas.data, atlas.names.length);
    this.uniforms = makeChunkUniforms(tex);
    this.materials = makeChunkMaterials(this.uniforms);
    this.chunks = new ChunkRenderer(this.world, this.materials, `${workerBase}mesher.worker.js`, Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 2)));
    this.chunks.ao = settings.ao;
    this.scene.add(this.sky.group, this.chunks.group, this.ents.group, this.fx.group, this.sun, this.sun.target, this.ambient, this.camera);
    this.camera.add(this.torchLight);
    this.input = new Input(canvas, settings);
    this.audio = new Audio();
    this.applyAudioSettings();
    this.invUI = new InventoryUI((m) => this.sim.send(m), (k) => this.audio.ui(k));
    this.sim = new LocalSim(`${workerBase}sim.worker.js`);
    this.sim.onMessage = (m) => this.onMessage(m);
    this.sim.onChunk = (b) => this.onChunk(b);
    this.sim.onError = (e) => this.hud.toast(`Simulation error: ${e}`, 'error');
    this.input.onKey = (code, e) => this.onKey(code, e);
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.mode === 'play' && this.spawned) this.setMode('pause');
    });
    window.addEventListener('resize', () => this.resize());
    $('chat-input').addEventListener('keydown', (e) => {
      const ev = e as KeyboardEvent;
      if (ev.key === 'Enter') {
        const v = ($('chat-input') as HTMLInputElement).value.trim();
        if (v) this.sim.send({ t: 'chat', text: v });
        this.setMode('play');
      } else if (ev.key === 'Escape') this.setMode('play');
      ev.stopPropagation();
    });
    this.resize();
  }

  async start(worldId: string, name: string, config?: Partial<WorldConfig>) {
    this.audio.init();
    this.applyAudioSettings();
    this.hud.show(true);
    this.setMode('loading');
    requestAnimationFrame((t) => this.frame(t));
    await this.sim.open(worldId, name, config);
  }

  applyAudioSettings() {
    const s = this.settings;
    this.audio.volumes = { master: s.volume, sfx: s.sfxVolume, ambient: s.ambientVolume, music: s.musicVolume };
    this.audio.applyVolumes();
  }

  applySettings() {
    this.camera.fov = this.settings.fov;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio * this.settings.pixelRatio));
    if (this.chunks.ao !== this.settings.ao) {
      this.chunks.ao = this.settings.ao;
      for (const c of this.world.chunks.values()) this.chunks.markDirty(c.cx, c.cz);
    }
    this.applyAudioSettings();
    this.resize();
  }

  private resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ modes
  get godMode() {
    return !!this.vitals?.fx.includes('god');
  }

  get cheatsAllowed() {
    return this.rules.cheats;
  }

  /** Pause-menu switches mirror the simulation's state (also changed by /god). */
  updateCheatButtons() {
    const god = $('p-god') as HTMLButtonElement;
    god.textContent = `God mode: ${this.godMode ? 'on' : 'off'}`;
    god.disabled = !this.rules.cheats;
    god.title = this.rules.cheats ? `Toggle with ${keyLabel(this.settings.keys.god)}` : 'Allow cheats first';
    const cheats = $('p-cheats') as HTMLButtonElement;
    delete cheats.dataset.confirm;
    cheats.textContent = `Allow cheats: ${this.rules.cheats ? 'on' : 'off'}`;
  }

  setMode(m: Mode) {
    const prev = this.mode;
    this.mode = m;
    this.invUI.setOpen(m === 'inventory');
    show('map', m === 'map');
    show('pause', m === 'pause');
    show('death', m === 'dead');
    show('loading', m === 'loading');
    show('keypad', m === 'keypad');
    show('help', m === 'help');
    show('settings', m === 'settings');
    this.hud.chatOpen(m === 'chat');
    this.input.uiMode = m !== 'play';
    if (m === 'play') this.input.requestLock();
    else if (m !== 'loading') this.input.exitLock();
    if (m === 'pause' && prev !== 'pause') this.sim.send({ t: 'pause', on: true });
    if (prev === 'pause' && m !== 'pause' && m !== 'settings' && m !== 'help') this.sim.send({ t: 'pause', on: false });
    if (m === 'help') renderHelp(this.settings);
    if (m === 'keypad') setTimeout(() => ($('kp-code') as HTMLInputElement).focus(), 0);
  }

  private onKey(code: string, e: KeyboardEvent): boolean | void {
    const k = this.settings.keys;
    if (this.mode === 'chat' || this.mode === 'keypad' || this.mode === 'loading' || this.mode === 'settings') return;
    if (code === 'Escape') {
      if (this.mode === 'play') this.setMode('pause');
      else if (this.mode === 'pause') this.setMode('play');
      else if (this.mode !== 'dead') this.setMode('play');
      return true;
    }
    if (this.mode === 'dead') return;
    if (code === k.inventory) {
      this.setMode(this.mode === 'inventory' ? 'play' : 'inventory');
      return true;
    }
    if (code === k.map) {
      this.setMode(this.mode === 'map' ? 'play' : 'map');
      return true;
    }
    if (code === k.help) {
      this.setMode(this.mode === 'help' ? 'play' : 'help');
      return true;
    }
    if (this.mode === 'play' && code === k.god) {
      this.sim.send({ t: 'god' });
      return true;
    }
    if (this.mode === 'play' && (code === k.chat || code === 'Slash')) {
      this.setMode('chat');
      if (code === 'Slash') setTimeout(() => (($('chat-input') as HTMLInputElement).value = '/'), 0);
      e.preventDefault();
      return true;
    }
  }

  // ------------------------------------------------------------------ simulation messages
  private onChunk(buf: Uint8Array) {
    const h = decodeChunkHeader(buf);
    const c = new Chunk(h.cx, h.cz, rleDecode(buf, undefined, h.offset));
    c.rev = h.rev;
    this.world.addChunk(c);
    this.chunks.markArea(h.cx, h.cz);
    this.map.capture(this.world, c.key);
  }

  private onMessage(m: S2C) {
    switch (m.t) {
      case 'welcome':
        this.rules = m.rules;
        this.updateCheatButtons();
        this.time = m.time;
        this.gen = new WorldGenerator(m.seed);
        this.local.teleport(m.pos[0], m.pos[1], m.pos[2]);
        this.uniforms.uFogFar.value = (m.rules.viewDistance - 0.5) * CHUNK_SIZE;
        this.uniforms.uFogNear.value = this.uniforms.uFogFar.value * 0.55;
        break;
      case 'spawned':
        this.local.teleport(m.pos[0], m.pos[1], m.pos[2]);
        this.spawned = true;
        if (this.mode === 'loading' || this.mode === 'dead') this.setMode('play');
        this.onSpawned();
        break;
      case 'correct':
        this.local.teleport(m.pos[0], m.pos[1], m.pos[2]);
        break;
      case 'snap': {
        if (m.ack >= this.lastSnapAck) {
          this.lastSnapAck = m.ack;
          this.local.reconcile(m.ack, m.me, this.world);
        }
        for (const e of m.ents) this.ents.apply(e, m.st);
        for (const id of m.gone ?? []) this.ents.remove(id);
        break;
      }
      case 'unload':
        for (const [cx, cz] of m.keys) {
          this.world.removeChunk(cx, cz);
          this.chunks.remove(cx, cz);
        }
        break;
      case 'blocks':
        for (const [x, y, z, id] of m.list) {
          const old = this.world.getBlock(x, y, z);
          this.world.setBlock(x, y, z, id);
          this.chunks.blockChanged(x, z);
          if (id === B.air && old !== B.air) this.cracks.delete(`${x},${y},${z}`);
        }
        break;
      case 'inv':
        this.inv = m;
        this.invUI.setInv(m);
        this.hud.belt(m);
        // Open the loot pane only in response to our own interact (avoids stale
        // updates re-opening it right after the player closed it).
        if (m.loot && this.mode === 'play' && performance.now() - this.expectLoot < 2000) {
          this.expectLoot = 0;
          this.setMode('inventory');
        }
        break;
      case 'vitals':
        this.vitals = m;
        this.local.noSprint = m.hyd <= 0;
        this.hud.vitals(m);
        this.updateCheatButtons();
        break;
      case 'rules':
        this.rules = m.rules;
        this.onRules(m.rules);
        this.updateCheatButtons();
        break;
      case 'craftq':
        this.invUI.setQueue(m.q);
        break;
      case 'bps':
        this.invUI.setKnown(m.list);
        break;
      case 'msg':
        if (m.kind === 'error') {
          this.hud.toast(m.text, 'error');
          this.audio.ui('error');
        } else if (m.kind === 'info') this.hud.toast(m.text, 'info');
        this.hud.chat(m.text, m.kind, m.from);
        break;
      case 'fx':
        this.onFx(m);
        break;
      case 'died':
        this.deathPos = m.pos;
        $('death-by').textContent = `Killed by ${m.by}`;
        this.renderBags(m.bags);
        this.spawned = false;
        this.setMode('dead');
        break;
      case 'time':
        this.time = m.time;
        this.weather = m.weather;
        break;
      case 'piece':
        this.hud.pieceInfo(m.info);
        break;
      case 'ghost':
        this.ghost = m;
        break;
      case 'map':
        this.pois = m.pois;
        break;
      case 'hitmark':
        this.hud.hitmarker(m.head, m.kill);
        this.audio.ui(m.kill ? 'kill' : 'hit');
        break;
      case 'hurt':
        this.hud.hurt(m.from !== undefined ? m.from - this.local.yaw : undefined);
        this.audio.ui('hurt');
        this.shake = Math.min(1, this.shake + m.amount / 40);
        break;
      case 'gather':
        this.hud.gather(m.item, m.n);
        break;
      case 'lockui':
        $('kp-title').textContent = m.mode === 'set' ? 'Set a 4-digit code' : 'Enter code';
        ($('kp-code') as HTMLInputElement).value = '';
        ($('kp-code') as HTMLInputElement).dataset.mode = m.mode;
        this.setMode('keypad');
        break;
      case 'saved':
        this.hud.toast(`Game saved (${m.ms} ms)`, 'info');
        break;
      case 'fatal':
        this.hud.toast(m.reason, 'error');
        break;
    }
  }

  private renderBags(bags: Array<{ id: number; name: string; cooldown: number; pos: [number, number, number] }>) {
    const box = $('death-bags');
    box.innerHTML = '';
    this.bags = bags.map((b) => ({ x: b.pos[0], z: b.pos[2], label: b.name, kind: 'bag' as const }));
    for (const b of bags) {
      const btn = document.createElement('button');
      const ready = Date.now() + b.cooldown * 1000;
      const upd = () => {
        const left = Math.ceil((ready - Date.now()) / 1000);
        btn.textContent = left > 0 ? `${b.name} (${left}s)` : `Respawn at ${b.name} (${Math.round(b.pos[0])}, ${Math.round(b.pos[2])})`;
        btn.disabled = left > 0;
        if (left > 0 && this.mode === 'dead') setTimeout(upd, 500);
      };
      upd();
      btn.onclick = () => this.sim.send({ t: 'respawn', bag: b.id });
      box.appendChild(btn);
    }
  }

  private onFx(m: Extract<S2C, { t: 'fx' }>) {
    const pos: [number, number, number] = [m.x, m.y, m.z];
    const [ex, ey, ez] = this.local.eye();
    const dist = Math.hypot(m.x - ex, m.y - ey, m.z - ez);
    switch (m.k) {
      case 'shot': {
        this.audio.gunshot(m.s ?? '', pos, dist);
        if (m.a !== undefined && m.b !== undefined) {
          const d = dirFromAngles(m.a, m.b);
          const from = new THREE.Vector3(m.x, m.y, m.z);
          const hit = raycastVoxels(this.world, m.x, m.y, m.z, d.x, d.y, d.z, 80);
          const len = hit ? hit.dist : 80;
          this.fx.tracer(from.clone().addScaledVector(new THREE.Vector3(d.x, d.y, d.z), 1), from.clone().addScaledVector(new THREE.Vector3(d.x, d.y, d.z), len));
          this.fx.flash(m.x + d.x, m.y + d.y, m.z + d.z, 0xffc070, 3, 0.06);
        }
        break;
      }
      case 'hitblock': {
        this.audio.hitBlock((m.s ?? 'stone') as never, pos);
        const key = `${Math.floor(m.x)},${Math.floor(m.y)},${Math.floor(m.z)}`;
        this.cracks.set(key, { frac: m.a ?? 0, t: performance.now() });
        this.fx.blockBurst(m.x, m.y, m.z, this.world.getBlock(Math.floor(m.x), Math.floor(m.y), Math.floor(m.z)), 5);
        break;
      }
      case 'break':
        this.audio.hitBlock((m.s ?? 'stone') as never, pos, true);
        this.fx.blockBurst(m.x, m.y, m.z, m.a ?? B.stone, 18);
        break;
      case 'explode':
        this.audio.explosion(pos, dist);
        this.fx.explosion(m.x, m.y, m.z, m.a ?? 3);
        this.shake = Math.min(1.5, this.shake + Math.max(0, 1 - dist / 40));
        break;
      case 'hitflesh':
        this.fx.burst(m.x, m.y, m.z, 0x8a1010, 10, 2.5, 0.08);
        break;
      case 'impact':
        this.fx.burst(m.x, m.y, m.z, 0xffd080, 6, 4, 0.05, 15, 0.3);
        this.audio.hitBlock((m.s ?? 'stone') as never, pos);
        break;
      case 'hitstruct':
      case 'clang':
        this.audio.hitBlock((m.s ?? 'wood') as never, pos);
        this.fx.burst(m.x, m.y, m.z, 0x9a8a70, 4, 2);
        break;
      case 'build':
      case 'upgrade':
      case 'repair':
        this.audio.ui('build');
        this.fx.burst(m.x, m.y, m.z, 0xc0b090, 20, 3, 0.1);
        break;
      case 'place':
        this.audio.hitBlock((m.s ?? 'wood') as never, pos);
        break;
      case 'door':
        this.audio.door(!!m.a, pos);
        break;
      case 'pickup':
        this.audio.ui('pickup');
        break;
      case 'eat':
        this.audio.ui('eat');
        break;
      case 'crafted':
        this.audio.ui('craft');
        break;
      case 'bandage':
        this.useTotal = 2;
        this.useUntil = performance.now() / 1000 + 2;
        break;
      default:
        this.audio.generic(m.k, pos);
    }
  }

  // ------------------------------------------------------------------ frame
  private frame(t: number) {
    if (!this.running) return;
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 1) {
      this.fps = this.frames / this.fpsTime;
      this.frames = 0;
      this.fpsTime = 0;
    }
    const playing = this.mode === 'play' && this.spawned;
    if (playing) this.look();
    const held = this.heldDef();
    // movement prediction (runs in all modes so the world keeps up; no input when not playing)
    const k = (a: Parameters<Input['isDown']>[0]) => (playing ? this.input.isDown(a) : false);
    if (this.spawned) {
      const events = this.local.update(dt, {
        f: (k('forward') ? 1 : 0) - (k('back') ? 1 : 0),
        s: (k('right') ? 1 : 0) - (k('left') ? 1 : 0),
        jump: k('jump'), sprint: k('sprint') && !this.aiming, crouch: k('crouch'),
      }, this.world);
      for (const ev of events) {
        this.stepDist += ev.groundDist;
        if (this.stepDist > 1.7) {
          this.stepDist = 0;
          const s = this.local.state;
          const below = this.world.getBlock(Math.floor(s.x), Math.floor(s.y - 0.1), Math.floor(s.z));
          this.audio.footstep(blockDef(below).sound, undefined, s.crouching ? 0.4 : 1);
        }
        if (ev.landedSpeed > 9) this.audio.footstep('dirt', undefined, 1.5);
      }
      const out = this.local.takeOutbox();
      if (out.length && this.mode !== 'pause') this.sim.send({ t: 'in', cmds: out });
    }
    if (playing) this.actions(held);
    this.updateTarget(held, playing);
    this.updateCamera(dt);
    this.updateWorldVisuals(dt);
    this.updateHudFrame(dt, held);
    this.map.showMinimap(this.spawned && (this.mode === 'play' || this.mode === 'chat'));
    if (this.mode === 'map' || this.map.minimapDue()) {
      const markers: MapMarker[] = this.pois.map((p) => ({ x: p.x, z: p.z, label: p.name, kind: `poi-${p.tier}` as MapMarker['kind'] }));
      markers.push(...this.bags);
      if (this.deathPos) markers.push({ x: this.deathPos[0], z: this.deathPos[2], label: 'Your body', kind: 'death' });
      this.map.setMarkers(markers);
      if (this.mode === 'map') this.map.render(this.local.state.x, this.local.state.z, this.local.yaw);
      else this.map.minimap(this.local.state.x, this.local.state.z, this.local.yaw);
    }
    this.invUI.tick(dt);
    this.chunks.pump(this.local.state.x, this.local.state.z);
    this.renderer.info.reset();
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.worldTris = this.renderer.info.render.triangles;
    this.worldCalls = this.renderer.info.render.calls;
    this.renderer.clearDepth();
    this.renderer.render(this.vm.scene, this.vm.camera);
    this.input.endFrame();
  }

  private heldDef(): ItemDef | undefined {
    const s = this.inv?.belt[this.inv.sel];
    return s ? tryItemDef(s.id) : undefined;
  }

  private look() {
    const sens = 0.0022 * this.settings.sensitivity * (this.aiming ? 0.6 : 1);
    this.local.yaw -= this.input.mouseDX * sens;
    this.local.pitch -= this.input.mouseDY * sens * (this.settings.invertY ? -1 : 1);
    this.local.pitch = Math.max(-1.55, Math.min(1.55, this.local.pitch));
    // belt selection
    for (let i = 0; i < 6; i++) if (this.input.codePressed(`Digit${i + 1}`)) this.select(i);
    if (this.input.wheel && this.inv) this.select((this.inv.sel + this.input.wheel + 6) % 6);
  }

  private select(i: number) {
    if (!this.inv || this.inv.sel === i) return;
    this.inv.sel = i;
    this.hud.belt(this.inv);
    this.sim.send({ t: 'select', slot: i });
    this.reloadUntil = 0;
    this.useUntil = 0;
    this.ghost = { socket: null, ok: false };
    this.hud.pieceInfo(null);
  }

  /** Translate mouse buttons/keys into requests based on the held item. */
  private actions(held: ItemDef | undefined) {
    const now = performance.now() / 1000;
    const yaw = this.local.yaw, pitch = this.local.pitch;
    const lmbDown = (this.input.buttons & 1) !== 0, lmbClick = (this.input.clicked & 1) !== 0;
    const rmbDown = (this.input.buttons & 4) !== 0, rmbClick = (this.input.clicked & 4) !== 0;
    const keys = this.settings.keys;
    const w = held?.weapon;
    this.aiming = !!w && (w.kind === 'gun' || w.kind === 'bow') && rmbDown;

    if (this.input.wasPressed('interact')) {
      const [ex, ey, ez] = this.local.simEye();
      const d = dirFromAngles(yaw, pitch);
      const solid = raycastVoxels(this.world, ex, ey, ez, d.x, d.y, d.z, REACH);
      const any = raycastVoxels(this.world, ex, ey, ez, d.x, d.y, d.z, REACH, (id) => id !== 0);
      if (any && LIQUID[any.id] && (!solid || any.dist < solid.dist) && !this.entityInFront()) this.sim.send({ t: 'drink', yaw, pitch });
      else {
        this.expectLoot = performance.now();
        this.sim.send({ t: 'interact', yaw, pitch });
      }
    }
    if (this.input.wasPressed('drop') && this.inv?.belt[this.inv.sel]) {
      this.sim.send({ t: 'inv', op: 'drop', from: ['belt', this.inv.sel] });
    }
    if (this.input.wasPressed('reload') && w?.magazine && (w.reload ?? 0) > 0) {
      this.sim.send({ t: 'reload' });
      this.reloadUntil = now + (w.reload ?? 0);
    }

    if (!held) {
      if (lmbDown && now - this.lastSwing >= 0.55) this.swing(yaw, pitch, now);
      return;
    }
    if (held.key === 'building_plan') {
      if (lmbClick && this.ghost.socket) this.sim.send({ t: 'build', piece: BUILD_PIECES[this.pieceIdx], yaw, pitch, rot: this.stairRot });
      if (rmbClick) {
        this.pieceIdx = (this.pieceIdx + 1) % BUILD_PIECES.length;
        this.audio.ui('click');
      }
      if (this.input.wasPressed('rotate')) this.stairRot = (this.stairRot + 1) % 4;
      return;
    }
    if (held.key === 'hammer') {
      if (lmbDown && now - this.lastSwing >= 0.5) {
        this.lastSwing = now;
        this.vm.doSwing();
        this.sim.send({ t: 'hammer', mode: 'repair', yaw, pitch });
      }
      if (rmbClick) this.sim.send({ t: 'hammer', mode: 'upgrade', yaw, pitch, tier: this.hammerTier });
      if (this.input.wasPressed('rotate')) {
        this.hammerTier = (this.hammerTier % 4) + 1;
        this.audio.ui('click');
      }
      if (this.input.codePressed(keys.demolish)) this.sim.send({ t: 'hammer', mode: 'demolish', yaw, pitch });
      return;
    }
    if (w && (w.kind === 'gun' || w.kind === 'bow')) {
      const want = w.automatic ? lmbDown : lmbClick;
      if (want && now - this.lastFire >= w.interval && now >= this.reloadUntil) {
        const s = this.inv!.belt[this.inv!.sel]!;
        const usesMag = (w.magazine ?? 0) > 0 && (w.reload ?? 0) > 0;
        if (usesMag && !s.ammo) {
          if (lmbClick) this.audio.generic('dryfire');
          return;
        }
        if (!usesMag && this.invUI.count('wooden_arrow') <= 0) return;
        this.lastFire = now;
        this.sim.send({ t: 'fire', yaw, pitch, ct: Date.now() });
        if (usesMag) s.ammo = (s.ammo ?? 1) - 1;
        // local feedback: sound, flash, tracer, recoil
        this.audio.gunshot(held.key, undefined, 0);
        const [ex, ey, ez] = this.local.eye();
        const d = dirFromAngles(yaw, pitch);
        if (w.kind === 'gun') {
          this.fx.flash(ex + d.x, ey + d.y - 0.2, ez + d.z, 0xffc070, 3, 0.05);
          const from = new THREE.Vector3(ex + d.x * 1.2, ey - 0.15, ez + d.z * 1.2);
          const hit = raycastVoxels(this.world, ex, ey, ez, d.x, d.y, d.z, 100);
          this.fx.tracer(from, new THREE.Vector3(ex, ey, ez).addScaledVector(new THREE.Vector3(d.x, d.y, d.z), hit ? hit.dist : 100));
        }
        if (w.recoil) {
          this.local.pitch = Math.min(1.55, this.local.pitch + w.recoil.pitch * (this.aiming ? 0.7 : 1));
          this.local.yaw += (Math.random() - 0.5) * 2 * w.recoil.yaw;
          this.vm.doRecoil(1);
        }
        this.hud.belt(this.inv!);
      }
      return;
    }
    if (held.explosive) {
      if (lmbClick) {
        this.sim.send({ t: 'throw', yaw, pitch });
        this.vm.doSwing();
      }
      return;
    }
    if (held.food || held.medical) {
      if ((lmbClick || rmbClick) && now >= this.useUntil) {
        this.sim.send({ t: 'consume' });
        if (held.medical) {
          this.useTotal = held.medical.useTime;
          this.useUntil = now + held.medical.useTime;
        }
      }
      return;
    }
    if ((held.placeBlock || held.doorTier !== undefined || held.key === 'code_lock') && rmbClick) {
      this.sim.send({ t: 'place', yaw, pitch });
      this.vm.doSwing();
    }
    const interval = w?.interval ?? 0.55;
    if (lmbDown && now - this.lastSwing >= interval) this.swing(yaw, pitch, now);
  }

  private swing(yaw: number, pitch: number, now: number) {
    this.lastSwing = now;
    this.vm.doSwing();
    this.sim.send({ t: 'swing', yaw, pitch });
  }

  private entityInFront(): boolean {
    const [ex, ey, ez] = this.local.simEye();
    const d = dirFromAngles(this.local.yaw, this.local.pitch);
    for (const v of this.ents.views.values()) {
      if (v.kind !== 'i' && v.kind !== 'c') continue;
      const p = v.root.position;
      const t = (p.x - ex) * d.x + (p.y + 0.3 - ey) * d.y + (p.z - ez) * d.z;
      if (t < 0 || t > REACH) continue;
      const cx = ex + d.x * t - p.x, cy = ey + d.y * t - (p.y + 0.3), cz = ez + d.z * t - p.z;
      if (Math.hypot(cx, cy, cz) < 0.6) return true;
    }
    return false;
  }

  /** Target outline, crack overlay, interaction hint, build ghost, hammer inspect. */
  private updateTarget(held: ItemDef | undefined, playing: boolean) {
    if (!this.spawned) return;
    const [ex, ey, ez] = this.local.simEye();
    const yaw = this.local.yaw, pitch = this.local.pitch;
    const d = dirFromAngles(yaw, pitch);
    const reach = held?.weapon?.kind === 'melee' ? held.weapon.range : REACH;
    const hit = raycastVoxels(this.world, ex, ey, ez, d.x, d.y, d.z, Math.max(reach, REACH));
    let hint = '';
    if (hit && hit.dist <= REACH) {
      const key = `${hit.x},${hit.y},${hit.z}`;
      const crack = this.cracks.get(key);
      const frac = crack && performance.now() - crack.t < 30000 ? crack.frac : 0;
      this.fx.setTarget(hit.x, hit.y, hit.z, frac);
      const bd = blockDef(hit.id);
      const E = `[${this.settings.keys.interact.replace('Key', '')}]`;
      if (bd.door) hint = `${E} ${bd.door.open ? 'Close' : 'Open'} door`;
      else if (bd.deployable) {
        const k = bd.deployable;
        hint = k.startsWith('workbench') ? bd.name : k === 'barrel' ? 'Rusty Barrel — break it open' : k === 'sleeping_bag' ? bd.name : `${E} Open ${bd.name}`;
      }
    } else this.fx.clearTarget();
    const water = raycastVoxels(this.world, ex, ey, ez, d.x, d.y, d.z, REACH, (id) => id !== 0);
    if (!hint && water && LIQUID[water.id] && (!hit || water.dist < hit.dist)) hint = `[${this.settings.keys.interact.replace('Key', '')}] Drink`;
    // entity hints
    for (const v of this.ents.views.values()) {
      if (v.kind !== 'i' && v.kind !== 'c') continue;
      const p = v.root.position;
      const t = (p.x - ex) * d.x + (p.y + 0.3 - ey) * d.y + (p.z - ez) * d.z;
      if (t < 0 || t > REACH || (hit && hit.dist < t)) continue;
      const cx = ex + d.x * t - p.x, cy = ey + d.y * t - (p.y + 0.3), cz = ez + d.z * t - p.z;
      if (Math.hypot(cx, cy, cz) > 0.6) continue;
      const E = `[${this.settings.keys.interact.replace('Key', '')}]`;
      if (v.kind === 'i') hint = `${E} Pick up ${tryItemDef(v.last.n ?? '')?.name ?? 'item'}${(v.last.hp ?? 1) > 1 ? ` x${v.last.hp}` : ''}`;
      else hint = (v.last.f ?? 0) & 1 ? `${v.last.n} carcass — harvest with a tool` : `${E} Loot ${v.last.n}`;
    }
    this.hud.hint(playing ? hint : '');
    const now = performance.now() / 1000;
    if (held?.key === 'building_plan' && playing) {
      if (now - this.lastPreview > 0.1) {
        this.lastPreview = now;
        this.sim.send({ t: 'buildpreview', piece: BUILD_PIECES[this.pieceIdx], yaw, pitch, rot: this.stairRot });
      }
      this.fx.setGhost(this.ghost.socket, this.ghost.ok);
      const type = BUILD_PIECES[this.pieceIdx] as PieceType;
      const cost = pieceCost(type, 0).map(([k, n]) => `${n} ${tryItemDef(k)?.name ?? k}`).join(', ');
      this.hud.buildHud(`<b>${PIECES[type].name}</b> (${TIERS[0].name}) — ${cost}<br><span class="muted small">LMB place · RMB next piece${type === 'stairs' ? ` · ${this.settings.keys.rotate.replace('Key', '')} rotate` : ''}${this.ghost.reason ? ` · <span style="color:#f88">${this.ghost.reason}</span>` : ''}</span>`);
    } else {
      this.fx.setGhost(null, false);
      this.hud.buildHud('');
    }
    if (held?.key === 'hammer' && playing) {
      const tierCost = pieceCost('wall', this.hammerTier).map(([k, n]) => `${n} ${tryItemDef(k)?.name ?? k}`).join(', ');
      this.hud.buildHud(`Upgrade target: <b>${TIERS[this.hammerTier].name}</b> (wall ${tierCost})<br><span class="muted small">RMB upgrade · LMB repair · ${this.settings.keys.rotate.replace('Key', '')} change tier · ${this.settings.keys.demolish.replace('Key', '')} demolish</span>`);
      if (now - this.lastInspect > 0.25) {
        this.lastInspect = now;
        this.sim.send({ t: 'inspect', yaw, pitch });
      }
    } else if (this.lastInspect) {
      this.lastInspect = 0;
      this.hud.pieceInfo(null);
    }
  }

  private updateCamera(dt: number) {
    const [x, y, z] = this.local.eye();
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sh = this.shake * 0.08;
    this.camera.position.set(x + (Math.random() - 0.5) * sh, y + (Math.random() - 0.5) * sh, z + (Math.random() - 0.5) * sh);
    this.camera.rotation.set(this.local.pitch, this.local.yaw, 0);
    const targetFov = this.aiming ? this.settings.fov * 0.62 : this.settings.fov;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 14);
      this.camera.updateProjectionMatrix();
    }
    const d = dirFromAngles(this.local.yaw, this.local.pitch);
    this.audio.setListener(x, y, z, d.x, d.y, d.z);
  }

  private updateWorldVisuals(dt: number) {
    this.time += dt;
    const phase = dayPhase(this.time, this.rules.dayLengthMin);
    const cam = this.camera.position;
    const sunDir = this.sky.update(phase, this.rules.nightFraction, this.weather, cam, this.time);
    const day = this.sky.daylight;
    const head = this.world.getBlock(Math.floor(cam.x), Math.floor(cam.y), Math.floor(cam.z));
    const underwater = LIQUID[head] === 1;
    const u = this.uniforms;
    u.uDaylight.value = day;
    u.uSkyTint.value.copy(this.sky.skyTint);
    u.uTime.value = this.time;
    if (underwater) {
      u.uFogColor.value.setRGB(0.1, 0.25, 0.45);
      u.uFogNear.value = 0;
      u.uFogFar.value = 18;
    } else {
      u.uFogColor.value.copy(this.sky.horizon);
      const far = (this.rules.viewDistance - 0.5) * CHUNK_SIZE * (1 - this.weather * 0.45);
      u.uFogFar.value = far;
      u.uFogNear.value = far * 0.5;
    }
    this.renderer.setClearColor(u.uFogColor.value);
    this.sun.position.copy(cam).addScaledVector(sunDir, 50);
    this.sun.target.position.copy(cam);
    this.sun.intensity = Math.max(0, sunDir.y) * 1.4 * day;
    // Match entity brightness to the terrain's sky-light curve: dark at night,
    // a little brighter if the player holds a light (the torch point light adds locally).
    this.ambient.intensity = 0.05 + Math.pow(day, 1.6) * 0.8;
    const held = this.heldDef();
    this.torchLight.intensity = held?.heldLight ? 1.6 : 0;
    u.uHandLightRadius.value = held?.heldLight ?? 0;
    u.uHandLightPos.value.copy(cam);
    // weather particles: snow in cold biomes
    let snow = false;
    if (this.gen) {
      const col = this.gen.rawColumn(Math.floor(cam.x), Math.floor(cam.z));
      snow = col.biome === Biome.Snowy || col.biome === Biome.Taiga || col.temp < -0.3 || cam.y > 95;
    }
    this.fx.update(dt, cam, this.weather, snow);
    this.ents.update(this.sim.serverNow(), dt, cam);
    // positional footsteps for creatures/NPCs
    for (const v of this.ents.views.values()) {
      if (v.kind !== 'a') continue;
      const p = v.root.position;
      const st = this.entSteps.get(v.id) ?? { x: p.x, z: p.z, d: 0 };
      st.d += Math.hypot(p.x - st.x, p.z - st.z);
      st.x = p.x; st.z = p.z;
      if (st.d > (v.last.n === 'scavenger' ? 1.6 : 2.2)) {
        st.d = 0;
        const below = this.world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.1), Math.floor(p.z));
        if (p.distanceTo(cam) < 30) this.audio.footstep(blockDef(below).sound, [p.x, p.y, p.z], v.last.n === 'bear' ? 1.5 : 0.8);
      }
      this.entSteps.set(v.id, st);
    }
    const s = this.local.state;
    const moving = Math.min(1, Math.hypot(s.vx, s.vz) / 4.3) * (s.onGround ? 1 : 0);
    this.vm.setHeld(held?.key ?? '');
    this.vm.update(dt, moving, Math.max(0.15, day), this.camera.aspect, this.aiming);
    this.vm.camera.fov = this.camera.fov;
    const indoor = !!raycastVoxels(this.world, cam.x, cam.y, cam.z, 0, 1, 0, 12, (id) => blockDef(id).opaque);
    this.audio.updateAmbience(dt, cam.y, day, this.weather, indoor);
  }

  private updateHudFrame(dt: number, held: ItemDef | undefined) {
    void dt;
    const phase = dayPhase(this.time, this.rules.dayLengthMin);
    this.hud.clock(clockString(phase, this.rules.nightFraction));
    if (this.inv) this.hud.ammo(this.inv, (id) => this.invUI.count(id));
    const now = performance.now() / 1000;
    if (this.useUntil > now) this.hud.progress(1 - (this.useUntil - now) / this.useTotal);
    else if (this.reloadUntil > now && held?.weapon?.reload) this.hud.progress(1 - (this.reloadUntil - now) / held.weapon.reload);
    else this.hud.progress(null);
    if (now - this.benchCheck > 0.5) {
      this.benchCheck = now;
      this.invUI.setBench(this.benchNear());
    }
    if (this.settings.showFps) {
      const s = this.local.state;
      this.hud.fps(`${Math.round(this.fps)} fps · ${this.worldTris.toLocaleString()} tris · ${this.worldCalls} draws\n` +
        `chunks ${this.world.chunks.size} meshed ${this.chunks.chunkMeshCount} pending ${this.chunks.pendingCount}\n` +
        `xyz ${s.x.toFixed(1)} ${s.y.toFixed(1)} ${s.z.toFixed(1)} · corrections ${this.local.corrections}`);
    } else this.hud.fps('');
  }

  /** Highest workbench level within 4 blocks (for the crafting UI; the simulation re-checks). */
  private benchNear(): number {
    const s = this.local.state;
    let best = 0;
    for (let y = -4; y <= 4; y++) for (let z = -4; z <= 4; z++) for (let x = -4; x <= 4; x++) {
      const id = this.world.getBlock(Math.floor(s.x) + x, Math.floor(s.y) + y, Math.floor(s.z) + z);
      if (id === B.workbench1) best = Math.max(best, 1);
      else if (id === B.workbench2) best = Math.max(best, 2);
      else if (id === B.workbench3) best = Math.max(best, 3);
    }
    return best;
  }

  /** Called by the keypad UI. */
  submitCode(code: string, mode: string) {
    this.sim.send({ t: 'lock', op: mode === 'set' ? 'set' : 'enter', code });
    this.setMode('play');
  }

  async quit() {
    this.running = false;
    this.input.exitLock();
    await this.sim.close();
    this.chunks.dispose();
    this.ents.clear();
    this.hud.show(false);
    this.renderer.dispose();
  }
}

export { chunkKey };
