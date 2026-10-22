package dev.juukulius.character;

import it.unimi.dsi.fastutil.ints.IntOpenHashSet;
import it.unimi.dsi.fastutil.ints.IntSet;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.world.phys.Vec3;

/**
 * Transient server-side combat state for one player (never saved). Holds action locks, combo timing, scheduled
 * impact frames and dash bookkeeping.
 */
public final class ActionState {
	/** Ticks until another action may start. */
	public int lockTicks;
	/** Whether the current lock comes from a combo swing (combo swings may chain inside it). */
	public boolean lockFromCombo;
	/** Last combo step performed (0 = none). */
	public int comboStep;
	public long lastSwingTime = -1000L;
	public int regenDelay;
	public int transformCooldown;
	public int spiritToggleCooldown;
	public int selectCooldown;
	/** Spirit chosen while selection was rate limited; applied when the limit ends so quick taps are never lost. */
	public int pendingSelect = -1;
	public float cooldownAccumulator;
	public int invulnerableTicks;
	public long barrierEnd;
	public int chargeCue;
	public int statsSyncCooldown;
	public boolean statsDirty = true;
	public int appearanceVersion;
	public long changeTime = -1000L;
	public long spiritsTime = -1000L;

	public int dashTicks;
	public Vec3 dashDirection = Vec3.ZERO;
	public final IntSet dashHits = new IntOpenHashSet();

	public final List<ScheduledTask> tasks = new ArrayList<>();

	public void schedule(int delay, Runnable action) {
		this.tasks.add(new ScheduledTask(Math.max(1, delay), action));
	}

	public void cancelAll() {
		this.tasks.clear();
		this.dashTicks = 0;
		this.dashHits.clear();
		this.lockTicks = 0;
		this.lockFromCombo = false;
		this.comboStep = 0;
		this.chargeCue = 0;
	}

	public static final class ScheduledTask {
		int remaining;
		final Runnable action;

		ScheduledTask(int remaining, Runnable action) {
			this.remaining = remaining;
			this.action = action;
		}
	}
}
