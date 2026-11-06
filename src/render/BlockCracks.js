// Minecraft-style crack overlay on the block currently being damaged.
import * as THREE from 'three';

const VERT = /* glsl */ `
out vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FRAG = /* glsl */ `
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uAtlas;
uniform float uLayer;
uniform float uOpacity;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec4 t = texture(uAtlas, vec3(vUv, uLayer));
  if (t.a < 0.5) discard;
  fragColor = vec4(t.rgb * 0.15, 0.75 * uOpacity);
}
`;

export class BlockCracks {
  constructor(scene, textures) {
    this.textures = textures;
    this.uniforms = { uAtlas: { value: textures.texture }, uLayer: { value: textures.layer('destroy_1') }, uOpacity: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1.004, 1.004, 1.004), mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.t = 0;
  }
  show(x, y, z, frac) {
    const stage = Math.min(4, Math.max(1, Math.ceil(frac * 4)));
    this.uniforms.uLayer.value = this.textures.layer('destroy_' + stage);
    this.mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.mesh.visible = true;
    this.t = 4;
  }
  update(dt) {
    if (!this.mesh.visible) return;
    this.t -= dt;
    this.uniforms.uOpacity.value = Math.min(1, this.t);
    if (this.t <= 0) this.mesh.visible = false;
  }
  hide() { this.mesh.visible = false; }
}
