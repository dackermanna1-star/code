// HUD screenshot 1/3: start screen (title, PLAY, controls, options, credits line) over the scene.
import { Hud } from "../../src/ui/hud.ts";
import { PlayerCore } from "../../src/player/playerCore.ts";
import { makeWorld, buildBackdrop, renderFrames, stubTools } from "./player-util.ts";
import type { IToolSystem } from "../../src/player/contracts.ts";

export async function probe() {
  const w = await makeWorld();
  buildBackdrop(w);
  const hud = new Hud(w.ctx);
  (w.ctx as { hud: unknown }).hud = hud;
  hud.setLoading(0.3, "Generating textures…");
  const loadingState = { state: hud.state, menuOpen: hud.menuOpen };
  const p = new PlayerCore(w.ctx, stubTools("hands") as unknown as IToolSystem);
  (w.ctx as { player: unknown }).player = p;
  p.teleport({ x: -0.6, y: 1.65, z: -1.6 }, 0.35, 0.12);
  w.step(5);
  hud.setLoading(1, "Ready");
  hud.hideLoading();
  await renderFrames(w, 6, () => {
    p.update(1 / 60);
    hud.update(1 / 60);
  });
  const play = document.querySelector(".ads-play") as HTMLButtonElement | null;
  return { loadingState, afterLoad: { state: hud.state, menuOpen: hud.menuOpen, playEnabled: play ? !play.disabled : null, playText: play?.textContent } };
}
