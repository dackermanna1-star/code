// Scarlet: a rigged, textured character model drawn as a dummy's body. The ragdoll underneath is
// unchanged (physics, controller, injuries); her mesh is skinned to it. Each bone she has that
// matches a ragdoll segment (pelvis, spine, chest, neck, head, arms, legs) follows that segment's
// body with a fixed offset, worked out once by swinging her A-pose limbs onto the ragdoll's rest
// directions and scaling her to its leg length. Fingers, toes and face ride with their parents.
//
// Base model: Female_Adult_07 from the Microsoft Rocketbox Avatar Library, (c) 2020 Microsoft,
// MIT licence (src/assets/SCARLET_LICENSE-Rocketbox.txt).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import GLB64 from '../assets/scarletGlb.js';

// (the glTF loader turns the spaces in node names into underscores)
const B = (n) => THREE.PropertyBinding.sanitizeNodeName(`Bip01 ${n}`);
/**
 * Bone -> segment. `from`/`to`: ragdoll joints (or a point on a segment) giving the rest direction
 * the bone's own direction (toward `child`) is swung onto; `rigid`: rides with another bone instead.
 */
function mapping(side) {
  const S = side === 'L' ? 'L' : 'R';
  return [
    { bone: B(`${S} UpperArm`), seg: `upperArm${S}`, at: `shoulder${S}`, to: `elbow${S}`, child: B(`${S} Forearm`), fk: true },
    { bone: B(`${S} Forearm`), seg: `forearm${S}`, at: `elbow${S}`, to: `wrist${S}`, child: B(`${S} Hand`) },
    { bone: B(`${S} Hand`), seg: `hand${S}`, at: `wrist${S}`, toSeg: `hand${S}`, child: B(`${S} Finger2`) },
    { bone: B(`${S} Thigh`), seg: `thigh${S}`, at: `hip${S}`, to: `knee${S}`, child: B(`${S} Calf`) },
    { bone: B(`${S} Calf`), seg: `shin${S}`, at: `knee${S}`, to: `ankle${S}`, child: B(`${S} Foot`) },
    { bone: B(`${S} Foot`), seg: `foot${S}`, at: `ankle${S}`, toSeg: `foot${S}`, toOff: [0, -0.02, 0.09], child: B(`${S} Toe0`) },
    { bone: B(`${S} Clavicle`), seg: 'chest', rigid: B('Spine2') },
  ];
}
const MAP = [
  { bone: B('Pelvis'), seg: 'pelvis', at: 'hips' },
  { bone: B('Spine'), seg: 'abdomen', at: 'lumbar', to: 'thoracic', child: B('Spine2'), fk: true },
  { bone: B('Spine1'), seg: 'abdomen', rigid: B('Spine') },
  { bone: B('Spine2'), seg: 'chest', at: 'thoracic', to: 'neckBase', child: B('Neck'), fk: true },
  { bone: B('Neck'), seg: 'neck', at: 'neckBase', to: 'neckTop', child: B('Head'), fk: true },
  { bone: B('Head'), seg: 'head', at: 'neckTop', up: true, fk: true },
  ...mapping('L'),
  ...mapping('R'),
];

let assetPromise = null;
/** Load (once) the model. Resolves to the glTF or null. */
export function loadScarlet() {
  if (!assetPromise) {
    assetPromise = new Promise((resolve) => {
      try {
        const bin = atob(GLB64);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        new GLTFLoader().parse(buf.buffer, '', (gltf) => resolve(gltf), (e) => {
          console.warn('Scarlet model failed to load', e);
          resolve(null);
        });
      } catch (e) {
        console.warn('Scarlet model failed to load', e);
        resolve(null);
      }
    });
  }
  return assetPromise;
}

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
const _m = new THREE.Matrix4();
const v3 = (v) => new THREE.Vector3(v.x, v.y, v.z);

