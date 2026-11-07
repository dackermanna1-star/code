import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EventBus } from './events.js';
import { Settings, QUALITY_PRESETS, detectQuality } from './settings.js';
import { Input } from './input.js';
import { Interactions } from './interaction.js';
import { Colliders } from './colliders.js';
import { Assets } from './assets.js';
import { Pipeline } from './pipeline.js';
import { parseDebugParams } from './debug.js';
import { createFlightState } from '../flight/state.js';
import { AIRPORTS } from '../world/layout.js';

// =============================================================================
// The App object is the shared service locator passed to every module's
// init(app). See docs/ARCHITECTURE.md for the full contract.
// =============================================================================
export class App {
  constructor(container) {
    this.container = container;
    this.debug = parseDebugParams();
    this.events = new EventBus();
    const overrides = {};
    if (this.debug.quality) overrides.quality = this.debug.quality;
    this.settings = new Settings(overrides);
    this.time = 0;            // seconds since start (real time, keeps running while paused)
    this.frame = 0;
    this.dt = 0;
    this.paused = false;      // simulation pause (menus). Rendering continues.
    this.started = false;     // the player has pressed "Board"
    this.ready = false;
    this.timeScale = this.debug.timescale || 1;   // debug: simulation speed multiplier
    this._updates = [];
    this._errors = new Map();

    // --- renderer -----------------------------------------------------------
    this._wantReversedDepth = this.debug.reversedDepth !== false;
    this.renderer = new THREE.WebGLRenderer({
      antialias: false, powerPreference: 'high-performance', stencil: false,
      reversedDepthBuffer: this._wantReversedDepth, preserveDrawingBuffer: !!this.debug.shot,
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the pipeline encodes sRGB itself
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.id = 'gl';
    container.appendChild(this.renderer.domElement);

    this._resolveQuality();

    // --- scenes & roots -------------------------------------------------------
    this.scenes = { outside: new THREE.Scene(), cabin: new THREE.Scene() };
    this.scenes.outside.name = 'outside';
    this.scenes.cabin.name = 'cabin';
    /** World-space content (airports, terrain, clouds, traffic). Its matrix is the inverse aircraft pose. */
    this.worldRoot = new THREE.Group();
    this.worldRoot.name = 'worldRoot';
    this.worldRoot.matrixAutoUpdate = false;
    /** Sky dome / celestial objects: rotation = inverse attitude, position follows the camera. */
    this.skyRoot = new THREE.Group();
    this.skyRoot.name = 'skyRoot';
    /** Exterior parts of OUR aircraft (wings, engines, gear, fuselage skin) in aircraft-local space. */
    this.aircraftRoot = new THREE.Group();
    this.aircraftRoot.name = 'aircraftRoot';
    /** Cabin interior in aircraft-local space. */
    this.cabinRoot = new THREE.Group();
    this.cabinRoot.name = 'cabinRoot';
    this.scenes.outside.add(this.skyRoot, this.worldRoot, this.aircraftRoot);
    this.scenes.cabin.add(this.cabinRoot);

    // --- cameras --------------------------------------------------------------
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(this.settings.get('fov'), aspect, 0.03, 60);
    this.camera.name = 'mainCamera';
    this.camera.position.set(0, 1.66, -6);
    this.outsideCamera = new THREE.PerspectiveCamera(this.settings.get('fov'), aspect, 0.25, 450000);
    this.view = { mode: 'first-person' };   // 'first-person' | 'cinematic'

    // --- lights (directions driven from app.sun every frame) --------------------
    this.sun = {
      direction: new THREE.Vector3(0.4, 0.6, 0.3).normalize(),   // WORLD frame, pointing towards the sun
      color: new THREE.Color(1, 0.96, 0.9),
      intensity: 6.0,
      skyColor: new THREE.Color(0.55, 0.7, 1.0),     // hemisphere sky colour
      groundColor: new THREE.Color(0.35, 0.33, 0.3),
      ambientIntensity: 1.2,
      cabinFill: 0.25,                              // scale of sky fill light inside the cabin
    };
    this.lights = {};
    const sunOut = new THREE.DirectionalLight(0xffffff, 6);
    sunOut.name = 'sunOutside';
    sunOut.castShadow = true;
    sunOut.shadow.bias = -0.0004;
    sunOut.shadow.normalBias = 0.03;
    sunOut.shadow.camera.near = 0.5; sunOut.shadow.camera.far = 400;
    this.scenes.outside.add(sunOut, sunOut.target);
    const hemiOut = new THREE.HemisphereLight(0x99bbff, 0x554433, 1.2);
    hemiOut.name = 'hemiOutside';
    this.scenes.outside.add(hemiOut);
    const sunCabin = new THREE.DirectionalLight(0xffffff, 6);
    sunCabin.name = 'sunCabin';
    sunCabin.castShadow = true;
    sunCabin.shadow.bias = -0.0002;
    sunCabin.shadow.normalBias = 0.012;
    sunCabin.shadow.radius = 2;
    this.scenes.cabin.add(sunCabin, sunCabin.target);
    const hemiCabin = new THREE.HemisphereLight(0x99bbff, 0x554433, 0.25);
    hemiCabin.name = 'hemiCabin';
    this.scenes.cabin.add(hemiCabin);
    this.lights = { sunOutside: sunOut, hemiOutside: hemiOut, sunCabin, hemiCabin };
    this._applyShadowSizes();
    /** Aircraft-local AABB used to fit the cabin sun shadow. The cabin module may refine it. */
    this.cabinBounds = new THREE.Box3(new THREE.Vector3(-1.95, -0.2, -16.6), new THREE.Vector3(1.95, 2.6, 14.4));
    /** Radius (m) of the outside shadow box centred on the aircraft. */
    this.outsideShadowRadius = 42;

    // --- services -------------------------------------------------------------
    this.input = new Input(this, this.renderer.domElement);
    this.interactions = new Interactions(this);
    this.colliders = new Colliders();
    this.assets = new Assets(this);
    this.assets.maxAnisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), this.quality.anisotropy);
    this.pipeline = new Pipeline(this);

    // cabin environment (reflections on plastics / metal); modules may replace it
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.pmrem = pmrem;
    this.scenes.cabin.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scenes.cabin.environmentIntensity = 0.35;

    // --- flight state placeholder (the director replaces app.flight) -------------
    this.flight = { state: createFlightState(), skipTo() {}, restart() {}, beginDeparture() {}, beginDescent() {} };

    // --- world anchors ----------------------------------------------------------
    const app = this;
    this.aircraftMatrix = new THREE.Matrix4();
    this.aircraftMatrixInverse = new THREE.Matrix4();
    this.world = {
      root: this.worldRoot,
      departureOrigin: new THREE.Vector3(...AIRPORTS.departure.origin),
      arrivalOrigin: new THREE.Vector3(...AIRPORTS.arrival.origin),
      /** Move the arrival region (airport, city, coast). Emits 'world:arrivalMoved'. */
      setArrivalOrigin(v) {
        this.arrivalOrigin.copy(v);
        app.events.emit('world:arrivalMoved', { origin: this.arrivalOrigin.clone() });
      },
      /** World point -> aircraft-local (cabin/camera) space. */
      toLocal(worldPos, target = new THREE.Vector3()) { return target.copy(worldPos).applyMatrix4(app.aircraftMatrixInverse); },
      /** Aircraft-local point -> world. */
      toWorld(localPos, target = new THREE.Vector3()) { return target.copy(localPos).applyMatrix4(app.aircraftMatrix); },
      /** Height of the terrain at world (x, z); the environment module replaces this. */
      groundHeight(/* x, z */) { return 0; },
    };

    // core per-frame jobs
    this.addUpdate((dt) => this._syncWorld(dt), 20, 'core:syncWorld');
    this.addUpdate((dt) => this._updateLights(dt), 25, 'core:lights');

    window.addEventListener('resize', () => this.resize());
    this.settings.onChange((key, value) => {
      if (key === 'quality' || key === 'resolutionScale') { this._resolveQuality(); this._applyShadowSizes(); this.resize(); this.events.emit('quality:changed', this.quality); }
      if (key === 'fov') { this.camera.fov = value; this.camera.updateProjectionMatrix(); }
      this.events.emit('settings:changed', { key, value });
    });
    window.__app = this;
  }

