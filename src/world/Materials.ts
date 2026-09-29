import * as THREE from 'three';
import { TextureBaker } from '../render/TextureBaker';
import * as S from '../render/Surfaces';

/**
 * Central material library for the restaurant. Materials are created lazily
 * and cached so every prop shares the same instances (fewer programs,
 * fewer state changes, better batching).
 */
export class MaterialLib {
  private cache = new Map<string, THREE.Material>();
  constructor(readonly baker: TextureBaker) {}

  get<T extends THREE.Material>(key: string, make: () => T): T {
    let m = this.cache.get(key) as T | undefined;
    if (!m) {
      m = make();
      m.name = key;
      this.cache.set(key, m);
    }
    return m;
  }

  std(color: THREE.ColorRepresentation, roughness = 0.6, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) {
    const key = `std_${new THREE.Color(color).getHexString()}_${roughness}_${metalness}_${JSON.stringify(extra, (k, v) => (v && v.isTexture ? v.uuid : v))}`;
    return this.get(key, () => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));
  }

  phys(key: string, params: THREE.MeshPhysicalMaterialParameters) {
    return this.get('phys_' + key, () => new THREE.MeshPhysicalMaterial(params));
  }

  emissive(color: THREE.ColorRepresentation, intensity = 2, key = '') {
    return this.get(`emi_${new THREE.Color(color).getHexString()}_${intensity}_${key}`, () =>
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, roughness: 0.5 }),
    );
  }

  // ---- Environment surfaces -------------------------------------------------
  get steel() {
    return this.get('steel', () => this.baker.material(S.brushedSteel(1.0), { envMapIntensity: 1.6 }));
  }
  get steelDark() {
    return this.get('steelDark', () => this.baker.material(S.brushedSteel(0.7, 'steelDark'), { envMapIntensity: 1.3 }));
  }
  get chrome() {
    return this.get('chrome', () => new THREE.MeshStandardMaterial({ color: 0xe9eef2, roughness: 0.12, metalness: 1, envMapIntensity: 1.5 }));
  }
  get castIron() {
    return this.get('castIron', () => this.baker.material(S.castIron, {}));
  }
  get butcherBlock() {
    return this.get('butcher', () => this.baker.material(S.butcherBlock, {}));
  }
  get kitchenFloor() {
    return this.get('kitchenFloor', () => this.baker.material(S.quarryTile, {}));
  }
  get subway() {
    return this.get('subway', () => this.baker.material(S.subwayTile(0.0), {}));
  }
  get subwayGreasy() {
    return this.get('subwayGreasy', () => this.baker.material(S.subwayTile(0.75), {}));
  }
  get brick() {
    return this.get('brick', () => this.baker.material(S.brick, {}));
  }
  get concrete() {
    return this.get('concrete', () => this.baker.material(S.concrete, {}));
  }
  get asphalt() {
    return this.get('asphalt', () => this.baker.material(S.asphalt, {}));
  }
  get cardboard() {
    return this.get('cardboard', () => this.baker.material(S.cardboard, {}));
  }
  get chalkboard() {
    return this.get('chalkboard', () => this.baker.material(S.chalkboard, {}));
  }
  get paper() {
    return this.get('paper', () => this.baker.material(S.paper, {}));
  }
  get fabric() {
    return this.baker.bake(S.fabricWeave);
  }
  wood(tone: number = 0x9c6b43, planks = 5, repeat: [number, number] = [1, 1]) {
    return this.get(`wood_${tone}_${planks}_${repeat}`, () => this.baker.material(S.woodPlanks(tone, planks), { repeat }));
  }
  plaster(tone: number, repeat: [number, number] = [3, 1]) {
    return this.get(`plaster_${tone}_${repeat}`, () => this.baker.material(S.plaster(tone), { repeat }));
  }
  vinyl(tone: number, channels = 5, repeat: [number, number] = [1, 1]) {
    return this.get(`vinyl_${tone}_${channels}_${repeat}`, () =>
      this.baker.material(S.vinyl(tone, channels), { repeat, physical: true, clearcoat: 0.35, clearcoatRoughness: 0.4 } as any),
    );
  }
  laminate(bg: number, repeat: [number, number] = [1, 1]) {
    return this.get(`laminate_${bg}_${repeat}`, () =>
      this.baker.material(S.laminate(bg), { repeat, physical: true, clearcoat: 0.5, clearcoatRoughness: 0.25 } as any),
    );
  }
  checker(a: number, b: number, repeat: [number, number]) {
    return this.get(`checker_${a}_${b}_${repeat}`, () => this.baker.material(S.checkerTile(a, b), { repeat }));
  }
  awning(a: number) {
    return this.get(`awning_${a}`, () => this.baker.material(S.awning(a), { side: THREE.DoubleSide }));
  }

  get glass() {
    return this.get('glass', () =>
      new THREE.MeshPhysicalMaterial({
        color: 0xdfeff5,
        roughness: 0.05,
        metalness: 0,
        transparent: true,
        opacity: 0.16,
        envMapIntensity: 1.4,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
  }
  get rubberMat() {
    return this.get('rubberMat', () => new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.9 }));
  }
  get blackPlastic() {
    return this.std(0x1d1d20, 0.45);
  }
  get whitePlastic() {
    return this.std(0xf0efea, 0.35);
  }
}