export class ScarletVisual {
  /** gltf: from loadScarlet(); person: the sandbox person (its ragdoll is read at rest). */
  constructor(gltf, person, scene) {
    this.person = person;
    this.scene = scene;
    const root = cloneSkinned(gltf.scene);
    root.updateMatrixWorld(true);
    // (one skinned mesh per material - body, head, hair - all on one skeleton)
    const meshes = [];
    root.traverse((o) => {
      if (o.isSkinnedMesh) meshes.push(o);
    });
    this.meshes = meshes;
    const mesh = meshes[0];
    const bones = mesh.skeleton.bones;
    this.bones = bones;
    const byName = new Map(bones.map((b) => [b.name, b]));
    // rest world transforms (the model as authored) and local transforms
    const restW = new Map(), restL = new Map();
    for (const b of bones) {
      restW.set(b, b.matrixWorld.clone());
      restL.set(b, b.matrix.clone());
    }
    const rpos = (b) => new THREE.Vector3().setFromMatrixPosition(restW.get(b));
    // the ragdoll at rest: segment origins (bindPos, rotation identity) and joint points
    const rd = person.rd, segs = rd.segments;
    const J = {};
    for (const j of rd.jointList) {
      const seg = j.child.userData.segment;
      J[j.name] = v3(seg.bindPos).add(v3(j.anchorC));
    }
    J.hips = J.hipL.clone().add(J.hipR).multiplyScalar(0.5);
    // her size to the ragdoll's: hip to ankle
    const legRag = J.hipL.distanceTo(J.ankleL);
    const legModel = rpos(byName.get(B('L Thigh'))).distanceTo(rpos(byName.get(B('L Foot'))));
    const s = legRag / legModel;
    this.scale = s;
    // aligned rest pose: mapped bones swung onto the ragdoll's rest directions, at its joints
    const aligned = new Map();
    const info = new Map();
    for (const M of MAP) {
      const b = byName.get(M.bone);
      if (!b) continue;
      info.set(b, M);
    }
    const order = [];
    const visit = (o) => {
      if (o.isBone) order.push(o);
      for (const c of o.children) visit(c);
    };
    visit(root);
    const decompose = (m) => {
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      m.decompose(p, q, sc);
      return { p, q };
    };
    for (const b of order) {
      const M = info.get(b);
      if (M && !M.rigid) {
        const { q } = decompose(restW.get(b));
        let swing = new THREE.Quaternion();
        if (M.child || M.up) {
          const from = M.up ? new THREE.Vector3(0, 1, 0) : rpos(byName.get(M.child)).sub(rpos(b)).normalize();
          let to;
          if (M.up) to = new THREE.Vector3(0, 1, 0.12).normalize();
          else if (M.to) to = J[M.to].clone().sub(J[M.at]).normalize();
          else {
            const c = v3(segs[M.toSeg].bindPos);
            if (M.toOff) c.add(new THREE.Vector3(...M.toOff));
            to = c.sub(J[M.at]).normalize();
          }
          swing = new THREE.Quaternion().setFromUnitVectors(from, to);
        }
        // (fk: placed by her own proportions down the chain - her neck is shorter than the
        // ragdoll's, her chest higher - so nothing stretches; the rest sit on the ragdoll's joints)
        const at = M.fk && b.parent && aligned.has(b.parent) ? new THREE.Vector3().setFromMatrixPosition(aligned.get(b.parent).clone().multiply(restL.get(b))) : J[M.at];
        const W = new THREE.Matrix4().compose(at, swing.multiply(q), new THREE.Vector3(s, s, s));
        aligned.set(b, W);
      } else if (M && M.rigid) {
        const ref = byName.get(M.rigid);
        // rides with `rigid`: its rest offset from that bone, in the aligned pose
        const rel = restW.get(ref).clone().invert().multiply(restW.get(b));
        aligned.set(b, aligned.get(ref).clone().multiply(rel));
      } else if (b.parent && aligned.has(b.parent)) aligned.set(b, aligned.get(b.parent).clone().multiply(restL.get(b)));
      else aligned.set(b, restW.get(b).clone()); // (root: unused)
    }
    // per-frame plan: mapped bones from their segment; everyone else from their parent
    this.plan = order.map((b) => {
      const M = info.get(b);
      if (M) {
        const seg = segs[M.seg];
        const segRest = new THREE.Matrix4().makeTranslation(seg.bindPos.x, seg.bindPos.y, seg.bindPos.z);
        return { b, body: seg.body, C: segRest.invert().multiply(aligned.get(b)) };
      }
      return { b, parent: b.parent && b.parent.isBone ? b.parent : null, L: restL.get(b) };
    });
    for (const b of bones) {
      b.matrixAutoUpdate = false;
      b.matrixWorldAutoUpdate = false;
    }
    // draw just the skinned meshes, at the scene's origin (bones are posed in world space)
    for (const m of meshes) {
      m.removeFromParent();
      m.position.set(0, 0, 0);
      m.quaternion.identity();
      m.scale.set(1, 1, 1);
      m.updateMatrix();
      m.updateMatrixWorld(true);
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      const mt = m.material;
      if (mt.map) mt.map.anisotropy = 4;
      if (mt.name === 'Scarlet_Hair') {
        mt.alphaTest = 0.42;
        mt.transparent = false;
        mt.side = THREE.DoubleSide;
      }
      scene.add(m);
    }
    this.update(1);
  }

  /** Pose the bones from the bodies (interpolated by alpha, as the body mesh does). */
  update(alpha = 1) {
    for (const P of this.plan) {
      const w = P.b.matrixWorld;
      if (P.body) {
        const body = P.body, fp = body.framePos || body.pos, p = body.pos;
        _p.set(fp.x + (p.x - fp.x) * alpha, fp.y + (p.y - fp.y) * alpha, fp.z + (p.z - fp.z) * alpha);
        const fr = body.frameRot || body.rot, r = body.rot;
        _q.set(fr.x, fr.y, fr.z, fr.w);
        _q2.set(r.x, r.y, r.z, r.w);
        _q.slerp(_q2, alpha);
        _m.compose(_p, _q, _s);
        w.multiplyMatrices(_m, P.C);
      } else if (P.parent) w.multiplyMatrices(P.parent.matrixWorld, P.L);
    }
  }

  setVisible(on) {
    for (const m of this.meshes) m.visible = on;
  }

  dispose() {
    for (const m of this.meshes) this.scene.remove(m); // (geometry and textures are shared between instances)
  }
}
