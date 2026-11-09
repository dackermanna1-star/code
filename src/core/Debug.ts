/**
 * Lightweight debug overlay (toggle with the backquote key):
 *  - FPS / draw stats
 *  - live-tunable numeric parameters registered by any system
 *  - optional physics shape viewer
 */
import { PhysicsViewer, type Scene, type Engine } from "@babylonjs/core";

interface Tunable {
  label: string;
  get: () => number;
  set: (v: number) => void;
  min: number;
  max: number;
  step: number;
}

class DebugPanel {
  private el?: HTMLDivElement;
  private statsEl?: HTMLDivElement;
  private tunables: Tunable[] = [];
  private viewer?: PhysicsViewer;
  visible = false;
  private lines: Record<string, string> = {};

  /** Register a slider. Safe to call before the panel exists. */
  tune(label: string, obj: Record<string, any>, key: string, min: number, max: number, step = 0.01): void {
    if (this.tunables.some((t) => t.label === label)) return;
    this.tunables.push({ label, get: () => obj[key], set: (v) => (obj[key] = v), min, max, step });
    if (this.el) this.render();
  }

  /** Show a line of text in the panel (call every frame for live values). */
  watch(label: string, value: string | number): void {
    this.lines[label] = typeof value === "number" ? value.toFixed(2) : value;
  }

  toggle(): void {
    this.visible = !this.visible;
    if (this.visible) this.render();
    if (this.el) this.el.style.display = this.visible ? "block" : "none";
  }

  update(engine: Engine, scene: Scene): void {
    if (!this.visible || !this.statsEl) return;
    const lines = [
      `FPS ${engine.getFps().toFixed(0)}`,
      `meshes ${scene.getActiveMeshes().length}/${scene.meshes.length}`,
      ...Object.entries(this.lines).map(([k, v]) => `${k}: ${v}`),
    ];
    this.statsEl.textContent = lines.join("\n");
  }

  togglePhysicsViewer(scene: Scene): void {
    if (this.viewer) {
      this.viewer.dispose();
      this.viewer = undefined;
      return;
    }
    this.viewer = new PhysicsViewer(scene);
    for (const m of scene.meshes) if (m.physicsBody) this.viewer.showBody(m.physicsBody);
  }

  reset(): void {
    this.tunables = [];
    this.lines = {};
    this.viewer = undefined;
    if (this.el) this.render();
  }

  private render(): void {
    if (!this.el) {
      this.el = document.createElement("div");
      this.el.className = "debug-panel";
      document.body.appendChild(this.el);
    }
    this.el.innerHTML = "";
    this.statsEl = document.createElement("div");
    this.statsEl.className = "debug-stats";
    this.el.appendChild(this.statsEl);
    for (const t of this.tunables) {
      const row = document.createElement("label");
      row.className = "debug-row";
      const name = document.createElement("span");
      name.textContent = t.label;
      const val = document.createElement("span");
      val.textContent = String(+t.get().toFixed(3));
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(t.min);
      input.max = String(t.max);
      input.step = String(t.step);
      input.value = String(t.get());
      input.addEventListener("input", () => {
        t.set(parseFloat(input.value));
        val.textContent = String(+t.get().toFixed(3));
      });
      row.append(name, input, val);
      this.el.appendChild(row);
    }
  }
}

export const Debug = new DebugPanel();
