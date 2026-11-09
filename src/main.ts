import {
  Color3,
  DirectionalLight,
  FreeCamera,
  HemisphericLight,
  MeshBuilder,
  PhysicsAggregate,
  PhysicsShapeType,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import { Game } from "./core/Game";

async function boot(): Promise<void> {
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const uiRoot = document.getElementById("ui-root") as HTMLElement;
  const status = document.getElementById("boot-status");
  const game = new Game(canvas, uiRoot);
  (window as any).game = game;
  try {
    await game.init();
  } catch (err) {
    if (status) status.textContent = `Failed to start: ${(err as Error).message}`;
    throw err;
  }

  // Phase 0 smoke-test scene: proves rendering + Havok are alive.
  const scene = game.scene;
  const cam = new FreeCamera("cam", new Vector3(0, 8, -18), scene);
  cam.setTarget(Vector3.Zero());
  new HemisphericLight("hemi", new Vector3(0, 1, 0), scene).intensity = 0.6;
  new DirectionalLight("sun", new Vector3(-0.5, -1, 0.4), scene).intensity = 0.9;
  const ground = MeshBuilder.CreateGround("ground", { width: 40, height: 40 }, scene);
  const gm = new StandardMaterial("gm", scene);
  gm.diffuseColor = Color3.FromHexString("#e0a15c");
  ground.material = gm;
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);
  for (let i = 0; i < 12; i++) {
    const b = MeshBuilder.CreateBox(`b${i}`, { size: 1 }, scene);
    b.position.set((i % 4) - 1.5, 3 + i * 1.2, Math.floor(i / 4) - 1);
    const m = new StandardMaterial(`m${i}`, scene);
    m.diffuseColor = Color3.FromHSV(i * 30, 0.7, 0.9);
    b.material = m;
    new PhysicsAggregate(b, PhysicsShapeType.BOX, { mass: 1, restitution: 0.3 }, scene);
  }

  document.getElementById("boot")?.remove();
}

void boot();