  _resolveQuality() {
    let q = this.settings.get('quality');
    if (!QUALITY_PRESETS[q]) q = detectQuality(this.renderer);
    this.qualityName = q;
    this.quality = { ...QUALITY_PRESETS[q] };
  }

  _applyShadowSizes() {
    if (!this.lights?.sunCabin) return;
    for (const [light, size] of [[this.lights.sunCabin, this.quality.shadowMapSize], [this.lights.sunOutside, this.quality.outsideShadowMapSize]]) {
      if (light.shadow.mapSize.x !== size) {
        light.shadow.mapSize.set(size, size);
        if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
      }
    }
  }

  /** Register a per-frame callback. Lower priority runs first. Returns an unsubscribe fn. */
  addUpdate(fn, priority = 50, name = 'update') {
    const u = { fn, priority, name };
    this._updates.push(u);
    this._updates.sort((a, b) => a.priority - b.priority);
    return () => { this._updates = this._updates.filter((x) => x !== u); };
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.outsideCamera.aspect = this.camera.aspect;
    this.outsideCamera.updateProjectionMatrix();
    this.pipeline.setSize(w, h);
  }

  _syncWorld() {
    const st = this.flight.state;
    this.aircraftMatrix.compose(st.position, st.quaternion, _one);
    this.aircraftMatrixInverse.copy(this.aircraftMatrix).invert();
    this.worldRoot.matrix.copy(this.aircraftMatrixInverse);
    this.worldRoot.matrixWorldNeedsUpdate = true;
    _q.copy(st.quaternion).invert();
    this.skyRoot.quaternion.copy(_q);
    this.skyRoot.position.copy(this.camera.position);
  }

