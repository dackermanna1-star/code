package com.jjkshowdown.util;

import java.util.ArrayList;
import java.util.List;

/** Tiny server-thread task scheduler (delays in ticks). Tasks must validate their own captured state. */
public final class Scheduler {
	private static final List<Task> TASKS = new ArrayList<>();
	private static final List<Task> PENDING = new ArrayList<>();

	private static final class Task {
		int delay;
		final Runnable run;

		Task(int delay, Runnable run) {
			this.delay = delay;
			this.run = run;
		}
	}

	private Scheduler() {
	}

	public static void schedule(int delayTicks, Runnable run) {
		synchronized (PENDING) {
			PENDING.add(new Task(Math.max(0, delayTicks), run));
		}
	}

	public static void tick() {
		synchronized (PENDING) {
			TASKS.addAll(PENDING);
			PENDING.clear();
		}
		List<Task> due = new ArrayList<>();
		TASKS.removeIf(t -> {
			if (--t.delay <= 0) {
				due.add(t);
				return true;
			}
			return false;
		});
		for (Task t : due) {
			try {
				t.run.run();
			} catch (Exception e) {
				com.jjkshowdown.JjkShowdown.LOGGER.error("Scheduled task failed", e);
			}
		}
	}

	public static void clear() {
		synchronized (PENDING) {
			PENDING.clear();
		}
		TASKS.clear();
	}
}
