// The walker's body. Never seen directly — only when looking down (jacket
// front, skirt, sheer black tights at the knees, knee-high stiletto boots,
// hands swinging at the edge of view) and as a soft capsule shadow from
// nearby lamps. Voxel parts on a small rig.
//
// Player.js plans the steps (timing on the same phase that triggers the
// heel/toe sounds, world footholds, contact style); here they are posed:
// planted feet stay locked to the ground and roll over the boot (stiletto tip
// → ball → toe, or toe first when stepping back), swing feet travel on arcs,
// 2-bone IK legs, pelvis shift / drop / rotation over the supporting foot,
// a skirt pushed by the thighs that lags turns, and a counter-rotating chest
// with the arm swing.
import * as THREE from 'three';
import { VoxelGrid, Palette, VoxelModel } from '../voxel/VoxelGrid.js';
import { meshModel } from '../voxel/mesher.js';
import { createVoxelMaterial, MCLS } from '../render/voxelMaterial.js';
import { shared } from '../render/shaderlib.js';

const VS = 0.009; // body voxel size (finer than the world: it is seen up close)
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sm = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Boot contact geometry in the ankle frame with the foot flat on the ground
// (x right, y up, z back). Player.js places footsteps with the same numbers.
const ANKLE_H = 0.125; // ankle above the ground
const HEEL_Z = 0.034; // stiletto tip, behind the ankle
const BALL_Z = -0.1; // ball of the foot: the flex point of the boot
const TOE_Z = -0.196; // toe tip
const TOE_UP = 0.011; // toe spring
// gait shape
const DS = 0.2; // double support after each contact (steps); must match Player.js
const HS_ANGLE = 0.2; // toe-up at heel strike
const LAT_ANGLE = 0.1; // heel-up when a side step lands on the ball
const BACK_ANGLE = 0.26; // heel-up when a backward step lands on the toe
const PELVIS_Y = 0.926; // standing pelvis height (legs nearly straight)
const HIP_X = 0.082, HIP_Y = -0.015;

function palette() {
  const P = new Palette();
  P.add('leather', { color: [27, 25, 26], rough: 0.32, cls: MCLS.LEATHER, vari: 0.08 });
  P.add('leatherCrease', { color: [14, 13, 14], rough: 0.45, cls: MCLS.LEATHER, vari: 0.05 });
  P.add('fabric', { color: [11, 11, 13], rough: 0.88, cls: MCLS.FABRIC, vari: 0.06 });
  P.add('nylon', { color: [20, 16, 15], rough: 0.5, cls: MCLS.NYLON, vari: 0.0 });
  P.add('boot', { color: [12, 11, 12], rough: 0.24, cls: MCLS.LEATHER, vari: 0.05 });
  P.add('bootCrease', { color: [7, 7, 8], rough: 0.36, cls: MCLS.LEATHER, vari: 0.04 });
  P.add('sole', { color: [10, 9, 9], rough: 0.7, cls: MCLS.RUBBER, vari: 0.04 });
  P.add('zip', { color: [120, 116, 108], rough: 0.3, metal: 0.9, cls: MCLS.GENERIC, vari: 0.05 });
  P.add('skin', { color: [196, 150, 128], rough: 0.55, cls: MCLS.SKIN, vari: 0.03 });
  P.add('nail', { color: [92, 24, 30], rough: 0.25, cls: MCLS.GENERIC, vari: 0.02 });
  P.add('ring', { color: [170, 150, 110], rough: 0.25, metal: 1, cls: MCLS.GENERIC, vari: 0.0 });
  return P;
}

/** Generic tapered elliptical tube along -Y from y=0 to y=-len (in meters). rx/rz(t) functions. */
function tube(len, rxf, rzf, matf, pad = 0.02) {
  const maxR = 0.2;
  const W = Math.ceil((maxR * 2) / VS), H = Math.ceil((len + pad) / VS), D = W;
  const g = new VoxelGrid(W, H, D);
  for (let j = 0; j < H; j++) {
    const y = -(j + 0.5) * VS; // 0 .. -len
    const t = -y / len;
    if (t > 1) continue;
    const rx = rxf(t), rz = rzf(t);
    for (let k = 0; k < D; k++)
      for (let i = 0; i < W; i++) {
        const x = (i + 0.5) * VS - maxR, z = (k + 0.5) * VS - maxR;
        const e = (x / rx) ** 2 + (z / rz) ** 2;
        if (e <= 1) {
          const m = matf(t, x, z, e);
          if (m) g.set(i, H - 1 - j, k, m);
        }
      }
  }
  // origin so that grid top (y index H) sits at y=0
  return { g, origin: [-maxR, -H * VS, -maxR] };
}

