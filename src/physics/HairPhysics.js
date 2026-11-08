import * as THREE from 'three';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * Secondary motion for hair.  Hanging hair (below the ears) is analysed into
 * up to three strand chains (back mass, left and right locks).  Each chain is
 * a Verlet rope pinned to the head with a shape-restoring spring, gravity,
 * damping and collisions against head, neck, shoulders and back.  Chain
 * joints drive dynamic bones that the hair mesh is re-skinned to.
 */
export class HairPhysics {
  constructor(character, mesh) {
    this.c = character;
    this.mesh = mesh;
    this.chains = [];
    const g = mesh.geometry;
    const pos = g.attributes.position;
    const n = pos.count;
    const head = character.restModel.head;
    const yStart = head.y - 0.03;
    const neckZ = head.z - 0.03;
    // classify hanging vertices by azimuth around the neck
    const sectors = { back: [], left: [], right: [] };
    const az = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const a = Math.atan2(x, z - neckZ);
      az[i] = a;
      if (y > yStart) continue;
      const deg = (a * 180) / Math.PI;
      if (Math.abs(deg) > 110) sectors.back.push(i);
      else if (deg > 0) sectors.left.push(i);
      else sectors.right.push(i);
    }
    const hanging = sectors.back.length + sectors.left.length + sectors.right.length;
    if (hanging < n * 0.04) return; // short hair / updo: rigid

    const bones = [...character.skeleton.bones];
    const inverses = [...character.skeleton.boneInverses];
    const headIndex = bones.indexOf(character.bones.head);
    const chainOf = new Int16Array(n).fill(-1);
    for (const [name, list] of Object.entries(sectors)) {
      if (list.length < n * 0.03) continue;
      let ymin = Infinity;
      for (const i of list) ymin = Math.min(ymin, pos.getY(i));
      const len = yStart - ymin;
      if (len < 0.05) continue;
      const segs = len > 0.25 ? 5 : len > 0.12 ? 4 : 3;
      const joints = [];
      for (let k = 0; k <= segs; k++) {
        const y = yStart - (len * k) / segs;
        let sx = 0, sz = 0, c = 0;
        for (const i of list) {
          if (Math.abs(pos.getY(i) - y) < Math.max(0.03, len / segs * 0.6)) { sx += pos.getX(i); sz += pos.getZ(i); c++; }
        }
        if (!c) { const pj = joints[joints.length - 1]; joints.push(pj ? pj.clone().setY(y) : new THREE.Vector3(0, y, neckZ - 0.06)); continue; }
        joints.push(new THREE.Vector3(sx / c, y, sz / c));
      }
      // root sits a little inside the head so the hair pivots near the scalp
      joints[0].lerp(new THREE.Vector3(0, yStart + 0.04, head.z - 0.02), 0.5);
      const chain = { name, joints, segs, ymin, len, boneIndex: [], bones: [] };
      for (let k = 0; k <= segs; k++) {
        const b = new THREE.Bone();
        b.name = `hair_${name}_${k}`;
        character.model.add(b);
        b.position.copy(joints[k]);
        chain.boneIndex.push(bones.length);
        chain.bones.push(b);
        bones.push(b);
        inverses.push(new THREE.Matrix4().makeTranslation(-joints[k].x, -joints[k].y, -joints[k].z));
      }
      for (const i of list) chainOf[i] = this.chains.length;
      this.chains.push(chain);
    }
    if (!this.chains.length) return;

    // re-skin: head above, chain joints below with smooth transition
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    for (let i = 0; i < n; i++) {
      const y = pos.getY(i);
      let ci = chainOf[i];
      if (ci < 0) {
        // vertices just above the hang line follow the nearest chain partially
        if (y > yStart + 0.04) continue;
        let best = -1, bd = 1e9;
        this.chains.forEach((ch, k) => { const d = Math.abs(az[i] - Math.atan2(ch.joints[1].x, ch.joints[1].z - neckZ)); if (d < bd) { bd = d; best = k; } });
        ci = best;
      }
      const ch = this.chains[ci];
      const t = clamp((yStart - y) / ch.len, 0, 1) * ch.segs;
      const k = Math.min(ch.segs - 1, Math.floor(t));
      const f = t - k;
      const top = smoothstep(yStart + 0.04, yStart - 0.04, y);   // 0 near scalp
      const wHead = 1 - top;
      const wa = top * (1 - f), wb = top * f;
      si.setXYZW(i, headIndex, ch.boneIndex[k], ch.boneIndex[k + 1], 0);
      sw.setXYZW(i, wHead, wa, wb, 0);
    }
    si.needsUpdate = sw.needsUpdate = true;
    this.skeleton = new THREE.Skeleton(bones, inverses);
    mesh.bind(this.skeleton, mesh.bindMatrix);

