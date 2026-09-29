import * as THREE from 'three';

export interface DragHandler {
  move(ray: THREE.Ray, ndc: THREE.Vector2): void;
  up(ray: THREE.Ray, ndc: THREE.Vector2, clicked: boolean): void;
  cancel?(): void;
}

export interface Interactive {
  object: THREE.Object3D;
  enabled?: () => boolean;
  cursor?: string;
  /** larger values win when several are hit */
  priority?: number;
  onHover?(hover: boolean): void;
  onDown?(hit: THREE.Intersection, ray: THREE.Ray): DragHandler | void;
  onClick?(hit: THREE.Intersection): void;
}

/**
 * Pointer input for the 3D scene: raycasts against registered interactives,
 * tracks hover, and turns presses into click or drag gestures. Works with
 * mouse, pen and touch via Pointer Events.
 */
export class Input {
  readonly ndc = new THREE.Vector2();
  readonly raycaster = new THREE.Raycaster();
  private items: Interactive[] = [];
  private hovered: Interactive | null = null;
  private drag: DragHandler | null = null;
  private downPos = new THREE.Vector2();
  private downItem: Interactive | null = null;
  private downHit: THREE.Intersection | null = null;
  private moved = false;
  enabled = true;
  pointerInside = false;
  onPointerMove?: (ndc: THREE.Vector2) => void;
  /** Called when the pointer is pressed on empty space (no interactive). */
  onEmptyClick?: () => void;

  constructor(private canvas: HTMLCanvasElement, private camera: THREE.Camera) {
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', () => this.cancel());
    canvas.addEventListener('pointerleave', () => {
      this.pointerInside = false;
    });
    canvas.addEventListener('pointerenter', () => {
      this.pointerInside = true;
    });
    canvas.style.touchAction = 'none';
  }

  set(items: Interactive[]) {
    this.cancel();
    this.setHover(null);
    this.items = items;
  }

  add(item: Interactive) {
    this.items.push(item);
  }

  remove(item: Interactive) {
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
    if (this.hovered === item) this.setHover(null);
  }

  get dragging() {
    return !!this.drag;
  }

  private updateNdc(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  /** Re-cast from the last pointer position (the camera may have moved). */
  refreshRay() {
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  private pick(): { item: Interactive; hit: THREE.Intersection } | null {
    let best: { item: Interactive; hit: THREE.Intersection } | null = null;
    for (const item of this.items) {
      if (item.enabled && !item.enabled()) continue;
      if (!item.object.visible) continue;
      const hits = this.raycaster.intersectObject(item.object, true);
      if (!hits.length) continue;
      const h = hits[0];
      if (
        !best ||
        (item.priority ?? 0) > (best.item.priority ?? 0) ||
        ((item.priority ?? 0) === (best.item.priority ?? 0) && h.distance < best.hit.distance)
      )
        best = { item, hit: h };
    }
    return best;
  }

  private setHover(item: Interactive | null) {
    if (item === this.hovered) return;
    this.hovered?.onHover?.(false);
    this.hovered = item;
    item?.onHover?.(true);
    this.canvas.style.cursor = item ? item.cursor ?? 'pointer' : 'default';
  }

  private down(e: PointerEvent) {
    if (!this.enabled || e.button > 0) return;
    this.updateNdc(e);
    this.downPos.set(e.clientX, e.clientY);
    this.moved = false;
    const p = this.pick();
    if (!p) {
      this.onEmptyClick?.();
      return;
    }
    this.canvas.setPointerCapture?.(e.pointerId);
    this.downItem = p.item;
    this.downHit = p.hit;
    const d = p.item.onDown?.(p.hit, this.raycaster.ray);
    if (d) {
      this.drag = d;
      this.canvas.style.cursor = 'grabbing';
    }
  }

  private move(e: PointerEvent) {
    this.updateNdc(e);
    this.onPointerMove?.(this.ndc);
    if (!this.enabled) return;
    if (this.downItem && this.downPos.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 6) this.moved = true;
    if (this.drag) {
      this.drag.move(this.raycaster.ray, this.ndc);
      return;
    }
    if (e.pointerType === 'mouse') this.setHover(this.pick()?.item ?? null);
  }

  private up(e: PointerEvent) {
    if (!this.enabled) {
      this.cancel();
      return;
    }
    this.updateNdc(e);
    const clicked = !this.moved;
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      d.up(this.raycaster.ray, this.ndc, clicked);
      this.canvas.style.cursor = 'default';
    } else if (this.downItem && clicked && this.downHit) {
      this.downItem.onClick?.(this.downHit);
    }
    this.downItem = null;
    this.downHit = null;
    if (e.pointerType === 'mouse') this.setHover(this.pick()?.item ?? null);
  }

  cancel() {
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      d.cancel?.();
    }
    this.downItem = null;
  }

  /** Intersect the current pointer ray with a horizontal plane at height y. */
  static planePoint(ray: THREE.Ray, y: number, out = new THREE.Vector3()): THREE.Vector3 | null {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    return ray.intersectPlane(plane, out);
  }
}
