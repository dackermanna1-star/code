// Chain-link mesh for the fence frames: alpha-textured quads over the panels
// each chainLinkFence prop reports (the woven diamonds are far too fine to
// voxelize). Coverage is resolved with a stochastic alpha test that TAA
// integrates, so the mesh fades to a grey haze with distance instead of
// shimmering or vanishing in the mips.
import * as THREE from 'three';
import { makeChainLinkTexture } from '../props/chainlink.js';
import { GLSL_COMMON, shared, patch } from '../render/shaderlib.js';
import { LAYER_REFLECT } from './units.js';

export class ChainLinkMesh {
  constructor() {
    this.pos = [];
    this.uv = [];
    this.nrm = [];
    this.canvas = makeChainLinkTexture({ px: 256, seed: 3 });
    this.tile = this.canvas.metersPerTile ?? 0.2;
  }

  /** panels: [{x0, x1, y0, y1, z}] in the prop's local frame (mesh plane faces +Z). */
  addPanels(panels, matrix) {
    const n = new THREE.Vector3(0, 0, 1).applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix)).normalize();
    for (const p of panels) {
      const c = [[p.x0, p.y0], [p.x1, p.y0], [p.x1, p.y1], [p.x0, p.y1]];
      const w = c.map(([x, y]) => new THREE.Vector3(x, y, p.z).applyMatrix4(matrix));
      for (const k of [0, 1, 2, 0, 2, 3]) {
        this.pos.push(w[k].x, w[k].y, w[k].z);
        this.uv.push(c[k][0] / this.tile, c[k][1] / this.tile);
        this.nrm.push(n.x, n.y, n.z);
      }
    }
  }

  build(scene) {
    if (!this.pos.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.computeBoundingSphere();
    const tex = new THREE.CanvasTexture(this.canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.55 });
    mat.name = 'chainLink';
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, shared);
      shader.vertexShader = patch(shader.vertexShader, '#include <common>', 'varying vec3 vWPos;', 'after');
      shader.vertexShader = patch(shader.vertexShader, '#include <worldpos_vertex>', 'vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;', 'after');
      shader.fragmentShader = patch(shader.fragmentShader, '#include <common>', GLSL_COMMON + 'varying vec3 vWPos;\nuniform float uFrame;', 'after');
      shader.fragmentShader = patch(shader.fragmentShader, '#include <map_fragment>', /* glsl */ `
        {
          // stochastic coverage, decorrelated per pixel and frame
          float thr = float(pcg3d(uvec3(uvec2(gl_FragCoord.xy), uint(uFrame))).x) * (1.0 / 4294967296.0);
          if (diffuseColor.a < 0.04 + 0.92 * thr) discard;
          diffuseColor.a = 1.0;
        }
      `, 'after');
      shader.fragmentShader = patch(shader.fragmentShader, '#include <lights_fragment_maps>', /* glsl */ `
        irradiance = sampleIrradiance(vWPos, normalize((vec4(normal, 0.0) * viewMatrix).xyz));
      `, 'after');
    };
    mat.customProgramCacheKey = () => 'chainlink-v1';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'chainLink';
    mesh.layers.enable(LAYER_REFLECT);
    scene.add(mesh);
    this.mesh = mesh;
    return mesh;
  }
}
