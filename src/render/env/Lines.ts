// Screen-space constant-width line segments (the original's black floe outline).
//
// Each segment is a quad expanded in the vertex shader perpendicular to its
// projected direction, with square caps so polyline joints close. The width is
// a fraction of the frame height, so it reads the same at any resolution.
// Depth-tested with a small view-space bias towards the camera so the stroke is
// not swallowed by the ice it outlines, while characters still occlude it.
import * as THREE from 'three';

export type Segment = [THREE.Vector3, THREE.Vector3];

export function buildLineGeometry(segments: Segment[]): THREE.BufferGeometry {
  const n = segments.length;
  const pos = new Float32Array(n * 4 * 3);
  const other = new Float32Array(n * 4 * 3);
  const side = new Float32Array(n * 4);
  const index: number[] = [];
  segments.forEach(([a, b], s) => {
    const corners: Array<[THREE.Vector3, THREE.Vector3, number]> = [
      [a, b, -1],
      [a, b, 1],
      [b, a, -1],
      [b, a, 1],
    ];
    corners.forEach(([p, o, sd], k) => {
      const i = s * 4 + k;
      pos.set([p.x, p.y, p.z], i * 3);
      other.set([o.x, o.y, o.z], i * 3);
      side[i] = sd;
    });
    const o = s * 4;
    // Corners: a-n, a+n, b+n (b's normal is flipped), b-n.
    index.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aOther', new THREE.BufferAttribute(other, 3));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

export function createLineMaterial(widthFrac: number, color = 0x000000, depthBias = 0.25): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uWidth: { value: widthFrac },
      uColor: { value: new THREE.Color(color) },
      uBias: { value: depthBias },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aOther;
      attribute float aSide;
      uniform float uWidth;
      uniform float uBias;
      void main() {
        vec4 mvA = modelViewMatrix * vec4(position, 1.0);
        vec4 mvB = modelViewMatrix * vec4(aOther, 1.0);
        // Pull towards the camera a little (view space) to win against the ice.
        mvA.xyz += normalize(-mvA.xyz) * uBias;
        mvB.xyz += normalize(-mvB.xyz) * uBias;
        vec4 ca = projectionMatrix * mvA;
        vec4 cb = projectionMatrix * mvB;
        // Aspect from the projection (x scale relative to y).
        float aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
        vec2 sa = ca.xy / ca.w * vec2(aspect, 1.0);
        vec2 sb = cb.xy / cb.w * vec2(aspect, 1.0);
        vec2 dir = sb - sa;
        float len = length(dir);
        dir = len > 1e-6 ? dir / len : vec2(1.0, 0.0);
        vec2 nrm = vec2(-dir.y, dir.x);
        // NDC height is 2, so half-width in NDC = width fraction of the frame height.
        // Square cap: extend away from the other end by half the width.
        vec2 off = nrm * aSide * uWidth - dir * uWidth;
        off.x /= aspect;
        gl_Position = ca;
        gl_Position.xy += off * ca.w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
      }
    `,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}
