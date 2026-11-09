/**
 * Garage + main menu: a 3D showroom with the current car on a turntable,
 * car selection, upgrade cards, level select, settings and LAUNCH.
 */
import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  HemisphericLight,
  MeshBuilder,
  ShadowGenerator,
  Vector3,
} from "@babylonjs/core";
import { audio } from "../audio/Audio";
import { CARS, getCar, type CarDef, type CarId } from "../data/cars";
import { LEVELS } from "../data/levels";
import { computeStats, partPrice, SLOTS, type CarStats, type SlotId } from "../data/parts";
import { toon } from "../fx/Materials";
import { Shadows } from "../fx/Shadows";
import { buildCarModel, type CarModel } from "../vehicles/CarModel";
import type { GameContext } from "../core/types";

const STAT_BARS: { key: keyof CarStats; label: string; max: number }[] = [
  { key: "topSpeed", label: "Speed", max: 75 },
  { key: "enginePower", label: "Power", max: 110000 },
  { key: "fuel", label: "Fuel", max: 520 },
  { key: "health", label: "Armor", max: 2200 },
  { key: "grip", label: "Grip", max: 2 },
  { key: "boostCapacity", label: "Boost", max: 7 },
];

export class GarageScreen {
  private root: HTMLDivElement;
  private camera: ArcRotateCamera;
  private model: CarModel | null = null;
  private pop = 0;
  private settingsOpen = false;
  private keyHandler: (e: KeyboardEvent) => void;

