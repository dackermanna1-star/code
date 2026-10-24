// Sandbox editor: place, select, tune, move, rotate and delete obstacles;
// spawn props and vehicles. Uses a free-fly camera while active.

import * as THREE from 'three';
import type { Game } from '../game/game.ts';
import { REGISTRY, type Obstacle, type ObstacleType } from '../game/obstacles/base.ts';
import { PROP_DEFS } from '../game/props.ts';
import { h } from './dom.ts';

type Tool = { kind: 'obstacle'; type: ObstacleType } | { kind: 'prop'; id: string } | { kind: 'move' } | null;

export class EditorUI {
  private game: Game;
  private panel: HTMLElement;
  private selInfo: HTMLElement;
  private tool: Tool = null;
  private selected: Obstacle | null = null;
  private active = false;
  private ghost: THREE.Group;
  private helper: THREE.BoxHelper | null = null;
  private downX = 0;
  private downY = 0;
  private toolButtons = new Map<string, HTMLElement>();
  private rebuildTimer = 0;
  private pendingRebuild = false;
  private mouseNdc = new THREE.Vector2();
  private onClose: () => void;
  private canvas: HTMLCanvasElement;

  constructor(game: Game, root: HTMLElement, onClose: () => void) {
    this.game = game;
    this.onClose = onClose;
    this.canvas = game.renderer.renderer.domElement;
    this.selInfo = h('div', { class: 'params' });
    const cats = new Map<string, ObstacleType[]>();
    for (const t of REGISTRY.values()) {
      const l = cats.get(t.category) ?? [];
      l.push(t);
      cats.set(t.category, l);
    }
    const sections: HTMLElement[] = [];
    for (const [cat, types] of cats) {
      sections.push(h('h3', {}, cat));
      sections.push(
        h(
          'div',
          { class: 'tool-grid' },
          ...types.map((t) => {
            const b = h('button', { class: 'tool', title: t.description, onclick: () => this.setTool({ kind: 'obstacle', type: t }) }, t.name);
            this.toolButtons.set('o:' + t.id, b);
            return b;
          }),
        ),
      );
    }
    sections.push(h('h3', {}, 'Props'));
    sections.push(
      h(
        'div',
        { class: 'tool-grid' },
        ...PROP_DEFS.map((p) => {
          const b = h('button', { class: 'tool', onclick: () => this.setTool({ kind: 'prop', id: p.id }) }, p.name);
          this.toolButtons.set('p:' + p.id, b);
          return b;
        }),
      ),
    );
    sections.push(h('h3', {}, 'Vehicles'));
    sections.push(
      h(
        'div',
        { class: 'ed-actions' },
        h('button', { class: 'btn small', onclick: () => game.spawnAI() }, 'AI rammer'),
        h('button', { class: 'btn small', onclick: () => this.spawnParked() }, 'Parked car'),
        h('button', { class: 'btn small', onclick: () => game.startDerby() }, 'Derby'),
        h('button', { class: 'btn small danger', onclick: () => { for (const e of [...game.vehicles]) if (e.role !== 'player') game.removeVehicle(e); } }, 'Remove others'),
      ),
    );
    sections.push(h('h3', {}, 'World'));
    sections.push(
      h(
        'div',
        { class: 'ed-actions' },
        h('button', { class: 'btn small', onclick: () => game.props.clear((p) => p.def.id === 'wheel' || p.age > 0) }, 'Clear props'),
        h('button', { class: 'btn small', onclick: () => { for (const o of game.obstacles) o.reset(); } }, 'Reset machines'),
        h('button', { class: 'btn small danger', onclick: () => { for (const o of [...game.obstacles]) if (!o.builtin) game.removeObstacle(o); this.select(null); } }, 'Delete placed'),
      ),
    );
    this.panel = h(
      'div',
      { id: 'editor', class: 'panel hidden interactive' },
      h('div', { class: 'panel-head' }, h('div', {}, h('h2', { style: { fontSize: '20px' } }, 'Sandbox'), h('div', { class: 'ed-hint' }, 'Click a tool, then click the ground. Click an object to edit it.')), h('button', { class: 'btn ghost', onclick: () => this.onClose(), 'aria-label': 'Close editor' }, '✕')),
      h('div', { class: 'scroll' }, h('h3', {}, 'Selected'), this.selInfo, ...sections),
      h('div', { class: 'ed-hint' }, 'Drag: look · WASD/QE: fly · Shift: fast · Del: delete · Esc: exit'),
    );
    root.appendChild(this.panel);
    this.ghost = this.buildGhost();
    game.scene.add(this.ghost);
    this.renderSelected();
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      this.downX = e.clientX;
      this.downY = e.clientY;
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!this.active || e.button !== 0) return;
      if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 5) return;
      this.click(e);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouseNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    });
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if ((e.code === 'Delete' || e.code === 'Backspace') && this.selected) {
        e.preventDefault();
        this.deleteSelected();
      }
    });
  }

  private buildGhost(): THREE.Group {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.0, 40), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false }));
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 3), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.8, depthTest: false }));
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0, 0.2, 2.8);
    g.add(arrow);
    g.renderOrder = 10;
    g.visible = false;
    return g;
  }

  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    this.panel.classList.toggle('hidden', !on);
    const g = this.game;
    if (on) {
      g.rig.setMode('free');
      // lift the camera a little for an overview
      g.renderer.camera.position.y += 6;
    } else {
      g.rig.setMode('chase');
      this.setTool(null);
      this.select(null);
    }
    this.ghost.visible = false;
  }

  private setTool(t: Tool): void {
    this.tool = t;
    for (const [k, b] of this.toolButtons) {
      const on = t && ((t.kind === 'obstacle' && k === 'o:' + t.type.id) || (t.kind === 'prop' && k === 'p:' + t.id));
      b.classList.toggle('on', !!on);
    }
    this.ghost.visible = !!t;
  }

  private camYaw(): number {
    const d = new THREE.Vector3();
    this.game.renderer.camera.getWorldDirection(d);
    return Math.atan2(d.x, d.z);
  }

  private click(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1, ny = -((e.clientY - r.top) / r.height) * 2 + 1;
    const g = this.game;
    const t = this.tool;
    if (t?.kind === 'obstacle') {
      const p = g.pickGround(nx, ny);
      if (!p) return;
      const o = g.addObstacle(t.type.id, p.x, p.z, this.camYaw());
      if (o) {
        this.select(o);
        g.audio.playUI('beep', 0.2);
      }
      return;
    }
    if (t?.kind === 'prop') {
      const p = g.pickGround(nx, ny);
      if (!p) return;
      g.props.spawn(t.id, p.x, p.y + 2.5, p.z, this.camYaw());
      return;
    }
    if (t?.kind === 'move' && this.selected) {
      const p = g.pickGround(nx, ny);
      if (!p) return;
      this.selected.x = p.x;
      this.selected.z = p.z;
      this.selected.rebuild();
      this.setTool(null);
      this.renderSelected();
      return;
    }
    this.select(g.pickObstacle(nx, ny));
  }

  private select(o: Obstacle | null): void {
    this.selected = o;
    if (this.helper) {
      this.game.scene.remove(this.helper);
      this.helper.dispose();
      this.helper = null;
    }
    if (o) {
      this.helper = new THREE.BoxHelper(o.group, 0xffb020);
      this.game.scene.add(this.helper);
    }
    this.renderSelected();
  }

  private deleteSelected(): void {
    if (!this.selected) return;
    this.game.removeObstacle(this.selected);
    this.select(null);
  }

  private renderSelected(): void {
    const o = this.selected;
    if (!o) {
      this.selInfo.replaceChildren(h('div', { class: 'ed-hint' }, 'Nothing selected.'));
      return;
    }
    const t = REGISTRY.get(o.type)!;
    const rows = t.params.map((p) => {
      const val = h('span', {}, fmt(o.params[p.key], p.step, p.unit));
      const inp = h('input', { type: 'range', min: p.min, max: p.max, step: p.step, value: o.params[p.key] }) as HTMLInputElement;
      inp.addEventListener('input', () => {
        o.params[p.key] = Number(inp.value);
        val.textContent = fmt(o.params[p.key], p.step, p.unit);
        this.pendingRebuild = true;
        this.rebuildTimer = 0.15;
      });
      return h('div', { class: 'param' }, h('label', {}, h('span', {}, p.label), val), inp);
    });
    this.selInfo.replaceChildren(
      h('div', { style: { fontWeight: '700' } }, t.name, o.builtin ? h('span', { class: 'ed-hint' }, '  (map)') : null),
      ...rows,
      h(
        'div',
        { class: 'ed-actions' },
        h('button', { class: 'btn small', onclick: () => { o.yaw -= Math.PI / 12; o.rebuild(); this.refreshHelper(); } }, '⟲ 15°'),
        h('button', { class: 'btn small', onclick: () => { o.yaw += Math.PI / 12; o.rebuild(); this.refreshHelper(); } }, '⟳ 15°'),
        h('button', { class: 'btn small', onclick: () => this.setTool({ kind: 'move' }) }, 'Move'),
        h('button', { class: 'btn small', onclick: () => { o.setEnabled(!o.enabled); this.renderSelected(); } }, o.enabled ? 'Disable' : 'Enable'),
        h('button', { class: 'btn small danger', onclick: () => this.deleteSelected() }, 'Delete'),
      ),
    );
  }

  private refreshHelper(): void {
    if (this.helper && this.selected) this.helper.setFromObject(this.selected.group);
  }

  private spawnParked(): void {
    const g = this.game;
    const cam = g.renderer.camera;
    const d = new THREE.Vector3();
    cam.getWorldDirection(d);
    const x = cam.position.x + d.x * 15, z = cam.position.z + d.z * 15;
    const ids = ['meridian', 'pico', 'vortex', 'brute', 'summit', 'atlas', 'courier'];
    const id = ids[Math.floor(Math.random() * ids.length)];
    const e = g.spawnVehicle(id, Math.floor(Math.random() * 0xffffff), 'parked', x, z, Math.random() * 6);
    e.vehicle.body.canSleep = true;
  }

  update(dt: number): void {
    if (!this.active) return;
    if (this.pendingRebuild) {
      this.rebuildTimer -= dt;
      if (this.rebuildTimer <= 0 && this.selected) {
        this.pendingRebuild = false;
        this.selected.rebuild();
        this.refreshHelper();
      }
    }
    if (this.tool) {
      const p = this.game.pickGround(this.mouseNdc.x, this.mouseNdc.y);
      if (p) {
        this.ghost.position.copy(p).add(new THREE.Vector3(0, 0.1, 0));
        this.ghost.rotation.y = this.camYaw();
        this.ghost.visible = true;
      }
    }
    if (this.helper && this.selected) this.helper.update();
  }
}

function fmt(v: number, step: number, unit?: string): string {
  const d = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return `${v.toFixed(d)}${unit ? ' ' + unit : ''}`;
}
