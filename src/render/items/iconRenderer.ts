/**
 * Renders 3D item icons (block items, optionally models) through the main WebGL context into
 * a small supersampled render target, reads the pixels back and produces a canvas.
 */
import * as THREE from 'three';
import type { Renderer } from '../renderer';
import type { ItemMaterials } from './itemMaterials';
import { ICON_LIGHTS } from './itemMaterials';
import { blockItemGeo, blockItemCentre, type BlockItemGeo } from './blockGeo';
import { makeCanvas, ctx2d, type AnyCanvas } from './paint/kit';
import type { BlockDef } from '../../world/blocks/registry';

export class IconRenderer {
  private rt: THREE.WebGLRenderTarget | null = null;
  private rtSize = 0;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  private buf: Uint8Array | null = null;
  /** Camera yaw/pitch of the isometric block view (Minecraft GUI: 30° down, 45° around). */
  yaw = Math.PI / 4;
  pitch = THREE.MathUtils.degToRad(30);
  supersample = 2;
  available = true;

  constructor(readonly renderer: Renderer, readonly mats: ItemMaterials) {
    this.scene.matrixWorldAutoUpdate = true;
  }

  private target(px: number): THREE.WebGLRenderTarget {
    if (!this.rt || this.rtSize !== px) {
      this.rt?.dispose();
      this.rt = new THREE.WebGLRenderTarget(px, px, { type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false, samples: 4, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      this.rtSize = px;
      this.buf = new Uint8Array(px * px * 4);
    }
    return this.rt;
  }

  /** Render a block item icon (null if WebGL rendering fails). */
  renderBlock(def: BlockDef, size: number): AnyCanvas | null {
    const geo = blockItemGeo(def);
    const meshes: THREE.Mesh[] = [];
    const centre = blockItemCentre(geo);
    for (const l of geo.layers) {
      const m = new THREE.Mesh(l.geometry, this.mats.terrain('icon', l.kind, { flat: geo.flat }));
      m.position.copy(centre).negate();
      m.frustumCulled = false;
      m.renderOrder = l.kind === 'translucent' ? 2 : l.kind === 'cutout' ? 1 : 0;
      meshes.push(m);
    }
    return this.render(meshes, geo, size);
  }

  /** Render arbitrary meshes framed like a block item (geo bounds give the framing). */
  render(meshes: THREE.Object3D[], geo: Pick<BlockItemGeo, 'min' | 'max' | 'flat' | 'framing'>, size: number): AnyCanvas | null {
    if (!this.available) return null;
    const gl = this.renderer.gl;
    const px = size * this.supersample;
    const rt = this.target(px);
    const cam = this.cam;
    // camera
    if (geo.flat) {
      cam.position.set(0, 0, 10);
      cam.up.set(0, 1, 0);
      cam.lookAt(0, 0, 0);
      const h = 0.5;
      cam.left = -h; cam.right = h; cam.top = h; cam.bottom = -h;
    } else {
      const d = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
      cam.position.copy(d).multiplyScalar(10);
      cam.up.set(0, 1, 0);
      cam.lookAt(0, 0, 0);
      let h = 0.86; // a full cube fills the icon like Minecraft's GUI blocks
      if (geo.framing === 'fit') {
        // project the bounds' corners onto the view plane to find the needed extent
        cam.updateMatrixWorld(true);
        const r = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
        const u = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
        const c = geo.min.clone().add(geo.max).multiplyScalar(0.5);
        let ext = 0;
        for (let i = 0; i < 8; i++) {
          const p = new THREE.Vector3(i & 1 ? geo.max.x : geo.min.x, i & 2 ? geo.max.y : geo.min.y, i & 4 ? geo.max.z : geo.min.z).sub(c);
          ext = Math.max(ext, Math.abs(p.dot(r)), Math.abs(p.dot(u)));
        }
        h = Math.max(0.3, ext * 1.1);
      }
      cam.left = -h; cam.right = h; cam.top = h; cam.bottom = -h;
    }
    cam.near = 0.1;
    cam.far = 50;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    this.mats.iconViewInvRot.value.setFromMatrix4(cam.matrixWorld);
    // studio lights in world space, relative to the view (key from the upper left-front)
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const back = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 2);
    if (geo.flat) {
      ICON_LIGHTS.u_keyDir.value.copy(back).multiplyScalar(0.8).addScaledVector(up, 0.45).addScaledVector(right, -0.35).normalize();
    } else {
      // world-space light favouring the top face, then the left (south) face, then the right (east) face
      ICON_LIGHTS.u_keyDir.value.set(0.22, 0.88, 0.62).normalize();
    }
    ICON_LIGHTS.u_fillDir.value.copy(right).multiplyScalar(0.7).addScaledVector(back, -0.4).addScaledVector(up, 0.2).normalize();
    for (const m of meshes) this.scene.add(m);
    const prevTarget = gl.getRenderTarget();
    const prevClear = gl.getClearColor(new THREE.Color());
    const prevAlpha = gl.getClearAlpha();
    let ok = true;
    try {
      gl.setRenderTarget(rt);
      gl.setClearColor(0x000000, 0);
      gl.clear(true, true, false);
      gl.render(this.scene, cam);
      gl.readRenderTargetPixels(rt, 0, 0, px, px, this.buf!);
    } catch (e) {
      console.warn('icon render failed', e);
      ok = false;
      this.available = false;
    } finally {
      gl.setRenderTarget(prevTarget);
      gl.setClearColor(prevClear, prevAlpha);
      for (const m of meshes) this.scene.remove(m);
    }
    if (!ok) return null;
    // flip Y, un-premultiply, downsample
    const big = makeCanvas(px);
    const bg = ctx2d(big);
    const img = bg.createImageData(px, px);
    const src = this.buf!;
    const dst = img.data;
    for (let y = 0; y < px; y++) {
      const so = (px - 1 - y) * px * 4, dO = y * px * 4;
      for (let x = 0; x < px * 4; x += 4) {
        const a = src[so + x + 3];
        if (a === 0) continue;
        const k = 255 / a;
        dst[dO + x] = Math.min(255, src[so + x] * k);
        dst[dO + x + 1] = Math.min(255, src[so + x + 1] * k);
        dst[dO + x + 2] = Math.min(255, src[so + x + 2] * k);
        dst[dO + x + 3] = a;
      }
    }
    bg.putImageData(img, 0, 0);
    if (px === size) return big;
    const out = makeCanvas(size);
    const og = ctx2d(out);
    og.imageSmoothingEnabled = true;
    (og as any).imageSmoothingQuality = 'high';
    og.drawImage(big as any, 0, 0, size, size);
    return out;
  }
}
