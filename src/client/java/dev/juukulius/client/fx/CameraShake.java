package dev.juukulius.client.fx;

import dev.juukulius.client.config.JuliusClientConfig;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;

/**
 * Restrained camera shake for major impacts only. Smooth noise (not white jitter), capped at roughly one degree, decays in
 * a fraction of a second and can be disabled or scaled in the client settings.
 */
public final class CameraShake {
	private static final float MAX_TRAUMA = 1.0F;
	private static float trauma;
	private static float time;

	private CameraShake() {
	}

	/** Adds shake from an impact at {@code source}; falls off with distance and is ignored beyond {@code range}. */
	public static void impulse(float strength, Vec3 source, Vec3 viewer, double range) {
		double distance = source.distanceTo(viewer);
		if (distance > range) {
			return;
		}

		float falloff = (float) (1.0 - distance / range);
		add(strength * falloff * falloff);
	}

	public static void add(float amount) {
		JuliusClientConfig config = JuliusClientConfig.get();
		if (!config.cameraShake) {
			return;
		}

		trauma = Math.min(MAX_TRAUMA, trauma + amount * (float) config.cameraShakeIntensity);
	}

	public static void tick() {
		trauma = Math.max(0.0F, trauma - 0.09F);
	}

	/** Yaw/pitch offsets in degrees for this frame. */
	public static float[] offsets(float frameTime) {
		time += frameTime;
		if (trauma <= 0.0F) {
			return null;
		}

		float shake = trauma * trauma;
		float yaw = 1.1F * shake * noise(time * 28.0F, 1.7F);
		float pitch = 0.9F * shake * noise(time * 31.0F, 7.3F);
		return new float[] {yaw, pitch};
	}

	private static float noise(float t, float seed) {
		return (Mth.sin(t + seed) * 0.6F + Mth.sin(t * 1.93F + seed * 2.1F) * 0.3F + Mth.sin(t * 3.71F + seed * 0.7F) * 0.1F);
	}

	public static void reset() {
		trauma = 0.0F;
	}
}
