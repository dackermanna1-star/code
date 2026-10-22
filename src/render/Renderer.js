// Top-level renderer: WebGL setup, post-processing (MSAA HDR target, bloom,
// tone mapping, final grading pass with vignette, grain, letterbox and an
// FPV drone feed look), quality presets, and orchestration of every
// sub-renderer for a World.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createParticleAtlas, createDetailTexture } from './textures.js';
import { TerrainRenderer } from './TerrainRenderer.js';
import { SkyRenderer } from './SkyRenderer.js';
import { StructureRenderer } from './StructureRenderer.js';
import { InfantryRenderer } from './InfantryRenderer.js';
import { VehicleRenderer, AircraftRenderer } from './UnitRenderers.js';
import { ProjectileRenderer } from './ProjectileRenderer.js';
import { Effects } from './Effects.js';
import { buildPropModel } from './models/index.js';
import { FACTION_INFO } from '../sim/world.js';

export const QUALITY = {
  low: { label: 'Low', pixelRatio: 0.75, msaa: 0, shadows: false, shadowSize: 1024, shadowRadius: 200, bloom: false, particles: 0.5, terrainLod: 0.7, unitLod: 0.6, treeLod: 0.6, lights: 3 },
  medium: { label: 'Medium', pixelRatio: 1, msaa: 2, shadows: true, shadowSize: 1024, shadowRadius: 220, bloom: true, particles: 0.8, terrainLod: 0.85, unitLod: 0.8, treeLod: 0.8, lights: 4 },
  high: { label: 'High', pixelRatio: 1.25, msaa: 4, shadows: true, shadowSize: 2048, shadowRadius: 300, bloom: true, particles: 1, terrainLod: 1, unitLod: 1, treeLod: 1, lights: 6 },
  ultra: { label: 'Ultra', pixelRatio: 2, msaa: 4, shadows: true, shadowSize: 4096, shadowRadius: 380, bloom: true, particles: 1.4, terrainLod: 1.3, unitLod: 1.4, treeLod: 1.4, lights: 8 },
};

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.035 },
    uLetterbox: { value: 0 },
    uFpv: { value: 0 },
    uFlash: { value: 0 },
    uSat: { value: 1 },
    uRes: { value: new THREE.Vector2(1920, 1080) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uLetterbox;
    uniform float uFpv;
    uniform float uFlash;
    uniform float uSat;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec3 col;
      if (uFpv > 0.0) {
        vec2 c = uv - 0.5;
        float r2 = dot(c, c);
        uv = 0.5 + c * (1.0 - 0.22 * uFpv + 0.42 * uFpv * r2);
        float ca = 0.004 * uFpv;
        col.r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(col, vec3(lum), 0.35 * uFpv);
        col *= 0.92 + 0.08 * sin(uv.y * uRes.y * 1.4 + uTime * 20.0);
        float n = hash(floor(uv * uRes / 2.0) + floor(uTime * 30.0));
        col += (n - 0.5) * 0.16 * uFpv;
        // Occasional signal breakup bands.
        float band = step(0.985, hash(vec2(floor(uv.y * 60.0), floor(uTime * 12.0))));
        col = mix(col, vec3(n), band * 0.6 * uFpv);
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
      } else {
        col = texture2D(tDiffuse, uv).rgb;
      }
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum), col, uSat);
      vec2 vc = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
      float vig = smoothstep(1.05, 0.25, length(vc));
      col *= mix(1.0, vig, uVignette);
      col += (hash(vUv * uRes + fract(uTime) * 100.0) - 0.5) * uGrain;
      col += vec3(uFlash);
      float lb = uLetterbox * 0.115;
      if (vUv.y < lb || vUv.y > 1.0 - lb) col = vec3(0.0);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

