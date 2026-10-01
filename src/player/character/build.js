// Starting the walker's mesh build in a worker, with the main thread as the
// fallback (no workers, or the worker failed).
import * as THREE from 'three';
import { boneList } from './rig.js';
import BuildWorker from './buildWorker.js?worker&inline';

/** Bone name -> skeleton index, in the order Character creates the bones. */
export const boneIndexMap = () => new Map(boneList().map((b, i) => [b[0], i]));

/** Resolves to { parts: [{ name, geo }], timings } or null (build on the main thread instead). */
export function buildCharacterAsync() {
  return new Promise((resolve) => {
    let w;
    try {
      w = new BuildWorker();
    } catch {
      resolve(null);
      return;
    }
    w.onmessage = (ev) => {
      w.terminate();
      const d = ev.data;
      if (d.error) {
        console.warn('character worker failed', d.error);
        resolve(null);
        return;
      }
      const parts = d.parts.map(({ name, attrs, index }) => {
        const geo = new THREE.BufferGeometry();
        for (const [k, a] of Object.entries(attrs)) geo.setAttribute(k, new THREE.BufferAttribute(a.array, a.itemSize, a.normalized));
        if (index) geo.setIndex(new THREE.BufferAttribute(index, 1));
        return { name, geo };
      });
      resolve({ parts, timings: d.timings });
    };
    w.onerror = (e) => {
      w.terminate();
      console.warn('character worker failed', e.message);
      resolve(null);
    };
    w.postMessage({ boneIndex: [...boneIndexMap()] });
  });
}
