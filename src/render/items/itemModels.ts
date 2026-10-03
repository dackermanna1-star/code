/**
 * `game.itemModels`: 3D models and icons for item stacks.
 *
 *   create(stack, mode) -> THREE.Object3D
 *     'dropped'      G-buffer model for ItemEntity: 1-4 copies (follows userData.stackVisualCount),
 *                    blocks at 1/4 size, items at 1/2 size, bottom resting at the model origin - 0.125
 *     'thrown'       G-buffer model for projectiles (sprites set userData.billboard = true;
 *                    tridents point along -Z like ArrowEntity)
 *     'third_person' G-buffer model with Minecraft's thirdperson_righthand display transform baked in
 *                    (parent = the hand point of a humanoid arm, see ARCHITECTURE notes in the report)
 *     'hand'         forward-lit model in item space (unit, centred) for the first-person hand pass
 *   icon(stack) -> data URL (ItemIconAtlas)
 *
 * G-buffer materials carry their own `u_light` uniform per created model, so ItemEntity's
 * setEntityLight traversal (or any owner calling setEntityLight) lights each copy correctly.
 */
import * as THREE from 'three';
import type { ItemDef, ItemStack } from '../../game/items/registry';
import { hasGlint } from '../../game/items/items';
import { BLOCK_BY_NAME } from '../../world/blocks/registry';
import type { Renderer } from '../renderer';
import { ItemMaterials, type ItemMatSpec } from './itemMaterials';
import { IconRenderer } from './iconRenderer';
import { ItemIconAtlas } from './iconAtlas';
import { sprite, spriteKey } from './paint/index';
import { blockItemGeo, blockItemCentre, isFlatBlockItem, type BlockItemGeo } from './blockGeo';
import { extrudeSprite, dilatedTexture, dataTexture } from './extrude';
import { toolModel, type ModelPart } from './toolModels';

export type ItemModelMode = 'dropped' | 'hand' | 'third_person' | 'thrown';

interface Proto {
  kind: 'block' | 'tool' | 'sprite';
  parts: ModelPart[];
  block?: BlockItemGeo;
  blockScale?: number;
  blockOffset?: THREE.Vector3;
}

/** Group that shows `userData.stackVisualCount` (1-4) of its copies, like Minecraft's dropped stacks. */
export class StackedItemModel extends THREE.Group {
  copies: THREE.Object3D[] = [];
  override updateMatrixWorld(force?: boolean) {
    const n = this.userData.stackVisualCount ?? 1;
    for (let i = 0; i < this.copies.length; i++) this.copies[i].visible = i < n;
    super.updateMatrixWorld(force);
  }
}

const SPHERES: Record<string, ItemMatSpec & { r: number; sy?: number }> = {
  snowball: { r: 0.11, color: 0xf2f6ff, roughness: 0.85, sss: 0.3 },
  egg: { r: 0.1, sy: 1.25, color: 0xe8d4ac, roughness: 0.45 },
  ender_pearl: { r: 0.11, color: 0x1f6e60, roughness: 0.08 },
  ender_eye: { r: 0.11, color: 0x3a9a48, roughness: 0.1, emissive: 0.05 },
  slime_ball: { r: 0.1, color: 0x6bd04e, roughness: 0.2, sss: 0.5 },
  fire_charge: { r: 0.12, color: 0x3a2418, roughness: 0.6, emissive: 0.3 },
};

export class ItemModels {
  readonly mats: ItemMaterials;
  readonly icons: IconRenderer;
  readonly atlas: ItemIconAtlas;
  private protos = new Map<string, Proto>();

  constructor(readonly renderer: Renderer, iconSize = 128) {
    this.mats = new ItemMaterials(renderer);
    this.icons = new IconRenderer(renderer, this.mats);
    this.atlas = new ItemIconAtlas(renderer, this.icons, iconSize);
  }

  icon(stack: ItemStack): string | null {
    return this.atlas.url(stack);
  }

  /** Is this item rendered as a 3D block (vs a flat/extruded item)? */
  isBlock(def: ItemDef): boolean {
    if (def.visual.kind !== 'block' || !def.block) return false;
    const b = BLOCK_BY_NAME.get(def.block);
    return !!b && !isFlatBlockItem(b);
  }

  private protoKey(def: ItemDef, data?: Record<string, any>) {
    if (def.visual.kind === 'model') return `tool:${def.name}|${data?.pull ? Math.round(data.pull * 3) : 0}`;
    return `${def.visual.kind}:${spriteKey(def, data)}`;
  }

  proto(stack: ItemStack): Proto {
    const def = stack.item;
    const key = this.protoKey(def, stack.data);
    const hit = this.protos.get(key);
    if (hit) return hit;
    let p: Proto | null = null;
    if (this.isBlock(def)) {
      const g = blockItemGeo(BLOCK_BY_NAME.get(def.block!)!);
      let scale = 1;
      if (g.framing === 'fit') {
        const ext = Math.max(g.max.x - g.min.x, g.max.y - g.min.y, g.max.z - g.min.z);
        scale = Math.min(1.6, 1 / Math.max(0.2, ext));
        if (g.layers.length && ext < 1) scale = Math.min(scale, 1.4);
      }
      p = { kind: 'block', parts: [], block: g, blockScale: scale, blockOffset: blockItemCentre(g).negate() };
    } else if (def.visual.kind === 'model') {
      const parts = toolModel(def.visual.id, def.name, stack.data);
      if (parts) p = { kind: 'tool', parts };
    }
    if (!p) {
      // painted sprite, or the flat texture icon of plant-like blocks, extruded
      let canvas = def.visual.kind === 'block' ? this.atlas.canvas(def) : null;
      let matCanvas = null;
      if (!canvas) {
        const s = sprite(def, stack.data, 128);
        canvas = s?.canvas ?? null;
        matCanvas = s?.mat ?? null;
      }
      if (canvas) {
        const geometry = extrudeSprite(canvas);
        const spec: ItemMatSpec = { map: dilatedTexture(canvas), pbrMap: matCanvas ? dataTexture(matCanvas) : null, roughness: 0.62, key: `sprite:${key}` };
        p = { kind: 'sprite', parts: [{ geometry, spec }] };
      } else {
        p = { kind: 'sprite', parts: [{ geometry: new THREE.BoxGeometry(0.4, 0.4, 0.06), spec: { color: 0x9a9a9a, key: 'missing' } }] };
      }
    }
    this.protos.set(key, p);
    return p;
  }

