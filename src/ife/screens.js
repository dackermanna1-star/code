// =============================================================================
// Seatback display hardware: the LCD panels (one InstancedMesh per screen size),
// the bezel power button + status LED (instanced), and the single unique
// "active" display used by the player's seat (own high-res canvas texture).
//
// The seats module builds the bezel, black glass backing and USB/jack plate and
// provides seat.screenAnchor (+Z faces the passenger, at the bezel lip). The
// LCD sits recessed 1.5 mm behind the anchor plane, in front of that glass.
// =============================================================================
import * as THREE from 'three';

const Z_LCD = -0.0015;
const _m = new THREE.Matrix4();
const _mi = new THREE.Matrix4();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _btn = new THREE.Matrix4();
const LED_ON = new THREE.Color(0.25, 0.75, 1.6);
const LED_STBY = new THREE.Color(1.4, 0.45, 0.08);
const BTN = new THREE.Color(1, 1, 1);

/** Procedural roughness map: glossy glass with faint finger smudges and wipe streaks. */
function smudgeTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = 'rgb(18,18,18)';
  x.fillRect(0, 0, S, S);
  let seed = 1234;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // fingerprints near the lower half (where people tap)
  for (let i = 0; i < 26; i++) {
    const px = S * (0.15 + r() * 0.7), py = S * (0.35 + r() * 0.6), rad = 6 + r() * 10;
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, `rgba(90,90,90,${0.25 + r() * 0.25})`);
    g.addColorStop(1, 'rgba(90,90,90,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(px, py, rad, 0, Math.PI * 2); x.fill();
  }
  // wipe streaks
  x.strokeStyle = 'rgba(60,60,60,0.25)';
  for (let i = 0; i < 6; i++) {
    x.lineWidth = 4 + r() * 10;
    x.beginPath();
    const y0 = r() * S;
    x.moveTo(0, y0); x.bezierCurveTo(S * 0.3, y0 + (r() - 0.5) * 60, S * 0.6, y0 + (r() - 0.5) * 60, S, y0 + (r() - 0.5) * 40);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Plane w×h facing +Z at the LCD depth, with UVs cropped so the canvas (aspect A) fills it without stretching. */
function lcdGeometry(w, h, canvasAspect) {
  const g = new THREE.PlaneGeometry(w, h);
  g.translate(0, 0, Z_LCD);
  const a = w / h;
  const uv = g.attributes.uv;
  let u0 = 0, u1 = 1, v0 = 0, v1 = 1;
  if (a > canvasAspect) { const k = canvasAspect / a; v0 = 0.5 - k / 2; v1 = 0.5 + k / 2; } else if (a < canvasAspect) { const k = a / canvasAspect; u0 = 0.5 - k / 2; u1 = 0.5 + k / 2; }
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
  return g;
}

export function createScreens(app, seats, { sharedTexture, sharedAspect, emissive = 0.9 }) {
  const group = new THREE.Group();
  group.name = 'ife-screens';
  app.cabinRoot.add(group);
  const smudge = smudgeTexture();

  // --- idle screens (instanced, shared attract-mode texture, per-instance power) --------------
  const idleMat = new THREE.MeshStandardMaterial({
    name: 'ife-lcd-idle', color: new THREE.Color(0.012, 0.014, 0.018), roughness: 1, roughnessMap: smudge, metalness: 0,
    emissive: new THREE.Color(1, 1, 1), emissiveMap: sharedTexture, emissiveIntensity: emissive, envMapIntensity: 1.6,
  });
  idleMat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aPower;\nvarying float vPower;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vPower = aPower;');
    sh.fragmentShader = 'varying float vPower;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vPower;');
  };
  idleMat.customProgramCacheKey = () => 'ife-lcd-idle';

  const groups = new Map();   // size key -> { list: [seat], w, h }
  const valid = seats.filter((s) => s && s.screenAnchor && s.screenSize);
  for (const s of valid) {
    const k = `${s.screenSize.w.toFixed(3)}x${s.screenSize.h.toFixed(3)}`;
    if (!groups.has(k)) groups.set(k, { list: [], w: s.screenSize.w, h: s.screenSize.h });
    groups.get(k).list.push(s);
  }
  const bySeat = new Map();
  const meshes = [];
  for (const [k, gdef] of groups) {
    const geo = lcdGeometry(gdef.w, gdef.h, sharedAspect);
    const n = gdef.list.length;
    const power = new Float32Array(n).fill(0);
    geo.setAttribute('aPower', new THREE.InstancedBufferAttribute(power, 1));
    const mesh = new THREE.InstancedMesh(geo, idleMat, n);
    mesh.name = `ife-lcd-${k}`;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    gdef.list.forEach((s, i) => bySeat.set(s.id, { seat: s, mesh, i, power, target: 1, level: 0, active: false, gdef }));
    group.add(mesh);
    meshes.push({ mesh, gdef, power });
  }

  // --- bezel power button + LED (instanced over all seats) ------------------------------------
  const N = valid.length;
  const btnGeo = new THREE.CylinderGeometry(0.0034, 0.0036, 0.0016, 18);
  btnGeo.rotateX(Math.PI / 2);
  const btnMat = new THREE.MeshStandardMaterial({ name: 'ife-power-btn', color: new THREE.Color(0.045, 0.047, 0.05), roughness: 0.38, metalness: 0.2 });
  const buttons = new THREE.InstancedMesh(btnGeo, btnMat, Math.max(1, N));
  buttons.name = 'ife-power-buttons';
  buttons.frustumCulled = false;
  buttons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const ledGeo = new THREE.CircleGeometry(0.0011, 10);
  const ledMat = new THREE.MeshBasicMaterial({ name: 'ife-led', color: 0xffffff, toneMapped: false });
  const leds = new THREE.InstancedMesh(ledGeo, ledMat, Math.max(1, N));
  leds.name = 'ife-leds';
  leds.frustumCulled = false;
  leds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  valid.forEach((s, i) => {
    const e = bySeat.get(s.id);
    e.bi = i;
    const bar = s.cls === 'business' ? 0.018 : 0.016;
    e.btnLocal = new THREE.Matrix4().makeTranslation(s.screenSize.w / 2 - 0.014, -(s.screenSize.h / 2 + 0.002 + bar / 2), 0.0046);
    e.ledLocal = new THREE.Matrix4().makeTranslation(s.screenSize.w / 2 - 0.026, -(s.screenSize.h / 2 + 0.002 + bar / 2), 0.0041);
    leds.setColorAt(i, LED_STBY);
    buttons.setColorAt(i, BTN);
  });
  group.add(buttons, leds);

  // --- the active (player) display ------------------------------------------------------------
  const activeMat = new THREE.MeshStandardMaterial({
    name: 'ife-lcd-active', color: new THREE.Color(0.012, 0.014, 0.018), roughness: 1, roughnessMap: smudge, metalness: 0,
    emissive: new THREE.Color(1, 1, 1), emissiveMap: null, emissiveIntensity: emissive, envMapIntensity: 1.6,
  });
  const active = new THREE.Mesh(new THREE.PlaneGeometry(0.218, 0.136), activeMat);
  active.name = 'ife-active-screen';
  active.visible = false;
  active.castShadow = false;
  let activeEntry = null;

  // screen glow (light cast by the active display onto the seat / tray area)
  let glow = null;
  if ((app.quality?.detail ?? 1) >= 1) {
    glow = new THREE.PointLight(0x9fc4ff, 0, 1.4, 2);
    glow.name = 'ife-screen-glow';
    glow.castShadow = false;
    glow.position.set(0, 0, 0.08);
    active.add(glow);
  }

  function setActive(seatId, texture, aspect) {
    if (activeEntry) { activeEntry.active = false; }
    activeEntry = bySeat.get(seatId) || null;
    if (!activeEntry) { active.visible = false; if (active.parent) active.parent.remove(active); return null; }
    activeEntry.active = true;
    const s = activeEntry.seat;
    active.geometry.dispose();
    active.geometry = lcdGeometry(s.screenSize.w, s.screenSize.h, aspect);
    activeMat.emissiveMap = texture;
    activeMat.needsUpdate = true;
    s.screenAnchor.add(active);
    active.visible = true;
    return active;
  }

  function update(dt) {
    group.updateWorldMatrix(true, false);
    _mi.copy(group.matrixWorld).invert();
    for (const { mesh } of meshes) {
      let changed = false;
      const geoP = mesh.geometry.attributes.aPower;
      for (const e of bySeat.values()) {
        if (e.mesh !== mesh) continue;
        // power fade (LCD backlight ramps quickly; switching off is near-instant)
        const tgt = e.target;
        if (e.level !== tgt) {
          const rate = tgt > e.level ? 2.2 : 6;
          e.level = tgt > e.level ? Math.min(tgt, e.level + rate * dt) : Math.max(tgt, e.level - rate * dt);
          e.power[e.i] = e.level;
          changed = true;
        }
        const anc = e.seat.screenAnchor;
        anc.updateWorldMatrix(true, false);
        _m.multiplyMatrices(_mi, anc.matrixWorld);
        mesh.setMatrixAt(e.i, e.active ? _zero : _m);
        _btn.multiplyMatrices(_m, e.btnLocal);
        buttons.setMatrixAt(e.bi, e.active ? _zero : _btn);
        _btn.multiplyMatrices(_m, e.ledLocal);
        leds.setMatrixAt(e.bi, _btn);
      }
      if (changed) geoP.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
    }
    buttons.instanceMatrix.needsUpdate = true;
    leds.instanceMatrix.needsUpdate = true;
  }

  function setPower(seatId, on) {
    const e = bySeat.get(seatId);
    if (!e) return false;
    e.target = on ? 1 : 0;
    leds.setColorAt(e.bi, on ? LED_ON : LED_STBY);
    if (leds.instanceColor) leds.instanceColor.needsUpdate = true;
    return true;
  }
  function isOn(seatId) { const e = bySeat.get(seatId); return !!e && e.target > 0; }

  return {
    group, active, activeMat, idleMat, glow, buttons, leds, bySeat, meshes, setActive, update, setPower, isOn,
    get activeEntry() { return activeEntry; },
    drawCalls: meshes.length + 3,
  };
}
