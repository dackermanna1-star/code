/**
 * Turns a finished run into cash. Every run pays something; beating your
 * best distance pays a bonus so even failed runs feel like progress.
 */
import type { LevelDef } from "../data/levels";
import type { RunStats } from "./types";

export interface PayoutLine {
  label: string;
  amount: number;
}

export interface Payout {
  lines: PayoutLine[];
  total: number;
  newRecord: boolean;
}

export function computePayout(stats: RunStats, level: LevelDef, previousBest: number): Payout {
  const lines: PayoutLine[] = [];
  const perMeter = 1.1 + level.id * 0.45;
  lines.push({ label: `Distance ${Math.floor(stats.distance)} m`, amount: Math.round(stats.distance * perMeter) });
  if (stats.kills > 0) lines.push({ label: `Zombies smashed ×${stats.kills}`, amount: Math.round(stats.killCash) });
  if (stats.stuntCash > 0) lines.push({ label: `Stunts ×${stats.stunts.length}`, amount: Math.round(stats.stuntCash) });
  const newRecord = previousBest > 0 && stats.distance > previousBest + 1;
  if (newRecord) {
    const gain = stats.distance - previousBest;
    lines.push({ label: `New record! +${Math.floor(gain)} m`, amount: Math.round(gain * perMeter * 1.5) });
  }
  if (stats.survivors.length > 0) {
    lines.push({ label: `Survivors rescued ×${stats.survivors.length}`, amount: stats.survivors.length * 400 });
  }
  if (stats.reachedEvac) lines.push({ label: "Reached the evac zone!", amount: level.reward });
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { lines, total, newRecord };
}

export function emptyRunStats(): RunStats {
  return {
    distance: 0,
    kills: 0,
    killCash: 0,
    stuntCash: 0,
    stunts: [],
    survivors: [],
    airTime: 0,
    topSpeed: 0,
    flips: 0,
    reachedEvac: false,
  };
}
