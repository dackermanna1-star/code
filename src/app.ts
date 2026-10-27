import * as THREE from 'three';
import { SceneRenderer } from './render/scenerenderer';
import { World } from './sim/world';
import { Input } from './sim/input';
import { SpectatorController } from './sim/spectator';
import { Hud } from './ui/hud';
import { UPos } from './core/upos';
import { AU, G, LY } from './core/constants';
import { generateSystem } from './astro/systemgen';
import { Cosmos, type SystemRef } from './sim/cosmos';
import { galaxyToUPos } from './astro/galaxy';
import type { Body, StarSystem } from './astro/body';
import { Player } from './sim/player';
import { formatDistance, formatSpeed } from './core/mathutil';
import { bodyTarget, galaxyTarget, nebulaTarget, pick, standoff, systemTarget, type Target } from './sim/targets';
import { Overlay } from './ui/overlay';
import { InfoPanel } from './ui/infopanel';
import { describe } from './ui/describe';
import { Scanner, scanRange } from './sim/scanner';
import { Discoveries, type Discovery, type DiscoveryKind, type Bookmark } from './sim/discoveries';
import { captureLocation, lookRotation, restoreLocation, type SavedLocation } from './sim/locations';
import { SearchBox, matchScore, type SearchResult } from './ui/search';
import { StarMap } from './ui/map';
import { CatalogPanel } from './ui/catalogpanel';
import { HelpOverlay, SettingsMenu } from './ui/menu';
import { StartScreen } from './ui/start';
import { Modal } from './ui/modal';
import { loadSettings, saveSettings, type Settings } from './ui/settings';
import { loadRaw, save } from './ui/storage';
import { SOLAR_SYSTEM_ID } from './astro/known/solarsystem';
import { Rng } from './core/rng';

const _tv = new THREE.Vector3();

interface AutoSave {
  universe: string;
  location: SavedLocation;
  timeScale: number;
  selected?: string;
}

export class App {
  readonly renderer: SceneRenderer;
  readonly world = new World();
  readonly input: Input;
  readonly spectator: SpectatorController;
  readonly hud: Hud;
  readonly cosmos: Cosmos;
  readonly player: Player;
  readonly settings: Settings;
  readonly universeKey: string;
  readonly discoveries: Discoveries;
  readonly overlay: Overlay;
  readonly info: InfoPanel;
  readonly scanner = new Scanner();
  readonly search: SearchBox;
  readonly map: StarMap;
  readonly catalog: CatalogPanel;
  readonly settingsMenu: SettingsMenu;
  readonly help: HelpOverlay;
  readonly startScreen: StartScreen;
  selected: Target | null = null;
  private last = performance.now();
  private fps = 60;
  running = true;
  /** draw only every n-th frame (tests let terrain stream without paying for software rendering) */
  drawEvery = 1;
  private frameNo = 0;
  private lookAnim: { from: THREE.Quaternion; to: () => THREE.Quaternion; t: number } | null = null;
  orbitCam: { target: Target; yaw: number; pitch: number; dist: number; auto: boolean } | null = null;
  private pendingStart: (() => boolean) | null = null;
  private thumbQueue: { id: string; bookmark?: boolean }[] = [];
  private lastGalaxyId: string | null = null;
  private autosaveTimer = 0;
  private hintEl: HTMLElement;

  constructor(readonly canvas: HTMLCanvasElement, readonly ui: HTMLElement) {
    this.settings = loadSettings();
    this.renderer = new SceneRenderer(canvas);
    this.input = new Input(canvas);
    this.spectator = new SpectatorController(this.world, this.input);
    this.overlay = new Overlay(ui);
    this.hud = new Hud(ui);
    this.cosmos = new Cosmos(this.settings.universeSeed, this.settings.knownUniverse);
    this.universeKey = `${this.settings.knownUniverse ? 'known' : 'proc'}-${this.settings.universeSeed}`;
    this.discoveries = new Discoveries(this.universeKey);
    this.renderer.cosmos = this.cosmos;
    this.cosmos.onSystemChange = (sys) => this.onSystemChange(sys);
    this.spectator.farSpeedRef = () => this.cosmos.speedReference(this.world.view.toUPos(new UPos()), this.renderer.starField);
    this.player = new Player(this.world, this.input, this.spectator);
    this.player.onModeChange = (m) => {
      if (m !== 'spectator') this.input.requestPointerLock();
      this.orbitCam = null;
      if (this.player.ship && this.renderer.shipRenderer) this.player.cockpitOffset.copy(this.renderer.shipRenderer.model.cockpit);
    };
    // UI
    this.info = new InfoPanel(ui);
    this.search = new SearchBox(ui, (q) => this.searchProvider(q));
    this.map = new StarMap(ui);
    this.catalog = new CatalogPanel(ui, this.discoveries, {
      visitDiscovery: (d) => this.visitDiscovery(d),
      visitBookmark: (b) => this.visitBookmark(b),
    });
    this.settingsMenu = new SettingsMenu(ui, this.settings);
    this.settingsMenu.onChange = (k) => {
      this.applySettings(k);
      saveSettings(this.settings);
    };
    this.settingsMenu.extraButtons = [{ label: 'Main menu', run: () => { this.settingsMenu.modal.close(); this.startScreen.open(); } }];
    this.help = new HelpOverlay(ui, this.settings);
    const auto = loadRaw<AutoSave>('autosave');
    this.startScreen = new StartScreen(ui, {
      canContinue: !!auto && auto.universe === this.universeKey,
      continueJourney: () => this.continueJourney(),
      newKnown: () => this.newJourney(true, this.settings.knownUniverse ? this.settings.universeSeed : 20261027),
      newProcedural: (seed) => this.newJourney(false, seed),
      settings: () => this.settingsMenu.modal.open(),
      help: () => this.help.modal.open(),
    });
    this.hintEl = document.createElement('div');
    this.hintEl.className = 'panel hint-bar';
    this.hintEl.style.display = 'none';
    ui.appendChild(this.hintEl);
    // start in interstellar space near the Sun's position in the Milky Way
    const u = this.cosmos.universe;
    const start = galaxyToUPos(u.home, u.sunLocal.x + 3, u.sunLocal.y + 1, u.sunLocal.z + 2);
    this.world.view.rebase('universe', null);
    this.world.view.upos.copy(start);
    this.applySettings();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('beforeunload', () => { this.autosave(); this.discoveries.flush(); });
    this.resize();
  }

