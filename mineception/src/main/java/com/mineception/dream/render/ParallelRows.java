package com.mineception.dream.render;

import java.util.concurrent.ForkJoinPool;
import java.util.concurrent.ForkJoinTask;
import java.util.concurrent.ForkJoinWorkerThread;
import java.util.concurrent.atomic.AtomicInteger;

/** Splits an image's rows into bands rendered by a small shared pool of daemon threads plus the calling thread. */
final class ParallelRows {
	/** Images smaller than this many pixels are rendered on the calling thread only. */
	private static final int MIN_PARALLEL_PIXELS = 6000;
	private static final ForkJoinPool POOL = createPool();

	/** Renders rows [fromRow, toRow). */
	interface RowTask {
		void render(int fromRow, int toRow);
	}

	private ParallelRows() {
	}

	private static ForkJoinPool createPool() {
		int threads = Math.max(1, Math.min(4, Runtime.getRuntime().availableProcessors() - 1));
		AtomicInteger counter = new AtomicInteger();
		return new ForkJoinPool(threads, pool -> {
			ForkJoinWorkerThread thread = ForkJoinPool.defaultForkJoinWorkerThreadFactory.newThread(pool);
			thread.setName("Mineception Raycaster #" + counter.incrementAndGet());
			thread.setDaemon(true);
			return thread;
		}, null, false);
	}

	static void run(int rows, int pixels, RowTask task) {
		int threads = POOL.getParallelism() + 1;
		if (pixels < MIN_PARALLEL_PIXELS || rows < 8 || ForkJoinTask.inForkJoinPool()) {
			task.render(0, rows);
			return;
		}
		int bands = Math.min(rows, threads * 6);
		AtomicInteger next = new AtomicInteger();
		Runnable worker = () -> {
			int band;
			while ((band = next.getAndIncrement()) < bands) {
				task.render(rows * band / bands, rows * (band + 1) / bands);
			}
		};
		ForkJoinTask<?>[] helpers = new ForkJoinTask<?>[threads - 1];
		for (int i = 0; i < helpers.length; i++) {
			helpers[i] = POOL.submit(worker);
		}
		worker.run();
		for (ForkJoinTask<?> helper : helpers) {
			helper.join();
		}
	}
}
