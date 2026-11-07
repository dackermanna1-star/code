// =============================================================================
// AIRPORT MODULE — both airports of layout.js (Cedar Bay CBY / Port Solano PSX):
// pavement with painted markings, airfield lighting (approach lights, PAPI,
// rabbit, stop bars …), signs, terminals with lit interiors, jet bridges,
// tower / hangars / support buildings, landside roads & car parks, ground
// operations around our aircraft and AI traffic.
//
// API: { airports: { departure: {group, def}, arrival: {group, def} },
//        setBridge(airportId, connected, instant?), bridges, nightFactor }
// Each airport group lives in app.worldRoot at def.origin (airport-local frame
// = layout frame); the arrival group follows 'world:arrivalMoved'.
// Listens: flight:bridge, flight:phase, flight:pushback, flight:holdShort,
//          flight:restart / flight:skip, world:arrivalMoved.
// =============================================================================
import * as THREE from 'three';
import { DEPARTURE, ARRIVAL, gateById } from '../layout.js';
import { createShared, MAX_FLOODS, padMaterial } from './materials.js';
import { LightList, buildLightMesh, CAT, NCAT } from './lights.js';
import { buildPavement, buildApproachLights } from './pavement.js';
import { buildBuildings, fenceMesh, sitePlan } from './buildings.js';
import { buildSigns } from './signs.js';
import { addRotunda, addBridgeStatic, bridgePose, ActiveBridge } from './jetbridge.js';
import { Windsocks, Radar, FloodRig } from './animated.js';
import { createVehicleKit, LIVERY } from './vehicles.js';
import { Crowd } from './people.js';
import { DepartureOps, ArrivalOps, buildStaticGSE, ServiceTraffic, DynLights } from './groundops.js';
import { Traffic } from './traffic.js';
import { buildLandside } from './landside.js';
import { GeoBuilder, PRIM, mat, smoothstep, clamp01, mulberry } from './util.js';

const VIS_RANGE = 90000;        // m: hide an airport beyond this distance from the aircraft
const DETAIL_RANGE = 9000;      // m: small props hidden beyond this
const FLOOD_I = 1700;           // candela-ish of one apron mast (analytic pools + spot lights)

// day / night intensities per light category (HDR scene units)
const CAT_DAY = [];
const CAT_NIGHT = [];
CAT_DAY[CAT.RUNWAY] = 5; CAT_NIGHT[CAT.RUNWAY] = 42;
CAT_DAY[CAT.TAXI] = 2.5; CAT_NIGHT[CAT.TAXI] = 20;
CAT_DAY[CAT.APPROACH] = 8; CAT_NIGHT[CAT.APPROACH] = 50;
CAT_DAY[CAT.STOPBAR] = 7; CAT_NIGHT[CAT.STOPBAR] = 34;
CAT_DAY[CAT.FLOOD] = 0; CAT_NIGHT[CAT.FLOOD] = 70;
CAT_DAY[CAT.OBSTRUCTION] = 3; CAT_NIGHT[CAT.OBSTRUCTION] = 26;
CAT_DAY[CAT.PAPI] = 22; CAT_NIGHT[CAT.PAPI] = 55;
CAT_DAY[CAT.BEACON] = 0; CAT_NIGHT[CAT.BEACON] = 90;
CAT_DAY[CAT.STOPBAR_OWN] = 7; CAT_NIGHT[CAT.STOPBAR_OWN] = 34;
CAT_DAY[CAT.RABBIT] = 14; CAT_NIGHT[CAT.RABBIT] = 110;

const VARIANTS = ['737-800', '737-800', '737-900', '737-700'];
const CLEARED = new Set(['lineup', 'takeoff', 'climb', 'cruise', 'descent', 'approach', 'landing', 'taxi_in', 'arrived']);