  /** Item-space model (unit scale, centred) with materials for an output. */
  build(stack: ItemStack, output: 'gbuffer' | 'forward'): THREE.Group {
    const p = this.proto(stack);
    const glint = hasGlint(stack) ? 1 : 0;
    const g = new THREE.Group();
    g.userData.kind = p.kind;
    if (p.kind === 'block' && p.block) {
      const inner = new THREE.Group();
      inner.scale.setScalar(p.blockScale!);
      for (const l of p.block.layers) {
        const m = new THREE.Mesh(l.geometry, this.mats.terrain(output, l.kind));
        m.position.copy(p.blockOffset!);
        m.frustumCulled = false;
        if (output === 'gbuffer' && glint) (m.material as THREE.RawShaderMaterial).uniforms.u_glint.value = glint;
        inner.add(m);
      }
      g.add(inner);
      return g;
    }
    for (const part of p.parts) {
      let mat: THREE.RawShaderMaterial;
      if (output === 'forward') mat = this.mats.forward({ ...part.spec, key: part.spec.key ? `${part.spec.key}|g${glint}` : undefined });
      else mat = this.mats.gbuffer(part.spec);
      mat.uniforms.u_glint.value = glint;
      const m = new THREE.Mesh(part.geometry, mat);
      m.frustumCulled = false;
      g.add(m);
    }
    return g;
  }

  create(stack: ItemStack, mode: ItemModelMode): THREE.Object3D {
    if (mode === 'hand') return this.build(stack, 'forward');
    const p = this.proto(stack);
    if (mode === 'thrown') {
      const sp = SPHERES[stack.item.name];
      if (sp) {
        const geo = new THREE.SphereGeometry(sp.r, 16, 12);
        if (sp.sy) geo.scale(1, sp.sy, 1);
        const m = new THREE.Mesh(geo, this.mats.gbuffer(sp));
        m.frustumCulled = false;
        const g = new THREE.Group();
        g.add(m);
        return g;
      }
      const inner = this.build(stack, 'gbuffer');
      const g = new THREE.Group();
      if (stack.item.name === 'trident') {
        inner.rotation.set(-Math.PI / 2, 0, Math.PI / 4, 'XYZ');
        // tip (item-space up-right diagonal) -> +Y -> -Z
        inner.rotation.set(0, 0, 0);
        const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 4);
        const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
        inner.quaternion.copy(q2.multiply(q1));
        inner.scale.setScalar(1.1);
        g.add(inner);
        return g;
      }
      inner.scale.setScalar(p.kind === 'block' ? 0.25 : 0.5);
      g.add(inner);
      g.userData.billboard = p.kind !== 'block';
      return g;
    }
    if (mode === 'third_person') {
      const inner = this.build(stack, 'gbuffer');
      const g = new THREE.Group();
      // Minecraft thirdperson_righthand display transforms (translation in 1/16 block)
      if (p.kind === 'block') { inner.position.set(0, 2.5 / 16, 0); inner.rotation.set(THREE.MathUtils.degToRad(75), THREE.MathUtils.degToRad(45), 0, 'XYZ'); inner.scale.setScalar(0.375); }
      else if (p.kind === 'tool') { inner.position.set(0, 4 / 16, 0.5 / 16); inner.rotation.set(0, THREE.MathUtils.degToRad(-90), THREE.MathUtils.degToRad(55), 'XYZ'); inner.scale.setScalar(0.85); }
      else { inner.position.set(0, 3 / 16, 1 / 16); inner.scale.setScalar(0.55); }
      g.add(inner);
      return g;
    }
    // dropped
    const root = new StackedItemModel();
    const seed = stack.item.id * 7919;
    const rnd = (i: number) => {
      const x = Math.sin(seed + i * 12.9898) * 43758.5453;
      return (x - Math.floor(x)) * 2 - 1;
    };
    for (let i = 0; i < 4; i++) {
      const c = this.build(stack, 'gbuffer');
      if (p.kind === 'block') {
        c.scale.setScalar(0.25);
        if (i > 0) c.position.set(rnd(i) * 0.08, rnd(i + 5) * 0.06 + 0.02 * i, rnd(i + 9) * 0.08);
        if (i > 0) c.rotation.y = rnd(i + 13) * 0.4;
      } else {
        c.scale.setScalar(0.5);
        c.position.set(i > 0 ? rnd(i) * 0.04 : 0, 0.125 + (i > 0 ? rnd(i + 5) * 0.04 : 0), -i * 0.045);
      }
      root.copies.push(c);
      root.add(c);
    }
    root.userData.stackVisualCount = Math.min(4, stack.count > 32 ? 4 : stack.count > 16 ? 3 : stack.count > 1 ? 2 : 1);
    return root;
  }
}
