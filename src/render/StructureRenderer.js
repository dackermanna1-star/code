// Static battlefield geometry: buildings (procedural facades), roofs,
// rubble, walls and hedges, props, trees and street furniture. Everything is
// instanced; per-structure state (damage, fire, collapse) updates individual
// instances when the simulation bumps a structure's version. Buildings show
// their damage in stages: breach holes and chipped walls, then a broken
// shell once the roof and upper floors fall in, then an animated collapse
// into a rubble mound with masonry and beams strewn around.

import * as THREE from 'three';
import { buildPropModel } from './models/index.js';
import { ruinGeometry, WallMarks, RubbleField } from './Destruction.js';

const FACADE_VERT = /* glsl */ `
attribute vec4 aFacade; // rgb colour, type id
attribute vec4 aInfo;   // floors, damage, burning, seed
varying vec3 vLocal;
varying vec3 vSize;
varying vec3 vNrm;
varying vec4 vFacade;
varying vec4 vInfo;
`;

const FACADE_FRAG = /* glsl */ `
uniform float uNight;
uniform float uTime;
uniform sampler2D uDetail;
varying vec3 vLocal;
varying vec3 vSize;
varying vec3 vNrm;
varying vec4 vFacade;
varying vec4 vInfo;
float bh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
`;

// Building type ids for the facade shader.
const TYPE_ID = { house: 0, apartment: 1, shop: 2, townhall: 3, church: 4, tower: 5, warehouse: 6, factory: 7, barn: 8, garage: 9, hangar: 10, barracks: 11, hq: 12, bunker: 13, control_tower: 14, silo: 15, farmhouse: 16 };

