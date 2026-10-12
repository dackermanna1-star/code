package com.chaosunleashed.core;

import org.jetbrains.annotations.Nullable;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Iterator;

/**
 * Spreads block changes across ticks. Every event enqueues its block modifications here instead of touching
 * the world directly; at most {@link ChaosConfig#maxBlockChangesPerTick} operations run per server tick.
 * <p>
 * Operations are either <em>normal</em> (destruction/conversion, dropped when the owning event is stopped) or
 * <em>essential</em> (restoration such as reverting terrain or refreshing redstone, which always run and are
 * flushed immediately when the server shuts down).
 */
public final class BlockChangeQueue {
	@FunctionalInterface
	public interface BlockOp {
		/** Performs the change. Return the number of "block changes" it cost (usually 1). */
		int apply();
	}

	private record Entry(@Nullable Object owner, BlockOp op, boolean essential) {
	}

	private final Deque<Entry> queue = new ArrayDeque<>();
	private final Deque<Entry> essentialQueue = new ArrayDeque<>();

	public void enqueue(@Nullable Object owner, BlockOp op) {
		this.queue.add(new Entry(owner, op, false));
	}

	public void enqueueEssential(@Nullable Object owner, BlockOp op) {
		this.essentialQueue.add(new Entry(owner, op, true));
	}

	public int pending(@Nullable Object owner) {
		int count = 0;
		for (Entry entry : this.queue) {
			if (entry.owner == owner) {
				count++;
			}
		}
		return count;
	}

	public int size() {
		return this.queue.size() + this.essentialQueue.size();
	}

	/** Drops all normal (destructive) operations of the given owner. Essential operations are kept. */
	public void cancel(Object owner) {
		Iterator<Entry> iterator = this.queue.iterator();
		while (iterator.hasNext()) {
			if (iterator.next().owner == owner) {
				iterator.remove();
			}
		}
	}

	/** Runs up to {@code budget} operations; essential (restoration) work goes first. */
	public void tick(int budget) {
		int used = 0;
		while (used < budget && !this.essentialQueue.isEmpty()) {
			used += Math.max(1, run(this.essentialQueue.poll()));
		}
		while (used < budget && !this.queue.isEmpty()) {
			used += Math.max(1, run(this.queue.poll()));
		}
	}

	/** Runs every essential operation right now (server shutdown) and forgets the rest. */
	public void flushEssential() {
		while (!this.essentialQueue.isEmpty()) {
			run(this.essentialQueue.poll());
		}
		this.queue.clear();
	}

	public void clear() {
		this.queue.clear();
		this.essentialQueue.clear();
	}

	private static int run(@Nullable Entry entry) {
		if (entry == null) {
			return 0;
		}
		try {
			return entry.op.apply();
		} catch (RuntimeException e) {
			com.chaosunleashed.ChaosUnleashed.LOGGER.warn("Chaos block change failed", e);
			return 1;
		}
	}
}
