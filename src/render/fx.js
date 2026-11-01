// Lightweight combat/impact effects: particle bursts (impact sparks + sweat, block sparks,
// knockdown dust, debris), a brief emissive flash on struck characters, and KO stars.
import { BABYLON } from './babylon.js';

function dotTexture(scene, name, inner, outer) {
  const t = new BABYLON.DynamicTexture(name, { width: 64, height: 64 }, scene, false);
  const ctx = t.getContext();
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner); g.addColorStop(0.5, outer); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  t.hasAlpha = true; t.update(false);
  return t;
}
function starTexture(scene) {
  const t = new BABYLON.DynamicTexture('fx_star', { width: 64, height: 64 }, scene, false);
  const ctx = t.getContext();
  ctx.clearRect(0, 0, 64, 64); ctx.fillStyle = '#ffe36b'; ctx.strokeStyle = '#7a5a10'; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 12 : 28; ctx.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  t.hasAlpha = true; t.update(false);
  return t;
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    const spark = dotTexture(scene, 'fx_spark', 'rgba(255,255,240,1)', 'rgba(255,220,140,0.6)');
    const soft = dotTexture(scene, 'fx_soft', 'rgba(255,255,255,0.8)', 'rgba(200,200,200,0.25)');
    this.systems = {
      hit: this._ps('hit', spark, { min: 0.05, max: 0.12, life: [0.08, 0.22], speed: [2, 5], gravity: -6, c1: [1, 0.95, 0.8, 1], c2: [1, 0.7, 0.3, 0.8], blend: BABYLON.ParticleSystem.BLENDMODE_ADD }),
      sweat: this._ps('sweat', soft, { min: 0.025, max: 0.05, life: [0.25, 0.5], speed: [1.5, 3.2], gravity: -9, c1: [0.85, 0.92, 1, 0.9], c2: [0.7, 0.8, 0.95, 0.6], blend: BABYLON.ParticleSystem.BLENDMODE_STANDARD }),
      block: this._ps('block', spark, { min: 0.04, max: 0.09, life: [0.1, 0.2], speed: [2, 4], gravity: -3, c1: [0.7, 0.85, 1, 1], c2: [0.4, 0.6, 1, 0.7], blend: BABYLON.ParticleSystem.BLENDMODE_ADD }),
      dust: this._ps('dust', soft, { min: 0.25, max: 0.55, life: [0.5, 1.0], speed: [0.4, 1.4], gravity: 0.6, c1: [0.62, 0.58, 0.5, 0.45], c2: [0.55, 0.52, 0.46, 0.0], blend: BABYLON.ParticleSystem.BLENDMODE_STANDARD }),
      debris: this._ps('debris', soft, { min: 0.04, max: 0.09, life: [0.4, 0.8], speed: [2, 5], gravity: -12, c1: [0.95, 0.5, 0.15, 1], c2: [0.6, 0.35, 0.15, 1], blend: BABYLON.ParticleSystem.BLENDMODE_STANDARD }),
    };
    this.starTex = starTexture(scene);
    this.stars = new Map();   // character id -> {sprites, c}
    this.flashes = new Map(); // character id -> {mat, t}
    this.starMat = new BABYLON.StandardMaterial('fx_starmat', scene);
    this.starMat.diffuseTexture = this.starTex; this.starMat.emissiveColor = new BABYLON.Color3(1, 0.9, 0.5);
    this.starMat.disableLighting = true; this.starMat.useAlphaFromDiffuseTexture = true; this.starMat.diffuseTexture.hasAlpha = true; this.starMat.backFaceCulling = false;
  }
  _ps(name, tex, o) {
    const ps = new BABYLON.ParticleSystem(`fx_${name}`, 200, this.scene);
    ps.particleTexture = tex;
    ps.emitter = new BABYLON.Vector3(0, -100, 0);
    ps.minEmitBox = new BABYLON.Vector3(-0.05, -0.05, -0.05); ps.maxEmitBox = new BABYLON.Vector3(0.05, 0.05, 0.05);
    ps.minSize = o.min; ps.maxSize = o.max; ps.minLifeTime = o.life[0]; ps.maxLifeTime = o.life[1];
    ps.minEmitPower = o.speed[0]; ps.maxEmitPower = o.speed[1];
    ps.gravity = new BABYLON.Vector3(0, o.gravity, 0);
    ps.color1 = new BABYLON.Color4(...o.c1); ps.color2 = new BABYLON.Color4(...o.c2); ps.colorDead = new BABYLON.Color4(o.c2[0], o.c2[1], o.c2[2], 0);
    ps.blendMode = o.blend;
    ps.direction1 = new BABYLON.Vector3(-1, 0.4, -1); ps.direction2 = new BABYLON.Vector3(1, 1.2, 1);
    ps.emitRate = 0; ps.manualEmitCount = 0;
    ps.start();
    return ps;
  }
  burst(kind, x, y, z, count = 12, dir = null) {
    const ps = this.systems[kind];
    if (!ps) return;
    ps.emitter.set(x, y, z);
    if (dir) { ps.direction1.set(dir[0] - 0.6, 0.2, dir[1] - 0.6); ps.direction2.set(dir[0] + 0.6, 1.0, dir[1] + 0.6); }
    else { ps.direction1.set(-1, 0.2, -1); ps.direction2.set(1, 1.1, 1); }
    ps.manualEmitCount = (ps.manualEmitCount || 0) + count;
  }
  flash(c, strength = 0.5) { if (c.rig) this.flashes.set(c.id, { mat: c.rig.material, t: 0.12, s: strength }); }
  koStars(c, on) {
    if (on && !this.stars.has(c.id) && c.rig) {
      const sprites = [];
      for (let i = 0; i < 3; i++) {
        const p = BABYLON.MeshBuilder.CreatePlane(`star_${c.id}_${i}`, { size: 0.16 }, this.scene);
        p.material = this.starMat; p.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL; p.isPickable = false;
        sprites.push(p);
      }
      this.stars.set(c.id, { sprites, c, t: 0 });
    } else if (!on && this.stars.has(c.id)) { for (const s of this.stars.get(c.id).sprites) s.dispose(); this.stars.delete(c.id); }
  }
  update(dt) {
    for (const [id, f] of this.flashes) {
      f.t -= dt;
      const k = Math.max(0, f.t / 0.12) * f.s;
      f.mat.emissiveColor.set(0.04 + k, 0.035 + k * 0.85, 0.03 + k * 0.7);
      if (f.t <= 0) { f.mat.emissiveColor.set(0.04, 0.035, 0.03); this.flashes.delete(id); }
    }
    for (const st of this.stars.values()) {
      st.t += dt;
      const c = st.c;
      if (c.state !== 'ko') { this.koStars(c, false); continue; }
      // The head of a character lying on their back is ~0.85 m behind the root along -facing.
      const hx = c.x - Math.sin(c.yaw) * 0.85, hz = c.z - Math.cos(c.yaw) * 0.85;
      st.sprites.forEach((s, i) => { const a = st.t * 3 + (i / 3) * Math.PI * 2; s.position.set(hx + Math.cos(a) * 0.22, c.y + 0.45 + Math.sin(st.t * 4 + i) * 0.04, hz + Math.sin(a) * 0.22); });
    }
  }
}
