package dev.overkill.client.fx;

import net.minecraft.util.Mth;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * Client-side camera shake. Shakes stack, fade out quadratically and are applied as small yaw/pitch
 * offsets to the rendered camera only (your actual aim is never touched).
 */
public final class CameraShake {
	private static final float MAX_DEGREES = 9.0F;
	private static final List<Shake> SHAKES = new ArrayList<>();
	private static int clientTicks;

	private static final class Shake {
		final float strength;
		final int duration;
		int age;

		Shake(float strength, int duration) {
			this.strength = strength;
			this.duration = Math.max(1, duration);
		}
	}

	private CameraShake() {
	}

	public static void add(float strength, int ticks) {
		if (strength > 0.0F && ticks > 0) {
			SHAKES.add(new Shake(strength, ticks));
		}
	}

	public static void tick() {
		clientTicks++;
		Iterator<Shake> iterator = SHAKES.iterator();
		while (iterator.hasNext()) {
			Shake shake = iterator.next();
			if (++shake.age >= shake.duration) {
				iterator.remove();
			}
		}
	}

	public static void clear() {
		SHAKES.clear();
	}

	/** Current intensity in degrees (0 when calm). */
	private static float intensity(float partialTick) {
		float total = 0.0F;
		for (Shake shake : SHAKES) {
			float t = Mth.clamp((shake.age + partialTick) / shake.duration, 0.0F, 1.0F);
			float falloff = (1.0F - t) * (1.0F - t);
			total += shake.strength * falloff;
		}
		return Math.min(total, MAX_DEGREES);
	}

	/** @return {yaw, pitch} offsets in degrees, or null if there is no shake. */
	public static float[] offsets(float partialTick) {
		if (SHAKES.isEmpty()) {
			return null;
		}
		float intensity = intensity(partialTick);
		if (intensity < 0.01F) {
			return null;
		}
		float time = (clientTicks + partialTick) * 1.9F;
		float yaw = (Mth.sin(time * 1.3F) + 0.6F * Mth.sin(time * 3.7F + 1.3F)) * 0.62F * intensity;
		float pitch = (Mth.cos(time * 1.7F + 0.4F) + 0.5F * Mth.sin(time * 4.3F + 2.1F)) * 0.62F * intensity;
		return new float[]{yaw, pitch};
	}
}