    // simulation state (world space)
    for (const ch of this.chains) {
      ch.p = ch.joints.map((j) => j.clone());
      ch.prev = ch.joints.map((j) => j.clone());
      ch.restLen = [];
      for (let k = 1; k <= ch.segs; k++) ch.restLen.push(ch.joints[k].distanceTo(ch.joints[k - 1]));
    }
    this.initialised = false;
    this.colliders = [
      { bone: 'head', p: new THREE.Vector3(0, head.y + 0.085, head.z - 0.005), r: 0.098 },
      { bone: 'neck_01', p: character.restModel.neck_01.clone().lerp(head, 0.5), r: 0.058 },
      { bone: 'spine_03', p: new THREE.Vector3(0, character.restModel.spine_03.y + 0.17, -0.045), r: 0.105 },
      { bone: 'spine_03', p: new THREE.Vector3(0, character.restModel.spine_03.y + 0.05, -0.06), r: 0.115 },
      { bone: 'spine_02', p: new THREE.Vector3(0, character.restModel.spine_02.y + 0.0, -0.05), r: 0.11 },
      { bone: 'clavicle_l', p: character.restModel.upperarm_l.clone().add(new THREE.Vector3(-0.04, 0.03, -0.01)), r: 0.065 },
      { bone: 'clavicle_r', p: character.restModel.upperarm_r.clone().add(new THREE.Vector3(0.04, 0.03, -0.01)), r: 0.065 },
    ];
    this._m = new THREE.Matrix4();
    this._v = new THREE.Vector3();
    this.boneIdx = Object.fromEntries(character.skeleton.bones.map((b, i) => [b.name, i]));
  }

  get active() { return this.chains.length > 0 && this.skeleton; }

  boneMatrix(name, out) {
    const i = this.boneIdx[name];
    return out.multiplyMatrices(this.c.skeleton.bones[i].matrixWorld, this.c.skeleton.boneInverses[i]);
  }

  update(dt) {
    if (!this.active) return;
    const ch0 = this.c;
    ch0.root.updateMatrixWorld(true);
    const headM = this.boneMatrix('head', new THREE.Matrix4());
    const cols = this.colliders.map((c) => ({ p: c.p.clone().applyMatrix4(this.boneMatrix(c.bone, this._m)), r: c.r }));
    const steps = 2;
    const h = Math.min(dt, 1 / 30) / steps;
    const g = -9.81 * h * h;
    for (const ch of this.chains) {
      // targets: rest chain carried rigidly by the head
      const target = ch.joints.map((j) => j.clone().applyMatrix4(headM));
      if (!this.initialised) { ch.p.forEach((p, k) => p.copy(target[k])); ch.prev.forEach((p, k) => p.copy(target[k])); }
      for (let s = 0; s < steps; s++) {
        ch.p[0].copy(target[0]);
        for (let k = 1; k <= ch.segs; k++) {
          const p = ch.p[k], q = ch.prev[k];
          const vx = (p.x - q.x) * 0.965, vy = (p.y - q.y) * 0.965, vz = (p.z - q.z) * 0.965;
          q.copy(p);
          p.x += vx; p.y += vy + g; p.z += vz;
          // shape memory: pull towards the head-carried rest pose (stronger near the root)
          const stiff = 0.16 * Math.pow(0.72, k - 1);
          p.lerp(target[k], stiff);
        }
        for (let it = 0; it < 3; it++) {
          for (let k = 1; k <= ch.segs; k++) {
            const a = ch.p[k - 1], b = ch.p[k];
            const d = this._v.subVectors(b, a); const l = d.length() || 1e-6;
            const corr = (l - ch.restLen[k - 1]) / l;
            if (k === 1) b.addScaledVector(d, -corr);
            else { a.addScaledVector(d, corr * 0.35); b.addScaledVector(d, -corr * 0.65); }
          }
          for (let k = 1; k <= ch.segs; k++) {
            const p = ch.p[k];
            for (const c of cols) {
              const d = this._v.subVectors(p, c.p); const l = d.length(); const r = c.r + 0.012;
              if (l < r && l > 1e-6) p.addScaledVector(d, (r - l) / l);
            }
          }
        }
      }
    }
    this.initialised = true;
    // write bone transforms (bones are children of the character model)
    const inv = new THREE.Matrix4().copy(this.c.model.matrixWorld).invert();
    const mq = new THREE.Quaternion().setFromRotationMatrix(this.c.model.matrixWorld).invert();
    const headQ = new THREE.Quaternion();
    this.c.bones.head.getWorldQuaternion(headQ);
    for (const ch of this.chains) {
      for (let k = 0; k <= ch.segs; k++) {
        const b = ch.bones[k];
        const kk = Math.min(k, ch.segs - 1);
        const restDir = this._v.subVectors(ch.joints[kk + 1], ch.joints[kk]).normalize().applyQuaternion(headQ);
        const curDir = new THREE.Vector3().subVectors(ch.p[kk + 1], ch.p[kk]).normalize();
        const swing = new THREE.Quaternion().setFromUnitVectors(restDir, curDir);
        const world = swing.multiply(headQ);
        b.quaternion.copy(mq).multiply(world);
        b.position.copy(ch.p[k]).applyMatrix4(inv);
      }
    }
  }
}
