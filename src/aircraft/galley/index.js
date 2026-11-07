// =============================================================================
// GALLEY MODULE — galleys, lavatories, cabin doors, flight-deck door, crew
// stations of the Boeing 737-800 (ZONES in core/constants.js).
//
// init(app) -> API (docs/ARCHITECTURE.md §6):
//   lavs:  [{ id, side, locked, doorOpen, lidOpen, setDoor(open), setLock(on), setLid(open), flush(), runWater(), bounds }]
//   doors: { L1: { open, armed, setOpen(bool), setArmed(bool) }, R1, L2, R2 }
//   setDoorOpen(id, open)
//   carts: [{ id, out, setOut(bool) }], drawers, ovens, jumpseats, closet, curtains
//   setLightScene(mode)  (FAP; emits 'cabin:lights' {mode, manual: true})
//
// Files: geom.js (merge builder, primitives, Anim), materials.js (shared PBR +
// box-limited local lamps), textures.js (placard / glow atlases, FAP screen),
// parts.js (instanced moving parts, glowing quads), lav.js, galley.js, doors.js,
// crew.js, mirror.js (planar mirror with reversed-depth oblique clipping).
// =============================================================================
import * as THREE from 'three';
import { ZONES, DOORS } from '../../core/constants.js';
import { clamp, damp } from '../../core/util.js';
import { Kit, T, mul, Anim, easeInOut } from './geom.js';
import { createTextures, LIGHT_SCENES } from './textures.js';
import { createMaterials, LAMPS, LAMP_COUNT } from './materials.js';
import { PartType, Glowers } from './parts.js';
import { buildLav, lavPartGeometries } from './lav.js';
import { buildBank, galleyPartGeometries, CART, DRAWER } from './galley.js';
import { buildDoor, buildCockpitDoor, surfaceFrame } from './doors.js';
import { buildJumpseat, jumpPanGeometry, extinguisher, pbe, flashlight, megaphone, firstAid, fapPanel, buildCloset, closetDoorGeometry, curtainGeometry } from './crew.js';

const LAMP = { FWD_LAV: 0, AFT_LAV_L: 1, AFT_LAV_R: 2, FWD_GALLEY: 3, AFT_GALLEY_L: 4, AFT_GALLEY_R: 5, DOOR: 6, CLOSET: 7 };

