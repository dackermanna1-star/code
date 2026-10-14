package net.abyssaldescent.client.fx;

import net.abyssaldescent.config.AdConfig;
import net.minecraft.util.Mth;

/**
 * Decaying camera shake driven by server impact packets. Offsets are smooth noise (summed sines at unrelated
 * frequencies) rather than random jitter, so heavy hits read as a rumble instead of a stutter.
 */
public final class CameraShake {
	private static float intensity;
	private static int duration;
	private static int remaining;
	private static int clock;

	private CameraShake() {
	}

	public static void add(float strength, int ticks) {
		AdConfig.Client options = AdConfig.get().client;
		if (!options.cameraShake || options.cameraShakeScale <= 0) {
			return;
		}
		float scaled = (float) (strength * options.cameraShakeScale);
		// Stacking takes the stronger shake and the longer tail instead of summing, so a combo can't spin the view.
		if (scaled >= currentStrength()) {
			intensity = Math.min(scaled, 2.5F);
			duration = Math.max(1, ticks);
			remaining = duration;
		} else {
			remaining = Math.max(remaining, Math.min(ticks, duration));
		}
	}

	public static void tick() {
		clock++;
		if (remaining > 0) {
			remaining--;
		}
	}

	private static float currentStrength() {
		if (remaining <= 0 || duration <= 0) {
			return 0.0F;
		}
		float t = remaining / (float) duration;
		return intensity * t * t;
	}

	/** Yaw/pitch offsets in degrees for this frame. */
	public static float yawOffset(float partialTick) {
		float strength = strengthAt(partialTick);
		if (strength <= 0) {
			return 0.0F;
		}
		float t = clock + partialTick;
		return strength * (Mth.sin(t * 1.9F) * 0.6F + Mth.sin(t * 3.7F + 1.3F) * 0.4F);
	}

	public static float pitchOffset(float partialTick) {
		float strength = strengthAt(partialTick);
		if (strength <= 0) {
			return 0.0F;
		}
		float t = clock + partialTick;
		return strength * (Mth.sin(t * 2.3F + 0.7F) * 0.55F + Mth.sin(t * 4.1F + 2.1F) * 0.45F);
	}

	private static float strengthAt(float partialTick) {
		if (remaining <= 0 || duration <= 0) {
			return 0.0F;
		}
		float t = Math.max(0.0F, (remaining - partialTick) / duration);
		return intensity * t * t;
	}
}
