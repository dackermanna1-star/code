package dev.overkill.util;

import dev.overkill.OverkillArsenal;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.Level;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * Tiny per-dimension scheduler for multi-tick effects (chain detonations, crater carving, shockwaves).
 * Processes added while ticking are picked up on the next tick, so processes may spawn processes.
 */
public final class ServerProcesses {
	@FunctionalInterface
	public interface Process {
		/** @return true once the process is finished and should be dropped. */
		boolean tick(ServerLevel level);
	}

	private static final Map<ResourceKey<Level>, List<Process>> ACTIVE = new HashMap<>();
	private static final Map<ResourceKey<Level>, List<Process>> PENDING = new HashMap<>();

	private ServerProcesses() {
	}

	public static void init() {
		ServerTickEvents.END_WORLD_TICK.register(ServerProcesses::tick);
		ServerLifecycleEvents.SERVER_STOPPED.register(server -> {
			ACTIVE.clear();
			PENDING.clear();
		});
	}

	public static void add(ServerLevel level, Process process) {
		PENDING.computeIfAbsent(level.dimension(), key -> new ArrayList<>()).add(process);
	}

	/** Runs {@code action} after {@code delay} ticks. */
	public static void later(ServerLevel level, int delay, Runnable action) {
		add(level, new Process() {
			private int remaining = delay;

			@Override
			public boolean tick(ServerLevel l) {
				if (--this.remaining <= 0) {
					action.run();
					return true;
				}
				return false;
			}
		});
	}

	private static void tick(ServerLevel level) {
		List<Process> pending = PENDING.remove(level.dimension());
		List<Process> active = ACTIVE.get(level.dimension());
		if (active == null) {
			if (pending == null) {
				return;
			}
			active = new ArrayList<>();
			ACTIVE.put(level.dimension(), active);
		}
		if (pending != null) {
			active.addAll(pending);
		}

		Iterator<Process> iterator = active.iterator();
		while (iterator.hasNext()) {
			Process process = iterator.next();
			boolean done;
			try {
				done = process.tick(level);
			} catch (RuntimeException e) {
				OverkillArsenal.LOGGER.error("Overkill effect process crashed and was stopped", e);
				done = true;
			}
			if (done) {
				iterator.remove();
			}
		}
	}
}