class ObjectiveMarkers {
  constructor(scene, world) {
    this.items = [];
    this.world = world;
    for (const o of world.objectives) {
      const seg = 72;
      const pos = new Float32Array((seg + 1) * 2 * 3);
      const alpha = new Float32Array((seg + 1) * 2);
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const x = o.x + Math.cos(a) * o.radius;
        const z = o.z + Math.sin(a) * o.radius;
        const y = world.terrain.heightAt(x, z);
        pos.set([x, y + 0.2, z, x, y + 2.2, z], i * 6);
        alpha[i * 2] = 0.55;
        alpha[i * 2 + 1] = 0;
      }
      const idx = [];
      for (let i = 0; i < seg; i++) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
      g.setIndex(idx);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uPulse: { value: 0 } },
        vertexShader: 'attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 uColor; uniform float uPulse; varying float vA; void main(){ gl_FragColor = vec4(uColor * (1.0 + uPulse), vA * (0.7 + uPulse)); }',
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(g, mat);
      ring.renderOrder = 6;
      scene.add(ring);
      // Beacon column.
      const bg = new THREE.CylinderGeometry(0.9, 0.9, 90, 12, 1, true);
      bg.translate(0, 45, 0);
      const bmat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(1, 1, 1) } },
        vertexShader: 'varying float vY; void main(){ vY = position.y / 90.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 uColor; varying float vY; void main(){ gl_FragColor = vec4(uColor, (1.0 - vY) * 0.35); }',
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const beam = new THREE.Mesh(bg, bmat);
      beam.position.set(o.x, world.terrain.heightAt(o.x, o.z), o.z);
      beam.renderOrder = 6;
      scene.add(beam);
      this.items.push({ o, ring, beam });
    }
    this.colors = [new THREE.Color(FACTION_INFO[0].color), new THREE.Color(FACTION_INFO[1].color), new THREE.Color(0.85, 0.85, 0.8)];
    this.visible = true;
  }

  update(time) {
    for (const it of this.items) {
      const o = it.o;
      const c = o.owner === 0 ? this.colors[0] : o.owner === 1 ? this.colors[1] : this.colors[2];
      it.ring.material.uniforms.uColor.value.copy(c);
      it.beam.material.uniforms.uColor.value.copy(c);
      it.ring.material.uniforms.uPulse.value = o.contested ? 0.5 + 0.5 * Math.sin(time * 6) : 0;
      it.ring.visible = this.visible;
      it.beam.visible = this.visible;
    }
  }
}

class SelectionRing {
  constructor(scene) {
    const g = new THREE.RingGeometry(0.92, 1, 64);
    g.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 0.95, 0.32), transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false }));
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  update(unit, terrain, time) {
    if (!unit || unit.removed || unit.hidden) {
      this.mesh.visible = false;
      return;
    }
    const r = unit.cat === 'inf' ? 1.1 : unit.cat === 'veh' ? unit.spec.length * 0.62 : Math.max(2, unit.spec.length * 0.5);
    const p = unit.pos;
    const g = terrain.heightAt(p.x, p.z);
    this.mesh.position.set(p.x, unit.cat === 'air' ? p.y - 0.5 : g + 0.15, p.z);
    this.mesh.scale.setScalar(r * (1 + 0.04 * Math.sin(time * 5)));
    this.mesh.visible = true;
  }
}

