package com.godforge.destruction;

import net.minecraft.server.level.ServerLevel;

/**
 * A unit of terrain work executed incrementally by the {@link DestructionManager}.
 * Implementations keep their own cursor so they can be paused at any point and resumed next tick.
 */
public abstract class BlockJob {
	protected final ServerLevel level;
	private int delay;
	private boolean finished;

	protected BlockJob(ServerLevel level) {
		this.level = level;
	}

	public ServerLevel level() {
		return this.level;
	}

	/** Starts the job after the given number of ticks (lets effects line up with impacts). */
	public BlockJob delayed(int ticks) {
		this.delay = Math.max(0, ticks);
		return this;
	}

	boolean tickDelay() {
		if (this.delay > 0) {
			this.delay--;
			return false;
		}
		return true;
	}

	/** False while asynchronous preparation (shape generation) is still running. */
	protected boolean isReady() {
		return true;
	}

	/**
	 * Performs at most {@code budget} block operations.
	 *
	 * @return the number of operations actually consumed
	 */
	protected abstract int run(int budget, long deadlineNanos);

	protected final void finish() {
		this.finished = true;
	}

	public final boolean isFinished() {
		return this.finished;
	}

	/** Called when the server stops or an admin clears all jobs. Temporary changes must be undone here. */
	public void cancel() {
		this.finished = true;
	}

	/** True for jobs that hold temporary blocks and must be flushed (not abandoned) on shutdown. */
	public boolean holdsTemporaryBlocks() {
		return false;
	}
}