class Airport {
  constructor(app, def, G) {
    this.app = app;
    this.def = def;
    this.id = def.id;
    this.group = new THREE.Group();
    this.group.name = `airport-${def.code}`;
    this.group.position.set(...def.origin);
    this.detail = new THREE.Group();        // small things hidden when far away
    this.detail.name = 'detail';
    this.group.add(this.detail);
    this.floods = [];
    for (let i = 0; i < MAX_FLOODS; i++) this.floods.push(new THREE.Vector4(0, -1000, 0, 0));
    this.camAP = { value: new THREE.Vector3() };
    this.ctx = { shared: { ...G.shared, uFlood: { value: this.floods } }, asphalt: G.asphalt, concrete: G.concrete, camAP: this.camAP };
    this.lights = new LightList();
    this.updaters = [];
    this.ownGate = gateById(def, def.ownGate);
    // parked aircraft plan (variant per occupied gate) – shared with the traffic module
    const rnd = mulberry(def.seed + 5);
    this.parked = def.occupiedGates.map((id) => ({ gate: gateById(def, id), variant: VARIANTS[Math.floor(rnd() * VARIANTS.length)] }));
    this.build();
  }

  build() {
    const { def, app } = this;
    const detailLevel = app.quality?.detail ?? 1;
    const pv = buildPavement(def, this.ctx, this.lights);
    this.pavement = pv;
    this.group.add(pv.group);
    // concrete pads (hangar aprons, fire station, cargo) connected to taxiway A
    this.group.add(padMesh(sitePlan(def).pads, this.ctx));
    // approach lights: full ALSF-II at the arrival, a shorter system at the departure
    const poles = buildApproachLights(this.lights, { full: def.id === 'arrival' });
    this.group.add(approachStructures(poles));
    // buildings
    const bl = buildBuildings(def, this.ctx, this.lights, { detail: detailLevel });
    this.buildings = bl;
    this.group.add(bl.group);
    if (detailLevel >= 1) this.detail.add(fenceMesh());
    try { this.group.add(buildLandside(def, this.ctx, bl, detailLevel)); } catch (e) { console.error('[airport] landside', e); }
    this.masts = bl.floods;
    this.masts.forEach((m, i) => this.floods[i].set(m.x, m.h - 0.5, m.z, FLOOD_I));
    this.floodRig = new FloodRig(this);
    this.group.add(this.floodRig.group);
    // signs
    const sg = buildSigns(def);
    this.signs = sg;
    this.group.add(sg.group);
    // jet bridges: rotundas + static bridges merged, own gate articulated
    this.buildBridges(bl.materials);
    // ground operations, crew, static GSE, service traffic
    this.buildOps();
    // AI traffic (aircraft are created once the exterior factory is available)
    this.traffic = new Traffic(app, this);
    this.group.add(this.traffic.group);
    // animated props
    this.windsocks = new Windsocks(bl.windsocks);
    this.detail.add(this.windsocks.group);
    this.radars = bl.dynamic.filter((d) => d.kind === 'radar').map((d) => new Radar(d, bl.materials.paint));
    for (const r of this.radars) this.group.add(r.mesh);
    // airfield lights (all lamps of this airport in one draw call)
    this.lightMesh = buildLightMesh(this.lights, this.ctx.shared);
    this.group.add(this.lightMesh);
  }

