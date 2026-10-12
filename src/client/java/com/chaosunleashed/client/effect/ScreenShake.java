package com.chaosunleashed.client.effect;

import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.RotationAxis;

/** Camera shake from Kaiju footsteps, stampedes, explosions... Applied in {@code GameRendererMixin}. */
public final class ScreenShake {
	private static float strength;
	private static int ticksLeft;
	private static int totalTicks;
	private static long age;

	private ScreenShake() {
	}

	public static void add(float newStrength, int ticks) {
		float current = current(0.0F);
		if (newStrength >= current) {
			strength = Math.min(newStrength, 6.0F);
			ticksLeft = Math.max(ticks, 1);
			totalTicks = ticksLeft;
		} else {
			ticksLeft = Math.max(ticksLeft, ticks / 2);
		}
	}

	public static void tick() {
		age++;
		if (ticksLeft > 0) {
			ticksLeft--;
		}
	}

	private static float current(float tickDelta) {
		if (ticksLeft <= 0 || totalTicks <= 0) {
			return 0.0F;
		}
		float fade = MathHelper.clamp((ticksLeft - tickDelta) / totalTicks, 0.0F, 1.0F);
		return strength * fade * fade;
	}

	public static void apply(MatrixStack matrices, float tickDelta) {
		float s = current(tickDelta);
		if (s <= 0.001F) {
			return;
		}
		float t = (age + tickDelta) * 1.7F;
		float pitch = (MathHelper.sin(t * 2.3F) + MathHelper.sin(t * 5.1F) * 0.5F) * s * 0.6F;
		float yaw = (MathHelper.sin(t * 1.9F + 1.3F) + MathHelper.sin(t * 4.3F) * 0.5F) * s * 0.6F;
		float roll = MathHelper.sin(t * 3.7F + 2.1F) * s * 0.8F;
		matrices.multiply(RotationAxis.POSITIVE_X.rotationDegrees(pitch));
		matrices.multiply(RotationAxis.POSITIVE_Y.rotationDegrees(yaw));
		matrices.multiply(RotationAxis.POSITIVE_Z.rotationDegrees(roll));
	}
}