  /** Decide what to show first: title screen, or (tests / after a universe switch) start directly. */
  boot(params: URLSearchParams) {
    const auto = sessionStorage.getItem('ic-autostart');
    sessionStorage.removeItem('ic-autostart');
    if (params.has('test') || params.has('nomenu')) return;
    if (auto === 'known') this.startKnown();
    else if (auto === 'proc') this.startProcedural();
    else if (auto === 'continue') this.continueJourney();
    else this.startScreen.open();
  }

  // ------------------------------------------------------------- journeys
  private newJourney(known: boolean, seed: number) {
    if (known === this.settings.knownUniverse && seed === this.settings.universeSeed) {
      if (known) this.startKnown();
      else this.startProcedural();
      return;
    }
    this.settings.knownUniverse = known;
    this.settings.universeSeed = seed;
    saveSettings(this.settings);
    sessionStorage.setItem('ic-autostart', known ? 'known' : 'proc');
    this.running = false;
    location.reload();
  }

  startKnown() {
    this.player.toSpectator();
    if (!this.visitSystem(SOLAR_SYSTEM_ID)) return;
    this.placeNear('Earth', 2.6, 1.05);
    const earth = this.findBody('Earth');
    if (earth) this.select(bodyTarget(earth));
    this.hud.toast('Welcome. Press F1 for controls · click anything to select it · G to travel', 6);
  }

  startProcedural() {
    this.player.toSpectator();
    const u = this.cosmos.universe;
    const g = u.home;
    const rng = new Rng(this.settings.universeSeed ^ 0x2f1);
    const a = rng.range(0, Math.PI * 2);
    const r = g.diskScale * rng.range(0.9, 1.6);
    this.world.view.rebase('universe', null);
    this.world.view.upos.copy(galaxyToUPos(g, Math.cos(a) * r, rng.range(-30, 30), Math.sin(a) * r));
    this.hud.toast('Locating a star system…', 4);
    let tries = 0;
    this.pendingStart = () => {
      if (++tries > 1200) return true;
      const n = this.renderer.starField.nearest(this.cosmos.camG, 40);
      if (!n || tries < 20) return false;
      // prefer a nearby ordinary star with interesting planets
      let best: SystemRef | null = null;
      let bestScore = -Infinity;
      let k = 0;
      for (const st of this.renderer.starField.stars()) {
        const d = Math.hypot(st.x - this.cosmos.camG.x, st.y - this.cosmos.camG.y, st.z - this.cosmos.camG.z);
        if (d > 40 || st.remnant !== 0 || st.temp < 2800 || st.temp > 9000) continue;
        if (++k > 60) break;
        const ref = this.cosmos.refFromStar(st);
        const sys = ref.build();
        const s = Math.max(...sys.bodies.map((b) => interestScore(b)));
        if (s > bestScore) { bestScore = s; best = ref; }
      }
      const ref = best ?? this.cosmos.refFromStar(n.star);
      this.world.view.upos.copy(ref.upos).addXYZ(0, 0, 1e12);
      this.cosmos.update(this.world, this.world.view.toUPos(new UPos()), this.renderer.starField, 0);
      this.cosmos.activate(this.world, ref);
      const sys = this.world.system;
      if (!sys) return true;
      const top = [...sys.bodies].sort((x, y) => interestScore(y) - interestScore(x))[0];
      this.placeNear(top, top.isStarLike ? 8 : 2.8, 0.9);
      this.select(bodyTarget(top));
      this.hud.toast(`${sys.name} — a procedural system. Press F1 for controls.`, 6);
      return true;
    };
  }

  private continueJourney() {
    const a = loadRaw<AutoSave>('autosave');
    if (!a || a.universe !== this.universeKey) { this.startKnown(); return; }
    this.player.toSpectator();
    restoreLocation(this.world, this.cosmos, this.renderer.starField, a.location, true);
    this.world.timeScale = a.timeScale;
    this.renderer.pipeline.resetExposure();
    this.hud.toast('Journey resumed');
  }

  private autosave() {
    if (this.startScreen.isOpen || this.pendingStart) return;
    save('autosave', { universe: this.universeKey, location: captureLocation(this.world, this.cosmos), timeScale: this.world.timeScale, selected: this.selected?.id } satisfies AutoSave);
  }

  // -------------------------------------------------------------- systems
  private onSystemChange(sys: StarSystem | null) {
    this.renderer.setSystem(sys);
    // drop selections that refer to bodies of a discarded system
    if (this.selected?.kind === 'body' && this.selected.body!.system !== sys) this.selected = null;
    if (this.orbitCam?.target.kind === 'body' && this.orbitCam.target.body!.system !== sys) this.orbitCam = null;
    if (sys && this.cosmos.activeRef) {
      const ref = this.cosmos.activeRef;
      const primary = sys.stars[0];
      const planets = sys.bodies.filter((b) => b.kind === 'planet').length;
      const d = this.discoveries.discover({
        id: ref.id, name: ref.name, kind: 'system',
        subtitle: `${primary?.star?.spectralType ?? '?'} · ${planets} planet${planets === 1 ? '' : 's'}${sys.stars.length > 1 ? ` · ${sys.stars.length} stars` : ''}`,
        systemId: ref.id, place: this.cosmos.current?.name ?? '', simTime: this.world.time,
        location: captureLocation(this.world, this.cosmos),
      });
      if (d) this.hud.toast(`Entered ${ref.name} — ${d.subtitle}${ref.known ? '' : ' (new discovery)'}`, 4);
    }
  }

  loadSystem(seed: number, name = `ICS ${seed}`): StarSystem {
    // place the test system at the camera's current location (inside the current galaxy)
    const here = this.world.view.toUPos(new UPos());
    const sys = generateSystem({ id: `sys${seed}`, name, seed, upos: here });
    this.cosmos.activeRef = { id: sys.id, name, galaxyId: this.cosmos.current?.id ?? '', upos: here, local: this.cosmos.camG.clone(), build: () => sys };
    this.world.system = sys;
    sys.update(this.world.time);
    this.renderer.setSystem(sys);
    this.world.view.rebase('inertial', sys.root);
    return sys;
  }

