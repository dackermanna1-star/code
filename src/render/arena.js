import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Minimal test arena: a 24 m square of smooth sealed concrete with a 1 m calibration grid and
 * scale markings, a soft sky dome, sun with shadows following the action, and image-based
 * lighting for physically based materials. The floor samples the decal texture (blood film,
 * bullet marks, juice) and shades wet blood as a glossy, darker film.
 */

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  return renderer;
}

export class Arena {
  constructor(renderer, decals, opts = {}) {
    this.renderer = renderer;
    this.half = opts.half ?? 12;
    const scene = new THREE.Scene();
    this.scene = scene;
    scene.background = new THREE.Color(0xb9c2cb);
    scene.fog = new THREE.Fog(0xb9c2cb, 30, 75);
    const pm = new THREE.PMREMGenerator(renderer);
    this.envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.envMap;
    scene.environmentIntensity = 0.45;
    pm.dispose();

    // sky dome with a gentle gradient
    const skyGeo = new THREE.SphereGeometry(90, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color(0x8fa6bd) }, bottom: { value: new THREE.Color(0xd9dee2) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float t = smoothstep(-0.05, 0.6, vP.y); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }',
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    this.hemi = new THREE.HemisphereLight(0xe8eef5, 0x5a5550, 0.55);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff3e6, 2.6);
    sun.position.set(4, 9, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -4;
    sc.right = 4;
    sc.top = 4;
    sc.bottom = -4;
    sc.near = 0.5;
    sc.far = 30;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 3;
    this.sun = sun;
    this.sunOffset = sun.position.clone();
    scene.add(sun);
    scene.add(sun.target);

    this.floor = this.createFloor(decals);
    scene.add(this.floor);
    this.createEdges();
  }

  createFloor(decals) {
    const half = this.half;
    const geo = new THREE.PlaneGeometry(half * 2, half * 2, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xa7a8a6, roughness: 0.82, metalness: 0.0 });
    const uniforms = {
      uDecals: { value: decals.target.texture },
      uDecalHalf: { value: decals.half },
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vWorldP;
          uniform sampler2D uDecals;
          uniform float uDecalHalf;
          float fh(vec2 p){ p = fract(p*vec2(234.34,435.345)); p += dot(p, p+34.23); return fract(p.x*p.y); }
          float fn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(fh(i),fh(i+vec2(1,0)),f.x),mix(fh(i+vec2(0,1)),fh(i+vec2(1,1)),f.x),f.y); }
          float ffbm(vec2 p){ float a=0.5,s=0.0; for(int i=0;i<5;i++){ s+=a*fn(p); p*=2.03; a*=0.5;} return s; }
          float gridLine(vec2 p, float w){ vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p); return 1.0 - min(min(g.x, g.y) / w, 1.0); }
          vec4 decalAt(vec2 xz){ vec2 uv = xz / (2.0*uDecalHalf) + 0.5; if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(0.0); return texture2D(uDecals, uv); }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec2 xz = vWorldP.xz;
          // sealed concrete: low-frequency mottling, fine aggregate, trowel marks
          float mott = ffbm(xz * 0.35);
          float grain = fn(xz * 60.0) * 0.5 + fn(xz * 140.0) * 0.5;
          diffuseColor.rgb *= 0.86 + 0.18 * mott + 0.06 * (grain - 0.5);
          // calibration grid: 1 m lines, darker 5 m lines, centre cross
          float g1 = gridLine(xz, 1.2) * 0.22;
          float g5 = gridLine(xz / 5.0, 1.6) * 0.35;
          float axis = (1.0 - smoothstep(0.012, 0.02, abs(xz.x))) * step(abs(xz.y), 0.5) + (1.0 - smoothstep(0.012, 0.02, abs(xz.y))) * step(abs(xz.x), 0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.19, 0.2), max(max(g1, g5), axis * 0.5));
          vec4 dec = decalAt(xz);
          // bullet marks
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.16, 0.16), clamp(dec.g, 0.0, 1.0) * 0.85);
          // juice
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.12, 0.16), smoothstep(0.05, 0.4, dec.b) * 0.7);
          // blood: thin films are bright red and soaked into the pores, thick pools dark and glossy
          float bt = dec.r;
          float bcov = smoothstep(0.03, 0.12, bt);
          vec3 bcol = mix(vec3(0.2, 0.011, 0.009), vec3(0.045, 0.0025, 0.002), smoothstep(0.15, 0.6, bt));
          diffuseColor.rgb = mix(diffuseColor.rgb, bcol, bcov);
          float floorWet = smoothstep(0.15, 0.45, bt) + smoothstep(0.1, 0.4, dec.b) * 0.6;`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor * (0.9 + 0.2 * grain), 0.08, clamp(floorWet, 0.0, 1.0));`,
        );
    };
    mat.customProgramCacheKey = () => 'arena-floor-v1';
    const floor = new THREE.Mesh(geo, mat);
    floor.receiveShadow = true;
    return floor;
  }

  createEdges() {
    // a thin plinth edge around the arena square, so its border reads clearly
    const half = this.half;
    const mat = new THREE.MeshStandardMaterial({ color: 0x6d7074, roughness: 0.7 });
    const h = 0.6;
    const g = new THREE.Group();
    for (const [x, z, w, d] of [
      [0, half + 0.1, half * 2 + 0.4, 0.2],
      [0, -half - 0.1, half * 2 + 0.4, 0.2],
      [half + 0.1, 0, 0.2, half * 2],
      [-half - 0.1, 0, 0.2, half * 2],
    ]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, -h / 2 + 0.001, z);
      m.receiveShadow = true;
      g.add(m);
    }
    // underside block so the platform has thickness when seen from afar
    const base = new THREE.Mesh(new THREE.BoxGeometry(half * 2, h, half * 2), new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.9 }));
    base.position.y = -h / 2 - 0.002;
    g.add(base);
    this.scene.add(g);
  }

  /** Keep the shadow frustum around the point of interest. */
  focus(p) {
    this.sun.target.position.set(p.x, 0, p.z);
    this.sun.position.set(p.x + this.sunOffset.x, this.sunOffset.y, p.z + this.sunOffset.z);
  }
}
