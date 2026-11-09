/**
 * Game state handlers: garage (main menu + upgrades), run, results.
 */
import { LEVELS } from "../data/levels";
import { GarageScreen } from "../ui/Garage";
import { ResultsScreen } from "../ui/Results";
import { audio } from "../audio/Audio";
import { computePayout, type Payout } from "./Economy";
import { Time } from "./Time";
import { Run } from "./Run";
import type { Game } from "./Game";
import type { RunEndReason } from "./Events";
import type { RunStats } from "./types";

export function registerStates(game: Game): void {
  let garage: GarageScreen | null = null;
  let run: Run | null = null;
  let results: ResultsScreen | null = null;
  let last: { reason: RunEndReason; stats: RunStats; payout: Payout; level: number } | null = null;

  game.register("garage", {
    enter() {
      run?.dispose();
      run = null;
      game.resetScene();
      game.input.enabled = false;
      audio.setMode("garage");
      garage = new GarageScreen(game.ctx, (levelIndex) => {
        game.save.data.selectedLevel = levelIndex;
        game.save.write();
        void game.setState("run");
      });
    },
    update(dt) {
      garage?.update(dt);
    },
    exit() {
      garage?.dispose();
      garage = null;
    },
  });

  game.register("run", {
    enter() {
      run?.dispose();
      game.resetScene();
      Time.scale = 1;
      game.input.enabled = true;
      audio.setMode("run");
      const levelIndex = Math.min(game.save.data.selectedLevel, game.save.data.levelsUnlocked);
      run = new Run(game.ctx, levelIndex, (reason, stats) => {
        const save = game.save.data;
        const prevBest = save.bestDistance[levelIndex] ?? 0;
        const payout = computePayout(stats, LEVELS[levelIndex], prevBest);
        save.cash += payout.total;
        save.runs++;
        save.totalKills += stats.kills;
        save.bestDistance[levelIndex] = Math.max(prevBest, stats.distance);
        if (stats.reachedEvac) {
          if (!save.levelsCleared.includes(levelIndex)) save.levelsCleared.push(levelIndex);
          save.levelsUnlocked = Math.min(LEVELS.length - 1, Math.max(save.levelsUnlocked, levelIndex + 1));
        }
        for (const s of stats.survivors) if (!save.survivorsRescued.includes(s)) save.survivorsRescued.push(s);
        game.save.write();
        last = { reason, stats, payout, level: levelIndex };
        void game.setState("results");
      });
      game.debug.run = run;
    },
    update(dt) {
      run?.update(dt);
    },
    exit() {
      // Keep the run alive behind the results screen; disposed on next enter.
    },
  });

  game.register("results", {
    enter() {
      game.input.enabled = false;
      audio.setMode("results");
      if (!last) return;
      results = new ResultsScreen(game.ctx, last, {
        onGarage: () => void game.setState("garage"),
        onRetry: () => void game.setState("run"),
      });
    },
    update(dt) {
      // Let the wreck keep simulating (zombies swarm) behind the overlay.
      run?.update(dt);
      results?.update(dt);
    },
    exit() {
      results?.dispose();
      results = null;
    },
  });
}
