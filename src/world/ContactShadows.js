import * as THREE from 'three';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * Soft ambient-occlusion style contact shadows: the character is rendered from
 * below into a depth-darkness map which is blurred and laid on the floor.  This
 * is what makes feet look genuinely *planted* on a featureless white floor.
 */
export class ContactShadows {
  constructor(renderer, scene, { size = 2.6, res = 512, height = 0.45, opacity = 0.62, blur = 1.6 } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.size = size;
    this.blur = blur;
    this.hidden = [];

    const opts = { type: THREE.HalfFloatType };
    this.rt = new THREE.WebGLRenderTarget(res, res, opts);
    this.rt.texture.generateMipmaps = false;
    this.rtBlur = new THREE.WebGLRenderTarget(res, res, opts);
    this.rtBlur.texture.generateMipmaps = false;

    const geo = new THREE.PlaneGeometry(size, size).rotateX(Math.PI / 2);
    this.plane = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: this.rt.texture, opacity, transparent: true, depthWrite: false,
      color: 0x2a2018,
    }));
    this.plane.material.onBeforeCompile = (s) => {
      // the texture stores darkness in alpha; use it as coverage
      s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>',
        'vec4 sampledDiffuseColor = texture2D( map, vMapUv ); diffuseColor.a *= sampledDiffuseColor.a;');
    };
    this.plane.scale.y = -1;
    this.plane.position.y = 0.0008;
    this.plane.renderOrder = -1;
    scene.add(this.plane);

    this.cam = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, height);
    this.cam.rotation.x = Math.PI / 2;
    scene.add(this.cam);

    const dm = new THREE.MeshDepthMaterial();
    dm.userData.darkness = { value: 1.35 };
    dm.onBeforeCompile = (s) => {
      s.uniforms.darkness = dm.userData.darkness;
      s.fragmentShader = 'uniform float darkness;\n' + s.fragmentShader.replace(
        'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
        'float d = 1.0 - fragCoordZ; gl_FragColor = vec4( vec3( 0.0 ), d * d * darkness );');
    };
    dm.depthTest = false;
    dm.depthWrite = false;
    this.depthMat = dm;

    this.hBlur = new THREE.ShaderMaterial(HorizontalBlurShader);
    this.hBlur.depthTest = false;
    this.vBlur = new THREE.ShaderMaterial(VerticalBlurShader);
    this.vBlur.depthTest = false;
    this.quad = new FullScreenQuad();
  }

  setCenter(p) {
    this.plane.position.x = p.x;
    this.plane.position.z = p.z;
    this.cam.position.set(p.x, 0, p.z);
  }

  _blur(amount) {
    const r = this.renderer;
    this.quad.material = this.hBlur;
    this.hBlur.uniforms.tDiffuse.value = this.rt.texture;
    this.hBlur.uniforms.h.value = amount / 256;
    r.setRenderTarget(this.rtBlur);
    this.quad.render(r);
    this.quad.material = this.vBlur;
    this.vBlur.uniforms.tDiffuse.value = this.rtBlur.texture;
    this.vBlur.uniforms.v.value = amount / 256;
    r.setRenderTarget(this.rt);
    this.quad.render(r);
  }

  update() {
    const r = this.renderer, s = this.scene;
    const bg = s.background;
    const vis = this.hidden.map((o) => o.visible);
    this.hidden.forEach((o) => { o.visible = false; });
    this.plane.visible = false;
    s.background = null;
    s.overrideMaterial = this.depthMat;
    const cc = r.getClearAlpha();
    r.setClearAlpha(0);
    const prevRT = r.getRenderTarget();
    const shadowAuto = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(s, this.cam);
    s.overrideMaterial = null;
    this._blur(this.blur);
    this._blur(this.blur * 0.45);
    r.setRenderTarget(prevRT);
    r.setClearAlpha(cc);
    r.shadowMap.autoUpdate = shadowAuto;
    s.background = bg;
    this.plane.visible = true;
    this.hidden.forEach((o, i) => { o.visible = vis[i]; });
  }
}