  /** Jump to a catalogued or procedural system by reference id or name and activate it. */
  visitSystem(nameOrId: string): StarSystem | null {
    const ref = this.cosmos.knownSystems.find((k) => k.id === nameOrId || k.name.toLowerCase() === nameOrId.toLowerCase()) ?? this.cosmos.refById(nameOrId);
    if (!ref) return null;
    this.world.view.rebase('universe', null);
    this.world.view.upos.copy(ref.upos).addXYZ(0, 0, 1e12);
    this.cosmos.update(this.world, this.world.view.toUPos(new UPos()), this.renderer.starField, 0);
    this.cosmos.activate(this.world, ref);
    return this.world.system;
  }

  /** The star a body ultimately orbits (nearest star-like ancestor, else the brightest star). */
  hostStar(b: Body): Body {
    let p: Body | null = b.parent;
    while (p) {
      if (p.isStarLike) return p;
      p = p.parent;
    }
    return this.world.system!.stars[0];
  }

  findBody(ref: string | Body): Body | undefined {
    if (typeof ref !== 'string') return ref;
    return this.world.system?.bodies.find((b) => b.name === ref || b.id === ref || b.name.endsWith(ref));
  }

  /** Place the camera at distFactor × radius from a body, on its day side, looking at it. */
  placeNear(ref: string | Body, distFactor = 3, sideAngle = 0.6) {
    const b = this.findBody(ref);
    const sys = this.world.system;
    if (!b || !sys) return;
    sys.update(this.world.time);
    const view = this.world.view;
    view.rebase('inertial', b);
    const star = b.isStarLike ? null : this.hostStar(b);
    const toSun = star ? sys.relative(b, star, new THREE.Vector3()).normalize() : new THREE.Vector3(0, 0.3, 1).normalize();
    const side = new THREE.Vector3(0, 1, 0).cross(toSun).normalize();
    view.local.copy(toSun).multiplyScalar(Math.cos(sideAngle)).addScaledVector(side, Math.sin(sideAngle)).normalize().multiplyScalar(b.radius * distFactor);
    const look = view.local.clone().negate().normalize();
    view.setWorldOrientation(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), look));
    this.spectator.cancelTravel();
    this.renderer.pipeline.resetExposure();
  }

  /**
   * Debug/test helper: place the camera above the first planet so that the
   * star is at the given elevation, looking along headingDeg (0 = toward the
   * star's azimuth) and pitchDeg (0 = horizon).
   */
  placeBySun(elevDeg: number, altitude: number, headingDeg = 0, pitchDeg = 0, bodyRef: number | string = 0) {
    const sys = this.world.system!;
    sys.update(this.world.time);
    const planet = typeof bodyRef === 'number' ? sys.bodies.filter((b) => b.planet?.surface)[bodyRef] : this.findBody(bodyRef)!;
    const qb = sys.bodyRotation(planet);
    const sunDir = sys.relative(planet, this.hostStar(planet), new THREE.Vector3()).normalize().applyQuaternion(qb.clone().invert());
    const axis = new THREE.Vector3(0, 1, 0).cross(sunDir).normalize();
    const theta = THREE.MathUtils.degToRad(90 - elevDeg);
    const up = sunDir.clone().applyAxisAngle(axis, theta).normalize();
    const ground = this.world.surfaceRadius(planet, up);
    const view = this.world.view;
    view.rebase('rotating', planet);
    view.local.copy(up).multiplyScalar(ground + altitude);
    let toSunH = sunDir.clone().addScaledVector(up, -sunDir.dot(up));
    if (toSunH.lengthSq() < 1e-8) toSunH = new THREE.Vector3(1, 0, 0).addScaledVector(up, -up.x);
    toSunH.normalize();
    const fwd = toSunH.clone().applyAxisAngle(up, THREE.MathUtils.degToRad(-headingDeg));
    const right = fwd.clone().cross(up).normalize();
    fwd.applyAxisAngle(right, THREE.MathUtils.degToRad(pitchDeg));
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), fwd, up);
    view.orient.copy(new THREE.Quaternion().setFromRotationMatrix(m));
    this.spectator.velocity.set(0, 0, 0);
    this.renderer.pipeline.resetExposure();
  }

  /** Test helper: draw rarely for `ms` so workers get the CPU, then resume. */
  settle(ms: number): Promise<void> {
    this.drawEvery = 30;
    return new Promise((res) => setTimeout(() => { this.drawEvery = 1; res(); }, ms));
  }

  resize() {
    this.renderer.resize(window.innerWidth, window.innerHeight);
    this.overlay.resize(window.innerWidth, window.innerHeight);
    if (this.map?.isOpen) this.map.resize();
  }

  start() {
    const loop = () => {
      if (!this.running) return;
      this.tick();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------ settings
  applySettings(key?: keyof Settings | 'bindings' | 'preset') {
    const s = this.settings;
    const r = this.renderer;
    r.quality.lodK = s.terrainDetail;
    r.quality.atmSteps = s.atmosphereSteps;
    r.quality.cloudSteps = s.cloudSteps;
    r.quality.detail = s.surfaceDetail;
    r.quality.fov = s.fov;
    r.quality.scatter = s.scatterDensity;
    r.galaxies.steps = s.galaxySteps;
    r.starField.boost = s.starBrightness;
    const ps = r.pipeline.settings;
    ps.bloomStrength = s.bloom * (s.cinematic ? 2.2 : 1);
    ps.vignette = s.vignette + (s.cinematic ? 0.15 : 0);
    ps.fxaa = s.fxaa;
    ps.exposureComp = s.exposureComp;
    ps.autoExposure = s.autoExposure;
    ps.maxExposure = Math.pow(10, s.maxExposureLog);
    if (key === undefined || key === 'renderScale' || key === 'preset') {
      ps.renderScale = s.renderScale;
      this.resize();
    }
    const root = document.documentElement;
    root.style.setProperty('--ui-scale', String(s.uiScale));
    root.style.setProperty('--ui-opacity', String(s.uiOpacity));
    root.classList.toggle('high-contrast', s.highContrast);
    root.classList.toggle('colorblind', s.colorblind);
    this.input.bindings = s.bindings;
    this.input.invertY = s.invertY;
    this.input.sensitivity = s.mouseSensitivity;
    this.cosmos.lifeFrequency = s.lifeFrequency;
    this.player.shipClass = s.defaultShip;
    Object.assign(this.player.shipOptions, { realisticFuel: s.realisticFuel, damage: s.shipDamage, ftlLimits: s.ftlLimits });
    r.reduceMotion = s.reduceMotion || !s.motionEffects;
  }

  // ------------------------------------------------------------ selection
  select(t: Target | null) {
    if (this.scanner.active && this.scanner.target?.id !== t?.id) this.scanner.cancel();
    this.selected = t;
  }

  /** Vector from the current viewpoint to a target (m), valid even right after a teleport. */
  targetRel(t: Target, out = new THREE.Vector3()): THREE.Vector3 {
    const view = this.world.view;
    if (t.kind === 'body' && t.body!.system === this.world.system && view.body && view.kind !== 'universe') {
      // body-relative: precise at any distance from the universe origin
      const b = t.body!, sys = b.system;
      return sys.relative(view.body, b, out).sub(view.offsetWorld(_tv));
    }
    return t.position(new UPos()).sub(view.toUPos(new UPos()), out);
  }

  goTo(t: Target) {
    const pl = this.player;
    if (pl.mode === 'walk') { this.hud.toast('Board your ship (X) or switch to the free camera (N) to travel'); return; }
    if (pl.mode === 'ship' && pl.ship) {
      const ship = pl.ship;
      if (t.kind === 'body' && t.body!.system === this.world.system) {
        if (ship.landed) { this.hud.toast('Take off first'); return; }
        ship.autopilot.mode = 'approach';
        ship.autopilot.target = t.body!;
        ship.autopilot.standoff = standoff(t);
        this.hud.toast(`Autopilot: approaching ${t.name}`);
      } else this.hyperjump(t);
      return;
    }
    this.orbitCam = null;
    this.spectator.goTo({ position: t.position, standoff: standoff(t), body: t.kind === 'body' ? t.body : null, name: t.name }, this.settings.reduceMotion ? 1.5 : undefined);
    this.hud.toast(`Travelling to ${t.name}`);
  }

  private hyperjump(t: Target) {
    const ship = this.player.ship;
    if (!ship) return;
    if (t.kind === 'body') { this.hud.toast('Hyperspace jumps target stars and galaxies'); return; }
    const here = ship.frame.toUPos(new UPos());
    const tp = t.position(new UPos());
    const off = here.sub(tp, new THREE.Vector3());
    const d = off.length();
    if (d < standoff(t) * 2) { this.hud.toast(`Already at ${t.name}`); return; }
    const arrive = tp.clone().add(off.normalize(), t.kind === 'system' ? 2.5 * AU : standoff(t));
    if (ship.startJump(arrive, t.name, d / LY, () => {})) this.hud.toast(`Hyperspace jump → ${t.name} (speculative technology)`, 4);
    else if (ship.message) this.hud.toast(ship.message);
  }

  lookAt(t: Target) {
    const view = this.world.view;
    const from = view.worldOrientation(new THREE.Quaternion());
    this.lookAnim = {
      from,
      to: () => {
        const dir = this.targetRel(t, new THREE.Vector3()).normalize();
        const up = view.body ? view.offsetWorld(new THREE.Vector3()).normalize() : new THREE.Vector3(0, 1, 0).applyQuaternion(from);
        return lookRotation(dir, up);
      },
      t: 0,
    };
  }

  toggleOrbitCam() {
    if (this.orbitCam) { this.orbitCam = null; this.hud.toast('Orbit camera off'); return; }
    const t = this.selected;
    if (!t || this.player.mode !== 'spectator') { this.hud.toast('Select an object first'); return; }
    const rel = this.targetRel(t, new THREE.Vector3());
    const d = Math.max(rel.length(), t.radius * 1.3);
    const dir = rel.clone().negate().normalize();
    this.orbitCam = { target: t, yaw: Math.atan2(dir.x, dir.z), pitch: Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)), dist: d, auto: true };
    this.spectator.cancelTravel();
    this.hud.toast('Orbit camera: drag to rotate, wheel to zoom, WASD to exit');
  }

  private updateOrbitCam(dt: number) {
    const oc = this.orbitCam!;
    const i = this.input;
    if (i.held('forward') || i.held('back') || i.held('left') || i.held('right')) { this.orbitCam = null; return; }
    const look = i.look();
    if (look.yaw || look.pitch) oc.auto = false;
    oc.yaw += look.yaw * 1.5 + (oc.auto ? dt * (this.settings.reduceMotion ? 0.01 : 0.04) : 0);
    oc.pitch = THREE.MathUtils.clamp(oc.pitch - look.pitch * 1.5, -1.45, 1.45);
    if (i.wheel) oc.dist = Math.max(oc.target.radius * 1.02 + 2, oc.dist * Math.pow(1.15, i.wheel));
    const off = new THREE.Vector3(Math.sin(oc.yaw) * Math.cos(oc.pitch), Math.sin(oc.pitch), Math.cos(oc.yaw) * Math.cos(oc.pitch)).multiplyScalar(oc.dist);
    const view = this.world.view;
    const t = oc.target;
    if (t.kind === 'body' && t.body!.system === this.world.system) {
      view.rebase('inertial', t.body!);
      view.local.copy(off);
    } else {
      view.rebase('universe', null);
      t.position(view.upos).add(off);
    }
    view.setWorldOrientation(lookRotation(off.clone().negate(), new THREE.Vector3(0, 1, 0)));
    this.spectator.anchor();
  }

  // ------------------------------------------------------------ discovery
  private discoveryKind(b: Body): DiscoveryKind {
    if (b.isStarLike) return 'star';
    if (b.kind === 'planet') return 'planet';
    if (b.kind === 'moon') return 'moon';
    if (b.kind === 'dwarf-planet') return 'dwarf';
    return 'small';
  }

  private autoDiscover() {
    const sys = this.world.system;
    const ref = this.cosmos.activeRef;
    if (sys && ref) {
      for (const b of sys.bodies) {
        if (b.kind === 'barycenter' || this.discoveries.has(b.id)) continue;
        const rel = this.renderer.bodyRel.get(b.id);
        if (!rel) continue;
        const near = b.isStarLike ? Math.max(b.radius * 60, 0.5 * AU) : Math.max(b.radius * 25, 2e7);
        if (rel.length() > near) continue;
        const known = b.known && !b.planet?.classLabel.includes('hypothetical');
        const d = this.discoveries.discover({
          id: b.id, name: b.displayName, kind: this.discoveryKind(b),
          subtitle: b.star?.spectralType ?? b.planet?.classLabel ?? b.kind,
          systemId: ref.id, place: `${ref.name} · ${this.cosmos.current?.name ?? ''}`, simTime: this.world.time,
          life: known ? b.planet?.life.kind : undefined,
          location: captureLocation(this.world, this.cosmos),
        });
        if (d) {
          this.thumbQueue.push({ id: d.id });
          if (!b.known) this.hud.toast(`Discovered ${b.displayName} — ${d.subtitle}`, 3.5);
        }
      }
    }
    const g = this.cosmos.current;
    if (g) {
      for (const n of this.cosmos.nebulae) {
        if (this.discoveries.has(n.id) || n.center.distanceTo(this.cosmos.camG) > n.radius * 3) continue;
        const d = this.discoveries.discover({
          id: n.id, name: n.name, kind: 'nebula', subtitle: n.type.replace('-', ' '), systemId: null, place: g.name,
          simTime: this.world.time, location: captureLocation(this.world, this.cosmos),
        });
        if (d) { this.thumbQueue.push({ id: d.id }); if (!n.known) this.hud.toast(`Discovered ${n.name} — ${d.subtitle}`, 4); }
      }
    }
    if (g && g.id !== this.lastGalaxyId) {
      this.lastGalaxyId = g.id;
      const d = this.discoveries.discover({
        id: g.id, name: g.name, kind: 'galaxy', subtitle: `${g.hubble} galaxy`, systemId: null, place: g.name,
        simTime: this.world.time, location: captureLocation(this.world, this.cosmos),
      });
      if (d && !g.known) this.hud.toast(`Entered ${g.name} (${g.hubble})`, 4);
    }
  }

  private captureThumbs() {
    if (!this.thumbQueue.length) return;
    const c = document.createElement('canvas');
    c.width = 192;
    c.height = 108;
    const src = this.canvas;
    const sw = src.width, sh = src.height;
    const cw = Math.min(sw, (sh * 16) / 9), ch = (cw * 9) / 16;
    c.getContext('2d')!.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, 192, 108);
    const url = c.toDataURL('image/jpeg', 0.72);
    for (const q of this.thumbQueue) {
      if (q.bookmark) {
        const b = this.discoveries.bookmarks.find((x) => x.id === q.id);
        if (b) b.thumb = url;
      } else this.discoveries.setThumb(q.id, url);
    }
    this.thumbQueue.length = 0;
  }

  startScan() {
    const t = this.selected;
    if (!t) { this.hud.toast('Select something to scan'); return; }
    const d = this.targetRel(t).length();
    const range = scanRange(t);
    if (d > range) { this.hud.toast(`Out of scanner range — get within ${formatDistance(range)}`); return; }
    this.scanner.start(t);
  }

  private finishScan(t: Target) {
    let life: string | undefined;
    if (t.kind === 'body') life = t.body!.planet?.life.kind;
    if (!this.discoveries.has(t.id)) {
      const b = t.body;
      this.discoveries.discover({
        id: t.id, name: t.name, kind: b ? this.discoveryKind(b) : t.kind === 'galaxy' ? 'galaxy' : 'system',
        subtitle: b ? b.star?.spectralType ?? b.planet?.classLabel ?? b.kind : t.kind === 'galaxy' ? `${t.galaxy!.hubble} galaxy` : 'star system',
        systemId: b ? this.cosmos.activeRef?.id ?? null : t.system?.id ?? null, place: this.cosmos.current?.name ?? '',
        simTime: this.world.time, location: captureLocation(this.world, this.cosmos),
      });
      this.thumbQueue.push({ id: t.id });
    }
    this.discoveries.markScanned(t.id, { life });
    const lifeMsg = life && life !== 'none' ? ` — ${life} life detected!` : '';
    this.hud.toast(`Scan complete: ${t.name}${lifeMsg}`, 4);
  }

  bookmark(name?: string) {
    const loc = captureLocation(this.world, this.cosmos);
    const v = this.world.view;
    const place = v.body ? `${v.body.displayName} · ${this.cosmos.activeRef?.name ?? ''}` : this.cosmos.activeRef?.name ?? this.cosmos.current?.name ?? 'intergalactic space';
    const alt = v.body ? ` · ${formatDistance(Math.max(0, this.world.altitudeAbove(v, v.body)))}` : '';
    const bm = this.discoveries.addBookmark({ name: name ?? `${v.body?.displayName ?? place}${alt}`, place, location: loc });
    this.thumbQueue.push({ id: bm.id, bookmark: true });
    this.hud.toast(`Bookmarked: ${bm.name}`);
    return bm;
  }

  private visitLocation(loc: SavedLocation) {
    this.player.toSpectator();
    this.orbitCam = null;
    this.spectator.cancelTravel();
    if (!restoreLocation(this.world, this.cosmos, this.renderer.starField, loc)) { this.hud.toast('That location no longer exists in this universe'); return; }
    this.renderer.pipeline.resetExposure();
  }

  visitBookmark(b: Bookmark) {
    this.visitLocation(b.location);
    this.hud.toast(b.name);
  }

  visitDiscovery(d: Discovery) {
    if (d.kind === 'galaxy') {
      const g = this.cosmos.universe.galaxyById(d.id);
      if (g) { this.select(galaxyTarget(g)); this.goTo(this.selected!); return; }
    }
    if (d.location) {
      this.visitLocation(d.location);
      const b = this.world.system?.byId.get(d.id);
      if (b) this.select(bodyTarget(b));
      return;
    }
    const ref = d.systemId ? this.cosmos.refById(d.systemId) : null;
    if (ref) { this.select(systemTarget(ref)); this.goTo(this.selected!); }
  }

  // -------------------------------------------------------------- search
  private searchProvider(q: string): SearchResult[] {
    const out: SearchResult[] = [];
    const add = (label: string, sub: string, kind: string, t: () => Target | null, bonus = 0) => {
      const s = matchScore(label, q);
      if (!isFinite(s)) return;
      out.push({ label, sub, kind, score: s + bonus, run: (travel) => { const tt = t(); if (!tt) return; this.select(tt); if (travel) this.goTo(tt); else this.lookAt(tt); } });
    };
    const sys = this.world.system;
    if (sys) for (const b of sys.bodies) if (b.kind !== 'barycenter') add(b.displayName, b.star?.spectralType ?? b.planet?.classLabel ?? b.kind, b.isStarLike ? 'star' : b.kind, () => bodyTarget(b), -0.5);
    for (const k of this.cosmos.knownSystems) add(k.name, `catalogued · ${formatDistance(k.upos.distanceTo(this.renderer.camUPos))}`, 'system', () => systemTarget(k));
    const gals = new Map<string, (typeof this.cosmos.galaxies)[number]>();
    for (const g of [...this.cosmos.universe.known, ...this.cosmos.galaxies]) gals.set(g.id, g);
    for (const g of gals.values()) add(g.name, `${g.hubble} · ${formatDistance(g.upos.distanceTo(this.renderer.camUPos))}`, 'galaxy', () => galaxyTarget(g), g.known ? 0 : 0.3);
    const nebs = new Map<string, (typeof this.cosmos.nebulae)[number]>();
    for (const n of [...this.cosmos.knownNebulae, ...this.cosmos.nebulae]) nebs.set(n.id, n);
    for (const n of nebs.values()) {
      const g = this.cosmos.universe.galaxyById(n.galaxyId);
      if (g) add(n.name, `${n.type.replace('-', ' ')} · ${n.known ? 'catalogued' : 'procedural'}`, 'nebula', () => nebulaTarget(n, g), n.known ? 0 : 0.4);
    }
    for (const d of this.discoveries.entries.values()) {
      if (sys?.byId.has(d.id) || d.kind === 'galaxy' || d.kind === 'system' || d.kind === 'nebula') continue;
      add(d.name, `discovered · ${d.place}`, 'visited', () => { this.visitDiscovery(d); return this.selected; }, 0.4);
    }
    for (const b of this.discoveries.bookmarks) add(b.name, `bookmark · ${b.place}`, 'bookmark', () => { this.visitBookmark(b); return null; }, 0.2);
    // procedural designation, e.g. "ICS 3p12-m4-p7-15"
    const m = /^ics\s+(?:([a-z0-9]+)\s+)?(\d+)([pm])(\d+)-([pm])(\d+)-([pm])(\d+)-(\d+)$/i.exec(q.trim());
    if (m) {
      const g = m[1] ? [...gals.values()].find((x) => x.name.replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase() === m[1].toUpperCase()) : this.cosmos.universe.home;
      const sgn = (s: string, v: string) => (s.toLowerCase() === 'm' ? -1 : 1) * +v;
      if (g) {
        const id = `${g.id}/${m[2]}:${sgn(m[3], m[4])}:${sgn(m[5], m[6])}:${sgn(m[7], m[8])}:${m[9]}`;
        const ref = this.cosmos.refById(id);
        if (ref) out.push({ label: ref.name, sub: `procedural star · ${g.name}`, kind: 'star', score: -1, run: (travel) => { const t = systemTarget(ref); this.select(t); if (travel) this.goTo(t); else this.lookAt(t); } });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- tick
  get uiBlocking() {
    return Modal.anyOpen() || this.search.isOpen || this.map.isOpen || this.startScreen.isOpen;
  }

  tick(dtOverride?: number) {
    const now = performance.now();
    const dt = dtOverride ?? Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;
    this.input.pollGamepad();
    this.handleGlobalKeys();
    if (this.pendingStart && this.pendingStart()) this.pendingStart = null;
    this.world.advance(dt);
    this.cosmos.update(this.world, this.world.view.toUPos(new UPos()), this.renderer.starField, this.frameNo);
    const blocking = this.uiBlocking;
    if (blocking) this.input.suspended = true;
    if (this.orbitCam && this.player.mode === 'spectator') this.updateOrbitCam(dt);
    else this.player.update(dt);
    this.input.suspended = false;
    if (this.lookAnim) this.updateLookAnim(dt);
    this.renderer.ship = this.player.ship;
    if (this.player.ship && this.renderer.shipRenderer) this.player.cockpitOffset.copy(this.renderer.shipRenderer.model.cockpit);
    if (this.player.message) this.hud.toast(this.player.message, 2.5);
    this.frameNo++;
    const draw = this.frameNo % this.drawEvery === 0;
    this.renderer.render(this.world, dt, draw);
    if (draw) this.captureThumbs();
    if (!blocking && this.input.clicked) this.clickSelect();
    if (this.frameNo % 20 === 0) this.autoDiscover();
    this.updateScan(dt);
    if (this.frameNo % 15 === 0) {
      // keep labels clear of panels (re-measured occasionally: layout reads are not free)
      this.overlay.avoid.length = 0;
      if (this.selected && this.info.visible) this.overlay.avoid.push(this.info.root.getBoundingClientRect());
      for (const el of this.hud.root.querySelectorAll('.hud-top > *, .hud-bottom')) this.overlay.avoid.push(el.getBoundingClientRect());
    }
    this.overlay.draw({
      world: this.world, cosmos: this.cosmos, renderer: this.renderer, player: this.player, selected: this.selected,
      showLabels: this.settings.showLabels, showOrbits: this.settings.showOrbits,
    });
    this.updateInfo();
    if (this.map.isOpen) this.map.update(this.mapSources());
    this.updateHud();
    this.updateHint();
    this.autosaveTimer += dt;
    if (this.autosaveTimer > 30) { this.autosaveTimer = 0; this.autosave(); }
    this.input.endFrame();
  }

  private updateLookAnim(dt: number) {
    const a = this.lookAnim!;
    if (this.player.mode !== 'spectator' || this.spectator.travel) { this.lookAnim = null; return; }
    a.t += dt / (this.settings.reduceMotion ? 0.25 : 0.9);
    const s = Math.min(1, a.t);
    const e = s * s * (3 - 2 * s);
    this.world.view.setWorldOrientation(a.from.clone().slerp(a.to(), e));
    if (s >= 1) this.lookAnim = null;
  }

  private clickSelect() {
    const locked = this.input.pointerLocked;
    const w = window.innerWidth, h = window.innerHeight;
    const x = locked ? w / 2 : this.input.mouseX, y = locked ? h / 2 : this.input.mouseY;
    const t = pick(this.world, this.cosmos, this.renderer, x, y, w, h);
    if (t) this.select(t);
    else if (!locked) this.select(null);
  }

  private updateScan(dt: number) {
    const t = this.scanner.target;
    if (!t) return;
    const r = this.scanner.update(dt, this.targetRel(t).length());
    if (r === 'done') this.finishScan(t);
    else if (r === 'range') this.hud.toast('Scan interrupted: out of range');
  }

  private updateInfo() {
    const t = this.selected;
    if (!t) { this.info.hide(); return; }
    const rel = this.targetRel(t);
    const dist = rel.length();
    const desc = describe(t, dist, this.discoveries.isScanned(t.id));
    const range = scanRange(t);
    const pl = this.player;
    const extra: { label: string; title: string; run: () => void }[] = [];
    if (t.kind === 'body') extra.push({ label: 'Orbit', title: 'Orbit camera (F6)', run: () => this.toggleOrbitCam() });
    if (pl.mode === 'ship' && t.kind !== 'body') extra.push({ label: 'Jump', title: 'Hyperspace jump (speculative) (Y)', run: () => this.hyperjump(t) });
    this.info.show(desc, {
      goTo: () => this.goTo(t),
      lookAt: () => this.lookAt(t),
      scan: () => this.startScan(),
      bookmark: () => this.bookmark(),
      close: () => this.select(null),
      extra,
    }, {
      inRange: dist <= range,
      range: formatDistance(range),
      progress: this.scanner.target?.id === t.id ? this.scanner.progress : null,
    });
  }

  private updateHint() {
    const pl = this.player;
    let hint = '';
    if (pl.mode === 'ship' && pl.ship?.landed) hint = 'X: exit ship · R/Space: lift off · H: hover assist';
    else if (pl.mode === 'walk') hint = 'X: board ship (when next to it) · Space: jump · Shift: run · N: free camera';
    else if (pl.mode === 'spectator' && this.selected && !this.spectator.travel && !this.orbitCam) hint = 'G: go to · H: look at · F6: orbit · F7: scan · N: spaceship';
    if (this.orbitCam) hint = 'Orbit camera — drag: rotate · wheel: zoom · WASD: free flight';
    this.hintEl.style.display = hint && !this.uiBlocking ? '' : 'none';
    if (this.hintEl.textContent !== hint) this.hintEl.textContent = hint;
  }

  private mapSources() {
    return {
      cosmos: this.cosmos, field: this.renderer.starField, system: this.world.system, camUPos: this.renderer.camUPos, time: this.world.time,
      selectedId: this.selected?.id ?? null,
      select: (t: Target, travel: boolean) => { this.select(t); if (travel) this.goTo(t); },
    };
  }

  screenshot() {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `infinite-cosmos-${ts}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
    this.hud.toast('Screenshot saved');
  }

  private handleGlobalKeys() {
    const i = this.input, w = this.world;
    if (this.settingsMenu.capturingKey) return;
    if (i.pressed('menu')) {
      if (this.map.isOpen) this.map.close();
      else if (!Modal.closeTop()) {
        if (this.startScreen.isOpen) return;
        if (this.orbitCam) this.orbitCam = null;
        else if (this.scanner.active) this.scanner.cancel();
        else this.settingsMenu.modal.open();
      }
      if (i.pointerLocked) i.exitPointerLock();
      return;
    }
    if (i.pressed('help')) this.help.modal.toggle();
    if (this.startScreen.isOpen) return;
    if (i.pressed('search')) this.search.toggle();
    if (i.pressed('catalog')) this.catalog.toggle();
    if (i.pressed('map')) {
      if (this.map.isOpen) this.map.close();
      else { Modal.closeTop(); this.map.open(this.mapSources()); if (i.pointerLocked) i.exitPointerLock(); }
    }
    if (this.uiBlocking) return;
    if (i.pressed('timeFaster')) { w.timeScale = Math.min(1e7, w.timeScale * 10); w.paused = false; this.hud.toast(`Time ×${w.timeScale}`); }
    if (i.pressed('timeSlower')) { w.timeScale = Math.max(1, w.timeScale / 10); this.hud.toast(`Time ×${w.timeScale}`); }
    if (i.pressed('timeReal')) { w.timeScale = 1; w.paused = false; this.hud.toast('Real-time'); }
    if (i.pressed('timePause')) { w.paused = !w.paused; this.hud.toast(w.paused ? 'Paused' : 'Resumed'); }
    if (i.pressed('hideUI')) this.ui.classList.toggle('hidden');
    if (i.pressed('mouseLook')) { if (i.pointerLocked) i.exitPointerLock(); else i.requestPointerLock(); }
    if (i.pressed('screenshot')) this.screenshot();
    if (i.pressed('bookmark')) this.bookmark();
    if (i.pressed('orbits')) { this.settings.showOrbits = !this.settings.showOrbits; saveSettings(this.settings); this.hud.toast(`Orbits ${this.settings.showOrbits ? 'on' : 'off'}`); }
    if (i.pressed('labels')) { this.settings.showLabels = !this.settings.showLabels; saveSettings(this.settings); this.hud.toast(`Labels ${this.settings.showLabels ? 'on' : 'off'}`); }
    if (i.pressed('info')) { this.info.visible = !this.info.visible; }
    if (i.pressed('scan')) this.startScan();
    const t = this.selected;
    const mode = this.player.mode;
    if (i.pressed('orbitCam')) this.toggleOrbitCam();
    if (t && i.pressed('gotoTarget')) this.goTo(t);
    if (t && mode === 'spectator' && i.pressed('frameTarget')) this.lookAt(t);
    if (mode === 'ship' && i.pressed('autopilot')) {
      const ship = this.player.ship!;
      if (ship.autopilot.mode === 'approach') { ship.autopilot.mode = 'none'; this.hud.toast('Autopilot off'); }
      else if (t) this.goTo(t);
      else this.hud.toast('Select a destination first');
    }
    if (mode === 'ship' && i.pressed('hyperjump')) {
      if (t) this.hyperjump(t);
      else this.hud.toast('Select a star or galaxy to jump to');
    }
  }

  private updateHud() {
    const pl = this.player;
    const date = new Date(Date.UTC(2000, 0, 1, 12) + this.world.time * 1000).toISOString().slice(0, 16).replace('T', ' ');
    const timeScale = this.world.paused ? 0 : this.world.timeScale;
    const sel = this.selected;
    const selDist = sel ? Math.max(0, this.targetRel(sel).length() - (sel.kind === 'body' ? sel.radius : 0)) : NaN;
    if (pl.mode === 'ship' && pl.ship) {
      const sh = pl.ship;
      const b = sh.frame.body;
      const o = sh.orbit;
      const orbitTxt = o && o.e < 1 && b ? `Ap ${formatDistance(o.a * (1 + o.e) - b.radius)} · Pe ${formatDistance(o.a * (1 - o.e) - b.radius)}` : '';
      this.hud.update({
        mode: `${sh.spec.name}${sh.warp.active ? ' · WARP (speculative)' : ''}${sh.jump.phase !== 'idle' ? ' · HYPERSPACE (speculative)' : ''}`,
        frame: b ? `${sh.landed ? 'landed' : 'flying'} · ${b.displayName}` : 'interstellar',
        speed: sh.warp.active ? sh.warp.speed : sh.velocity.length(),
        altitude: sh.altitude,
        gravity: b ? b.mu / Math.max(sh.frame.offsetWorld(new THREE.Vector3()).lengthSq(), 1) : 0,
        target: sel ? sel.name : `thr ${(sh.throttle * 100).toFixed(0)}%`,
        targetDist: selDist,
        timeScale, date, fps: this.fps,
        extra: `thr ${(sh.throttle * 100).toFixed(0)}% · V/S ${formatSpeed(sh.verticalSpeed)} · ${sh.opts.flightAssist ? 'FA' : 'fa-off'}${sh.hoverAssist ? ' HOVER' : ''}${sh.gearDown ? ' GEAR' : ''}${sh.autopilot.mode !== 'none' ? ' AP:' + sh.autopilot.mode : ''} · ${sh.gForce.toFixed(1)} g${sh.heatGlow > 0.05 ? ' · heat ' + (sh.atmo.heating / 1e6).toFixed(1) + ' MW/m²' : ''}${orbitTxt ? ' · ' + orbitTxt : ''}${sh.opts.realisticFuel ? ` · fuel ${(sh.fuel / sh.spec.fuelMass * 100).toFixed(0)}%` : ''}`,
      });
      return;
    }
    if (pl.mode === 'walk') {
      const wk = pl.walker;
      const b = wk.body!;
      const P = b.planet?.atmosphere?.pressure ?? 0;
      this.hud.update({
        mode: wk.swimming ? `Swimming (${wk.liquid})` : 'On foot',
        frame: b.displayName,
        speed: wk.vel.length(),
        altitude: NaN,
        gravity: wk.gravity,
        target: sel ? sel.name : `jump ≈ ${((3.2 * 3.2) / (2 * Math.max(wk.gravity, 0.01))).toFixed(1)} m`,
        targetDist: selDist,
        timeScale, date, fps: this.fps,
        extra: `${P > 0 ? P.toPrecision(3) + ' bar' : 'vacuum'} · ~${(b.planet?.tempMean ?? 0).toFixed(0)} K · slope ${(wk.slope * 57.3).toFixed(0)}° · jump ≈ ${((3.2 * 3.2) / (2 * Math.max(wk.gravity, 0.01))).toFixed(1)} m`,
      });
      return;
    }
    const s = this.spectator;
    const b = s.nearestBody;
    let g = 0;
    if (b) {
      const d = this.world.distanceToBody(this.world.view.toUPos(new UPos()), b);
      g = (G * b.mass) / (d * d);
    }
    const ts = this.renderer.terrainStats;
    this.hud.update({
      mode: this.orbitCam ? 'Orbit camera' : s.travel ? `Travelling → ${s.travel.target.name}` : 'Free camera',
      frame: this.world.view.body ? `${this.world.view.kind} · ${this.world.view.body.displayName}` : this.cosmos.activeRef?.name ?? this.cosmos.current?.name ?? 'intergalactic space',
      speed: s.lastSpeed,
      altitude: s.altitude,
      gravity: g,
      target: sel ? sel.name : b?.displayName ?? '',
      targetDist: sel ? selDist : s.altitude,
      timeScale, date, fps: this.fps,
      extra: `terrain ${ts.drawn}/${ts.nodes} L${ts.maxLevel} · ${this.cosmos.current?.name ?? 'intergalactic'}`,
    });
  }
}

/** How interesting a body is as a first destination. */
function interestScore(b: Body): number {
  const p = b.planet;
  if (!p) return b.isStarLike ? 1 : 0;
  let s = { complex: 100, simple: 70, microbial: 45, prebiotic: 12, none: 0 }[p.life.kind] ?? 0;
  if (p.surface && p.atmosphere && p.atmosphere.pressure > 0.05) s += 20;
  if (p.liquid !== 'none' && p.liquidCoverage > 0.05) s += 15;
  if (p.rings) s += 14;
  if (p.type === 'gas-giant' || p.type === 'ice-giant') s += 8;
  if (p.surface) s += 5;
  if (b.kind === 'moon') s -= 3;
  return s;
}