  buildBridges(M) {
    const glass = new THREE.MeshStandardMaterial({ name: 'apt-bridge-glass', color: 0x0c1014, roughness: 0.08, metalness: 0.1, envMapIntensity: 1.6 });
    const lamp = new THREE.MeshStandardMaterial({ name: 'apt-bridge-lamp', color: 0x000000, emissive: 0xfff4e2, emissiveIntensity: 2.2 });
    this.bridgeMats = { body: M.paint, glass, lamp };
    const B = { body: new GeoBuilder(), glass: new GeoBuilder(), lamp: new GeoBuilder() };
    const occupied = new Map(this.parked.map((p) => [p.gate.id, p]));
    const stretch = { '737-800': 0, '737-900': 1.32, '737-700': -1.45 };
    for (const g of this.def.gates) {
      addRotunda(B, g.x);
      if (g.id === this.def.ownGate) continue;
      const p = occupied.get(g.id);
      addBridgeStatic(B, p ? bridgePose(g.x, 'docked', stretch[p.variant]) : bridgePose(g.x, 'stowed'));
    }
    for (const [k, m] of Object.entries(this.bridgeMats)) {
      if (B[k].empty) continue;
      const mesh = new THREE.Mesh(B[k].build(), m);
      mesh.castShadow = k !== 'lamp'; mesh.receiveShadow = k !== 'lamp';
      mesh.name = `bridges-${k}`;
      this.group.add(mesh);
    }
    this.bridge = new ActiveBridge(this.ownGate.x, this.bridgeMats);
    this.group.add(this.bridge.group);
    // departure: docked at boarding; arrival: stowed until we park
    this.bridge.set(this.id === 'departure', true);
  }

  buildOps() {
    const app = this.app, def = this.def;
    const kit = createVehicleKit(LIVERY[def.id]);
    this.kit = kit;
    this.crowd = new Crowd(48, def.seed);
    this.detail.add(this.crowd.group);
    const dynFactory = (max) => {
      const L = new LightList();
      for (let i = 0; i < max; i++) L.add([0, -100, 0], [0, 0, 0], null, { size: 0.25, cat: CAT.PAPI });
      const m = buildLightMesh(L, this.ctx.shared);
      m.geometry.attributes.iPos.setUsage(THREE.DynamicDrawUsage);
      m.geometry.attributes.iColA.setUsage(THREE.DynamicDrawUsage);
      m.geometry.attributes.iPar.setUsage(THREE.DynamicDrawUsage);
      m.geometry.instanceCount = 0;
      return m;
    };
    this.dyn = new DynLights(dynFactory, 40);
    this.detail.add(this.dyn.mesh);
    this.ops = def.id === 'departure' ? new DepartureOps(app, this, kit, this.crowd, this.dyn) : new ArrivalOps(app, this, kit, this.crowd, this.dyn);
    this.detail.add(this.ops.group);
    this.detail.add(buildStaticGSE(def, kit, this.parked, def.ownGate, this.crowd));
    this.service = new ServiceTraffic(def, kit, (app.quality?.detail ?? 1) >= 1 ? 4 : 2);
    this.detail.add(this.service.group);
  }

  setBridge(connected, instant = false) {
    if (!this.bridge) return;
    this.bridge.set(connected, instant);
  }

  update(dt, night, U) {
    const app = this.app;
    const lm = this.lightMesh.material.uniforms;
    for (let i = 0; i < NCAT; i++) lm.uCat.value[i] = CAT_DAY[i] + (CAT_NIGHT[i] - CAT_DAY[i]) * night;
    const st = app.flight?.state;
    // our own holding point stop bar is switched off once we are cleared to line up
    if (this.id === 'departure' && st && CLEARED.has(st.phase)) lm.uCat.value[CAT.STOPBAR_OWN] = 0;
    lm.uFogDensity.value = U.fogDensity;
    // camera in airport-local coordinates (glass interior parallax)
    this.camAP.value.copy(U.camWorld).sub(this.group.position);
    // aircraft position (airport-local)
    const acl = st ? U.acLocal.copy(st.position).sub(this.group.position) : null;
    this.floodRig.update(night, acl, this.floods, this.masts, FLOOD_I);
    this.signs.material.emissiveIntensity = 0.45 + 2.6 * night;
    this.buildings.materials.lampWarm.emissiveIntensity = 0.6 + 3.2 * night;
    this.buildings.materials.lampCool.emissiveIntensity = 0.8 + 3.0 * night;
    this.bridgeMats.lamp.emissiveIntensity = 1.2 + 1.6 * night;
    if (this.detail.visible) this.windsocks.update(dt, app.time, st?.windDir, st?.windSpeed);
    for (const r of this.radars) r.update(dt);
    if (this.bridge) this.bridge.update(dt);
    this.nightLevel = night;
    if (this.detail.visible) {
      this.ops.update(dt);
      this.dyn.commit();
      this.crowd.update(dt, app.time);
      this.service.update(dt, acl && Math.abs(acl.z - this.ownGate.z) < 60 ? acl : null);
      this.kit.lampOn.value = 0.8 + 3 * night;
    }
    this.traffic.update(dt);
    for (const u of this.updaters) u(dt, night);
  }
}