// ── boot: stiletto heel, rounded almond toe, split at the ball so the toe box can flex ──
// Profiles along u = -z (forward from the ankle), foot flat.
const soleY = (u) => {
  if (u <= -0.005) return -0.047; // heel seat
  if (u < 0.075) return -0.047 - 0.078 * sm(-0.005, 0.075, u); // arch
  if (u <= 0.15) return -ANKLE_H; // forefoot on the ground
  return -ANKLE_H + TOE_UP * ((u - 0.15) / 0.046) ** 2; // toe spring
};
const topY = (u) => {
  let y;
  if (u <= 0.03) y = 0.03; // ankle (inside the shaft)
  else if (u <= 0.13) y = 0.03 - 0.113 * (1 - (1 - (u - 0.03) / 0.1) ** 1.6); // instep
  else y = -0.083 - 0.004 * ((u - 0.13) / 0.066);
  // rounded nose in profile
  if (u > 0.16) {
    const yb = soleY(u);
    y = yb + (y - yb) * Math.sqrt(Math.max(0, 1 - ((u - 0.16) / 0.036) ** 2));
  }
  return y;
};
const halfW = (u) => {
  if (u < -0.02) return 0.031 * Math.sqrt(Math.max(0, 1 - ((u + 0.02) / 0.038) ** 2)); // round heel cup
  if (u < 0.03) return 0.031;
  if (u < 0.1) return 0.031 + 0.0105 * sm(0.03, 0.1, u);
  if (u < 0.13) return 0.0415;
  // almond-round toe: a superellipse cap, wide well into the front
  const a = (u - 0.13) / (-TOE_Z - 0.13);
  return a >= 1 ? 0 : 0.0415 * (1 - a ** 2.3) ** (1 / 2.3);
};

function bootVoxel(x, y, z, sx, M) {
  const u = -z;
  // stiletto: tapers from the heel seat to a small top lift under the heel bone
  if (u < 0.0 && y < -0.04) {
    const t = clamp((-0.047 - y) / (ANKLE_H - 0.047), 0, 1);
    const cu = -0.041 + 0.007 * t;
    const hx = 0.0135 - 0.008 * t, hu = 0.0165 - 0.011 * t;
    if (Math.abs(x) <= hx && Math.abs(u - cu) <= hu && y > -ANKLE_H) return y < -ANKLE_H + VS ? M.sole : M.boot;
  }
  if (u < -0.058 || u > -TOE_Z) return 0;
  // ankle: a rounded block that keeps the joint with the shaft closed as the foot rotates
  const ae = (x / 0.036) ** 2 + (y / 0.052) ** 2 + ((u - 0.004) / 0.042) ** 2;
  const yb = soleY(u), yt = topY(u);
  if (y < yb) return 0;
  const hw = halfW(u);
  const cx = -sx * 0.005 * sm(0.1, 0.19, u); // toe apex sits toward the big toe
  const xr = (x - cx) / Math.max(hw, 1e-4);
  let inside = false;
  if (hw > 0 && y <= yt && Math.abs(xr) <= 1) {
    const yc = yb + 0.45 * (yt - yb);
    inside = y <= yc || xr * xr + ((y - yc) / (yt - yc)) ** 2 <= 1;
  }
  if (!inside && !(ae <= 1 && y >= yb)) return 0;
  if (y < yb + VS) return M.sole;
  // a crease across the vamp where the boot flexes
  if (Math.abs(u - 0.104) < 0.0046 && y > yt - 0.012) return M.crease;
  return M.boot;
}

function bootGrids(P, sx) {
  const M = { boot: P.get('boot'), sole: P.get('sole'), crease: P.get('bootCrease') };
  const KT = 12; // voxel rows ahead of the flex line (toe box)
  const ox = -0.054, oy = -ANKLE_H, oz = BALL_Z - KT * VS;
  const W = 12, H = 18, D = 30;
  const foot = new VoxelGrid(W, H, D - KT), toe = new VoxelGrid(W, H, KT);
  for (let k = 0; k < D; k++)
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const m = bootVoxel(ox + (i + 0.5) * VS, oy + (j + 0.5) * VS, oz + (k + 0.5) * VS, sx, M);
        if (!m) continue;
        if (k < KT) toe.set(i, j, k, m);
        else foot.set(i, j, k - KT, m);
      }
  // foot mesh in the ankle frame; toe mesh in the hinge frame (hinge at the ball, on the ground)
  return { foot, footOrigin: [ox, oy, BALL_Z], toe, toeOrigin: [ox, 0, -KT * VS] };
}

// ── skirt: the thighs push the cloth out, the hem lags sway and turns ──
const SKIRT_LEN = 0.42;
const SKIRT_PARS = /* glsl */ `
uniform vec4 uSkirtLeg[2];
uniform vec4 uSkirtMove;
`;
const SKIRT_VS = /* glsl */ `
{
  float skT = clamp(-transformed.y / ${SKIRT_LEN.toFixed(3)}, 0.0, 1.0);
  vec2 sp = transformed.xz;
  float sr = length(sp);
  vec2 sn = sr > 1e-4 ? sp / sr : vec2(0.0, -1.0);
  float sR = 1.0 / length(vec2(sn.x / (0.142 + 0.07 * skT), sn.y / (0.11 + 0.065 * skT)));
  float sDepth = max(0.0, ${(HIP_Y - 0.12).toFixed(3)} - transformed.y);
  float sPush = -1.0;
  for (int i = 0; i < 2; i++) {
    vec4 L = uSkirtLeg[i];
    vec2 c = L.xy + L.zw * sDepth;
    float need = dot(c, sn) + 0.081 - 0.026 * clamp(sDepth / 0.39, 0.0, 1.0) - sR;
    float h = max(0.03 - abs(need - sPush), 0.0) / 0.03;
    sPush = max(need, sPush) + h * h * 0.0075;
  }
  float h0 = max(0.024 - abs(sPush), 0.0) / 0.024;
  sPush = (max(sPush, 0.0) + h0 * h0 * 0.006) * smoothstep(0.1, 0.6, skT);
  float w2 = skT * skT;
  float tw = uSkirtMove.z * w2;
  float tc = cos(tw), ts = sin(tw);
  sp = vec2(tc * sp.x - ts * sp.y, ts * sp.x + tc * sp.y);
  sp += sn * sPush + uSkirtMove.xy * w2;
  transformed.xz = sp;
  transformed.y += sPush * 0.3 + uSkirtMove.w * w2;
}
`;