export async function init(app) {
  const root = new THREE.Group();
  root.name = 'galley';
  app.cabinRoot.add(root);
  const errors = [];
  const safe = (name, fn) => { try { return fn(); } catch (e) { console.error(`[galley] ${name} failed`, e); errors.push(name); return null; } };
  const q = app.quality || { detail: 1, maxLights: 8 };
  const detail = q.detail ?? 1;
  const play = (name, position, opts = {}) => { try { app.audio?.play?.(name, { position, ...opts }); } catch { /* optional */ } };
  const toast = (t, ms) => { try { app.hud?.toast?.(t, ms); } catch { /* optional */ } };

  const tex = createTextures(app);
  const M = createMaterials(app, tex);
  M.curtain = M.fabric.clone();
  M.curtain.side = THREE.DoubleSide;
  M.curtain.onBeforeCompile = M.fabric.onBeforeCompile;
  M.curtain.customProgramCacheKey = M.fabric.customProgramCacheKey;

  // ------------------------------------------------------------------------- instanced part types
  const layers = (kit, shadow = true) => [...kit.b.entries()].filter(([, b]) => !b.empty).map(([k, b]) => ({ geometry: b.build(), material: M[k], castShadow: shadow && k !== 'placard' && k !== 'glass' && k !== 'glassDark' }));
  const LG = lavPartGeometries(tex), GG = galleyPartGeometries(tex), JP = jumpPanGeometry();
  // fold secondary materials of small moving parts into one (fewer draw calls; tints carry the look)
  const fold = (kits, into, from) => { const k = new Kit(() => 1); for (const src of kits) for (const [name, b] of src.b) if (!b.empty) k.get(from.includes(name) ? into : name).append(b); return k; };
  const cartK = fold([GG.cart, GG.cartDark], 'steel', ['chrome', 'rubber']);
  const drawerK = fold([GG.drawer], 'steel', ['chrome', 'rubber']);
  const ovenK = fold([GG.ovenDoor], 'steel', ['chrome', 'rubber', 'plastic']);
  const leafK = fold([LG.leaf, LG.leafChrome], 'plastic', ['rubber']);
  const parts = {
    lavLeaf: new PartType(root, 'lavLeaf', layers(leafK), 6),
    lavLid: new PartType(root, 'lavLid', layers(LG.lid, false), 3),
    lavValve: new PartType(root, 'lavValve', layers(LG.valve, false), 3),
    lavFlap: new PartType(root, 'lavFlap', [...layers(LG.flap, false), ...layers(LG.flapPlac, false)], 3),
    lavTable: new PartType(root, 'lavTable', layers(LG.table, false), 3),
    lavKnob: new PartType(root, 'lavKnob', layers(LG.knob, false), 3),
    lavFlag: new PartType(root, 'lavFlag', layers(LG.flag, false), 3),
    water: new PartType(root, 'water', [{ geometry: LG.water, material: M.water, castShadow: false }], 3),
    cart: new PartType(root, 'cart', [...layers(cartK), ...layers(GG.cartPlac, false)], 12),
    drawer: new PartType(root, 'drawer', [...layers(drawerK, false), ...layers(GG.drawerPlac, false)], 12),
    ovenDoor: new PartType(root, 'ovenDoor', [...layers(ovenK, false), ...layers(GG.ovenGlass, false)], 8),
    jumpPan: new PartType(root, 'jumpPan', [...layers(JP.shell, false), ...layers(JP.cushion, false)], 4),
    closetDoor: new PartType(root, 'closetDoor', layers(closetDoorGeometry(tex)), 1),
    curtain: new PartType(root, 'curtain', [{ geometry: curtainGeometry(2.05), material: M.curtain, castShadow: true }], 2),
  };
  const partList = Object.values(parts);
  const glowers = new Glowers(root, M.sign, 96);

  const staticKit = new Kit();
  const ctx = {
    app, M, tex, root, parts, glowers, staticKit,
    mirrorEnabled: true,
    mirrorSize: [384, 512, 768, 1024][clamp(detail, 0, 3)],
    reversedDepth: !!app.pipeline?.reversedDepth,
  };

  // ------------------------------------------------------------------------- lavatories
  const lavDefs = [
    { id: 'fwd', side: 'left', X0: -ZONES.forwardLav.xMax, zMin: ZONES.forwardLav.zMin, zMax: ZONES.forwardLav.zMax, lamp: LAMP.FWD_LAV, zone: 'lav-fwd' },
    { id: 'aft-left', side: 'left', X0: -ZONES.aftLavs.left.xMax, zMin: ZONES.aftLavs.zMin, zMax: ZONES.aftLavs.zMax, lamp: LAMP.AFT_LAV_L, zone: 'lav-aft-l' },
    { id: 'aft-right', side: 'right', X0: ZONES.aftLavs.right.xMin, zMin: ZONES.aftLavs.zMin, zMax: ZONES.aftLavs.zMax, lamp: LAMP.AFT_LAV_R, zone: 'lav-aft-r' },
  ];
  const lavs = [];
  for (const def of lavDefs) {
    const L = safe(`lav ${def.id}`, () => buildLav(ctx, def));
    if (!L) continue;
    staticKit.merge(L.kit, L.W).merge(L.out, L.W);
    L.animList = Object.values(L.anims);
    lavs.push(L);
  }

  // ------------------------------------------------------------------------- galleys
  const banks = [];
  const fwdGalley = safe('forward galley', () => buildBank(ctx, {
    id: 'G1', label: 'g1', s: 1, zF: ZONES.forwardGalley.zMax, f: 1, depth: ZONES.forwardGalley.zMax - ZONES.flightDeckDoorZ - 0.02, u0: ZONES.forwardGalley.xMin,
    bays: [
      { type: 'cart', u: 0.45, w: 0.315 },
      { type: 'cart', u: 0.777, w: 0.315 },
      { type: 'units', u: 1.104, w: 0.3, drawers: 1, compactor: true },
      { type: 'stow', u: 1.416, w: 0.19, label: 'stowage' },
    ],
    mid: [
      { type: 'coffee', u: 0.47, w: 0.27 },
      { type: 'boiler', u: 0.755, w: 0.2 },
      { type: 'items', u: 0.97, w: 0.3 },
      { type: 'cb', u: 1.0, w: 0.22 },
      { type: 'handset', u: 1.3, w: 0.1 },
    ],
    upper: [{ type: 'oven', u: 0.465, w: 0.315, label: 'oven1' }, { type: 'oven', u: 0.79, w: 0.315, label: 'oven2' }],
    top: [{ u: 0.465, w: 0.37, label: 'firstAid' }],
  }));
  if (fwdGalley) banks.push(fwdGalley);
  const aftZF = ZONES.aftGalley.zMin + 0.32, aftDepth = ZONES.aftBulkheadZ - 0.02 - aftZF;
  const aftL = safe('aft galley left', () => buildBank(ctx, {
    id: 'G4L', label: 'g4', s: -1, zF: aftZF, f: -1, depth: aftDepth, u0: 0.4,
    bays: [
      { type: 'cart', u: 0.43, w: 0.315 },
      { type: 'cart', u: 0.757, w: 0.315 },
      { type: 'units', u: 1.084, w: 0.3, drawers: 3 },
      { type: 'stow', u: 1.396, w: 0.2, label: 'stowage' },
    ],
    mid: [
      { type: 'coffee', u: 0.45, w: 0.27 },
      { type: 'coffee', u: 0.735, w: 0.27 },
      { type: 'items', u: 1.02, w: 0.3 },
      { type: 'handset', u: 1.33, w: 0.1 },
    ],
    upper: [{ type: 'oven', u: 0.445, w: 0.315, label: 'oven3' }, { type: 'oven', u: 0.77, w: 0.315, label: 'oven4' }],
    top: [{ u: 0.445, w: 0.38, label: 'stowage' }],
  }));
  if (aftL) banks.push(aftL);
  const aftR = safe('aft galley right', () => buildBank(ctx, {
    id: 'G4R', label: 'g4', s: 1, zF: aftZF, f: -1, depth: aftDepth, u0: 0.4,
    bays: [
      { type: 'cart', u: 0.43, w: 0.315 },
      { type: 'half', u: 0.757, w: 0.315 },
      { type: 'units', u: 1.084, w: 0.3, drawers: 1, compactor: true },
      { type: 'stow', u: 1.396, w: 0.2, label: 'stowage' },
    ],
    mid: [
      { type: 'boiler', u: 0.45, w: 0.2 },
      { type: 'items', u: 0.67, w: 0.3 },
      { type: 'chiller', u: 0.98, w: 0.22 },
      { type: 'cb', u: 1.21, w: 0.2 },
    ],
    upper: [{ type: 'oven', u: 0.445, w: 0.315, label: 'oven1' }, { type: 'box', u: 0.77, w: 0.315, label: 'stowage' }],
    top: [{ u: 0.445, w: 0.38, label: 'stowage' }],
  }));
  if (aftR) banks.push(aftR);
  for (const b of banks) staticKit.merge(b.kit);

  // aft galley centre recess: back panel, header stowage with the first-aid kit
  safe('aft recess', () => {
    const k = new Kit();
    const zb = ZONES.aftBulkheadZ - 0.012;
    k.add('plastic', new THREE.BoxGeometry(0.8, 2.2, 0.012, 2, 8, 1).translate(0, 1.1, zb), null, { color: [0.8, 0.8, 0.79] });
    k.add('plastic', new THREE.BoxGeometry(0.8, 0.3, 0.4, 2, 1, 1).translate(0, 1.95, zb - 0.2), null, { color: [0.8, 0.8, 0.79] });
    k.add('plastic', new THREE.BoxGeometry(0.76, 0.26, 0.012).translate(0, 1.95, zb - 0.405), null, { color: [0.85, 0.85, 0.84] });
    firstAid(k, T(0.0, 1.49, zb, 0, Math.PI, 0), tex.rect);
    staticKit.merge(k);
  });

  // ------------------------------------------------------------------------- cabin doors
  const doors = {};
  for (const id of ['L1', 'R1', 'L2', 'R2']) {
    const d = safe(`door ${id}`, () => buildDoor(ctx, id));
    if (d) doors[id] = d;
  }
  const cockpit = safe('cockpit door', () => buildCockpitDoor(ctx));

  // ------------------------------------------------------------------------- crew stations & equipment
  const jumpseats = [];
  let fapScreen = null, closet = null;
  safe('crew', () => {
    const k = new Kit();
    const R = tex.rect;
    // L1 jumpseat on the forward lav door wall (aft-facing), outboard of the lav door
    const zw = ZONES.forwardLav.zMax + 0.001;
    const fJ = T(-1.27, 0, zw, 0, 0, 0);
    for (const p of buildJumpseat(ctx, k, fJ, 0.42, 1)) jumpseats.push({ id: 'L1', part: p, pos: new THREE.Vector3(-1.27, 0.5, zw + 0.25) });
    fapScreen = fapPanel(ctx, k, T(-1.26, 1.42, zw));
    flashlight(k, T(-1.46, 0.08, zw), R);
    // aft double jumpseat (forward-facing) in the aft galley recess
    const za = ZONES.aftBulkheadZ - 0.012;
    const aJ = T(0, 0, za, 0, Math.PI, 0);
    for (const p of buildJumpseat(ctx, k, aJ, 0.36, 2)) jumpseats.push({ id: 'L2', part: p, pos: new THREE.Vector3(0, 0.5, za - 0.25) });
    // aft attendant panel (backlit keys) + interphone above the jumpseat
    k.add('rubber', new THREE.BoxGeometry(0.26, 0.11, 0.02), T(0, 1.36, za - 0.01), { color: [0.12, 0.12, 0.13] });
    ctx.aftPanelM = T(0, 1.36, za - 0.0205, 0, Math.PI, 0);
    // forward equipment: extinguisher + PBE on the galley side panel facing the vestibule
    const gx = ZONES.forwardGalley.xMin - 0.001;
    extinguisher(k, T(gx, 0.05, -15.45, 0, -Math.PI / 2, 0), R);
    pbe(k, T(gx, 0.85, -15.45, 0, -Math.PI / 2, 0), R);
    k.add('placard', new THREE.PlaneGeometry(0.13, 0.061), T(gx - 0.0012, 1.3, -15.45, 0, -Math.PI / 2, 0), { uvRect: R('emergencyEquip') });
    // aft equipment on the inboard side panels of the aft banks (facing the recess)
    extinguisher(k, T(0.399, 0.05, aftZF + 0.55, 0, -Math.PI / 2, 0), R);
    pbe(k, T(-0.399, 0.85, aftZF + 0.55, 0, Math.PI / 2, 0), R);
    megaphone(k, T(-0.399, 0.15, aftZF + 0.55, 0, Math.PI / 2, 0), R);
    k.add('placard', new THREE.PlaneGeometry(0.13, 0.061), T(0.3988, 1.3, aftZF + 0.55, 0, -Math.PI / 2, 0), { uvRect: R('emergencyEquip') });
    staticKit.merge(k);
    closet = buildCloset(ctx, staticKit);
  });

  // ------------------------------------------------------------------------- curtains
  const curtains = [];
  safe('curtains', () => {
    const mk = (id, z, x0, x1, top) => {
      const inst = parts.curtain.add(T(x0, top, z), false);
      const c = { id, inst, x0, x1, top, open: true, k: 1, anim: null };
      c.anim = new Anim(1.4, (e) => {
        // e: 0 closed (spread) .. 1 open (gathered at x0)
        const w = (x1 - x0) * (1 - 0.86 * e);
        inst.setLocal(new THREE.Matrix4().makeScale(w, 1, 1));
      }, { value: 1 });
      curtains.push(c);
      return c;
    };
    mk('forward', ZONES.businessFrontBulkheadZ - 0.06, -0.44, 0.44, 2.11);
    mk('aft', ZONES.aftLavs.zMax + 0.03, -0.36, 0.36, 2.11);
    // tracks
    const k = new Kit(() => 1);
    for (const c of curtains) k.add('steel', new THREE.BoxGeometry(c.x1 - c.x0 + 0.04, 0.02, 0.03).translate((c.x0 + c.x1) / 2, c.top + 0.012, c.inst.base.elements[14]), null, { color: [0.75, 0.75, 0.77] });
    staticKit.merge(k);
  });

  // the closed door leaves (outer skin at r = 1.875) must be inside the cabin sun's shadow camera
  try { app.cabinBounds?.expandByPoint?.(new THREE.Vector3(1.9, 0, 0)); app.cabinBounds?.expandByPoint?.(new THREE.Vector3(-1.9, 0, 0)); } catch { /* optional */ }

  // ------------------------------------------------------------------------- static meshes
  const staticMeshes = staticKit.meshes(M, root, { namePrefix: 'galley-static' });

  // ------------------------------------------------------------------------- dynamic galley parts
  const carts = [], drawers = [], ovens = [], coffees = [];
  const _m = new THREE.Matrix4();
  const _halfScale = new THREE.Matrix4().makeScale(1, 1, CART.half / CART.full);
  for (const b of banks) {
    for (const c of b.carts) {
      const base = T(b.wx(c.u), 0.0, b.wz(0.0), 0, b.rotY, 0);
      const inst = parts.cart.add(base, false);
      const cart = { id: `${b.cfg?.id || ''}cart${carts.length + 1}`, inst, half: c.half, out: false, bank: b, pos: c.pos, collider: null };
      cart.anim = new Anim(1.1, (e) => { _m.makeTranslation(0, 0, 0.4 * e); if (c.half) _m.multiply(_halfScale); inst.setLocal(_m); }, { ease: easeInOut });
      // collider in front of the bay (enabled when pulled out)
      const a = new THREE.Vector3(b.wx(c.u - CART.w / 2), 0, b.wz(-0.42)), z = new THREE.Vector3(b.wx(c.u + CART.w / 2), 1.05, b.wz(0));
      cart.collider = app.colliders?.addBox?.(a.clone().min(z), a.clone().max(z), { tag: 'galley-cart' });
      if (cart.collider) app.colliders.setEnabled(cart.collider, false);
      carts.push(cart);
    }
    for (const d of b.drawers) {
      const inst = parts.drawer.add(T(b.wx(d.u), d.y, b.wz(0.0), 0, b.rotY, 0), false);
      const dr = { id: `drawer${drawers.length + 1}`, inst, open: false, pos: d.pos };
      dr.anim = new Anim(0.45, (e) => { _m.makeTranslation(0, 0, 0.3 * e); inst.setLocal(_m); });
      drawers.push(dr);
    }
    for (const o of b.ovens) {
      const inst = parts.ovenDoor.add(T(b.wx(o.u), o.y, b.wz(0.0), 0, b.rotY, 0), false);
      const ov = { id: `oven${ovens.length + 1}`, inst, open: false, pos: o.pos, cooking: false };
      ov.anim = new Anim(0.7, (e) => { _m.makeRotationX(e * 1.52); inst.setLocal(_m); });
      ov.timer = glowers.add(o.timerM, 0.05, 0.016, tex.glowRect('ovenIdle'), [1, 1, 1], 1.2);
      ovens.push(ov);
    }
    for (const c of b.coffee) {
      const disp = glowers.add(c.displayM, 0.075, 0.025, tex.glowRect('coffeeReady'), [1, 1, 1], 1.4);
      coffees.push({ disp, pos: c.pos, brewT: 0, proxy: c.proxy, bank: b });
    }
    for (const e of b.extras) {
      if (e.kind === 'led') glowers.add(e.m, 0.012, 0.012, tex.glowRect(e.rect), [1, 1, 1], 2.5);
      else if (e.kind === 'disp') glowers.add(e.m, e.w, e.h, tex.glowRect(e.rect), [1, 1, 1], 1.4);
      else if (e.kind === 'strip') b.strip = glowers.add(e.m, e.w, e.h, tex.glowRect('strip'), [1, 0.97, 0.92], 3.0);
    }
  }
  // jumpseat pans
  for (const j of jumpseats) {
    j.down = false;
    j.anim = new Anim(0.55, (e) => { _m.makeRotationX(-(1 - e) * Math.PI / 2); j.part.setLocal(_m); }, { value: 0 });
  }
  // closet door
  if (closet) {
    closet.open = false;
    closet.anim = new Anim(0.9, (e) => { _m.makeRotationY(e * 1.75); closet.door.setLocal(_m); });
  }
  // misc glowing bits: flashlight charge LED, keypad LEDs, aft panel
  const flashLed = glowers.add(T(-1.432, 0.22, ZONES.forwardLav.zMax + 0.0525), 0.008, 0.008, tex.glowRect('ledRed'), [1, 0.3, 0.2], 0);
  if (cockpit) glowers.add(cockpit.keypadLeds, 0.06, 0.015, tex.glowRect('keyLeds'), [1, 1, 1], 1.6);
  if (ctx.aftPanelM) glowers.add(ctx.aftPanelM, 0.22, 0.085, tex.glowRect('panelBacklit'), [1, 1, 1], 1.1);

  // ------------------------------------------------------------------------- lights (real, budgeted)
  const realLights = [];
  const addPoint = (pos, dist) => { const l = new THREE.PointLight(0xfff2e0, 0, dist, 2); l.position.copy(pos); l.castShadow = false; l.name = 'galley-work-light'; root.add(l); realLights.push(l); return l; };
  const galleyPts = [];
  if (detail >= 1 && fwdGalley) galleyPts.push({ l: addPoint(new THREE.Vector3(0.95, 1.32, ZONES.forwardGalley.zMax + 0.25), 2.4), bank: fwdGalley });
  if (detail >= 2 && aftL) galleyPts.push({ l: addPoint(new THREE.Vector3(0, 1.32, aftZF - 0.35), 3.0), bank: aftL });
  let doorSpot = null;
  if (detail >= 1 && doors.L1) {
    doorSpot = new THREE.SpotLight(0xdde6ff, 0, 6, 0.95, 0.85, 2);
    doorSpot.position.set(-2.25, 1.75, DOORS.L1.z);
    doorSpot.target.position.set(0.2, 0.0, DOORS.L1.z + 0.4);
    doorSpot.castShadow = false;
    doorSpot.name = 'galley-door-daylight';
    root.add(doorSpot, doorSpot.target);
  }

  // ------------------------------------------------------------------------- colliders
  const C = app.colliders;
  const colliderIds = [];
  const addC = (a, b, tag) => { if (!C?.addBox) return null; const id = C.addBox(a, b, { tag }); colliderIds.push(id); return id; };
  for (const L of lavs) {
    for (const [a, b] of L.colliders) addC(a, b, 'lav-wall');
    L.doorColliderId = addC(L.doorCollider[0], L.doorCollider[1], 'lav-door');
  }
  for (const b of banks) addC(b.bankCollider[0], b.bankCollider[1], 'galley');
  if (closet) addC(closet.collider[0], closet.collider[1], 'closet');
  // never step out of an open cabin door (the cabin sidewall collider also covers this)
  for (const d of Object.values(doors)) {
    const s = d.mirror ? -1 : 1, z = d.def.z, hw = d.def.width / 2 + 0.05;
    addC(new THREE.Vector3(Math.min(s * 1.6, s * 2.6), 0, z - hw), new THREE.Vector3(Math.max(s * 1.6, s * 2.6), 2.2, z + hw), 'door-opening');
  }

  // ------------------------------------------------------------------------- interactions
  const I = app.interactions;
  const proxyGeo = new THREE.BoxGeometry(1, 1, 1);
  const proxy = (c, s, name) => {
    const m = new THREE.Mesh(proxyGeo, M.proxy);
    m.position.copy(c); m.scale.copy(s); m.name = name || 'galley-proxy';
    root.add(m); m.updateMatrixWorld(true);
    return m;
  };
  const add = (def) => { try { return I?.add?.(def); } catch (e) { console.error('[galley] interaction', e); return null; } };
  const occluder = (o) => { try { I?.addOccluder?.(o); } catch { /* optional */ } };
  const vec = (a) => new THREE.Vector3(a[0], a[1], a[2]);

  // --- lavatories
  const lavApi = [];
  for (const L of lavs) {
    const S = L.state, W = L.W;
    const pw = (p) => vec(p.c).applyMatrix4(W);
    const ps = (p) => vec(p.s);
    for (const o of L.occluders) occluder(proxy(vec(o.c).applyMatrix4(W), vec(o.s), 'galley-lav-occluder'));
    const api = {
      id: L.def.id, side: L.def.side, bounds: L.bounds,
      get locked() { return S.locked; }, get doorOpen() { return S.doorOpen; }, get lidOpen() { return S.lidOpen; }, get tableDown() { return S.tableDown; },
      setDoor(open) {
        open = !!open;
        if (open === S.doorOpen) return;
        if (open && S.locked) api.setLock(false, true);
        S.doorOpen = open;
        L.anims.door.to(open ? 1 : 0);
        if (L.doorColliderId) C.setEnabled(L.doorColliderId, !open);
        play('lav_door', L.audioPos);
      },
      setLock(on, silent = false) {
        on = !!on;
        if (on === S.locked) return;
        if (on && S.doorOpen) { api.setDoor(false); }
        S.locked = on;
        L.anims.lock.to(on ? 1 : 0);
        S.lightTarget = on ? 1 : 0.22;
        if (on) S.flicker = 0.35;
        if (!silent) play('lav_lock', L.audioPos);
      },
      setLid(open) { S.lidOpen = !!open; L.anims.lid.to(open ? 1 : 0); play('switch_click', L.audioPos, { volume: 0.6 }); },
      setTable(down) { S.tableDown = !!down; L.anims.table.to(down ? 1 : 0); play('tray_open', L.audioPos, { volume: 0.7 }); },
      flush() { S.flushT = 1.2; L.anims.valve.to(1); play('toilet_flush', L.audioPos); },
      runWater() { S.waterT = 3.2; play('tap_water', L.audioPos); },
      pushFlap() { S.flapT = 0.6; L.anims.flap.to(1); play('paper', L.audioPos, { volume: 0.6 }); },
      call() { S.callT = 20; app.events.emit('cabin:chime', { type: 'call', source: `lav-${L.def.id}` }); play('button_press', L.audioPos); },
    };
    // door leaves (both sides): open / close
    const leafEntry = (idx) => ({
      object: parts.lavLeaf.mesh, instanceId: idx,
      label: () => (S.doorOpen ? 'Close lavatory door' : S.locked ? 'Unlock and open door' : 'Open lavatory door'),
      onInteract: () => api.setDoor(!S.doorOpen),
    });
    const idxA = lavs.indexOf(L) * 2;
    add(leafEntry(idxA)); add(leafEntry(idxA + 1));
    add({ object: proxy(pw(L.proxies.lock), ps(L.proxies.lock), 'galley-lav-lock'), label: () => (S.locked ? 'Unlock (Vacant)' : 'Lock door (Occupied)'), onInteract: () => api.setLock(!S.locked), priority: 2, maxDistance: 1.6 });
    add({ object: parts.lavLid.mesh, instanceId: lavs.indexOf(L), label: () => (S.lidOpen ? 'Lower toilet lid' : 'Lift toilet lid'), onInteract: () => api.setLid(!S.lidOpen), maxDistance: 1.8 });
    add({ object: proxy(pw(L.proxies.flush), ps(L.proxies.flush), 'galley-lav-flush'), label: 'Flush', onInteract: () => api.flush(), priority: 2, maxDistance: 1.8 });
    add({ object: proxy(pw(L.proxies.faucet), ps(L.proxies.faucet), 'galley-lav-faucet'), label: 'Press tap', onInteract: () => api.runWater(), priority: 1, maxDistance: 1.6 });
    add({ object: proxy(pw(L.proxies.soap), ps(L.proxies.soap), 'galley-lav-soap'), label: 'Soap', onInteract: () => play('button_press', L.audioPos, { volume: 0.4 }), priority: 2, maxDistance: 1.6 });
    add({ object: proxy(pw(L.proxies.towel), ps(L.proxies.towel), 'galley-lav-towel'), label: 'Take a paper towel', onInteract: () => play('paper', L.audioPos), maxDistance: 1.6 });
    add({ object: proxy(pw(L.proxies.flap), ps(L.proxies.flap), 'galley-lav-flap'), label: 'Push waste flap', onInteract: () => api.pushFlap(), maxDistance: 1.6 });
    add({ object: parts.lavTable.mesh, instanceId: lavs.indexOf(L), label: () => (S.tableDown ? 'Fold up changing table' : 'Fold down changing table'), onInteract: () => api.setTable(!S.tableDown), maxDistance: 1.8 });
    add({ object: proxy(pw(L.proxies.call), ps(L.proxies.call), 'galley-lav-call'), label: () => (S.callT > 0 ? 'Cancel attendant call' : 'Call attendant'), onInteract: () => { if (S.callT > 0) { S.callT = 0; play('button_press', L.audioPos); } else api.call(); }, priority: 2, maxDistance: 1.6 });
    L.api = api;
    lavApi.push(api);
  }

  // --- galley carts / drawers / ovens / coffee / handsets
  for (const [i, c] of carts.entries()) {
    add({
      object: parts.cart.meshes[0], instanceId: i,
      label: () => (c.out ? 'Push cart back' : 'Pull out cart'),
      onInteract: () => setCart(c, !c.out),
      maxDistance: 2.0,
    });
  }
  function setCart(c, out) {
    c.out = !!out; c.anim.to(c.out ? 1 : 0);
    if (c.collider) C.setEnabled(c.collider, c.out);
    play('cart', c.pos);
  }
  for (const [i, d] of drawers.entries()) add({ object: parts.drawer.meshes[0], instanceId: i, label: () => (d.open ? 'Close drawer' : 'Open drawer'), onInteract: () => { d.open = !d.open; d.anim.to(d.open ? 1 : 0); play('drawer', d.pos); }, maxDistance: 2.0 });
  for (const [i, o] of ovens.entries()) add({ object: parts.ovenDoor.meshes[0], instanceId: i, label: () => (o.open ? 'Close oven' : 'Open oven'), onInteract: () => { o.open = !o.open; o.anim.to(o.open ? 1 : 0); play('oven_door', o.pos); }, maxDistance: 2.2 });
  for (const c of coffees) {
    const b = c.bank, p = c.proxy;
    const m = proxy(new THREE.Vector3(b.wx(p.u), p.y - 0.08, b.wz(p.d + 0.1)), new THREE.Vector3(p.w, 0.36, 0.25), 'galley-coffee');
    add({ object: m, label: () => (c.brewT > 0 ? 'Coffee is brewing…' : 'Brew coffee'), onInteract: () => { if (c.brewT <= 0) { c.brewT = 9; play('switch_click', c.pos); } }, maxDistance: 2.0 });
  }
  for (const b of banks) for (const p of b.proxies) {
    if (p.kind === 'handset') add({ object: proxy(p.c, p.s, 'galley-handset'), label: 'Crew interphone', onInteract: () => { play('button_press', p.c); toast('Crew interphone — for cabin crew use only.'); }, maxDistance: 2.0 });
  }

  // --- FAP (cycles the cabin lighting scene)
  let lightManual = null;
  const setLightScene = (mode) => {
    lightManual = mode;
    app.events.emit('cabin:lights', { mode, manual: true });
    try { app.cabin?.setLightsOverride?.({ mode, level: 1 }); } catch { /* optional */ }
    fapFlash = 0.25;
  };
  let fapFlash = 0;
  const currentLightMode = () => lightManual || app.cabin?.lights?.mode || app.flight?.state?.cabin?.lightsMode || 'boarding';
  if (fapScreen) {
    add({
      object: fapScreen,
      label: () => { const i = LIGHT_SCENES.findIndex((s) => s.mode === currentLightMode()); return `Cabin lighting: ${LIGHT_SCENES[(i + 1) % LIGHT_SCENES.length].label.toLowerCase()}`; },
      onInteract: () => {
        const i = LIGHT_SCENES.findIndex((s) => s.mode === currentLightMode());
        setLightScene(LIGHT_SCENES[(i + 1) % LIGHT_SCENES.length].mode);
        play('button_press', fapScreen.getWorldPosition(new THREE.Vector3()), { volume: 0.5 });
      },
      maxDistance: 1.8, priority: 2,
    });
  }
  // the director takes the lighting back at the next phase change
  app.events.on('flight:phase', () => { if (lightManual) { lightManual = null; try { app.cabin?.setLightsOverride?.(null); } catch { /* optional */ } } });

  // --- jumpseats, closet, curtains, cockpit door, cabin door handles
  for (const [i, j] of jumpseats.entries()) add({ object: parts.jumpPan.meshes[0], instanceId: i, label: () => (j.down ? 'Fold up jumpseat' : 'Fold down jumpseat'), onInteract: () => { j.down = !j.down; j.anim.to(j.down ? 1 : 0); play('seat_sit', j.pos, { volume: 0.5 }); }, maxDistance: 2.0 });
  if (closet) {
    const setCloset = (open) => { closet.open = !!open; closet.anim.to(closet.open ? 1 : 0); play('bin_open', closet.soundPos, { volume: 0.7 }); };
    closet.setOpen = setCloset;
    add({ object: parts.closetDoor.mesh, instanceId: 0, label: () => (closet.open ? 'Close coat closet' : 'Open coat closet'), onInteract: () => setCloset(!closet.open), maxDistance: 2.0 });
  }
  for (const [i, c] of curtains.entries()) {
    c.setOpen = (open) => { c.open = !!open; c.anim.to(c.open ? 1 : 0); play('paper', c.inst.worldPoint(0.5, -1, 0), { volume: 0.4 }); };
    add({ object: parts.curtain.mesh, instanceId: i, label: () => (c.open ? 'Close curtain' : 'Open curtain'), onInteract: () => c.setOpen(!c.open), maxDistance: 2.0 });
  }
  if (cockpit) {
    let lastKnock = -10;
    add({
      object: proxy(cockpit.proxy.c, cockpit.proxy.s, 'galley-cockpit-door'), label: 'Knock',
      onInteract: () => {
        play('cockpit_knock', cockpit.proxy.c);
        if (app.time - lastKnock > 1.5) toast('The flight deck is secured for the flight.');
        lastKnock = app.time;
      },
      maxDistance: 2.0,
    });
  }
  for (const d of Object.values(doors)) {
    add({ object: proxy(d.handleProxy.c, d.handleProxy.s, `galley-door-${d.id}-handle`), label: `Door ${d.id}`, onInteract: () => { play('switch_click', d.soundPos, { volume: 0.4 }); toast('Aircraft doors are operated by the cabin crew only.'); }, maxDistance: 2.0 });
  }

  // ------------------------------------------------------------------------- flight coupling
  const st = () => app.flight?.state;
  let skipUntil = 0;
  let lastArmed = null;
  const L1 = doors.L1;
  const setDoorOpen = (id, open, opts = {}) => {
    const d = doors[id];
    if (!d) return false;
    if (d.open === !!open && !opts.instant) return true;
    if (open && d.armed) d.setArmed(false, { instant: true });
    d.setOpen(!!open, opts);
    if (!opts.instant) play('cabin_door', d.soundPos);
    return true;
  };
  let lastWant = null;
  const syncFromState = (instant) => {
    const s = st();
    if (!s) return;
    const c = s.cabin || {};
    // edge-triggered so that API calls (tests, debugging) are not overridden every frame
    const wantOpen = !c.doorsClosed && (s.phase === 'gate' || s.phase === 'arrived');
    if (wantOpen !== lastWant) {
      if (L1 && (L1.open !== wantOpen || lastWant === null)) setDoorOpen('L1', wantOpen, { instant: instant || lastWant === null });
      lastWant = wantOpen;
    }
    const armed = !!c.doorsArmed;
    if (armed !== lastArmed) {
      const delays = { L1: 0.6, R1: 3.2, L2: 1.4, R2: 4.0 };
      for (const d of Object.values(doors)) if (!d.open) d.setArmed(armed, { instant: instant || lastArmed === null, delay: delays[d.id] || 0 });
      lastArmed = armed;
    }
  };
  app.events.on('flight:doors', ({ closed, instant }) => { if (L1) setDoorOpen('L1', !closed, { instant: !!instant || app.time < skipUntil || !app.started }); lastWant = !closed; });
  app.events.on('flight:skip', () => { skipUntil = app.time + 1.5; });
  app.events.on('flight:restart', () => { skipUntil = app.time + 1.5; });
  app.events.on('app:ready', () => syncFromState(true));
  // the aft curtain is drawn during the cruise service, open for take-off & landing
  app.events.on('flight:phase', ({ phase }) => {
    const aft = curtains.find((c) => c.id === 'aft');
    if (!aft) return;
    if (phase === 'cruise') setTimeout(() => { if (st()?.phase === 'cruise') aft.setOpen(false); }, 30000);
    if (phase === 'descent' || phase === 'approach' || phase === 'gate') aft.setOpen(true);
  });

  // ------------------------------------------------------------------------- per-frame update
  const camPos = new THREE.Vector3();
  const tmpBox = new THREE.Box3();
  const lampCol = LAMPS.col.value, lampAmb = LAMPS.amb.value, lampPos = LAMPS.pos.value, lampMin = LAMPS.bmin.value, lampMax = LAMPS.bmax.value;
  const setLampBox = (i, pos, min, max, k = 3) => { lampPos[i].copy(pos); lampMin[i].copy(min); lampMax[i].copy(max); LAMPS.k.value[i] = k; };
  for (const L of lavs) setLampBox(L.def.lamp, L.lamp.pos, L.lamp.min, L.lamp.max, 2.0);
  if (fwdGalley) setLampBox(LAMP.FWD_GALLEY, fwdGalley.lamp.pos, fwdGalley.lamp.min, fwdGalley.lamp.max, 3.5);
  if (aftL) setLampBox(LAMP.AFT_GALLEY_L, aftL.lamp.pos, aftL.lamp.min, aftL.lamp.max, 3.5);
  if (aftR) setLampBox(LAMP.AFT_GALLEY_R, aftR.lamp.pos, aftR.lamp.min, aftR.lamp.max, 3.5);
  if (L1) setLampBox(LAMP.DOOR, new THREE.Vector3(-2.6, 1.5, DOORS.L1.z + 0.1), new THREE.Vector3(-2.0, -0.1, ZONES.forwardLav.zMax - 0.06), new THREE.Vector3(-0.1, 2.3, ZONES.businessFrontBulkheadZ), 0.12);
  if (closet) setLampBox(LAMP.CLOSET, closet.lamp.pos, closet.lamp.min, closet.lamp.max, 3);
  const daylight = new THREE.Color();
  let fapT = 0, activeMirror = null, primed = false;
  const fapState = { mode: 'boarding', page: 0, doors: { L1: {}, R1: {}, L2: {}, R2: {} }, flash: false };

  function update(dt) {
    const s = st();
    const time = app.time;
    if (!primed) { primed = true; syncFromState(true); }
    else syncFromState(time < skipUntil);
    // animations
    for (const L of lavs) {
      const S = L.state;
      for (const a of L.animList) a.update(dt);
      // flush valve closes again, waste flap springs back
      if (S.flushT > 0) { S.flushT -= dt; if (S.flushT < 0.8 && L.anims.valve.target === 1) L.anims.valve.to(0); }
      if (S.flapT > 0) { S.flapT -= dt; if (S.flapT <= 0) L.anims.flap.to(0); }
      // water stream
      if (S.waterT > 0) S.waterT -= dt;
      const want = S.waterT > 0 ? 1 : 0;
      const prev = L.waterLen;
      L.waterLen = damp(L.waterLen, want, want ? 18 : 10, dt);
      if (Math.abs(L.waterLen - prev) > 1e-4 || (want && L.waterLen > 0.01)) L.setWater(L.waterLen > 0.01 ? L.waterLen * 0.215 : 0);
      // lighting: dim when vacant, bright when locked (with a short fluorescent flicker)
      S.light = damp(S.light, S.lightTarget, 6, dt);
      let lv = S.light;
      if (S.flicker > 0) { S.flicker -= dt; lv *= (Math.sin(S.flicker * 90) > 0.2 ? 1 : 0.35); }
      const i = L.def.lamp;
      lampCol[i].set(1.0, 0.97, 0.92).multiplyScalar(17.0 * lv);
      lampAmb[i].set(1.0, 0.98, 0.95).multiplyScalar(1.7 * lv + 0.05);
      L.glow.diffuser.setLevel(0.25 + 3.2 * lv);
      L.glow.strip.setLevel(0.25 + 3.0 * lv);
      L.glow.occ.setLevel(S.locked ? 2.4 : 0.03);
      L.glow.ret.setLevel(s?.cabin?.seatbelt ? 2.2 : 0.02);
      if (S.callT > 0) S.callT -= dt;
      L.glow.callLed.setLevel(S.callT > 0 ? 3 : 0.05);
      M.water.uniforms.uLight.value.setRGB(0.4 + 0.9 * lv, 0.42 + 0.9 * lv, 0.45 + 0.9 * lv);
    }
    M.water.uniforms.uTime.value = time;
    // skip draw calls for parts that are invisible most of the time
    let anyWater = false, anyLid = false;
    for (const L of lavs) { if (L.waterLen > 0.01) anyWater = true; if (L.anims.lid.value > 0 || L.state.flushT > 0) anyLid = true; }
    parts.water.mesh.visible = anyWater;
    parts.lavValve.mesh.visible = anyLid;
    for (const c of carts) c.anim.update(dt);
    for (const d of drawers) d.anim.update(dt);
    for (const o of ovens) o.anim.update(dt);
    for (const j of jumpseats) j.anim.update(dt);
    if (closet) closet.anim.update(dt);
    for (const c of curtains) c.anim.update(dt);
    for (const d of Object.values(doors)) d.update(dt);
    // coffee makers: HEAT -> READY
    for (const c of coffees) {
      if (c.brewT > 0) { c.brewT -= dt; c.disp.setRect(tex.glowRect('brewing')); if (c.brewT <= 0) c.disp.setRect(tex.glowRect('coffeeReady')); }
    }
    // oven timers: running during the cruise meal service while the door is shut
    const cooking = s?.phase === 'climb' || s?.phase === 'cruise';
    for (const [i, o] of ovens.entries()) {
      const on = cooking && !o.open && i % 2 === 0;
      if (on !== o.cooking) { o.cooking = on; o.timer.setRect(tex.glowRect(on ? 'ovenTimer' : 'ovenIdle')); }
    }
    // galley work lights follow the cabin lighting (dimmed at night)
    const mode = currentLightMode();
    const gl = mode === 'night' ? 0.25 : mode === 'dim' ? 0.55 : 1.0;
    for (const b of banks) {
      const i = b === fwdGalley ? LAMP.FWD_GALLEY : b === aftL ? LAMP.AFT_GALLEY_L : LAMP.AFT_GALLEY_R;
      lampCol[i].set(1.0, 0.95, 0.86).multiplyScalar(3.2 * gl);
      lampAmb[i].set(1.0, 0.96, 0.9).multiplyScalar(0.12 * gl);
      b.strip?.setLevel(3.0 * gl);
    }
    for (const g of galleyPts) g.l.intensity = 0.55 * gl;
    flashLed.setLevel((time % 2.0) < 0.12 ? 3 : 0.05);
    // closet interior light while open
    if (closet) { const k = closet.anim.value; lampCol[LAMP.CLOSET].set(1, 0.95, 0.88).multiplyScalar(2.0 * k); lampAmb[LAMP.CLOSET].set(1, 0.95, 0.9).multiplyScalar(0.35 * k); }
    // daylight through the open L1 door
    if (L1) {
      const open = clamp((L1.st.k - 0.3) / 0.7);
      const sun = app.sun || {};
      const day = clamp((sun.intensity ?? 6) / 6, 0, 1.5);
      const bridge = s?.cabin?.bridgeConnected ? 0.55 : 1.0;
      daylight.copy(sun.skyColor || daylight.setRGB(0.6, 0.7, 1)).lerp(sun.color || daylight, 0.5);
      const k = open * (0.15 + 0.85 * day) * bridge;
      lampCol[LAMP.DOOR].set(daylight.r, daylight.g, daylight.b).multiplyScalar(2.2 * k);
      lampAmb[LAMP.DOOR].set(daylight.r, daylight.g, daylight.b).multiplyScalar(0.18 * k);
      if (doorSpot) { doorSpot.intensity = 3.2 * k; doorSpot.color.copy(daylight); }
    }
    // FAP screen
    fapT -= dt;
    if (fapFlash > 0) fapFlash -= dt;
    if (fapT <= 0 && fapScreen) {
      fapT = 0.25;
      fapState.mode = mode;
      fapState.flash = fapFlash > 0;
      for (const id of ['L1', 'R1', 'L2', 'R2']) { const d = doors[id]; const f = fapState.doors[id]; f.open = !!d && d.st.k > 0.05; f.armed = !!d && d.armed; }
      tex.fap.draw(fapState);
    }
    // planar mirror only for the lav the player is in (or right in front of)
    camPos.setFromMatrixPosition(app.camera.matrixWorld);
    let best = null, bd = Infinity;
    for (const L of lavs) {
      if (!L.planarMirror) continue;
      tmpBox.copy(L.bounds).expandByScalar(L.state.doorOpen || L.anims.door.value > 0 ? 0.6 : 0.05);
      if (!tmpBox.containsPoint(camPos)) continue;
      const d2 = camPos.distanceToSquared(L.mirrorCenter);
      if (d2 < bd) { bd = d2; best = L; }
    }
    if (best !== activeMirror) {
      for (const L of lavs) {
        const on = L === best;
        if (L.planarMirror) { L.planarMirror.visible = on; L.planarMirror.active = on; }
        L.cheapMirror.visible = !on;
      }
      activeMirror = best;
    }
    for (const p of partList) p.flush();
  }
  app.addUpdate((dt) => update(dt), 40, 'galley');

  // quality changes: mirror resolution
  app.events.on('quality:changed', (qq) => {
    const size = [384, 512, 768, 1024][clamp(qq?.detail ?? 1, 0, 3)];
    for (const L of lavs) L.planarMirror?.setSize(size);
  });

  // ------------------------------------------------------------------------- API
  const doorApi = {};
  for (const [id, d] of Object.entries(doors)) {
    doorApi[id] = {
      id,
      get open() { return d.open; },
      get armed() { return d.armed; },
      get progress() { return d.st.k; },
      setOpen: (open, opts) => setDoorOpen(id, open, opts),
      setArmed: (on, opts) => d.setArmed(on, opts),
    };
  }
  const api = {
    root, materials: M, textures: tex, errors,
    lavs: lavApi,
    doors: doorApi,
    setDoorOpen: (id, open, opts) => setDoorOpen(id, open, opts),
    carts: carts.map((c) => ({ id: c.id, half: c.half, get out() { return c.out; }, setOut: (o) => setCart(c, o) })),
    drawers: drawers.map((d) => ({ id: d.id, get open() { return d.open; }, setOpen: (o) => { d.open = !!o; d.anim.to(d.open ? 1 : 0); play('drawer', d.pos); } })),
    ovens: ovens.map((o) => ({ id: o.id, get open() { return o.open; }, setOpen: (v) => { o.open = !!v; o.anim.to(o.open ? 1 : 0); play('oven_door', o.pos); } })),
    jumpseats: jumpseats.map((j) => ({ id: j.id, get down() { return j.down; }, setDown: (v) => { j.down = !!v; j.anim.to(j.down ? 1 : 0); } })),
    closet: closet ? { get open() { return closet.open; }, setOpen: (v) => closet.setOpen(v) } : null,
    curtains: curtains.map((c) => ({ id: c.id, get open() { return c.open; }, setOpen: (v) => c.setOpen(v) })),
    brewCoffee: (i = 0) => { const c = coffees[i]; if (c) c.brewT = 9; },
    setLightScene,
    lavAt(pos) { return lavApi.find((l) => l.bounds.containsPoint(pos)) || null; },
    /** Snap every animation to its target (tests / skips). */
    finishAnimations() {
      const all = [...carts.map((c) => c.anim), ...drawers.map((d) => d.anim), ...ovens.map((o) => o.anim), ...jumpseats.map((j) => j.anim), ...curtains.map((c) => c.anim)];
      if (closet) all.push(closet.anim);
      for (const L of lavs) all.push(...Object.values(L.anims));
      for (const a of all) a.snap(a.target);
      for (const d of Object.values(doors)) { d.st.k = d.st.target; d.st.armK = d.st.armTarget; d.st.armDelay = 0; d.update(0); d.setOpen(d.st.target > 0.5, { instant: true }); d.setArmed(d.st.armTarget > 0.5, { instant: true }); }
      for (const p of partList) p.flush();
    },
    _internal: { lavs, banks, doors, parts, glowers, staticMeshes, cockpit, closet, realLights, LAMPS },
  };
  return api;
}
