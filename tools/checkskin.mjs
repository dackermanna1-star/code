import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
const doc = await new NodeIO().read(process.argv[2]);
const r = doc.getRoot();
const skin = r.listSkins()[0];
const joints = skin.listJoints();
const ibm = skin.getInverseBindMatrices().getArray();
let maxErr = 0;
joints.forEach((j, i) => {
  const W = new THREE.Matrix4().fromArray(j.getWorldMatrix());
  const B = new THREE.Matrix4().fromArray(ibm.slice(i * 16, i * 16 + 16));
  const P = W.multiply(B).elements;
  const I = new THREE.Matrix4().elements;
  maxErr = Math.max(maxErr, ...P.map((v, k) => Math.abs(v - I[k])));
});
console.log('joints', joints.length, 'max |W*IBM - I| =', maxErr.toFixed(5));
for (const j of joints) if (/Pelvis|Head$|L Foot|L Hand$/.test(j.getName())) { const m = j.getWorldMatrix(); console.log(j.getName(), [m[12], m[13], m[14]].map(v => +v.toFixed(3))); }
const prim = r.listMeshes()[0].listPrimitives()[0];
const pos = prim.getAttribute('POSITION'); const mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9]; const t = [];
for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, t); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], t[k]); mx[k] = Math.max(mx[k], t[k]); } }
console.log('prim0 bounds', mn.map(v=>+v.toFixed(3)), mx.map(v=>+v.toFixed(3)));
const J = prim.getAttribute('JOINTS_0'), Wt = prim.getAttribute('WEIGHTS_0'); const a=[], b=[];
for (let i = 0; i < 3; i++) { J.getElement(i*500, a); Wt.getElement(i*500, b); console.log('v', i*500, a, b.map(v=>+v.toFixed(2))); }
console.log('mesh node parent ok', r.listNodes().filter(n=>n.getMesh()).map(n=>n.getName()));
