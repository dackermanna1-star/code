package dev.calibercraft.core;

/**
 * Server-side token bucket enforcing a weapon's cyclic rate using wall-clock time. A small bucket absorbs
 * network jitter (packets arriving bunched) while the sustained rate can never exceed the configured RPM.
 */
public final class FireRateLimiter {
	private double tokens;
	private long last = Long.MIN_VALUE;

	/**
	 * @param nowNanos     monotonic time
	 * @param intervalNanos minimum average time between shots
	 * @param capacity     maximum burst of back-to-back shots accepted (>= 1)
	 */
	public boolean tryAcquire(long nowNanos, double intervalNanos, double capacity) {
		capacity = Math.max(1.0, capacity);
		if (last == Long.MIN_VALUE) {
			tokens = capacity;
		} else {
			tokens = Math.min(capacity, tokens + (nowNanos - last) / Math.max(1.0, intervalNanos));
		}
		last = nowNanos;
		if (tokens >= 1.0 - 1e-9) {
			tokens -= 1.0;
			return true;
		}
		return false;
	}

	public void reset() {
		last = Long.MIN_VALUE;
	}
}