function facadeMaterial(detailTex) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.02 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = { value: 0 };
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uDetail = { value: detailTex };
    mat.userData.shader = shader;
    shader.vertexShader = FACADE_VERT + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vLocal = position;
      vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
      vNrm = normal;
      vFacade = aFacade;
      vInfo = aInfo;`,
    );
    shader.fragmentShader = FACADE_FRAG + shader.fragmentShader
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 _facadeEmis = vec3(0.0);
        {
        vec3 L = vLocal * vSize;
        vec3 an = abs(vNrm);
        float type = floor(vFacade.w + 0.5);
        float dmg = vInfo.y;
        float seed = vInfo.w;
        vec3 base = vFacade.rgb;
        float u;
        float faceW;
        bool roof = an.y > 0.5;
        if (an.x > 0.5) { u = L.z + vSize.z * 0.5; faceW = vSize.z; }
        else { u = L.x + vSize.x * 0.5; faceW = vSize.x; }
        float v = L.y;
        vec4 det = texture2D(uDetail, (roof ? L.xz : vec2(u, v)) / 4.0 + seed * 7.0);
        vec3 col = base * (0.86 + det.g * 0.28);
        float emis = 0.0;
        vec3 emisCol = vec3(0.0);
        bool industrial = type > 5.5 && type < 7.5 || type > 9.5 && type < 11.5;
        bool noWin = type > 12.5 && type < 13.5 || type > 14.5 && type < 15.5;
        if (roof) {
          col = mix(vec3(0.33, 0.32, 0.3), base * 0.6, 0.35) * (0.8 + det.r * 0.35);
          // Parapet rim.
          float edge = min(min(L.x + vSize.x * 0.5, vSize.x * 0.5 - L.x), min(L.z + vSize.z * 0.5, vSize.z * 0.5 - L.z));
          col = mix(col * 1.25, col, smoothstep(0.25, 0.45, edge));
        } else {
          // Plinth.
          col *= mix(0.7, 1.0, smoothstep(0.4, 0.7, v));
          if (industrial) {
            // Corrugated cladding and a big door on the front.
            col *= 0.9 + 0.1 * sin(u * 18.0);
            if (vNrm.z > 0.5 && abs(u - faceW * 0.5) < min(faceW * 0.3, 6.0) && v < min(vSize.y - 1.0, 5.5)) col = vec3(0.25, 0.27, 0.27) * (0.8 + 0.2 * sin(v * 10.0));
          } else if (!noWin) {
            float floorH = type == 4.0 ? vSize.y : 3.1;
            float fi = floor(v / floorH);
            float fv = fract(v / floorH);
            float nWin = max(1.0, floor(faceW / (type == 1.0 || type == 2.0 || type == 12.0 ? 2.6 : 3.4)));
            float cw = faceW / nWin;
            float ci = floor(u / cw);
            float cu = fract(u / cw);
            float wTop = type == 4.0 ? 0.85 : 0.84;
            float wBot = type == 4.0 ? 0.25 : 0.34;
            float wHalf = type == 4.0 ? 0.12 : 0.27;
            bool shopFront = (type == 1.0 || type == 2.0) && fi < 0.5;
            if (shopFront) { wBot = 0.12; wTop = 0.8; wHalf = 0.42; }
            bool win = fv > wBot && fv < wTop && abs(cu - 0.5) < wHalf && v > 0.6 && v < vSize.y - 0.5;
            bool door = vNrm.z > 0.5 && fi < 0.5 && abs(u - faceW * 0.5) < 0.6 && v < 2.2 && !shopFront;
            if (win) {
              float h = bh(vec3(ci, fi, seed * 31.0 + vNrm.x * 3.0 + vNrm.z * 7.0));
              vec3 glass = vec3(0.05, 0.06, 0.07) + vec3(0.06, 0.08, 0.1) * smoothstep(0.3, 0.9, fv);
              bool broken = dmg > 0.15 && h < dmg;
              col = broken ? vec3(0.02) : glass;
              // Window frame.
              float fr = min(abs(cu - 0.5 - wHalf), abs(cu - 0.5 + wHalf));
              if (fr < 0.03) col = base * 0.9;
              if (!broken && h > 0.55 && uNight > 0.05) {
                emis = uNight * (0.6 + 0.4 * h);
                emisCol = vec3(1.0, 0.72, 0.42);
              }
              if (vInfo.z > 0.5 && h < 0.5) {
                float fl = 0.6 + 0.4 * sin(uTime * 9.0 + h * 40.0) * sin(uTime * 5.3 + h * 17.0);
                emis = 1.6 * fl;
                emisCol = vec3(1.0, 0.45, 0.12);
              }
            } else if (door) {
              col = vec3(0.16, 0.12, 0.09);
            } else if (type == 0.0 || type == 16.0) {
              // Brick/plaster banding on houses.
              col *= 0.95 + 0.05 * step(0.5, fract(v * 3.2));
            }
          } else {
            // Bunkers/silos: concrete pour lines.
            col *= 0.92 + 0.08 * step(0.5, fract(v * 1.4));
          }
        }
        // Soot and scorching from damage.
        float soot = smoothstep(0.35, 0.75, det.a + dmg * 0.9 - 0.4) * dmg;
        col = mix(col, vec3(0.05, 0.045, 0.04), clamp(soot * 1.2, 0.0, 0.85));
        diffuseColor.rgb = col;
        _facadeEmis = emisCol * emis;
        }`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += _facadeEmis;');
  };
  mat.customProgramCacheKey = () => 'facade';
  return mat;
}

function wallMaterial(detailTex) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: detailTex };
    shader.vertexShader = 'attribute float aWallType;\nvarying float vWT;\nvarying vec3 vWL;\nvarying vec3 vWS;\nvarying vec3 vWN;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vWT = aWallType;
      vWS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
      vWL = position * vWS;
      vWN = normal;`,
    );
    shader.fragmentShader = 'uniform sampler2D uDetail;\nvarying float vWT;\nvarying vec3 vWL;\nvarying vec3 vWS;\nvarying vec3 vWN;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
      vec2 uv = abs(vWN.x) > 0.5 ? vWL.zy : vWL.xy;
      if (abs(vWN.y) > 0.5) uv = vWL.xz;
      vec4 d = texture2D(uDetail, uv / 2.5);
      float t = floor(vWT + 0.5);
      vec3 c = diffuseColor.rgb;
      if (t < 0.5) {
        // Dry stone: irregular blocks.
        vec2 b = uv * vec2(2.2, 3.6);
        b.x += floor(b.y) * 0.5;
        float m = min(fract(b.x), fract(b.y));
        c *= (0.75 + d.g * 0.45) * mix(0.55, 1.0, smoothstep(0.02, 0.09, m));
      } else if (t < 1.5) {
        // Hedge: leafy clumps.
        c *= 0.6 + d.r * 0.55 + d.b * 0.25;
      } else if (t < 2.5) {
        // Concrete panels with seams every 3 m.
        float seam = step(0.47, abs(fract(uv.x / 3.0) - 0.5));
        c *= (0.88 + d.g * 0.2) * mix(1.0, 0.7, seam);
      } else {
        // Wooden fence slats.
        c *= (0.8 + d.b * 0.3) * mix(0.55, 1.0, step(0.15, fract(uv.x * 7.0)));
      }
      diffuseColor.rgb = c;
      }`,
    );
  };
  mat.customProgramCacheKey = () => 'walls';
  return mat;
}

