// HUD screenshot 3/3: pause menu (settings pane) + checks that pausing freezes time, disables
// input and that settings changes are applied and persisted.
import { Hud } from "../../src/ui/hud.ts";
import { PlayerCore } from "../../src/player/playerCore.ts";
import { makeWorld, buildBackdrop, renderFrames, stubTools } from "./player-util.ts";
import type { IToolSystem } from "../../src/player/contracts.ts";

export async function probe() {
  const w = await makeWorld();
  buildBackdrop(w);
  let qualityApplied: unknown = null;
  let ps2: unknown = null;
  let master: unknown = null;
  (w.ctx.render as unknown as { applyQuality: (q: unknown) => void }).applyQuality = (q) => (qualityApplied = q);
  (w.ctx.render as unknown as { setPS2Mode: (on: boolean) => void }).setPS2Mode = (on) => (ps2 = on);
  (w.ctx.audio as unknown as { setMasterVolume: (v: number) => void }).setMasterVolume = (v) => (master = v);
  const hud = new Hud(w.ctx);
  (w.ctx as { hud: unknown }).hud = hud;
  const p = new PlayerCore(w.ctx, stubTools("crowbar") as unknown as IToolSystem);
  (w.ctx as { player: unknown }).player = p;
  hud.hideLoading();
  hud.forcePlay();
  p.teleport({ x: -1.2, y: 1.65, z: -1.2 }, 0.4, 0.1);
  w.step(5);
  w.events.emit("damage", { assembly: "x", type: "x", valueLost: 2875, fraction: 0.2 });
  await renderFrames(w, 10, () => {
    p.update(1 / 60);
    hud.update(1 / 60);
  });
  const before = { scale: w.ctx.time.scale, inputEnabled: w.input.enabled };
  // Escape while unlocked (fallback / lock loss) latches "pause"
  w.input.tap("pause");
  hud.update(1 / 60);
  const paused = { state: hud.state, menuOpen: hud.menuOpen, scale: w.ctx.time.scale, inputEnabled: w.input.enabled };
  // change settings through the UI
  const seg = Array.from(document.querySelectorAll(".ads-pause .ads-seg button")) as HTMLButtonElement[];
  seg.find((b) => b.textContent === "Ultra")?.click();
  const toggles = Array.from(document.querySelectorAll(".ads-pause .ads-row")) as HTMLElement[];
  const ps2Row = toggles.find((r) => r.querySelector("label")?.textContent === "PS2 mode");
  (ps2Row?.querySelector(".ads-toggle") as HTMLButtonElement | null)?.click();
  const volRow = toggles.find((r) => r.querySelector("label")?.textContent === "Master volume");
  const vol = volRow?.querySelector("input") as HTMLInputElement | null;
  if (vol) {
    vol.value = "0.45";
    vol.dispatchEvent(new Event("input"));
  }
  (ps2Row?.querySelector(".ads-toggle") as HTMLButtonElement | null)?.click(); // back off for the screenshot
  await renderFrames(w, 6, () => hud.update(1 / 60));
  return {
    before,
    paused,
    settings: { quality: w.ctx.settings.data.quality, ps2Mode: w.ctx.settings.data.ps2Mode, masterVolume: w.ctx.settings.data.masterVolume },
    applied: { qualityShadowMap: (qualityApplied as { shadowMapSize?: number } | null)?.shadowMapSize ?? null, ps2, master },
    bill: (document.querySelector(".ads-pause .ads-bill-mini b") as HTMLElement | null)?.textContent,
  };
}
