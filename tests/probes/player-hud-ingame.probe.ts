// HUD screenshot 2/3: in-game HUD — crosshair (grab state) on a target with info, repair bill
// with popups, stats, hotbar (sledgehammer selected), charge meter, a toast and the F3 overlay.
import { Hud } from "../../src/ui/hud.ts";
import { PlayerCore } from "../../src/player/playerCore.ts";
import { makeWorld, buildBackdrop, renderFrames, stubTools } from "./player-util.ts";
import type { IToolSystem } from "../../src/player/contracts.ts";

export async function probe() {
  const w = await makeWorld();
  buildBackdrop(w);
  const hud = new Hud(w.ctx);
  (w.ctx as { hud: unknown }).hud = hud;
  const tools = stubTools("sledgehammer", 0.62);
  const p = new PlayerCore(w.ctx, tools as unknown as IToolSystem);
  (w.ctx as { player: unknown }).player = p;
  w.ctx.settings.data.showHints = false;
  hud.hideLoading();
  hud.forcePlay();
  // look at the microwave on the floor
  p.teleport({ x: 0.2, y: 1.65, z: 0.1 }, 0.0, Math.atan2(1.65 - 0.15, 1.5));
  w.step(10);
  for (const v of [120, 85.5, 412, 1310.25]) w.events.emit("damage", { assembly: "x", type: "x", valueLost: v, fraction: 0.1 });
  hud.toast("Hold LMB to charge a swing", 30);
  const states: string[] = [];
  await renderFrames(w, 50, () => {
    w.step(1);
    p.update(1 / 60);
    hud.update(1 / 60);
    states.push(String((document.querySelector(".ads-crosshair") as HTMLElement | null)?.dataset.state));
  });
  // switch tool (name pop-up), toast, debug overlay on (F3 goes through Input while playing)
  tools.select("bat");
  hud.update(1 / 60);
  tools.select("sledgehammer");
  hud.toast("Hold LMB to charge a swing", 300);
  w.input.tap("debug");
  hud.update(1 / 60);
  await renderFrames(w, 4, () => {
    p.update(1 / 60);
    hud.update(0.1);
  });
  const q = (s: string) => document.querySelector(s) as HTMLElement | null;
  return {
    state: hud.state,
    crosshair: states[states.length - 1],
    target: q(".ads-target-name")?.textContent,
    targetSub: q(".ads-target-sub")?.textContent,
    bill: q(".ads-bill")?.textContent,
    selectedSlot: (q(".ads-slot.ads-sel") as HTMLElement | null)?.dataset.tool,
    chargeVisible: q(".ads-charge")?.classList.contains("ads-on"),
    debugVisible: q(".ads-debug")?.classList.contains("ads-on"),
    debugText: q(".ads-debug")?.textContent?.split("\n").slice(0, 3),
  };
}