function treeMaterial() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWind = { value: new THREE.Vector2(0.5, 0.2) };
    mat.userData.shader = shader;
    shader.vertexShader = 'uniform float uTime;\nuniform vec2 uWind;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        vec3 ip = instanceMatrix[3].xyz;
        float hk = max(0.0, position.y) / 14.0;
        float sway = sin(uTime * 1.3 + ip.x * 0.07 + ip.z * 0.05) * 0.6 + sin(uTime * 2.9 + ip.x * 0.2) * 0.25;
        transformed.xz += uWind * sway * hk * hk * 1.4;
      }`,
    );
  };
  mat.customProgramCacheKey = () => 'trees';
  return mat;
}

// Gable roof: unit prism, ridge along local X, base y=0 spanning -0.5..0.5, ridge at y=1.
function gableGeometry(hip = false) {
  const g = new THREE.BufferGeometry();
  const r = hip ? 0.3 : 0.5; // ridge half-length
  const v = [
    // Slopes
    -0.5, 0, 0.5, 0.5, 0, 0.5, r, 1, 0, -0.5, 0, 0.5, r, 1, 0, -r, 1, 0,
    0.5, 0, -0.5, -0.5, 0, -0.5, -r, 1, 0, 0.5, 0, -0.5, -r, 1, 0, r, 1, 0,
    // Gable ends / hips
    0.5, 0, 0.5, 0.5, 0, -0.5, r, 1, 0,
    -0.5, 0, -0.5, -0.5, 0, 0.5, -r, 1, 0,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

// Half cylinder over the top (y >= 0), axis along local X, spanning z -0.5..0.5 and y 0..1.
function archGeometry() {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 18, 1, false, Math.PI, Math.PI);
  g.rotateZ(-Math.PI / 2);
  g.scale(1, 2, 1);
  return g;
}

function spireGeometry() {
  const g = new THREE.ConeGeometry(0.72, 1, 4, 1);
  g.rotateY(Math.PI / 4);
  g.translate(0, 0.5, 0);
  return g;
}

function rubbleGeometry() {
  const g = new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = Math.sin(x * 23.1 + z * 7.7) * 0.5 + Math.sin(x * 9.3 - z * 17.9) * 0.5;
    p.setXYZ(i, x * (1 + n * 0.12), y * 2 * (0.7 + n * 0.3), z * (1 + n * 0.12));
  }
  g.computeVertexNormals();
  return g;
}

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _axis = new THREE.Vector3();
const _q2 = new THREE.Quaternion();
const rand = Math.random;
const rr = (a, b) => a + (b - a) * rand();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _col = new THREE.Color();
const _sphere = new THREE.Sphere();

export class StructureRenderer {
  constructor(scene, world, detailTex, quality) {
    this.scene = scene;
    this.world = world;
    this.quality = quality;
    this.facadeMat = facadeMaterial(detailTex);
    this.roofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.05 });
    this.rubbleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
    this.wallMat = wallMaterial(detailTex);
    this.propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.1 });
    this.treeMat = treeMaterial();
    this.shadows = !!quality.shadows;
    const list = world.structures.list;
    this.buildings = list.filter((s) => s.kind === 'building');
    this.walls = list.filter((s) => s.kind === 'wall');
    this.props = list.filter((s) => s.kind === 'prop');
    this.buildBuildings();
    this.buildRuins();
    this.buildWalls();
    this.buildProps();
    this.buildTrees(world.map.trees.list);
    this.buildDecorations(world.map.decorations);
    this.lastTreeCam = new THREE.Vector3(1e9, 0, 0);
    this.lastTreeQuat = new THREE.Quaternion();
    this.treeTimer = 0;
  }

  // ------------------------------------------------------------ buildings
  buildBuildings() {
    const B = this.buildings;
    const n = Math.max(1, B.length);
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    this.body = new THREE.InstancedMesh(box, this.facadeMat, n);
    this.body.castShadow = this.shadows;
    this.body.receiveShadow = this.shadows;
    const facade = new Float32Array(n * 4);
    const info = new Float32Array(n * 4);
    this.body.geometry.setAttribute('aFacade', new THREE.InstancedBufferAttribute(facade, 4));
    this.body.geometry.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
    this.facadeArr = facade;
    this.infoArr = info;
    const roofGeos = { gable: gableGeometry(false), hip: gableGeometry(true), arch: archGeometry(), spire: spireGeometry() };
    this.roofs = {};
    for (const [k, g] of Object.entries(roofGeos)) {
      const count = B.filter((s) => s.roof === k).length;
      const mesh = new THREE.InstancedMesh(g, this.roofMat, Math.max(1, count));
      mesh.castShadow = this.shadows;
      mesh.receiveShadow = this.shadows;
      mesh.count = count;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 3), 3);
      this.roofs[k] = { mesh, next: 0 };
      this.scene.add(mesh);
    }
    this.rubble = new THREE.InstancedMesh(rubbleGeometry(), this.rubbleMat, n);
    this.rubble.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    // Instances appear later (collapses), so a precomputed bounding sphere would be wrong.
    this.rubble.frustumCulled = false;
    this.rubble.receiveShadow = this.shadows;
    this.rubble.castShadow = this.shadows;
    B.forEach((s, i) => {
      s._ri = i;
      s._renderVersion = -1;
      _col.set(s.color);
      facade[i * 4] = _col.r;
      facade[i * 4 + 1] = _col.g;
      facade[i * 4 + 2] = _col.b;
      facade[i * 4 + 3] = TYPE_ID[s.type] ?? 0;
      info[i * 4] = s.floors;
      info[i * 4 + 3] = (s.variant % 1000) / 1000;
      if (s.roof in this.roofs) {
        const r = this.roofs[s.roof];
        s._roofIdx = r.next++;
        s._roofMesh = r.mesh;
      }
      this.updateBuilding(s, true);
    });
    this.body.count = B.length;
    this.rubble.count = B.length;
    this.scene.add(this.body, this.rubble);
    this.body.computeBoundingSphere();
  }

  // Ruined shells (three variants), shared facade attributes per instance.
  buildRuins() {
    const B = this.buildings;
    this.ruins = [0, 1, 2].map((v) => {
      const list = B.filter((s) => s.variant % 3 === v);
      const n = Math.max(1, list.length);
      const geo = ruinGeometry(0.17 + v * 0.29);
      const facade = new Float32Array(n * 4);
      const info = new Float32Array(n * 4);
      geo.setAttribute('aFacade', new THREE.InstancedBufferAttribute(facade, 4));
      geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
      const mesh = new THREE.InstancedMesh(geo, this.facadeMat, n);
      mesh.castShadow = this.shadows;
      mesh.receiveShadow = this.shadows;
      mesh.frustumCulled = false;
      list.forEach((s, i) => {
        s._ruinMesh = mesh;
        s._ruinIdx = i;
        mesh.setMatrixAt(i, _zero);
        facade.set(this.facadeArr.subarray(s._ri * 4, s._ri * 4 + 4), i * 4);
        info.set(this.infoArr.subarray(s._ri * 4, s._ri * 4 + 4), i * 4);
      });
      mesh.count = list.length;
      this.scene.add(mesh);
      return { mesh, info };
    });
    this.marks = new WallMarks(this.scene);
    this.rubbleField = new RubbleField(this.scene, this.world.terrain, this.shadows);
    this.collapsing = [];
  }

  // Simulation events: wall hits, breaches, partial and full collapses.
  handle(events) {
    for (const e of events) {
      if (e.t === 'impact' && e.s && (e.s.kind === 'building' || e.s.kind === 'wall') && !e.s.destroyed && e.s.stage < 2) {
        const big = e.size > 1.5;
        this.marks.add(e.s, e.x, e.y, e.z, e.nx, e.ny, e.nz, big ? rr(0.7, 1.1) : rr(0.16, 0.3), big);
      } else if (e.t === 'breach' && !e.s.destroyed && e.s.stage < 2) {
        this.marks.add(e.s, e.x, e.y, e.z, e.nx, e.ny, e.nz, e.r * rr(0.9, 1.3), true);
      } else if (e.t === 'building_ruined') {
        this.marks.clear(e.s);
        this.rubbleField.scatter(e.s, 0.35);
      } else if (e.t === 'building_collapse') {
        const s = e.s;
        this.marks.clear(s);
        if (s._collapse) continue;
        const a = rand() * Math.PI * 2;
        s._collapse = { t: 0, dur: rr(2.2, 3.4) + Math.min(1.5, s.h * 0.05), ruined: s.stage >= 2, tx: Math.cos(a), tz: Math.sin(a), tilt: rr(0.04, 0.14) };
        this.collapsing.push(s);
      }
    }
  }

  // Animate collapsing buildings: the walls drop and lean, the mound grows.
  updateCollapses(dt) {
    for (let k = this.collapsing.length - 1; k >= 0; k--) {
      const s = this.collapsing[k];
      const c = s._collapse;
      c.t += dt;
      const f = Math.min(1, c.t / c.dur);
      const e = f * f;
      const mesh = c.ruined ? s._ruinMesh : this.body;
      const idx = c.ruined ? s._ruinIdx : s._ri;
      const h = (c.ruined ? s.h : s.h) * Math.max(0.03, 1 - 0.97 * e);
      _q.setFromAxisAngle(_up, s.yaw);
      _axis.set(c.tz, 0, -c.tx);
      _q2.setFromAxisAngle(_axis, c.tilt * e);
      _q.premultiply(_q2);
      _p.set(s.x + c.tx * e * 0.6, s.y - e * 0.4, s.z + c.tz * e * 0.6);
      _s.set(s.hx * 2 * (1 + e * 0.05), h, s.hz * 2 * (1 + e * 0.05));
      _m4.compose(_p, _q, _s);
      mesh.setMatrixAt(idx, _m4);
      mesh.instanceMatrix.needsUpdate = true;
      if (s._roofMesh && !c.ruined) {
        if (f > 0.25) s._roofMesh.setMatrixAt(s._roofIdx, _zero);
        else {
          const over = s.roof === 'spire' || s.roof === 'arch' ? 0 : 0.6;
          _p.set(s.x, s.y + h, s.z);
          _s.set(s.hx * 2 + over, s.roofH, s.hz * 2 + over);
          _m4.compose(_p, _q, _s);
          s._roofMesh.setMatrixAt(s._roofIdx, _m4);
        }
        s._roofMesh.instanceMatrix.needsUpdate = true;
      }
      // Rubble rises as the building comes down.
      _q.setFromAxisAngle(_up, s.yaw);
      _p.set(s.x, s.y, s.z);
      _s.set(s.hx * 2.25, Math.max(0.01, s.rubbleH * Math.min(1, f * 1.3)), s.hz * 2.25);
      _m4.compose(_p, _q, _s);
      this.rubble.setMatrixAt(s._ri, _m4);
      this.rubble.instanceMatrix.needsUpdate = true;
      if (f >= 1) {
        s._collapse = null;
        this.collapsing.splice(k, 1);
        this.updateBuilding(s);
        this.rubbleField.scatter(s, 1);
        if (this.onCollapseEnd) this.onCollapseEnd(s);
      }
    }
  }

  updateBuilding(s, init = false) {
    // A collapse in progress is animated by updateCollapses().
    if (s._collapse) return;
    const i = s._ri;
    const destroyed = s.destroyed;
    const ruined = !destroyed && s.stage >= 2 && !!s._ruinMesh;
    _q.setFromAxisAngle(_up, s.yaw);
    _col.set(s.color).multiplyScalar(0.55);
    this.rubble.setColorAt(i, _col);
    if (destroyed) {
      this.body.setMatrixAt(i, _zero);
      _p.set(s.x, s.y, s.z);
      _s.set(s.hx * 2.25, s.rubbleH, s.hz * 2.25);
      _m4.compose(_p, _q, _s);
      this.rubble.setMatrixAt(i, _m4);
    } else if (ruined) {
      // Broken shell over a low heap of what fell inside.
      this.body.setMatrixAt(i, _zero);
      _p.set(s.x, s.y, s.z);
      _s.set(s.hx * 1.9, Math.max(0.8, s.rubbleH * 0.55), s.hz * 1.9);
      _m4.compose(_p, _q, _s);
      this.rubble.setMatrixAt(i, _m4);
    } else {
      _p.set(s.x, s.y, s.z);
      _s.set(s.hx * 2, s.h, s.hz * 2);
      _m4.compose(_p, _q, _s);
      this.body.setMatrixAt(i, _m4);
      this.rubble.setMatrixAt(i, _zero);
    }
    if (s._ruinMesh) {
      if (ruined) {
        _p.set(s.x, s.y, s.z);
        _s.set(s.hx * 2, s.h, s.hz * 2);
        _m4.compose(_p, _q, _s);
        s._ruinMesh.setMatrixAt(s._ruinIdx, _m4);
      } else s._ruinMesh.setMatrixAt(s._ruinIdx, _zero);
      const ri = s._ruinMesh.geometry.getAttribute('aInfo');
      ri.array[s._ruinIdx * 4 + 1] = Math.max(0.7, s.damage);
      ri.array[s._ruinIdx * 4 + 2] = s.burning > 0 ? 1 : 0;
      ri.needsUpdate = true;
      if (!init) s._ruinMesh.instanceMatrix.needsUpdate = true;
    }
    if (s._roofMesh) {
      if (destroyed || ruined) s._roofMesh.setMatrixAt(s._roofIdx, _zero);
      else {
        const over = s.roof === 'spire' || s.roof === 'arch' ? 0 : 0.6;
        _p.set(s.x, s.y + s.h, s.z);
        _s.set(s.hx * 2 + over, s.roofH, s.hz * 2 + over);
        _m4.compose(_p, _q, _s);
        s._roofMesh.setMatrixAt(s._roofIdx, _m4);
        _col.set(s.roofColor).lerp(_col.clone().setRGB(0.05, 0.05, 0.05), s.damage * 0.6);
        s._roofMesh.setColorAt(s._roofIdx, _col);
      }
      s._roofMesh.instanceMatrix.needsUpdate = true;
      if (s._roofMesh.instanceColor) s._roofMesh.instanceColor.needsUpdate = true;
    }
    this.infoArr[i * 4 + 1] = s.damage;
    this.infoArr[i * 4 + 2] = s.burning > 0 ? 1 : 0;
    s._renderVersion = s.version;
    if (!init) {
      this.body.instanceMatrix.needsUpdate = true;
      this.rubble.instanceMatrix.needsUpdate = true;
      if (this.rubble.instanceColor) this.rubble.instanceColor.needsUpdate = true;
      this.body.geometry.getAttribute('aInfo').needsUpdate = true;
    }
  }

  // ------------------------------------------------------------ walls
  buildWalls() {
    const W = this.walls;
    const n = Math.max(1, W.length);
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    this.wallMesh = new THREE.InstancedMesh(box, this.wallMat, n);
    this.wallMesh.castShadow = this.shadows;
    this.wallMesh.receiveShadow = this.shadows;
    const types = new Float32Array(n);
    this.wallMesh.geometry.setAttribute('aWallType', new THREE.InstancedBufferAttribute(types, 1));
    this.wallMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    const T = { stone_wall: 0, hedge: 1, concrete_wall: 2, fence: 3 };
    W.forEach((s, i) => {
      s._ri = i;
      types[i] = T[s.type] ?? 0;
      _col.set(s.color);
      this.wallMesh.setColorAt(i, _col);
      this.updateWall(s);
    });
    this.wallMesh.count = W.length;
    this.scene.add(this.wallMesh);
  }

  updateWall(s) {
    if (s.destroyed) this.wallMesh.setMatrixAt(s._ri, _zero);
    else {
      _q.setFromAxisAngle(_up, s.yaw);
      _p.set(s.x, s.y, s.z);
      _s.set(s.hx * 2, s.h, s.hz * 2);
      _m4.compose(_p, _q, _s);
      this.wallMesh.setMatrixAt(s._ri, _m4);
    }
    s._renderVersion = s.version;
    this.wallMesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ props
  buildProps() {
    this.propMeshes = new Map();
    const key = (s) => (s.destroyed && s.propKind === 'car' ? 'car_wreck|0' : `${s.propKind}|${s.propKind === 'car' || s.propKind === 'rock' ? s.variant : 0}`);
    const counts = new Map();
    for (const s of this.props) {
      for (const k of [key(s), s.propKind === 'car' ? 'car_wreck|0' : null]) {
        if (k) counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    for (const [k, n] of counts) {
      const [kind, variant] = k.split('|');
      let geo;
      try {
        geo = buildPropModel(kind, Number(variant)).lod0;
      } catch (e) {
        geo = new THREE.BoxGeometry(1, 1, 1);
      }
      const mesh = new THREE.InstancedMesh(geo, this.propMat, n);
      mesh.castShadow = this.shadows;
      mesh.receiveShadow = this.shadows;
      mesh.count = 0;
      this.scene.add(mesh);
      this.propMeshes.set(k, mesh);
    }
    this.propKey = key;
    this.rebuildProps();
  }

  rebuildProps() {
    for (const m of this.propMeshes.values()) m.count = 0;
    for (const s of this.props) {
      s._renderVersion = s.version;
      if (s.destroyed && s.propKind !== 'car') continue;
      const mesh = this.propMeshes.get(this.propKey(s));
      if (!mesh) continue;
      _q.setFromAxisAngle(_up, s.yaw);
      _p.set(s.x, s.y, s.z);
      const sc = s.propKind === 'rock' ? 0.8 + (s.variant % 5) * 0.15 : 1;
      _s.set(sc, sc, sc);
      _m4.compose(_p, _q, _s);
      mesh.setMatrixAt(mesh.count++, _m4);
    }
    for (const m of this.propMeshes.values()) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }

  // ------------------------------------------------------------ trees
  buildTrees(trees) {
    const kinds = ['tree_pine', 'tree_broadleaf', 'tree_dead', 'bush'];
    this.trees = trees;
    this.treeBatches = [];
    const counts = new Map();
    for (const t of trees) {
      const k = t.kind * 4 + (t.variant % 4);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    for (const [k, n] of counts) {
      const kind = kinds[Math.floor(k / 4)];
      const variant = k % 4;
      let lods;
      try {
        lods = buildPropModel(kind, variant);
      } catch (e) {
        lods = { lod0: new THREE.ConeGeometry(2, 10, 6).translate(0, 5, 0) };
      }
      const near = new THREE.InstancedMesh(lods.lod0, this.treeMat, n);
      const far = new THREE.InstancedMesh(lods.lod1 || lods.lod0, this.treeMat, n);
      near.castShadow = this.shadows;
      near.receiveShadow = this.shadows;
      far.castShadow = false;
      for (const m of [near, far]) {
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        m.count = 0;
        this.scene.add(m);
      }
      this.treeBatches[k] = { near, far };
    }
    // Precompute standing matrices; group trees by 128 m chunk for culling.
    this.treeMatrices = new Float32Array(trees.length * 16);
    const half = this.world.terrain.half;
    this.treeChunks = new Map();
    trees.forEach((t, i) => {
      this.treeMatrix(t, i);
      const ck = Math.floor((t.x + half) / 128) + Math.floor((t.z + half) / 128) * 64;
      let c = this.treeChunks.get(ck);
      if (!c) {
        c = { list: [], sphere: new THREE.Sphere(new THREE.Vector3(Math.floor((t.x + half) / 128) * 128 - half + 64, t.y + 8, Math.floor((t.z + half) / 128) * 128 - half + 64), 110) };
        this.treeChunks.set(ck, c);
      }
      c.list.push(i);
    });
    this.treeLod = 260 * (this.quality.treeLod ?? 1);
    this.treeMax = 1600 * (this.quality.treeLod ?? 1);
  }

  treeMatrix(t, i) {
    const sc = t.scale;
    _p.set(t.x, t.y, t.z);
    if (t.fall > 0) {
      _axis.set(Math.cos(t.fallYaw), 0, -Math.sin(t.fallYaw));
      _q.setFromAxisAngle(_axis, t.fall * (Math.PI / 2 - 0.1));
      const q2 = new THREE.Quaternion().setFromAxisAngle(_up, t.yaw);
      _q.multiply(q2);
    } else {
      _q.setFromAxisAngle(_up, t.yaw);
    }
    _s.set(sc, sc, sc);
    _m4.compose(_p, _q, _s);
    _m4.toArray(this.treeMatrices, i * 16);
    t._renderVersion = t.version;
  }

  updateTrees(camera, frustum, dt) {
    this.treeTimer -= dt;
    const moved = this.lastTreeCam.distanceToSquared(camera.position) > 64;
    const turned = Math.abs(this.lastTreeQuat.dot(camera.quaternion)) < 0.9995;
    const falling = this.world.fallingTrees && this.world.fallingTrees.length > 0;
    if (!moved && !turned && this.treeTimer > 0 && !falling) return;
    this.treeTimer = 0.4;
    this.lastTreeCam.copy(camera.position);
    this.lastTreeQuat.copy(camera.quaternion);
    for (const b of Object.values(this.treeBatches)) {
      if (!b) continue;
      b.near.count = 0;
      b.far.count = 0;
    }
    const cp = camera.position;
    const lod2 = this.treeLod * this.treeLod;
    const max2 = this.treeMax * this.treeMax;
    const trees = this.trees;
    for (const c of this.treeChunks.values()) {
      const dc = c.sphere.center.distanceToSquared(cp);
      if (dc > (this.treeMax + 150) ** 2) continue;
      _sphere.copy(c.sphere);
      _sphere.radius = 130;
      if (!frustum.intersectsSphere(_sphere)) continue;
      for (const i of c.list) {
        const t = trees[i];
        if (t.version !== t._renderVersion) this.treeMatrix(t, i);
        const dx = t.x - cp.x;
        const dz = t.z - cp.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > max2) continue;
        const b = this.treeBatches[t.kind * 4 + (t.variant % 4)];
        const m = d2 < lod2 || t.fall > 0 ? b.near : b.far;
        m.instanceMatrix.array.set(this.treeMatrices.subarray(i * 16, i * 16 + 16), m.count * 16);
        m.count++;
      }
    }
    for (const b of Object.values(this.treeBatches)) {
      if (!b) continue;
      for (const m of [b.near, b.far]) {
        m.instanceMatrix.clearUpdateRanges();
        m.instanceMatrix.addUpdateRange(0, m.count * 16);
        m.instanceMatrix.needsUpdate = true;
      }
    }
  }

  // ------------------------------------------------------------ decorations
  buildDecorations(decor) {
    this.decorMeshes = [];
    const byKind = new Map();
    for (const d of decor) {
      if (!byKind.has(d.kind)) byKind.set(d.kind, []);
      byKind.get(d.kind).push(d);
    }
    const lampPos = [];
    for (const [kind, list] of byKind) {
      let geo;
      try {
        geo = buildPropModel(kind, 0).lod0;
      } catch (e) {
        geo = new THREE.CylinderGeometry(0.1, 0.12, 8, 5).translate(0, 4, 0);
      }
      const mesh = new THREE.InstancedMesh(geo, this.propMat, list.length);
      list.forEach((d, i) => {
        _q.setFromAxisAngle(_up, d.yaw);
        _p.set(d.x, d.y, d.z);
        _s.set(1, 1, 1);
        _m4.compose(_p, _q, _s);
        mesh.setMatrixAt(i, _m4);
        if (kind === 'street_lamp') lampPos.push([d.x + Math.sin(d.yaw) * 1.2, d.y + 6.7, d.z + Math.cos(d.yaw) * 1.2]);
      });
      mesh.castShadow = this.shadows;
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      this.decorMeshes.push(mesh);
    }
    // Lamp glows (visible at night).
    if (lampPos.length) {
      const g = new THREE.SphereGeometry(0.22, 8, 6);
      this.lampGlow = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 1.6), toneMapped: false }), lampPos.length);
      lampPos.forEach((p, i) => {
        _m4.makeTranslation(p[0], p[1], p[2]);
        this.lampGlow.setMatrixAt(i, _m4);
      });
      this.lampGlow.computeBoundingSphere();
      this.lampGlow.visible = false;
      this.scene.add(this.lampGlow);
      this.lampPositions = lampPos;
    }
  }

  // ------------------------------------------------------------ per frame
  update(camera, frustum, dt, time, night, wind) {
    let props = false;
    for (const s of this.buildings) if (s.version !== s._renderVersion) this.updateBuilding(s);
    for (const s of this.walls) if (s.version !== s._renderVersion) this.updateWall(s);
    for (const s of this.props) if (s.version !== s._renderVersion) props = true;
    if (props) this.rebuildProps();
    const sh = this.facadeMat.userData.shader;
    if (sh) {
      sh.uniforms.uNight.value = night;
      sh.uniforms.uTime.value = time;
    }
    const ts = this.treeMat.userData.shader;
    if (ts) {
      ts.uniforms.uTime.value = time;
      ts.uniforms.uWind.value.set(wind.x * 0.06, wind.z * 0.06);
    }
    if (this.lampGlow) this.lampGlow.visible = night > 0.3;
    this.updateCollapses(dt);
    this.updateTrees(camera, frustum, dt);
  }
}