function padMesh(pads, ctx) {
  const P = [], N = [], U = [], I = [];
  for (const [x0, x1, z0, z1] of pads) {
    const k = P.length / 3, y = 0.022;
    P.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
    N.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    U.push(x0 / 4, -z0 / 4, x1 / 4, -z0 / 4, x1 / 4, -z1 / 4, x0 / 4, -z1 / 4);
    I.push(k, k + 2, k + 1, k, k + 3, k + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  const m = new THREE.Mesh(g, padMaterial(ctx));
  m.receiveShadow = true; m.name = 'pads';
  return m;
}

function approachStructures(poles) {
  const b = new GeoBuilder();
  for (const p of poles) {
    b.add(PRIM.cyl8, mat(p.x, -0.25 + p.h / 2, p.z, 0, 0, 0, 0.12, p.h, 0.12), 0x8a8d90);
    b.add(PRIM.box, mat(p.x, -0.25 + p.h, p.z, 0, 0, 0, 0.12, 0.1, p.w), 0x9a9c9e);
    b.add(PRIM.box, mat(p.x, -0.2, p.z, 0, 0, 0, 0.5, 0.1, 0.5), 0x707070);
  }
  const m = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 }));
  m.receiveShadow = true; m.name = 'approach-structures';
  return m;
}

