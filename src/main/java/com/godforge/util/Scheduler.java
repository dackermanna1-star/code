package com.godforge.util;

import com.godforge.Godforge;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;

/** Runs callbacks a number of server ticks in the future (used to sequence multi-stage attacks). */
public final class Scheduler {
	private record Task(long runAt, ServerLevel level, Runnable action) {
	}

	private static final List<Task> TASKS = new ArrayList<>();
	private static final List<Task> ADDED = new ArrayList<>();
	private static long tick;

	private Scheduler() {
	}

	public static void init() {
		ServerTickEvents.END_SERVER_TICK.register(Scheduler::tick);
		ServerLifecycleEvents.SERVER_STOPPED.register(server -> {
			TASKS.clear();
			ADDED.clear();
		});
	}

	/** Schedules {@code action} to run after {@code delay} ticks (0 = end of this tick). */
	public static void later(ServerLevel level, int delay, Runnable action) {
		ADDED.add(new Task(tick + Math.max(0, delay), level, action));
	}

	private static void tick(MinecraftServer server) {
		tick++;
		if (!ADDED.isEmpty()) {
			TASKS.addAll(ADDED);
			ADDED.clear();
		}
		if (TASKS.isEmpty()) {
			return;
		}
		List<Task> due = new ArrayList<>();
		TASKS.removeIf(task -> {
			if (task.runAt <= tick) {
				due.add(task);
				return true;
			}
			return false;
		});
		for (Task task : due) {
			if (server.getLevel(task.level.dimension()) != task.level) {
				continue; // level was unloaded
			}
			try {
				task.action.run();
			} catch (RuntimeException e) {
				Godforge.LOGGER.error("Scheduled Godforge task failed", e);
			}
		}
	}
}
