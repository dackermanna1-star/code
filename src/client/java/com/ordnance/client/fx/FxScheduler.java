package com.ordnance.client.fx;

import java.util.ArrayList;
import java.util.List;
import java.util.function.IntConsumer;

/** Client-side delayed and repeating effect steps (shock arrival, mushroom cloud growth, lingering smoke). */
public final class FxScheduler {
	private static final List<Task> TASKS = new ArrayList<>();
	private static long now;

	private FxScheduler() {
	}

	public static void schedule(int delayTicks, Runnable action) {
		if (delayTicks <= 0) {
			action.run();
		} else {
			TASKS.add(new Task(now + delayTicks, 0, 1, i -> action.run()));
		}
	}

	/**
	 * Runs {@code action} every {@code interval} ticks, {@code count} times, starting after {@code delayTicks}.
	 * The action receives the iteration index.
	 */
	public static void repeat(int delayTicks, int interval, int count, IntConsumer action) {
		if (count > 0) {
			TASKS.add(new Task(now + Math.max(0, delayTicks), Math.max(1, interval), count, action));
		}
	}

	public static void tick() {
		now++;
		if (TASKS.isEmpty()) {
			return;
		}

		List<Task> due = new ArrayList<>();
		for (Task task : TASKS) {
			if (task.next <= now) {
				due.add(task);
			}
		}

		for (Task task : due) {
			task.action.accept(task.index++);
			if (task.index >= task.count) {
				TASKS.remove(task);
			} else {
				task.next = now + task.interval;
			}
		}
	}

	public static void clear() {
		TASKS.clear();
	}

	private static final class Task {
		long next;
		final int interval;
		final int count;
		final IntConsumer action;
		int index;

		Task(long next, int interval, int count, IntConsumer action) {
			this.next = next;
			this.interval = interval;
			this.count = count;
			this.action = action;
		}
	}
}
