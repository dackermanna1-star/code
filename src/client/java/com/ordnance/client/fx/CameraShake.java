package com.ordnance.client.fx;

import com.ordnance.config.ConfigManager;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.math.RotationAxis;

/**
 * Trauma-based camera shake: impacts add trauma, the shake amplitude is trauma squared, and it decays quickly.
 * A separate low-frequency rumble lingers after very large blasts. Applied to the projection matrix, so the world
 * and the held item shake together without moving the player's actual aim.
 */
public final class CameraShake {
	private static float trauma;
	private static float rumble;

	private CameraShake() {
	}

	public static void add(float amount) {
		trauma = Math.min(1.4F, trauma + amount);
	}

	public static void addRumble(float amount) {
		rumble = Math.min(1.0F, rumble + amount);
	}

	public static void tick() {
		trauma = Math.max(0.0F, trauma - 0.045F);
		rumble = Math.max(0.0F, rumble - 0.01F);
	}

	public static void reset() {
		trauma = 0.0F;
		rumble = 0.0F;
	}

	public static void apply(MatrixStack matrices) {
		float scale = ConfigManager.get().visuals.screenShake;
		if (scale <= 0.0F) {
			return;
		}

		float t = Math.min(1.0F, trauma);
		float shake = t * t * scale;
		float r = rumble * rumble * scale;
		if (shake + r < 1.0E-4F) {
			return;
		}

		double time = System.nanoTime() / 1.0E9;
		float pitch = (float)(shake * 3.5 * noise(time * 22.0, 0) + r * 0.9 * noise(time * 5.0, 3));
		float yaw = (float)(shake * 3.5 * noise(time * 20.0, 1) + r * 0.9 * noise(time * 4.3, 4));
		float roll = (float)(shake * 5.0 * noise(time * 17.0, 2) + r * 0.6 * noise(time * 3.7, 5));
		matrices.multiply(RotationAxis.POSITIVE_X.rotationDegrees(pitch));
		matrices.multiply(RotationAxis.POSITIVE_Y.rotationDegrees(yaw));
		matrices.multiply(RotationAxis.POSITIVE_Z.rotationDegrees(roll));
	}

	private static double noise(double t, int seed) {
		return Math.sin(t + seed * 1.7) * 0.5 + Math.sin(t * 1.618 + seed * 3.1) * 0.3 + Math.sin(t * 2.718 + seed * 5.3) * 0.2;
	}
}