function skirtMaterial(uniforms) {
  const mat = createVoxelMaterial({ name: 'skirt', wetScale: 0.3 });
  mat.userData.uniforms.uWetScale.value = 0.25;
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    base.call(mat, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `${SKIRT_PARS}\nvoid main() {`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SKIRT_VS}`);
  };
  const key = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => `${key.call(mat)}-skirt`;
  return mat;
}

export class Body {
  constructor(engine) {
    this.engine = engine;
    this.group = new THREE.Group();
    this.group.name = 'body';
    this.mat = createVoxelMaterial({ name: 'body', wetScale: 0.3 });
    this.mat.userData.uniforms.uWetScale.value = 0.25;
    this.skirtU = {
      uSkirtLeg: { value: [new THREE.Vector4(-HIP_X, 0, 0, 0), new THREE.Vector4(HIP_X, 0, 0, 0)] },
      uSkirtMove: { value: new THREE.Vector4() },
    };
    this.skirtMat = skirtMaterial(this.skirtU);
    const P = (this.P = palette());
    const M = (n) => P.get(n);
    const mesh = (g, origin, mat = this.mat) => {
      const geo = meshModel(new VoxelModel(g, P, VS, origin));
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = false;
      m.receiveShadow = true;
      m.frustumCulled = false;
      return m;
    };

    // ── rig ──
    this.root = new THREE.Group();
    this.pelvis = new THREE.Group();
    this.pelvis.position.set(0, PELVIS_Y, 0);
    this.root.add(this.pelvis);
    this.group.add(this.root);
    // chest: everything above the waist (jacket, shoulders) so it can counter-rotate
    this.chest = new THREE.Group();
    this.chest.position.set(0, 0.12, 0);
    this.pelvis.add(this.chest);

    // torso: fitted leather jacket, hem at the hips, collar/lapels, zip
    {
      const len = 0.52; // from shoulders (top) down to the hem
      const { g, origin } = tube(len,
        (t) => 0.165 - 0.025 * Math.sin(t * Math.PI * 0.9) + (t > 0.82 ? (t - 0.82) * 0.42 : 0),
        (t) => 0.105 + 0.03 * Math.exp(-((t - 0.28) ** 2) / 0.012) - 0.012 * t + (t > 0.85 ? (t - 0.85) * 0.3 : 0),
        (t, x, z, e) => {
          if (e < 0.72 && t > 0.03 && t < 0.97) return 0; // hollow
          if (Math.abs(x) < 0.006 && z < 0 && t > 0.12) return M('zip');
          if (t > 0.3 && Math.abs(Math.abs(x) - 0.09) < 0.005 && z < -0.05) return M('leatherCrease');
          if (Math.abs(t - 0.62) < 0.012 || (t > 0.92)) return M('leatherCrease');
          return M('leather');
        });
      // collar: a slightly raised band at the top
      for (let i = 0; i < g.nx; i++)
        for (let k = 0; k < g.nz; k++) {
          const x = (i + 0.5) * VS - 0.2, z = (k + 0.5) * VS - 0.2;
          const e = (x / 0.075) ** 2 + (z / 0.065) ** 2;
          if (e < 1 && e > 0.55) for (let j = g.ny - 4; j < g.ny + 6 && j < g.ny; j++) g.set(i, j, k, M('leather'));
        }
      const m = mesh(g, origin);
      m.position.set(0, 0.38, 0); // top of jacket at shoulder height above the waist
      this.torso = m;
      this.chest.add(m);
    }

    // skirt: A-line black skirt from the waist to just above the knee
    {
      const { g, origin } = tube(SKIRT_LEN,
        (t) => 0.142 + 0.07 * t,
        (t) => 0.11 + 0.065 * t,
        (t, x, z, e) => {
          if (e < 0.8 && t > 0.02) return 0;
          return M('fabric');
        });
      const m = mesh(g, origin, this.skirtMat);
      m.position.set(0, 0.12, 0); // waist above the hip joints
      this.skirt = m;
      this.pelvis.add(m);
    }

    // legs
    this.legs = {};
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? -1 : 1;
      const hip = new THREE.Group();
      hip.position.set(sx * HIP_X, HIP_Y, 0);
      this.pelvis.add(hip);
      // thigh (hip -> knee), sheer tights
      const thighLen = 0.39;
      {
        const { g, origin } = tube(thighLen + 0.03,
          (t) => 0.072 - 0.026 * t,
          (t) => 0.074 - 0.028 * t,
          (t, x, z, e) => (e < 0.55 ? 0 : M('nylon')));
        hip.add(mesh(g, origin));
      }
      const knee = new THREE.Group();
      knee.position.set(0, -thighLen, 0);
      hip.add(knee);
      // shin + knee-high boot shaft (knee -> ankle), zip on the inner side
      const shinLen = 0.4;
      {
        const { g, origin } = tube(shinLen + 0.005,
          (t) => 0.047 - 0.012 * t + 0.008 * Math.exp(-((t - 0.32) ** 2) / 0.02),
          (t) => 0.05 - 0.014 * t + 0.01 * Math.exp(-((t - 0.3) ** 2) / 0.02),
          (t, x, z, e) => {
            if (e < 0.5) return 0;
            const bootTop = 0.075 + 0.015 * Math.sin(x * 40);
            if (t < bootTop) return M('nylon');
            if (-sx * x > 0 && Math.abs(z) < 0.005 && e > 0.7) {
              // zip: teeth down the inner side, the pull hanging at the top
              if (t < bootTop + 0.035 || t > 0.15) return M('zip');
            }
            if (t < bootTop + 0.014) return M('bootCrease'); // turned edge of the shaft
            return M('boot');
          });
        knee.add(mesh(g, origin));
      }
      const ankle = new THREE.Group();
      ankle.position.set(0, -shinLen, 0);
      knee.add(ankle);
      // foot and flexing toe box
      const b = bootGrids(P, sx);
      ankle.add(mesh(b.foot, b.footOrigin));
      const toe = new THREE.Group();
      toe.position.set(0, -ANKLE_H, BALL_Z);
      ankle.add(toe);
      toe.add(mesh(b.toe, b.toeOrigin));
      const hipLocal = new THREE.Vector3(sx * HIP_X, HIP_Y, 0);
      this.legs[side] = { hip, knee, ankle, toe, thighLen, shinLen, sx, hipLocal };
    }

    // arms (on the chest)
    this.arms = {};
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? -1 : 1;
      const shoulder = new THREE.Group();
      shoulder.position.set(sx * 0.178, 0.345, 0.012);
      this.chest.add(shoulder);
      {
        const { g, origin } = tube(0.3, (t) => 0.048 - 0.01 * t, (t) => 0.05 - 0.01 * t, (t, x, z, e) => (e < 0.5 ? 0 : t > 0.45 && t < 0.5 ? M('leatherCrease') : M('leather')));
        shoulder.add(mesh(g, origin));
      }
      const elbow = new THREE.Group();
      elbow.position.set(0, -0.29, 0);
      shoulder.add(elbow);
      {
        const { g, origin } = tube(0.25, (t) => 0.041 - 0.006 * t, (t) => 0.043 - 0.007 * t, (t, x, z, e) => (e < 0.5 ? 0 : t > 0.9 ? M('leatherCrease') : M('leather')));
        elbow.add(mesh(g, origin));
      }
      const wrist = new THREE.Group();
      wrist.position.set(0, -0.25, 0);
      elbow.add(wrist);
      {
        // hand: rounded palm, four tapered, slightly curled fingers, thumb, nails
        const W = Math.ceil(0.06 / VS), H = Math.ceil(0.2 / VS), D = Math.ceil(0.1 / VS);
        const g = new VoxelGrid(W, H, D);
        const ox = -0.03, oy = -0.2, oz = -0.05;
        const skin = M('skin'), nail = M('nail');
        for (let k = 0; k < D; k++)
          for (let j = 0; j < H; j++)
            for (let i = 0; i < W; i++) {
              const x = ox + (i + 0.5) * VS, y = oy + (j + 0.5) * VS, z = oz + (k + 0.5) * VS;
              // palm: rounded slab, thicker at the heel of the hand
              if (y > -0.095 && y < -0.004) {
                const t = (-y - 0.004) / 0.091;
                const halfT = 0.0135 - 0.003 * t, halfWd = 0.036 - 0.004 * t;
                if ((x / halfT) ** 2 + (z / halfWd) ** 4 <= 1) g.set(i, j, k, skin);
              }
              // fingers: four columns across the width, curling toward the palm side (-x for the inner side)
              const fy = -0.095 - y;
              if (fy > 0 && fy < 0.085) {
                for (let f = 0; f < 4; f++) {
                  const fz = -0.026 + f * 0.0175;
                  const len = [0.072, 0.082, 0.078, 0.06][f];
                  if (fy > len) continue;
                  const curl = (fy / len) ** 2 * 0.018;
                  const r = 0.0085 - 0.002 * (fy / len);
                  if ((x + curl) ** 2 + (z - fz) ** 2 <= r * r) g.set(i, j, k, fy > len - 0.012 && x + curl > 0.0 ? nail : skin);
                }
              }
              // thumb: along the front edge, angled down and inward
              const ty = -0.03 - y;
              if (ty > 0 && ty < 0.06) {
                const cz = 0.036 + ty * 0.15, cx = -0.008 - ty * 0.15;
                if ((x - cx) ** 2 + (z - cz) ** 2 <= 0.009 ** 2) g.set(i, j, k, ty > 0.048 && x - cx > 0.0 ? nail : skin);
              }
            }
        // a thin ring on the left ring finger
        if (side === 'L') {
          const ry = Math.round((-0.112 - oy) / VS), rz = Math.round((0.0265 - oz) / VS);
          for (let i = 0; i < W; i++) for (let k = rz - 1; k <= rz + 1; k++) if (g.get(i, ry, k)) g.set(i, ry, k, P.get('ring'));
        }
        const hm = mesh(g, [ox, oy, oz]);
        // palms face the thighs, fingers forward
        hm.rotation.y = sx > 0 ? Math.PI : 0;
        wrist.add(hm);
      }
      this.arms[side] = { shoulder, elbow, wrist, sx };
    }

    this.engine.scene.add(this.group);
    this._rightArmHidden = false;

    // ── per-frame state (no allocations in update) ──
    const V = () => new THREE.Vector3();
    const foot = () => ({ ankle: V(), theta: 0, yaw: 0, hinge: 0, swinging: false, A0: V(), th0: 0, yaw0: 0, h0: 0, dFwd: 0 });
    this.feet = { L: foot(), R: foot() };
    this.yaw = 0;
    this.started = false;
    this.shift = 0; // pelvis lateral shift (m, body right)
    this.drop = 0; // pelvis lowered to keep the feet within reach
    this.armSwing = 0;
    this.pelvisPrev = V();
    this.pelvisVel = V();
    this.hem = { x: 0, z: 0, vx: 0, vz: 0, tw: 0, vtw: 0, yawPrev: 0, yawVel: 0 };
    this._hipW = { L: V(), R: V() };
    this._knee = V();
    this._v = [V(), V(), V(), V(), V()];
    this._q = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
    this._qPel = new THREE.Quaternion();
    this._qPelInv = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
    this._mInv = new THREE.Matrix4();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  /** The first-person viewmodel arm replaces the body's right arm while it is shown. */
  get rightArmHidden() {
    return this._rightArmHidden;
  }

  set rightArmHidden(v) {
    this._rightArmHidden = !!v;
    this.arms.R.shoulder.visible = !this._rightArmHidden;
  }

  /** Forget motion history (after a teleport). */
  reset() {
    this.started = false;
  }

  /** Toe-up (+) / heel-up (−) angle with which a step meets the ground. Player.js: heel first iff style > 0.35. */
  contactAngle(style, stride) {
    const k = 0.35 + 0.65 * sm(0.04, 0.4, stride); // short steps land flatter
    if (style >= 0.35) return HS_ANGLE * sm(0.35, 0.85, style) * k;
    if (style >= 0.2) return -LAT_ANGLE * (1 - sm(0.2, 0.35, style)) * k;
    return -(LAT_ANGLE + (BACK_ANGLE - LAT_ANGLE) * sm(-0.2, -0.85, style)) * k;
  }

  /** Ankle position of a foot planted at P (ground point under the ankle) rolled by theta about the heel tip (+) or ball (−). */
  footAnkle(P, yaw, theta, out) {
    const pivot = theta >= 0 ? HEEL_Z : BALL_Z;
    const c = Math.cos(theta), s = Math.sin(theta);
    const ay = ANKLE_H * c + pivot * s;
    const az = pivot + ANKLE_H * s - pivot * c;
    return out.set(P.x + az * Math.sin(yaw), P.y + ay, P.z + az * Math.cos(yaw));
  }

  /** Lowest point of the sole below the ankle for a pitch theta and toe hinge (relative y). */
  soleLow(theta, hinge) {
    const c = Math.cos(theta), s = Math.sin(theta);
    const heel = -ANKLE_H * c - HEEL_Z * s;
    const ball = -ANKLE_H * c - BALL_Z * s;
    const toe = ball + TOE_UP * Math.cos(theta + hinge) + (BALL_Z - TOE_Z) * Math.sin(theta + hinge);
    return Math.min(heel, ball, toe);
  }

  /** World quaternion of a bone whose -Y runs from a to b, with -Z toward pole. */
  boneQuat(a, b, pole, out) {
    const Y = this._v[0].subVectors(a, b).normalize();
    const Z = this._v[1].copy(pole).addScaledVector(Y, -pole.dot(Y));
    if (Z.lengthSq() < 1e-8) Z.set(0, 0, -1).addScaledVector(Y, Y.z);
    Z.normalize().negate();
    const X = this._v[2].crossVectors(Y, Z).normalize();
    Z.crossVectors(X, Y);
    this._m.makeBasis(X, Y, Z);
    return out.setFromRotationMatrix(this._m);
  }

  update(dt, player) {
    const g = player.gait;
    dt = Math.min(Math.max(dt, 1e-4), 0.05);
    const first = !this.started || !g.L;
    this.started = true;
    if (!g.L) return;
    const active = g.active ?? 1;

    // ── root: follows the player, body yaw lightly smoothed ──
    this.yaw = first ? g.bodyYaw : this.yaw + wrap(g.bodyYaw - this.yaw) * (1 - Math.exp(-dt / 0.06));
    const yaw = this.yaw;
    this.root.position.set(player.pos.x, player.groundY, player.pos.z);
    this.root.rotation.set(0, yaw, 0);
    const sY = Math.sin(yaw), cY = Math.cos(yaw);
    const fx = -sY, fz = -cY, rx = cY, rz = -sY; // body forward / right
    const px = player.pos.x, pz = player.pos.z;
    const sp = player.speed;
    const mvx = sp > 0.05 ? player.vel.x / sp : 0, mvz = sp > 0.05 ? player.vel.z / sp : 0;

    // ── feet (world), before the pelvis: they only depend on the step plan ──
    for (const side of ['L', 'R']) {
      const F = g[side], st = this.feet[side], other = this.feet[side === 'L' ? 'R' : 'L'];
      const thC = this.contactAngle(F.style, F.stride);
      if (F.swing > 0 && !first) {
        if (!st.swinging) {
          // lift-off: the swing starts exactly from the last stance pose
          st.swinging = true;
          st.A0.copy(st.ankle);
          st.th0 = st.theta;
          st.yaw0 = st.yaw;
          st.h0 = st.hinge;
        }
        const q = F.swing;
        const A1 = this.footAnkle(F.pos, F.yaw, thC, this._v[3]);
        const mj = q * q * q * (10 - 15 * q + 6 * q * q); // minimum-jerk travel
        let ax = st.A0.x + (A1.x - st.A0.x) * mj;
        let az = st.A0.z + (A1.z - st.A0.z) * mj;
        // pass around the standing foot instead of through it
        {
          const dx = A1.x - st.A0.x, dz = A1.z - st.A0.z;
          const L2 = dx * dx + dz * dz;
          const u = L2 > 1e-6 ? clamp(((other.ankle.x - st.A0.x) * dx + (other.ankle.z - st.A0.z) * dz) / L2, 0.15, 0.85) : 0.5;
          const cx = st.A0.x + dx * u - other.ankle.x, cz = st.A0.z + dz * u - other.ankle.z;
          const d = Math.hypot(cx, cz);
          const need = 0.125 - d;
          if (need > 0 && d > 1e-4) {
            const w = need * Math.exp(-(((mj - u) / 0.3) ** 2)) * Math.sin(Math.PI * q);
            ax += (cx / d) * w;
            az += (cz / d) * w;
          }
        }
        // pitch: lift-off roll → slightly toe-down in mid swing → contact angle
        const thMid = F.style > 0.35 ? -0.12 : F.style < -0.2 ? -0.2 : -0.08;
        const theta = (1 - q) * (1 - q) * st.th0 + 2 * q * (1 - q) * thMid + q * q * thC;
        const hinge = st.h0 * (1 - sm(0, 0.4, q));
        const lift = (0.012 + 0.03 * sm(0.05, 0.8, F.stride)) * Math.sin(Math.PI * Math.pow(q, 0.8));
        let ay = st.A0.y + (A1.y - st.A0.y) * sm(0, 1, q) + lift;
        // never through the ground: keep the lowest sole point above it
        const gy = F.from.y + (F.pos.y - F.from.y) * mj;
        const low = ay + this.soleLow(theta, hinge);
        const clear = gy + 0.004 * Math.sin(Math.PI * q);
        if (low < clear) ay += clear - low;
        st.ankle.set(ax, ay, az);
        st.theta = theta;
        st.hinge = hinge;
        st.yaw = st.yaw0 + wrap(F.yaw - st.yaw0) * sm(0.05, 0.85, q);
      } else {
        st.swinging = false;
        // stance: first contact → foot flat (rolling about the first contact point) → heel rise toward toe-off
        const ld = Math.min(1, F.load);
        let theta = thC * (1 - (0.35 * ld + 0.65 * ld * ld));
        const p = g.phase - F.contact;
        const behind = (px - F.pos.x) * mvx + (pz - F.pos.z) * mvz; // how far the body has passed this foot
        if (F.style > -0.2) {
          const hoMax = 0.25 + 0.4 * sm(0.2, 0.8, F.style);
          theta -= hoMax * sm(0.5, 1 + DS, p) * sm(0.06, 0.3, behind) * active;
        } else theta += 0.1 * sm(0.75, 1 + DS, p) * sm(0.04, 0.2, behind) * active;
        // idle: the unloaded leg rests with its heel slightly raised
        const unl = side === 'L' ? Math.max(0, g.weight ?? 0) : Math.max(0, -(g.weight ?? 0));
        theta -= 0.09 * unl * (1 - active);
        st.theta = theta;
        st.hinge = theta < 0 ? -theta : 0;
        st.yaw = F.yaw;
        this.footAnkle(F.pos, F.yaw, theta, st.ankle);
      }
      st.dFwd = (st.ankle.x - px) * fx + (st.ankle.z - pz) * fz;
    }
    const FL = this.feet.L, FR = this.feet.R;

    // ── pelvis: over the supporting foot, lowest just after each contact ──
    const s = g.phase - Math.floor(g.phase);
    const leadR = g.next === 'L'; // the right foot landed last
    const wLead = sm(0, DS, s);
    let wR = leadR ? wLead : 1 - wLead;
    if (g.L.swing > 0) wR = 1;
    else if (g.R.swing > 0) wR = 0;
    wR = wR * active + (0.5 + 0.5 * (g.weight ?? 0)) * (1 - active);
    const wL = 1 - wR;
    const supX = g.L.pos.x * wL + g.R.pos.x * wR - px, supZ = g.L.pos.z * wL + g.R.pos.z * wR - pz;
    const shiftT = clamp((supX * rx + supZ * rz) * 0.34, -0.075, 0.075);
    this.shift = first ? shiftT : this.shift + (shiftT - this.shift) * (1 - Math.exp(-dt / 0.09));
    // obliquity: the unloaded side drops; rotation: the hip of the forward leg leads; tilt: heels
    const amp = clamp(sm(0.04, 1.1, sp) + 0.3 * active, 0, 1);
    const roll = 0.075 * (wR - wL) * (0.45 + 0.55 * amp);
    const heading = g.heading ?? 0;
    const pyaw = clamp((FR.dFwd - FL.dFwd) * 0.17, -0.12, 0.12) + heading * 0.6;
    const pitch = 0.05 + 0.025 * amp;
    const bob = g.bobY ?? 0;
    this.pelvis.position.set(this.shift, PELVIS_Y - 0.016 * amp + bob - this.drop, 0);
    this.pelvis.rotation.set(pitch, pyaw, roll, 'YXZ');
    this.pelvis.updateWorldMatrix(true, false);
    this._qPel.setFromRotationMatrix(this.pelvis.matrixWorld);

    // ── reach: raise the heel of a far trailing foot, then lower the pelvis if a leg still can't reach ──
    let needDrop = 0;
    for (const side of ['L', 'R']) {
      const leg = this.legs[side], st = this.feet[side], F = g[side];
      const hw = this._hipW[side].copy(leg.hipLocal).applyMatrix4(this.pelvis.matrixWorld);
      const Lmax = (leg.thighLen + leg.shinLen) * 0.997;
      if (!st.swinging && hw.distanceTo(st.ankle) > Lmax && st.theta <= 0.02) {
        let lo = Math.min(st.theta, 0), hi = -1.1;
        const A = this._v[4];
        if (hw.distanceTo(this.footAnkle(F.pos, F.yaw, hi, A)) <= Lmax) {
          for (let i = 0; i < 9; i++) {
            const mid = (lo + hi) * 0.5;
            if (hw.distanceTo(this.footAnkle(F.pos, F.yaw, mid, A)) > Lmax) lo = mid;
            else hi = mid;
          }
        }
        st.theta = hi;
        st.hinge = -hi;
        this.footAnkle(F.pos, F.yaw, hi, st.ankle);
      }
      const dx = hw.x - st.ankle.x, dz = hw.z - st.ankle.z, h2 = dx * dx + dz * dz;
      if (h2 < Lmax * Lmax) {
        const reachY = Math.sqrt(Lmax * Lmax - h2);
        const d = hw.y - st.ankle.y - reachY;
        if (d > needDrop) needDrop = d * (st.swinging ? 0.35 : 1);
      }
    }
    const dropT = Math.min(0.05, this.drop + needDrop);
    const relaxed = Math.max(0, this.drop - dt * 0.12); // ease back up slowly
    this.drop = needDrop > 0 ? Math.max(dropT, relaxed) : relaxed;
    if (needDrop > 0 || this.drop > 0) {
      this.pelvis.position.y = PELVIS_Y - 0.016 * amp + bob - this.drop;
      this.pelvis.updateWorldMatrix(true, false);
      for (const side of ['L', 'R']) this._hipW[side].copy(this.legs[side].hipLocal).applyMatrix4(this.pelvis.matrixWorld);
    }
    this._qPelInv.copy(this._qPel).invert();

    // ── legs: two-bone IK toward each ankle, knees over the toes ──
    const qThigh = this._q[0], qShin = this._q[1], qFoot = this._q[2];
    for (const side of ['L', 'R']) {
      const leg = this.legs[side], st = this.feet[side];
      const hipW = this._hipW[side];
      const L1 = leg.thighLen, L2 = leg.shinLen;
      const T = this._v[3].subVectors(st.ankle, hipW);
      let d = T.length();
      d = clamp(d, Math.abs(L1 - L2) + 0.02, (L1 + L2) * 0.9995);
      T.normalize();
      const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      // knee direction: between the foot's heading and the hips' forward
      const pole = this._v[4].set(-Math.sin(st.yaw) * 0.65 + fx * 0.35, 0.05, -Math.cos(st.yaw) * 0.65 + fz * 0.35);
      const bend = pole.addScaledVector(T, -pole.dot(T)).normalize();
      const knee = this._knee.copy(hipW).addScaledVector(T, a).addScaledVector(bend, h);
      const ankleW = this._v[3].copy(hipW).addScaledVector(T, d);
      this.boneQuat(hipW, knee, bend, qThigh);
      this.boneQuat(knee, ankleW, bend, qShin);
      leg.hip.quaternion.copy(this._qPelInv).multiply(qThigh);
      leg.knee.quaternion.copy(qThigh).invert().multiply(qShin);
      this._e.set(st.theta, st.yaw, 0, 'YXZ');
      qFoot.setFromEuler(this._e);
      leg.ankle.quaternion.copy(qShin).invert().multiply(qFoot);
      leg.toe.rotation.set(st.hinge, 0, 0);
    }

    // ── skirt: thighs push the cloth (skirt space), the hem lags sway and turns ──
    {
      const pw = this._v[0].setFromMatrixPosition(this.pelvis.matrixWorld);
      if (first) {
        this.pelvisPrev.copy(pw);
        this.pelvisVel.set(0, 0, 0);
      }
      const vx = (pw.x - this.pelvisPrev.x) / dt, vz = (pw.z - this.pelvisPrev.z) / dt;
      const kv = 1 - Math.exp(-dt / 0.05);
      const ax0 = (vx - this.pelvisVel.x) / dt, az0 = (vz - this.pelvisVel.z) / dt;
      this.pelvisVel.x += (vx - this.pelvisVel.x) * kv;
      this.pelvisVel.z += (vz - this.pelvisVel.z) * kv;
      this.pelvisPrev.copy(pw);
      // acceleration into the body frame (x right, z back)
      const accR = clamp((ax0 * rx + az0 * rz) * kv, -6, 6), accB = clamp(-(ax0 * fx + az0 * fz) * kv, -6, 6);
      const hm = this.hem;
      const w0 = 2 * Math.PI * 1.5, ze = 0.32;
      hm.vx += (-w0 * w0 * hm.x - 2 * ze * w0 * hm.vx - accR * 0.6) * dt;
      hm.vz += (-w0 * w0 * hm.z - 2 * ze * w0 * hm.vz - accB * 0.6) * dt;
      hm.x = clamp(hm.x + hm.vx * dt, -0.035, 0.035);
      hm.z = clamp(hm.z + hm.vz * dt, -0.035, 0.035);
      const wy = yaw + pyaw;
      if (first) hm.yawPrev = wy;
      const yr = wrap(wy - hm.yawPrev) / dt;
      hm.yawPrev = wy;
      const yacc = (yr - hm.yawVel) / dt;
      hm.yawVel += (yr - hm.yawVel) * kv;
      const wt = 2 * Math.PI * 1.2;
      hm.vtw += (-wt * wt * hm.tw - 2 * 0.3 * wt * hm.vtw - clamp(yacc * kv, -40, 40) * 0.5) * dt;
      hm.tw = clamp(hm.tw + hm.vtw * dt, -0.22, 0.22);
      // thighs in skirt space: hip point + horizontal slope per metre of depth
      this.skirt.updateWorldMatrix(false, false);
      this._mInv.copy(this.skirt.matrixWorld).invert();
      const U = this.skirtU.uSkirtLeg.value;
      ['L', 'R'].forEach((side, i) => {
        const leg = this.legs[side];
        const hs = this._v[1].copy(this._hipW[side]).applyMatrix4(this._mInv);
        const ks = this._v[2].copy(leg.hip.position).set(0, -leg.thighLen, 0);
        // knee in skirt space from the solved thigh direction
        ks.applyQuaternion(qThigh.copy(this._qPel).multiply(leg.hip.quaternion)).add(this._hipW[side]).applyMatrix4(this._mInv);
        const dy = Math.max(0.05, hs.y - ks.y);
        U[i].set(hs.x, hs.z, clamp((ks.x - hs.x) / dy, -2.5, 2.5), clamp((ks.z - hs.z) / dy, -2.5, 2.5));
      });
      this.skirtU.uSkirtMove.value.set(hm.x, hm.z, hm.tw, 0);
    }

    // ── chest: counter-rotates the hips, keeps the shoulders level, turns a little toward the view ──
    {
      const view = clamp(wrap((g.viewYaw ?? player.yaw) - yaw), -0.9, 0.9);
      this.chest.position.set(-this.shift * 0.45, 0.12, 0);
      this.chest.rotation.set(-0.025 * amp, -pyaw * 0.85 + view * 0.3, -roll * 0.7 - clamp((g.vl ?? 0) * 0.025, -0.03, 0.03), 'YXZ');
      this.torso.scale.set(1, 1, 1 + 0.008 * Math.sin(player.time * 1.55));
    }

    // ── arms swing against the legs (less when side-stepping) ──
    {
      const swingT = clamp((FR.dFwd - FL.dFwd) * 0.45, -0.26, 0.26) * (0.4 + 0.6 * amp);
      this.armSwing = first ? swingT : this.armSwing + (swingT - this.armSwing) * (1 - Math.exp(-dt / 0.1));
      const spread = clamp(Math.abs(g.vl ?? 0) * 0.06, 0, 0.05);
      for (const side of ['L', 'R']) {
        if (side === 'R' && this._rightArmHidden) continue;
        const arm = this.arms[side];
        const phi = (side === 'L' ? 1 : -1) * this.armSwing;
        arm.shoulder.rotation.set(phi + 0.03, 0, arm.sx * (0.075 + spread + 0.01 * amp), 'XZY');
        arm.elbow.rotation.set(0.2 + 0.32 * Math.max(0, phi) + 0.05 * amp, 0, 0);
        arm.wrist.rotation.set(0.06, 0, -arm.sx * 0.05);
      }
    }
    this.root.updateMatrixWorld(true);

    // capsule shadow: torso + legs
    const pw = this._v[0].setFromMatrixPosition(this.pelvis.matrixWorld);
    shared.uCapsule.value[0].set(pw.x, pw.y + 0.38, pw.z, 0.19);
    shared.uCapsule.value[1].set(pw.x, pw.y - 0.42, pw.z, 0.15);
  }
}

/** Boot contact points (ankle frame, foot flat) — the stiletto tip, the ball and the toe tip. */
Body.CONTACTS = { heel: [0, -ANKLE_H, HEEL_Z], ball: [0, -ANKLE_H, BALL_Z], toe: [0, -ANKLE_H + TOE_UP, TOE_Z] };
