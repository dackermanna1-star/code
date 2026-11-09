import { Game } from "./core/Game";
import { registerStates } from "./core/States";

/**
 * Sandboxes: `?sandbox=<name>` boots straight into `src/<dir>/sandbox.ts`
 * (or `src/sandboxes/<name>.ts`) instead of the normal game flow. Each module
 * owns its sandbox so it can be developed and screenshotted in isolation.
 * `?run=<level>` skips the garage and starts a run immediately.
 */
const sandboxes = import.meta.glob("./**/sandbox*.ts");

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

  const params = new URLSearchParams(location.search);
  const sb = params.get("sandbox");
  registerStates(game);
  if (params.has("reset")) game.save.reset();

  if (sb) {
    const key = Object.keys(sandboxes).find((k) => k.endsWith(`/${sb}/sandbox.ts`) || k.endsWith(`/sandbox-${sb}.ts`));
    if (!key) throw new Error(`No sandbox "${sb}". Available: ${Object.keys(sandboxes).join(", ")}`);
    const mod = (await sandboxes[key]()) as { sandbox: (g: Game) => void | Promise<void> };
    await mod.sandbox(game);
  } else if (params.has("run")) {
    const lvl = parseInt(params.get("run") || "0", 10) || 0;
    game.save.data.selectedLevel = lvl;
    game.save.data.levelsUnlocked = Math.max(game.save.data.levelsUnlocked, lvl);
    if (params.has("cash")) game.save.data.cash = parseInt(params.get("cash")!, 10);
    if (params.has("car")) {
      const car = params.get("car") as never;
      game.save.data.currentCar = car;
      if (!game.save.data.ownedCars.includes(car)) game.save.data.ownedCars.push(car);
    }
    if (params.has("tier")) {
      // Debug: set every upgrade slot of the current car to this tier.
      const t = Math.max(0, Math.min(4, parseInt(params.get("tier")!, 10) || 0));
      const l = game.save.loadout();
      for (const k of Object.keys(l) as (keyof typeof l)[]) l[k] = t;
    }
    await game.setState("run");
  } else {
    await game.setState("garage");
  }
  document.getElementById("boot")?.remove();
  (window as any).__ready = true;
}

void boot();
