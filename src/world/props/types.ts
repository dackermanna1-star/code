// Contracts between the kitchen props (pure visuals, src/world/props/*) and the gameplay code
// (stations, src/stations/*). Props are built at their LOCAL origin; buildKitchen() places them
// according to src/world/layout.ts and returns KitchenRefs.
//
// Rules for animatable parts:
//  - Every animatable part is its own Object3D whose local origin is the pivot (hinge, axle...).
//  - Rest pose = all rotations/offsets zero. Gameplay animates rotation/position from there.
//  - "Glow" meshes use MeshBasicMaterial or emissive materials whose opacity / emissiveIntensity
//    gameplay can change. Start them invisible or at intensity 0.
//  - Local anchor points (Vector3) are in the prop root's local space unless stated otherwise.

import type * as THREE from 'three';

export interface CuttingBoardProp {
  root: THREE.Group;
  /** Local y of the board's top surface. */
  surfaceY: number;
  /** Usable top area [width (x), depth (z)]. */
  size: [number, number];
}

/** Hand tools resting in the tool caddy. Each tool is built lying flat, blade/head along +X. */
export interface ToolProp {
  root: THREE.Group;
  /** Local point where the hand grips the tool (handle centre). */
  grip: THREE.Vector3;
  /** Local point of the working end (knife edge middle, peeler blade, masher head centre, pin centre). */
  tip: THREE.Vector3;
  /** Overall length along X. */
  length: number;
}

export interface ToolCaddyProp {
  root: THREE.Group;
  /** Where each tool rests when not in use (local transform: position + rotation of the tool root). */
  slots: Record<'knife' | 'peeler' | 'rollingPin' | 'masher', { pos: THREE.Vector3; rot: THREE.Euler }>;
}

export interface MixingBowlProp {
  root: THREE.Group;
  innerRadius: number;
  /** Local y of the inside bottom and of the rim. */
  bottomY: number;
  rimY: number;
  /** A liquid/batter surface disc (hidden by default). Gameplay sets its y, scale and colour. */
  fill: THREE.Mesh;
}

export interface WhiskProp extends ToolProp {}

export interface PanProp {
  root: THREE.Group;
  /** Local y of the cooking surface centre. */
  surfaceY: number;
  innerRadius: number;
  /** Handle group (gameplay may wiggle the whole pan root; handle is for hit testing). */
  handle: THREE.Object3D;
  /** Thin oil sheen disc on the cooking surface (MeshStandardMaterial, transparent; hidden by default). */
  oil: THREE.Mesh;
}

export interface PotProp {
  root: THREE.Group;
  innerRadius: number;
  /** Local y of the water surface. */
  waterY: number;
  bottomY: number;
  rimY: number;
  /** Water surface mesh (MeshStandardMaterial with a colour gameplay tints into soup). */
  water: THREE.Mesh;
  /** The water body under the surface (same material family) - tinted together with `water`. */
  waterBody: THREE.Mesh;
  lid: THREE.Object3D | null;
}

export interface BurnerParts {
  /** Burner centre in stove-local space (cooktop level). */
  center: THREE.Vector3;
  /** Flame ring group: scale 0 = off, 1 = full. Built from small blue/orange flame cones. */
  flame: THREE.Object3D;
  /** Red-hot glow disc (MeshBasicMaterial, transparent, opacity 0 = off). */
  glow: THREE.Mesh;
  /** Knob on the stove front; rotate around local Z (rad) to show the setting. */
  knob: THREE.Object3D;
}

export interface OvenParts {
  /** Door pivot at the bottom hinge. Closed = rotation.x 0, open = rotation.x = +openAngle (tilts towards the viewer). */
  door: THREE.Object3D;
  openAngle: number;
  /** Rack (tray) surface centre in stove-local space, and its usable size [x, z]. */
  rackCenter: THREE.Vector3;
  rackSize: [number, number];
  /** The tray/rack object (gameplay slides it out along +Z a little when the door opens). */
  rack: THREE.Object3D;
  /** Interior glow (emissive / basic material, opacity or intensity animated). */
  glow: THREE.Mesh;
  /** Timer dial; rotate around local Z. */
  dial: THREE.Object3D;
  /** Small indicator lamp mesh (emissive red when on). */
  lamp: THREE.Mesh;
}

export interface StoveProp {
  root: THREE.Group;
  burners: BurnerParts[]; // 4: front-left, front-right, back-left, back-right (matches LAYOUT.burners)
  oven: OvenParts;
  /** Local y of the cooktop surface (equals COUNTER.topY when placed). */
  cooktopY: number;
}