export async function init(app) {
  const G = createShared(app);
  const airports = {};
  for (const def of [DEPARTURE, ARRIVAL]) {
    try {
      const a = new Airport(app, def, G);
      app.worldRoot.add(a.group);
      airports[def.id] = a;
    } catch (e) {
      console.error(`[airport] building ${def.code} failed`, e);
      const g = new THREE.Group(); g.position.set(...def.origin); app.worldRoot.add(g);
      airports[def.id] = { group: g, def, update() {}, stub: true };
    }
  }
  app.events.on('world:arrivalMoved', ({ origin }) => {
    airports.arrival.group.position.copy(origin);
    airports.arrival.group.updateMatrixWorld(true);
  });
  // jet bridges follow the director
  app.events.on('flight:bridge', ({ connected, airport, instant }) => {
    const a = airports[airport === 'arrival' ? 'arrival' : 'departure'];
    a?.setBridge?.(connected, !!instant);
    // the other airport's own bridge: departure stays stowed after we left, arrival stowed before we arrive
    const other = airports[airport === 'arrival' ? 'departure' : 'arrival'];
    if (instant) other?.setBridge?.(airport === 'arrival' ? false : false, true);
  });
  app.events.on('flight:restart', () => {
    airports.departure?.setBridge?.(true, true); airports.arrival?.setBridge?.(false, true);
    airports.departure?.ops?.onPhase('gate', true); airports.arrival?.ops?.onPhase('gate', true);
    for (const a of Object.values(airports)) a.traffic?.reset?.();
  });
  const dep = () => airports.departure, arr = () => airports.arrival;
  const safe = (fn) => (p) => { try { fn(p || {}); } catch (e) { console.error('[airport] event handler', e); } };
  app.events.on('flight:doors', safe(({ closed }) => { if (app.flight?.state?.region !== 'arrival') dep()?.ops?.onDoors?.(closed); }));
  app.events.on('flight:bridge', safe(({ connected, airport }) => { if (airport !== 'arrival') dep()?.ops?.onBridge?.(connected); }));
  app.events.on('flight:pushback', safe(({ state }) => dep()?.ops?.onPushback?.(state)));
  app.events.on('flight:phase', safe(({ phase, instant }) => {
    dep()?.ops?.onPhase?.(phase, !!instant);
    arr()?.ops?.onPhase?.(phase, !!instant);
  }));

  const U = { fogDensity: 0, camWorld: new THREE.Vector3(), acLocal: new THREE.Vector3() };
  const tmp = new THREE.Vector3();
  let synced = false;
  app.addUpdate((dt) => {
    const env = app.environment;
    const st = app.flight?.state;
    if (!synced && st) {
      // snap the own bridges to the director's state on the first frame
      synced = true;
      const arr = st.region === 'arrival';
      airports.departure?.setBridge?.(!arr && st.cabin?.bridgeConnected !== false, true);
      airports.arrival?.setBridge?.(arr && !!st.cabin?.bridgeConnected, true);
      try {
        airports.departure?.ops?.onPhase?.(st.phase, true);
        airports.arrival?.ops?.onPhase?.(st.phase, true);
      } catch (e) { console.error('[airport] initial ops sync', e); }
    }
    let night = env && typeof env.nightFactor === 'number' ? env.nightFactor : NaN;
    if (!Number.isFinite(night)) night = 1 - smoothstep(-0.12, 0.08, app.sun?.direction?.y ?? 0.5);
    // airfield lighting comes on during dusk already
    const sunEl = env?.sunElevationDeg ?? (Math.asin(clamp01(app.sun?.direction?.y ?? 0.5)) * 57.3);
    const lightsOn = Math.max(night, 1 - smoothstep(-2, 10, sunEl));
    G.shared.uTime.value = app.time;
    G.shared.uNight.value = lightsOn;
    G.shared.uResY.value = app.renderer.domElement.height || 1080;
    U.fogDensity = app.scenes.outside.fog?.density ?? 0;
    app.world.toWorld(app.camera.position, U.camWorld);
    for (const a of Object.values(airports)) {
      if (a.stub) continue;
      const d = st ? tmp.copy(st.position).sub(a.group.position).length() : 0;
      a.group.visible = d < VIS_RANGE;
      if (!a.group.visible) continue;
      a.detail.visible = d < DETAIL_RANGE;
      a.update(dt, lightsOn, U);
    }
  }, 30, 'airport');

  // debug: view an airport from an arbitrary world pose (renderCabin = false)
  window.__aptCam = (x, y, z, tx, ty, tz, airport = 'departure') => {
    const o = airports[airport].group.position;
    const eye = new THREE.Vector3(x, y, z).add(o), target = new THREE.Vector3(tx, ty, tz).add(o);
    if (app.pipeline) app.pipeline.renderCabin = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    if (window.__aptCamOff) window.__aptCamOff();
    window.__aptCamOff = app.addUpdate(() => {
      const cam = app.camera;
      app.world.toLocal(eye, cam.position);
      const tl = app.world.toLocal(target, new THREE.Vector3());
      m.lookAt(cam.position, tl, new THREE.Vector3(0, 1, 0).applyQuaternion(q.copy(app.flight.state.quaternion).invert()));
      cam.quaternion.setFromRotationMatrix(m);
      cam.updateMatrixWorld(true);
    }, 55, 'aptcam');
  };

  return {
    airports: {
      departure: { group: airports.departure.group, def: DEPARTURE },
      arrival: { group: airports.arrival.group, def: ARRIVAL },
    },
    setBridge(airportId, connected, instant = false) { airports[airportId]?.setBridge?.(connected, instant); },
    get bridges() { return { departure: airports.departure?.bridge, arrival: airports.arrival?.bridge }; },
    _internal: airports,
  };
}