  /** Sun direction in aircraft-local space (unit vector towards the sun). */
  sunDirectionLocal(target = new THREE.Vector3()) {
    _q.copy(this.flight.state.quaternion).invert();
    return target.copy(this.sun.direction).applyQuaternion(_q).normalize();
  }

  _updateLights() {
    const s = this.sun, L = this.lights;
    const d = this.sunDirectionLocal(_v);
    const below = Math.max(0, Math.min(1, (s.direction.y + 0.02) / 0.06)); // fade near/below horizon
    // outside sun: shadow box around the aircraft
    const R = this.outsideShadowRadius;
    L.sunOutside.position.copy(d).multiplyScalar(R * 3);
    L.sunOutside.target.position.set(0, -1, 0);
    L.sunOutside.target.updateMatrixWorld();
    const sc = L.sunOutside.shadow.camera;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = R * 6;
    sc.updateProjectionMatrix();
    L.sunOutside.color.copy(s.color);
    L.sunOutside.intensity = s.intensity * below;
    L.sunOutside.castShadow = this.quality.shadows && below > 0;
    L.hemiOutside.color.copy(s.skyColor);
    L.hemiOutside.groundColor.copy(s.groundColor);
    L.hemiOutside.intensity = s.ambientIntensity;

    // cabin sun: fit the shadow camera to the cabin AABB in light space
    const b = this.cabinBounds;
    const center = b.getCenter(_c);
    L.sunCabin.position.copy(center).addScaledVector(d, 40);
    L.sunCabin.target.position.copy(center);
    L.sunCabin.target.updateMatrixWorld();
    L.sunCabin.updateMatrixWorld();
    _m.lookAt(L.sunCabin.position, center, _up.set(0, 1, 0));
    _m.setPosition(L.sunCabin.position);
    _mi.copy(_m).invert();
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < 8; i++) {
      _v2.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(_mi);
      minX = Math.min(minX, _v2.x); maxX = Math.max(maxX, _v2.x); minY = Math.min(minY, _v2.y); maxY = Math.max(maxY, _v2.y); minZ = Math.min(minZ, _v2.z); maxZ = Math.max(maxZ, _v2.z);
    }
    const cc = L.sunCabin.shadow.camera;
    cc.left = minX - 0.1; cc.right = maxX + 0.1; cc.bottom = minY - 0.1; cc.top = maxY + 0.1;
    cc.near = Math.max(0.1, -maxZ - 1); cc.far = -minZ + 1;
    cc.updateProjectionMatrix();
    L.sunCabin.color.copy(s.color);
    L.sunCabin.intensity = s.intensity * below;
    L.sunCabin.castShadow = this.quality.shadows && below > 0;
    L.hemiCabin.color.copy(s.skyColor);
    L.hemiCabin.groundColor.copy(s.groundColor);
    L.hemiCabin.intensity = s.ambientIntensity * s.cabinFill;
  }

  /** Main loop body. */
  tick(now) {
    const t = now / 1000;
    const dt = this._last === undefined ? 1 / 60 : Math.min(0.1, Math.max(0, t - this._last));
    this._last = t;
    this.dt = dt;
    this.time += dt;
    this.frame++;
    for (const u of this._updates) {
      try { u.fn(dt, this.time); } catch (e) {
        const n = (this._errors.get(u.name) || 0) + 1;
        this._errors.set(u.name, n);
        if (n <= 3 || n % 300 === 0) console.error(`[update:${u.name}] (#${n})`, e);
      }
    }
    try { this.pipeline.render(dt); } catch (e) {
      const n = (this._errors.get('render') || 0) + 1;
      this._errors.set('render', n);
      if (n <= 3 || n % 300 === 0) console.error('[render]', e);
    }
  }

  start() {
    const loop = (now) => { this.tick(now); this._raf = requestAnimationFrame(loop); };
    this._raf = requestAnimationFrame(loop);
  }
}

const _one = new THREE.Vector3(1, 1, 1);
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _c = new THREE.Vector3();
const _up = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _mi = new THREE.Matrix4();