export interface BlenderProp {
  root: THREE.Group;
  /** Jar group (transparent glass), pivot at its bottom centre. Gameplay shakes it while blending. */
  jar: THREE.Object3D;
  jarInnerRadius: number;
  /** Jar-local y of the jar's inside bottom and top rim. */
  jarBottomY: number;
  jarTopY: number;
  lid: THREE.Object3D;
  /** Blades: spin around local Y. */
  blades: THREE.Object3D;
  /** Big button on the base: press = move down along local Y. */
  button: THREE.Object3D;
  /**
   * Liquid inside the jar: a cylinder of height 1 (scaled in y by gameplay), base at jarBottomY.
   * Its material is a MeshStandardMaterial gameplay recolours; hidden by default.
   */
  liquid: THREE.Mesh;
}

export interface ToasterProp {
  root: THREE.Group;
  /** Slot centres at the top opening (local), slots run along X. */
  slots: THREE.Vector3[];
  slotSize: [number, number]; // [length along x, width along z]
  /** Depth items sink to when the lever is down (positive number). */
  slotDepth: number;
  /** Lever: move down along local Y by `leverTravel` when toasting. */
  lever: THREE.Object3D;
  leverTravel: number;
  /** Orange glow inside the slots (opacity animated). */
  glow: THREE.Mesh;
}

export interface FryerProp {
  root: THREE.Group;
  /** Basket group; gameplay moves it along local Y between basketUpY and basketDownY. */
  basket: THREE.Object3D;
  basketUpY: number;
  basketDownY: number;
  /** Basket interior floor (in basket-local space) and usable size [x, z]. */
  basketFloorY: number;
  basketSize: [number, number];
  /** Oil surface mesh and its local y. */
  oil: THREE.Mesh;
  oilY: number;
  /** Power lamp (emissive). */
  lamp: THREE.Mesh;
}

export interface MicrowaveProp {
  root: THREE.Group;
  /** Door pivot on the LEFT edge; open = rotation.y = -openAngle (swings towards the viewer). */
  door: THREE.Object3D;
  openAngle: number;
  /** Turntable: spins around local Y; items sit on it at plateY. */
  plate: THREE.Object3D;
  plateY: number;
  plateRadius: number;
  /** Interior light (emissive / basic, opacity animated). */
  light: THREE.Mesh;
  /** Start button (press along local Z). */
  button: THREE.Object3D;
  /** Display: a CanvasTexture-backed mesh; call setText to show e.g. "0:12" or ":)". */
  setDisplay(text: string): void;
}

export interface FridgeProp {
  root: THREE.Group;
  /** Main door, hinge on the RIGHT edge; open = rotation.y = +openAngle. */
  door: THREE.Object3D;
  openAngle: number;
  /** Freezer drawer at the bottom: slides out along local +Z by drawerTravel. */
  drawer: THREE.Object3D;
  drawerTravel: number;
  /** Inside floor of the drawer in drawer-local space and its usable size [x, z]. */
  drawerFloorY: number;
  drawerSize: [number, number];
  /** Cold mist / interior light (opacity animated). */
  interiorLight: THREE.Mesh;
}

export interface PlateProp {
  root: THREE.Group;
  surfaceY: number;
  radius: number;
}

export interface BellProp {
  root: THREE.Group;
  /** The plunger on top; press = move down along local Y ~6mm. */
  plunger: THREE.Object3D;
}

export interface TrashProp {
  root: THREE.Group;
  /** Lid pivot at the back hinge; open = rotation.x = -openAngle. */
  lid: THREE.Object3D;
  openAngle: number;
  /** Local y of the opening and its radius. */
  openingY: number;
  radius: number;
  /** Foot pedal (press = rotation.x). */
  pedal: THREE.Object3D;
}

/** Seasoning bottle for the spice rack (HUD shows the same models as icons). */
export interface BottleProp {
  root: THREE.Group;
  /** Local point where seasoning leaves the bottle (cap / nozzle). Bottles stand upright, nozzle up. */
  nozzle: THREE.Vector3;
  height: number;
}

export interface ChalkboardProp {
  root: THREE.Group;
  /** Redraw the board with a title and an optional second line (chalk style). */
  write(title: string, subtitle?: string): void;
}

export interface KitchenRefs {
  root: THREE.Group;
  board: CuttingBoardProp;
  caddy: ToolCaddyProp;
  tools: Record<'knife' | 'peeler' | 'rollingPin' | 'masher', ToolProp>;
  bowl: MixingBowlProp;
  whisk: WhiskProp;
  stove: StoveProp;
  pan: PanProp;
  grill: PanProp;
  pot: PotProp;
  blender: BlenderProp;
  toaster: ToasterProp;
  fryer: FryerProp;
  microwave: MicrowaveProp;
  fridge: FridgeProp;
  plate: PlateProp;
  bell: BellProp;
  trash: TrashProp;
  chalkboard: ChalkboardProp;
  /** Large static meshes (walls, floor, counters) - gameplay uses them only for raycasting the "counter" surface. */
  counterTop: THREE.Object3D;
  /** Pendant / ceiling lamps etc. (emissive meshes); optional ambience hooks. */
  lamps: THREE.Object3D[];
  /** Things that animate on their own (curtains, plants swaying, clock...). Gameplay calls update(dt, time). */
  ambient: { update(dt: number, time: number): void };
}
