package com.ordnance.client.particle;

import com.ordnance.config.ConfigManager;
import com.ordnance.config.OrdnanceConfig;
import net.minecraft.client.MinecraftClient;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.random.Random;

/**
 * Keeps Ordnance effects inside a particle budget and scales them by distance (LOD), the vanilla Particles option
 * and the user's multiplier. Vanilla's particle queue silently evicts the oldest particles past 16384, which would
 * delete long-lived smoke, so we stay well below that.
 */
public final class ParticleBudget {
	private static final Random RANDOM = Random.create();
	private static int active;

	private ParticleBudget() {
	}

	static boolean tryAcquire() {
		if (active >= ConfigManager.get().visuals.maxActiveParticles) {
			return false;
		}

		active++;
		return true;
	}

	static boolean tryAcquireDefault() {
		return tryAcquire();
	}

	static void release() {
		if (active > 0) {
			active--;
		}
	}

	public static int active() {
		return active;
	}

	/** Called on world change; vanilla clears all particles then. */
	public static void reset() {
		active = 0;
	}

	/** Re-synchronises the counter with the particle manager (particles evicted by vanilla never report death). */
	public static void reconcile(MinecraftClient client) {
		try {
			int total = Integer.parseInt(client.particleManager.getDebugString());
			if (active > total) {
				active = total;
			}
		} catch (NumberFormatException ignored) {
		}
	}

	private static float modeFactor() {
		MinecraftClient client = MinecraftClient.getInstance();
		return switch (client.options.getParticles().getValue()) {
			case ALL -> 1.0F;
			case DECREASED -> 0.5F;
			case MINIMAL -> 0.2F;
		};
	}

	/** Particle count multiplier for an effect seen from {@code distance} blocks. */
	public static float scale(double distance) {
		OrdnanceConfig.Visuals visuals = ConfigManager.get().visuals;
		float lod = distance <= visuals.lodDistance ? 1.0F : (float)MathHelper.clamp(visuals.lodDistance / distance, 0.2, 1.0);
		float usage = active / (float)visuals.maxActiveParticles;
		float pressure = 1.0F - MathHelper.clamp((usage - 0.55F) / 0.45F, 0.0F, 0.9F);
		return visuals.particleMultiplier * modeFactor() * lod * pressure;
	}

	/** Size compensation so fewer, larger particles keep the same visual mass at a distance. */
	public static float sizeCompensation(float scale) {
		return scale >= 1.0F ? 1.0F : MathHelper.clamp(1.0F / MathHelper.sqrt(Math.max(scale, 0.05F)), 1.0F, 2.2F);
	}

	/** {@code base * scale}, rounded stochastically so small effects still spawn something on average. */
	public static int count(float base, float scale) {
		float f = base * scale;
		int n = (int)f;
		if (RANDOM.nextFloat() < f - n) {
			n++;
		}

		return n;
	}
}
