package com.laptopcraft.client.os.ui;

import net.minecraft.util.Util;

/**
 * Easing and animation helpers. All CubeOS animations are time based ({@link Util#getMillis()}),
 * never tick based, so they stay smooth at any frame rate.
 *
 * <pre>{@code
 * float t = Ease.progress(openedAt, 180);      // 0..1 over 180 ms
 * int y = (int) Mth.lerp(Ease.outCubic(t), 20, 0);
 * }</pre>
 */
public final class Ease {
	private Ease() {
	}

	/** Current UI clock in milliseconds. */
	public static long now() {
		return Util.getMillis();
	}

	/** Linear 0..1 progress of an animation that started at {@code startMs} and lasts {@code durationMs}. */
	public static float progress(long startMs, long durationMs) {
		if (durationMs <= 0) {
			return 1f;
		}
		return clamp01((now() - startMs) / (float) durationMs);
	}

	/** Clamps to [0, 1]. */
	public static float clamp01(float t) {
		return t < 0f ? 0f : (t > 1f ? 1f : t);
	}

	/** Fast start, gentle stop. */
	public static float outCubic(float t) {
		float f = 1f - clamp01(t);
		return 1f - f * f * f;
	}

	/** Gentle start, fast stop. */
	public static float inCubic(float t) {
		float c = clamp01(t);
		return c * c * c;
	}

	/** Gentle start and stop. */
	public static float inOutCubic(float t) {
		float c = clamp01(t);
		return c < 0.5f ? 4f * c * c * c : 1f - (float) Math.pow(-2f * c + 2f, 3) / 2f;
	}

	/** Quadratic ease-out. */
	public static float outQuad(float t) {
		float c = clamp01(t);
		return 1f - (1f - c) * (1f - c);
	}

	/** Slight overshoot at the end — nice for pop-in effects. */
	public static float outBack(float t) {
		float c = clamp01(t);
		float c1 = 1.70158f;
		float c3 = c1 + 1f;
		return 1f + c3 * (float) Math.pow(c - 1f, 3) + c1 * (float) Math.pow(c - 1f, 2);
	}

	/** Hermite smoothstep. */
	public static float smoothstep(float t) {
		float c = clamp01(t);
		return c * c * (3f - 2f * c);
	}

	/** Linear interpolation from a to b. */
	public static float lerp(float t, float a, float b) {
		return a + (b - a) * t;
	}

	/** Exponential approach of {@code current} towards {@code target}; {@code speed} ~ 0.2..0.5 per frame at 60 fps. */
	public static float approach(float current, float target, float speed) {
		float d = target - current;
		if (Math.abs(d) < 0.01f) {
			return target;
		}
		return current + d * clamp01(speed);
	}

	/** 0..1..0 triangle pulse with the given period (ms), useful for blinking/pulsing. */
	public static float pulse(long periodMs) {
		long t = now() % periodMs;
		float f = t / (float) periodMs;
		return f < 0.5f ? f * 2f : 2f - f * 2f;
	}

	/** True during the "on" half of a blink cycle (e.g. a text caret: {@code blink(1000)}). */
	public static boolean blink(long periodMs) {
		return now() % periodMs < periodMs / 2;
	}
}
