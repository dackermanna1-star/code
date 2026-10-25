package com.godforge.destruction;

import com.godforge.Godforge;
import com.godforge.config.GodforgeConfig;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.server.MinecraftServer;

/**
 * Runs every {@link BlockJob} on the server thread under a strict per-tick budget of block changes and
 * milliseconds, so even planet-scale attacks are spread across ticks instead of freezing the server.
 * Shape generation for big jobs happens asynchronously (see {@link Shapes}); only world mutation runs here.
 */
public final class DestructionManager {
	private static final List<BlockJob> JOBS = new ArrayList<>();
	private static final List<BlockJob> INCOMING = new ArrayList<>();
	private static long lastWarn;
	private static int opsLastTick;

	private DestructionManager() {
	}

	public static void init() {
		ServerTickEvents.END_SERVER_TICK.register(DestructionManager::tick);
		ServerLifecycleEvents.SERVER_STOPPING.register(server -> cancelAll());
	}

	/**
	 * Queues a job. Returns false (and drops the job) when the server is already at its configured
	 * concurrency limit.
	 */
	public static boolean submit(BlockJob job) {
		int limit = GodforgeConfig.get().performance.maxActiveJobs;
		if (JOBS.size() + INCOMING.size() >= limit) {
			long now = System.currentTimeMillis();
			if (now - lastWarn > 5000) {
				lastWarn = now;
				Godforge.LOGGER.warn("Destruction job limit ({}) reached; dropping new terrain effects", limit);
			}
			return false;
		}
		INCOMING.add(job);
		return true;
	}

	public static int activeJobs() {
		return JOBS.size() + INCOMING.size();
	}

	public static int opsLastTick() {
		return opsLastTick;
	}

	/** Active jobs grouped by kind, e.g. {@code {CraterJob=2, PathJob=1}}. */
	public static Map<String, Integer> describe() {
		Map<String, Integer> kinds = new TreeMap<>();
		for (BlockJob job : JOBS) {
			kinds.merge(job.getClass().getSimpleName(), 1, Integer::sum);
		}
		for (BlockJob job : INCOMING) {
			kinds.merge(job.getClass().getSimpleName(), 1, Integer::sum);
		}
		return kinds;
	}

	/** Stops everything immediately; temporary blocks are restored. */
	public static int cancelAll() {
		JOBS.addAll(INCOMING);
		INCOMING.clear();
		int count = JOBS.size();
		for (BlockJob job : JOBS) {
			try {
				job.cancel();
			} catch (RuntimeException e) {
				Godforge.LOGGER.error("Failed to cancel destruction job {}", job, e);
			}
		}
		JOBS.clear();
		return count;
	}

	private static void tick(MinecraftServer server) {
		if (!INCOMING.isEmpty()) {
			JOBS.addAll(INCOMING);
			INCOMING.clear();
		}
		if (JOBS.isEmpty()) {
			opsLastTick = 0;
			return;
		}
		GodforgeConfig.Performance perf = GodforgeConfig.get().performance;
		long deadline = System.nanoTime() + perf.maxMillisPerTick * 1_000_000L;
		int budget = perf.maxBlockChangesPerTick;
		int used = 0;

		List<BlockJob> runnable = new ArrayList<>(JOBS.size());
		for (BlockJob job : JOBS) {
			if (!job.isFinished() && job.tickDelay() && job.isReady()) {
				runnable.add(job);
			}
		}

		// Fair scheduling: every runnable job gets an equal share; leftover budget is handed out in further passes.
		int passes = 0;
		while (!runnable.isEmpty() && used < budget && System.nanoTime() < deadline && passes++ < 4) {
			int share = Math.max(64, (budget - used) / runnable.size());
			for (int i = 0; i < runnable.size() && used < budget; i++) {
				BlockJob job = runnable.get(i);
				try {
					used += job.run(Math.min(share, budget - used), deadline);
				} catch (RuntimeException e) {
					Godforge.LOGGER.error("Destruction job {} crashed and was stopped", job, e);
					job.cancel();
				}
				if (System.nanoTime() >= deadline) {
					break;
				}
			}
			runnable.removeIf(BlockJob::isFinished);
		}
		opsLastTick = used;
		JOBS.removeIf(BlockJob::isFinished);
	}
}