// Faction-coloured unit markers for high views (battle map, free camera far
// above the ground), where soldiers would be smaller than a pixel. Drawn on
// top of everything; size encodes the category.
class UnitMarkers {
  constructor(scene, max = 8000) {
    this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aCol', this.aCol);
    g.setAttribute('aSize', this.aSize);
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uAlpha: { value: 0 }, uScale: { value: 1 } },
      vertexShader: `
        attribute vec3 aCol;
        attribute float aSize;
        uniform float uScale;
        varying vec3 vCol;
        void main() {
          vCol = aCol;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale;
        }`,
      fragmentShader: `
        uniform float uAlpha;
        varying vec3 vCol;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          if (r > 0.5) discard;
          vec3 c = mix(vec3(0.03), vCol, smoothstep(0.46, 0.32, r));
          gl_FragColor = vec4(c, uAlpha * smoothstep(0.5, 0.42, r));
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 30;
    this.points.visible = false;
    scene.add(this.points);
    this.colors = [new THREE.Color(FACTION_INFO[0].color), new THREE.Color(FACTION_INFO[1].color)];
    this.alpha = 0;
  }

  // mode: 'on' (battle map), 'auto' (fade in with altitude) or 'off'.
  update(world, camera, mode, pixelRatio, dt) {
    const h = camera.position.y - world.terrain.heightAt(camera.position.x, camera.position.z);
    const want = mode === 'on' ? 1 : mode === 'auto' ? Math.min(1, Math.max(0, (h - 220) / 200)) : 0;
    this.alpha += (want - this.alpha) * Math.min(1, dt * 6);
    this.points.visible = this.alpha > 0.02;
    if (!this.points.visible) return;
    this.mat.uniforms.uAlpha.value = this.alpha * 0.95;
    this.mat.uniforms.uScale.value = pixelRatio * (h > 1500 ? 0.8 : 1);
    let n = 0;
    const units = world.units;
    for (let i = 0; i < units.length && n < this.max; i++) {
      const u = units[i];
      if (!u.alive || u.hidden || u.dying) continue;
      const c = this.colors[u.faction];
      const k = n * 3;
      this.pos[k] = u.pos.x;
      this.pos[k + 1] = u.pos.y + 2;
      this.pos[k + 2] = u.pos.z;
      const lift = u.cat === 'inf' ? 0 : 0.25;
      this.col[k] = c.r + (1 - c.r) * lift;
      this.col[k + 1] = c.g + (1 - c.g) * lift;
      this.col[k + 2] = c.b + (1 - c.b) * lift;
      this.size[n] = u.cat === 'inf' ? 4 : u.cat === 'veh' ? 8 : u.aclass === 'drone' ? 3 : 7;
      n++;
    }
    this.geo.setDrawRange(0, n);
    for (const a of [this.aPos, this.aCol, this.aSize]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }
}

export class GameRenderer {
  constructor(canvas, qualityName = 'high') {
    this.canvas = canvas;
    this.qualityName = qualityName in QUALITY ? qualityName : 'high';
    this.quality = { ...QUALITY[this.qualityName] };
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = !!this.quality.shadows;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.3, 9000);
    this.atlas = createParticleAtlas();
    this.detail = createDetailTexture();
    this.setupComposer();
    this.frustum = new THREE.Frustum();
    this.projScreen = new THREE.Matrix4();
    this.time = 0;
    this.stats = { calls: 0, tris: 0, soldiers: 0 };
    this.fpv = 0;
    this.letterbox = 0;
    this.flash = 0;
    this.resize();
  }

  setupComposer() {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: this.quality.msaa || 0 });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    if (this.quality.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.5, 0.55, 0.9);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.final.uniforms.uRes.value.set(w * pr, h * pr);
  }

  attachWorld(world) {
    this.world = world;
    const q = this.quality;
    this.sky = new SkyRenderer(this.scene, this.renderer, q);
    this.terrain = new TerrainRenderer(world.terrain, this.scene, this.detail, q);
    this.structures = new StructureRenderer(this.scene, world, this.detail, q);
    let chute = null;
    try {
      chute = buildPropModel('parachute', 0).lod0;
    } catch (e) {
      chute = null;
    }
    this.infantry = new InfantryRenderer(this.scene, q, chute);
    this.vehicles = new VehicleRenderer(this.scene, q);
    this.aircraft = new AircraftRenderer(this.scene, q);
    this.projectiles = new ProjectileRenderer(this.scene);
    this.effects = new Effects(this.scene, world.terrain, this.atlas, q);
    this.markers = new ObjectiveMarkers(this.scene, world);
    this.selection = new SelectionRing(this.scene);
    this.unitMarkers = new UnitMarkers(this.scene);
    this.markerMode = 'auto';
  }

  // Consume simulation events (call once per frame before render()).
  handleEvents(events) {
    this.effects.handle(events, this.world);
  }

  render(dt, simDt, selected = null) {
    const w = this.world;
    const cam = this.camera;
    this.time += dt;
    cam.updateMatrixWorld();
    this.projScreen.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    // Shadow focus: a point ahead of the camera on the ground.
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const focus = cam.position.clone().addScaledVector(fwd, Math.min(220, 40 + Math.max(0, cam.position.y - w.terrain.heightAt(cam.position.x, cam.position.z)) * 0.8));
    focus.y = w.terrain.heightAt(focus.x, focus.z);
    this.sky.update(dt, this.time, cam, w.weather, focus);
    this.renderer.toneMappingExposure = this.sky.exposure;
    this.terrain.update(cam);
    this.structures.update(cam, this.frustum, dt, this.time, this.sky.nightFactor, { x: w.weather.windX, z: w.weather.windZ });
    this.infantry.update(w, cam, this.frustum, simDt);
    this.vehicles.hide = this.hideUnit || null;
    this.vehicles.update(w, cam, this.frustum);
    this.aircraft.update(w, cam, this.frustum, this.time);
    this.projectiles.update(w, cam);
    this.effects.update(simDt, w, cam, this.sky);
    this.markers.update(this.time);
    this.selection.update(selected, w.terrain, this.time);
    this.unitMarkers.update(w, cam, this.markerMode, this.renderer.getPixelRatio(), dt);
    // Final pass parameters.
    const F = this.final.uniforms;
    F.uTime.value = this.time;
    F.uFpv.value = this.fpv;
    F.uLetterbox.value = this.letterbox;
    this.flash = Math.max(this.flash * 0.9, w.weather.flash * 0.08);
    F.uFlash.value = this.flash;
    F.uGrain.value = this.fpv > 0 ? 0.02 : 0.03 + this.sky.nightFactor * 0.025;
    F.uSat.value = 0.92 - w.weather.cloud * 0.12;
    if (this.bloom) this.bloom.strength = 0.42 + this.sky.nightFactor * 0.35;
    this.composer.render(dt);
    const info = this.renderer.info.render;
    this.stats.calls = info.calls;
    this.stats.tris = info.triangles;
    this.stats.soldiers = this.infantry.visibleCount;
  }

  // Camera shake amount produced by nearby explosions this frame.
  get shake() {
    return this.effects ? this.effects.shake : 0;
  }
}
