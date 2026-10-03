/**
 * Minecraft-style goal selector: prioritized goals competing for control flags (MOVE, LOOK,
 * JUMP, TARGET). A running goal keeps its flags until it stops or a goal with a lower priority
 * number that needs the same flags can start (if the running goal is interruptable).
 */
export const enum Flag {
  MOVE = 1,
  LOOK = 2,
  JUMP = 4,
  TARGET = 8,
}

export abstract class Goal {
  /** Bitmask of Flag. */
  flags = 0;
  abstract canUse(): boolean;
  canContinueToUse(): boolean {
    return this.canUse();
  }
  isInterruptable(): boolean {
    return true;
  }
  start(): void {}
  stop(): void {}
  tick(): void {}
}

interface Wrapped {
  priority: number;
  goal: Goal;
  running: boolean;
}

export class GoalSelector {
  private goals: Wrapped[] = [];
  private locked = new Map<number, Wrapped>();
  /** Flags currently disabled (e.g. TARGET while a mob is a passenger). */
  disabled = 0;

  add(priority: number, goal: Goal) {
    this.goals.push({ priority, goal, running: false });
    this.goals.sort((a, b) => a.priority - b.priority);
  }

  remove(goal: Goal) {
    for (const w of this.goals) {
      if (w.goal !== goal) continue;
      if (w.running) { w.running = false; goal.stop(); }
    }
    this.goals = this.goals.filter((w) => w.goal !== goal);
    for (const [f, w] of this.locked) if (w.goal === goal) this.locked.delete(f);
  }

  removeWhere(pred: (g: Goal) => boolean) {
    for (const w of [...this.goals]) if (pred(w.goal)) this.remove(w.goal);
  }

  get running(): Goal[] {
    return this.goals.filter((w) => w.running).map((w) => w.goal);
  }

  isRunning(type: abstract new (...a: any[]) => Goal): boolean {
    return this.goals.some((w) => w.running && w.goal instanceof type);
  }

  stopAll() {
    for (const w of this.goals) if (w.running) { w.running = false; w.goal.stop(); }
    this.locked.clear();
  }

  tick() {
    // stop goals that can't continue (or whose flags got disabled)
    for (const w of this.goals) {
      if (!w.running) continue;
      if ((w.goal.flags & this.disabled) !== 0 || !w.goal.canContinueToUse()) {
        w.running = false;
        w.goal.stop();
      }
    }
    for (const [f, w] of this.locked) if (!w.running) this.locked.delete(f);
    // start goals
    for (const w of this.goals) {
      if (w.running || (w.goal.flags & this.disabled) !== 0) continue;
      if (!this.canReplaceAll(w)) continue;
      if (!w.goal.canUse()) continue;
      for (let f = 1; f <= 8; f <<= 1) {
        if (!(w.goal.flags & f)) continue;
        const other = this.locked.get(f);
        if (other && other.running) { other.running = false; other.goal.stop(); }
        this.locked.set(f, w);
      }
      w.running = true;
      w.goal.start();
    }
    for (const w of this.goals) if (w.running) w.goal.tick();
  }

  private canReplaceAll(w: Wrapped): boolean {
    for (let f = 1; f <= 8; f <<= 1) {
      if (!(w.goal.flags & f)) continue;
      const other = this.locked.get(f);
      if (other && other.running && (other === w || !other.goal.isInterruptable() || other.priority <= w.priority)) return false;
    }
    return true;
  }
}