  constructor(
    private ctx: GameContext,
    private onLaunch: (levelIndex: number) => void,
  ) {
    const scene = ctx.scene;
    scene.clearColor = Color4.FromHexString("#1b1424ff");
    scene.fogMode = 0;
    this.camera = new ArcRotateCamera("garageCam", -Math.PI / 2.6, 1.25, 11, new Vector3(0, 1, 0), scene);
    this.camera.lowerRadiusLimit = 7;
    this.camera.upperRadiusLimit = 18;
    this.camera.upperBetaLimit = 1.45;
    this.camera.wheelPrecision = 30;
    this.camera.attachControl(ctx.canvas, true);
    this.camera.useAutoRotationBehavior = true;
    this.camera.autoRotationBehavior!.idleRotationSpeed = 0.25;
    scene.activeCamera = this.camera;

    const hemi = new HemisphericLight("gHemi", new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.65;
    hemi.diffuse = Color3.FromHexString("#ffe7d1");
    hemi.groundColor = Color3.FromHexString("#40304a");
    const key = new DirectionalLight("gKey", new Vector3(-0.6, -1, 0.4), scene);
    key.position.set(10, 20, -10);
    key.intensity = 1.0;
    const sg = new ShadowGenerator(1024, key);
    sg.usePercentageCloserFiltering = true;
    sg.bias = 0.002;
    Shadows.set(sg);

    // Showroom: turntable, floor, backdrop props.
    const floor = MeshBuilder.CreateDisc("floor", { radius: 40, tessellation: 48 }, scene);
    floor.rotation.x = Math.PI / 2;
    floor.material = toon(scene, "#3a2d40");
    floor.receiveShadows = true;
    const table = MeshBuilder.CreateCylinder("table", { diameter: 9, height: 0.3, tessellation: 40 }, scene);
    table.position.y = 0.15;
    table.material = toon(scene, "#ff7a2f");
    table.receiveShadows = true;
    const ring = MeshBuilder.CreateTorus("ring", { diameter: 9.1, thickness: 0.18, tessellation: 40 }, scene);
    ring.position.y = 0.3;
    ring.material = toon(scene, "#ffd166", { emissive: 0.6 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const tire = MeshBuilder.CreateTorus(`tire${i}`, { diameter: 1.4, thickness: 0.5, tessellation: 12 }, scene);
      tire.position.set(Math.cos(a) * 14, 0.25, Math.sin(a) * 14);
      tire.material = toon(scene, "#1c1a20");
      const barrel = MeshBuilder.CreateCylinder(`barrel${i}`, { diameter: 0.9, height: 1.3, tessellation: 10 }, scene);
      barrel.position.set(Math.cos(a + 0.3) * 15, 0.65, Math.sin(a + 0.3) * 15);
      barrel.material = toon(scene, i % 2 ? "#c0392b" : "#3d6f8a");
      Shadows.cast(barrel);
    }

    this.root = document.createElement("div");
    this.root.className = "garage";
    ctx.uiRoot.appendChild(this.root);
    this.rebuildModel();
    this.render();

    this.keyHandler = (e) => {
      if (this.settingsOpen) return;
      if (e.code === "Enter") this.launch();
    };
    window.addEventListener("keydown", this.keyHandler);
  }

  private get save() {
    return this.ctx.save.data;
  }

  private car(): CarDef {
    return getCar(this.save.currentCar);
  }

  private rebuildModel(): void {
    this.model?.dispose();
    const def = this.car();
    this.model = buildCarModel(this.ctx.scene, def, this.ctx.save.loadout());
    const minY = def.rideHeight + def.wheelRadius * 0.6;
    this.model.root.position.set(0, 0.3 + minY + def.size.height / 2 - 0.2, 0);
    this.model.root.getChildMeshes().forEach((m) => {
      m.receiveShadows = true;
      Shadows.cast(m, false);
    });
    this.camera.radius = Math.max(9, def.size.length * 1.6 + 3);
    this.pop = 1;
  }

  private launch(): void {
    audio.ui("launch");
    this.onLaunch(this.save.selectedLevel);
  }

  private render(): void {
    const s = this.save;
    const car = this.car();
    const loadout = this.ctx.save.loadout();
    const stats = computeStats(car, loadout);

    const carCards = CARS.map((c) => {
      const owned = s.ownedCars.includes(c.id);
      const unlocked = s.levelsUnlocked >= c.unlockLevel || owned;
      const cur = c.id === s.currentCar;
      const label = owned ? (cur ? "DRIVING" : "SELECT") : unlocked ? `$${c.price.toLocaleString()}` : `🔒 Reach level ${c.unlockLevel + 1}`;
      return `<button class="car-chip ${cur ? "cur" : ""} ${!unlocked ? "locked" : ""}" data-car="${c.id}" style="--c:${c.colors.body}">
        <span class="car-name">${c.name}</span><span class="car-act">${label}</span></button>`;
    }).join("");

    const slots = SLOTS.map((slot) => {
      const tier = loadout[slot.id];
      const max = slot.tiers.length - 1;
      const next = tier < max ? slot.tiers[tier + 1] : null;
      const price = next ? partPrice(car, slot.id, tier + 1) : 0;
      const pips = slot.tiers.slice(1).map((_, i) => `<i class="${i < tier ? "on" : ""}"></i>`).join("");
      return `<div class="slot" data-slot="${slot.id}">
        <div class="slot-head"><span class="slot-icon">${slot.icon}</span><span class="slot-name">${slot.name}</span><span class="pips">${pips}</span></div>
        <div class="slot-cur">${slot.tiers[tier].name}</div>
        ${next
          ? `<button class="buy ${s.cash >= price ? "" : "poor"}" data-buy="${slot.id}"><span>${next.name}</span><small>${next.desc}</small><b>$${price.toLocaleString()}</b></button>`
          : `<div class="maxed">MAXED OUT</div>`}
      </div>`;
    }).join("");

    const bars = STAT_BARS.map((b) => {
      const v = Math.sqrt(Math.min(1, (stats[b.key] as number) / b.max));
      return `<div class="stat"><span>${b.label}</span><div class="stat-track"><div class="stat-prev" data-stat="${b.key}"></div><div class="stat-fill" style="width:${v * 100}%"></div></div></div>`;
    }).join("");

    const levels = LEVELS.map((l, i) => {
      const locked = i > s.levelsUnlocked;
      const best = s.bestDistance[i] ?? 0;
      const cleared = s.levelsCleared.includes(i);
      return `<button class="lvl ${i === s.selectedLevel ? "cur" : ""} ${locked ? "locked" : ""}" data-level="${i}" style="--sky:${l.palette.skyTop};--gnd:${l.palette.ground}">
        <span class="lvl-num">${i + 1}</span><span class="lvl-name">${l.name}</span>
        <span class="lvl-best">${locked ? "🔒" : cleared ? "✔ CLEARED" : best > 0 ? `${Math.floor(best)} / ${l.length} m` : `${l.length} m`}</span></button>`;
    }).join("");

    const sel = LEVELS[s.selectedLevel];
    this.root.innerHTML = `
      <header class="g-top">
        <div class="logo">DEAD<span>MILE</span></div>
        <div class="g-cash">$${s.cash.toLocaleString()}</div>
        <button class="icon-btn" data-act="settings" aria-label="Settings">⚙</button>
      </header>
      <aside class="panel g-left">
        <h3>Garage</h3>
        <div class="car-title"><b>${car.name}</b><small>${car.blurb}</small></div>
        <div class="stats">${bars}</div>
        <div class="cars">${carCards}</div>
      </aside>
      <aside class="panel g-right"><h3>Upgrades</h3><div class="slots">${slots}</div></aside>
      <footer class="g-bottom">
        <div class="levels">${levels}</div>
        <div class="launch-wrap">
          <div class="lvl-tag">${sel.tagline}</div>
          <button class="launch" data-act="launch">LAUNCH <small>↵</small></button>
        </div>
      </footer>
      ${this.settingsOpen ? this.settingsHtml() : ""}`;
    this.bind(car);
  }

  private settingsHtml(): string {
    const st = this.save.settings;
    const opt = (name: string, values: string[], cur: string) =>
      `<div class="seg">${values.map((v) => `<button class="${v === cur ? "on" : ""}" data-set="${name}" data-val="${v}">${v}</button>`).join("")}</div>`;
    return `<div class="modal-back"><div class="modal panel">
      <h3>Settings</h3>
      <label>Master volume <input type="range" min="0" max="1" step="0.05" value="${st.masterVolume}" data-range="masterVolume"></label>
      <label>Music <input type="range" min="0" max="1" step="0.05" value="${st.musicVolume}" data-range="musicVolume"></label>
      <label>Effects <input type="range" min="0" max="1" step="0.05" value="${st.sfxVolume}" data-range="sfxVolume"></label>
      <div class="row"><span>Gore</span>${opt("gore", ["full", "green", "off"], st.gore)}</div>
      <div class="row"><span>Graphics</span>${opt("quality", ["low", "medium", "high"], st.quality)}</div>
      <div class="row"><span>Camera shake</span>${opt("cameraShake", ["on", "off"], st.cameraShake ? "on" : "off")}</div>
      <div class="controls"><b>Controls</b><br>W/↑ gas · S/↓ brake/reverse · A/D steer · Shift boost · Space fire · C handbrake<br>In the air: W/S pitch · A/D (or Q/E) roll · Gamepad supported</div>
      <div class="row end"><button class="danger" data-act="reset">Reset progress</button><button class="ok" data-act="close">Done</button></div>
    </div></div>`;
  }

  private bind(car: CarDef): void {
    const r = this.root;
    r.querySelectorAll<HTMLButtonElement>("[data-car]").forEach((b) =>
      b.addEventListener("click", () => this.onCar(b.dataset.car as CarId, b)),
    );
    r.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach((b) => {
      b.addEventListener("click", () => this.onBuy(car, b.dataset.buy as SlotId, b));
      b.addEventListener("mouseenter", () => this.previewStats(car, b.dataset.buy as SlotId));
      b.addEventListener("mouseleave", () => this.previewStats(car, null));
    });
    r.querySelectorAll<HTMLButtonElement>("[data-level]").forEach((b) =>
      b.addEventListener("click", () => {
        const i = +b.dataset.level!;
        if (i > this.save.levelsUnlocked) return this.deny(b);
        audio.ui("click");
        this.save.selectedLevel = i;
        this.ctx.save.write();
        this.render();
      }),
    );
    r.querySelector('[data-act="launch"]')?.addEventListener("click", () => this.launch());
    r.querySelector('[data-act="settings"]')?.addEventListener("click", () => {
      audio.ui("click");
      this.settingsOpen = true;
      this.render();
    });
    r.querySelector('[data-act="close"]')?.addEventListener("click", () => {
      audio.ui("click");
      this.settingsOpen = false;
      this.ctx.save.write();
      this.render();
    });
    r.querySelector('[data-act="reset"]')?.addEventListener("click", () => {
      if (!confirm("Reset ALL progress? This cannot be undone.")) return;
      const settings = this.save.settings;
      this.ctx.save.reset();
      this.ctx.save.data.settings = settings;
      this.ctx.save.write();
      this.settingsOpen = false;
      this.rebuildModel();
      this.render();
    });
    r.querySelectorAll<HTMLInputElement>("[data-range]").forEach((inp) =>
      inp.addEventListener("input", () => {
        (this.save.settings as unknown as Record<string, number>)[inp.dataset.range!] = parseFloat(inp.value);
      }),
    );
    r.querySelectorAll<HTMLButtonElement>("[data-set]").forEach((b) =>
      b.addEventListener("click", () => {
        const st = this.save.settings as unknown as Record<string, unknown>;
        const k = b.dataset.set!;
        st[k] = k === "cameraShake" ? b.dataset.val === "on" : b.dataset.val;
        audio.ui("click");
        this.ctx.save.write();
        this.render();
      }),
    );
  }

  private previewStats(car: CarDef, slot: SlotId | null): void {
    const loadout = this.ctx.save.loadout();
    const next = slot && loadout[slot] < SLOTS.find((s) => s.id === slot)!.tiers.length - 1 ? { ...loadout, [slot]: loadout[slot] + 1 } : null;
    const after = next ? computeStats(car, next) : null;
    for (const b of STAT_BARS) {
      const el = this.root.querySelector<HTMLElement>(`[data-stat="${b.key}"]`);
      if (!el) continue;
      el.style.width = after ? `${Math.sqrt(Math.min(1, (after[b.key] as number) / b.max)) * 100}%` : "0";
    }
  }

  private deny(btn: HTMLElement): void {
    audio.ui("deny");
    btn.classList.remove("shake");
    void btn.offsetWidth;
    btn.classList.add("shake");
  }

  private onCar(id: CarId, btn: HTMLElement): void {
    const s = this.save;
    const c = getCar(id);
    if (s.ownedCars.includes(id)) {
      if (s.currentCar === id) return;
      s.currentCar = id;
      audio.ui("click");
    } else {
      const unlocked = s.levelsUnlocked >= c.unlockLevel;
      if (!unlocked || s.cash < c.price) return this.deny(btn);
      s.cash -= c.price;
      s.ownedCars.push(id);
      s.currentCar = id;
      audio.ui("buy");
    }
    this.ctx.save.write();
    this.rebuildModel();
    this.render();
  }

  private onBuy(car: CarDef, slot: SlotId, btn: HTMLElement): void {
    const loadout = this.ctx.save.loadout();
    const tier = loadout[slot] + 1;
    const price = partPrice(car, slot, tier);
    if (this.save.cash < price) return this.deny(btn);
    this.save.cash -= price;
    loadout[slot] = tier;
    this.ctx.save.write();
    audio.ui("buy");
    this.rebuildModel();
    this.render();
  }

  update(_dt: number): void {
    if (this.pop > 0 && this.model) {
      this.pop = Math.max(0, this.pop - this.ctx.engine.getDeltaTime() / 450);
      // bouncy bolt-on pop
      const t = 1 - this.pop;
      const s = 1 + Math.sin(t * Math.PI * 3) * 0.08 * this.pop;
      this.model.root.scaling.set(s, 1 / s, s);
    }
  }

  dispose(): void {
    window.removeEventListener("keydown", this.keyHandler);
    this.camera.detachControl();
    this.model?.dispose();
    this.root.remove();
    Shadows.set(null);
  }
}
