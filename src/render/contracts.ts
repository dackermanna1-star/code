// Internal render sub-system contracts shared by the render-core agent (RenderSystem,
// textures, world material, batching) and the render-env agent (lighting, post-processing,
// exterior, atmosphere). RenderSystem (render-core) constructs these classes:
//   new Lighting(scene, settings)        src/render/lighting.ts
//   new PostFX(scene, camera, settings)  src/render/postfx.ts
//   new Exterior(scene, lighting)        src/render/exterior.ts
//   new Atmosphere(scene, lighting)      src/render/atmosphere.ts

import type { AbstractMesh, Camera, DirectionalLight, Light, Scene, ShadowGenerator } from "@babylonjs/core";
import type { QualityPreset, Settings } from "../core/settings.ts";
import type { Vec3 } from "../geom/vec.ts";

export interface ILighting {
  readonly sun: DirectionalLight;
  /** The sun's shadow generator (cascaded when supported). */
  readonly sunShadows: ShadowGenerator;
  /** Register/unregister a mesh as sun shadow caster; `large` meshes also render into far cascades. */
  setShadowCaster(mesh: AbstractMesh, cast: boolean, large?: boolean): void;
  /** Every opaque world mesh must call this so it receives shadows and gets the right light set. */
  registerReceiver(mesh: AbstractMesh): void;
  unregisterReceiver(mesh: AbstractMesh): void;
  /** Interior lights (owned by light features). roomId = plan room id or null (portable lamp: nearest room). */
  addLight(light: Light, roomId: string | null, mains: boolean): void;
  removeLight(light: Light): void;
  /** Flicker a light for `seconds` (damaged fixture). */
  flicker(light: Light, seconds: number): void;
  setPower(on: boolean): void;
  readonly powered: boolean;
  applyQuality(q: QualityPreset): void;
  update(dt: number): void;
}

export interface IPostFX {
  setPS2(on: boolean): void;
  applyQuality(q: QualityPreset): void;
  /** Add camera trauma (0..1); decays over time. */
  shake(trauma: number): void;
  /** Current shake offsets to add to the camera this frame (metres / radians). */
  getShake(): { pos: Vec3; rot: Vec3 };
  /** Brief full-screen flash (e.g. white for impacts, red for pain). */
  flash(intensity: number, color?: number): void;
  update(dt: number): void;
}

export interface IExterior {
  /** Build sky, sun disc, city, street, neighbouring facades (call once). */
  build(): void;
  update(dt: number): void;
}

export interface IAtmosphere {
  /** Fake volumetric light shafts through window openings + floating dust motes. */
  build(): void;
  setEnabled(on: boolean): void;
  update(dt: number): void;
}

export type { Camera, Scene, Settings };
