// The walker's body. Never seen directly — only when looking down (jacket
// front, skirt, sheer black tights at the knees, knee-high stiletto boots,
// hands swinging at the edge of view) and as a soft capsule shadow from
// nearby lamps. Voxel parts on a small rig, posed procedurally from the same
// gait phase that triggers the heel/toe footstep sounds.
import * as THREE from 'three';
import { VoxelGrid, Palette, VoxelModel } from '../voxel/VoxelGrid.js';
import { meshModel } from '../voxel/mesher.js';
import { createVoxelMaterial, MCLS } from '../render/voxelMaterial.js';
import { shared } from '../render/shaderlib.js';

const VS = 0.009; // body voxel size (finer than the world: it is seen up close)
const TAU = Math.PI * 2;
const sm = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function palette() {
  const P = new Palette();
  P.add('leather', { color: [20, 19, 20], rough: 0.32, cls: MCLS.LEATHER, vari: 0.08 });
  P.add('leatherCrease', { color: [14, 13, 14], rough: 0.45, cls: MCLS.LEATHER, vari: 0.05 });
  P.add('fabric', { color: [16, 16, 18], rough: 0.85, cls: MCLS.FABRIC, vari: 0.06 });
  P.add('nylon', { color: [20, 16, 15], rough: 0.5, cls: MCLS.NYLON, vari: 0.0 });
  P.add('boot', { color: [12, 11, 12], rough: 0.24, cls: MCLS.LEATHER, vari: 0.05 });
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

export class Body {
  constructor(engine) {
    this.engine = engine;
    this.group = new THREE.Group();
    this.group.name = 'body';
    this.mat = createVoxelMaterial({ name: 'body', wetScale: 0.3 });
    this.mat.userData.uniforms.uWetScale.value = 0.25;
    const P = (this.P = palette());
    const M = (n) => P.get(n);
    const mesh = (g, origin) => {
      const geo = meshModel(new VoxelModel(g, P, VS, origin));
      const m = new THREE.Mesh(geo, this.mat);
      m.castShadow = false;
      m.receiveShadow = true;
      m.frustumCulled = false;
      return m;
    };

    // ── rig ──
    this.root = new THREE.Group();
    this.pelvis = new THREE.Group();
    this.pelvis.position.set(0, 0.92, 0);
    this.root.add(this.pelvis);
    this.group.add(this.root);

    // torso: fitted leather jacket, hem at the hips, collar/lapels, zip
    {
      const len = 0.52; // from shoulders (top) down to the hem
      const { g, origin } = tube(len,
        (t) => 0.165 - 0.025 * Math.sin(t * Math.PI * 0.9) + (t > 0.85 ? (t - 0.85) * 0.25 : 0),
        (t) => 0.105 + 0.03 * Math.exp(-((t - 0.28) ** 2) / 0.012) - 0.012 * t,
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
      m.position.set(0, 0.5, 0); // top of jacket at shoulder height above pelvis
      this.torso = m;
      this.pelvis.add(m);
    }

    // skirt: A-line black skirt from the waist to just above the knee
    {
      const len = 0.42;
      const { g, origin } = tube(len,
        (t) => 0.142 + 0.07 * t,
        (t) => 0.11 + 0.065 * t,
        (t, x, z, e) => {
          if (e < 0.8 && t > 0.02) return 0;
          return M('fabric');
        });
      const m = mesh(g, origin);
      m.position.set(0, 0.12, 0); // waist above the hip joints
      this.skirt = m;
      this.pelvis.add(m);
    }

    // legs
    this.legs = {};
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? -1 : 1;
      const hip = new THREE.Group();
      hip.position.set(sx * 0.082, -0.015, 0);
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
      // shin + boot shaft (knee -> ankle)
      const shinLen = 0.4;
      {
        const { g, origin } = tube(shinLen + 0.005,
          (t) => 0.047 - 0.012 * t + 0.008 * Math.exp(-((t - 0.32) ** 2) / 0.02),
          (t) => 0.05 - 0.014 * t + 0.01 * Math.exp(-((t - 0.3) ** 2) / 0.02),
          (t, x, z, e) => {
            if (e < 0.5) return 0;
            const bootTop = 0.075 + 0.015 * Math.sin(x * 40);
            if (t < bootTop) return M('nylon');
            if (Math.abs(x + sx * 0.0) < 0.004 && sx * x < 0.0 && z > -0.01 && z < 0.01) return M('zip');
            if (t < bootTop + 0.02) return M('boot');
            return M('boot');
          });
        // boot shaft is a touch wider than the leg
        const m = mesh(g, origin);
        knee.add(m);
      }
      const ankle = new THREE.Group();
      ankle.position.set(0, -shinLen, 0);
      knee.add(ankle);
      // foot: pointed boot with a stiletto heel. Ground at y = -0.12 (foot flat pose)
      {
        const W = Math.ceil(0.12 / VS), H = Math.ceil(0.14 / VS), D = Math.ceil(0.3 / VS);
        const g = new VoxelGrid(W, H, D);
        const ox = -0.06, oy = -0.125, oz = -0.215; // origin: grid corner relative to ankle
        for (let k = 0; k < D; k++)
          for (let j = 0; j < H; j++)
            for (let i = 0; i < W; i++) {
              const x = ox + (i + 0.5) * VS, y = oy + (j + 0.5) * VS, z = oz + (k + 0.5) * VS;
              // sole line: from heel seat (z=+0.035, y=-0.05) down to ball (z=-0.1, y=-0.115), then flat to toe
              const soleY = z > -0.1 ? -0.115 + ((z + 0.1) / 0.135) * 0.065 : -0.115;
              const topY = z > -0.02 ? 0.02 : -0.04 - ((-0.02 - z) / 0.19) * 0.04;
              // width tapers to a point at the toe
              const halfW = z > -0.12 ? 0.038 : Math.max(0.006, 0.038 * (1 - (-0.12 - z) / 0.085));
              const inFoot = z > -0.205 && z < 0.055 && y > soleY && y < topY && Math.abs(x) < halfW;
              if (inFoot) {
                g.set(i, j, k, y < soleY + 0.009 ? M('sole') : M('boot'));
                continue;
              }
              // stiletto heel: under the heel seat down to the ground
              if (z > 0.018 && z < 0.045 && Math.abs(x) < 0.008 && y <= soleY + 0.005 && y > -0.125) g.set(i, j, k, y < -0.115 ? M('sole') : M('boot'));
            }
        ankle.add(mesh(g, [ox, oy, oz]));
      }
      this.legs[side] = { hip, knee, ankle, thighLen, shinLen, sx };
    }

    // arms
    this.arms = {};
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? -1 : 1;
      const shoulder = new THREE.Group();
      shoulder.position.set(sx * 0.178, 0.465, 0.012);
      this.pelvis.add(shoulder);
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
        // hand: palm + slightly curled fingers + thumb, nails
        const W = Math.ceil(0.07 / VS), H = Math.ceil(0.2 / VS), D = Math.ceil(0.08 / VS);
        const g = new VoxelGrid(W, H, D);
        const ox = -0.035, oy = -0.2, oz = -0.04;
        for (let k = 0; k < D; k++)
          for (let j = 0; j < H; j++)
            for (let i = 0; i < W; i++) {
              const x = ox + (i + 0.5) * VS, y = oy + (j + 0.5) * VS, z = oz + (k + 0.5) * VS;
              // palm
              if (y > -0.1 && y < -0.005 && Math.abs(x) < 0.013 && Math.abs(z) < 0.036) g.set(i, j, k, M('skin'));
              // fingers curl forward
              const fy = -0.1 - y;
              if (fy > 0 && fy < 0.085 && Math.abs(x) < 0.011) {
                const cz = -0.005 - fy * fy * 3.5;
                if (Math.abs(z - cz + 0.004) < 0.034 && Math.abs(z - cz) < 0.034) g.set(i, j, k, fy > 0.078 ? M('nail') : M('skin'));
              }
              // thumb
              if (y > -0.09 && y < -0.035 && x * -1 > -0.022 && Math.abs(x) < 0.02 && z < -0.03 && z > -0.045) g.set(i, j, k, M('skin'));
            }
        if (side === 'L') g.box(Math.floor(W / 2) - 2, Math.floor(H * 0.42), 0, Math.floor(W / 2) + 2, Math.floor(H * 0.42) + 1, D, P.get('ring'));
        const hm = mesh(g, [ox, oy, oz]);
        hm.rotation.y = sx * 0.35;
        wrist.add(hm);
      }
      this.arms[side] = { shoulder, elbow, wrist, sx };
    }

    this.engine.scene.add(this.group);
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  }

  /** Orient `bone` (pivot at a, extending along local -Y) so its tip reaches b, bending toward pole. */
  aim(bone, a, b, pole) {
    const Y = this._v[0].subVectors(a, b).normalize();
    const Zp = this._v[1].copy(pole).addScaledVector(Y, -pole.dot(Y)).normalize().negate();
    const X = this._v[2].crossVectors(Y, Zp).normalize();
    const Z = this._v[3].crossVectors(X, Y);
    this._m.makeBasis(X, Y, Z);
    const wq = this._q.setFromRotationMatrix(this._m);
    const pq = new THREE.Quaternion();
    bone.parent.getWorldQuaternion(pq);
    bone.quaternion.copy(pq.invert().multiply(wq));
  }

  update(dt, player) {
    const g = player.gait;
    const speed = g.speed;
    const amp = sm(0.03, 1.1, speed) + (player.shuffle > 0 ? 0.3 : 0);
    const S = g.stepLen * Math.min(1, amp);
    const phase = g.phase;
    const s = phase - Math.floor(phase);
    const yaw = g.bodyYaw;

    // root follows the player
    this.root.position.set(player.pos.x, player.groundY, player.pos.z);
    this.root.rotation.set(0, yaw, 0);

    // pelvis: bob (lowest at heel strike), lateral shift over the stance foot, rotation and list
    const strideP = ((Math.floor(phase) % 2) + s) / 2; // 0 = left heel strike
    const bob = -0.022 * amp * Math.cos(TAU * s) - 0.004 * amp;
    const lateral = 0.018 * amp * Math.cos(TAU * strideP);
    this.pelvis.position.set(-lateral, 0.905 + bob + (1 - amp) * 0.012, 0.0);
    this.pelvis.rotation.set(0.04 * amp, 0.07 * amp * Math.sin(TAU * strideP), -0.035 * amp * Math.cos(TAU * strideP), 'YXZ');
    // counter-rotate the torso to the pelvis, slight breathing
    this.torso.rotation.set(0.0, -0.06 * amp * Math.sin(TAU * strideP), 0.025 * amp * Math.cos(TAU * strideP));
    this.torso.scale.set(1, 1, 1 + 0.008 * Math.sin(player.time * 1.55));
    this.skirt.rotation.set(-0.03 * amp, 0.03 * amp * Math.sin(TAU * strideP), 0);
    this.root.updateMatrixWorld(true);

    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const up = new THREE.Vector3(0, 1, 0);

    for (const side of ['L', 'R']) {
      const leg = this.legs[side];
      // stride phase for this foot: 0 heel strike, 0..0.62 stance, 0.62..1 swing
      const p = side === 'L' ? strideP : (strideP + 0.5) % 1;
      const stanceEnd = 0.62;
      let fz, lift = 0, pitch = 0;
      if (p < stanceEnd) {
        const q = p / stanceEnd;
        fz = -0.6 * S + 1.2 * S * q; // moves back relative to hips while planted
        // heel strike (toe up) -> foot flat -> heel off
        pitch = 0.16 * amp * (1 - sm(0.0, 0.14, q)) - 0.55 * amp * sm(0.62, 1.0, q);
        lift = 0.0;
      } else {
        const q = (p - stanceEnd) / (1 - stanceEnd);
        const e = q * q * (3 - 2 * q);
        fz = 0.6 * S - 1.2 * S * e;
        lift = 0.07 * amp * Math.sin(Math.PI * q) ** 1.2;
        pitch = -0.5 * amp * (1 - sm(0.0, 0.5, q)) + 0.16 * amp * sm(0.6, 1.0, q);
      }
      // ankle target in world
      const footX = leg.sx * 0.06;
      // heel-off raises the ankle; toe-up at strike raises it slightly as well
      const ankleLift = Math.max(0, -pitch) * 0.11 + Math.max(0, pitch) * 0.02;
      const target = new THREE.Vector3()
        .copy(this.root.position)
        .addScaledVector(right, footX - (side === 'L' ? -1 : 1) * 0.0)
        .addScaledVector(fwd, -fz)
        .add(new THREE.Vector3(0, 0.12 + lift + ankleLift, 0));
      // keep ankles slightly inward ("walking a line" in heels)
      target.addScaledVector(right, -lateral * 0.3);
      const hipW = new THREE.Vector3();
      leg.hip.getWorldPosition(hipW);
      // two-bone IK
      const L1 = leg.thighLen, L2 = leg.shinLen;
      const toT = new THREE.Vector3().subVectors(target, hipW);
      let d = toT.length();
      const maxD = (L1 + L2) * 0.999;
      if (d > maxD) {
        toT.multiplyScalar(maxD / d);
        d = maxD;
        target.copy(hipW).add(toT);
      }
      const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      const dir = toT.clone().normalize();
      const bend = fwd.clone().addScaledVector(dir, -fwd.dot(dir)).normalize();
      const kneeW = hipW.clone().addScaledVector(dir, a).addScaledVector(bend, h);
      this.aim(leg.hip, hipW, kneeW, fwd);
      leg.hip.updateMatrixWorld(true);
      this.aim(leg.knee, kneeW, target, fwd);
      leg.knee.updateMatrixWorld(true);
      // foot: world orientation = body yaw + gait pitch
      const fq = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
      const kq = new THREE.Quaternion();
      leg.knee.getWorldQuaternion(kq);
      leg.ankle.quaternion.copy(kq.invert().multiply(fq));
      leg.ankle.updateMatrixWorld(true);
    }

    // arms swing opposite to the legs
    for (const side of ['L', 'R']) {
      const arm = this.arms[side];
      const p = side === 'L' ? (strideP + 0.5) % 1 : strideP;
      const swing = 0.2 * amp * Math.cos(TAU * p);
      arm.shoulder.rotation.set(-swing - 0.02, 0, arm.sx * (0.07 + 0.02 * amp), 'XZY');
      arm.elbow.rotation.set(-(0.18 + 0.12 * amp * (0.5 + 0.5 * Math.cos(TAU * p))), 0, 0);
      arm.wrist.rotation.set(-0.08, 0, -arm.sx * 0.05);
    }
    this.root.updateMatrixWorld(true);

    // capsule shadow: torso + legs
    const pw = new THREE.Vector3();
    this.pelvis.getWorldPosition(pw);
    shared.uCapsule.value[0].set(pw.x, pw.y + 0.38, pw.z, 0.19);
    shared.uCapsule.value[1].set(pw.x, pw.y - 0.42, pw.z, 0.15);
  }
}
